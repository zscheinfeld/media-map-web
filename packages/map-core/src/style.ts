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

// --- Ombré stripes (ported from the "Media Map Planet Maker" prototype) ----

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim()
  if (h.length === 3) h = h.split("").map((c) => c + c).join("")
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function rgbToHex(r: number, g: number, b: number): string {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")
  return "#" + f(r) + f(g) + f(b)
}
const srgbToLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const linToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)
function hexToOklab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => srgbToLin(v / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
function oklabToHex(L: number, A: number, B: number): string {
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3)
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3)
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3)
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  const c = (v: number) => linToSrgb(Math.max(0, Math.min(1, v))) * 255
  return rgbToHex(c(r), c(g), c(b))
}

/** Mix two hex colours, t in [0,1], in OKLab (perceptual) or raw sRGB. */
export function mixHex(c1: string, c2: string, t: number, space: "oklab" | "srgb" = "oklab"): string {
  if (t <= 0) return c1
  if (t >= 1) return c2
  if (space === "srgb") {
    const a = hexToRgb(c1), b = hexToRgb(c2)
    return rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)
  }
  const a = hexToOklab(c1), b = hexToOklab(c2)
  return oklabToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)
}

/** The per-stripe colours for an ombré recipe: `count` samples along the ramp. */
export function ombreStripeColors(o: {
  stops: string[]
  count: number
  blend?: "oklab" | "srgb"
  reverse?: boolean
}): string[] {
  const stops = o.stops.filter((h) => /^#[0-9a-f]{3,8}$/i.test(h))
  const n = Math.max(1, Math.round(o.count))
  if (!stops.length) return []
  return Array.from({length: n}, (_, i) => {
    let t = n > 1 ? i / (n - 1) : 0
    if (o.reverse) t = 1 - t
    if (stops.length === 1) return stops[0]
    const pos = t * (stops.length - 1)
    const lo = Math.min(Math.floor(pos), stops.length - 2)
    return mixHex(stops[lo], stops[lo + 1], pos - lo, o.blend ?? "oklab")
  })
}
