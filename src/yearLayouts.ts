// Time Machine: every year's real layout.
//
// The Time Machine previews each year with the layout that year's map really
// has — the same solve the live map runs, done here in the background. With
// the layout lab's seeded physics the result is exactly the map you land on
// when you open that year.
//
// A solve is heavy (most of a second of arithmetic), so it runs in Web Workers;
// if a worker can't be started it falls back to solving on the main thread a
// few milliseconds at a time.
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { solveLayoutSteps, type PlanetStyle, type SolveLayoutOptions } from "@media-map/map-core";
import type { MapDate } from "./historical";

/** One planet of a solved year — what a Time Machine thumbnail draws. */
export type YearPlanet = {
  name: string;
  sector: string;
  valuation_b: number;
  x: number;
  y: number;
  r: number;
  isEntity?: boolean;
  hue: number;
  style: PlanetStyle | null;
};

/** Everything that shapes a solve, as a string: equal strings → equal layouts. */
export function layoutSpecSig(o: SolveLayoutOptions): string {
  const b = o.bounds;
  return [
    // Input order matters to the solve, so it is kept (not sorted).
    o.inputs.map((i) => `${i.name}:${i.valuation_b}:${i.center.x},${i.center.y}:${i.isEntity ? 1 : 0}`).join("|"),
    Object.entries(o.positions ?? {}).map(([n, q]) => `${n}:${q.x},${q.y},${q.pin ? 1 : 0}${q.hold ? "h" : ""}`).sort().join("|"),
    Object.entries(o.labelRadii ?? {}).map(([n, v]) => `${n}:${v.toFixed(2)}`).sort().join("|"),
    (o.connections ?? []).map((c) => `${c.from}>${c.to}`).join("|"),
    `${b.x0},${b.y0},${b.x1},${b.y1}`,
    o.anchorDiam, o.minRadius, o.collidePadding, o.entityRadius, o.sizeSpacing, o.sectorPull, o.repulsion,
    o.connectionStrength, o.seed, o.centerPull, o.gapFill, o.gapMin,
  ].join("#");
}

/** A job waiting for (or running on) a solver. */
type Job = {
  spec: SolveLayoutOptions;
  /** Lower = sooner. Read when a solver frees up, so it follows the focused year. */
  rank: () => number;
  /** True once nobody wants the answer any more (a queued job is then skipped). */
  dropped: () => boolean;
  /** x, y, r per planet in `spec.inputs` order; null = dropped before it ran. */
  done: (out: Float64Array | null) => void;
};

// ---- Solvers ---------------------------------------------------------------
const queue: Job[] = [];

/** The next job worth running (lowest rank), skipping any nobody wants. */
function takeJob(): Job | null {
  for (;;) {
    if (queue.length === 0) return null;
    let best = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].rank() < queue[best].rank()) best = i;
    const [job] = queue.splice(best, 1);
    if (!job.dropped()) return job;
    job.done(null);
  }
}

type PoolWorker = { worker: Worker; job: Job | null; id: number };
let pool: PoolWorker[] | null = null;
let workersBroken = false;
let nextId = 1;

function startWorkers(): PoolWorker[] {
  // Two at once on a machine with cores to spare; one otherwise.
  const count = (navigator.hardwareConcurrency ?? 2) > 4 ? 2 : 1;
  const made: PoolWorker[] = [];
  for (let i = 0; i < count; i++) {
    const worker = new Worker(new URL("./yearLayoutWorker.ts", import.meta.url), { type: "module" });
    const slot: PoolWorker = { worker, job: null, id: 0 };
    worker.onmessage = (e: MessageEvent<{ id: number; out: Float64Array }>) => {
      if (e.data.id !== slot.id || !slot.job) return;
      const job = slot.job;
      slot.job = null;
      job.done(e.data.out);
      pumpSolvers();
    };
    worker.onerror = () => {
      // A worker that can't load or run: hand its job (and everything queued)
      // to the main-thread fallback from here on.
      workersBroken = true;
      if (slot.job) queue.push(slot.job);
      slot.job = null;
      for (const w of pool ?? []) w.worker.terminate();
      pool = null;
      pumpSolvers();
    };
    made.push(slot);
  }
  return made;
}

