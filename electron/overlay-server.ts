import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { AVATAR_CSP_SOURCES } from '../src/shared/avatar';
import { OVERLAY_PORT, OVERLAY_STREAM_PATH } from '../src/shared/overlay';
import type { OverlayInfo, OverlayState } from '../src/shared/types';

const HOST = '127.0.0.1';
const MAX_STATE_BYTES = 64 * 1024;
const HEARTBEAT_MS = 15_000;

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
};

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  // Viewer profile pictures: TikTok's image CDN only.
  `img-src 'self' data: ${AVATAR_CSP_SOURCES}`,
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');

interface OverlayServerOptions {
  /** Built renderer output (`dist/`). Used in production. */
  distDir: string;
  /** Vite dev server origin. When set, `/overlay` redirects there. */
  devServerUrl?: string;
}

let server: http.Server | null = null;
let heartbeat: NodeJS.Timeout | null = null;
let latestPayload: string | null = null;
const clients = new Set<http.ServerResponse>();

function allowedHost(hostHeader: string | undefined): boolean {
  // Reject DNS-rebinding requests: only loopback names on our port.
  return hostHeader === `${HOST}:${OVERLAY_PORT}` || hostHeader === `localhost:${OVERLAY_PORT}`;
}

function sendText(res: http.ServerResponse, status: number, text: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
  res.end(text);
}

function sendFile(res: http.ServerResponse, filePath: string, contentType: string, method: string): void {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, 'Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': CSP
    });
    res.end(method === 'HEAD' ? undefined : data);
  });
}

function openStream(res: http.ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Content-Type-Options': 'nosniff'
  });
  res.write('retry: 2000\n\n');
  if (latestPayload) res.write(`data: ${latestPayload}\n\n`);

  clients.add(res);
  res.on('close', () => clients.delete(res));
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse, options: OverlayServerOptions): void {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    sendText(res, 405, 'Method not allowed');
    return;
  }
  if (!allowedHost(req.headers.host)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  const { pathname, search } = new URL(req.url ?? '/', `http://${HOST}:${OVERLAY_PORT}`);

  if (pathname === OVERLAY_STREAM_PATH) {
    openStream(res);
    return;
  }

  if (pathname === '/overlay' || pathname === '/overlay/') {
    if (options.devServerUrl) {
      res.writeHead(302, { Location: `${options.devServerUrl}/overlay.html${search}` });
      res.end();
      return;
    }
    sendFile(res, path.join(options.distDir, 'overlay.html'), 'text/html; charset=utf-8', method);
    return;
  }

  // Production build assets referenced by overlay.html (`./assets/<name>`).
  const assetMatch = /^\/assets\/([\w.-]+)$/.exec(pathname);
  if (assetMatch && !options.devServerUrl) {
    const name = assetMatch[1] ?? '';
    const contentType = CONTENT_TYPES[path.extname(name)];
    const assetsDir = path.join(options.distDir, 'assets');
    const filePath = path.join(assetsDir, name);
    if (contentType && path.dirname(filePath) === assetsDir) {
      sendFile(res, filePath, contentType, method);
      return;
    }
  }

  sendText(res, 404, 'Not found');
}

const RETRY_MS = 3000;
let retryTimer: NodeJS.Timeout | null = null;
let stopped = false;

function listenOnce(options: OverlayServerOptions, quiet = false): Promise<OverlayInfo & { retry: boolean }> {
  return new Promise((resolve) => {
    const instance = http.createServer((req, res) => handleRequest(req, res, options));

    instance.once('error', (error: NodeJS.ErrnoException) => {
      const busy = error.code === 'EADDRINUSE';
      // Vietnamese source texts: the renderer translates them (the port number and error detail are kept).
      const message = busy
        ? 'Cổng {0} đang bị chương trình khác dùng (có thể là một cửa sổ app khác). App sẽ tự thử lại khi cổng trống.'.replace('{0}', String(OVERLAY_PORT))
        : 'Không mở được overlay server: {error}'.replace('{error}', () => error.message);
      if (!quiet) console.error('[overlay]', message);
      resolve({ url: null, error: message, retry: busy });
    });

    instance.listen(OVERLAY_PORT, HOST, () => {
      server = instance;
      heartbeat = setInterval(() => {
        for (const client of clients) client.write(': ping\n\n');
      }, HEARTBEAT_MS);
      resolve({ url: `http://${HOST}:${OVERLAY_PORT}/overlay`, retry: false });
    });
  });
}

/**
 * Starts the overlay server. If the port is busy it keeps retrying in the
 * background and reports the new state through `onChange`, so closing the
 * other program is enough — no app restart needed.
 */
export async function startOverlayServer(options: OverlayServerOptions, onChange: (info: OverlayInfo) => void): Promise<OverlayInfo> {
  stopped = false;
  const first = await listenOnce(options);
  if (first.retry) {
    const retry = async (): Promise<void> => {
      retryTimer = null;
      if (stopped) return;
      const next = await listenOnce(options, true);
      if (next.retry) {
        retryTimer = setTimeout(() => void retry(), RETRY_MS);
      } else {
        console.log('[overlay]', next.url ?? next.error);
        onChange({ url: next.url, error: next.error });
      }
    };
    retryTimer = setTimeout(() => void retry(), RETRY_MS);
  }
  return { url: first.url, error: first.error };
}

export function publishOverlay(state: unknown): void {
  if (!state || typeof state !== 'object') return;
  const payload = JSON.stringify(state as OverlayState);
  if (Buffer.byteLength(payload) > MAX_STATE_BYTES) return;

  latestPayload = payload;
  for (const client of clients) client.write(`data: ${payload}\n\n`);
}

export function stopOverlayServer(): void {
  stopped = true;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  for (const client of clients) client.end();
  clients.clear();
  server?.close();
  server = null;
}
