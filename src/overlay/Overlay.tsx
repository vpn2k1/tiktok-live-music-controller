import { useEffect, useState, type ReactNode } from 'react';
import { useNow } from '../hooks/useNow';
import { OVERLAY_STREAM_PATH, parseOverlayConfig, type OverlayWidget } from '../shared/overlay';
import type { OverlayState, OverlayWheel } from '../shared/types';

function isOverlayState(value: unknown): value is OverlayState {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<OverlayState>;
  return Boolean(record.game && typeof record.game === 'object' && Array.isArray(record.leaderboard) && Array.isArray(record.game.rows));
}

function useOverlayState(): OverlayState | null {
  const [state, setState] = useState<OverlayState | null>(null);

  useEffect(() => {
    // EventSource reconnects on its own if the app restarts.
    const source = new EventSource(OVERLAY_STREAM_PATH);
    source.onmessage = (message: MessageEvent<string>) => {
      try {
        const parsed: unknown = JSON.parse(message.data);
        if (isOverlayState(parsed)) setState(parsed);
      } catch {
        // Ignore malformed frames; the next update replaces the state.
      }
    };
    return () => source.close();
  }, []);

  return state;
}

function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = (total % 60).toString().padStart(2, '0');
  return minutes > 0 ? `${minutes}:${seconds}` : `${total}`;
}

const WHEEL_COLORS = ['#7867ff', '#e05cff', '#f59e0b', '#10b981', '#3b82f6', '#f43f5e'];
const WHEEL_TURNS = 5;

function polar(angleDeg: number, radius: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [100 + radius * Math.cos(rad), 100 + radius * Math.sin(rad)];
}

function Wheel({ wheel }: { wheel: OverlayWheel }) {
  const count = Math.max(1, wheel.segments.length);
  const slice = 360 / count;
  const rotation = wheel.target == null ? 0 : wheel.spinId * WHEEL_TURNS * 360 + (360 - (wheel.target + 0.5) * slice);

  return (
    <div className="ov-wheel">
      <span className="ov-wheel-pointer">▼</span>
      <svg viewBox="0 0 200 200" role="img" aria-label="Vòng quay thử thách">
        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: '100px 100px',
            // Only animate live spins; a freshly loaded overlay jumps straight to the result.
            transition: wheel.spinning ? `transform ${wheel.durationMs}ms cubic-bezier(.17,.67,.12,.99)` : 'none'
          }}
        >
          {wheel.segments.map((segment, index) => {
            const [x1, y1] = polar(index * slice, 96);
            const [x2, y2] = polar((index + 1) * slice, 96);
            const large = slice > 180 ? 1 : 0;
            const mid = (index + 0.5) * slice;
            const [tx, ty] = polar(mid, 58);
            const label = segment.length > 16 ? `${segment.slice(0, 15)}…` : segment;
            return (
              <g key={`${index}-${segment}`}>
                <path d={`M100,100 L${x1},${y1} A96,96 0 ${large} 1 ${x2},${y2} Z`} fill={WHEEL_COLORS[index % WHEEL_COLORS.length]} stroke="rgba(0,0,0,.35)" strokeWidth="1" />
                <text x={tx} y={ty} transform={`rotate(${mid - 90} ${tx} ${ty})`} textAnchor="middle" dominantBaseline="middle" className="ov-wheel-label">
                  {label}
                </text>
              </g>
            );
          })}
        </g>
        <circle cx="100" cy="100" r="12" fill="#11151d" stroke="#fff" strokeWidth="2" />
      </svg>
    </div>
  );
}

function useSearchConfig() {
  return parseOverlayConfig(window.location.search);
}

