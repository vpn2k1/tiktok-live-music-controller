import { t } from '../../shared/i18n';
import { checkBankLines } from '../bankFile';
import type { PointAward } from '../engine';
import { AnswerBook, type QuestionResult, winnerEffect } from '../series';
import type { OverlayGameView, OverlayGrow } from '../../shared/types';
import { chatTest, percentOf, pickUnasked, view, type GameDefinition, type SettingField } from '../types';
import { parseQuestions, QUIZ_PRESETS, QUIZ_SAMPLE, quizBank, type QuizQuestion } from './quiz';

/** One viewer on the track. */
export interface Racer {
  user: string;
  nickname: string;
  steps: number;
  /**
   * When the viewer reached `steps` (a counter over the whole race): among
   * racers on the same step, the one who got there first is ahead.
   */
  order: number;
}

/**
 * Question race: every question closes after its timer; each viewer who
 * answered correctly moves +1 step, in the order they answered (the first
 * correct answer moves first). The first to reach the finish wins.
 */
export interface RaceRound {
  goal: number;
  /** Parsed question bank of this race. */
  bank: QuizQuestion[];
  /** Bank indices asked recently (the next race continues without repeats). */
  asked: number[];
  question: QuizQuestion;
  /** 1-based question number in this race. */
  number: number;
  stage: 'ask' | 'reveal' | 'done';
  askedAt: number;
  /** Answers to the current question (mutated only in `commit`). */
  book: AnswerBook;
  /** Every racer's position (mutated only in `commit`: copying it per answer doesn't scale). */
  racers: Map<string, Racer>;
  /** The front of the race, rebuilt when a question closes. */
  leaders: Racer[];
  /** Step counter for `Racer.order`. */
  seq: number;
  last: QuestionResult | null;
  winner: Racer | null;
}

type RaceConfig = { preset: string; questions: string; goal: number; seconds: number; reveal: number; maxQuestions: number; icon: string };

/**
 * What makes one question race differ from another: its texts and picture.
 * Every function returning viewer text is called at run time, so it uses t().
 */
interface QuestionRaceOptions {
  id: string;
  title: string;
  accent: string;
  aliases: string[];
  howTo: string;
  /** Description of the a/b/c/d command on the game card. */
  answerHelp: string;
  defaultGoal: number;
  /** "Số bước về đích" setting label and hint. */
  goalLabel: string;
  goalHint: string;
  /** The race picture: duck lanes, or a growing picture (`grow` kind). */
  picture: { lanes: true } | { grow: OverlayGrow['kind'] };
  /** "7/7 bước" on the winner's celebration. */
  progress: (steps: number, goal: number) => string;
  /** "Correct = +1 step · finish: 7 steps" hint while asking. */
  askHint: (goal: number) => string;
  /** "✅ 12 correct: +1 step" hint at the reveal. */
  revealHint: (correct: number) => string;
  /** Shown while nobody has moved yet. */
  emptyHint: () => string;
  /** Winner message (crossed the line / led when the questions ran out). */
  winText: (name: string) => string;
  leadText: (name: string) => string;
  /** Popup over each mover ("🦆 +1"). */
  moveText: (config: RaceConfig) => string;
}

const LETTERS = ['A', 'B', 'C', 'D'];
/** Lanes drawn on the overlay. */
const LANES = 6;
/** Session points for each step forward. */
const STEP_POINTS = 10;
/** Bonus for the top 3 at the end of the race. */
const FINISH_BONUS = [100, 50, 25];

export const RACE_ICONS = ['🦆', '🏎️', '🐎', '🐢', '🚀'];

/** Front runners first: more steps, then whoever reached that step first. */
function byPosition(a: Racer, b: Racer): number {
  return b.steps - a.steps || a.order - b.order;
}

function letterChoice(text: string): number {
  return LETTERS.indexOf(text.trim().toUpperCase());
}

function nextQuestion(state: Pick<RaceRound, 'bank' | 'asked'>, random: () => number): { question: QuizQuestion; asked: number[] } {
  const pick = pickUnasked(state.bank.length, state.asked, random);
  return { question: state.bank[pick.index] as QuizQuestion, asked: pick.asked };
}

/** Racers who moved on the current question, in answer order, with the winner if one crossed the line. */
export function raceMoves(state: RaceRound): { moves: Racer[]; winner: Racer | null } {
  const moves: Racer[] = [];
  let winner: Racer | null = null;
  for (const answer of state.book.correctAnswers()) {
    const old = state.racers.get(answer.user);
    const racer: Racer = { user: answer.user, nickname: answer.nickname, steps: Math.min(state.goal, (old?.steps ?? 0) + 1), order: state.seq + moves.length };
    moves.push(racer);
    if (!winner && racer.steps >= state.goal) winner = racer;
  }
  return { moves, winner };
}

/** New front of the race: only the old leaders and the viewers who just moved can be in it. */
function newLeaders(leaders: Racer[], moves: Racer[]): Racer[] {
  const moved = new Set(moves.map((racer) => racer.user));
  return [...leaders.filter((racer) => !moved.has(racer.user)), ...moves].sort(byPosition).slice(0, LANES);
}

