import { CHINESE_QUIZ_BANK, CHINESE_WORDS_BANK, HANZI_PAIRS } from '../content/chinese';
import { HIRAGANA_BANK, JAPANESE_QUIZ_BANK, JAPANESE_VOCAB_BANK, KANA_PAIRS, KANA_WORDS_BANK, KATAKANA_BANK } from '../content/japanese';
import { foldChinese, foldJapanese } from '../text';
import { createAnswerGame, type AnswerItem } from './answerGames';
import { createMemoryGame } from './memory';
import { createQuizGame, QUIZ_SAMPLE } from './quiz';
import { t } from '../../shared/i18n';

/**
 * Japanese and Chinese practice games, built on the same engines as the
 * English ones: answer series (read / translate), A–D quiz, memory pairs.
 * Viewers may answer with a Japanese/Chinese keyboard or in Latin letters.
 */

const anyAnswer = (fold: (text: string) => string) => ({
  normalize: fold,
  isAttempt: (text: string) => text.length <= 40 && fold(text).length > 0
});
const JAPANESE_MATCH = anyAnswer(foldJapanese);
const CHINESE_MATCH = anyAnswer(foldChinese);

function aliasesWith(fold: (text: string) => string, field: string): string[] {
  return field.split('/').map(fold).filter(Boolean);
}

/** "かな | romaji[/alt] | nghĩa" → show the kana, answer in romaji (or kana). */
export function kanaItem(parts: string[]): AnswerItem | null {
  const [kana = '', romaji = '', meaning = ''] = parts;
  const answers = [...aliasesWith(foldJapanese, romaji), foldJapanese(kana)].filter(Boolean);
  const display = romaji.split('/')[0]?.trim() ?? '';
  return kana && display ? { prompt: kana, answers, display, hint: meaning } : null;
}

/** "漢字 | かな/romaji… | nghĩa" → show the meaning, answer with any written form. */
export function japaneseVocabItem(parts: string[]): AnswerItem | null {
  const [word = '', readings = '', meaning = ''] = parts;
  const answers = [foldJapanese(word), ...aliasesWith(foldJapanese, readings)].filter(Boolean);
  const forms = [word, ...readings.split('/').map((reading) => reading.trim())].filter(Boolean);
  return word && meaning ? { prompt: meaning, answers, display: forms.slice(0, 3).join(' · '), hint: meaning, sayAs: word } : null;
}

/** "汉字 | pinyin | nghĩa" → show the characters, answer in pinyin (tones optional). */
export function pinyinItem(parts: string[]): AnswerItem | null {
  const [hanzi = '', pinyin = '', meaning = ''] = parts;
  const answers = aliasesWith(foldChinese, pinyin);
  return hanzi && answers.length ? { prompt: hanzi, answers, display: pinyin.split('/')[0]?.trim() ?? '', hint: meaning } : null;
}

/** Same bank, reversed: show the meaning, answer with characters or pinyin. */
export function chineseVocabItem(parts: string[]): AnswerItem | null {
  const [hanzi = '', pinyin = '', meaning = ''] = parts;
  const answers = [foldChinese(hanzi), ...aliasesWith(foldChinese, pinyin)].filter(Boolean);
  return hanzi && meaning ? { prompt: meaning, answers, display: `${hanzi} (${pinyin.split('/')[0]?.trim() ?? ''})`, hint: meaning, sayAs: hanzi } : null;
}

const HELP = '# Dòng bắt đầu bằng # là ghi chú, app bỏ qua. Lưu file dạng UTF-8.';

// ---------- Tiếng Nhật ----------

