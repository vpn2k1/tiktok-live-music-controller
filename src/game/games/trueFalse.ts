import { TRUE_FALSE_EN_BANK, TRUE_FALSE_VI_BANK } from '../content/vietnamese';
import { foldText } from '../text';
import { createQuizGame, type QuizQuestion } from './quiz';
import { t } from '../../shared/i18n';

/**
 * "Đúng hay Sai": one statement per question, two answers. Viewers may type
 * đúng/sai, d/s, true/false, t/f, a/b, 1/2 or o/x — whatever feels natural.
 */
const TRUE_WORDS = new Set(['dung', 'd', 'true', 't', 'a', '1', 'o', 'yes', 'y', 'co']);
const FALSE_WORDS = new Set(['sai', 's', 'false', 'f', 'b', '2', 'x', 'no', 'n', 'khong']);
const ANSWERS = ['⭕ Đúng', '❌ Sai'];

export function trueFalseChoice(text: string): number {
  const word = foldText(text);
  return TRUE_WORDS.has(word) ? 0 : FALSE_WORDS.has(word) ? 1 : -1;
}

/** "statement | đúng" / "statement | false" lines. */
export function parseTrueFalse(text: string): QuizQuestion[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const cut = line.lastIndexOf('|');
    if (cut < 0) return [];
    const statement = line.slice(0, cut).trim();
    const correct = trueFalseChoice(line.slice(cut + 1));
    // Parsed when a round starts, so the answer labels follow the app language.
    return statement && correct >= 0 && statement.length <= 200 ? [{ question: statement, answers: ANSWERS.map((answer) => t(answer)), correct }] : [];
  });
}

export const trueFalseGame = createQuizGame({
  id: 'dungSai',
  title: 'Đúng hay Sai ⭕',
  category: 'english',
  accent: '#22c55e',
  aliases: ['dungsai', 'truefalse', 'tf'],
  defaultPreset: 'en',
  presets: {
    en: { label: 'Tiếng Anh – dễ', bank: TRUE_FALSE_EN_BANK },
    vi: { label: 'Kiến thức (tiếng Việt)', bank: TRUE_FALSE_VI_BANK }
  },
  parse: parseTrueFalse,
  parseChoice: trueFalseChoice,
  howTo: 'Màn hình hiện một câu nhận định: comment "đúng" hoặc "sai" (hoặc d/s, true/false). Chỉ tính lần đầu, đúng càng nhanh càng nhiều điểm.',
  commands: [
    { usage: 'đúng / sai', description: 'Hoặc d / s, true / false, a / b' }
  ],
  choicesHint: () => t('Comment đúng / sai'),
  bankHint: 'Mỗi dòng: câu nhận định | đúng hoặc sai (true/false).',
  sample: [
    '# Mẫu Đúng hay Sai — mỗi dòng 1 câu:',
    '# câu nhận định | đúng (hoặc sai, true, false)',
    '# - Dòng bắt đầu bằng # là ghi chú, app bỏ qua. Lưu file dạng UTF-8.',
    'A cat has four legs. | true',
    'Mặt Trăng tự phát sáng. | sai'
  ].join('\n')
});
