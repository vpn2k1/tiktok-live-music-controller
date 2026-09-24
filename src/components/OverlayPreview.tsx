import { useEffect, useRef, useState } from 'react';
import { t } from '../shared/i18n';

interface OverlayPreviewProps {
  /** Exact overlay URL that OBS will load. */
  url: string;
  width: number;
  height: number;
  /** Shade the areas TikTok's own UI covers (portrait frames). */
  showTikTokZones: boolean;
}

/** Largest box the preview may use inside the side panel. */
const MAX_BOX = { width: 320, height: 380 };

/** Scaled-down live view of the real overlay page, as OBS renders it. */
export default function OverlayPreview({ url, width, height, showTikTokZones }: OverlayPreviewProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  // Narrow windows: shrink to the panel's width instead of overflowing it.
  const [available, setAvailable] = useState(MAX_BOX.width);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailable(Math.max(120, Math.floor(entry.contentRect.width)));
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(Math.min(MAX_BOX.width, available) / width, MAX_BOX.height / height);

  return (
    <div ref={boxRef} className="overlay-preview-box">
      <div className="overlay-preview" style={{ width: width * scale, height: height * scale }}>
        <iframe
          title={t('Xem trước overlay')}
          src={url}
          width={width}
          height={height}
          tabIndex={-1}
          sandbox="allow-scripts allow-same-origin"
          style={{ transform: `scale(${scale})` }}
        />
        {showTikTokZones ? (
          <>
            <span className="safe-zone top" title={t('TikTok: avatar, số người xem')} />
            <span className="safe-zone right" title={t('TikTok: nút like, share, gift')} />
            <span className="safe-zone bottom" title={t('TikTok: comment, ô chat')} />
          </>
        ) : null}
      </div>
    </div>
  );
}
