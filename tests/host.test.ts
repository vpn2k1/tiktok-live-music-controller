/* eslint-disable @typescript-eslint/no-explicit-any */
// Game host scenarios (play loop, switch requests, gifts), plus edge cases of the
// lobby, the question race and the default podium. Run with `npm test`.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  addGifts,
  applyHostAction,
  createLoop,
  DEFAULT_AUTOPLAY,
  EMPTY_GIFT_SWITCH,
  hostStep,
  normalizeAutoPlay,
  type AutoPlaySettings,
  type HostAction,
  type PlayLoop
} from '../src/game/autoplay';
import { buildEnglishDictionary } from '../src/game/english';
import { closeLobby, giftLobby, lobbyOverlay, openLobby, voteLobby } from '../src/game/lobby';
import { getGame, normalizeConfig } from '../src/game/registry';
import { awardsPodium } from '../src/game/series';
import { buildDictionary } from '../src/game/words';
import { EN } from '../src/shared/i18n-en';

const GAMES_INFO = [{ id: 'a', category: 'fun' }, { id: 'b', category: 'fun' }, { id: 'c', category: 'fun' }];
const settings = (patch: Partial<AutoPlaySettings> = {}) => normalizeAutoPlay({ ...DEFAULT_AUTOPLAY, ...patch }, GAMES_INFO);

/**
 * A fake controller driven second by second: each round of any game lasts
 * `roundSeconds`; the host acts on `hostStep` like useAutoPlay's tick does.
 */
function simulate(s: AutoPlaySettings, roundSeconds: number, seconds: number, events: Record<number, (world: any) => void> = {}) {
  const world = {
    now: 0,
    loop: null as PlayLoop | null,
    running: false,
    kind: null as string | null,
    roundEndsAt: 0,
    list: null as { timed: boolean } | null,
    auto: false,
    log: [] as string[],
    startRound(id: string) {
      world.running = true;
      world.kind = id;
      world.roundEndsAt = world.now + roundSeconds * 1000;
      world.log.push(`${world.now / 1000}s start ${id}`);
    }
  };
  for (let second = 0; second <= seconds; second += 1) {
    world.now = second * 1000;
    events[second]?.(world);
    if (world.running && world.now >= world.roundEndsAt) {
      world.running = false;
      world.log.push(`${second}s end ${world.kind}`);
    }
    const action: HostAction = hostStep(world.loop, s, { running: world.running, kind: world.kind, auto: world.auto, list: world.list }, world.now);
    if (action.type === 'adopt' || action.type === 'roundStarted' || action.type === 'roundEnded') world.loop = applyHostAction(world.loop, action, world.now);
    else if (action.type === 'restart') {
      world.startRound(action.gameId);
      world.loop = applyHostAction(world.loop, { type: 'roundStarted' }, world.now);
    } else if (action.type === 'switch' || action.type === 'openList') {
      world.loop = null;
      world.list = { timed: true };
      world.log.push(`${second}s list`);
    }
  }
  return world;
}

test('host: a game replays forever; each result stays on screen for the round gap', () => {
  const world = simulate(settings({ roundGapSeconds: 8 }), 30, 400, { 0: (w) => w.startRound('a') });
  const starts = world.log.filter((line) => line.includes('start'));
  assert.ok(starts.length >= 10, `rounds keep coming (${starts.length})`);
  assert.ok(starts.every((line) => line.endsWith('start a')), 'always the same game');
  assert.ok(!world.log.some((line) => line.includes('list')), 'never back to the list by itself');
  // End at 30 s, next start 8 s after the host noticed it.
  assert.deepEqual(world.log.slice(0, 3), ['0s start a', '30s end a', '38s start a']);
  assert.equal(world.loop?.roundsPlayed, starts.length - 1);
});

test('host: a switch asked mid-round waits for the round end + gap, then opens the list once', () => {
  const world = simulate(settings({ roundGapSeconds: 8 }), 60, 200, {
    0: (w) => w.startRound('a'),
    10: (w) => { w.loop = { ...w.loop, switchPending: true }; }
  });
  assert.deepEqual(world.log, ['0s start a', '60s end a', '68s list'], 'no cut, no extra round, one list');
  assert.equal(world.loop, null);
});

test('host: a switch asked during the gap still lets the result finish its gap', () => {
  const world = simulate(settings({ roundGapSeconds: 8 }), 20, 100, {
    0: (w) => w.startRound('a'),
    23: (w) => { w.loop = { ...w.loop, switchPending: true }; }
  });
  assert.deepEqual(world.log, ['0s start a', '20s end a', '28s list']);
});

