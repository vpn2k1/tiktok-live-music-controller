import { EMOJI_VI_BANK, RIDDLE_VI_BANK } from '../content/vietnamese';
import { foldedAliases, foldText } from '../text';
import { createAnswerGame, type AnswerItem } from './answerGames';
import { t } from '../../shared/i18n';

/** Any comment of reasonable length may be a Vietnamese answer (wrong ones cost nothing). */
const VIETNAMESE_MATCH = { normalize: foldText, isAttempt: (text: string) => text.length <= 80 && foldText(text).length > 0 };

/** "prompt | answer[/alias] | hint" (hint optional). */
export function vietnameseItem(parts: string[]): AnswerItem | null {
  const [prompt = '', answer = '', hint = ''] = parts;
  const answers = foldedAliases(answer);
  const display = answer.split('/')[0]?.trim() ?? '';
  return prompt && answers.length ? { prompt, answers, display, hint } : null;
}

/** "••• ••••" — one dot per letter of each word of the main answer. */
export function wordBlanks(display: string): string {
  return display.split(/\s+/).filter(Boolean).map((word) => '•'.repeat(Array.from(foldText(word)).length)).join('  ');
}

export const emojiVietnameseGame = createAnswerGame({
  id: 'duoiHinh',
  title: 'Đuổi hình bắt chữ 🖼️',
  category: 'fun',
  accent: '#f43f5e',
  aliases: ['duoihinh', 'batchu'],
  headlineStyle: 'boss',
  commands: [{ usage: 'đáp án', description: 'Gõ thẳng đáp án tiếng Việt (có dấu hay không đều được)' }],
  howTo: 'Nhìn các emoji, đoán từ tiếng Việt (gõ có dấu hay không dấu đều được).',
  bankLabel: 'Câu đố hình',
  bankHint: 'Mỗi dòng: emoji | đáp án[/đáp án khác] | gợi ý.',
  defaultBank: EMOJI_VI_BANK,
  defaultScoring: 'all',
  sample: [
    '# Mẫu Đuổi hình bắt chữ — mỗi dòng 1 câu:',
    '# emoji | đáp án tiếng Việt[/đáp án khác] | gợi ý',
    '# - Đáp án không phân biệt dấu, hoa thường, khoảng trắng.',
    '# - Dòng bắt đầu bằng # là ghi chú, app bỏ qua. Lưu file dạng UTF-8.',
    '☕🥛 | cà phê sữa | đồ uống',
    '🌙🎂 | bánh trung thu | loại bánh'
  ].join('\n'),
  match: VIETNAMESE_MATCH,
  parse: vietnameseItem,
  present: (item) => item.prompt,
  hint: (item) => (item.hint ? t('Gợi ý: {hint} • {blanks}', { hint: item.hint, blanks: wordBlanks(item.display) }) : wordBlanks(item.display))
});

export const riddleGame = createAnswerGame({
  id: 'caudo',
  title: 'Câu đố vui 🧠',
  category: 'fun',
  accent: '#0ea5e9',
  aliases: ['riddle', 'dovui'],
  commands: [{ usage: 'đáp án', description: 'Gõ thẳng đáp án (có dấu hay không đều được)' }],
  howTo: 'Câu đố mẹo dân gian: gõ đáp án (có dấu hay không dấu đều được).',
  bankLabel: 'Câu đố',
  bankHint: 'Mỗi dòng: câu đố | đáp án[/đáp án khác] | gợi ý (tuỳ chọn).',
  defaultBank: RIDDLE_VI_BANK,
  defaultScoring: 'all',
  sample: [
    '# Mẫu Câu đố vui — mỗi dòng 1 câu:',
    '# câu đố | đáp án[/đáp án khác] | gợi ý (có thể bỏ trống)',
    '# - Đáp án không phân biệt dấu, hoa thường, khoảng trắng.',
    '# - Dòng bắt đầu bằng # là ghi chú, app bỏ qua. Lưu file dạng UTF-8.',
    'Con gì càng to càng nhỏ? | con cua/cua | chơi chữ',
    'Cái gì càng rửa càng bẩn? | nước'
  ].join('\n'),
  match: VIETNAMESE_MATCH,
  parse: vietnameseItem,
  present: (item) => item.prompt,
  hint: (item) => (item.hint ? t('Gợi ý: {hint}', { hint: item.hint }) : t('Đáp án {count} từ', { count: item.display.split(/\s+/).length }))
});
