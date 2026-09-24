import { checkBankLines } from '../bankFile';
import { ESTIMATE_BANK } from '../content/vietnamese';
import type { PointAward } from '../engine';
import { commitTotals, current, nextQuestion, pickSet, progressLabel, rankingRows, seriesFinish, startSeries, type SeriesState } from '../series';
import { chatTest, view, type GameDefinition } from '../types';
import { numberLocale, t } from '../../shared/i18n';

/**
 * "Ước lượng": every question has a number for an answer; each viewer guesses
 * once, the closest guesses win (ties go to the faster guess).
 */
export interface EstimateQuestion {
  question: string;
  answer: number;
  unit: string;
}

export type EstimateRound = SeriesState<EstimateQuestion> & {
  /** Closest guesses of the question being revealed. */
  closest: { nickname: string; guess: number; points: number; ms: number }[];
};

type EstimateConfig = { count: number; seconds: number; reveal: number; maxPoints: number; order: string; bank: string };

/** Share of maxPoints for the 1st, 2nd, 3rd closest (an exact guess gets a 50% bonus). */
const PLACES = [1, 0.6, 0.3];
const MAX_GUESS = 1e12;

export function parseEstimates(text: string): EstimateQuestion[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const [question = '', answer = '', unit = ''] = line.split('|').map((part) => part.trim());
    const value = parseGuess(answer);
    return question && value != null ? [{ question: question.slice(0, 160), answer: value, unit: unit.slice(0, 20) }] : [];
  });
}

/** "1.440", "1,440", "1440", "8 849 m" → number; null when the comment isn't a number. */
export function parseGuess(text: string): number | null {
  const trimmed = text.trim();
  if (!/^-?[\d][\d.,\s]*[a-zA-Z°/%]*$/.test(trimmed) || trimmed.length > 24) return null;
  const digits = trimmed.replace(/[^\d-]/g, '');
  const value = Number(digits);
  return digits && Number.isFinite(value) && Math.abs(value) <= MAX_GUESS ? value : null;
}

function formatNumber(value: number): string {
  return value.toLocaleString(numberLocale());
}

