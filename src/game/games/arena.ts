import { numberLocale, t } from '../../shared/i18n';
import type { OverlayArena } from '../../shared/types';
import { checkBankLines } from '../bankFile';
import type { EffectInput, PointAward } from '../engine';
import { AnswerBook, type Answer, podiumOf, speedPoints } from '../series';
import { chatTest, commandArgument, pickUnasked, view, type GameDefinition, type SettingField } from '../types';
import { parseQuestions, QUIZ_PRESETS, QUIZ_SAMPLE, quizBank, type QuizQuestion } from './quiz';

/**
 * Arena games: viewers join during a waiting time (`!join`, `!thamgia`), each
 * becomes a small ball with their avatar inside a rectangular field, then
 * A–D questions eliminate players until one is left.
 * - Đấu trường bóng: a correct answer grows the ball (faster = bigger); big
 *   balls push the others, and a small ball squeezed with no room left (by a
 *   bigger ball against a wall or other balls) is pushed out.
 * - Đảo sinh tồn: a wrong / missing answer costs a life; at 0 the player
 *   falls into the sea.
 * The field closes in each question, so a match always ends. Not enough
 * players: the waiting time is extended, then the round ends and the play
 * loop opens a new waiting room.
 */

/** Field size in arena units (16:10); the overlay draws it in percent. */
export const FIELD_W = 160;
export const FIELD_H = 100;
/** Radius of a new ball. */
export const BASE_R = 4.5;
/**
 * Largest ball: almost the full field height. Fixed (not the shrinking field),
 * so a ball never gets smaller — a giant in a small field shoves everyone out.
 */
export const MAX_R = FIELD_H * 0.45;
const LETTERS = ['A', 'B', 'C', 'D'];
/** `!join`, `!thamgia`, `!vao`, `!thamchien`. */
const JOIN_WORDS = ['join', 'thamgia', 'vao', 'thamchien'];
/** Times the waiting room is extended when there aren't enough players. */
export const MAX_WAITS = 2;
/** When the room is full, the match starts this soon. */
const FULL_START_MS = 3000;
/** The field closes in from this question on (early questions let balls grow first). */
const SHRINK_FROM = 3;
const MAX_POINTS = 100;
const FINISH_BONUS = [200, 100, 50];
/** Collision passes per question (enough to separate 60 balls). */
const SETTLE_PASSES = 60;
/**
 * Each question every ball drifts this share of the way to the centre, so the
 * crowd stays packed: big balls take the middle and squeeze small ones out
 * (instead of growing alone against a wall).
 */
export const CENTER_PULL = 0.12;

