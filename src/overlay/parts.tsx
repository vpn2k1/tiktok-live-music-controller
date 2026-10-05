import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { OverlayArena, OverlayCards, OverlayCrossword, OverlayGrid, OverlayGrow, OverlayMenu, OverlayRace, OverlayRow, OverlayTeam, OverlayWheel } from '../shared/types';
import { t } from '../shared/i18n';

/** Stable, bright color for a viewer name (no network avatars needed). */
export function nameColor(name: string): string {
  // FNV-1a spreads names that differ only in their last character ("viewer_1", "viewer_7").
  let hash = 0x811c9dc5;
  for (const char of name) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  // Golden-angle step keeps neighbouring hashes far apart on the color wheel.
  const hue = Math.round(((hash >>> 0) * 137.508) % 360);
  return `hsl(${hue} 78% 56%)`;
}

/** Viewer profile pictures by displayed name (OverlayState.avatars, re-checked by the overlay). */
export const AvatarContext = createContext<Record<string, string>>({});
/** Pictures that failed to load (expired link, offline): don't retry them. */
const failedAvatars = new Set<string>();

/** The viewer's TikTok profile picture, or a colored initial badge when there is none. */
export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const avatars = useContext(AvatarContext);
  const [failed, setFailed] = useState(false);
  const clean = name.replace(/^@/, '').trim();
  const url = avatars[clean];
  if (url && !failed && !failedAvatars.has(url)) {
    return (
      <img
        className="ov-avatar photo"
        src={url}
        alt=""
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
        decoding="async"
        onError={() => {
          failedAvatars.add(url);
          setFailed(true);
        }}
      />
    );
  }
  const initial = Array.from(clean)[0]?.toUpperCase() ?? '?';
  return (
    <span className="ov-avatar" style={{ width: size, height: size, fontSize: size * 0.48, background: nameColor(clean) }} aria-hidden="true">
      {initial}
    </span>
  );
}

/** Circular countdown; turns red and pulses in the last 5 seconds. */
export function CountdownRing({ remainingMs, totalMs }: { remainingMs: number; totalMs: number }) {
  const radius = 21;
  const circumference = 2 * Math.PI * radius;
  const fraction = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const seconds = Math.ceil(remainingMs / 1000);
  const label = seconds >= 60 ? `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}` : String(seconds);
  return (
    <span className={`ov-ring ${remainingMs <= 5000 ? 'urgent' : ''}`}>
      <svg viewBox="0 0 50 50" aria-hidden="true">
        <circle cx="25" cy="25" r={radius} className="ov-ring-track" />
        <circle
          cx="25"
          cy="25"
          r={radius}
          className="ov-ring-fill"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span className="ov-ring-label">{label}</span>
    </span>
  );
}

/** Splits a headline into letter tiles ("K Y N O M E", "_ P P _ _", "cà phê"). */
export function LetterTiles({ text }: { text: string }) {
  const words = text.trim().split(/\s{2,}/);
  return (
    <div className="ov-tiles">
      {words.map((word, wordIndex) => {
        const tokens = word.split(' ');
        const letters = tokens.every((token) => Array.from(token).length === 1) ? tokens : Array.from(word);
        return (
          <span key={wordIndex} className="ov-tile-word">
            {letters.map((letter, index) => (
              letter === ' '
                ? <span key={index} className="ov-tile-gap" />
                : <span key={index} className={`ov-tile ${letter === '_' ? 'blank' : ''}`} style={{ animationDelay: `${index * 40}ms` }}>{letter === '_' ? '' : letter}</span>
            ))}
          </span>
        );
      })}
    </div>
  );
}

const QUIZ_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c'];
const QUIZ_SHAPES = ['▲', '◆', '●', '■'];

