import { useEffect, useMemo, useRef, useState } from "react";
import { forceSimulation, forceX, forceY, type Simulation } from "d3-force";
import type { SheetCompany } from "./loadCompanies";
import { hueForSector, isKnownSector, planetStyleFor, sectorCenterFor, type PlanetStyle } from "./sectors";
import type { PlanetPosition } from "./layout";
import type { Connection } from "./connections";

export type PlanetNode = {
  name: string;
  sector: string;
  valuation_b: number;
  r: number;       // currently-displayed radius (tweens toward targetR)
  targetR: number; // size implied by the current month's valuation
  hue: number;
  style: PlanetStyle | null;
  // d3 mutates these in place
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  // d3-force fixed-position fields. When set, the simulation pins the node
  // here and ignores forceX/Y for it. Other planets still collide against it.
  fx?: number | null;
  fy?: number | null;
  // Attractor coordinates the planet drifts toward. Sector center by default;
  // overridden when a soft-position entry exists in COMPANY_POSITIONS.
  targetX: number;
  targetY: number;
  // True when this planet is pinned via COMPANY_POSITIONS (or the editor).
  // The renderer can use this to visually distinguish pinned vs free planets
  // in design mode.
  pinned: boolean;
  // Half-extent of the rendered label box, in slide units. Used by liveCollide
  // and the linear-mode layout to keep labels from overlapping when the text
  // is wider than the planet circle. Zero (or undefined) ⇒ ignore label.
  labelRadius?: number;
};

// Apple is the size anchor.
//
//   ANCHOR_VAL       — Apple's reference valuation (billions USD). Update this
//                      when Apple's market cap shifts and you want planets
//                      re-scaled relative to the new value.
//   anchorDiam (arg) — Apple's diameter in slide-coord units (what the SVG
//                      renderer draws). Now passed in dynamically so callers
//                      can scale it to the viewport.
//   SHEET_SIZE_ANCHOR — Apple's "planet size" value in the source spreadsheet's
//                      own unit system. Used only by the planet detail panel
//                      to display the calculation in the same units as the
//                      sheet, so the math can be cross-checked by hand.
export const ANCHOR_VAL = 2900;
export const SHEET_SIZE_ANCHOR = 9.77;
// Fallback used before the container is measured. The MediaMap component
// computes the real value from container dimensions and passes it in.
export const ANCHOR_DIAM_FALLBACK = 800;

// Per-tick attraction strength between connected planets. Well above the sector
// pull (forceX/Y ≈ 0.035–0.04) so connected planets are drawn firmly toward
// each other (clamped for stability inside connectionForce).
const CONNECTION_PULL = 0.55;

function diameterFor(valuation_b: number, anchorDiam: number): number {
  return anchorDiam * Math.sqrt(Math.max(valuation_b, 0) / ANCHOR_VAL);
}

/**
 * The sheet-units "planet size" for a given valuation. This is the same
 * computation the original Excel formula uses (`sqrt(val/2900) * 9.77`) and
 * is displayed in the planet detail panel so the math can be verified.
 */
export function sheetPlanetSize(valuation_b: number): number {
  return Math.sqrt(Math.max(valuation_b, 0) / ANCHOR_VAL) * SHEET_SIZE_ANCHOR;
}

/**
 * Custom collide force that reads each node's `r` live every iteration —
 * d3's `forceCollide` caches radii at init time, so when we tween `r` after
 * switching the active view the cached radii go stale and overlaps appear.
 */
