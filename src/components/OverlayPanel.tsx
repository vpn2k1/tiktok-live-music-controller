import { useEffect, useState } from 'react';
import {
  clampFrame,
  DEFAULT_OVERLAY_CONFIG,
  FRAME_MAX,
  FRAME_MIN,
  FRAME_PRESETS,
  isOverlayBackground,
  normalizeOverlayConfig,
  OVERLAY_WIDGETS,
  overlayConfigQuery,
  presetFor,
  STAGE_POSITIONS,
  STAGE_SIZES,
  type FramePreset,
  type OverlayBackground,
  type OverlayConfig,
  type OverlayWidget,
  type StagePosition,
  type StageSize
} from '../shared/overlay';
import type { OverlayInfo } from '../shared/types';
import OverlayPreview from './OverlayPreview';
import Panel from './Panel';

interface OverlayPanelProps {
  info: OverlayInfo;
  onAction: (message: string) => void;
  onOpenWindow: (config: OverlayConfig) => void;
}

const STORAGE_KEY = 'overlay-frame';

const BACKGROUND_LABELS: Record<OverlayBackground, string> = {
  green: 'Xanh (chroma key)',
  dark: 'Nền tối',
  transparent: 'Trong suốt'
};

const WIDGET_LABELS: Record<OverlayWidget, string> = {
  alerts: 'Chào người mới',
  game: 'Game',
  leaderboard: 'Bảng xếp hạng',
  music: 'Bài đang phát'
};

const POSITION_ARROWS: Record<StagePosition, string> = {
  'top-left': '↖', top: '↑', 'top-right': '↗',
  left: '←', center: '•', right: '→',
  'bottom-left': '↙', bottom: '↓', 'bottom-right': '↘'
};

interface SavedFrame {
  config: OverlayConfig;
  /** Background for the standalone window; the Browser Source link is always transparent. */
  windowBackground: OverlayBackground;
}

function loadFrame(): SavedFrame {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as { config?: Record<string, unknown>; windowBackground?: unknown };
    return {
      config: normalizeOverlayConfig({ ...DEFAULT_OVERLAY_CONFIG, ...(saved.config ?? {}), mode: 'canvas', background: 'transparent' }),
      windowBackground: isOverlayBackground(saved.windowBackground) ? saved.windowBackground : 'green'
    };
  } catch {
    return { config: DEFAULT_OVERLAY_CONFIG, windowBackground: 'green' };
  }
}

