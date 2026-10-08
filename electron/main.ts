import { app, BrowserWindow, dialog, ipcMain, net, protocol, screen, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ControlEvent,
  TikTokLiveConnection,
  WebcastEvent
} from 'tiktok-live-connector';
import type {
  AudioTrack,
  LiveEvent,
  OverlayInfo,
  SimulatedEventInput,
  TikTokStatus
} from '../src/shared/types';
import { EVENT_BATCH_MS, LiveEventBatcher, type LiveEventBatch } from '../src/shared/eventBatch';
import { isLanguage, setLanguage, t } from '../src/shared/i18n';
import { aiStatus, generateAi, setAiKey, setAiSettings, testAi } from './ai';
import { applySignKey, setSignKey, signApiKey, signKeyStatus } from './signKey';
import { publishOverlay, startOverlayServer, stopOverlayServer } from './overlay-server';
import { closeOverlayWindow, onOverlayWindowAction, onOverlayWindowChange, openOverlayWindow } from './overlay-window';
import type { OverlayWindowAction } from '../src/shared/overlay';
import { diagnoseConnectError, isRetryableSignError, isTikTokUsername, tiktokUsername } from '../src/shared/tiktokErrors';
import { avatarFromUser } from '../src/shared/avatar';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

/** Shown in menus (About / Hide / Quit), the taskbar and dialogs; packaged builds get it from electron-builder too. */
const APP_NAME = 'TikLiveVPN';
app.setName(APP_NAME);
// Development builds always kept settings, saved state and AI keys in this folder
// (named after the npm package); keep it so renaming the app loses nothing.
if (!app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'tiktok-live-music-electron'));
// Windows groups taskbar buttons and notifications by this id (the packaged appId).
if (process.platform === 'win32') app.setAppUserModelId('local.tiklivevpn');
/** Unpackaged runs use Electron's own bundle; show the app icon anyway (packaged builds embed it). */
const devIcon = app.isPackaged ? null : path.join(__dirname, '..', 'build', 'icon.png');
const hasDevIcon = devIcon != null && fs.existsSync(devIcon);

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  }
]);

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow: BrowserWindow | null = null;
let liveConnection: TikTokLiveConnection | null = null;
/** Username of the latest Kết nối (cleared by Disconnect), so a retry stops when the streamer moves on. */
let pendingUsername: string | null = null;
const mediaFiles = new Map<string, string>();
let overlayInfo: OverlayInfo = { url: null, error: 'Overlay server chưa khởi động.' };

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {};
}

function nestedRecord(record: UnknownRecord, key: string): UnknownRecord {
  return asRecord(record[key]);
}

function stringValue(value: unknown): string {
  return value == null ? '' : String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function send<T>(channel: string, payload: T): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function emitStatus(status: TikTokStatus['status'], extra: Omit<Partial<TikTokStatus>, 'status'> = {}): void {
  send<TikTokStatus>('tiktok:status', { status, ...extra, at: Date.now() });
}

function usernameOf(rawData: unknown): string {
  const data = asRecord(rawData);
  const user = nestedRecord(data, 'user');
  return stringValue(user.uniqueId || data.uniqueId || user.nickname || 'unknown');
}

/** Readable text for connector errors (often `{ info, exception }`, not an Error). */
function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  const record = asRecord(error);
  const exception = record.exception instanceof Error ? record.exception.message : stringValue(record.exception);
  const text = [stringValue(record.info), exception].filter(Boolean).join(': ');
  return text || String(error);
}

