import type { PointAward } from '../engine';
import { giftTest, likeTest, percentOf, ranked, view, type GameDefinition } from '../types';

export interface RaceRound {
  finishLine: number;
  racers: Record<string, { nickname: string; distance: number }>;
  winner: { user: string; nickname: string } | null;
}

type RaceConfig = { seconds: number; finishLine: number; giftBoost: number; icon: string };

const PODIUM_POINTS = [5, 3, 2];
const PARTICIPATION_POINTS = 1;

export const RACE_ICONS = ['🦆', '🏎️', '🐎', '🐢', '🚀'];

export function raceStandings(state: RaceRound) {
  return ranked(Object.entries(state.racers).map(([user, racer]) => ({ user, ...racer })), (racer) => racer.distance);
}

export const raceGame: GameDefinition<RaceRound, RaceConfig> = {
  id: 'race',
  title: 'Đua vịt 🏁',
  category: 'fun',
  howTo: 'Thả tim để có nhân vật và chạy tới trước, gift = tăng tốc. Về đích đầu tiên thắng; hết giờ thì ai xa nhất thắng. Top 3: +5/+3/+2.',
  defaultConfig: { seconds: 120, finishLine: 300, giftBoost: 15, icon: '🦆' },
  settings: [
    { key: 'seconds', label: 'Thời gian (giây)', type: 'number', min: 10, max: 900 },
    { key: 'finishLine', label: 'Độ dài đường đua', type: 'number', min: 20, max: 100_000 },
    { key: 'giftBoost', label: 'Bước chạy mỗi gift', type: 'number', min: 1, max: 10_000 },
    { key: 'icon', label: 'Nhân vật', type: 'select', options: RACE_ICONS.map((icon) => ({ value: icon, label: icon })) }
  ],

  start(config) {
    return { state: { finishLine: config.finishLine, racers: {}, winner: null }, durationMs: config.seconds * 1000 };
  },

  handle(state, input, config) {
    if (input.kind === 'chat' || state.winner) return null;
    const step = Math.max(1, input.count) * (input.kind === 'gift' ? config.giftBoost : 1);
    const old = state.racers[input.user];
    const distance = Math.min(state.finishLine, (old?.distance ?? 0) + step);
    const racers = { ...state.racers, [input.user]: { nickname: input.nickname, distance } };
    const finished = distance >= state.finishLine;
    return {
      consumed: false,
      finish: finished,
      state: { ...state, racers, winner: finished ? { user: input.user, nickname: input.nickname } : null }
    };
  },

  finish(state) {
    const standings = raceStandings(state);
    const awards: PointAward[] = standings.map((racer, index) => ({
      user: racer.user,
      nickname: racer.nickname,
      points: PODIUM_POINTS[index] ?? PARTICIPATION_POINTS
    }));
    const leader = state.winner ?? standings[0] ?? null;
    return {
      state,
      awards,
      message: leader ? `🏆 ${leader.nickname} ${state.winner ? 'về đích đầu tiên' : 'chạy xa nhất'}!` : 'Không ai tham gia đua.'
    };
  },

  testActions() {
    return [likeTest(5, 3), likeTest(20), giftTest('Rose', 1, 0.5)];
  },

  view(state, config) {
    return view({
      hint: `Thả tim để chạy • Gift = +${config.giftBoost} bước`,
      race: {
        icon: config.icon,
        lanes: raceStandings(state).slice(0, 5).map((racer) => ({
          label: racer.nickname,
          percent: percentOf(racer.distance, state.finishLine)
        }))
      }
    });
  }
};