test('host: a game started by the host mid-gap is adopted with a fresh loop (no stale switch)', () => {
  const world = simulate(settings({ roundGapSeconds: 8 }), 20, 45, {
    0: (w) => w.startRound('a'),
    5: (w) => { w.loop = { ...w.loop, switchPending: true }; },
    22: (w) => w.startRound('b')
  });
  assert.equal(world.loop?.gameId, 'b');
  assert.equal(world.loop?.switchPending, false, 'the old request does not carry over to the new game');
  assert.ok(!world.log.some((line) => line.includes('list')));
});

test('host: "rounds" rule switches after exactly N rounds; the auto session opens a timed list', () => {
  const world = simulate(settings({ switchBy: 'rounds', roundsPerGame: 3, roundGapSeconds: 5 }), 10, 200, { 0: (w) => w.startRound('a') });
  assert.equal(world.log.filter((line) => line.includes('start')).length, 3);
  assert.ok(world.log.at(-1)?.endsWith('list'));

  const s = settings();
  assert.deepEqual(hostStep(null, s, { running: false, kind: null, auto: true, list: null }, 0), { type: 'openList' });
  assert.deepEqual(hostStep(null, settings({ lobbyEnabled: false }), { running: false, kind: null, auto: true, list: null }, 0), { type: 'startFirst' });
  assert.deepEqual(hostStep(null, s, { running: false, kind: null, auto: true, list: { timed: false } }, 0), { type: 'timeList' });
  assert.deepEqual(hostStep(null, s, { running: false, kind: null, auto: true, list: { timed: true } }, 0), { type: 'none' });
  assert.deepEqual(hostStep(null, s, { running: false, kind: null, auto: false, list: null }, 0), { type: 'none' }, 'without the session nothing starts by itself');
  assert.deepEqual(hostStep(createLoop('a', 0), s, { running: true, kind: null, auto: false, list: null }, 0), { type: 'none' });
});

test('gift switch: the "minimum game time" counts from the new game, not from the request', () => {
  const s = settings({ giftCount: 1, giftCooldownSeconds: 30 });
  // Game A (on since -60 s): a gift asks for a switch at 0 s; the round runs to 120 s; game B starts at 128 s.
  const asked = addGifts(EMPTY_GIFT_SWITCH, s, 1, 0, -60_000);
  assert.equal(asked.switch, true);
  const early = addGifts(asked.state, s, 1, 130_000, 128_000);
  assert.equal(early.switch, false, 'B just started: gifts do not switch it yet');
  assert.equal(early.state.progress, 0, 'and are not saved up for later');
  assert.equal(addGifts(asked.state, s, 1, 158_000, 128_000).switch, true, 'after 30 s of B they do');
  // A game that has been on for a while can be switched by its first gifts.
  assert.equal(addGifts(EMPTY_GIFT_SWITCH, s, 1, 500_000, 0).switch, true);
});

test('settings: a saved v2 setup keeps its switch rule; unknown numbers are clamped', () => {
  const saved = JSON.parse(JSON.stringify(settings({ switchBy: 'time', switchMinutes: 7 })));
  const loaded = normalizeAutoPlay(saved, GAMES_INFO);
  assert.equal(loaded.switchBy, 'time');
  assert.equal(loaded.switchMinutes, 7);
  assert.equal(normalizeAutoPlay({ ...saved, roundGapSeconds: 1 }, GAMES_INFO).roundGapSeconds, 3);
});

test('lobby: empty or all-zero lists and late votes never break the pick', () => {
  const empty = closeLobby(openLobby([], 0, 10), Math.random, 0);
  assert.deepEqual(empty.result?.ranking, []);
  assert.doesNotThrow(() => lobbyOverlay(empty, 0));

  // A gift before any vote goes to a game (the first), and it counts as a vote.
  const gifted = giftLobby(openLobby(['a', 'b'], 0, null), 'u', 1, 5, 1000, 20);
  assert.deepEqual(gifted.votes, [5, 0]);
  assert.equal(gifted.endsAt, 21_000, 'a gift starts the countdown too');

  const closed = closeLobby(voteLobby(openLobby(['a', 'b'], 0, 10), 'u', 1, 1, 0, 10), Math.random, 10_000);
  assert.equal(closed.result?.ranking[0], 'b');
  assert.equal(voteLobby(closed, 'x', 0, 50, 11_000, 10).result?.ranking[0], 'b', 'the announced pick cannot change');
});

test('default podium: nobody twice, best total first', () => {
  const effect = awardsPodium([
    { user: 'a', nickname: 'A', points: 30 },
    { user: 'b', nickname: 'B', points: 50 },
    { user: 'a', nickname: 'A', points: 40 },
    { user: 'c', nickname: 'C', points: 10 },
    { user: 'd', nickname: 'D', points: 0 }
  ], 'done');
  assert.deepEqual(effect?.podium?.map((entry) => entry.name), ['A', 'B', 'C'], 'A has 70 in total');
  assert.equal(awardsPodium([{ user: 'd', nickname: 'D', points: 0 }], 'x'), null);
});

