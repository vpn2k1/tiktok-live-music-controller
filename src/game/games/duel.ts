import { t } from '../../shared/i18n';
import { podiumOf } from '../series';
import type { EffectInput, PointAward } from '../engine';
import { isBangCommand } from '../teamRoster';
import { chatTest, view, type GameDefinition, type HandleResult } from '../types';

/**
 * Đấu súng miền Tây: 1-vs-1 reaction duels. Viewers queue with `!join`; two at a
 * time face off, and after a random wait the overlay shows "BẮN!": the first of
 * the two to comment `!ban` wins, shooting before the signal loses. The winner
 * stays on for the next challenger.
 */
export interface Duelist {
  user: string;
  nickname: string;
}

type Phase = 'wait' | 'ready' | 'draw' | 'result';

export interface DuelRound {
  phase: Phase;
  queue: Duelist[];
  /** Current duel (a = the champion who stayed on, when there is one). */
  a: Duelist | null;
  b: Duelist | null;
  /** When "BẮN!" shows (ready) / when the phase ends (draw, result). */
  drawAt: number;
  phaseEndsAt: number;
  winner: Duelist | null;
  loser: Duelist | null;
  reason: 'fast' | 'early' | 'slow' | null;
  reactionMs: number | null;
  /** Wins in a row of the champion. */
  streak: number;
  /** Per viewer: duels won and best reaction. Mutable, written in `commit`. */
  wins: Map<string, { nickname: string; wins: number; best: number | null }>;
  duels: number;
  /** The round is over (final summary). */
  over?: boolean;
}

type DuelConfig = { seconds: number; minWait: number; maxWait: number; winPoints: number };

const JOIN_NAMES = ['join', 'vao'];
const SHOOT_NAMES = ['ban', 'bang', 'fire', 'shoot'];
const MAX_QUEUE = 50;
/** Time to shoot once "BẮN!" shows. */
const DRAW_WINDOW_MS = 4000;
const RESULT_MS = 3000;
const STREAK_BONUS = 5;
const FASTEST_BONUS = 15;

function inDuel(state: DuelRound, user: string): boolean {
  return state.a?.user === user || state.b?.user === user;
}

/** Ends the duel: the winner gets points and stays on as champion. */
function resolve(state: DuelRound, winner: Duelist | null, loser: Duelist | null, reason: 'fast' | 'early' | 'slow', now: number, reactionMs: number | null, config: DuelConfig): HandleResult<DuelRound> {
  const streak = winner && state.a?.user === winner.user ? state.streak + 1 : winner ? 1 : 0;
  const wins = state.wins;
  const awards: PointAward[] = winner ? [{ user: winner.user, nickname: winner.nickname, points: config.winPoints + (streak - 1) * STREAK_BONUS }] : [];
  const effects: EffectInput[] = winner
    ? [{ kind: 'correct', text: reason === 'fast' && reactionMs != null ? `🤠 ${reactionMs} ms` : '🤠', user: winner.nickname }]
    : [{ kind: 'wrong', text: t('😴 Không ai bắn!') }];
  return {
    consumed: reason !== 'slow',
    state: { ...state, phase: 'result', phaseEndsAt: now + RESULT_MS, winner, loser, reason, reactionMs, streak, duels: state.duels + 1 },
    awards,
    effects,
    message: winner
      ? reason === 'early'
        ? t('💥 {loser} bắn sớm! {winner} thắng', { loser: loser?.nickname ?? '', winner: winner.nickname })
        : t('🤠 {winner} hạ {loser} ({ms} ms)', { winner: winner.nickname, loser: loser?.nickname ?? '', ms: reactionMs ?? 0 })
      : t('😴 Không ai bắn!'),
    commit: () => {
      if (!winner) return;
      const entry = wins.get(winner.user);
      const best = reason === 'fast' && reactionMs != null ? Math.min(entry?.best ?? Infinity, reactionMs) : entry?.best ?? null;
      wins.set(winner.user, { nickname: winner.nickname, wins: (entry?.wins ?? 0) + 1, best: Number.isFinite(best) ? best : null });
    }
  };
}

/** Top winners (fewest entries: only viewers who won a duel). */
export function duelRanking(state: DuelRound, limit = 5) {
  return [...state.wins.entries()]
    .map(([user, entry]) => ({ user, ...entry }))
    .sort((a, b) => b.wins - a.wins || (a.best ?? Infinity) - (b.best ?? Infinity) || a.user.localeCompare(b.user))
    .slice(0, limit);
}

