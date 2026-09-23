import type { AudioTrack, OverlayGameView } from '../shared/types';
import type { PointAward } from './engine';
import type { EnglishDictionary } from './english';
import type { WordDictionary } from './words';

/** Normalized viewer input a game can react to. Text is untrusted data. */
export type GameInput =
  | { kind: 'chat'; user: string; nickname: string; text: string }
  | { kind: 'like'; user: string; nickname: string; count: number }
  | { kind: 'gift'; user: string; nickname: string; giftName: string; count: number };

export type GameCategory = 'fun' | 'english';

export const GAME_CATEGORY_LABELS: Record<GameCategory, string> = {
  fun: 'Giải trí',
  english: 'Tiếng Anh 🇬🇧'
};

export type GameConfigValue = number | string;
export type GameConfig = Record<string, GameConfigValue>;

/** Declarative setting; the app renders and clamps it generically. */
export interface SettingField {
  key: string;
  label: string;
  type: 'number' | 'text' | 'textarea' | 'select';
  min?: number;
  max?: number;
  maxLength?: number;
  options?: { value: string; label: string }[];
  hint?: string;
}

export interface GameContext {
  now: number;
  random: () => number;
  dictionary: WordDictionary;
  englishDictionary: EnglishDictionary;
}

export interface StartContext<S> extends GameContext {
  playlist: AudioTrack[];
  currentTrackId: string | null;
  /** Final state of this game's previous round (e.g. to avoid repeating questions). */
  previous: S | null;
}

export interface StartResult<S> {
  state: S;
  /** null = no timer; the round runs until the streamer ends it. */
  durationMs: number | null;
  message?: string;
}

export interface HandleResult<S> {
  state: S;
  /**
   * Chat only: true when the comment was a command for this game. Consumed
   * comments count against the viewer's cooldown and skip the music rules.
   */
  consumed: boolean;
  message?: string;
  /** End the round right now (winner found, boss dead…). */
  finish?: boolean;
  /** Move the round deadline (e.g. word chain resets the turn timer). */
  endsAt?: number;
}

/** Simulated viewer input for the app's test buttons and demo bot. */
export type TestInput =
  | { kind: 'chat'; text: string }
  | { kind: 'like'; count: number }
  | { kind: 'gift'; giftName: string; count: number };

export interface TestAction {
  label: string;
  input: TestInput;
  /** Relative chance for the demo bot (default 1); keep round-ending actions low. */
  weight?: number;
}

export interface FinishResult<S> {
  state: S;
  message: string;
  awards: PointAward[];
  /** Optional music effect, e.g. play the voted track. */
  playTrackId?: string;
}

/**
 * A LIVE game. Every function must be pure (no Date.now/Math.random inside;
 * use ctx) so results can be discarded when a viewer is rate-limited.
 */
export interface GameDefinition<S, C extends GameConfig> {
  id: string;
  title: string;
  /** Dropdown group in the Game panel. */
  category: GameCategory;
  howTo: string;
  defaultConfig: C;
  settings: SettingField[];
  start(config: C, ctx: StartContext<S>): StartResult<S> | { error: string };
  /** Return null when the input is irrelevant to this game. */
  handle(state: S, input: GameInput, config: C, ctx: GameContext): HandleResult<S> | null;
  /** Optional clock-driven updates (e.g. wheel spins), called ~4×/s while running. */
  tick?(state: S, config: C, ctx: GameContext): HandleResult<S> | null;
  finish(state: S, config: C, ctx: GameContext): FinishResult<S>;
  view(state: S, config: C): OverlayGameView;
  /**
   * Test buttons for the running round (may use the hidden answer — test only).
   * Sent through the normal simulate IPC as random viewers.
   */
  testActions?(state: S, config: C, ctx: GameContext): TestAction[];
}

export const chatTest = (label: string, text: string, weight?: number): TestAction => ({ label, input: { kind: 'chat', text }, weight });
export const likeTest = (count: number, weight?: number): TestAction => ({ label: `+${count} tim`, input: { kind: 'like', count }, weight });
export const giftTest = (giftName: string, count = 1, weight?: number): TestAction => ({ label: `${giftName} ×${count}`, input: { kind: 'gift', giftName, count }, weight });

export const EMPTY_VIEW: OverlayGameView = {
  headline: null,
  hint: null,
  rows: [],
  progress: null,
  teams: null,
  race: null,
  wheel: null
};

export function view(partial: Partial<OverlayGameView>): OverlayGameView {
  return { ...EMPTY_VIEW, ...partial };
}

export function percentOf(value: number, total: number): number {
  return total > 0 ? Math.round(Math.min(100, Math.max(0, (value / total) * 100))) : 0;
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/** Picks an index not used in `asked` (resets when all were used). */
export function pickUnasked(count: number, asked: number[], random: () => number): { index: number; asked: number[] } {
  const history = asked.length >= count ? [] : asked;
  const remaining = Array.from({ length: count }, (_, index) => index).filter((index) => !history.includes(index));
  const index = remaining[Math.floor(random() * remaining.length)] ?? 0;
  return { index, asked: [...history, index] };
}

/** Stable ranking helper: higher score first, then user id. */
export function ranked<T extends { user: string }>(items: T[], score: (item: T) => number): T[] {
  return [...items].sort((a, b) => score(b) - score(a) || a.user.localeCompare(b.user));
}
