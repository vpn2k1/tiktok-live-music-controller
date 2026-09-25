import type { OverlayCrossword } from '../../shared/types';
import { checkBankLines } from '../bankFile';
import { CROSSWORD_EN, CROSSWORD_VI } from '../content/crossword';
import type { PointAward } from '../engine';
import { Scoreboard } from '../scoreboard';
import { AnswerBook, fastestRows, pickSet, podiumEffect, rankingRows, resultHint, seconds, speedPoints, type QuestionResult } from '../series';
import { foldText } from '../text';
import { chatTest, commandArgument, view, type GameDefinition } from '../types';
import { t } from '../../shared/i18n';

/**
 * "Ô chữ" (Olympia-style crossword): horizontal rows are questions; each solved
 * row reveals its letter of the vertical keyword. Viewers can guess the keyword
 * at any time — the fewer rows open, the more points.
 */

export interface CrosswordRow {
  clue: string;
  /** Uppercase letters/digits only (accents and spaces removed). */
  answer: string;
  /** Answer as written in the bank, shown on the reveal. */
  display: string;
  /** Position of this row's keyword letter in `answer`. */
  keyIndex: number;
}

export interface CrosswordPuzzle {
  keyword: string;
  hint: string;
  rows: CrosswordRow[];
}

type RowState = 'hidden' | 'solved' | 'missed';

export interface CrosswordRound {
  puzzle: CrosswordPuzzle;
  stage: 'row' | 'rowReveal' | 'keyword' | 'done';
  /** Row being asked / revealed. */
  row: number;
  rowStates: RowState[];
  askedAt: number;
  /** Correct answers to the current row (append-only, written in `commit`). */
  book: AnswerBook;
  totals: Scoreboard;
  last: QuestionResult | null;
  keywordSolver: { user: string; nickname: string; points: number } | null;
  asked: number[];
}

type CrosswordConfig = {
  preset: string;
  puzzles: string;
  seconds: number;
  keywordSeconds: number;
  maxPoints: number;
  keywordPoints: number;
  reveal: number;
  revealMissed: string;
  scoring: string;
  order: string;
};

export const CROSSWORD_PRESETS: Record<string, { label: string; bank: string }> = {
  en: { label: 'Từ tiếng Anh, gợi ý tiếng Việt', bank: CROSSWORD_EN },
  vi: { label: 'Kiến thức tiếng Việt', bank: CROSSWORD_VI }
};

const MAX_ROWS = 10;
/** Correct answers per row that still get a popup/sound. */
const ANNOUNCED_CORRECT = 5;

/** "Hà Nội" → "HANOI", "ice cream" → "ICECREAM". */
export function normalizeCrossword(text: string): string {
  return foldText(text).toUpperCase();
}

/** Parses "KEYWORD : hint | clue = answer | …"; null when the rows don't fit the keyword. */
export function parseCrosswordLine(line: string): CrosswordPuzzle | null {
  const [head = '', ...cells] = line.split('|').map((part) => part.trim());
  const [rawKeyword = '', ...hintParts] = head.split(':');
  const keyword = normalizeCrossword(rawKeyword);
  if (keyword.length < 2 || keyword.length > MAX_ROWS || cells.length !== keyword.length) return null;
  const rows: CrosswordRow[] = [];
  for (const [index, cell] of cells.entries()) {
    const split = cell.lastIndexOf('=');
    if (split < 0) return null;
    const clue = cell.slice(0, split).trim().slice(0, 120);
    const display = cell.slice(split + 1).trim().slice(0, 40);
    const answer = normalizeCrossword(display);
    const keyIndex = answer.indexOf(keyword[index] as string);
    if (!clue || answer.length < 2 || answer.length > 15 || keyIndex < 0) return null;
    rows.push({ clue, answer, display, keyIndex });
  }
  return { keyword, hint: hintParts.join(':').trim().slice(0, 80), rows };
}

