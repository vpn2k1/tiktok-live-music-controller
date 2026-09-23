/** Local-only HTTP port for the OBS Browser Source overlay. */
export const OVERLAY_PORT = 17321;
export const OVERLAY_STREAM_PATH = '/overlay/stream';

export type OverlayWidget = 'alerts' | 'game' | 'leaderboard' | 'music';

export const OVERLAY_WIDGETS: OverlayWidget[] = ['alerts', 'game', 'leaderboard', 'music'];

/** Video frame presets (pixels). `custom` lets the streamer type width × height. */
export const FRAME_PRESETS = {
  '9x16': { label: '9:16 dọc', width: 1080, height: 1920 },
  '16x9': { label: '16:9 ngang', width: 1920, height: 1080 },
  '1x1': { label: '1:1 vuông', width: 1080, height: 1080 },
  '4x5': { label: '4:5', width: 1080, height: 1350 }
} as const;

export type FramePreset = keyof typeof FRAME_PRESETS | 'custom';

export const FRAME_MIN = 240;
export const FRAME_MAX = 3840;

/** Where the widget column sits inside the frame (3 × 3 grid). */
export const STAGE_POSITIONS = [
  'top-left', 'top', 'top-right',
  'left', 'center', 'right',
  'bottom-left', 'bottom', 'bottom-right'
] as const;

export type StagePosition = (typeof STAGE_POSITIONS)[number];

/** Column width as a fraction of the frame's shorter side. */
export const STAGE_SIZES = {
  s: { label: 'Nhỏ', fraction: 0.34 },
  m: { label: 'Vừa', fraction: 0.5 },
  l: { label: 'Lớn', fraction: 0.68 },
  xl: { label: 'Rất lớn', fraction: 0.9 }
} as const;

export type StageSize = keyof typeof STAGE_SIZES;

/** Design width of the widget column; it is zoomed to the chosen size. */
export const STAGE_BASE_WIDTH = 460;

/** Page background: transparent for Browser Source, solid for Window Capture. */
export type OverlayBackground = 'transparent' | 'green' | 'dark';

export const OVERLAY_BACKGROUNDS: Record<OverlayBackground, string> = {
  transparent: 'transparent',
  // Chroma-key green for OBS "Color Key / Chroma Key" filters.
  green: '#00b140',
  dark: '#0b0d12'
};

/** Everything that decides how the overlay page looks. Shared by the link, the preview and the game window. */
export interface OverlayConfig {
  /** `stack`: bare 420 px column (old links); `canvas`: a full video frame. */
  mode: 'stack' | 'canvas';
  width: number;
  height: number;
  position: StagePosition;
  size: StageSize;
  /** Keep widgets out of the areas TikTok's own UI covers (portrait frames). */
  safeArea: boolean;
  widgets: OverlayWidget[];
  background: OverlayBackground;
}

export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  mode: 'canvas',
  width: 1080,
  height: 1920,
  position: 'top-left',
  size: 'xl',
  safeArea: true,
  widgets: OVERLAY_WIDGETS,
  background: 'transparent'
};

export function isOverlayBackground(value: unknown): value is OverlayBackground {
  return value === 'transparent' || value === 'green' || value === 'dark';
}

export function isStagePosition(value: unknown): value is StagePosition {
  return typeof value === 'string' && (STAGE_POSITIONS as readonly string[]).includes(value);
}

export function isStageSize(value: unknown): value is StageSize {
  return typeof value === 'string' && value in STAGE_SIZES;
}

export function clampFrame(value: unknown, fallback: number): number {
  const numeric = Math.round(Number(value));
  return Number.isFinite(numeric) && numeric > 0 ? Math.min(FRAME_MAX, Math.max(FRAME_MIN, numeric)) : fallback;
}

/** Matching preset for a width × height, or `custom`. */
export function presetFor(width: number, height: number): FramePreset {
  const match = (Object.keys(FRAME_PRESETS) as (keyof typeof FRAME_PRESETS)[])
    .find((key) => FRAME_PRESETS[key].width === width && FRAME_PRESETS[key].height === height);
  return match ?? 'custom';
}

