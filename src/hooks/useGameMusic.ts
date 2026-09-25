import { useEffect, useRef } from 'react';
import { barNotes, barSeconds, midiToHz, STEPS_PER_BAR, type MusicNote, type MusicTheme } from '../shared/bgm';
import type { MusicCue } from '../game/music';
import { getAudioContext } from './audioContext';

/**
 * Notes are scheduled this far ahead. Generous on purpose: when the app is
 * minimized during a LIVE, Chromium runs timers about once a second.
 */
const LOOKAHEAD_S = 1.5;
const TIMER_MS = 50;
/** Crossfade between themes, and fade in / out. */
const FADE_S = 0.6;
/** Loudest the music gets (at 100 %); it sits under the game sound effects. */
const MAX_GAIN = 0.5;

/** Relative loudness of each voice. */
const VOICE_GAIN: Record<MusicNote['voice'], number> = { kick: 0.9, snare: 0.45, hat: 0.14, bass: 0.34, lead: 0.1, bell: 0.16, keys: 0.07 };

/**
 * Plays `barNotes` with oscillators and noise. Each theme plays into its own
 * bus, so a switch fades the old bus out while the new one fades in.
 */
export class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private bus: GainNode | null = null;
  private theme: MusicTheme | null = null;
  private urgent = false;
  private bar = 0;
  private nextBarAt = 0;
  private timer: number | null = null;

  set(cue: MusicCue | null, volume: number): void {
    try {
      this.apply(cue, volume);
    } catch {
      // Audio unavailable: the games run silently.
    }
  }

  stop(): void {
    this.set(null, 0);
  }

  private apply(cue: MusicCue | null, volume: number): void {
    if (!cue || volume <= 0) {
      if (!this.theme) return;
      this.fadeOutBus();
      this.theme = null;
      if (this.timer != null) window.clearInterval(this.timer);
      this.timer = null;
      return;
    }
    const ctx = this.context();
    const master = this.master!;
    master.gain.setTargetAtTime(MAX_GAIN * volume * cue.level, ctx.currentTime, 0.25);
    this.urgent = cue.urgent;
    if (cue.theme === this.theme) return;

    // New theme: crossfade, and start its loop from the top.
    this.fadeOutBus();
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + FADE_S);
    bus.connect(master);
    this.bus = bus;
    this.theme = cue.theme;
    this.bar = 0;
    this.nextBarAt = ctx.currentTime + 0.05;
    this.timer ??= window.setInterval(() => this.schedule(), TIMER_MS);
    this.schedule();
  }

  private context(): AudioContext {
    const ctx = getAudioContext();
    if (this.ctx !== ctx || !this.master) {
      this.ctx = ctx;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.ratio.value = 4;
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(compressor).connect(ctx.destination);
      const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      this.noise = noise;
    }
    return ctx;
  }

  private fadeOutBus(): void {
    const bus = this.bus;
    const ctx = this.ctx;
    if (!bus || !ctx) return;
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setTargetAtTime(0.0001, ctx.currentTime, FADE_S / 4);
    window.setTimeout(() => bus.disconnect(), (FADE_S + LOOKAHEAD_S + 1) * 1000);
    this.bus = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const bus = this.bus;
    if (!ctx || !theme || !bus) return;
    // Fell far behind (the machine slept): pick up from now instead of a burst of old bars.
    if (this.nextBarAt < ctx.currentTime - 0.5) this.nextBarAt = ctx.currentTime + 0.05;
    while (this.nextBarAt < ctx.currentTime + LOOKAHEAD_S) {
      const length = barSeconds(theme, this.urgent);
      const step = length / STEPS_PER_BAR;
      for (const note of barNotes(theme, this.bar, this.urgent)) {
        this.play(bus, theme, note, this.nextBarAt + note.step * step, Math.max(0.05, note.len * step));
      }
      this.nextBarAt += length;
      this.bar += 1;
    }
  }

  private play(bus: GainNode, theme: MusicTheme, note: MusicNote, at: number, duration: number): void {
    const ctx = this.ctx!;
    const level = VOICE_GAIN[note.voice] * note.vel;
    const out = ctx.createGain();
    out.connect(bus);
    const envelope = (attack: number, release: number) => {
      out.gain.setValueAtTime(0.0001, at);
      out.gain.exponentialRampToValueAtTime(level, at + attack);
      out.gain.exponentialRampToValueAtTime(0.0001, at + release);
    };
    const osc = (type: OscillatorType, hz: number, end: number) => {
      const node = ctx.createOscillator();
      node.type = type;
      node.frequency.setValueAtTime(hz, at);
      node.start(at);
      node.stop(end);
      return node;
    };
    const noise = (filter: BiquadFilterType, hz: number, end: number) => {
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      const band = ctx.createBiquadFilter();
      band.type = filter;
      band.frequency.value = hz;
      source.connect(band).connect(out);
      source.start(at);
      source.stop(end);
    };

    switch (note.voice) {
      case 'kick': {
        envelope(0.004, at + 0.3);
        const body = osc('sine', 150, at + 0.32);
        body.frequency.exponentialRampToValueAtTime(42, at + 0.14);
        body.connect(out);
        break;
      }
      case 'snare':
        envelope(0.002, at + 0.18);
        noise('bandpass', 1900, at + 0.2);
        osc('triangle', 190, at + 0.1).connect(out);
        break;
      case 'hat':
        envelope(0.001, at + 0.05);
        noise('highpass', 7500, at + 0.06);
        break;
      case 'bass': {
        envelope(0.006, at + duration * 0.95);
        const tone = ctx.createBiquadFilter();
        tone.type = 'lowpass';
        tone.frequency.value = theme === 'versus' ? 1100 : 750;
        osc(theme === 'versus' ? 'sawtooth' : 'triangle', midiToHz(note.midi), at + duration).connect(tone).connect(out);
        break;
      }
      case 'lead': {
        envelope(0.01, at + duration * 0.9);
        const tone = ctx.createBiquadFilter();
        tone.type = 'lowpass';
        tone.frequency.value = 3200;
        osc('square', midiToHz(note.midi), at + duration).connect(tone).connect(out);
        break;
      }
      case 'bell': {
        const ring = Math.max(duration, 0.6);
        envelope(0.005, at + ring);
        osc('sine', midiToHz(note.midi), at + ring).connect(out);
        const shimmer = ctx.createGain();
        shimmer.gain.value = 0.25;
        osc('sine', midiToHz(note.midi) * 2, at + ring).connect(shimmer).connect(out);
        break;
      }
      case 'keys':
        envelope(0.03, at + duration);
        osc('triangle', midiToHz(note.midi), at + duration).connect(out);
        break;
    }
  }
}

/**
 * Background music for the game screen (see `musicCue`): plays in the app, so
 * OBS / TikTok LIVE Studio capture it with the app audio. `volume` 0–1.
 */
export function useGameMusic(cue: MusicCue | null, volume: number): void {
  const engine = useRef<MusicEngine | null>(null);
  const theme = cue?.theme ?? null;
  const level = cue?.level ?? 0;
  const urgent = cue?.urgent ?? false;

  useEffect(() => {
    engine.current ??= new MusicEngine();
    engine.current.set(theme ? { theme, level, urgent } : null, volume);
  }, [level, theme, urgent, volume]);

  useEffect(() => () => engine.current?.stop(), []);
}