export function parseCrosswords(text: string): CrosswordPuzzle[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const puzzle = parseCrosswordLine(line);
    return puzzle ? [puzzle] : [];
  });
}

export function crosswordBank(config: { preset: string; puzzles: string }): CrosswordPuzzle[] {
  const own = parseCrosswords(config.puzzles);
  return own.length ? own : parseCrosswords(CROSSWORD_PRESETS[config.preset]?.bank ?? CROSSWORD_EN);
}

/** A row's letters are on screen: solved, or missed with "show missed answers" on. */
function isOpen(rowState: RowState | undefined, config: CrosswordConfig): boolean {
  return rowState === 'solved' || (rowState === 'missed' && config.revealMissed === 'yes');
}

/** Keyword points: full before any row is open, half when every row is. */
export function keywordPoints(state: CrosswordRound, config: CrosswordConfig): number {
  const open = state.rowStates.filter((row) => isOpen(row, config)).length;
  return Math.max(1, Math.round(config.keywordPoints * (1 - 0.5 * (open / state.rowStates.length))));
}

function scoreRow(state: CrosswordRound, config: CrosswordConfig): { result: QuestionResult; awards: PointAward[] } {
  const durationMs = config.seconds * 1000;
  const awards: PointAward[] = [];
  for (const answer of state.book.correctAnswers()) {
    awards.push({ user: answer.user, nickname: answer.nickname, points: speedPoints(config.maxPoints, answer.ms, durationMs) });
  }
  const fastest = state.book.fastest.map((answer) => ({ nickname: answer.nickname, ms: answer.ms, points: speedPoints(config.maxPoints, answer.ms, durationMs) }));
  return { result: { correct: state.book.correct, total: state.book.total, fastest }, awards };
}

function closeRow(state: CrosswordRound, solved: boolean): RowState[] {
  return state.rowStates.map((row, index) => (index === state.row ? (solved ? 'solved' : 'missed') : row));
}

function keywordPattern(state: CrosswordRound, config: CrosswordConfig): string {
  return state.puzzle.keyword.split('').map((letter, index) => (isOpen(state.rowStates[index], config) ? letter : '_')).join(' ');
}

function commitAwards(state: CrosswordRound, awards: PointAward[]): () => void {
  return () => {
    for (const award of awards) state.totals.add(award.user, award.nickname, award.points);
  };
}

function top(state: CrosswordRound) {
  return state.totals.top(1)[0];
}

export function crosswordView(state: CrosswordRound, config: CrosswordConfig): OverlayCrossword {
  const { puzzle } = state;
  const lead = Math.max(...puzzle.rows.map((row) => row.keyIndex));
  const done = state.stage === 'done';
  const rows = puzzle.rows.map((row, index) => {
    const rowState = state.rowStates[index] ?? 'hidden';
    const shown = done || isOpen(rowState, config);
    const active = index === state.row && (state.stage === 'row' || state.stage === 'rowReveal');
    return {
      cells: row.answer.split('').map((letter) => (shown ? letter : '')),
      offset: lead - row.keyIndex,
      keyIndex: row.keyIndex,
      state: active && state.stage === 'row' ? 'active' as const : rowState
    };
  });
  return {
    rows,
    columns: Math.max(...rows.map((row) => row.offset + row.cells.length)),
    keyColumn: lead,
    keyword: puzzle.keyword.split('').map((letter, index) => (done || state.keywordSolver || isOpen(state.rowStates[index], config) ? letter : '')),
    keywordSolved: state.keywordSolver != null
  };
}

