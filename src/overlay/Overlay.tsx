import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useNow } from '../hooks/useNow';
import {
  OVERLAY_BACKGROUNDS,
  OVERLAY_STREAM_PATH,
  parseOverlayConfig,
  STAGE_BASE_WIDTH,
  stagePadding,
  stageWidth,
  type OverlayConfig,
  type OverlayWidget,
  type StagePosition
} from '../shared/overlay';
import type { OverlayState } from '../shared/types';
import { Confetti, EffectBanner, Popups, useEffectPlayer } from './effects';
import { AnswerTiles, Avatar, CountdownRing, LetterTiles, RaceTrack, TugOfWar, Wheel } from './parts';

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

const JUSTIFY: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };
const ALIGN: Record<string, string> = { top: 'flex-start', center: 'center', bottom: 'flex-end' };
const MEDALS = ['🥇', '🥈', '🥉'];

/** Key by content so re-ordered rows (rankings) move instead of remounting and replaying their animation. */
function rowKey(rows: { label: string }[], index: number): string {
  const label = rows[index]?.label ?? '';
  const duplicatesBefore = rows.slice(0, index).filter((row) => row.label === label).length;
  return duplicatesBefore ? `${label}#${duplicatesBefore}` : label;
}

/** Flexbox alignment for one of the 9 stage positions. */
function stageAlignment(position: StagePosition): { justifyContent: string; alignItems: string } {
  const [first = 'center', second] = position.split('-');
  const vertical = first === 'top' || first === 'bottom' ? first : 'center';
  const horizontal = second ?? (first === 'left' || first === 'right' ? first : 'center');
  return { justifyContent: JUSTIFY[horizontal] ?? 'center', alignItems: ALIGN[vertical] ?? 'center' };
}

/** The video frame: fixed W×H, column placed by position and zoomed to the chosen size; `layers` cover the whole frame. */
function Stage({ config, children, layers }: { config: OverlayConfig; children: ReactNode; layers?: ReactNode }) {
  if (config.mode === 'stack') {
    return (
      <div className="overlay layout-stack">
        <div className="ov-safe"><div className="ov-column">{children}</div></div>
        {layers}
      </div>
    );
  }
  const padding = stagePadding(config);
  const width = stageWidth(config);
  const zoom = width / STAGE_BASE_WIDTH;
  return (
    <div
      className="overlay layout-canvas"
      style={{
        width: config.width,
        height: config.height,
        padding: `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`,
        ...stageAlignment(config.position),
        '--frame-zoom': zoom
      } as CSSProperties}
    >
      <div className="ov-stage" style={{ width }}>
        <div className="ov-column" style={{ width: STAGE_BASE_WIDTH, zoom }}>{children}</div>
      </div>
      {layers}
    </div>
  );
}

export default function Overlay() {
  const [config] = useState(() => parseOverlayConfig(window.location.search));
  const state = useOverlayState();
  const running = state?.game.phase === 'running' && state.game.endsAt != null;
  const now = useNow(running);
  const fx = useEffectPlayer(state?.effects ?? []);

  useEffect(() => {
    document.body.style.background = OVERLAY_BACKGROUNDS[config.background];
  }, [config.background]);

  if (!state) {
    return (
      <Stage config={config}>
        <div className="overlay-waiting">Đang chờ TikTok LIVE Game Controller…</div>
      </Stage>
    );
  }

  const { game, leaderboard, nowPlaying, alert } = state;
  const remaining = running && game.endsAt != null ? Math.max(0, game.endsAt - now) : 0;
  const totalMs = game.endsAt != null && game.timerStartedAt != null ? game.endsAt - game.timerStartedAt : 0;
  const headlineStyle = game.style?.headline ?? 'text';

  const cards: Record<OverlayWidget, ReactNode> = {
    alerts: alert ? (
      <section key={alert.id} className={`ov-card ov-alert ${alert.kind}`}>
        <span className="ov-alert-icon">{alert.kind === 'follow' ? '💖' : alert.kind === 'join' ? '👋' : '💬'}</span>
        <span>{alert.text}</span>
      </section>
    ) : null,
    game: game.phase !== 'idle' ? (
      <section
        // Alternating class names restart the shake animation without remounting the card.
        className={`ov-card ov-game ${game.phase} ${fx.shake ? `shake-${fx.shake % 2}` : ''}`}
        style={{ '--accent': game.accent } as CSSProperties}
      >
        <Popups popups={fx.popups} />
        <header className="ov-game-header">
          <strong>{game.title}</strong>
          {game.phase === 'running' ? (
            game.endsAt != null
              ? <CountdownRing remainingMs={remaining} totalMs={totalMs} />
              : <span className="ov-badge live">● LIVE</span>
          ) : (
            <span className="ov-badge">Kết thúc</span>
          )}
        </header>

        {game.headline ? (
          headlineStyle === 'tiles' ? <LetterTiles text={game.headline} />
            : headlineStyle === 'boss' ? <div className="ov-boss">{game.headline}</div>
              : <div className="ov-headline">{game.headline}</div>
        ) : null}
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

        {game.teams ? <TugOfWar teams={game.teams} /> : null}
        {game.race ? <RaceTrack race={game.race} /> : null}
        {game.wheel ? <Wheel wheel={game.wheel} /> : null}

        {game.rows.length ? (
          game.style?.rows === 'quiz' ? <AnswerTiles rows={game.rows} /> : (
            <ol className="ov-options">
              {game.rows.map((row, index) => (
                <li key={rowKey(game.rows, index)} className={`ov-option ${row.highlight ? 'highlight' : ''} ${row.badge ? '' : 'no-badge'}`}>
                  {row.badge ? <span className="ov-option-key">{row.badge}</span> : null}
                  <span className="ov-option-body">
                    <span className="ov-option-label">{row.avatar ? <Avatar name={row.avatar} size={22} /> : null}{row.label}</span>
                    {row.percent != null ? <span className="ov-bar"><span style={{ width: `${row.percent}%` }} /></span> : null}
                  </span>
                  {row.value != null ? <span className="ov-option-votes">{row.value}</span> : null}
                </li>
              ))}
            </ol>
          )
        ) : null}

        {game.message ? <p className="ov-message">{game.message}</p> : null}

        {game.phase === 'running' && game.howTo.length ? (
          <div className="ov-howto">
            {game.howTo.map((chip) => <span key={chip.text}><em>{chip.icon}</em>{chip.text}</span>)}
          </div>
        ) : null}
      </section>
    ) : null,
    leaderboard: leaderboard.length ? (
      <section className="ov-card ov-leaderboard">
        <header>🏆 Bảng xếp hạng</header>
        <ol>
          {leaderboard.map((entry, index) => (
            <li key={entry.user} className={index < 3 ? `top top-${index + 1}` : ''}>
              <span className="ov-rank">{MEDALS[index] ?? index + 1}</span>
              <Avatar name={entry.nickname} size={26} />
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

  return (
    <Stage
      config={config}
      layers={(
        <>
          <Confetti fire={fx.confetti} />
          <div className="ov-banner-layer"><EffectBanner effect={fx.banner} /></div>
        </>
      )}
    >
      {visible.map((widget) => <div key={widget}>{cards[widget]}</div>)}
    </Stage>
  );
}
