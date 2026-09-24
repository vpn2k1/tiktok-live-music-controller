/* eslint-disable @typescript-eslint/no-explicit-any */
// The 10 newer games: rules and built-in content. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMOJI_VI_BANK, ESTIMATE_BANK, MAJORITY_BANK, RIDDLE_VI_BANK, TRUE_FALSE_EN_BANK, TRUE_FALSE_VI_BANK } from '../src/game/content/vietnamese';
import { buildEnglishDictionary } from '../src/game/english';
import { parseBank } from '../src/game/games/answerGames';
import { bombGame } from '../src/game/games/bomb';
import { estimateGame, parseEstimates, parseGuess } from '../src/game/games/estimate';
import { goldenBellGame } from '../src/game/games/goldenBell';
import { likeChallengeGame, parseMilestones } from '../src/game/games/likeChallenge';
import { majorityGame, parsePolls } from '../src/game/games/majority';
import { memoryGame, parsePair, PEEK_MS } from '../src/game/games/memory';
import { duel, parseHand, rockPaperScissorsGame } from '../src/game/games/rockPaperScissors';
import { parseTrueFalse, trueFalseChoice, trueFalseGame } from '../src/game/games/trueFalse';
import { riddleGame, vietnameseItem, wordBlanks } from '../src/game/games/vietnameseGames';
import { normalizeConfig } from '../src/game/registry';
import { foldText } from '../src/game/text';
import { buildDictionary } from '../src/game/words';

const ctx = (now: number, random = () => 0.5) => ({ now, random, dictionary: buildDictionary([]), englishDictionary: buildEnglishDictionary([]) });
const startCtx = (now = 0, random = () => 0.5) => ({ ...ctx(now, random), playlist: [], currentTrackId: null, previous: null });
const chat = (user: string, text: string): any => ({ kind: 'chat', user, nickname: user.toUpperCase(), text });
const like = (user: string, count: number): any => ({ kind: 'like', user, nickname: user.toUpperCase(), count });
const gift = (user: string, count: number): any => ({ kind: 'gift', user, nickname: user.toUpperCase(), giftName: 'Rose', count });

/** Feeds inputs like the controller: commit, then keep the new state. */
function feed(g: any, state: any, config: any, inputs: [any, number][]) {
  const results: any[] = [];
  for (const [input, now] of inputs) {
    const r = g.handle(state, input, config, ctx(now));
    results.push(r);
    if (r) { r.commit?.(); state = r.state; }
  }
  return { state, results };
}
function step(g: any, state: any, config: any, now: number, random?: () => number) {
  const r = g.advance(state, config, ctx(now, random));
  r?.commit?.();
  return r;
}

test('built-in banks: every line parses, no duplicates', () => {
  const check = (bank: string, count: number, min: number) => {
    const lines = bank.split('\n');
    assert.equal(count, lines.length, 'a line was skipped');
    assert.ok(lines.length >= min);
    assert.equal(new Set(lines.map((line) => line.toLowerCase())).size, lines.length, 'duplicate line');
  };
  check(TRUE_FALSE_VI_BANK, parseTrueFalse(TRUE_FALSE_VI_BANK).length, 40);
  check(TRUE_FALSE_EN_BANK, parseTrueFalse(TRUE_FALSE_EN_BANK).length, 40);
  check(EMOJI_VI_BANK, parseBank(EMOJI_VI_BANK, vietnameseItem).length, 45);
  check(RIDDLE_VI_BANK, parseBank(RIDDLE_VI_BANK, vietnameseItem).length, 30);
  check(MAJORITY_BANK, parsePolls(MAJORITY_BANK).length, 40);
  check(ESTIMATE_BANK, parseEstimates(ESTIMATE_BANK).length, 35);
});

