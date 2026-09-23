/* eslint-disable @typescript-eslint/no-explicit-any */
// Unit tests for the pure game modules. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENGLISH_QUIZ_BANK, CATEGORY_BANK, VOCAB_BANK } from '../src/game/content/english';
import { addPoints, clearRound, CommandRateLimiter, createGameState, endRound, startRound, topScores } from '../src/game/engine';
import { BUILTIN_ENGLISH_WORDS, buildEnglishDictionary, isEnglishAttempt, looksLikeEnglishWord, normalizeEnglish } from '../src/game/english';
import { likePoints, normalizeFeatures } from '../src/game/features';
import { scrambleWord, shuffleSentence } from '../src/game/games/answerGames';
import { maskWord, parseHangmanBank } from '../src/game/games/hangman';
import { parseCategories } from '../src/game/games/nameIt';
import { DEFAULT_QUESTIONS, parseQuestions } from '../src/game/games/quiz';
import { GAMES, getGame, normalizeConfig } from '../src/game/registry';
import { commandArgument } from '../src/game/types';
import { BUILTIN_WORDS, buildDictionary, isVietnameseSyllable, parseDictionary, twoSyllables } from '../src/game/words';
import { DEFAULT_OVERLAY_CONFIG, normalizeOverlayConfig, overlayConfigQuery, parseOverlayConfig, presetFor, stagePadding, stageWidth } from '../src/shared/overlay';

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
    if (r) state = r.state;
  }
  return { g, c, state, results, finish: () => g.finish(state, c, ctx()) };
}

test('vietnamese words', () => {
  assert.equal(new Set(BUILTIN_WORDS).size, BUILTIN_WORDS.length, 'duplicate builtin words');
  for (const word of BUILTIN_WORDS) assert.ok(twoSyllables(word), `invalid builtin word: ${word}`);
  for (const ok of ['người', 'nghiêng', 'khuya', 'chuyện', 'quá', 'gì', 'đường', 'khuỷu', 'oai', 'ưu']) assert.ok(isVietnameseSyllable(ok), ok);
  for (const bad of ['hello', 'ok', 'xyz', 'bbb', 'chàò', 'ab1', '']) assert.ok(!isVietnameseSyllable(bad), bad);
  assert.deepEqual(parseDictionary('Nhạc sĩ\nhello world\nba\ncon  mèo\n'), ['nhạc sĩ', 'con mèo']);
});

test('registry and config normalization', () => {
  assert.equal(GAMES.length, 17);
  assert.equal(new Set(GAMES.map((g) => g.id)).size, 17);
  const quiz = game('quiz');
  assert.equal(normalizeConfig(quiz, { seconds: 9999 }).seconds, 120);
  assert.equal(normalizeConfig(quiz, { seconds: 'abc' }).seconds, 20);
  assert.equal(normalizeConfig(game('race'), { icon: '<img>' }).icon, '🦆');
  for (const g of GAMES) {
    for (const f of g.settings) assert.ok(f.key in g.defaultConfig, `${g.id}.${f.key} missing default`);
    assert.ok(g.commands.length >= 1, `${g.id} lacks commands`);
  }
});

