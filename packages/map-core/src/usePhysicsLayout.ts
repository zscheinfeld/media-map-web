import {useEffect, useLayoutEffect, useMemo, useRef, useState} from "react"
import {forceManyBody, forceSimulation, forceX, forceY, type Simulation} from "d3-force"
import type {Bounds, LayoutInput, PlanetNode, PlanetPosition, ViewMode} from "./types.js"
import {ANCHOR_DIAM_FALLBACK, diameterFor} from "./sizing.js"

// Per-tick attraction strength between connected planets. Well above the sector
// pull (forceX/Y ≈ 0.035–0.04) so connected planets are drawn firmly toward each
// other (clamped for stability inside connectionForce).
export const CONNECTION_PULL = 0.55

// Spring strength pulling a held planet back to its home (PlanetPosition.hold).
// Firm enough that it returns once whatever pushed it shrinks again, loose
// enough that collisions win while a neighbour needs the room.
const HOLD_STRENGTH = 0.2

// A node's collision footprint, in slide units. Planets use their circle (or
// label box, whichever is larger); entities have no circle, so they use an
// imaginary radius (`entityRadius`) or their label box. `sizeSpacing` inflates
// it by a fraction of the node's own radius, so larger planets keep
// proportionally more clearance than a constant `padding` can give.
const collisionRadius = (
  n: PlanetNode,
  padding: number,
  entityRadius: number,
  sizeSpacing: number,
) => {
  const base = n.isEntity
    ? Math.max(n.labelRadius ?? 0, entityRadius)
    : Math.max(n.r, n.labelRadius ?? 0)
  return base * (1 + sizeSpacing) + padding
}

// Mass radius for the push split — physical planet radius, or the entity's
// imaginary radius (NOT its label), so a small planet with a long label doesn't
// shove big planets around.
const massRadius = (n: PlanetNode, entityRadius: number) =>
  n.isEntity ? entityRadius : n.r

const isFixed = (n: PlanetNode) => n.fx != null && n.fy != null

/**
 * Hard de-overlap pass: directly separates any overlapping nodes by moving their
 * POSITIONS (not velocities), so the result is guaranteed overlap-free regardless
 * of how the soft forces settled. Pinned/dragged nodes (fx/fy set) stay put and
 * the free partner takes the whole correction; two fixed nodes are left alone
 * (can't move either). Run as a post-step pass each tick + after pre-warm.
 *
 * Gauss-Seidel relaxation over `iterations` sweeps resolves chains/clusters.
 * Free nodes are clamped back inside `bounds` after each sweep.
 */
function separateOverlaps(
  nodes: PlanetNode[],
  padding: number,
  entityRadius: number,
  sizeSpacing: number,
  bounds: Bounds,
  iterations: number,
  // Fraction of each overlap to correct per sweep. 1 = snap fully apart
  // (use for the silent pre-warm); <1 eases nodes apart over several frames for
  // a smooth settle (use in the live tick).
  strength: number,
) {
  const n = nodes.length
  for (let k = 0; k < iterations; k++) {
    for (let i = 0; i < n; i++) {
      const a = nodes[i]
      const aFixed = isFixed(a)
      const ri = collisionRadius(a, padding, entityRadius, sizeSpacing)
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]
        const bFixed = isFixed(b)
        if (aFixed && bFixed) continue
        const rj = collisionRadius(b, padding, entityRadius, sizeSpacing)
        const r = ri + rj
        let dx = b.x - a.x
        let dy = b.y - a.y
        let l2 = dx * dx + dy * dy
        if (l2 >= r * r) continue
        // Exactly (or nearly) coincident — pick a deterministic axis to split on.
        if (l2 < 1e-6) {
          dx = 1
          dy = 0
          l2 = 1
        }
        const l = Math.sqrt(l2)
        const overlap = (r - l) * strength
        const nx = dx / l
        const ny = dy / l
        if (aFixed) {
          b.x += nx * overlap
          b.y += ny * overlap
        } else if (bFixed) {
          a.x -= nx * overlap
          a.y -= ny * overlap
        } else {
          const ma = massRadius(a, entityRadius)
          const mb = massRadius(b, entityRadius)
          const denom = ma * ma + mb * mb
          const fr = denom > 0 ? (mb * mb) / denom : 0.5 // a's share of the move
          a.x -= nx * overlap * fr
          a.y -= ny * overlap * fr
          b.x += nx * overlap * (1 - fr)
          b.y += ny * overlap * (1 - fr)
        }
      }
    }
    // Keep free nodes inside the canvas inset (pinned ones stay wherever set).
    for (let i = 0; i < n; i++) {
      const a = nodes[i]
      if (isFixed(a)) continue
      const r = a.r
      if (a.x - r < bounds.x0) a.x = bounds.x0 + r
      if (a.x + r > bounds.x1) a.x = bounds.x1 - r
      if (a.y - r < bounds.y0) a.y = bounds.y0 + r
      if (a.y + r > bounds.y1) a.y = bounds.y1 - r
    }
  }
}

/**
 * Custom collide force that reads each node's `r` live every iteration — d3's
 * forceCollide caches radii at init, so radius tweens (month switches) would go
 * stale and overlap. This is the SOFT (velocity-based) pass that gives smooth
 * live motion; `separateOverlaps` is the hard guarantee layered on top.
 *
 * Pinned/fixed nodes (`fx`/`fy` set — a pin or an in-progress drag) don't move;
 * the free partner absorbs the entire push so overlaps actually resolve.
 */
function liveCollide(
  padding: number,
  strength: number,
  iterations: number,
  entityRadius: number,
  sizeSpacing: number,
) {
  let nodes: PlanetNode[] = []
  const collideR = (n: PlanetNode) => collisionRadius(n, padding, entityRadius, sizeSpacing)
  const massR = (n: PlanetNode) => massRadius(n, entityRadius)
  const resolveOnce = () => {
    const n = nodes.length
    for (let i = 0; i < n; i++) {
      const a = nodes[i]
      const ri = collideR(a)
      const aFixed = a.fx != null && a.fy != null
      const xi = a.x + (a.vx ?? 0)
      const yi = a.y + (a.vy ?? 0)
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]
        const rj = collideR(b)
        const xj = b.x + (b.vx ?? 0)
        const yj = b.y + (b.vy ?? 0)
        const dx = xj - xi
        const dy = yj - yi
        const r = ri + rj
        const l2 = dx * dx + dy * dy
        if (l2 < r * r && l2 > 0.0001) {
          const bFixed = b.fx != null && b.fy != null
          if (aFixed && bFixed) continue // neither can move; leave it to authoring
          const l = Math.sqrt(l2)
          const correction = ((r - l) / l) * strength
          const ux = dx * correction
          const uy = dy * correction
          if (aFixed) {
            // a is anchored → b takes the whole push (away from a).
            b.vx = (b.vx ?? 0) + ux
            b.vy = (b.vy ?? 0) + uy
          } else if (bFixed) {
            a.vx = (a.vx ?? 0) - ux
            a.vy = (a.vy ?? 0) - uy
          } else {
            // Split by mass (radius²): the lighter node moves more. Guard the
            // 0/0 case (two zero-mass nodes) with an even split.
            const ra = massR(a)
            const rb = massR(b)
            const denom = ra * ra + rb * rb
            const fr = denom > 0 ? (rb * rb) / denom : 0.5
            a.vx = (a.vx ?? 0) - ux * fr
            a.vy = (a.vy ?? 0) - uy * fr
            b.vx = (b.vx ?? 0) + ux * (1 - fr)
            b.vy = (b.vy ?? 0) + uy * (1 - fr)
          }
        }
      }
    }
  }
  const force = () => {
    for (let k = 0; k < iterations; k++) resolveOnce()
  }
  force.initialize = (n: PlanetNode[]) => {
    nodes = n
  }
  return force
}