export interface ArenaPlayer {
  /** Join order: stable key for the overlay animation. */
  id: number;
  user: string;
  nickname: string;
  x: number;
  y: number;
  r: number;
  alive: boolean;
  /** Lives / hearts / balloons / ice (per game); 0 = out in games that use it. */
  lives: number;
  /** Chuyền bom: questions left on the fuse of the bomb this player holds (0 = no bomb). */
  fuse: number;
  /** Points earned in this match. */
  points: number;
  /** Question number when the player was knocked out (0 = still in). */
  outAt: number;
  /** What happened at the last reveal (for the overlay). */
  mark: 'grew' | 'hit' | null;
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ArenaRound {
  stage: 'join' | 'ask' | 'reveal' | 'done';
  players: ArenaPlayer[];
  nextId: number;
  /** Waiting-room extensions used. */
  waits: number;
  bank: QuizQuestion[];
  /** Bank indices asked (carried to the next match so it asks new questions). */
  asked: number[];
  question: QuizQuestion | null;
  /** 1-based question number (0 while waiting). */
  number: number;
  askedAt: number;
  /** Answers to the current question (mutated only in `commit`). */
  book: AnswerBook;
  bounds: Bounds;
  last: { correct: number; out: number } | null;
  winner: ArenaPlayer | null;
  /** Võ đài: the current bracket round's pairs (player ids; `b` null = a bye). */
  pairs: DuelPair[];
  /** Võ đài: bracket round number (1 = first round). */
  bracket: number;
}

export interface DuelPair {
  a: number;
  b: number | null;
  winner: number | null;
}

/** This question's answers: correct ones, and every answer (wrong ones too), by user. */
export interface ArenaAnswers {
  correct: Map<string, Answer>;
  all: Map<string, Answer>;
}

export type ArenaConfig = {
  preset: string;
  questions: string;
  joinSeconds: number;
  minPlayers: number;
  maxPlayers: number;
  seconds: number;
  reveal: number;
  grow: number;
  lives: number;
  shrink: number;
  maxQuestions: number;
};

const FULL_FIELD: Bounds = { left: 0, top: 0, right: FIELD_W, bottom: FIELD_H };

function letterChoice(text: string): number {
  return LETTERS.indexOf(text.trim().toUpperCase());
}

export function isJoinCommand(text: string): boolean {
  return text.trim().startsWith('!') && commandArgument(text, JOIN_WORDS) === '';
}

function inside(player: Pick<ArenaPlayer, 'x' | 'y'>, bounds: Bounds): boolean {
  return player.x >= bounds.left && player.x <= bounds.right && player.y >= bounds.top && player.y <= bounds.bottom;
}

/** The field after question `number` closes (`shrink` % of the full size per question, down to `min`). */
export function shrinkBounds(number: number, shrink: number, min: number): Bounds {
  const steps = Math.max(0, number - SHRINK_FROM + 1);
  const keep = Math.max(min, 1 - (steps * shrink) / 100);
  const dx = (FIELD_W * (1 - keep)) / 2;
  const dy = (FIELD_H * (1 - keep)) / 2;
  return { left: dx, top: dy, right: FIELD_W - dx, bottom: FIELD_H - dy };
}

/** A free spot for a new ball: the best of a few random tries (far from other balls and the walls). */
function spawnSpot(players: ArenaPlayer[], bounds: Bounds, random: () => number): { x: number; y: number } {
  const margin = BASE_R * 1.5;
  let best = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  let bestGap = -Infinity;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const x = bounds.left + margin + random() * Math.max(0, bounds.right - bounds.left - 2 * margin);
    const y = bounds.top + margin + random() * Math.max(0, bounds.bottom - bounds.top - 2 * margin);
    let gap = Infinity;
    for (const other of players) {
      if (other.alive) gap = Math.min(gap, Math.hypot(other.x - x, other.y - y) - other.r - BASE_R);
    }
    if (gap > bestGap) {
      bestGap = gap;
      best = { x, y };
    }
  }
  return best;
}

/** Keeps a ball inside the walls (a ball bigger than the field sits in its middle). */
function holdInside(ball: ArenaPlayer, bounds: Bounds): void {
  const rx = Math.min(ball.r, (bounds.right - bounds.left) / 2);
  const ry = Math.min(ball.r, (bounds.bottom - bounds.top) / 2);
  ball.x = Math.min(bounds.right - rx, Math.max(bounds.left + rx, ball.x));
  ball.y = Math.min(bounds.bottom - ry, Math.max(bounds.top + ry, ball.y));
}

/**
 * Pushes overlapping balls apart along the line between their centres; the
 * smaller ball moves more (by area), so big balls shove small ones away. The
 * walls are solid: closing walls push balls in. A small ball caught between a
 * big one and a wall (or other balls) stays squeezed — see `crush`.
 */
