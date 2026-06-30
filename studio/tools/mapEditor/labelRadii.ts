import type {LayoutInput} from '@media-map/map-core'

// Offscreen canvas to measure label text width (same approach as the app), so
// the collision force can space planets whose labels overflow their circle.
const LABEL_FONT_FAMILY = 'Calibri, "Helvetica Neue", Arial, sans-serif'
const ctx: CanvasRenderingContext2D | null =
  typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
const cache = new Map<string, number>()

function measureWidth(text: string, fontPx: number): number {
  if (!ctx) return text.length * fontPx * 0.55
  const key = `${fontPx}|${text}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  ctx.font = `700 ${fontPx}px ${LABEL_FONT_FAMILY}`
  const w = ctx.measureText(text).width
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
