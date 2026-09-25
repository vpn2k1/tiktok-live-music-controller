/* eslint-disable @typescript-eslint/no-explicit-any */
// Versus games: Thành trì, Vua của đồi, Đấu súng, Quiz đối kháng. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEnglishDictionary } from '../src/game/english';
import { castleSiegeGame, castleWinner } from '../src/game/games/castleSiege';
import { duelGame } from '../src/game/games/duel';
import { kingOfHillGame, reignTimes } from '../src/game/games/kingOfHill';
import { teamQuizGame } from '../src/game/games/teamQuiz';
import { normalizeConfig } from '../src/game/registry';
import { isBangCommand, teamChoice } from '../src/game/teamRoster';
import { buildDictionary } from '../src/game/words';

const ctx = (now = 0, random = () => 0.5) => ({ now, random, dictionary: buildDictionary([]), englishDictionary: buildEnglishDictionary([]) });
const startCtx = (now = 0) => ({ ...ctx(now), playlist: [], currentTrackId: null, previous: null });
const chat = (user: string, text: string): any => ({ kind: 'chat', user, nickname: user.toUpperCase(), text });
const like = (user: string, count: number): any => ({ kind: 'like', user, nickname: user.toUpperCase(), count });
const gift = (user: string, count = 1): any => ({ kind: 'gift', user, nickname: user.toUpperCase(), giftName: 'Rose', count });

/** Applies a result like the controller does (commit, then the new state). */
function play(game: any, state: any, input: any, config: any, now = 0) {
  const result = game.handle(state, input, config, ctx(now));
  result?.commit?.();
  return { state: result ? result.state : state, result };
}

test('team and command parsing: only explicit commands count', () => {
  assert.equal(teamChoice('!do'), 0);
  assert.equal(teamChoice('!Đỏ'), 0);
  assert.equal(teamChoice('đỏ'), 0);
  assert.equal(teamChoice('!xanh'), 1);
  assert.equal(teamChoice('blue'), 1);
  assert.equal(teamChoice('!join'), 'auto');
  // Everyday chat never picks a side or fires.
  for (const text of ['do', 'đó', 'do đi', 'xanh lá', '!do nhanh']) assert.equal(teamChoice(text), null, text);
  assert.ok(isBangCommand('!ban', ['ban']));
  assert.ok(isBangCommand('!BẮN', ['ban']));
  for (const text of ['ban', 'bạn', '!ban ơi', 'bắn đi']) assert.equal(isBangCommand(text, ['ban']), false, text);
});

test('Thành trì: shots, likes and gifts hit the enemy castle; a fallen castle ends the round', () => {
  const g: any = castleSiegeGame;
  const config = normalizeConfig(g, { hp: 100, shotDamage: 5, likeDamage: 1, giftDamage: 50, repair: 3 });
  let state = g.start(config, startCtx()).state;
  ({ state } = play(g, state, chat('a', '!do'), config));
  ({ state } = play(g, state, chat('b', '!xanh'), config));
  ({ state } = play(g, state, chat('a', '!ban'), config));
  assert.deepEqual(state.hp, [100, 95]);
  // A viewer without a side joins the smaller one (tie → Red) and hits Blue.
  ({ state } = play(g, state, like('c', 10), config));
  assert.deepEqual(state.hp, [100, 85]);
  assert.equal(state.roster.teamOf('c'), 0);
  ({ state } = play(g, state, chat('b', '!sua'), config));
  assert.deepEqual(state.hp, [100, 88]);
  ({ state } = play(g, state, chat('b', '!sua'), config));
  ({ state } = play(g, state, chat('b', '!sua'), config));
  ({ state } = play(g, state, chat('b', '!sua'), config));
  ({ state } = play(g, state, chat('b', '!sua'), config));
  assert.equal(state.hp[1], 100, 'repairs stop at max HP');
  const blow = play(g, state, gift('a', 2), config);
  assert.equal(blow.state.hp[1], 0);
  assert.equal(blow.result.finish, true);
  assert.equal(castleWinner(blow.state), 0);
  const done = g.finish(blow.state, config, ctx());
  const points = Object.fromEntries(done.awards.map((award: any) => [award.user, award.points]));
  assert.equal(points.a, 2 + 5 + 10, 'winner + MVP');
  assert.equal(points.c, 2 + 5);
  assert.equal(points.b, 2, 'loser still gets participation');
});

