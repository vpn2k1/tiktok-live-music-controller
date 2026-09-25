import { checkBankLines } from '../bankFile';
import { MAJORITY_BANK } from '../content/vietnamese';
import type { PointAward } from '../engine';
import { commitTotals, current, nextQuestion, pickSet, progressLabel, rankingRows, seriesFinish, startSeries, type SeriesState } from '../series';
import { foldText } from '../text';
import { chatTest, percentOf, view, type GameDefinition } from '../types';
import { numberLocale, t } from '../../shared/i18n';

/**
 * "Phe nào đông hơn?": pick A or B, but the point is guessing the crowd — the
 * bigger side scores. Counts stay hidden until the reveal.
 */
export interface MajorityPoll {
  question: string;
  options: [string, string];
}

export type MajorityRound = SeriesState<MajorityPoll>;

type MajorityConfig = { count: number; seconds: number; reveal: number; maxPoints: number; tiePoints: number; order: string; bank: string };

export function parsePolls(text: string): MajorityPoll[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const [question = '', a = '', b = ''] = line.split('|').map((part) => part.trim());
    return question && a && b ? [{ question: question.slice(0, 140), options: [a.slice(0, 40), b.slice(0, 40)] as [string, string] }] : [];
  });
}

/** "a", "1", "B" → 0 / 1; -1 otherwise. */
export function sideChoice(text: string): number {
  const word = foldText(text);
  return word === 'a' || word === '1' ? 0 : word === 'b' || word === '2' ? 1 : -1;
}

export const majorityGame: GameDefinition<MajorityRound, MajorityConfig> = {
  id: 'pheDong',
  title: 'Phe nào đông hơn? 🤝',
  category: 'fun',
  accent: '#06b6d4',
  aliases: ['phedong', 'majority'],
  howTo: 'Mỗi câu có 2 lựa chọn: comment a hoặc b. Phe đông người hơn được điểm — đoán xem mọi người chọn gì! Số phiếu ẩn đến khi công bố.',
  commands: [{ usage: 'a / b', description: 'Chọn phe (hoặc 1 / 2), không đổi được' }],
  defaultConfig: { count: 8, seconds: 15, reveal: 5, maxPoints: 100, tiePoints: 50, order: 'random', bank: MAJORITY_BANK },
  settings: [
    { key: 'count', label: 'Số câu mỗi lượt', type: 'number', min: 1, max: 100 },
    { key: 'seconds', label: 'Giây mỗi câu', type: 'number', min: 5, max: 120 },
    { key: 'reveal', label: 'Giây xem kết quả', type: 'number', min: 2, max: 20 },
    { key: 'maxPoints', label: 'Điểm phe đông', type: 'number', min: 10, max: 10_000 },
    { key: 'tiePoints', label: 'Điểm khi hòa', type: 'number', min: 0, max: 10_000 },
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
      hint: 'Mỗi dòng: câu hỏi | lựa chọn A | lựa chọn B. Nhập được file .txt / .csv.',
      sample: ['# Mẫu Phe nào đông hơn — mỗi dòng 1 câu:', '# câu hỏi | lựa chọn A | lựa chọn B', '# Dòng bắt đầu bằng # là ghi chú, app bỏ qua.', 'Nuôi thú cưng nào? | 🐶 Chó | 🐱 Mèo', 'Đi chơi ở đâu? | 🏖️ Biển | ⛰️ Núi'].join('\n')
    }
  ],

  checkBank(key, text) {
    return key === 'bank' ? checkBankLines(text, (line) => parsePolls(line).length === 1) : null;
  },

  start(config, ctx) {
    const bank = parsePolls(config.bank);
    if (!bank.length) return { error: t('Chưa có câu hỏi hợp lệ.') };
    const { indices, asked } = pickSet(bank.length, config.count, ctx.previous?.asked ?? [], ctx.random, config.order);
    return { state: startSeries(indices.map((index) => bank[index] as MajorityPoll), asked, ctx.now, 2), durationMs: config.seconds * 1000 };
  },

  handle(state, input, _config, ctx) {
    if (input.kind !== 'chat' || state.stage !== 'ask') return null;
    const side = sideChoice(input.text);
    if (side < 0) return null;
    if (state.book.has(input.user)) return { state, consumed: true };
    const answer = { user: input.user, nickname: input.nickname, ms: ctx.now - state.askedAt, correct: false, choice: side };
    return { consumed: true, state: { ...state }, commit: () => state.book.add(answer) };
  },

  advance(state, config, ctx) {
    if (state.stage === 'ask') {
      const [a = 0, b = 0] = state.book.counts;
      const winner = a === b ? -1 : a > b ? 0 : 1;
      const awards: PointAward[] = [];
      for (const answer of state.book.answers()) {
        const points = winner < 0 ? config.tiePoints : answer.choice === winner ? config.maxPoints : 0;
        if (points > 0) awards.push({ user: answer.user, nickname: answer.nickname, points });
      }
      const poll = current(state);
      const winnerLabel = winner < 0 ? '' : poll.options[winner === 0 ? 0 : 1];
      return {
        consumed: false,
        state: { ...state, stage: 'reveal', last: { correct: winner < 0 ? a + b : Math.max(a, b), total: a + b, fastest: [] } },
        awards,
        commit: commitTotals(state, awards),
        endsAt: ctx.now + config.reveal * 1000,
        message: winner < 0
          ? t('🤝 Hòa {a} – {b}!', { a, b })
          : t('🏆 Phe {side} thắng {high} – {low}', { side: winnerLabel, high: Math.max(a, b), low: Math.min(a, b) }),
        effects: [{ kind: winner < 0 ? 'score' : 'correct', text: winner < 0 ? t('🤝 Hòa') : `🏆 ${winnerLabel}` }]
      };
    }
    if (state.stage !== 'reveal') return null;
    const next = nextQuestion(state, ctx.now, 2);
    return next ? { consumed: false, state: next, endsAt: ctx.now + config.seconds * 1000, message: '' } : null;
  },

  finish(state) {
    return seriesFinish(state, []);
  },

  testActions(state) {
    return state.stage === 'ask' ? [chatTest(t('Chọn a'), 'a'), chatTest(t('Chọn b'), 'b')] : [];
  },

  view(state) {
    if (state.stage === 'done') {
      return view({
        headline: t('🏁 Tổng kết'),
        hint: t('{count} câu • {players} người có điểm', { count: state.index + 1, players: state.totals.size.toLocaleString(numberLocale()) }),
        rows: rankingRows(state.totals.top(5))
      });
    }
    const poll = current(state);
    const revealed = state.stage === 'reveal';
    const { counts, total } = state.book;
    const [a = 0, b = 0] = counts;
    return view({
      style: { rows: 'quiz' },
      headline: poll.question,
      hint: revealed
        ? `${progressLabel(state)} • ${a === b ? t('Hòa!') : t('Phe đông hơn được điểm')}`
        : `${progressLabel(state)} • ${t('Comment a / b')} • ${t('Đoán phe đông hơn!')} • ${t('{total} người đã chọn', { total: total.toLocaleString(numberLocale()) })}`,
      rows: poll.options.map((option, index) => ({
        badge: index === 0 ? 'A' : 'B',
        label: option,
        value: revealed ? String(counts[index] ?? 0) : undefined,
        percent: revealed ? percentOf(counts[index] ?? 0, total) : undefined,
        highlight: revealed && a !== b && (index === 0 ? a > b : b > a)
      }))
    });
  }
};
