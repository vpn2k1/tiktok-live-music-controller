/* eslint-disable @typescript-eslint/no-explicit-any */
// Unit tests for the pure game modules. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENGLISH_QUIZ_BANK, CATEGORY_BANK, EMOJI_BANK, SENTENCE_BANK, VOCAB_BANK } from '../src/game/content/english';
import { addPoints, clearRound, CommandRateLimiter, createGameState, endRound, startRound, topScores } from '../src/game/engine';
import { BUILTIN_ENGLISH_WORDS, buildEnglishDictionary, isEnglishAttempt, looksLikeEnglishWord, normalizeEnglish } from '../src/game/english';
import { likePoints, normalizeFeatures } from '../src/game/features';
import { emojiItem, parseBank, scrambleWord, sentenceItem, shuffleSentence, vocabItem } from '../src/game/games/answerGames';
import { maskWord, parseHangmanBank } from '../src/game/games/hangman';
import { parseCategories } from '../src/game/games/nameIt';
import { DEFAULT_QUESTIONS, parseQuestions } from '../src/game/games/quiz';
import { gameNames } from '../src/game/chatCommands';
import { GAMES, getGame, normalizeConfig } from '../src/game/registry';
import { commandArgument } from '../src/game/types';
import { BUILTIN_WORDS, buildDictionary, isVietnameseSyllable, parseDictionary, twoSyllables } from '../src/game/words';
import { DEFAULT_OVERLAY_CONFIG, FULL_DESIGN_HEIGHT, fullStage, normalizeOverlayConfig, overlayConfigQuery, parseOverlayConfig, presetFor, stagePadding, stageWidth } from '../src/shared/overlay';

const dictionary = buildDictionary([]);
const englishDictionary = buildEnglishDictionary([]);
let seed = 1;
const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const ctx = (now = 1000) => ({ now, random, dictionary, englishDictionary });
const tracks = ['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3'].map((name, i) => ({ id: `t${i}`, name, url: '' }));
const startCtx = (previous: any = null, now = 1000) => ({ ...ctx(now), playlist: tracks, currentTrackId: 't0', previous });
const chat = (user: string, text: string): any => ({ kind: 'chat', user, nickname: user.toUpperCase(), text });
const like = (user: string, count: number): any => ({ kind: 'like', user, nickname: user.toUpperCase(), count });
const gift = (user: string, count: number, giftName = 'Rose'): any => ({ kind: 'gift', user, nickname: user.toUpperCase(), giftName, count });
const game = (id: string): any => { const g = getGame(id); assert.ok(g, id); return g; };

/** Starts a round and feeds inputs; returns final state and every result. */
function play(id: string, config: Record<string, unknown> = {}, inputs: any[] = [], previous: any = null) {
  const g = game(id);
  const c = normalizeConfig(g, config as any);
  const started = g.start(c, startCtx(previous));
  assert.ok(!('error' in started), `${id} start: ${(started as any).error}`);
  let state = started.state;
  const results: any[] = [];
  for (const input of inputs) {
    const r = g.handle(state, input, c, ctx(2000));
    results.push(r);
    // Like the controller: commit, then take the new state.
    if (r) { r.commit?.(); state = r.state; }
  }
  return { g, c, state, results, finish: () => g.finish(state, c, ctx()) };
}

/** Runs the round deadline step (series games) like the controller does. */
function step(g: any, state: any, c: any, now: number) {
  const r = g.advance(state, c, ctx(now));
  r?.commit?.();
  return r;
}

test('vietnamese words', () => {
  assert.equal(new Set(BUILTIN_WORDS).size, BUILTIN_WORDS.length, 'duplicate builtin words');
  for (const word of BUILTIN_WORDS) assert.ok(twoSyllables(word), `invalid builtin word: ${word}`);
  for (const ok of ['người', 'nghiêng', 'khuya', 'chuyện', 'quá', 'gì', 'đường', 'khuỷu', 'oai', 'ưu']) assert.ok(isVietnameseSyllable(ok), ok);
  for (const bad of ['hello', 'ok', 'xyz', 'bbb', 'chàò', 'ab1', '']) assert.ok(!isVietnameseSyllable(bad), bad);
  assert.deepEqual(parseDictionary('Nhạc sĩ\nhello world\nba\ncon  mèo\n'), ['nhạc sĩ', 'con mèo']);
});