export function settle(players: ArenaPlayer[], bounds: Bounds, passes = SETTLE_PASSES): ArenaPlayer[] {
  const balls = players.map((player) => ({ ...player }));
  const live = balls.filter((ball) => ball.alive);
  for (const ball of live) holdInside(ball, bounds);
  for (let pass = 0; pass < passes; pass += 1) {
    let moved = false;
    for (let i = 0; i < live.length; i += 1) {
      for (let j = i + 1; j < live.length; j += 1) {
        const a = live[i]!;
        const b = live[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        const overlap = a.r + b.r - distance;
        if (overlap <= 0.01) continue;
        // Same spot: a fixed direction per pair, so the result doesn't depend on chance.
        const angle = (a.id * 2.399963 + b.id) % (Math.PI * 2);
        const nx = distance > 1e-6 ? dx / distance : Math.cos(angle);
        const ny = distance > 1e-6 ? dy / distance : Math.sin(angle);
        const massA = a.r * a.r;
        const massB = b.r * b.r;
        const shareA = massB / (massA + massB);
        a.x -= nx * overlap * shareA;
        a.y -= ny * overlap * shareA;
        b.x += nx * overlap * (1 - shareA);
        b.y += ny * overlap * (1 - shareA);
        moved = true;
      }
    }
    for (const ball of live) holdInside(ball, bounds);
    if (!moved) break;
  }
  return balls;
}

/** Stronger ball: bigger, then more points, then joined first. Only a stronger ball can push a weaker one out. */
function stronger(a: ArenaPlayer, b: ArenaPlayer): boolean {
  return a.r !== b.r ? a.r > b.r : a.points !== b.points ? a.points > b.points : a.id < b.id;
}

/** A ball overlapped by a stronger one by more than this share of its radius has no room left: it is pushed out. */
export const CRUSH_SHARE = 0.5;

/**
 * Pushes out (question `number`) every ball squeezed by a stronger one — it
 * found no room between that ball and the walls or other balls. Weakest
 * first, so a ball already out no longer squeezes anyone. The fallen are moved
 * past the nearest wall (their fall animation). Nobody left → the strongest stays.
 */
export function crush(players: ArenaPlayer[], bounds: Bounds, number: number): ArenaPlayer[] {
  const live = players.filter((player) => player.alive);
  const out = new Set<number>();
  const pusher = new Map<number, ArenaPlayer>();
  for (const ball of [...live].sort((a, b) => (stronger(a, b) ? 1 : -1))) {
    const by = live.find((other) => other !== ball && !out.has(other.id) && stronger(other, ball)
      && other.r + ball.r - Math.hypot(other.x - ball.x, other.y - ball.y) > CRUSH_SHARE * ball.r);
    if (!by) continue;
    out.add(ball.id);
    pusher.set(ball.id, by);
  }
  if (out.size === live.length) {
    const strongest = [...live].sort((a, b) => (stronger(a, b) ? -1 : 1))[0];
    if (strongest) out.delete(strongest.id);
  }
  return players.map((player) => {
    if (!out.has(player.id)) return player;
    // Shoved away from the ball that pushed it, just past the wall.
    const by = pusher.get(player.id);
    let dx = by ? player.x - by.x : player.x - FIELD_W / 2;
    let dy = by ? player.y - by.y : player.y - FIELD_H / 2;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const reach = Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top);
    let step = 0;
    while (step < reach * 2 && inside({ x: player.x + dx * step, y: player.y + dy * step }, bounds)) step += 2;
    return { ...player, alive: false, outAt: number, x: player.x + dx * (step + player.r), y: player.y + dy * (step + player.r) };
  });
}

/**
 * How the question's result changes the players (the part that differs
 * between arena games). May also change round fields (e.g. the duel bracket).
 */
export type Resolve = (
  state: ArenaRound,
  config: ArenaConfig,
  answers: ArenaAnswers,
  bounds: Bounds,
  random: () => number
) => { players: ArenaPlayer[]; patch?: Partial<ArenaRound> };

/** Đấu trường bóng: correct answers grow (faster = bigger), then balls push each other; a squeezed ball is out. */
const resolveBubbles: Resolve = (state, config, { correct }, bounds) => {
  const duration = config.seconds * 1000;
  const grown = state.players.map((player): ArenaPlayer => {
    const answer = correct.get(player.user);
    if (!player.alive || !answer) return { ...player, mark: null };
    const speed = 1 - Math.min(1, Math.max(0, answer.ms / duration));
    const growth = (config.grow / 100) * (1 / 3 + (2 / 3) * speed);
    return { ...player, r: Math.max(player.r, Math.min(MAX_R, player.r * (1 + growth))), points: player.points + speedPoints(MAX_POINTS, answer.ms, duration), mark: 'grew' };
  });
  const cx = FIELD_W / 2;
  const cy = FIELD_H / 2;
  const pulled = grown.map((player) => (player.alive ? { ...player, x: player.x + (cx - player.x) * CENTER_PULL, y: player.y + (cy - player.y) * CENTER_PULL } : player));
  // Squeezed balls go out; the rest relax into the space they left.
  return { players: settle(crush(settle(pulled, bounds), bounds, state.number), bounds) };
};

