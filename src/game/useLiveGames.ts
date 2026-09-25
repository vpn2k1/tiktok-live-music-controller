import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { t } from '../shared/i18n';
import type { AudioTrack, LiveEvent, OverlayGameView, OverlayHowTo } from '../shared/types';
import {
  addPoints,
  cancelRound,
  clearRound,
  CommandRateLimiter,
  createGameState,
  endRound,
  pushEffects,
  resetScores,
  startRound,
  type GameState,
  type PointAward
} from './engine';
import { gameNames, HOST_ONLY, parseGlobalCommand, parseModerators } from './chatCommands';
import { buildEnglishDictionary, parseEnglishDictionary } from './english';
import { podiumEffect } from './series';
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
  /** Connected streamer's username (null when not connected). */
  hostUsername: string | null;
  onPlayTrack: (trackId: string, reason: string) => void;
  onAction: (message: string) => void;
  /** Short reply shown on the overlay (e.g. for !rank / !help). */
  onNotify: (message: string) => void;
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    // Guard against stored "null" or a value of the wrong shape.
    return parsed !== null && typeof parsed === typeof fallback ? (parsed as T) : fallback;
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

const CATEGORY_ACCENTS: Record<string, string> = { fun: '#7867ff', versus: '#ef4444', english: '#10b981', japanese: '#e11d48', chinese: '#dc2626' };

