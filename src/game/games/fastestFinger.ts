import { t } from '../../shared/i18n';
import { checkBankLines } from '../bankFile';
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
  accent: '#eab308',
  howTo: 'Màn hình hiện một từ. Ai comment đúng từ đó (đúng dấu) đầu tiên thì thắng.',
  commands: [{ usage: 'từ trên màn hình', description: 'Gõ đúng từ đang hiện, nhanh nhất thắng' }],
  aliases: ['nhanhtay', 'fast'],
  defaultConfig: { seconds: 20, points: 3, words: '' },
  checkBank(key, text) {
    return key === 'words' ? checkBankLines(text, (line) => normalizeText(line) !== '') : null;
  },
  settings: [
    { key: 'seconds', label: 'Thời gian (giây)', type: 'number', min: 5, max: 120 },
    { key: 'points', label: 'Điểm người thắng', type: 'number', min: 1, max: 100 },
    {
      key: 'words',
      label: 'Danh sách từ',
      type: 'textarea',
      maxLength: 200_000,
      hint: 'Mỗi dòng một từ/cụm từ. Để trống = dùng từ có sẵn. Nhập được file .txt / .csv.',
      sample: ['# Mẫu Ai nhanh tay — mỗi dòng 1 từ hoặc cụm từ, viewer gõ đúng y hệt để thắng.', '# Dòng bắt đầu bằng # là ghi chú, app bỏ qua. Lưu file dạng UTF-8.', 'con mèo', 'bánh mì', 'hello world'].join('\n')
    }
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
      ? { state, message: t('⚡ {name} nhanh tay nhất!', { name: state.winner.nickname }), awards: [{ ...state.winner, points: config.points }] }
      : { state, message: t('Hết giờ, không ai gõ đúng.'), awards: [] };
  },

  testActions(state) {
    return [chatTest(t('Gõ sai'), 'sai rồi', 4), chatTest(t('Gõ đúng: {word}', { word: state.target }), state.target, 0.3)];
  },

  view(state) {
    return view({
      headline: state.target,
      style: { headline: 'tiles' },
      hint: t('Gõ chính xác từ này nhanh nhất!'),
      rows: state.winner ? [{ badge: '⚡', label: state.winner.nickname, avatar: state.winner.nickname, value: t('Thắng'), highlight: true }] : []
    });
  }
};