test('vote', () => {
  const { state, results, finish } = play('vote', {}, [chat('u1', '1'), chat('u2', '2'), chat('u1', '2'), chat('u3', '9'), chat('u4', 'hi')]);
  assert.equal(results[3].consumed, true);
  assert.equal(results[4], null);
  assert.equal(Object.keys(state.ballots).length, 2);
  const f = finish();
  assert.equal(f.state.winner, 1);
  assert.ok(f.playTrackId);
  assert.deepEqual(f.awards.map((a: any) => a.points), [3, 3]);
  assert.ok('error' in game('vote').start({ seconds: 30 }, { ...startCtx(), playlist: tracks.slice(0, 1) }));
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
  assert.equal(parseQuestions(DEFAULT_QUESTIONS).length, 20);
  assert.equal(parseQuestions('Q? | x | y | Z\nbad\nQ3 | a | | B').length, 0);
  const { state, results, finish, g, c } = play('quiz', { questions: 'Q1? | a | b | c | d | C' }, [chat('u1', 'c'), chat('u2', 'A'), chat('u1', 'a'), chat('u3', 'C'), chat('u4', 'hello')]);
  assert.equal(results[2].state, results[1].state);
  assert.equal(results[4], null);
  assert.equal(g.view(state, c).rows[0].value, undefined);
  assert.deepEqual(finish().awards.map((a: any) => [a.user, a.points]), [['u1', 3], ['u3', 2]]);
  const two = normalizeConfig(g, { questions: 'Q1? | a | b | A\nQ2? | a | b | B' });
  const first = g.start(two, startCtx());
  const second = g.start(two, startCtx(first.state));
  assert.notEqual(second.state.questionIndex, first.state.questionIndex);
  assert.equal(g.start(two, startCtx(second.state)).state.asked.length, 1);
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

test('race', () => {
  const { state, results, finish } = play('race', { finishLine: 100, giftBoost: 15 }, [like('a', 50), gift('b', 2), like('c', 10), gift('b', 100)]);
  assert.equal(results[3].finish, true);
  assert.equal(state.winner.user, 'b');
  assert.deepEqual(finish().awards.map((a: any) => [a.user, a.points]), [['b', 5], ['a', 3], ['c', 2]]);
  const cmd = play('race', { chatStep: 4 }, [chat('a', '!join'), chat('a', '!join'), chat('b', '!run'), chat('b', 'run')]);
  assert.equal(cmd.state.racers.a.distance, 0);
  assert.equal(cmd.state.racers.b.distance, 4);
  assert.equal(cmd.results[3], null);
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
  assert.equal(clearRound(s).scores.u?.points, 2);
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
  assert.equal(parseHangmanBank(VOCAB_BANK).length, 40);
  assert.equal(parseCategories(CATEGORY_BANK).length, 9);
  assert.equal(parseQuestions(ENGLISH_QUIZ_BANK).length, 20);
  const scrambled = scrambleWord('apple', random).replace(/ /g, '');
  assert.notEqual(scrambled, 'APPLE');
  assert.equal([...scrambled].sort().join(''), 'AELPP');
  assert.deepEqual(shuffleSentence('I go to school.', random).split(' / ').sort(), ['I', 'go', 'school', 'to']);
});

test('english answer games', () => {
  const un = play('unscramble', { bank: 'bicycle/bike | xe đạp' }, [chat('a', '!song x'), chat('a', 'bicycel'), chat('b', 'BIKE')]);
  assert.equal(un.results[0], null);
  assert.equal(un.results[2].finish, true);
  const tr = play('translate', { bank: 'airplane/plane | máy bay' }, [chat('a', 'plane'), chat('b', 'Airplane'), chat('a', 'airplane'), chat('c', 'car')]);
  assert.deepEqual(tr.finish().awards.map((a: any) => [a.user, a.points]), [['a', 3], ['b', 2]]);
  assert.equal(play('sentenceBuilder', { bank: "We had dinner at seven o'clock | x", scoring: 'first' }, [chat('a', 'we HAD dinner at seven o’clock.')]).results[0].finish, true);
  assert.equal(play('emojiGuess', { bank: '⭐🎬 | movie star/film star | x' }, [chat('a', 'Film Star')]).results[0].finish, true);
  assert.equal(play('unscramble', { bank: 'apple | táo' }, [chat('a', '!ans apple')]).results[0].finish, true);
});

test('hangman', () => {
  const h = play('hangman', { bank: 'apple | quả táo', maxWrong: 3, points: 3 }, [chat('a', 'P'), chat('b', 'p'), chat('b', 'z'), chat('c', 'mango'), chat('c', 'hello there'), chat('d', 'APPLE')]);
  assert.equal(maskWord('apple', ['p']), '_ P P _ _');
  assert.equal(h.results[1].state, h.results[0].state);
  assert.equal(h.results[3].state.wrong.length, 1);
  assert.equal(h.results[4], null);
  assert.equal(h.results[5].finish, true);
  assert.deepEqual(h.finish().awards.map((a: any) => [a.user, a.points]), [['a', 2], ['d', 3]]);
  const lose = play('hangman', { bank: 'apple | táo', maxWrong: 3 }, [chat('t', 'x'), chat('t', 'y'), chat('t', 'q')]);
  assert.equal(lose.results[2].finish, true);
  assert.equal(play('hangman', { bank: 'apple | táo' }, [chat('a', '!guess p')]).results[0].state.guessed[0], 'p');
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
  assert.equal(play('vote', {}, [chat('a', '!vote 2'), chat('b', '!vote')]).state.ballots.a.choice, 1);
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