export default function OverlayPanel({ info, onAction, onOpenWindow }: OverlayPanelProps) {
  const [{ config, windowBackground }, setFrame] = useState<SavedFrame>(loadFrame);
  const [customPicked, setCustomPicked] = useState(false);
  const preset: FramePreset = customPicked ? 'custom' : presetFor(config.width, config.height);
  const portrait = config.height > config.width;
  const link = info.url ? `${info.url}${overlayConfigQuery(config)}` : null;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ config, windowBackground }));
    } catch {
      // Storage unavailable: the choice still works for this session.
    }
  }, [config, windowBackground]);

  function update(patch: Partial<OverlayConfig>): void {
    setFrame((old) => ({ ...old, config: normalizeOverlayConfig({ ...old.config, ...patch }) }));
  }

  function pickPreset(key: FramePreset): void {
    if (key === 'custom') {
      setCustomPicked(true);
      return;
    }
    setCustomPicked(false);
    const frame = FRAME_PRESETS[key];
    // Portrait frames default to avoiding TikTok's UI; others don't need it.
    update({ width: frame.width, height: frame.height, safeArea: frame.height > frame.width });
  }

  function toggleWidget(widget: OverlayWidget, enabled: boolean): void {
    update({ widgets: OVERLAY_WIDGETS.filter((item) => (item === widget ? enabled : config.widgets.includes(item))) });
  }

  function copyLink(): void {
    if (!link) return;
    navigator.clipboard.writeText(link)
      .then(() => onAction(`Đã copy link. OBS → Browser Source → dán link, ${config.width}×${config.height}`))
      .catch((error: unknown) => onAction(`Không copy được: ${error instanceof Error ? error.message : String(error)}`));
  }

  if (!link) {
    return (
      <Panel title="④ Đưa lên OBS">
        <p className="error-text">{info.error || 'Đang mở overlay server…'}</p>
      </Panel>
    );
  }

  return (
    <Panel title="④ Đưa lên OBS" aside={`${config.width}×${config.height}`}>
      <div className="game-stack">
        <div className="frame-presets" role="group" aria-label="Khung video">
          {[...(Object.keys(FRAME_PRESETS) as (keyof typeof FRAME_PRESETS)[]), 'custom' as const].map((key) => (
            <button key={key} className={preset === key ? 'active' : ''} onClick={() => pickPreset(key)}>
              {key === 'custom' ? 'Tuỳ chỉnh' : FRAME_PRESETS[key].label}
            </button>
          ))}
        </div>
        {preset === 'custom' ? (
          <div className="frame-custom">
            <label>
              Rộng
              <input type="number" min={FRAME_MIN} max={FRAME_MAX} defaultValue={config.width} onBlur={(event) => update({ width: clampFrame(event.target.value, config.width) })} />
            </label>
            <span>×</span>
            <label>
              Cao
              <input type="number" min={FRAME_MIN} max={FRAME_MAX} defaultValue={config.height} onBlur={(event) => update({ height: clampFrame(event.target.value, config.height) })} />
            </label>
            <span className="field-hint">px ({FRAME_MIN}–{FRAME_MAX})</span>
          </div>
        ) : null}

        <div className="stage-controls">
          <div className="position-grid" role="group" aria-label="Vị trí game trong khung">
            {STAGE_POSITIONS.map((position) => (
              <button key={position} className={config.position === position ? 'active' : ''} onClick={() => update({ position })} title={position}>
                {POSITION_ARROWS[position]}
              </button>
            ))}
          </div>
          <div className="stage-size">
            <span className="fold-label">Cỡ game</span>
            <div className="segmented four" role="group" aria-label="Cỡ game">
              {(Object.keys(STAGE_SIZES) as StageSize[]).map((size) => (
                <button key={size} className={config.size === size ? 'active' : ''} onClick={() => update({ size })}>{STAGE_SIZES[size].label}</button>
              ))}
            </div>
            {portrait ? (
              <label className="check-chip">
                <input type="checkbox" checked={config.safeArea} onChange={(event) => update({ safeArea: event.target.checked })} />
                Tránh vùng TikTok che
              </label>
            ) : null}
          </div>
        </div>

        <OverlayPreview url={link} width={config.width} height={config.height} showTikTokZones={portrait && config.safeArea} />

        <div className="demo-row">
          <button className="button primary" onClick={() => onOpenWindow({ ...config, background: windowBackground })}>🪟 Mở cửa sổ game</button>
          <button className="button" onClick={copyLink}>📋 Copy link</button>
        </div>
        <p className="field-hint">
          Cửa sổ game → OBS <b>Window Capture</b> “Game Overlay”{windowBackground === 'green' ? ' + filter Chroma Key' : ''}. Link → OBS <b>Browser Source</b> {config.width}×{config.height}.
        </p>

        <details className="fold">
          <summary>Tuỳ chọn hiển thị</summary>
          <div className="fold-body">
            <span className="fold-label">Phần hiện trên overlay</span>
            <div className="check-row">
              {OVERLAY_WIDGETS.map((widget) => (
                <label key={widget} className="check-chip">
                  <input type="checkbox" checked={config.widgets.includes(widget)} onChange={(event) => toggleWidget(widget, event.target.checked)} />
                  {WIDGET_LABELS[widget]}
                </label>
              ))}
            </div>
            <label className="inline-field flush">
              <span>Nền cửa sổ game</span>
              <select value={windowBackground} onChange={(event) => setFrame((old) => ({ ...old, windowBackground: event.target.value as OverlayBackground }))}>
                {(Object.keys(BACKGROUND_LABELS) as OverlayBackground[]).map((bg) => <option key={bg} value={bg}>{BACKGROUND_LABELS[bg]}</option>)}
              </select>
            </label>
            <div className="copy-row">
              <code title={link}>{link}</code>
            </div>
          </div>
        </details>
      </div>
    </Panel>
  );
}
