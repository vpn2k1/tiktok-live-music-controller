/* eslint-disable @typescript-eslint/no-explicit-any */
// Party arena games: musical chairs, melting ice, knockout ring, hot potato, balloon shoot-out. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ArenaPlayer } from '../src/game/games/arena';
import {
  balloonShootGame,
  bombsFor,
  chairsFor,
  duelBracketGame,
  floeRadius,
  hotPotatoGame,
  iceHeat,
  makePairs,
  meltingIceGame,
  musicalChairsGame
} from '../src/game/games/partyGames';
import { normalizeConfig } from '../src/game/registry';

let seed = 5;
const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const ctx = (now = 1000) => ({ now, random, dictionary: null as any, englishDictionary: null as any });
const chat = (user: string, text: string): any => ({ kind: 'chat', user, nickname: user.toUpperCase(), text });
const BANK = Array.from({ length: 30 }, (_, i) => `Q${i} | x | y | ${i % 2 ? 'B' : 'A'}`).join('\n');

/** A match with `users` joined and the first question asked. */
function match(game: any, users: string[], patch: Record<string, unknown> = {}) {
  const config = normalizeConfig(game, { questions: BANK, maxPlayers: 60, ...patch } as any);
  let state = game.start(config, { ...ctx(), playlist: [], currentTrackId: null, previous: null }).state;
  const apply = (r: any) => { if (r) { r.commit?.(); state = r.state; } return r; };
  for (const user of users) apply(game.handle(state, chat(user, '!join'), config, ctx()));
  let now = 50_000;
  apply(game.advance(state, config, ctx(now)));
  const letter = (right: boolean) => (['A', 'B'][right ? state.question.correct : 1 - state.question.correct] ?? 'A').toLowerCase();
  return {
    config,
    get state() { return state; },
    set state(value: any) { state = value; },
    /** Answers at `ms` after the question started. */
    answer: (user: string, right: boolean, ms = 1000) => apply(game.handle(state, chat(user, letter(right)), config, ctx(state.askedAt + ms))),
    close: () => { now += 12_000; return apply(game.advance(state, config, ctx(now))); },
    nextQuestion: () => { now += 4000; return apply(game.advance(state, config, ctx(now))); },
    player: (user: string): ArenaPlayer => state.players.find((p: ArenaPlayer) => p.user === user)
  };
}

test('musical chairs: about a fifth fewer chairs; fast right > wrong > silent', () => {
  assert.deepEqual([30, 12, 5, 2].map(chairsFor), [24, 9, 4, 1]);
  const m = match(musicalChairsGame, ['a', 'b', 'c', 'd', 'e']);
  assert.equal(musicalChairsGame.view(m.state, m.config).arena?.props?.length, 4, 'four chairs for five');
  m.answer('a', true, 3000);
  m.answer('b', true, 500);
  m.answer('c', false, 100);
  m.answer('d', false, 9000);
  const reveal = m.close();
  assert.deepEqual(m.state.players.filter((p: ArenaPlayer) => !p.alive).map((p: ArenaPlayer) => p.user), ['e'], 'silent one has no chair');
  assert.deepEqual(reveal.awards.map((a: any) => a.user).sort(), ['a', 'b']);
  const view = musicalChairsGame.view(m.state, m.config).arena!;
  const chairs = view.props!;
  for (const player of view.players.filter((p) => p.state !== 'out')) {
    assert.ok(chairs.some((chair) => Math.abs(chair.x - player.x) < 1e-9 && Math.abs(chair.y - player.y) < 1e-9), `${player.label} sits on a chair`);
  }
  m.nextQuestion();
  const walking = musicalChairsGame.view(m.state, m.config).arena!;
  assert.equal(walking.props!.length, 3, 'next question: one chair fewer');
  assert.ok(walking.players.every((p) => !chairs.some((chair) => chair.x === p.x && chair.y === p.y)), 'everyone walks around again');
  // Two left, one chair: the faster correct answer wins.
  const final = match(musicalChairsGame, ['x', 'y']);
  final.answer('x', true, 4000);
  final.answer('y', true, 2000);
  assert.equal(final.close().finish, true);
  assert.equal(musicalChairsGame.finish(final.state, final.config, ctx()).state.winner?.user, 'y');
});

