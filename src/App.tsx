import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent
} from 'react';
import AiPanel from './components/AiPanel';
import AutoPlayPanel from './components/AutoPlayPanel';
import FeaturesPanel from './components/FeaturesPanel';
import GameLibrary from './components/GameLibrary';
import GamePanel from './components/GamePanel';
import OverlayPanel from './components/OverlayPanel';
import Panel from './components/Panel';
import Toggle from './components/Toggle';
import { remainingMs, topScores } from './game/engine';
import { musicCue } from './game/music';
import { getGame } from './game/registry';
import type { TestInput } from './game/types';
import { useAutoPlay } from './game/useAutoPlay';
import { useLiveGames } from './game/useLiveGames';
import { useDemoBot } from './hooks/useDemoBot';
import { useAi } from './hooks/useAi';
import { overlayAvatarNames, useAvatars } from './hooks/useAvatars';
import { useGameMusic } from './hooks/useGameMusic';
import { useGameSounds } from './hooks/useGameSounds';
import { useLanguage } from './hooks/useLanguage';
import { useNow } from './hooks/useNow';
import { useWelcomeAlerts } from './hooks/useWelcomeAlerts';
import type {
  AudioTrack,
  LiveEvent,
  MusicRules,
  OverlayInfo,
  OverlayState,
  TikTokStatus
} from './shared/types';
import type { MusicTheme } from './shared/bgm';
import type { LiveEventBatch } from './shared/eventBatch';
import { appendChatLog, type ChatEntry } from './shared/chatLog';
import ChatHistory from './components/ChatHistory';
import { LANGUAGE_STORAGE_KEY, LANGUAGES, lookup, setLanguage, t, type Language } from './shared/i18n';
import type { OverlayConfig } from './shared/overlay';

const DEFAULT_RULES: MusicRules = {
  autoNextEnabled: true,
  autoNextSeconds: 30,
  commentNextEnabled: true,
  commentNextCommand: '!next',
  commentNumberEnabled: true,
  commentSearchEnabled: true,
  commentSearchCommand: '!song',
  likeNextEnabled: false,
  likeThreshold: 100,
  giftNextEnabled: false,
  giftName: 'Rose',
  giftThreshold: 10,
  commentCooldownSeconds: 2
};

const EVENT_ICONS: Record<string, string> = { chat: '💬', gift: '🎁', like: '♥', follow: '＋', join: '👋' };

/** Filename without extension, for viewer-facing labels. */
function trackTitle(name: string): string {
  return name.replace(/\.[^.]+$/, '') || name;
}

/** Loads saved music rules, keeping only values whose type matches the defaults. */
function loadRules(): MusicRules {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('music-rules') || '{}');
    const record = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
    const rules: MusicRules = { ...DEFAULT_RULES };
    for (const key of Object.keys(DEFAULT_RULES) as (keyof MusicRules)[]) {
      if (typeof record[key] === typeof DEFAULT_RULES[key]) (rules as unknown as Record<string, unknown>)[key] = record[key];
    }
    return rules;
  } catch {
    return DEFAULT_RULES;
  }
}

const UI_ZOOM_STEPS = [0.9, 1, 1.1, 1.2, 1.3, 1.45, 1.6];
const DEFAULT_UI_ZOOM = 1.2;

function randomViewer(poolSize = 30): string {
  return `viewer_${Math.floor(Math.random() * poolSize) + 1}`;
}