test('registry and config normalization', () => {
  assert.equal(GAMES.length, 50);
  assert.equal(new Set(GAMES.map((g) => g.id)).size, 50);
  // Every `!start <name>` name must point to exactly one game.
  const names = GAMES.flatMap((g) => gameNames(g).map((name) => [name, g.id] as const));
  for (const [name, id] of names) assert.deepEqual([...new Set(names.filter(([other]) => other === name).map(([, owner]) => owner))], [id], `name "${name}" is shared`);
  const quiz = game('quiz');
  assert.equal(normalizeConfig(quiz, { seconds: 9999 }).seconds, 300);
  assert.equal(normalizeConfig(quiz, { seconds: 'abc' }).seconds, 15);
  assert.equal(normalizeConfig(game('race'), { icon: '<img>' }).icon, '🦆');
  for (const g of GAMES) {
    for (const f of g.settings) assert.ok(f.key in g.defaultConfig, `${g.id}.${f.key} missing default`);
    assert.ok(g.commands.length >= 1, `${g.id} lacks commands`);
  }
});

test('boss', () => {
  const { results, finish } = play('boss', { hp: 200, giftDamage: 20 }, [like('a', 50), gift('b', 5), like('a', 999), like('c', 5)]);
  assert.equal(results[2].finish, true);
  const f = finish();
  assert.match(f.message, /Đòn kết liễu: A/);
  assert.deepEqual(f.awards.map((a: any) => [a.user, a.points]), [['a', 8], ['b', 3]]);
});

test('vietnamese word chain', () => {
  const g = game('wordChain');
  const config = normalizeConfig(g, {});
  let state: any = { current: 'âm nhạc', chain: [{ word: 'âm nhạc', user: null, nickname: 'x' }], used: ['âm nhạc'], words: {} };
  let r = g.handle(state, chat('u1', 'Nhạc  Sĩ'), config, ctx(5000));
  assert.equal(r.state.current, 'nhạc sĩ');
  assert.equal(r.endsAt, 35000);
  state = r.state;
  assert.equal(g.handle(state, chat('u2', 'nhac si'), config, ctx()), null); // plain chat: not a command
  state = g.handle(state, chat('u2', 'sĩ quan'), config, ctx()).state;
  assert.equal(g.handle(state, chat('u3', 'hello there'), config, ctx()), null);
  assert.match(g.handle({ ...state, current: 'nhạc sĩ' }, chat('u3', 'sĩ quan'), config, ctx()).message, /đã dùng/);
  assert.match(g.handle(state, chat('u3', 'quan xa'), normalizeConfig(g, { mode: 'dictionary' }), ctx()).message, /không có trong từ điển/);
  r = g.handle(state, chat('u3', 'quan xa'), config, ctx());
  assert.equal(r.state.current, 'quan xa');
  assert.equal(g.finish(r.state, config, ctx()).awards.length, 3);
  assert.ok(dictionary.words.has(g.start(config, startCtx()).state.current));
});

test('guess number', () => {
  const g = game('guessNumber');
  const config = normalizeConfig(g, { max: 100 });
  let state: any = { max: 100, secret: 42, low: 1, high: 100, guesses: [], winner: null };
  let r = g.handle(state, chat('a', '50'), config, ctx());
  assert.equal(r.state.high, 49);
  state = g.handle(r.state, chat('b', '30'), config, ctx()).state;
  assert.equal(state.low, 31);
  assert.equal(g.handle(state, chat('c', '60'), config, ctx()).state, state);
  assert.equal(g.handle(state, chat('c', 'abc'), config, ctx()), null);
  r = g.handle(state, chat('d', '!guess 42'), config, ctx());
  assert.equal(r.finish, true);
  assert.deepEqual(g.finish(r.state, config, ctx()).awards, [{ user: 'd', nickname: 'D', points: 5 }]);
});

test('quiz', () => {
  assert.ok(parseQuestions(DEFAULT_QUESTIONS).length >= 100);
  assert.equal(parseQuestions('Q? | x | y | Z\nbad\nQ3 | a | | B').length, 0);
  // Started at t=1000, answers at t=2000 → 1 s of a 10 s question = 95 of 100 points.
  const { state, results, finish, g, c } = play('quiz', { questions: 'Q1? | a | b | c | d | C', count: 1, seconds: 10 }, [chat('u1', 'c'), chat('u2', 'A'), chat('u1', 'a'), chat('u3', 'C'), chat('u4', 'hello')]);
  assert.equal(results[2].state, results[1].state, 'first answer is final');
  assert.equal(results[4], null);
  assert.equal(g.view(state, c).rows[0].value, undefined, 'counts hidden while asking');
  assert.deepEqual(finish().awards.map((a: any) => [a.user, a.points]), [['u1', 95], ['u3', 95]]);
  const two = normalizeConfig(g, { questions: 'Q1? | a | b | A\nQ2? | a | b | B', count: 1 });
  const first = g.start(two, startCtx());
  const second = g.start(two, startCtx(first.state));
  assert.notEqual(second.state.items[0].question, first.state.items[0].question);
  assert.equal(g.start(two, startCtx(second.state)).state.asked.length, 1);
});

