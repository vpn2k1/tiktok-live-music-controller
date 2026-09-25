/**
 * Game background music, composed in code (no audio files, so no copyright
 * claims on the LIVE). Pure: each theme is a short loop of chords, bass,
 * drums and a lead line; `barNotes` returns the notes of one bar and
 * `useGameMusic` plays them with Web Audio.
 */

export const MUSIC_THEMES = ['fun', 'quiz', 'versus', 'chill', 'lobby'] as const;
export type MusicTheme = (typeof MUSIC_THEMES)[number];

export type Voice = 'lead' | 'bell' | 'keys' | 'bass' | 'kick' | 'snare' | 'hat';

export interface MusicNote {
  /** Sixteenth-note step inside the bar (0–15; fractional = swing). */
  step: number;
  /** Length in steps. */
  len: number;
  voice: Voice;
  /** MIDI note number (drums: 0). */
  midi: number;
  /** 0–1 loudness inside its voice. */
  vel: number;
}

export const STEPS_PER_BAR = 16;

/** [step, length, chord tone (0 root, 1 third, 2 fifth, 3 seventh/octave), octave shift]. */
type Hit = [step: number, len: number, tone: number, octave: number];

interface ThemeDef {
  bpm: number;
  /** MIDI note of the key's root (lead octave). */
  root: number;
  minor: boolean;
  /** Four-note chords (jazzy 7ths) instead of triads. */
  sevenths?: boolean;
  /** Scale degree (0–6) of each bar's chord; the loop is this long. */
  chords: number[];
  kick: number[];
  snare: number[];
  hat: number[];
  /** Hi-hat when time is running out (busier). */
  hatUrgent: number[];
  bass: Hit[];
  /** Lead line for the first and second half of the loop (`null` step = rest). */
  lead?: { voice: Voice; a: Hit[]; b: Hit[] };
  /** Full-chord hits (keys). */
  keys?: Hit[];
  /** Delay of off-beat 8ths, in steps (lo-fi swing). */
  swing?: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14];
const SIXTEENTHS = Array.from({ length: STEPS_PER_BAR }, (_, i) => i);

const THEMES: Record<MusicTheme, ThemeDef> = {
  // Bouncy chiptune: I–V–vi–IV, four on the floor, square arpeggios.
  fun: {
    bpm: 128,
    root: 72,
    minor: false,
    chords: [0, 4, 5, 3, 0, 4, 5, 3],
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    hat: [2, 6, 10, 14],
    hatUrgent: SIXTEENTHS,
    bass: [[0, 2, 0, -2], [2, 1, 0, -1], [4, 2, 0, -2], [6, 1, 0, -1], [8, 2, 0, -2], [10, 1, 2, -2], [12, 2, 0, -2], [14, 1, 0, -1]],
    lead: {
      voice: 'lead',
      a: [[0, 1, 0, 0], [2, 1, 1, 0], [4, 1, 2, 0], [6, 1, 3, 0], [8, 1, 2, 0], [10, 1, 1, 0], [12, 2, 2, 0]],
      b: [[0, 2, 3, 0], [3, 1, 2, 0], [4, 2, 1, 0], [7, 1, 2, 0], [8, 3, 3, 0], [12, 1, 2, 0], [14, 2, 1, 0]]
    }
  },
  // "Thinking" music for quizzes: minor, ticking hats, pulsing bass, bell plinks.
  quiz: {
    bpm: 108,
    root: 69,
    minor: true,
    chords: [0, 5, 3, 4],
    kick: [0, 8],
    snare: [],
    hat: SIXTEENTHS,
    hatUrgent: SIXTEENTHS,
    bass: EIGHTHS.map((step): Hit => [step, 1, 0, -2]),
    lead: {
      voice: 'bell',
      a: [[0, 2, 2, 0], [6, 2, 1, 0], [10, 3, 0, 0]],
      b: [[0, 2, 3, 0], [4, 2, 2, 0], [10, 2, 1, 0], [14, 2, 2, 0]]
    },
    keys: [[0, 16, 0, -1]]
  },
  // Battle: driving minor rock, galloping saw bass, power stabs.
  versus: {
    bpm: 140,
    root: 62,
    minor: true,
    chords: [0, 0, 5, 6],
    kick: [0, 3, 8, 11],
    snare: [4, 12],
    hat: EIGHTHS,
    hatUrgent: SIXTEENTHS,
    bass: [[0, 1, 0, -2], [2, 1, 0, -2], [3, 1, 0, -2], [4, 1, 0, -2], [6, 1, 0, -2], [7, 1, 0, -2], [8, 1, 0, -2], [10, 1, 0, -2], [11, 1, 0, -2], [12, 1, 0, -2], [14, 1, 2, -2], [15, 1, 0, -1]],
    lead: {
      voice: 'lead',
      a: [[0, 3, 0, 0], [3, 3, 2, 0], [6, 2, 0, 0], [10, 2, 1, 0], [12, 4, 0, 0]],
      b: [[0, 2, 2, 0], [2, 2, 3, 0], [4, 4, 2, 0], [8, 2, 1, 0], [10, 2, 0, 0], [12, 4, 1, 0]]
    }
  },
  // Lo-fi study beat for language games: 7th chords, swing, soft keys.
  chill: {
    bpm: 84,
    root: 65,
    minor: false,
    sevenths: true,
    chords: [0, 5, 1, 4],
    kick: [0, 7, 10],
    snare: [4, 12],
    hat: EIGHTHS,
    hatUrgent: SIXTEENTHS,
    bass: [[0, 6, 0, -2], [7, 2, 0, -2], [10, 4, 2, -2]],
    keys: [[0, 7, 0, -1], [7, 8, 0, -1]],
    lead: {
      voice: 'bell',
      a: [[2, 2, 3, 0], [6, 2, 2, 0], [12, 3, 1, 0]],
      b: [[0, 3, 2, 0], [8, 2, 3, 0], [11, 4, 2, 0]]
    },
    swing: 0.33
  },
  // Game list: light and happy while viewers vote.
  lobby: {
    bpm: 100,
    root: 67,
    minor: false,
    chords: [0, 3, 0, 4],
    kick: [0, 8],
    snare: [12],
    hat: [4, 12],
    hatUrgent: EIGHTHS,
    bass: [[0, 4, 0, -2], [8, 4, 2, -2]],
    lead: {
      voice: 'bell',
      a: [[0, 2, 0, 0], [2, 2, 1, 0], [4, 2, 2, 0], [6, 2, 3, 0], [8, 2, 2, 0], [10, 2, 1, 0], [12, 4, 0, 0]],
      b: [[0, 2, 2, 0], [2, 2, 3, 0], [4, 4, 2, 0], [8, 2, 1, 0], [10, 2, 2, 0], [12, 4, 1, 0]]
    }
  }
};