/** Validates any partial/untrusted config (URL params, IPC, localStorage) into a safe one. */
export function normalizeOverlayConfig(raw: Partial<Record<keyof OverlayConfig, unknown>>): OverlayConfig {
  const widgets = Array.isArray(raw.widgets)
    ? OVERLAY_WIDGETS.filter((widget) => (raw.widgets as unknown[]).includes(widget))
    : DEFAULT_OVERLAY_CONFIG.widgets;
  return {
    mode: raw.mode === 'stack' ? 'stack' : 'canvas',
    width: clampFrame(raw.width, DEFAULT_OVERLAY_CONFIG.width),
    height: clampFrame(raw.height, DEFAULT_OVERLAY_CONFIG.height),
    position: isStagePosition(raw.position) ? raw.position : DEFAULT_OVERLAY_CONFIG.position,
    size: isStageSize(raw.size) ? raw.size : DEFAULT_OVERLAY_CONFIG.size,
    safeArea: typeof raw.safeArea === 'boolean' ? raw.safeArea : DEFAULT_OVERLAY_CONFIG.safeArea,
    widgets,
    background: isOverlayBackground(raw.background) ? raw.background : 'transparent'
  };
}

/** Parses the overlay URL query strictly against whitelists (old `layout=` links still work). */
export function parseOverlayConfig(search: string): OverlayConfig {
  const params = new URLSearchParams(search);
  const widgetsParam = params.get('widgets');
  const widgets = widgetsParam == null ? OVERLAY_WIDGETS : widgetsParam.split(',');
  const base = { widgets, background: params.get('bg') };

  if (params.has('w') || params.has('h')) {
    return normalizeOverlayConfig({
      ...base,
      mode: 'canvas',
      width: params.get('w'),
      height: params.get('h'),
      position: params.get('pos'),
      size: params.get('size'),
      safeArea: params.get('safe') === '1'
    });
  }
  const layout = params.get('layout');
  if (layout === 'portrait') return normalizeOverlayConfig({ ...base, mode: 'canvas', width: 1080, height: 1920, position: 'top-left', size: 'xl', safeArea: true });
  if (layout === 'landscape') return normalizeOverlayConfig({ ...base, mode: 'canvas', width: 1920, height: 1080, position: 'top-right', size: 'm', safeArea: false });
  return normalizeOverlayConfig({ ...base, mode: 'stack' });
}

export function overlayConfigQuery(config: OverlayConfig): string {
  const params = new URLSearchParams();
  if (config.mode === 'canvas') {
    params.set('w', String(config.width));
    params.set('h', String(config.height));
    params.set('pos', config.position);
    params.set('size', config.size);
    if (config.safeArea) params.set('safe', '1');
  }
  params.set('widgets', config.widgets.join(','));
  if (config.background !== 'transparent') params.set('bg', config.background);
  return `?${params.toString()}`;
}

/** Padding (px) that keeps the column inside the frame, or inside TikTok's safe area. */
export function stagePadding(config: Pick<OverlayConfig, 'width' | 'height' | 'safeArea'>): { top: number; right: number; bottom: number; left: number } {
  const { width, height } = config;
  if (config.safeArea && height > width) {
    // TikTok portrait UI: ~13% top bar, ~17% right button column, ~35% comments at the bottom.
    return { top: height * 0.13, right: width * 0.17, bottom: height * 0.35, left: width * 0.05 };
  }
  const margin = Math.min(width, height) * 0.04;
  return { top: margin, right: margin, bottom: margin, left: margin };
}

/** Rendered column width (px) for the chosen size, never wider than the padded frame. */
export function stageWidth(config: Pick<OverlayConfig, 'width' | 'height' | 'size' | 'safeArea'>): number {
  const padding = stagePadding(config);
  const available = config.width - padding.left - padding.right;
  return Math.max(120, Math.min(available, Math.min(config.width, config.height) * STAGE_SIZES[config.size].fraction));
}
