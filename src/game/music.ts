import { MUSIC_THEMES, type MusicTheme } from '../shared/bgm';
import type { GamePhase } from '../shared/types';
import type { GameCategory } from './types';

/** Background music of a game by its library group. */
const BY_CATEGORY: Record<GameCategory, MusicTheme> = {
  fun: 'fun',
  versus: 'versus',
  english: 'chill',
  japanese: 'chill',
  chinese: 'chill'
};

/** Games whose mood differs from their group: quizzes and countdowns feel tense, the boss is a fight. */
const BY_GAME: Record<string, MusicTheme> = {
  quiz: 'quiz',
  englishQuiz: 'quiz',
  rungChuong: 'quiz',
  goBom: 'quiz',
  uocLuong: 'quiz',
  guessNumber: 'quiz',
  fastestFinger: 'quiz',
  crossword: 'quiz',
  trieuPhu: 'quiz',
  boss: 'versus'
};

/** "auto" = each game's own mood, or one fixed theme for every game. */
export type MusicChoice = 'auto' | MusicTheme;

export function isMusicChoice(value: unknown): value is MusicChoice {
  return value === 'auto' || (MUSIC_THEMES as readonly unknown[]).includes(value);
}

export function musicForGame(game: { id: string; category: GameCategory }, choice: MusicChoice): MusicTheme {
  return choice !== 'auto' ? choice : BY_GAME[game.id] ?? BY_CATEGORY[game.category] ?? 'fun';
}

/** What should play now, and how loud (1 = normal; softer under the winner's fanfare). */
export interface MusicCue {
  theme: MusicTheme;
  level: number;
  urgent: boolean;
}

/** Music level while a finished round's result / celebration is on screen. */
export const RESULT_LEVEL = 0.35;
/** The last part of a timer that counts as "running out": 30% of it, at most 10 s. */
const URGENT_SHARE = 0.3;
const URGENT_MAX_MS = 10_000;
/** Short timers (answer reveal) never count as urgent. */
const URGENT_MIN_TIMER_MS = 10_000;

/**
 * The music cue for the current screen, or null for silence:
 * - a running round: its game's theme (faster in the last seconds of a timer);
 * - the game list (lobby): the lobby theme;
 * - a finished round (celebration, then the gap before the next one): the same theme, softer.
 */
export function musicCue(input: {
  enabled: boolean;
  choice: MusicChoice;
  phase: GamePhase;
  game: { id: string; category: GameCategory } | null;
  lobbyOpen: boolean;
  endsAt: number | null;
  timerStartedAt: number | null;
  now: number;
}): MusicCue | null {
  if (!input.enabled) return null;
  if (input.phase === 'running' && input.game) {
    const total = input.endsAt != null && input.timerStartedAt != null ? input.endsAt - input.timerStartedAt : 0;
    const left = input.endsAt != null ? input.endsAt - input.now : Infinity;
    const urgent = total >= URGENT_MIN_TIMER_MS && left > 0 && left <= Math.min(URGENT_MAX_MS, total * URGENT_SHARE);
    return { theme: musicForGame(input.game, input.choice), level: 1, urgent };
  }
  if (input.lobbyOpen) return { theme: 'lobby', level: 1, urgent: false };
  if (input.phase === 'ended' && input.game) return { theme: musicForGame(input.game, input.choice), level: RESULT_LEVEL, urgent: false };
  return null;
}
