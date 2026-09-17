// React components shared by the live map and the static PNG export (kept
// component-only so React Fast Refresh can hot-swap them). The export logic
// itself lives in exportMap.tsx.

import { ConnectionLine, Planet, type PlanetNode } from "@media-map/map-core";
import { CANVAS_DESKTOP } from "./sectors";

export const EXPORT_W = 3840;
export const EXPORT_H = 2160;
export const EXPORT_PANEL_W = 640;

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
 * right-aligned ("xMaxYMid meet") into the frame beside the panel. Reuses the
 * live Planet / ConnectionLine components so styling can't drift.
 */
export function ExportMapScene({
  nodes,
  connections,
  labelPx,
}: {
  nodes: PlanetNode[];
  connections: Array<{ from: string; to: string; style: "solid" | "dotted" }>;
  labelPx: number;
}) {
  const su = EXPORT_SLIDE_UNITS_PER_PX;
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const c = CANVAS_DESKTOP;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      x={EXPORT_PANEL_W}
      y={0}
      width={EXPORT_W - EXPORT_PANEL_W}
      height={EXPORT_H}
      viewBox={`${c.x} ${c.y} ${c.w} ${c.h}`}
      preserveAspectRatio="xMaxYMid meet"
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
      {nodes.map((n) => (
        <Planet
          key={n.name}
          node={n}
          slideUnitsPerPx={su}
          isHovered={false}
          onHoverChange={noop}
          onClick={noop}
          dimmed={false}
          labelSizePx={labelPx}
          showValuation={n.sector === "Large Cap"}
        />
      ))}
    </svg>
  );
}
