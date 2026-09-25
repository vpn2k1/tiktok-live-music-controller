import type { GamePhase, OverlayEffect, ScoreEntry } from '../shared/types';
import { Scoreboard } from './scoreboard';

/**
 * Shared round + leaderboard state. Round fields are immutable; the session
 * leaderboard is a mutable `Scoreboard` (copying it per award doesn't scale),
 * so these functions run once per change via `updateGame`, never inside React
 * state updaters. `scoreVersion` changes whenever points change.
 */
export interface GameState {
  /** Id of the game in this round (see registry). */
  kind: string | null;
  title: string;
  phase: GamePhase;
  startedAt: number | null;
  /** null while running = no timer. */
  endsAt: number | null;
  /** When `endsAt` was last set (word chain resets it every answer). */
  timerStartedAt: number | null;
  message: string;
  /** Recent one-shot effects for the overlay/sounds (ids increase). */
  effects: OverlayEffect[];
  effectSeq: number;
  /** Per-game round state, owned by that game's module. */
  data: unknown;
  /** Last finished round state per game id. */
  memory: Record<string, unknown>;
  /** Session leaderboard keyed by TikTok uniqueId; survives between rounds. */
  scoreboard: Scoreboard;
  scoreVersion: number;
  /** Rounds cancelled so far: the play loop stops when this changes (see useAutoPlay). */
  cancels: number;
}

export interface PointAward {
  user: string;
  nickname: string;
  points: number;
}

export function createGameState(): GameState {
  return {
    kind: null,
    title: '',
    phase: 'idle',
    startedAt: null,
    endsAt: null,
    timerStartedAt: null,
    message: '',
    effects: [],
    effectSeq: 0,
    data: null,
    memory: {},
    scoreboard: new Scoreboard(),
    scoreVersion: 0,
    cancels: 0
  };
}

export type EffectInput = Omit<OverlayEffect, 'id'>;

const MAX_EFFECTS = 8;

/** Appends effects with increasing ids, keeping only the most recent few. */
export function pushEffects(state: GameState, effects: EffectInput[] | undefined): GameState {
  if (!effects?.length) return state;
  let seq = state.effectSeq;
  const added = effects.map((effect) => ({ ...effect, id: ++seq }));
  return { ...state, effectSeq: seq, effects: [...state.effects, ...added].slice(-MAX_EFFECTS) };
}

export function startRound(
  state: GameState,
  round: { kind: string; title: string; durationMs: number | null; message?: string; data: unknown },
  now: number
): GameState {
  return {
    ...state,
    kind: round.kind,
    title: round.title,
    phase: 'running',
    startedAt: now,
    endsAt: round.durationMs == null ? null : now + Math.max(1000, round.durationMs),
    timerStartedAt: round.durationMs == null ? null : now,
    message: round.message ?? '',
    data: round.data
  };
}

export function endRound(state: GameState, message: string, data: unknown = state.data): GameState {
  if (state.phase !== 'running') return state;
  const memory = state.kind ? { ...state.memory, [state.kind]: data } : state.memory;
  return { ...state, phase: 'ended', endsAt: null, timerStartedAt: null, message, data, memory };
}

/** Drops the round without a result (Huỷ / !cancel); the game stops playing. */
export function cancelRound(state: GameState): GameState {
  return { ...clearRound(state), cancels: state.cancels + 1 };
}

/** Hides the round from the overlay but keeps the session leaderboard. */
export function clearRound(state: GameState): GameState {
  if (state.phase === 'idle') return state;
  return { ...state, kind: null, title: '', phase: 'idle', startedAt: null, endsAt: null, timerStartedAt: null, message: '', data: null };
}

export function remainingMs(state: GameState, now: number): number {
  if (state.phase !== 'running' || state.endsAt == null) return 0;
  return Math.max(0, state.endsAt - now);
}

/** Adds points to the session leaderboard (mutates it, bumps `scoreVersion`). */
export function addPoints(state: GameState, awards: PointAward[]): GameState {
  let changed = false;
  for (const award of awards) {
    if (!award.user || !(award.points > 0)) continue;
    state.scoreboard.add(award.user, award.nickname, award.points);
    changed = true;
  }
  return changed ? { ...state, scoreVersion: state.scoreVersion + 1 } : state;
}

export function resetScores(state: GameState): GameState {
  return { ...state, scoreboard: new Scoreboard(), scoreVersion: state.scoreVersion + 1 };
}

export function topScores(state: GameState, limit = 5): ScoreEntry[] {
  return state.scoreboard.top(limit);
}

/**
 * Per-viewer cooldown. Only accepted commands consume the cooldown, so normal
 * chatting never blocks a viewer's next command.
 *
 * Two generations of timestamps rotate every cooldown, so a check is O(1) and
 * memory holds only viewers seen in the last two cooldowns, however big the room.
 */
export class CommandRateLimiter {
  private current = new Map<string, number>();
  private previous = new Map<string, number>();
  private rotatedAt = 0;

  allow(user: string, cooldownMs: number, now = Date.now()): boolean {
    if (cooldownMs <= 0) return true;
    if (now - this.rotatedAt >= cooldownMs) {
      // Everything in `previous` is older than a full cooldown by now.
      this.previous = this.current;
      this.current = new Map();
      this.rotatedAt = now;
    }
    const last = this.current.get(user) ?? this.previous.get(user);
    if (last !== undefined && now - last < cooldownMs) return false;
    this.current.set(user, now);
    return true;
  }
}
