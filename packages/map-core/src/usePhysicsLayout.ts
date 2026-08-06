import {useEffect, useLayoutEffect, useMemo, useRef, useState} from "react"
import {forceManyBody, forceSimulation, forceX, forceY, type Simulation} from "d3-force"
import type {Bounds, LayoutInput, PlanetNode, PlanetPosition, ViewMode} from "./types.js"
import {ANCHOR_DIAM_FALLBACK, diameterFor} from "./sizing.js"

// Per-tick attraction strength between connected planets. Well above the sector
// pull (forceX/Y ≈ 0.035–0.04) so connected planets are drawn firmly toward each
// other (clamped for stability inside connectionForce).
export const CONNECTION_PULL = 0.55

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
      const aFree = a.fx == null && a.fy == null
      const bFree = b.fx == null && b.fy == null
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
  } = opts

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

  // Stable keys so the sim only restarts on meaningful change (membership,
  // valuation/size, center moves, overrides, labels, connections, bounds).
  const inputsKey = useMemo(
    () => inputs.map((i) => `${i.name}:${i.valuation_b}:${i.center.x},${i.center.y}`).sort().join("|"),
    [inputs],
  )
  const positionsKey = useMemo(
    () =>
      Object.entries(positions)
        .map(([name, p]) => `${name}:${p.x},${p.y},${p.pin ? "1" : "0"}`)
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
        const comingFromLinear = prevViewModeRef.current === "linear"
        if (!comingFromLinear && (prevTargetX !== targetX || prevTargetY !== targetY)) {
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
        x: targetX + (Math.random() - 0.5) * 120,
        y: targetY + (Math.random() - 0.5) * 120,
        targetX,
        targetY,
        pinned,
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

    // Resolve connections to node pairs (skip ones missing an endpoint).
    const builtByName = new Map(built.map((n) => [n.name, n] as const))
    const linkPairs: [PlanetNode, PlanetNode][] = []
    for (const c of connections) {
      const a = builtByName.get(c.from)
      const b = builtByName.get(c.to)
      if (a && b && a !== b) linkPairs.push([a, b])
    }

    simRef.current?.stop()

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
        const t = Math.min(1, (now - t0) / TWEEN_MS)
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

      const sim = forceSimulation<PlanetNode>(built)
        .force("x", forceX<PlanetNode>((d) => d.targetX).strength(sectorPull))
        .force("y", forceY<PlanetNode>((d) => d.targetY).strength(sectorPull))
        .force("collide", liveCollide(collidePadding, 0.9, 2, entityRadius, sizeSpacing))
        .force("charge", forceManyBody<PlanetNode>().strength(-repulsion))
        .force("link", connectionForce(linkPairs, connectionStrength))
        .force("bounds", boundsForce(bounds))
        .alpha(0.9)
        .alphaDecay(0.022)
        .velocityDecay(0.72)
        .stop()

      const PREWARM_TICKS = 400
      sim.tick(PREWARM_TICKS)
      // Converge to a non-overlapping layout. A single 8-sweep pass can't
      // separate the many *unpositioned* planets that start dead-stacked at a
      // shared sector center, so alternate a strong hard de-overlap with short
      // bursts of the attraction sim: planets spread apart without drifting off
      // their sector, and pinned planets stay fixed. End on a de-overlap pass so
      // the snapshot the tween eases toward is overlap-free.
      for (let round = 0; round < 10; round++) {
        separateOverlaps(built, collidePadding, entityRadius, sizeSpacing, bounds, 16, 1)
        sim.tick(20)
      }
      // Final hard de-overlap: many sweeps so tight clusters around big pinned
      // planets fully resolve (the snapshot the tween eases toward is final).
      separateOverlaps(built, collidePadding, entityRadius, sizeSpacing, bounds, 60, 1)
      ejectFromFixed(built, collidePadding, entityRadius, sizeSpacing, 4)

      const settled = new Map<string, {x: number; y: number}>()
      const savedFx = new Map<string, {fx: number | null; fy: number | null}>()
      for (const n of built) {
        settled.set(n.name, {x: n.x, y: n.y})
        savedFx.set(n.name, {fx: n.fx ?? null, fy: n.fy ?? null})
      }

      // Reset to each planet's resolved center (with mild noise) for the tween start.
      for (const n of built) {
        const center = centerByName.get(n.name) ?? {x: n.targetX, y: n.targetY}
        n.x = center.x + (Math.random() - 0.5) * 80
        n.y = center.y + (Math.random() - 0.5) * 80
        n.vx = 0
        n.vy = 0
        n.fx = null
        n.fy = null
      }

      const startPos = new Map<string, {x: number; y: number}>()
      for (const n of built) startPos.set(n.name, {x: n.x, y: n.y})

      const TWEEN_MS = 800
      const t0 = performance.now()

      const tweenTick = (now: number) => {
        const t = Math.min(1, (now - t0) / TWEEN_MS)
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

    // Edit mode: keep a live damped sim so neighbors adjust around drags/pins.
    if (isEditMode) {
      // First build in edit mode: synchronous pre-warm so planets are settled
      // when the editor first appears. We do this WITHOUT the tick callback
      // attached so the prewarm ticks don't fire setNodes 400 times.
      const firstBuild = !hasFirstAnimRef.current
      if (firstBuild) {
        hasFirstAnimRef.current = true
        const prewarm = forceSimulation<PlanetNode>(built)
          .force("x", forceX<PlanetNode>((d) => d.targetX).strength(sectorPull))
          .force("y", forceY<PlanetNode>((d) => d.targetY).strength(sectorPull))
          .force("collide", liveCollide(collidePadding, 0.9, 2, entityRadius, sizeSpacing))
          .force("charge", forceManyBody<PlanetNode>().strength(-repulsion))
          .force("link", connectionForce(linkPairs, connectionStrength))
          .force("bounds", boundsForce(bounds))
          .alpha(0.9)
          .alphaDecay(0.022)
          .velocityDecay(0.72)
          .stop()
        prewarm.tick(400)
        separateOverlaps(built, collidePadding, entityRadius, sizeSpacing, bounds, 8, 1)
      }

      const sim = forceSimulation<PlanetNode>(built)
        .force("x", forceX<PlanetNode>((d) => d.targetX).strength(sectorPull))
        .force("y", forceY<PlanetNode>((d) => d.targetY).strength(sectorPull))
        .force("collide", liveCollide(collidePadding, 0.9, 2, entityRadius, sizeSpacing))
        .force("charge", forceManyBody<PlanetNode>().strength(-repulsion))
        .force("link", connectionForce(linkPairs, connectionStrength))
        .force("bounds", boundsForce(bounds))
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
    {
      const prewarm = forceSimulation<PlanetNode>(built)
        .force("x", forceX<PlanetNode>((d) => d.targetX).strength(sectorPull))
        .force("y", forceY<PlanetNode>((d) => d.targetY).strength(sectorPull))
        .force("collide", liveCollide(collidePadding, 0.9, 2, entityRadius, sizeSpacing))
        .force("charge", forceManyBody<PlanetNode>().strength(-repulsion))
        .force("link", connectionForce(linkPairs, connectionStrength))
        .force("bounds", boundsForce(bounds))
        .alpha(0.4)
        .alphaDecay(0.05)
        .velocityDecay(0.72)
        .stop()
      // Mostly separation (keeps a settled layout in place) with light attraction
      // bursts so a dead-stacked cluster from an interrupted intro still spreads
      // toward its sector rather than blowing outward.
      for (let round = 0; round < 10; round++) {
        separateOverlaps(built, collidePadding, entityRadius, sizeSpacing, bounds, 12, 1)
        prewarm.tick(5)
      }
      separateOverlaps(built, collidePadding, entityRadius, sizeSpacing, bounds, 20, 1)
      ejectFromFixed(built, collidePadding, entityRadius, sizeSpacing, 4)
    }

    const sim = forceSimulation<PlanetNode>(built)
      .force("x", forceX<PlanetNode>((d) => d.targetX).strength(sectorPull))
      .force("y", forceY<PlanetNode>((d) => d.targetY).strength(sectorPull))
      .force("collide", liveCollide(collidePadding, 0.9, 2, entityRadius, sizeSpacing))
      .force("charge", forceManyBody<PlanetNode>().strength(-repulsion))
      .force("link", connectionForce(linkPairs, connectionStrength))
      .force("bounds", boundsForce(bounds))
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
    simRef.current = sim
    setNodes(built.slice())
    return () => {
      sim.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputsKey, viewMode, positionsKey, anchorDiam, collidePadding, entityRadius, sizeSpacing, sectorPull, repulsion, labelRadiiKey, connectionsKey, connectionStrength, boundsKey, restartToken])

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
