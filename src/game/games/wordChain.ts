import { t } from '../../shared/i18n';
import type { PointAward } from '../engine';
import { chatTest, view, type GameDefinition } from '../types';
import { twoSyllables, type WordDictionary } from '../words';

export interface ChainEntry {
  word: string;
  user: string | null;
  nickname: string;
}

export interface WordChainRound {
  current: string;
  chain: ChainEntry[];
  used: string[];
  words: Record<string, { nickname: string; count: number }>;
}

type WordChainConfig = { turnSeconds: number; mode: string };

const HISTORY = 20;

function lastSyllable(word: string): string {
  return word.split(' ')[1] ?? '';
}

/** Starting word whose last syllable begins at least one other known word. */
export function pickStartWord(dictionary: WordDictionary, random: () => number): string {
  const all = [...dictionary.words];
  const firstSyllables = new Set(all.map((word) => word.split(' ')[0]));
  const chainable = all.filter((word) => firstSyllables.has(lastSyllable(word)));
  const pool = chainable.length ? chainable : all;
  return pool[Math.floor(random() * pool.length)] ?? 'âm nhạc';
}

export const wordChainGame: GameDefinition<WordChainRound, WordChainConfig> = {
  id: 'wordChain',
  title: 'Nối chữ 🔤',
  category: 'fun',
  accent: '#22c55e',
  howTo: 'Comment từ 2 âm tiết bắt đầu bằng chữ cuối của từ trước (đúng dấu). Không lặp từ. Mỗi từ nối được +1 điểm. Hết lượt không ai nối thì kết thúc.',
  commands: [{ usage: 'nhạc sĩ', description: 'Từ 2 âm tiết bắt đầu bằng chữ cuối của từ trước' }],
  aliases: ['noichu'],
  defaultConfig: { turnSeconds: 30, mode: 'syllable' },
  settings: [
    { key: 'turnSeconds', label: 'Giây mỗi lượt', type: 'number', min: 10, max: 120 },
    {
      key: 'mode',
      label: 'Kiểm tra từ',
      type: 'select',
      options: [
        { value: 'syllable', label: 'Âm tiết tiếng Việt hợp lệ' },
        { value: 'dictionary', label: 'Chỉ từ có trong từ điển' }
      ],
      hint: 'Chế độ từ điển nên dùng khi đã nhập file từ điển lớn.'
    }
  ],

  start(config, ctx) {
    const current = pickStartWord(ctx.dictionary, ctx.random);
    return {
      state: { current, chain: [{ word: current, user: null, nickname: 'Bắt đầu' }], used: [current], words: {} },
      durationMs: config.turnSeconds * 1000
    };
  },

  handle(state, input, config, ctx) {
    if (input.kind !== 'chat') return null;
    const syllables = twoSyllables(input.text);
    if (!syllables) return null;

    const word = syllables.join(' ');
    // Only accepted words count as commands: ordinary 2-word chat must not use up
    // the viewer's cooldown right before a real answer.
    if (syllables[0] !== lastSyllable(state.current)) return null;
    if (state.used.includes(word)) {
      return { state, consumed: false, message: t('“{word}” đã dùng rồi!', { word }) };
    }
    if (config.mode === 'dictionary' && !ctx.dictionary.words.has(word)) {
      return { state, consumed: false, message: t('“{word}” không có trong từ điển.', { word }) };
    }

    const old = state.words[input.user];
    return {
      consumed: true,
      message: t('{name} nối “{word}”', { name: input.nickname, word }),
      endsAt: ctx.now + config.turnSeconds * 1000,
      effects: [{ kind: 'correct', text: word, user: input.nickname }],
      state: {
        current: word,
        chain: [...state.chain, { word, user: input.user, nickname: input.nickname }].slice(-HISTORY),
        used: [...state.used, word],
        words: { ...state.words, [input.user]: { nickname: input.nickname, count: (old?.count ?? 0) + 1 } }
      }
    };
  },

  finish(state) {
    const length = state.used.length - 1;
    const awards: PointAward[] = Object.entries(state.words).map(([user, entry]) => ({
      user,
      nickname: entry.nickname,
      points: entry.count
    }));
    return {
      state,
      awards,
      message: length > 0
        ? t('Hết lượt! Chuỗi dài {n} từ, không ai nối được “{word}”.', { n: length, word: state.current })
        : t('Không ai nối được “{word}”.', { word: state.current })
    };
  },

  testActions(state, _config, ctx) {
    const start = lastSyllable(state.current);
    const next = [...ctx.dictionary.words].find((word) => word.split(' ')[0] === start && !state.used.includes(word));
    const repeat = state.used.find((word) => word.split(' ')[0] === start);
    return [
      ...(next ? [chatTest(t('Nối đúng: {word}', { word: next }), next)] : []),
      chatTest(t('Nối sai chữ'), 'xin chào', 2),
      ...(repeat ? [chatTest(t('Từ đã dùng: {word}', { word: repeat }), repeat, 0.5)] : [])
    ];
  },

  view(state) {
    return view({
      headline: state.current,
      hint: t('Nối từ bắt đầu bằng “{syllable}”', { syllable: lastSyllable(state.current) }),
      rows: state.chain.slice(-5, -1).reverse().map((entry) => ({ label: entry.word, value: entry.user ? entry.nickname : t(entry.nickname), avatar: entry.user ? entry.nickname : undefined }))
    });
  }
};