/** Đảo sinh tồn: no correct answer = −1 life (unless nobody got it); 0 lives = fall into the sea. The island shrinks, players huddle in. */
const resolveIsland: Resolve = (state, config, { correct }, bounds) => {
  const duration = config.seconds * 1000;
  const alive = state.players.filter((player) => player.alive);
  // Everyone missed: nobody is punished (otherwise the whole island could sink at once).
  const spared = alive.every((player) => !correct.has(player.user));
  const old = state.bounds;
  const cx = FIELD_W / 2;
  const cy = FIELD_H / 2;
  const sx = (bounds.right - bounds.left) / (old.right - old.left);
  const sy = (bounds.bottom - bounds.top) / (old.bottom - old.top);
  const next = state.players.map((player): ArenaPlayer => {
    if (!player.alive) return { ...player, mark: null };
    const moved = { ...player, x: cx + (player.x - cx) * sx, y: cy + (player.y - cy) * sy };
    const answer = correct.get(player.user);
    if (answer) return { ...moved, points: player.points + speedPoints(MAX_POINTS, answer.ms, duration), mark: null };
    if (spared) return { ...moved, mark: null };
    const lives = player.lives - 1;
    return lives > 0 ? { ...moved, lives, mark: 'hit' } : { ...moved, lives: 0, alive: false, outAt: state.number, mark: 'hit' };
  });
  return { players: settle(next, bounds) };
};

/**
 * Never leave the field empty: if a question knocked out everyone still in,
 * the best of them (by the ranking before it) stays.
 */
function keepOne(before: ArenaPlayer[], after: ArenaPlayer[]): ArenaPlayer[] {
  if (!before.some((player) => player.alive) || after.some((player) => player.alive)) return after;
  const best = arenaRanking(before.filter((player) => player.alive))[0];
  return after.map((player) => (player.id === best?.id ? { ...player, alive: true, outAt: 0, lives: Math.max(1, player.lives), fuse: 0 } : player));
}

/** Ranking: still in first, then who lasted longest, then lives, size and points. */
export function arenaRanking(players: ArenaPlayer[]): ArenaPlayer[] {
  return [...players].sort((a, b) => Number(b.alive) - Number(a.alive) || b.outAt - a.outAt || b.lives - a.lives || b.r - a.r || b.points - a.points || a.id - b.id);
}

/** Points for a correct answer, by speed (max 100). */
export function answerPoints(answer: Answer, config: ArenaConfig): number {
  return speedPoints(MAX_POINTS, answer.ms, config.seconds * 1000);
}

/** 0 (at the deadline) … 1 (instant) for an answer. */
export function answerSpeed(answer: Answer, config: ArenaConfig): number {
  return 1 - Math.min(1, Math.max(0, answer.ms / (config.seconds * 1000)));
}

/** Evenly spaced spots on an ellipse around the field centre (`share` of the half-sizes). */
export function ringSpots(count: number, share: number, turn = 0): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = turn + (i / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
    return { x: FIELD_W / 2 + Math.cos(angle) * (FIELD_W / 2) * share, y: FIELD_H / 2 + Math.sin(angle) * (FIELD_H / 2) * share };
  });
}

/** Deterministic shuffle with the game's random source. */
export function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

export function hearts(lives: number, max: number): string {
  return '❤️'.repeat(Math.max(0, lives)) + '🖤'.repeat(Math.max(0, max - lives));
}

