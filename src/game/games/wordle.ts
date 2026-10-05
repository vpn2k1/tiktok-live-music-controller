import type { OverlayGrid } from '../../shared/types';
import { checkBankLines } from '../bankFile';
import { EN_WORDLE_BANK } from '../content/vocab-en';
import type { PointAward } from '../engine';
import { looksLikeEnglishWord, normalizeEnglish } from '../english';
import { Scoreboard } from '../scoreboard';
import { commitTotals, pickSet, podiumEffect, rankingRows, winnerEffect } from '../series';
import { chatTest, commandArgument, view, type GameDefinition } from '../types';
import { t } from '../../shared/i18n';

/**
 * Đoán chữ (Wordle) for the whole room: viewers comment words of the secret
 * word's length; each guess is colored (green = right place, yellow = in the
 * word, grey = not in it) on a shared board. The first exact guess wins the
 * word; guesses that turn a letter green for the first time earn a helper bonus.
 */
export type WordleMark = 'hit' | 'near' | 'miss';

export interface WordleWord {
  word: string;
  meaning: string;
}

export interface WordleGuess {
  word: string;
  marks: WordleMark[];
  nickname: string;
}

export interface WordleRound {
  words: WordleWord[];
  index: number;
  stage: 'guess' | 'reveal' | 'done';
  askedAt: number;
  /** Guesses for the current word (≤ maxGuesses, so copying is cheap). */
  guesses: WordleGuess[];
  /** Positions already found green (helper bonus once per position). */
  greens: boolean[];
  solver: { nickname: string; points: number } | null;
  totals: Scoreboard;
  asked: number[];
  /** Every word of the bank (accepted guesses in "dictionary" mode). */
  known: Set<string>;
}

type WordleConfig = {
  preset: string;
  bank: string;
  count: number;
  seconds: number;
  maxGuesses: number;
  hintAfter: number;
  points: number;
  helperPoints: number;
  reveal: number;
  check: string;
};

/** Rows of the board on screen (the latest guesses). */
const BOARD_ROWS = 6;
const MIN_LETTERS = 3;
const MAX_LETTERS = 8;

export const WORDLE_PRESETS: Record<string, { label: string; bank: string }> = {
  w5: { label: 'Từ 5 chữ cái (như Wordle)', bank: lengthBank(5) },
  w4: { label: 'Từ 4 chữ cái (dễ)', bank: lengthBank(4) },
  w6: { label: 'Từ 6 chữ cái (khó)', bank: lengthBank(6) }
};

function lengthBank(length: number): string {
  return EN_WORDLE_BANK.split('\n').filter((line) => (line.split('|')[0] ?? '').trim().length === length).join('\n');
}

export function parseWordleLine(line: string): WordleWord | null {
  const [rawWord = '', meaning = ''] = line.split('|').map((part) => part.trim());
  const word = normalizeEnglish(rawWord);
  if (line.trim().startsWith('#') || !/^[a-z]+$/.test(word) || word.length < MIN_LETTERS || word.length > MAX_LETTERS) return null;
  return { word, meaning: meaning.slice(0, 80) };
}

export function parseWordleBank(text: string): WordleWord[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const word = parseWordleLine(line);
    return word ? [word] : [];
  });
}

function wordleBank(config: Pick<WordleConfig, 'preset' | 'bank'>): WordleWord[] {
  const own = parseWordleBank(config.bank);
  return own.length ? own : parseWordleBank(WORDLE_PRESETS[config.preset]?.bank ?? WORDLE_PRESETS.w5?.bank ?? '');
}

/** Wordle colors, with repeated letters counted like the original game. */
export function scoreGuess(guess: string, secret: string): WordleMark[] {
  const marks: WordleMark[] = Array.from({ length: guess.length }, () => 'miss');
  const left = new Map<string, number>();
  for (let i = 0; i < secret.length; i += 1) {
    if (guess[i] === secret[i]) marks[i] = 'hit';
    else left.set(secret[i] as string, (left.get(secret[i] as string) ?? 0) + 1);
  }
  for (let i = 0; i < guess.length; i += 1) {
    const letter = guess[i] as string;
    if (marks[i] === 'hit') continue;
    const count = left.get(letter) ?? 0;
    if (count > 0) {
      marks[i] = 'near';
      left.set(letter, count - 1);
    }
  }
  return marks;
}