/**
 * Gentle attraction between connected planets (a spring with rest length 0).
 * Only the non-pinned end moves; pinned planets act as fixed anchors. Clamped at
 * 0.9 so high strengths pull hard and converge fast without overshooting.
 */
/**
 * Hard guarantee that no FREE planet sits inside a FIXED (pinned) one — the most
 * visible overlap artifact (a small planet's label floating on a huge planet).
 * Ejects each overlapping free planet radially to the pinned planet's edge, at
 * full strength. A few iterations handle a free planet caught between two pinned
 * planets. Cheap: O(fixed × free). Run AFTER the general de-overlap so nothing
 * pushes the free planets back in.
 */
function ejectFromFixed(
  nodes: PlanetNode[],
  padding: number,
  entityRadius: number,
  sizeSpacing: number,
  iterations: number,
) {
  const fixed = nodes.filter(isFixed)
  if (!fixed.length) return
  for (let k = 0; k < iterations; k++) {
    for (const a of nodes) {
      if (isFixed(a)) continue
      const ra = collisionRadius(a, padding, entityRadius, sizeSpacing)
      for (const f of fixed) {
        const min = collisionRadius(f, padding, entityRadius, sizeSpacing) + ra
        let dx = a.x - f.x
        let dy = a.y - f.y
        let l2 = dx * dx + dy * dy
        if (l2 >= min * min) continue
        if (l2 < 1e-6) {
          dx = 1
          dy = 0
          l2 = 1
        }
        const l = Math.sqrt(l2)
        a.x = f.x + (dx / l) * min
        a.y = f.y + (dy / l) * min
      }
    }
  }
}

function connectionForce(links: [PlanetNode, PlanetNode][], strength: number) {
  const force = (alpha: number) => {
    for (const [a, b] of links) {
      // Held planets (homes) aren't dragged by a connection; only a free end moves.
      const aFree = a.fx == null && a.fy == null && !a.hold
      const bFree = b.fx == null && b.fy == null && !b.hold
      if (!aFree && !bFree) continue
      const dx = b.x + (b.vx ?? 0) - (a.x + (a.vx ?? 0))
      const dy = b.y + (b.vy ?? 0) - (a.y + (a.vy ?? 0))
      const k = Math.min(strength * alpha, 0.9)
      const ux = dx * k
      const uy = dy * k
      if (aFree && bFree) {
        a.vx = (a.vx ?? 0) + ux * 0.5
        a.vy = (a.vy ?? 0) + uy * 0.5
        b.vx = (b.vx ?? 0) - ux * 0.5
        b.vy = (b.vy ?? 0) - uy * 0.5
      } else if (aFree) {
        a.vx = (a.vx ?? 0) + ux
        a.vy = (a.vy ?? 0) + uy
      } else {
        b.vx = (b.vx ?? 0) - ux
        b.vy = (b.vy ?? 0) - uy
      }
    }
  }
  force.initialize = () => {}
  return force
}

