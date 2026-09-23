import { OVERLAY_CANVAS } from '../shared/overlay';

interface OverlayPreviewProps {
  /** Exact overlay URL that OBS will load. */
  url: string;
  layout: keyof typeof OVERLAY_CANVAS;
}

const PREVIEW_WIDTH = { landscape: 340, portrait: 220 } as const;

/** Scaled-down live view of the real overlay page, as OBS renders it. */
export default function OverlayPreview({ url, layout }: OverlayPreviewProps) {
  const canvas = OVERLAY_CANVAS[layout];
  const scale = PREVIEW_WIDTH[layout] / canvas.width;

  return (
    <div
      className={`overlay-preview ${layout}`}
      style={{ width: canvas.width * scale, height: canvas.height * scale }}
    >
      <iframe
        title="Xem trước overlay"
        src={url}
        width={canvas.width}
        height={canvas.height}
        tabIndex={-1}
        sandbox="allow-scripts allow-same-origin"
        style={{ transform: `scale(${scale})` }}
      />
      {layout === 'portrait' ? (
        <>
          <span className="safe-zone top" title="TikTok: avatar, số người xem" />
          <span className="safe-zone right" title="TikTok: nút like, share, gift" />
          <span className="safe-zone bottom" title="TikTok: comment, ô chat" />
        </>
      ) : null}
    </div>
  );
}