test('quiz series: ask → reveal → next → final ranking', () => {
  const bank = 'Q1? | a | b | A\nQ2? | a | b | B\nQ3? | a | b | A';
  const { state, g, c } = play('quiz', { questions: bank, count: 2, seconds: 10, maxPoints: 100, reveal: 3 }, []);
  assert.equal(state.items.length, 2);
  const correct = (s: any) => 'AB'[s.items[s.index].correct] as string;
  const wrong = (s: any) => 'AB'[1 - s.items[s.index].correct] as string;
  // Question 1: fast answers score more.
  let s = state;
  for (const [user, text, now] of [['fast', correct(s), 1500], ['slow', correct(s), 10_000], ['bad', wrong(s), 1200]] as const) {
    const r = g.handle(s, chat(user, text), c, ctx(now));
    r.commit?.();
    s = r.state;
  }
  let r = step(g, s, c, 11_000);
  assert.equal(r.state.stage, 'reveal');
  assert.equal(r.endsAt, 14_000);
  assert.deepEqual(r.awards.map((a: any) => [a.user, a.points]), [['fast', 98], ['slow', 55]]);
  assert.equal(g.view(r.state, c).rows.find((row: any) => row.highlight)?.value, '2');
  assert.match(g.view(r.state, c).hint, /FAST 0\.5s • 2\/3 người đúng/);
  // Answers during the reveal are ignored.
  assert.equal(g.handle(r.state, chat('late', correct(s)), c, ctx(12_000)), null);
  // Question 2.
  r = step(g, r.state, c, 14_000);
  assert.equal(r.state.stage, 'ask');
  assert.equal(r.state.index, 1);
  assert.equal(r.endsAt, 24_000);
  s = r.state;
  const answer = g.handle(s, chat('slow', correct(s)), c, ctx(14_000));
  answer.commit();
  r = step(g, answer.state, c, 24_000);
  assert.deepEqual(r.awards, [{ user: 'slow', nickname: 'SLOW', points: 100 }]);
  // No more questions: the deadline finishes the round with the total ranking.
  assert.equal(step(g, r.state, c, 27_000), null);
  const end = g.finish(r.state, c, ctx(27_000));
  assert.deepEqual(end.awards, [], 'already awarded per question');
  assert.deepEqual(g.view(end.state, c).rows.map((row: any) => [row.label, row.value]), [['SLOW', '155đ'], ['FAST', '98đ']]);
  assert.match(end.message, /Tổng kết 2 câu: 🥇 SLOW 155đ · 🥈 FAST 98đ/);
  assert.equal(end.effects[0].kind, 'win');
});

test('fastest finger', () => {
  const { state, g, c } = play('fastestFinger', { words: 'Cà Phê' });
  assert.equal(state.target, 'cà phê');
  assert.equal(g.handle(state, chat('a', 'ca phe'), c, ctx()), null);
  assert.equal(g.handle(state, chat('b', ' CÀ   PHÊ '), c, ctx()).finish, true);
});

test('team battle', () => {
  const { state, results, finish } = play('teamBattle', { giftPoints: 10 }, [chat('a', 'a'), chat('b', 'B'), chat('a', 'b'), like('a', 30), gift('b', 1), like('x', 100)]);
  assert.equal(state.members.a.team, 0);
  assert.deepEqual(state.scores, [30, 10]);
  assert.equal(results[5], null);
  assert.match(finish().message, /Đội Đỏ thắng 30 – 10/);
  const joins = play('teamBattle', {}, [chat('a', '!join a'), chat('b', '!b'), chat('c', '!join'), chat('d', '!join'), chat('e', '!join x')]).state;
  assert.deepEqual(['a', 'b', 'c', 'd'].map((u) => joins.members[u].team), [0, 1, 0, 1]);
  assert.equal(joins.members.e, undefined);
});

