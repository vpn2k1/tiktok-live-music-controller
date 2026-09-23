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
import FeaturesPanel from './components/FeaturesPanel';
import GamePanel from './components/GamePanel';
import OverlayPanel from './components/OverlayPanel';
import Panel from './components/Panel';
import Toggle from './components/Toggle';
import { remainingMs, topScores } from './game/engine';
import type { TestInput } from './game/types';
import { useLiveGames } from './game/useLiveGames';
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
  const [rules, setRules] = useState<MusicRules>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('music-rules') || '{}') as Partial<MusicRules>;
      return { ...DEFAULT_RULES, ...saved };
    } catch {
      return DEFAULT_RULES;
    }
  });
  const [likeProgress, setLikeProgress] = useState(0);
  const [giftProgress, setGiftProgress] = useState(0);
  const [lastAction, setLastAction] = useState('Chưa có action');
  const [overlayInfo, setOverlayInfo] = useState<OverlayInfo>({ url: null });
  const [testComment, setTestComment] = useState('');
  const [showTestTools, setShowTestTools] = useState(false);

  const currentTrack = currentIndex >= 0 ? playlist[currentIndex] ?? null : null;

  useEffect(() => {
    localStorage.setItem('music-rules', JSON.stringify(rules));
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

  const resetProgress = useCallback(() => {
    setLikeProgress(0);
    setGiftProgress(0);
  }, []);

  const selectTrack = useCallback((index: number, reason = 'Chọn bài') => {
    if (!playlist.length) return;
    const normalized = (index + playlist.length) % playlist.length;
    const track = playlist[normalized];
    if (!track) return;

    setCurrentIndex(normalized);
    setCurrentTime(0);
    resetProgress();
    setLastAction(`${reason}: ${track.name}`);
    setPlaying(true);
  }, [playlist, resetProgress]);

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

  const games = useLiveGames({
    playlist,
    currentTrackId: currentTrack?.id ?? null,
    cooldownSeconds: rules.commentCooldownSeconds,
    onPlayTrack: (trackId, reason) => {
      const index = playlist.findIndex((track) => track.id === trackId);
      if (index >= 0) selectTrack(index, reason);
      else setLastAction('Bài thắng đã bị xoá khỏi playlist');
    },
    onAction: setLastAction
  });
  const welcome = useWelcomeAlerts(games.features);
  const { acceptCommand, handleEvent: handleGameEvent } = games;
  const { handleEvent: handleWelcomeEvent } = welcome;
  const now = useNow(games.game.phase === 'running', 500);

  const processLiveEvent = useCallback((event: LiveEvent) => {
    setEvents((old) => [event, ...old].slice(0, 120));
    handleWelcomeEvent(event);

    // The running game sees the event first; comments it consumes skip the music rules.
    const { consumed } = handleGameEvent(event);

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
      setLikeProgress((old) => {
        const next = old + Math.max(1, Number(event.count || 1));
        if (next >= Math.max(1, Number(rules.likeThreshold || 1))) {
          queueMicrotask(() => nextTrack(`Đạt ${rules.likeThreshold} likes`));
          return 0;
        }
        return next;
      });
    }

    if (
      event.type === 'gift' &&
      'giftName' in event &&
      rules.giftNextEnabled &&
      String(event.giftName || '').toLowerCase() === rules.giftName.trim().toLowerCase()
    ) {
      setGiftProgress((old) => {
        const next = old + Math.max(1, Number(event.count || 1));
        if (next >= Math.max(1, Number(rules.giftThreshold || 1))) {
          queueMicrotask(() => nextTrack(`Đủ ${rules.giftThreshold} ${rules.giftName}`));
          return 0;
        }
        return next;
      });
    }
  }, [acceptCommand, handleGameEvent, handleWelcomeEvent, nextTrack, playlist, rules, selectTrack]);

  const { game, gameView } = games;
  const overlayState = useMemo<Omit<OverlayState, 'updatedAt'>>(() => ({
    game: {
      ...gameView,
      title: game.title,
      phase: game.phase,
      endsAt: game.endsAt,
      message: game.message
    },
    leaderboard: topScores(game, 5),
    nowPlaying: currentTrack ? trackTitle(currentTrack.name) : null,
    alert: welcome.alert
  }), [currentTrack, game, gameView, welcome.alert]);

  useEffect(() => {
    window.desktop?.updateOverlay({ ...overlayState, updatedAt: Date.now() });
  }, [overlayState]);

  useEffect(() => {
    if (!window.desktop) return;
    window.desktop.getOverlayInfo()
      .then(setOverlayInfo)
      .catch((error: unknown) => setOverlayInfo({ url: null, error: errorMessage(error) }));
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
          <p className="eyebrow">REACT + ELECTRON + TYPESCRIPT</p>
          <h1>TikTok LIVE Music Controller</h1>
          <p className="subtle">Comment / Like / Gift → điều khiển playlist nhạc local.</p>
        </div>
        <div className={`status-pill ${connection.status}`}>
          <span className="status-dot" />
          {connectionText}
        </div>
      </header>

      <main className="dashboard-grid">
        <div className="main-column">
          <Panel title="TikTok LIVE" aside={connection.roomId ? `Room ${connection.roomId}` : null}>
            <div className="connect-row">
              <input
                className="text-input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="@username đang LIVE"
                onKeyDown={handleUsernameKeyDown}
              />
              <button className="button primary" onClick={() => void connect()}>Connect</button>
              <button className="button" onClick={() => void disconnect()}>Disconnect</button>
            </div>
            {connection.message ? <p className="error-text">{connection.message}</p> : null}
            {testVisible ? (
              <>
                {connection.status === 'connected' ? (
                  <p className="error-text">Đang kết nối LIVE: event test sẽ tác động lên game và nhạc thật.</p>
                ) : (
                  <p className="field-hint test-hint">Chưa kết nối TikTok, hãy dùng các nút test bên dưới và trong panel Game để thử.</p>
                )}
                <div className="sim-row">
                  <span>Test:</span>
                  <button className="chip" onClick={() => simulate({ type: 'chat', comment: '!next' })}>!next</button>
                  <button className="chip" onClick={() => simulate({ type: 'chat', user: randomViewer(), comment: String(Math.floor(Math.random() * 3) + 1) })}>comment 1–3</button>
                  <button className="chip" onClick={() => simulate({ type: 'chat', user: randomViewer(), comment: ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)] })}>comment A–D</button>
                  <button className="chip" onClick={() => simulate({ type: 'like', user: randomViewer(), count: Math.floor(Math.random() * 26) + 5 })}>like ngẫu nhiên</button>
                  <button className="chip" onClick={() => simulate({ type: 'gift', user: randomViewer(), giftName: 'Rose', count: 5 })}>Rose ×5</button>
                  <button className="chip" onClick={() => simulate({ type: 'follow', user: randomViewer() })}>follow</button>
                  <button className="chip" onClick={() => simulate({ type: 'join', user: randomViewer() })}>vào phòng</button>
                </div>
                <form className="test-comment" onSubmit={sendTestComment}>
                  <input
                    className="text-input"
                    value={testComment}
                    maxLength={150}
                    onChange={(event) => setTestComment(event.target.value)}
                    placeholder="Comment thử từ viewer ngẫu nhiên (vd: nhạc sĩ, 42, A)"
                  />
                  <button className="button" type="submit">Gửi</button>
                </form>
                {connection.status === 'connected' ? (
                  <button className="button small ghost" onClick={() => setShowTestTools(false)}>Ẩn công cụ test</button>
                ) : null}
              </>
            ) : (
              <button className="button small ghost show-test" onClick={() => setShowTestTools(true)}>🧪 Hiện công cụ test</button>
            )}
          </Panel>

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
          <GamePanel
            games={games.games}
            selectedId={games.selectedId}
            onSelect={games.setSelectedId}
            rawConfigs={games.rawConfigs}
            onConfigChange={games.setConfigValue}
            onResetConfig={games.resetConfig}
            game={game}
            view={gameView}
            remainingMs={remainingMs(game, now)}
            leaderboard={overlayState.leaderboard}
            onStart={games.start}
            onFinish={games.finish}
            onCancel={games.cancel}
            onResetScores={games.resetScores}
            dictionaries={{ vi: games.dictionary, en: games.englishDictionary }}
            onImportDictionary={(language, text) => setLastAction(`Đã nhập ${games.importDictionary(language, text)} từ vào từ điển ${language === 'vi' ? 'tiếng Việt' : 'tiếng Anh'}`)}
            onClearDictionary={games.clearDictionary}
            testVisible={testVisible}
            testActions={games.testActions}
            onTest={sendGameTest}
          />

          <OverlayPanel info={overlayInfo} onAction={setLastAction} />

          <FeaturesPanel features={games.features} onChange={games.setFeatures} />

          <Panel title="Rules">
            <div className="rule-stack">
              <label className="inline-field flush">
                <span>Chống spam (giây)</span>
                <input type="number" min={0} max={60} value={rules.commentCooldownSeconds} onChange={(event) => updateRule('commentCooldownSeconds', Number(event.target.value))} />
              </label>
              <p className="field-hint">Mỗi viewer chỉ được 1 lệnh comment trong khoảng này. 0 = tắt.</p>

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

          <Panel title="LIVE Comments & Events" aside={`${events.length} events`} className="events-panel">
            <div className="events-list">
              {!events.length ? (
                <p className="empty-copy">Kết nối LIVE hoặc dùng nút Test để xem event.</p>
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
          </Panel>
        </aside>
      </main>
    </div>
  );
}