/** Deterministic [0, 1) from a string (FNV-1a + a final avalanche). */
function hash01(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/** Convex hull of the node centres (Andrew's monotone chain), CCW. */
function hullOf(nodes: PlanetNode[]): {x: number; y: number}[] {
  const pts = nodes.map((n) => ({x: n.x, y: n.y})).sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length < 3) return pts
  const cross = (o: {x: number; y: number}, a: {x: number; y: number}, b: {x: number; y: number}) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: {x: number; y: number}[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: {x: number; y: number}[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

/**
 * Gap fill (layout lab): pulls free planets into the empty pockets INSIDE the
 * cluster — the "bald spots" between sector groups that neither the sector pull
 * nor the repulsion closes. A coarse grid samples the area inside the convex
 * hull of the planets; a sample further than `minGap` from every footprint is
 * "bald", and votes for the nearest free planet, weighted by how empty it is.
 * Each planet is then nudged toward the centroid of its votes. Restricting the
 * samples to the hull means edge planets are only ever pulled inward, so the
 * force fills holes rather than spreading the cluster to the canvas edges.
 * Heavy planets barely move (the pull is divided by their mass), so the small
 * ones do the filling. Re-sampled every few ticks to keep a full solve fast.
 */
function gapFillForce(
  strength: number,
  minGap: number,
  bounds: Bounds,
  padding: number,
  entityRadius: number,
  sizeSpacing: number,
) {
  let nodes: PlanetNode[] = []
  let pullX = new Float64Array(0)
  let pullY = new Float64Array(0)
  let tickNo = 0
  const COLS = 52
  const EVERY = 3
  const resample = () => {
    const n = nodes.length
    const sumX = new Float64Array(n)
    const sumY = new Float64Array(n)
    const sumW = new Float64Array(n)
    const foot = new Float64Array(n)
    const free: boolean[] = new Array(n)
    for (let i = 0; i < n; i++) {
      foot[i] = collisionRadius(nodes[i], padding, entityRadius, sizeSpacing)
      free[i] = !isFixed(nodes[i]) && !nodes[i].hold // pinned / held planets don't go filling
    }
    const hull = hullOf(nodes)
    const inHull = (x: number, y: number) => {
      for (let i = 0; i < hull.length; i++) {
        const a = hull[i]
        const b = hull[(i + 1) % hull.length]
        if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false
      }
      return true
    }
    const step = (bounds.x1 - bounds.x0) / COLS
    for (let gy = bounds.y0 + step / 2; gy < bounds.y1; gy += step) {
      for (let gx = bounds.x0 + step / 2; gx < bounds.x1; gx += step) {
        if (hull.length >= 3 && !inHull(gx, gy)) continue
        let empt = Infinity // distance to the nearest footprint edge
        let best = -1 // nearest FREE planet (pinned ones can't come and fill)
        let bestD = Infinity
        for (let i = 0; i < n; i++) {
          const dx = nodes[i].x - gx
          const dy = nodes[i].y - gy
          const d = Math.sqrt(dx * dx + dy * dy) - foot[i]
          if (d < empt) empt = d
          if (free[i] && d < bestD) {
            bestD = d
            best = i
          }
          if (empt <= minGap) break // not bald — no need to look further
        }
        if (best < 0 || empt <= minGap) continue
        const w = empt - minGap
        sumX[best] += gx * w
        sumY[best] += gy * w
        sumW[best] += w
      }
    }
    pullX = new Float64Array(n)
    pullY = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      if (sumW[i] <= 0) continue
      const m = massRadius(nodes[i], entityRadius)
      const heavy = 1 / (1 + (m / 220) * (m / 220))
      pullX[i] = (sumX[i] / sumW[i] - nodes[i].x) * heavy
      pullY[i] = (sumY[i] / sumW[i] - nodes[i].y) * heavy
    }
  }
  const force = (alpha: number) => {
    if (tickNo++ % EVERY === 0 || pullX.length !== nodes.length) resample()
    const k = strength * alpha
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      if (isFixed(a) || a.hold) continue
      a.vx = (a.vx ?? 0) + pullX[i] * k
      a.vy = (a.vy ?? 0) + pullY[i] * k
    }
  }
  force.initialize = (n: PlanetNode[]) => {
    nodes = n
    tickNo = 0
  }
  return force
}

/**
 * Wraps a force so held planets (homes) don't FEEL it. A per-node strength of 0
 * only stops a planet exerting the force; the pinned and free planets would
 * still push the held ones off their homes.
 */
function heldExempt(inner: {(alpha: number): void; initialize?: (nodes: PlanetNode[], random: () => number) => void}) {
  let nodes: PlanetNode[] = []
  const force = (alpha: number) => {
    const held = nodes.filter((n) => n.hold)
    const saved = held.map((n) => [n.vx ?? 0, n.vy ?? 0])
    inner(alpha)
    held.forEach((n, i) => {
      n.vx = saved[i][0]
      n.vy = saved[i][1]
    })
  }
  force.initialize = (n: PlanetNode[], random: () => number) => {
    nodes = n
    inner.initialize?.(n, random)
  }
  return force
}

/** Clamp nodes inside the canvas inset each tick, accounting for radius. */
function boundsForce(b: Bounds) {
  let nodes: PlanetNode[] = []
  const force = () => {
    for (const n of nodes) {
      const r = n.r
      let hit = false
      if (n.x - r < b.x0) {
        n.x = b.x0 + r
        if ((n.vx ?? 0) < 0) n.vx = 0
        hit = true
      }
      if (n.x + r > b.x1) {
        n.x = b.x1 - r
        if ((n.vx ?? 0) > 0) n.vx = 0
        hit = true
      }
      if (n.y - r < b.y0) {
        n.y = b.y0 + r
        if ((n.vy ?? 0) < 0) n.vy = 0
        hit = true
      }
      if (n.y + r > b.y1) {
        n.y = b.y1 - r
        if ((n.vy ?? 0) > 0) n.vy = 0
        hit = true
      }
      if (hit) {
        if (n.vx) n.vx *= 0.5
        if (n.vy) n.vy *= 0.5
      }
    }
  }
  force.initialize = (n: PlanetNode[]) => {
    nodes = n
  }
  return force
}

export type PhysicsOptions = {
  /** Visible companies, already resolved against the data source. */
  inputs: LayoutInput[]
  bounds: Bounds
  viewMode?: ViewMode
  /** Per-company position overrides (slide units). Wins over `input.center`. */
  positions?: Record<string, PlanetPosition>
  /** Keeps a live sim ticking so neighbors adjust around drags/pins. */
  isEditMode?: boolean
  /** Apple's diameter in slide units (see sizing.computeAnchorDiam). */
  anchorDiam?: number
  /** Minimum planet radius (slide units). Floors tiny small-cap planets so they
   *  stay visible — used on the portrait/mobile view where they'd be sub-pixel
   *  dots. 0 = no floor (pure valuation-proportional sizing). */
  minRadius?: number
  /** Extra spacing between planets, slide units. */
  collidePadding?: number
  /**
   * Imaginary collision radius for entity (text-only) nodes, slide units. Gives
   * them a planet-like footprint + mass so neighbors are pushed out instead of
   * overlapping the label.
   */
  entityRadius?: number
  /**
   * Extra clearance proportional to each node's radius (0 = off, 0.15 ≈ 15%).
   * Keeps small planets from crowding large ones — a constant `collidePadding`
   * adds the same gap to every pair regardless of size; this scales with it.
   */
  sizeSpacing?: number
  /**
   * Strength of the gravity pull holding each planet toward its sector center
   * (the `forceX`/`forceY` strength). Lower = looser, so collision/de-overlap
   * wins and planets spread further from the center; higher = tighter clusters.
   */
  sectorPull?: number
  /**
   * Long-range repulsion between planets (a `forceManyBody` charge). 0 = off.
   * Higher values make every planet push every other away, so they actively
   * spread to fill open space instead of just packing tightly near their sector
   * center. Applied as a negative charge (`strength(-repulsion)`).
   */
  repulsion?: number
  /** Per-company label half-extent (slide units) → collision spacing. */
  labelRadii?: Record<string, number>
  /** Connection endpoints (names) → attraction force. */
  connections?: Array<{from: string; to: string}>
  connectionStrength?: number
  /**
   * Live drag-in-progress: pins the named node's fx/fy to (x, y) every tick
   * and keeps the sim warm so neighbors collision-respond to the cursor in
   * real time. `null` (or omitted) when no drag is active. On drag end the
   * fx/fy values persist until the next `positions` update — which keeps the
   * planet visually at the drop point through the Sanity write round-trip.
   */
  dragging?: {name: string; x: number; y: number} | null
  /** Bump this number to re-settle the sim from the current positions WITHOUT
   *  changing any settings (a manual "refresh physics"). */
  restartToken?: number
  /**
   * Hand the nodes to someone else. While true the sim is stopped and NOT
   * rebuilt, so an outside loop can drive node.x/y directly (the app's game
   * mode). Flipping back to false resumes a cool maintaining sim from wherever
   * the nodes are — no pre-warm re-settle, so a restored layout stays put.
   */
  suspended?: boolean
  /**
   * Deterministic layout (layout lab). When set, every random starting jitter is
   * derived from this seed + the planet's name, and every rebuild after the
   * first load RESOLVES FROM SCRATCH and tweens there — so the layout is a pure
   * function of (inputs, settings, seed): the same on every load, and unchanged
   * by anything that doesn't change those (a window resize, a sidebar toggle).
   * Unset = the legacy behaviour (random jitter, re-settle from where it sits).
   */
  seed?: number | null
  /** Pull every planet toward the middle of the canvas (0 = off). */
  centerPull?: number
  /** Pull free planets into empty pockets inside the cluster (0 = off). */
  gapFill?: number
  /** How far (slide units) a spot must be from every planet to count as empty. */
  gapMin?: number
  /** Bump this number to smoothly TWEEN the current layout into the target year's
   *  resolved layout (positions + sizes). Used for A/B pill comparisons — the
   *  target layout is taken from the per-year cache (keyed by `layoutKey`), or
   *  resolved once and cached, so toggling back and forth is stable. */
  resettleToken?: number
  /** Bump this number to replay the first-load intro (fly out from the sector
   *  wells) for the current data — a deliberate "explore this year" reveal. */
  flyIntroToken?: number
  /** Identifies the current layout (the viewed year) for the per-year layout cache
   *  the `resettleToken` tween reads/writes. */
  layoutKey?: string
}

/**
 * d3-force layout for the map. Data-source-agnostic: it takes pre-resolved
 * `inputs` (center/hue/style already computed by the caller) and only does
 * physics + view-mode transitions. Returns the live node list to render.
 */
export function usePhysicsLayout(opts: PhysicsOptions): PlanetNode[] {
  const {
    inputs,
    bounds,
    viewMode = "map",
    positions = {},
    isEditMode = false,
    anchorDiam = ANCHOR_DIAM_FALLBACK,
    minRadius = 0,
    collidePadding = 80,
    entityRadius = 140,
    sizeSpacing = 0,
    sectorPull = 0.035,
    repulsion = 0,
    labelRadii = {},
    connections = [],
    connectionStrength = CONNECTION_PULL,
    dragging = null,
    restartToken = 0,
    resettleToken = 0,
    flyIntroToken = 0,
    layoutKey = "",
    suspended = false,
    seed = null,
    centerPull = 0,
    gapFill = 0,
    gapMin = 60,
  } = opts
  const pure = seed != null

  const [nodes, setNodes] = useState<PlanetNode[]>([])
  const simRef = useRef<Simulation<PlanetNode, undefined> | null>(null)
  const nodeMapRef = useRef<Map<string, PlanetNode>>(new Map())
  // Latest `dragging` lives in a ref so the running sim's tick callback sees
  // mousemove updates without the effect re-running (which would rebuild the sim).
  // useLayoutEffect mirrors it before the browser paints / before d3-timer's
  // next rAF tick, so the tick callback reads the just-rendered value.
  const draggingRef = useRef<{name: string; x: number; y: number} | null>(null)
  useLayoutEffect(() => {
    draggingRef.current = dragging
  })
  const savedMapPositionsRef = useRef<Map<string, {x: number; y: number}> | null>(null)
  const prevViewModeRef = useRef<ViewMode>(viewMode)
  const hasFirstAnimRef = useRef(false)
  const tweenRafRef = useRef<number | null>(null)
  const prevRestartTokenRef = useRef(restartToken)
  const prevResettleTokenRef = useRef(resettleToken)
  const prevFlyTokenRef = useRef(flyIntroToken)
  const prevSuspendedRef = useRef(false)
  // The first-load intro while it is in flight: when it started, how long it
  // runs, and the resolved targets it is tweening toward. Lets an effect re-run
  // mid-intro RE-TARGET the tween instead of tearing it down and snapping.
  const introRef = useRef<{t0: number; ms: number; settled: Map<string, {x: number; y: number}>} | null>(null)
  // Per-year resolved layouts for the A/B tween, keyed by layoutKey. Each entry
  // carries the `sig` of the inputs it was resolved from, so a stale entry (cached
  // before the data/sizes settled, or after a knob/canvas change) is ignored.
  const layoutCacheRef = useRef<Map<string, {sig: string; pos: Map<string, {x: number; y: number}>}>>(
    new Map(),
  )

  // Stable keys so the sim only restarts on meaningful change (membership,
  // valuation/size, center moves, overrides, labels, connections, bounds).
  const inputsKey = useMemo(
    () => inputs.map((i) => `${i.name}:${i.valuation_b}:${i.center.x},${i.center.y}`).sort().join("|"),
    [inputs],
  )
  const positionsKey = useMemo(
    () =>
      Object.entries(positions)
        .map(([name, p]) => `${name}:${p.x},${p.y},${p.pin ? "1" : "0"}${p.hold ? "h" : ""}`)
        .sort()
        .join("|"),
    [positions],
  )
  const labelRadiiKey = useMemo(
    () =>
      Object.entries(labelRadii)
        .map(([name, v]) => `${name}:${v.toFixed(2)}`)
        .sort()
        .join("|"),
    [labelRadii],
  )
  const connectionsKey = useMemo(
    () => connections.map((c) => `${c.from}>${c.to}`).sort().join("|"),
    [connections],
  )
  const boundsKey = `${bounds.x0},${bounds.y0},${bounds.x1},${bounds.y1}`

  useEffect(() => {
    if (inputs.length === 0) {
      setNodes([])
      return
    }

    // Suspended: stop ticking and leave the node objects exactly as they are
    // for the outside driver. The resume run (next effect pass) sees
    // `resumingFromSuspend` and skips the re-settle pre-warm.
    const resumingFromSuspend = prevSuspendedRef.current && !suspended
    prevSuspendedRef.current = suspended
    if (suspended) {
      simRef.current?.stop()
      simRef.current = null
      return
    }

    // Manual "refresh physics" (restartToken bumped): drop the cached nodes so
    // every planet RELOADS fresh at its target (sector well / pin) and the sim
    // re-settles from scratch, rather than reheating from wherever it sat.
    if (restartToken !== prevRestartTokenRef.current) {
      prevRestartTokenRef.current = restartToken
      nodeMapRef.current.clear()
    }

    // Re-settle request (year transition): forget the previous layout entirely and
    // re-resolve from scratch — a hard cut is fine, years don't cross-fade. Clearing
    // the node cache makes every planet a fresh node at its well, and the steady-
    // state branch below runs the full first-load-strength settle (no tween, so
    // nothing can freeze a half-settled frame — the failure mode of easing across).
    const resettleRequested = resettleToken !== prevResettleTokenRef.current
    prevResettleTokenRef.current = resettleToken
    // A fly-intro replays the first-load animation for the new data: clear the node
    // cache (fresh nodes at their wells) and re-arm the first-load branch below.
    const flyRequested = flyIntroToken !== prevFlyTokenRef.current
    prevFlyTokenRef.current = flyIntroToken
    if (flyRequested) {
      nodeMapRef.current.clear()
      hasFirstAnimRef.current = false
    }
    // Signature of everything that shapes THIS view's layout. Stored with each
    // cache entry and checked on lookup: a cached year is reused only if its inputs
    // still match, so persistence stays fast across toggles (same year → same sig →
    // hit) while a stale entry (e.g. cached during first load before valuations
    // settled, or after a knob/canvas/refresh change) is re-resolved.
    const layoutSig = `${inputsKey}|${anchorDiam}|${collidePadding}|${entityRadius}|${sizeSpacing}|${sectorPull}|${repulsion}|${connectionStrength}|${boundsKey}|${labelRadiiKey}|${positionsKey}|${restartToken}|${seed}|${centerPull}|${gapFill}|${gapMin}`
    // Starting jitter in [-0.5, 0.5): random, or seeded per planet when `seed` is set.
    const jit = (name: string, axis: string) =>
      (pure ? hash01(`${seed}|${axis}|${name}`) : Math.random()) - 0.5

    const active = inputs
    const centerByName = new Map(active.map((c) => [c.name, c.center]))

    // Reuse existing node objects so physics state survives re-runs.
    const map = nodeMapRef.current
    const built: PlanetNode[] = active.map((c) => {
      const center = c.center
      // Entities are text-only: no radius (collision spacing comes from their
      // label box + the entity-padding knob).
      const r = c.isEntity ? 0 : Math.max(minRadius, diameterFor(c.valuation_b, anchorDiam) / 2)
      const pos = positions[c.name]
      const targetX = pos ? pos.x : center.x
      const targetY = pos ? pos.y : center.y
      const pinned = !!pos?.pin
      const hold = !!pos?.hold && !pinned
      const labelR = labelRadii[c.name] ?? 0
      const existing = map.get(c.name)
      if (existing) {
        const prevTargetX = existing.targetX
        const prevTargetY = existing.targetY
        existing.sector = c.sector
        existing.valuation_b = c.valuation_b
        existing.isEntity = c.isEntity
        existing.targetR = r
        existing.hue = c.hue
        existing.style = c.style
        existing.targetX = targetX
        existing.targetY = targetY
        existing.pinned = pinned
        existing.hold = hold
        existing.labelRadius = labelR
        existing.labelColor = c.labelColor
        existing.labelText = c.labelText
        if (pinned && pos) {
          existing.fx = pos.x
          existing.fy = pos.y
        } else {
          existing.fx = null
          existing.fy = null
        }
        // Snap to the new target when a position override changed — but NOT when
        // returning from linear (linear set every target to a strip slot, so
        // targets always "differ"; snapping would rob the fly-back tween).
        // Skip the snap during a re-settle — we want to tween from the current
        // position, not jump to the new target first.
        const comingFromLinear = prevViewModeRef.current === "linear"
        if (!pure && !comingFromLinear && !resettleRequested && (prevTargetX !== targetX || prevTargetY !== targetY)) {
          existing.x = targetX
          existing.y = targetY
          existing.vx = 0
          existing.vy = 0
        }
        return existing
      }
      const node: PlanetNode = {
        name: c.name,
        sector: c.sector,
        valuation_b: c.valuation_b,
        isEntity: c.isEntity,
        r,
        targetR: r,
        hue: c.hue,
        style: c.style,
        // A held planet starts exactly at its home (no jitter).
        x: targetX + (hold ? 0 : jit(c.name, "x") * 120),
        y: targetY + (hold ? 0 : jit(c.name, "y") * 120),
        targetX,
        targetY,
        pinned,
        hold,
        fx: pinned && pos ? pos.x : null,
        fy: pinned && pos ? pos.y : null,
        labelRadius: labelR,
        labelColor: c.labelColor,
        labelText: c.labelText,
      }
      map.set(c.name, node)
      return node
    })

    // Drop stale entries from the persistent map.
    const activeNames = new Set(built.map((n) => n.name))
    for (const key of map.keys()) {
      if (!activeNames.has(key)) map.delete(key)
    }

    // Snapshot the current resolved positions into the per-year layout cache (read
    // back by the A/B tween). Called after each settle path resolves the layout.
    const cacheLayout = () => {
      if (layoutKey) {
        layoutCacheRef.current.set(layoutKey, {
          sig: layoutSig,
          pos: new Map(built.map((n) => [n.name, {x: n.x, y: n.y}])),
        })
      }
    }

    // Resolve connections to node pairs (skip ones missing an endpoint).
    const builtByName = new Map(built.map((n) => [n.name, n] as const))
    const linkPairs: [PlanetNode, PlanetNode][] = []
    for (const c of connections) {
      const a = builtByName.get(c.from)
      const b = builtByName.get(c.to)
      if (a && b && a !== b) linkPairs.push([a, b])
    }

    simRef.current?.stop()

    // One place builds the force set, so every settle path stays in step.
    const midX = (bounds.x0 + bounds.x1) / 2
    const midY = (bounds.y0 + bounds.y1) / 2
    const buildSim = () => {
      const s = forceSimulation<PlanetNode>(built)
        // A held planet is sprung to its home at HOLD_STRENGTH and exerts no
        // repulsion; everything else gets the sector pull + charge as usual.
        .force("x", forceX<PlanetNode>((d) => d.targetX).strength((d) => (d.hold ? HOLD_STRENGTH : sectorPull)))
        .force("y", forceY<PlanetNode>((d) => d.targetY).strength((d) => (d.hold ? HOLD_STRENGTH : sectorPull)))
        .force("collide", liveCollide(collidePadding, 0.9, 2, entityRadius, sizeSpacing))
        .force("charge", heldExempt(forceManyBody<PlanetNode>().strength((d) => (d.hold ? 0 : -repulsion))))
        .force("link", connectionForce(linkPairs, connectionStrength))
      if (centerPull > 0) {
        s.force("centerX", forceX<PlanetNode>(midX).strength((d) => (d.hold ? 0 : centerPull)))
        s.force("centerY", forceY<PlanetNode>(midY).strength((d) => (d.hold ? 0 : centerPull)))
      }
      if (gapFill > 0) {
        s.force("gapFill", gapFillForce(gapFill, gapMin, bounds, collidePadding, entityRadius, sizeSpacing))
      }
      return s.force("bounds", boundsForce(bounds))
    }

    const prevMode = prevViewModeRef.current
    prevViewModeRef.current = viewMode

    // === LINEAR MODE === vertically-centered strip, largest-first.
    if (viewMode === "linear") {
      if (prevMode === "map") {
        const snap = new Map<string, {x: number; y: number}>()
        for (const n of built) snap.set(n.name, {x: n.x, y: n.y})
        savedMapPositionsRef.current = snap
      }
      const LEFT_PAD = 80
      const GAP = 30
      const centerY = (bounds.y0 + bounds.y1) / 2
      let rafId: number | null = null

      const computeTargets = () => {
        const sorted = [...built].sort((a, b) => b.targetR - a.targetR)
        let cursor = bounds.x0 + LEFT_PAD
        for (const n of sorted) {
          const effR = Math.max(n.targetR, n.labelRadius ?? 0)
          const cx = cursor + effR
          n.targetX = cx
          n.targetY = centerY
          cursor = cx + effR + GAP
        }
      }

      const tick = () => {
        computeTargets()
        for (const n of built) {
          n.x += (n.targetX - n.x) * 0.1
          n.y += (n.targetY - n.y) * 0.1
          if (Math.abs(n.r - n.targetR) > 0.05) {
            n.r += (n.targetR - n.r) * 0.08
          } else {
            n.r = n.targetR
          }
          n.vx = 0
          n.vy = 0
        }
        setNodes(built.slice())
        rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
      setNodes(built.slice())

      return () => {
        if (rafId !== null) cancelAnimationFrame(rafId)
      }
    }

    // === MAP MODE === returning from linear: smooth fly-back to snapshot.
    if (prevMode === "linear" && savedMapPositionsRef.current) {
      const saved = savedMapPositionsRef.current
      savedMapPositionsRef.current = null

      const startPos = new Map<string, {x: number; y: number}>()
      const savedFx = new Map<string, {fx: number | null; fy: number | null}>()
      for (const n of built) {
        startPos.set(n.name, {x: n.x, y: n.y})
        savedFx.set(n.name, {fx: n.fx ?? null, fy: n.fy ?? null})
        n.fx = null
        n.fy = null
        n.vx = 0
        n.vy = 0
      }

      const TWEEN_MS = 800
      const t0 = performance.now()
      let rafId: number | null = null
      const tick = (now: number) => {
        const t = Math.max(0, Math.min(1, (now - t0) / TWEEN_MS)) // rAF time can predate t0 after a long solve
        const k = 1 - Math.pow(1 - t, 3)
        for (const n of built) {
          const s = startPos.get(n.name)!
          const e = saved.get(n.name) ?? s
          n.x = s.x + (e.x - s.x) * k
          n.y = s.y + (e.y - s.y) * k
          if (Math.abs(n.r - n.targetR) > 0.05) n.r += (n.targetR - n.r) * 0.08
          else n.r = n.targetR
        }
        setNodes(built.slice())
        if (t < 1) {
          rafId = requestAnimationFrame(tick)
        } else {
          rafId = null
          for (const n of built) {
            const f = savedFx.get(n.name)
            if (f && f.fx !== null && f.fy !== null) {
              n.fx = f.fx
              n.fy = f.fy
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick)
      setNodes(built.slice())
      return () => {
        if (rafId !== null) cancelAnimationFrame(rafId)
      }
    }

    // First-load animation: silently pre-warm, then ease from sector centers to
    // converged positions (so the initial jitter is invisible and pinned planets
    // animate in rather than snapping). Skipped in edit mode — the editor needs
    // a drag-aware live sim from the first interaction, so it does its own
    // synchronous pre-warm in the edit-mode branch below.
    const isFirstAnim =
      !hasFirstAnimRef.current && prevMode !== "linear" && built.length > 0 && !isEditMode

    if (isFirstAnim) {
      hasFirstAnimRef.current = true

      const sim = buildSim()
        .alpha(0.9)
        .alphaDecay(0.022)
        .velocityDecay(0.72)
        .stop()

      const PREWARM_TICKS = 600
      sim.tick(PREWARM_TICKS)
      // Converge to a non-overlapping layout. A single 8-sweep pass can't
      // separate the many *unpositioned* planets that start dead-stacked at a
      // shared sector center, so alternate a strong hard de-overlap with short
      // bursts of the attraction sim: planets spread apart without drifting off
      // their sector, and pinned planets stay fixed. End on a de-overlap pass so
      // the snapshot (and its cache entry) is overlap-free. Kept in step with the
      // A/B tween's miss-settle so a year cached here is as resolved as one cached
      // by a pill toggle (else the present map comes back with residual overlap).
      for (let round = 0; round < 14; round++) {
        separateOverlaps(built, collidePadding, entityRadius, sizeSpacing, bounds, 16, 1)
        sim.tick(20)
      }
      // Final hard de-overlap: many sweeps so tight clusters around big pinned
      // planets fully resolve (the snapshot the tween eases toward is final).
      separateOverlaps(built, collidePadding, entityRadius, sizeSpacing, bounds, 160, 1)
      ejectFromFixed(built, collidePadding, entityRadius, sizeSpacing, 6)

      const settled = new Map<string, {x: number; y: number}>()
      const savedFx = new Map<string, {fx: number | null; fy: number | null}>()
      for (const n of built) {
        settled.set(n.name, {x: n.x, y: n.y})
        savedFx.set(n.name, {fx: n.fx ?? null, fy: n.fy ?? null})
      }
      cacheLayout() // built is at the resolved layout here — snapshot it for A/B tweens.

      // Reset to each planet's resolved center (with mild noise) for the tween start.
      for (const n of built) {
        const center = centerByName.get(n.name) ?? {x: n.targetX, y: n.targetY}
        n.x = center.x + jit(n.name, "ix") * 80
        n.y = center.y + jit(n.name, "iy") * 80
        n.vx = 0
        n.vy = 0
        n.fx = null
        n.fy = null
      }

      const startPos = new Map<string, {x: number; y: number}>()
      for (const n of built) startPos.set(n.name, {x: n.x, y: n.y})

      const TWEEN_MS = 800
      const t0 = performance.now()
      introRef.current = {t0, ms: TWEEN_MS, settled}

      const tweenTick = (now: number) => {
        const t = Math.max(0, Math.min(1, (now - t0) / TWEEN_MS)) // rAF time can predate t0 after a long solve
        const k = 1 - Math.pow(1 - t, 3)
        for (const n of built) {
          const s = startPos.get(n.name)!
          const e = settled.get(n.name)!
          n.x = s.x + (e.x - s.x) * k
          n.y = s.y + (e.y - s.y) * k
          if (Math.abs(n.r - n.targetR) > 0.05) {
            n.r += (n.targetR - n.r) * 0.08
          } else {
            n.r = n.targetR
          }
        }
        setNodes(built.slice())

        if (t < 1) {
          tweenRafRef.current = requestAnimationFrame(tweenTick)
        } else {
          tweenRafRef.current = null
          introRef.current = null
          for (const n of built) {
            const f = savedFx.get(n.name)
            if (f && f.fx !== null && f.fy !== null) {
              n.fx = f.fx
              n.fy = f.fy
            }
          }
        }
      }
      tweenRafRef.current = requestAnimationFrame(tweenTick)

      simRef.current = sim
      setNodes(built.slice())

      return () => {
        if (tweenRafRef.current !== null) {
          cancelAnimationFrame(tweenRafRef.current)
          tweenRafRef.current = null
        }
        sim.stop()
      }
    }

    // A/B comparison tween (a saved-year pill toggle): ease the CURRENT layout into
    // the target year's resolved layout (positions + sizes). The target comes from
    // the per-year cache; on a miss, resolve it once (fresh settle) and cache it, so
    // toggling back and forth lands on the same map each time. No live sim — a
    // deterministic morph between two pre-resolved layouts.
    // Deterministic mode (`seed`) sends EVERY rebuild through here, so the
    // layout is always the from-scratch solve for the current inputs.
    if ((resettleRequested || (pure && !resumingFromSuspend)) && !isEditMode && hasFirstAnimRef.current && prevMode !== "linear" && built.length > 0) {
      const startPos = new Map(built.map((n) => [n.name, {x: n.x, y: n.y}]))
      const startR = new Map(built.map((n) => [n.name, n.r]))
      const savedFx = new Map(built.map((n) => [n.name, {fx: n.fx ?? null, fy: n.fy ?? null}]))

      const cached = layoutKey ? layoutCacheRef.current.get(layoutKey) : undefined
      let target = cached && cached.sig === layoutSig ? cached.pos : undefined
      if (!target) {
        // Cache miss (or stale): resolve this year's layout once and cache it. Use
        // the TARGET-year radii for the settle (existing nodes still carry the old
        // year's r until the tween), else collision packs for the wrong sizes and
        // caches an overlapping layout. Mutates `built`; we restore A below.
        for (const n of built) {
          n.r = n.targetR
          if (n.fx == null) {
            // Deterministic mode seats every planet exactly as a first load would
            // (at its target + seeded jitter), so this solve lands on the same map.
            const center = pure
              ? {x: n.targetX, y: n.targetY}
              : (centerByName.get(n.name) ?? {x: n.targetX, y: n.targetY})
            n.x = center.x + (n.hold ? 0 : jit(n.name, "x") * 120)
            n.y = center.y + (n.hold ? 0 : jit(n.name, "y") * 120)
            n.vx = 0
            n.vy = 0
          }
        }
        const s = buildSim()
          .alpha(0.9)
          .alphaDecay(0.022)
          .velocityDecay(0.72)
          .stop()
        s.tick(600)
        // Fully converge: alternate strong de-overlap with attraction bursts, then
        // a long final de-overlap so the cached layout has NO residual overlap.
        for (let round = 0; round < 14; round++) {
          separateOverlaps(built, collidePadding, entityRadius, sizeSpacing, bounds, 16, 1)
          s.tick(20)
        }
        separateOverlaps(built, collidePadding, entityRadius, sizeSpacing, bounds, 160, 1)
        ejectFromFixed(built, collidePadding, entityRadius, sizeSpacing, 6)
        cacheLayout()
        target =
          layoutCacheRef.current.get(layoutKey)?.pos ??
          new Map(built.map((n) => [n.name, {x: n.x, y: n.y}]))
      }

      // Reset to A (current) for the tween start; clear pins during the morph.
      for (const n of built) {
        const a = startPos.get(n.name)!
        n.x = a.x
        n.y = a.y
        n.vx = 0
        n.vy = 0
        n.fx = null
        n.fy = null
      }

      const TWEEN_MS = 650
      const t0 = performance.now()
      const morph = target
      const tick = (now: number) => {
        const t = Math.max(0, Math.min(1, (now - t0) / TWEEN_MS)) // rAF time can predate t0 after a long solve
        const k = 1 - Math.pow(1 - t, 3)
        for (const n of built) {
          const a = startPos.get(n.name) ?? {x: n.x, y: n.y}
          const b = morph.get(n.name) ?? a
          n.x = a.x + (b.x - a.x) * k
          n.y = a.y + (b.y - a.y) * k
          const r0 = startR.get(n.name) ?? n.targetR
          n.r = r0 + (n.targetR - r0) * k
        }
        setNodes(built.slice())
        if (t < 1) {
          tweenRafRef.current = requestAnimationFrame(tick)
        } else {
          tweenRafRef.current = null
          for (const n of built) {
            const b = morph.get(n.name)
            if (b) {
              n.x = b.x
              n.y = b.y
            }
            n.r = n.targetR
            const f = savedFx.get(n.name)
            if (f && f.fx !== null && f.fy !== null) {
              n.fx = f.fx
              n.fy = f.fy
            }
          }
          setNodes(built.slice())
        }
      }
      tweenRafRef.current = requestAnimationFrame(tick)
      simRef.current = null
      setNodes(built.slice())
      return () => {
        if (tweenRafRef.current !== null) {
          cancelAnimationFrame(tweenRafRef.current)
          tweenRafRef.current = null
        }
      }
    }

    // Edit mode: keep a live damped sim so neighbors adjust around drags/pins.
    if (isEditMode) {
      // First build in edit mode: synchronous pre-warm so planets are settled
      // when the editor first appears. We do this WITHOUT the tick callback
      // attached so the prewarm ticks don't fire setNodes 400 times.
      const firstBuild = !hasFirstAnimRef.current
      if (firstBuild) {
        hasFirstAnimRef.current = true
        const prewarm = buildSim()
          .alpha(0.9)
          .alphaDecay(0.022)
          .velocityDecay(0.72)
          .stop()
        prewarm.tick(400)
        separateOverlaps(built, collidePadding, entityRadius, sizeSpacing, bounds, 8, 1)
      }

      const sim = buildSim()
        // First build starts cool — the pre-warm already settled the layout, so
        // the live sim only maintains it (smooth initial load). A re-build from a
        // knob/data change starts WARM so soft alpha-scaled forces (notably the
        // sector-pull gravity) visibly re-settle the planets instead of being
        // frozen by the cool sim. Drags re-warm via alphaTarget either way.
        .alpha(firstBuild ? 0.12 : 0.5)
        .alphaDecay(0.05)
        .velocityDecay(0.85)
        .on("tick", () => {
          // If a planet is being dragged, pin it to the cursor each tick so
          // d3-force's fx/fy mechanism overrides the collide/forceX pushback.
          // Neighbors then collision-respond to the cursor position in real time.
          const drag = draggingRef.current
          if (drag) {
            const node = nodeMapRef.current.get(drag.name)
            if (node) {
              node.fx = drag.x
              node.fy = drag.y
            }
          }
          let anyTweening = false
          for (const n of built) {
            if (Math.abs(n.r - n.targetR) > 0.05) {
              n.r += (n.targetR - n.r) * 0.08
              anyTweening = true
            } else {
              n.r = n.targetR
            }
          }
          if (drag) sim.alphaTarget(0.3)
          else if (anyTweening) sim.alphaTarget(0.1)
          else if (sim.alphaTarget() > 0) sim.alphaTarget(0)
          // Hard guarantee: after the soft forces step, directly separate any
          // remaining overlaps so the rendered frame is never overlapping.
          separateOverlaps(built, collidePadding, entityRadius, sizeSpacing, bounds, 2, 0.5)
          ejectFromFixed(built, collidePadding, entityRadius, sizeSpacing, 2)
          setNodes(built.slice())
        })
      simRef.current = sim
      setNodes(built.slice())
      return () => {
        sim.stop()
      }
    }

    // The first-load intro is an 800ms tween driven inside this effect, so ANY
    // dependency change during it (the live valuations upgrading the snapshot,
    // the container being measured, Sanity settings landing) tears the tween
    // down and re-runs the effect — which used to fall through to the silent
    // re-settle below and SNAP every planet to its final spot. That is why the
    // intro "sometimes didn't happen": a race it lost more often than not.
    // Instead, RE-TARGET the in-flight intro: re-settle for the new inputs
    // (seated at the previous resolved targets, so a light settle suffices) and
    // keep tweening from wherever the planets are now to the new targets over
    // the time the intro had left.
    const intro = introRef.current
    const introElapsed = intro ? performance.now() - intro.t0 : Infinity
    if (intro && introElapsed < intro.ms && !isEditMode && built.length > 0) {
      const startPos = new Map(built.map((n) => [n.name, {x: n.x, y: n.y}]))
      const shownR = new Map(built.map((n) => [n.name, n.r]))
      const savedFx = new Map(built.map((n) => [n.name, {fx: n.fx ?? null, fy: n.fy ?? null}]))
      for (const n of built) {
        const at = intro.settled.get(n.name)
        n.x = at ? at.x : n.targetX
        n.y = at ? at.y : n.targetY
        n.vx = 0
        n.vy = 0
        n.r = n.targetR // settle for the FINAL sizes; the shown size keeps easing below
      }
      const s = buildSim()
        .alpha(0.4)
        .alphaDecay(0.05)
        .velocityDecay(0.72)
        .stop()
      for (let round = 0; round < 10; round++) {
        separateOverlaps(built, collidePadding, entityRadius, sizeSpacing, bounds, 12, 1)
        s.tick(5)
      }
      separateOverlaps(built, collidePadding, entityRadius, sizeSpacing, bounds, 40, 1)
      ejectFromFixed(built, collidePadding, entityRadius, sizeSpacing, 6)
      const settled = new Map(built.map((n) => [n.name, {x: n.x, y: n.y}]))
      cacheLayout()

      // Back to what is on screen; the tween carries it to the new targets.
      for (const n of built) {
        const p = startPos.get(n.name)!
        n.x = p.x
        n.y = p.y
        n.r = shownR.get(n.name) ?? n.r
        n.vx = 0
        n.vy = 0
        n.fx = null
        n.fy = null
      }
      const remaining = Math.max(350, intro.ms - introElapsed)
      const t0 = performance.now()
      introRef.current = {t0, ms: remaining, settled}
      const tick = (now: number) => {
        const t = Math.max(0, Math.min(1, (now - t0) / remaining))
        const k = 1 - Math.pow(1 - t, 3)
        for (const n of built) {
          const a = startPos.get(n.name)!
          const b = settled.get(n.name)!
          n.x = a.x + (b.x - a.x) * k
          n.y = a.y + (b.y - a.y) * k
          if (Math.abs(n.r - n.targetR) > 0.05) n.r += (n.targetR - n.r) * 0.08
          else n.r = n.targetR
        }
        setNodes(built.slice())
        if (t < 1) {
          tweenRafRef.current = requestAnimationFrame(tick)
        } else {
          tweenRafRef.current = null
          introRef.current = null
          for (const n of built) {
            const f = savedFx.get(n.name)
            if (f && f.fx !== null && f.fy !== null) {
              n.fx = f.fx
              n.fy = f.fy
            }
          }
        }
      }
      tweenRafRef.current = requestAnimationFrame(tick)
      simRef.current = null
      setNodes(built.slice())
      return () => {
        if (tweenRafRef.current !== null) {
          cancelAnimationFrame(tweenRafRef.current)
          tweenRafRef.current = null
        }
      }
    }

    // Outside edit mode (map mode, after the first-load intro). This runs on
    // EVERY re-run that isn't the first animation — which is the failure mode we
    // hit: the first-load intro gets torn down mid-tween by a late dependency
    // change (the container being measured, the Google Sheet valuations arriving,
    // a month resize) and React re-runs the effect here. The old code just froze
    // the half-settled, overlapping frame. Instead, re-settle: a silent hard
    // de-overlap converge from the CURRENT positions (resolves any overlap left
    // by the interrupted intro while keeping a good layout roughly in place),
    // then a cool live sim that eases `r` tweens and maintains separation before
    // cooling to a full stop. Mirrors the edit-mode prewarm + cool sim.
    // (Skipped when resuming from `suspended`: the driver restored a layout that
    // was already settled, and a pre-warm would nudge it.)
    if (!resumingFromSuspend) {
      const prewarm = buildSim()
        .alpha(0.4)
        .alphaDecay(0.05)
        .velocityDecay(0.72)
        .stop()
      // Mostly separation (keeps a settled layout in place) with light attraction
      // bursts so a dead-stacked cluster from an interrupted intro still spreads.
      for (let round = 0; round < 10; round++) {
        separateOverlaps(built, collidePadding, entityRadius, sizeSpacing, bounds, 12, 1)
        prewarm.tick(5)
      }
      separateOverlaps(built, collidePadding, entityRadius, sizeSpacing, bounds, 20, 1)
      ejectFromFixed(built, collidePadding, entityRadius, sizeSpacing, 4)
    }
    const sim = buildSim()
      // Cool maintaining sim — the pre-warm above already resolved the layout
      // (including a full re-settle), so this only holds separation + eases r.
      .alpha(0.12)
      .alphaDecay(0.05)
      .velocityDecay(0.85)
      .on("tick", () => {
        let anyTweening = false
        for (const n of built) {
          if (Math.abs(n.r - n.targetR) > 0.05) {
            n.r += (n.targetR - n.r) * 0.08
            anyTweening = true
          } else {
            n.r = n.targetR
          }
        }
        if (anyTweening) sim.alphaTarget(0.08)
        else if (sim.alphaTarget() > 0) sim.alphaTarget(0)
        separateOverlaps(built, collidePadding, entityRadius, sizeSpacing, bounds, 2, 0.5)
        ejectFromFixed(built, collidePadding, entityRadius, sizeSpacing, 2)
        setNodes(built.slice())
      })
    // Resuming from `suspended`: the driver restored a layout that was at rest
    // before it took over, so there is nothing to maintain — don't tick at all.
    // (Even a near-zero alpha runs ~130 ticks of hard separation, and that pass
    // and liveCollide disagree on some pairs by a few su, so it would creep.)
    if (resumingFromSuspend) sim.stop()
    simRef.current = sim
    setNodes(built.slice())
    return () => {
      sim.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputsKey, viewMode, positionsKey, anchorDiam, collidePadding, entityRadius, sizeSpacing, sectorPull, repulsion, labelRadiiKey, connectionsKey, connectionStrength, boundsKey, restartToken, resettleToken, flyIntroToken, suspended, seed, centerPull, gapFill, gapMin])

  // Wake/cool the sim on drag enter/leave. The tick callback already nudges
  // alphaTarget on every tick, but the sim can be fully cooled (alpha=0) when
  // a drag starts — so it needs an explicit restart to begin ticking again.
  // Deps key on drag enter/leave only (not on x/y) so mousemoves don't restart.
  const draggingName = dragging?.name ?? null
  useEffect(() => {
    const sim = simRef.current
    if (!sim) return
    if (draggingName) {
      sim.alphaTarget(0.3).restart()
    } else {
      sim.alphaTarget(0)
    }
  }, [draggingName])

  return nodes
}
