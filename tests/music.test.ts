// Game background music: the composed loops and which music plays when. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeFeatures } from '../src/game/features';
import { musicCue, musicForGame, RESULT_LEVEL } from '../src/game/music';
import { GAMES } from '../src/game/registry';
import { barNotes, barSeconds, chordNotes, loopBars, midiToHz, MUSIC_THEME_LABELS, MUSIC_THEMES, STEPS_PER_BAR } from '../src/shared/bgm';
import { EN } from '../src/shared/i18n-en';

const TONAL = new Set(['lead', 'bell', 'keys', 'bass']);

test('music: every theme is a well-formed, repeating loop', () => {
  for (const theme of MUSIC_THEMES) {
    const loop = loopBars(theme);
    assert.ok(loop >= 2, `${theme}: a loop of several bars`);
    for (let bar = 0; bar < loop * 2; bar += 1) {
      const notes = barNotes(theme, bar);
      assert.ok(notes.some((note) => note.voice === 'kick'), `${theme} bar ${bar}: has a beat`);
      assert.ok(notes.some((note) => note.voice === 'bass'), `${theme} bar ${bar}: has a bass line`);
      for (const note of notes) {
        assert.ok(note.step >= 0 && note.step < STEPS_PER_BAR, `${theme}: note inside the bar (${note.step})`);
        assert.ok(note.len > 0 && note.vel > 0 && note.vel <= 1);
        if (TONAL.has(note.voice)) {
          const hz = midiToHz(note.midi);
          assert.ok(hz >= 30 && hz <= 2500, `${theme}: ${note.voice} ${hz.toFixed(0)} Hz is audible and not shrill`);
        }
      }
      assert.deepEqual(barNotes(theme, bar + loop), notes, `${theme}: it loops`);
      assert.deepEqual(notes.map((note) => note.step), [...notes].sort((a, b) => a.step - b.step).map((note) => note.step), 'sorted by time');
    }
    assert.deepEqual(barNotes(theme, -1), barNotes(theme, loop - 1), 'negative bars wrap');
  }
});

test('music: chords are built in key; lo-fi uses 7th chords', () => {
  assert.deepEqual(chordNotes('fun', 0), [72, 76, 79], 'C major');
  assert.deepEqual(chordNotes('fun', 4), [79, 83, 86], 'G major (V)');
  assert.deepEqual(chordNotes('quiz', 0), [69, 72, 76], 'A minor');
  assert.equal(chordNotes('chill', 0).length, 4);
  assert.equal(midiToHz(69), 440);
});

test('music: time running out = faster and busier', () => {
  for (const theme of MUSIC_THEMES) {
    assert.ok(barSeconds(theme, true) < barSeconds(theme, false), theme);
    const hats = (urgent: boolean) => barNotes(theme, 0, urgent).filter((note) => note.voice === 'hat').length;
    assert.ok(hats(true) >= hats(false), `${theme}: more hi-hats`);
    assert.ok(barNotes(theme, 0, true).some((note) => note.voice === 'kick' && note.step === 14), `${theme}: push kick`);
  }
});

test('music: which theme plays when', () => {
  const base = { enabled: true, choice: 'auto' as const, lobbyOpen: false, endsAt: null, timerStartedAt: null, now: 0 };
  const quiz = { id: 'quiz', category: 'fun' as const };
  const english = { id: 'unscramble', category: 'english' as const };
  const race = { id: 'race', category: 'fun' as const };

  assert.equal(musicCue({ ...base, phase: 'running', game: quiz })?.theme, 'quiz');
  assert.equal(musicCue({ ...base, phase: 'running', game: english })?.theme, 'chill');
  assert.equal(musicCue({ ...base, phase: 'running', game: race })?.theme, 'fun');
  assert.equal(musicCue({ ...base, phase: 'running', game: { id: 'thanhTri', category: 'versus' } })?.theme, 'versus');
  assert.equal(musicCue({ ...base, choice: 'chill', phase: 'running', game: race })?.theme, 'chill', 'one theme for every game');
  assert.equal(musicCue({ ...base, enabled: false, phase: 'running', game: race }), null);

  // Lobby, result, idle.
  assert.deepEqual(musicCue({ ...base, phase: 'idle', game: null, lobbyOpen: true }), { theme: 'lobby', level: 1, urgent: false });
  assert.deepEqual(musicCue({ ...base, phase: 'ended', game: quiz }), { theme: 'quiz', level: RESULT_LEVEL, urgent: false }, 'softer under the fanfare');
  assert.equal(musicCue({ ...base, phase: 'ended', game: quiz, lobbyOpen: true })?.theme, 'lobby', 'the list covers the result');
  assert.equal(musicCue({ ...base, phase: 'idle', game: null }), null);

  // Urgent: the last 30 % of a timer (at most 10 s); short reveal timers never.
  const timed = (left: number, total: number) => musicCue({ ...base, phase: 'running', game: quiz, timerStartedAt: 0, endsAt: total, now: total - left })?.urgent;
  assert.equal(timed(4000, 15_000), true);
  assert.equal(timed(6000, 15_000), false);
  assert.equal(timed(9000, 120_000), true);
  assert.equal(timed(11_000, 120_000), false);
  assert.equal(timed(2000, 4000), false, 'answer reveal');
  assert.equal(timed(0, 15_000), false, 'time is up');
});

test('music: every game has a theme; settings are validated', () => {
  for (const game of GAMES) assert.ok(MUSIC_THEMES.includes(musicForGame(game, 'auto')), game.id);
  const features = normalizeFeatures({ musicTheme: 'metal', musicVolume: 250, musicWithPlaylist: 'blast' } as never);
  assert.equal(features.musicTheme, 'auto');
  assert.equal(features.musicVolume, 100);
  assert.equal(features.musicWithPlaylist, 'yield');
  assert.equal(normalizeFeatures({ musicTheme: 'versus', musicWithPlaylist: 'duck' } as never).musicTheme, 'versus');
  assert.equal(normalizeFeatures(undefined).gameMusic, true);
  for (const label of Object.values(MUSIC_THEME_LABELS)) assert.ok(label in EN, `English for ${label}`);
});
