// React components shared by the live map and the static PNG export (kept
// component-only so React Fast Refresh can hot-swap them). The export logic
// itself lives in exportMap.tsx.

import { ConnectionLine, Planet, type PlanetNode } from "@media-map/map-core";
import { CANVAS_DESKTOP } from "./sectors";

export const EXPORT_W = 3840;
export const EXPORT_H = 2160;
/** Width of the info column at the left of the image (headline, legend). The map runs under it. */
export const EXPORT_PANEL_W = 640;

/**
 * How big the map is drawn in the image. 1 = the whole desktop canvas fits the
 * image's height (empty margins at the sides); EXPORT_MAP_SCALE_FILL = it fills
 * the width, which crops a strip off the top and bottom of the canvas;
 * EXPORT_MAP_SCALE_PANEL = the size it had when the map sat beside a
 * 640px-wide panel (the default: the planets are the size they always were).
 */
export const EXPORT_MAP_SCALE_FILL = (EXPORT_W / EXPORT_H) / (CANVAS_DESKTOP.w / CANVAS_DESKTOP.h);
export const EXPORT_MAP_SCALE_PANEL = ((EXPORT_W - EXPORT_PANEL_W) / CANVAS_DESKTOP.w) / (EXPORT_H / CANVAS_DESKTOP.h);

// The export renders labels / strokes / glows at a FIXED reference scale so the
// image is identical regardless of the viewer's window width (on-screen these
// sizes track the container). ~ a laptop map area with the side panel open.
const EXPORT_REF_CONTAINER_W = 1400;
export const EXPORT_SLIDE_UNITS_PER_PX = CANVAS_DESKTOP.w / EXPORT_REF_CONTAINER_W;

/** Starfield background pattern shared by the live map and the export. */
export function StarfieldDefs() {
  return (
    <defs>
      <pattern id="starfield" x="0" y="0" width="180" height="180" patternUnits="userSpaceOnUse">
        <circle cx="14" cy="29" r="0.7" fill="white" opacity="0.8" />
        <circle cx="74" cy="61" r="0.4" fill="white" opacity="0.6" />
        <circle cx="120" cy="14" r="0.6" fill="white" opacity="0.5" />
        <circle cx="42" cy="111" r="0.5" fill="white" opacity="0.7" />
        <circle cx="151" cy="98" r="0.3" fill="white" opacity="0.45" />
        <circle cx="167" cy="142" r="0.7" fill="white" opacity="0.65" />
        <circle cx="93" cy="156" r="0.4" fill="white" opacity="0.5" />
        <circle cx="32" cy="68" r="0.3" fill="white" opacity="0.4" />
      </pattern>
    </defs>
  );
}

const noop = () => {};

/**
 * The map region of the export as a nested <svg>: the full desktop canvas,
 * centred in the whole image (the info column at the left lies over it), at
 * `mapScale` (EXPORT_MAP_SCALE_PANEL = the size it always had, with margins;
 * 1 = fits the height; up to EXPORT_MAP_SCALE_FILL = fills the width, cropped
 * top and bottom). Reuses the live Planet /
 * ConnectionLine components so styling can't drift.
 */
export function ExportMapScene({
  nodes,
  connections,
  labelPx,
  labelStrokePx,
  showValuation = (n) => n.sector === "Large Cap",
  mapScale = EXPORT_MAP_SCALE_PANEL,
  imageW = EXPORT_W,
  offsetX = 0,
}: {
  nodes: PlanetNode[];
  connections: Array<{ from: string; to: string; style: "solid" | "dotted" }>;
  /** Name size per node (the site's large / small type). */
  labelPx: (n: PlanetNode) => number;
  /** Black outline around the names (default: Planet's own). */
  labelStrokePx?: number;
  /** Which names carry their market cap (default: Large Cap, as on the map). */
  showValuation?: (n: PlanetNode) => boolean;
  mapScale?: number;
  /** The image's width, px (≤ EXPORT_W): a narrower image crops the map's sides equally. */
  imageW?: number;
  /** Slides the map sideways, image px (+ = right). */
  offsetX?: number;
}) {
  const su = EXPORT_SLIDE_UNITS_PER_PX;
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const c = CANVAS_DESKTOP;
  // A viewBox this much smaller (or larger) than the canvas, fitted to the
  // image's height, draws the canvas `mapScale` times the fit-the-height size,
  // centred (what lies beyond the viewBox but inside the image is still drawn).
  const k = Math.max(EXPORT_MAP_SCALE_PANEL, Math.min(EXPORT_MAP_SCALE_FILL, mapScale));
  const vw = c.w / k, vh = c.h / k;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      // Laid out for the full-width image and centred in a narrower one, so a
      // narrower image crops the map's sides equally; then slid by `offsetX`.
      x={(imageW - EXPORT_W) / 2 + offsetX}
      y={0}
      width={EXPORT_W}
      height={EXPORT_H}
      viewBox={`${c.x + (c.w - vw) / 2} ${c.y + (c.h - vh) / 2} ${vw} ${vh}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <StarfieldDefs />
      <rect x={c.x} y={c.y} width={c.w} height={c.h} fill="url(#starfield)" opacity={0.6} />
      {connections.map((conn, idx) => {
        const a = byName.get(conn.from);
        const b = byName.get(conn.to);
        if (!a || !b) return null;
        return (
          <ConnectionLine
            key={`conn-${idx}`}
            ax={a.x}
            ay={a.y}
            bx={b.x}
            by={b.y}
            connectionStyle={conn.style}
            slideUnitsPerPx={su}
          />
        );
      })}
      {/* As on the map: every planet first, then every name on top, so a planet
          drawn later can never cover a neighbour's name. (Entities are all name;
          they draw in the first pass.) */}
      {(["body", "label"] as const).map((part) =>
        nodes.map((n) => (
          <Planet
            key={`${part}-${n.name}`}
            part={part}
            node={n}
            slideUnitsPerPx={su}
            isHovered={false}
            onHoverChange={noop}
            onClick={noop}
            dimmed={false}
            labelSizePx={labelPx(n)}
            labelStrokePx={labelStrokePx}
            showValuation={showValuation(n)}
          />
        )),
      )}
    </svg>
  );
}
