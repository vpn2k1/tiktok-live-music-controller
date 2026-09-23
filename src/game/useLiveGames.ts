import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioTrack, LiveEvent, OverlayGameView } from '../shared/types';
import {
  addPoints,
  clearRound,
  CommandRateLimiter,
  createGameState,
  endRound,
  resetScores,
  startRound,
  type GameState,
  type PointAward
} from './engine';
import { buildEnglishDictionary, parseEnglishDictionary } from './english';
import { DEFAULT_FEATURES, likePoints, normalizeFeatures, type LiveFeatures } from './features';
import { GAMES, getGame, normalizeConfig } from './registry';
import { EMPTY_VIEW, type GameConfig, type GameContext, type GameInput, type HandleResult, type TestAction } from './types';
import { buildDictionary, parseDictionary } from './words';

/** How long a finished round stays on the overlay before it hides. */
const ENDED_ROUND_VISIBLE_MS = 10_000;
const TICK_MS = 250;

interface LiveGamesOptions {
  playlist: AudioTrack[];
  currentTrackId: string | null;
  cooldownSeconds: number;
  onPlayTrack: (trackId: string, reason: string) => void;
  onAction: (message: string) => void;
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: settings still work for this session.
  }
}

export type DictionaryLanguage = 'vi' | 'en';

const DICTIONARY_KEYS: Record<DictionaryLanguage, string> = { vi: 'word-dictionary', en: 'word-dictionary-en' };

