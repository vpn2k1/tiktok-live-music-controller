import { app, BrowserWindow, dialog, ipcMain, net, protocol, type OpenDialogOptions } from 'electron';
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
  SimulatedEventInput,
  TikTokStatus
} from '../src/shared/types';

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

function normalizeEvent(type: string, rawData: unknown = {}): LiveEvent {
  const data = asRecord(rawData);
  const user = nestedRecord(data, 'user');
  const gift = nestedRecord(data, 'gift');
  const giftDetails = nestedRecord(data, 'giftDetails');

  const base = {
    id: crypto.randomUUID(),
    type,
    user: usernameOf(data),
    nickname: stringValue(user.nickname || data.nickname || usernameOf(data)),
    at: Date.now()
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

  return base;
}

function emitLiveEvent(type: string, data: unknown): void {
  send<LiveEvent>('tiktok:event', normalizeEvent(type, data));
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

  const connection = new TikTokLiveConnection(username);
  liveConnection = connection;

  connection.on(ControlEvent.CONNECTED, (state: unknown) => {
    const record = asRecord(state);
    emitStatus('connected', { username, roomId: stringValue(record.roomId) || null });
  });

  connection.on(ControlEvent.DISCONNECTED, () => {
    if (liveConnection === connection) {
      emitStatus('disconnected', { username });
    }
  });

  connection.on(ControlEvent.ERROR, (error: unknown) => {
    emitStatus('error', {
      username,
      message: error instanceof Error ? error.message : String(error)
    });
  });

  connection.on(WebcastEvent.CHAT, (data: unknown) => emitLiveEvent('chat', data));
  connection.on(WebcastEvent.GIFT, (data: unknown) => emitLiveEvent('gift', data));
  connection.on(WebcastEvent.LIKE, (data: unknown) => emitLiveEvent('like', data));
  connection.on(WebcastEvent.SOCIAL, (data: unknown) => {
    const record = asRecord(data);
    const displayType = stringValue(record.displayType).toLowerCase();
    const label = stringValue(record.label).toLowerCase();
    if (displayType.includes('follow') || label.includes('follow')) {
      emitLiveEvent('follow', data);
    }
  });

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
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: '#0b0d12',
    title: 'TikTok LIVE Music Controller',
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

  mainWindow.on('closed', () => {
    mainWindow = null;
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

  ipcMain.handle('tiktok:connect', (_event, username: string) => connectTikTok(username));
  ipcMain.handle('tiktok:disconnect', () => disconnectTikTok());

  ipcMain.handle('tiktok:simulate', (_event, input: SimulatedEventInput = { type: 'chat' }) => {
    const type = input.type || 'chat';
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
    emitLiveEvent(type, fake);
    return true;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  void disconnectTikTok().finally(() => {
    if (process.platform !== 'darwin') app.quit();
  });
});
