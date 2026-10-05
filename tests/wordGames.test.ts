/* eslint-disable @typescript-eslint/no-explicit-any */
// Word games from VpngoPlay (Đoán chữ, Vòng chữ, Tìm từ, Lô tô, Cờ caro, Ai là triệu phú)
// and the imported vocabulary. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EN_WORDLE_BANK } from '../src/game/content/vocab-en';
import { buildEnglishDictionary } from '../src/game/english';
import { bingoGame, boardLines, newLines, parseSquare } from '../src/game/games/bingo';
import { LADDER, millionaireChoice, millionaireGame, roomChoiceOf, roomPrize, vocabQuestion } from '../src/game/games/millionaire';
import { lineThrough, teamCaroGame } from '../src/game/games/teamCaro';
import { parseWordleBank, scoreGuess, solvePoints, wordleGame } from '../src/game/games/wordle';
import { buildBoard, wordSearchGame } from '../src/game/games/wordSearch';
import { buildPuzzles, canSpell, wordWheelGame } from '../src/game/games/wordWheel';
import { normalizeConfig } from '../src/game/registry';
import { parseVocab, parseVocabLine, VOCAB_PRESETS } from '../src/game/vocab';
import { buildDictionary } from '../src/game/words';

const ctx = (now: number, random = () => 0.5) => ({ now, random, dictionary: buildDictionary([]), englishDictionary: buildEnglishDictionary([]) });
const startCtx = (now = 0, random = () => 0.5) => ({ ...ctx(now, random), playlist: [], currentTrackId: null, previous: null });
const chat = (user: string, text: string, isHost = false): any => ({ kind: 'chat', user, nickname: user.toUpperCase(), text, isHost });
const gift = (user: string): any => ({ kind: 'gift', user, nickname: user.toUpperCase(), giftName: 'Rose', count: 1 });

/** A seeded random so boards are reproducible. */
function seeded(seed = 1) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

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
function step(g: any, state: any, config: any, now: number) {
  const r = g.advance(state, config, ctx(now));
  r?.commit?.();
  return r;
}

test('imported vocabulary: every set parses completely in its language', () => {
  for (const [key, preset] of Object.entries(VOCAB_PRESETS)) {
    const lines = preset.bank.split('\n');
    assert.equal(parseVocab(preset.bank, preset.lang).length, lines.length, `${key}: a line was skipped`);
    assert.ok(lines.length >= 20, `${key} is too small`);
  }
  assert.ok(parseWordleBank(EN_WORDLE_BANK).length > 1500);
  const ja = parseVocabLine('猫 | ねこ/neko | con mèo', 'ja');
  assert.deepEqual(ja?.answers, ['猫', 'ねこ', 'neko']);
  assert.equal(parseVocabLine('ice cream | kem', 'en')?.answers[0], 'icecream');
  assert.equal(parseVocabLine('# ghi chú | x', 'en'), null);
});

test('Đoán chữ: Wordle colors, solving, helper bonus and the reveal', () => {
  assert.deepEqual(scoreGuess('crane', 'crane'), ['hit', 'hit', 'hit', 'hit', 'hit']);
  assert.deepEqual(scoreGuess('eerie', 'there'), ['near', 'miss', 'near', 'miss', 'hit']);
  assert.deepEqual(scoreGuess('speed', 'abide'), ['miss', 'miss', 'near', 'miss', 'near']);
  assert.equal(solvePoints({ points: 200, maxGuesses: 30 }, 1), 200);
  assert.equal(solvePoints({ points: 200, maxGuesses: 30 }, 31), 100);

  const config = normalizeConfig(wordleGame, { bank: 'apple | quả táo', count: 1, helperPoints: 10 }) as any;
  const started: any = wordleGame.start(config, startCtx() as any);
  const { state, results } = feed(wordleGame, started.state, config, [
    [chat('a', 'ample'), 1000],
    [chat('b', 'ample'), 1100],
    [chat('c', 'bcdfg'), 1200],
    [chat('d', 'hello there'), 1300],
    [chat('e', 'APPLE'), 2000]
  ]);
  assert.equal(results[0].awards[0].points, 40, 'a _ p l e: four new greens');
  assert.equal(results[1].consumed, true, 'a repeated guess is consumed');
  assert.equal(results[1].awards, undefined);
  assert.equal(results[2], null, 'no vowel: not a word');
  assert.equal(results[3], null);
  assert.equal(results[4].endsAt, 2000, 'solved: closes the word now');
  assert.equal(state.solver.nickname, 'E');
  assert.equal(wordleGame.handle(state, chat('f', 'apple'), config, ctx(2100) as any), null, 'no guesses after the solve');
  const reveal = step(wordleGame, state, config, 2100);
  assert.equal(reveal.state.stage, 'reveal');
  assert.equal(step(wordleGame, reveal.state, config, 9000), null, 'one word: the round ends');
  const finished = wordleGame.finish(reveal.state, config, ctx(9000) as any);
  assert.match(finished.message, /E/);
  assert.equal(wordleGame.view(state, config).grid?.columns, 5);
});

