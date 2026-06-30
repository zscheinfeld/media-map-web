// Planet sizing math. Planet diameter scales with the square root of valuation
// (so area is proportional to valuation), relative to an "anchor" reference.

// Apple is the size anchor.
//   ANCHOR_VAL        — Apple's reference valuation (billions USD). Dividing by
//                       it converts any valuation into a ratio relative to Apple.
//   ANCHOR_DIAM_FALLBACK — Apple's diameter in slide units before the container
//                       is measured. Real value is computed from the viewport.
//   SHEET_SIZE_ANCHOR — Apple's "planet size" in the source spreadsheet's own
//                       unit system; used only by the detail panel's cross-check.
export const ANCHOR_VAL = 2900
export const SHEET_SIZE_ANCHOR = 9.77
export const ANCHOR_DIAM_FALLBACK = 800

/** Rendered diameter (slide units) for a valuation, given Apple's diameter. */
export function diameterFor(valuation_b: number, anchorDiam: number): number {
  return anchorDiam * Math.sqrt(Math.max(valuation_b, 0) / ANCHOR_VAL)
}

/**
 * The sheet-units "planet size" for a valuation — the same formula the source
 * spreadsheet uses (`sqrt(val / 2900) * 9.77`). For hand-verification only.
 */
export function sheetPlanetSize(valuation_b: number): number {
  return Math.sqrt(Math.max(valuation_b, 0) / ANCHOR_VAL) * SHEET_SIZE_ANCHOR
}

/**
 * Auto-compute Apple's diameter so the whole cluster covers a target fraction
 * (`packingDensity`) of the canvas area. Solving `Σ planetArea = density · canvasArea`
 * for the anchor diameter:
 *   anchorDiam = sqrt( 4 · density · canvasArea / (π · Σ(val/ANCHOR_VAL)) )
 */
export function computeAnchorDiam(
  valuations: number[],
  canvasArea: number,
  packingDensity: number,
): number {
  if (valuations.length === 0 || canvasArea <= 0) return ANCHOR_DIAM_FALLBACK
  const ratioSum = valuations.reduce((sum, v) => sum + Math.max(v, 0) / ANCHOR_VAL, 0)
  if (ratioSum <= 0) return ANCHOR_DIAM_FALLBACK
  return Math.sqrt((4 * packingDensity * canvasArea) / (Math.PI * ratioSum))
}