test('melting ice: fast right barely melts, wrong or silent melts double; it gets hotter', () => {
  assert.ok(iceHeat(10) > iceHeat(1));
  assert.ok(floeRadius(100) > floeRadius(30));
  const m = match(meltingIceGame, ['fast', 'slow', 'wrong', 'quiet']);
  assert.equal(m.player('fast').lives, 100);
  m.answer('fast', true, 100);
  m.answer('slow', true, 11_500);
  m.answer('wrong', false, 100);
  m.close();
  const hp = (user: string) => m.player(user).lives;
  assert.ok(hp('fast') > hp('slow') && hp('slow') > hp('wrong'), `${hp('fast')} > ${hp('slow')} > ${hp('wrong')}`);
  assert.equal(hp('wrong'), 100 - 2 * iceHeat(1));
  assert.equal(hp('quiet'), hp('wrong'));
  assert.ok(m.player('fast').r > m.player('wrong').r, 'the floe shrinks with the ice');
  assert.equal(meltingIceGame.view(m.state, m.config).arena?.players.find((p) => p.label === 'FAST')?.value, `🧊 ${hp('fast')}%`);
  // Silent players melt away; the one answering stays.
  let finished = false;
  for (let q = 0; q < 10 && !finished; q += 1) {
    m.nextQuestion();
    m.answer('fast', true, 100);
    finished = m.close().finish === true;
  }
  assert.ok(finished);
  assert.equal(meltingIceGame.finish(m.state, m.config, ctx()).state.winner?.user, 'fast');
});

test('knockout ring: pairs and byes; only fighters answer; faster wins; a double miss fights again', () => {
  assert.deepEqual(makePairs([1, 2, 3]), [{ a: 1, b: 2, winner: null }, { a: 3, b: null, winner: 3 }]);
  const m = match(duelBracketGame, ['a', 'b', 'c', 'd', 'e']);
  const pairs = m.state.pairs;
  assert.equal(pairs.length, 3);
  assert.equal(pairs.filter((pair: any) => pair.b == null).length, 1, 'one bye for five players');
  const idOf = (user: string) => m.player(user).id;
  const userOf = (id: number) => m.state.players.find((p: ArenaPlayer) => p.id === id).user;
  const bye = userOf(pairs.find((pair: any) => pair.b == null).a);
  assert.equal(m.answer(bye, true), null, 'a player with a bye waits (their letter is normal chat)');
  const [first, second] = pairs.filter((pair: any) => pair.b != null);
  // Pair 1: b is faster. Pair 2: both miss.
  m.answer(userOf(first.a), true, 3000);
  m.answer(userOf(first.b), true, 1000);
  m.answer(userOf(second.a), false);
  m.answer(userOf(second.b), false);
  const reveal = m.close();
  assert.equal(m.player(userOf(first.a)).alive, false);
  assert.equal(m.player(userOf(first.b)).alive, true);
  assert.equal(m.state.pairs.find((pair: any) => pair.a === second.a)?.winner, null, 'no winner yet');
  assert.equal(m.state.bracket, 1, 'the round is not over');
  assert.match(reveal.message ?? '', /Đáp án/);
  m.nextQuestion();
  assert.equal(m.answer(userOf(first.b), true), null, 'a winner waits for the other bouts');
  m.answer(userOf(second.a), true, 500);
  m.close();
  assert.equal(m.state.bracket, 2, 'all bouts decided: next round');
  assert.equal(m.state.players.filter((p: ArenaPlayer) => p.alive).length, 3);
  assert.deepEqual(m.state.pairs.flatMap((pair: any) => [pair.a, pair.b]).filter((id: any) => id != null).sort(), [idOf(bye), first.b, second.a].sort());
});

