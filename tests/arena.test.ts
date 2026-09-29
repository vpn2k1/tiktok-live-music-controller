/* eslint-disable @typescript-eslint/no-explicit-any */
// Arena games (Đấu trường bóng, Đảo sinh tồn): joining, pushing, lives, match end. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BASE_R, MAX_R, bubbleArenaGame, crush, FIELD_H, FIELD_W, MAX_WAITS, settle, shrinkBounds, survivalGame, type ArenaPlayer } from '../src/game/games/arena';
import { buildEnglishDictionary } from '../src/game/english';
import { normalizeConfig } from '../src/game/registry';
import { buildDictionary } from '../src/game/words';

const dictionary = buildDictionary([]);
const englishDictionary = buildEnglishDictionary([]);
let seed = 3;
const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const ctx = (now = 1000) => ({ now, random, dictionary, englishDictionary });
const chat = (user: string, text: string): any => ({ kind: 'chat', user, nickname: user.toUpperCase(), text });
const BANK = Array.from({ length: 12 }, (_, i) => `Q${i} | x | y | ${i % 2 ? 'B' : 'A'}`).join('\n');

/** A match driven like the controller: handle + commit, advance at deadlines. */
function match(game: any, patch: Record<string, unknown> = {}, previous: any = null) {
  const config = normalizeConfig(game, { questions: BANK, ...patch } as any);
  const started = game.start(config, { ...ctx(), playlist: [], currentTrackId: null, previous });
  assert.ok(!('error' in started));
  let state = started.state;
  let now = 1000;
  const send = (user: string, text: string, at = now) => {
    const r = game.handle(state, chat(user, text), config, ctx(at));
    if (r) { r.commit?.(); state = r.state; }
    return r;
  };
  const next = (step = 20_000) => {
    now += step;
    const r = game.advance(state, config, ctx(now));
    if (r) { r.commit?.(); state = r.state; }
    return r;
  };
  const right = () => (['A', 'B'][state.question.correct] ?? 'A').toLowerCase();
  const wrong = () => (['B', 'A'][state.question.correct] ?? 'B').toLowerCase();
  return { config, get state() { return state; }, set state(value) { state = value; }, send, next, right, wrong, get now() { return now; } };
}

const ball = (id: number, x: number, y: number, r: number, patch: Partial<ArenaPlayer> = {}): ArenaPlayer =>
  ({ id, user: `u${id}`, nickname: `U${id}`, x, y, r, alive: true, lives: 3, points: 0, outAt: 0, mark: null, ...patch });

test('arena: !join / !thamgia add players inside the field, once each, up to the maximum', () => {
  const m = match(bubbleArenaGame, { maxPlayers: 4 });
  assert.equal(m.send('a', '!join').consumed, true);
  m.send('b', '!thamgia');
  m.send('c', '!vao');
  assert.equal(m.send('a', '!join').state.players.length, 3, 'joining twice changes nothing');
  assert.equal(m.send('x', 'join'), null, 'plain "join" is normal chat');
  assert.equal(m.send('x', 'a'), null, 'letters while waiting are normal chat');
  const full = m.send('d', '!join');
  assert.ok(full.endsAt && full.endsAt - 1000 <= 3000, 'a full room starts right away');
  assert.equal(m.send('e', '!join').state.players.length, 4, 'nobody past the maximum');
  const players = m.state.players;
  for (const player of players) {
    assert.ok(player.x > 0 && player.x < FIELD_W && player.y > 0 && player.y < FIELD_H);
    assert.equal(player.r, BASE_R);
  }
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      assert.ok(Math.hypot(players[i].x - players[j].x, players[i].y - players[j].y) >= BASE_R * 2, 'new balls do not overlap');
    }
  }
});

test('arena: not enough players — the wait is extended, then the round ends for a fresh room', () => {
  const m = match(bubbleArenaGame, { minPlayers: 3, joinSeconds: 40 });
  m.send('a', '!join');
  for (let wait = 1; wait <= MAX_WAITS; wait += 1) {
    const r = m.next();
    assert.equal(r.state.stage, 'join');
    assert.equal(r.state.waits, wait);
    assert.equal(r.endsAt, m.now + 20_000, 'half the join time again');
    assert.match(r.message, /cần ít nhất 3/);
  }
  assert.equal(m.next(), null, 'then the round ends');
  const done = bubbleArenaGame.finish(m.state, m.config, ctx());
  assert.deepEqual(done.awards, []);
  assert.equal(done.effects?.[0]?.kind, 'lose');
  assert.match(done.message, /Chưa đủ người chơi \(1\/3\)/);
});

