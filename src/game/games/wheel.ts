import type { PointAward } from '../engine';
import { giftTest, view, type GameDefinition, type GameContext } from '../types';

export interface WheelSpin {
  id: number;
  target: number;
  user: string;
  nickname: string;
  endsAt: number;
}

export interface WheelRound {
  segments: string[];
  queue: { user: string; nickname: string }[];
  spin: WheelSpin | null;
  /** Segment the wheel currently points at (kept after the spin ends). */
  landed: number | null;
  /** Earliest time the next queued spin may start (pause to read the result). */
  restUntil: number;
  spinCount: number;
  results: { nickname: string; challenge: string }[];
  spinners: Record<string, { nickname: string; spins: number }>;
}

type WheelConfig = { giftName: string; spinSeconds: number; challenges: string };

const MAX_QUEUE = 20;
const REST_MS = 3000;

export const DEFAULT_CHALLENGES = [
  'Hát 1 câu bài bất kỳ',
  'Hít đất 10 cái',
  'Nhảy 15 giây',
  'Kể 1 chuyện cười',
  'Nói giọng miền khác 1 phút',
  'Làm mặt xấu 5 giây',
  'Đọc to tên người tặng',
  'Uống 1 ngụm nước chanh'
].join('\n');

export function parseChallenges(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim().slice(0, 40)).filter(Boolean).slice(0, 12);
}

function startNextSpin(state: WheelRound, config: WheelConfig, ctx: GameContext): WheelRound {
  if (state.spin || !state.queue.length || ctx.now < state.restUntil) return state;
  const [next, ...queue] = state.queue;
  if (!next) return state;
  const target = Math.floor(ctx.random() * state.segments.length);
  return {
    ...state,
    queue,
    landed: target,
    spinCount: state.spinCount + 1,
    spin: {
      id: state.spinCount + 1,
      target,
      user: next.user,
      nickname: next.nickname,
      endsAt: ctx.now + config.spinSeconds * 1000
    }
  };
}

export const wheelGame: GameDefinition<WheelRound, WheelConfig> = {
  id: 'wheel',
  title: 'Vòng quay thử thách 🎡',
  category: 'fun',
  howTo: 'Mỗi gift (hoặc gift chỉ định) quay 1 lần; ô trúng là thử thách cho streamer. Chạy đến khi bấm Chốt. Người quay +1 điểm mỗi lượt.',
  defaultConfig: { giftName: '', spinSeconds: 5, challenges: DEFAULT_CHALLENGES },
  settings: [
    { key: 'giftName', label: 'Gift để quay', type: 'text', maxLength: 40, hint: 'Để trống = gift nào cũng quay.' },
    { key: 'spinSeconds', label: 'Giây mỗi lượt quay', type: 'number', min: 2, max: 15 },
    { key: 'challenges', label: 'Các ô thử thách', type: 'textarea', maxLength: 2000, hint: 'Mỗi dòng một ô, 2–12 ô.' }
  ],

  start(config) {
    const segments = parseChallenges(config.challenges);
    if (segments.length < 2) return { error: 'Vòng quay cần ít nhất 2 ô thử thách.' };
    return {
      state: { segments, queue: [], spin: null, landed: null, restUntil: 0, spinCount: 0, results: [], spinners: {} },
      durationMs: null
    };
  },

  handle(state, input, config, ctx) {
    if (input.kind !== 'gift') return null;
    if (config.giftName && input.giftName.trim().toLowerCase() !== config.giftName.trim().toLowerCase()) return null;
    const room = MAX_QUEUE - state.queue.length;
    const spins = Math.min(room, Math.max(1, input.count));
    if (spins <= 0) return { state, consumed: false };

    const queued = { ...state, queue: [...state.queue, ...Array.from({ length: spins }, () => ({ user: input.user, nickname: input.nickname }))] };
    const next = startNextSpin(queued, config, ctx);
    return { state: next, consumed: false, message: next.spin && next.spin !== state.spin ? `🎡 ${input.nickname} đang quay…` : undefined };
  },

  tick(state, config, ctx) {
    if (state.spin && ctx.now >= state.spin.endsAt) {
      const { spin } = state;
      const challenge = state.segments[spin.target] ?? '';
      const old = state.spinners[spin.user];
      return {
        consumed: false,
        message: `🎯 ${spin.nickname}: ${challenge}`,
        state: {
          ...state,
          spin: null,
          restUntil: ctx.now + REST_MS,
          results: [...state.results, { nickname: spin.nickname, challenge }].slice(-3),
          spinners: { ...state.spinners, [spin.user]: { nickname: spin.nickname, spins: (old?.spins ?? 0) + 1 } }
        }
      };
    }
    const next = startNextSpin(state, config, ctx);
    return next === state ? null : { state: next, consumed: false, message: `🎡 ${next.spin?.nickname ?? ''} đang quay…` };
  },

  finish(state) {
    const awards: PointAward[] = Object.entries(state.spinners).map(([user, entry]) => ({
      user,
      nickname: entry.nickname,
      points: entry.spins
    }));
    return { state: { ...state, queue: [] }, awards, message: `Đã quay ${state.spinCount} lần.` };
  },

  testActions(_state, config) {
    return [giftTest(config.giftName || 'Rose', 1), giftTest(config.giftName || 'Rose', 3, 0.2)];
  },

  view(state, config) {
    return view({
      hint: `Tặng ${config.giftName || 'gift bất kỳ'} để quay${state.queue.length ? ` • Hàng chờ: ${state.queue.length}` : ''}`,
      wheel: {
        segments: state.segments,
        spinId: state.spinCount,
        target: state.landed,
        spinning: Boolean(state.spin),
        durationMs: config.spinSeconds * 1000
      },
      rows: [...state.results].reverse().map((result) => ({ label: result.challenge, value: result.nickname }))
    });
  }
};
