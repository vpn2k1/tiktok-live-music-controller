import { t } from '../../shared/i18n';
import type { PointAward } from '../engine';
import { isEnglishAttempt, looksLikeEnglishWord, normalizeEnglish, type EnglishDictionary } from '../english';
import { chatTest, view, type GameDefinition } from '../types';

export interface EnglishChainRound {
  current: string;
  chain: { word: string; nickname: string }[];
  used: string[];
  words: Record<string, { nickname: string; count: number }>;
}

type EnglishChainConfig = { turnSeconds: number; minLength: number; mode: string };

const HISTORY = 20;

function lastLetter(word: string): string {
  return word.slice(-1);
}

export function pickEnglishStart(dictionary: EnglishDictionary, random: () => number): string {
  const all = [...dictionary.words].filter((word) => word.length >= 3);
  const firstLetters = new Set(all.map((word) => word[0]));
  const pool = all.filter((word) => firstLetters.has(lastLetter(word)));
  return pool[Math.floor(random() * pool.length)] ?? 'apple';
}

export const englishWordChainGame: GameDefinition<EnglishChainRound, EnglishChainConfig> = {
  id: 'englishWordChain',
  title: 'Word Chain (EN) 🔗',
  category: 'english',
  accent: '#22d3ee',
  howTo: 'Comment một từ tiếng Anh bắt đầu bằng chữ cái cuối của từ trước (apple → egg → giraffe). Không lặp từ. Mỗi từ +1, hết lượt không ai nối thì kết thúc.',
  commands: [{ usage: 'egg', description: 'Từ bắt đầu bằng chữ cái cuối của từ trước' }],
  aliases: ['chain', 'enchain'],
  defaultConfig: { turnSeconds: 30, minLength: 3, mode: 'letters' },
  settings: [
    { key: 'turnSeconds', label: 'Giây mỗi lượt', type: 'number', min: 10, max: 120 },
    { key: 'minLength', label: 'Số chữ cái tối thiểu', type: 'number', min: 2, max: 10 },
    {
      key: 'mode',
      label: 'Kiểm tra từ',
      type: 'select',
      options: [
        { value: 'letters', label: 'Từ trông hợp lệ (có nguyên âm)' },
        { value: 'dictionary', label: 'Chỉ từ có trong từ điển' }
      ],
      hint: 'Chế độ từ điển nên dùng khi đã nhập file từ điển tiếng Anh.'
    }
  ],

  start(config, ctx) {
    const current = pickEnglishStart(ctx.englishDictionary, ctx.random);
    return {
      state: { current, chain: [{ word: current, nickname: 'Start' }], used: [current], words: {} },
      durationMs: config.turnSeconds * 1000
    };
  },

  handle(state, input, config, ctx) {
    if (input.kind !== 'chat' || !isEnglishAttempt(input.text)) return null;
    const word = normalizeEnglish(input.text);
    if (word.includes(' ')) return null;

    // Only accepted words are commands; ordinary chat must not use up the cooldown.
    if (word[0] !== lastLetter(state.current)) return null;
    if (state.used.includes(word)) return { state, consumed: false, message: t('“{word}” đã dùng rồi!', { word }) };
    const valid = config.mode === 'dictionary' ? ctx.englishDictionary.words.has(word) && word.length >= config.minLength : looksLikeEnglishWord(word, config.minLength);
    if (!valid) return { state, consumed: false, message: t('“{word}” không hợp lệ.', { word }) };

    const old = state.words[input.user];
    return {
      consumed: true,
      message: `${input.nickname}: ${state.current} → ${word}`,
      endsAt: ctx.now + config.turnSeconds * 1000,
      effects: [{ kind: 'correct', text: word, user: input.nickname }],
      state: {
        current: word,
        chain: [...state.chain, { word, nickname: input.nickname }].slice(-HISTORY),
        used: [...state.used, word],
        words: { ...state.words, [input.user]: { nickname: input.nickname, count: (old?.count ?? 0) + 1 } }
      }
    };
  },

  finish(state) {
    const awards: PointAward[] = Object.entries(state.words).map(([user, entry]) => ({ user, nickname: entry.nickname, points: entry.count }));
    const length = state.used.length - 1;
    return {
      state,
      awards,
      message: length > 0
        ? t('Time\'s up! Chuỗi {n} từ, dừng ở “{word}”.', { n: length, word: state.current })
        : t('Chưa ai nối được “{word}”.', { word: state.current })
    };
  },

  testActions(state, config, ctx) {
    const next = [...ctx.englishDictionary.words].find((word) => word[0] === lastLetter(state.current) && word.length >= config.minLength && !state.used.includes(word));
    const repeat = state.used.find((word) => word[0] === lastLetter(state.current));
    return [
      ...(next ? [chatTest(t('Nối đúng: {word}', { word: next }), next, 3)] : []),
      chatTest(t('Sai chữ đầu'), 'zebra', 1),
      ...(repeat ? [chatTest(t('Từ đã dùng: {word}', { word: repeat }), repeat, 0.5)] : [])
    ];
  },

  view(state) {
    return view({
      headline: state.current.toUpperCase(),
      hint: `Next word starts with “${lastLetter(state.current).toUpperCase()}”`,
      rows: state.chain.slice(-5, -1).reverse().map((entry) => ({ label: entry.word, value: entry.nickname, avatar: entry.nickname === 'Start' ? undefined : entry.nickname }))
    });
  }
};
