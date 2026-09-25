/* eslint-disable @typescript-eslint/no-explicit-any */
// Correctness + load tests for the parts that must survive huge rooms. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CommandRateLimiter } from '../src/game/engine';
import { buildEnglishDictionary } from '../src/game/english';
import { getGame, normalizeConfig } from '../src/game/registry';
import { Scoreboard } from '../src/game/scoreboard';
import { speedPoints } from '../src/game/series';
import { buildDictionary } from '../src/game/words';
import { LiveEventBatcher } from '../src/shared/eventBatch';

let seed = 42;
const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const ctx = (now: number) => ({ now, random, dictionary: buildDictionary([]), englishDictionary: buildEnglishDictionary([]) });

test('scoreboard matches a brute-force leaderboard', () => {
  const board = new Scoreboard();
  const plain = new Map<string, number>();
  for (let i = 0; i < 5000; i += 1) {
    const user = `u${Math.floor(random() * 700)}`;
    const points = 1 + Math.floor(random() * 120);
    board.add(user, user.toUpperCase(), points);
    plain.set(user, (plain.get(user) ?? 0) + points);
  }
  const sorted = [...plain].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  assert.deepEqual(board.top(20).map((entry) => [entry.user, entry.points]), sorted.slice(0, 20));
  for (const [user, points] of sorted) {
    assert.equal(board.rank(user), sorted.filter(([, other]) => other > points).length + 1, user);
  }
  assert.equal(board.size, plain.size);
  assert.equal(board.rank('nobody'), null);
  board.add('x', 'X', 0);
  board.add('', 'X', 5);
  assert.equal(board.size, plain.size, 'ignores empty users and non-positive points');
});

test('scoreboard index grows past its initial range', () => {
  const board = new Scoreboard();
  board.add('a', 'A', 10);
  board.add('b', 'B', 200_000);
  board.add('c', 'C', 5_000_000);
  assert.deepEqual([board.rank('c'), board.rank('b'), board.rank('a')], [1, 2, 3]);
  board.add('a', 'A', 6_000_000);
  assert.deepEqual([board.rank('a'), board.rank('c')], [1, 2]);
});

test('rate limiter: O(1) generations keep the cooldown exact', () => {
  const limiter = new CommandRateLimiter();
  assert.equal(limiter.allow('x', 2000, 0), true);
  assert.equal(limiter.allow('x', 2000, 1999), false);
  assert.equal(limiter.allow('y', 2000, 2500), true);
  assert.equal(limiter.allow('x', 2000, 2500), true, 'x rotated out but its cooldown is over');
  assert.equal(limiter.allow('y', 2000, 4400), false, 'y still cooling down across a rotation');
  assert.equal(limiter.allow('y', 2000, 4500), true);
  assert.equal(limiter.allow('z', 0, 0), true);
  assert.equal(limiter.allow('z', 0, 0), true);
});

test('event batcher caps comments/joins, merges likes, never drops gifts', () => {
  const batcher = new LiveEventBatcher({ chats: 3, joins: 1 });
  const base = { id: '', nickname: '', at: 0 };
  for (let i = 0; i < 5; i += 1) batcher.push({ ...base, type: 'chat', user: `c${i}`, comment: 'A' } as any);
  batcher.push({ ...base, type: 'chat', user: 'test', comment: '!start', simulated: true } as any);
  for (let i = 0; i < 3; i += 1) batcher.push({ ...base, type: 'join', user: `j${i}` } as any);
  for (let i = 0; i < 4; i += 1) batcher.push({ ...base, type: 'like', user: 'fan', count: 5, total: 100 + i } as any);
  for (let i = 0; i < 10; i += 1) batcher.push({ ...base, type: 'gift', user: `g${i}`, giftName: 'Rose', count: 1 } as any);
  const batch = batcher.flush();
  assert.ok(batch);
  assert.deepEqual(batch.dropped, { chat: 2, join: 2 });
  assert.equal(batch.events.filter((e) => e.type === 'chat').length, 4, '3 + the simulated one');
  const likes = batch.events.filter((e) => e.type === 'like') as any[];
  assert.deepEqual(likes.map((e) => [e.count, e.total]), [[20, 103]]);
  assert.equal(batch.events.filter((e) => e.type === 'gift').length, 10);
  assert.equal(batcher.flush(), null);
});

test('speed points: instant = max, deadline = half, never 0', () => {
  assert.equal(speedPoints(100, 0, 10_000), 100);
  assert.equal(speedPoints(100, 5000, 10_000), 75);
  assert.equal(speedPoints(100, 10_000, 10_000), 50);
  assert.equal(speedPoints(100, 99_000, 10_000), 50);
  assert.equal(speedPoints(1, 10_000, 10_000), 1);
});

test('load: 1,000,000 viewers on the leaderboard', () => {
  const board = new Scoreboard();
  const started = performance.now();
  for (let i = 0; i < 1_000_000; i += 1) board.add(`viewer_${i}`, `V${i}`, 1 + (i % 997));
  for (let i = 0; i < 200_000; i += 1) board.add(`viewer_${(i * 7919) % 1_000_000}`, '', 50);
  const elapsed = performance.now() - started;
  assert.equal(board.size, 1_000_000);
  assert.equal(board.top(1)[0]?.points, 996 + 50 + 1);
  assert.ok(board.rank('viewer_0')! > 900_000);
  // Generous bound for slow CI machines; locally this is well under a second.
  assert.ok(elapsed < 8000, `1.2M awards took ${Math.round(elapsed)} ms`);
});

test('load: one quiz question answered by 200,000 viewers', () => {
  const quiz: any = getGame('quiz');
  const config = normalizeConfig(quiz, { questions: 'Big room? | a | b | c | d | B', count: 1, seconds: 20 });
  const started = quiz.start(config, { ...ctx(0), playlist: [], currentTrackId: null, previous: null });
  let state = started.state;
  const t0 = performance.now();
  for (let i = 0; i < 200_000; i += 1) {
    const result = quiz.handle(state, { kind: 'chat', user: `v${i}`, nickname: `V${i}`, text: 'ABCD'[i % 4] }, config, ctx(i / 10));
    result?.commit?.();
    if (result) state = result.state;
  }
  const answered = performance.now() - t0;
  const closed = quiz.advance(state, config, ctx(20_000));
  closed.commit();
  const elapsed = performance.now() - t0;
  assert.equal(state.book.total, 200_000);
  assert.equal(closed.awards.length, 50_000);
  assert.equal(quiz.view(closed.state, config).rows[1].value, '50000');
  assert.ok(elapsed < 8000, `200k answers took ${Math.round(answered)} ms (+ scoring ${Math.round(elapsed - answered)} ms)`);
});
