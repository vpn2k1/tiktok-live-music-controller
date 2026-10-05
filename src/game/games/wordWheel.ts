import type { OverlayGrid } from '../../shared/types';
import type { PointAward } from '../engine';
import { normalizeEnglish } from '../english';
import { Scoreboard } from '../scoreboard';
import { commitTotals, podiumEffect, rankingRows } from '../series';
import { chatTest, commandArgument, pickUnasked, shuffle, view, type GameDefinition } from '../types';
import { checkVocabBank, EN_VOCAB_PRESETS, vocabBank, vocabSettings } from '../vocab';
import { t } from '../../shared/i18n';

/**
 * Vòng chữ (word wheel): a few letters on screen, and slots for the English
 * words they make (clues = Vietnamese meanings). Viewers comment words made of
 * those letters: a word in the slots fills it (points per letter, first finder
 * only); any other real word made of them is a bonus word.
 */
export interface WheelTarget {
  word: string;
  meaning: string;
  finder: string | null;
}

export interface WheelPuzzle {
  /** The letters on the wheel, shuffled. */
  letters: string[];
  targets: WheelTarget[];
}

export interface WordWheelRound {
  puzzles: WheelPuzzle[];
  index: number;
  stage: 'play' | 'reveal' | 'done';
  /** Bonus words found in the current puzzle (capped). */
  bonus: string[];
  totals: Scoreboard;
  /** Wheels used recently (indices among the bank's words of the wheel size). */
  asked: number[];
  /** Every bank word (bonus words don't need the dictionary). */
  known: Set<string>;
}

type WordWheelConfig = { preset: string; bank: string; count: number; letters: number; seconds: number; letterPoints: number; bonusPoints: number; reveal: number };

const MIN_WORD = 3;
const MAX_TARGETS = 6;
const MIN_TARGETS = 3;
const MAX_BONUS = 12;
const BASE_TRIES = 80;

function letterCounts(word: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const letter of word) counts.set(letter, (counts.get(letter) ?? 0) + 1);
  return counts;
}

/** True when `word` can be spelled with the wheel's letters (each used once). */
export function canSpell(word: string, letters: string[]): boolean {
  const available = letterCounts(letters.join(''));
  for (const [letter, count] of letterCounts(word)) if ((available.get(letter) ?? 0) < count) return false;
  return true;
}

/** Builds up to `count` wheels from the bank; each needs at least 3 bank words to find. */
export function buildPuzzles(
  bank: { word: string; meaning: string }[],
  count: number,
  wheelSize: number,
  previous: number[],
  random: () => number
): { puzzles: WheelPuzzle[]; asked: number[] } {
  const puzzles: WheelPuzzle[] = [];
  let asked = previous;
  const bases = bank.filter((entry) => entry.word.length === wheelSize).map((entry) => ({ entry }));
  if (!bases.length) return { puzzles, asked };
  for (let attempt = 0; attempt < BASE_TRIES && puzzles.length < count; attempt += 1) {
    const pick = pickUnasked(bases.length, asked, random);
    asked = pick.asked;
    const base = bases[pick.index] as { entry: { word: string; meaning: string } };
    if (puzzles.some((puzzle) => puzzle.targets.some((target) => target.word === base.entry.word))) continue;
    const letters = base.entry.word.split('');
    const fits = bank.filter((entry) => entry.word.length >= MIN_WORD && entry.word !== base.entry.word && canSpell(entry.word, letters));
    const others = shuffle(fits, random).slice(0, MAX_TARGETS - 1);
    if (others.length + 1 < MIN_TARGETS) continue;
    const targets = [base.entry, ...others]
      .sort((a, b) => a.word.length - b.word.length || a.word.localeCompare(b.word))
      .map((entry) => ({ word: entry.word, meaning: entry.meaning, finder: null }));
    let shown = shuffle(letters, random);
    if (shown.join('') === base.entry.word) shown = [...letters].reverse();
    puzzles.push({ letters: shown, targets });
  }
  return { puzzles, asked };
}

function puzzleOf(state: WordWheelRound): WheelPuzzle {
  return state.puzzles[state.index] as WheelPuzzle;
}