test('Vietnamese answers ignore accents, case and spaces', () => {
  assert.equal(foldText('Bánh Chưng  Xanh!'), 'banhchungxanh');
  assert.equal(foldText('Đà Lạt'), 'dalat');
  assert.equal(wordBlanks('cà phê sữa'), '••  •••  •••');
  const config = normalizeConfig(riddleGame, { bank: 'Con gì càng to càng nhỏ? | con cua/cua', count: 1, seconds: 10 });
  const started: any = riddleGame.start(config as any, startCtx() as any);
  const { results } = feed(riddleGame, started.state, config, [[chat('a', 'con tôm'), 1000], [chat('b', 'CUA'), 1000], [chat('c', 'Con Cua'), 2000]]);
  assert.equal(results[0], null, 'wrong answers are free');
  assert.equal(results[1].consumed, true);
  assert.equal(results[2].consumed, true);
});

test('Đúng hay Sai: đúng/sai, d/s, true/false, a/b all work', () => {
  for (const word of ['đúng', 'Dung', 'd', 'true', 'T', 'a', '1']) assert.equal(trueFalseChoice(word), 0, word);
  for (const word of ['sai', 'S', 'false', 'f', 'b', '2']) assert.equal(trueFalseChoice(word), 1, word);
  assert.equal(trueFalseChoice('maybe'), -1);
  assert.deepEqual(parseTrueFalse('Cá voi là loài cá. | sai').map((q) => q.correct), [1]);
  const config = normalizeConfig(trueFalseGame, { questions: 'Sky is blue | true', count: 1, seconds: 10 });
  const started: any = trueFalseGame.start(config as any, startCtx() as any);
  const { state } = feed(trueFalseGame, started.state, config, [[chat('a', 'đúng'), 1000], [chat('b', 'sai'), 1000], [chat('c', 'hello'), 1000]]);
  assert.equal(state.book.total, 2);
  assert.deepEqual(step(trueFalseGame, state, config, 10_000).awards.map((a: any) => a.user), ['a']);
});

test('Rung chuông vàng: wrong or missing answers knock you out, last one wins', () => {
  const bank = 'Q1 | x | y | A\nQ2 | x | y | B\nQ3 | x | y | A';
  const config = normalizeConfig(goldenBellGame, { questions: bank, count: 3, seconds: 10, order: 'file', winPoints: 500 });
  const g: any = goldenBellGame;
  let state = g.start(config, startCtx()).state;
  // Q1: a, b right; c wrong.
  state = feed(g, state, config, [[chat('a', 'a'), 1000], [chat('b', 'A'), 2000], [chat('c', 'b'), 1000]]).state;
  let r = step(g, state, config, 10_000);
  assert.deepEqual([r.state.joined, r.state.alive, r.state.lastOut], [3, 2, 1]);
  r = step(g, r.state, config, 15_000);
  assert.equal(r.state.index, 1);
  // Q2: c is out and a latecomer can't join; b answers right, a doesn't answer.
  const q2 = feed(g, r.state, config, [[chat('c', 'b'), 16_000], [chat('late', 'b'), 16_000], [chat('b', 'b'), 17_000]]);
  assert.deepEqual([q2.results[0], q2.results[1]], [null, null]);
  r = step(g, q2.state, config, 25_000);
  assert.deepEqual([r.state.alive, r.state.lastOut], [1, 1]);
  // One survivor of a real crowd: the round ends and b rings the golden bell.
  assert.equal(step(g, r.state, config, 30_000), null);
  const end = g.finish(r.state, config, ctx(30_000));
  assert.deepEqual(end.awards, [{ user: 'b', nickname: 'B', points: 500 }]);
  assert.match(end.message, /B rung chuông vàng/);
  assert.equal(g.view(end.state, config).rows[0].label, 'B');
});

