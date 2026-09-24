import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveFeatures } from '../game/features';
import { t } from '../shared/i18n';
import type { LiveEvent, OverlayAlert } from '../shared/types';

const SHOW_MS = 3500;
const MAX_QUEUE = 5;

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

/**
 * Queues follow/join greetings and shows them one at a time. Joins are dropped
 * when the queue is full so big rooms don't flood the overlay; follows win.
 */
export function useWelcomeAlerts(features: LiveFeatures) {
  const [alert, setAlert] = useState<OverlayAlert | null>(null);
  // alertRef mirrors `alert` synchronously so bursts of events queue correctly.
  const alertRef = useRef<OverlayAlert | null>(null);
  const queue = useRef<OverlayAlert[]>([]);
  const nextId = useRef(1);
  const featuresRef = useRef(features);

  useEffect(() => {
    featuresRef.current = features;
  }, [features]);

  const showNext = useCallback(() => {
    const next = queue.current.shift() ?? null;
    alertRef.current = next;
    setAlert(next);
    if (next && next.kind !== 'info' && featuresRef.current.welcomeSound) playChime();
  }, []);

  useEffect(() => {
    if (!alert) return undefined;
    const timer = setTimeout(showNext, SHOW_MS);
    return () => clearTimeout(timer);
  }, [alert, showNext]);

  /** Queues a text reply (e.g. to !rank); dropped when the queue is full. */
  const notify = useCallback((text: string) => {
    if (queue.current.length >= MAX_QUEUE) return;
    queue.current.push({ id: nextId.current++, kind: 'info', text: text.slice(0, 160) });
    if (!alertRef.current) showNext();
  }, [showNext]);

  const handleEvent = useCallback((event: LiveEvent) => {
    const settings = featuresRef.current;
    if (!settings.welcomeEnabled) return;
    if (event.type !== 'follow' && !(event.type === 'join' && settings.welcomeJoins)) return;

    const kind = event.type === 'follow' ? 'follow' : 'join';
    const item: OverlayAlert = {
      id: nextId.current++,
      kind,
      text: kind === 'follow' ? t('Cảm ơn {name} đã follow!', { name: event.nickname }) : t('Chào mừng {name}!', { name: event.nickname })
    };

    if (queue.current.length >= MAX_QUEUE) {
      if (kind === 'join') return;
      const dropIndex = queue.current.findIndex((queued) => queued.kind !== 'follow');
      if (dropIndex < 0) return;
      queue.current.splice(dropIndex, 1);
    }
    queue.current.push(item);
    if (!alertRef.current) showNext();
  }, [showNext]);

  return { alert, handleEvent, notify };
}