function secretOf(state: WordleRound): WordleWord {
  return state.words[state.index] as WordleWord;
}

/** Letters no guess has found in the word (shown as "ruled out"). */
export function ruledOut(state: WordleRound): string[] {
  const secret = secretOf(state).word;
  const out = new Set<string>();
  for (const guess of state.guesses) for (const letter of guess.word) if (!secret.includes(letter)) out.add(letter);
  return [...out].sort();
}

/** Solver points: full on the first guess, half when every guess was used. */
export function solvePoints(config: Pick<WordleConfig, 'points' | 'maxGuesses'>, guessNumber: number): number {
  const used = Math.min(1, Math.max(0, (guessNumber - 1) / Math.max(1, config.maxGuesses)));
  return Math.max(1, Math.round(config.points * (1 - used / 2)));
}

function boardGrid(state: WordleRound): OverlayGrid {
  const secret = secretOf(state).word;
  const length = secret.length;
  const shown = state.guesses.slice(-BOARD_ROWS);
  const cells: OverlayGrid['cells'] = [];
  for (const guess of shown) {
    guess.word.split('').forEach((letter, index) => cells.push({ text: letter, state: guess.marks[index] ?? 'miss' }));
  }
  // Unsolved at the reveal: the secret word in gold on the last row.
  const revealRow = state.stage !== 'guess' && !state.solver;
  const emptyRows = Math.max(0, BOARD_ROWS - shown.length - (revealRow ? 1 : 0));
  for (let row = 0; row < emptyRows; row += 1) for (let i = 0; i < length; i += 1) cells.push({ text: '', state: 'empty' });
  if (revealRow) for (const letter of secret) cells.push({ text: letter, state: 'found' });
  return { kind: 'letters', columns: length, cells };
}

function nextWord(state: WordleRound, now: number): WordleRound | null {
  if (state.index + 1 >= state.words.length) return null;
  const word = state.words[state.index + 1] as WordleWord;
  return { ...state, index: state.index + 1, stage: 'guess', askedAt: now, guesses: [], greens: Array.from({ length: word.word.length }, () => false), solver: null };
}