function loadWords(language: DictionaryLanguage): string[] {
  try {
    return (localStorage.getItem(DICTIONARY_KEYS[language]) ?? '').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function toGameInput(event: LiveEvent): GameInput | null {
  if (event.type === 'chat' && 'comment' in event) {
    return { kind: 'chat', user: event.user, nickname: event.nickname, text: String(event.comment || '') };
  }
  if (event.type === 'like' && 'count' in event) {
    return { kind: 'like', user: event.user, nickname: event.nickname, count: Math.max(1, Number(event.count) || 1) };
  }
  if (event.type === 'gift' && 'giftName' in event) {
    return { kind: 'gift', user: event.user, nickname: event.nickname, giftName: String(event.giftName || ''), count: Math.max(1, Number(event.count) || 1) };
  }
  return null;
}

/**
 * Owns game rounds, per-game settings, the session leaderboard, the chat
 * cooldown and fan points. Game rules live in pure modules (see registry).
 */
export function useLiveGames(options: LiveGamesOptions) {
  const [game, setGame] = useState<GameState>(createGameState);
  const [selectedId, setSelectedId] = useState<string>(() => {
    const saved = loadJson<string>('selected-game', 'vote');
    return getGame(saved) ? saved : 'vote';
  });
  const [rawConfigs, setRawConfigs] = useState<Record<string, Partial<GameConfig>>>(() => loadJson('game-configs', {}));
  const [features, setFeaturesState] = useState<LiveFeatures>(() => normalizeFeatures(loadJson('live-features', DEFAULT_FEATURES)));
  const [importedWords, setImportedWords] = useState<Record<DictionaryLanguage, string[]>>(() => ({ vi: loadWords('vi'), en: loadWords('en') }));

  // gameRef is the synchronous source of truth; every change goes through updateGame.
  const gameRef = useRef<GameState>(game);
  const commandLimiter = useRef(new CommandRateLimiter());
  const fanChatLimiter = useRef(new CommandRateLimiter());
  const likeCarry = useRef(new Map<string, number>());
  const optionsRef = useRef(options);
  const configsRef = useRef(rawConfigs);
  const featuresRef = useRef(features);

  const dictionary = useMemo(() => buildDictionary(importedWords.vi), [importedWords.vi]);
  const englishDictionary = useMemo(() => buildEnglishDictionary(importedWords.en), [importedWords.en]);
  const dictionaryRef = useRef(dictionary);
  const englishDictionaryRef = useRef(englishDictionary);

  useEffect(() => {
    optionsRef.current = options;
    configsRef.current = rawConfigs;
    featuresRef.current = features;
    dictionaryRef.current = dictionary;
    englishDictionaryRef.current = englishDictionary;
  });

  useEffect(() => saveJson('selected-game', selectedId), [selectedId]);
  useEffect(() => saveJson('game-configs', rawConfigs), [rawConfigs]);
  useEffect(() => saveJson('live-features', features), [features]);

  const updateGame = useCallback((change: (old: GameState) => GameState) => {
    const next = change(gameRef.current);
    if (next === gameRef.current) return;
    gameRef.current = next;
    setGame(next);
  }, []);

  const configFor = useCallback((id: string): GameConfig => {
    const definition = getGame(id);
    return definition ? normalizeConfig(definition, configsRef.current[id]) : {};
  }, []);

  const context = useCallback((): GameContext => ({
    now: Date.now(),
    random: Math.random,
    dictionary: dictionaryRef.current,
    englishDictionary: englishDictionaryRef.current
  }), []);

  const finish = useCallback(() => {
    const current = gameRef.current;
    const definition = getGame(current.kind);
    if (current.phase !== 'running' || !definition) return;

    const result = definition.finish(current.data, configFor(definition.id), context());
    updateGame((old) => addPoints(endRound(old, result.message, result.state), result.awards));
    if (result.playTrackId) {
      optionsRef.current.onPlayTrack(result.playTrackId, `Kết quả ${definition.title}`);
    } else {
      optionsRef.current.onAction(result.message);
    }
  }, [configFor, context, updateGame]);

  const applyResult = useCallback((kind: string, result: HandleResult<unknown>) => {
    updateGame((old) => (
      old.phase === 'running' && old.kind === kind
        ? { ...old, data: result.state, message: result.message ?? old.message, endsAt: result.endsAt ?? old.endsAt }
        : old
    ));
    if (result.finish) finish();
  }, [finish, updateGame]);

  const start = useCallback(() => {
    const definition = getGame(selectedId);
    if (!definition || gameRef.current.phase === 'running') return;

    const { playlist, currentTrackId } = optionsRef.current;
    const result = definition.start(configFor(definition.id), {
      ...context(),
      playlist,
      currentTrackId,
      previous: gameRef.current.memory[definition.id] ?? null
    });
    if ('error' in result) {
      optionsRef.current.onAction(result.error);
      return;
    }
    updateGame((old) => startRound(old, {
      kind: definition.id,
      title: definition.title,
      durationMs: result.durationMs,
      message: result.message,
      data: result.state
    }, Date.now()));
    optionsRef.current.onAction(`Bắt đầu: ${definition.title}`);
  }, [configFor, context, selectedId, updateGame]);

  const cancel = useCallback(() => {
    updateGame(clearRound);
    optionsRef.current.onAction('Đã huỷ vòng chơi');
  }, [updateGame]);

  /** Per-viewer chat cooldown shared by games and music rules. */
  const acceptCommand = useCallback((user: string) => {
    const seconds = Math.max(0, Math.min(60, Number(optionsRef.current.cooldownSeconds) || 0));
    return commandLimiter.current.allow(user, seconds * 1000);
  }, []);

  const awardFanPoints = useCallback((input: GameInput) => {
    const settings = featuresRef.current;
    if (!settings.fanEnabled) return;

    let points = 0;
    if (input.kind === 'chat') {
      if (fanChatLimiter.current.allow(input.user, settings.fanChatCooldownSeconds * 1000)) points = settings.fanChatPoints;
    } else if (input.kind === 'like') {
      const result = likePoints(likeCarry.current.get(input.user) ?? 0, input.count, settings.fanLikesPerPoint);
      likeCarry.current.set(input.user, result.carry);
      if (likeCarry.current.size > 5000) likeCarry.current.clear();
      points = result.points;
    } else {
      points = input.count * settings.fanGiftPoints;
    }
    if (points > 0) {
      const award: PointAward = { user: input.user, nickname: input.nickname, points };
      updateGame((old) => addPoints(old, [award]));
    }
  }, [updateGame]);

  /** Routes a LIVE event to fan points and the running game. */
  const handleEvent = useCallback((event: LiveEvent): { consumed: boolean } => {
    const input = toGameInput(event);
    if (!input) return { consumed: false };
    awardFanPoints(input);

    const current = gameRef.current;
    const definition = getGame(current.kind);
    if (current.phase !== 'running' || !definition) return { consumed: false };

    const result = definition.handle(current.data, input, configFor(definition.id), context());
    if (!result) return { consumed: false };

    const consumed = input.kind === 'chat' && result.consumed;
    // Rate-limited commands are swallowed; handle() is pure so dropping it is safe.
    if (consumed && !acceptCommand(input.user)) return { consumed: true };
    applyResult(definition.id, result);
    return { consumed };
  }, [acceptCommand, applyResult, awardFanPoints, configFor, context]);

  // Round timer.
  useEffect(() => {
    if (game.phase !== 'running' || game.endsAt == null) return undefined;
    const timer = setTimeout(finish, Math.max(0, game.endsAt - Date.now()));
    return () => clearTimeout(timer);
  }, [finish, game.phase, game.endsAt]);

  // Clock-driven games (wheel spins).
  useEffect(() => {
    const definition = getGame(game.kind);
    if (game.phase !== 'running' || !definition?.tick) return undefined;
    const tick = definition.tick;
    const timer = setInterval(() => {
      const current = gameRef.current;
      if (current.phase !== 'running' || current.kind !== definition.id) return;
      const result = tick(current.data, configFor(definition.id), context());
      if (result) applyResult(definition.id, result);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [applyResult, configFor, context, game.kind, game.phase]);

  // Hide a finished round after a while; the leaderboard stays.
  useEffect(() => {
    if (game.phase !== 'ended') return undefined;
    const timer = setTimeout(() => updateGame((old) => (old.phase === 'ended' ? clearRound(old) : old)), ENDED_ROUND_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [game.phase, updateGame]);

  const gameView: OverlayGameView = useMemo(() => {
    const definition = getGame(game.kind);
    if (!definition || game.phase === 'idle' || game.data == null) return EMPTY_VIEW;
    return definition.view(game.data, normalizeConfig(definition, rawConfigs[definition.id]));
  }, [game.data, game.kind, game.phase, rawConfigs]);

  /** Test buttons for the running round (empty when idle or the game has none). */
  const testActions: TestAction[] = useMemo(() => {
    const definition = getGame(game.kind);
    if (!definition?.testActions || game.phase !== 'running' || game.data == null) return [];
    const ctx: GameContext = { now: game.startedAt ?? 0, random: Math.random, dictionary, englishDictionary };
    return definition.testActions(game.data, normalizeConfig(definition, rawConfigs[definition.id]), ctx);
  }, [dictionary, englishDictionary, game.data, game.kind, game.phase, game.startedAt, rawConfigs]);

  const setConfigValue = useCallback((id: string, key: string, value: string | number) => {
    setRawConfigs((old) => ({ ...old, [id]: { ...old[id], [key]: value } }));
  }, []);

  const resetConfig = useCallback((id: string) => {
    setRawConfigs((old) => {
      const next = { ...old };
      delete next[id];
      return next;
    });
  }, []);

  const setFeatures = useCallback((patch: Partial<LiveFeatures>) => {
    setFeaturesState((old) => normalizeFeatures({ ...old, ...patch }));
  }, []);

  const importDictionary = useCallback((language: DictionaryLanguage, text: string): number => {
    const words = language === 'vi' ? parseDictionary(text) : parseEnglishDictionary(text);
    setImportedWords((old) => ({ ...old, [language]: words }));
    try {
      localStorage.setItem(DICTIONARY_KEYS[language], words.join('\n'));
    } catch {
      optionsRef.current.onAction('Từ điển quá lớn để lưu lại; chỉ dùng trong phiên này.');
    }
    return words.length;
  }, []);

  const clearDictionary = useCallback((language: DictionaryLanguage) => {
    setImportedWords((old) => ({ ...old, [language]: [] }));
    try {
      localStorage.removeItem(DICTIONARY_KEYS[language]);
    } catch {
      // ignore
    }
  }, []);

  return {
    games: GAMES,
    game,
    gameView,
    testActions,
    selectedId,
    setSelectedId,
    rawConfigs,
    setConfigValue,
    resetConfig,
    features,
    setFeatures,
    dictionary,
    englishDictionary,
    importDictionary,
    clearDictionary,
    start,
    finish,
    cancel,
    resetScores: () => updateGame(resetScores),
    acceptCommand,
    handleEvent
  };
}
