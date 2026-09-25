import { EMOJI_BANK, SENTENCE_BANK, VOCAB_BANK } from '../content/english';
import { aliases, isEnglishAttempt, normalizeEnglish } from '../english';
import {
  current,
  fastestRows,
  finalMessage,
  nextQuestion,
  pickSet,
  progressLabel,
  rankingRows,
  resultHint,
  roundEndEffect,
  scoreQuestion,
  seconds,
  SERIES_SETTINGS,
  startSeries,
  type SeriesConfig,
  type SeriesState
} from '../series';
import { checkBankLines } from '../bankFile';
import { chatTest, commandArgument, shuffle, view, type GameCategory, type GameDefinition } from '../types';
import { numberLocale, t } from '../../shared/i18n';

/** One "prompt → answer" item parsed from a bank line. */
export interface AnswerItem {
  prompt: string;
  answers: string[];
  /** Display form of the main answer (original casing). */
  display: string;
  hint: string;
  /** A typable correct answer when `display` isn't one (e.g. "猫 · ねこ · neko"). Test buttons use it. */
  sayAs?: string;
}

/** A round of N puzzles; only correct answers are recorded (wrong ones cost nothing). */
export type AnswerRound = SeriesState<AnswerItem> & {
  /** What viewers see for the current puzzle (scrambled letters, shuffled words, emoji, Vietnamese…). */
  shown: string;
};

/** `preset`: built-in bank (games with presets); `bank`: the streamer's own lines (or the default bank). */
type AnswerConfig = SeriesConfig & { scoring: string; preset: string; bank: string };

const ENGLISH_MATCH = { normalize: normalizeEnglish, isAttempt: isEnglishAttempt };

/** Correct answers that still get a popup/sound; beyond that big rooms would flood the overlay. */
const ANNOUNCED_CORRECT = 5;

interface AnswerGameOptions {
  id: string;
  title: string;
  howTo: string;
  aliases?: string[];
  accent: string;
  /** `boss` = big floating headline (emoji puzzles). */
  headlineStyle?: 'text' | 'tiles' | 'boss';
  /** Chat commands shown on the card (default: English answer). */
  commands?: { usage: string; description: string }[];
  bankLabel: string;
  bankHint: string;
  defaultBank: string;
  defaultScoring: 'first' | 'all';
  /** Downloadable sample file for the bank ("#" lines = instructions). */
  sample: string;
  /**
   * Built-in banks to pick from. With presets the textarea holds only the
   * streamer's own lines (used instead of the preset when valid).
   */
  presets?: Record<string, { label: string; bank: string }>;
  /** Parses one bank line; return null to skip invalid lines. */
  parse: (parts: string[]) => AnswerItem | null;
  /** Builds the puzzle shown to viewers. */
  present: (item: AnswerItem, random: () => number) => string;
  /** Hint line under the puzzle. */
  hint: (item: AnswerItem) => string;
  /** Library group (default English). */
  category?: GameCategory;
  /**
   * How a comment is compared with the answers (default: English rules, and
   * only ASCII comments count). Vietnamese games fold accents and spaces.
   */
  match?: { normalize: (text: string) => string; isAttempt: (text: string) => boolean };
}

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

/** Viewer counts in the app language's number format (1.440 / 1,440). */
function count(value: number): string {
  return value.toLocaleString(numberLocale());
}

function maskedHint(answer: string): string {
  return answer.split(' ').map((word) => `${word[0] ?? ''}${' _'.repeat(Math.max(0, word.length - 1))}`).join('   ');
}

/**
 * Factory for games where the screen shows a puzzle and viewers type the
 * English answer. A round is a series of puzzles scored by answer speed.
 * Scoring "all": everyone correct before the deadline scores; "first": the
 * puzzle closes at the first correct answer.
 */
