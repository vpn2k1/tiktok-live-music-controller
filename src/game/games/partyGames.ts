import { t } from '../../shared/i18n';
import type { Answer } from '../series';
import {
  answerPoints,
  answerSpeed,
  BASE_R,
  createArenaGame,
  FIELD_H,
  FIELD_W,
  ringSpots,
  settle,
  shuffled,
  type ArenaPlayer,
  type ArenaRound,
  type DuelPair,
  type Resolve
} from './arena';

/**
 * More "join, then knock out until one is left" games on the arena engine
 * (waiting room, question bank, podium): musical chairs, melting ice, a 1-v-1
 * bracket, hot potato bombs and a balloon shoot-out.
 */

const alivePlayers = (players: ArenaPlayer[]) => players.filter((player) => player.alive);

/**
 * Ball size for `count` players (these games don't grow balls): big when few
 * play, smaller in a crowd; `room` caps it (e.g. what fits around a ring).
 */
export function ballSize(count: number, room = Infinity, smallest = BASE_R * 0.8): number {
  return Math.max(smallest, Math.min(8, (36 / Math.sqrt(Math.max(1, count))), room));
}

/**
 * Largest ball radius on a ring of `count` spots at `share` of the field.
 * Spots are spread by angle on an ellipse, so they are closest where the
 * ellipse is flattest (spacing ≈ short half-axis × angle step).
 */
function ringRoom(count: number, share: number): number {
  const shortHalfAxis = (Math.min(FIELD_W, FIELD_H) / 2) * share;
  return (2 * Math.PI * shortHalfAxis) / Math.max(1, count) / 2.05;
}

/** Everyone still in gets `ballSize` for their number. */
function sized(players: ArenaPlayer[], room = Infinity, smallest?: number): ArenaPlayer[] {
  const r = ballSize(alivePlayers(players).length, room, smallest);
  return players.map((player) => (player.alive ? { ...player, r } : player));
}

/** Correct answers first (fastest first), then wrong answers (fastest first), then no answer. */
function answerOrder(players: ArenaPlayer[], all: Map<string, Answer>): ArenaPlayer[] {
  const rank = (player: ArenaPlayer) => {
    const answer = all.get(player.user);
    return answer ? (answer.correct ? 0 : 1) : 2;
  };
  return [...players].sort((a, b) => rank(a) - rank(b) || (all.get(a.user)?.ms ?? 0) - (all.get(b.user)?.ms ?? 0) || a.id - b.id);
}

function withPoints(player: ArenaPlayer, answer: Answer | undefined, config: Parameters<Resolve>[1]): ArenaPlayer {
  return answer?.correct ? { ...player, points: player.points + answerPoints(answer, config) } : player;
}

// ---- 🪑 Ghế âm nhạc ---------------------------------------------------------

/** Chairs for `alive` players: about a fifth fewer, at least one fewer. */
export function chairsFor(alive: number): number {
  return Math.max(1, alive - Math.max(1, Math.ceil(alive * 0.2)));
}

/** Players walk around the outside; the chairs stand in an inner ring. */
const OUTER_RING = 0.82;
/** The ring of chairs widens for a crowd, so up to 48 chairs fit. */
function chairRing(seats: number): number {
  return seats > 16 ? 0.62 : 0.5;
}
/** A big crowd of chairs needs smaller balls than the other games allow. */
const SMALLEST_SEATED = 2;

function walkAround(players: ArenaPlayer[]): ArenaPlayer[] {
  const alive = alivePlayers(players);
  const spots = ringSpots(alive.length, OUTER_RING);
  const spot = new Map(alive.map((player, index) => [player.id, spots[index]!]));
  // Sized to fit both rings: walking around, and seated on the (smaller) ring of chairs.
  const seats = chairsFor(alive.length);
  const room = Math.min(ringRoom(alive.length, OUTER_RING), ringRoom(seats, chairRing(seats)));
  return sized(players.map((player) => (spot.has(player.id) ? { ...player, ...spot.get(player.id), mark: null } : player)), room, SMALLEST_SEATED);
}

