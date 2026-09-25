import type { PointAward } from '../engine';
import {
  current,
  nextQuestion,
  pickSet,
  podiumEffect,
  progressLabel,
  rankingRows,
  resultHint,
  scoreQuestion,
  SERIES_SETTINGS,
  startSeries,
  type SeriesConfig,
  type SeriesState
} from '../series';
import { checkBankLines } from '../bankFile';
import { chatTest, percentOf, view, type GameDefinition } from '../types';
import { numberLocale, t } from '../../shared/i18n';
import { parseQuestions, QUIZ_PRESETS, QUIZ_SAMPLE, quizBank, type QuizQuestion } from './quiz';

/**
 * "Rung chuông vàng" (Golden Bell): everyone answers question 1; from then on
 * only survivors may answer and a wrong or missing answer knocks you out. The
 * last one standing (or everyone still in after the last question) wins.
 */
export type GoldenBellRound = SeriesState<QuizQuestion> & {
  /** Contestants and whether they are out; written only in `commit`. */
  players: Map<string, { nickname: string; out: boolean }>;
  /** Contestants who joined on question 1. */
  joined: number;
  /** Still in after the last closed question. */
  alive: number;
  /** Knocked out by the question being revealed. */
  lastOut: number;
};

type GoldenBellConfig = SeriesConfig & { preset: string; questions: string; winPoints: number };

const LETTERS = ['A', 'B', 'C', 'D'];

/** Closes the current question: who survives, who is out (applied in `commit`). */
function closeQuestion(state: GoldenBellRound, config: GoldenBellConfig) {
  const scored = scoreQuestion(state, config);
  const correctUsers = new Set([...state.book.correctAnswers()].map((answer) => answer.user));
  const first = state.index === 0;
  const alive = first ? correctUsers.size : [...correctUsers].filter((user) => state.players.get(user)?.out === false).length;
  const before = first ? state.book.total : state.alive;
  const commit = () => {
    scored.commit();
    if (first) {
      for (const answer of state.book.answers()) state.players.set(answer.user, { nickname: answer.nickname, out: !answer.correct });
    } else {
      for (const [user, player] of state.players) if (!player.out && !correctUsers.has(user)) player.out = true;
    }
  };
  return {
    scored,
    commit,
    next: { ...state, stage: 'reveal' as const, last: scored.result, alive, joined: first ? state.book.total : state.joined, lastOut: Math.max(0, before - alive) }
  };
}

function survivors(state: GoldenBellRound): { user: string; nickname: string }[] {
  return [...state.players].filter(([, player]) => !player.out).map(([user, player]) => ({ user, nickname: player.nickname }));
}