test('arena: only players on the field answer, once; a late !join is swallowed', () => {
  const m = match(bubbleArenaGame);
  m.send('a', '!join');
  m.send('b', '!join');
  m.next();
  assert.equal(m.state.stage, 'ask');
  assert.equal(m.send('stranger', m.right()), null, 'not a player: normal chat');
  assert.equal(m.send('late', '!join').consumed, true);
  assert.equal(m.state.players.length, 2, 'no joining mid-match');
  assert.equal(m.send('a', m.right()).consumed, true);
  m.send('a', m.wrong());
  assert.equal(m.state.book.total, 1, 'first answer is final');
});

test('bubble: a faster correct answer grows more; balls never overlap after a question', () => {
  const m = match(bubbleArenaGame, { seconds: 10, grow: 30 });
  for (const user of ['a', 'b', 'c', 'd']) m.send(user, '!join');
  m.next();
  const askedAt = m.state.askedAt;
  m.send('a', m.right(), askedAt + 500);
  m.send('b', m.right(), askedAt + 9500);
  m.send('c', m.wrong(), askedAt + 1000);
  const reveal = m.next(10_000);
  const r = (user: string) => m.state.players.find((p: ArenaPlayer) => p.user === user).r;
  assert.ok(r('a') > r('b') && r('b') > r('c'), 'fast > slow > wrong');
  assert.equal(r('c'), BASE_R);
  assert.deepEqual(reveal.awards.map((a: any) => a.user), ['a', 'b']);
  const live = m.state.players.filter((p: ArenaPlayer) => p.alive);
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const gap = Math.hypot(live[i].x - live[j].x, live[i].y - live[j].y) - live[i].r - live[j].r;
      assert.ok(gap > -0.1, `balls overlap by ${-gap}`);
    }
  }
});

test('bubble: a big ball squeezes small ones against the wall and pushes them out', () => {
  const full = shrinkBounds(1, 0, 0.3);
  // The big ball fills the height: the small ball above it has no room left.
  const players = [ball(1, 80, 50, 48), ball(2, 80, 6, 5), ball(3, 145, 50, 5)];
  const pushed = crush(settle(players, full), full, 1);
  const byId = (id: number) => pushed.find((p) => p.id === id)!;
  assert.equal(byId(1).alive, true);
  assert.equal(byId(2).alive, false, 'squeezed between the big ball and the wall');
  assert.equal(byId(2).outAt, 1);
  assert.ok(byId(2).y < 0, 'it falls out past the top wall (fall animation)');
  assert.equal(byId(3).alive, true, 'a ball it does not touch stays');

  // Walls are solid: a closing wall moves balls in, it does not knock anyone out by itself.
  const small = shrinkBounds(20, 10, 0.3);
  const walled = settle([ball(1, 5, 5, 5), ball(2, 150, 90, 5)], small);
  for (const player of crush(walled, small, 2)) {
    assert.equal(player.alive, true);
    assert.ok(player.x >= small.left && player.x <= small.right && player.y >= small.top && player.y <= small.bottom);
  }

  // Two giants that cannot both fit: the weaker one (fewer points) is pushed out, the stronger never is.
  const giants = settle([ball(1, 70, 50, 40, { points: 100 }), ball(2, 90, 50, 40, { points: 300 })], small);
  const result = crush(giants, small, 3);
  assert.deepEqual(result.map((p) => [p.id, p.alive]), [[1, false], [2, true]]);

  const same = settle([ball(1, 50, 50, 5), ball(2, 50, 50, 5)], full);
  assert.ok(Math.hypot(same[0]!.x - same[1]!.x, same[0]!.y - same[1]!.y) >= 9.9, 'balls on the same spot separate');
});

test('bubble: a ball never shrinks when the field closes in', () => {
  const m = match(bubbleArenaGame, { grow: 100, shrink: 10 });
  for (const user of ['a', 'b', 'c']) m.send(user, '!join');
  m.next();
  let last = BASE_R;
  for (let q = 0; q < 8; q += 1) {
    m.send('a', m.right(), m.state.askedAt + 100);
    const reveal = m.next(12_000);
    const a = m.state.players.find((p: ArenaPlayer) => p.user === 'a');
    assert.ok(a.r >= last, `question ${q + 1}: ${a.r} < ${last}`);
    last = a.r;
    if (reveal.finish) break;
    m.next(4000);
  }
  assert.equal(last, MAX_R, 'grows up to the fixed maximum');
});

test('bubble: the field closes in from question 3 down to its minimum', () => {
  assert.deepEqual(shrinkBounds(1, 3, 0.3), { left: 0, top: 0, right: FIELD_W, bottom: FIELD_H });
  const third = shrinkBounds(3, 10, 0.3);
  assert.ok(Math.abs(third.right - third.left - FIELD_W * 0.9) < 1e-9);
  const tiny = shrinkBounds(100, 10, 0.3);
  assert.ok(Math.abs(tiny.right - tiny.left - FIELD_W * 0.3) < 1e-9);
});