const resolveChairs: Resolve = (state, config, { all }) => {
  const alive = alivePlayers(state.players);
  const seats = chairsFor(alive.length);
  const order = answerOrder(alive, all);
  const chairs = ringSpots(seats, chairRing(seats));
  const seatOf = new Map(order.slice(0, seats).map((player, index) => [player.id, chairs[index]!]));
  return {
    players: state.players.map((player): ArenaPlayer => {
      if (!player.alive) return { ...player, mark: null };
      const answer = all.get(player.user);
      const chair = seatOf.get(player.id);
      if (chair) return { ...withPoints(player, answer, config), ...chair, mark: answer?.correct ? 'grew' : null };
      return { ...player, alive: false, outAt: state.number, mark: 'hit' };
    })
  };
};

export const musicalChairsGame = createArenaGame({
  id: 'gheAmNhac',
  title: 'Ghế âm nhạc 🪑',
  accent: '#f97316',
  aliases: ['ghe', 'gheamnhac', 'chairs'],
  howTo: 'Gõ !join hoặc !thamgia trong thời gian chờ để vào vòng. Mỗi câu hỏi có ít ghế hơn số người. Comment a, b, c hoặc d: ai đúng nhanh nhất giành ghế trước, rồi đến người trả lời sai, người im lặng xếp cuối. Ai không có ghế thì bị loại; người giành chiếc ghế cuối cùng thắng.',
  kind: 'chairs',
  resolve: resolveChairs,
  shrinks: false,
  minField: 1,
  answerHelp: 'Trả lời: đúng càng nhanh càng dễ giành ghế',
  extraSettings: [],
  defaults: { grow: 0, lives: 1, shrink: 0 },
  setup: (state) => ({ players: walkAround(state.players) }),
  onQuestion: (state) => ({ players: walkAround(state.players) }),
  props: (state) => {
    const alive = alivePlayers(state.players).length;
    const seats = state.stage === 'reveal' ? alive : chairsFor(alive);
    return ringSpots(seats, chairRing(seats)).map((spot) => ({ x: spot.x / FIELD_W, y: spot.y / FIELD_H, icon: '🪑' }));
  },
  askHint: (state) => {
    const alive = alivePlayers(state.players).length;
    return t('🪑 {chairs} ghế cho {n} người', { chairs: chairsFor(alive), n: alive });
  },
  outText: () => t('🪑 mất ghế'),
  revealHint: (correct, out) => (out ? t('✅ {correct} người đúng · 🪑 {out} người mất ghế', { correct, out }) : t('✅ {correct} người đúng', { correct })),
  winText: (name) => t('🪑 {name} giành chiếc ghế cuối cùng!', { name }),
  podiumValue: (player) => t('{points}đ', { points: player.points })
});

// ---- 🧊 Băng tan -------------------------------------------------------------

/** Ice floe size for `hp` percent. */
export function floeRadius(hp: number): number {
  return BASE_R * (0.7 + 0.9 * Math.max(0, Math.min(100, hp)) / 100);
}

/** Heat of question `number`: grows every question, so the last floe melts eventually. */
export function iceHeat(number: number): number {
  return 12 + 3 * Math.max(0, number - 1);
}

const resolveIce: Resolve = (state, config, { correct }, bounds) => {
  const heat = iceHeat(state.number);
  const players = state.players.map((player): ArenaPlayer => {
    if (!player.alive) return { ...player, mark: null };
    const answer = correct.get(player.user);
    // A fast correct answer barely melts the ice; wrong or silent melts it twice the heat.
    const melt = answer ? Math.round(heat * (0.15 + 0.6 * (1 - answerSpeed(answer, config)))) : heat * 2;
    const hp = Math.max(0, player.lives - melt);
    const next = { ...withPoints(player, answer, config), lives: hp, r: floeRadius(hp), mark: answer ? null : 'hit' as const };
    return hp > 0 ? next : { ...next, alive: false, outAt: state.number };
  });
  return { players: settle(players, bounds) };
};