/** Kahoot-style colored answer tiles (quiz and vote). */
export function AnswerTiles({ rows }: { rows: OverlayRow[] }) {
  const revealed = rows.some((row) => row.highlight);
  return (
    <div className="ov-answers">
      {rows.map((row, index) => (
        <div
          key={`${index}-${row.label}`}
          className={`ov-answer ${row.highlight ? 'correct' : ''} ${revealed && !row.highlight ? 'dim' : ''}`}
          style={{ '--tile': QUIZ_COLORS[index % QUIZ_COLORS.length] } as CSSProperties}
        >
          <span className="ov-answer-shape">{row.badge ?? QUIZ_SHAPES[index % QUIZ_SHAPES.length]}</span>
          <span className="ov-answer-label">{row.label}</span>
          {row.value != null ? <span className="ov-answer-value">{row.value}</span> : null}
          {row.percent != null ? <span className="ov-answer-bar" style={{ width: `${row.percent}%` }} /> : null}
        </div>
      ))}
    </div>
  );
}

/** Tug-of-war: the leading team's color takes more of the rope; the knot marks the boundary. */
export function TugOfWar({ teams }: { teams: [OverlayTeam, OverlayTeam] }) {
  const total = teams[0].score + teams[1].score;
  const share = total ? teams[0].score / total : 0.5;
  // Boundary between the two colors, kept within 10–90% so both teams stay visible.
  const knot = 50 + (share - 0.5) * 80;
  return (
    <div className="ov-tug">
      <div className="ov-tug-teams">
        <div className="ov-tug-team a">
          <strong>{teams[0].label}</strong>
          <span>{t('{count} người', { count: teams[0].members })}</span>
          <b>{teams[0].score}</b>
        </div>
        <span className="ov-vs">VS</span>
        <div className="ov-tug-team b">
          <strong>{teams[1].label}</strong>
          <span>{t('{count} người', { count: teams[1].members })}</span>
          <b>{teams[1].score}</b>
        </div>
      </div>
      <div className="ov-rope">
        <span className="ov-rope-fill a" style={{ width: `${knot}%` }} />
        <span className="ov-rope-fill b" style={{ width: `${100 - knot}%` }} />
        <span className="ov-knot" style={{ left: `${knot}%` }} aria-hidden="true" />
        <span className="ov-rope-mid" />
      </div>
    </div>
  );
}

