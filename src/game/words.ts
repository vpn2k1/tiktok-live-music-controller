/**
 * Vietnamese word helpers for Nối chữ / Ai nhanh tay. Viewer text is only
 * normalized and compared; it is never executed or used as a path/URL.
 */

// Tone marks in NFD form: huyền, sắc, ngã, hỏi, nặng.
const TONE_MARKS = /[\u0300\u0301\u0303\u0309\u0323]/g;
const ONSET = '(?:ngh|ng|gh|gi|ch|kh|nh|ph|qu|th|tr|b|c|d|đ|g|h|k|l|m|n|p|r|s|t|v|x)?';
const NUCLEUS = '[aăâeêioôơuưy]{1,3}';
const CODA = '(?:ch|ng|nh|c|m|n|p|t)?';
const SYLLABLE_RE = new RegExp(`^${ONSET}${NUCLEUS}${CODA}$`);

export interface WordDictionary {
  words: Set<string>;
  builtinCount: number;
  importedCount: number;
}

/** NFC, lowercase, trimmed, single spaces. */
export function normalizeText(text: string): string {
  return text.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Approximate Vietnamese phonotactics: optional onset, 1–3 vowel nucleus,
 * optional coda, at most one tone mark. Rejects most English/gibberish.
 */
export function isVietnameseSyllable(syllable: string): boolean {
  if (!syllable || syllable.length > 8) return false;
  const decomposed = syllable.normalize('NFD');
  if ((decomposed.match(TONE_MARKS)?.length ?? 0) > 1) return false;
  const base = decomposed.replace(TONE_MARKS, '').normalize('NFC');
  return SYLLABLE_RE.test(base);
}

/** Returns the two syllables of a valid 2-syllable word, else null. */
export function twoSyllables(text: string): [string, string] | null {
  const parts = normalizeText(text).split(' ');
  if (parts.length !== 2) return null;
  const [first, second] = parts as [string, string];
  return isVietnameseSyllable(first) && isVietnameseSyllable(second) ? [first, second] : null;
}

/** Parses an imported dictionary (one entry per line); keeps 2-syllable words only. */
export function parseDictionary(text: string, limit = 200_000): string[] {
  const words = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const syllables = twoSyllables(line);
    if (syllables) words.add(syllables.join(' '));
    if (words.size >= limit) break;
  }
  return [...words];
}

export function buildDictionary(imported: string[]): WordDictionary {
  const words = new Set<string>(BUILTIN_WORDS);
  for (const word of imported) words.add(word);
  return { words, builtinCount: BUILTIN_WORDS.length, importedCount: imported.length };
}

