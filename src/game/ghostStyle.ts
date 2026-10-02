// Game-mode "ghost" look: while a planet is still parked (not yet launched) it
// renders as a transparent disc with a 1px outline in its sector colour. Large
// Cap planets, which carry a brand stripe palette instead of a sector colour,
// take the most saturated stripe. Once a planet launches, the app cross-fades
// it back to its normal fill.

import type { PlanetNode, PlanetStyle } from "@media-map/map-core";

const LARGE_CAP = "Large Cap";

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return { h: hue, s, l };
}

/** The outline colour a parked planet shows in game mode. */
export function ghostColorFor(node: PlanetNode): string {
  const st = node.style;
  // An ombré recipe's stops are the palette when present (style-lab look).
  const stripes = st?.ombre?.stops?.length ? st.ombre.stops : (st?.stripes ?? []);
  if (node.sector === LARGE_CAP && stripes.length) {
    // Most saturated stripe; near-black/near-white stripes are ignored.
    let best = stripes[0], bestS = -1;
    for (const hex of stripes) {
      const hsl = hexToHsl(hex);
      if (!hsl || hsl.l < 0.12 || hsl.l > 0.92) continue;
      if (hsl.s > bestS) { bestS = hsl.s; best = hex; }
    }
    return best;
  }
  const fill = st?.fill ?? stripes[0] ?? null;
  if (fill) {
    // A near-black fill (AI) would vanish on the dark map — use its stroke if it has one.
    const hsl = hexToHsl(fill);
    if (hsl && hsl.l < 0.12 && st?.stroke && st.stroke !== "transparent") return st.stroke;
    return fill;
  }
  return `hsl(${node.hue}, 70%, 55%)`;
}

/** Transparent disc + 1px outline; no stripes, glow or gradient. */
export function ghostStyleFor(node: PlanetNode): PlanetStyle {
  return { fill: "transparent", stroke: ghostColorFor(node), strokeWidthPx: 1 };
}