export function createAnswerGame(options: AnswerGameOptions): GameDefinition<AnswerRound, AnswerConfig> {
  return {
    id: options.id,
    title: options.title,
    category: options.category ?? 'english',
    howTo: `${options.howTo} Mỗi lượt nhiều câu, đúng càng nhanh càng nhiều điểm; hết lượt xếp hạng tổng điểm.`,
    commands: options.commands ?? [
      { usage: 'đáp án tiếng Anh', description: 'Gõ thẳng đáp án' },
      { usage: '!ans …', description: 'Cách viết khác' }
    ],
    aliases: options.aliases,
    accent: options.accent,
    defaultConfig: {
      count: 10,
      seconds: 25,
      maxPoints: 100,
      reveal: 4,
      order: 'random',
      scoring: options.defaultScoring,
      preset: options.presets ? Object.keys(options.presets)[0] ?? '' : '',
      bank: options.presets ? '' : options.defaultBank
    },
    settings: [
      ...(options.presets
        ? [{
          key: 'preset',
          label: 'Bộ câu có sẵn',
          type: 'select' as const,
          options: Object.entries(options.presets).map(([value, preset]) => ({ value, label: `${preset.label} · ${parseBank(preset.bank, options.parse).length} câu` }))
        }]
        : []),
      ...SERIES_SETTINGS,
      {
        key: 'scoring',
        label: 'Chấm điểm',
        type: 'select',
        options: [
          { value: 'all', label: 'Mọi người đúng đều có điểm (nhanh hơn nhiều điểm hơn)' },
          { value: 'first', label: 'Có người đúng là sang câu' }
        ]
      },
      {
        key: 'bank',
        label: options.presets ? `${options.bankLabel} riêng (tuỳ chọn)` : options.bankLabel,
        type: 'textarea',
        maxLength: 500_000,
        hint: `${options.presets ? 'Để trống = dùng bộ có sẵn ở trên. ' : ''}${options.bankHint} Nhập được file .txt / .csv (Excel, Google Sheets).`,
        sample: options.sample
      }
    ],

    checkBank(key, text) {
      return key === 'bank' ? checkBankLines(text, (line) => parseBank(line, options.parse).length === 1) : null;
    },

    start(config, ctx) {
      const own = parseBank(config.bank, options.parse);
      const bank = own.length || !options.presets
        ? own
        : parseBank(options.presets[config.preset]?.bank ?? Object.values(options.presets)[0]?.bank ?? '', options.parse);
      if (!bank.length) return { error: t('Ngân hàng câu hỏi trống hoặc sai định dạng.') };
      const { indices, asked } = pickSet(bank.length, config.count, ctx.previous?.asked ?? [], ctx.random, config.order);
      const items = indices.map((index) => bank[index] as AnswerItem);
      return {
        state: { ...startSeries(items, asked, ctx.now), shown: options.present(items[0] as AnswerItem, ctx.random) },
        durationMs: config.seconds * 1000
      };
    },

    handle(state, input, config, ctx) {
      if (input.kind !== 'chat' || state.stage !== 'ask') return null;
      const text = commandArgument(input.text, ['ans', 'answer']);
      const match = options.match ?? ENGLISH_MATCH;
      if (text === null || !match.isAttempt(text)) return null;
      // Wrong or repeated answers are ignored without using up the viewer's cooldown.
      if (state.book.has(input.user) || !current(state).answers.includes(match.normalize(text))) return null;
      const ms = ctx.now - state.askedAt;
      const announce = state.book.correct < ANNOUNCED_CORRECT;
      return {
        consumed: true,
        // "first": close the puzzle now; the deadline step reveals it.
        endsAt: config.scoring === 'first' ? ctx.now : undefined,
        effects: announce ? [{ kind: 'correct', text: `✅ ${input.nickname} ${seconds(ms)}`, user: input.nickname }] : undefined,
        state: { ...state },
        commit: () => state.book.add({ user: input.user, nickname: input.nickname, ms, correct: true })
      };
    },

    advance(state, config, ctx) {
      if (state.stage === 'ask') {
        const { result, awards, commit } = scoreQuestion(state, config);
        return {
          consumed: false,
          state: { ...state, stage: 'reveal', last: result },
          awards,
          commit,
          endsAt: ctx.now + config.reveal * 1000,
          message: t('Đáp án: {answer}', { answer: current(state).display })
        };
      }
      if (state.stage !== 'reveal') return null;
      const next = nextQuestion(state, ctx.now);
      if (!next) return null;
      return {
        consumed: false,
        state: { ...next, shown: options.present(current(next), ctx.random) },
        endsAt: ctx.now + config.seconds * 1000,
        message: ''
      };
    },

    finish(state, config) {
      const scored = state.stage === 'ask' ? scoreQuestion(state, config) : null;
      scored?.commit();
      const done: AnswerRound = { ...state, stage: 'done', last: scored?.result ?? state.last };
      return {
        state: done,
        awards: scored?.awards ?? [],
        message: `${state.stage === 'ask' ? `${t('Đáp án: {answer}.', { answer: current(state).display })} ` : ''}${finalMessage(done)}`,
        effects: [roundEndEffect(done)]
      };
    },

    testActions(state) {
      if (state.stage !== 'ask') return [];
      return [
        chatTest(t('Trả lời sai'), 'wrong answer', 3),
        chatTest(t('Comment tiếng Việt'), 'hay quá cô ơi', 1),
        chatTest(t('Trả lời đúng: {answer}', { answer: current(state).display }), current(state).sayAs ?? current(state).display, 1.5)
      ];
    },

    view(state) {
      if (state.stage === 'done') {
        return view({
          headline: t('🏁 Tổng kết'),
          hint: t('{questions} câu • {players} người có điểm', { questions: state.index + 1, players: count(state.totals.size) }),
          rows: rankingRows(state.totals.top(5))
        });
      }
      const item = current(state);
      if (state.stage === 'reveal') {
        return view({
          headline: state.shown,
          style: { headline: options.headlineStyle ?? 'text' },
          hint: `✔ ${item.display} • ${resultHint(state.last)}`,
          rows: fastestRows(state.last)
        });
      }
      return view({
        headline: state.shown,
        style: { headline: options.headlineStyle ?? 'text' },
        hint: `${progressLabel(state)} • ${options.hint(item)}${state.book.correct ? ` • ${t('{count} người đúng', { count: count(state.book.correct) })}` : ''}`,
        rows: state.book.fastest.map((answer, index) => ({
          badge: index === 0 ? '🥇' : '✅',
          label: answer.nickname,
          avatar: answer.nickname,
          value: seconds(answer.ms)
        }))
      });
    }
  };
}

