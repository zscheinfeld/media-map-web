import {useEffect, useLayoutEffect, useMemo, useRef, useState} from "react"
import type {Simulation} from "d3-force"
import type {Bounds, IntroOptions, LayoutInput, PlanetNode, PlanetPosition, ViewMode} from "./types.js"
import {INTRO_DEFAULTS} from "./types.js"
import {ANCHOR_DIAM_FALLBACK, diameterFor} from "./sizing.js"
import {
  CONNECTION_PULL,
  buildLayoutSim,
  ejectFromFixed,
  seededJitter,
  separateOverlaps,
  settleLayout,
  type SettleParams,
} from "./solveLayout.js"

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
  /**
   * A layout already solved elsewhere for EXACTLY the current options (the Time
   * Machine solves every year in a worker). Asked for only when a year switch
   * would otherwise have to solve on the spot; return null when there is none —
   * the caller is responsible for it matching these options.
   */
  presolved?: () => ReadonlyArray<{name: string; x: number; y: number}> | null
  /**
   * Land a year switch at once instead of tweening to it — for when the map
   * isn't on screen (under the Time Machine), so there is nothing to animate.
   */
  instant?: boolean
  /** The first-load intro's timing (see IntroOptions); read when an intro
   *  starts, so changing it doesn't rebuild the layout. */
  intro?: IntroOptions
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
    presolved,
    instant = false,
    intro,
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
  const introOptsRef = useRef<IntroOptions | undefined>(intro)
  useLayoutEffect(() => {
    introOptsRef.current = intro
  })
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
    const jit = (name: string, axis: string) => seededJitter(pure ? seed : null, name, axis)

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
    const settleParams: SettleParams = {
      bounds, collidePadding, entityRadius, sizeSpacing, sectorPull, repulsion, connectionStrength, centerPull, gapFill, gapMin,
    }
    const buildSim = () => buildLayoutSim(built, linkPairs, settleParams)

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

      // The from-scratch settle (shared with `solveLayout`, and kept in step with
      // the A/B tween's miss-settle below so a year cached here is as resolved as
      // one cached by a pill toggle).
      settleLayout(built, linkPairs, settleParams)
      // Not ticked again — kept only so the cleanup below has a sim to stop.
      const sim = buildSim().stop()

      const settled = new Map<string, {x: number; y: number}>()
      const savedFx = new Map<string, {fx: number | null; fy: number | null}>()
      for (const n of built) {
        settled.set(n.name, {x: n.x, y: n.y})
        savedFx.set(n.name, {fx: n.fx ?? null, fy: n.fy ?? null})
      }
      cacheLayout() // built is at the resolved layout here — snapshot it for A/B tweens.

      // The intro's timing: each planet leaves its sector well after a delay set
      // by its sector's place in the order and its size rank within the sector.
      const io = {...INTRO_DEFAULTS, ...(introOptsRef.current ?? {})}
      const sectorRank = new Map<string, number>()
      for (const sName of io.sectorOrder ?? []) sectorRank.set(sName, sectorRank.size)
      for (const n of built) if (!sectorRank.has(n.sector)) sectorRank.set(n.sector, sectorRank.size)
      const bySector = new Map<string, PlanetNode[]>()
      for (const n of built) (bySector.get(n.sector) ?? bySector.set(n.sector, []).get(n.sector)!).push(n)
      const delay = new Map<string, number>()
      for (const [sName, list] of bySector) {
        list.sort((a, b) => b.targetR - a.targetR)
        list.forEach((n, i) => delay.set(n.name, io.startDelayMs + sectorRank.get(sName)! * io.sectorOffsetMs + i * io.planetOffsetMs))
      }
      const ease = (t: number): number => {
        switch (io.easing) {
          case "outQuint": return 1 - Math.pow(1 - t, 5)
          case "outExpo": return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)
          case "outBack": { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2) }
          case "inOutCubic": return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
          default: return 1 - Math.pow(1 - t, 3)
        }
      }

      // Reset to each planet's resolved center (with noise) for the tween start.
      const startR = new Map<string, number>()
      for (const n of built) {
        const center = centerByName.get(n.name) ?? {x: n.targetX, y: n.targetY}
        n.x = center.x + jit(n.name, "ix") * io.spread
        n.y = center.y + jit(n.name, "iy") * io.spread
        n.vx = 0
        n.vy = 0
        n.fx = null
        n.fy = null
        startR.set(n.name, n.targetR * Math.max(0, Math.min(1, io.startScale)))
        n.r = startR.get(n.name)!
        n.entering = (delay.get(n.name) ?? 0) > 0
      }

      const startPos = new Map<string, {x: number; y: number}>()
      for (const n of built) startPos.set(n.name, {x: n.x, y: n.y})

      const TWEEN_MS = Math.max(...[...delay.values()], 0) + io.durationMs
      const t0 = performance.now()
      introRef.current = {t0, ms: TWEEN_MS, settled}

      const tweenTick = (now: number) => {
        const elapsed = Math.max(0, now - t0) // rAF time can predate t0 after a long solve
        const t = Math.min(1, elapsed / TWEEN_MS)
        for (const n of built) {
          const d = delay.get(n.name) ?? 0
          const tn = Math.max(0, Math.min(1, (elapsed - d) / io.durationMs))
          const k = ease(tn)
          const s = startPos.get(n.name)!
          const e = settled.get(n.name)!
          n.x = s.x + (e.x - s.x) * k
          n.y = s.y + (e.y - s.y) * k
          const r0 = startR.get(n.name)!
          n.r = tn >= 1 ? n.targetR : r0 + (n.targetR - r0) * Math.max(0, Math.min(1, k))
          n.entering = elapsed < d
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
        // Already solved elsewhere for these exact options? Then there is nothing
        // to compute (a from-scratch settle blocks the page for most of a second).
        const ready = presolved?.()
        if (ready && ready.length === built.length) {
          const pos = new Map(ready.map((q) => [q.name, {x: q.x, y: q.y}]))
          if (built.every((n) => pos.has(n.name))) {
            target = pos
            if (layoutKey) layoutCacheRef.current.set(layoutKey, {sig: layoutSig, pos})
          }
        }
      }
      if (target && instant) {
        // Off screen: no morph — put every planet straight at its place and size.
        for (const n of built) {
          const b = target.get(n.name)
          if (b) {
            n.x = b.x
            n.y = b.y
          }
          n.r = n.targetR
          n.vx = 0
          n.vy = 0
        }
        simRef.current = null
        setNodes(built.slice())
        return
      }
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
        // Fully converge, so the cached layout has NO residual overlap.
        settleLayout(built, linkPairs, settleParams)
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
