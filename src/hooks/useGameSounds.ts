import { useEffect, useRef } from 'react';
import type { GamePhase, OverlayEffect } from '../shared/types';

type Note = [frequency: number, startSec: number, durationSec: number, type?: OscillatorType, slideTo?: number];

/** Short synthesized cues (no audio files); played in the app so OBS captures them with app audio. */
const SOUNDS: Record<OverlayEffect['kind'] | 'tick', Note[]> = {
  start: [[523, 0, 0.12, 'triangle'], [659, 0.1, 0.12, 'triangle'], [784, 0.2, 0.22, 'triangle']],
  hit: [[160, 0, 0.14, 'sine', 55]],
  score: [[880, 0, 0.08, 'square']],
  correct: [[988, 0, 0.1, 'triangle'], [1319, 0.09, 0.18, 'triangle']],
  wrong: [[196, 0, 0.22, 'sawtooth', 150]],
  win: [[523, 0, 0.14, 'square'], [659, 0.13, 0.14, 'square'], [784, 0.26, 0.14, 'square'], [1047, 0.39, 0.45, 'square']],
  lose: [[392, 0, 0.18, 'triangle'], [330, 0.17, 0.18, 'triangle'], [262, 0.34, 0.35, 'triangle']],
  tick: [[1200, 0, 0.04, 'square']]
};

/** Minimum gap per sound so a flood of likes doesn't become noise. */
const MIN_GAP_MS: Partial<Record<keyof typeof SOUNDS, number>> = { hit: 140, score: 160, correct: 120, wrong: 150 };
const VOLUME = 0.12;

let audioContext: AudioContext | null = null;

function play(kind: keyof typeof SOUNDS): void {
  try {
    audioContext ??= new AudioContext();
    const ctx = audioContext;
    const now = ctx.currentTime;
    for (const [frequency, start, duration, type = 'sine', slideTo] of SOUNDS[kind]) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = now + start;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, at);
      if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, at + duration);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(VOLUME, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.02);
    }
  } catch {
    // Audio unavailable: the overlay still shows every effect.
  }
}

/**
 * Plays a sound for each new game effect and ticks during the last 5 seconds.
 * Effects already present when enabled/mounted are not replayed.
 */
export function useGameSounds(effects: OverlayEffect[], phase: GamePhase, endsAt: number | null, enabled: boolean): void {
  const seen = useRef<number | null>(null);
  const lastPlayed = useRef<Partial<Record<string, number>>>({});

  useEffect(() => {
    const maxId = effects.reduce((max, effect) => Math.max(max, effect.id), 0);
    if (seen.current === null || !enabled) {
      seen.current = maxId;
      return;
    }
    const fresh = effects.filter((effect) => effect.id > (seen.current ?? 0));
    seen.current = maxId;
    const now = Date.now();
    for (const effect of fresh) {
      const gap = MIN_GAP_MS[effect.kind] ?? 0;
      if (now - (lastPlayed.current[effect.kind] ?? 0) < gap) continue;
      lastPlayed.current[effect.kind] = now;
      play(effect.kind);
    }
  }, [effects, enabled]);

  useEffect(() => {
    if (!enabled || phase !== 'running' || endsAt == null) return undefined;
    let lastSecond = -1;
    const timer = window.setInterval(() => {
      const seconds = Math.ceil((endsAt - Date.now()) / 1000);
      if (seconds !== lastSecond && seconds > 0 && seconds <= 5) play('tick');
      lastSecond = seconds;
    }, 100);
    return () => window.clearInterval(timer);
  }, [enabled, endsAt, phase]);
}
