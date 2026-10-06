// Layout lab → Download: the downloaded image's overlay (headline, legend,
// logo, QR codes) drawn live over the map, inside a 16:9 frame that stands for
// the image, so the map can be arranged with the overlay in view. The map
// itself is framed by MediaMap to match the image (see `exportPreview` there);
// this only draws the frame and the overlay.

import { exportPreviewFrame } from "./exportMap";
import { EXPORT_H, EXPORT_W } from "./exportScene";

export function ExportPreviewOverlay({
  containerW,
  containerH,
  imageW = EXPORT_W,
  markup,
}: {
  containerW: number;
  containerH: number;
  /** The image's width, px (its height is always EXPORT_H). */
  imageW?: number;
  /** The overlay as SVG markup in image px (buildExportPanelMarkup). */
  markup: string;
}) {
  if (containerW <= 0 || containerH <= 0) return null;
  const f = exportPreviewFrame(containerW, containerH, imageW);
  const dim = "rgba(0, 0, 0, 0.62)";
  const bar = (style: React.CSSProperties) => <div style={{ position: "absolute", background: dim, pointerEvents: "none", ...style }} />;
  return (
    <>
      {/* Outside the image: dimmed. */}
      {f.top > 0 && bar({ left: 0, right: 0, top: 0, height: f.top })}
      {f.top > 0 && bar({ left: 0, right: 0, bottom: 0, height: containerH - f.top - f.h })}
      {f.left > 0 && bar({ top: 0, bottom: 0, left: 0, width: f.left })}
      {f.left > 0 && bar({ top: 0, bottom: 0, right: 0, width: containerW - f.left - f.w })}
      <svg
        aria-hidden
        viewBox={`0 0 ${imageW} ${EXPORT_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", left: f.left, top: f.top, width: f.w, height: f.h, pointerEvents: "none", overflow: "visible" }}
      >
        <rect x={0.5} y={0.5} width={imageW - 1} height={EXPORT_H - 1} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {/* Our own generated markup (no user content). */}
        <g dangerouslySetInnerHTML={{ __html: markup }} />
      </svg>
    </>
  );
}
