import type {PlanetStyle} from "./types.js"

/** Convert "#EE7D31" (or "#eee") to "rgba(r, g, b, a)". */
export function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace("#", "")
  if (h.length === 3) h = h.split("").map((c) => c + c).join("")
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Deterministic hue (0–359) from a string — fallback color for unknown sectors. */
export function hashHue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % 360
}

/**
 * Shallow-merge a sector default style with a per-company override (company
 * wins, field by field — one level deep). Returns null if neither is set.
 * Mirrors the map's inheritance: e.g. Large Cap sets `stroke: "transparent"`
 * at the sector level and Apple inherits it without redeclaring.
 */
export function mergeStyle(
  sectorDefault: PlanetStyle | null | undefined,
  companyOverride: PlanetStyle | null | undefined,
): PlanetStyle | null {
  if (!sectorDefault && !companyOverride) return null
  return {...(sectorDefault ?? {}), ...(companyOverride ?? {})}
}

/** Compact valuation label: $3.45T / $336B / $6.0B / $560M. */
export function formatValuation(b: number): string {
  if (b >= 1000) return `$${(b / 1000).toFixed(b >= 10000 ? 1 : 2)}T`
  if (b >= 10) return `$${b.toFixed(0)}B`
  if (b >= 1) return `$${b.toFixed(1)}B`
  return `$${(b * 1000).toFixed(0)}M`
}
