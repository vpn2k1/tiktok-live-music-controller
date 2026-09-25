import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { OverlayAlert, OverlayEffect } from '../shared/types';
import { t } from '../shared/i18n';
import { Avatar } from './parts';

const POPUP_MS = 1400;
const BANNER_MS: Partial<Record<OverlayEffect['kind'], number>> = { start: 1900, win: 4200, lose: 2600 };
/** The big "congratulations" screen (winner / top 3) stays longer; the round gap is at least 3 s more. */
const CELEBRATION_MS = 6500;
const MAX_POPUPS = 6;

/**
 * Turns the effect stream into short-lived visuals. Each effect id plays once;
 * effects that already existed when the overlay loaded (e.g. OBS refresh) are skipped.
 */
export function useEffectPlayer(effects: OverlayEffect[]) {
  const seen = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  const [popups, setPopups] = useState<OverlayEffect[]>([]);
  const [banner, setBanner] = useState<OverlayEffect | null>(null);
  const [shake, setShake] = useState(0);
  const [confetti, setConfetti] = useState(0);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  useEffect(() => {
    const maxId = effects.reduce((max, effect) => Math.max(max, effect.id), 0);
    // First frame, or the app restarted and ids began again: sync without replaying.
    if (seen.current === null || maxId < seen.current) {
      seen.current = maxId;
      return;
    }
    const fresh = effects.filter((effect) => effect.id > (seen.current ?? 0));
    if (!fresh.length) return;
    seen.current = maxId;

    const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    for (const effect of fresh) {
      const bannerMs = effect.kind === 'win' && effect.podium?.length ? CELEBRATION_MS : BANNER_MS[effect.kind];
      if (bannerMs) {
        setBanner(effect);
        later(bannerMs, () => setBanner((current) => (current?.id === effect.id ? null : current)));
        if (effect.kind === 'win') setConfetti((count) => count + 1);
        continue;
      }
      setPopups((current) => [...current, effect].slice(-MAX_POPUPS));
      later(POPUP_MS, () => setPopups((current) => current.filter((item) => item.id !== effect.id)));
      if (effect.kind === 'hit' || effect.kind === 'wrong') setShake((count) => count + 1);
    }
  }, [effects]);

  return { popups, banner, shake, confetti };
}

/** Floating "-20", "✅ name", "⬆" numbers above the game card. */
export function Popups({ popups }: { popups: OverlayEffect[] }) {
  return (
    <div className="ov-popups" aria-hidden="true">
      {popups.map((popup) => (
        <span key={popup.id} className={`ov-popup ${popup.kind}`} style={{ left: `${18 + ((popup.id * 37) % 64)}%` }}>
          {popup.user && popup.kind !== 'hit' ? <Avatar name={popup.user} size={22} /> : null}
          {popup.text}
        </span>
      ))}
    </div>
  );
}

const PODIUM_MEDALS = ['🥇', '🥈', '🥉'];

/**
 * End-of-round "congratulations": the winner alone in the spotlight (big
 * avatar, crown, name), or the top 3 on a podium (2nd · 1st · 3rd).
 */
function Celebration({ effect, podium }: { effect: OverlayEffect; podium: NonNullable<OverlayEffect['podium']> }) {
  const [first] = podium;
  if (podium.length === 1 && first) {
    return (
      <div key={effect.id} className="ov-banner win celebrate" role="status">
        <span className="ov-banner-rays" aria-hidden="true" />
        <strong className="ov-celebrate-title">{t('🎉 Chúc mừng! 🎉')}</strong>
        <span className="ov-spotlight">
          <span className="ov-celebrate-crown" aria-hidden="true">👑</span>
          <Avatar name={first.name} size={120} />
        </span>
        <strong className="ov-celebrate-name">{first.name}</strong>
        {first.value ? <span className="ov-celebrate-value">{first.value}</span> : null}
        {effect.text ? <span className="ov-banner-text">{effect.text}</span> : null}
      </div>
    );
  }
  // Drawn 2nd · 1st · 3rd so the winner stands in the middle, highest.
  const places = podium.slice(0, 3).map((entry, index) => ({ ...entry, place: index + 1 }));
  const order = [places[1], places[0], places[2]].filter((entry) => entry != null);
  return (
    <div key={effect.id} className="ov-banner win celebrate" role="status">
      <span className="ov-banner-rays" aria-hidden="true" />
      <strong className="ov-celebrate-title">{t('🏆 Chúc mừng top {n}!', { n: places.length })}</strong>
      <div className="ov-podium">
        {order.map((entry) => (
          <div key={entry.place} className={`ov-podium-slot place-${entry.place}`}>
            {entry.place === 1 ? <span className="ov-celebrate-crown" aria-hidden="true">👑</span> : null}
            <Avatar name={entry.name} size={80} />
            <strong className="ov-podium-name">{entry.name}</strong>
            {entry.value ? <span className="ov-podium-value">{entry.value}</span> : null}
            <span className="ov-podium-block">{PODIUM_MEDALS[entry.place - 1]}</span>
          </div>
        ))}
      </div>
      {effect.text ? <span className="ov-banner-text">{effect.text}</span> : null}
    </div>
  );
}

