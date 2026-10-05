import { checkBankLines, type BankReport } from './bankFile';
import { EN_VOCAB_SETS } from './content/vocab-en';
import { JA_VOCAB_SETS } from './content/vocab-ja';
import { ZH_VOCAB_SETS } from './content/vocab-zh';
import { normalizeEnglish } from './english';
import { foldChinese, foldJapanese } from './text';

/**
 * Vocabulary shared by the word games that work in English, Japanese and
 * Chinese (Lô tô, Cờ caro, Ai là triệu phú…). The built-in sets come from the
 * VpngoPlay decks (scripts/import-vpngoplay.mjs).
 *
 * Bank lines: English "word[/alt] | nghĩa"; Japanese "語 | kana/romaji | nghĩa";
 * Chinese "汉字 | pinyin | nghĩa".
 */
export type VocabLang = 'en' | 'ja' | 'zh';

export interface VocabWord {
  /** The foreign word as written (cat, 猫, 你好). */
  term: string;
  /** Kana / romaji / pinyin, first form only ('' for English). */
  reading: string;
  meaning: string;
  /** Folded forms a viewer may type (word, readings). */
  answers: string[];
}

export interface VocabPreset {
  label: string;
  lang: VocabLang;
  bank: string;
}

const FLAGS: Record<VocabLang, string> = { en: '🇬🇧', ja: '🇯🇵', zh: '🇨🇳' };

function presetsOf(lang: VocabLang, sets: Record<string, { label: string; bank: string }>): Record<string, VocabPreset> {
  return Object.fromEntries(Object.entries(sets).map(([key, set]) => [key, { label: `${FLAGS[lang]} ${set.label}`, lang, bank: set.bank }]));
}

export const EN_VOCAB_PRESETS = presetsOf('en', EN_VOCAB_SETS);
export const JA_VOCAB_PRESETS = presetsOf('ja', JA_VOCAB_SETS);
export const ZH_VOCAB_PRESETS = presetsOf('zh', ZH_VOCAB_SETS);
export const VOCAB_PRESETS: Record<string, VocabPreset> = { ...EN_VOCAB_PRESETS, ...JA_VOCAB_PRESETS, ...ZH_VOCAB_PRESETS };

/** Plain "word | nghĩa" banks of one language (presets of the single-language games). */
export function bankPresets(presets: Record<string, VocabPreset>): Record<string, { label: string; bank: string }> {
  return Object.fromEntries(Object.entries(presets).map(([key, preset]) => [key, { label: preset.label, bank: preset.bank }]));
}

export function foldFor(lang: VocabLang): (text: string) => string {
  if (lang === 'ja') return foldJapanese;
  if (lang === 'zh') return foldChinese;
  return (text) => normalizeEnglish(text).replace(/ /g, '');
}

/** One bank line → a word; null for lines of another shape. */
export function parseVocabLine(line: string, lang: VocabLang): VocabWord | null {
  const parts = line.split('|').map((part) => part.trim());
  if (line.trim().startsWith('#') || parts.some((part) => part.length > 120)) return null;
  const fold = foldFor(lang);
  if (lang === 'en') {
    if (parts.length !== 2) return null;
    const [english = '', meaning = ''] = parts;
    const answers = english.split('/').map(fold).filter(Boolean);
    const term = english.split('/')[0]?.trim() ?? '';
    return term && meaning && answers.length ? { term, reading: '', meaning, answers } : null;
  }
  if (parts.length !== 3) return null;
  const [term = '', readings = '', meaning = ''] = parts;
  const forms = readings.split('/').map((reading) => reading.trim()).filter(Boolean);
  const answers = [...new Set([fold(term), ...forms.map(fold)].filter(Boolean))];
  return term && meaning && forms.length ? { term, reading: forms[0] ?? '', meaning, answers } : null;
}

export function parseVocab(text: string, lang: VocabLang): VocabWord[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const word = parseVocabLine(line, lang);
    return word ? [word] : [];
  });
}

/** The streamer's own lines when there are any (in the preset's language), else the preset. */
export function vocabBank(config: { preset: string; bank: string }, presets: Record<string, VocabPreset> = VOCAB_PRESETS): { lang: VocabLang; words: VocabWord[] } {
  const preset = presets[config.preset] ?? Object.values(presets)[0];
  const lang = preset?.lang ?? 'en';
  const own = parseVocab(config.bank, lang);
  return { lang, words: own.length ? own : parseVocab(preset?.bank ?? '', lang) };
}

/** "猫 (ねこ)", "你好 (nǐ hǎo)", "cat". */
export function termWithReading(word: VocabWord): string {
  return word.reading && word.reading !== word.term ? `${word.term} (${word.reading})` : word.term;
}

/** Settings shared by the vocabulary games: built-in set + own lines. */
export function vocabSettings(presets: Record<string, VocabPreset> = VOCAB_PRESETS) {
  return [
    {
      key: 'preset',
      label: 'Bộ từ có sẵn',
      type: 'select' as const,
      options: Object.entries(presets).map(([value, preset]) => ({ value, label: `${preset.label} · ${parseVocab(preset.bank, preset.lang).length} từ` }))
    },
    {
      key: 'bank',
      label: 'Từ vựng riêng (tuỳ chọn)',
      type: 'textarea' as const,
      maxLength: 500_000,
      hint: 'Để trống = dùng bộ có sẵn. Ngôn ngữ theo bộ có sẵn đang chọn. Tiếng Anh: từ | nghĩa; tiếng Nhật: 語 | kana/romaji | nghĩa; tiếng Trung: 汉字 | pinyin | nghĩa. Nhập được file .txt / .csv.',
      sample: [
        '# Mẫu từ vựng — mỗi dòng 1 từ, ngôn ngữ theo "Bộ từ có sẵn" đang chọn:',
        '# Tiếng Anh:  từ[/cách viết khác] | nghĩa tiếng Việt',
        '# Tiếng Nhật: chữ Nhật | kana/romaji | nghĩa tiếng Việt',
        '# Tiếng Trung: chữ Hán | pinyin | nghĩa tiếng Việt',
        '# - Dòng bắt đầu bằng # là ghi chú, app bỏ qua. Lưu file dạng UTF-8.',
        'cat | con mèo',
        'bicycle/bike | xe đạp'
      ].join('\n')
    }
  ];
}

/** A line in any of the three formats (Japanese and Chinese lines share one shape). */
export function isVocabLine(line: string): boolean {
  return parseVocabLine(line, 'en') != null || parseVocabLine(line, 'ja') != null;
}

/** checkBank for the vocabulary textareas. */
export function checkVocabBank(text: string): BankReport {
  return checkBankLines(text, isVocabLine);
}
