import { ENGLISH_QUIZ_BANK } from '../content/english';
import { ENGLISH_EASY_QUIZ_BANK } from '../content/english-easy';
import { VN_QUIZ_BANK } from '../content/quiz-vi';
import {
  current,
  fastestRows,
  finalMessage,
  nextQuestion,
  pickSet,
  progressLabel,
  rankingRows,
  resultHint,
  scoreQuestion,
  SERIES_SETTINGS,
  startSeries,
  type SeriesConfig,
  type SeriesState
} from '../series';
import { checkBankLines } from '../bankFile';
import { chatTest, percentOf, view, type GameCategory, type GameDefinition } from '../types';
import { numberLocale, t } from '../../shared/i18n';

export interface QuizQuestion {
  question: string;
  answers: string[];
  correct: number;
}

/** A round of N questions; a viewer's first answer to each question is final. */
export type QuizRound = SeriesState<QuizQuestion>;

/** `preset`: which built-in bank to use; `questions`: the streamer's own bank (used instead when it has valid lines). */
type QuizConfig = SeriesConfig & { preset: string; questions: string };

/** Built-in question banks the streamer can pick without typing anything. */
export const QUIZ_PRESETS: Record<string, { label: string; bank: string }> = {
  'en-easy': { label: 'Tiếng Anh – dễ (mới bắt đầu)', bank: ENGLISH_EASY_QUIZ_BANK },
  'en-grammar': { label: 'Tiếng Anh – ngữ pháp & từ vựng', bank: ENGLISH_QUIZ_BANK },
  vi: { label: 'Kiến thức chung (tiếng Việt)', bank: VN_QUIZ_BANK }
};

/** The streamer's own questions when there are any, else the chosen built-in bank. */
export function quizBank(
  config: { preset: string; questions: string },
  presets: Record<string, { label: string; bank: string }> = QUIZ_PRESETS,
  parse: (text: string) => QuizQuestion[] = parseQuestions
): QuizQuestion[] {
  const own = parse(config.questions);
  if (own.length) return own;
  return parse(presets[config.preset]?.bank ?? Object.values(presets)[0]?.bank ?? '');
}

/** Viewer counts in the app language's number format (1.440 / 1,440). */
function count(value: number): string {
  return value.toLocaleString(numberLocale());
}

/** "a", "B" → option index; -1 when the comment isn't a choice. */
function letterChoice(text: string): number {
  return LETTERS.indexOf(text.trim().toUpperCase());
}

/** What makes one quiz game differ from another (banks, how answers are typed, texts). */
interface QuizGameOptions {
  id: string;
  title: string;
  category: GameCategory;
  defaultPreset: string;
  sample: string;
  aliases?: string[];
  accent?: string;
  presets?: Record<string, { label: string; bank: string }>;
  /** Bank text → questions (default: "Q | A | B | C | D | letter"). */
  parse?: (text: string) => QuizQuestion[];
  /** Comment → option index, or -1 (default: letters a–d). */
  parseChoice?: (text: string) => number;
  howTo?: string;
  commands?: { usage: string; description: string }[];
  /** "Comment a / b / c / d" line while asking (translated with t() where it's shown). */
  choicesHint?: (question: QuizQuestion) => string;
  bankHint?: string;
}

const LETTERS = ['A', 'B', 'C', 'D'];

export const DEFAULT_QUESTIONS = VN_QUIZ_BANK;

/** Parses "Question | A | B | C | D | B" lines (2–4 answers; last cell = letter or answer text). Invalid lines are skipped. */
export function parseQuestions(text: string): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split('|').map((part) => part.trim());
    if (parts.length < 4 || parts.length > 6) continue;
    const question = parts[0] ?? '';
    // Empty option cells (a 3-option row in a 4-column sheet) are skipped.
    const answers = parts.slice(1, -1).filter(Boolean);
    // The last cell is the letter (A–D) or the correct answer copied as text.
    const key = parts[parts.length - 1] ?? '';
    const letter = LETTERS.indexOf(key.toUpperCase());
    const correct = letter >= 0 ? letter : answers.findIndex((answer) => answer.toLowerCase() === key.toLowerCase());
    if (!question || answers.length < 2 || correct < 0 || correct >= answers.length) continue;
    questions.push({ question: question.slice(0, 160), answers: answers.map((answer) => answer.slice(0, 60)), correct });
  }
  return questions;
}

