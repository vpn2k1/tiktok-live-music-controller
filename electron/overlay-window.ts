import { BrowserWindow, screen, type Rectangle } from 'electron';
import {
  normalizeOverlayConfig,
  OVERLAY_BACKGROUNDS,
  OVERLAY_WINDOW_PARAM,
  overlayConfigQuery,
  parseWindowAction,
  type OverlayConfig,
  type OverlayWindowAction
} from '../src/shared/overlay';

let overlayWindow: BrowserWindow | null = null;
let currentFrame = { width: 1080, height: 1920 };
let currentTransparent = false;
/** Where the streamer last left the window (this app session), for the next open. */
let lastBounds: Rectangle | null = null;
let onChange: (open: boolean) => void = () => undefined;
let onAction: (action: OverlayWindowAction) => void = () => undefined;

/** Tells the controller when the game window opens or closes (to show "Đóng cửa sổ game"). */
export function onOverlayWindowChange(listener: (open: boolean) => void): void {
  onChange = listener;
}

/** Clicks in the window (pick a game in the list, back to the list); see parseWindowAction. */
export function onOverlayWindowAction(listener: (action: OverlayWindowAction) => void): void {
  onAction = listener;
}

/** Last position if it is still on a connected screen. */
function restoredPosition(): { x: number; y: number } | null {
  if (!lastBounds) return null;
  const visible = screen.getAllDisplays().some(({ workArea }) => (
    lastBounds!.x < workArea.x + workArea.width - 40 && lastBounds!.x + lastBounds!.width > workArea.x + 40 &&
    lastBounds!.y < workArea.y + workArea.height - 40 && lastBounds!.y + lastBounds!.height > workArea.y
  ));
  return visible ? { x: lastBounds.x, y: lastBounds.y } : null;
}

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
  // The window flag only adds the move/close bar; it is never renderer-supplied.
  const url = `${baseUrl}${overlayConfigQuery(config)}&${OVERLAY_WINDOW_PARAM}=1`;
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
    const position = restoredPosition();
    // Same frame as last time: reopen at the size the streamer chose.
    const keepSize = !frameChanged && lastBounds != null;
    overlayWindow = new BrowserWindow({
      width: keepSize ? lastBounds!.width : size.width,
      height: keepSize ? lastBounds!.height : size.height,
      ...(position ?? {}),
      useContentSize: true,
      // No title bar, so OBS Window Capture shows only the game. The page itself
      // is the drag handle and shows a close bar while the window is focused.
      frame: false,
      minWidth: 160,
      minHeight: 160,
      title: 'Game Overlay',
      autoHideMenuBar: true,
      // macOS: the first click on the unfocused window also picks a game / presses a button.
      acceptFirstMouse: true,
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
    // The page reports clicks through its URL hash (no preload); only whitelisted actions pass.
    window.webContents.on('did-navigate-in-page', (_event, target, isMainFrame) => {
      if (!isMainFrame) return;
      let origin = '';
      try {
        origin = new URL(target).origin;
      } catch {
        return;
      }
      const action = allowedOrigins.includes(origin) ? parseWindowAction(target) : null;
      if (action) onAction(action);
    });
    // Keep a stable title so OBS Window Capture can find the window.
    window.on('page-title-updated', (event) => event.preventDefault());
    window.on('resize', () => fitZoom(window));
    window.webContents.on('did-finish-load', () => fitZoom(window));
    window.on('close', () => {
      lastBounds = window.getContentBounds();
    });
    window.on('closed', () => {
      overlayWindow = null;
      onChange(false);
    });
    onChange(true);
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
