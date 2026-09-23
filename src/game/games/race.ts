import type { PointAward } from '../engine';
import { chatTest, commandArgument, giftTest, likeTest, percentOf, ranked, view, type GameDefinition } from '../types';

export interface RaceRound {
  finishLine: number;
  racers: Record<string, { nickname: string; distance: number }>;
  winner: { user: string; nickname: string } | null;
}

type RaceConfig = { seconds: number; finishLine: number; giftBoost: number; chatStep: number; icon: string };

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
  accent: '#06b6d4',
  howTo: 'Thả tim để có nhân vật và chạy tới trước, gift = tăng tốc. Về đích đầu tiên thắng; hết giờ thì ai xa nhất thắng. Top 3: +5/+3/+2.',
  commands: [
    { usage: '!join', description: 'Vào vạch xuất phát' },
    { usage: '!run', description: 'Chạy bằng comment (chống spam áp dụng)' },
    { usage: 'Thả tim / gift', description: 'Chạy / tăng tốc' }
  ],
  aliases: ['duavit', 'duck'],
  defaultConfig: { seconds: 120, finishLine: 300, giftBoost: 15, chatStep: 3, icon: '🦆' },
  settings: [
    { key: 'seconds', label: 'Thời gian (giây)', type: 'number', min: 10, max: 900 },
    { key: 'finishLine', label: 'Độ dài đường đua', type: 'number', min: 20, max: 100_000 },
    { key: 'giftBoost', label: 'Bước chạy mỗi gift', type: 'number', min: 1, max: 10_000 },
    { key: 'chatStep', label: 'Bước chạy mỗi !run', type: 'number', min: 0, max: 1000, hint: '0 = tắt lệnh !run.' },
    { key: 'icon', label: 'Nhân vật', type: 'select', options: RACE_ICONS.map((icon) => ({ value: icon, label: icon })) }
  ],

  start(config) {
    return { state: { finishLine: config.finishLine, racers: {}, winner: null }, durationMs: config.seconds * 1000 };
  },

  handle(state, input, config) {
    if (state.winner) return null;
    const old = state.racers[input.user];
    let step: number;
    if (input.kind === 'chat') {
      if (!input.text.trim().startsWith('!')) return null;
      if (commandArgument(input.text, ['join']) === '') {
        if (old) return { state, consumed: true };
        return {
          consumed: true,
          message: `${input.nickname} vào vạch xuất phát`,
          state: { ...state, racers: { ...state.racers, [input.user]: { nickname: input.nickname, distance: 0 } } }
        };
      }
      if (commandArgument(input.text, ['run', 'chay']) !== '' || config.chatStep <= 0) return null;
      step = config.chatStep;
    } else {
      step = Math.max(1, input.count) * (input.kind === 'gift' ? config.giftBoost : 1);
    }
    const distance = Math.min(state.finishLine, (old?.distance ?? 0) + step);
    const racers = { ...state.racers, [input.user]: { nickname: input.nickname, distance } };
    const finished = distance >= state.finishLine;
    return {
      consumed: input.kind === 'chat',
      finish: finished,
      effects: input.kind === 'gift' ? [{ kind: 'score', text: `🚀 +${step}`, user: input.nickname }] : undefined,
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
    return [chatTest('!join', '!join', 1), chatTest('!run', '!run', 2), likeTest(5, 3), likeTest(20), giftTest('Rose', 1, 0.5)];
  },

  view(state, config) {
    return view({
      hint: `!join để vào • Tim${config.chatStep > 0 ? ' / !run' : ''} để chạy • Gift = +${config.giftBoost} bước`,
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
