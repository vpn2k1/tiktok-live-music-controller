import { numberLocale, t } from '../../shared/i18n';
import type { PointAward } from '../engine';
import { commitTotals, nextQuestion, rankingRows, seriesFinish, speedPoints, startSeries, type SeriesState } from '../series';
import { foldText } from '../text';
import { chatTest, percentOf, view, type GameDefinition } from '../types';

/**
 * Kéo Búa Bao vs the house: each round viewers pick búa / bao / kéo, then the
 * house reveals its hand. Winners score (faster = more), a draw scores a bit.
 */
export const HANDS = [
  { icon: '✊', name: 'Búa', words: ['bua', 'rock', 'r', '1', 'dam'] },
  { icon: '✋', name: 'Bao', words: ['bao', 'paper', 'p', '2', 'la'] },
  { icon: '✌️', name: 'Kéo', words: ['keo', 'scissors', 's', '3'] }
];

/** Hand shown to viewers (icon + name in the app language). */
function handText(index: number | null): string {
  const hand = index == null ? undefined : HANDS[index];
  return hand ? `${hand.icon} ${t(hand.name)}` : '';
}

function formatCount(value: number): string {
  return value.toLocaleString(numberLocale());
}

export function parseHand(text: string): number {
  const trimmed = text.trim();
  const emoji = HANDS.findIndex((hand) => trimmed.startsWith(hand.icon.replace('️', '')));
  if (emoji >= 0) return emoji;
  const word = foldText(trimmed);
  return HANDS.findIndex((hand) => hand.words.includes(word));
}

/** 1 = `mine` beats `theirs`, 0 = draw, -1 = loses (búa > kéo > bao > búa). */
export function duel(mine: number, theirs: number): number {
  if (mine === theirs) return 0;
  return (mine - theirs + 3) % 3 === 1 ? 1 : -1;
}

export type RpsRound = SeriesState<number> & {
  /** The house's hand for the round being revealed. */
  house: number | null;
  last: SeriesState<number>['last'] & { draws?: number } | null;
};

type RpsConfig = { count: number; seconds: number; reveal: number; maxPoints: number; drawPoints: number };