export const goldenBellGame: GameDefinition<GoldenBellRound, GoldenBellConfig> = {
  id: 'rungChuong',
  title: 'Rung chuông vàng 🔔',
  category: 'english',
  accent: '#eab308',
  aliases: ['rungchuong', 'goldenbell'],
  howTo: 'Ai cũng vào cuộc ở câu 1: comment a / b / c / d. Từ câu 2, trả lời sai hoặc không trả lời là bị loại. Người trụ lại cuối cùng thắng lớn!',
  commands: [{ usage: 'a / b / c / d', description: 'Chọn đáp án — sai là bị loại' }],
  defaultConfig: { count: 15, seconds: 15, maxPoints: 100, reveal: 5, order: 'random', preset: 'en-easy', questions: '', winPoints: 500 },
  settings: [
    {
      key: 'preset',
      label: 'Bộ câu hỏi có sẵn',
      type: 'select',
      options: Object.entries(QUIZ_PRESETS).map(([value, preset]) => ({ value, label: `${preset.label} · ${parseQuestions(preset.bank).length} câu` }))
    },
    ...SERIES_SETTINGS.map((field) => (field.key === 'count' ? { ...field, label: 'Số câu tối đa' } : field)),
    { key: 'winPoints', label: 'Thưởng người trụ lại', type: 'number', min: 0, max: 100_000, hint: 'Mỗi người còn trụ lại khi kết thúc được cộng thêm.' },
    {
      key: 'questions',
      label: 'Câu hỏi riêng (tuỳ chọn)',
      type: 'textarea',
      maxLength: 500_000,
      hint: 'Để trống = dùng bộ câu hỏi có sẵn ở trên. Mỗi dòng: Câu hỏi | A | B | C | D | Đáp án đúng. Nhập được file .txt / .csv.',
      sample: QUIZ_SAMPLE
    }
  ],

  checkBank(key, text) {
    return key === 'questions' ? checkBankLines(text, (line) => parseQuestions(line).length === 1) : null;
  },

  start(config, ctx) {
    const bank = quizBank(config);
    if (!bank.length) return { error: t('Bộ câu hỏi trống hoặc sai định dạng.') };
    const { indices, asked } = pickSet(bank.length, config.count, ctx.previous?.asked ?? [], ctx.random, config.order);
    const items = indices.map((index) => bank[index] as QuizQuestion);
    return {
      state: { ...startSeries(items.length ? items : [bank[0] as QuizQuestion], asked, ctx.now, items[0]?.answers.length), players: new Map(), joined: 0, alive: 0, lastOut: 0 },
      durationMs: config.seconds * 1000
    };
  },

  handle(state, input, _config, ctx) {
    if (input.kind !== 'chat' || state.stage !== 'ask') return null;
    const question = current(state);
    const choice = LETTERS.indexOf(input.text.trim().toUpperCase());
    if (choice < 0 || choice >= question.answers.length) return null;
    // After question 1 only survivors play; latecomers and knocked-out viewers are ignored.
    if (state.index > 0 && state.players.get(input.user)?.out !== false) return null;
    if (state.book.has(input.user)) return { state, consumed: true };
    const answer = { user: input.user, nickname: input.nickname, ms: ctx.now - state.askedAt, correct: choice === question.correct, choice };
    return { consumed: true, state: { ...state }, commit: () => state.book.add(answer) };
  },

  advance(state, config, ctx) {
    if (state.stage === 'ask') {
      const { scored, commit, next } = closeQuestion(state, config);
      const question = current(state);
      return {
        consumed: false,
        state: next,
        awards: scored.awards,
        commit,
        endsAt: ctx.now + config.reveal * 1000,
        message: t('Đáp án {letter}: {answer} • 💥 {out} người bị loại, còn {alive}', { letter: LETTERS[question.correct] ?? '', answer: question.answers[question.correct] ?? '', out: next.lastOut, alive: next.alive }),
        effects: [next.lastOut ? { kind: 'wrong', text: `💥 −${next.lastOut}` } : { kind: 'correct', text: t('✅ Không ai bị loại') }]
      };
    }
    if (state.stage !== 'reveal') return null;
    // Nobody left, a single survivor of a real crowd, or no more questions: the round is over.
    if (state.alive === 0 || (state.alive === 1 && state.joined > 1)) return null;
    const next = nextQuestion(state, ctx.now, state.items[state.index + 1]?.answers.length);
    return next ? { consumed: false, state: next, endsAt: ctx.now + config.seconds * 1000, message: '' } : null;
  },

  finish(state, config) {
    let closed = state;
    const awards: PointAward[] = [];
    if (state.stage === 'ask') {
      const { scored, commit, next } = closeQuestion(state, config);
      commit();
      awards.push(...scored.awards);
      closed = next;
    }
    const winners = survivors(closed);
    for (const winner of winners) {
      awards.push({ ...winner, points: config.winPoints });
      closed.totals.add(winner.user, winner.nickname, config.winPoints);
    }
    const done: GoldenBellRound = { ...closed, stage: 'done' };
    const names = winners.slice(0, 3).map((winner) => winner.nickname).join(', ');
    return {
      state: done,
      awards,
      message: winners.length
        ? winners.length === 1
          ? t('🔔 {names} rung chuông vàng! (+{points})', { names, points: config.winPoints })
          : t('🔔 {count} người trụ lại: {names} (+{points})', { count: winners.length, names: `${names}${winners.length > 3 ? '…' : ''}`, points: config.winPoints })
        : t('🔔 Không ai trụ lại đến cuối!'),
      effects: [winners[0]
        ? podiumEffect(winners.map((winner) => done.totals.get(winner.user) ?? { ...winner, points: 0 }).sort((a, b) => b.points - a.points), t('🔔 Rung chuông vàng!'))
        : { kind: 'lose', text: t('Không ai trụ lại') }]
    };
  },

  testActions(state) {
    if (state.stage !== 'ask') return [];
    const question = current(state);
    return [
      ...question.answers.map((_, index) => chatTest(LETTERS[index] ?? 'A', LETTERS[index] ?? 'A')),
      chatTest(t('Trả lời đúng ({letter})', { letter: LETTERS[question.correct] ?? 'A' }), LETTERS[question.correct] ?? 'A', 2)
    ];
  },

  view(state) {
    if (state.stage === 'done') {
      const winners = survivors(state);
      return view({
        headline: winners.length ? t('🔔 {count} người trụ lại', { count: winners.length }) : t('🔔 Không ai trụ lại'),
        hint: t('{count} câu • {players} người tham gia', { count: state.index + 1, players: state.joined.toLocaleString(numberLocale()) }),
        rows: winners.length ? rankingRows(winners.map((winner) => state.totals.get(winner.user) ?? { ...winner, points: 0 }).sort((a, b) => b.points - a.points).slice(0, 5)) : rankingRows(state.totals.top(5))
      });
    }
    const question = current(state);
    const revealed = state.stage === 'reveal';
    const { counts, total } = state.book;
    const status = state.index === 0
      ? t('Ai cũng tham gia được')
      : t('🔔 Còn {alive}/{joined} người', { alive: state.alive.toLocaleString(numberLocale()), joined: state.joined.toLocaleString(numberLocale()) });
    return view({
      style: { rows: 'quiz' },
      headline: question.question,
      hint: revealed
        ? `${progressLabel(state)} • ${resultHint(state.last)} • ${t('💥 {out} bị loại', { out: state.lastOut })}`
        : `${progressLabel(state)} • ${status} • ${t('Sai là bị loại!')} • ${t('{total} đã trả lời', { total: total.toLocaleString(numberLocale()) })}`,
      rows: question.answers.map((answer, index) => ({
        badge: LETTERS[index],
        label: answer,
        value: revealed ? String(counts[index] ?? 0) : undefined,
        percent: revealed ? percentOf(counts[index] ?? 0, total) : undefined,
        highlight: revealed && index === question.correct
      }))
    });
  }
};