test('Kéo Búa Bao: búa > kéo > bao > búa, winners score by speed, draws a little', () => {
  assert.deepEqual([parseHand('búa'), parseHand('✋'), parseHand('keo'), parseHand('✌'), parseHand('3'), parseHand('hi')], [0, 1, 2, 2, 2, -1]);
  assert.deepEqual([duel(0, 2), duel(2, 1), duel(1, 0), duel(0, 1), duel(1, 1)], [1, 1, 1, -1, 0]);
  const config = normalizeConfig(rockPaperScissorsGame, { count: 2, seconds: 10, maxPoints: 100, drawPoints: 20 });
  const g: any = rockPaperScissorsGame;
  let { state } = feed(g, g.start(config, startCtx()).state, config, [[chat('a', 'bao'), 0], [chat('b', 'búa'), 5000], [chat('c', 'kéo'), 1000], [chat('a', 'kéo'), 2000]]);
  // House plays búa (random 0.1): bao wins, búa draws, kéo loses; a's second pick is ignored.
  const r = step(g, state, config, 10_000, () => 0.1);
  assert.equal(r.state.house, 0);
  assert.deepEqual(r.awards.map((a: any) => [a.user, a.points]), [['a', 100], ['b', 20]]);
  assert.equal(g.view(r.state, config).rows.find((row: any) => row.highlight)?.label, 'Bao');
  state = step(g, r.state, config, 14_000).state;
  assert.equal(state.index, 1);
  assert.equal(state.house, null);
});

test('Phe nào đông hơn: the bigger side scores, a tie gives everyone a bit', () => {
  const config = normalizeConfig(majorityGame, { bank: 'Chó hay mèo? | Chó | Mèo', count: 1, seconds: 10, maxPoints: 100, tiePoints: 30 });
  const g: any = majorityGame;
  let { state } = feed(g, g.start(config, startCtx()).state, config, [[chat('a', 'a'), 0], [chat('b', 'b'), 0], [chat('c', '2'), 0], [chat('d', 'x'), 0]]);
  assert.equal(g.view(state, config).rows[0].value, undefined, 'counts hidden while voting');
  let r = step(g, state, config, 10_000);
  assert.deepEqual(r.awards.map((a: any) => a.user).sort(), ['b', 'c']);
  state = feed(g, g.start(config, startCtx()).state, config, [[chat('a', 'a'), 0], [chat('b', 'b'), 0]]).state;
  r = step(g, state, config, 10_000);
  assert.deepEqual(r.awards.map((a: any) => a.points), [30, 30]);
});

test('Ước lượng: numbers in any format, closest three score, exact gets a bonus', () => {
  assert.deepEqual([parseGuess('1.440'), parseGuess('1,440'), parseGuess(' 8849 m'), parseGuess('abc'), parseGuess('12a3')], [1440, 1440, 8849, null, null]);
  const config = normalizeConfig(estimateGame, { bank: 'Phút trong ngày? | 1440 | phút', count: 1, seconds: 10, maxPoints: 100 });
  const g: any = estimateGame;
  const { state } = feed(g, g.start(config, startCtx()).state, config, [[chat('a', '1500'), 0], [chat('b', '1440'), 5000], [chat('c', '1400'), 1000], [chat('d', '99999'), 0], [chat('c', '1440'), 2000]]);
  const r = step(g, state, config, 10_000);
  assert.deepEqual(r.awards.map((a: any) => [a.user, a.points]), [['b', 150], ['c', 60], ['a', 30]]);
  assert.match(r.message, /Đáp án: 1\.440 phút/);
  assert.equal(g.view(r.state, config).rows[0].label, 'B: 1.440');
});

