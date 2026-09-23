import { BrowserWindow, screen } from 'electron';
import { normalizeOverlayConfig, OVERLAY_BACKGROUNDS, overlayConfigQuery, type OverlayConfig } from '../src/shared/overlay';

let overlayWindow: BrowserWindow | null = null;
let currentFrame = { width: 1080, height: 1920 };
let currentTransparent = false;

function fitZoom(window: BrowserWindow): void {
  const [width = 1] = window.getContentSize();
  window.webContents.setZoomFactor(Math.max(0.05, width / currentFrame.width));
}

/** Initial content size: the frame scaled to fit ~80% of the work area. */
function initialSize(frame: { width: number; height: number }): { width: number; height: number } {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const scale = Math.min(1, (area.width * 0.8) / frame.width, (area.height * 0.8) / frame.height);
  return { width: Math.round(frame.width * scale), height: Math.round(frame.height * scale) };
}

/**
 * Opens or reuses a standalone overlay window for OBS Window Capture. The URL
 * is built here from a validated config — the renderer never supplies a URL.
 */
export function openOverlayWindow(baseUrl: string, allowedOrigins: string[], raw: unknown): { ok: boolean; error?: string } {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof OverlayConfig, unknown>>;
  const config = normalizeOverlayConfig({ ...input, mode: 'canvas', background: input.background ?? 'green' });
  const url = `${baseUrl}${overlayConfigQuery(config)}`;
  const frameChanged = config.width !== currentFrame.width || config.height !== currentFrame.height;
  const transparent = config.background === 'transparent';
  currentFrame = { width: config.width, height: config.height };
  const size = initialSize(currentFrame);

  // `transparent` can only be set at creation, so switching it needs a new window.
  if (overlayWindow && !overlayWindow.isDestroyed() && transparent !== currentTransparent) {
    overlayWindow.destroy();
    overlayWindow = null;
  }
  currentTransparent = transparent;

  if (!overlayWindow || overlayWindow.isDestroyed()) {
    overlayWindow = new BrowserWindow({
      width: size.width,
      height: size.height,
      useContentSize: true,
      title: 'Game Overlay',
      autoHideMenuBar: true,
      transparent,
      backgroundColor: transparent ? '#00000000' : OVERLAY_BACKGROUNDS[config.background],
      // Own in-memory session: zoom is per origin, and in dev the overlay shares the
      // controller's Vite origin, so a shared session would shrink the main window too.
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'overlay-window' }
    });
    const window = overlayWindow;
    window.setAspectRatio(config.width / config.height);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, target) => {
      let origin = '';
      try {
        origin = new URL(target).origin;
      } catch {
        // Unparseable target: block it.
      }
      if (!allowedOrigins.includes(origin)) event.preventDefault();
    });
    // Keep a stable title so OBS Window Capture can find the window.
    window.on('page-title-updated', (event) => event.preventDefault());
    window.on('resize', () => fitZoom(window));
    window.webContents.on('did-finish-load', () => fitZoom(window));
    window.on('closed', () => {
      overlayWindow = null;
    });
  } else {
    if (!transparent) overlayWindow.setBackgroundColor(OVERLAY_BACKGROUNDS[config.background]);
    if (frameChanged) {
      overlayWindow.setAspectRatio(config.width / config.height);
      overlayWindow.setContentSize(size.width, size.height);
    }
  }

  overlayWindow.setTitle('Game Overlay');
  void overlayWindow.loadURL(url);
  overlayWindow.show();
  overlayWindow.focus();
  return { ok: true };
}

export function closeOverlayWindow(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close();
  overlayWindow = null;
}
