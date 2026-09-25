import { t } from '../shared/i18n';
import type { OverlayRow, ScoreEntry } from '../shared/types';
import type { EffectInput, PointAward } from './engine';
import { Scoreboard } from './scoreboard';
import { pickUnasked } from './types';

/**
 * Question series for answer games: a round is N questions; each question is
 * timed, answers score by speed, the answer is revealed for a few seconds and
 * the next question starts. Totals for the round give the final ranking; points
 * also go to the session leaderboard as each question closes.
 *
 * Per-question answers live in an `AnswerBook` (a mutable, append-only map):
 * copying an object of 100,000 answers on every answer is quadratic. Games only
 * write to it inside `commit`, which the controller runs when it applies a
 * result, so a rate-limited (dropped) answer never touches it.
 */

export interface Answer {
  user: string;
  nickname: string;
  /** Time from question start to the answer. */
  ms: number;
  correct: boolean;
  /** Option index for A–D questions. */
  choice?: number;
}

/** Fastest correct answers kept for the overlay. */
const FASTEST_KEPT = 5;

export class AnswerBook {
  private byUser = new Map<string, Answer>();
  /** Answer counts per option (A–D questions). */
  readonly counts: number[];
  correct = 0;
  /** Correct answers in arrival order = fastest first. */
  readonly fastest: Answer[] = [];

  constructor(options = 0) {
    this.counts = Array.from({ length: options }, () => 0);
  }

  get total(): number {
    return this.byUser.size;
  }

  has(user: string): boolean {
    return this.byUser.has(user);
  }

  add(answer: Answer): void {
    if (this.byUser.has(answer.user)) return;
    this.byUser.set(answer.user, answer);
    if (answer.choice != null && answer.choice < this.counts.length) this.counts[answer.choice] = (this.counts[answer.choice] ?? 0) + 1;
    if (answer.correct) {
      this.correct += 1;
      if (this.fastest.length < FASTEST_KEPT) this.fastest.push(answer);
    }
  }

  *correctAnswers(): Generator<Answer> {
    for (const answer of this.byUser.values()) if (answer.correct) yield answer;
  }

  *answers(): Generator<Answer> {
    yield* this.byUser.values();
  }
}

export type SeriesStage = 'ask' | 'reveal' | 'done';

export interface QuestionResult {
  correct: number;
  total: number;
  fastest: { nickname: string; ms: number; points: number }[];
}

export interface SeriesState<Q> {
  items: Q[];
  index: number;
  stage: SeriesStage;
  askedAt: number;
  book: AnswerBook;
  /** Points per viewer in this round (mutable, like the session leaderboard). */
  totals: Scoreboard;
  /** Result of the question being revealed. */
  last: QuestionResult | null;
  /** Bank indices used recently, so the next round asks new questions. */
  asked: number[];
}

export type SeriesConfig = {
  count: number;
  seconds: number;
  maxPoints: number;
  reveal: number;
  /** `random`, or `file`: questions in bank order, each round continuing where the last stopped. */
  order: string;
};

/** Settings every series game shares (merged into its own settings list). */
export const SERIES_SETTINGS = [
  { key: 'count', label: 'Số câu mỗi lượt', type: 'number' as const, min: 1, max: 100 },
  { key: 'seconds', label: 'Giây mỗi câu', type: 'number' as const, min: 5, max: 300 },
  { key: 'maxPoints', label: 'Điểm tối đa mỗi câu', type: 'number' as const, min: 10, max: 10_000, hint: 'Trả lời ngay = điểm tối đa, sát hết giờ = một nửa.' },
  { key: 'reveal', label: 'Giây xem đáp án', type: 'number' as const, min: 2, max: 20 },
  {
    key: 'order',
    label: 'Thứ tự câu hỏi',
    type: 'select' as const,
    options: [
      { value: 'random', label: 'Ngẫu nhiên (không lặp đến khi hết)' },
      { value: 'file', label: 'Đúng thứ tự trong ngân hàng / file' }
    ]
  }
];

export const SERIES_DEFAULTS = { maxPoints: 100, reveal: 4, order: 'random' };

/**
 * Speed score: full points for an instant answer, falling linearly to half at
 * the deadline (Kahoot-style), never below 1.
 */
export function speedPoints(maxPoints: number, ms: number, durationMs: number): number {
  const late = durationMs > 0 ? Math.min(1, Math.max(0, ms / durationMs)) : 1;
  return Math.max(1, Math.round(maxPoints * (1 - late / 2)));
}

/**
 * Picks up to `count` different bank indices: random ones not asked recently,
 * or (order "file") the next ones in bank order after the previous round's last.
 */
export function pickSet(bankSize: number, count: number, previous: number[], random: () => number, order = 'random'): { indices: number[]; asked: number[] } {
  const wanted = Math.min(Math.max(1, count), bankSize);
  if (order === 'file') {
    const last = previous[previous.length - 1];
    const start = last != null && last + 1 < bankSize ? last + 1 : 0;
    const indices = Array.from({ length: wanted }, (_, i) => (start + i) % bankSize);
    return { indices, asked: indices };
  }
  let asked = previous;
  const indices: number[] = [];
  while (indices.length < wanted) {
    const pick = pickUnasked(bankSize, asked, random);
    asked = pick.asked;
    // A history reset can offer an index already in this set; skip it.
    if (!indices.includes(pick.index)) indices.push(pick.index);
  }
  return { indices, asked };
}

export function startSeries<Q>(items: Q[], asked: number[], now: number, options = 0): SeriesState<Q> {
  return { items, index: 0, stage: 'ask', askedAt: now, book: new AnswerBook(options), totals: new Scoreboard(), last: null, asked };
}