export const kanaReadingGame = createAnswerGame({
  id: 'docKana',
  title: 'Đọc Kana 🎌',
  category: 'japanese',
  accent: '#e11d48',
  aliases: ['kana', 'hiragana', 'katakana'],
  headlineStyle: 'boss',
  howTo: 'Màn hình hiện chữ Hiragana / Katakana: gõ cách đọc bằng romaji (vd あ = a, ねこ = neko).',
  commands: [{ usage: 'romaji', description: 'Gõ cách đọc (vd a, shi, neko) hoặc gõ lại bằng kana' }],
  bankLabel: 'Chữ / từ',
  bankHint: 'Mỗi dòng: kana | romaji[/cách viết khác] | nghĩa (tuỳ chọn).',
  defaultBank: '',
  presets: {
    hiragana: { label: 'Hiragana (46 chữ)', bank: HIRAGANA_BANK },
    katakana: { label: 'Katakana (46 chữ)', bank: KATAKANA_BANK },
    words: { label: 'Từ ngắn bằng kana', bank: KANA_WORDS_BANK }
  },
  defaultScoring: 'all',
  sample: ['# Mẫu Đọc Kana — mỗi dòng 1 chữ hoặc từ:', '# kana | romaji[/cách viết khác] | nghĩa (có thể bỏ trống)', HELP, 'し | shi/si', 'ねこ | neko | con mèo'].join('\n'),
  match: JAPANESE_MATCH,
  parse: kanaItem,
  present: (item) => item.prompt,
  hint: (item) => (item.hint ? t('Nghĩa: {meaning} • Gõ romaji', { meaning: item.hint }) : t('Gõ cách đọc bằng romaji'))
});

export const japaneseVocabGame = createAnswerGame({
  id: 'tuVungNhat',
  title: 'Từ vựng tiếng Nhật 🗾',
  category: 'japanese',
  accent: '#be123c',
  aliases: ['tuvungnhat', 'nhat'],
  howTo: 'Màn hình hiện nghĩa tiếng Việt: gõ từ tiếng Nhật (chữ Hán, kana hoặc romaji đều được).',
  commands: [{ usage: 'ねこ / neko', description: 'Gõ bằng bàn phím Nhật hoặc romaji' }],
  bankLabel: 'Từ vựng',
  bankHint: 'Mỗi dòng: chữ Nhật | cách đọc/romaji[/cách khác] | nghĩa tiếng Việt.',
  defaultBank: JAPANESE_VOCAB_BANK,
  defaultScoring: 'all',
  sample: ['# Mẫu từ vựng tiếng Nhật — mỗi dòng 1 từ:', '# chữ Nhật | cách đọc (kana/romaji, cách nhau bằng /) | nghĩa tiếng Việt', HELP, '猫 | ねこ/neko | con mèo', 'ありがとう | arigatou/arigato | cảm ơn'].join('\n'),
  match: JAPANESE_MATCH,
  parse: japaneseVocabItem,
  present: (item) => `🇻🇳 ${item.prompt}`,
  hint: () => t('Gõ tiếng Nhật: chữ Hán, kana hoặc romaji')
});

export const japaneseQuizGame = createQuizGame({
  id: 'quizNhat',
  title: 'Quiz tiếng Nhật 🍣',
  category: 'japanese',
  accent: '#f43f5e',
  aliases: ['quiznhat', 'jquiz'],
  defaultPreset: 'jp',
  presets: { jp: { label: 'Tiếng Nhật cơ bản', bank: JAPANESE_QUIZ_BANK } },
  sample: QUIZ_SAMPLE
});

export const kanaMemoryGame = createMemoryGame({
  id: 'ghepKana',
  title: 'Ghép cặp Kana 🎴',
  category: 'japanese',
  accent: '#db2777',
  aliases: ['ghepkana', 'kanamemory'],
  howTo: 'Thẻ úp giấu chữ Hiragana và cách đọc romaji. Comment 2 số (vd "3 8") để lật: đúng cặp (あ – a) thì giữ lại và được điểm.',
  defaultPairs: KANA_PAIRS,
  sample: ['# Mẫu cặp thẻ — mỗi dòng 1 cặp:', '# mặt A | mặt B', HELP, 'あ | a', '猫 | ねこ'].join('\n')
});

