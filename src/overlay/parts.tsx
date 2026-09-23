import type { CSSProperties } from 'react';
import type { OverlayRace, OverlayRow, OverlayTeam, OverlayWheel } from '../shared/types';

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

/** Colored initial badge standing in for the viewer's profile picture. */
export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const clean = name.replace(/^@/, '').trim();
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
          <span>{teams[0].members} người</span>
          <b>{teams[0].score}</b>
        </div>
        <span className="ov-vs">VS</span>
        <div className="ov-tug-team b">
          <strong>{teams[1].label}</strong>
          <span>{teams[1].members} người</span>
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
  if (!race.lanes.length) return <p className="ov-hint big">❤️ Thả tim để xuất phát!</p>;
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
          <span className="ov-lane-name"><Avatar name={lane.label} size={20} />{lane.label}</span>
        </div>
      ))}
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
