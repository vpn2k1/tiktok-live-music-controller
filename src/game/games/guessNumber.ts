import { chatTest, commandArgument, view, type GameDefinition } from '../types';

export interface GuessRound {
  max: number;
  secret: number;
  low: number;
  high: number;
  guesses: { nickname: string; value: number; hint: 'up' | 'down' | 'hit' }[];
  winner: { user: string; nickname: string } | null;
}

type GuessConfig = { max: number; seconds: number; points: number };

export const guessNumberGame: GameDefinition<GuessRound, GuessConfig> = {
  id: 'guessNumber',
  title: 'Đoán số 🔢',
  category: 'fun',
  accent: '#3b82f6',
  howTo: 'Comment một số. Màn hình báo cao hơn / thấp hơn và thu hẹp khoảng. Ai đoán trúng trước được điểm.',
  commands: [
    { usage: '42', description: 'Đoán một số' },
    { usage: '!guess 42', description: 'Cách viết khác' }
  ],
  aliases: ['doanso', 'guess'],
  defaultConfig: { max: 100, seconds: 120, points: 5 },
  settings: [
    { key: 'max', label: 'Số lớn nhất', type: 'number', min: 10, max: 10_000 },
    { key: 'seconds', label: 'Thời gian (giây)', type: 'number', min: 10, max: 600 },
    { key: 'points', label: 'Điểm khi trúng', type: 'number', min: 1, max: 100 }
  ],

  start(config, ctx) {
    const secret = 1 + Math.floor(ctx.random() * config.max);
    return {
      state: { max: config.max, secret, low: 1, high: config.max, guesses: [], winner: null },
      durationMs: config.seconds * 1000
    };
  },

  handle(state, input) {
    if (input.kind !== 'chat') return null;
    const text = commandArgument(input.text, ['guess', 'doan']);
    if (text === null || !/^\d{1,6}$/.test(text)) return null;

    const value = Number(text);
    if (state.winner || value < state.low || value > state.high) return { state, consumed: true };

    const hint = value === state.secret ? 'hit' : value < state.secret ? 'up' : 'down';
    const guesses = [...state.guesses, { nickname: input.nickname, value, hint } as const].slice(-4);
    if (hint === 'hit') {
      return {
        consumed: true,
        finish: true,
        state: { ...state, guesses, low: value, high: value, winner: { user: input.user, nickname: input.nickname } }
      };
    }
    return {
      consumed: true,
      message: `${input.nickname} đoán ${value} → ${hint === 'up' ? 'cao hơn ⬆' : 'thấp hơn ⬇'}`,
      effects: [{ kind: 'score', text: `${value} ${hint === 'up' ? '⬆' : '⬇'}`, user: input.nickname }],
      state: {
        ...state,
        guesses,
        low: hint === 'up' ? value + 1 : state.low,
        high: hint === 'down' ? value - 1 : state.high
      }
    };
  },

  finish(state, config) {
    if (state.winner) {
      return {
        state,
        message: `🎉 ${state.winner.nickname} đoán trúng số ${state.secret}!`,
        awards: [{ ...state.winner, points: config.points }]
      };
    }
    return { state, message: `Hết giờ! Số bí mật là ${state.secret}.`, awards: [] };
  },

  testActions(state) {
    const middle = Math.floor((state.low + state.high) / 2);
    return [
      chatTest(`Đoán ${middle}`, String(middle), 3),
      chatTest(`Đoán ${state.low}`, String(state.low)),
      chatTest('Đoán trúng', String(state.secret), 0.2)
    ];
  },

  view(state) {
    return view({
      headline: state.winner ? String(state.secret) : `${state.low} – ${state.high}`,
      hint: `Đoán số bí mật từ 1 đến ${state.max}`,
      rows: [...state.guesses].reverse().map((guess) => ({
        label: `${guess.nickname}: ${guess.value}`,
        avatar: guess.nickname,
        value: guess.hint === 'hit' ? '🎯 Trúng' : guess.hint === 'up' ? '⬆ Cao hơn' : '⬇ Thấp hơn',
        highlight: guess.hint === 'hit'
      }))
    });
  }
};
