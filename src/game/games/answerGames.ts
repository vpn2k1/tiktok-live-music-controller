import { EMOJI_BANK, SENTENCE_BANK, VOCAB_BANK } from '../content/english';
import type { PointAward } from '../engine';
import { aliases, isEnglishAttempt, normalizeEnglish } from '../english';
import { chatTest, pickUnasked, shuffle, view, type GameDefinition } from '../types';

/** One "prompt → answer" item parsed from a bank line. */
export interface AnswerItem {
  prompt: string;
  answers: string[];
  /** Display form of the main answer (original casing). */
  display: string;
  hint: string;
}

export interface AnswerRound {
  item: AnswerItem;
  /** What viewers see (scrambled letters, shuffled words, emoji, Vietnamese…). */
  shown: string;
  correct: Record<string, { nickname: string; order: number }>;
  revealed: boolean;
  asked: number[];
}

type AnswerConfig = { seconds: number; points: number; scoring: string; bank: string };

interface AnswerGameOptions {
  id: string;
  title: string;
  howTo: string;
  bankLabel: string;
  bankHint: string;
  defaultBank: string;
  defaultScoring: 'first' | 'all';
  /** Parses one bank line; return null to skip invalid lines. */
  parse: (parts: string[]) => AnswerItem | null;
  /** Builds the puzzle shown to viewers. */
  present: (item: AnswerItem, random: () => number) => string;
  /** Hint line under the puzzle. */
  hint: (item: AnswerItem) => string;
}

const FIRST_BONUS = 1;

export function parseBank(text: string, parse: AnswerGameOptions['parse']): AnswerItem[] {
  const items: AnswerItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split('|').map((part) => part.trim());
    if (parts.some((part) => part.length > 200)) continue;
    const item = parse(parts);
    if (item && item.answers.length) items.push(item);
  }
  return items;
}

/** Shuffles until the result differs from the original (when possible). */
function shuffleDifferent<T>(items: T[], random: () => number, same: (a: T[]) => boolean): T[] {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = shuffle(items, random);
    if (!same(result)) return result;
  }
  return [...items].reverse();
}

export function scrambleWord(word: string, random: () => number): string {
  const letters = word.toUpperCase().replace(/[^A-Z ]/g, '').split('');
  const joined = letters.join('');
  const mixed = shuffleDifferent(letters.filter((letter) => letter !== ' '), random, (result) => result.join('') === joined.replace(/ /g, ''));
  return mixed.join(' ');
}

export function shuffleSentence(sentence: string, random: () => number): string {
  const words = sentence.replace(/[.?!,]/g, '').split(/\s+/).filter(Boolean).map((word) => (word === 'I' || word.startsWith("I'") ? word : word.toLowerCase()));
  return shuffleDifferent(words, random, (result) => result.join(' ') === words.join(' ')).join(' / ');
}

function maskedHint(answer: string): string {
  return answer.split(' ').map((word) => `${word[0] ?? ''}${' _'.repeat(Math.max(0, word.length - 1))}`).join('   ');
}

/**
 * Factory for games where the screen shows a puzzle and viewers type the
 * English answer. Scoring "first" ends on the first correct answer; "all"
 * rewards everyone correct before time runs out (+1 for the fastest).
 */
export function createAnswerGame(options: AnswerGameOptions): GameDefinition<AnswerRound, AnswerConfig> {
  return {
    id: options.id,
    title: options.title,
    category: 'english',
    howTo: options.howTo,
    defaultConfig: { seconds: 30, points: 2, scoring: options.defaultScoring, bank: options.defaultBank },
    settings: [
      { key: 'seconds', label: 'Giây mỗi câu', type: 'number', min: 5, max: 300 },
      { key: 'points', label: 'Điểm trả lời đúng', type: 'number', min: 1, max: 100 },
      {
        key: 'scoring',
        label: 'Chấm điểm',
        type: 'select',
        options: [
          { value: 'first', label: 'Ai đúng đầu tiên thắng' },
          { value: 'all', label: 'Mọi người đúng đều có điểm' }
        ]
      },
      { key: 'bank', label: options.bankLabel, type: 'textarea', maxLength: 20_000, hint: options.bankHint }
    ],

    start(config, ctx) {
      const items = parseBank(config.bank, options.parse);
      if (!items.length) return { error: 'Ngân hàng câu hỏi trống hoặc sai định dạng.' };
      const { index, asked } = pickUnasked(items.length, ctx.previous?.asked ?? [], ctx.random);
      const item = items[index] as AnswerItem;
      return {
        state: { item, shown: options.present(item, ctx.random), correct: {}, revealed: false, asked },
        durationMs: config.seconds * 1000
      };
    },

    handle(state, input, config) {
      if (input.kind !== 'chat' || state.revealed || !isEnglishAttempt(input.text)) return null;
      if (state.correct[input.user] || !state.item.answers.includes(normalizeEnglish(input.text))) return { state, consumed: true };
      const order = Object.keys(state.correct).length;
      return {
        consumed: true,
        finish: config.scoring === 'first',
        message: config.scoring === 'first' ? undefined : `✅ ${input.nickname} trả lời đúng!`,
        state: { ...state, correct: { ...state.correct, [input.user]: { nickname: input.nickname, order } } }
      };
    },

    finish(state, config) {
      const winners = Object.entries(state.correct).sort(([, a], [, b]) => a.order - b.order);
      const awards: PointAward[] = winners.map(([user, entry], index) => ({
        user,
        nickname: entry.nickname,
        points: config.points + (config.scoring === 'all' && index === 0 ? FIRST_BONUS : 0)
      }));
      const who = winners.length
        ? config.scoring === 'first'
          ? ` 🏆 ${winners[0]?.[1].nickname}`
          : ` ${winners.length} người đúng, nhanh nhất: ${winners[0]?.[1].nickname}.`
        : ' Chưa ai trả lời đúng.';
      return { state: { ...state, revealed: true }, awards, message: `Đáp án: ${state.item.display}.${who}` };
    },

    testActions(state) {
      return [
        chatTest('Trả lời sai', 'wrong answer', 3),
        chatTest('Comment tiếng Việt', 'hay quá cô ơi', 1),
        chatTest(`Trả lời đúng: ${state.item.display}`, state.item.display, 0.4)
      ];
    },

    view(state) {
      const winners = Object.values(state.correct).sort((a, b) => a.order - b.order).slice(0, 5);
      return view({
        headline: state.shown,
        hint: state.revealed ? `✔ ${state.item.display}` : options.hint(state.item),
        rows: winners.map((winner, index) => ({ badge: index === 0 ? '🥇' : '✅', label: winner.nickname }))
      });
    }
  };
}