export const meltingIceGame = createArenaGame({
  id: 'bangTan',
  title: 'Băng tan 🧊',
  accent: '#38bdf8',
  aliases: ['bangtan', 'ice'],
  howTo: 'Gõ !join hoặc !thamgia trong thời gian chờ để đứng lên một tảng băng. Trời nắng dần, băng tan mỗi câu. Comment a, b, c hoặc d: đúng nhanh thì băng gần như không tan, sai hoặc im lặng thì tan gấp đôi. Băng tan hết thì rơi xuống nước; người còn băng cuối cùng thắng.',
  kind: 'ice',
  resolve: resolveIce,
  shrinks: false,
  minField: 1,
  answerHelp: 'Trả lời: đúng nhanh = băng ít tan',
  extraSettings: [],
  defaults: { grow: 0, lives: 100, shrink: 0 },
  setup: (state) => ({ players: settle(state.players.map((player) => ({ ...player, lives: 100, r: floeRadius(100) })), state.bounds) }),
  value: (player) => `🧊 ${player.lives}%`,
  askHint: (state) => t('☀️ {temp}°C · đúng nhanh thì băng ít tan', { temp: 28 + 2 * state.number }),
  outText: () => t('💦 băng tan hết'),
  revealHint: (correct, out) => (out ? t('✅ {correct} người đúng · 💦 {out} người rơi xuống nước!', { correct, out }) : t('✅ {correct} người đúng · ☀️ băng tan dần…', { correct })),
  winText: (name) => t('🧊 {name} còn đứng trên tảng băng cuối cùng!', { name }),
  podiumValue: (player) => `🧊 ${player.lives}%`
});

// ---- 🥊 Võ đài 1-1 -----------------------------------------------------------

/** Pairs in order (a bye for an odd one out, who goes through). */
export function makePairs(ids: number[]): DuelPair[] {
  const pairs: DuelPair[] = [];
  for (let i = 0; i < ids.length; i += 2) {
    const a = ids[i]!;
    const b = ids[i + 1] ?? null;
    pairs.push({ a, b, winner: b == null ? a : null });
  }
  return pairs;
}

/** Pairs laid out in a grid, the two fighters of a pair side by side. */
function duelLayout(players: ArenaPlayer[], pairs: DuelPair[]): ArenaPlayer[] {
  const columns = Math.max(1, Math.ceil(Math.sqrt(pairs.length * 1.6)));
  const rows = Math.max(1, Math.ceil(pairs.length / columns));
  const cellW = FIELD_W / columns;
  const cellH = FIELD_H / rows;
  const spot = new Map<number, { x: number; y: number }>();
  pairs.forEach((pair, index) => {
    const cx = cellW * ((index % columns) + 0.5);
    const cy = cellH * (Math.floor(index / columns) + 0.5);
    const gap = Math.min(cellW * 0.28, BASE_R * 4);
    if (pair.b == null) spot.set(pair.a, { x: cx, y: cy });
    else {
      spot.set(pair.a, { x: cx - gap, y: cy });
      spot.set(pair.b, { x: cx + gap, y: cy });
    }
  });
  // Fighters as big as their cell allows (a small bracket gets big fighters).
  const r = Math.max(BASE_R * 0.8, Math.min(BASE_R * 2.2, cellW * 0.16, cellH * 0.28));
  return players.map((player) => (spot.has(player.id) ? { ...player, ...spot.get(player.id), r } : player));
}

function pairOf(state: ArenaRound, id: number): DuelPair | undefined {
  return state.pairs.find((pair) => pair.a === id || pair.b === id);
}

