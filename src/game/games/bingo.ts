import type { OverlayGrid } from '../../shared/types';
import type { EffectInput, PointAward } from '../engine';
import { Scoreboard } from '../scoreboard';
import { commitTotals, pickSet, podiumEffect, rankingRows } from '../series';
import { chatTest, commandArgument, shuffle, view, type GameDefinition } from '../types';
import { checkVocabBank, termWithReading, vocabBank, vocabSettings, type VocabWord } from '../vocab';
import { t } from '../../shared/i18n';

/**
 * Lô tô: one shared ticket of numbered Vietnamese meanings. The caller reads
 * a foreign word (English, Japanese or Chinese); viewers comment the number of
 * its meaning. The first right number claims the square; one try per viewer
 * per call. Completing a row, column or diagonal of claimed squares is "Kinh!"
 * — a bonus for whoever claimed the last square of it.
 */
export interface BingoCell {
  word: VocabWord;
  claimer: string | null;
  missed: boolean;
}

export interface BingoRound {
  size: number;
  cells: BingoCell[];
  /** Cell indices in calling order. */
  order: number[];
  call: number;
  stage: 'call' | 'show' | 'done';
  calledAt: number;
  /** Viewers who already tried this call (mutable, written in commit). */
  tried: Set<string>;
  /** Lines already paid ("r0", "c2", "d1"…). */
  lines: string[];
  totals: Scoreboard;
  asked: number[];
}

type BingoConfig = { preset: string; bank: string; size: number; callSeconds: number; showSeconds: number; points: number; kinhPoints: number };

/** Every line of a size×size board: rows, columns, both diagonals. */
export function boardLines(size: number): { id: string; cells: number[] }[] {
  const range = Array.from({ length: size }, (_, i) => i);
  return [
    ...range.map((row) => ({ id: `r${row}`, cells: range.map((col) => row * size + col) })),
    ...range.map((col) => ({ id: `c${col}`, cells: range.map((row) => row * size + col) })),
    { id: 'd0', cells: range.map((i) => i * size + i) },
    { id: 'd1', cells: range.map((i) => i * size + (size - 1 - i)) }
  ];
}

/** Lines through `cell` that are now fully claimed and weren't paid yet. */
export function newLines(cells: BingoCell[], size: number, cell: number, paid: string[]): string[] {
  return boardLines(size)
    .filter((line) => line.cells.includes(cell) && !paid.includes(line.id) && line.cells.every((index) => cells[index]?.claimer))
    .map((line) => line.id);
}