test('Vòng chữ: spelling, targets, bonus words, end of the wheel', () => {
  assert.equal(canSpell('tea', ['e', 'a', 't']), true);
  assert.equal(canSpell('tee', ['e', 'a', 't']), false);
  const bank = [
    { word: 'planet', meaning: 'hành tinh' },
    { word: 'plan', meaning: 'kế hoạch' },
    { word: 'plant', meaning: 'cây' },
    { word: 'net', meaning: 'lưới' },
    { word: 'ant', meaning: 'kiến' },
    { word: 'zebra', meaning: 'ngựa vằn' }
  ];
  const { puzzles } = buildPuzzles(bank, 1, 6, [], seeded());
  assert.equal(puzzles.length, 1);
  assert.deepEqual(puzzles[0]?.targets.map((target) => target.word).sort(), ['ant', 'net', 'plan', 'planet', 'plant']);

  const config = normalizeConfig(wordWheelGame, { bank: bank.map((entry) => `${entry.word} | ${entry.meaning}`).join('\n'), letters: 6, count: 1 }) as any;
  const started: any = wordWheelGame.start(config, startCtx(0, seeded()) as any);
  const { state, results } = feed(wordWheelGame, started.state, config, [
    [chat('a', 'plant'), 1000],
    [chat('b', 'plant'), 1100],
    [chat('c', 'zebra'), 1200],
    [chat('d', 'lane'), 1300],
    [chat('e', 'lane'), 1400]
  ]);
  assert.equal(results[0].awards[0].points, 50);
  assert.equal(results[1].consumed, true);
  assert.equal(results[1].awards, undefined, 'only the first finder scores');
  assert.equal(results[2], null, 'letters not on the wheel');
  assert.equal(results[3], null, '"lane" is not a known word');
  assert.deepEqual(state.bonus, []);
  const bonus = feed(wordWheelGame, state, config, [[chat('f', 'tan'), 1500]]);
  assert.equal(bonus.results[0], null, 'unknown words are not bonus words');
  const all = feed(wordWheelGame, state, config, ['planet', 'plan', 'net', 'ant'].map((word, i) => [chat(`p${i}`, word), 2000 + i] as [any, number]));
  assert.equal(all.results[3].endsAt, 2003, 'every slot found: the wheel closes');
});

