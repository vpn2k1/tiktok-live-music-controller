import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent
} from 'react';
import Panel from './components/Panel';
import Toggle from './components/Toggle';
import type {
  AudioTrack,
  LiveEvent,
  MusicRules,
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
  giftThreshold: 10
};

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

  const processLiveEvent = useCallback((event: LiveEvent) => {
    setEvents((old) => [event, ...old].slice(0, 120));

    if (event.type === 'chat' && 'comment' in event) {
      const comment = String(event.comment || '').trim();
      const lower = comment.toLowerCase();

      if (
        rules.commentNextEnabled &&
        lower === rules.commentNextCommand.trim().toLowerCase()
      ) {
        nextTrack(`@${event.user} dùng ${rules.commentNextCommand}`);
        return;
      }

      if (rules.commentNumberEnabled && /^\d+$/.test(comment)) {
        const index = Number(comment) - 1;
        if (index >= 0 && index < playlist.length) {
          selectTrack(index, `@${event.user} chọn #${comment}`);
          return;
        }
      }

      const searchPrefix = `${rules.commentSearchCommand.trim().toLowerCase()} `;
      if (rules.commentSearchEnabled && lower.startsWith(searchPrefix)) {
        const query = lower.slice(searchPrefix.length).trim();
        const index = playlist.findIndex((track) => track.name.toLowerCase().includes(query));
        if (index >= 0) {
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
  }, [nextTrack, playlist, rules, selectTrack]);

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
            <div className="sim-row">
              <span>Test:</span>
              <button className="chip" onClick={() => void window.desktop.simulateTikTokEvent({ type: 'chat', comment: '!next' })}>!next</button>
              <button className="chip" onClick={() => void window.desktop.simulateTikTokEvent({ type: 'chat', comment: '2' })}>comment 2</button>
              <button className="chip" onClick={() => void window.desktop.simulateTikTokEvent({ type: 'like', count: 25 })}>+25 likes</button>
              <button className="chip" onClick={() => void window.desktop.simulateTikTokEvent({ type: 'gift', giftName: 'Rose', count: 5 })}>Rose ×5</button>
            </div>
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
          <Panel title="Rules">
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

          <Panel title="LIVE Comments & Events" aside={`${events.length} events`} className="events-panel">
            <div className="events-list">
              {!events.length ? (
                <p className="empty-copy">Kết nối LIVE hoặc dùng nút Test để xem event.</p>
              ) : events.map((event) => (
                <div className={`event-row event-${event.type}`} key={event.id}>
                  <div className="event-avatar">{event.type === 'chat' ? '💬' : event.type === 'gift' ? '🎁' : event.type === 'like' ? '♥' : '＋'}</div>
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
