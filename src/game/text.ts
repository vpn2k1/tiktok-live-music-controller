/**
 * Vietnamese-friendly answer matching: accents, "đ", case, spaces and
 * punctuation don't matter ("Bánh Chưng" = "banh chung" = "BANHCHUNG").
 */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** "cái hố/cái lỗ" → ["caiho", "cailo"]: every "/" alternative, folded. */
export function foldedAliases(field: string): string[] {
  return field.split('/').map(foldText).filter(Boolean);
}

/** Spaces and punctuation (Latin and CJK) that never matter in an answer. */
const ANSWER_NOISE = /[\s'’"“”`.,!?;:()（）、。，！？；：「」『』・\-–—_/\\]/g;

/**
 * Japanese answer matching: full-width → half-width, katakana = hiragana
 * ("ネコ" = "ねこ"), romaji without macrons ("kōhī" = "kohi"), no spaces.
 */
export function foldJapanese(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .replace(ANSWER_NOISE, '');
}

/**
 * Chinese answer matching: pinyin with tone marks, tone numbers or none
 * ("nǐ hǎo" = "ni3 hao3" = "nihao"), "v" for "ü"; characters stay as typed.
 */
export function foldChinese(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .replace(/v/g, 'u')
    .replace(/[0-9]/g, '')
    .replace(ANSWER_NOISE, '');
}