function normalizeEvent(type: string, rawData: unknown = {}, simulated = false): LiveEvent {
  const data = asRecord(rawData);
  const user = nestedRecord(data, 'user');
  const gift = nestedRecord(data, 'gift');
  const giftDetails = nestedRecord(data, 'giftDetails');
  // Profile picture: only HTTPS images on TikTok's CDN pass (see src/shared/avatar.ts).
  const avatar = avatarFromUser(user, data.profilePictureUrl);

  const base = {
    id: crypto.randomUUID(),
    type,
    user: usernameOf(data),
    nickname: stringValue(user.nickname || data.nickname || usernameOf(data)),
    at: Date.now(),
    ...(avatar ? { avatar } : {}),
    ...(simulated ? { simulated: true } : {})
  };

  if (type === 'chat') {
    return { ...base, type: 'chat', comment: stringValue(data.comment) };
  }

  if (type === 'gift') {
    const giftId = (data.giftId ?? gift.id ?? null) as string | number | null;
    return {
      ...base,
      type: 'gift',
      giftId,
      giftName:
        stringValue(gift.name || giftDetails.giftName || data.giftName) ||
        `Gift ${giftId ?? ''}`.trim(),
      count: numberValue(data.repeatCount || gift.repeatCount, 1) || 1
    };
  }

  if (type === 'like') {
    return {
      ...base,
      type: 'like',
      count: numberValue(data.likeCount, 1) || 1,
      total: numberValue(data.totalLikeCount, 0)
    };
  }

  if (type === 'follow') {
    return { ...base, type: 'follow' };
  }

  if (type === 'join') {
    return { ...base, type: 'join' };
  }

  return base;
}

// Events go to the renderer in batches (one IPC message + one React render per
// EVENT_BATCH_MS) so busy rooms don't flood it; see LiveEventBatcher for overload rules.
const eventBatcher = new LiveEventBatcher();

function emitLiveEvent(type: string, data: unknown, simulated = false): void {
  eventBatcher.push(normalizeEvent(type, data, simulated));
}

function flushLiveEvents(): void {
  const batch = eventBatcher.flush();
  if (batch) send<LiveEventBatch>('tiktok:events', batch);
}

async function disconnectTikTok(): Promise<boolean> {
  const current = liveConnection;
  liveConnection = null;
  pendingUsername = null;

  if (current) {
    try {
      current.disconnect();
    } catch {
      // Connection may already be closed.
    }
  }

  emitStatus('disconnected');
  return true;
}

async function connectTikTok(rawUsername: string) {
  // Accepts "@name", "name" or a tiktok.com/@name/live link.
  const username = tiktokUsername(rawUsername);
  if (!username) {
    throw new Error('Hãy nhập username TikTok.');
  }
  if (!isTikTokUsername(username)) {
    throw new Error('Username TikTok chỉ gồm chữ không dấu, số, "_" và "." (vd: ten_kenh.live). Hãy nhập username, không phải tên hiển thị.');
  }

  await disconnectTikTok();
  emitStatus('connecting', { username });

  // Euler Stream's sign server sometimes answers 500 "illegal web id" for one
  // connection; a new connection (new device id) usually gets through. Retry
  // a few times, spaced out so the free tier's per-minute limit isn't hit.
  for (let attempt = 1; ; attempt += 1) {
    const connection = openConnection(username);
    try {
      const state = await connection.connect().finally(() => settled.add(connection));
      if (liveConnection !== connection) {
        connection.disconnect();
        return { connected: false };
      }
      const record = asRecord(state);
      console.log(`[tiktok] @${username}: connected (attempt ${attempt}, room ${stringValue(record.roomId)})`);
      return {
        connected: true,
        roomId: stringValue(record.roomId) || null,
        username
      };
    } catch (error) {
      const current = liveConnection === connection;
      if (current) liveConnection = null;
      const { retries, delayMs } = signRetries();
      console.warn(`[tiktok] @${username}: connect attempt ${attempt}/${retries} failed: ${errorText(error).slice(0, 200)}`);
      if (current && attempt < retries && isRetryableSignError(error)) {
        emitStatus('connecting', { username, message: 'Máy chủ Euler Stream lỗi, đang thử lại ({n}/{max})…'.replace('{n}', String(attempt + 1)).replace('{max}', String(retries)) });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        // The streamer pressed Disconnect / connected elsewhere meanwhile.
        if (liveConnection !== null || pendingUsername !== username) return { connected: false };
        continue;
      }
      // The connector's "Failed to retrieve Room ID from all sources." hides the real
      // reason in error.config.requestErrs; show the cause and each source's detail.
      const message = diagnoseConnectError(error);
      if (current) emitStatus('error', { username, message });
      throw new Error(message);
    }
  }
}