export interface ArenaOptions {
  id: string;
  title: string;
  accent: string;
  aliases: string[];
  howTo: string;
  kind: OverlayArena['kind'];
  resolve: Resolve;
  /** The field closes in each question (default true); smallest field (share of the full size). */
  shrinks?: boolean;
  minField: number;
  answerHelp: string;
  /** Game-specific settings (ball growth / lives). */
  extraSettings: SettingField[];
  defaults: { grow: number; lives: number; shrink: number; maxQuestions?: number };
  /** Every question start: e.g. players walk back around the chairs. */
  onQuestion?: (state: ArenaRound, config: ArenaConfig) => Partial<ArenaRound>;
  /** Waiting room → first question: arrange the players, deal bombs, pair duels… */
  setup?: (state: ArenaRound, config: ArenaConfig, random: () => number) => Partial<ArenaRound>;
  /** Who may answer now (default: every player still in). */
  canAnswer?: (state: ArenaRound, player: ArenaPlayer) => boolean;
  /** Text under a ball (hearts, ice %, balloons…) and a small badge on it (💣, 🪑…). */
  value?: (player: ArenaPlayer, config: ArenaConfig) => string | undefined;
  badge?: (player: ArenaPlayer, state: ArenaRound) => string | undefined;
  /** Decorations on the field (chairs, crossed swords…). */
  props?: (state: ArenaRound, config: ArenaConfig) => NonNullable<OverlayArena['props']>;
  /** Extra hint while a question is asked ("🪑 9 chairs for 10 players"). */
  askHint?: (state: ArenaRound, config: ArenaConfig) => string;
  /** Popup over a knocked-out player. */
  outText: () => string;
  /** "✅ 5 correct: balls grow!" at the reveal. */
  revealHint: (correct: number, out: number) => string;
  /** Winner message. */
  winText: (name: string) => string;
  /** Podium value under each of the top 3. */
  podiumValue: (player: ArenaPlayer, config: ArenaConfig) => string;
}