/** Common 2-syllable words; used for starting words and Ai nhanh tay. */
export const BUILTIN_WORDS: string[] = [
  'âm nhạc', 'nhạc sĩ', 'sĩ quan', 'quan tâm', 'tâm hồn', 'hồn nhiên', 'nhiên liệu', 'liệu pháp', 'pháp luật', 'luật sư',
  'sư tử', 'tử tế', 'tế bào', 'bào ngư', 'ngư dân', 'dân ca', 'ca sĩ', 'sĩ tử', 'ca khúc', 'khúc hát',
  'hát ru', 'ru ngủ', 'ngủ ngon', 'ngon miệng', 'miệng cười', 'cười tươi', 'tươi mát', 'mát mẻ', 'mẻ cá', 'cá voi',
  'voi con', 'con mèo', 'mèo con', 'con đường', 'đường phố', 'phố cổ', 'cổ tích', 'tích cực', 'cực kỳ', 'kỳ diệu',
  'diệu kỳ', 'kỳ nghỉ', 'nghỉ ngơi', 'ngơi nghỉ', 'bạn bè', 'bè phái', 'phái đẹp', 'đẹp trai', 'trai tráng', 'tráng miệng',
  'học sinh', 'sinh viên', 'viên phấn', 'phấn khởi', 'khởi đầu', 'đầu bếp', 'bếp núc', 'núc ních', 'sinh nhật', 'nhật ký',
  'ký ức', 'ức chế', 'chế biến', 'biến hình', 'hình ảnh', 'ảnh hưởng', 'hưởng thụ', 'thụ động', 'động vật', 'vật lý',
  'lý do', 'do dự', 'dự án', 'án mạng', 'xã hội', 'hội họa', 'họa sĩ', 'sĩ diện', 'diện mạo',
  'mạo hiểm', 'hiểm nguy', 'nguy hiểm', 'hiểm họa', 'mùa xuân', 'xuân sắc', 'sắc đẹp', 'đẹp đẽ', 'mùa hè', 'hè phố',
  'phố xá', 'xá lợi', 'lợi ích', 'ích kỷ', 'kỷ niệm', 'niệm phật', 'mùa thu', 'thu hoạch', 'hoạch định', 'định mệnh',
  'mệnh lệnh', 'lệnh bài', 'bài hát', 'hát hò', 'hò hét', 'bài học', 'học hành', 'hành động', 'động lực', 'lực sĩ',
  'hoa hồng', 'hồng hào', 'hào hoa', 'hoa mai', 'mai mối', 'mối tình', 'tình yêu', 'yêu thương', 'thương nhớ', 'nhớ nhung',
  'nhung lụa', 'lụa là', 'tình bạn', 'bạn thân', 'thân thiện', 'thiện chí', 'chí hướng', 'hướng dẫn', 'dẫn đường', 'đường đi',
  'đi học', 'học tập', 'tập thể', 'thể thao', 'thao tác', 'tác giả', 'giả vờ', 'vờ vịt', 'trái tim', 'tim đèn',
  'đèn pin', 'pin sạc', 'bầu trời', 'trời xanh', 'xanh lá', 'lá cây', 'cây cối', 'cây đàn', 'đàn ông', 'ông bà',
  'bà con', 'con cái', 'cái đẹp', 'mặt trời', 'mặt trăng', 'trăng rằm', 'ánh sáng', 'sáng tạo', 'tạo hình', 'hình dáng',
  'dáng vẻ', 'vẻ đẹp', 'đẹp lòng', 'lòng tin', 'tin tức', 'tức giận', 'giận hờn', 'hờn dỗi', 'nước mắt', 'mắt kính',
  'kính trọng', 'trọng tài', 'tài năng', 'năng lượng', 'lượng tử', 'gia đình', 'đình chùa', 'chùa chiền', 'quê hương', 'hương vị',
  'vị trí', 'trí tuệ', 'tuệ nhãn', 'cà phê', 'phê bình', 'bình yên', 'yên tĩnh', 'tĩnh lặng', 'lặng im', 'im lặng',
  'lặng lẽ', 'bánh mì', 'mì tôm', 'tôm hùm', 'bánh chưng', 'chưng cất', 'cất cánh', 'cánh đồng', 'đồng hồ', 'hồ nước',
  'nước ngọt', 'ngọt ngào', 'ngào ngạt', 'điện thoại', 'cảnh sát', 'sát thủ', 'thủ môn', 'môn học', 'học giả',
  'bóng đá', 'đá quý', 'quý giá', 'giá trị', 'trị liệu', 'máy bay', 'bay bổng', 'bổng lộc', 'lộc non',
  'non nước', 'nước non', 'thời gian', 'gian nan', 'nan giải', 'giải thưởng', 'thưởng thức', 'thức ăn', 'ăn uống', 'uống nước',
  'sân khấu', 'khấu trừ', 'trừ tà', 'tà áo', 'áo dài', 'dài dòng', 'dòng sông', 'sông núi', 'núi rừng', 'rừng cây',
  'tiếng hát', 'hát xẩm', 'giọng ca', 'ca dao', 'dao kéo', 'kéo co', 'co giãn', 'giãn cách', 'cách mạng', 'mạng lưới',
  'nhịp điệu', 'điệu nhảy', 'nhảy múa', 'múa lân', 'lân la', 'la bàn', 'bàn phím', 'phím đàn', 'đàn bầu', 'bầu bạn',
  'giai điệu', 'điệu đà', 'đà điểu', 'hòa nhạc', 'nhạc cụ', 'cụ thể', 'thể loại', 'loại trừ', 'trừ phi', 'phi công',
  'công việc', 'việc làm', 'làm việc', 'việc nhà', 'nhà cửa', 'cửa sổ', 'sổ tay', 'tay chân', 'chân thành', 'thành công',
  'công chúa', 'chúa tể', 'tể tướng', 'tướng quân', 'quân đội', 'đội bóng', 'bóng đèn', 'đèn đỏ', 'đỏ mặt', 'mặt nạ'
];