function liveCollide(padding: number, strength: number, iterations: number) {
  let nodes: PlanetNode[] = [];
  const resolveOnce = () => {
    const n = nodes.length;
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      // Effective radius = whichever is larger, the planet circle or the
      // half-extent of its label box. Small planets with long names need the
      // extra spacing so their labels don't run into neighbors.
      const aEff = Math.max(a.r, a.labelRadius ?? 0);
      const ri = aEff + padding;
      const xi = a.x + (a.vx ?? 0);
      const yi = a.y + (a.vy ?? 0);
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        const bEff = Math.max(b.r, b.labelRadius ?? 0);
        const rj = bEff + padding;
        const xj = b.x + (b.vx ?? 0);
        const yj = b.y + (b.vy ?? 0);
        const dx = xj - xi;
        const dy = yj - yi;
        const r = ri + rj;
        let l2 = dx * dx + dy * dy;
        if (l2 < r * r && l2 > 0.0001) {
          const l = Math.sqrt(l2);
          const correction = ((r - l) / l) * strength;
          // Split the push between a and b inversely-by-mass (mass ∝ r²) —
          // using the planet's *physical* radius for mass so a small planet
          // with a long label doesn't push big planets around just because
          // its effective collision radius grew.
          const fr = (b.r * b.r) / (a.r * a.r + b.r * b.r);
          const ux = dx * correction;
          const uy = dy * correction;
          a.vx = (a.vx ?? 0) - ux * fr;
          a.vy = (a.vy ?? 0) - uy * fr;
          b.vx = (b.vx ?? 0) + ux * (1 - fr);
          b.vy = (b.vy ?? 0) + uy * (1 - fr);
        }
      }
    }
  };
  const force = () => {
    for (let k = 0; k < iterations; k++) resolveOnce();
  };
  force.initialize = (n: PlanetNode[]) => { nodes = n; };
  return force;
}

/**
 * Gentle attraction between connected planets (a spring with rest length 0 —
 * the pull grows with separation; `liveCollide` keeps them from overlapping, so
 * in practice connected planets settle next to each other). Only the non-pinned
 * end of each link moves: a planet with `fx/fy` set (pinned) is treated as a
 * fixed anchor, and a free planet connected to it is drawn toward it. When both
 * ends are free the pull is split between them; when both are pinned it's a
 * no-op.
 */
function connectionForce(links: [PlanetNode, PlanetNode][], strength: number) {
  const force = (alpha: number) => {
    for (const [a, b] of links) {
      const aFree = a.fx == null && a.fy == null;
      const bFree = b.fx == null && b.fy == null;
      if (!aFree && !bFree) continue;
      const dx = (b.x + (b.vx ?? 0)) - (a.x + (a.vx ?? 0));
      const dy = (b.y + (b.vy ?? 0)) - (a.y + (a.vy ?? 0));
      // This is a velocity lerp toward the partner: a factor of 1 would move a
      // node the entire remaining gap in one tick. Clamp at 0.9 so high slider
      // values pull hard and converge fast WITHOUT overshooting into the
      // oscillation/explosion you'd get once strength·alpha exceeds 1.
      const k = Math.min(strength * alpha, 0.9);
      const ux = dx * k;
      const uy = dy * k;
      if (aFree && bFree) {
        a.vx = (a.vx ?? 0) + ux * 0.5;
        a.vy = (a.vy ?? 0) + uy * 0.5;
        b.vx = (b.vx ?? 0) - ux * 0.5;
        b.vy = (b.vy ?? 0) - uy * 0.5;
      } else if (aFree) {
        a.vx = (a.vx ?? 0) + ux;
        a.vy = (a.vy ?? 0) + uy;
      } else {
        b.vx = (b.vx ?? 0) - ux;
        b.vy = (b.vy ?? 0) - uy;
      }
    }
  };
  force.initialize = () => {};
  return force;
}

export type Bounds = { x0: number; y0: number; x1: number; y1: number };

/**
 * Custom d3-force that clamps node positions inside [x0,x1] × [y0,y1] each tick,
 * accounting for each node's radius. Combined with `forceCollide`, this packs
 * the planets within the visible canvas.
 */