test('hot potato: a right holder passes to the silent one; a fuse at zero explodes; bombs are topped up', () => {
  assert.deepEqual([2, 4, 5, 12, 1].map(bombsFor), [1, 1, 2, 3, 0]);
  const m = match(hotPotatoGame, ['a', 'b', 'c', 'd']);
  const holder = m.state.players.find((p: ArenaPlayer) => p.fuse > 0);
  assert.equal(m.state.players.filter((p: ArenaPlayer) => p.fuse > 0).length, 1);
  // Give the holder a long fuse so the pass is visible.
  m.state = { ...m.state, players: m.state.players.map((p: ArenaPlayer) => (p.id === holder.id ? { ...p, fuse: 3 } : p)) };
  const others = m.state.players.filter((p: ArenaPlayer) => p.id !== holder.id).map((p: ArenaPlayer) => p.user);
  m.answer(holder.user, true, 500);
  m.answer(others[0], true, 800);
  m.answer(others[1], false, 800);
  m.close();
  assert.equal(m.player(holder.user).fuse, 0, 'passed on');
  assert.equal(m.player(others[2]).fuse, 2, 'the silent player got it, and the fuse burned one question');
  // A holder who misses keeps the bomb; at zero it explodes.
  m.nextQuestion();
  m.answer(others[2], false);
  m.close();
  m.nextQuestion();
  m.answer(others[2], false);
  const boom = m.close();
  assert.equal(m.player(others[2]).alive, false, 'BOOM');
  assert.ok(boom.effects.some((effect: any) => effect.user === others[2].toUpperCase()));
  assert.equal(m.state.players.filter((p: ArenaPlayer) => p.alive && p.fuse > 0).length, bombsFor(3), 'a new bomb is dealt');
});

test('balloon shoot-out: right answers shoot; missed first, then the slowest right; one hit per target', () => {
  const m = match(balloonShootGame, ['fast', 'slow', 'miss', 'quiet'], { lives: 2 });
  m.answer('fast', true, 100);
  m.answer('slow', true, 9000);
  m.answer('miss', false, 100);
  m.close();
  const lives = () => Object.fromEntries(m.state.players.map((p: ArenaPlayer) => [p.user, p.lives]));
  // Two shots: the two players who missed lose a balloon each (nobody is hit twice in one question).
  assert.deepEqual(lives(), { fast: 2, slow: 2, miss: 1, quiet: 1 });
  m.nextQuestion();
  m.answer('fast', true, 100);
  m.answer('slow', true, 9000);
  m.answer('miss', true, 5000);
  m.answer('quiet', true, 6000);
  m.close();
  // Everyone right: each shooter hits the slowest right answer not hit yet.
  assert.equal(lives().slow, 1, 'the slowest is the first target');
  assert.equal(m.state.players.filter((p: ArenaPlayer) => p.mark === 'hit').length, 3, 'three of four hit (the fastest is spared)');
  assert.equal(m.player('fast').lives, 2);
  assert.equal(balloonShootGame.view(m.state, m.config).arena?.players.find((p) => p.label === 'FAST')?.value, '🎈🎈');
});

test('musical chairs: balls fit the rings, walking and seated, from 5 to 60 players', () => {
  for (const count of [5, 12, 30, 60]) {
    const users = Array.from({ length: count }, (_, i) => `u${i}`);
    const m = match(musicalChairsGame, users);
    const overlaps = () => {
      const live = m.state.players.filter((p: ArenaPlayer) => p.alive);
      let worst = 0;
      for (let i = 0; i < live.length; i += 1) {
        for (let j = i + 1; j < live.length; j += 1) {
          worst = Math.max(worst, live[i].r + live[j].r - Math.hypot(live[i].x - live[j].x, live[i].y - live[j].y));
        }
      }
      return worst;
    };
    assert.ok(overlaps() <= 0.01, `${count} walking: overlap ${overlaps().toFixed(2)}`);
    users.forEach((user, i) => m.answer(user, i % 3 !== 0, 500 + i * 100));
    m.close();
    assert.ok(overlaps() <= 0.01, `${count} seated: overlap ${overlaps().toFixed(2)}`);
  }
});