/** Quiz engine shared by the general-knowledge quiz and the English quiz. */
const QUIZ_SAMPLE_HELP = [
  '# Mẫu câu hỏi trắc nghiệm — mỗi dòng 1 câu:',
  '# Câu hỏi | Đáp án A | Đáp án B | Đáp án C | Đáp án D | Đáp án đúng',
  '# - Đáp án đúng: chữ A–D, hoặc chép nguyên văn đáp án đúng.',
  '# - Có thể chỉ 2 hoặc 3 lựa chọn (Đúng/Sai…).',
  '# - Excel / Google Sheets: mỗi ô một cột theo thứ tự trên, tải xuống dạng .csv rồi nhập.',
  '# - Dòng bắt đầu bằng # là ghi chú, app bỏ qua. Lưu file dạng UTF-8.'
];

export const QUIZ_SAMPLE = [
  ...QUIZ_SAMPLE_HELP,
  'What color is the sky? | red | blue | green | black | B',
  '🐶 is a ___ | cat | dog | cow | fish | dog',
  'I ___ a student. | am | is | are | A',
  'Thủ đô của Việt Nam là? | Hà Nội | Huế | Đà Nẵng | TP. Hồ Chí Minh | A'
].join('\n');

export function createQuizGame(options: QuizGameOptions): GameDefinition<QuizRound, QuizConfig> {
  const presets = options.presets ?? QUIZ_PRESETS;
  const parse = options.parse ?? parseQuestions;
  const parseChoice = options.parseChoice ?? letterChoice;
  const choicesHint = options.choicesHint
    ?? ((question: QuizQuestion) => `Comment ${LETTERS.slice(0, question.answers.length).map((letter) => letter.toLowerCase()).join(' / ')}`);
  return {
    id: options.id,
    title: options.title,
    category: options.category,
    howTo: options.howTo ?? 'Comment a, b, c hoặc d để chọn đáp án (chỉ tính lần đầu). Đúng càng nhanh càng nhiều điểm; mỗi lượt nhiều câu, hết lượt xếp hạng.',
    commands: options.commands ?? [{ usage: 'a / b / c / d', description: 'Chọn đáp án (chữ thường hay hoa đều được, không đổi được)' }],
    aliases: options.aliases,
    accent: options.accent,
    defaultConfig: { count: 10, seconds: 15, maxPoints: 100, reveal: 4, order: 'random', preset: options.defaultPreset, questions: '' },
    settings: [
      {
        key: 'preset',
        label: 'Bộ câu hỏi có sẵn',
        type: 'select',
        options: Object.entries(presets).map(([value, preset]) => ({ value, label: `${preset.label} · ${parse(preset.bank).length} câu` }))
      },
      ...SERIES_SETTINGS,
      {
        key: 'questions',
        label: 'Câu hỏi riêng (tuỳ chọn)',
        type: 'textarea',
        maxLength: 500_000,
        hint: `Để trống = dùng bộ câu hỏi có sẵn ở trên. ${options.bankHint ?? 'Mỗi dòng: Câu hỏi | A | B | C | D | Đáp án đúng (chữ A–D hoặc chép nguyên văn). 2–4 lựa chọn.'} Nhập được file .txt / .csv (Excel, Google Sheets).`,
        sample: options.sample
      }
    ],

    checkBank(key, text) {
      return key === 'questions' ? checkBankLines(text, (line) => parse(line).length === 1) : null;
    },

    start(config, ctx) {
      const bank = quizBank(config, presets, parse);
      if (!bank.length) return { error: t('Bộ câu hỏi trống hoặc sai định dạng.') };
      const { indices, asked } = pickSet(bank.length, config.count, ctx.previous?.asked ?? [], ctx.random, config.order);
      const items = indices.map((index) => bank[index] as QuizQuestion);
      return { state: startSeries(items, asked, ctx.now, items[0]?.answers.length), durationMs: config.seconds * 1000 };
    },

    handle(state, input, _config, ctx) {
      if (input.kind !== 'chat' || state.stage !== 'ask') return null;
      const question = current(state);
      const choice = parseChoice(input.text);
      if (choice < 0 || choice >= question.answers.length) return null;
      if (state.book.has(input.user)) return { state, consumed: true };
      const answer = { user: input.user, nickname: input.nickname, ms: ctx.now - state.askedAt, correct: choice === question.correct, choice };
      return { consumed: true, state: { ...state }, commit: () => state.book.add(answer) };
    },

    advance(state, config, ctx) {
      if (state.stage === 'ask') {
        const { result, awards, commit } = scoreQuestion(state, config);
        const question = current(state);
        const letter = LETTERS[question.correct];
        return {
          consumed: false,
          state: { ...state, stage: 'reveal', last: result },
          awards,
          commit,
          endsAt: ctx.now + config.reveal * 1000,
          message: t('Đáp án {letter}: {answer}', { letter: letter ?? '', answer: question.answers[question.correct] ?? '' }),
          effects: [result.correct ? { kind: 'correct', text: `✅ ${letter}` } : { kind: 'wrong', text: t('Đáp án {letter}', { letter: letter ?? '' }) }]
        };
      }
      if (state.stage !== 'reveal') return null;
      const next = nextQuestion(state, ctx.now, state.items[state.index + 1]?.answers.length);
      return next ? { consumed: false, state: next, endsAt: ctx.now + config.seconds * 1000, message: '' } : null;
    },

    finish(state, config) {
      // Stopped mid-question (Chốt): the answers so far still count.
      const scored = state.stage === 'ask' ? scoreQuestion(state, config) : null;
      scored?.commit();
      const done: QuizRound = { ...state, stage: 'done', last: scored?.result ?? state.last };
      const top = state.totals.top(1)[0];
      return {
        state: done,
        awards: scored?.awards ?? [],
        message: finalMessage(done),
        effects: [top ? { kind: 'win', text: `🏆 ${top.nickname}`, user: top.nickname } : { kind: 'lose', text: t('Hết lượt') }]
      };
    },

    testActions(state) {
      if (state.stage !== 'ask') return [];
      const question = current(state);
      const letters = question.answers.map((_, index) => LETTERS[index] ?? '');
      return [
        ...letters.map((letter) => chatTest(letter, letter)),
        chatTest(t('Trả lời đúng ({letter})', { letter: LETTERS[question.correct] ?? '' }), LETTERS[question.correct] ?? 'A', 1.5)
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
      const question = current(state);
      const revealed = state.stage === 'reveal';
      const { counts, total } = state.book;
      return view({
        style: { rows: 'quiz' },
        headline: question.question,
        hint: revealed
          ? `${progressLabel(state)} • ${resultHint(state.last)}`
          : `${progressLabel(state)} • ${t(choicesHint(question))} • ${t('{count} người đã trả lời', { count: count(total) })}`,
        rows: question.answers.map((answer, index) => ({
          badge: LETTERS[index],
          label: answer,
          // Counts stay hidden until the reveal so viewers can't copy the crowd.
          value: revealed ? String(counts[index] ?? 0) : undefined,
          percent: revealed ? percentOf(counts[index] ?? 0, total) : undefined,
          highlight: revealed && index === question.correct
        }))
      });
    }
  };
}

export const quizGame = createQuizGame({ id: 'quiz', title: 'Quiz A/B/C/D ❓', category: 'fun', defaultPreset: 'en-easy', sample: QUIZ_SAMPLE, accent: '#f59e0b' });

export const englishQuizGame = createQuizGame({ id: 'englishQuiz', title: 'English Quiz 📝', category: 'english', defaultPreset: 'en-grammar', sample: QUIZ_SAMPLE, aliases: ['equiz'], accent: '#0ea5e9' });