export const wordleGame: GameDefinition<WordleRound, WordleConfig> = {
  id: 'doanChu',
  title: 'Đoán chữ 🟩',
  category: 'english',
  accent: '#16a34a',
  aliases: ['doanchu', 'wordle'],
  howTo: 'Cả phòng cùng đoán một từ tiếng Anh bí mật: comment một từ đúng số chữ cái. Ô xanh = đúng chữ đúng chỗ, ô vàng = có chữ đó nhưng sai chỗ, ô xám = không có. Ai đoán trúng trước được điểm; đoán ra thêm chữ xanh mới cũng có thưởng.',
  commands: [
    { usage: 'apple', description: 'Đoán một từ đúng số chữ cái (mỗi từ chỉ tính lần đầu)' },
    { usage: '!doan apple', description: 'Cách viết khác' }
  ],
  defaultConfig: { preset: 'w5', bank: '', count: 3, seconds: 150, maxGuesses: 30, hintAfter: 6, points: 200, helperPoints: 10, reveal: 5, check: 'any' },
  settings: [
    {
      key: 'preset',
      label: 'Bộ từ có sẵn',
      type: 'select',
      options: Object.entries(WORDLE_PRESETS).map(([value, preset]) => ({ value, label: `${preset.label} · ${parseWordleBank(preset.bank).length} từ` }))
    },
    { key: 'count', label: 'Số từ mỗi lượt', type: 'number', min: 1, max: 20 },
    { key: 'seconds', label: 'Giây mỗi từ', type: 'number', min: 20, max: 900 },
    { key: 'maxGuesses', label: 'Số lần đoán tối đa mỗi từ (cả phòng)', type: 'number', min: 3, max: 200 },
    { key: 'hintAfter', label: 'Hiện nghĩa tiếng Việt sau số lần đoán', type: 'number', min: 0, max: 200, hint: '0 = hiện nghĩa ngay từ đầu (dễ hơn).' },
    { key: 'points', label: 'Điểm đoán trúng', type: 'number', min: 10, max: 10_000, hint: 'Trúng ngay lần đầu = đủ điểm, càng nhiều lần đoán càng ít (tối thiểu một nửa).' },
    { key: 'helperPoints', label: 'Điểm mỗi chữ xanh mới', type: 'number', min: 0, max: 1000 },
    { key: 'reveal', label: 'Giây xem đáp án', type: 'number', min: 2, max: 20 },
    {
      key: 'check',
      label: 'Từ được đoán',
      type: 'select',
      options: [
        { value: 'any', label: 'Mọi chuỗi chữ cái có nguyên âm (dễ)' },
        { value: 'dict', label: 'Chỉ từ có trong từ điển / bộ từ' }
      ]
    },
    {
      key: 'bank',
      label: 'Từ bí mật riêng (tuỳ chọn)',
      type: 'textarea',
      maxLength: 200_000,
      hint: 'Để trống = dùng bộ có sẵn. Mỗi dòng: từ tiếng Anh (3–8 chữ cái) | nghĩa tiếng Việt. Nhập được file .txt / .csv.',
      sample: [
        '# Mẫu Đoán chữ — mỗi dòng 1 từ bí mật:',
        '# từ tiếng Anh (3–8 chữ cái, không dấu cách) | nghĩa tiếng Việt',
        '# - Dòng bắt đầu bằng # là ghi chú, app bỏ qua. Lưu file dạng UTF-8.',
        'apple | quả táo',
        'house | ngôi nhà'
      ].join('\n')
    }
  ],

  checkBank(key, text) {
    return key === 'bank' ? checkBankLines(text, (line) => parseWordleLine(line) != null) : null;
  },

  start(config, ctx) {
    const bank = wordleBank(config);
    if (!bank.length) return { error: t('Không có từ hợp lệ.') };
    const { indices, asked } = pickSet(bank.length, config.count, ctx.previous?.asked ?? [], ctx.random);
    const words = indices.map((index) => bank[index] as WordleWord);
    const first = words[0] as WordleWord;
    return {
      state: {
        words,
        index: 0,
        stage: 'guess',
        askedAt: ctx.now,
        guesses: [],
        greens: Array.from({ length: first.word.length }, () => false),
        solver: null,
        totals: new Scoreboard(),
        asked,
        known: new Set(bank.map((entry) => entry.word))
      },
      durationMs: config.seconds * 1000
    };
  },

  handle(state, input, config, ctx) {
    if (input.kind !== 'chat' || state.stage !== 'guess' || state.solver) return null;
    const raw = commandArgument(input.text, ['doan', 'guess']);
    if (raw === null || /[^\x20-\x7E]/.test(raw)) return null;
    const guess = normalizeEnglish(raw);
    const secret = secretOf(state).word;
    if (guess.length !== secret.length || !/^[a-z]+$/.test(guess)) return null;
    if (state.guesses.some((entry) => entry.word === guess)) return { state, consumed: true };
    if (config.check === 'dict') {
      if (!ctx.englishDictionary.words.has(guess) && !state.known.has(guess)) return null;
    } else if (!looksLikeEnglishWord(guess, MIN_LETTERS)) {
      return null;
    }

    const marks = scoreGuess(guess, secret);
    const greens = state.greens.map((found, index) => found || marks[index] === 'hit');
    const newGreens = greens.filter((found, index) => found && !state.greens[index]).length;
    const guesses = [...state.guesses, { word: guess, marks, nickname: input.nickname }];
    const awards: PointAward[] = [];
    const solved = guess === secret;
    if (solved) awards.push({ user: input.user, nickname: input.nickname, points: solvePoints(config, guesses.length) });
    else if (newGreens && config.helperPoints > 0) awards.push({ user: input.user, nickname: input.nickname, points: newGreens * config.helperPoints });
    const outOfGuesses = !solved && guesses.length >= config.maxGuesses;
    return {
      consumed: true,
      state: { ...state, guesses, greens, solver: solved ? { nickname: input.nickname, points: awards[0]?.points ?? 0 } : null },
      awards,
      commit: commitTotals(state, awards),
      endsAt: solved || outOfGuesses ? ctx.now : undefined,
      effects: solved
        ? [{ kind: 'correct', text: t('🟩 {name} đoán trúng {word}!', { name: input.nickname, word: secret.toUpperCase() }), user: input.nickname }]
        : newGreens ? [{ kind: 'score', text: `+${newGreens} 🟩 ${input.nickname}`, user: input.nickname }] : undefined
    };
  },

  advance(state, config, ctx) {
    if (state.stage === 'guess') {
      const secret = secretOf(state);
      return {
        consumed: false,
        state: { ...state, stage: 'reveal' },
        endsAt: ctx.now + config.reveal * 1000,
        message: state.solver
          ? t('🟩 {name} đoán trúng “{word}” ({meaning}) +{points}', { name: state.solver.nickname, word: secret.word, meaning: secret.meaning, points: state.solver.points })
          : t('Từ bí mật là “{word}” ({meaning})', { word: secret.word, meaning: secret.meaning })
      };
    }
    if (state.stage !== 'reveal') return null;
    const next = nextWord(state, ctx.now);
    return next ? { consumed: false, state: next, endsAt: ctx.now + config.seconds * 1000, message: '' } : null;
  },

  finish(state) {
    const done: WordleRound = { ...state, stage: 'done' };
    const top = state.totals.top(3);
    const secret = secretOf(state);
    const solvedNow = state.stage === 'guess' ? t('Từ bí mật là “{word}” ({meaning})', { word: secret.word, meaning: secret.meaning }) : '';
    if (!top.length) return { state: done, awards: [], message: solvedNow || t('🏁 Hết lượt, chưa ai ghi điểm.'), effects: [{ kind: 'lose', text: secret.word.toUpperCase() }] };
    const ranking = top.map((entry, index) => `${['🥇', '🥈', '🥉'][index]} ${entry.nickname} ${entry.points}`).join(' · ');
    return {
      state: done,
      awards: [],
      message: `${solvedNow ? `${solvedNow}. ` : ''}${t('🏁 Đoán chữ: {ranking}', { ranking })}`,
      effects: [top.length === 1 ? winnerEffect(top[0]?.nickname ?? '', t('🟩 Vua đoán chữ!'), `${top[0]?.points ?? 0}`) : podiumEffect(top, t('🟩 Vua đoán chữ!'))]
    };
  },

  testActions(state) {
    if (state.stage !== 'guess' || state.solver) return [];
    const secret = secretOf(state).word;
    const other = state.words.find((entry) => entry.word !== secret && entry.word.length === secret.length)?.word
      ?? secret.split('').reverse().join('');
    return [
      chatTest(t('Đoán sai: {word}', { word: other }), other, 3),
      chatTest(t('Đoán ngẫu nhiên'), 'aeiou'.slice(0, secret.length).padEnd(secret.length, 'e'), 2),
      chatTest(t('Đoán trúng: {word}', { word: secret }), secret, 0.4)
    ];
  },

  view(state, config) {
    if (state.stage === 'done') {
      return view({ headline: t('🏁 Tổng kết'), hint: t('{count} từ', { count: state.index + 1 }), rows: rankingRows(state.totals.top(5)) });
    }
    const secret = secretOf(state);
    const grid = boardGrid(state);
    if (state.stage === 'reveal') {
      return view({
        grid,
        headline: secret.word.toUpperCase(),
        style: { headline: 'tiles' },
        hint: `${secret.meaning ? `🇻🇳 ${secret.meaning} • ` : ''}${state.solver ? t('🟩 {name} đoán trúng (+{points})', { name: state.solver.nickname, points: state.solver.points }) : t('Không ai đoán ra')}`,
        rows: rankingRows(state.totals.top(3))
      });
    }
    const showMeaning = secret.meaning && state.guesses.length >= config.hintAfter;
    const out = ruledOut(state);
    return view({
      grid,
      headline: t('🟩 Từ {letters} chữ cái', { letters: secret.word.length }),
      hint: [
        t('Từ {n}/{total} • Đã đoán {used}/{max}', { n: state.index + 1, total: state.words.length, used: state.guesses.length, max: config.maxGuesses }),
        showMeaning ? t('Nghĩa: {meaning}', { meaning: secret.meaning }) : config.hintAfter > state.guesses.length ? t('Nghĩa hiện sau {n} lần đoán', { n: config.hintAfter }) : '',
        out.length ? t('Loại: {letters}', { letters: out.join(' ').toUpperCase() }) : ''
      ].filter(Boolean).join(' • '),
      rows: state.guesses.slice(-3).reverse().map((guess) => ({
        label: guess.nickname,
        avatar: guess.nickname,
        value: `${guess.word.toUpperCase()} ${guess.marks.map((mark) => (mark === 'hit' ? '🟩' : mark === 'near' ? '🟨' : '⬛')).join('')}`
      }))
    });
  }
};
