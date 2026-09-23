import { VOCAB_BANK } from '../content/english';
import type { PointAward } from '../engine';
import { aliases, normalizeEnglish } from '../english';
import { chatTest, pickUnasked, ranked, view, type GameDefinition } from '../types';

export interface HangmanRound {
  word: string;
  meaning: string;
  guessed: string[];
  wrong: string[];
  finders: Record<string, { nickname: string; letters: number }>;
  solver: { user: string; nickname: string } | null;
  asked: number[];
}

type HangmanConfig = { seconds: number; maxWrong: number; points: number; bank: string };

export function parseHangmanBank(text: string): { word: string; meaning: string }[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const [english = '', meaning = ''] = line.split('|').map((part) => part.trim());
    const word = aliases(english)[0] ?? '';
    return /^[a-z]{3,16}$/.test(word) ? [{ word, meaning }] : [];
  });
}

export function maskWord(word: string, guessed: string[]): string {
  return word.split('').map((letter) => (guessed.includes(letter) ? letter.toUpperCase() : '_')).join(' ');
}

function solved(state: HangmanRound): boolean {
  return state.word.split('').every((letter) => state.guessed.includes(letter));
}

export const hangmanGame: GameDefinition<HangmanRound, HangmanConfig> = {
  id: 'hangman',
  title: 'Hangman 🪢',
  category: 'english',
  howTo: 'Comment 1 chữ cái để lật từ bí mật, hoặc gõ cả từ nếu đã đoán ra. Chữ cái sai bị trừ lượt. Mỗi chữ đúng +1, đoán ra cả từ +điểm.',
  defaultConfig: { seconds: 120, maxWrong: 6, points: 3, bank: VOCAB_BANK },
  settings: [
    { key: 'seconds', label: 'Thời gian (giây)', type: 'number', min: 20, max: 600 },
    { key: 'maxWrong', label: 'Số lần sai tối đa', type: 'number', min: 3, max: 12 },
    { key: 'points', label: 'Điểm đoán ra từ', type: 'number', min: 1, max: 100 },
    { key: 'bank', label: 'Từ vựng', type: 'textarea', maxLength: 20_000, hint: 'Mỗi dòng: english | nghĩa tiếng Việt (chỉ dùng từ đơn 3–16 chữ cái).' }
  ],

  start(config, ctx) {
    const words = parseHangmanBank(config.bank);
    if (!words.length) return { error: 'Không có từ hợp lệ (từ đơn 3–16 chữ cái).' };
    const { index, asked } = pickUnasked(words.length, ctx.previous?.asked ?? [], ctx.random);
    const entry = words[index] as { word: string; meaning: string };
    return {
      state: { word: entry.word, meaning: entry.meaning, guessed: [], wrong: [], finders: {}, solver: null, asked },
      durationMs: config.seconds * 1000
    };
  },

  handle(state, input, config) {
    if (input.kind !== 'chat' || state.solver || state.wrong.length >= config.maxWrong || solved(state)) return null;
    const text = normalizeEnglish(input.text);

    if (/^[a-z]$/.test(text)) {
      if (state.guessed.includes(text) || state.wrong.includes(text)) return { state, consumed: true };
      const hits = state.word.split('').filter((letter) => letter === text).length;
      if (!hits) {
        const wrong = [...state.wrong, text];
        return {
          consumed: true,
          finish: wrong.length >= config.maxWrong,
          message: `${input.nickname}: “${text.toUpperCase()}” không có ❌`,
          state: { ...state, wrong }
        };
      }
      const old = state.finders[input.user];
      const next: HangmanRound = {
        ...state,
        guessed: [...state.guessed, text],
        finders: { ...state.finders, [input.user]: { nickname: input.nickname, letters: (old?.letters ?? 0) + hits } }
      };
      const done = solved(next);
      return {
        consumed: true,
        finish: done,
        message: `${input.nickname}: “${text.toUpperCase()}” ✅`,
        state: done ? { ...next, solver: { user: input.user, nickname: input.nickname } } : next
      };
    }

    // A whole-word guess of the right length; wrong words cost nothing (trolls can't burn lives).
    if (/^[a-z]+$/.test(text) && text.length === state.word.length) {
      if (text !== state.word) return { state, consumed: true };
      return {
        consumed: true,
        finish: true,
        state: { ...state, guessed: [...new Set([...state.guessed, ...state.word.split('')])], solver: { user: input.user, nickname: input.nickname } }
      };
    }
    return null;
  },

  finish(state, config) {
    const awards: PointAward[] = Object.entries(state.finders).map(([user, entry]) => ({ user, nickname: entry.nickname, points: entry.letters }));
    if (state.solver) awards.push({ ...state.solver, points: config.points });
    const word = state.word.toUpperCase();
    const message = state.solver
      ? `🎉 ${state.solver.nickname} tìm ra “${word}” (${state.meaning})!`
      : `Hết lượt! Từ đúng là “${word}” (${state.meaning}).`;
    return { state: { ...state, guessed: [...new Set([...state.guessed, ...state.word.split('')])] }, awards, message };
  },

  testActions(state) {
    const right = state.word.split('').find((letter) => !state.guessed.includes(letter));
    const wrong = 'zqxjkvwybfgmhucdplsrtoniea'.split('').find((letter) => !state.word.includes(letter) && !state.wrong.includes(letter));
    return [
      ...(right ? [chatTest(`Chữ đúng: ${right.toUpperCase()}`, right, 3)] : []),
      ...(wrong ? [chatTest(`Chữ sai: ${wrong.toUpperCase()}`, wrong, 1)] : []),
      chatTest(`Đoán cả từ: ${state.word}`, state.word, 0.2)
    ];
  },

  view(state, config) {
    const finders = ranked(Object.entries(state.finders).map(([user, entry]) => ({ user, ...entry })), (entry) => entry.letters).slice(0, 3);
    return view({
      headline: maskWord(state.word, state.guessed),
      hint: `Nghĩa: ${state.meaning || '?'} • Sai ${state.wrong.length}/${config.maxWrong}${state.wrong.length ? `: ${state.wrong.join(' ').toUpperCase()}` : ''}`,
      progress: { label: 'Lượt còn lại', value: Math.max(0, config.maxWrong - state.wrong.length), max: config.maxWrong },
      rows: finders.map((entry) => ({ label: entry.nickname, value: `${entry.letters} chữ` }))
    });
  }
};