export function createArenaGame(options: ArenaOptions): GameDefinition<ArenaRound, ArenaConfig> {
  const arenaView = (state: ArenaRound, config: ArenaConfig): OverlayArena => {
    const revealed = state.stage === 'reveal' || state.stage === 'done';
    // Players still in, plus the ones knocked out just now (they play their fall animation).
    const shown = state.players.filter((player) => player.alive || (revealed && player.outAt === state.number && state.number > 0));
    return {
      kind: options.kind,
      bounds: {
        left: state.bounds.left / FIELD_W,
        top: state.bounds.top / FIELD_H,
        right: state.bounds.right / FIELD_W,
        bottom: state.bounds.bottom / FIELD_H
      },
      // Biggest first: they get the profile pictures when the overlay has to pick.
      players: [...shown].sort((a, b) => b.r - a.r || a.id - b.id).map((player) => ({
        id: player.id,
        label: player.nickname,
        x: player.x / FIELD_W,
        y: player.y / FIELD_H,
        r: player.r / FIELD_W,
        state: !player.alive ? 'out' as const : revealed && player.mark ? player.mark : 'alive' as const,
        value: state.stage === 'join' ? undefined : options.value?.(player, config),
        badge: state.stage === 'join' ? undefined : options.badge?.(player, state)
      })),
      props: state.stage === 'join' ? undefined : options.props?.(state, config),
      emptyHint: t('Gõ !join hoặc !thamgia để vào sân!')
    };
  };

  const firstQuestion = (previous: ArenaRound, config: ArenaConfig, now: number, random: () => number) => {
    const state = { ...previous, ...options.onQuestion?.(previous, config) };
    const pick = pickUnasked(state.bank.length, state.asked, random);
    const question = state.bank[pick.index] as QuizQuestion;
    return {
      consumed: false,
      state: { ...state, stage: 'ask' as const, question, asked: pick.asked, number: state.number + 1, askedAt: now, book: new AnswerBook(question.answers.length), last: null },
      endsAt: now + config.seconds * 1000,
      message: ''
    };
  };

  return {
    id: options.id,
    title: options.title,
    category: 'versus',
    accent: options.accent,
    aliases: options.aliases,
    howTo: options.howTo,
    commands: [
      { usage: '!join / !thamgia', description: 'Vào sân (trong thời gian chờ)' },
      { usage: 'a / b / c / d', description: options.answerHelp }
    ],
    defaultConfig: {
      preset: 'vi',
      questions: '',
      joinSeconds: 40,
      minPlayers: 2,
      maxPlayers: 30,
      seconds: 12,
      reveal: 4,
      grow: options.defaults.grow,
      lives: options.defaults.lives,
      shrink: options.defaults.shrink,
      maxQuestions: options.defaults.maxQuestions ?? 30
    },
    settings: [
      {
        key: 'preset',
        label: 'Bộ câu hỏi có sẵn',
        type: 'select',
        options: Object.entries(QUIZ_PRESETS).map(([value, preset]) => ({ value, label: `${preset.label} · ${parseQuestions(preset.bank).length} câu` }))
      },
      { key: 'joinSeconds', label: 'Thời gian chờ người chơi (giây)', type: 'number', min: 15, max: 180, hint: 'Viewer gõ !join hoặc !thamgia trong lúc chờ. Chưa đủ người thì tự chờ thêm.' },
      { key: 'minPlayers', label: 'Số người tối thiểu', type: 'number', min: 2, max: 20 },
      { key: 'maxPlayers', label: 'Số người tối đa', type: 'number', min: 2, max: 60, hint: 'Đủ người thì bắt đầu ngay.' },
      { key: 'seconds', label: 'Giây mỗi câu', type: 'number', min: 5, max: 60 },
      { key: 'reveal', label: 'Giây xem đáp án', type: 'number', min: 2, max: 15 },
      ...options.extraSettings,
      ...(options.shrinks === false ? [] : [{ key: 'shrink', label: 'Sân thu hẹp mỗi câu (%)', type: 'number' as const, min: 0, max: 20, hint: 'Từ câu thứ 3, sân nhỏ dần để trận nào cũng kết thúc. 0 = không thu hẹp.' }]),
      { key: 'maxQuestions', label: 'Tối đa số câu mỗi trận', type: 'number', min: 5, max: 200, hint: 'Hết số câu mà còn nhiều người thì người mạnh nhất thắng. Câu hỏi không lặp lại giữa các trận cho đến khi dùng hết bộ.' },
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
      return {
        state: {
          stage: 'join',
          players: [],
          nextId: 1,
          waits: 0,
          bank,
          asked: ctx.previous?.asked ?? [],
          question: null,
          number: 0,
          askedAt: ctx.now,
          book: new AnswerBook(),
          bounds: FULL_FIELD,
          last: null,
          winner: null,
          pairs: [],
          bracket: 0
        },
        durationMs: config.joinSeconds * 1000,
        message: t('Gõ !join hoặc !thamgia để vào sân!')
      };
    },

    handle(state, input, config, ctx) {
      if (input.kind !== 'chat') return null;
      if (isJoinCommand(input.text)) {
        // Joining only while waiting; later it's just swallowed (no music rule, no spam).
        if (state.stage !== 'join' || state.players.some((player) => player.user === input.user)) return { state, consumed: true };
        if (state.players.length >= config.maxPlayers) return { state, consumed: true };
        const spot = spawnSpot(state.players, state.bounds, ctx.random);
        const player: ArenaPlayer = { id: state.nextId, user: input.user, nickname: input.nickname, ...spot, r: BASE_R, alive: true, lives: config.lives, fuse: 0, points: 0, outAt: 0, mark: null };
        const players = [...state.players, player];
        const full = players.length >= config.maxPlayers;
        return {
          consumed: true,
          state: { ...state, players, nextId: state.nextId + 1 },
          message: full ? t('Đủ {n} người! Bắt đầu ngay…', { n: players.length }) : t('{name} vào sân ({n} người)', { name: input.nickname, n: players.length }),
          effects: players.length <= 20 ? [{ kind: 'score', text: t('👋 vào sân'), user: input.nickname }] : undefined,
          endsAt: full ? ctx.now + FULL_START_MS : undefined
        };
      }
      if (state.stage !== 'ask' || !state.question) return null;
      const choice = letterChoice(input.text);
      if (choice < 0 || choice >= state.question.answers.length) return null;
      const player = state.players.find((item) => item.user === input.user);
      // Only players still on the field (and, in a duel, still fighting) answer; everyone else's letters stay normal chat.
      if (!player?.alive || (options.canAnswer && !options.canAnswer(state, player))) return null;
      if (state.book.has(input.user)) return { state, consumed: true };
      const answer: Answer = { user: input.user, nickname: input.nickname, ms: ctx.now - state.askedAt, correct: choice === state.question.correct, choice };
      return { consumed: true, state: { ...state }, commit: () => state.book.add(answer) };
    },

    advance(state, config, ctx) {
      if (state.stage === 'join') {
        if (state.players.length >= config.minPlayers) {
          const ready = { ...state, ...options.setup?.(state, config, ctx.random) };
          return firstQuestion(ready, config, ctx.now, ctx.random);
        }
        if (state.waits >= MAX_WAITS) return null;
        // Not enough players yet: wait a bit longer.
        return {
          consumed: false,
          state: { ...state, waits: state.waits + 1 },
          endsAt: ctx.now + Math.ceil(config.joinSeconds / 2) * 1000,
          message: t('Chờ thêm người chơi… cần ít nhất {min} người (đang có {n}). Gõ !join!', { min: config.minPlayers, n: state.players.length })
        };
      }
      if (state.stage === 'ask' && state.question) {
        const correct = new Map<string, Answer>();
        const all = new Map<string, Answer>();
        for (const answer of state.book.answers()) {
          all.set(answer.user, answer);
          if (answer.correct) correct.set(answer.user, answer);
        }
        const bounds = options.shrinks === false ? state.bounds : shrinkBounds(state.number, config.shrink, options.minField);
        const resolved = options.resolve(state, config, { correct, all }, bounds, ctx.random);
        const players = keepOne(state.players, resolved.players);
        const out = players.filter((player) => player.outAt === state.number && !player.alive).length;
        const awards: PointAward[] = [...correct.values()].map((answer) => ({ user: answer.user, nickname: answer.nickname, points: speedPoints(MAX_POINTS, answer.ms, config.seconds * 1000) }));
        const alive = players.filter((player) => player.alive);
        const letter = LETTERS[state.question.correct] ?? '';
        const effects: EffectInput[] = players
          .filter((player) => !player.alive && player.outAt === state.number)
          .slice(0, 4)
          .map((player) => ({ kind: 'hit' as const, text: options.outText(), user: player.nickname }));
        return {
          consumed: false,
          state: { ...state, ...resolved.patch, stage: 'reveal', players, bounds, last: { correct: correct.size, out }, winner: alive.length === 1 ? alive[0] ?? null : null },
          awards,
          finish: alive.length <= 1,
          endsAt: alive.length <= 1 ? undefined : ctx.now + config.reveal * 1000,
          message: t('Đáp án {letter}: {answer}', { letter, answer: state.question.answers[state.question.correct] ?? '' }),
          effects: effects.length ? effects : [{ kind: correct.size ? 'correct' : 'wrong', text: `✅ ${letter}` }]
        };
      }
      if (state.stage !== 'reveal' || state.number >= config.maxQuestions) return null;
      return firstQuestion(state, config, ctx.now, ctx.random);
    },

    finish(state, config) {
      const started = state.number > 0;
      const done: ArenaRound = { ...state, stage: 'done' };
      if (!started) {
        const message = t('Chưa đủ người chơi ({n}/{min}). Trận mới sẽ mở để mọi người tham gia!', { n: state.players.length, min: config.minPlayers });
        return { state: done, awards: [], message, effects: [{ kind: 'lose', text: message }] };
      }
      const ranking = arenaRanking(state.players);
      const winner = ranking[0] ?? null;
      const top = ranking.slice(0, FINISH_BONUS.length);
      const awards: PointAward[] = top.map((player, index) => ({ user: player.user, nickname: player.nickname, points: FINISH_BONUS[index] ?? 0 }));
      if (!winner) return { state: done, awards, message: t('Không còn ai trên sân.'), effects: [{ kind: 'lose', text: t('Không còn ai trên sân.') }] };
      const message = options.winText(winner.nickname);
      return {
        state: { ...done, winner },
        awards,
        message,
        effects: [podiumOf(top.map((player) => ({ nickname: player.nickname, value: options.podiumValue(player, config) })), message)]
      };
    },

    testActions(state) {
      if (state.stage === 'join') return [chatTest('!join', '!join', 3), chatTest('!thamgia', '!thamgia', 1)];
      if (state.stage !== 'ask' || !state.question) return [];
      const correct = LETTERS[state.question.correct] ?? 'A';
      return [
        chatTest(t('Trả lời đúng ({letter})', { letter: correct }), correct, 2),
        ...state.question.answers.map((_, index) => LETTERS[index] ?? '').filter((letter) => letter !== correct).map((letter) => chatTest(letter, letter)),
        chatTest('!join', '!join', 0.2)
      ];
    },

    view(state, config) {
      const arena = arenaView(state, config);
      const alive = state.players.filter((player) => player.alive).length;
      if (state.stage === 'join') {
        return view({
          headline: t('Gõ !join hoặc !thamgia để vào sân!'),
          hint: t('{n}/{max} người · cần ít nhất {min} người', { n: state.players.length, max: config.maxPlayers, min: config.minPlayers }),
          arena
        });
      }
      if (state.stage === 'done' || !state.question) {
        return view({ headline: state.winner ? t('🏆 {name} thắng!', { name: state.winner.nickname }) : t('🏁 Kết thúc'), arena });
      }
      const revealed = state.stage === 'reveal';
      const { counts, total } = state.book;
      const progress = t('Câu {n}', { n: state.number });
      return view({
        style: { rows: 'quiz' },
        headline: state.question.question,
        hint: revealed && state.last
          ? `${progress} • ${options.revealHint(state.last.correct, state.last.out)} • ${t('còn {n} người', { n: alive })}`
          : `${progress} • ${options.askHint?.(state, config) ?? t('còn {n} người', { n: alive })} • ${t('{count} người đã trả lời', { count: total.toLocaleString(numberLocale()) })}`,
        rows: state.question.answers.map((answer, index) => ({
          badge: LETTERS[index],
          label: answer,
          value: revealed ? String(counts[index] ?? 0) : undefined,
          highlight: revealed && index === state.question?.correct
        })),
        arena
      });
    }
  };
}