/** "5", "#5", "!so 5", "số 5" → 5; null for other comments. */
export function parseSquare(text: string): number | null {
  const arg = commandArgument(text, ['so', 'số', 'o', 'ô']);
  if (arg === null) return null;
  const match = arg.trim().match(/^(?:số|so|ô|o|#)?\s*(\d{1,2})$/iu);
  return match ? Number(match[1]) : null;
}

function calledCell(state: BingoRound): number {
  return state.order[state.call] as number;
}

function ticket(state: BingoRound): OverlayGrid {
  const called = state.stage === 'show' ? calledCell(state) : -1;
  return {
    kind: 'words',
    columns: state.size,
    cells: state.cells.map((cell, index) => ({
      text: cell.word.meaning,
      label: String(index + 1),
      sub: cell.claimer ?? (cell.missed ? termWithReading(cell.word) : undefined),
      state: cell.claimer ? 'found' : cell.missed ? 'miss' : index === called ? 'active' : 'idle'
    }))
  };
}

export const bingoGame: GameDefinition<BingoRound, BingoConfig> = {
  id: 'loTo',
  title: 'Lô tô 🎟️',
  category: 'fun',
  accent: '#db2777',
  aliases: ['loto', 'bingo'],
  howTo: 'Cả phòng chung một tấm vé ghi nghĩa tiếng Việt, mỗi ô một số. Người xướng đọc một từ tiếng Anh / Nhật / Trung: comment số ô có nghĩa đúng (mỗi người một lần mỗi lượt đọc). Ai đúng trước giành ô; giành ô cuối của một hàng ngang, dọc hay chéo là "Kinh!" được thưởng thêm.',
  commands: [{ usage: '5', description: 'Gõ số ô có nghĩa của từ vừa đọc' }],
  defaultConfig: { preset: 'en-kids', bank: '', size: 4, callSeconds: 15, showSeconds: 3, points: 20, kinhPoints: 50 },
  settings: [
    ...vocabSettings(),
    { key: 'size', label: 'Cỡ vé (số ô mỗi cạnh)', type: 'number', min: 3, max: 5 },
    { key: 'callSeconds', label: 'Giây mỗi lượt đọc', type: 'number', min: 5, max: 120 },
    { key: 'showSeconds', label: 'Giây xem kết quả', type: 'number', min: 1, max: 15 },
    { key: 'points', label: 'Điểm mỗi ô', type: 'number', min: 1, max: 10_000 },
    { key: 'kinhPoints', label: 'Điểm thưởng "Kinh!"', type: 'number', min: 0, max: 10_000 }
  ],

  checkBank(key, text) {
    return key === 'bank' ? checkVocabBank(text) : null;
  },

  start(config, ctx) {
    const { words } = vocabBank(config);
    // Squares need different meanings, or two would be right.
    const seen = new Set<string>();
    const unique = words.filter((word) => !seen.has(word.meaning) && Boolean(seen.add(word.meaning)));
    const size = Math.min(5, Math.max(3, config.size));
    const needed = size * size;
    if (unique.length < needed) return { error: t('Cần ít nhất {n} từ có nghĩa khác nhau cho vé {size}×{size}.', { n: needed, size }) };
    const { indices, asked } = pickSet(unique.length, needed, ctx.previous?.asked ?? [], ctx.random);
    const cells = indices.map((index) => ({ word: unique[index] as VocabWord, claimer: null, missed: false }));
    const order = shuffle(cells.map((_, index) => index), ctx.random);
    return {
      state: { size, cells, order, call: 0, stage: 'call', calledAt: ctx.now, tried: new Set(), lines: [], totals: new Scoreboard(), asked },
      durationMs: config.callSeconds * 1000
    };
  },

  handle(state, input, config, ctx) {
    if (input.kind !== 'chat' || state.stage !== 'call') return null;
    const square = parseSquare(input.text);
    if (square === null || square < 1 || square > state.cells.length) return null;
    if (state.tried.has(input.user)) return { state, consumed: true };
    const tried = state.tried;
    const target = calledCell(state);
    if (square - 1 !== target) return { state: { ...state }, consumed: true, commit: () => tried.add(input.user) };

    const cells = state.cells.map((cell, index) => (index === target ? { ...cell, claimer: input.nickname } : cell));
    const lines = newLines(cells, state.size, target, state.lines);
    const awards: PointAward[] = [{ user: input.user, nickname: input.nickname, points: config.points + lines.length * config.kinhPoints }];
    const effects: EffectInput[] = [{ kind: 'correct', text: `🎟️ ${input.nickname}: ${square}`, user: input.nickname }];
    if (lines.length) effects.push({ kind: 'score', text: t('🎉 KINH! {name} +{points}', { name: input.nickname, points: lines.length * config.kinhPoints }), user: input.nickname });
    return {
      consumed: true,
      state: { ...state, cells, stage: 'show', lines: [...state.lines, ...lines] },
      awards,
      commit: () => {
        tried.add(input.user);
        commitTotals(state, awards)();
      },
      endsAt: ctx.now + config.showSeconds * 1000,
      effects,
      message: lines.length ? t('🎉 KINH! {name} hoàn thành {n} hàng', { name: input.nickname, n: lines.length }) : undefined
    };
  },

  advance(state, config, ctx) {
    if (state.stage === 'call') {
      const target = calledCell(state);
      const cell = state.cells[target] as BingoCell;
      return {
        consumed: false,
        state: { ...state, stage: 'show', cells: state.cells.map((entry, index) => (index === target ? { ...entry, missed: true } : entry)) },
        endsAt: ctx.now + config.showSeconds * 1000,
        message: t('Không ai giành ô {n}: {word} = {meaning}', { n: target + 1, word: termWithReading(cell.word), meaning: cell.word.meaning })
      };
    }
    if (state.stage !== 'show' || state.call + 1 >= state.order.length) return null;
    return {
      consumed: false,
      state: { ...state, call: state.call + 1, stage: 'call', calledAt: ctx.now, tried: new Set() },
      endsAt: ctx.now + config.callSeconds * 1000,
      message: ''
    };
  },

  finish(state) {
    const top = state.totals.top(3);
    const claimed = state.cells.filter((cell) => cell.claimer).length;
    return {
      state: { ...state, stage: 'done' },
      awards: [],
      message: t('🎟️ Hết vé: {claimed}/{total} ô có chủ, {lines} lần Kinh.', { claimed, total: state.cells.length, lines: state.lines.length }),
      effects: [top.length ? podiumEffect(top, t('🎟️ Vua lô tô!')) : { kind: 'lose', text: t('Hết vé') }]
    };
  },

  testActions(state) {
    if (state.stage !== 'call') return [];
    const target = calledCell(state);
    const wrong = ((target + 1) % state.cells.length) + 1;
    return [
      chatTest(t('Số sai: {n}', { n: wrong }), String(wrong), 3),
      chatTest(t('Số đúng: {n}', { n: target + 1 }), String(target + 1), 1)
    ];
  },

  view(state) {
    if (state.stage === 'done') {
      return view({ grid: ticket(state), headline: t('🏁 Tổng kết'), hint: t('{n} lần Kinh', { n: state.lines.length }), rows: rankingRows(state.totals.top(5)) });
    }
    const cell = state.cells[calledCell(state)] as BingoCell;
    return view({
      grid: ticket(state),
      headline: `📣 ${cell.word.term}`,
      hint: [
        cell.word.reading && cell.word.reading !== cell.word.term ? cell.word.reading : '',
        t('Lượt đọc {n}/{total}', { n: state.call + 1, total: state.order.length }),
        state.stage === 'call' ? t('Comment số ô có nghĩa đúng') : cell.claimer ? t('✅ {name} giành ô {n}', { name: cell.claimer, n: calledCell(state) + 1 }) : t('Đáp án: ô {n}', { n: calledCell(state) + 1 })
      ].filter(Boolean).join(' • '),
      rows: rankingRows(state.totals.top(3))
    });
  }
};