test('race: correct answers move +1 step, first correct first; first to the finish wins', () => {
  const bank = ['Q1 | x | y | A', 'Q2 | x | y | B', 'Q3 | x | y | A'].join('\n');
  const g = game('race');
  const c = normalizeConfig(g, { questions: bank, goal: 2, seconds: 10, reveal: 2 } as any);
  const started = g.start(c, startCtx());
  assert.ok(!('error' in started));
  let state = started.state;
  const answer = (user: string, correct: boolean) => {
    const letter = correct ? ['A', 'B'][state.question.correct] : ['B', 'A'][state.question.correct];
    const r = g.handle(state, chat(user, letter.toLowerCase()), c, ctx(2000));
    r.commit?.();
    state = r.state;
    return r;
  };
  assert.equal(g.handle(state, chat('a', 'hello'), c, ctx()), null, 'normal chat is ignored');

  // Question 1: b answers first, then a; c is wrong.
  answer('b', true);
  answer('a', true);
  answer('c', false);
  assert.equal(answer('b', false).consumed, true, 'only the first answer counts');
  let r = step(g, state, c, 11_000);
  state = r.state;
  assert.equal(state.stage, 'reveal');
  assert.equal(r.finish, false);
  assert.deepEqual(state.leaders.map((racer: any) => [racer.user, racer.steps]), [['b', 1], ['a', 1]], 'same step: first correct answer is ahead');
  assert.deepEqual(r.awards.map((award: any) => award.user), ['b', 'a']);
  assert.equal(g.view(state, c).race.lanes[0].value, '1/2');

  // Question 2: a answers before b; both reach the finish, a answered first and wins.
  state = step(g, state, c, 13_000).state;
  assert.equal(state.stage, 'ask');
  assert.equal(state.number, 2);
  answer('a', true);
  answer('b', true);
  r = step(g, state, c, 23_000);
  state = r.state;
  assert.equal(r.finish, true, 'the race ends when someone crosses the line');
  assert.equal(state.winner.user, 'a');

  const done = g.finish(state, c, ctx());
  assert.equal(done.state.stage, 'done');
  assert.deepEqual(done.awards.map((award: any) => [award.user, award.points]), [['a', 100], ['b', 50]]);
  assert.equal(done.effects[0].kind, 'win');
  assert.deepEqual(done.effects[0].podium, [{ name: 'A', value: '2/2 bước' }], 'the winner alone in the spotlight');

  // Out of questions: the leader wins; nobody correct = no winner.
  const limited = normalizeConfig(g, { questions: bank, goal: 10, maxQuestions: 3 } as any);
  let s2 = g.start(limited, startCtx()).state;
  const r1 = g.handle(s2, chat('z', ['a', 'b'][s2.question.correct]), limited, ctx());
  r1.commit?.();
  s2 = r1.state;
  for (let i = 0; i < 5 && s2.stage !== 'done'; i += 1) {
    const next = step(g, s2, limited, 50_000 + i * 20_000);
    if (!next) break;
    s2 = next.state;
  }
  assert.equal(s2.number, 3, 'stops after maxQuestions');
  assert.equal(g.advance(s2, limited, ctx()), null);
  assert.equal(g.finish(s2, limited, ctx()).state.winner.user, 'z');
  assert.equal(g.finish(g.start(limited, startCtx()).state, limited, ctx()).effects[0].kind, 'lose');
});

test('quiz rounds end with a top-3 podium (names for the avatars)', () => {
  const g = game('quiz');
  const c = normalizeConfig(g, { questions: 'Q | x | y | A', count: 1 } as any);
  let state = g.start(c, startCtx()).state;
  for (const user of ['a', 'b', 'c', 'd']) {
    const r = g.handle(state, chat(user, 'a'), c, ctx(1000 + user.charCodeAt(0) * 100));
    r.commit?.();
    state = r.state;
  }
  state = step(g, state, c, 20_000).state;
  const done = g.finish(state, c, ctx());
  assert.equal(done.effects[0].kind, 'win');
  assert.deepEqual(done.effects[0].podium.map((entry: any) => entry.name), ['A', 'B', 'C'], 'fastest correct answers, top 3 only');
  assert.ok(done.effects[0].podium.every((entry: any) => /đ$/.test(entry.value)));
});

test('wheel', () => {
  const g = game('wheel');
  const config = normalizeConfig(g, { giftName: 'Rose', spinSeconds: 5 });
  let state = g.start(config, startCtx()).state;
  assert.equal(g.handle(state, gift('a', 1, 'Lion'), config, ctx(1000)), null);
  assert.equal(g.handle(state, chat('a', '!spin'), config, ctx(1000)), null);
  state = g.handle(state, gift('a', 2, 'rose'), config, ctx(1000)).state;
  assert.equal(state.spin.user, 'a');
  assert.equal(state.queue.length, 1);
  assert.equal(g.tick(state, config, ctx(3000)), null);
  let r = g.tick(state, config, ctx(6000));
  state = r.state;
  assert.equal(state.spin, null);
  assert.equal(g.tick(state, config, ctx(7000)), null);
  state = g.tick(state, config, ctx(9000)).state;
  assert.equal(state.spin.id, 2);
  r = g.handle(state, { ...chat('h', '!spin'), isHost: true }, config, ctx(9000));
  assert.equal(r.state.queue.length, 1);
  // Ending mid-spin still records that spin and never shows "spinning" afterwards.
  const ended = g.finish(r.state, config, ctx(9500));
  assert.equal(ended.state.spin, null);
  assert.equal(ended.state.results.length, 2);
  assert.deepEqual(ended.awards, [{ user: 'a', nickname: 'A', points: 2 }]);
  assert.ok('error' in g.start(normalizeConfig(g, { challenges: 'one' }), startCtx()));
});

