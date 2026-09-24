/* eslint-disable @typescript-eslint/no-explicit-any */
// Olympia-style crossword + quiz presets. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CROSSWORD_EN, CROSSWORD_VI } from '../src/game/content/crossword';
import { ENGLISH_EASY_QUIZ_BANK } from '../src/game/content/english-easy';
import { buildEnglishDictionary } from '../src/game/english';
import { crosswordGame, normalizeCrossword, parseCrosswordLine, parseCrosswords } from '../src/game/games/crossword';
import { parseQuestions, quizBank, QUIZ_PRESETS, quizGame } from '../src/game/games/quiz';
import { normalizeConfig } from '../src/game/registry';
import { buildDictionary } from '../src/game/words';

const random = () => 0.3;
const ctx = (now: number) => ({ now, random, dictionary: buildDictionary([]), englishDictionary: buildEnglishDictionary([]) });
const chat = (user: string, text: string): any => ({ kind: 'chat', user, nickname: user.toUpperCase(), text });
const PUZZLE = 'SUN : trên trời | Con rắn = snake | Xe buýt = bus | Mặt trăng = moon';

test('crossword lines: rows aligned on the keyword letter', () => {
  const puzzle = parseCrosswordLine(PUZZLE);
  assert.ok(puzzle);
  assert.equal(puzzle.keyword, 'SUN');
  assert.equal(puzzle.hint, 'trên trời');
  assert.deepEqual(puzzle.rows.map((row) => [row.answer, row.keyIndex]), [['SNAKE', 0], ['BUS', 1], ['MOON', 3]]);
  assert.equal(normalizeCrossword('Hà Nội'), 'HANOI');
  assert.equal(normalizeCrossword('đường'), 'DUONG');
  assert.equal(parseCrosswordLine('SUN | a = snake | b = bus'), null, 'one row per keyword letter');
  assert.equal(parseCrosswordLine('SUN | a = cake | b = bus | c = moon'), null, 'row 1 lacks S');
  assert.equal(parseCrosswordLine('SUN | a = snake | b bus | c = moon'), null, 'row without "="');
});

test('built-in crosswords all parse (every line is a valid puzzle)', () => {
  for (const bank of [CROSSWORD_EN, CROSSWORD_VI]) assert.equal(parseCrosswords(bank).length, bank.split('\n').length);
  assert.ok(parseCrosswords(CROSSWORD_EN).length >= 15);
  assert.ok(parseCrosswords(CROSSWORD_VI).length >= 8);
});

test('crossword round: rows by speed, missed rows, keyword guess at any time', () => {
  const config = normalizeConfig(crosswordGame, { puzzles: PUZZLE, seconds: 10, reveal: 2, keywordSeconds: 20, maxPoints: 100, keywordPoints: 500 });
  const g: any = crosswordGame;
  let state = g.start(config, { ...ctx(0), playlist: [], currentTrackId: null, previous: null }).state;
  assert.equal(g.view(state, config).crossword.rows[0].state, 'active');
  // Row 1: accents/spaces/case don't matter; wrong answers are ignored.
  assert.equal(g.handle(state, chat('x', 'snak'), config, ctx(500)), null);
  const right = g.handle(state, chat('a', ' Snake '), config, ctx(1000));
  right.commit();
  state = right.state;
  let r = g.advance(state, config, ctx(10_000));
  r.commit();
  assert.deepEqual(r.awards, [{ user: 'a', nickname: 'A', points: 95 }]);
  assert.equal(r.state.rowStates[0], 'solved');
  assert.deepEqual(g.view(r.state, config).crossword.rows[0].cells, ['S', 'N', 'A', 'K', 'E']);
  assert.deepEqual(g.view(r.state, config).crossword.keyword, ['S', '', '']);
  // Row 2: nobody answers → missed (answer still shown with revealMissed "yes").
  r = g.advance(r.state, config, ctx(12_000));
  assert.equal(r.state.row, 1);
  r = g.advance(r.state, config, ctx(22_000));
  assert.equal(r.state.rowStates[1], 'missed');
  assert.deepEqual(g.view(r.state, config).crossword.rows[1].cells, ['B', 'U', 'S']);
  assert.deepEqual(g.view(r.state, config).crossword.keyword, ['S', 'U', ''], 'a shown missed row shows its keyword letter too');
  const hidden = normalizeConfig(crosswordGame, { ...config, revealMissed: 'no' });
  assert.deepEqual(g.view(r.state, hidden).crossword.rows[1].cells, ['', '', ''], 'Olympia mode keeps missed rows closed');
  assert.deepEqual(g.view(r.state, hidden).crossword.keyword, ['S', '', '']);
  // Keyword guessed with 2 of 3 rows on screen: 500 × (1 − 0.5 × 2/3) = 333.
  const guess = g.handle(r.state, chat('b', 'sun'), config, ctx(22_500));
  assert.equal(guess.finish, true);
  const end = g.finish(guess.state, config, ctx(22_500));
  assert.deepEqual(end.awards, [{ user: 'b', nickname: 'B', points: 333 }]);
  assert.match(end.message, /B đoán ra từ khóa “SUN” \(\+333\)/);
  assert.deepEqual(g.view(end.state, config).rows.map((row: any) => [row.label, row.value]), [['B', '333đ'], ['A', '95đ']]);
  assert.equal(g.handle(end.state, chat('c', 'sun'), config, ctx(23_000)), null, 'round over');
});