export const bubbleArenaGame = createArenaGame({
  id: 'dauTruongBong',
  title: 'Đấu trường bóng 🫧',
  accent: '#0ea5e9',
  aliases: ['dautruong', 'bong', 'arena'],
  howTo: 'Gõ !join hoặc !thamgia trong thời gian chờ để có một quả bóng mang avatar của bạn trên sân. Mỗi câu hỏi comment a, b, c hoặc d: đúng thì bóng to lên (càng nhanh càng to) và được cộng điểm. Bóng to đẩy bóng nhỏ, ai bị đẩy ra khỏi sân thì bị loại. Sân thu hẹp dần; người cuối cùng còn trên sân thắng.',
  kind: 'bubble',
  resolve: resolveBubbles,
  minField: 0.3,
  answerHelp: 'Trả lời: đúng càng nhanh bóng càng to',
  outText: () => t('💨 bị đẩy ra'),
  extraSettings: [
    { key: 'grow', label: 'Bóng to lên mỗi câu đúng (%)', type: 'number', min: 5, max: 100, hint: 'Trả lời ngay = to thêm đúng mức này, sát hết giờ = một phần ba.' }
  ],
  defaults: { grow: 30, lives: 1, shrink: 3 },
  revealHint: (correct, out) => (out ? t('✅ {correct} người đúng · 💨 {out} người bị đẩy ra!', { correct, out }) : t('✅ {correct} người đúng: bóng to lên!', { correct })),
  winText: (name) => t('🫧 {name} là quả bóng cuối cùng trên sân!', { name }),
  podiumValue: (player) => t('{points}đ', { points: player.points })
});

