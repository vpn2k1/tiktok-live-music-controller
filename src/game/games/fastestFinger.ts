import { chatTest, view, type GameDefinition } from '../types';
import { normalizeText } from '../words';

export interface FastestRound {
  target: string;
  winner: { user: string; nickname: string } | null;
}

type FastestConfig = { seconds: number; points: number; words: string };

function wordPool(config: FastestConfig, fallback: Iterable<string>): string[] {
  const custom = config.words.split(/\r?\n/).map(normalizeText).filter(Boolean);
  return custom.length ? custom : [...fallback];
}

export const fastestFingerGame: GameDefinition<FastestRound, FastestConfig> = {
  id: 'fastestFinger',
  title: 'Ai nhanh tay ⚡',
  category: 'fun',
  howTo: 'Màn hình hiện một từ. Ai comment đúng từ đó (đúng dấu) đầu tiên thì thắng.',
  defaultConfig: { seconds: 20, points: 3, words: '' },
  settings: [
    { key: 'seconds', label: 'Thời gian (giây)', type: 'number', min: 5, max: 120 },
    { key: 'points', label: 'Điểm người thắng', type: 'number', min: 1, max: 100 },
    { key: 'words', label: 'Danh sách từ', type: 'textarea', maxLength: 5000, hint: 'Mỗi dòng một từ. Để trống = dùng từ có sẵn.' }
  ],

  start(config, ctx) {
    const pool = wordPool(config, ctx.dictionary.words);
    const previous = ctx.previous?.target;
    const choices = pool.length > 1 ? pool.filter((word) => word !== previous) : pool;
    const target = choices[Math.floor(ctx.random() * choices.length)] ?? 'âm nhạc';
    return { state: { target, winner: null }, durationMs: config.seconds * 1000 };
  },

  handle(state, input) {
    if (input.kind !== 'chat' || state.winner) return null;
    if (normalizeText(input.text) !== state.target) return null;
    return { consumed: true, finish: true, state: { ...state, winner: { user: input.user, nickname: input.nickname } } };
  },

  finish(state, config) {
    return state.winner
      ? { state, message: `⚡ ${state.winner.nickname} nhanh tay nhất!`, awards: [{ ...state.winner, points: config.points }] }
      : { state, message: 'Hết giờ, không ai gõ đúng.', awards: [] };
  },

  testActions(state) {
    return [chatTest('Gõ sai', 'sai rồi', 4), chatTest(`Gõ đúng: ${state.target}`, state.target, 0.3)];
  },

  view(state) {
    return view({
      headline: state.target,
      hint: 'Gõ chính xác từ này nhanh nhất!',
      rows: state.winner ? [{ badge: '⚡', label: state.winner.nickname, value: 'Thắng', highlight: true }] : []
    });
  }
};
