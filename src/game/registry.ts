import { emojiGame, sentenceGame, translateGame, unscrambleGame } from './games/answerGames';
import { bossGame } from './games/boss';
import { englishWordChainGame } from './games/englishWordChain';
import { fastestFingerGame } from './games/fastestFinger';
import { guessNumberGame } from './games/guessNumber';
import { hangmanGame } from './games/hangman';
import { nameItGame } from './games/nameIt';
import { englishQuizGame, quizGame } from './games/quiz';
import { raceGame } from './games/race';
import { teamBattleGame } from './games/teamBattle';
import { voteGame } from './games/vote';
import { wheelGame } from './games/wheel';
import { wordChainGame } from './games/wordChain';
import type { GameConfig, GameDefinition, SettingField } from './types';

// Each definition is fully typed in its own module; the registry erases the
// per-game state/config types so the controller can treat them uniformly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGame = GameDefinition<any, any>;

export const GAMES: AnyGame[] = [
  voteGame,
  bossGame,
  wordChainGame,
  quizGame,
  guessNumberGame,
  fastestFingerGame,
  teamBattleGame,
  raceGame,
  wheelGame,
  unscrambleGame,
  translateGame,
  emojiGame,
  sentenceGame,
  hangmanGame,
  nameItGame,
  englishQuizGame,
  englishWordChainGame
];

export function getGame(id: string | null): AnyGame | null {
  return GAMES.find((game) => game.id === id) ?? null;
}

function clampNumber(value: unknown, field: SettingField, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const min = field.min ?? Number.NEGATIVE_INFINITY;
  const max = field.max ?? Number.POSITIVE_INFINITY;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

/** Validates raw (user-typed or stored) settings against the game's field list. */
export function normalizeConfig(game: AnyGame, raw: Partial<GameConfig> | undefined): GameConfig {
  const defaults = game.defaultConfig as GameConfig;
  const config: GameConfig = { ...defaults };
  for (const field of game.settings) {
    const fallback = defaults[field.key];
    const value = raw?.[field.key];
    if (field.type === 'number') {
      config[field.key] = clampNumber(value, field, Number(fallback));
    } else if (field.type === 'select') {
      config[field.key] = field.options?.some((option) => option.value === value) ? String(value) : String(fallback);
    } else {
      config[field.key] = typeof value === 'string' ? value.slice(0, field.maxLength ?? 200) : String(fallback);
    }
  }
  return config;
}
