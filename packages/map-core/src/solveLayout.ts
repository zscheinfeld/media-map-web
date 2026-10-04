// The map's layout solver: the force set and the from-scratch settle, with no
// React in sight — so it can run anywhere, including a Web Worker (the Time
// Machine solves every year's map in the background). `usePhysicsLayout` wraps
// this with the animation, drag and view-mode handling.
import {forceManyBody, forceSimulation, forceX, forceY} from "d3-force"
import type {Bounds, PlanetNode} from "./types.js"
import {ANCHOR_DIAM_FALLBACK, diameterFor} from "./sizing.js"
import type {PhysicsOptions} from "./usePhysicsLayout.js"

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
export function separateOverlaps(
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
export function ejectFromFixed(
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

/** The knobs that shape a settle — everything the force set reads. */
export type SettleParams = {
  bounds: Bounds
  collidePadding: number
  entityRadius: number
  sizeSpacing: number
  sectorPull: number
  repulsion: number
  connectionStrength: number
  centerPull: number
  gapFill: number
  gapMin: number
}

/** The map's force set. One place builds it, so every settle path stays in step. */
export function buildLayoutSim(built: PlanetNode[], linkPairs: [PlanetNode, PlanetNode][], p: SettleParams) {
  const midX = (p.bounds.x0 + p.bounds.x1) / 2
  const midY = (p.bounds.y0 + p.bounds.y1) / 2
  const s = forceSimulation<PlanetNode>(built)
    // A held planet is sprung to its home at HOLD_STRENGTH and exerts no
    // repulsion; everything else gets the sector pull + charge as usual.
    .force("x", forceX<PlanetNode>((d) => d.targetX).strength((d) => (d.hold ? HOLD_STRENGTH : p.sectorPull)))
    .force("y", forceY<PlanetNode>((d) => d.targetY).strength((d) => (d.hold ? HOLD_STRENGTH : p.sectorPull)))
    .force("collide", liveCollide(p.collidePadding, 0.9, 2, p.entityRadius, p.sizeSpacing))
    .force("charge", heldExempt(forceManyBody<PlanetNode>().strength((d) => (d.hold ? 0 : -p.repulsion))))
    .force("link", connectionForce(linkPairs, p.connectionStrength))
  if (p.centerPull > 0) {
    s.force("centerX", forceX<PlanetNode>(midX).strength((d) => (d.hold ? 0 : p.centerPull)))
    s.force("centerY", forceY<PlanetNode>(midY).strength((d) => (d.hold ? 0 : p.centerPull)))
  }
  if (p.gapFill > 0) {
    s.force("gapFill", gapFillForce(p.gapFill, p.gapMin, p.bounds, p.collidePadding, p.entityRadius, p.sizeSpacing))
  }
  return s.force("bounds", boundsForce(p.bounds))
}

/**
 * The from-scratch settle: nodes seated at their targets (+ jitter) converge to
 * the resolved, overlap-free layout. Written as a generator that yields between
 * small batches of work, so a caller can spread one solve over many frames
 * (`solveLayoutSteps`); `settleLayout` runs it straight through. The batches
 * are only a way of pausing — the arithmetic is the same either way.
 */
function* settleSteps(built: PlanetNode[], linkPairs: [PlanetNode, PlanetNode][], p: SettleParams): Generator<void, void, void> {
  const sim = buildLayoutSim(built, linkPairs, p)
    .alpha(0.9)
    .alphaDecay(0.022)
    .velocityDecay(0.72)
    .stop()
  const PREWARM_TICKS = 600
  const BATCH = 4
  for (let done = 0; done < PREWARM_TICKS; done += BATCH) {
    sim.tick(Math.min(BATCH, PREWARM_TICKS - done))
    yield
  }
  // Converge to a non-overlapping layout. A single 8-sweep pass can't
  // separate the many *unpositioned* planets that start dead-stacked at a
  // shared sector center, so alternate a strong hard de-overlap with short
  // bursts of the attraction sim: planets spread apart without drifting off
  // their sector, and pinned planets stay fixed. End on a de-overlap pass so
  // the result is overlap-free.
  for (let round = 0; round < 14; round++) {
    separateOverlaps(built, p.collidePadding, p.entityRadius, p.sizeSpacing, p.bounds, 16, 1)
    yield
    for (let done = 0; done < 20; done += BATCH) {
      sim.tick(BATCH)
      yield
    }
  }
  // Final hard de-overlap: many sweeps so tight clusters around big pinned
  // planets fully resolve.
  for (let sweeps = 0; sweeps < 160; sweeps += 16) {
    separateOverlaps(built, p.collidePadding, p.entityRadius, p.sizeSpacing, p.bounds, 16, 1)
    yield
  }
  ejectFromFixed(built, p.collidePadding, p.entityRadius, p.sizeSpacing, 6)
}

export function settleLayout(built: PlanetNode[], linkPairs: [PlanetNode, PlanetNode][], p: SettleParams) {
  const steps = settleSteps(built, linkPairs, p)
  while (!steps.next().done) {
    /* run to the end */
  }
}

/** Deterministic starting jitter in [-0.5, 0.5) for a planet (random when unseeded). */
export const seededJitter = (seed: number | null | undefined, name: string, axis: string) =>
  (seed != null ? hash01(`${seed}|${axis}|${name}`) : Math.random()) - 0.5

export type SolveLayoutOptions = Pick<
  PhysicsOptions,
  | "inputs"
  | "bounds"
  | "positions"
  | "anchorDiam"
  | "minRadius"
  | "collidePadding"
  | "entityRadius"
  | "sizeSpacing"
  | "sectorPull"
  | "repulsion"
  | "labelRadii"
  | "connections"
  | "connectionStrength"
  | "seed"
  | "centerPull"
  | "gapFill"
  | "gapMin"
>

/**
 * Solve a layout with no React and no animation: the same from-scratch settle
 * `usePhysicsLayout` runs for a first load, returning the resolved nodes. With a
 * `seed` the result is exactly the map the hook would show for these options —
 * which is what lets a preview of ANOTHER year (the Time Machine's thumbnails)
 * match the map you land on when you open it.
 *
 * A generator, so the work can be sliced across frames: keep calling `next()`
 * until `done`; the final value is the node list.
 */
export function* solveLayoutSteps(opts: SolveLayoutOptions): Generator<void, PlanetNode[], void> {
  const {
    inputs,
    bounds,
    positions = {},
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
    seed = null,
    centerPull = 0,
    gapFill = 0,
    gapMin = 60,
  } = opts
  // Seat every planet as the hook seats a brand-new node.
  const built: PlanetNode[] = inputs.map((c) => {
    const r = c.isEntity ? 0 : Math.max(minRadius, diameterFor(c.valuation_b, anchorDiam) / 2)
    const pos = positions[c.name]
    const targetX = pos ? pos.x : c.center.x
    const targetY = pos ? pos.y : c.center.y
    const pinned = !!pos?.pin
    const hold = !!pos?.hold && !pinned
    return {
      name: c.name,
      sector: c.sector,
      valuation_b: c.valuation_b,
      isEntity: c.isEntity,
      r,
      targetR: r,
      hue: c.hue,
      style: c.style,
      x: targetX + (hold ? 0 : seededJitter(seed, c.name, "x") * 120),
      y: targetY + (hold ? 0 : seededJitter(seed, c.name, "y") * 120),
      targetX,
      targetY,
      pinned,
      hold,
      fx: pinned && pos ? pos.x : null,
      fy: pinned && pos ? pos.y : null,
      labelRadius: labelRadii[c.name] ?? 0,
      labelColor: c.labelColor,
      labelText: c.labelText,
    }
  })
  const byName = new Map(built.map((n) => [n.name, n] as const))
  const linkPairs: [PlanetNode, PlanetNode][] = []
  for (const c of connections) {
    const a = byName.get(c.from)
    const b = byName.get(c.to)
    if (a && b && a !== b) linkPairs.push([a, b])
  }
  yield* settleSteps(built, linkPairs, {
    bounds, collidePadding, entityRadius, sizeSpacing, sectorPull, repulsion, connectionStrength, centerPull, gapFill, gapMin,
  })
  return built
}

/** `solveLayoutSteps`, run straight through. */
export function solveLayout(opts: SolveLayoutOptions): PlanetNode[] {
  const steps = solveLayoutSteps(opts)
  for (;;) {
    const step = steps.next()
    if (step.done) return step.value
  }
}
