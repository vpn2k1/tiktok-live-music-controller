import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveFeatures } from '../game/features';
import { t } from '../shared/i18n';
import type { LiveEvent, OverlayAlert } from '../shared/types';

let audioContext: AudioContext | null = null;

/** Short two-note chime synthesized locally (no audio files, no network). */
function playChime(): void {
  try {
    audioContext ??= new AudioContext();
    const ctx = audioContext;
    const start = ctx.currentTime;
    [880, 1318.5].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = start + index * 0.14;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.4);
    });
  } catch {
    // Audio unavailable: alerts still show on the overlay.
  }
}

/** How long a bubble stays on the overlay (it rises to mid-screen and fades meanwhile). */
export const ALERT_FEED_MS = 5000;
/** Like hearts are quicker. Keep in sync with the overlay CSS (.ov-feed-item / .like). */
export const LIKE_FEED_MS = 3000;
/** Follow / join / reply bubbles on screen at once. */
const MAX_BUBBLES = 4;
/** Like hearts on screen at once. */
const MAX_HEARTS = 6;
/** Big rooms: at most one join bubble per this many ms (follows always show). */
const JOIN_GAP_MS = 1200;
/** Likes stream in fast: at most one heart per this many ms, and one per viewer per LIKE_USER_GAP_MS. */
const LIKE_GAP_MS = 300;
const LIKE_USER_GAP_MS = 2000;
/** Join chimes at most this often. */
const JOIN_CHIME_GAP_MS = 3000;

/** Still on screen (hearts fade sooner than bubbles). */
function isAlive(alert: OverlayAlert, shownAt: Map<number, number>, now: number): boolean {
  return now - (shownAt.get(alert.id) ?? 0) < (alert.kind === 'like' ? LIKE_FEED_MS : ALERT_FEED_MS);
}

/**
 * Overlay feed: follow / join bubbles (avatar + name), like hearts (avatar + ❤️)
 * and replies. New ones show at once and fade out on their own. Busy rooms are
 * thinned out (joins and likes are rate-limited; follows always show).
 */
export function useWelcomeAlerts(features: LiveFeatures) {
  const [alerts, setAlerts] = useState<OverlayAlert[]>([]);
  const shownAt = useRef(new Map<number, number>());
  const nextId = useRef(1);
  const lastJoin = useRef(0);
  const lastLike = useRef(0);
  const likers = useRef(new Map<string, number>());
  const lastJoinChime = useRef(0);
  const featuresRef = useRef(features);

  useEffect(() => {
    featuresRef.current = features;
  }, [features]);

  const push = useCallback((item: Omit<OverlayAlert, 'id'>) => {
    const id = nextId.current++;
    const now = Date.now();
    shownAt.current.set(id, now);
    setAlerts((old) => {
      const kept = old.filter((alert) => isAlive(alert, shownAt.current, now));
      const hearts = item.kind === 'like';
      const same = (alert: OverlayAlert) => (alert.kind === 'like') === hearts;
      // Full: drop the oldest of the same group (a join before a follow).
      while (kept.filter(same).length >= (hearts ? MAX_HEARTS : MAX_BUBBLES)) {
        const joinIndex = item.kind === 'follow' ? kept.findIndex((alert) => alert.kind === 'join') : -1;
        kept.splice(joinIndex >= 0 ? joinIndex : kept.findIndex(same), 1);
      }
      return [...kept, { ...item, id }];
    });
  }, []);

  // Remove bubbles once they have faded out.
  const count = alerts.length;
  useEffect(() => {
    if (!count) return undefined;
    const timer = setInterval(() => {
      const now = Date.now();
      setAlerts((old) => {
        const kept = old.filter((alert) => isAlive(alert, shownAt.current, now));
        for (const alert of old) if (!kept.includes(alert)) shownAt.current.delete(alert.id);
        return kept.length === old.length ? old : kept;
      });
    }, 250);
    return () => clearInterval(timer);
  }, [count]);

  /** A text reply (e.g. to !rank). */
  const notify = useCallback((text: string) => {
    push({ kind: 'info', text: text.slice(0, 160) });
  }, [push]);

  const handleEvent = useCallback((event: LiveEvent) => {
    const settings = featuresRef.current;
    if (!settings.welcomeEnabled) return;
    const now = Date.now();
    const name = `@${event.user || event.nickname}`;

    if (event.type === 'like') {
      if (!settings.welcomeLikes || now - lastLike.current < LIKE_GAP_MS) return;
      if (now - (likers.current.get(event.user) ?? 0) < LIKE_USER_GAP_MS) return;
      lastLike.current = now;
      likers.current.set(event.user, now);
      if (likers.current.size > 500) likers.current.clear();
      push({ kind: 'like', name, text: t('{name} thả tim', { name }) });
      return;
    }

    if (event.type !== 'follow' && !(event.type === 'join' && settings.welcomeJoins)) return;
    const kind = event.type === 'follow' ? 'follow' : 'join';
    if (kind === 'join') {
      if (now - lastJoin.current < JOIN_GAP_MS) return;
      lastJoin.current = now;
    }
    push({ kind, name, text: kind === 'follow' ? t('{name} đã follow', { name }) : t('{name} đã tham gia', { name }) });
    if (settings.welcomeSound && (kind === 'follow' || now - lastJoinChime.current >= JOIN_CHIME_GAP_MS)) {
      if (kind === 'join') lastJoinChime.current = now;
      playChime();
    }
  }, [push]);

  return { alerts, handleEvent, notify };
}
