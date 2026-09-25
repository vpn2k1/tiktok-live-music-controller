/**
 * AI question generation (Gemini, Groq, Grok/xAI), shared by main and renderer.
 *
 * Security model:
 * - API keys live only in Electron main (encrypted with safeStorage); the
 *   renderer sets or clears them and sees only whether one is saved.
 * - Main talks only to the fixed endpoints below; the renderer sends a
 *   structured request (format, topic, count…), never a URL or a raw prompt.
 * - AI output is untrusted text: it becomes bank lines, checked by the game's
 *   own parser and reviewed by the streamer; it is never executed.
 */

export type AiProvider = 'gemini' | 'groq' | 'xai';

export interface AiProviderInfo {
  id: AiProvider;
  label: string;
  defaultModel: string;
  /** Where to create a key (shown as text; the app never opens URLs). */
  keyUrl: string;
}

export const AI_PROVIDERS: AiProviderInfo[] = [
  { id: 'gemini', label: 'Google Gemini', defaultModel: 'gemini-2.5-flash', keyUrl: 'aistudio.google.com/apikey' },
  { id: 'groq', label: 'Groq', defaultModel: 'llama-3.3-70b-versatile', keyUrl: 'console.groq.com/keys' },
  { id: 'xai', label: 'Grok (xAI)', defaultModel: 'grok-3-mini', keyUrl: 'console.x.ai' }
];

export function isAiProvider(value: unknown): value is AiProvider {
  return value === 'gemini' || value === 'groq' || value === 'xai';
}

export function providerInfo(provider: AiProvider): AiProviderInfo {
  return AI_PROVIDERS.find((item) => item.id === provider) ?? (AI_PROVIDERS[0] as AiProviderInfo);
}

export interface AiProviderStatus {
  hasKey: boolean;
  /** Last characters of the saved key ("…a1b2"), to tell keys apart. */
  hint: string | null;
  model: string;
}

export interface AiStatus {
  active: AiProvider;
  providers: Record<AiProvider, AiProviderStatus>;
  /** false: the OS can't encrypt (e.g. Linux without a keyring); keys last only until the app closes. */
  persistent: boolean;
}

export type AiErrorCode = 'no-key' | 'bad-key' | 'bad-request' | 'quota' | 'network' | 'timeout' | 'empty' | 'provider' | 'storage';

export type AiResult<T extends object = object> = ({ ok: true } & T) | { ok: false; code: AiErrorCode; detail?: string };

/** API keys: printable ASCII without spaces (pasting often adds spaces / new lines). */
export function sanitizeKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.replace(/\s+/g, '');
  return /^[\x21-\x7e]{16,400}$/.test(key) ? key : null;
}

/** Model ids like "gemini-2.5-flash", "openai/gpt-oss-120b". */
export function sanitizeModel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const model = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/.test(model) && !model.includes('..') ? model : null;
}

export function keyHint(key: string): string {
  return `…${key.slice(-4)}`;
}

export type AiDifficulty = 'easy' | 'medium' | 'hard';
/** "sample": same language(s) as the bank's example lines. */
export type AiContentLanguage = 'sample' | 'vi' | 'en';

export interface AiGenerateRequest {
  /** Game title and how-to, for context. */
  game: string;
  /** The bank's line format: its sample file ("#" lines are instructions, others are examples). */
  format: string;
  topic: string;
  count: number;
  difficulty: AiDifficulty;
  language: AiContentLanguage;
  /** Items already in the bank (first field), so the AI doesn't repeat them. */
  existing: string[];
}

export const AI_MAX_COUNT = 50;

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : '';
}

/** Validates and clamps a request from the renderer. */
export function normalizeGenerateRequest(raw: unknown): AiGenerateRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const format = text(record.format, 4000);
  const count = Math.round(Number(record.count));
  if (!format || !Number.isFinite(count)) return null;
  const difficulty = record.difficulty === 'easy' || record.difficulty === 'hard' ? record.difficulty : 'medium';
  const language = record.language === 'vi' || record.language === 'en' ? record.language : 'sample';
  const existing = Array.isArray(record.existing)
    ? record.existing.map((item) => text(item, 80)).filter(Boolean).slice(0, 60)
    : [];
  return {
    game: text(record.game, 600),
    format,
    topic: text(record.topic, 200),
    count: Math.min(AI_MAX_COUNT, Math.max(1, count)),
    difficulty,
    language,
    existing
  };
}