/** Race lanes with name badges riding on the track; the leader wears a crown. */
export function RaceTrack({ race }: { race: OverlayRace }) {
  if (!race.lanes.length) return <p className="ov-hint big">{race.emptyHint ?? t('❤️ Thả tim để xuất phát!')}</p>;
  const flip = race.icon !== '🚀';
  return (
    <div className="ov-race">
      {race.lanes.map((lane, index) => (
        <div key={`${index}-${lane.label}`} className="ov-lane" style={{ '--lane': nameColor(lane.label) } as CSSProperties}>
          <span className="ov-lane-track">
            <span className="ov-racer" style={{ left: `calc(${lane.percent}% - ${lane.percent * 0.44}px)` }}>
              <span className={`ov-racer-icon ${flip ? 'flip' : ''}`}>{race.icon}</span>
              {index === 0 && lane.percent > 0 ? <span className="ov-crown">👑</span> : null}
            </span>
            <span className="ov-finish" aria-hidden="true" />
          </span>
          <span className="ov-lane-name">
            <Avatar name={lane.label} size={20} />{lane.label}
            {lane.value ? <em className="ov-lane-value">{lane.value}</em> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Plant stages from seed to tree; the goal adds fruit. */
const PLANT_STAGES = ['🌰', '🌱', '🌿', '🪴', '🌳'];
/** Bricks drawn per tower at most (tall goals draw thinner bricks). */
const MAX_BRICKS = 30;

/** The picture of one racer in a growing race, `fraction` = steps / goal. */
function GrowArt({ kind, item, fraction, goal }: { kind: OverlayGrow['kind']; item: OverlayGrow['items'][number]; fraction: number; goal: number }) {
  const done = fraction >= 1;
  if (kind === 'balloon') {
    return (
      <span className={`ov-balloon ${done ? 'popped' : ''}`} style={{ '--s': 0.34 + 0.66 * fraction } as CSSProperties}>
        <span className="ov-balloon-body"><Avatar name={item.label} size={30} /></span>
        <span className="ov-balloon-string" aria-hidden="true" />
        {done ? <span className="ov-grow-burst" aria-hidden="true">💥</span> : null}
      </span>
    );
  }
  if (kind === 'plant') {
    const stage = PLANT_STAGES[Math.min(PLANT_STAGES.length - 1, Math.floor(fraction * (PLANT_STAGES.length - 1)))] ?? '🌰';
    return (
      <span className="ov-plant" style={{ '--s': 0.45 + 0.55 * fraction } as CSSProperties}>
        <span className="ov-plant-leaf">{stage}{done ? <span className="ov-plant-fruit" aria-hidden="true">🍎</span> : null}</span>
        <span className="ov-plant-pot" aria-hidden="true" />
      </span>
    );
  }
  if (kind === 'rocket') {
    return (
      <span className="ov-rocket-track">
        <span className="ov-rocket" style={{ bottom: `calc(${fraction * 100}% - ${fraction * 34}px)` }}>
          <span className="ov-rocket-icon">🚀</span>
          {item.steps > 0 && !done ? <span className="ov-rocket-flame" aria-hidden="true">🔥</span> : null}
        </span>
      </span>
    );
  }
  const bricks = Math.min(MAX_BRICKS, Math.round(fraction * Math.min(goal, MAX_BRICKS)));
  return (
    <span className="ov-tower-track">
      <span className="ov-tower" style={{ '--rows': Math.min(goal, MAX_BRICKS) } as CSSProperties}>
        {Array.from({ length: bricks }, (_, index) => <span key={index} className="ov-brick" />)}
      </span>
      {done ? <span className="ov-tower-flag" aria-hidden="true">🚩</span> : null}
    </span>
  );
}

/** Growing question race: one column per front runner, the goal drawn above them. */
export function GrowStage({ grow }: { grow: OverlayGrow }) {
  if (!grow.items.length) return <p className="ov-hint big">{grow.emptyHint ?? ''}</p>;
  const goal = Math.max(1, grow.goal);
  return (
    <div className={`ov-grow ${grow.kind}`}>
      {grow.kind === 'rocket' ? <span className="ov-grow-goal" aria-hidden="true">🌕</span> : null}
      {grow.kind === 'tower' ? <span className="ov-grow-goal" aria-hidden="true">☁️☁️☁️</span> : null}
      <div className="ov-grow-row">
        {grow.items.map((item, index) => {
          const fraction = Math.min(1, Math.max(0, item.steps / goal));
          return (
            <div
              key={`${index}-${item.label}`}
              className={`ov-grow-item ${index === 0 && item.steps > 0 ? 'leader' : ''}`}
              style={{ '--c': nameColor(item.label) } as CSSProperties}
            >
              {index === 0 && item.steps > 0 ? <span className="ov-grow-crown" aria-hidden="true">👑</span> : null}
              <span className="ov-grow-art"><GrowArt kind={grow.kind} item={item} fraction={fraction} goal={goal} /></span>
              <span className="ov-grow-name">{grow.kind === 'balloon' ? null : <Avatar name={item.label} size={18} />}{item.label}</span>
              {item.value ? <span className="ov-grow-value">{item.value}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Names are written under balls at least this wide (share of the field width); smaller ones show only the avatar. */
const ARENA_NAME_MIN = 0.07;

/**
 * Arena field: the walls (closing in), and one ball per player with their
 * avatar. Positions animate, so pushes and growth are visible; balls knocked
 * out play a fall (pushed away / into the sea).
 */
export function ArenaField({ arena }: { arena: OverlayArena }) {
  const { bounds } = arena;
  return (
    <div className={`ov-arena ${arena.kind}`}>
      <div
        className="ov-arena-field"
        style={{ left: `${bounds.left * 100}%`, top: `${bounds.top * 100}%`, right: `${(1 - bounds.right) * 100}%`, bottom: `${(1 - bounds.bottom) * 100}%` }}
      />
      {arena.players.length ? null : <p className="ov-arena-empty">{arena.emptyHint}</p>}
      {arena.props?.map((prop, index) => (
        <span key={`p${index}`} className="ov-arena-prop" style={{ left: `${prop.x * 100}%`, top: `${prop.y * 100}%` }} aria-hidden="true">{prop.icon}</span>
      ))}
      {arena.players.map((player) => {
        const diameter = player.r * 2;
        return (
          <div
            key={player.id}
            className={`ov-ball ${player.state}`}
            style={{ left: `${player.x * 100}%`, top: `${player.y * 100}%`, width: `${diameter * 100}%`, '--d': diameter, '--c': nameColor(player.label) } as CSSProperties}
          >
            <span className="ov-ball-face"><Avatar name={player.label} size={40} /></span>
            {/* Bubbles start anonymous (a crowd of tiny balls); in the other games the names matter (who holds the bomb…). */}
            {diameter >= ARENA_NAME_MIN || arena.kind !== 'bubble' ? <span className="ov-ball-name">{player.label}</span> : null}
            {player.value ? <span className="ov-ball-value">{player.value}</span> : null}
            {player.badge ? <span className="ov-ball-badge" aria-hidden="true">{player.badge}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

const WHEEL_COLORS = ['#7867ff', '#e05cff', '#f59e0b', '#10b981', '#3b82f6', '#f43f5e'];
const WHEEL_TURNS = 5;

function polar(angleDeg: number, radius: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [100 + radius * Math.cos(rad), 100 + radius * Math.sin(rad)];
}

export function Wheel({ wheel }: { wheel: OverlayWheel }) {
  const count = Math.max(1, wheel.segments.length);
  const slice = 360 / count;
  const rotation = wheel.target == null ? 0 : wheel.spinId * WHEEL_TURNS * 360 + (360 - (wheel.target + 0.5) * slice);

  return (
    <div className={`ov-wheel ${wheel.spinning ? 'spinning' : ''}`}>
      <span className="ov-wheel-pointer">▼</span>
      <svg viewBox="0 0 200 200" role="img" aria-label={t('Vòng quay thử thách')}>
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
            const landed = !wheel.spinning && wheel.target === index;
            return (
              <g key={`${index}-${segment}`}>
                <path d={`M100,100 L${x1},${y1} A96,96 0 ${large} 1 ${x2},${y2} Z`} fill={WHEEL_COLORS[index % WHEEL_COLORS.length]} stroke={landed ? '#fff' : 'rgba(0,0,0,.35)'} strokeWidth={landed ? 3 : 1} />
                <text x={tx} y={ty} transform={`rotate(${mid - 90} ${tx} ${ty})`} textAnchor="middle" dominantBaseline="middle" className="ov-wheel-label">
                  {label}
                </text>
              </g>
            );
          })}
        </g>
        <circle cx="100" cy="100" r="96" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="3" />
        <circle cx="100" cy="100" r="13" fill="#11151d" stroke="#fff" strokeWidth="3" />
      </svg>
    </div>
  );
}

/** Olympia-style crossword: numbered rows aligned on the highlighted keyword column. */
export function Crossword({ crossword }: { crossword: OverlayCrossword }) {
  return (
    <div className="ov-crossword" style={{ '--cols': crossword.columns + 1, '--rows': crossword.rows.length } as CSSProperties}>
      {crossword.rows.map((row, rowIndex) => (
        <div key={rowIndex} className={`ov-cw-row ${row.state}`}>
          <span className="ov-cw-num">{rowIndex + 1}</span>
          {row.cells.map((letter, index) => (
            <span
              key={index}
              className={`ov-cw-cell ${index === row.keyIndex ? 'key' : ''} ${letter ? 'open' : ''}`}
              style={{ gridColumn: row.offset + index + 2 }}
            >
              {letter}
            </span>
          ))}
        </div>
      ))}
      <div className={`ov-cw-keyword ${crossword.keywordSolved ? 'solved' : ''}`}>
        <span>🔑</span>
        {crossword.keyword.map((letter, index) => <span key={index} className={`ov-cw-cell key ${letter ? 'open' : ''}`}>{letter}</span>)}
      </div>
    </div>
  );
}

/** Flip cards: numbered backs, faces flip in when peeked or done. */
export function CardGrid({ cards }: { cards: OverlayCards }) {
  return (
    <div className="ov-cards" style={{ '--card-cols': cards.columns } as CSSProperties}>
      {cards.cards.map((card, index) => (
        <span key={index} className={`ov-flip ${card.state}`}>
          {card.state === 'closed'
            ? <span className="ov-flip-back">{card.label}</span>
            // Words (romaji, meanings) get a smaller font than a single emoji or character.
            : <span className={`ov-flip-face ${Array.from(card.face).length > 2 ? 'text' : ''}`}>{card.face}</span>}
        </span>
      ))}
    </div>
  );
}

/** Tile grid of the word games (Wordle, word search, bingo, tic-tac-toe…). */
export function TileGrid({ grid }: { grid: OverlayGrid }) {
  return (
    <div className={`ov-grid ${grid.kind}`} style={{ '--grid-cols': grid.columns } as CSSProperties}>
      {grid.cells.map((cell, index) => (
        <span key={index} className={`ov-grid-cell ${cell.state}`}>
          {cell.label ? <i className="ov-grid-label">{cell.label}</i> : null}
          <span className="ov-grid-text">{cell.text}</span>
          {cell.sub ? <small className="ov-grid-sub">{cell.sub}</small> : null}
        </span>
      ))}
    </div>
  );
}

/** Auto-scroll speed of a long game list (px per second) and the pause at each end. */
const MENU_SCROLL_SPEED = 28;
const MENU_SCROLL_PAUSE_MS = 2500;
/** After the streamer scrolls or hovers the list, auto-scroll waits this long. */
const MENU_SCROLL_IDLE_MS = 5000;

/**
 * Keeps a long list moving so OBS viewers see every game: scrolls down slowly,
 * pauses, jumps back to the top. Stops while the streamer hovers or scrolls it.
 */
function useAutoScroll(ref: RefObject<HTMLElement | null>): boolean {
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 4);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [ref]);

  useEffect(() => {
    const element = ref.current;
    if (!element || !overflowing) return undefined;
    let frame = 0;
    let last = performance.now();
    let holdUntil = last + MENU_SCROLL_PAUSE_MS;
    let position = element.scrollTop;
    const hold = () => {
      holdUntil = performance.now() + MENU_SCROLL_IDLE_MS;
      position = element.scrollTop;
    };
    const step = (now: number) => {
      const elapsed = Math.min(100, now - last);
      last = now;
      if (now >= holdUntil) {
        const end = element.scrollHeight - element.clientHeight;
        if (position >= end - 1) {
          position = 0;
          element.scrollTo({ top: 0, behavior: 'smooth' });
          holdUntil = now + MENU_SCROLL_PAUSE_MS;
        } else {
          position = Math.min(end, position + (MENU_SCROLL_SPEED * elapsed) / 1000);
          element.scrollTop = position;
          if (position >= end - 1) holdUntil = now + MENU_SCROLL_PAUSE_MS;
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    element.addEventListener('wheel', hold, { passive: true });
    element.addEventListener('pointermove', hold, { passive: true });
    element.addEventListener('touchstart', hold, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('wheel', hold);
      element.removeEventListener('pointermove', hold);
      element.removeEventListener('touchstart', hold);
    };
  }, [overflowing, ref]);

  return overflowing;
}

/**
 * The game list as rectangular game tiles in 2 columns: icon plate colored by
 * category with the vote number as a gold coin, name, vote bar and count; the
 * leading game gets a gold ring and 👑. Long lists scroll (wheel in the game
 * window, slow auto-scroll for OBS). In the game window tiles are clickable
 * (`onPick` with the 1-based number).
 */
export function GameMenu({ menu, onPick }: { menu: OverlayMenu; onPick?: (number: number) => void }) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const overflowing = useAutoScroll(listRef);
  return (
    <ol ref={listRef} className={`ov-menu ${overflowing ? 'scrolling' : ''} ${menu.decided ? 'decided' : ''}`}>
      {menu.items.map((item, index) => (
        <li
          key={item.number}
          className={`ov-menu-item cat-${item.category} ${item.leader ? 'leader' : ''} ${item.picked ? 'picked' : ''} ${onPick ? 'pickable' : ''}`}
          style={{ '--pct': `${item.percent}%`, animationDelay: `${Math.min(index, 20) * 30}ms` } as CSSProperties}
          onClick={onPick ? () => onPick(item.number) : undefined}
          title={onPick ? t('Chơi {title}', { title: item.name }) : undefined}
        >
          <span className="ov-menu-icon" aria-hidden="true">
            {item.icon}
            <span className="ov-menu-num">{item.number}</span>
          </span>
          <span className="ov-menu-body">
            <span className="ov-menu-name">{item.name}</span>
            <span className="ov-menu-meta">
              <span className="ov-menu-bar"><span /></span>
              <span className="ov-menu-votes">
                <strong>{item.votes}</strong>
                {item.votes > 0 ? <small>{item.percent}%</small> : null}
              </span>
            </span>
          </span>
          {item.leader ? <span className="ov-menu-crown" aria-hidden="true">👑</span> : null}
        </li>
      ))}
    </ol>
  );
}

/** Smallest zoom FitBox uses (below this, text gets unreadable; the rest is clipped). */
const MIN_FIT_ZOOM = 0.45;

/**
 * Shrinks its content (with CSS zoom, so it re-flows) until it fits: the width
 * always, and the height too when `fitHeight` (full-screen cards, where the
 * card has a fixed height). Content is never enlarged.
 */
export function FitBox({ children, fitHeight }: { children: ReactNode; fitHeight: boolean }) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return undefined;
    let pending = false;
    const fit = () => {
      let zoom = 1;
      inner.style.zoom = '1';
      outer.classList.remove('overflowing');
      for (let pass = 0; pass < 4; pass += 1) {
        const room = outer.getBoundingClientRect();
        const used = inner.getBoundingClientRect();
        const byWidth = inner.scrollWidth > inner.clientWidth + 1 ? inner.clientWidth / inner.scrollWidth : 1;
        const byHeight = fitHeight && used.height > room.height + 1 ? room.height / used.height : 1;
        const ratio = Math.min(byWidth, byHeight);
        if (ratio >= 0.995) break;
        zoom = Math.max(MIN_FIT_ZOOM, zoom * ratio * 0.995);
        inner.style.zoom = String(zoom);
        if (zoom === MIN_FIT_ZOOM) break;
      }
      // Still too tall at the smallest zoom: the bottom fades out instead of being cut mid-line.
      if (fitHeight && inner.getBoundingClientRect().height > outer.getBoundingClientRect().height + 1) outer.classList.add('overflowing');
    };
    // Not requestAnimationFrame: it pauses while the window is hidden or covered (OBS may
    // capture such a window). Setting the zoom doesn't re-trigger these observers.
    const schedule = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        fit();
      });
    };
    fit();
    const resize = new ResizeObserver(schedule);
    resize.observe(outer);
    const mutations = new MutationObserver(schedule);
    mutations.observe(inner, { childList: true, subtree: true, characterData: true });
    return () => {
      resize.disconnect();
      mutations.disconnect();
    };
  }, [fitHeight]);

  return (
    <div ref={outerRef} className={`ov-fit ${fitHeight ? 'fit-height' : ''}`}>
      <div ref={innerRef} className="ov-fit-inner">{children}</div>
    </div>
  );
}
