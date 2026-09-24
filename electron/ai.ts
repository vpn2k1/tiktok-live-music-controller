import fs from 'node:fs';
import path from 'node:path';
import { app, net, safeStorage } from 'electron';
import {
  AI_HOSTS,
  AI_PROVIDERS,
  buildPrompt,
  cleanGeneratedLines,
  isAiProvider,
  keyHint,
  normalizeGenerateRequest,
  parseProviderResponse,
  providerErrorCode,
  providerErrorDetail,
  providerInfo,
  providerRequest,
  sanitizeKey,
  sanitizeModel,
  type AiProvider,
  type AiResult,
  type AiStatus
} from '../src/shared/ai';

/**
 * AI keys and settings (see src/shared/ai.ts for the security model). Keys are
 * encrypted with the OS (Keychain on macOS, DPAPI on Windows) and never leave
 * main; when the OS can't encrypt, they are kept in memory for this session only.
 */
interface StoredAi {
  active: AiProvider;
  models: Partial<Record<AiProvider, string>>;
  /** base64 of safeStorage-encrypted keys. */
  keys: Partial<Record<AiProvider, string>>;
}

const REQUEST_TIMEOUT_MS = 90_000;
const MAX_REPLY_BYTES = 2 * 1024 * 1024;

let stored: StoredAi | null = null;
/** Keys that couldn't be encrypted (kept only until the app quits). */
const sessionKeys: Partial<Record<AiProvider, string>> = {};

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'ai-settings.json');
}

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function load(): StoredAi {
  if (stored) return stored;
  const empty: StoredAi = { active: 'gemini', models: {}, keys: {} };
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const models = record.models && typeof record.models === 'object' ? (record.models as Record<string, unknown>) : {};
    const keys = record.keys && typeof record.keys === 'object' ? (record.keys as Record<string, unknown>) : {};
    stored = { ...empty, active: isAiProvider(record.active) ? record.active : 'gemini' };
    for (const { id } of AI_PROVIDERS) {
      const model = sanitizeModel(models[id]);
      if (model) stored.models[id] = model;
      if (typeof keys[id] === 'string') stored.keys[id] = keys[id];
    }
  } catch {
    stored = empty;
  }
  return stored;
}

function save(): boolean {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(load(), null, 2), { encoding: 'utf8', mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

function readKey(provider: AiProvider): string | null {
  if (sessionKeys[provider]) return sessionKeys[provider] ?? null;
  const encrypted = load().keys[provider];
  if (!encrypted || !canEncrypt()) return null;
  try {
    return sanitizeKey(safeStorage.decryptString(Buffer.from(encrypted, 'base64')));
  } catch {
    return null;
  }
}

function modelOf(provider: AiProvider): string {
  return load().models[provider] ?? providerInfo(provider).defaultModel;
}

export function aiStatus(): AiStatus {
  const providers = {} as AiStatus['providers'];
  for (const { id } of AI_PROVIDERS) {
    const key = readKey(id);
    providers[id] = { hasKey: key != null, hint: key ? keyHint(key) : null, model: modelOf(id) };
  }
  return { active: load().active, providers, persistent: canEncrypt() };
}

/** Saves (or with null, removes) a provider's key. */
export function setAiKey(rawProvider: unknown, rawKey: unknown): AiResult<{ status: AiStatus }> {
  if (!isAiProvider(rawProvider)) return { ok: false, code: 'bad-request' };
  const data = load();
  if (rawKey === null) {
    delete data.keys[rawProvider];
    delete sessionKeys[rawProvider];
    return save() ? { ok: true, status: aiStatus() } : { ok: false, code: 'storage' };
  }
  const key = sanitizeKey(rawKey);
  if (!key) return { ok: false, code: 'bad-key', detail: 'format' };
  if (canEncrypt()) {
    data.keys[rawProvider] = safeStorage.encryptString(key).toString('base64');
    delete sessionKeys[rawProvider];
    if (!save()) return { ok: false, code: 'storage' };
  } else {
    sessionKeys[rawProvider] = key;
  }
  return { ok: true, status: aiStatus() };
}

/** Active provider and per-provider model ids ("" = back to the default model). */
export function setAiSettings(raw: unknown): AiResult<{ status: AiStatus }> {
  if (!raw || typeof raw !== 'object') return { ok: false, code: 'bad-request' };
  const record = raw as Record<string, unknown>;
  const data = load();
  if (record.active !== undefined) {
    if (!isAiProvider(record.active)) return { ok: false, code: 'bad-request' };
    data.active = record.active;
  }
  if (isAiProvider(record.provider) && record.model !== undefined) {
    if (record.model === '') {
      delete data.models[record.provider];
    } else {
      const model = sanitizeModel(record.model);
      if (!model) return { ok: false, code: 'bad-request', detail: 'model' };
      data.models[record.provider] = model;
    }
  }
  return save() ? { ok: true, status: aiStatus() } : { ok: false, code: 'storage' };
}

/** Removes the key (and any accidental echo of it) from a provider message. */
function redact(detail: string | undefined, key: string): string | undefined {
  return detail?.split(key).join('***');
}

async function callProvider(provider: AiProvider, prompt: { system: string; user: string }): Promise<AiResult<{ text: string }>> {
  const key = readKey(provider);
  if (!key) return { ok: false, code: 'no-key' };
  const request = providerRequest(provider, modelOf(provider), key, prompt);
  const url = new URL(request.url);
  if (url.protocol !== 'https:' || !AI_HOSTS.includes(url.hostname)) return { ok: false, code: 'bad-request' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await net.fetch(url.toString(), { method: 'POST', headers: request.headers, body: request.body, signal: controller.signal });
    const body = await response.text();
    if (body.length > MAX_REPLY_BYTES) return { ok: false, code: 'provider', detail: 'reply too large' };
    let json: unknown = null;
    try {
      json = JSON.parse(body);
    } catch {
      // Non-JSON error pages are reported by status below.
    }
    if (!response.ok) {
      const detail = redact(providerErrorDetail(json) ?? `HTTP ${response.status}`, key);
      return { ok: false, code: providerErrorCode(response.status, detail), detail };
    }
    const text = parseProviderResponse(provider, json);
    return text ? { ok: true, text } : { ok: false, code: 'empty' };
  } catch (error) {
    if (controller.signal.aborted) return { ok: false, code: 'timeout' };
    return { ok: false, code: 'network', detail: redact(error instanceof Error ? error.message : String(error), key) };
  } finally {
    clearTimeout(timer);
  }
}

/** Tiny request to check that a key and model work. */
export async function testAi(rawProvider: unknown): Promise<AiResult> {
  if (!isAiProvider(rawProvider)) return { ok: false, code: 'bad-request' };
  const result = await callProvider(rawProvider, { system: 'Reply with the single word: OK', user: 'Say OK.' });
  return result.ok ? { ok: true } : result;
}

/** Generates bank lines with the active provider. The renderer validates them against the game. */
export async function generateAi(raw: unknown): Promise<AiResult<{ lines: string[]; provider: AiProvider; model: string }>> {
  const request = normalizeGenerateRequest(raw);
  if (!request) return { ok: false, code: 'bad-request' };
  const provider = load().active;
  const result = await callProvider(provider, buildPrompt(request));
  if (!result.ok) return result;
  const lines = cleanGeneratedLines(result.text);
  return lines.length ? { ok: true, lines, provider, model: modelOf(provider) } : { ok: false, code: 'empty' };
}