/** Full-frame banner for round start / win / time up. */
export function EffectBanner({ effect }: { effect: OverlayEffect | null }) {
  if (!effect) return null;
  if (effect.kind === 'win' && effect.podium?.length) return <Celebration effect={effect} podium={effect.podium} />;
  const icon = effect.kind === 'start' ? '🎮' : effect.kind === 'win' ? '🏆' : '⏰';
  const title = t(effect.kind === 'start' ? 'Bắt đầu!' : effect.kind === 'win' ? 'Chiến thắng!' : 'Hết giờ!');
  return (
    <div key={effect.id} className={`ov-banner ${effect.kind}`} role="status">
      <span className="ov-banner-rays" aria-hidden="true" />
      <span className="ov-banner-icon">{icon}</span>
      <strong className="ov-banner-title">{title}</strong>
      {effect.user ? (
        <span className="ov-banner-user"><Avatar name={effect.user} size={40} />{effect.user}</span>
      ) : null}
      {effect.text ? <span className="ov-banner-text">{effect.text}</span> : null}
    </div>
  );
}

const CONFETTI_COLORS = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#facc15'];

interface Particle { x: number; y: number; vx: number; vy: number; size: number; color: string; spin: number; angle: number }

/** Canvas confetti burst; `fire` increments to launch a new burst. */
export function Confetti({ fire }: { fire: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!fire || !canvas || !ctx) return undefined;
    const width = (canvas.width = canvas.offsetWidth);
    const height = (canvas.height = canvas.offsetHeight);
    const scale = height / 1080;
    // Two side cannons plus a shower from the top, sized so pieces stay inside the frame.
    const particles: Particle[] = Array.from({ length: 220 }, (_, index) => {
      const kind = index % 3;
      const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length] ?? '#fff';
      const base = { size: (8 + Math.random() * 10) * Math.max(1, scale * 0.8), color, spin: (Math.random() - 0.5) * 0.4, angle: Math.random() * Math.PI };
      if (kind === 2) {
        return { ...base, x: Math.random() * width, y: -20 - Math.random() * height * 0.3, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3 };
      }
      const fromLeft = kind === 0;
      return {
        ...base,
        x: fromLeft ? 0 : width,
        y: height * 0.62,
        vx: (fromLeft ? 1 : -1) * (5 + Math.random() * 10) * Math.max(1, width / 1080),
        vy: -(8 + Math.random() * 11) * Math.sqrt(Math.max(1, scale))
      };
    });
    const started = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const elapsed = now - started;
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.vy += 0.32;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - elapsed / 3600);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (elapsed < 3600) frame = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, width, height);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [fire]);

  return <canvas ref={canvasRef} className="ov-confetti" aria-hidden="true" />;
}

const ALERT_ICONS: Record<OverlayAlert['kind'], string> = { follow: '💖', join: '👋', like: '❤️', info: '💬' };

/**
 * Follow / join bubbles (avatar + small name), like hearts (avatar + ❤️) and
 * replies: transparent, each rises from the bottom of the frame (bubbles
 * alternate bottom-left / bottom-right, hearts go up on the right) to about
 * mid-screen and fades out. `rise` = travel distance in the item's own px.
 */
export function AlertFeed({ alerts, rise }: { alerts: OverlayAlert[]; rise: number }) {
  return (
    <div className="ov-feed" style={{ '--rise': `${Math.round(rise)}px` } as CSSProperties}>
      {alerts.map((alert) => {
        const heart = alert.kind === 'like';
        const side = heart || alert.id % 2 === 0 ? 'right' : 'left';
        // Sideways offset so items that start close together don't cover each other.
        const offset = heart ? 3 + ((alert.id * 53) % 7) * 2.2 : 3 + ((alert.id * 37) % 5) * 1.6;
        return (
          <div
            key={alert.id}
            className={`ov-feed-item ${alert.kind} ${side}`}
            style={{ [side]: `${offset}%` } as CSSProperties}
            title={alert.text}
          >
            {alert.name ? <Avatar name={alert.name.replace(/^@/, '')} size={heart ? 30 : 24} /> : null}
            {heart ? null : <span className="ov-feed-text">{alert.kind === 'info' || !alert.name ? alert.text : alert.name}</span>}
            <span className="ov-feed-icon">{ALERT_ICONS[alert.kind]}</span>
          </div>
        );
      })}
    </div>
  );
}