export default function Overlay() {
  const config = useSearchConfig();
  const state = useOverlayState();
  const running = state?.game.phase === 'running' && state.game.endsAt != null;
  const now = useNow(running);

  if (!state) {
    return (
      <div className={`overlay layout-${config.layout}`}>
        <div className="overlay-waiting">Đang chờ TikTok LIVE Music Controller…</div>
      </div>
    );
  }

  const { game, leaderboard, nowPlaying, alert } = state;
  const remaining = running && game.endsAt != null ? Math.max(0, game.endsAt - now) : 0;

  const teamTotal = game.teams ? game.teams[0].score + game.teams[1].score : 0;
  const teamLeft = game.teams ? (teamTotal ? (game.teams[0].score / teamTotal) * 100 : 50) : 50;

  const cards: Record<OverlayWidget, ReactNode> = {
    alerts: alert ? (
      <section key={alert.id} className={`ov-card ov-alert ${alert.kind}`}>
        <span className="ov-alert-icon">{alert.kind === 'follow' ? '💖' : '👋'}</span>
        <span>{alert.text}</span>
      </section>
    ) : null,
    game: game.phase !== 'idle' ? (
      <section className={`ov-card ov-game ${game.phase}`}>
        <header className="ov-game-header">
          <strong>{game.title}</strong>
          {game.phase === 'running' ? (
            game.endsAt != null
              ? <span className={`ov-countdown ${remaining <= 5000 ? 'urgent' : ''}`}>{formatCountdown(remaining)}</span>
              : <span className="ov-badge live">LIVE</span>
          ) : (
            <span className="ov-badge">Kết thúc</span>
          )}
        </header>

        {game.headline ? <div className="ov-headline">{game.headline}</div> : null}
        {game.hint ? <p className="ov-hint">{game.hint}</p> : null}

        {game.progress ? (
          <div className="ov-progress">
            <div className="ov-progress-label">
              <span>{game.progress.label}</span>
              <span>{game.progress.value} / {game.progress.max}</span>
            </div>
            <span className="ov-bar large hp">
              <span style={{ width: `${Math.min(100, Math.max(0, (game.progress.value / Math.max(1, game.progress.max)) * 100))}%` }} />
            </span>
          </div>
        ) : null}

        {game.teams ? (
          <div className="ov-teams">
            <div className="ov-team-names">
              <span>{game.teams[0].label} <small>({game.teams[0].members})</small></span>
              <span><small>({game.teams[1].members})</small> {game.teams[1].label}</span>
            </div>
            <div className="ov-tug">
              <span className="team-a" style={{ width: `${teamLeft}%` }}>{game.teams[0].score}</span>
              <span className="team-b">{game.teams[1].score}</span>
            </div>
          </div>
        ) : null}

        {game.race ? (
          <div className="ov-race">
            {game.race.lanes.length ? game.race.lanes.map((lane, index) => (
              <div key={`${index}-${lane.label}`} className="ov-lane">
                <span className="ov-lane-name">{lane.label}</span>
                <span className="ov-lane-track">
                  <span className={`ov-racer ${game.race?.icon === '🚀' ? '' : 'flip'}`} style={{ left: `calc(${lane.percent}% - ${lane.percent * 0.28}px)` }}>
                    {game.race?.icon}
                  </span>
                  <span className="ov-finish">🏁</span>
                </span>
              </div>
            )) : <p className="ov-hint">Thả tim để xuất phát!</p>}
          </div>
        ) : null}

        {game.wheel ? <Wheel wheel={game.wheel} /> : null}

        {game.rows.length ? (
          <ol className="ov-options">
            {game.rows.map((row, index) => (
              <li key={`${index}-${row.label}`} className={`ov-option ${row.highlight ? 'highlight' : ''} ${row.badge ? '' : 'no-badge'}`}>
                {row.badge ? <span className="ov-option-key">{row.badge}</span> : null}
                <span className="ov-option-body">
                  <span className="ov-option-label">{row.label}</span>
                  {row.percent != null ? <span className="ov-bar"><span style={{ width: `${row.percent}%` }} /></span> : null}
                </span>
                {row.value != null ? <span className="ov-option-votes">{row.value}</span> : null}
              </li>
            ))}
          </ol>
        ) : null}

        {game.message ? <p className="ov-message">{game.message}</p> : null}
      </section>
    ) : null,
    leaderboard: leaderboard.length ? (
      <section className="ov-card ov-leaderboard">
        <header>🏆 Bảng xếp hạng</header>
        <ol>
          {leaderboard.map((entry, index) => (
            <li key={entry.user}>
              <span className="ov-rank">{index + 1}</span>
              <span className="ov-name">{entry.nickname}</span>
              <span className="ov-points">{entry.points}</span>
            </li>
          ))}
        </ol>
      </section>
    ) : null,
    music: nowPlaying ? (
      <section className="ov-card ov-now-playing">
        <span className="ov-note">♫</span>
        <span className="ov-name">{nowPlaying}</span>
      </section>
    ) : null
  };

  const visible = config.widgets.filter((widget) => cards[widget]);

  if (config.layout === 'landscape') {
    // Each widget pinned to its own spot on the 1920×1080 canvas.
    return (
      <div className="overlay layout-landscape">
        {visible.map((widget) => (
          <div key={widget} className={`ov-slot slot-${widget}`}>
            <div className="ov-slot-inner">{cards[widget]}</div>
          </div>
        ))}
      </div>
    );
  }

  // `stack` and `portrait`: one column (portrait keeps it inside TikTok's safe zone).
  return (
    <div className={`overlay layout-${config.layout}`}>
      <div className="ov-safe">
        <div className="ov-column">
          {visible.map((widget) => <div key={widget}>{cards[widget]}</div>)}
        </div>
      </div>
    </div>
  );
}