export function vocabItem(parts: string[]): AnswerItem | null {
  const [english = '', meaning = ''] = parts;
  const answers = aliases(english);
  const display = english.split('/')[0]?.trim() ?? '';
  return answers.length && meaning ? { prompt: meaning, answers, display, hint: meaning } : null;
}

export function emojiItem(parts: string[]): AnswerItem | null {
  const [emoji = '', english = '', meaning = ''] = parts;
  const answers = aliases(english);
  const display = english.split('/')[0]?.trim() ?? '';
  return emoji && answers.length ? { prompt: emoji, answers, display, hint: meaning } : null;
}

export function sentenceItem(parts: string[]): AnswerItem | null {
  const [sentence = '', meaning = ''] = parts;
  const normalized = normalizeEnglish(sentence);
  const words = normalized.split(' ');
  return words.length >= 3 && words.length <= 14 ? { prompt: sentence, answers: [normalized], display: sentence, hint: meaning } : null;
}

const VOCAB_SAMPLE = [
  '# Mẫu từ vựng — mỗi dòng 1 từ:',
  '# từ tiếng Anh[/cách viết khác] | nghĩa tiếng Việt',
  '# - Dấu / để thêm đáp án cũng được chấp nhận (bike cho bicycle).',
  '# - Excel / Google Sheets: cột A = tiếng Anh, cột B = nghĩa, tải xuống .csv rồi nhập.',
  '# - Dòng bắt đầu bằng # là ghi chú, app bỏ qua. Lưu file dạng UTF-8.',
  'apple | quả táo',
  'bicycle/bike | xe đạp',
  'ice cream | kem'
].join('\n');

export const unscrambleGame = createAnswerGame({
  id: 'unscramble',
  accent: '#10b981',
  headlineStyle: 'tiles',
  aliases: ['scramble'],
  title: 'Unscramble 🔀',
  howTo: 'Màn hình hiện các chữ cái bị xáo trộn và nghĩa tiếng Việt. Viewer gõ từ tiếng Anh đúng.',
  bankLabel: 'Từ vựng',
  bankHint: 'Mỗi dòng: english[/từ khác] | nghĩa tiếng Việt',
  defaultBank: VOCAB_BANK,
  defaultScoring: 'all',
  sample: VOCAB_SAMPLE,
  parse: vocabItem,
  present: (item, random) => scrambleWord(item.display, random),
  hint: (item) => t('Nghĩa: {meaning} • Gõ từ tiếng Anh', { meaning: item.hint })
});