test('crossword: after the last row there is a final keyword stage', () => {
  const config = normalizeConfig(crosswordGame, { puzzles: 'AB | x = cat | y = cab', seconds: 5, reveal: 1, keywordSeconds: 7 });
  const g: any = crosswordGame;
  let r: any = { state: g.start(config, { ...ctx(0), playlist: [], currentTrackId: null, previous: null }).state };
  for (const now of [5000, 6000, 11_000]) r = g.advance(r.state, config, ctx(now));
  r = g.advance(r.state, config, ctx(12_000));
  assert.equal(r.state.stage, 'keyword');
  assert.equal(r.endsAt, 19_000);
  assert.match(g.view(r.state, config).headline, /Từ khóa hàng dọc/);
  assert.equal(g.advance(r.state, config, ctx(19_000)), null, 'deadline finishes the round');
  assert.match(g.finish(r.state, config, ctx(19_000)).message, /Từ khóa là “AB”/);
});

test('quiz presets: easy English by default, own questions win when valid', () => {
  assert.ok(parseQuestions(ENGLISH_EASY_QUIZ_BANK).length >= 140);
  assert.equal(parseQuestions(ENGLISH_EASY_QUIZ_BANK).length, ENGLISH_EASY_QUIZ_BANK.split('\n').length);
  const defaults = normalizeConfig(quizGame, {});
  assert.equal(defaults.preset, 'en-easy');
  assert.equal(defaults.questions, '');
  assert.equal(quizBank(defaults as any).length, parseQuestions(ENGLISH_EASY_QUIZ_BANK).length);
  assert.equal(quizBank({ preset: 'vi', questions: '' }).length, parseQuestions(QUIZ_PRESETS.vi!.bank).length);
  assert.deepEqual(quizBank({ preset: 'vi', questions: 'Mine? | a | b | A' }).map((q) => q.question), ['Mine?']);
  assert.equal(quizBank({ preset: 'vi', questions: 'not a question' }).length, parseQuestions(QUIZ_PRESETS.vi!.bank).length, 'invalid own text falls back');
  // Viewers may answer in lower case.
  const started = quizGame.start(normalizeConfig(quizGame, { questions: 'Pick | x | y | B', count: 1 }) as any, { ...ctx(0), playlist: [], currentTrackId: null, previous: null } as any);
  const answer = quizGame.handle((started as any).state, chat('u', 'b'), normalizeConfig(quizGame, {}) as any, ctx(100));
  assert.equal(answer?.consumed, true);
});