const resolveDuel: Resolve = (state, config, { correct }) => {
  const byId = new Map(state.players.map((player) => [player.id, player]));
  const losers = new Set<number>();
  const winners = new Set<number>();
  const pairs = state.pairs.map((pair): DuelPair => {
    if (pair.winner != null || pair.b == null) return pair;
    const a = correct.get(byId.get(pair.a)?.user ?? '');
    const b = correct.get(byId.get(pair.b)?.user ?? '');
    // Both right: the faster wins. Neither: they fight again next question.
    const winner = a && b ? (a.ms <= b.ms ? pair.a : pair.b) : a ? pair.a : b ? pair.b : null;
    if (winner == null) return pair;
    winners.add(winner);
    losers.add(winner === pair.a ? pair.b : pair.a);
    return { ...pair, winner };
  });
  let players = state.players.map((player): ArenaPlayer => {
    const answer = correct.get(player.user);
    const scored = pairOf(state, player.id) && answer ? withPoints(player, answer, config) : player;
    if (losers.has(player.id)) return { ...scored, alive: false, outAt: state.number, mark: 'hit' };
    return { ...scored, mark: winners.has(player.id) ? 'grew' : null };
  });
  // Every pair decided: the winners meet in the next round.
  if (pairs.every((pair) => pair.winner != null)) {
    const through = pairs.map((pair) => pair.winner!).filter((id) => players.find((player) => player.id === id)?.alive);
    if (through.length >= 2) {
      const next = makePairs(through);
      players = duelLayout(players, next);
      return { players, patch: { pairs: next, bracket: state.bracket + 1 } };
    }
  }
  return { players, patch: { pairs } };
};

export const duelBracketGame = createArenaGame({
  id: 'voDai',
  title: 'Võ đài loại trực tiếp 🥊',
  accent: '#dc2626',
  aliases: ['vodai', 'bracket', 'tournament'],
  howTo: 'Gõ !join hoặc !thamgia trong thời gian chờ để vào giải. Người chơi được chia cặp 1 đấu 1. Mỗi câu hỏi comment a, b, c hoặc d: trong mỗi cặp ai đúng nhanh hơn thì thắng và vào vòng sau; cả hai sai thì đấu lại câu sau. Thắng liên tiếp đến chung kết để vô địch.',
  kind: 'duel',
  resolve: resolveDuel,
  shrinks: false,
  minField: 1,
  answerHelp: 'Trả lời: đúng nhanh hơn đối thủ thì thắng cặp đấu',
  extraSettings: [],
  defaults: { grow: 0, lives: 1, shrink: 0 },
  setup: (state, _config, random) => {
    const pairs = makePairs(shuffled(alivePlayers(state.players).map((player) => player.id), random));
    return { pairs, bracket: 1, players: duelLayout(state.players, pairs) };
  },
  // Only fighters of an undecided pair answer; everyone else waits.
  canAnswer: (state, player) => {
    const pair = pairOf(state, player.id);
    return pair != null && pair.b != null && pair.winner == null;
  },
  badge: (player, state) => {
    const pair = pairOf(state, player.id);
    if (!player.alive || !pair) return undefined;
    if (pair.b == null) return '🎟️';
    return pair.winner === player.id && state.pairs.some((other) => other.winner == null) ? '✅' : undefined;
  },
  props: (state) => {
    const byId = new Map(state.players.map((player) => [player.id, player]));
    return state.pairs.flatMap((pair) => {
      const a = byId.get(pair.a);
      const b = pair.b == null ? undefined : byId.get(pair.b);
      if (!a || !b || pair.winner != null) return [];
      return [{ x: (a.x + b.x) / 2 / FIELD_W, y: (a.y + b.y) / 2 / FIELD_H, icon: '⚔️' }];
    });
  },
  askHint: (state) => {
    const open = state.pairs.filter((pair) => pair.b != null && pair.winner == null).length;
    return alivePlayers(state.players).length === 2 ? t('🥊 Chung kết!') : t('🥊 Vòng {round} · {open} cặp đang đấu', { round: state.bracket, open });
  },
  outText: () => t('🥊 bị hạ'),
  revealHint: (correct, out) => (out ? t('✅ {correct} người đúng · 🥊 {out} người bị hạ', { correct, out }) : t('🤝 Chưa phân thắng bại: đấu lại câu sau!')),
  winText: (name) => t('🥊 {name} vô địch võ đài!', { name }),
  podiumValue: (player) => t('{points}đ', { points: player.points })
});