// ---- Question race ----------------------------------------------------------

const dictionary = buildDictionary([]);
const englishDictionary = buildEnglishDictionary([]);
const ctx = (now = 1000, random = Math.random) => ({ now, random, dictionary, englishDictionary });
const race = getGame('race') as any;
const chat = (user: string, text: string): any => ({ kind: 'chat', user, nickname: user.toUpperCase(), text });

function raceWith(questions: string, patch: Record<string, unknown> = {}, previous: any = null) {
  const config = normalizeConfig(race, { questions, ...patch } as any);
  const started = race.start(config, { ...ctx(), playlist: [], currentTrackId: null, previous });
  assert.ok(!('error' in started), started.error);
  let state = started.state;
  const answer = (user: string, text: string, now = 2000) => {
    const r = race.handle(state, chat(user, text), config, ctx(now));
    if (r) { r.commit?.(); state = r.state; }
    return r;
  };
  const close = (now: number) => {
    const r = race.advance(state, config, ctx(now));
    if (r) { r.commit?.(); state = r.state; }
    return r;
  };
  return { config, get state() { return state; }, answer, close };
}

test('race: a new bank after the last race (fewer questions) still starts and asks only real questions', () => {
  const previous = { asked: [5, 7, 40] };
  const game = raceWith('Q1 | x | y | A\nQ2 | x | y | B', {}, previous);
  assert.ok(['Q1', 'Q2'].includes(game.state.question.question));
  for (let i = 0; i < 6; i += 1) {
    game.close(10_000 + i * 20_000);
    assert.ok(game.state.question, 'always a question');
  }
});

test('race: letters outside the options, answers during the reveal and after the end are ignored', () => {
  const game = raceWith('Q | yes | no | A');
  assert.equal(game.answer('u', 'c'), null, '2 options: "c" is not an answer');
  assert.equal(game.answer('u', 'A.'), null);
  game.close(20_000);
  assert.equal(game.state.stage, 'reveal');
  assert.equal(game.answer('late', 'a'), null, 'reveal: too late');
});

test('race: several viewers crossing the line on one question — the first correct answer wins', () => {
  const game = raceWith('Q | x | y | A', { goal: 2 });
  for (const user of ['p', 'q', 'r']) game.answer(user, 'a');
  game.close(20_000);
  game.close(22_000);
  for (const user of ['r', 'q', 'p']) game.answer(user, 'a');
  const closed = game.close(40_000);
  assert.equal(closed.finish, true);
  assert.equal(game.state.winner.user, 'r');
  const done = race.finish(game.state, game.config, ctx());
  assert.deepEqual(done.awards.map((award: any) => award.user), ['r', 'q', 'p']);
  assert.equal(done.effects[0].podium[0].name, 'R');
});

test('race: stopped by the host mid-question — the leader so far wins, pending answers do not move', () => {
  const game = raceWith('Q | x | y | A', { goal: 5 });
  game.answer('a', 'a');
  game.close(20_000);
  game.close(22_000);
  game.answer('b', 'a');
  const done = race.finish(game.state, game.config, ctx());
  assert.equal(done.state.winner.user, 'a');
  assert.equal(done.state.stage, 'done');
  assert.equal(race.handle(done.state, chat('c', 'a'), game.config, ctx()), null, 'a finished race takes no answers');
});

test('race: huge rooms — view stays small and one question closes fast', () => {
  const game = raceWith('Q | x | y | A', { goal: 50 });
  for (let i = 0; i < 20_000; i += 1) game.answer(`u${i}`, i % 3 ? 'a' : 'b');
  const started = performance.now();
  game.close(20_000);
  assert.ok(performance.now() - started < 500, 'closing a question with 20k answers');
  const view = race.view(game.state, game.config);
  assert.ok(view.race.lanes.length <= 6);
  assert.equal(view.race.lanes[0].label, 'U1', 'first correct answer leads');
});

// ---- Every Vietnamese t('…') text has an English entry ----------------------

const VIETNAMESE = /[À-ÃÈ-ÊÌÍÒ-ÕÙÚÝà-ãè-êìíò-õùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'en' || name === 'content' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

test('i18n: every t() text in the app has an English entry', () => {
  const missing: string[] = [];
  for (const file of sourceFiles(join(import.meta.dirname, '..', 'src'))) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      const key = (match[1] ?? '').replace(/\\'/g, "'");
      if (VIETNAMESE.test(key) && !(key in EN)) missing.push(`${file.split('/src/')[1]}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});