/**
 * Question race engine: a question every few seconds, correct answers move +1
 * step in answer order, first to `goal` wins (the winner spotlight). The duck
 * race draws lanes; the other races draw a picture that grows.
 */
export function createQuestionRace(options: QuestionRaceOptions): GameDefinition<RaceRound, RaceConfig> {
  const lanes = 'lanes' in options.picture;
  const picture = (state: RaceRound, config: RaceConfig): Partial<OverlayGameView> => {
    // Columns are narrow: a plain "3/7" (the unit is on the winner's celebration).
    const items = state.leaders.map((racer) => ({ label: racer.nickname, steps: racer.steps, value: `${racer.steps}/${state.goal}` }));
    if ('grow' in options.picture) return { grow: { kind: options.picture.grow, goal: state.goal, items, emptyHint: options.emptyHint() } };
    return {
      race: {
        icon: config.icon,
        emptyHint: options.emptyHint(),
        lanes: items.map((item) => ({ label: item.label, percent: percentOf(item.steps, state.goal), value: item.value }))
      }
    };
  };
  const iconSetting: SettingField[] = lanes ? [{ key: 'icon', label: 'Nhân vật', type: 'select', options: RACE_ICONS.map((icon) => ({ value: icon, label: icon })) }] : [];
  return {
    id: options.id,
    title: options.title,
    category: 'fun',
    accent: options.accent,
    howTo: options.howTo,
    commands: [{ usage: 'a / b / c / d', description: options.answerHelp }],
    aliases: options.aliases,
    defaultConfig: { preset: 'vi', questions: '', goal: options.defaultGoal, seconds: 12, reveal: 3, maxQuestions: 30, icon: '🦆' },
    settings: [
      {
        key: 'preset',
        label: 'Bộ câu hỏi có sẵn',
        type: 'select',
        options: Object.entries(QUIZ_PRESETS).map(([value, preset]) => ({ value, label: `${preset.label} · ${parseQuestions(preset.bank).length} câu` }))
      },
      { key: 'goal', label: options.goalLabel, type: 'number', min: 2, max: 50, hint: options.goalHint },
      { key: 'seconds', label: 'Giây mỗi câu', type: 'number', min: 5, max: 120 },
      { key: 'reveal', label: 'Giây xem đáp án', type: 'number', min: 2, max: 20 },
      { key: 'maxQuestions', label: 'Tối đa số câu mỗi cuộc đua', type: 'number', min: 3, max: 500, hint: 'Hết số câu mà chưa ai về đích thì người dẫn đầu thắng.' },
      ...iconSetting,
      {
        key: 'questions',
        label: 'Câu hỏi riêng (tuỳ chọn)',
        type: 'textarea',
        maxLength: 500_000,
        hint: 'Để trống = dùng bộ câu hỏi có sẵn ở trên. Mỗi dòng: Câu hỏi | A | B | C | D | Đáp án đúng (chữ A–D hoặc chép nguyên văn). 2–4 lựa chọn. Nhập được file .txt / .csv (Excel, Google Sheets).',
        sample: QUIZ_SAMPLE
      }
    ],

    checkBank(key, text) {
      return key === 'questions' ? checkBankLines(text, (line) => parseQuestions(line).length === 1) : null;
    },

    start(config, ctx) {
      const bank = quizBank(config);
      if (!bank.length) return { error: t('Bộ câu hỏi trống hoặc sai định dạng.') };
      const first = nextQuestion({ bank, asked: ctx.previous?.asked ?? [] }, ctx.random);
      return {
        state: {
          goal: config.goal,
          bank,
          asked: first.asked,
          question: first.question,
          number: 1,
          stage: 'ask',
          askedAt: ctx.now,
          book: new AnswerBook(first.question.answers.length),
          racers: new Map(),
          leaders: [],
          seq: 0,
          last: null,
          winner: null
        },
        durationMs: config.seconds * 1000
      };
    },

    handle(state, input, _config, ctx) {
      if (input.kind !== 'chat' || state.stage !== 'ask') return null;
      const choice = letterChoice(input.text);
      if (choice < 0 || choice >= state.question.answers.length) return null;
      if (state.book.has(input.user)) return { state, consumed: true };
      const answer = { user: input.user, nickname: input.nickname, ms: ctx.now - state.askedAt, correct: choice === state.question.correct, choice };
      return { consumed: true, state: { ...state }, commit: () => state.book.add(answer) };
    },

    advance(state, config, ctx) {
      if (state.stage === 'ask') {
        // Question closed: correct answers move +1 step, first answer first.
        const { moves, winner } = raceMoves(state);
        const letter = LETTERS[state.question.correct] ?? '';
        const awards: PointAward[] = moves.map((racer) => ({ user: racer.user, nickname: racer.nickname, points: STEP_POINTS }));
        const fastest = state.book.fastest.map((answer) => ({ nickname: answer.nickname, ms: answer.ms, points: STEP_POINTS }));
        return {
          consumed: false,
          state: {
            ...state,
            stage: 'reveal',
            leaders: newLeaders(state.leaders, moves),
            seq: state.seq + moves.length,
            last: { correct: state.book.correct, total: state.book.total, fastest },
            winner
          },
          awards,
          commit: () => {
            for (const racer of moves) state.racers.set(racer.user, racer);
          },
          // Someone crossed the finish line: the race ends and the winner is celebrated.
          finish: winner != null,
          endsAt: winner ? undefined : ctx.now + config.reveal * 1000,
          message: t('Đáp án {letter}: {answer}', { letter, answer: state.question.answers[state.question.correct] ?? '' }),
          effects: moves.length
            ? moves.slice(0, 3).map((racer) => ({ kind: 'correct' as const, text: options.moveText(config), user: racer.nickname }))
            : [{ kind: 'wrong', text: t('Đáp án {letter}', { letter }) }]
        };
      }
      if (state.stage !== 'reveal' || state.number >= config.maxQuestions) return null;
      const next = nextQuestion(state, ctx.random);
      return {
        consumed: false,
        state: { ...state, ...next, number: state.number + 1, stage: 'ask', askedAt: ctx.now, book: new AnswerBook(next.question.answers.length), last: null },
        endsAt: ctx.now + config.seconds * 1000,
        message: ''
      };
    },

    finish(state) {
      // Out of questions (or stopped by the host): the front runner wins.
      const leader = state.winner ?? state.leaders.find((racer) => racer.steps > 0) ?? null;
      const podium = [leader, ...state.leaders.filter((racer) => racer.user !== leader?.user && racer.steps > 0)].filter((racer): racer is Racer => racer != null).slice(0, FINISH_BONUS.length);
      const awards: PointAward[] = podium.map((racer, index) => ({ user: racer.user, nickname: racer.nickname, points: FINISH_BONUS[index] ?? 0 }));
      const done: RaceRound = { ...state, stage: 'done', winner: leader };
      if (!leader) return { state: done, awards, message: t('Chưa ai trả lời đúng.'), effects: [{ kind: 'lose', text: t('Chưa ai trả lời đúng.') }] };
      const message = state.winner ? options.winText(leader.nickname) : options.leadText(leader.nickname);
      return { state: done, awards, message, effects: [winnerEffect(leader.nickname, message, options.progress(leader.steps, state.goal))] };
    },

    testActions(state) {
      if (state.stage !== 'ask') return [];
      const correct = LETTERS[state.question.correct] ?? 'A';
      return [
        chatTest(t('Trả lời đúng ({letter})', { letter: correct }), correct, 3),
        ...state.question.answers.map((_, index) => LETTERS[index] ?? '').filter((letter) => letter !== correct).map((letter) => chatTest(letter, letter))
      ];
    },

    view(state, config) {
      const art = picture(state, config);
      if (state.stage === 'done') {
        return view({
          headline: state.winner ? t('🏁 {name} thắng!', { name: state.winner.nickname }) : t('🏁 Kết thúc'),
          ...art
        });
      }
      const revealed = state.stage === 'reveal';
      const { counts, total, correct } = state.book;
      const progress = t('Câu {n}', { n: state.number });
      return view({
        style: { rows: 'quiz' },
        headline: state.question.question,
        hint: revealed
          ? `${progress} • ${correct ? options.revealHint(correct) : t('Chưa ai đúng')}`
          : `${progress} • ${options.askHint(state.goal)} • ${t('{count} người đã trả lời', { count: total })}`,
        rows: state.question.answers.map((answer, index) => ({
          badge: LETTERS[index],
          label: answer,
          // Counts stay hidden until the reveal so viewers can't copy the crowd.
          value: revealed ? String(counts[index] ?? 0) : undefined,
          percent: revealed ? percentOf(counts[index] ?? 0, total) : undefined,
          highlight: revealed && index === state.question.correct
        })),
        ...art
      });
    }
  };
}

