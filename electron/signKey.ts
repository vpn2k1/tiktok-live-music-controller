import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import { SignConfig } from 'tiktok-live-connector';
import { keyHint, sanitizeKey } from '../src/shared/ai';
import type { SignKeyStatus } from '../src/shared/types';

/**
 * Euler Stream API key (TikTok LIVE signing, see docs/TIKTOK.md). Same model
 * as the AI keys: encrypted with the OS, kept in main, the renderer only sees
 * `hasKey` + the last 4 characters. The SIGN_API_KEY environment variable
 * still works and wins over the saved key.
 */
const ENV_KEY = sanitizeKey(process.env.SIGN_API_KEY);

let loaded = false;
let encrypted: string | null = null;
/** Key that couldn't be encrypted (kept only until the app quits). */
let sessionKey: string | null = null;

function keyFile(): string {
  return path.join(app.getPath('userData'), 'tiktok-sign.json');
}

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(keyFile(), 'utf8'));
    const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).key : null;
    encrypted = typeof value === 'string' ? value : null;
  } catch {
    encrypted = null;
  }
}

function savedKey(): string | null {
  if (sessionKey) return sessionKey;
  load();
  if (!encrypted || !canEncrypt()) return null;
  try {
    return sanitizeKey(safeStorage.decryptString(Buffer.from(encrypted, 'base64')));
  } catch {
    return null;
  }
}

/** The key connections use: the environment variable first, then the saved one. */
export function signApiKey(): string | null {
  return ENV_KEY ?? savedKey();
}

/** Applies the current key to the connector (its Euler client is cached, so drop it to pick up a change). */
export function applySignKey(): void {
  const key = signApiKey();
  const config = SignConfig as { apiKey?: string; cachedInstance?: unknown };
  if (config.apiKey === (key ?? undefined)) return;
  config.apiKey = key ?? undefined;
  config.cachedInstance = undefined;
}

export function signKeyStatus(): SignKeyStatus {
  const key = signApiKey();
  return { hasKey: key != null, hint: key ? keyHint(key) : null, fromEnv: ENV_KEY != null, persistent: canEncrypt() };
}

/** Saves (or with null, removes) the key. */
export function setSignKey(rawKey: unknown): { ok: boolean; status: SignKeyStatus; error?: string } {
  load();
  if (rawKey === null) {
    encrypted = null;
    sessionKey = null;
  } else {
    const key = sanitizeKey(rawKey);
    if (!key) return { ok: false, status: signKeyStatus(), error: 'Key không hợp lệ (16–400 ký tự, không dấu cách).' };
    if (canEncrypt()) {
      encrypted = safeStorage.encryptString(key).toString('base64');
      sessionKey = null;
    } else {
      sessionKey = key;
    }
  }
  try {
    fs.mkdirSync(path.dirname(keyFile()), { recursive: true });
    fs.writeFileSync(keyFile(), JSON.stringify({ key: encrypted }), { encoding: 'utf8', mode: 0o600 });
  } catch {
    if (!sessionKey && rawKey !== null) return { ok: false, status: signKeyStatus(), error: 'Không lưu được key.' };
  }
  applySignKey();
  return { ok: true, status: signKeyStatus() };
}
