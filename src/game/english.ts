/**
 * English helpers for the English-teaching games. Viewer text is only
 * normalized and compared; it is never executed or used as a path/URL.
 */

export interface EnglishDictionary {
  words: Set<string>;
  builtinCount: number;
  importedCount: number;
}

/** Lowercase, straight apostrophes removed, punctuation stripped, single spaces. */
export function normalizeEnglish(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when a comment looks like an English answer attempt (not a !command, not a number). */
export function isEnglishAttempt(text: string): boolean {
  const trimmed = text.normalize('NFKC').replace(/[’`]/g, "'").trim();
  if (!trimmed || trimmed.startsWith('!') || trimmed.length > 80) return false;
  // Vietnamese (or any non-ASCII) text is ordinary chat, not an English answer.
  if (/[^\x20-\x7E]/.test(trimmed)) return false;
  return /^[a-z][a-z ]*$/.test(normalizeEnglish(trimmed));
}

/** Splits "car/automobile" into normalized aliases. */
export function aliases(field: string): string[] {
  return field.split('/').map(normalizeEnglish).filter(Boolean);
}

/** Exact alias match, optionally tolerant of a plural "s"/"es". */
export function matchesAlias(input: string, options: string[], allowPlural = false): boolean {
  if (options.includes(input)) return true;
  if (!allowPlural) return false;
  const singular = input.endsWith('es') ? [input.slice(0, -2), input.slice(0, -1)] : input.endsWith('s') ? [input.slice(0, -1)] : [];
  return singular.some((candidate) => options.includes(candidate));
}

/** Cheap sanity check for free-form English words when no dictionary is loaded. */
export function looksLikeEnglishWord(word: string, minLength: number): boolean {
  return word.length >= minLength && word.length <= 24 && /^[a-z]+$/.test(word) && /[aeiouy]/.test(word) && !/(.)\1\1/.test(word);
}

export function parseEnglishDictionary(text: string, limit = 300_000): string[] {
  const words = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const word = normalizeEnglish(line);
    if (/^[a-z]{2,24}$/.test(word)) words.add(word);
    if (words.size >= limit) break;
  }
  return [...words];
}

export function buildEnglishDictionary(imported: string[]): EnglishDictionary {
  const words = new Set<string>(BUILTIN_ENGLISH_WORDS);
  for (const word of imported) words.add(word);
  return { words, builtinCount: BUILTIN_ENGLISH_WORDS.length, importedCount: imported.length };
}

/** Common A1–A2 words; starting words for Word Chain (EN) and its basic dictionary. */
export const BUILTIN_ENGLISH_WORDS: string[] = [
  'apple', 'egg', 'giraffe', 'elephant', 'tiger', 'rabbit', 'table', 'eraser', 'river', 'rain', 'night', 'teacher',
  'rice', 'eagle', 'ear', 'red', 'dog', 'goat', 'tree', 'east', 'tomato', 'orange', 'eye', 'yellow', 'window', 'water',
  'road', 'desk', 'kitchen', 'nose', 'student', 'train', 'nurse', 'english', 'house', 'earth', 'hand', 'door', 'rose',
  'engine', 'snake', 'lemon', 'name', 'music', 'cat', 'tea', 'animal', 'lion', 'noodle', 'pencil', 'lamp', 'pen',
  'number', 'rainbow', 'wind', 'duck', 'kite', 'bread', 'dance', 'family', 'yard', 'doctor', 'room', 'moon', 'mango',
  'ocean', 'nest', 'teeth', 'hat', 'town', 'nine', 'island', 'dinner', 'ruler', 'robot', 'truck', 'king', 'garden',
  'lake', 'milk', 'kangaroo', 'owl', 'leg', 'grape', 'monkey', 'young', 'green', 'salad', 'dream', 'mouse', 'eight',
  'tennis', 'summer', 'river', 'banana', 'arm', 'mother', 'father', 'brother', 'sister', 'friend', 'dress', 'school',
  'library', 'yogurt', 'tent', 'toy', 'yes', 'sun', 'nice', 'cake', 'ship', 'pizza', 'airport', 'turtle', 'office',
  'chair', 'rabbit', 'taxi', 'ice', 'cloud', 'drum', 'map', 'piano', 'onion', 'net', 'star', 'rocket', 'teapot', 'tiger',
  'ring', 'goose', 'clock', 'key', 'yellow', 'watch', 'hospital', 'lunch', 'horse', 'shoe', 'beach', 'hair', 'face',
  'foot', 'tooth', 'head', 'dolphin', 'north', 'hotel', 'love', 'village', 'guitar', 'bird', 'dad', 'mom', 'money',
  'city', 'sky', 'snow', 'winter', 'spring', 'autumn', 'week', 'month', 'year', 'morning', 'evening', 'happy', 'sad',
  'big', 'small', 'fast', 'slow', 'hot', 'cold', 'old', 'new', 'good', 'bad', 'easy', 'hard', 'long', 'short', 'tall',
  'run', 'walk', 'swim', 'read', 'write', 'sing', 'play', 'eat', 'drink', 'sleep', 'cook', 'draw', 'jump', 'listen',
  'speak', 'learn', 'teach', 'open', 'close', 'buy', 'sell', 'give', 'take', 'come', 'go', 'see', 'look', 'watch'
].filter((word, index, all) => all.indexOf(word) === index);
