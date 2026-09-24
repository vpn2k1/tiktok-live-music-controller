/* eslint-disable @typescript-eslint/no-explicit-any */
// Japanese and Chinese practice games. Run with `npm test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHINESE_QUIZ_BANK, CHINESE_WORDS_BANK, HANZI_PAIRS } from '../src/game/content/chinese';
import { HIRAGANA_BANK, JAPANESE_QUIZ_BANK, JAPANESE_VOCAB_BANK, KANA_PAIRS, KANA_WORDS_BANK, KATAKANA_BANK } from '../src/game/content/japanese';
import { buildEnglishDictionary } from '../src/game/english';
import { parseBank } from '../src/game/games/answerGames';
import {
  chineseVocabGame,
  chineseVocabItem,
  hanziMemoryGame,
  japaneseVocabGame,
  japaneseVocabItem,
  kanaItem,
  kanaReadingGame,
  pinyinItem,
  pinyinReadingGame
} from '../src/game/games/languageGames';
import { parsePairs } from '../src/game/games/memory';
import { parseQuestions } from '../src/game/games/quiz';
import { GAMES, normalizeConfig } from '../src/game/registry';
import { foldChinese, foldJapanese } from '../src/game/text';
import { buildDictionary } from '../src/game/words';

const ctx = (now: number) => ({ now, random: () => 0.5, dictionary: buildDictionary([]), englishDictionary: buildEnglishDictionary([]) });
const startCtx = () => ({ ...ctx(0), playlist: [], currentTrackId: null, previous: null });
const chat = (user: string, text: string): any => ({ kind: 'chat', user, nickname: user.toUpperCase(), text });

/** Starts a one-question round on `line` and returns which comments count as correct. */
function accepted(game: any, line: string, comments: string[]): boolean[] {
  const config = normalizeConfig(game, { bank: line, count: 1, seconds: 10 });
  const state = game.start(config, startCtx()).state;
  return comments.map((text, i) => game.handle(state, chat(`u${i}`, text), config, ctx(1000))?.consumed === true);
}

test('answer folding for Japanese and Chinese', () => {
  assert.equal(foldJapanese('ネコ'), foldJapanese('ねこ'));
  assert.equal(foldJapanese('kōhī'), 'kohi');
  assert.equal(foldJapanese('ｎｅｋｏ'), 'neko');
  assert.equal(foldChinese('nǐ hǎo'), 'nihao');
  assert.equal(foldChinese('ni3 hao3'), 'nihao');
  assert.equal(foldChinese('nv3'), foldChinese('nǚ'));
  assert.equal(foldChinese('你好！'), '你好');
});

test('Đọc Kana: romaji (any common spelling), or the kana itself', () => {
  assert.deepEqual(accepted(kanaReadingGame, 'し | shi/si', ['shi', 'SI', 'し', 'シ', 'chi', 'hello']), [true, true, true, true, false, false]);
  assert.deepEqual(accepted(kanaReadingGame, 'ねこ | neko | con mèo', ['neko', 'ネコ', 'ne ko', 'inu']), [true, true, true, false]);
  // Presets: the textarea is empty by default and the chosen table is used.
  const config = normalizeConfig(kanaReadingGame, { preset: 'katakana', count: 3 });
  assert.equal(config.bank, '');
  const state: any = kanaReadingGame.start(config as any, startCtx() as any);
  assert.ok(state.state.items.every((item: any) => /^[゠-ヿ]+$/.test(item.prompt)), 'katakana only');
});

test('Từ vựng tiếng Nhật: kanji, kana or romaji', () => {
  assert.deepEqual(accepted(japaneseVocabGame, '猫 | ねこ/neko | con mèo', ['猫', 'ねこ', 'neko', 'Neko', 'いぬ']), [true, true, true, true, false]);
  assert.equal(japaneseVocabItem(['猫', 'ねこ/neko', 'con mèo'])?.prompt, 'con mèo');
});

test('Đọc Pinyin and Từ vựng tiếng Trung', () => {
  assert.deepEqual(accepted(pinyinReadingGame, '你好 | nǐ hǎo | xin chào', ['nǐ hǎo', 'ni3hao3', 'nihao', 'ni hao', '你好', 'xiexie']), [true, true, true, true, false, false]);
  assert.deepEqual(accepted(chineseVocabGame, '猫 | māo | con mèo', ['猫', 'mao', 'māo', '狗']), [true, true, true, false]);
  assert.equal(chineseVocabItem(['猫', 'māo', 'con mèo'])?.display, '猫 (māo)');
});

test('Ghép cặp: two different faces make a pair', () => {
  const config = normalizeConfig(hanziMemoryGame, { bank: '猫 | mèo\n水 | nước\n火 | lửa', pairs: 3, points: 50 });
  const g: any = hanziMemoryGame;
  const state = g.start(config, startCtx()).state;
  assert.equal(state.faces.length, 6);
  const cat = state.faces.indexOf('猫');
  const meo = state.faces.indexOf('mèo');
  const water = state.faces.indexOf('nước');
  assert.equal(g.handle(state, chat('a', `${cat + 1} ${water + 1}`), config, ctx(0)).state.peek != null, true, 'wrong pair peeks');
  const hit = g.handle(state, chat('b', `${cat + 1} ${meo + 1}`), config, ctx(0));
  assert.deepEqual(hit.awards, [{ user: 'b', nickname: 'B', points: 50 }]);
});

test('built-in Japanese/Chinese content: every line is usable', () => {
  const all = (bank: string, count: number) => assert.equal(count, bank.split('\n').length);
  for (const bank of [HIRAGANA_BANK, KATAKANA_BANK, KANA_WORDS_BANK]) all(bank, parseBank(bank, kanaItem).length);
  all(JAPANESE_VOCAB_BANK, parseBank(JAPANESE_VOCAB_BANK, japaneseVocabItem).length);
  all(CHINESE_WORDS_BANK, parseBank(CHINESE_WORDS_BANK, pinyinItem).length);
  all(CHINESE_WORDS_BANK, parseBank(CHINESE_WORDS_BANK, chineseVocabItem).length);
  all(JAPANESE_QUIZ_BANK, parseQuestions(JAPANESE_QUIZ_BANK).length);
  all(CHINESE_QUIZ_BANK, parseQuestions(CHINESE_QUIZ_BANK).length);
  all(KANA_PAIRS, parsePairs(KANA_PAIRS).length);
  all(HANZI_PAIRS, parsePairs(HANZI_PAIRS).length);
  assert.equal(HIRAGANA_BANK.split('\n').length, 46);
  assert.equal(KATAKANA_BANK.split('\n').length, 46);
  assert.ok(JAPANESE_VOCAB_BANK.split('\n').length >= 60 && CHINESE_WORDS_BANK.split('\n').length >= 60);
  assert.ok(JAPANESE_QUIZ_BANK.split('\n').length >= 40 && CHINESE_QUIZ_BANK.split('\n').length >= 40);
  // Katakana table = hiragana table shifted, with the same romaji.
  const romaji = (bank: string) => bank.split('\n').map((line) => line.split('|')[1]?.trim());
  assert.deepEqual(romaji(KATAKANA_BANK), romaji(HIRAGANA_BANK));
  // Each language has its own library group.
  assert.equal(GAMES.filter((g) => g.category === 'japanese').length, 4);
  assert.equal(GAMES.filter((g) => g.category === 'chinese').length, 4);
});