export const translateGame = createAnswerGame({
  id: 'translate',
  accent: '#14b8a6',
  headlineStyle: 'text',
  aliases: ['dich'],
  title: 'Dịch nhanh 🇻🇳→🇬🇧',
  howTo: 'Màn hình hiện từ tiếng Việt. Viewer gõ nghĩa tiếng Anh (chấp nhận các từ đồng nghĩa trong ngân hàng).',
  bankLabel: 'Từ vựng',
  bankHint: 'Mỗi dòng: english[/từ khác] | nghĩa tiếng Việt',
  defaultBank: VOCAB_BANK,
  defaultScoring: 'all',
  sample: VOCAB_SAMPLE,
  parse: vocabItem,
  present: (item) => item.prompt,
  hint: (item) => t('Gợi ý: {hint}', { hint: maskedHint(item.display) })
});

export const emojiGame = createAnswerGame({
  id: 'emojiGuess',
  accent: '#f97316',
  headlineStyle: 'boss',
  aliases: ['emoji'],
  title: 'Emoji Guess 🤔',
  howTo: 'Ghép các emoji thành một từ tiếng Anh (vd 🧈🪰 = butterfly).',
  bankLabel: 'Câu đố emoji',
  bankHint: 'Mỗi dòng: emoji | answer[/đáp án khác] | gợi ý tiếng Việt',
  defaultBank: EMOJI_BANK,
  defaultScoring: 'all',
  sample: [
    '# Mẫu câu đố emoji — mỗi dòng 1 câu:',
    '# emoji | đáp án tiếng Anh[/đáp án khác] | gợi ý tiếng Việt',
    '# - Excel / Google Sheets: 3 cột theo thứ tự trên, tải xuống .csv rồi nhập.',
    '# - Dòng bắt đầu bằng # là ghi chú, app bỏ qua. Lưu file dạng UTF-8.',
    '🧈🪰 | butterfly | con bướm',
    '⭐🎬 | movie star/film star | ngôi sao điện ảnh'
  ].join('\n'),
  parse: emojiItem,
  present: (item) => item.prompt,
  hint: (item) => `${item.hint ? `${t('Gợi ý: {hint}', { hint: item.hint })} • ` : ''}${item.display.split(/\s+/).map((word) => '•'.repeat(word.length)).join(' ')}`
});

export const sentenceGame = createAnswerGame({
  id: 'sentenceBuilder',
  accent: '#6366f1',
  headlineStyle: 'text',
  aliases: ['sentence'],
  title: 'Sentence Builder 🧩',
  howTo: 'Các từ của một câu bị xáo trộn. Viewer gõ lại câu đúng thứ tự (không cần dấu câu, không phân biệt hoa thường).',
  bankLabel: 'Câu mẫu',
  bankHint: 'Mỗi dòng: câu tiếng Anh | nghĩa tiếng Việt',
  defaultBank: SENTENCE_BANK,
  defaultScoring: 'all',
  sample: [
    '# Mẫu câu — mỗi dòng 1 câu (3–14 từ):',
    '# câu tiếng Anh | nghĩa tiếng Việt',
    '# - Viewer gõ lại câu đúng thứ tự; không phân biệt hoa thường, dấu câu.',
    '# - Excel / Google Sheets: cột A = câu, cột B = nghĩa, tải xuống .csv rồi nhập.',
    '# - Dòng bắt đầu bằng # là ghi chú, app bỏ qua. Lưu file dạng UTF-8.',
    'I go to school every day | Tôi đi học mỗi ngày',
    'She likes to read books | Cô ấy thích đọc sách'
  ].join('\n'),
  parse: sentenceItem,
  present: (item, random) => shuffleSentence(item.display, random),
  hint: (item) => (item.hint ? t('Nghĩa: {meaning}', { meaning: item.hint }) : t('Sắp xếp lại thành câu đúng'))
});
