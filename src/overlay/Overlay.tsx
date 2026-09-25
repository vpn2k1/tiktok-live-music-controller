import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNow } from '../hooks/useNow';
import {
  fullStage,
  OVERLAY_BACKGROUNDS,
  OVERLAY_STREAM_PATH,
  OVERLAY_WINDOW_PARAM,
  parseOverlayConfig,
  STAGE_BASE_WIDTH,
  stagePadding,
  stageWidth,
  windowActionHash,
  type OverlayConfig,
  type OverlayWidget,
  type OverlayWindowAction,
  type StagePosition
} from '../shared/overlay';
import { safeAvatarUrl } from '../shared/avatar';
import { setLanguage, t } from '../shared/i18n';
import type { OverlayState } from '../shared/types';
import { AlertFeed, Confetti, EffectBanner, Popups, useEffectPlayer } from './effects';
import { AnswerTiles, Avatar, AvatarContext, CardGrid, CountdownRing, Crossword, FitBox, GameMenu, LetterTiles, RaceTrack, TugOfWar, Wheel } from './parts';

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
        if (isOverlayState(parsed)) {
          // Before the render, so this window's own labels use the app's language.
          setLanguage(parsed.lang);
          setState(parsed);
        }
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
  const frameStyle = {
    width: config.width,
    height: config.height,
    padding: `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`
  };
  if (config.size === 'full') {
    // The column fills the padded frame; the game card stretches to the full height.
    const stage = fullStage(config);
    return (
      <div className="overlay layout-canvas full" style={{ ...frameStyle, '--frame-zoom': stage.zoom } as CSSProperties}>
        <div className="ov-stage" style={{ width: stage.width, height: stage.height }}>
          <div className={`ov-column full ${stage.wide ? 'wide' : ''}`} style={{ width: stage.designWidth, height: stage.designHeight, zoom: stage.zoom }}>{children}</div>
        </div>
        {layers}
      </div>
    );
  }
  const width = stageWidth(config);
  const zoom = width / STAGE_BASE_WIDTH;
  return (
    <div
      className="overlay layout-canvas"
      style={{
        ...frameStyle,
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

/**
 * Only in the app's standalone game window (frameless): the whole page drags
 * the window, and a close bar shows while the window is focused — it hides as
 * soon as the streamer clicks back into the app, so OBS doesn't capture it.
 */
/** Game window only: tells the app about a click (main reads the URL hash; see parseWindowAction). */
function sendWindowAction(action: OverlayWindowAction): void {
  window.location.hash = windowActionHash(action, Date.now());
}

/** Game window buttons (icons only), shown while the window is focused so OBS doesn't capture them. */
function WindowControls({ menuOpen }: { menuOpen: boolean }) {
  const [focused, setFocused] = useState(() => document.hasFocus());

  useEffect(() => {
    document.documentElement.classList.add('window-mode');
    const focus = () => setFocused(true);
    const blur = () => setFocused(false);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') window.close();
    };
    window.addEventListener('focus', focus);
    window.addEventListener('blur', blur);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('focus', focus);
      window.removeEventListener('blur', blur);
      window.removeEventListener('keydown', key);
    };
  }, []);

  return (
    <>
      {menuOpen ? null : (
        <button
          type="button"
          className={`win-button win-menu ${focused ? 'show' : ''}`}
          onClick={() => sendWindowAction({ type: 'menu' })}
          title={t('Về danh sách game')}
          aria-label={t('Về danh sách game')}
        >
          ☰
        </button>
      )}
      <button
        type="button"
        className={`win-button win-close ${focused ? 'show' : ''}`}
        onClick={() => window.close()}
        title={t('Đóng cửa sổ game')}
        aria-label={t('Đóng cửa sổ game')}
      >
        ✕
      </button>
    </>
  );
}

/** Profile pictures from the state, keeping only TikTok CDN HTTPS links (the CSP allows no others). */
function checkedAvatars(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [name, url] of Object.entries(raw as Record<string, unknown>).slice(0, 64)) {
    const safe = safeAvatarUrl(url);
    if (safe) out[name] = safe;
  }
  return out;
}