function boundsForce(b: Bounds) {
  let nodes: PlanetNode[] = [];
  // Soft damping when a node touches the wall: zero out the inward component
  // and absorb most of the residual tangential velocity, so wall contacts
  // don't keep ringing the simulation.
  const force = () => {
    for (const n of nodes) {
      const r = n.r;
      let hit = false;
      if (n.x - r < b.x0) { n.x = b.x0 + r; if ((n.vx ?? 0) < 0) n.vx = 0; hit = true; }
      if (n.x + r > b.x1) { n.x = b.x1 - r; if ((n.vx ?? 0) > 0) n.vx = 0; hit = true; }
      if (n.y - r < b.y0) { n.y = b.y0 + r; if ((n.vy ?? 0) < 0) n.vy = 0; hit = true; }
      if (n.y + r > b.y1) { n.y = b.y1 - r; if ((n.vy ?? 0) > 0) n.vy = 0; hit = true; }
      if (hit) {
        if (n.vx) n.vx *= 0.5;
        if (n.vy) n.vy *= 0.5;
      }
    }
  };
  force.initialize = (n: PlanetNode[]) => { nodes = n; };
  return force;
}

// "list" reuses the map-mode physics branch (nodes stay laid out so returning
// to map is instant); the renderer just shows a table instead of the SVG.
export type ViewMode = "map" | "linear" | "list";