test('Vua của đồi: steal, shield, gift shield / gift steal, points per second', () => {
  const g: any = kingOfHillGame;
  const config = normalizeConfig(g, { grace: 3, giftShield: 10, pointsPerSecond: 2 });
  let state = g.start(config, startCtx(0)).state;
  ({ state } = play(g, state, chat('a', '!cuop'), config, 0));
  assert.equal(state.king.user, 'a');
  // Shielded for 3 s.
  let step = play(g, state, chat('b', '!cuop'), config, 2000);
  assert.equal(step.state.king.user, 'a');
  assert.equal(step.result.consumed, true);
  ({ state } = play(g, state, chat('b', '!cuop'), config, 5000));
  assert.equal(state.king.user, 'b');
  // The king's gift adds shield; a challenger's gift breaks through.
  ({ state } = play(g, state, gift('b'), config, 6000));
  assert.equal(state.shieldUntil, 5000 + 3000 + 10_000);
  step = play(g, state, chat('a', '!cuop'), config, 9000);
  assert.equal(step.state.king.user, 'b');
  ({ state } = play(g, state, gift('c'), config, 9000));
  assert.equal(state.king.user, 'c');
  const times = Object.fromEntries(reignTimes(state, 12_000).map((entry) => [entry.user, entry.ms]));
  assert.deepEqual(times, { a: 5000, b: 4000, c: 3000 });
  const done = g.finish(state, config, ctx(12_000));
  const points = Object.fromEntries(done.awards.map((award: any) => [award.user, award.points]));
  assert.deepEqual(points, { a: 10 + 20, b: 8, c: 6 });
});

test('Đấu súng: queue, early shot loses, fastest wins, the winner stays on', () => {
  const g: any = duelGame;
  const config = normalizeConfig(g, { minWait: 2, maxWait: 2, winPoints: 20 });
  let state = g.start(config, startCtx()).state;
  for (const user of ['a', 'b', 'c']) ({ state } = play(g, state, chat(user, '!join'), config));
  assert.equal(state.queue.length, 3);
  state = g.tick(state, config, ctx(0)).state;
  assert.equal(state.phase, 'ready');
  assert.deepEqual([state.a.user, state.b.user], ['a', 'b']);
  // b shoots before the signal (t = 2 s) and loses.
  let step = play(g, state, chat('b', '!ban'), config, 1000);
  assert.equal(step.state.winner.user, 'a');
  assert.equal(step.state.reason, 'early');
  assert.deepEqual(step.result.awards, [{ user: 'a', nickname: 'A', points: 20 }]);
  state = step.state;
  state = g.tick(state, config, ctx(1000 + 3000)).state;
  assert.equal(state.phase, 'wait');
  assert.equal(state.a.user, 'a', 'champion stays');
  state = g.tick(state, config, ctx(5000)).state;
  assert.equal(state.b.user, 'c');
  // After the signal (t = 7 s) the first shot wins: c reacts in 350 ms.
  step = play(g, state, chat('c', '!ban'), config, 7350);
  assert.equal(step.state.winner.user, 'c');
  assert.equal(step.state.reactionMs, 350);
  // Other viewers' shots are ignored (consumed, no effect).
  assert.equal(play(g, state, chat('zz', '!ban'), config, 7000).result.consumed, true);
  // Nobody shoots: after the draw window both leave, no champion.
  let quiet = g.tick(g.tick(state, config, ctx(7000)).state, config, ctx(7000 + 4000)).state;
  assert.equal(quiet.phase, 'result');
  assert.equal(quiet.winner, null);
  quiet = g.tick(quiet, config, ctx(11_000 + 3000)).state;
  assert.equal(quiet.a, null);
});

test('Quiz đối kháng: answers join a side, team points, the winning side gets a bonus', () => {
  const g: any = teamQuizGame;
  const config = normalizeConfig(g, { questions: 'Q1? | yes | no | A\nQ2? | yes | no | B', count: 2, seconds: 10, maxPoints: 100, order: 'file', teamBonus: 50 });
  let state = g.start(config, startCtx(0)).state;
  ({ state } = play(g, state, chat('red1', '!do'), config));
  ({ state } = play(g, state, chat('blue1', '!xanh'), config));
  ({ state } = play(g, state, chat('red1', 'A'), config, 1000));
  ({ state } = play(g, state, chat('blue1', 'B'), config, 1000));
  // No side yet: joins the smaller team (tie → Red).
  ({ state } = play(g, state, chat('new', 'a'), config, 2000));
  assert.equal(state.roster.teamOf('new'), 0);
  const reveal = g.advance(state, config, ctx(10_000));
  reveal.commit();
  assert.equal(reveal.state.teamScores[1], 0);
  assert.ok(reveal.state.teamScores[0] > 0);
  const done = g.finish(reveal.state, config, ctx(11_000));
  assert.match(done.message, /Phe Đỏ/);
  const bonus = done.awards.filter((award: any) => award.points === 50).map((award: any) => award.user).sort();
  assert.deepEqual(bonus, ['new', 'red1']);
});