// Main-thread fallback: one job at a time, a few milliseconds per slice.
const FALLBACK_SLICE_MS = 8;
let fallbackBusy = false;
function runOnMainThread(job: Job) {
  fallbackBusy = true;
  const steps = solveLayoutSteps(job.spec);
  const slice = () => {
    const end = performance.now() + FALLBACK_SLICE_MS;
    do {
      const step = steps.next();
      if (step.done) {
        const out = new Float64Array(step.value.length * 3);
        step.value.forEach((n, i) => {
          out[i * 3] = n.x;
          out[i * 3 + 1] = n.y;
          out[i * 3 + 2] = n.r;
        });
        fallbackBusy = false;
        job.done(out);
        pumpSolvers();
        return;
      }
    } while (performance.now() < end);
    window.setTimeout(slice, 0);
  };
  window.setTimeout(slice, 0);
}

/** Hand queued jobs to whichever solvers are free. */
function pumpSolvers() {
  if (!workersBroken && !pool && typeof Worker !== "undefined") {
    try {
      pool = startWorkers();
    } catch {
      workersBroken = true;
    }
  }
  if (pool) {
    for (const slot of pool) {
      if (slot.job) continue;
      const job = takeJob();
      if (!job) return;
      slot.job = job;
      slot.id = nextId++;
      // The solver only reads names, sizes and places — leave the styling behind.
      const spec: SolveLayoutOptions = {
        ...job.spec,
        inputs: job.spec.inputs.map((i) => ({
          name: i.name, sector: i.sector, valuation_b: i.valuation_b, isEntity: i.isEntity, center: i.center, hue: 0, style: null,
        })),
      };
      slot.worker.postMessage({ id: slot.id, spec });
    }
    return;
  }
  if (!fallbackBusy) {
    const job = takeJob();
    if (job) runOnMainThread(job);
  }
}

// ---- The solved years, as a tiny store ---------------------------------------
// Only the Time Machine's carousel reads these, so they live outside React
// state: a year finishing in the background re-renders the carousel (if it is
// open) and nothing else — not the whole map.
let solvedYears: Record<number, YearPlanet[]> = {};
// The inputs each year was solved from (see `layoutSpecSig`).
const solvedSigs: Record<number, string> = {};
const listeners = new Set<() => void>();
const publishYear = (year: number, planets: YearPlanet[], sig: string) => {
  solvedSigs[year] = sig;
  if (solvedYears[year] === planets) return;
  solvedYears = { ...solvedYears, [year]: planets };
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
/** Year → solved planets, filling in as each year finishes (see `useYearLayoutSolver`). */
export function useSolvedYears(): Record<number, YearPlanet[]> {
  return useSyncExternalStore(subscribe, () => solvedYears);
}
/** The same, read once (for debugging / tests). */
export const getSolvedYears = () => solvedYears;
/**
 * A year's solved layout, but only if it was solved from exactly these options
 * — so the live map can use it in place of solving the same thing again.
 */
export function solvedLayoutFor(year: number, opts: SolveLayoutOptions): YearPlanet[] | null {
  const planets = solvedYears[year];
  return planets && solvedSigs[year] === layoutSpecSig(opts) ? planets : null;
}

// Solved layouts by signature — shared by every caller, kept for the visit.
const solved = new Map<string, YearPlanet[]>();
const SOLVED_MAX = 60;

/** Turn a solver's raw output into planets and remember them under `sig`. */
function keepSolved(sig: string, spec: SolveLayoutOptions, out: Float64Array): YearPlanet[] {
  const planets: YearPlanet[] = spec.inputs.map((inp, i) => ({
    name: inp.name, sector: inp.sector, valuation_b: inp.valuation_b, x: out[i * 3], y: out[i * 3 + 1], r: out[i * 3 + 2], isEntity: inp.isEntity, hue: inp.hue, style: inp.style,
  }));
  solved.set(sig, planets);
  while (solved.size > SOLVED_MAX) solved.delete(solved.keys().next().value as string);
  return planets;
}

/**
 * Solve one layout in the background, ahead of anything queued for the Time
 * Machine (the downloaded image uses this for its own fixed arrangement).
 * Answers from the cache when this exact layout has been solved before.
 */
export function solveLayoutInBackground(spec: SolveLayoutOptions): Promise<YearPlanet[]> {
  const sig = layoutSpecSig(spec);
  const hit = solved.get(sig);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    queue.push({
      spec,
      rank: () => -1,
      dropped: () => false,
      done: (out) => (out ? resolve(keepSolved(sig, spec, out)) : reject(new Error("layout solve was dropped"))),
    });
    pumpSolvers();
  });
}