export const estimateGame: GameDefinition<EstimateRound, EstimateConfig> = {
  id: 'uocLuong',
  title: 'Ước lượng 🎯',
  category: 'fun',
  accent: '#ef4444',
  aliases: ['uocluong', 'estimate'],
  howTo: 'Mỗi câu có đáp án là một con số: comment con số bạn đoán (chỉ tính lần đầu). Ba người đoán gần nhất được điểm, đoán trúng y hệt thưởng thêm.',
  commands: [{ usage: '1440', description: 'Gõ một con số (1.440 hay 1,440 đều được)' }],
  defaultConfig: { count: 8, seconds: 20, reveal: 5, maxPoints: 100, order: 'random', bank: ESTIMATE_BANK },
  settings: [
    { key: 'count', label: 'Số câu mỗi lượt', type: 'number', min: 1, max: 100 },
    { key: 'seconds', label: 'Giây mỗi câu', type: 'number', min: 5, max: 120 },
    { key: 'reveal', label: 'Giây xem đáp án', type: 'number', min: 2, max: 20 },
    { key: 'maxPoints', label: 'Điểm người gần nhất', type: 'number', min: 10, max: 10_000, hint: 'Hạng 2 được 60%, hạng 3 được 30%; đoán trúng y hệt +50%.' },
    {
      key: 'order',
      label: 'Thứ tự câu hỏi',
      type: 'select',
      options: [
        { value: 'random', label: 'Ngẫu nhiên (không lặp đến khi hết)' },
        { value: 'file', label: 'Đúng thứ tự trong ngân hàng / file' }
      ]
    },
    {
      key: 'bank',
      label: 'Câu hỏi',
      type: 'textarea',
      maxLength: 500_000,
      hint: 'Mỗi dòng: câu hỏi | đáp án (số) | đơn vị (tuỳ chọn). Nhập được file .txt / .csv.',
      sample: ['# Mẫu Ước lượng — mỗi dòng 1 câu:', '# câu hỏi | đáp án là số | đơn vị (có thể bỏ trống)', '# Dòng bắt đầu bằng # là ghi chú, app bỏ qua.', 'Một ngày có bao nhiêu phút? | 1440 | phút', 'Tháp Eiffel được hoàn thành năm nào? | 1889'].join('\n')
    }
  ],

  checkBank(key, text) {
    return key === 'bank' ? checkBankLines(text, (line) => parseEstimates(line).length === 1) : null;
  },

  start(config, ctx) {
    const bank = parseEstimates(config.bank);
    if (!bank.length) return { error: t('Chưa có câu hỏi hợp lệ.') };
    const { indices, asked } = pickSet(bank.length, config.count, ctx.previous?.asked ?? [], ctx.random, config.order);
    return { state: { ...startSeries(indices.map((index) => bank[index] as EstimateQuestion), asked, ctx.now), closest: [] }, durationMs: config.seconds * 1000 };
  },

  handle(state, input, _config, ctx) {
    if (input.kind !== 'chat' || state.stage !== 'ask') return null;
    const guess = parseGuess(input.text);
    if (guess == null) return null;
    if (state.book.has(input.user)) return { state, consumed: true };
    const answer = { user: input.user, nickname: input.nickname, ms: ctx.now - state.askedAt, correct: false, choice: guess };
    return { consumed: true, state: { ...state }, commit: () => state.book.add(answer) };
  },

  advance(state, config, ctx) {
    if (state.stage === 'ask') {
      const question = current(state);
      const ranked = [...state.book.answers()]
        .sort((a, b) => Math.abs((a.choice ?? 0) - question.answer) - Math.abs((b.choice ?? 0) - question.answer) || a.ms - b.ms)
        .slice(0, 5);
      const awards: PointAward[] = [];
      const closest = ranked.map((answer, index) => {
        const exact = answer.choice === question.answer;
        const share = PLACES[index] ?? 0;
        const points = share ? Math.round(config.maxPoints * share * (exact ? 1.5 : 1)) : 0;
        if (points) awards.push({ user: answer.user, nickname: answer.nickname, points });
        return { nickname: answer.nickname, guess: answer.choice ?? 0, points, ms: answer.ms };
      });
      return {
        consumed: false,
        state: { ...state, stage: 'reveal', closest },
        awards,
        commit: commitTotals(state, awards),
        endsAt: ctx.now + config.reveal * 1000,
        message: `${t('🎯 Đáp án: {answer}', { answer: `${formatNumber(question.answer)}${question.unit ? ` ${question.unit}` : ''}` })}${closest[0] ? ` • ${t('gần nhất: {name} ({guess})', { name: closest[0].nickname, guess: formatNumber(closest[0].guess) })}` : ''}`,
        effects: [{ kind: closest[0]?.guess === question.answer ? 'correct' : 'score', text: `🎯 ${formatNumber(question.answer)}` }]
      };
    }
    if (state.stage !== 'reveal') return null;
    const next = nextQuestion(state, ctx.now);
    return next ? { consumed: false, state: { ...next, closest: [] }, endsAt: ctx.now + config.seconds * 1000, message: '' } : null;
  },

  finish(state) {
    return seriesFinish(state, []);
  },

  testActions(state) {
    if (state.stage !== 'ask') return [];
    const { answer } = current(state);
    return [
      chatTest(t('Đoán gần đúng'), String(Math.round(answer * 1.1) + 1)),
      chatTest(t('Đoán trúng: {answer}', { answer }), String(answer), 0.5),
      chatTest(t('Đoán xa'), String(answer * 3 + 7))
    ];
  },

  view(state) {
    if (state.stage === 'done') {
      return view({
        headline: t('🏁 Tổng kết'),
        hint: t('{count} câu • {players} người có điểm', { count: state.index + 1, players: state.totals.size.toLocaleString(numberLocale()) }),
        rows: rankingRows(state.totals.top(5))
      });
    }
    const question = current(state);
    if (state.stage === 'reveal') {
      return view({
        headline: `🎯 ${formatNumber(question.answer)}${question.unit ? ` ${question.unit}` : ''}`,
        hint: question.question,
        rows: state.closest.map((entry, index) => ({
          badge: ['🥇', '🥈', '🥉'][index] ?? String(index + 1),
          label: `${entry.nickname}: ${formatNumber(entry.guess)}`,
          avatar: entry.nickname,
          value: entry.points ? `+${entry.points}` : t('lệch {diff}', { diff: formatNumber(Math.abs(entry.guess - question.answer)) }),
          highlight: index === 0
        }))
      });
    }
    return view({
      headline: question.question,
      hint: `${progressLabel(state)} • ${question.unit ? t('Gõ một con số ({unit})', { unit: question.unit }) : t('Gõ một con số')} • ${t('{total} người đã đoán', { total: state.book.total.toLocaleString(numberLocale()) })}`,
      rows: []
    });
  }
};