export function usePhysicsLayout(
  companies: SheetCompany[],
  enabledSectors: Set<string>,
  bounds: Bounds,
  viewMode: ViewMode = "map",
  isMobile: boolean = false,
  positions: Record<string, PlanetPosition> = {},
  isEditMode: boolean = false,
  anchorDiam: number = ANCHOR_DIAM_FALLBACK,
  collidePadding: number = 80,
  sectorOverrides: Record<string, { x: number; y: number }> = {},
  // Per-company label half-extent in slide units (max of half-width and
  // half-height of the rendered label box). Drives collision spacing for
  // planets whose labels overflow the planet circle.
  labelRadii: Record<string, number> = {},
  // Connections (from/to company names). Connected planets get a gentle
  // attraction toward each other in the layout sim; only the non-pinned end(s)
  // actually move (pinned planets stay put and act as anchors).
  connections: Connection[] = [],
  // Per-tick attraction strength for the connection force (live-tunable from
  // the edit toolbar). Defaults to the module constant.
  connectionStrength: number = CONNECTION_PULL,
) {
  const [nodes, setNodes] = useState<PlanetNode[]>([]);
  const simRef = useRef<Simulation<PlanetNode, undefined> | null>(null);
  const nodeMapRef = useRef<Map<string, PlanetNode>>(new Map());
  // Snapshot of map-mode positions, taken whenever we leave map mode.
  // Restored when returning so the layout doesn't have to re-converge from
  // the wide linear strip.
  const savedMapPositionsRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  // The hook only ever receives a *layout* mode (map | linear). "list" is an
  // overlay handled in the renderer, so it never reaches here — the layout
  // underneath stays frozen at whatever it was.
  const prevViewModeRef = useRef<ViewMode>(viewMode);
  // True after the first-load entry animation has played. Subsequent runs
  // (filter toggles, drag commits, month switches) skip the tween and use the
  // live sim directly so user actions feel responsive.
  const hasFirstAnimRef = useRef(false);
  // Handle for the rAF tween loop so cleanup can cancel it if deps change
  // mid-animation.
  const tweenRafRef = useRef<number | null>(null);
  // Lightweight rAF loop that only animates `r` toward `targetR` for month
  // switches. No position changes — physics is off after the load animation.
  const sizeTweenRafRef = useRef<number | null>(null);

  // Re-derive list of active companies whenever inputs change.
  const filterKey = useMemo(
    () => [...enabledSectors].sort().join("|"),
    [enabledSectors],
  );
  // Stable key for the positions map so the sim only restarts when contents
  // change, not on every parent re-render that produces a new object reference.
  const positionsKey = useMemo(
    () =>
      Object.entries(positions)
        .map(([name, p]) => `${name}:${p.x},${p.y},${p.pin ? "1" : "0"}`)
        .sort()
        .join("|"),
    [positions],
  );
  // Stable key for label radii so the sim restarts only when the actual
  // label-collision footprint changes — not on every re-render that creates
  // a fresh object reference. Rounded to two decimals so trivial
  // re-measurements don't churn the sim.
  const labelRadiiKey = useMemo(
    () =>
      Object.entries(labelRadii)
        .map(([name, v]) => `${name}:${v.toFixed(2)}`)
        .sort()
        .join("|"),
    [labelRadii],
  );
  const sectorOverridesKey = useMemo(
    () =>
      Object.entries(sectorOverrides)
        .map(([name, p]) => `${name}:${p.x},${p.y}`)
        .sort()
        .join("|"),
    [sectorOverrides],
  );
  // Only the endpoints matter for the attraction force, so the sim restarts on
  // add/remove/re-point — not when a connection's style or description changes.
  const connectionsKey = useMemo(
    () => connections.map(c => `${c.from}>${c.to}`).sort().join("|"),
    [connections],
  );

  useEffect(() => {
    if (companies.length === 0) return;

    const allSectors = Array.from(new Set(companies.map(c => c.sector))).sort();
    const unknownSectors = allSectors.filter(s => !isKnownSector(s));

    const active = companies.filter(c => enabledSectors.has(c.sector));

    // Reuse existing node objects where possible so physics state survives
    // filter toggles.
    const map = nodeMapRef.current;
    const built: PlanetNode[] = active.map(c => {
      const unknownIdx = unknownSectors.indexOf(c.sector);
      const center =
        sectorOverrides[c.sector]
        ?? sectorCenterFor(c.sector, unknownIdx, unknownSectors.length, isMobile);
      const r = diameterFor(c.valuation_b, anchorDiam) / 2;
      // Per-company override: soft target replaces sector center; hard pin
      // additionally fixes the planet's coordinates via fx/fy.
      const pos = positions[c.name];
      const targetX = pos ? pos.x : center.x;
      const targetY = pos ? pos.y : center.y;
      const pinned = !!pos?.pin;
      const labelR = labelRadii[c.name] ?? 0;
      const existing = map.get(c.name);
      if (existing) {
        const prevTargetX = existing.targetX;
        const prevTargetY = existing.targetY;
        existing.sector = c.sector;
        existing.valuation_b = c.valuation_b;
        // Tween the displayed `r` toward the new target — don't snap.
        existing.targetR = r;
        existing.hue = hueForSector(c.sector);
        existing.style = planetStyleFor(c.name, c.sector);
        existing.targetX = targetX;
        existing.targetY = targetY;
        existing.pinned = pinned;
        existing.labelRadius = labelR;
        if (pinned && pos) {
          existing.fx = pos.x;
          existing.fy = pos.y;
        } else {
          existing.fx = null;
          existing.fy = null;
        }
        // Snap x/y to the new target when the position override changed.
        // Physics is off after the load animation, so a drag commit or a
        // cleared override won't otherwise move the planet on screen.
        //
        // Skip this snap when returning from linear: linear mode set every
        // node's targetX/Y to its strip slot, so the targets always "differ"
        // here — snapping would teleport planets (especially pinned ones, whose
        // map target equals their pin) to their final spot and rob the
        // linear→map fly-back tween of anything to animate. Leaving x/y at the
        // strip position lets that tween animate every planet, pinned included.
        const comingFromLinear = prevViewModeRef.current === "linear";
        if (!comingFromLinear && (prevTargetX !== targetX || prevTargetY !== targetY)) {
          existing.x = targetX;
          existing.y = targetY;
          existing.vx = 0;
          existing.vy = 0;
        }
        return existing;
      }
      const node: PlanetNode = {
        name: c.name,
        sector: c.sector,
        valuation_b: c.valuation_b,
        r,
        targetR: r,
        hue: hueForSector(c.sector),
        style: planetStyleFor(c.name, c.sector),
        x: targetX + (Math.random() - 0.5) * 120,
        y: targetY + (Math.random() - 0.5) * 120,
        targetX,
        targetY,
        pinned,
        fx: pinned && pos ? pos.x : null,
        fy: pinned && pos ? pos.y : null,
        labelRadius: labelR,
      };
      map.set(c.name, node);
      return node;
    });

    // Drop stale entries from the persistent map.
    const activeNames = new Set(built.map(n => n.name));
    for (const key of map.keys()) {
      if (!activeNames.has(key)) map.delete(key);
    }

    // Resolve connections to node pairs for the attraction force. Skip links
    // whose endpoints aren't both currently present (e.g. a filtered-out sector
    // or a typo'd name).
    const builtByName = new Map(built.map(n => [n.name, n] as const));
    const linkPairs: [PlanetNode, PlanetNode][] = [];
    for (const c of connections) {
      const a = builtByName.get(c.from);
      const b = builtByName.get(c.to);
      if (a && b && a !== b) linkPairs.push([a, b]);
    }

    simRef.current?.stop();

    const prevMode = prevViewModeRef.current;
    prevViewModeRef.current = viewMode;

    // === LINEAR MODE ===
    // Vertically-centered strip, sorted left-to-right by size (largest first).
    // We run a manual rAF easing loop instead of d3-force so the layout is
    // deterministic and doesn't fight collision/attraction forces.
    if (viewMode === "linear") {
      // Save the current map-mode positions on the way in so they can be
      // restored when toggling back. Only snapshot when transitioning INTO
      // linear from map (not on re-runs while already in linear).
      if (prevMode === "map") {
        const snap = new Map<string, { x: number; y: number }>();
        for (const n of built) snap.set(n.name, { x: n.x, y: n.y });
        savedMapPositionsRef.current = snap;
      }
      const LEFT_PAD = 80;
      const GAP = 30;
      const centerY = (bounds.y0 + bounds.y1) / 2;
      let rafId: number | null = null;

      const computeTargets = () => {
        const sorted = [...built].sort((a, b) => b.targetR - a.targetR);
        let cursor = bounds.x0 + LEFT_PAD;
        for (const n of sorted) {
          // Spacing uses the larger of the planet radius or label half-extent,
          // so small planets with long names get the room they need without
          // letting their labels collide with neighbors.
          const effR = Math.max(n.targetR, n.labelRadius ?? 0);
          const cx = cursor + effR;
          n.targetX = cx;
          n.targetY = centerY;
          cursor = cx + effR + GAP;
        }
      };

      const tick = () => {
        computeTargets();
        for (const n of built) {
          // Position easing toward target
          n.x += (n.targetX - n.x) * 0.10;
          n.y += (n.targetY - n.y) * 0.10;
          // Radius tween (same rate as map mode)
          if (Math.abs(n.r - n.targetR) > 0.05) {
            n.r += (n.targetR - n.r) * 0.08;
          } else {
            n.r = n.targetR;
          }
          // No simulation velocity in linear mode
          n.vx = 0;
          n.vy = 0;
        }
        setNodes(built.slice());
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      setNodes(built.slice());

      return () => {
        if (rafId !== null) cancelAnimationFrame(rafId);
      };
    }

    // === MAP MODE === (default — d3-force physics layout)
    // Coming back from linear: ease each planet from its current strip position
    // back to the map position we snapshotted on the way out — a smooth fly-back
    // mirroring the map→linear ease. Pinned planets animate too: the build step
    // above skips its usual snap-to-target when prevMode is "linear" (so the
    // strip start position survives), and we clear/restore fx/fy across the tween.
    if (prevMode === "linear" && savedMapPositionsRef.current) {
      const saved = savedMapPositionsRef.current;
      savedMapPositionsRef.current = null;

      // Capture start (strip) positions; clear fx/fy so pinned planets animate
      // in rather than snapping, and restore those pins when the tween lands.
      const startPos = new Map<string, { x: number; y: number }>();
      const savedFx = new Map<string, { fx: number | null; fy: number | null }>();
      for (const n of built) {
        startPos.set(n.name, { x: n.x, y: n.y });
        savedFx.set(n.name, { fx: n.fx ?? null, fy: n.fy ?? null });
        n.fx = null;
        n.fy = null;
        n.vx = 0;
        n.vy = 0;
      }

      const TWEEN_MS = 800;
      const t0 = performance.now();
      let rafId: number | null = null;
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / TWEEN_MS);
        const k = 1 - Math.pow(1 - t, 3); // easeOutCubic
        for (const n of built) {
          const s = startPos.get(n.name)!;
          // New planets with no snapshot just stay where they are.
          const e = saved.get(n.name) ?? s;
          n.x = s.x + (e.x - s.x) * k;
          n.y = s.y + (e.y - s.y) * k;
          if (Math.abs(n.r - n.targetR) > 0.05) n.r += (n.targetR - n.r) * 0.08;
          else n.r = n.targetR;
        }
        setNodes(built.slice());
        if (t < 1) {
          rafId = requestAnimationFrame(tick);
        } else {
          rafId = null;
          for (const n of built) {
            const f = savedFx.get(n.name);
            if (f && f.fx !== null && f.fy !== null) { n.fx = f.fx; n.fy = f.fy; }
          }
        }
      };
      rafId = requestAnimationFrame(tick);
      setNodes(built.slice());
      return () => {
        if (rafId !== null) cancelAnimationFrame(rafId);
      };
    }

    // First-load animation: silently pre-warm the sim to find converged
    // positions, then ease every planet from its sector center to that
    // converged position. Solves two problems at once — the initial jitter is
    // invisible (it happens before any frame is rendered), and pinned planets
    // animate in via easing rather than snapping to their fx/fy.
    const isFirstAnim =
      !hasFirstAnimRef.current && prevMode !== "linear" && built.length > 0;

    if (isFirstAnim) {
      hasFirstAnimRef.current = true;

      // 1. Build sim WITH fx/fy in place so pinned planets stay pinned during
      //    the silent pre-warm and unpinned ones settle around them.
      const sim = forceSimulation<PlanetNode>(built)
        .force("x", forceX<PlanetNode>(d => d.targetX).strength(0.035))
        .force("y", forceY<PlanetNode>(d => d.targetY).strength(0.035))
        .force("collide", liveCollide(collidePadding, 0.9, 2))
        .force("link", connectionForce(linkPairs, connectionStrength))
        .force("bounds", boundsForce(bounds))
        .alpha(0.9)
        .alphaDecay(0.022)
        .velocityDecay(0.72)
        .stop();

      // 2. Pre-warm silently — no setNodes during this phase.
      const PREWARM_TICKS = 400;
      sim.tick(PREWARM_TICKS);

      // 3. Snapshot the converged positions and capture each node's intended
      //    fx/fy so we can restore them after the tween.
      const settled = new Map<string, { x: number; y: number }>();
      const savedFx = new Map<string, { fx: number | null; fy: number | null }>();
      for (const n of built) {
        settled.set(n.name, { x: n.x, y: n.y });
        savedFx.set(n.name, { fx: n.fx ?? null, fy: n.fy ?? null });
      }

      // 4. Reset every planet to its sector center (with mild noise) and clear
      //    fx/fy/velocity so the tween starts from a clean state.
      for (const n of built) {
        const unknownIdx = unknownSectors.indexOf(n.sector);
        const center = sectorCenterFor(n.sector, unknownIdx, unknownSectors.length, isMobile);
        n.x = center.x + (Math.random() - 0.5) * 80;
        n.y = center.y + (Math.random() - 0.5) * 80;
        n.vx = 0;
        n.vy = 0;
        n.fx = null;
        n.fy = null;
      }

      const startPos = new Map<string, { x: number; y: number }>();
      for (const n of built) startPos.set(n.name, { x: n.x, y: n.y });

      // 5. rAF-tween from start → settled over TWEEN_MS with easeOutCubic.
      const TWEEN_MS = 800;
      const t0 = performance.now();

      const tweenTick = (now: number) => {
        const t = Math.min(1, (now - t0) / TWEEN_MS);
        const k = 1 - Math.pow(1 - t, 3); // easeOutCubic
        for (const n of built) {
          const s = startPos.get(n.name)!;
          const e = settled.get(n.name)!;
          n.x = s.x + (e.x - s.x) * k;
          n.y = s.y + (e.y - s.y) * k;
          // Tween r toward targetR so newly-added planets ease to their size
          // alongside the position tween.
          if (Math.abs(n.r - n.targetR) > 0.05) {
            n.r += (n.targetR - n.r) * 0.08;
          } else {
            n.r = n.targetR;
          }
        }
        setNodes(built.slice());

        if (t < 1) {
          tweenRafRef.current = requestAnimationFrame(tweenTick);
        } else {
          tweenRafRef.current = null;
          // 6. Tween complete — restore fx/fy on pinned planets and leave
          //    the sim stopped. No live physics from this point on; planets
          //    are static. Size animations (month switches) are handled by
          //    a separate rAF loop that only touches `r`, not positions.
          for (const n of built) {
            const saved = savedFx.get(n.name);
            if (saved && saved.fx !== null && saved.fy !== null) {
              n.fx = saved.fx;
              n.fy = saved.fy;
            }
          }
        }
      };
      tweenRafRef.current = requestAnimationFrame(tweenTick);

      simRef.current = sim;
      setNodes(built.slice());

      return () => {
        if (tweenRafRef.current !== null) {
          cancelAnimationFrame(tweenRafRef.current);
          tweenRafRef.current = null;
        }
        sim.stop();
      };
    }

    // Subsequent runs (filter toggle, drag commit, month switch, mobile flip).
    if (isEditMode) {
      // Edit mode: keep a live sim ticking with damped settings so unpinned
      // neighbors visibly adjust around the user's drags/pins. The dragged
      // planet itself is already snapped to its new position by the build
      // step above, and pinned planets are held via fx/fy — only soft and
      // free planets move.
      const sim = forceSimulation<PlanetNode>(built)
        .force("x", forceX<PlanetNode>(d => d.targetX).strength(0.04))
        .force("y", forceY<PlanetNode>(d => d.targetY).strength(0.04))
        .force("collide", liveCollide(collidePadding, 0.9, 2))
        .force("link", connectionForce(linkPairs, connectionStrength))
        .force("bounds", boundsForce(bounds))
        // Lower starting alpha + faster decay + heavier damping = a quick,
        // gentle settle around the user's change instead of the long bouncy
        // convergence of the load-time sim.
        .alpha(0.4)
        .alphaDecay(0.05)
        .velocityDecay(0.85)
        .on("tick", () => {
          let anyTweening = false;
          for (const n of built) {
            if (Math.abs(n.r - n.targetR) > 0.05) {
              n.r += (n.targetR - n.r) * 0.08;
              anyTweening = true;
            } else {
              n.r = n.targetR;
            }
          }
          if (anyTweening) sim.alphaTarget(0.1);
          else if (sim.alphaTarget() > 0) sim.alphaTarget(0);
          setNodes(built.slice());
        });
      simRef.current = sim;
      setNodes(built.slice());
      return () => {
        sim.stop();
      };
    }

    // Outside edit mode: no physics. Existing planets keep their x/y from the
    // previous run; any position-override changes are snapped in the build
    // step above. We just animate `r` toward `targetR` so month-driven size
    // changes ease smoothly, and let positions stay exactly where they are.
    setNodes(built.slice());

    const sizeTick = () => {
      let anyTweening = false;
      for (const n of built) {
        if (Math.abs(n.r - n.targetR) > 0.05) {
          n.r += (n.targetR - n.r) * 0.08;
          anyTweening = true;
        } else {
          n.r = n.targetR;
        }
      }
      if (anyTweening) {
        setNodes(built.slice());
        sizeTweenRafRef.current = requestAnimationFrame(sizeTick);
      } else {
        sizeTweenRafRef.current = null;
      }
    };
    if (sizeTweenRafRef.current !== null) cancelAnimationFrame(sizeTweenRafRef.current);
    sizeTweenRafRef.current = requestAnimationFrame(sizeTick);

    return () => {
      if (sizeTweenRafRef.current !== null) {
        cancelAnimationFrame(sizeTweenRafRef.current);
        sizeTweenRafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, filterKey, viewMode, isMobile, positionsKey, anchorDiam, collidePadding, sectorOverridesKey, labelRadiiKey, connectionsKey, connectionStrength]);

  return nodes;
}
