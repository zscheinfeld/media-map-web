import type {PlanetNode} from "./types.js"

// The size of a name as Planet draws it (word-stacked, weight 500, 2% tracking,
// one line per word at `fontPx` line height), so a connection line can stop
// short of an entity's name instead of running through it.

const FONT_STACK = '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif'
const MEASURE_PX = 100
const widthCache = new Map<string, number>()
let ctx: CanvasRenderingContext2D | null | undefined

/** Width of `word` at 100px (weight 500), cached. Falls back to an estimate
 *  where there's no canvas (or before the font has loaded, a near enough one). */
function wordWidthAt100(word: string): number {
  const hit = widthCache.get(word)
  if (hit !== undefined) return hit
  if (ctx === undefined) {
    ctx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null
  }
  let w: number
  if (ctx) {
    ctx.font = `500 ${MEASURE_PX}px ${FONT_STACK}`
    w = ctx.measureText(word).width
    // Only cache once the real face is in, so an early fallback-font width doesn't stick.
    if (typeof document !== "undefined" && document.fonts?.check?.(`500 ${MEASURE_PX}px "Libre Franklin"`)) {
      widthCache.set(word, w)
    }
  } else {
    w = word.length * MEASURE_PX * 0.56
  }
  return w
}

/** Half-width / half-height of a node's name box, in slide units. */
export function labelHalfExtents(node: PlanetNode, fontPx: number): {hw: number; hh: number} {
  const words = (node.labelText ?? node.name).trim().split(/\s+/)
  let maxW = 0
  for (const w of words) {
    const tracked = (wordWidthAt100(w) / MEASURE_PX) * fontPx + 0.02 * fontPx * w.length
    if (tracked > maxW) maxW = tracked
  }
  return {hw: maxW / 2, hh: (words.length * fontPx) / 2}
}

/** Distance from a box's centre to its edge along the unit direction (dx, dy). */
export function boxEdgeDistance(hw: number, hh: number, dx: number, dy: number): number {
  const tx = Math.abs(dx) > 1e-9 ? hw / Math.abs(dx) : Infinity
  const ty = Math.abs(dy) > 1e-9 ? hh / Math.abs(dy) : Infinity
  return Math.min(tx, ty)
}