/** Connections whose connect() has finished (errors before that are connectTikTok's to report). */
const settled = new WeakSet<TikTokLiveConnection>();
// Euler Stream's free tier allows only a few sign requests a minute per network (failed ones
// count too); with an API key (Cài đặt → TikTok, or SIGN_API_KEY) the limit is higher, so retry more and sooner.
function signRetries(): { retries: number; delayMs: number } {
  return signApiKey() ? { retries: 6, delayMs: 2000 } : { retries: 3, delayMs: 6000 };
}

/** A new connection for `username` with every event wired; it becomes the current one. */
function openConnection(username: string): TikTokLiveConnection {
  applySignKey();
  const connection = new TikTokLiveConnection(username, {});
  liveConnection = connection;
  pendingUsername = username;

  connection.on(ControlEvent.CONNECTED, (state: unknown) => {
    if (liveConnection !== connection) return;
    const record = asRecord(state);
    emitStatus('connected', { username, roomId: stringValue(record.roomId) || null });
  });

  connection.on(ControlEvent.DISCONNECTED, (info: unknown) => {
    if (liveConnection !== connection) return;
    // TikTok closed the LIVE WebSocket (not the streamer): say so, with its close code.
    const record = asRecord(info);
    const code = numberValue(record.code, 0);
    const reason = stringValue(record.reason).slice(0, 120);
    console.warn(`[tiktok] @${username}: connection closed by TikTok (code ${code}${reason ? `, ${reason}` : ''})`);
    // "payload_handler_im_enter_room": TikTok refused to let the anonymous viewer into the room —
    // a LIVE limited to chosen viewers (or friends), or a network TikTok flags as a bot.
    const message = /im_enter_room/i.test(reason)
      ? `TikTok không cho vào phòng LIVE. LIVE phải để chế độ Công khai: app xem như người xem chưa đăng nhập, nên LIVE chỉ cho người được chỉ định / bạn bè xem sẽ bị chặn. Nếu LIVE đã công khai, có thể mạng đang bị TikTok nghi là bot: đợi 15–30 phút hoặc thử mạng khác: ${reason}`
      : `TikTok đã đóng kết nối LIVE (mã ${code}): ${reason || '—'}`;
    emitStatus('disconnected', { username, message });
  });

  connection.on(ControlEvent.ERROR, (error: unknown) => {
    if (liveConnection !== connection) return;
    // The connector also reports non-fatal errors (e.g. one undecodable message)
    // while staying connected; keep the "connected" status so host detection and
    // the UI don't treat the LIVE as offline.
    if (connection.isConnected) {
      // Status messages stay Vietnamese source texts; the renderer translates them (fixed prefix + detail).
      emitStatus('connected', { username, message: 'Cảnh báo từ TikTok: {error}'.replace('{error}', () => errorText(error)) });
      return;
    }
    // A failed connect() is reported by connectTikTok (which may retry it).
    if (!settled.has(connection)) return;
    emitStatus('error', { username, message: error instanceof Error ? diagnoseConnectError(error) : errorText(error) });
  });

  connection.on(WebcastEvent.CHAT, (data: unknown) => emitLiveEvent('chat', data));
  connection.on(WebcastEvent.GIFT, (data: unknown) => {
    // Streakable gifts (giftType 1) fire repeatedly with a growing repeatCount;
    // only the final event (repeatEnd) carries the total, so skip the rest.
    const record = asRecord(data);
    const giftType = numberValue(nestedRecord(record, 'giftDetails').giftType, 0);
    if (giftType === 1 && !record.repeatEnd) return;
    emitLiveEvent('gift', data);
  });
  connection.on(WebcastEvent.LIKE, (data: unknown) => emitLiveEvent('like', data));
  connection.on(WebcastEvent.FOLLOW, (data: unknown) => emitLiveEvent('follow', data));
  connection.on(WebcastEvent.MEMBER, (data: unknown) => emitLiveEvent('join', data));
  return connection;
}