function slotsGrid(puzzle: WheelPuzzle, revealAll: boolean): OverlayGrid {
  const columns = Math.max(...puzzle.targets.map((target) => target.word.length));
  const cells: OverlayGrid['cells'] = [];
  for (const target of puzzle.targets) {
    const open = target.finder != null || revealAll;
    for (let i = 0; i < columns; i += 1) {
      const letter = target.word[i];
      if (letter == null) cells.push({ text: '', state: 'blank' });
      else cells.push({ text: open ? letter : '', state: target.finder ? 'found' : open ? 'miss' : 'empty' });
    }
  }
  return { kind: 'letters', columns, cells };
}

export const wordWheelGame: GameDefinition<WordWheelRound, WordWheelConfig> = {
  id: 'vongChu',
  title: 'Vòng chữ 🎡',
  category: 'english',
  accent: '#7c3aed',
  aliases: ['vongchu', 'wordwheel'],
  howTo: 'Màn hình hiện vài chữ cái và các ô trống cho những từ tiếng Anh ghép được từ chúng (gợi ý là nghĩa tiếng Việt). Comment một từ ghép từ các chữ đó (mỗi chữ dùng một lần): từ trong ô trống được điểm theo số chữ cái, từ có nghĩa khác là từ thưởng.',
  commands: [{ usage: 'rate', description: 'Gõ một từ ghép từ các chữ trên vòng' }],
  defaultConfig: { preset: 'en-basic1', bank: '', count: 3, letters: 6, seconds: 90, letterPoints: 10, bonusPoints: 5, reveal: 5 },
  settings: [
    ...vocabSettings(EN_VOCAB_PRESETS),
    { key: 'count', label: 'Số vòng mỗi lượt', type: 'number', min: 1, max: 10 },
    { key: 'letters', label: 'Số chữ cái trên vòng', type: 'number', min: 4, max: 8, hint: 'Bộ từ lớn (Cơ bản) cho nhiều vòng hơn; bộ nhỏ nên chọn 4–5 chữ.' },
    { key: 'seconds', label: 'Giây mỗi vòng', type: 'number', min: 20, max: 600 },
    { key: 'letterPoints', label: 'Điểm mỗi chữ cái', type: 'number', min: 1, max: 1000 },
    { key: 'bonusPoints', label: 'Điểm từ thưởng', type: 'number', min: 0, max: 1000 },
    { key: 'reveal', label: 'Giây xem đáp án', type: 'number', min: 2, max: 20 }
  ],

  checkBank(key, text) {
    return key === 'bank' ? checkVocabBank(text) : null;
  },

  start(config, ctx) {
    const { words } = vocabBank(config, EN_VOCAB_PRESETS);
    const seen = new Set<string>();
    const bank = words
      .map((word) => ({ word: normalizeEnglish(word.term), meaning: word.meaning }))
      .filter((entry) => /^[a-z]+$/.test(entry.word) && !seen.has(entry.word) && Boolean(seen.add(entry.word)));
    const { puzzles, asked } = buildPuzzles(bank, config.count, config.letters, ctx.previous?.asked ?? [], ctx.random);
    if (!puzzles.length) return { error: t('Bộ từ không đủ để tạo vòng {n} chữ cái — thử bộ lớn hơn hoặc ít chữ cái hơn.', { n: config.letters }) };
    return {
      state: { puzzles, index: 0, stage: 'play', bonus: [], totals: new Scoreboard(), asked, known: seen },
      durationMs: config.seconds * 1000
    };
  },

  handle(state, input, config, ctx) {
    if (input.kind !== 'chat' || state.stage !== 'play') return null;
    const raw = commandArgument(input.text, ['vong', 'word']);
    if (raw === null || /[^\x20-\x7E]/.test(raw)) return null;
    const guess = normalizeEnglish(raw);
    const puzzle = puzzleOf(state);
    if (!/^[a-z]+$/.test(guess) || guess.length < MIN_WORD || !canSpell(guess, puzzle.letters)) return null;

    const index = puzzle.targets.findIndex((target) => target.word === guess);
    if (index >= 0) {
      if (puzzle.targets[index]?.finder) return { state, consumed: true };
      const targets = puzzle.targets.map((target, i) => (i === index ? { ...target, finder: input.nickname } : target));
      const puzzles = state.puzzles.map((entry, i) => (i === state.index ? { ...entry, targets } : entry));
      const awards: PointAward[] = [{ user: input.user, nickname: input.nickname, points: guess.length * config.letterPoints }];
      const all = targets.every((target) => target.finder);
      return {
        consumed: true,
        state: { ...state, puzzles },
        awards,
        commit: commitTotals(state, awards),
        endsAt: all ? ctx.now : undefined,
        effects: [{ kind: 'correct', text: `🎡 ${input.nickname}: ${guess.toUpperCase()}`, user: input.nickname }]
      };
    }
    const real = ctx.englishDictionary.words.has(guess) || state.known.has(guess);
    if (!real || state.bonus.includes(guess) || state.bonus.length >= MAX_BONUS) return real ? { state, consumed: true } : null;
    const awards: PointAward[] = config.bonusPoints > 0 ? [{ user: input.user, nickname: input.nickname, points: config.bonusPoints }] : [];
    return {
      consumed: true,
      state: { ...state, bonus: [...state.bonus, guess] },
      awards,
      commit: commitTotals(state, awards),
      effects: [{ kind: 'score', text: t('⭐ Từ thưởng {word}', { word: guess.toUpperCase() }), user: input.nickname }]
    };
  },

  advance(state, config, ctx) {
    if (state.stage === 'play') {
      const missed = puzzleOf(state).targets.filter((target) => !target.finder).map((target) => target.word);
      return {
        consumed: false,
        state: { ...state, stage: 'reveal' },
        endsAt: ctx.now + config.reveal * 1000,
        message: missed.length ? t('🎡 Còn thiếu: {words}', { words: missed.join(', ') }) : t('🎡 Cả phòng đã tìm ra hết các từ!')
      };
    }
    if (state.stage !== 'reveal' || state.index + 1 >= state.puzzles.length) return null;
    return { consumed: false, state: { ...state, index: state.index + 1, stage: 'play', bonus: [] }, endsAt: ctx.now + config.seconds * 1000, message: '' };
  },

  finish(state) {
    const top = state.totals.top(3);
    return {
      state: { ...state, stage: 'done' },
      awards: [],
      message: top.length
        ? t('🎡 Vòng chữ: {ranking}', { ranking: top.map((entry, index) => `${['🥇', '🥈', '🥉'][index]} ${entry.nickname} ${entry.points}`).join(' · ') })
        : t('🏁 Hết lượt, chưa ai ghi điểm.'),
      effects: [top.length ? podiumEffect(top, t('🎡 Bậc thầy ghép chữ!')) : { kind: 'lose', text: t('Hết giờ') }]
    };
  },

  testActions(state) {
    if (state.stage !== 'play') return [];
    const open = puzzleOf(state).targets.find((target) => !target.finder);
    return [
      chatTest(t('Từ sai (không ghép được)'), 'zebra', 2),
      ...(open ? [chatTest(t('Từ đúng: {word}', { word: open.word }), open.word, 1)] : [])
    ];
  },

  view(state) {
    if (state.stage === 'done') {
      return view({ headline: t('🏁 Tổng kết'), hint: t('{count} vòng', { count: state.index + 1 }), rows: rankingRows(state.totals.top(5)) });
    }
    const puzzle = puzzleOf(state);
    const reveal = state.stage === 'reveal';
    const found = puzzle.targets.filter((target) => target.finder).length;
    return view({
      headline: puzzle.letters.join('').toUpperCase(),
      style: { headline: 'tiles' },
      grid: slotsGrid(puzzle, reveal),
      hint: [
        t('Vòng {n}/{total} • Tìm được {found}/{count}', { n: state.index + 1, total: state.puzzles.length, found, count: puzzle.targets.length }),
        state.bonus.length ? t('Từ thưởng: {words}', { words: state.bonus.join(', ') }) : ''
      ].filter(Boolean).join(' • '),
      rows: puzzle.targets.map((target, index) => ({
        badge: target.finder ? '✅' : String(index + 1),
        label: target.finder || reveal ? `${target.word.toUpperCase()} · ${target.meaning}` : `${target.meaning} (${target.word.length})`,
        avatar: target.finder ?? undefined,
        value: target.finder ?? undefined,
        highlight: target.finder != null
      }))
    });
  }
};
