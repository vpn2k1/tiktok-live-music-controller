import { useEffect, useState } from 'react';
import { OVERLAY_CANVAS, OVERLAY_WIDGETS, overlayConfigQuery, type OverlayWidget } from '../shared/overlay';
import type { OverlayInfo } from '../shared/types';
import OverlayPreview from './OverlayPreview';
import Panel from './Panel';

type CanvasLayout = keyof typeof OVERLAY_CANVAS;

interface OverlayBuilderConfig {
  layout: CanvasLayout;
  widgets: OverlayWidget[];
}

const DEFAULT_CONFIG: OverlayBuilderConfig = { layout: 'portrait', widgets: OVERLAY_WIDGETS };

const WIDGET_LABELS: Record<OverlayWidget, string> = {
  alerts: 'Chào người mới',
  game: 'Game',
  leaderboard: 'Bảng xếp hạng',
  music: 'Bài đang phát'
};

function loadConfig(): OverlayBuilderConfig {
  try {
    const saved = JSON.parse(localStorage.getItem('overlay-config') || '{}') as { layout?: string; widgets?: string[]; knownWidgets?: string[] };
    const layout = saved.layout === 'landscape' || saved.layout === 'portrait' ? saved.layout : DEFAULT_CONFIG.layout;
    const widgets = Array.isArray(saved.widgets)
      // Widgets added after the config was saved start enabled.
      ? OVERLAY_WIDGETS.filter((widget) => saved.widgets?.includes(widget) || !saved.knownWidgets?.includes(widget))
      : DEFAULT_CONFIG.widgets;
    return { layout, widgets };
  } catch {
    return DEFAULT_CONFIG;
  }
}

interface OverlayPanelProps {
  info: OverlayInfo;
  onAction: (message: string) => void;
}

export default function OverlayPanel({ info, onAction }: OverlayPanelProps) {
  const [config, setConfig] = useState<OverlayBuilderConfig>(loadConfig);
  const canvas = OVERLAY_CANVAS[config.layout];
  const link = info.url ? `${info.url}${overlayConfigQuery(config)}` : null;

  useEffect(() => {
    try {
      localStorage.setItem('overlay-config', JSON.stringify({ ...config, knownWidgets: OVERLAY_WIDGETS }));
    } catch {
      // Storage unavailable: the choice still works for this session.
    }
  }, [config]);

  function toggleWidget(widget: OverlayWidget, enabled: boolean): void {
    setConfig((old) => ({
      ...old,
      widgets: OVERLAY_WIDGETS.filter((item) => (item === widget ? enabled : old.widgets.includes(item)))
    }));
  }

  function copyLink(): void {
    if (!link) return;
    navigator.clipboard.writeText(link)
      .then(() => onAction('Đã copy link overlay'))
      .catch((error: unknown) => onAction(`Không copy được: ${error instanceof Error ? error.message : String(error)}`));
  }

  return (
    <Panel title="Overlay OBS" aside={`${canvas.width}×${canvas.height}`}>
      <div className="game-stack">
        <div className="game-block">
          <div className="segmented" role="group" aria-label="Khung hình">
            {(['portrait', 'landscape'] as CanvasLayout[]).map((layout) => (
              <button key={layout} className={config.layout === layout ? 'active' : ''} onClick={() => setConfig((old) => ({ ...old, layout }))}>
                {layout === 'portrait' ? '9:16 TikTok dọc' : '16:9 ngang'}
              </button>
            ))}
          </div>
          <div className="check-row">
            {OVERLAY_WIDGETS.map((widget) => (
              <label key={widget} className="check-chip">
                <input type="checkbox" checked={config.widgets.includes(widget)} onChange={(event) => toggleWidget(widget, event.target.checked)} />
                {WIDGET_LABELS[widget]}
              </label>
            ))}
          </div>

          {link ? (
            <>
              <OverlayPreview url={link} layout={config.layout} />
              <div className="copy-row">
                <code title={link}>{link}</code>
                <button className="button small" onClick={copyLink}>Copy</button>
              </div>
              <p className="field-hint">
                OBS → Browser Source, dán link, Width {canvas.width}, Height {canvas.height}.
                {config.layout === 'portrait' ? ' Vùng đỏ là chỗ giao diện TikTok che.' : ''}
              </p>
            </>
          ) : (
            <p className="error-text">{info.error || 'Đang mở overlay server…'}</p>
          )}
        </div>
      </div>
    </Panel>
  );
}