function createWindow(): void {
  // Open large enough for the two-column layout at the default 120% UI zoom.
  const area = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1720, Math.round(area.width * 0.94)),
    height: Math.min(1100, Math.round(area.height * 0.94)),
    // The layout is responsive (styles.css); keep room for one column of panels.
    minWidth: 420,
    minHeight: 560,
    backgroundColor: '#0b0d12',
    title: APP_NAME,
    ...(hasDevIcon && devIcon ? { icon: devIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Never navigate away from the app (e.g. a file dropped onto the window) or open popups.
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.on('closed', () => {
    mainWindow = null;
    // The overlay window is only useful while the controller is open.
    closeOverlayWindow();
  });
}

app.whenReady().then(async () => {
  if (hasDevIcon && devIcon) app.dock?.setIcon(devIcon);
  setInterval(flushLiveEvents, EVENT_BATCH_MS);
  protocol.handle('media', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'track') {
        return new Response('Not found', { status: 404 });
      }

      const id = url.pathname.split('/').filter(Boolean)[0];
      const filePath = id ? mediaFiles.get(id) : undefined;
      if (!filePath || !fs.existsSync(filePath)) {
        return new Response('Audio file not found', { status: 404 });
      }

      const response = await net.fetch(pathToFileURL(filePath).toString(), {
        headers: request.headers
      });

      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', 'no-store');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (error) {
      console.error('[media] protocol error:', error);
      return new Response('Bad media request', { status: 500 });
    }
  });

  // Sample bank files: the renderer only supplies the text and a suggested name;
  // the user picks the location in a native dialog, so no path ever comes from the renderer.
  ipcMain.handle('dialog:save-text', async (_event, rawName: unknown, rawContent: unknown): Promise<{ ok: boolean; error?: string }> => {
    if (typeof rawContent !== 'string' || rawContent.length > 2_000_000) return { ok: false, error: 'Nội dung không hợp lệ.' };
    const name = (typeof rawName === 'string' ? rawName : 'mau').replace(/[^\w.-]+/g, '-').replace(/^\.+/, '').slice(0, 60) || 'mau';
    const fileName = /\.(txt|csv)$/i.test(name) ? name : `${name}.txt`;
    const options: SaveDialogOptions = {
      title: t('Lưu file mẫu'),
      defaultPath: path.join(app.getPath('downloads'), fileName),
      filters: [{ name: 'Text', extensions: ['txt', 'csv'] }]
    };
    const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { ok: false };
    // UTF-8 with BOM so Excel on Windows shows Vietnamese correctly.
    await fs.promises.writeFile(result.filePath, `\uFEFF${rawContent}`, 'utf8');
    return { ok: true };
  });

  ipcMain.handle('dialog:select-audio', async (): Promise<AudioTrack[]> => {
    const options: OpenDialogOptions = {
      title: t('Chọn file nhạc'),
      buttonLabel: t('Thêm vào playlist'),
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Audio',
          extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac']
        }
      ]
    };

    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled) return [];

    return result.filePaths.map((filePath) => {
      const id = crypto.randomUUID();
      mediaFiles.set(id, filePath);
      return {
        id,
        name: path.basename(filePath),
        url: `media://track/${id}`,
        source: 'electron-native'
      } satisfies AudioTrack;
    });
  });

  // AI question generation: keys stay in main (electron/ai.ts); only the controller window may use it.
  const fromMainWindow = (event: Electron.IpcMainInvokeEvent) => event.sender === mainWindow?.webContents;
  const refused = { ok: false as const, code: 'bad-request' as const };
  ipcMain.handle('ai:status', (event) => (fromMainWindow(event) ? aiStatus() : null));
  ipcMain.handle('ai:set-key', (event, provider: unknown, key: unknown) => (fromMainWindow(event) ? setAiKey(provider, key) : refused));
  ipcMain.handle('ai:set-settings', (event, settings: unknown) => (fromMainWindow(event) ? setAiSettings(settings) : refused));
  ipcMain.handle('ai:test', (event, provider: unknown) => (fromMainWindow(event) ? testAi(provider) : refused));
  ipcMain.handle('ai:generate', (event, request: unknown) => (fromMainWindow(event) ? generateAi(request) : refused));

  ipcMain.handle('overlay:info', () => overlayInfo);
  ipcMain.on('overlay:update', (event, state: unknown) => {
    // The controller's language rides on its overlay state; main only uses it
    // for native dialog titles. Strictly 'vi' | 'en', and only from the main window.
    const lang = state && typeof state === 'object' ? (state as { lang?: unknown }).lang : undefined;
    if (event.sender === mainWindow?.webContents && isLanguage(lang)) setLanguage(lang);
    publishOverlay(state);
  });
  ipcMain.handle('overlay:open-window', (_event, options: unknown) => {
    if (!overlayInfo.url) return { ok: false, error: overlayInfo.error ?? 'Overlay server chưa chạy.' };
    const origins = [new URL(overlayInfo.url).origin];
    if (isDev && process.env.VITE_DEV_SERVER_URL) origins.push(new URL(process.env.VITE_DEV_SERVER_URL).origin);
    return openOverlayWindow(overlayInfo.url, origins, options);
  });
  ipcMain.handle('overlay:close-window', () => {
    closeOverlayWindow();
    return true;
  });
  onOverlayWindowChange((open) => send<boolean>('overlay:window-changed', open));
  onOverlayWindowAction((action) => send<OverlayWindowAction>('overlay:window-action', action));

  ipcMain.handle('tiktok:connect', (_event, username: string) => connectTikTok(username));
  // Euler Stream key (electron/signKey.ts): only the controller window, never readable back.
  ipcMain.handle('tiktok:sign-key-status', (event) => (fromMainWindow(event) ? signKeyStatus() : null));
  ipcMain.handle('tiktok:set-sign-key', (event, key: unknown) => (fromMainWindow(event) ? setSignKey(key) : null));
  ipcMain.handle('tiktok:disconnect', () => disconnectTikTok());

  ipcMain.handle('tiktok:simulate', (_event, raw: SimulatedEventInput | null) => {
    const input: SimulatedEventInput = raw && typeof raw === 'object' ? raw : { type: 'chat' };
    const allowed: SimulatedEventInput['type'][] = ['chat', 'gift', 'like', 'follow', 'join'];
    const type = allowed.includes(input.type) ? input.type : 'chat';
    const fake = {
      user: {
        uniqueId: input.user || 'demo_viewer',
        nickname: input.user || 'Demo Viewer'
      },
      comment: input.comment || '',
      giftName: input.giftName || 'Rose',
      repeatCount: Number(input.count || 1),
      likeCount: Number(input.count || 1),
      totalLikeCount: Number(input.total || input.count || 1)
    };
    emitLiveEvent(type, fake, true);
    return true;
  });

  overlayInfo = await startOverlayServer({
    distDir: path.join(__dirname, '..', 'dist'),
    devServerUrl: isDev ? process.env.VITE_DEV_SERVER_URL : undefined
  }, (info) => {
    overlayInfo = info;
    send<OverlayInfo>('overlay:info-changed', info);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  closeOverlayWindow();
  stopOverlayServer();
});

app.on('window-all-closed', () => {
  void disconnectTikTok().finally(() => {
    if (process.platform !== 'darwin') app.quit();
  });
});
