import { EN } from './i18n-en';

/**
 * App language (controller UI, overlay, game texts). Vietnamese is the source
 * language: `t()` takes the Vietnamese text as the key and returns the English
 * entry from `i18n-en.ts` when the language is English.
 *
 * - `{name}` placeholders are filled from `params`.
 * - Numbers need no placeholder: "Còn 5 dây" finds the entry "Còn {0} dây".
 *
 * The language is module state (one language per window), so pure game code
 * can translate without threading it through every call; views that depend on
 * it re-render when it changes.
 */
export type Language = 'vi' | 'en';

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'vi', label: '🇻🇳 VI' },
  { id: 'en', label: '🇬🇧 EN' }
];

/** localStorage key of the controller's chosen language. */
export const LANGUAGE_STORAGE_KEY = 'app-language';

let current: Language = 'vi';
const listeners = new Set<() => void>();

export function setLanguage(language: unknown): void {
  const next: Language = language === 'en' ? 'en' : 'vi';
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

/** For `useLanguage` (React re-renders on change). */
export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLanguage(): Language {
  return current;
}

/** Locale for numbers and dates in the current language (1.440 / 1,440). */
export function numberLocale(): string {
  return current === 'en' ? 'en-US' : 'vi-VN';
}

export function isLanguage(value: unknown): value is Language {
  return value === 'vi' || value === 'en';
}

type Params = Record<string, string | number>;

function fill(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** Numbers (1.440, 3/6, 12,5) in a text, and the text with them replaced by {0}, {1}… */
const NUMBER = /\d+(?:[.,]\d+)*/g;

function numberTemplate(text: string): { key: string; numbers: string[] } | null {
  const numbers = text.match(NUMBER);
  if (!numbers) return null;
  let index = 0;
  return { key: text.replace(NUMBER, () => `{${index++}}`), numbers };
}

/** English entry for a Vietnamese text (exact, or with its numbers as {0}, {1}…). */
export function lookup(text: string): string | undefined {
  const exact = EN[text];
  if (exact !== undefined) return exact;
  const template = numberTemplate(text);
  if (!template) return undefined;
  const entry = EN[template.key];
  return entry === undefined ? undefined : entry.replace(/\{(\d+)\}/g, (_, i: string) => template.numbers[Number(i)] ?? '');
}

export function t(text: string, params?: Params): string {
  if (current === 'vi') return fill(text, params);
  return fill(lookup(text) ?? text, params);
}