test('Gỡ bom: one cut per viewer, safe cuts grow, the bomb ends the round', () => {
  const config = normalizeConfig(bombGame, { wires: 4, maxPoints: 50, defusePoints: 90 });
  const g: any = bombGame;
  const start = g.start(config, startCtx(0, () => 0.99)).state;
  assert.equal(start.bomb, 3);
  let { state, results } = feed(g, start, config, [[chat('a', '1'), 0], [chat('a', '2'), 0], [chat('b', '1'), 0], [chat('b', '!cut 2'), 0], [chat('c', '9'), 0]]);
  assert.deepEqual(results[0].awards, [{ user: 'a', nickname: 'A', points: 50 }]);
  assert.equal(results[1].state, results[0].state, 'one cut per viewer');
  assert.equal(results[2].state, results[1].state, 'a cut wire stays cut');
  assert.deepEqual(results[3].awards, [{ user: 'b', nickname: 'B', points: 75 }]);
  assert.equal(results[4], null, 'no wire 9');
  // Defuse: the last safe wire.
  const defuse = g.handle(state, chat('c', '3'), config, ctx(0));
  assert.equal(defuse.finish, true);
  const won = g.finish(defuse.state, config, ctx(0));
  assert.deepEqual(won.awards.map((a: any) => a.points), [30, 30, 30]);
  // Boom.
  const boom = g.handle(state, chat('d', '4'), config, ctx(0));
  assert.equal(boom.finish, true);
  assert.match(g.finish(boom.state, config, ctx(0)).message, /BÙM! D cắt trúng bom/);
  state = boom.state;
  assert.equal(g.view(state, config).cards.cards[3].state, 'bad');
});

test('Lật hình: pairs stay open and score, misses peek then flip back', () => {
  assert.deepEqual([parsePair('3 8', 12), parsePair('3-8', 12), parsePair('!lat 3,8', 12), parsePair('3 3', 12), parsePair('3 13', 12)], [[2, 7], [2, 7], [2, 7], null, null]);
  const config = normalizeConfig(memoryGame, { pairs: 3, points: 100 });
  const g: any = memoryGame;
  let state = g.start(config, startCtx()).state;
  const face = state.faces[0];
  const twin = state.faces.findIndex((f: string, i: number) => i > 0 && f === face);
  const other = state.faces.findIndex((f: string) => f !== face);
  const miss = g.handle(state, chat('a', `1 ${other + 1}`), config, ctx(1000));
  assert.deepEqual(miss.state.peek, { a: 0, b: other, until: 1000 + PEEK_MS });
  assert.equal(g.view(miss.state, config).cards.cards[0].state, 'peek');
  assert.deepEqual(g.handle(miss.state, chat('b', `1 ${twin + 1}`), config, ctx(1500)).state, miss.state, 'wait while a miss is showing');
  assert.equal(g.tick(miss.state, config, ctx(1000 + PEEK_MS)).state.peek, null);
  const hit = g.handle(miss.state, chat('b', `1 ${twin + 1}`), config, ctx(1000 + PEEK_MS));
  assert.deepEqual(hit.awards, [{ user: 'b', nickname: 'B', points: 100 }]);
  assert.equal(hit.state.matched[0] && hit.state.matched[twin], true);
  state = hit.state;
  assert.equal(g.view(state, config).cards.cards[twin].state, 'good');
});

test('Thử thách tim: milestones unlock, the last one ends the round, top likers score', () => {
  assert.deepEqual(parseMilestones('300 | hát\nabc | x\n100 | cảm ơn\n1.000 | nhảy').map((m) => m.likes), [100, 300, 1000]);
  const config = normalizeConfig(likeChallengeGame, { milestones: '100 | cảm ơn\n300 | hát', giftLikes: 20, likesPerPoint: 10 });
  const g: any = likeChallengeGame;
  let { state, results } = feed(g, g.start(config, startCtx()).state, config, [[like('a', 60), 0], [chat('x', 'hi'), 0], [like('b', 50), 0]]);
  assert.equal(results[1], null);
  assert.equal(results[2].message, '🎉 Đạt 100 tim: cảm ơn!');
  assert.equal(state.reached, 1);
  const done = g.handle(state, gift('b', 10), config, ctx(0));
  done.commit();
  assert.equal(done.finish, true);
  const end = g.finish(done.state, config, ctx(0));
  assert.deepEqual(end.awards.map((a: any) => [a.user, a.points]), [['b', 25], ['a', 6]]);
  assert.match(end.message, /Hoàn thành thử thách 300 tim/);
});
