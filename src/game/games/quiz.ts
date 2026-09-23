import type { PointAward } from '../engine';
import { ENGLISH_QUIZ_BANK } from '../content/english';
import { chatTest, percentOf, pickUnasked, view, type GameCategory, type GameDefinition } from '../types';

export interface QuizQuestion {
  question: string;
  answers: string[];
  correct: number;
}

export interface QuizRound {
  questionIndex: number;
  question: QuizQuestion;
  /** First answer is final, so viewers can't brute-force by spamming letters. */
  responses: Record<string, { nickname: string; choice: number; order: number }>;
  revealed: boolean;
  asked: number[];
}

type QuizConfig = { seconds: number; points: number; questions: string };

const LETTERS = ['A', 'B', 'C', 'D'];
const FIRST_CORRECT_BONUS = 1;

export const DEFAULT_QUESTIONS = [
  'Thủ đô của Việt Nam là? | Hà Nội | Huế | Đà Nẵng | TP. Hồ Chí Minh | A',
  '7 × 8 bằng bao nhiêu? | 54 | 56 | 58 | 64 | B',
  'Một năm có bao nhiêu tháng có 31 ngày? | 5 | 6 | 7 | 8 | C',
  'Hành tinh lớn nhất Hệ Mặt Trời? | Trái Đất | Sao Mộc | Sao Thổ | Sao Hỏa | B',
  'Nốt nhạc nào đứng sau nốt Mi? | Rê | Fa | Son | La | B',
  'Đàn piano tiêu chuẩn có bao nhiêu phím? | 66 | 76 | 88 | 98 | C',
  'Con vật nào được gọi là "chúa sơn lâm"? | Sư tử | Hổ | Voi | Gấu | B',
  'Nước sôi ở bao nhiêu độ C (áp suất tiêu chuẩn)? | 90 | 100 | 110 | 120 | B',
  'Một tuần có bao nhiêu giờ? | 148 | 158 | 168 | 178 | C',
  'Ban nhạc The Beatles đến từ nước nào? | Mỹ | Anh | Úc | Canada | B',
  'Đỉnh núi cao nhất Việt Nam? | Fansipan | Bà Đen | Ngọc Linh | Pu Ta Leng | A',
  'Khí nào chiếm nhiều nhất trong không khí? | Oxy | Nitơ | CO2 | Hydro | B',
  'Nhạc cụ nào thường có 6 dây? | Guitar | Violin | Sáo | Trống | A',
  'Tết Trung thu vào ngày nào âm lịch? | 15/7 | 15/8 | 1/1 | 5/5 | B',
  '2 mũ 10 bằng bao nhiêu? | 512 | 1000 | 1024 | 2048 | C',
  'Đại dương lớn nhất thế giới? | Đại Tây Dương | Ấn Độ Dương | Thái Bình Dương | Bắc Băng Dương | C',
  'Loài chim nào không biết bay? | Đà điểu | Đại bàng | Chim sẻ | Bồ câu | A',
  'Tim người có bao nhiêu ngăn? | 2 | 3 | 4 | 5 | C',
  'Ánh sáng Mặt Trời đến Trái Đất mất khoảng bao lâu? | 8 giây | 8 phút | 8 giờ | 8 ngày | B',
  'Vịnh Hạ Long thuộc tỉnh nào? | Quảng Ninh | Hải Phòng | Thanh Hóa | Nghệ An | A'
].join('\n');

/** Parses "Question | A | B | C | D | B" lines (2–4 answers). Invalid lines are skipped. */
export function parseQuestions(text: string): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split('|').map((part) => part.trim());
    if (parts.length < 4 || parts.length > 6) continue;
    const question = parts[0] ?? '';
    const answers = parts.slice(1, -1);
    const correct = LETTERS.indexOf((parts[parts.length - 1] ?? '').toUpperCase());
    if (!question || answers.some((answer) => !answer) || correct < 0 || correct >= answers.length) continue;
    questions.push({ question: question.slice(0, 160), answers: answers.map((answer) => answer.slice(0, 60)), correct });
  }
  return questions;
}

