/** Local-only HTTP port for the OBS Browser Source overlay. */
export const OVERLAY_PORT = 17321;
export const OVERLAY_STREAM_PATH = '/overlay/stream';

/** `stack` = one compact column (default); the others fill an OBS canvas. */
export type OverlayLayout = 'stack' | 'landscape' | 'portrait';
export type OverlayWidget = 'alerts' | 'game' | 'leaderboard' | 'music';

export const OVERLAY_WIDGETS: OverlayWidget[] = ['alerts', 'game', 'leaderboard', 'music'];

export const OVERLAY_CANVAS: Record<Exclude<OverlayLayout, 'stack'>, { width: number; height: number }> = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 }
};

export interface OverlayConfig {
  layout: OverlayLayout;
  widgets: OverlayWidget[];
}

/** Parses `?layout=...&widgets=a,b` strictly against whitelists. */
export function parseOverlayConfig(search: string): OverlayConfig {
  const params = new URLSearchParams(search);
  const layoutParam = params.get('layout');
  const layout: OverlayLayout = layoutParam === 'landscape' || layoutParam === 'portrait' ? layoutParam : 'stack';
  const widgetsParam = params.get('widgets');
  const widgets = widgetsParam == null
    ? OVERLAY_WIDGETS
    : OVERLAY_WIDGETS.filter((widget) => widgetsParam.split(',').includes(widget));
  return { layout, widgets };
}

export function overlayConfigQuery(config: OverlayConfig): string {
  const params = new URLSearchParams({ layout: config.layout, widgets: config.widgets.join(',') });
  return `?${params.toString()}`;
}