export const crosswordGame: GameDefinition<CrosswordRound, CrosswordConfig> = {
  id: 'crossword',
  title: 'Ô chữ 🔠',
  category: 'english',
  accent: '#8b5cf6',
  aliases: ['ochu', 'olympia'],
  howTo: 'Mỗi hàng ngang là một câu hỏi: gõ đáp án để mở hàng. Chữ ở cột tô màu ghép thành từ khóa hàng dọc — gõ từ khóa bất cứ lúc nào, đoán càng sớm càng nhiều điểm.',
  commands: [
    { usage: 'đáp án hàng ngang', description: 'Gõ thẳng đáp án (không cần dấu, cách)' },
    { usage: 'từ khóa', description: 'Gõ từ khóa hàng dọc bất cứ lúc nào' }
  ],
  defaultConfig: {
    preset: 'en',
    puzzles: '',
    seconds: 25,
    keywordSeconds: 30,
    maxPoints: 100,
    keywordPoints: 500,
    reveal: 3,
    revealMissed: 'yes',
    scoring: 'all',
    order: 'random'
  },
  settings: [
    {
      key: 'preset',
      label: 'Bộ ô chữ có sẵn',
      type: 'select',
      options: Object.entries(CROSSWORD_PRESETS).map(([value, preset]) => ({ value, label: `${preset.label} · ${parseCrosswords(preset.bank).length} ô chữ` }))
    },
    { key: 'seconds', label: 'Giây mỗi hàng ngang', type: 'number', min: 5, max: 300 },
    { key: 'keywordSeconds', label: 'Giây đoán từ khóa cuối', type: 'number', min: 5, max: 300 },
    { key: 'maxPoints', label: 'Điểm tối đa mỗi hàng', type: 'number', min: 10, max: 10_000, hint: 'Trả lời ngay = điểm tối đa, sát hết giờ = một nửa.' },
    { key: 'keywordPoints', label: 'Điểm từ khóa', type: 'number', min: 10, max: 100_000, hint: 'Đoán khi chưa mở hàng nào = đủ điểm, mở hết = một nửa.' },
    { key: 'reveal', label: 'Giây xem đáp án hàng', type: 'number', min: 1, max: 20 },
    {
      key: 'revealMissed',
      label: 'Hàng không ai trả lời',
      type: 'select',
      options: [
        { value: 'yes', label: 'Vẫn hiện đáp án (dễ hơn)' },
        { value: 'no', label: 'Giữ kín như Olympia (khó hơn)' }
      ]
    },
    {
      key: 'scoring',
      label: 'Chấm điểm hàng ngang',
      type: 'select',
      options: [
        { value: 'all', label: 'Mọi người đúng đều có điểm (nhanh hơn nhiều điểm hơn)' },
        { value: 'first', label: 'Có người đúng là mở hàng' }
      ]
    },
    {
      key: 'order',
      label: 'Thứ tự ô chữ',
      type: 'select',
      options: [
        { value: 'random', label: 'Ngẫu nhiên (không lặp đến khi hết)' },
        { value: 'file', label: 'Đúng thứ tự trong ngân hàng / file' }
      ]
    },
    {
      key: 'puzzles',
      label: 'Ô chữ riêng (tuỳ chọn)',
      type: 'textarea',
      maxLength: 500_000,
      hint: 'Để trống = dùng bộ có sẵn ở trên. Mỗi dòng 1 ô chữ: TỪKHÓA : gợi ý | câu hỏi = đáp án | … (mỗi chữ của từ khóa 1 hàng; đáp án hàng thứ i phải chứa chữ thứ i của từ khóa). Nhập được file .txt / .csv.',
      sample: [
        '# Mẫu Ô chữ — mỗi dòng 1 ô chữ:',
        '# TỪKHÓA : gợi ý chủ đề | câu hỏi hàng 1 = đáp án 1 | câu hỏi hàng 2 = đáp án 2 | …',
        '# - Từ khóa có bao nhiêu chữ thì có bấy nhiêu hàng (2–10).',
        '# - Đáp án hàng thứ i phải chứa chữ cái thứ i của từ khóa (app tự canh cột).',
        '# - Đáp án không phân biệt dấu, khoảng trắng, hoa thường: "Hà Nội" = "hanoi".',
        '# - Dòng bắt đầu bằng # là ghi chú, app bỏ qua. Lưu file dạng UTF-8.',
        'SUN : ở trên trời | Con rắn 🐍 = snake | Xe buýt 🚌 = bus | Mũi 👃 = nose',
        'HUE : cố đô của Việt Nam | Loài hoa biểu tượng của Việt Nam = hoa sen | Mùa hoa đào nở = mùa xuân | Con vật kêu ộp ộp = ếch'
      ].join('\n')
    }
  ],

  checkBank(key, text) {
    return key === 'puzzles' ? checkBankLines(text, (line) => parseCrosswordLine(line) != null) : null;
  },

  start(config, ctx) {
    const bank = crosswordBank(config);
    if (!bank.length) return { error: t('Không có ô chữ hợp lệ.') };
    const { indices, asked } = pickSet(bank.length, 1, ctx.previous?.asked ?? [], ctx.random, config.order);
    const puzzle = bank[indices[0] ?? 0] as CrosswordPuzzle;
    return {
      state: {
        puzzle,
        stage: 'row',
        row: 0,
        rowStates: puzzle.rows.map(() => 'hidden'),
        askedAt: ctx.now,
        book: new AnswerBook(),
        totals: new Scoreboard(),
        last: null,
        keywordSolver: null,
        asked
      },
      durationMs: config.seconds * 1000
    };
  },

  handle(state, input, config, ctx) {
    if (input.kind !== 'chat' || state.stage === 'done' || state.keywordSolver) return null;
    const raw = commandArgument(input.text, ['ans', 'key', 'tukhoa']);
    if (raw === null) return null;
    const text = normalizeCrossword(raw);
    if (!text) return null;

    if (text === state.puzzle.keyword) {
      const points = keywordPoints(state, config);
      return {
        consumed: true,
        finish: true,
        effects: [{ kind: 'win', text: `🔑 ${input.nickname}: ${state.puzzle.keyword}`, user: input.nickname }],
        state: { ...state, keywordSolver: { user: input.user, nickname: input.nickname, points } }
      };
    }
    const row = state.puzzle.rows[state.row];
    // Wrong or repeated answers are free (no cooldown), like the other answer games.
    if (state.stage !== 'row' || !row || text !== row.answer || state.book.has(input.user)) return null;
    const ms = ctx.now - state.askedAt;
    return {
      consumed: true,
      endsAt: config.scoring === 'first' ? ctx.now : undefined,
      effects: state.book.correct < ANNOUNCED_CORRECT ? [{ kind: 'correct', text: `✅ ${input.nickname} ${seconds(ms)}`, user: input.nickname }] : undefined,
      state: { ...state },
      commit: () => state.book.add({ user: input.user, nickname: input.nickname, ms, correct: true })
    };
  },

  advance(state, config, ctx) {
    if (state.stage === 'row') {
      const { result, awards } = scoreRow(state, config);
      const row = state.puzzle.rows[state.row];
      return {
        consumed: false,
        state: { ...state, stage: 'rowReveal', rowStates: closeRow(state, result.correct > 0), last: result },
        awards,
        commit: commitAwards(state, awards),
        endsAt: ctx.now + config.reveal * 1000,
        message: result.correct
          ? t('Hàng {n}: {answer}', { n: state.row + 1, answer: row?.display ?? '' })
          : config.revealMissed === 'yes'
            ? t('Hàng {n}: chưa ai trả lời — đáp án {answer}', { n: state.row + 1, answer: row?.display ?? '' })
            : t('Hàng {n}: chưa ai trả lời', { n: state.row + 1 })
      };
    }
    if (state.stage === 'rowReveal') {
      const next = state.row + 1;
      if (next < state.puzzle.rows.length) {
        return { consumed: false, state: { ...state, stage: 'row', row: next, askedAt: ctx.now, book: new AnswerBook(), last: null }, endsAt: ctx.now + config.seconds * 1000, message: '' };
      }
      return { consumed: false, state: { ...state, stage: 'keyword', row: -1, last: null }, endsAt: ctx.now + config.keywordSeconds * 1000, message: t('🔑 Đoán từ khóa hàng dọc!') };
    }
    return null;
  },

  finish(state, config) {
    const scored = state.stage === 'row' ? scoreRow(state, config) : null;
    const awards = [...(scored?.awards ?? [])];
    if (state.keywordSolver) awards.push({ user: state.keywordSolver.user, nickname: state.keywordSolver.nickname, points: state.keywordSolver.points });
    commitAwards(state, awards)();
    const rowStates = scored ? closeRow(state, scored.result.correct > 0) : state.rowStates;
    const done: CrosswordRound = { ...state, stage: 'done', rowStates, last: scored?.result ?? state.last };
    const winner = top(done);
    const solver = state.keywordSolver;
    return {
      state: done,
      awards,
      message: solver
        ? t('🎉 {name} đoán ra từ khóa “{keyword}” (+{points})!', { name: solver.nickname, keyword: state.puzzle.keyword, points: solver.points })
        : `${t('🔑 Từ khóa là “{keyword}”.', { keyword: state.puzzle.keyword })}${winner ? ` ${t('🏆 {name} {points}đ', { name: winner.nickname, points: winner.points })}` : ''}`,
      effects: [winner ? podiumEffect(done.totals.top(3), t('🔑 Từ khóa: {keyword}', { keyword: state.puzzle.keyword })) : { kind: 'lose', text: state.puzzle.keyword }]
    };
  },

  testActions(state) {
    if (state.stage === 'done' || state.keywordSolver) return [];
    const row = state.puzzle.rows[state.row];
    return [
      ...(state.stage === 'row' && row ? [chatTest(t('Đúng hàng {n}: {answer}', { n: state.row + 1, answer: row.display }), row.display, 2)] : []),
      chatTest(t('Trả lời sai'), 'hello', 2),
      chatTest(t('Đoán từ khóa: {keyword}', { keyword: state.puzzle.keyword }), state.puzzle.keyword, 0.15)
    ];
  },

  view(state, config) {
    const crossword = crosswordView(state, config);
    const { puzzle } = state;
    const pattern = keywordPattern(state, config);
    const keywordPts = keywordPoints(state, config);
    if (state.stage === 'done') {
      return view({
        crossword,
        headline: `🔑 ${puzzle.keyword}`,
        hint: state.keywordSolver
          ? t('{name} đoán ra từ khóa (+{points})', { name: state.keywordSolver.nickname, points: state.keywordSolver.points })
          : t('Không ai đoán ra từ khóa'),
        rows: rankingRows(state.totals.top(5))
      });
    }
    if (state.stage === 'keyword') {
      return view({
        crossword,
        headline: t('🔑 Từ khóa hàng dọc là gì?'),
        hint: `${pattern} • ${t('{count} chữ cái', { count: puzzle.keyword.length })}${puzzle.hint ? ` • ${t('Gợi ý: {hint}', { hint: puzzle.hint })}` : ''} • ${t('+{points} điểm', { points: keywordPts })}`,
        rows: rankingRows(state.totals.top(3))
      });
    }
    const row = puzzle.rows[state.row];
    if (state.stage === 'rowReveal') {
      return view({
        crossword,
        headline: row?.clue ?? '',
        hint: `✔ ${row?.display ?? ''} • ${resultHint(state.last)}`,
        rows: fastestRows(state.last)
      });
    }
    return view({
      crossword,
      headline: row?.clue ?? '',
      hint: t('Hàng {n}/{total} • {letters} chữ cái • Từ khóa: {pattern} (+{points})', { n: state.row + 1, total: puzzle.rows.length, letters: row?.answer.length ?? 0, pattern, points: keywordPts }),
      rows: state.book.fastest.map((answer, index) => ({ badge: index === 0 ? '🥇' : '✅', label: answer.nickname, avatar: answer.nickname, value: seconds(answer.ms) }))
    });
  }
};