const DIFFICULTY_TEXT: Record<AiDifficulty, string> = {
  easy: 'easy (beginners, children, general audience)',
  medium: 'medium (general audience)',
  hard: 'hard (for enthusiasts)'
};

const LANGUAGE_TEXT: Record<AiContentLanguage, string> = {
  sample: 'Use the same language(s) as the example lines, column by column.',
  vi: 'Write the text in Vietnamese (with correct diacritics), keeping the column structure of the examples.',
  en: 'Write the text in English, keeping the column structure of the examples.'
};

export function buildPrompt(request: AiGenerateRequest): { system: string; user: string } {
  const system = [
    'You write content banks for interactive games on live streams.',
    'Output ONLY data lines in the exact format described: one item per line.',
    'No numbering, bullets, headings, explanations, blank lines or code fences.',
    'Fields are separated by " | ". Never use the "|" character inside a field.',
    'Facts must be correct and every answer must be unambiguous. Keep lines short enough to read on a phone.',
    'Content must be friendly for all ages.'
  ].join(' ');
  const user = [
    request.game ? `Game: ${request.game}` : '',
    'Line format (lines starting with # are instructions, the other lines are examples):',
    request.format,
    '',
    `Write ${request.count} NEW lines${request.topic ? ` about the topic: "${request.topic}"` : ' on varied, general topics'}.`,
    `Difficulty: ${DIFFICULTY_TEXT[request.difficulty]}.`,
    LANGUAGE_TEXT[request.language],
    request.existing.length ? `Do not repeat these existing items: ${request.existing.join('; ')}` : ''
  ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n').trim();
  return { system, user };
}

/** Turns a reply into candidate bank lines (strips fences, numbering, bullets; dedupes). */
export function cleanGeneratedLines(reply: string): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of reply.replace(/\r\n?/g, '\n').split('\n')) {
    let line = raw.trim();
    if (!line || line.startsWith('```') || line.startsWith('#')) continue;
    line = line
      .replace(/^(?:[-*•]\s+|\d{1,3}[.)]\s+)/, '')
      .replace(/\t/g, ' | ')
      .replace(/\s*\|\s*/g, ' | ')
      .replace(/^\|\s*|\s*\|$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 500);
    const key = line.toLowerCase();
    if (!line || seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return lines;
}

/** The HTTP request for one generation. The key goes in a header, never in the URL. */
export function providerRequest(provider: AiProvider, model: string, key: string, prompt: { system: string; user: string }): {
  url: string;
  headers: Record<string, string>;
  body: string;
} {
  if (provider === 'gemini') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 8192 }
      })
    };
  }
  const base = provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.x.ai/v1';
  return {
    url: `${base}/chat/completions`,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ]
    })
  };
}

/** Fixed hosts main may call (checked again before every request). */
export const AI_HOSTS = ['generativelanguage.googleapis.com', 'api.groq.com', 'api.x.ai'];

/** Generated text from a provider's JSON reply, or null. */
export function parseProviderResponse(provider: AiProvider, json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  if (provider === 'gemini') {
    const candidates = (json as { candidates?: { content?: { parts?: { text?: unknown; thought?: unknown }[] } }[] }).candidates;
    const parts = candidates?.[0]?.content?.parts ?? [];
    const out = parts.filter((part) => typeof part.text === 'string' && !part.thought).map((part) => part.text as string).join('');
    return out.trim() ? out : null;
  }
  const choices = (json as { choices?: { message?: { content?: unknown } }[] }).choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === 'string' && content.trim() ? content : null;
}

/** Error code for a failed HTTP reply (the provider's own message goes in `detail`). */
export function providerErrorCode(status: number, detail = ''): AiErrorCode {
  // Gemini answers a wrong key with 400 "API key not valid".
  if (status === 401 || status === 403 || /api[_ ]?key/i.test(detail)) return 'bad-key';
  if (status === 429) return 'quota';
  if (status === 400 || status === 404 || status === 422) return 'bad-request';
  return 'provider';
}

/** The provider's error message from its JSON reply (never contains our key). */
export function providerErrorDetail(json: unknown): string | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const error = (json as { error?: unknown }).error;
  const message = typeof error === 'string' ? error : error && typeof error === 'object' ? (error as { message?: unknown }).message : undefined;
  return typeof message === 'string' ? message.slice(0, 300) : undefined;
}