test('bubble: a match plays to one winner, with a podium of the last three', () => {
  const m = match(bubbleArenaGame, { grow: 100, shrink: 10, maxQuestions: 60 });
  for (const user of ['a', 'b', 'c', 'd', 'e']) m.send(user, '!join');
  m.next();
  let finished = false;
  for (let q = 0; q < 60 && !finished; q += 1) {
    m.send('a', m.right(), m.state.askedAt + 100);
    m.send('b', m.right(), m.state.askedAt + 6000);
    const reveal = m.next(12_000);
    if (reveal.finish) finished = true;
    else m.next(4000);
  }
  assert.ok(finished, 'someone won');
  const done = bubbleArenaGame.finish(m.state, m.config, ctx());
  assert.equal(done.state.winner.user, 'a', 'the fast grower wins');
  assert.equal(done.effects[0].podium.length, 3);
  assert.equal(done.effects[0].podium[0].name, 'A');
  assert.deepEqual(done.awards.map((a: any) => a.points), [200, 100, 50]);
});

test('island: a miss costs a life, 0 lives = into the sea; if everyone misses nobody is hurt', () => {
  const m = match(survivalGame, { lives: 2 });
  for (const user of ['a', 'b', 'c']) m.send(user, '!join');
  m.next();
  m.send('a', m.right());
  m.send('b', m.wrong());
  m.next(12_000);
  const lives = () => Object.fromEntries(m.state.players.map((p: ArenaPlayer) => [p.user, p.lives]));
  assert.deepEqual(lives(), { a: 2, b: 1, c: 1 }, 'wrong and silent both lose a life');
  assert.equal(m.state.players.find((p: ArenaPlayer) => p.user === 'b').mark, 'hit');
  m.next(4000);
  m.send('b', m.wrong());
  m.send('c', m.wrong());
  m.send('a', m.wrong());
  m.next(12_000);
  assert.deepEqual(lives(), { a: 2, b: 1, c: 1 }, 'everyone missed: spared');
  m.next(4000);
  m.send('a', m.right());
  const last = m.next(12_000);
  assert.equal(last.finish, true, 'b and c fell into the sea');
  assert.deepEqual(m.state.players.filter((p: ArenaPlayer) => !p.alive).map((p: ArenaPlayer) => p.outAt), [3, 3]);
  const done = survivalGame.finish(m.state, m.config, ctx());
  assert.equal(done.state.winner.user, 'a');
  assert.equal(done.effects[0].podium[0].value, '❤️❤️');
  const view = survivalGame.view(m.state, m.config);
  assert.equal(view.arena.kind, 'island');
  assert.deepEqual(view.arena.players.map((p: any) => p.state).sort(), ['alive', 'out', 'out'], 'the fallen play their fall');
});

test('arena: the next match asks new questions', () => {
  const first = match(bubbleArenaGame, { maxQuestions: 5, shrink: 0 });
  first.send('a', '!join');
  first.send('b', '!join');
  const asked = new Set<string>();
  first.next();
  for (let q = 0; q < 5; q += 1) {
    asked.add(first.state.question.question);
    first.next(12_000);
    if (q < 4) first.next(4000);
  }
  assert.equal(asked.size, 5, 'no repeats inside a match');
  assert.equal(first.next(4000), null, 'maxQuestions ends the match');
  const done = bubbleArenaGame.finish(first.state, first.config, ctx());

  const second = match(bubbleArenaGame, { maxQuestions: 5, shrink: 0 }, done.state);
  second.send('a', '!join');
  second.send('b', '!join');
  second.next();
  for (let q = 0; q < 5; q += 1) {
    assert.ok(!asked.has(second.state.question.question), `question ${second.state.question.question} was already asked last match`);
    second.next(12_000);
    if (q < 4) second.next(4000);
  }
});

test('arena: 60 players settle fast and the overlay state stays small', () => {
  const players = Array.from({ length: 60 }, (_, i) => ball(i + 1, 80 + (i % 7), 50 + (i % 5), 4.5 + (i % 9)));
  const started = performance.now();
  const settled = crush(settle(players, shrinkBounds(1, 0, 0.3)), shrinkBounds(1, 0, 0.3), 1);
  assert.ok(performance.now() - started < 200, 'settling 60 balls');
  assert.equal(settled.length, 60);
  const m = match(bubbleArenaGame, { maxPlayers: 60 });
  for (let i = 0; i < 60; i += 1) m.send(`viewer_${i}`, '!join');
  const size = JSON.stringify(bubbleArenaGame.view(m.state, m.config)).length;
  assert.ok(size < 12_000, `overlay view is ${size} bytes`);
});