export const duelGame: GameDefinition<DuelRound, DuelConfig> = {
  id: 'dauSung',
  title: 'Đấu súng miền Tây 🤠',
  category: 'versus',
  accent: '#d97706',
  aliases: ['dausung', 'duel', 'cowboy'],
  howTo: 'Gõ !join để vào hàng chờ đấu súng. Mỗi lượt 2 người đối đầu: chờ đến khi màn hình hiện "BẮN!" rồi gõ !ban thật nhanh, ai bắn trước người đó thắng. Bắn trước hiệu lệnh là thua ngay. Người thắng ở lại đấu tiếp, thắng liên tiếp được thưởng thêm.',
  commands: [
    { usage: '!join', description: 'Vào hàng chờ đấu súng' },
    { usage: '!ban', description: 'Bắn khi thấy "BẮN!" (bắn sớm là thua)' }
  ],
  defaultConfig: { seconds: 180, minWait: 2, maxWait: 5, winPoints: 20 },
  settings: [
    { key: 'seconds', label: 'Thời gian (giây)', type: 'number', min: 30, max: 1800 },
    { key: 'minWait', label: 'Chờ hiệu lệnh ít nhất (giây)', type: 'number', min: 1, max: 20 },
    { key: 'maxWait', label: 'Chờ hiệu lệnh nhiều nhất (giây)', type: 'number', min: 1, max: 30 },
    { key: 'winPoints', label: 'Điểm mỗi trận thắng', type: 'number', min: 1, max: 1000 }
  ],

  start(config) {
    return {
      state: {
        phase: 'wait', queue: [], a: null, b: null, drawAt: 0, phaseEndsAt: 0,
        winner: null, loser: null, reason: null, reactionMs: null, streak: 0, wins: new Map(), duels: 0
      },
      durationMs: config.seconds * 1000
    };
  },

  handle(state, input, config, ctx) {
    if (input.kind !== 'chat') return null;
    const now = ctx.now;
    const me: Duelist = { user: input.user, nickname: input.nickname };

    if (isBangCommand(input.text, JOIN_NAMES)) {
      if (inDuel(state, input.user) || state.queue.some((d) => d.user === input.user)) return { state, consumed: true };
      if (state.queue.length >= MAX_QUEUE) return { state, consumed: true, message: t('Hàng chờ đã đầy ({n} người)', { n: MAX_QUEUE }) };
      const queue = [...state.queue, me];
      return { consumed: true, state: { ...state, queue }, message: t('{name} vào hàng chờ (#{n})', { name: input.nickname, n: queue.length }) };
    }

    if (!isBangCommand(input.text, SHOOT_NAMES)) return null;
    if (!inDuel(state, input.user) || (state.phase !== 'ready' && state.phase !== 'draw')) return { state, consumed: true };
    const opponent = (state.a?.user === input.user ? state.b : state.a) as Duelist;
    // Judged on the signal time, not the phase: tick switches phases only ~4×/s.
    if (now < state.drawAt) return resolve(state, opponent, me, 'early', now, null, config);
    return resolve(state, me, opponent, 'fast', now, Math.max(0, Math.round(now - state.drawAt)), config);
  },

  tick(state, config, ctx) {
    const now = ctx.now;
    if (state.phase === 'wait') {
      const [first, second] = state.queue;
      const a = state.a ?? first ?? null;
      const b = state.a ? first ?? null : second ?? null;
      if (!a || !b) return null;
      const queue = state.queue.slice(state.a ? 1 : 2);
      const low = Math.min(config.minWait, config.maxWait);
      const high = Math.max(config.minWait, config.maxWait);
      const drawAt = now + (low + ctx.random() * (high - low)) * 1000;
      return {
        consumed: false,
        state: { ...state, phase: 'ready', queue, a, b, drawAt, phaseEndsAt: drawAt, winner: null, loser: null, reason: null, reactionMs: null },
        message: t('🤠 {a} ⚔️ {b}: chuẩn bị…', { a: a.nickname, b: b.nickname })
      };
    }
    if (state.phase === 'ready' && now >= state.drawAt) {
      return { consumed: false, state: { ...state, phase: 'draw', phaseEndsAt: state.drawAt + DRAW_WINDOW_MS }, effects: [{ kind: 'start', text: t('🔥 BẮN!') }] };
    }
    if (state.phase === 'draw' && now >= state.phaseEndsAt) {
      // Nobody shot in time: both are out, no champion.
      return { ...resolve(state, null, null, 'slow', now, null, config), consumed: false };
    }
    if (state.phase === 'result' && now >= state.phaseEndsAt) {
      // The winner stays on as champion; the loser leaves.
      return { consumed: false, state: { ...state, phase: 'wait', a: state.winner, b: null, streak: state.winner ? state.streak : 0 } };
    }
    return null;
  },

  finish(state) {
    const ranking = duelRanking(state, 3);
    const fastest = [...state.wins.entries()]
      .filter(([, entry]) => entry.best != null)
      .sort(([, a], [, b]) => (a.best ?? 0) - (b.best ?? 0))[0];
    const awards: PointAward[] = fastest ? [{ user: fastest[0], nickname: fastest[1].nickname, points: FASTEST_BONUS }] : [];
    const top = ranking[0];
    return {
      state: { ...state, phase: 'result', a: null, b: null, over: true },
      awards,
      message: top
        ? t('🤠 {name} thắng nhiều nhất: {n} trận • Nhanh nhất: {fast} ({ms} ms)', {
          name: top.nickname,
          n: top.wins,
          fast: fastest?.[1].nickname ?? top.nickname,
          ms: fastest?.[1].best ?? 0
        })
        : t('Chưa có trận đấu nào.'),
      effects: [top
        ? podiumOf(ranking.map((entry) => ({ nickname: entry.nickname, value: t('{n} trận thắng', { n: entry.wins }) })), t('🤠 Tay súng nhanh nhất'))
        : { kind: 'lose', text: t('Chưa có trận đấu nào.') }]
    };
  },

  testActions() {
    return [chatTest('!join', '!join', 2), chatTest('!ban', '!ban', 2)];
  },

  view(state) {
    const vs = state.a && state.b ? `${state.a.nickname} ⚔️ ${state.b.nickname}` : null;
    const duelRows = [state.a, state.b].flatMap((d, index) => (d ? [{
      badge: index === 0 && state.streak > 0 ? `🔥${state.streak}` : '🤠',
      avatar: d.nickname,
      label: d.nickname,
      highlight: state.phase === 'result' && state.winner?.user === d.user
    }] : []));
    if (state.phase === 'ready') {
      return view({ headline: vs, hint: t('✋ Chờ hiệu lệnh… bắn sớm là THUA!'), rows: duelRows });
    }
    if (state.phase === 'draw') {
      return view({ headline: t('🔥 BẮN!'), hint: t('{vs}: gõ !ban ngay!', { vs: vs ?? '' }), rows: duelRows });
    }
    const ranking = duelRanking(state).map((entry, index) => ({
      badge: String(index + 1),
      avatar: entry.nickname,
      label: entry.nickname,
      value: entry.best != null ? t('{n} thắng · {ms} ms', { n: entry.wins, ms: entry.best }) : t('{n} thắng', { n: entry.wins })
    }));
    if (state.over) {
      return view({ headline: t('🏁 Tổng kết'), hint: t('{n} trận đấu', { n: state.duels }), rows: ranking });
    }
    if (state.phase === 'result') {
      const headline = state.winner ? t('🏆 {name} thắng!', { name: state.winner.nickname }) : t('😴 Không ai bắn!');
      const hint = state.reason === 'early'
        ? t('💥 {name} bắn sớm!', { name: state.loser?.nickname ?? '' })
        : state.reason === 'fast'
          ? t('⚡ Phản xạ {ms} ms', { ms: state.reactionMs ?? 0 })
          : t('Không ai bắn trong {s} giây', { s: DRAW_WINDOW_MS / 1000 });
      return view({ headline, hint, rows: ranking });
    }
    return view({
      headline: state.a ? t('🤠 {name} chờ đối thủ', { name: state.a.nickname }) : '🤠 🔫 🤠',
      hint: t('Gõ !join để vào hàng chờ • {n} người đang chờ', { n: state.queue.length }),
      rows: ranking.length ? ranking : state.queue.slice(0, 5).map((d, index) => ({ badge: `#${index + 1}`, avatar: d.nickname, label: d.nickname }))
    });
  }
};
