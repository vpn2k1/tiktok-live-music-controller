import { checkBankLines } from '../bankFile';
import type { EffectInput } from '../engine';
import {
  current,
  nextQuestion,
  pickSet,
  podiumEffect,
  rankingRows,
  resultHint,
  scoreQuestion,
  startSeries,
  type SeriesState
} from '../series';
import { chatTest, percentOf, shuffle, view, type GameDefinition, type GameInput } from '../types';
import { termWithReading, VOCAB_PRESETS, parseVocab, type VocabWord } from '../vocab';
import { parseQuestions, QUIZ_PRESETS, QUIZ_SAMPLE, type QuizQuestion } from './quiz';
import { numberLocale, t } from '../../shared/i18n';

/**
 * Ai là triệu phú: the whole room is the contestant. Each question, viewers
 * vote A–D; the most-voted answer is the room's answer (a tie goes to the
 * option voted first). Right = climb the 15-step ladder; wrong or no votes =
 * the room leaves with the last safe step. Every viewer who voted right scores
 * by speed. Lifelines (once each): 50:50 and "ask the audience" (live vote
 * shares) — by gift or host command — and "switch the question" (host).
 */
export const LADDER = [100, 200, 300, 500, 1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 125_000, 250_000, 500_000, 1_000_000];
/** Steps (1-based) the room keeps after a wrong answer. */
const SAFE_STEPS = [5, 10];
const LETTERS = ['A', 'B', 'C', 'D'];

type Lifeline = 'fifty' | 'audience' | 'swap';

export type MillionaireRound = SeriesState<QuizQuestion> & {
  /** Options removed by 50:50 on the current question. */
  removed: number[];
  used: Lifeline[];
  /** Live vote shares on screen for the current question. */
  audience: boolean;
  /** Spare question for "switch the question". */
  spare: QuizQuestion | null;
  /** First vote time per option (ms after the question), for ties; mutable, written in commit. */
  firstVote: (number | null)[];
  /** Room's answer of the question being revealed (-1 = nobody voted). */
  roomChoice: number | null;
  /** Steps climbed (questions the room got right). */
  climbed: number;
  result: 'playing' | 'wrong' | 'stopped' | 'won';
};

type MillionaireConfig = { preset: string; questions: string; seconds: number; maxPoints: number; reveal: number; giftLifeline: string };

const SOURCE_PRESETS: Record<string, { label: string; quiz?: string; vocab?: string }> = {
  ...Object.fromEntries(Object.entries(QUIZ_PRESETS).map(([key, preset]) => [`quiz-${key}`, { label: preset.label, quiz: key }])),
  ...Object.fromEntries(Object.entries(VOCAB_PRESETS).map(([key, preset]) => [`vocab-${key}`, { label: `${preset.label} — đoán nghĩa`, vocab: key }]))
};

/** "“cat” nghĩa là gì?" with the meaning and three other meanings of the set. */
export function vocabQuestion(word: VocabWord, words: VocabWord[], random: () => number): QuizQuestion | null {
  const others = shuffle(words.filter((other) => other.meaning !== word.meaning), random);
  const wrong: string[] = [];
  for (const other of others) {
    if (!wrong.includes(other.meaning)) wrong.push(other.meaning);
    if (wrong.length === 3) break;
  }
  if (wrong.length < 3) return null;
  const answers = shuffle([word.meaning, ...wrong], random);
  return { question: t('“{word}” nghĩa là gì?', { word: termWithReading(word) }), answers, correct: answers.indexOf(word.meaning) };
}

