import type { GamePhase, ScoreEntry } from '../shared/types';

/**
 * Shared round + leaderboard state. Every function here is pure so it is safe
 * inside React state updaters (StrictMode may call them twice).
 */
export interface GameState {
  /** Id of the game in this round (see registry). */
  kind: string | null;
  title: string;
  phase: GamePhase;
  startedAt: number | null;
  /** null while running = no timer. */
  endsAt: number | null;
  message: string;
  /** Per-game round state, owned by that game's module. */
  data: unknown;
  /** Last finished round state per game id. */
  memory: Record<string, unknown>;
  /** Session leaderboard keyed by TikTok uniqueId; survives between rounds. */
  scores: Record<string, ScoreEntry>;
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
    message: '',
    data: null,
    memory: {},
    scores: {}
  };
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
    message: round.message ?? '',
    data: round.data
  };
}

export function endRound(state: GameState, message: string, data: unknown = state.data): GameState {
  if (state.phase !== 'running') return state;
  const memory = state.kind ? { ...state.memory, [state.kind]: data } : state.memory;
  return { ...state, phase: 'ended', endsAt: null, message, data, memory };
}

/** Hides the round from the overlay but keeps the session leaderboard. */
export function clearRound(state: GameState): GameState {
  if (state.phase === 'idle') return state;
  return { ...state, kind: null, title: '', phase: 'idle', startedAt: null, endsAt: null, message: '', data: null };
}

export function remainingMs(state: GameState, now: number): number {
  if (state.phase !== 'running' || state.endsAt == null) return 0;
  return Math.max(0, state.endsAt - now);
}

export function addPoints(state: GameState, awards: PointAward[]): GameState {
  if (!awards.length) return state;
  const scores = { ...state.scores };
  for (const award of awards) {
    if (!award.user || award.points <= 0) continue;
    const old = scores[award.user];
    scores[award.user] = {
      user: award.user,
      nickname: award.nickname || old?.nickname || award.user,
      points: (old?.points ?? 0) + award.points
    };
  }
  return { ...state, scores };
}

export function resetScores(state: GameState): GameState {
  return { ...state, scores: {} };
}

export function topScores(state: GameState, limit = 5): ScoreEntry[] {
  return Object.values(state.scores)
    .sort((a, b) => b.points - a.points || a.user.localeCompare(b.user))
    .slice(0, limit);
}

/**
 * Per-viewer cooldown. Only accepted commands consume the cooldown, so normal
 * chatting never blocks a viewer's next command.
 */
export class CommandRateLimiter {
  private lastAccepted = new Map<string, number>();

  allow(user: string, cooldownMs: number, now = Date.now()): boolean {
    if (cooldownMs <= 0) return true;
    const last = this.lastAccepted.get(user);
    if (last !== undefined && now - last < cooldownMs) return false;

    this.lastAccepted.set(user, now);
    if (this.lastAccepted.size > 2000) this.prune(now, cooldownMs);
    return true;
  }

  private prune(now: number, cooldownMs: number): void {
    for (const [user, at] of this.lastAccepted) {
      if (now - at >= cooldownMs) this.lastAccepted.delete(user);
    }
  }
}