export const raceGame = createQuestionRace({
  id: 'race',
  title: 'Đua vịt 🏁',
  accent: '#06b6d4',
  aliases: ['duavit', 'duck'],
  howTo: 'Mỗi câu hỏi comment a, b, c hoặc d. Hết giờ câu hỏi, ai trả lời đúng tiến +1 bước (ai đúng trước tiến trước). Ai về đích đầu tiên thắng và được chúc mừng trên màn hình; top 3 được thưởng điểm.',
  answerHelp: 'Trả lời câu hỏi: đúng = +1 bước (chỉ tính lần đầu)',
  defaultGoal: 7,
  goalLabel: 'Số bước về đích',
  goalHint: 'Mỗi câu trả lời đúng = 1 bước.',
  picture: { lanes: true },
  progress: (steps, goal) => t('{steps}/{goal} bước', { steps, goal }),
  askHint: (goal) => t('Đúng = +1 bước · về đích: {goal} bước', { goal }),
  revealHint: (n) => t('✅ {n} người đúng: +1 bước', { n }),
  emptyHint: () => t('✅ Trả lời đúng để xuất phát!'),
  winText: (name) => t('🏆 {name} về đích đầu tiên!', { name }),
  leadText: (name) => t('🏆 {name} dẫn đầu khi hết câu hỏi!', { name }),
  moveText: (config) => `${config.icon} +1`
});
