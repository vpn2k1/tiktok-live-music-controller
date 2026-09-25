import { VOCAB_BANK } from '../content/english';
import type { PointAward } from '../engine';
import { aliases, normalizeEnglish } from '../english';
import {
  current,
  finalMessage,
  nextQuestion,
  pickSet,
  rankingRows,
  roundEndEffect,
  seconds,
  SERIES_SETTINGS,
  speedPoints,
  startSeries,
  type SeriesConfig,
  type SeriesState
} from '../series';
import { checkBankLines } from '../bankFile';
import { chatTest, commandArgument, ranked, view, type GameDefinition } from '../types';
import { numberLocale, t } from '../../shared/i18n';

export interface HangmanWord {
  word: string;
  meaning: string;
}

/** A round of N words; letters are guessed together, the solver scores by speed. */
export type HangmanRound = SeriesState<HangmanWord> & {
  guessed: string[];
  wrong: string[];
  /** Letters each viewer revealed in the current word (at most 26 entries of interest). */
  finders: Record<string, { nickname: string; letters: number }>;
  solver: { user: string; nickname: string; ms: number } | null;
};

type HangmanConfig = SeriesConfig & { maxWrong: number; bank: string };

/** Points per revealed letter, as a share of the word's max points. */
const LETTER_SHARE = 0.1;

export function parseHangmanBank(text: string): HangmanWord[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const [english = '', meaning = ''] = line.split('|').map((part) => part.trim());
    const word = aliases(english)[0] ?? '';
    return /^[a-z]{3,16}$/.test(word) ? [{ word, meaning }] : [];
  });
}

/** Viewer counts in the app language's number format (1.440 / 1,440). */
function count(value: number): string {
  return value.toLocaleString(numberLocale());
}

export function maskWord(word: string, guessed: string[]): string {
  return word.split('').map((letter) => (guessed.includes(letter) ? letter.toUpperCase() : '_')).join(' ');
}

function solved(state: HangmanRound): boolean {
  return current(state).word.split('').every((letter) => state.guessed.includes(letter));
}

function wordOver(state: HangmanRound, config: HangmanConfig): boolean {
  return state.stage !== 'ask' || state.solver != null || state.wrong.length >= config.maxWrong || solved(state);
}

const FRESH_WORD = { guessed: [], wrong: [], finders: {}, solver: null };

/** Awards for the current word: letter finders + the solver's speed points. */
function wordAwards(state: HangmanRound, config: HangmanConfig): PointAward[] {
  const letterPoints = Math.max(1, Math.round(config.maxPoints * LETTER_SHARE));
  const awards: PointAward[] = Object.entries(state.finders).map(([user, entry]) => ({ user, nickname: entry.nickname, points: entry.letters * letterPoints }));
  if (state.solver) {
    awards.push({ user: state.solver.user, nickname: state.solver.nickname, points: speedPoints(config.maxPoints, state.solver.ms, config.seconds * 1000) });
  }
  return awards;
}

function wordMessage(state: HangmanRound): string {
  const { word, meaning } = current(state);
  return state.solver
    ? t('🎉 {name} tìm ra “{word}” ({meaning}) sau {time}!', { name: state.solver.nickname, word: word.toUpperCase(), meaning, time: seconds(state.solver.ms) })
    : t('Từ đúng là “{word}” ({meaning}).', { word: word.toUpperCase(), meaning });
}