export const rockPaperScissorsGame: GameDefinition<RpsRound, RpsConfig> = {
  id: 'keoBuaBao',
  title: 'Kéo Búa Bao ✊',
  category: 'fun',
  accent: '#f97316',
  aliases: ['keobuabao', 'rps', 'oantuti'],
  howTo: 'Mỗi hiệp comment búa, bao hoặc kéo (hoặc ✊ ✋ ✌️, 1/2/3). Hết giờ máy ra tay: thắng máy được điểm (càng nhanh càng nhiều), hòa được ít điểm.',
  commands: [
    { usage: 'búa / bao / kéo', description: 'Hoặc ✊ ✋ ✌️, 1 / 2 / 3, rock / paper / scissors' }
  ],
  defaultConfig: { count: 5, seconds: 10, reveal: 4, maxPoints: 100, drawPoints: 20 },
  settings: [
    { key: 'count', label: 'Số hiệp mỗi lượt', type: 'number', min: 1, max: 50 },
    { key: 'seconds', label: 'Giây mỗi hiệp', type: 'number', min: 5, max: 120 },
    { key: 'reveal', label: 'Giây xem kết quả', type: 'number', min: 2, max: 20 },
    { key: 'maxPoints', label: 'Điểm thắng tối đa', type: 'number', min: 10, max: 10_000 },
    { key: 'drawPoints', label: 'Điểm hòa', type: 'number', min: 0, max: 10_000 }
  ],

  start(config, ctx) {
    const rounds = Array.from({ length: config.count }, (_, index) => index);
    return { state: { ...startSeries(rounds, [], ctx.now, HANDS.length), house: null }, durationMs: config.seconds * 1000 };
  },

  handle(state, input, _config, ctx) {
    if (input.kind !== 'chat' || state.stage !== 'ask') return null;
    const hand = parseHand(input.text);
    if (hand < 0) return null;
    if (state.book.has(input.user)) return { state, consumed: true };
    const answer = { user: input.user, nickname: input.nickname, ms: ctx.now - state.askedAt, correct: false, choice: hand };
    return { consumed: true, state: { ...state }, commit: () => state.book.add(answer) };
  },

  advance(state, config, ctx) {
    if (state.stage === 'ask') {
      const house = Math.min(HANDS.length - 1, Math.floor(ctx.random() * HANDS.length));
      const awards: PointAward[] = [];
      let wins = 0;
      let draws = 0;
      const fastest: { nickname: string; ms: number; points: number }[] = [];
      for (const answer of state.book.answers()) {
        const outcome = duel(answer.choice ?? 0, house);
        if (outcome > 0) {
          wins += 1;
          const points = speedPoints(config.maxPoints, answer.ms, config.seconds * 1000);
          awards.push({ user: answer.user, nickname: answer.nickname, points });
          if (fastest.length < 5) fastest.push({ nickname: answer.nickname, ms: answer.ms, points });
        } else if (outcome === 0) {
          draws += 1;
          if (config.drawPoints > 0) awards.push({ user: answer.user, nickname: answer.nickname, points: config.drawPoints });
        }
      }
      return {
        consumed: false,
        state: { ...state, stage: 'reveal', house, last: { correct: wins, total: state.book.total, fastest, draws } },
        awards,
        commit: commitTotals(state, awards),
        endsAt: ctx.now + config.reveal * 1000,
        message: t('Máy ra {hand}! 🏆 {wins} thắng • 🤝 {draws} hòa • {losses} thua', { hand: handText(house), wins, draws, losses: state.book.total - wins - draws }),
        effects: [{ kind: 'start', text: handText(house) }]
      };
    }
    if (state.stage !== 'reveal') return null;
    const next = nextQuestion(state, ctx.now, HANDS.length);
    return next ? { consumed: false, state: { ...next, house: null }, endsAt: ctx.now + config.seconds * 1000, message: '' } : null;
  },

  finish(state) {
    return seriesFinish(state, [], state.stage === 'ask' ? t('Dừng giữa hiệp. ') : '');
  },

  testActions(state) {
    if (state.stage !== 'ask') return [];
    return [chatTest(handText(0), 'búa'), chatTest(handText(1), 'bao'), chatTest(handText(2), 'kéo')];
  },

  view(state) {
    if (state.stage === 'done') {
      return view({
        headline: t('🏁 Tổng kết'),
        hint: t('{rounds} hiệp • {players} người có điểm', { rounds: state.index + 1, players: formatCount(state.totals.size) }),
        rows: rankingRows(state.totals.top(5))
      });
    }
    const revealed = state.stage === 'reveal' && state.house != null;
    const { counts, total } = state.book;
    return view({
      style: { rows: 'quiz' },
      headline: revealed
        ? t('Máy ra {hand}!', { hand: handText(state.house) })
        : t('Hiệp {n}/{total}: ✊ ✋ ✌️', { n: state.index + 1, total: state.items.length }),
      hint: revealed
        ? t('🏆 {wins} thắng • 🤝 {draws} hòa', { wins: state.last?.correct ?? 0, draws: state.last?.draws ?? 0 }) + (state.last?.fastest[0] ? ` • ⚡ ${state.last.fastest[0].nickname}` : '')
        : t('Comment búa / bao / kéo • {n} người đã ra tay', { n: formatCount(total) }),
      rows: HANDS.map((hand, index) => ({
        badge: hand.icon,
        label: t(hand.name),
        value: revealed ? String(counts[index] ?? 0) : undefined,
        percent: revealed ? percentOf(counts[index] ?? 0, total) : undefined,
        // The hand that beats the house lights up.
        highlight: revealed && duel(index, state.house as number) > 0
      }))
    });
  }
};
