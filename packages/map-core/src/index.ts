// @media-map/map-core — shared, data-source-agnostic renderer + physics for the
// Media Map. Consumed by the Vite app (Google Sheet) and the Sanity Studio
// editor (GROQ). Callers resolve their data into these shapes and feed them in.

export type {
  Bounds,
  Connection,
  ConnectionStyle,
  LayoutInput,
  OmbreStripes,
  PlanetGlow,
  PlanetNode,
  PlanetPosition,
  PlanetStyle,
  StripeOrientation,
  ViewMode,
} from "./types.js"

export {
  ANCHOR_DIAM_FALLBACK,
  ANCHOR_VAL,
  SHEET_SIZE_ANCHOR,
  computeAnchorDiam,
  diameterFor,
  sheetPlanetSize,
} from "./sizing.js"

export {formatValuation, hashHue, hexToRgba, mergeStyle, mixHex, ombreStripeColors} from "./style.js"

export {usePhysicsLayout, type PhysicsOptions} from "./usePhysicsLayout.js"

export {CONNECTION_PULL, solveLayout, solveLayoutSteps, type SolveLayoutOptions} from "./solveLayout.js"

export {Planet, type PlanetProps} from "./Planet.js"

export {ConnectionLine, ENTITY_LINE_GAP_PX, type ConnectionLineProps, type LineEndBox} from "./ConnectionLine.js"

export {labelHalfExtents} from "./labelBox.js"

export {
  type Moment,
  UNDATED,
  MONTH_NAMES,
  makeMoment,
  parseMoment,
  formatMomentShort,
  sanityDateToMoment,
  momentToSanityDate,
  activeAt,
  windowActiveAt,
  yearWindowsActiveAt,
  type YearWindow,
} from "./timeScope.js"
