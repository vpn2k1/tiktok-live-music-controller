import { app, BrowserWindow, dialog, ipcMain, net, protocol, screen, type OpenDialogOptions } from 'electron';
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
import { publishOverlay, startOverlayServer, stopOverlayServer } from './overlay-server';
import { closeOverlayWindow, openOverlayWindow } from './overlay-window';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

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

  const base = {
    id: crypto.randomUUID(),
    type,
    user: usernameOf(data),
    nickname: stringValue(user.nickname || data.nickname || usernameOf(data)),
    at: Date.now(),
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

function emitLiveEvent(type: string, data: unknown, simulated = false): void {
  send<LiveEvent>('tiktok:event', normalizeEvent(type, data, simulated));
}

async function disconnectTikTok(): Promise<boolean> {
  const current = liveConnection;
  liveConnection = null;

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
  const username = String(rawUsername || '').trim().replace(/^@/, '');
  if (!username) {
    throw new Error('Hãy nhập username TikTok.');
  }

  await disconnectTikTok();
  emitStatus('connecting', { username });

  const connection = new TikTokLiveConnection(username, {});
  liveConnection = connection;

  connection.on(ControlEvent.CONNECTED, (state: unknown) => {
    if (liveConnection !== connection) return;
    const record = asRecord(state);
    emitStatus('connected', { username, roomId: stringValue(record.roomId) || null });
  });

  connection.on(ControlEvent.DISCONNECTED, () => {
    if (liveConnection === connection) {
      emitStatus('disconnected', { username });
    }
  });

  connection.on(ControlEvent.ERROR, (error: unknown) => {
    if (liveConnection !== connection) return;
    // The connector also reports non-fatal errors (e.g. one undecodable message)
    // while staying connected; keep the "connected" status so host detection and
    // the UI don't treat the LIVE as offline.
    if (connection.isConnected) {
      emitStatus('connected', { username, message: `Cảnh báo từ TikTok: ${errorText(error)}` });
      return;
    }
    emitStatus('error', { username, message: errorText(error) });
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

  try {
    const state = await connection.connect();
    if (liveConnection !== connection) {
      connection.disconnect();
      return { connected: false };
    }

    const record = asRecord(state);
    return {
      connected: true,
      roomId: stringValue(record.roomId) || null,
      username
    };
  } catch (error) {
    if (liveConnection === connection) liveConnection = null;
    emitStatus('error', {
      username,
      message: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

function createWindow(): void {
  // Open large enough for the two-column layout at the default 120% UI zoom.
  const area = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1720, Math.round(area.width * 0.94)),
    height: Math.min(1100, Math.round(area.height * 0.94)),
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: '#0b0d12',
    title: 'TikTok LIVE Game Controller',
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

  ipcMain.handle('dialog:select-audio', async (): Promise<AudioTrack[]> => {
    const options: OpenDialogOptions = {
      title: 'Chọn file nhạc',
      buttonLabel: 'Thêm vào playlist',
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

  ipcMain.handle('overlay:info', () => overlayInfo);
  ipcMain.on('overlay:update', (_event, state: unknown) => publishOverlay(state));
  ipcMain.handle('overlay:open-window', (_event, options: unknown) => {
    if (!overlayInfo.url) return { ok: false, error: overlayInfo.error ?? 'Overlay server chưa chạy.' };
    const origins = [new URL(overlayInfo.url).origin];
    if (isDev && process.env.VITE_DEV_SERVER_URL) origins.push(new URL(process.env.VITE_DEV_SERVER_URL).origin);
    return openOverlayWindow(overlayInfo.url, origins, options);
  });

  ipcMain.handle('tiktok:connect', (_event, username: string) => connectTikTok(username));
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
