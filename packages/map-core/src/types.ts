// Shared types for the map renderer + physics. These are intentionally
// data-source-agnostic: the Vite app (Google Sheet) and the Sanity Studio
// editor both produce these shapes from their own data and feed them in.

export type StripeOrientation = "horizontal" | "vertical" | "diagonal"

export type PlanetGlow = {
  color: string
  blurPx?: number
  spreadPx?: number
}

// Visual style for a planet. Sector defaults and per-company overrides both use
// this shape; `mergeStyle` (style.ts) shallow-merges them one level deep.
export type PlanetStyle = {
  fill?: string
  stripes?: string[]
  stripeOrientation?: StripeOrientation
  stroke?: string
  strokeWidthPx?: number
  glow?: PlanetGlow
  // Sidebar-only: a CSS gradient for the legend swatch. Not used by the planet
  // renderer (kept here so the one style shape covers both surfaces).
  swatchBackground?: string
}

export type ConnectionStyle = "solid" | "dotted"

export type Connection = {
  from: string
  to: string
  style: ConnectionStyle
  description: string
}

// A per-company position override in slide-coordinate space.
//   pin: true  → locked (fx/fy); other planets collide around it.
//   pin absent → soft attractor; physics can still nudge it.
export type PlanetPosition = {
  x: number
  y: number
  pin?: boolean
}

// Canvas inset the physics keeps nodes inside, in slide units.
export type Bounds = {x0: number; y0: number; x1: number; y1: number}

// "list" reuses the map-mode layout (nodes stay put; the renderer shows a table
// instead). It never changes node positions.
export type ViewMode = "map" | "linear" | "list"

// A node the physics simulation mutates in place and the renderer draws.
export type PlanetNode = {
  name: string
  sector: string
  valuation_b: number
  // Entities are text-only nodes (no circle/fill/valuation). They carry r=0 and
  // get collision spacing from their label box + the entity-padding knob.
  isEntity?: boolean
  r: number // currently-displayed radius (tweens toward targetR)
  targetR: number // radius implied by the current valuation
  hue: number
  style: PlanetStyle | null
  // d3 mutates these in place
  x: number
  y: number
  vx?: number
  vy?: number
  // d3-force fixed-position fields; when set, the node is pinned here.
  fx?: number | null
  fy?: number | null
  // Attractor the planet drifts toward (sector center, or a position override).
  targetX: number
  targetY: number
  // True when pinned via a position override (renderer marks these in edit mode).
  pinned: boolean
  // Half-extent of the rendered label box, in slide units (drives collision
  // spacing so wide labels don't overlap). Zero/undefined = ignore label.
  labelRadius?: number
  // Optional override for the name-label text color (default white). The app uses
  // this to flag e.g. companies whose valuation isn't live-sourced yet.
  labelColor?: string
  // Optional DISPLAY-ONLY label text (defaults to `name`); `name` remains the
  // node identity used for matching. Lets the app strip an authoring marker from
  // the drawn label without changing the underlying company name.
  labelText?: string
}

// Data-source-agnostic input to `usePhysicsLayout`. The caller (app or Studio)
// has already filtered to visible companies and resolved each one's default
// center, hue, and style from whatever its data source is.
export type LayoutInput = {
  name: string
  sector: string
  valuation_b: number
  // Text-only entity (no circle/valuation). Built with r=0; the renderer draws
  // just the label and the physics gives it label-box + entity-padding spacing.
  isEntity?: boolean
  // Default attractor (the sector "gravity well") — caller resolves this,
  // including mobile vs desktop centers, sector overrides, and unknown-sector
  // placement. A per-company position override (passed separately) wins over it.
  center: {x: number; y: number}
  hue: number
  style: PlanetStyle | null
  // Optional name-label text color (default white). The app flags non-live-sourced
  // valuations (e.g. NA / fallback companies) by passing a red here.
  labelColor?: string
  // Optional DISPLAY-ONLY label text (defaults to `name`). `name` stays the node
  // identity (connection/position matching); this only changes what's drawn, e.g.
  // to strip an authoring marker like " - CONVERT TO USD" from the shown name.
  labelText?: string
}