/** Game test buttons reuse a small crowd so e.g. team members come back to like. */
const GAME_TEST_VIEWERS = 8;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '00:00';
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60).toString().padStart(2, '0');
  const rest = (total % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

function eventLabel(event: LiveEvent): string {
  if (event.type === 'chat' && 'comment' in event) return event.comment;
  if (event.type === 'gift' && 'giftName' in event) return `${event.giftName} ×${event.count}`;
  if (event.type === 'like' && 'count' in event) return `+${event.count} likes`;
  if (event.type === 'follow') return 'Follow';
  if (event.type === 'join') return t('Vào phòng');
  return event.type;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Electron wraps errors thrown in main: "Error invoking remote method 'x': Error: text". */
const IPC_ERROR_PREFIX = /^Error invoking remote method '[^']*': (?:\w*Error: )?/;

/**
 * Messages from main (connection status, overlay server) are Vietnamese source
 * texts, some as "Fixed prefix: detail" where the detail comes from TikTok or
 * the system; translated here at display time so a language switch applies.
 */
function translateMainMessage(message: string): string {
  const text = message.replace(IPC_ERROR_PREFIX, '');
  const colon = text.indexOf(': ');
  if (colon > 0) {
    const key = `${text.slice(0, colon)}: {error}`;
    if (lookup(key) !== undefined) return t(key, { error: text.slice(colon + 2) });
  }
  return t(text);
}

/** Locale for numbers and times in the controller. */
function locale(language: Language): string {
  return language === 'en' ? 'en-US' : 'vi-VN';
}

const FIRST_ACTION = 'Chọn game rồi bấm ▶ Bắt đầu, hoặc 🤖 Chạy thử để xem overlay.';

export default function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const playlistRef = useRef<AudioTrack[]>([]);

  const [username, setUsername] = useState('');
  const [connection, setConnection] = useState<TikTokStatus>({ status: 'disconnected' });
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  /** Comments main skipped because the room sent more than the app processes per second. */
  const [skippedComments, setSkippedComments] = useState(0);
  const [playlist, setPlaylist] = useState<AudioTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [rules, setRules] = useState<MusicRules>(loadRules);
  const [likeProgress, setLikeProgress] = useState(0);
  const [giftProgress, setGiftProgress] = useState(0);
  // null until the first action: the start hint is translated at render, so it follows the language.
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [overlayInfo, setOverlayInfo] = useState<OverlayInfo>({ url: null });
  const [overlayWindowOpen, setOverlayWindowOpen] = useState(false);
  const [testComment, setTestComment] = useState('');
  const [showTestTools, setShowTestTools] = useState(false);
  const [uiZoom, setUiZoom] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('ui-zoom'));
      return UI_ZOOM_STEPS.includes(saved) ? saved : DEFAULT_UI_ZOOM;
    } catch {
      return DEFAULT_UI_ZOOM;
    }
  });
  const [tab, setTab] = useState<'game' | 'music'>(() => {
    try {
      return localStorage.getItem('app-tab') === 'music' ? 'music' : 'game';
    } catch {
      return 'game';
    }
  });
  // Filled once useWelcomeAlerts exists; the game hook calls it for !rank / !help replies.
  const notifyRef = useRef<(message: string) => void>(() => undefined);

  const language = useLanguage();
  const ai = useAi();
  const { remember: rememberAvatar, avatarsFor } = useAvatars();

  function changeLanguage(next: Language): void {
    setLanguage(next);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Remembering the language is only a convenience.
    }
  }

  const currentTrack = currentIndex >= 0 ? playlist[currentIndex] ?? null : null;

  useEffect(() => {
    try {
      localStorage.setItem('music-rules', JSON.stringify(rules));
    } catch {
      // Storage full (e.g. a big imported dictionary): rules still work this session.
    }
  }, [rules]);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    return () => {
      playlistRef.current.forEach((track) => {
        if (track.source === 'react-file-input' && track.url.startsWith('blob:')) {
          URL.revokeObjectURL(track.url);
        }
      });
    };
  }, []);

  // Refs hold the live counters so thresholds are checked outside state updaters.
  const likeProgressRef = useRef(0);
  const giftProgressRef = useRef(0);

  const resetProgress = useCallback(() => {
    likeProgressRef.current = 0;
    giftProgressRef.current = 0;
    setLikeProgress(0);
    setGiftProgress(0);
  }, []);

  const selectTrack = useCallback((index: number, reason = t('Chọn bài')) => {
    if (!playlist.length) return;
    const normalized = (index + playlist.length) % playlist.length;
    const track = playlist[normalized];
    if (!track) return;

    if (normalized === currentIndex && audioRef.current) {
      // Same track: React state wouldn't change, so rewind the element directly.
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => undefined);
    }
    setCurrentIndex(normalized);
    setCurrentTime(0);
    resetProgress();
    setLastAction(`${reason}: ${track.name}`);
    setPlaying(true);
  }, [currentIndex, playlist, resetProgress]);

  const nextTrack = useCallback((reason = 'Next') => {
    if (!playlist.length) return;
    const next = currentIndex < 0 ? 0 : (currentIndex + 1) % playlist.length;
    selectTrack(next, reason);
  }, [currentIndex, playlist.length, selectTrack]);

  const previousTrack = useCallback(() => {
    if (!playlist.length) return;
    const prev = currentIndex <= 0 ? playlist.length - 1 : currentIndex - 1;
    selectTrack(prev, 'Previous');
  }, [currentIndex, playlist.length, selectTrack]);

  const liveConnected = connection.status === 'connected';
  const hostUsername = liveConnected ? connection.username ?? null : null;

  const games = useLiveGames({
    playlist,
    currentTrackId: currentTrack?.id ?? null,
    cooldownSeconds: rules.commentCooldownSeconds,
    hostUsername,
    onNotify: (message) => {
      setLastAction(message);
      notifyRef.current(message);
    },
    onPlayTrack: (trackId, reason) => {
      const index = playlist.findIndex((track) => track.id === trackId);
      if (index >= 0) selectTrack(index, reason);
      else setLastAction(t('Bài thắng đã bị xoá khỏi playlist'));
    },
    onAction: setLastAction
  });
  const autoPlay = useAutoPlay({
    getGame: games.getState,
    phase: games.game.phase,
    cancels: games.game.cancels,
    selectedId: games.selectedId,
    start: games.start,
    finish: games.finish,
    acceptCommand: games.acceptCommand,
    isHost: games.isHost,
    liveConnected,
    onAction: setLastAction,
    onNotify: (message) => {
      setLastAction(message);
      notifyRef.current(message);
    }
  });
  const welcome = useWelcomeAlerts(games.features);
  useEffect(() => {
    notifyRef.current = welcome.notify;
  }, [welcome.notify]);
  const bot = useDemoBot(games.testActions, sendGameTest, games.game.phase === 'running');
  useGameSounds(games.game.effects, games.game.phase, games.game.endsAt, games.features.gameSounds);
  const { setEnabled: setBotEnabled } = bot;

  // The bot is a one-round demo: never let it keep playing into the next (real) round.
  useEffect(() => {
    if (games.game.phase !== 'running' || liveConnected) setBotEnabled(false);
  }, [games.game.phase, liveConnected, setBotEnabled]);

  useEffect(() => {
    window.desktop?.setUiZoom(uiZoom);
    try {
      localStorage.setItem('ui-zoom', String(uiZoom));
    } catch {
      // Remembering the zoom is only a convenience.
    }
  }, [uiZoom]);

  function stepZoom(direction: 1 | -1): void {
    setUiZoom((old) => {
      const index = UI_ZOOM_STEPS.indexOf(old);
      return UI_ZOOM_STEPS[Math.min(UI_ZOOM_STEPS.length - 1, Math.max(0, (index < 0 ? 3 : index) + direction))] ?? old;
    });
  }

  useEffect(() => {
    try {
      localStorage.setItem('app-tab', tab);
    } catch {
      // Remembering the tab is only a convenience.
    }
  }, [tab]);
  const { acceptCommand, handleEvent: handleGameEvent } = games;
  const { handleEvent: handleWelcomeEvent } = welcome;
  const { handleEvent: handleAutoPlayEvent } = autoPlay;
  const now = useNow(games.game.phase === 'running', 500);

  // Background music: the running game's theme, the lobby theme, or a short preview from the settings.
  const [musicPreview, setMusicPreview] = useState<MusicTheme | null>(null);
  useEffect(() => {
    if (!musicPreview) return undefined;
    const timer = window.setTimeout(() => setMusicPreview(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [musicPreview]);
  const liveMusic = musicCue({
    enabled: games.features.gameMusic,
    choice: games.features.musicTheme,
    phase: games.game.phase,
    game: getGame(games.game.kind),
    lobbyOpen: autoPlay.lobby != null && games.game.phase !== 'running',
    endsAt: games.game.endsAt,
    timerStartedAt: games.game.timerStartedAt,
    now
  });
  // Never two songs at once: the game music gives way to the playlist, or turns it down.
  const withPlaylist = playing ? games.features.musicWithPlaylist : null;
  const musicCueNow = musicPreview ? { theme: musicPreview, level: 1, urgent: false } : withPlaylist === 'yield' ? null : liveMusic;
  const playlistDucked = !musicPreview && liveMusic != null && withPlaylist === 'duck';
  useGameMusic(musicCueNow, games.features.musicVolume / 100);

  const processLiveEvent = useCallback((event: LiveEvent) => {
    // First, so the follow/join bubble below already has the viewer's picture.
    rememberAvatar(event);
    handleWelcomeEvent(event);

    // The running game sees the event first; comments it consumes skip the music rules.
    const gameResult = handleGameEvent(event);
    // After the game, so e.g. a boss still takes the gift's damage before the switch.
    // Lobby votes ("2") and !doigame are consumed here so they skip the music rules.
    const consumed = handleAutoPlayEvent(event).consumed || gameResult.consumed;

    if (event.type === 'chat' && 'comment' in event && !consumed) {
      const comment = String(event.comment || '').trim();
      const lower = comment.toLowerCase();

      if (
        rules.commentNextEnabled &&
        lower === rules.commentNextCommand.trim().toLowerCase()
      ) {
        if (acceptCommand(event.user)) nextTrack(t('@{user} dùng {command}', { user: event.user, command: rules.commentNextCommand }));
        return;
      }

      if (rules.commentNumberEnabled && /^\d+$/.test(comment)) {
        const index = Number(comment) - 1;
        if (index >= 0 && index < playlist.length) {
          if (acceptCommand(event.user)) selectTrack(index, t('@{user} chọn #{number}', { user: event.user, number: comment }));
          return;
        }
      }

      const searchPrefix = `${rules.commentSearchCommand.trim().toLowerCase()} `;
      if (rules.commentSearchEnabled && lower.startsWith(searchPrefix)) {
        const query = lower.slice(searchPrefix.length).trim();
        const index = playlist.findIndex((track) => track.name.toLowerCase().includes(query));
        if (index >= 0 && acceptCommand(event.user)) {
          selectTrack(index, t('@{user} tìm “{query}”', { user: event.user, query }));
        }
      }
    }

    if (event.type === 'like' && 'count' in event && rules.likeNextEnabled) {
      const next = likeProgressRef.current + Math.max(1, Number(event.count || 1));
      if (next >= Math.max(1, Number(rules.likeThreshold || 1))) {
        nextTrack(t('Đạt {count} likes', { count: rules.likeThreshold }));
      } else {
        likeProgressRef.current = next;
        setLikeProgress(next);
      }
    }

    if (
      event.type === 'gift' &&
      'giftName' in event &&
      rules.giftNextEnabled &&
      String(event.giftName || '').toLowerCase() === rules.giftName.trim().toLowerCase()
    ) {
      const next = giftProgressRef.current + Math.max(1, Number(event.count || 1));
      if (next >= Math.max(1, Number(rules.giftThreshold || 1))) {
        nextTrack(t('Đủ {count} {gift}', { count: rules.giftThreshold, gift: rules.giftName }));
      } else {
        giftProgressRef.current = next;
        setGiftProgress(next);
      }
    }
  }, [acceptCommand, handleAutoPlayEvent, handleGameEvent, handleWelcomeEvent, nextTrack, playlist, rememberAvatar, rules, selectTrack]);

  const { game, gameView } = games;
  const { giftSwitchEnabled, giftName: switchGiftName, giftCount: switchGiftCount } = autoPlay.settings;
  const switchCommandVotes = autoPlay.settings.switchCommandVotes;
  const { switchPending } = autoPlay;
  const howTo = useMemo(() => [
    // A switch waits for the round to end: tell viewers it's coming.
    ...(switchPending ? [{ icon: '🔄', text: t('Hết ván này sẽ đổi game') }] : []),
    // Game how-to chips are static definition texts: translated here, when they are shown.
    ...games.overlayMeta.howTo.map((chip) => ({ ...chip, text: t(chip.text) })),
    ...(giftSwitchEnabled && switchGiftName.trim()
      ? [{ icon: '🎁', text: t('Tặng {gift} · đổi game', { gift: `${switchGiftCount > 1 ? `${switchGiftCount} ` : ''}${switchGiftName.trim()}` }) }]
      : []),
    ...(switchCommandVotes > 0 ? [{ icon: '🔄', text: t('!doigame · {count} người gõ là đổi game', { count: switchCommandVotes }) }] : [])
  ], [games.overlayMeta.howTo, giftSwitchEnabled, language, switchCommandVotes, switchGiftCount, switchGiftName, switchPending]);
  const { lobbyView } = autoPlay;
  const runHint = (() => {
    const s = autoPlay.settings;
    const per = s.switchBy === 'rounds' ? t('đổi game sau {count} ván', { count: s.roundsPerGame })
      : s.switchBy === 'time' ? t('đổi game sau {count} phút', { count: s.switchMinutes })
        : t('mỗi game chơi mãi đến khi có lệnh đổi game');
    const how = s.lobbyEnabled ? t('viewer bầu chọn game tiếp theo, {per}', { per }) : `${t(s.order === 'random' ? 'ngẫu nhiên' : 'lần lượt')}, ${per}`;
    const panel = t('🎮 Chọn & chuyển game');
    return s.liveMinutes
      ? t('{how}, dừng sau {minutes} phút (chỉnh ở panel {panel})', { how, minutes: s.liveMinutes, panel })
      : t('{how} (chỉnh ở panel {panel})', { how, panel });
  })();
  const overlayState = useMemo<Omit<OverlayState, 'updatedAt'>>(() => {
    const state = {
      // The game list covers the idle/finished screen until the next game starts.
      game: lobbyView && game.phase !== 'running' ? lobbyView : {
        ...gameView,
        // The definition title (static, Vietnamese): translated for the overlay here.
        title: t(game.title),
        phase: game.phase,
        endsAt: game.endsAt,
        timerStartedAt: game.timerStartedAt,
        message: game.message,
        accent: games.overlayMeta.accent,
        howTo
      },
      effects: game.effects,
      leaderboard: topScores(game, 5),
      nowPlaying: currentTrack ? trackTitle(currentTrack.name) : null,
      alerts: welcome.alerts,
      lang: language
    };
    // Profile pictures of the viewers on screen (the overlay falls back to an initial).
    return { ...state, avatars: avatarsFor(overlayAvatarNames(state)) };
  }, [avatarsFor, currentTrack, game, gameView, games.overlayMeta.accent, howTo, language, lobbyView, welcome.alerts]);

  useEffect(() => {
    window.desktop?.updateOverlay({ ...overlayState, updatedAt: Date.now() });
  }, [overlayState]);

  useEffect(() => {
    if (!window.desktop) return undefined;
    window.desktop.getOverlayInfo()
      .then(setOverlayInfo)
      .catch((error: unknown) => setOverlayInfo({ url: null, error: errorMessage(error) }));
    // The server may come up later if its port was busy at start.
    const offInfo = window.desktop.onOverlayInfo((info) => {
      setOverlayInfo(info);
      if (info.url) setLastAction(t('Overlay đã sẵn sàng.'));
    });
    const offWindow = window.desktop.onOverlayWindowChange(setOverlayWindowOpen);
    return () => {
      offInfo();
      offWindow();
    };
  }, []);

  // Clicks in the game window: ☰ back to the game list, or a game picked in the list.
  const { openMenu, pickLobby } = autoPlay;
  useEffect(() => {
    if (!window.desktop) return undefined;
    return window.desktop.onOverlayWindowAction((action) => {
      if (action.type === 'menu') openMenu();
      else pickLobby(action.index - 1);
    });
  }, [openMenu, pickLobby]);

  /** One batch per ~100 ms from main: every event is processed, then React renders once. */
  const processBatch = useCallback((batch: LiveEventBatch) => {
    for (const event of batch.events) processLiveEvent(event);
    if (batch.events.length) {
      setEvents((old) => [...batch.events.slice(-120).reverse(), ...old].slice(0, 120));
      setChatLog((old) => appendChatLog(old, batch.events));
    }
    if (batch.dropped.chat) setSkippedComments((old) => old + batch.dropped.chat);
  }, [processLiveEvent]);

  useEffect(() => {
    if (!window.desktop) return undefined;
    const offEvent = window.desktop.onTikTokEvents(processBatch);
    const offStatus = window.desktop.onTikTokStatus(setConnection);
    return () => {
      offEvent?.();
      offStatus?.();
    };
  }, [processBatch]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume * (playlistDucked ? 0.3 : 1);
  }, [playlistDucked, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (playing) {
      void audio.play().catch((error: unknown) => {
        setPlaying(false);
        setLastAction(t('Không phát được: {error}', { error: errorMessage(error) }));
      });
    } else {
      audio.pause();
    }
  }, [currentTrack, currentIndex, playing]);

  useEffect(() => {
    if (!rules.autoNextEnabled || !playing || !currentTrack) return;
    const limit = Math.max(1, Number(rules.autoNextSeconds || 1));
    if (currentTime >= limit) {
      nextTrack(t('Đủ {seconds}s', { seconds: limit }));
    }
  }, [currentTime, currentTrack, nextTrack, playing, rules.autoNextEnabled, rules.autoNextSeconds]);

  function openFilePicker(): void {
    fileInputRef.current?.click();
  }

  function handleLocalFiles(event: ChangeEvent<HTMLInputElement>): void {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (!selected.length) {
      setLastAction(t('Không có file nào được chọn'));
      return;
    }

    const tracks: AudioTrack[] = selected.map((file) => ({
      id: globalThis.crypto.randomUUID(),
      name: file.name,
      url: URL.createObjectURL(file),
      source: 'react-file-input',
      size: file.size,
      mime: file.type
    }));

    setPlaylist((old) => [...old, ...tracks]);
    if (currentIndex < 0) setCurrentIndex(0);
    setLastAction(t('Đã thêm {count} file nhạc từ máy', { count: tracks.length }));
  }

  async function addMusicNative(): Promise<void> {
    try {
      const files = await window.desktop.selectAudioFiles();
      if (!files.length) return;
      setPlaylist((old) => [...old, ...files]);
      if (currentIndex < 0) setCurrentIndex(0);
      setLastAction(t('Đã thêm {count} file bằng native picker', { count: files.length }));
    } catch (error) {
      setLastAction(t('Native picker lỗi: {error}. Hãy dùng Add music.', { error: translateMainMessage(errorMessage(error)) }));
    }
  }

  async function connect(): Promise<void> {
    try {
      setConnection({ status: 'connecting' });
      await window.desktop.connectTikTok(username);
    } catch (error) {
      setConnection({ status: 'error', message: errorMessage(error) });
    }
  }

  async function disconnect(): Promise<void> {
    await window.desktop.disconnectTikTok();
  }

  function handleUsernameKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') void connect();
  }

  function updateRule<K extends keyof MusicRules>(key: K, value: MusicRules[K]): void {
    setRules((old) => ({ ...old, [key]: value }));
  }

  function simulate(input: Parameters<typeof window.desktop.simulateTikTokEvent>[0]): void {
    void window.desktop.simulateTikTokEvent(input);
  }

  function sendGameTest(input: TestInput): void {
    const user = randomViewer(GAME_TEST_VIEWERS);
    if (input.kind === 'chat') simulate({ type: 'chat', user, comment: input.text });
    else if (input.kind === 'like') simulate({ type: 'like', user, count: input.count });
    else simulate({ type: 'gift', user, giftName: input.giftName, count: input.count });
  }

  /** "Chạy thử": start the selected game (if idle) and let the demo bot play it. */
  function runDemo(): void {
    if (games.game.phase !== 'running' && !games.start()) return;
    bot.setEnabled(true);
  }

  function closeOverlayWindow(): void {
    void window.desktop.closeOverlayWindow().then(() => setLastAction(t('Đã đóng cửa sổ game')));
  }

  function openOverlayWindow(config: OverlayConfig): void {
    window.desktop.openOverlayWindow(config)
      .then((result) => setLastAction(result.ok
        ? t('Đã mở cửa sổ game: kéo để di chuyển, bấm vào cửa sổ để hiện nút ☰ (danh sách game) và ✕. OBS → Window Capture → “Game Overlay”')
        : t('Không mở được cửa sổ game: {error}', { error: translateMainMessage(result.error ?? '') })))
      .catch((error: unknown) => setLastAction(t('Không mở được cửa sổ game: {error}', { error: translateMainMessage(errorMessage(error)) })));
  }

  function sendTestComment(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const comment = testComment.trim();
    if (!comment) return;
    simulate({ type: 'chat', user: randomViewer(), comment });
    setTestComment('');
  }

  function removeTrack(index: number): void {
    const track = playlist[index];
    if (track?.source === 'react-file-input' && track.url.startsWith('blob:')) {
      URL.revokeObjectURL(track.url);
    }

    setPlaylist((old) => old.filter((_, itemIndex) => itemIndex !== index));
    if (index === currentIndex) {
      setPlaying(false);
      setCurrentIndex(-1);
      setCurrentTime(0);
    } else if (index < currentIndex) {
      setCurrentIndex((old) => old - 1);
    }
  }

  const testVisible = connection.status !== 'connected' || showTestTools;

  const connectionText = useMemo(() => {
    const map: Record<TikTokStatus['status'], string> = {
      disconnected: t('Chưa kết nối'),
      connecting: t('Đang kết nối…'),
      connected: t('Đã kết nối'),
      error: t('Lỗi kết nối')
    };
    return map[connection.status];
  }, [connection.status, language]);
  const translatedOverlayInfo = useMemo<OverlayInfo>(
    () => (overlayInfo.error ? { ...overlayInfo, error: translateMainMessage(overlayInfo.error) } : overlayInfo),
    [overlayInfo, language]
  );

  return (
    <div className="app-shell">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
        onChange={handleLocalFiles}
        style={{ display: 'none' }}
      />

      <header className="topbar">
        <div className="brand">
          <span className="brand-logo" aria-hidden="true">🎮</span>
          <div>
            <h1>TikLiveVPN</h1>
            <p className="subtle">{t('Comment / tim / gift của viewer → game trên overlay OBS.')}</p>
          </div>
        </div>
        <div className="topbar-controls">
          <nav className="tabs" aria-label={t('Chế độ')}>
            <button className={tab === 'game' ? 'active' : ''} onClick={() => setTab('game')}>🎮 Game</button>
            <button className={tab === 'music' ? 'active' : ''} onClick={() => setTab('music')}>{t('🎵 Nhạc')}{playing ? ' ▶' : ''}</button>
          </nav>
          <div className="zoom-control" role="group" aria-label={t('Cỡ chữ giao diện')}>
            <button onClick={() => stepZoom(-1)} disabled={uiZoom <= UI_ZOOM_STEPS[0]!} title={t('Chữ nhỏ hơn')}>A−</button>
            <span>{Math.round(uiZoom * 100)}%</span>
            <button onClick={() => stepZoom(1)} disabled={uiZoom >= UI_ZOOM_STEPS[UI_ZOOM_STEPS.length - 1]!} title={t('Chữ to hơn')}>A+</button>
          </div>
          <div className="zoom-control language-control" role="group" aria-label={t('Ngôn ngữ')}>
            {LANGUAGES.map((option) => (
              <button key={option.id} className={language === option.id ? 'active' : ''} onClick={() => changeLanguage(option.id)} aria-pressed={language === option.id}>
                {option.label}
              </button>
            ))}
          </div>
          <div className={`status-pill ${connection.status}`}>
            <span className="status-dot" />
            {connectionText}
          </div>
        </div>
      </header>
      <div className="status-strip" role="status">{lastAction ?? t(FIRST_ACTION)}</div>

      {/* Both tabs stay mounted so music keeps playing while the Game tab is open. */}
      <div hidden={tab !== 'game'}>
        <main className="dashboard-grid game-dashboard">
          <div className="main-column">
            <Panel title={t('① Kết nối TikTok')} aside={connection.roomId ? `Room ${connection.roomId}` : null}>
              <div className="connect-row">
                <input
                  className="text-input"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder={t('@username đang LIVE')}
                  onKeyDown={handleUsernameKeyDown}
                />
                {connection.status === 'connected' || connection.status === 'connecting' ? (
                  <button className="button" onClick={() => void disconnect()}>{t('Ngắt kết nối')}</button>
                ) : (
                  <button className="button primary" onClick={() => void connect()}>{t('Kết nối')}</button>
                )}
              </div>
              {connection.message ? <p className="error-text">{translateMainMessage(connection.message)}</p> : null}
              {connection.status === 'connected' ? (
                testVisible ? (
                  <p className="error-text">{t('Đang LIVE: công cụ test đang bật, event test sẽ tác động lên game thật.')} <button className="link-button" onClick={() => setShowTestTools(false)}>{t('Ẩn')}</button></p>
                ) : (
                  <button className="link-button" onClick={() => setShowTestTools(true)}>{t('Hiện công cụ test')}</button>
                )
              ) : (
                <p className="field-hint">{t('Chưa LIVE vẫn thử được: chọn game rồi bấm 🤖 Chạy thử.')}</p>
              )}
            </Panel>

            <GameLibrary
              games={games.games}
              selectedId={games.selectedId}
              runningId={game.phase === 'running' ? game.kind : null}
              onSelect={games.setSelectedId}
              groups={autoPlay.settings.groups}
              activeGroupId={autoPlay.settings.activeGroupId}
              onGroupsChange={autoPlay.setSettings}
              autoRunning={autoPlay.session != null}
              runHint={runHint}
              onRun={autoPlay.begin}
              onStopRun={autoPlay.stop}
            />

            <AutoPlayPanel
              games={games.games}
              settings={autoPlay.settings}
              onChange={autoPlay.setSettings}
              session={autoPlay.session}
              loop={autoPlay.loop}
              gift={autoPlay.gift}
              onBegin={autoPlay.begin}
              onStop={autoPlay.stop}
              onSkip={autoPlay.skip}
              onSwitchLater={autoPlay.switchLater}
              onExtend={autoPlay.extend}
              lobby={autoPlay.lobby}
              onResolveLobby={autoPlay.resolveLobby}
            />
          </div>

          <aside className="side-column">
            <GamePanel
              games={games.games}
              selectedId={games.selectedId}
              rawConfigs={games.rawConfigs}
              onConfigChange={games.setConfigValue}
              onResetConfig={games.resetConfig}
              game={game}
              view={gameView}
              remainingMs={remainingMs(game, now)}
              leaderboard={overlayState.leaderboard}
              onStart={() => { games.start(); }}
              onSwitchTo={autoPlay.switchTo}
              onFinish={games.finish}
              onCancel={games.cancel}
              onResetScores={games.resetScores}
              dictionaries={{ vi: games.dictionary, en: games.englishDictionary }}
              onImportDictionary={(dictionary, text) => setLastAction(t('Đã nhập {count} từ vào từ điển {language}', {
                count: games.importDictionary(dictionary, text),
                language: t(dictionary === 'vi' ? 'tiếng Việt' : 'tiếng Anh')
              }))}
              onClearDictionary={games.clearDictionary}
              testVisible={testVisible}
              testActions={games.testActions}
              onTest={sendGameTest}
              bot={bot}
              onDemo={runDemo}
              ai={ai}
              extraTestTools={(
                <>
                  <span className="fold-label">{t('Lệnh chung & sự kiện')}</span>
                  <div className="check-row">
                    {['!start', '!stop', '!help', '!rank', '!join', '!doigame', '1', '2'].map((command) => (
                      <button key={command} className="chip" onClick={() => simulate({ type: 'chat', user: randomViewer(GAME_TEST_VIEWERS), comment: command })}>{command}</button>
                    ))}
                    <button className="chip" onClick={() => simulate({ type: 'like', user: randomViewer(GAME_TEST_VIEWERS), count: 20 })}>{t('+20 tim')}</button>
                    <button className="chip" onClick={() => simulate({ type: 'gift', user: randomViewer(GAME_TEST_VIEWERS), giftName: 'Rose', count: 1 })}>Rose</button>
                    {giftSwitchEnabled && switchGiftName.trim() ? (
                      <button className="chip" onClick={() => simulate({ type: 'gift', user: randomViewer(GAME_TEST_VIEWERS), giftName: switchGiftName.trim(), count: switchGiftCount })}>🎁 {switchGiftCount} {switchGiftName.trim()} {t('(đổi game)')}</button>
                    ) : null}
                    <button className="chip" onClick={() => simulate({ type: 'follow', user: randomViewer() })}>follow</button>
                    <button className="chip" onClick={() => simulate({ type: 'join', user: randomViewer() })}>{t('vào phòng')}</button>
                  </div>
                  <form className="test-comment" onSubmit={sendTestComment}>
                    <input
                      className="text-input"
                      value={testComment}
                      maxLength={150}
                      onChange={(event) => setTestComment(event.target.value)}
                      placeholder={t('Gõ comment thử (vd: apple, 42, A)')}
                    />
                    <button className="button" type="submit">{t('Gửi')}</button>
                  </form>
                </>
              )}
            />

            <OverlayPanel info={translatedOverlayInfo} onAction={setLastAction} onOpenWindow={openOverlayWindow} windowOpen={overlayWindowOpen} onCloseWindow={closeOverlayWindow} />
            <AiPanel ai={ai} />

            <FeaturesPanel
              features={games.features}
              onChange={games.setFeatures}
              cooldownSeconds={rules.commentCooldownSeconds}
              onCooldownChange={(seconds) => updateRule('commentCooldownSeconds', seconds)}
              hostUsername={hostUsername}
              musicPreview={musicPreview}
              onPreviewMusic={setMusicPreview}
            />

            <details className="panel fold-panel" open>
              <summary>{t('💬 Lịch sử bình luận')} <small>{chatLog.length}</small></summary>
              <ChatHistory
                log={chatLog}
                locale={locale(language)}
                isHost={(user) => games.isHost(user, false)}
                onClear={() => setChatLog([])}
                onNotify={setLastAction}
              />
            </details>

            <details className="panel fold-panel">
              <summary>{t('📜 Nhật ký LIVE')} <small>{events.length}</small>{skippedComments ? <small className="overload-note">{t('⚠ phòng quá đông: bỏ qua {count} comment', { count: skippedComments.toLocaleString(locale(language)) })}</small> : null}</summary>
              <div className="events-list">
                {!events.length ? (
                  <p className="empty-copy">{t('Comment, tim, gift… sẽ hiện ở đây.')}</p>
                ) : events.map((event) => (
                  <div className={`event-row event-${event.type}`} key={event.id}>
                    <div className="event-avatar">{EVENT_ICONS[event.type] ?? '＋'}</div>
                    <div>
                      <strong>@{event.user}</strong>
                      <p>{eventLabel(event)}</p>
                    </div>
                    <time>{new Date(event.at).toLocaleTimeString(locale(language), { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                  </div>
                ))}
              </div>
            </details>
          </aside>
        </main>
      </div>

      <div hidden={tab !== 'music'}>
        <main className="dashboard-grid">
          <div className="main-column">
            <Panel title="Music Player" aside={currentTrack?.name || t('Chưa chọn bài')}>
              <audio
                ref={audioRef}
                src={currentTrack?.url}
                onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
                onEnded={() => nextTrack(t('Hết bài'))}
                onError={(event) => {
                  const code = event.currentTarget.error?.code;
                  setLastAction(`Audio error${code ? ` (code ${code})` : ''}`);
                  setPlaying(false);
                }}
              />

              <div className="now-playing">
                <div className="cover">♫</div>
                <div className="track-info">
                  <strong>{currentTrack?.name || t('Chọn file nhạc để bắt đầu')}</strong>
                  <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
                  <input
                    className="range"
                    type="range"
                    min={0}
                    max={duration || 1}
                    step={0.1}
                    value={Math.min(currentTime, duration || 1)}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (audioRef.current) audioRef.current.currentTime = value;
                      setCurrentTime(value);
                    }}
                  />
                </div>
              </div>

              <div className="player-actions">
                <button className="button" onClick={previousTrack}>⏮ Previous</button>
                <button
                  className="button primary large"
                  onClick={() => {
                    if (!currentTrack && playlist.length) setCurrentIndex(0);
                    setPlaying((old) => !old);
                  }}
                  disabled={!playlist.length}
                >
                  {playing ? '⏸ Pause' : '▶ Play'}
                </button>
                <button className="button" onClick={() => nextTrack('Manual next')}>Next ⏭</button>
                <button className="button ghost" onClick={openFilePicker}>＋ Add music</button>
                <button className="button ghost" onClick={() => void addMusicNative()} title={t('Dùng native Electron dialog')}>Native picker</button>
              </div>

              <div className="volume-row">
                <span>Volume {Math.round(volume * 100)}%</span>
                <input
                  className="range"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                />
              </div>

              <div className="last-action">{t('Action gần nhất:')} <strong>{lastAction ?? t(FIRST_ACTION)}</strong></div>
            </Panel>

            <Panel title={`Playlist (${playlist.length})`} aside={<button className="button small" onClick={openFilePicker}>Add files</button>}>
              {!playlist.length ? (
                <button className="empty-state" onClick={openFilePicker}>
                  <strong>{t('Chưa có nhạc')}</strong>
                  <span>{t('Nhấn để chọn MP3 / M4A / WAV từ máy')}</span>
                </button>
              ) : (
                <div className="playlist">
                  {playlist.map((track, index) => (
                    <div className={`playlist-item ${index === currentIndex ? 'active' : ''}`} key={track.id}>
                      <button className="track-main" onClick={() => selectTrack(index, 'Playlist')}>
                        <span className="track-number">{index + 1}</span>
                        <span className="track-name">{track.name}</span>
                        {index === currentIndex && playing ? <span className="playing-bars">▮▮▮</span> : null}
                      </button>
                      <button className="icon-button" title={t('Xóa khỏi playlist')} onClick={() => removeTrack(index)}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <aside className="side-column">
            <Panel title={t('Rules nhạc')}>
              <div className="rule-stack">
                <Toggle
                  checked={rules.autoNextEnabled}
                  onChange={(value) => updateRule('autoNextEnabled', value)}
                  label={t('Đổi bài theo thời gian')}
                  hint={t('Nghe đủ số giây rồi tự next')}
                />
                <label className="inline-field">
                  <span>{t('Giây')}</span>
                  <input type="number" min={1} value={rules.autoNextSeconds} onChange={(event) => updateRule('autoNextSeconds', Number(event.target.value))} />
                </label>

                <Toggle
                  checked={rules.commentNextEnabled}
                  onChange={(value) => updateRule('commentNextEnabled', value)}
                  label="Comment → Next"
                  hint={t('Ví dụ viewer gõ !next')}
                />
                <label className="inline-field">
                  <span>Command</span>
                  <input value={rules.commentNextCommand} onChange={(event) => updateRule('commentNextCommand', event.target.value)} />
                </label>

                <Toggle
                  checked={rules.commentNumberEnabled}
                  onChange={(value) => updateRule('commentNumberEnabled', value)}
                  label={t('Comment số → chọn bài')}
                  hint={t('1 → bài #1, 2 → bài #2…')}
                />

                <Toggle
                  checked={rules.commentSearchEnabled}
                  onChange={(value) => updateRule('commentSearchEnabled', value)}
                  label={t('Comment tìm tên bài')}
                  hint={t('!song chill → bài chứa chữ chill')}
                />
                <label className="inline-field">
                  <span>Command</span>
                  <input value={rules.commentSearchCommand} onChange={(event) => updateRule('commentSearchCommand', event.target.value)} />
                </label>

                <Toggle
                  checked={rules.likeNextEnabled}
                  onChange={(value) => updateRule('likeNextEnabled', value)}
                  label="Likes → Next"
                  hint={`${likeProgress} / ${rules.likeThreshold}`}
                />
                <label className="inline-field">
                  <span>Threshold</span>
                  <input type="number" min={1} value={rules.likeThreshold} onChange={(event) => updateRule('likeThreshold', Number(event.target.value))} />
                </label>

                <Toggle
                  checked={rules.giftNextEnabled}
                  onChange={(value) => updateRule('giftNextEnabled', value)}
                  label="Gift → Next"
                  hint={`${giftProgress} / ${rules.giftThreshold} ${rules.giftName}`}
                />
                <label className="inline-field">
                  <span>Gift</span>
                  <input value={rules.giftName} onChange={(event) => updateRule('giftName', event.target.value)} />
                </label>
                <label className="inline-field">
                  <span>{t('Số lượng')}</span>
                  <input type="number" min={1} value={rules.giftThreshold} onChange={(event) => updateRule('giftThreshold', Number(event.target.value))} />
                </label>
              </div>
            </Panel>
          </aside>
        </main>
      </div>
    </div>
  );
}