// ---- 💣 Chuyền bom -----------------------------------------------------------

/** Bombs in play for `alive` players: one per four, at least one. */
export function bombsFor(alive: number): number {
  return alive >= 2 ? Math.max(1, Math.ceil(alive / 4)) : 0;
}

/** A new bomb explodes after 1–3 questions (the holder doesn't know when exactly). */
function newFuse(random: () => number): number {
  return 1 + Math.floor(random() * 3);
}

/** Hands out bombs until `bombsFor(alive)` are in play (to random players without one). */
function dealBombs(players: ArenaPlayer[], random: () => number): ArenaPlayer[] {
  const alive = alivePlayers(players);
  const missing = bombsFor(alive.length) - alive.filter((player) => player.fuse > 0).length;
  if (missing <= 0) return players;
  const takers = new Set(shuffled(alive.filter((player) => player.fuse === 0), random).slice(0, missing).map((player) => player.id));
  return players.map((player) => (takers.has(player.id) ? { ...player, fuse: newFuse(random) } : player));
}

const resolveBombs: Resolve = (state, config, { correct, all }, bounds, random) => {
  const players = state.players.map((player) => withPoints({ ...player, mark: null }, correct.get(player.user), config));
  const byId = new Map(players.map((player) => [player.id, player]));
  // Holders who answered correctly pass their bomb (fastest first) to whoever did worst: silent, then wrong, then the slowest.
  const holders = players.filter((player) => player.alive && player.fuse > 0 && correct.has(player.user))
    .sort((a, b) => (correct.get(a.user)?.ms ?? 0) - (correct.get(b.user)?.ms ?? 0));
  const candidates = [...answerOrder(players.filter((player) => player.alive && player.fuse === 0), all)].reverse();
  for (const holder of holders) {
    const target = candidates.shift();
    if (!target) break;
    const from = byId.get(holder.id)!;
    const to = byId.get(target.id)!;
    to.fuse = from.fuse;
    from.fuse = 0;
  }
  // The fuses burn; a bomb reaching zero explodes in its holder's hands.
  for (const player of players) {
    if (!player.alive || player.fuse <= 0) continue;
    player.fuse -= 1;
    if (player.fuse === 0) Object.assign(player, { alive: false, outAt: state.number, mark: 'hit' });
  }
  return { players: settle(dealBombs(players, random), bounds) };
};

export const hotPotatoGame = createArenaGame({
  id: 'chuyenBom',
  title: 'Chuyền bom 💣',
  accent: '#ef4444',
  aliases: ['chuyenbom', 'hotpotato'],
  howTo: 'Gõ !join hoặc !thamgia trong thời gian chờ để vào vòng. Vài người được phát bom, ngòi cháy trong 1–3 câu. Mỗi câu hỏi comment a, b, c hoặc d: người cầm bom trả lời đúng thì chuyền bom cho người im lặng hoặc sai (hoặc trả lời chậm nhất). Ngòi cháy hết thì bom nổ, người đang cầm bị loại. Người sống sót cuối cùng thắng.',
  kind: 'bomb',
  resolve: resolveBombs,
  shrinks: false,
  minField: 1,
  answerHelp: 'Trả lời: đang cầm bom thì trả lời đúng để chuyền đi',
  extraSettings: [],
  defaults: { grow: 0, lives: 1, shrink: 0, maxQuestions: 60 },
  setup: (state, _config, random) => {
    const alive = alivePlayers(state.players);
    const spots = ringSpots(alive.length, 0.75);
    const spot = new Map(alive.map((player, index) => [player.id, spots[index]!]));
    return { players: sized(dealBombs(state.players.map((player) => (spot.has(player.id) ? { ...player, ...spot.get(player.id) } : player)), random), ringRoom(alive.length, 0.75)) };
  },
  badge: (player) => (player.alive && player.fuse > 0 ? '💣' : undefined),
  value: (player) => (player.alive && player.fuse > 0 ? `⏱ ${player.fuse}` : undefined),
  askHint: (state) => t('💣 {bombs} quả bom · còn {n} người', { bombs: state.players.filter((player) => player.alive && player.fuse > 0).length, n: alivePlayers(state.players).length }),
  outText: () => t('💥 BÙM!'),
  revealHint: (correct, out) => (out ? t('✅ {correct} người đúng · 💥 {out} quả bom nổ!', { correct, out }) : t('✅ {correct} người đúng · 💣 bom được chuyền đi…', { correct })),
  winText: (name) => t('💣 {name} sống sót qua mọi quả bom!', { name }),
  podiumValue: (player) => t('{points}đ', { points: player.points })
});