export const survivalGame = createArenaGame({
  id: 'daoSinhTon',
  title: 'Đảo sinh tồn 🏝',
  accent: '#14b8a6',
  aliases: ['daosinhton', 'sinhton', 'survival'],
  howTo: 'Gõ !join hoặc !thamgia trong thời gian chờ để lên đảo. Mỗi người có vài tim. Mỗi câu hỏi comment a, b, c hoặc d: sai hoặc không trả lời thì mất 1 tim, hết tim thì rơi xuống biển. Cả đảo cùng sai thì không ai mất tim. Đảo thu hẹp dần; người trụ lại cuối cùng thắng.',
  kind: 'island',
  resolve: resolveIsland,
  minField: 0.4,
  answerHelp: 'Trả lời: sai hoặc không trả lời = mất 1 tim',
  outText: () => t('🌊 rơi xuống biển'),
  value: (player, config) => hearts(player.lives, config.lives),
  extraSettings: [
    { key: 'lives', label: 'Số tim mỗi người', type: 'number', min: 1, max: 10 }
  ],
  defaults: { grow: 30, lives: 3, shrink: 4 },
  revealHint: (correct, out) => (out ? t('✅ {correct} người đúng · 🌊 {out} người rơi xuống biển!', { correct, out }) : t('✅ {correct} người đúng', { correct })),
  winText: (name) => t('🏝 {name} là người sống sót cuối cùng!', { name }),
  podiumValue: (player, config) => hearts(player.lives, config.lives)
});