test('engine, features, overlay config', () => {
  let s = startRound(createGameState(), { kind: 'wheel', title: 'W', durationMs: null, data: { x: 1 } }, 1000);
  assert.equal(s.endsAt, null);
  s = addPoints(endRound(s, 'done', { x: 2 }), [{ user: 'u', nickname: 'U', points: 2 }]);
  assert.deepEqual(s.memory.wheel, { x: 2 });
  assert.equal(topScores(s)[0]?.points, 2);
  assert.equal(clearRound(s).scoreboard.get('u')?.points, 2);
  const limiter = new CommandRateLimiter();
  assert.equal(limiter.allow('x', 2000, 0), true);
  assert.equal(limiter.allow('x', 2000, 1000), false);
  assert.deepEqual(likePoints(15, 30, 20), { points: 2, carry: 5 });
  assert.equal(normalizeFeatures({ fanLikesPerPoint: 0 }).fanLikesPerPoint, 1);
  assert.equal(normalizeFeatures({ fanEnabled: 'yes' }).fanEnabled, false);
  assert.deepEqual(parseOverlayConfig('?layout=portrait&widgets=music,game,evil').widgets, ['game', 'music']);
  assert.equal(parseOverlayConfig('?layout=<x>').mode, 'stack');
});

test('overlay frame config', () => {
  // Legacy links keep working.
  const legacy = parseOverlayConfig('?layout=landscape');
  assert.deepEqual([legacy.mode, legacy.width, legacy.height, legacy.position], ['canvas', 1920, 1080, 'top-right']);
  // Round trip of a custom frame.
  const custom = normalizeOverlayConfig({ ...DEFAULT_OVERLAY_CONFIG, width: 1280, height: 720, position: 'bottom-right', size: 's', safeArea: false, widgets: ['game'] });
  assert.deepEqual(parseOverlayConfig(overlayConfigQuery(custom)), custom);
  // Untrusted values are clamped / rejected.
  const evil = parseOverlayConfig('?w=99999&h=-5&pos=<script>&size=huge&bg=red&safe=yes');
  assert.deepEqual([evil.width, evil.height, evil.position, evil.size, evil.background, evil.safeArea], [3840, 1920, 'top-left', 'xl', 'transparent', false]);
  assert.equal(presetFor(1080, 1080), '1x1');
  assert.equal(presetFor(1000, 1000), 'custom');
  // Portrait + safe area keeps clear of TikTok's UI; the column never exceeds the free width.
  const portrait = { width: 1080, height: 1920, size: 'xl' as const, safeArea: true };
  const pad = stagePadding(portrait);
  assert.ok(pad.bottom > pad.top && pad.right > pad.left);
  assert.ok(stageWidth(portrait) <= 1080 - pad.left - pad.right);
  assert.ok(stageWidth({ ...portrait, size: 's' }) < stageWidth({ ...portrait, size: 'l' }));

  // Full screen fills the padded frame; landscape zooms by height and goes wide.
  assert.equal(parseOverlayConfig('?w=1080&h=1920&size=full').size, 'full');
  assert.equal(stageWidth({ ...portrait, size: 'full' }), 1080 - pad.left - pad.right);
  const tall = fullStage({ width: 1080, height: 1920, safeArea: false });
  assert.equal(tall.wide, false);
  assert.ok(Math.abs(tall.designWidth - 460) < 1e-9);
  assert.ok(Math.abs(tall.designHeight * tall.zoom - tall.height) < 1e-9);
  const landscape = fullStage({ width: 1920, height: 1080, safeArea: false });
  assert.equal(landscape.wide, true);
  assert.ok(Math.abs(landscape.designHeight - FULL_DESIGN_HEIGHT) < 1e-9);
  assert.ok(Math.abs(landscape.designWidth * landscape.zoom - landscape.width) < 1e-9);
});

test('command argument helper', () => {
  assert.equal(commandArgument('!join a', ['join']), 'a');
  assert.equal(commandArgument('!JOIN', ['join']), '');
  assert.equal(commandArgument('!next', ['join']), null);
  assert.equal(commandArgument(' hello ', ['join']), 'hello');
});