// ---- 🏹 Bắn bóng bay ---------------------------------------------------------

const resolveBalloons: Resolve = (state, config, { correct }, bounds) => {
  const players = state.players.map((player) => withPoints({ ...player, mark: null }, correct.get(player.user), config));
  const hit = new Set<number>();
  // Fastest correct answer shoots first. Targets: players who missed first (most balloons first),
  // then the slowest correct answers — so speed and accuracy decide, not luck.
  const ms = (player: ArenaPlayer) => correct.get(player.user)?.ms ?? Infinity;
  const shooters = players.filter((player) => player.alive && correct.has(player.user)).sort((a, b) => ms(a) - ms(b) || a.id - b.id);
  for (const shooter of shooters) {
    if (!shooter.alive) continue;
    const target = players
      .filter((player) => player.alive && player.id !== shooter.id && !hit.has(player.id))
      .sort((a, b) => Number(correct.has(a.user)) - Number(correct.has(b.user)) || ms(b) - ms(a) || b.lives - a.lives || a.id - b.id)[0];
    if (!target) break;
    hit.add(target.id);
    target.lives -= 1;
    target.mark = 'hit';
    if (target.lives <= 0) Object.assign(target, { lives: 0, alive: false, outAt: state.number });
  }
  return { players: settle(players, bounds) };
};

export const balloonShootGame = createArenaGame({
  id: 'banBong',
  title: 'Bắn bóng bay 🏹',
  accent: '#8b5cf6',
  aliases: ['banbong', 'shoot', 'balloonshoot'],
  howTo: 'Gõ !join hoặc !thamgia trong thời gian chờ để nhận một chùm bóng bay. Mỗi câu hỏi comment a, b, c hoặc d: mỗi người đúng được bắn vỡ 1 quả bóng của đối thủ (ai đúng nhanh bắn trước; người sai hoặc im lặng bị nhắm trước, rồi đến người đúng nhưng chậm nhất). Hết bóng thì bị loại; xạ thủ cuối cùng thắng.',
  kind: 'balloons',
  resolve: resolveBalloons,
  shrinks: false,
  minField: 1,
  answerHelp: 'Trả lời: đúng thì được bắn 1 quả bóng của đối thủ',
  extraSettings: [{ key: 'lives', label: 'Số bóng bay mỗi người', type: 'number', min: 1, max: 10 }],
  defaults: { grow: 0, lives: 3, shrink: 0, maxQuestions: 40 },
  setup: (state) => ({ players: settle(sized(state.players), state.bounds) }),
  value: (player) => '🎈'.repeat(Math.max(0, player.lives)),
  askHint: (state) => t('🏹 còn {n} xạ thủ', { n: alivePlayers(state.players).length }),
  outText: () => t('🎈 hết bóng!'),
  revealHint: (correct, out) => (out ? t('🏹 {correct} phát bắn · {out} người hết bóng', { correct, out }) : t('🏹 {correct} phát bắn!', { correct })),
  winText: (name) => t('🏹 {name} là xạ thủ cuối cùng!', { name }),
  podiumValue: (player) => '🎈'.repeat(Math.max(0, player.lives)) || t('{points}đ', { points: player.points })
});
