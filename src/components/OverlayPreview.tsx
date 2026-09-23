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
  const scale = Math.min(MAX_BOX.width / width, MAX_BOX.height / height);

  return (
    <div className="overlay-preview" style={{ width: width * scale, height: height * scale }}>
      <iframe
        title="Xem trước overlay"
        src={url}
        width={width}
        height={height}
        tabIndex={-1}
        sandbox="allow-scripts allow-same-origin"
        style={{ transform: `scale(${scale})` }}
      />
      {showTikTokZones ? (
        <>
          <span className="safe-zone top" title="TikTok: avatar, số người xem" />
          <span className="safe-zone right" title="TikTok: nút like, share, gift" />
          <span className="safe-zone bottom" title="TikTok: comment, ô chat" />
        </>
      ) : null}
    </div>
  );
}
