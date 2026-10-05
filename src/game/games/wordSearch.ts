import type { OverlayGrid } from '../../shared/types';
import type { PointAward } from '../engine';
import { normalizeEnglish } from '../english';
import { Scoreboard } from '../scoreboard';
import { commitTotals, pickSet, podiumEffect } from '../series';
import { chatTest, commandArgument, shuffle, view, type GameDefinition } from '../types';
import { checkVocabBank, EN_VOCAB_PRESETS, vocabBank, vocabSettings } from '../vocab';
import { t } from '../../shared/i18n';

/**
 * Tìm từ (word search): English words hide in a letter board, the clues are
 * their Vietnamese meanings. Viewers comment a word they found; the first
 * finder scores and the word lights up. Halfway through, the first letter of
 * every word still hidden glows.
 */
export interface HiddenWord {
  word: string;
  meaning: string;
  /** Board indices of its letters, in order. */
  cells: number[];
  finder: string | null;
}

export interface WordSearchRound {
  size: number;
  letters: string[];
  words: HiddenWord[];
  startedAt: number;
  durationMs: number;
  hinted: boolean;
  /** Round over: words nobody found are shown. */
  ended: boolean;
  totals: Scoreboard;
  asked: number[];
}

type WordSearchConfig = { preset: string; bank: string; level: string; seconds: number; points: number };

const LEVELS: Record<string, { size: number; words: number; directions: [number, number][] }> = {
  easy: { size: 8, words: 6, directions: [[0, 1], [1, 0]] },
  hard: { size: 10, words: 9, directions: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]] }
};
const PLACE_TRIES = 120;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/** Places words on a size×size board; returns the board and the words that fit. */
export function buildBoard(
  candidates: { word: string; meaning: string }[],
  size: number,
  wanted: number,
  directions: [number, number][],
  random: () => number
): { letters: string[]; words: HiddenWord[] } {
  const letters: string[] = Array.from({ length: size * size }, () => '');
  const words: HiddenWord[] = [];
  for (const candidate of candidates) {
    if (words.length >= wanted) break;
    const word = candidate.word;
    if (word.length > size || words.some((placed) => placed.word === word)) continue;
    for (let attempt = 0; attempt < PLACE_TRIES; attempt += 1) {
      const [dr, dc] = directions[Math.floor(random() * directions.length)] as [number, number];
      const row = Math.floor(random() * size);
      const col = Math.floor(random() * size);
      const endRow = row + dr * (word.length - 1);
      const endCol = col + dc * (word.length - 1);
      if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue;
      const cells = Array.from({ length: word.length }, (_, i) => (row + dr * i) * size + col + dc * i);
      if (!cells.every((cell, i) => letters[cell] === '' || letters[cell] === word[i])) continue;
      cells.forEach((cell, i) => { letters[cell] = word[i] as string; });
      words.push({ word, meaning: candidate.meaning, cells, finder: null });
      break;
    }
  }
  for (let i = 0; i < letters.length; i += 1) if (!letters[i]) letters[i] = ALPHABET[Math.floor(random() * ALPHABET.length)] as string;
  return { letters, words };
}

function remainingMs(state: WordSearchRound, now: number): number {
  return state.startedAt + state.durationMs - now;
}

function grid(state: WordSearchRound): OverlayGrid {
  const done = state.ended;
  const found = new Set<number>();
  const firsts = new Set<number>();
  for (const word of state.words) {
    if (word.finder) word.cells.forEach((cell) => found.add(cell));
    else if (done) word.cells.forEach((cell) => firsts.add(cell));
    else if (state.hinted) firsts.add(word.cells[0] as number);
  }
  return {
    kind: 'letters',
    columns: state.size,
    cells: state.letters.map((letter, index) => ({ text: letter, state: found.has(index) ? 'found' : firsts.has(index) ? 'active' : 'idle' }))
  };
}