test('english helpers and banks', () => {
  assert.equal(normalizeEnglish('  Don’t   STOP! '), 'dont stop');
  assert.ok(isEnglishAttempt('Apple'));
  for (const bad of ['!next', '42', 'quả táo']) assert.ok(!isEnglishAttempt(bad), bad);
  for (const w of BUILTIN_ENGLISH_WORDS.filter((w) => w.length >= 3)) assert.ok(looksLikeEnglishWord(w, 3), w);
  // Every line of every built-in bank must parse (none silently skipped).
  const lines = (bank: string) => bank.split('\n').length;
  assert.ok(lines(VOCAB_BANK) >= 250 && lines(EMOJI_BANK) >= 140 && lines(SENTENCE_BANK) >= 140 && lines(ENGLISH_QUIZ_BANK) >= 190 && lines(DEFAULT_QUESTIONS) >= 290 && lines(CATEGORY_BANK) >= 40);
  assert.equal(parseHangmanBank(VOCAB_BANK).length, lines(VOCAB_BANK));
  assert.equal(parseBank(VOCAB_BANK, vocabItem).length, lines(VOCAB_BANK));
  assert.equal(parseBank(EMOJI_BANK, emojiItem).length, lines(EMOJI_BANK));
  assert.equal(parseBank(SENTENCE_BANK, sentenceItem).length, lines(SENTENCE_BANK));
  assert.equal(parseCategories(CATEGORY_BANK).length, lines(CATEGORY_BANK));
  // A default bank longer than its field would be cut silently by normalizeConfig.
  for (const g of GAMES) {
    for (const field of g.settings.filter((f: any) => f.type === 'textarea')) {
      const text = String(g.defaultConfig[field.key]);
      assert.ok(text.length <= (field.maxLength ?? 200), `${g.id}.${field.key}: ${text.length} > ${field.maxLength}`);
      assert.equal(normalizeConfig(g, {})[field.key], text);
    }
  }
  assert.equal(parseQuestions(ENGLISH_QUIZ_BANK).length, lines(ENGLISH_QUIZ_BANK));
  assert.equal(parseQuestions(DEFAULT_QUESTIONS).length, lines(DEFAULT_QUESTIONS));
  for (const bank of [VOCAB_BANK, EMOJI_BANK, SENTENCE_BANK, ENGLISH_QUIZ_BANK, DEFAULT_QUESTIONS]) {
    const keys = bank.split('\n').map((line) => line.toLowerCase());
    assert.equal(new Set(keys).size, keys.length, 'duplicate bank line');
  }
  const scrambled = scrambleWord('apple', random).replace(/ /g, '');
  assert.notEqual(scrambled, 'APPLE');
  assert.equal([...scrambled].sort().join(''), 'AELPP');
  assert.deepEqual(shuffleSentence('I go to school.', random).split(' / ').sort(), ['I', 'go', 'school', 'to']);
});

test('english answer games', () => {
  const un = play('unscramble', { bank: 'bicycle/bike | xe đạp', scoring: 'first', seconds: 10 }, [chat('a', '!song x'), chat('a', 'bicycel'), chat('b', 'BIKE')]);
  assert.equal(un.results[0], null);
  assert.equal(un.results[1], null, 'wrong answers are free');
  assert.equal(un.results[2].endsAt, 2000, '"first" closes the puzzle now');
  const tr = play('translate', { bank: 'airplane/plane | máy bay', seconds: 10 }, [chat('a', 'plane'), chat('b', 'Airplane'), chat('a', 'airplane'), chat('c', 'car')]);
  assert.equal(tr.results[0].endsAt, undefined, '"all" keeps the puzzle open');
  assert.equal(tr.results[2], null, 'one correct answer per viewer');
  assert.deepEqual(tr.finish().awards.map((a: any) => [a.user, a.points]), [['a', 95], ['b', 95]]);
  assert.equal(play('sentenceBuilder', { bank: "We had dinner at seven o'clock | x", scoring: 'first' }, [chat('a', 'we HAD dinner at seven o’clock.')]).results[0].consumed, true);
  assert.equal(play('emojiGuess', { bank: '⭐🎬 | movie star/film star | x' }, [chat('a', 'Film Star')]).results[0].consumed, true);
  assert.equal(play('unscramble', { bank: 'apple | táo' }, [chat('a', '!ans apple')]).results[0].consumed, true);
  // Series: the reveal shows the fastest, then the next puzzle gets a fresh presentation.
  const two = play('unscramble', { bank: 'apple | táo\nmango | xoài', count: 2, seconds: 10 }, [chat('a', 'x')]);
  const answer = two.g.handle(two.state, chat('z', two.state.items[0].display), two.c, ctx(1200));
  answer.commit();
  let r = step(two.g, answer.state, two.c, 11_000);
  assert.deepEqual(r.awards, [{ user: 'z', nickname: 'Z', points: 99 }]);
  assert.equal(two.g.view(r.state, two.c).rows[0].value, '+99 · 0.2s');
  r = step(two.g, r.state, two.c, 15_000);
  assert.equal(r.state.index, 1);
  assert.equal([...r.state.shown.replace(/ /g, '')].sort().join(''), [...r.state.items[1].display.toUpperCase()].sort().join(''));
  assert.equal(r.state.book.total, 0, 'fresh answer book');
});

