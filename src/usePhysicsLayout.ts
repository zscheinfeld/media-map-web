import { useEffect, useMemo, useRef, useState } from "react";
import { forceSimulation, forceX, forceY, type Simulation } from "d3-force";
import type { SheetCompany } from "./loadCompanies";
import { hueForSector, isKnownSector, sectorCenterFor } from "./sectors";

export type PlanetNode = {
  name: string;
  sector: string;
  valuation_b: number;
  r: number;       // currently-displayed radius (tweens toward targetR)
  targetR: number; // size implied by the current month's valuation
  hue: number;
  // d3 mutates these in place
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  // attractor coordinates for the sector center
  targetX: number;
  targetY: number;
};

// Apple is the size anchor. Diameter = ANCHOR_DIAM * sqrt(val / ANCHOR_VAL),
// so AREA is exactly proportional to valuation (bubble-chart convention,
// matches the sheet's PLANET SIZE column).
const ANCHOR_VAL = 4308;
const ANCHOR_DIAM = 1143;

function diameterFor(valuation_b: number): number {
  return ANCHOR_DIAM * Math.sqrt(Math.max(valuation_b, 0) / ANCHOR_VAL);
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
      const ri = a.r + padding;
      const xi = a.x + (a.vx ?? 0);
      const yi = a.y + (a.vy ?? 0);
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        const rj = b.r + padding;
        const xj = b.x + (b.vx ?? 0);
        const yj = b.y + (b.vy ?? 0);
        const dx = xj - xi;
        const dy = yj - yi;
        const r = ri + rj;
        let l2 = dx * dx + dy * dy;
        if (l2 < r * r && l2 > 0.0001) {
          const l = Math.sqrt(l2);
          const correction = ((r - l) / l) * strength;
          // Split the push between a and b inversely-by-mass (mass ∝ r²),
          // matching d3-force-collide's behavior so big planets move less.
          const fr = (rj * rj) / (ri * ri + rj * rj);
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

export type ViewMode = "map" | "linear";

export function usePhysicsLayout(
  companies: SheetCompany[],
  enabledSectors: Set<string>,
  bounds: Bounds,
  viewMode: ViewMode = "map",
  isMobile: boolean = false,
) {
  const [nodes, setNodes] = useState<PlanetNode[]>([]);
  const simRef = useRef<Simulation<PlanetNode, undefined> | null>(null);
  const nodeMapRef = useRef<Map<string, PlanetNode>>(new Map());
  // Snapshot of map-mode positions, taken whenever we leave map mode.
  // Restored when returning so the layout doesn't have to re-converge from
  // the wide linear strip.
  const savedMapPositionsRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  const prevViewModeRef = useRef<ViewMode>(viewMode);

  // Re-derive list of active companies whenever inputs change.
  const filterKey = useMemo(
    () => [...enabledSectors].sort().join("|"),
    [enabledSectors],
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
      const center = sectorCenterFor(c.sector, unknownIdx, unknownSectors.length, isMobile);
      const r = diameterFor(c.valuation_b) / 2;
      const existing = map.get(c.name);
      if (existing) {
        existing.sector = c.sector;
        existing.valuation_b = c.valuation_b;
        // Tween the displayed `r` toward the new target — don't snap.
        existing.targetR = r;
        existing.hue = hueForSector(c.sector);
        existing.targetX = center.x;
        existing.targetY = center.y;
        return existing;
      }
      const node: PlanetNode = {
        name: c.name,
        sector: c.sector,
        valuation_b: c.valuation_b,
        r,
        targetR: r,
        hue: hueForSector(c.sector),
        x: center.x + (Math.random() - 0.5) * 120,
        y: center.y + (Math.random() - 0.5) * 120,
        targetX: center.x,
        targetY: center.y,
      };
      map.set(c.name, node);
      return node;
    });

    // Drop stale entries from the persistent map.
    const activeNames = new Set(built.map(n => n.name));
    for (const key of map.keys()) {
      if (!activeNames.has(key)) map.delete(key);
    }

    simRef.current?.stop();

    const prevMode = prevViewModeRef.current;
    prevViewModeRef.current = viewMode;

    // === LINEAR MODE ===
    // Bottom-aligned strip, sorted left-to-right by size (largest first).
    // We run a manual rAF easing loop instead of d3-force so the layout is
    // deterministic and doesn't fight collision/attraction forces.
    if (viewMode === "linear") {
      // Save the current map-mode positions on the way in so they can be
      // restored when the user toggles back. Only snapshot when transitioning
      // INTO linear from map (not on subsequent re-runs while in linear).
      if (prevMode === "map") {
        const snap = new Map<string, { x: number; y: number }>();
        for (const n of built) snap.set(n.name, { x: n.x, y: n.y });
        savedMapPositionsRef.current = snap;
      }
      const LEFT_PAD = 80;
      const BOTTOM_PAD = 80;
      const GAP = 30;
      let rafId: number | null = null;

      const computeTargets = () => {
        const sorted = [...built].sort((a, b) => b.targetR - a.targetR);
        let cursor = bounds.x0 + LEFT_PAD;
        for (const n of sorted) {
          const cx = cursor + n.targetR;
          n.targetX = cx;
          n.targetY = bounds.y1 - BOTTOM_PAD - n.targetR;
          cursor = cx + n.targetR + GAP;
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
    // If we're coming back from linear, restore the positions we snapshotted
    // on the way out so planets don't have to fly across the canvas.
    if (prevMode === "linear" && savedMapPositionsRef.current) {
      const saved = savedMapPositionsRef.current;
      for (const n of built) {
        const p = saved.get(n.name);
        if (p) { n.x = p.x; n.y = p.y; }
        n.vx = 0;
        n.vy = 0;
      }
      savedMapPositionsRef.current = null;
    }

    const sim = forceSimulation<PlanetNode>(built)
      .force("x", forceX<PlanetNode>(d => d.targetX).strength(0.035))
      .force("y", forceY<PlanetNode>(d => d.targetY).strength(0.035))
      .force("collide", liveCollide(30, 0.9, 2))
      .force("bounds", boundsForce(bounds))
      .alpha(0.9)
      .alphaDecay(0.022)
      .velocityDecay(0.72)
      .on("tick", () => {
        // Tween each node's displayed `r` toward its `targetR` so size changes
        // from switching the active month animate instead of snapping.
        let anyTweening = false;
        for (const n of built) {
          if (Math.abs(n.r - n.targetR) > 0.05) {
            n.r += (n.targetR - n.r) * 0.08;
            anyTweening = true;
          } else {
            n.r = n.targetR;
          }
        }
        // Keep the simulation "warm" while sizes are changing so attractors
        // and collision push spheres back into a clean packing instead of
        // letting them settle into a half-resolved state.
        if (anyTweening) {
          sim.alphaTarget(0.3);
        } else if (sim.alphaTarget() > 0) {
          sim.alphaTarget(0);
        }
        // shallow copy triggers React rerender; nodes themselves are mutated in place
        setNodes(built.slice());
      });

    simRef.current = sim;
    setNodes(built.slice());

    return () => {
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, filterKey, viewMode, isMobile]);

  return nodes;
}
