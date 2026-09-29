import { emojiGame, sentenceGame, translateGame, unscrambleGame } from './games/answerGames';
import { bombGame } from './games/bomb';
import { bubbleArenaGame, survivalGame } from './games/arena';
import { balloonShootGame, duelBracketGame, hotPotatoGame, meltingIceGame, musicalChairsGame } from './games/partyGames';
import { bossGame } from './games/boss';
import { castleSiegeGame } from './games/castleSiege';
import { crosswordGame } from './games/crossword';
import { duelGame } from './games/duel';
import { englishWordChainGame } from './games/englishWordChain';
import { estimateGame } from './games/estimate';
import { fastestFingerGame } from './games/fastestFinger';
import { goldenBellGame } from './games/goldenBell';
import { guessNumberGame } from './games/guessNumber';
import { balloonGame, plantGame, rocketGame, towerGame } from './games/growGames';
import { hangmanGame } from './games/hangman';
import { kingOfHillGame } from './games/kingOfHill';
import {
  chineseQuizGame,
  chineseVocabGame,
  hanziMemoryGame,
  japaneseQuizGame,
  japaneseVocabGame,
  kanaMemoryGame,
  kanaReadingGame,
  pinyinReadingGame
} from './games/languageGames';
import { likeChallengeGame } from './games/likeChallenge';
import { majorityGame } from './games/majority';
import { memoryGame } from './games/memory';
import { nameItGame } from './games/nameIt';
import { englishQuizGame, quizGame } from './games/quiz';
import { raceGame } from './games/race';
import { rockPaperScissorsGame } from './games/rockPaperScissors';
import { teamBattleGame } from './games/teamBattle';
import { teamQuizGame } from './games/teamQuiz';
import { trueFalseGame } from './games/trueFalse';
import { emojiVietnameseGame, riddleGame } from './games/vietnameseGames';
import { wheelGame } from './games/wheel';
import { wordChainGame } from './games/wordChain';
import type { GameConfig, GameDefinition, SettingField } from './types';

// Each definition is fully typed in its own module; the registry erases the
// per-game state/config types so the controller can treat them uniformly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGame = GameDefinition<any, any>;

export const GAMES: AnyGame[] = [
  // Fun
  quizGame,
  goldenBellGame,
  rockPaperScissorsGame,
  majorityGame,
  bombGame,
  memoryGame,
  likeChallengeGame,
  emojiVietnameseGame,
  riddleGame,
  estimateGame,
  bossGame,
  wordChainGame,
  guessNumberGame,
  fastestFingerGame,
  raceGame,
  balloonGame,
  plantGame,
  rocketGame,
  towerGame,
  wheelGame,
  // Versus
  castleSiegeGame,
  teamQuizGame,
  duelGame,
  kingOfHillGame,
  bubbleArenaGame,
  survivalGame,
  musicalChairsGame,
  meltingIceGame,
  duelBracketGame,
  hotPotatoGame,
  balloonShootGame,
  teamBattleGame,
  // English
  trueFalseGame,
  unscrambleGame,
  translateGame,
  emojiGame,
  sentenceGame,
  hangmanGame,
  nameItGame,
  englishQuizGame,
  englishWordChainGame,
  crosswordGame,
  // Japanese
  kanaReadingGame,
  japaneseVocabGame,
  japaneseQuizGame,
  kanaMemoryGame,
  // Chinese
  pinyinReadingGame,
  chineseVocabGame,
  chineseQuizGame,
  hanziMemoryGame
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
