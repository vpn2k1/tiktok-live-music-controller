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
import AutoPlayPanel from './components/AutoPlayPanel';
import FeaturesPanel from './components/FeaturesPanel';
import GameLibrary from './components/GameLibrary';
import GamePanel from './components/GamePanel';
import OverlayPanel from './components/OverlayPanel';
import Panel from './components/Panel';
import Toggle from './components/Toggle';
import { remainingMs, topScores } from './game/engine';
import type { TestInput } from './game/types';
import { useAutoPlay } from './game/useAutoPlay';
import { useLiveGames } from './game/useLiveGames';
import { useDemoBot } from './hooks/useDemoBot';
import { useGameSounds } from './hooks/useGameSounds';
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
  if (event.type === 'join') return 'Vào phòng';
  return event.type;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const playlistRef = useRef<AudioTrack[]>([]);

  const [username, setUsername] = useState('');
  const [connection, setConnection] = useState<TikTokStatus>({ status: 'disconnected' });
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [playlist, setPlaylist] = useState<AudioTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [rules, setRules] = useState<MusicRules>(loadRules);
  const [likeProgress, setLikeProgress] = useState(0);
  const [giftProgress, setGiftProgress] = useState(0);
  const [lastAction, setLastAction] = useState('Chọn game rồi bấm ▶ Bắt đầu, hoặc 🤖 Chạy thử để xem overlay.');
  const [overlayInfo, setOverlayInfo] = useState<OverlayInfo>({ url: null });
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

  const selectTrack = useCallback((index: number, reason = 'Chọn bài') => {
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
      else setLastAction('Bài thắng đã bị xoá khỏi playlist');
    },
    onAction: setLastAction
  });
  const autoPlay = useAutoPlay({
    getGame: games.getState,
    selectedId: games.selectedId,
    start: games.start,
    finish: games.finish,
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

  const processLiveEvent = useCallback((event: LiveEvent) => {
    setEvents((old) => [event, ...old].slice(0, 120));
    handleWelcomeEvent(event);

    // The running game sees the event first; comments it consumes skip the music rules.
    const { consumed } = handleGameEvent(event);
    // After the game, so e.g. a boss still takes the gift's damage before the switch.
    handleAutoPlayEvent(event);

    if (event.type === 'chat' && 'comment' in event && !consumed) {
      const comment = String(event.comment || '').trim();
      const lower = comment.toLowerCase();

      if (
        rules.commentNextEnabled &&
        lower === rules.commentNextCommand.trim().toLowerCase()
      ) {
        if (acceptCommand(event.user)) nextTrack(`@${event.user} dùng ${rules.commentNextCommand}`);
        return;
      }

      if (rules.commentNumberEnabled && /^\d+$/.test(comment)) {
        const index = Number(comment) - 1;
        if (index >= 0 && index < playlist.length) {
          if (acceptCommand(event.user)) selectTrack(index, `@${event.user} chọn #${comment}`);
          return;
        }
      }

      const searchPrefix = `${rules.commentSearchCommand.trim().toLowerCase()} `;
      if (rules.commentSearchEnabled && lower.startsWith(searchPrefix)) {
        const query = lower.slice(searchPrefix.length).trim();
        const index = playlist.findIndex((track) => track.name.toLowerCase().includes(query));
        if (index >= 0 && acceptCommand(event.user)) {
          selectTrack(index, `@${event.user} tìm “${query}”`);
        }
      }
    }

    if (event.type === 'like' && 'count' in event && rules.likeNextEnabled) {
      const next = likeProgressRef.current + Math.max(1, Number(event.count || 1));
      if (next >= Math.max(1, Number(rules.likeThreshold || 1))) {
        nextTrack(`Đạt ${rules.likeThreshold} likes`);
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
        nextTrack(`Đủ ${rules.giftThreshold} ${rules.giftName}`);
      } else {
        giftProgressRef.current = next;
        setGiftProgress(next);
      }
    }
  }, [acceptCommand, handleAutoPlayEvent, handleGameEvent, handleWelcomeEvent, nextTrack, playlist, rules, selectTrack]);

  const { game, gameView } = games;
  const { giftSwitchEnabled, giftName: switchGiftName, giftCount: switchGiftCount } = autoPlay.settings;
  const howTo = useMemo(() => (
    giftSwitchEnabled && switchGiftName.trim()
      ? [...games.overlayMeta.howTo, { icon: '🎁', text: `Tặng ${switchGiftCount > 1 ? `${switchGiftCount} ` : ''}${switchGiftName.trim()} · đổi game` }]
      : games.overlayMeta.howTo
  ), [games.overlayMeta.howTo, giftSwitchEnabled, switchGiftCount, switchGiftName]);
  const overlayState = useMemo<Omit<OverlayState, 'updatedAt'>>(() => ({
    game: {
      ...gameView,
      title: game.title,
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
    alert: welcome.alert
  }), [currentTrack, game, gameView, games.overlayMeta.accent, howTo, welcome.alert]);

  useEffect(() => {
    window.desktop?.updateOverlay({ ...overlayState, updatedAt: Date.now() });
  }, [overlayState]);

  useEffect(() => {
    if (!window.desktop) return undefined;
    window.desktop.getOverlayInfo()
      .then(setOverlayInfo)
      .catch((error: unknown) => setOverlayInfo({ url: null, error: errorMessage(error) }));
    // The server may come up later if its port was busy at start.
    return window.desktop.onOverlayInfo((info) => {
      setOverlayInfo(info);
      if (info.url) setLastAction('Overlay đã sẵn sàng.');
    });
  }, []);

  useEffect(() => {
    if (!window.desktop) return undefined;
    const offEvent = window.desktop.onTikTokEvent(processLiveEvent);
    const offStatus = window.desktop.onTikTokStatus(setConnection);
    return () => {
      offEvent?.();
      offStatus?.();
    };
  }, [processLiveEvent]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (playing) {
      void audio.play().catch((error: unknown) => {
        setPlaying(false);
        setLastAction(`Không phát được: ${errorMessage(error)}`);
      });
    } else {
      audio.pause();
    }
  }, [currentTrack, currentIndex, playing]);

  useEffect(() => {
    if (!rules.autoNextEnabled || !playing || !currentTrack) return;
    const limit = Math.max(1, Number(rules.autoNextSeconds || 1));
    if (currentTime >= limit) {
      nextTrack(`Đủ ${limit}s`);
    }
  }, [currentTime, currentTrack, nextTrack, playing, rules.autoNextEnabled, rules.autoNextSeconds]);

  function openFilePicker(): void {
    fileInputRef.current?.click();
  }

  function handleLocalFiles(event: ChangeEvent<HTMLInputElement>): void {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (!selected.length) {
      setLastAction('Không có file nào được chọn');
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
    setLastAction(`Đã thêm ${tracks.length} file nhạc từ máy`);
  }

  async function addMusicNative(): Promise<void> {
    try {
      const files = await window.desktop.selectAudioFiles();
      if (!files.length) return;
      setPlaylist((old) => [...old, ...files]);
      if (currentIndex < 0) setCurrentIndex(0);
      setLastAction(`Đã thêm ${files.length} file bằng native picker`);
    } catch (error) {
      setLastAction(`Native picker lỗi: ${errorMessage(error)}. Hãy dùng Add music.`);
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

  function openOverlayWindow(config: OverlayConfig): void {
    window.desktop.openOverlayWindow(config)
      .then((result) => setLastAction(result.ok ? 'Đã mở cửa sổ game: OBS → Window Capture → “Game Overlay”' : `Không mở được cửa sổ game: ${result.error ?? ''}`))
      .catch((error: unknown) => setLastAction(`Không mở được cửa sổ game: ${errorMessage(error)}`));
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
      disconnected: 'Chưa kết nối',
      connecting: 'Đang kết nối…',
      connected: 'Đã kết nối',
      error: 'Lỗi kết nối'
    };
    return map[connection.status];
  }, [connection.status]);

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
        <div>
          <h1>TikTok LIVE Game Controller</h1>
          <p className="subtle">Comment / tim / gift của viewer → game trên overlay OBS.</p>
        </div>
        <nav className="tabs" aria-label="Chế độ">
          <button className={tab === 'game' ? 'active' : ''} onClick={() => setTab('game')}>🎮 Game</button>
          <button className={tab === 'music' ? 'active' : ''} onClick={() => setTab('music')}>🎵 Nhạc{playing ? ' ▶' : ''}</button>
        </nav>
        <div className="zoom-control" role="group" aria-label="Cỡ chữ giao diện">
          <button onClick={() => stepZoom(-1)} disabled={uiZoom <= UI_ZOOM_STEPS[0]!} title="Chữ nhỏ hơn">A−</button>
          <span>{Math.round(uiZoom * 100)}%</span>
          <button onClick={() => stepZoom(1)} disabled={uiZoom >= UI_ZOOM_STEPS[UI_ZOOM_STEPS.length - 1]!} title="Chữ to hơn">A+</button>
        </div>
        <div className={`status-pill ${connection.status}`}>
          <span className="status-dot" />
          {connectionText}
        </div>
      </header>
      <div className="status-strip" role="status">{lastAction}</div>

      {/* Both tabs stay mounted so music keeps playing while the Game tab is open. */}
      <div hidden={tab !== 'game'}>
        <main className="dashboard-grid">
          <div className="main-column">
            <Panel title="① Kết nối TikTok" aside={connection.roomId ? `Room ${connection.roomId}` : null}>
              <div className="connect-row">
                <input
                  className="text-input"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="@username đang LIVE"
                  onKeyDown={handleUsernameKeyDown}
                />
                {connection.status === 'connected' || connection.status === 'connecting' ? (
                  <button className="button" onClick={() => void disconnect()}>Ngắt kết nối</button>
                ) : (
                  <button className="button primary" onClick={() => void connect()}>Kết nối</button>
                )}
              </div>
              {connection.message ? <p className="error-text">{connection.message}</p> : null}
              {connection.status === 'connected' ? (
                testVisible ? (
                  <p className="error-text">Đang LIVE: công cụ test đang bật, event test sẽ tác động lên game thật. <button className="link-button" onClick={() => setShowTestTools(false)}>Ẩn</button></p>
                ) : (
                  <button className="link-button" onClick={() => setShowTestTools(true)}>Hiện công cụ test</button>
                )
              ) : (
                <p className="field-hint">Chưa LIVE vẫn thử được: chọn game rồi bấm 🤖 Chạy thử.</p>
              )}
            </Panel>

            <GameLibrary
              games={games.games}
              selectedId={games.selectedId}
              runningId={game.phase === 'running' ? game.kind : null}
              onSelect={games.setSelectedId}
            />

            <AutoPlayPanel
              games={games.games}
              settings={autoPlay.settings}
              onChange={autoPlay.setSettings}
              session={autoPlay.session}
              gift={autoPlay.gift}
              onBegin={autoPlay.begin}
              onStop={autoPlay.stop}
              onSkip={autoPlay.skip}
              onExtend={autoPlay.extend}
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
              onFinish={games.finish}
              onCancel={games.cancel}
              onResetScores={games.resetScores}
              dictionaries={{ vi: games.dictionary, en: games.englishDictionary }}
              onImportDictionary={(language, text) => setLastAction(`Đã nhập ${games.importDictionary(language, text)} từ vào từ điển ${language === 'vi' ? 'tiếng Việt' : 'tiếng Anh'}`)}
              onClearDictionary={games.clearDictionary}
              testVisible={testVisible}
              testActions={games.testActions}
              onTest={sendGameTest}
              bot={bot}
              onDemo={runDemo}
              extraTestTools={(
                <>
                  <span className="fold-label">Lệnh chung & sự kiện</span>
                  <div className="check-row">
                    {['!start', '!stop', '!help', '!rank', '!join'].map((command) => (
                      <button key={command} className="chip" onClick={() => simulate({ type: 'chat', user: randomViewer(GAME_TEST_VIEWERS), comment: command })}>{command}</button>
                    ))}
                    <button className="chip" onClick={() => simulate({ type: 'like', user: randomViewer(GAME_TEST_VIEWERS), count: 20 })}>+20 tim</button>
                    <button className="chip" onClick={() => simulate({ type: 'gift', user: randomViewer(GAME_TEST_VIEWERS), giftName: 'Rose', count: 1 })}>Rose</button>
                    {giftSwitchEnabled && switchGiftName.trim() ? (
                      <button className="chip" onClick={() => simulate({ type: 'gift', user: randomViewer(GAME_TEST_VIEWERS), giftName: switchGiftName.trim(), count: switchGiftCount })}>🎁 {switchGiftCount} {switchGiftName.trim()} (đổi game)</button>
                    ) : null}
                    <button className="chip" onClick={() => simulate({ type: 'follow', user: randomViewer() })}>follow</button>
                    <button className="chip" onClick={() => simulate({ type: 'join', user: randomViewer() })}>vào phòng</button>
                  </div>
                  <form className="test-comment" onSubmit={sendTestComment}>
                    <input
                      className="text-input"
                      value={testComment}
                      maxLength={150}
                      onChange={(event) => setTestComment(event.target.value)}
                      placeholder="Gõ comment thử (vd: apple, 42, A)"
                    />
                    <button className="button" type="submit">Gửi</button>
                  </form>
                </>
              )}
            />

            <OverlayPanel info={overlayInfo} onAction={setLastAction} onOpenWindow={openOverlayWindow} />

            <FeaturesPanel
              features={games.features}
              onChange={games.setFeatures}
              cooldownSeconds={rules.commentCooldownSeconds}
              onCooldownChange={(seconds) => updateRule('commentCooldownSeconds', seconds)}
              hostUsername={hostUsername}
            />

            <details className="panel fold-panel">
              <summary>📜 Nhật ký LIVE <small>{events.length}</small></summary>
              <div className="events-list">
                {!events.length ? (
                  <p className="empty-copy">Comment, tim, gift… sẽ hiện ở đây.</p>
                ) : events.map((event) => (
                  <div className={`event-row event-${event.type}`} key={event.id}>
                    <div className="event-avatar">{EVENT_ICONS[event.type] ?? '＋'}</div>
                    <div>
                      <strong>@{event.user}</strong>
                      <p>{eventLabel(event)}</p>
                    </div>
                    <time>{new Date(event.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
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
            <Panel title="Music Player" aside={currentTrack?.name || 'Chưa chọn bài'}>
              <audio
                ref={audioRef}
                src={currentTrack?.url}
                onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
                onEnded={() => nextTrack('Hết bài')}
                onError={(event) => {
                  const code = event.currentTarget.error?.code;
                  setLastAction(`Audio error${code ? ` (code ${code})` : ''}`);
                  setPlaying(false);
                }}
              />

              <div className="now-playing">
                <div className="cover">♫</div>
                <div className="track-info">
                  <strong>{currentTrack?.name || 'Chọn file nhạc để bắt đầu'}</strong>
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
                <button className="button ghost" onClick={() => void addMusicNative()} title="Dùng native Electron dialog">Native picker</button>
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

              <div className="last-action">Action gần nhất: <strong>{lastAction}</strong></div>
            </Panel>

            <Panel title={`Playlist (${playlist.length})`} aside={<button className="button small" onClick={openFilePicker}>Add files</button>}>
              {!playlist.length ? (
                <button className="empty-state" onClick={openFilePicker}>
                  <strong>Chưa có nhạc</strong>
                  <span>Nhấn để chọn MP3 / M4A / WAV từ máy</span>
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
                      <button className="icon-button" title="Xóa khỏi playlist" onClick={() => removeTrack(index)}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <aside className="side-column">
            <Panel title="Rules nhạc">
              <div className="rule-stack">
                <Toggle
                  checked={rules.autoNextEnabled}
                  onChange={(value) => updateRule('autoNextEnabled', value)}
                  label="Đổi bài theo thời gian"
                  hint="Nghe đủ số giây rồi tự next"
                />
                <label className="inline-field">
                  <span>Giây</span>
                  <input type="number" min={1} value={rules.autoNextSeconds} onChange={(event) => updateRule('autoNextSeconds', Number(event.target.value))} />
                </label>

                <Toggle
                  checked={rules.commentNextEnabled}
                  onChange={(value) => updateRule('commentNextEnabled', value)}
                  label="Comment → Next"
                  hint="Ví dụ viewer gõ !next"
                />
                <label className="inline-field">
                  <span>Command</span>
                  <input value={rules.commentNextCommand} onChange={(event) => updateRule('commentNextCommand', event.target.value)} />
                </label>

                <Toggle
                  checked={rules.commentNumberEnabled}
                  onChange={(value) => updateRule('commentNumberEnabled', value)}
                  label="Comment số → chọn bài"
                  hint="1 → bài #1, 2 → bài #2…"
                />

                <Toggle
                  checked={rules.commentSearchEnabled}
                  onChange={(value) => updateRule('commentSearchEnabled', value)}
                  label="Comment tìm tên bài"
                  hint="!song chill → bài chứa chữ chill"
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
                  <span>Số lượng</span>
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