test('Tìm từ: words are on the board, first finder scores, hint at half time', () => {
  const random = seeded(7);
  const { letters, words } = buildBoard([{ word: 'cat', meaning: 'mèo' }, { word: 'dog', meaning: 'chó' }, { word: 'bird', meaning: 'chim' }], 8, 3, [[0, 1], [1, 0]], random);
  assert.equal(letters.length, 64);
  for (const word of words) assert.equal(word.cells.map((cell) => letters[cell]).join(''), word.word);

  const config = normalizeConfig(wordSearchGame, { bank: 'cat | mèo\ndog | chó\nbird | chim\nfish | cá', seconds: 100 }) as any;
  const started: any = wordSearchGame.start(config, startCtx(0, seeded(3)) as any);
  assert.equal(started.state.words.length, 4);
  const { state, results } = feed(wordSearchGame, started.state, config, [[chat('a', 'cat'), 1000], [chat('b', 'cat'), 1100], [chat('c', 'Hôm nay'), 1200]]);
  assert.equal(results[0].awards[0].points, 50);
  assert.equal(results[1], null, 'already found');
  assert.equal(results[2], null);
  assert.equal(wordSearchGame.tick?.(state, config, ctx(10_000) as any), null);
  const hinted = wordSearchGame.tick?.(state, config, ctx(50_000) as any);
  assert.equal(hinted?.state.hinted, true);
  assert.ok(wordSearchGame.view(hinted?.state, config).grid?.cells.some((cell) => cell.state === 'active'));
  const rest = feed(wordSearchGame, state, config, ['dog', 'bird', 'fish'].map((word, i) => [chat(`p${i}`, word), 2000] as [any, number]));
  assert.equal(rest.results[2].finish, true, 'all found: the round ends');
});

test('Lô tô: squares, one try per call, Kinh! lines', () => {
  assert.equal(parseSquare('5'), 5);
  assert.equal(parseSquare('!so 12'), 12);
  assert.equal(parseSquare('số 3'), 3);
  assert.equal(parseSquare('5 con mèo'), null);
  assert.equal(boardLines(3).length, 8);

  const bank = Array.from({ length: 9 }, (_, i) => `word${String.fromCharCode(97 + i)} | nghĩa ${i}`).join('\n');
  const config = normalizeConfig(bingoGame, { bank, size: 3, points: 20, kinhPoints: 50 }) as any;
  const started: any = bingoGame.start(config, startCtx(0, seeded(5)) as any);
  let state = started.state;
  const target = state.order[0] + 1;
  const wrong = (target % 9) + 1;
  const r = feed(bingoGame, state, config, [[chat('a', String(wrong)), 1000], [chat('a', String(target)), 1100], [chat('b', String(target)), 1200]]);
  assert.equal(r.results[0].consumed, true, 'a wrong number uses the try');
  assert.equal(r.results[1].consumed, true);
  assert.equal(r.results[1].awards, undefined, 'one try per call');
  assert.equal(r.results[2].awards[0].points, 20);
  assert.equal(r.state.stage, 'show');
  state = r.state;

  // Claim the rest; the last square of a line is Kinh!
  const cells = state.cells.map((cell: any) => ({ ...cell, claimer: 'X' }));
  assert.ok(newLines(cells, 3, 4, []).length === 4, 'the centre completes a row, a column and both diagonals');
  assert.deepEqual(newLines(cells, 3, 4, ['r1', 'c1', 'd0', 'd1']), []);

  const shown = step(bingoGame, state, config, 5000);
  assert.equal(shown.state.call, 1);
  const missed = step(bingoGame, shown.state, config, 30_000);
  assert.equal(missed.state.cells[shown.state.order[1]].missed, true);
});

test('Cờ caro: teams claim squares by answer, three in a row wins the board', () => {
  assert.deepEqual(lineThrough([0, 0, 0, null, null, null, null, null, null], 3, 1, 0), [0, 1, 2]);
  assert.equal(lineThrough([0, 1, 0, null, null, null, null, null, null], 3, 0, 0), null);
  assert.deepEqual(lineThrough([0, null, null, null, 0, null, null, null, 0], 3, 8, 0), [0, 4, 8]);

  const bank = ['cat | mèo', 'dog | chó', 'pig | lợn', 'cow | bò', 'hen | gà', 'fox | cáo', 'owl | cú', 'bee | ong', 'ant | kiến', 'bat | dơi'].join('\n');
  const config = normalizeConfig(teamCaroGame, { bank, size: 3, target: 1 }) as any;
  const started: any = teamCaroGame.start(config, startCtx(0, seeded(2)) as any);
  const words = started.state.cells.map((cell: any) => cell.word.term);
  const { state, results } = feed(teamCaroGame, started.state, config, [
    [chat('r', '!do'), 100],
    [chat('b', '!xanh'), 100],
    [chat('r', words[0]), 1000],
    [chat('b', words[0]), 1100],
    [chat('b', words[4]), 1200],
    [chat('r', words[1]), 1300],
    [chat('r', 'hello'), 1400],
    [chat('r', words[2]), 1500]
  ]);
  assert.equal(results[2].awards[0].points, 10);
  assert.equal(results[3], null, 'a claimed square is gone');
  assert.equal(results[6], null, 'a non-answer is ignored');
  assert.equal(state.stage, 'show');
  assert.equal(state.boardWinner, 0);
  assert.deepEqual(state.line, [0, 1, 2]);
  assert.equal(step(teamCaroGame, state, config, 9000), null, 'target reached: the match ends');
  assert.match(teamCaroGame.finish(state, config, ctx(9000) as any).message, /1 – 0/);
});