/** Icon chips telling viewers how to join, built from the game's command list (translated). */
function howToChips(commands: { usage: string; description: string }[]): OverlayHowTo[] {
  return commands.slice(0, 3).map((command) => {
    // The icon follows the Vietnamese source text, so it doesn't change with the language.
    const text = command.usage;
    const icon = /tim|like/i.test(text) ? '❤️' : /gift|tặng/i.test(text) ? '🎁' : '💬';
    return { icon, text: `${t(text)} · ${t(command.description)}` };
  });
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
    const saved = loadJson<string>('selected-game', 'quiz');
    return getGame(saved) ? saved : 'quiz';
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

  /** Ends the round with its result and points; `quiet` skips the result banner/confetti (e.g. back to the game list). */
  const finish = useCallback((options?: { quiet?: boolean }) => {
    const quiet = options?.quiet === true;
    const current = gameRef.current;
    const definition = getGame(current.kind);
    if (current.phase !== 'running' || !definition) return;

    const result = definition.finish(current.data, configFor(definition.id), context());
    // Default celebration: the round's top 3 by points on a podium.
    const top = [...result.awards].filter((award) => award.points > 0).sort((a, b) => b.points - a.points).slice(0, 3);
    const effects = result.effects ?? [top.length ? podiumEffect(top, result.message) : { kind: 'lose' as const, text: result.message }];
    updateGame((old) => {
      const ended = addPoints(endRound(old, result.message, result.state), result.awards);
      return quiet ? ended : pushEffects(ended, effects);
    });
    if (result.playTrackId) {
      optionsRef.current.onPlayTrack(result.playTrackId, t('Kết quả {title}', { title: t(definition.title) }));
    } else {
      optionsRef.current.onAction(result.message);
    }
  }, [configFor, context, updateGame]);

  const applyResult = useCallback((kind: string, result: HandleResult<unknown>) => {
    const current = gameRef.current;
    if (current.phase !== 'running' || current.kind !== kind) return;
    result.commit?.();
    updateGame((old) => pushEffects(addPoints({
      ...old,
      data: result.state,
      message: result.message ?? old.message,
      endsAt: result.endsAt ?? old.endsAt,
      timerStartedAt: result.endsAt != null ? Date.now() : old.timerStartedAt
    }, result.awards ?? []), result.effects));
    if (result.finish) finish();
  }, [finish, updateGame]);

  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  /** Starts `id` (default: the selected game). Returns false when it couldn't start. */
  const start = useCallback((id?: string): boolean => {
    const definition = getGame(id ?? selectedIdRef.current);
    if (!definition) return false;
    if (gameRef.current.phase === 'running') {
      optionsRef.current.onAction(t('Đang có game chạy, hãy Chốt hoặc Huỷ trước.'));
      return false;
    }


    const { playlist, currentTrackId } = optionsRef.current;
    const result = definition.start(configFor(definition.id), {
      ...context(),
      playlist,
      currentTrackId,
      previous: gameRef.current.memory[definition.id] ?? null
    });
    if ('error' in result) {
      optionsRef.current.onAction(result.error);
      return false;
    }
    if (id) {
      selectedIdRef.current = id;
      setSelectedId(id);
    }
    updateGame((old) => pushEffects(startRound(old, {
      kind: definition.id,
      title: definition.title,
      durationMs: result.durationMs,
      message: result.message,
      data: result.state
    }, Date.now()), [{ kind: 'start', text: t(definition.title) }]));
    optionsRef.current.onAction(t('Bắt đầu: {title}', { title: t(definition.title) }));
    return true;
  }, [configFor, context, updateGame]);

  /** Drops the round without a result; the play loop stops (see useAutoPlay). */
  const cancel = useCallback(() => {
    updateGame(cancelRound);
    optionsRef.current.onAction(t('Đã huỷ vòng chơi'));
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

  // Parsed once per settings change, not once per comment.
  const moderatorsRef = useRef({ text: '', names: new Set<string>() });

  /** Streamer, moderator, or the app's own test tools (simulated events). */
  const isHost = useCallback((user: string, simulated: boolean): boolean => {
    if (simulated) return true;
    const { hostUsername } = optionsRef.current;
    const name = user.toLowerCase();
    if (name === hostUsername?.toLowerCase()) return true;
    const text = featuresRef.current.moderators;
    if (moderatorsRef.current.text !== text) moderatorsRef.current = { text, names: parseModerators(text) };
    return moderatorsRef.current.names.has(name);
  }, []);

  /** Runs a global chat command; returns true when the comment was one. */
  const runGlobalCommand = useCallback((input: Extract<GameInput, { kind: 'chat' }>): boolean => {
    if (!featuresRef.current.chatCommandsEnabled) return false;
    const command = parseGlobalCommand(input.text, GAMES);
    if (!command) return false;
    if (HOST_ONLY.has(command.kind) && !input.isHost) return true;
    if (!acceptCommand(input.user)) return true;

    const { onNotify } = optionsRef.current;
    const current = gameRef.current;
    const running = current.phase === 'running' ? getGame(current.kind) : null;
    switch (command.kind) {
      case 'help':
        onNotify(running
          ? `${t(running.title)}: ${running.commands.map((item) => `${t(item.usage)} = ${t(item.description)}`).join(' • ')}`
          : t('Chưa có game. Lệnh: !help, !rank'));
        break;
      case 'rank': {
        const entry = current.scoreboard.get(input.user);
        const rank = current.scoreboard.rank(input.user);
        onNotify(entry && rank
          ? t('{nickname}: {points} điểm, hạng #{rank}/{size}', { nickname: input.nickname, points: entry.points, rank, size: current.scoreboard.size })
          : t('{nickname}: chưa có điểm, chơi game để lên bảng nhé!', { nickname: input.nickname }));
        break;
      }
      case 'games':
        onNotify(`!start + ${GAMES.map((game) => gameNames(game)[0]).join(', ')}`);
        break;
      case 'start':
        if (command.unknown) onNotify(t('Không có game “{name}”. Gõ !games để xem tên.', { name: command.unknown }));
        else start(command.game?.id);
        break;
      case 'stop':
        finish();
        break;
      case 'cancel':
        if (current.phase !== 'idle') cancel();
        break;
    }
    return true;
  }, [acceptCommand, cancel, finish, start]);

  /** Routes a LIVE event to chat commands, fan points and the running game. */
  const handleEvent = useCallback((event: LiveEvent): { consumed: boolean } => {
    const raw = toGameInput(event);
    if (!raw) return { consumed: false };
    const input: GameInput = raw.kind === 'chat' ? { ...raw, isHost: isHost(raw.user, event.simulated === true) } : raw;
    awardFanPoints(input);
    if (input.kind === 'chat' && runGlobalCommand(input)) return { consumed: true };

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
  }, [acceptCommand, applyResult, awardFanPoints, configFor, context, isHost, runGlobalCommand]);

  // Round timer. Series games move to the next step (`advance`) instead of finishing.
  useEffect(() => {
    if (game.phase !== 'running' || game.endsAt == null) return undefined;
    const timer = setTimeout(() => {
      // An answer may have moved the deadline after this timer was scheduled.
      const current = gameRef.current;
      if (current.phase !== 'running' || current.endsAt == null || current.endsAt > Date.now() + 25) return;
      const definition = getGame(current.kind);
      const next = definition?.advance?.(current.data, configFor(definition.id), context());
      if (!definition || !next) {
        finish();
        return;
      }
      applyResult(definition.id, next);
      // A step without a new deadline would stall the round.
      if (next.endsAt == null && !next.finish) finish();
    }, Math.max(0, game.endsAt - Date.now()));
    return () => clearTimeout(timer);
  }, [applyResult, configFor, context, finish, game.phase, game.endsAt]);

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

  // Views, test labels and how-to chips hold translated text: rebuild them when the language changes.
  const language = useLanguage();

  const gameView: OverlayGameView = useMemo(() => {
    const definition = getGame(game.kind);
    if (!definition || game.phase === 'idle' || game.data == null) return EMPTY_VIEW;
    return definition.view(game.data, normalizeConfig(definition, rawConfigs[definition.id]));
  }, [game.data, game.kind, game.phase, language, rawConfigs]);

  /** Test buttons for the running round (empty when idle or the game has none). */
  const testActions: TestAction[] = useMemo(() => {
    const definition = getGame(game.kind);
    if (!definition?.testActions || game.phase !== 'running' || game.data == null) return [];
    const ctx: GameContext = { now: game.startedAt ?? 0, random: Math.random, dictionary, englishDictionary };
    return definition.testActions(game.data, normalizeConfig(definition, rawConfigs[definition.id]), ctx);
  }, [dictionary, englishDictionary, game.data, game.kind, game.phase, game.startedAt, language, rawConfigs]);

  /** Accent + "how to join" chips for the running (or selected) game. */
  const overlayMeta = useMemo(() => {
    const definition = getGame(game.phase === 'idle' ? selectedId : game.kind) ?? getGame(selectedId);
    return {
      accent: definition?.accent ?? CATEGORY_ACCENTS[definition?.category ?? 'fun'] ?? '#7867ff',
      howTo: definition ? howToChips(definition.commands) : []
    };
  }, [game.kind, game.phase, language, selectedId]);

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
      optionsRef.current.onAction(t('Từ điển quá lớn để lưu lại; chỉ dùng trong phiên này.'));
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

  /** Latest round state, including changes not rendered yet. */
  const getState = useCallback(() => gameRef.current, []);

  return {
    games: GAMES,
    game,
    getState,
    isHost,
    gameView,
    overlayMeta,
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