/** MIDI notes of the chord on scale `degree` (root, third, fifth[, seventh]). */
export function chordNotes(theme: MusicTheme, degree: number): number[] {
  const def = THEMES[theme];
  const scale = def.minor ? MINOR : MAJOR;
  const size = def.sevenths ? 4 : 3;
  return Array.from({ length: size }, (_, i) => {
    const index = degree + i * 2;
    return def.root + (scale[index % 7] ?? 0) + 12 * Math.floor(index / 7);
  });
}

/** Tone `tone` of a chord: 0–2 (or 3 with sevenths); tone 3 of a triad is the root an octave up. */
function chordTone(chord: number[], tone: number): number {
  if (tone < chord.length) return chord[tone] ?? 0;
  return (chord[0] ?? 0) + 12;
}

export function themeBpm(theme: MusicTheme, urgent: boolean): number {
  // Time running out: a bit faster.
  return THEMES[theme].bpm * (urgent ? 1.12 : 1);
}

/** Seconds per bar at the theme's tempo. */
export function barSeconds(theme: MusicTheme, urgent: boolean): number {
  return (60 / themeBpm(theme, urgent)) * 4;
}

export function loopBars(theme: MusicTheme): number {
  return THEMES[theme].chords.length;
}

/**
 * Notes of bar number `bar` (it loops). `urgent`: the last seconds of a timer —
 * busier hi-hats and an extra kick push the energy up.
 */
export function barNotes(theme: MusicTheme, bar: number, urgent = false): MusicNote[] {
  const def = THEMES[theme];
  const loop = def.chords.length;
  const index = ((bar % loop) + loop) % loop;
  const chord = chordNotes(theme, def.chords[index] ?? 0);
  const swing = (step: number) => (def.swing && step % 4 === 2 ? step + def.swing : step);
  const notes: MusicNote[] = [];

  for (const step of def.kick) notes.push({ step, len: 1, voice: 'kick', midi: 0, vel: step === 0 ? 1 : 0.8 });
  if (urgent && !def.kick.includes(14)) notes.push({ step: 14, len: 1, voice: 'kick', midi: 0, vel: 0.7 });
  for (const step of def.snare) notes.push({ step, len: 1, voice: 'snare', midi: 0, vel: 0.9 });
  for (const step of urgent ? def.hatUrgent : def.hat) notes.push({ step: swing(step), len: 1, voice: 'hat', midi: 0, vel: step % 4 === 0 ? 0.9 : 0.6 });

  for (const [step, len, tone, octave] of def.bass) {
    notes.push({ step: swing(step), len, voice: 'bass', midi: chordTone(chord, tone) + 12 * octave, vel: 0.9 });
  }
  for (const [step, len, , octave] of def.keys ?? []) {
    for (const midi of chord) notes.push({ step: swing(step), len, voice: 'keys', midi: midi + 12 * octave, vel: 0.5 });
  }
  if (def.lead) {
    // First half of the loop plays line A, second half line B.
    const line = index < Math.ceil(loop / 2) ? def.lead.a : def.lead.b;
    for (const [step, len, tone, octave] of line) {
      notes.push({ step: swing(step), len, voice: def.lead.voice, midi: chordTone(chord, tone) + 12 * octave, vel: 0.8 });
    }
  }
  return notes.sort((a, b) => a.step - b.step);
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Theme names for the settings (Vietnamese source text; translated where shown). */
export const MUSIC_THEME_LABELS: Record<MusicTheme, string> = {
  fun: '🎉 Vui nhộn',
  quiz: '❓ Hồi hộp',
  versus: '⚔️ Đối kháng',
  chill: '🎧 Nhẹ nhàng',
  lobby: '🗳 Chờ chọn game'
};