/** 16 questions (15 + a spare) from the streamer's bank, a quiz bank or a vocabulary set. */
function pickQuestions(config: MillionaireConfig, previous: number[], random: () => number): { items: QuizQuestion[]; asked: number[] } {
  const wanted = LADDER.length + 1;
  const own = parseQuestions(config.questions);
  const source = SOURCE_PRESETS[config.preset] ?? SOURCE_PRESETS['quiz-vi'];
  if (!own.length && source?.vocab) {
    const preset = VOCAB_PRESETS[source.vocab];
    const words = preset ? parseVocab(preset.bank, preset.lang) : [];
    const { indices, asked } = pickSet(words.length, wanted, previous, random);
    const items = indices.flatMap((index) => {
      const question = vocabQuestion(words[index] as VocabWord, words, random);
      return question ? [question] : [];
    });
    return { items, asked };
  }
  const bank = own.length ? own : parseQuestions(QUIZ_PRESETS[source?.quiz ?? 'vi']?.bank ?? '');
  const { indices, asked } = pickSet(bank.length, wanted, previous, random);
  return { items: indices.map((index) => bank[index] as QuizQuestion), asked };
}

function formatStars(value: number): string {
  return `⭐ ${value.toLocaleString(numberLocale())}`;
}

/** What the room leaves with after `climbed` right answers and how it ended. */
export function roomPrize(climbed: number, result: MillionaireRound['result']): number {
  if (result === 'wrong') {
    const safe = [...SAFE_STEPS].reverse().find((step) => climbed >= step);
    return safe ? (LADDER[safe - 1] as number) : 0;
  }
  return climbed > 0 ? (LADDER[climbed - 1] as number) : 0;
}

/** The room's answer: most votes; a tie goes to the option voted first; -1 = no votes. */
export function roomChoiceOf(counts: number[], firstVote: (number | null)[]): number {
  let best = -1;
  counts.forEach((count, index) => {
    if (count <= 0) return;
    const bestCount = best >= 0 ? (counts[best] ?? 0) : 0;
    if (count > bestCount || (count === bestCount && (firstVote[index] ?? Infinity) < (firstVote[best] ?? Infinity))) best = index;
  });
  return best;
}

/** "a", "B", "đáp án c" → option index; -1 for other comments. */
export function millionaireChoice(text: string): number {
  const match = text.trim().match(/^(?:(?:đáp án|dap an|chọn|chon)\s*)?([a-d])[.!)]*$/iu);
  return match ? LETTERS.indexOf((match[1] as string).toUpperCase()) : -1;
}

function lifelineCommand(text: string): Lifeline | 'stop' | null {
  const word = text.trim().toLowerCase();
  if (word === '!5050' || word === '!50') return 'fifty';
  if (word === '!khangia' || word === '!audience') return 'audience';
  if (word === '!doicau' || word === '!switch') return 'swap';
  if (word === '!dung' || word === '!dừng' || word === '!stop') return 'stop';
  return null;
}

/** Applies a lifeline to the current question; null when it can't be used now. */
function useLifeline(state: MillionaireRound, lifeline: Lifeline, config: MillionaireConfig, now: number, random: () => number): { state: MillionaireRound; endsAt?: number; message: string } | null {
  if (state.used.includes(lifeline)) return null;
  const used = [...state.used, lifeline];
  const question = current(state);
  if (lifeline === 'fifty') {
    const wrong = shuffle(question.answers.map((_, index) => index).filter((index) => index !== question.correct), random);
    const removed = wrong.slice(0, Math.max(0, question.answers.length - 2));
    return { state: { ...state, used, removed }, message: t('🛟 50:50 — bỏ 2 phương án sai') };
  }
  if (lifeline === 'audience') return { state: { ...state, used, audience: true }, message: t('👥 Hỏi ý kiến khán giả — hiện tỉ lệ bình chọn') };
  if (!state.spare) return null;
  const items = state.items.map((item, index) => (index === state.index ? (state.spare as QuizQuestion) : item));
  const fresh = startSeries(items, state.asked, now, state.spare.answers.length);
  return {
    state: { ...state, items, book: fresh.book, askedAt: now, spare: null, used, removed: [], audience: false, firstVote: [null, null, null, null] },
    endsAt: now + config.seconds * 1000,
    message: t('🔄 Đổi câu hỏi')
  };
}