/** Quiz engine shared by the general-knowledge quiz and the English quiz. */
export function createQuizGame(options: { id: string; title: string; category: GameCategory; defaultQuestions: string; aliases?: string[]; accent?: string }): GameDefinition<QuizRound, QuizConfig> {
  return {
    id: options.id,
    title: options.title,
    category: options.category,
    howTo: 'Comment A, B, C hoặc D. Chỉ tính câu trả lời đầu tiên. Hết giờ công bố đáp án: đúng +điểm, người đúng nhanh nhất +1.',
    commands: [{ usage: 'A / B / C / D', description: 'Chọn đáp án (không đổi được)' }],
    aliases: options.aliases,
    accent: options.accent,
    defaultConfig: { seconds: 20, points: 2, questions: options.defaultQuestions },
    settings: [
      { key: 'seconds', label: 'Giây mỗi câu', type: 'number', min: 5, max: 120 },
      { key: 'points', label: 'Điểm trả lời đúng', type: 'number', min: 1, max: 100 },
      {
        key: 'questions',
        label: 'Bộ câu hỏi',
        type: 'textarea',
        maxLength: 20_000,
        hint: 'Mỗi dòng: Câu hỏi | A | B | C | D | Đáp án đúng (A–D). 2–4 lựa chọn.'
      }
    ],

    start(config, ctx) {
      const questions = parseQuestions(config.questions);
      if (!questions.length) return { error: 'Bộ câu hỏi trống hoặc sai định dạng.' };

      const { index: questionIndex, asked } = pickUnasked(questions.length, ctx.previous?.asked ?? [], ctx.random);
      return {
        state: {
          questionIndex,
          question: questions[questionIndex] as QuizQuestion,
          responses: {},
          revealed: false,
          asked
        },
        durationMs: config.seconds * 1000
      };
    },

    handle(state, input) {
      if (input.kind !== 'chat' || state.revealed) return null;
      const choice = LETTERS.indexOf(input.text.trim().toUpperCase());
      if (choice < 0 || choice >= state.question.answers.length) return null;
      if (state.responses[input.user]) return { state, consumed: true };
      const order = Object.keys(state.responses).length;
      return {
        consumed: true,
        state: { ...state, responses: { ...state.responses, [input.user]: { nickname: input.nickname, choice, order } } }
      };
    },

    finish(state, config) {
      const correct = Object.entries(state.responses)
        .filter(([, response]) => response.choice === state.question.correct)
        .sort(([, a], [, b]) => a.order - b.order);
      const awards: PointAward[] = correct.map(([user, response], index) => ({
        user,
        nickname: response.nickname,
        points: config.points + (index === 0 ? FIRST_CORRECT_BONUS : 0)
      }));
      const letter = LETTERS[state.question.correct];
      return {
        state: { ...state, revealed: true },
        awards,
        message: `Đáp án ${letter}: ${state.question.answers[state.question.correct]}. ${correct.length} người đúng${correct[0] ? `, nhanh nhất: ${correct[0][1].nickname}` : ''}.`
      };
    },

    testActions(state) {
      const letters = state.question.answers.map((_, index) => LETTERS[index] ?? '');
      return [
        ...letters.map((letter) => chatTest(letter, letter)),
        chatTest(`Trả lời đúng (${LETTERS[state.question.correct]})`, LETTERS[state.question.correct] ?? 'A', 0.5)
      ];
    },

    view(state) {
      const counts = state.question.answers.map(() => 0);
      for (const response of Object.values(state.responses)) counts[response.choice] = (counts[response.choice] ?? 0) + 1;
      const total = Object.keys(state.responses).length;
      return view({
        style: { rows: 'quiz' },
        headline: state.question.question,
        hint: state.revealed ? null : `Comment ${LETTERS.slice(0, state.question.answers.length).join('/')} • ${total} người đã trả lời`,
        rows: state.question.answers.map((answer, index) => ({
          badge: LETTERS[index],
          label: answer,
          // Counts stay hidden until the reveal so viewers can't copy the crowd.
          value: state.revealed ? String(counts[index] ?? 0) : undefined,
          percent: state.revealed ? percentOf(counts[index] ?? 0, total) : undefined,
          highlight: state.revealed && index === state.question.correct
        }))
      });
    }
  };
}

export const quizGame = createQuizGame({ id: 'quiz', title: 'Quiz A/B/C/D ❓', category: 'fun', defaultQuestions: DEFAULT_QUESTIONS, accent: '#f59e0b' });

export const englishQuizGame = createQuizGame({ id: 'englishQuiz', title: 'English Quiz 📝', category: 'english', defaultQuestions: ENGLISH_QUIZ_BANK, aliases: ['equiz'], accent: '#0ea5e9' });