// Building a year's solve options takes a few milliseconds on the main thread,
// so the years are prepared one per task rather than all in one go.
const PREPARE_GAP_MS = 0;
// Ahead-of-time solving waits this long after the last change, so the map's own
// first-load animation (and a burst of sidebar toggles) isn't competed with.
const PREFETCH_DELAY_MS = 1200;

/**
 * Solves the layout of every year in `dates`, in the background.
 *  - `specAt(date)` builds a year's solve options (null = can't yet).
 *  - `stamp` is a new value whenever anything `specAt` reads has changed.
 *  - `urgent` (the Time Machine is open): start now; otherwise wait for a
 *    quiet moment, and only when `prefetch` is on.
 *  - Years nearest `focusYear` are solved first.
 * The results land in the store above (`useSolvedYears`), filling in as each
 * year finishes. They are cached by their inputs, so reopening or switching
 * back costs nothing.
 */
export function useYearLayoutSolver(opts: {
  dates: MapDate[];
  specAt: (d: MapDate) => SolveLayoutOptions | null;
  stamp: unknown;
  prefetch: boolean;
  urgent: boolean;
  focusYear: number;
}): void {
  const { dates, stamp, prefetch, urgent, focusYear } = opts;
  // The latest values, for work that outlives the render that started it.
  const live = useRef({ specAt: opts.specAt, focusYear });
  useLayoutEffect(() => {
    live.current = { specAt: opts.specAt, focusYear };
  });
  const wanted = urgent || prefetch;

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    let timer: number | null = null;
    const publish = (year: number, planets: YearPlanet[], sig: string) => {
      if (!cancelled) publishYear(year, planets, sig);
    };
    // Nearest the focused year first.
    const todo = [...dates].sort((a, b) => Math.abs(a.year - live.current.focusYear) - Math.abs(b.year - live.current.focusYear));
    const prepareNext = () => {
      timer = null;
      if (cancelled) return;
      const date = todo.shift();
      if (!date) return;
      timer = window.setTimeout(prepareNext, PREPARE_GAP_MS);
      const spec = live.current.specAt(date);
      if (!spec || spec.inputs.length === 0) return;
      const sig = layoutSpecSig(spec);
      const hit = solved.get(sig);
      if (hit) {
        publish(date.year, hit, sig);
        return;
      }
      queue.push({
        spec,
        rank: () => Math.abs(date.year - live.current.focusYear),
        dropped: () => cancelled,
        done: (out) => {
          if (!out) return;
          publish(date.year, keepSolved(sig, spec, out), sig);
        },
      });
      pumpSolvers();
    };
    // Open Time Machine → start right away; otherwise let the page settle first.
    timer = window.setTimeout(prepareNext, urgent ? 0 : PREFETCH_DELAY_MS);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
    // `urgent` is a dependency so opening the Time Machine starts the queue at
    // once (years already solved come straight back from the cache).
  }, [wanted, urgent, stamp, dates]);
}
