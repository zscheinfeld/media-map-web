import type {LayoutInput} from '@media-map/map-core'

// Offscreen canvas to measure label text width (same approach as the app), so
// the collision force can space planets whose labels overflow their circle.
const LABEL_FONT_FAMILY = 'Calibri, "Helvetica Neue", Arial, sans-serif'
const cache = new Map<string, number>()

// Created LAZILY on first measurement (not at module load) and wrapped in
// try/catch, so headless environments without a real canvas — e.g. jsdom during
// `sanity deploy`'s manifest extraction — fall back to an estimate instead of
// throwing. `undefined` = not tried yet; `null` = unavailable.
let ctx: CanvasRenderingContext2D | null | undefined
function getCtx(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx
  try {
    ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  } catch {
    ctx = null
  }
  return ctx
}

function measureWidth(text: string, fontPx: number): number {
  const c = getCtx()
  if (!c) return text.length * fontPx * 0.55
  const key = `${fontPx}|${text}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  c.font = `700 ${fontPx}px ${LABEL_FONT_FAMILY}`
  const w = c.measureText(text).width
  cache.set(key, w)
  return w
}

/**
 * Per-company label half-extent (slide units): half of max(widest-word,
 * total-text-height), times slideUnitsPerPx. Fed into the physics collide force
 * so wide labels get the spacing they need. Mirrors the app's computation
 * (minus the Large-Cap valuation line, which the editor doesn't render).
 */
export function computeLabelRadii(
  inputs: LayoutInput[],
  labelSizePx: number,
  slideUnitsPerPx: number,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const i of inputs) {
    const words = i.name.trim().split(/\s+/)
    const maxWordPx = words.reduce((m, w) => Math.max(m, measureWidth(w, labelSizePx)), 0)
    const heightPx = words.length * labelSizePx
    out[i.name] = (Math.max(maxWordPx, heightPx) / 2) * slideUnitsPerPx
  }
  return out
}