test('Ai là triệu phú: votes, room answer, ladder, lifelines', () => {
  assert.equal(millionaireChoice('b'), 1);
  assert.equal(millionaireChoice('Đáp án D'), 3);
  assert.equal(millionaireChoice('bạn ơi'), -1);
  assert.equal(roomChoiceOf([2, 3, 3, 0], [0, 50, 20, null]), 2, 'a tie goes to the option voted first');
  assert.equal(roomChoiceOf([0, 0, 0, 0], [null, null, null, null]), -1);
  assert.equal(roomPrize(7, 'wrong'), LADDER[4]);
  assert.equal(roomPrize(4, 'wrong'), 0);
  assert.equal(roomPrize(7, 'stopped'), LADDER[6]);
  const words = parseVocab('cat | mèo\ndog | chó\npig | lợn\ncow | bò', 'en');
  const question = vocabQuestion(words[0] as any, words, seeded());
  assert.equal(question?.answers[question.correct], 'mèo');

  const questions = Array.from({ length: 16 }, (_, i) => `Q${i} | đúng | sai1 | sai2 | sai3 | A`).join('\n');
  const config = normalizeConfig(millionaireGame, { questions, seconds: 20 }) as any;
  const started: any = millionaireGame.start(config, startCtx() as any);
  assert.ok(started.state.spare, 'the 16th question is the spare');
  let { state, results } = feed(millionaireGame, started.state, config, [
    [chat('a', 'a'), 1000],
    [chat('b', 'b'), 1100],
    [chat('c', 'a'), 1200],
    [chat('a', 'c'), 1300],
    [chat('x', '!5050'), 1400],
    [gift('g'), 1500]
  ]);
  assert.equal(results[3].consumed, true, 'second vote is consumed, not counted');
  assert.equal(results[4], null, 'lifelines are host-only commands');
  assert.equal(state.removed.length, 2, 'the first gift is 50:50');
  assert.ok(!state.removed.includes(0));
  const blocked = millionaireGame.handle(state, chat('d', ['a', 'b', 'c', 'd'][state.removed[0]] as string), config, ctx(1600) as any);
  assert.equal(blocked, null, 'removed options cannot be voted');
  // b had a vote before the 50:50; if b was removed it can't be the room's answer.
  const reveal = step(millionaireGame, state, config, 21_000);
  assert.equal(reveal.state.climbed, 1);
  assert.equal(reveal.awards.length, 2, 'both right voters score');
  const next = step(millionaireGame, reveal.state, config, 25_000);
  assert.equal(next.state.index, 1);
  assert.deepEqual(next.state.removed, []);
  // Host switches the question, then the room answers wrong.
  ({ state } = feed(millionaireGame, next.state, config, [[chat('host', '!doicau', true), 26_000], [chat('a', 'b'), 27_000]]));
  assert.ok(state.used.includes('swap'));
  assert.equal(state.spare, null);
  const wrong = step(millionaireGame, state, config, 50_000);
  assert.equal(wrong.state.result, 'wrong');
  assert.equal(step(millionaireGame, wrong.state, config, 55_000), null, 'a wrong answer ends the climb');
  assert.match(millionaireGame.finish(wrong.state, config, ctx(55_000) as any).message, /bậc 1\/15/);
});