test('hangman', () => {
  // 1 s into a 20 s word: solver gets 98 of 100; each revealed letter is worth 10.
  const h = play('hangman', { bank: 'apple | quả táo', count: 1, maxWrong: 3, maxPoints: 100, seconds: 20 }, [chat('a', 'P'), chat('b', 'p'), chat('b', 'z'), chat('c', 'mango'), chat('c', 'hello there'), chat('d', 'APPLE')]);
  assert.equal(maskWord('apple', ['p']), '_ P P _ _');
  assert.equal(h.results[1].state, h.results[0].state);
  assert.equal(h.results[3].state.wrong.length, 1);
  assert.equal(h.results[4], null);
  assert.equal(h.results[5].endsAt, 2000, 'solved: close the word now');
  assert.deepEqual(h.finish().awards.map((a: any) => [a.user, a.points]), [['a', 20], ['d', 98]]);
  const lose = play('hangman', { bank: 'apple | táo', maxWrong: 3 }, [chat('t', 'x'), chat('t', 'y'), chat('t', 'q')]);
  assert.equal(lose.results[2].endsAt, 2000, 'out of lives: close the word now');
  assert.equal(lose.g.handle(lose.state, chat('u', 'p'), lose.c, ctx(2100)), null, 'no guesses after the word closed');
  assert.equal(play('hangman', { bank: 'apple | táo' }, [chat('a', '!guess p')]).results[0].state.guessed[0], 'p');
  // Series: reveal, then a fresh word.
  const series = play('hangman', { bank: 'apple | táo\nmango | xoài', count: 2, seconds: 20 }, [chat('a', 'a')]);
  let r = step(series.g, series.state, series.c, 21_000);
  assert.equal(r.state.stage, 'reveal');
  assert.equal(r.awards[0].points, 10);
  r = step(series.g, r.state, series.c, 25_000);
  assert.deepEqual([r.state.index, r.state.guessed, r.state.wrong, r.state.solver], [1, [], [], null]);
});

test('name it', () => {
  const n = play('nameIt', { bank: 'Farm | cow | chicken/hen | sheep' }, [chat('a', 'COWS'), chat('b', 'hen'), chat('c', 'cow'), chat('c', 'tiger'), chat('a', '!ans sheep')]);
  assert.equal(n.results[4].finish, true);
  assert.deepEqual(n.finish().awards.map((a: any) => [a.user, a.points]), [['a', 2], ['b', 1]]);
  assert.equal(play('nameIt', { bank: 'Farm | cow | pig' }, [chat('a', '!next')]).results[0], null);
});

test('english word chain', () => {
  const g = game('englishWordChain');
  const config = normalizeConfig(g, {});
  let state: any = { current: 'apple', chain: [{ word: 'apple', nickname: 'Start' }], used: ['apple'], words: {} };
  let r = g.handle(state, chat('a', 'Egg'), config, ctx(1000));
  assert.equal(r.endsAt, 31000);
  state = g.handle(r.state, chat('b', 'goat'), config, ctx()).state;
  assert.match(g.handle(state, chat('c', 'tttt'), config, ctx()).message, /không hợp lệ/);
  assert.equal(g.handle(state, chat('c', 'two words'), config, ctx()), null);
  const strict = normalizeConfig(g, { mode: 'dictionary' });
  assert.match(g.handle(state, chat('c', 'tzatziki'), strict, ctx()).message, /không hợp lệ/);
  r = g.handle(state, chat('c', 'tiger'), strict, ctx());
  assert.equal(r.state.current, 'tiger');
});

test('chat command variants', () => {
  const boss = play('boss', { hp: 100, chatDamage: 5 }, [chat('a', '!hit'), chat('a', 'hit'), chat('b', '!HIT')]);
  assert.equal(boss.state.hp, 90);
  assert.equal(boss.results[1], null);
  assert.equal(play('boss', { chatDamage: 0 }, [chat('a', '!hit')]).results[0], null);
});

test('every game offers working test actions', () => {
  const toInput = (a: any, user: string) => (a.input.kind === 'chat' ? chat(user, a.input.text) : a.input.kind === 'like' ? like(user, a.input.count) : gift(user, a.input.count, a.input.giftName));
  for (const g of GAMES) {
    const config = normalizeConfig(g, {});
    const started: any = g.start(config, startCtx());
    const actions = g.testActions?.(started.state, config, ctx()) ?? [];
    assert.ok(actions.length >= 1, `${g.id} has no test actions`);
    actions.forEach((action, i) => {
      const r = g.handle(started.state, toInput(action, `tester${i}`), config, ctx());
      // Wrong answers are deliberately ignored (so they don't use up the cooldown).
      const intentionalNoop = /sai|tiếng Việt|\(mod\)/i.test(action.label)
        || (g.id === 'teamBattle' && action.input.kind !== 'chat');
      if (!intentionalNoop) assert.ok(r, `${g.id}: "${action.label}" not recognized`);
    });
  }
});