export const millionaireGame: GameDefinition<MillionaireRound, MillionaireConfig> = {
  id: 'trieuPhu',
  title: 'Ai là triệu phú 💰',
  category: 'fun',
  accent: '#eab308',
  aliases: ['trieuphu', 'millionaire', 'altp'],
  howTo: 'Cả phòng là người chơi: mỗi câu comment a, b, c hoặc d. Đáp án nhiều phiếu nhất là câu trả lời của cả phòng — đúng thì leo lên bậc ⭐ tiếp theo (15 bậc), sai thì dừng ở mốc an toàn (câu 5, câu 10). Ai bình chọn đúng đều được điểm, càng nhanh càng nhiều. Quà mở quyền trợ giúp 50:50 rồi Hỏi khán giả.',
  commands: [
    { usage: 'a / b / c / d', description: 'Bình chọn đáp án (chỉ tính lần đầu)' },
    { usage: 'Tặng quà', description: 'Mở trợ giúp: lần 1 = 50:50, lần 2 = Hỏi ý kiến khán giả' },
    { usage: '!5050 / !khangia / !doicau', description: 'Streamer dùng trợ giúp: 50:50, hỏi khán giả, đổi câu hỏi' },
    { usage: '!dung', description: 'Streamer dừng cuộc chơi, giữ số ⭐ đang có' }
  ],
  defaultConfig: { preset: 'quiz-vi', questions: '', seconds: 20, maxPoints: 100, reveal: 5, giftLifeline: 'yes' },
  settings: [
    {
      key: 'preset',
      label: 'Bộ câu hỏi có sẵn',
      type: 'select',
      options: Object.entries(SOURCE_PRESETS).map(([value, source]) => ({ value, label: source.label }))
    },
    { key: 'seconds', label: 'Giây mỗi câu', type: 'number', min: 5, max: 120 },
    { key: 'maxPoints', label: 'Điểm tối đa mỗi câu', type: 'number', min: 10, max: 10_000, hint: 'Trả lời ngay = điểm tối đa, sát hết giờ = một nửa.' },
    { key: 'reveal', label: 'Giây xem đáp án', type: 'number', min: 2, max: 20 },
    {
      key: 'giftLifeline',
      label: 'Quà mở quyền trợ giúp',
      type: 'select',
      options: [
        { value: 'yes', label: 'Có (quà đầu = 50:50, quà sau = Hỏi khán giả)' },
        { value: 'no', label: 'Không, chỉ streamer dùng lệnh' }
      ]
    },
    {
      key: 'questions',
      label: 'Câu hỏi riêng (tuỳ chọn)',
      type: 'textarea',
      maxLength: 500_000,
      hint: 'Để trống = dùng bộ có sẵn. Mỗi dòng: Câu hỏi | A | B | C | D | Đáp án đúng (chữ A–D hoặc chép nguyên văn). Cần đủ 16 câu cho 15 bậc + 1 câu đổi. Nhập được file .txt / .csv.',
      sample: QUIZ_SAMPLE
    }
  ],

  checkBank(key, text) {
    return key === 'questions' ? checkBankLines(text, (line) => parseQuestions(line).length === 1) : null;
  },

  start(config, ctx) {
    const { items, asked } = pickQuestions(config, ctx.previous?.asked ?? [], ctx.random);
    if (items.length < 2) return { error: t('Bộ câu hỏi trống hoặc sai định dạng.') };
    // The last question is kept as the "switch" spare when there are enough.
    const spare = items.length > LADDER.length ? (items[LADDER.length] as QuizQuestion) : null;
    const ladder = items.slice(0, LADDER.length);
    return {
      state: {
        ...startSeries(ladder, asked, ctx.now, ladder[0]?.answers.length),
        removed: [],
        used: [],
        audience: false,
        spare,
        firstVote: [null, null, null, null],
        roomChoice: null,
        climbed: 0,
        result: 'playing'
      },
      durationMs: config.seconds * 1000
    };
  },

  handle(state, input, config, ctx) {
    if (state.stage !== 'ask') return null;
    const lifeline = lifelineInput(input, state, config);
    if (lifeline === 'stop') {
      return { consumed: true, finish: true, state: { ...state, result: 'stopped' }, message: t('✋ Dừng cuộc chơi') };
    }
    if (lifeline) {
      const used = useLifeline(state, lifeline, config, ctx.now, ctx.random);
      if (!used) return input.kind === 'chat' ? { state, consumed: true } : null;
      return { consumed: input.kind === 'chat', state: used.state, endsAt: used.endsAt, message: used.message, effects: [{ kind: 'start', text: used.message, user: input.nickname }] };
    }
    if (input.kind !== 'chat') return null;
    const question = current(state);
    const choice = millionaireChoice(input.text);
    if (choice < 0 || choice >= question.answers.length || state.removed.includes(choice)) return null;
    if (state.book.has(input.user)) return { state, consumed: true };
    const ms = ctx.now - state.askedAt;
    const answer = { user: input.user, nickname: input.nickname, ms, correct: choice === question.correct, choice };
    const firstVote = state.firstVote;
    return {
      consumed: true,
      state: { ...state },
      commit: () => {
        state.book.add(answer);
        if (firstVote[choice] == null) firstVote[choice] = ms;
      }
    };
  },

  advance(state, config, ctx) {
    if (state.stage === 'ask') {
      const { result, awards, commit } = scoreQuestion(state, { ...config, count: LADDER.length, order: 'random' });
      const question = current(state);
      // Votes cast before a 50:50 for a removed option don't decide the room's answer.
      const roomChoice = roomChoiceOf(state.book.counts.map((count, index) => (state.removed.includes(index) ? 0 : count)), state.firstVote);
      const right = roomChoice === question.correct;
      const climbed = right ? state.climbed + 1 : state.climbed;
      const outcome: MillionaireRound['result'] = !right ? 'wrong' : climbed >= LADDER.length ? 'won' : 'playing';
      const letter = LETTERS[question.correct] ?? '';
      const effects: EffectInput[] = [right
        ? { kind: 'correct', text: t('✅ Đúng! {stars}', { stars: formatStars(LADDER[climbed - 1] ?? 0) }) }
        : { kind: 'wrong', text: roomChoice < 0 ? t('⏰ Hết giờ!') : t('❌ Sai! Đáp án {letter}', { letter }) }];
      return {
        consumed: false,
        state: { ...state, stage: 'reveal', last: result, roomChoice, climbed, result: outcome },
        awards,
        commit,
        endsAt: ctx.now + config.reveal * 1000,
        effects,
        message: right
          ? t('Cả phòng chọn {letter} — chính xác! Lên bậc {step}: {stars}', { letter, step: climbed, stars: formatStars(LADDER[climbed - 1] ?? 0) })
          : roomChoice < 0
            ? t('Không ai bình chọn — đáp án {letter}: {answer}', { letter, answer: question.answers[question.correct] ?? '' })
            : t('Cả phòng chọn {choice} — sai rồi! Đáp án {letter}: {answer}', { choice: LETTERS[roomChoice] ?? '', letter, answer: question.answers[question.correct] ?? '' })
      };
    }
    if (state.stage !== 'reveal' || state.result !== 'playing') return null;
    const next = nextQuestion(state, ctx.now, state.items[state.index + 1]?.answers.length);
    if (!next) return null;
    return { consumed: false, state: { ...next, removed: [], audience: false, firstVote: [null, null, null, null], roomChoice: null }, endsAt: ctx.now + config.seconds * 1000, message: '' };
  },

  finish(state) {
    const result = state.result === 'playing' ? 'stopped' : state.result;
    const prize = roomPrize(state.climbed, result);
    const done: MillionaireRound = { ...state, stage: 'done', result };
    const top = state.totals.top(3);
    const text = result === 'won'
      ? t('💰 Cả phòng là TRIỆU PHÚ! {stars}', { stars: formatStars(prize) })
      : t('💰 Cả phòng ra về với {stars} (bậc {step}/15)', { stars: formatStars(prize), step: state.climbed });
    return {
      state: done,
      awards: [],
      message: text,
      effects: [top.length ? podiumEffect(top, text) : { kind: prize > 0 ? 'win' : 'lose', text }]
    };
  },

  testActions(state) {
    if (state.stage !== 'ask') return [];
    const question = current(state);
    const wrong = question.answers.findIndex((_, index) => index !== question.correct && !state.removed.includes(index));
    return [
      chatTest(t('Trả lời đúng ({letter})', { letter: LETTERS[question.correct] ?? '' }), LETTERS[question.correct] ?? 'A', 3),
      ...(wrong >= 0 ? [chatTest(t('Trả lời sai ({letter})', { letter: LETTERS[wrong] ?? '' }), LETTERS[wrong] ?? 'B', 1)] : []),
      { label: t('Quà (trợ giúp)'), input: { kind: 'gift', giftName: 'Rose', count: 1 }, weight: 0.2 }
    ];
  },

  view(state) {
    if (state.stage === 'done') {
      const prize = roomPrize(state.climbed, state.result);
      return view({
        headline: state.result === 'won' ? t('💰 TRIỆU PHÚ!') : t('💰 {stars}', { stars: formatStars(prize) }),
        hint: t('Cả phòng leo được {step}/15 bậc', { step: state.climbed }),
        rows: rankingRows(state.totals.top(5))
      });
    }
    const question = current(state);
    const revealed = state.stage === 'reveal';
    const { counts, total } = state.book;
    const showShares = revealed || state.audience;
    const step = state.index + 1;
    const lifelines = [
      state.used.includes('fifty') ? '' : '🛟 50:50',
      state.used.includes('audience') ? '' : '👥',
      state.used.includes('swap') || !state.spare ? '' : '🔄'
    ].filter(Boolean).join(' ');
    const safe = [...SAFE_STEPS].reverse().find((s) => state.climbed >= s);
    return view({
      style: { rows: 'quiz' },
      headline: question.question,
      progress: { label: t('Câu {n} • {stars}', { n: step, stars: formatStars(LADDER[step - 1] ?? 0) }), value: state.climbed, max: LADDER.length },
      hint: revealed
        ? resultHint(state.last)
        : [
          t('{count} phiếu', { count: total.toLocaleString(numberLocale()) }),
          safe ? t('Mốc an toàn {stars}', { stars: formatStars(LADDER[safe - 1] ?? 0) }) : '',
          lifelines ? t('Trợ giúp: {list}', { list: lifelines }) : ''
        ].filter(Boolean).join(' • '),
      rows: question.answers.map((answer, index) => ({
        badge: LETTERS[index],
        label: state.removed.includes(index) ? '—' : answer,
        value: showShares && !state.removed.includes(index) ? String(counts[index] ?? 0) : undefined,
        percent: showShares && !state.removed.includes(index) ? percentOf(counts[index] ?? 0, total) : undefined,
        highlight: revealed ? index === question.correct : false
      }))
    });
  }
};

/** Lifeline asked for by this input: a host command, or a gift when gifts open lifelines. */
function lifelineInput(input: GameInput, state: MillionaireRound, config: MillionaireConfig): Lifeline | 'stop' | null {
  if (input.kind === 'chat') return input.isHost ? lifelineCommand(input.text) : null;
  if (input.kind !== 'gift' || config.giftLifeline !== 'yes') return null;
  if (!state.used.includes('fifty')) return 'fifty';
  if (!state.used.includes('audience')) return 'audience';
  return null;
}