export const wordSearchGame: GameDefinition<WordSearchRound, WordSearchConfig> = {
  id: 'timTu',
  title: 'Tìm từ 🔍',
  category: 'english',
  accent: '#0891b2',
  aliases: ['timtu', 'wordsearch'],
  howTo: 'Bảng chữ giấu các từ tiếng Anh theo hàng ngang, dọc (mức Khó: cả chéo và viết ngược); gợi ý là nghĩa tiếng Việt. Thấy từ nào thì comment từ đó: ai tìm ra trước được điểm. Qua nửa thời gian, chữ đầu của các từ còn lại sáng lên.',
  commands: [{ usage: 'cat', description: 'Gõ từ tiếng Anh bạn tìm thấy trong bảng' }],
  defaultConfig: { preset: 'en-kids', bank: '', level: 'easy', seconds: 240, points: 50 },
  settings: [
    ...vocabSettings(EN_VOCAB_PRESETS),
    {
      key: 'level',
      label: 'Mức độ',
      type: 'select',
      options: [
        { value: 'easy', label: 'Dễ: bảng 8×8, 6 từ ngang/dọc' },
        { value: 'hard', label: 'Khó: bảng 10×10, 9 từ theo 8 hướng' }
      ]
    },
    { key: 'seconds', label: 'Thời gian (giây)', type: 'number', min: 30, max: 1800 },
    { key: 'points', label: 'Điểm mỗi từ tìm ra', type: 'number', min: 1, max: 10_000 }
  ],

  checkBank(key, text) {
    return key === 'bank' ? checkVocabBank(text) : null;
  },

  start(config, ctx) {
    const level = LEVELS[config.level] ?? (LEVELS.easy as (typeof LEVELS)[string]);
    const { words } = vocabBank(config, EN_VOCAB_PRESETS);
    const usable = words
      .map((word) => ({ word: normalizeEnglish(word.term), meaning: word.meaning }))
      .filter((word) => /^[a-z]{3,}$/.test(word.word) && word.word.length <= level.size);
    if (usable.length < 3) return { error: t('Cần ít nhất 3 từ tiếng Anh một chữ (3–{max} chữ cái).', { max: level.size }) };
    // Recent rounds' words go last, so a new board brings new words.
    const { indices, asked } = pickSet(usable.length, Math.min(usable.length, level.words * 3), ctx.previous?.asked ?? [], ctx.random);
    const candidates = shuffle(indices.map((index) => usable[index] as { word: string; meaning: string }), ctx.random);
    const board = buildBoard(candidates, level.size, level.words, level.directions, ctx.random);
    const durationMs = config.seconds * 1000;
    return {
      state: { size: level.size, letters: board.letters, words: board.words, startedAt: ctx.now, durationMs, hinted: false, ended: false, totals: new Scoreboard(), asked },
      durationMs
    };
  },

  handle(state, input, config) {
    if (input.kind !== 'chat') return null;
    const raw = commandArgument(input.text, ['tim', 'find']);
    if (raw === null || /[^\x20-\x7E]/.test(raw)) return null;
    const guess = normalizeEnglish(raw).replace(/ /g, '');
    const index = state.words.findIndex((word) => !word.finder && word.word === guess);
    if (index < 0) return null;
    const words = state.words.map((word, i) => (i === index ? { ...word, finder: input.nickname } : word));
    const awards: PointAward[] = [{ user: input.user, nickname: input.nickname, points: config.points }];
    const all = words.every((word) => word.finder);
    return {
      consumed: true,
      state: { ...state, words },
      awards,
      commit: commitTotals(state, awards),
      finish: all,
      effects: [{ kind: 'correct', text: `🔍 ${input.nickname}: ${guess.toUpperCase()}`, user: input.nickname }]
    };
  },

  tick(state, _config, ctx) {
    if (state.hinted || remainingMs(state, ctx.now) > state.durationMs / 2) return null;
    return { consumed: false, state: { ...state, hinted: true }, message: t('💡 Gợi ý: chữ đầu của các từ còn lại đã sáng lên') };
  },

  finish(state) {
    const missing = state.words.filter((word) => !word.finder).map((word) => word.word);
    const top = state.totals.top(3);
    return {
      state: { ...state, ended: true },
      awards: [],
      message: missing.length
        ? t('🔍 Còn {n} từ chưa ai tìm ra: {words}', { n: missing.length, words: missing.join(', ') })
        : t('🔍 Cả phòng đã tìm ra hết {n} từ!', { n: state.words.length }),
      effects: [top.length ? podiumEffect(top, t('🔍 Thợ săn chữ!')) : { kind: 'lose', text: t('Hết giờ') }]
    };
  },

  testActions(state) {
    const hidden = state.words.find((word) => !word.finder);
    if (!hidden) return [];
    return [
      chatTest(t('Tìm sai'), 'zzz', 3),
      chatTest(t('Tìm đúng: {word}', { word: hidden.word }), hidden.word, 1)
    ];
  },

  view(state) {
    return view({
      grid: grid(state),
      headline: t('🔍 Tìm {n} từ tiếng Anh', { n: state.words.length }),
      hint: t('Đã tìm {found}/{total} • Gõ từ bạn thấy', { found: state.words.filter((word) => word.finder).length, total: state.words.length }),
      rows: state.words.map((word, index) => ({
        badge: word.finder ? '✅' : String(index + 1),
        label: word.finder || state.ended ? `${word.word.toUpperCase()} · ${word.meaning}` : `${word.meaning} (${word.word.length})`,
        avatar: word.finder ?? undefined,
        value: word.finder ?? undefined,
        highlight: word.finder != null
      }))
    });
  }
};