function vocabItem(parts: string[]): AnswerItem | null {
  const [english = '', meaning = ''] = parts;
  const answers = aliases(english);
  const display = english.split('/')[0]?.trim() ?? '';
  return answers.length && meaning ? { prompt: meaning, answers, display, hint: meaning } : null;
}

export const unscrambleGame = createAnswerGame({
  id: 'unscramble',
  title: 'Unscramble 🔀',
  howTo: 'Màn hình hiện các chữ cái bị xáo trộn và nghĩa tiếng Việt. Viewer gõ từ tiếng Anh đúng.',
  bankLabel: 'Từ vựng',
  bankHint: 'Mỗi dòng: english[/từ khác] | nghĩa tiếng Việt',
  defaultBank: VOCAB_BANK,
  defaultScoring: 'first',
  parse: vocabItem,
  present: (item, random) => scrambleWord(item.display, random),
  hint: (item) => `Nghĩa: ${item.hint} • Gõ từ tiếng Anh`
});

export const translateGame = createAnswerGame({
  id: 'translate',
  title: 'Dịch nhanh 🇻🇳→🇬🇧',
  howTo: 'Màn hình hiện từ tiếng Việt. Viewer gõ nghĩa tiếng Anh (chấp nhận các từ đồng nghĩa trong ngân hàng).',
  bankLabel: 'Từ vựng',
  bankHint: 'Mỗi dòng: english[/từ khác] | nghĩa tiếng Việt',
  defaultBank: VOCAB_BANK,
  defaultScoring: 'all',
  parse: vocabItem,
  present: (item) => item.prompt,
  hint: (item) => `Gợi ý: ${maskedHint(item.display)}`
});

export const emojiGame = createAnswerGame({
  id: 'emojiGuess',
  title: 'Emoji Guess 🤔',
  howTo: 'Ghép các emoji thành một từ tiếng Anh (vd 🧈🪰 = butterfly).',
  bankLabel: 'Câu đố emoji',
  bankHint: 'Mỗi dòng: emoji | answer[/đáp án khác] | gợi ý tiếng Việt',
  defaultBank: EMOJI_BANK,
  defaultScoring: 'first',
  parse: (parts) => {
    const [emoji = '', english = '', meaning = ''] = parts;
    const answers = aliases(english);
    const display = english.split('/')[0]?.trim() ?? '';
    return emoji && answers.length ? { prompt: emoji, answers, display, hint: meaning } : null;
  },
  present: (item) => item.prompt,
  hint: (item) => `${item.hint ? `Gợi ý: ${item.hint} • ` : ''}${item.display.replace(/\S/g, '_').replace(/_/g, '_ ').trim()}`
});

export const sentenceGame = createAnswerGame({
  id: 'sentenceBuilder',
  title: 'Sentence Builder 🧩',
  howTo: 'Các từ của một câu bị xáo trộn. Viewer gõ lại câu đúng thứ tự (không cần dấu câu, không phân biệt hoa thường).',
  bankLabel: 'Câu mẫu',
  bankHint: 'Mỗi dòng: câu tiếng Anh | nghĩa tiếng Việt',
  defaultBank: SENTENCE_BANK,
  defaultScoring: 'all',
  parse: (parts) => {
    const [sentence = '', meaning = ''] = parts;
    const normalized = normalizeEnglish(sentence);
    const words = normalized.split(' ');
    return words.length >= 3 && words.length <= 14 ? { prompt: sentence, answers: [normalized], display: sentence, hint: meaning } : null;
  },
  present: (item, random) => shuffleSentence(item.display, random),
  hint: (item) => (item.hint ? `Nghĩa: ${item.hint}` : 'Sắp xếp lại thành câu đúng')
});