// ---------- Tiếng Trung ----------

export const pinyinReadingGame = createAnswerGame({
  id: 'docPinyin',
  title: 'Đọc Pinyin 🀄',
  category: 'chinese',
  accent: '#dc2626',
  aliases: ['pinyin', 'doctrung'],
  headlineStyle: 'boss',
  howTo: 'Màn hình hiện chữ Hán: gõ pinyin (có dấu thanh, số thanh hoặc không dấu đều được — nǐ hǎo = ni3hao3 = nihao).',
  commands: [{ usage: 'nihao', description: 'Gõ pinyin, dấu thanh không bắt buộc' }],
  bankLabel: 'Chữ / từ',
  bankHint: 'Mỗi dòng: chữ Hán | pinyin[/cách khác] | nghĩa tiếng Việt.',
  defaultBank: CHINESE_WORDS_BANK,
  defaultScoring: 'all',
  sample: ['# Mẫu tiếng Trung — mỗi dòng 1 từ (dùng cho Đọc Pinyin và Từ vựng):', '# chữ Hán | pinyin | nghĩa tiếng Việt', HELP, '你好 | nǐ hǎo | xin chào', '猫 | māo | con mèo'].join('\n'),
  match: CHINESE_MATCH,
  parse: pinyinItem,
  present: (item) => item.prompt,
  hint: (item) => (item.hint ? t('Nghĩa: {meaning} • Gõ pinyin', { meaning: item.hint }) : t('Gõ pinyin'))
});

export const chineseVocabGame = createAnswerGame({
  id: 'tuVungTrung',
  title: 'Từ vựng tiếng Trung 🐉',
  category: 'chinese',
  accent: '#b91c1c',
  aliases: ['tuvungtrung', 'trung'],
  howTo: 'Màn hình hiện nghĩa tiếng Việt: gõ từ tiếng Trung (chữ Hán hoặc pinyin đều được).',
  commands: [{ usage: '你好 / nihao', description: 'Gõ chữ Hán hoặc pinyin' }],
  bankLabel: 'Từ vựng',
  bankHint: 'Mỗi dòng: chữ Hán | pinyin | nghĩa tiếng Việt.',
  defaultBank: CHINESE_WORDS_BANK,
  defaultScoring: 'all',
  sample: ['# Mẫu tiếng Trung — mỗi dòng 1 từ:', '# chữ Hán | pinyin | nghĩa tiếng Việt', HELP, '谢谢 | xiè xie | cảm ơn', '水 | shuǐ | nước'].join('\n'),
  match: CHINESE_MATCH,
  parse: chineseVocabItem,
  present: (item) => `🇻🇳 ${item.prompt}`,
  hint: () => t('Gõ tiếng Trung: chữ Hán hoặc pinyin')
});

export const chineseQuizGame = createQuizGame({
  id: 'quizTrung',
  title: 'Quiz tiếng Trung 🏮',
  category: 'chinese',
  accent: '#ef4444',
  aliases: ['quiztrung', 'cquiz'],
  defaultPreset: 'cn',
  presets: { cn: { label: 'Tiếng Trung cơ bản (HSK 1)', bank: CHINESE_QUIZ_BANK } },
  sample: QUIZ_SAMPLE
});

export const hanziMemoryGame = createMemoryGame({
  id: 'ghepHan',
  title: 'Ghép cặp chữ Hán 🧧',
  category: 'chinese',
  accent: '#e11d48',
  aliases: ['ghephan', 'hanzimemory'],
  howTo: 'Thẻ úp giấu chữ Hán và nghĩa tiếng Việt. Comment 2 số (vd "3 8") để lật: đúng cặp (猫 – mèo) thì giữ lại và được điểm.',
  defaultPairs: HANZI_PAIRS,
  sample: ['# Mẫu cặp thẻ — mỗi dòng 1 cặp:', '# mặt A | mặt B', HELP, '猫 | mèo', '水 | nước'].join('\n')
});