export const hangmanGame: GameDefinition<HangmanRound, HangmanConfig> = {
  id: 'hangman',
  title: 'Hangman 🪢',
  category: 'english',
  accent: '#84cc16',
  howTo: 'Mỗi lượt nhiều từ. Comment 1 chữ cái để lật từ bí mật, hoặc gõ cả từ nếu đã đoán ra. Chữ cái sai bị trừ lượt. Lật đúng chữ có điểm, đoán ra cả từ càng nhanh càng nhiều điểm; hết lượt xếp hạng tổng điểm.',
  commands: [
    { usage: 'a', description: 'Đoán 1 chữ cái' },
    { usage: 'apple', description: 'Đoán cả từ' },
    { usage: '!guess a', description: 'Cách viết khác' }
  ],
  defaultConfig: { count: 5, seconds: 60, maxPoints: 100, reveal: 4, order: 'random', maxWrong: 6, bank: VOCAB_BANK },
  settings: [
    ...SERIES_SETTINGS.map((field) => (field.key === 'count' ? { ...field, label: 'Số từ mỗi lượt' } : field.key === 'seconds' ? { ...field, label: 'Giây mỗi từ', min: 20, max: 600 } : field)),
    { key: 'maxWrong', label: 'Số lần sai tối đa', type: 'number', min: 3, max: 12 },
    {
      key: 'bank',
      label: 'Từ vựng',
      type: 'textarea',
      maxLength: 500_000,
      hint: 'Mỗi dòng: english | nghĩa tiếng Việt (chỉ dùng từ đơn 3–16 chữ cái). Nhập được file .txt / .csv (Excel, Google Sheets).',
      sample: [
        '# Mẫu Hangman — mỗi dòng 1 từ đơn (3–16 chữ cái, không dấu cách):',
        '# từ tiếng Anh | nghĩa tiếng Việt',
        '# - Excel / Google Sheets: cột A = từ, cột B = nghĩa, tải xuống .csv rồi nhập.',
        '# - Dòng bắt đầu bằng # là ghi chú, app bỏ qua. Lưu file dạng UTF-8.',
        'elephant | con voi',
        'umbrella | cái ô'
      ].join('\n')
    }
  ],

  checkBank(key, text) {
    return key === 'bank' ? checkBankLines(text, (line) => parseHangmanBank(line).length === 1) : null;
  },

  start(config, ctx) {
    const bank = parseHangmanBank(config.bank);
    if (!bank.length) return { error: t('Không có từ hợp lệ (từ đơn 3–16 chữ cái).') };
    const { indices, asked } = pickSet(bank.length, config.count, ctx.previous?.asked ?? [], ctx.random, config.order);
    const items = indices.map((index) => bank[index] as HangmanWord);
    return { state: { ...startSeries(items, asked, ctx.now), ...FRESH_WORD }, durationMs: config.seconds * 1000 };
  },

  handle(state, input, config, ctx) {
    if (input.kind !== 'chat' || wordOver(state, config)) return null;
    const raw = commandArgument(input.text, ['guess', 'ans']);
    if (raw === null) return null;
    const text = normalizeEnglish(raw);
    const { word } = current(state);

    if (/^[a-z]$/.test(text)) {
      if (state.guessed.includes(text) || state.wrong.includes(text)) return { state, consumed: true };
      const hits = word.split('').filter((letter) => letter === text).length;
      if (!hits) {
        const wrong = [...state.wrong, text];
        return {
          consumed: true,
          // Out of lives: close the word now; the deadline step reveals it.
          endsAt: wrong.length >= config.maxWrong ? ctx.now : undefined,
          message: t('{name}: “{letter}” không có ❌', { name: input.nickname, letter: text.toUpperCase() }),
          effects: [{ kind: 'wrong', text: text.toUpperCase(), user: input.nickname }],
          state: { ...state, wrong }
        };
      }
      const old = state.finders[input.user];
      const next: HangmanRound = {
        ...state,
        guessed: [...state.guessed, text],
        finders: { ...state.finders, [input.user]: { nickname: input.nickname, letters: (old?.letters ?? 0) + hits } }
      };
      const done = solved(next);
      return {
        consumed: true,
        endsAt: done ? ctx.now : undefined,
        message: `${input.nickname}: “${text.toUpperCase()}” ✅`,
        effects: [{ kind: 'correct', text: text.toUpperCase(), user: input.nickname }],
        state: done ? { ...next, solver: { user: input.user, nickname: input.nickname, ms: ctx.now - state.askedAt } } : next
      };
    }

    // A whole-word guess of the right length; wrong words cost nothing (trolls can't burn lives).
    if (/^[a-z]+$/.test(text) && text.length === word.length) {
      if (text !== word) return { state, consumed: true };
      return {
        consumed: true,
        endsAt: ctx.now,
        effects: [{ kind: 'correct', text: word.toUpperCase(), user: input.nickname }],
        state: { ...state, guessed: [...new Set([...state.guessed, ...word.split('')])], solver: { user: input.user, nickname: input.nickname, ms: ctx.now - state.askedAt } }
      };
    }
    return null;
  },

  advance(state, config, ctx) {
    if (state.stage === 'ask') {
      const awards = wordAwards(state, config);
      return {
        consumed: false,
        state: { ...state, stage: 'reveal', guessed: [...new Set([...state.guessed, ...current(state).word.split('')])] },
        awards,
        commit: () => {
          for (const award of awards) state.totals.add(award.user, award.nickname, award.points);
        },
        endsAt: ctx.now + config.reveal * 1000,
        message: wordMessage(state)
      };
    }
    if (state.stage !== 'reveal') return null;
    const next = nextQuestion(state, ctx.now);
    return next ? { consumed: false, state: { ...next, ...FRESH_WORD }, endsAt: ctx.now + config.seconds * 1000, message: '' } : null;
  },

  finish(state, config) {
    const asking = state.stage === 'ask';
    const awards = asking ? wordAwards(state, config) : [];
    for (const award of awards) state.totals.add(award.user, award.nickname, award.points);
    const done: HangmanRound = { ...state, stage: 'done', guessed: [...new Set([...state.guessed, ...current(state).word.split('')])] };
    return {
      state: done,
      awards,
      message: `${asking ? `${wordMessage(state)} ` : ''}${finalMessage(done)}`,
      effects: [roundEndEffect(done)]
    };
  },

  testActions(state, config) {
    if (wordOver(state, config)) return [];
    const { word } = current(state);
    const right = word.split('').find((letter) => !state.guessed.includes(letter));
    const wrong = 'zqxjkvwybfgmhucdplsrtoniea'.split('').find((letter) => !word.includes(letter) && !state.wrong.includes(letter));
    return [
      ...(right ? [chatTest(t('Chữ đúng: {letter}', { letter: right.toUpperCase() }), right, 3)] : []),
      ...(wrong ? [chatTest(t('Chữ sai: {letter}', { letter: wrong.toUpperCase() }), wrong, 1)] : []),
      chatTest(t('Đoán cả từ: {word}', { word }), word, 0.3)
    ];
  },

  view(state, config) {
    if (state.stage === 'done') {
      return view({
        headline: t('🏁 Tổng kết'),
        hint: t('{words} từ • {players} người có điểm', { words: state.index + 1, players: count(state.totals.size) }),
        rows: rankingRows(state.totals.top(5))
      });
    }
    const { word, meaning } = current(state);
    const finders = ranked(Object.entries(state.finders).map(([user, entry]) => ({ user, ...entry })), (entry) => entry.letters).slice(0, 3);
    return view({
      headline: maskWord(word, state.guessed),
      style: { headline: 'tiles' },
      hint: state.stage === 'reveal'
        ? wordMessage(state)
        : `${t('Từ {n}/{total}', { n: state.index + 1, total: state.items.length })} • ${t('Nghĩa: {meaning}', { meaning: meaning || '?' })} • ${t('Sai {wrong}/{max}', { wrong: state.wrong.length, max: config.maxWrong })}${state.wrong.length ? `: ${state.wrong.join(' ').toUpperCase()}` : ''}`,
      progress: { label: t('Lượt còn lại'), value: Math.max(0, config.maxWrong - state.wrong.length), max: config.maxWrong },
      rows: finders.map((entry) => ({ label: entry.nickname, avatar: entry.nickname, value: t('{count} chữ', { count: entry.letters }) }))
    });
  }
};