export default function Overlay() {
  const [config] = useState(() => parseOverlayConfig(window.location.search));
  const [windowMode] = useState(() => new URLSearchParams(window.location.search).get(OVERLAY_WINDOW_PARAM) === '1');
  const state = useOverlayState();
  const running = state?.game.phase === 'running' && state.game.endsAt != null;
  const now = useNow(running);
  const fx = useEffectPlayer(state?.effects ?? []);
  const avatars = useMemo(() => checkedAvatars(state?.avatars), [state?.avatars]);

  useEffect(() => {
    document.body.style.background = OVERLAY_BACKGROUNDS[config.background];
  }, [config.background]);

  const menuOpen = state?.game.menu != null && state.game.phase === 'running';
  const controls = windowMode ? <WindowControls menuOpen={menuOpen} /> : null;
  /** In the game window, games in the list are picked by clicking them. */
  const pickable = windowMode && menuOpen;

  if (!state) {
    return (
      <Stage config={config} layers={controls}>
        <div className="overlay-waiting">{t('Đang chờ TikLiveVPN…')}</div>
      </Stage>
    );
  }

  const { game, leaderboard, nowPlaying, alerts } = state;
  const remaining = running && game.endsAt != null ? Math.max(0, game.endsAt - now) : 0;
  const totalMs = game.endsAt != null && game.timerStartedAt != null ? game.endsAt - game.timerStartedAt : 0;
  const headlineStyle = game.style?.headline ?? 'text';

  /** Headline, hint and the game's own visuals (wheel, crossword…), shown above the rows or the game list. */
  const intro = (
    <>
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
      {game.crossword ? <Crossword crossword={game.crossword} /> : null}
      {game.cards ? <CardGrid cards={game.cards} /> : null}
    </>
  );
  const rows = (
    <>
      {game.rows.length ? (
        game.style?.rows === 'quiz' ? <AnswerTiles rows={game.rows} /> : (
          <ol className={`ov-options ${game.rows.length > 4 ? 'many' : ''}`}>
            {game.rows.map((row, index) => (
              <li
                key={rowKey(game.rows, index)}
                className={`ov-option ${row.highlight ? 'highlight' : ''} ${row.badge ? '' : 'no-badge'}`}
                style={row.percent != null ? { '--pct': `${row.percent}%` } as CSSProperties : undefined}
              >
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
    </>
  );
  const message = game.message ? <p className="ov-message">{game.message}</p> : null;
  /** What viewers can comment / send, in full (chips wrap instead of being cut). */
  const howTo = game.phase === 'running' && game.howTo.length ? (
    <div className="ov-howto">
      {game.howTo.map((chip) => <span key={chip.text}><em>{chip.icon}</em><span className="ov-howto-text">{chip.text}</span></span>)}
    </div>
  ) : null;

  const cards: Record<OverlayWidget, ReactNode> = {
    // Follow / join bubbles float over the stage (see `feed` below) instead of taking a slot.
    alerts: null,
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
            <span className="ov-badge">{t('Kết thúc')}</span>
          )}
        </header>

        {game.menu ? (
          <>
            {intro}
            <GameMenu menu={game.menu} onPick={pickable ? (number) => sendWindowAction({ type: 'pick', index: number }) : undefined} />
            {message}
            {howTo}
          </>
        ) : (
          // The game body shrinks to fit the space above the hint chips (never overflows the card).
          <FitBox fitHeight={config.size === 'full' && config.mode !== 'stack'}>
            {intro}
            {rows}
            {message}
          </FitBox>
        )}
        {game.menu ? null : howTo}
      </section>
    ) : null,
    leaderboard: leaderboard.length ? (
      <section className="ov-card ov-leaderboard">
        <header>{t('🏆 Bảng xếp hạng')}</header>
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
  // Follow / join bubbles and like hearts rise from the bottom of the frame (3%) to mid-screen (+47%) and vanish.
  const frameZoom = config.mode === 'stack' ? 1 : config.size === 'full' ? fullStage(config).zoom : stageWidth(config) / STAGE_BASE_WIDTH;
  const feed = config.widgets.includes('alerts')
    ? <AlertFeed alerts={alerts ?? []} rise={(config.mode === 'stack' ? 360 : config.height * 0.47) / frameZoom} />
    : null;

  return (
    <AvatarContext.Provider value={avatars}>
      <Stage
        config={config}
        layers={(
          <>
            {feed}
            <Confetti fire={fx.confetti} />
            <div className="ov-banner-layer"><EffectBanner effect={fx.banner} /></div>
            {controls}
          </>
        )}
      >
        {visible.map((widget) => <div key={widget} className={`ov-slot ov-slot-${widget}`}>{cards[widget]}</div>)}
      </Stage>
    </AvatarContext.Provider>
  );
}