export function current<Q>(state: SeriesState<Q>): Q {
  return state.items[state.index] as Q;
}

/**
 * Scores the current question. Returns the awards and a `commit` that records
 * them in the round totals (run once, when the result is applied).
 */
export function scoreQuestion<Q>(state: SeriesState<Q>, config: SeriesConfig): { result: QuestionResult; awards: PointAward[]; commit: () => void } {
  const durationMs = config.seconds * 1000;
  const awards: PointAward[] = [];
  for (const answer of state.book.correctAnswers()) {
    awards.push({ user: answer.user, nickname: answer.nickname, points: speedPoints(config.maxPoints, answer.ms, durationMs) });
  }
  const fastest = state.book.fastest.map((answer) => ({ nickname: answer.nickname, ms: answer.ms, points: speedPoints(config.maxPoints, answer.ms, durationMs) }));
  return {
    result: { correct: state.book.correct, total: state.book.total, fastest },
    awards,
    commit: () => {
      for (const award of awards) state.totals.add(award.user, award.nickname, award.points);
    }
  };
}

/** `commit` that adds custom awards (games that score without "correct") to the round totals. */
export function commitTotals<Q>(state: SeriesState<Q>, awards: PointAward[]): () => void {
  return () => {
    for (const award of awards) state.totals.add(award.user, award.nickname, award.points);
  };
}

/**
 * Big end-of-round "congratulations": the top 3 on a podium with their names,
 * avatars and points (one entry = the winner alone in the spotlight).
 */
export function podiumEffect(top: { nickname: string; points: number }[], text: string): EffectInput {
  return podiumOf(top.map((entry) => ({ nickname: entry.nickname, value: pointsText(entry.points) })), text);
}

/** Podium with game-specific values ("12 wins", "45 s"…), best first. */
export function podiumOf(top: { nickname: string; value?: string }[], text: string): EffectInput {
  const podium = top.slice(0, 3).map((entry) => ({ name: entry.nickname, value: entry.value }));
  return { kind: 'win', text, user: podium[0]?.name, podium };
}

/** The winner alone in the spotlight (race winner, last survivor…). */
export function winnerEffect(nickname: string, text: string, value?: string): EffectInput {
  return { kind: 'win', text, user: nickname, podium: [{ name: nickname, value }] };
}

/** Podium of the round's top 3, or "round over" when nobody scored. */
export function roundEndEffect<Q>(state: SeriesState<Q>): EffectInput {
  const top = state.totals.top(3);
  return top.length
    ? podiumEffect(top, t('🏁 Tổng kết {asked} câu', { asked: state.index + 1 }))
    : { kind: 'lose', text: t('Hết lượt') };
}

/** Round-end result shared by series games: final ranking message + podium effect. */
export function seriesFinish<S extends SeriesState<unknown>>(state: S, awards: PointAward[], prefix = ''): { state: S; awards: PointAward[]; message: string; effects: EffectInput[] } {
  const done = { ...state, stage: 'done' as const };
  return {
    state: done,
    awards,
    message: `${prefix}${finalMessage(done)}`,
    effects: [roundEndEffect(done)]
  };
}

/** Moves from the revealed question to the next one (keeping game-specific fields); null when the round is over. */
export function nextQuestion<S extends SeriesState<unknown>>(state: S, now: number, options = 0): S | null {
  if (state.index + 1 >= state.items.length) return null;
  return { ...state, index: state.index + 1, stage: 'ask', askedAt: now, book: new AnswerBook(options), last: null };
}

export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function progressLabel<Q>(state: SeriesState<Q>): string {
  return t('Câu {n}/{total}', { n: state.index + 1, total: state.items.length });
}

/** "⚡ A 1.2s • 12/30 đúng" line for the reveal. */
export function resultHint(result: QuestionResult | null): string {
  if (!result || !result.correct) return result?.total ? t('Chưa ai đúng ({total} người trả lời)', { total: result.total }) : t('Chưa ai trả lời');
  const first = result.fastest[0];
  return t('⚡ {nickname} {time} • {correct}/{total} người đúng', { nickname: first?.nickname ?? '', time: seconds(first?.ms ?? 0), correct: result.correct, total: result.total });
}

/** Fastest correct answers with their points (reveal rows). */
export function fastestRows(result: QuestionResult | null): OverlayRow[] {
  return (result?.fastest ?? []).map((entry, index) => ({
    badge: ['🥇', '🥈', '🥉'][index] ?? String(index + 1),
    label: entry.nickname,
    avatar: entry.nickname,
    value: `+${entry.points} · ${seconds(entry.ms)}`,
    highlight: index === 0
  }));
}

/** "540đ" / "540 pts". */
export function pointsText(points: number): string {
  return t('{points}đ', { points });
}

/** Final ranking rows for the end of the round. */
export function rankingRows(top: ScoreEntry[]): OverlayRow[] {
  return top.map((entry, index) => ({
    badge: ['🥇', '🥈', '🥉'][index] ?? String(index + 1),
    label: entry.nickname,
    avatar: entry.nickname,
    value: pointsText(entry.points),
    highlight: index === 0
  }));
}

/** "🏁 Tổng kết 10 câu: 🥇 A 540đ · 🥈 B 420đ · 🥉 C 380đ" */
export function finalMessage<Q>(state: SeriesState<Q>): string {
  const top = state.totals.top(3);
  const asked = state.index + 1;
  if (!top.length) return t('🏁 Hết {asked} câu. Chưa ai ghi điểm.', { asked });
  const ranking = top.map((entry, index) => `${['🥇', '🥈', '🥉'][index]} ${entry.nickname} ${pointsText(entry.points)}`).join(' · ');
  return t('🏁 Tổng kết {asked} câu: {ranking}', { asked, ranking });
}