test('global chat commands', async () => {
  const { parseGlobalCommand, parseModerators, resolveGame, HOST_ONLY } = await import('../src/game/chatCommands');
  assert.deepEqual(parseGlobalCommand('!help', GAMES), { kind: 'help' });
  assert.deepEqual(parseGlobalCommand('!DIEM', GAMES), { kind: 'rank' });
  assert.equal(parseGlobalCommand('help', GAMES), null);
  assert.equal(parseGlobalCommand('!join', GAMES), null); // game-level, not global
  const start = parseGlobalCommand('!start quiz', GAMES) as any;
  assert.equal(start.game.id, 'quiz');
  assert.equal((parseGlobalCommand('!start Đoán Số', GAMES) as any).game.id, 'guessNumber');
  assert.equal((parseGlobalCommand('!start nope', GAMES) as any).unknown, 'nope');
  assert.equal((parseGlobalCommand('!start', GAMES) as any).game, null);
  assert.equal(resolveGame('hangman', GAMES)?.id, 'hangman');
  assert.equal(resolveGame('equiz', GAMES)?.id, 'englishQuiz');
  for (const g of GAMES) assert.equal(resolveGame(g.id, GAMES)?.id, g.id);
  assert.ok(HOST_ONLY.has('start') && HOST_ONLY.has('stop') && !HOST_ONLY.has('rank'));
  assert.deepEqual([...parseModerators('@Mod_1, mod.two  bad name!, ')], ['mod_1', 'mod.two', 'bad']);
});

test('non-answers are ignored, not consumed', () => {
  // A wrong guess must not start the viewer's cooldown before their real answer.
  assert.equal(play('unscramble', { bank: 'apple | táo' }, [chat('a', 'hay qua')]).results[0], null);
  assert.equal(play('nameIt', { bank: 'Farm | cow | pig' }, [chat('a', 'hello')]).results[0], null);
  const chain = game('englishWordChain');
  const st: any = { current: 'goat', chain: [], used: ['tiger', 'goat'], words: {} };
  assert.equal(chain.handle(st, chat('a', 'hello'), normalizeConfig(chain, {}), ctx()), null);
  const used = chain.handle(st, chat('a', 'tiger'), normalizeConfig(chain, {}), ctx());
  assert.equal(used.consumed, false);
  assert.match(used.message, /đã dùng/);
});

test('effects queue and game effects', async () => {
  const { pushEffects } = await import('../src/game/engine');
  let s = createGameState();
  s = pushEffects(s, [{ kind: 'start', text: 'x' }]);
  for (let i = 0; i < 10; i += 1) s = pushEffects(s, [{ kind: 'hit', text: `-${i}` }]);
  assert.equal(s.effectSeq, 11);
  assert.equal(s.effects.length, 8); // capped
  assert.deepEqual(s.effects.map((e) => e.id), [4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(pushEffects(s, []), s);
  // Games describe their own moments.
  const boss = play('boss', { hp: 100 }, [like('a', 30)]);
  assert.deepEqual(boss.results[0].effects, [{ kind: 'hit', text: '-30', user: 'A' }]);
  assert.equal(boss.finish().effects?.[0]?.kind, 'lose');
  const un = play('unscramble', { bank: 'apple | táo' }, [chat('a', 'apple')]);
  assert.equal(un.results[0].effects?.[0]?.kind, 'correct');
  for (const g of GAMES) assert.ok(g.accent, `${g.id} has no accent`);
});

test('growing races: balloon / plant / rocket / tower share the race rules with their own picture', () => {
  const kinds: Record<string, [string, RegExp]> = { thoiBong: ['balloon', /lần thổi/], trongCay: ['plant', /lần tưới/], tenLua: ['rocket', /tầng/], xayThap: ['tower', /tầng/] };
  for (const [id, [kind, unit]] of Object.entries(kinds)) {
    const g = game(id);
    assert.ok(!g.settings.some((field: any) => field.key === 'icon'), `${id}: no duck picker`);
    const c = normalizeConfig(g, { questions: 'Q | x | y | A', goal: 2 } as any);
    let state = g.start(c, startCtx()).state;
    assert.equal(g.view(state, c).grow.kind, kind);
    assert.deepEqual(g.view(state, c).grow.items, []);
    assert.equal(g.view(state, c).race, null, `${id}: no duck lanes`);
    for (let round = 0; round < 2; round += 1) {
      for (const user of ['b', 'a']) {
        const r = g.handle(state, chat(user, 'a'), c, ctx(2000));
        r.commit();
        state = r.state;
      }
      const closed = step(g, state, c, 20_000 + round * 10_000);
      state = closed.state;
      if (round === 0) {
        assert.deepEqual(g.view(state, c).grow.items.map((item: any) => [item.label, item.steps, item.value]), [['B', 1, '1/2'], ['A', 1, '1/2']]);
        state = step(g, state, c, 23_000).state;
      } else {
        assert.equal(closed.finish, true);
      }
    }
    const done = g.finish(state, c, ctx());
    assert.equal(done.state.winner.user, 'b', `${id}: first correct answer wins`);
    assert.match(done.effects[0].podium[0].value, unit);
    assert.equal(done.effects[0].podium.length, 1, `${id}: winner spotlight`);
  }
});
