// Plausible analytics (privacy-friendly: no cookies, no personal data, EU-hosted,
// so no consent banner). The script is loaded here rather than in index.html so
// it can be skipped for editing sessions and switched on for a local test.
//
// Page views are sent by hand from MediaMap's router (one per address change —
// the views, past years, Time Machine years, About sections, the game) rather
// than by the script's own history listener, so back / forward and routes
// applied on first load count exactly once. Everything else is a named event;
// each name below must also exist as a Goal in the Plausible dashboard before
// it shows up there (see CLAUDE.md → Analytics).

const SCRIPT_SRC = "https://plausible.io/js/pa-zMVlgoGVgc5AQvzwaspbE.js";

/** Every event the site sends, with its properties. */
export type AnalyticsEvent =
  | { name: "Company opened"; props: { company: string; sector: string; via: "map" | "linear" | "list" | "search" | "keyboard" } }
  | { name: "Company closed"; props: { company: string; time: string } }
  | { name: "Search opened"; props?: undefined }
  | { name: "Search picked"; props: { company: string } }
  | { name: "Downloads opened"; props?: undefined }
  | { name: "Download"; props: { width: number } }
  | { name: "Time Machine opened"; props?: undefined }
  | { name: "Time Machine year"; props: { year: number } }
  | { name: "Time Machine explore"; props: { year: number } }
  | { name: "Substack"; props: { placement: string } }
  | { name: "About scrolled"; props: { depth: 25 | 50 | 75 | 100 } }
  | { name: "Linear scrolled"; props: { depth: 25 | 50 | 75 | 100 } }
  | { name: "Game opened"; props?: undefined }
  | { name: "Game started"; props?: undefined }
  | { name: "Game ended"; props: { outcome: "finished" | "quit"; played: string; score: number; saved: number } };

type PlausibleFn = ((event: string, opts?: { props?: Record<string, string | number | boolean>; url?: string }) => void) & {
  init?: (opts?: Record<string, unknown>) => void;
  q?: unknown[];
  o?: Record<string, unknown>;
};

declare global {
  interface Window {
    plausible?: PlausibleFn;
  }
}

let enabled = false;

/** The address-bar flags of the editing tools; a visit that uses one is not counted. */
const EDITOR_PARAMS = ["edit", "layout", "style", "tm"];

function isEditingSession(): boolean {
  try {
    const q = new URLSearchParams(window.location.search);
    if (EDITOR_PARAMS.some((p) => q.has(p))) return true;
    // Set once the editor password has been entered (editorGate.ts), or by
    // Plausible's own documented opt-out.
    if (localStorage.getItem("mm-editor-unlocked")) return true;
    if (localStorage.getItem("plausible_ignore") === "true") return true;
  } catch {
    /* storage blocked: count the visit */
  }
  return false;
}

/** Local testing: `localStorage.setItem("mm-analytics-local", "1")` makes a
 *  dev server send events (Plausible ignores localhost otherwise). */
function captureOnLocalhost(): boolean {
  try {
    return localStorage.getItem("mm-analytics-local") === "1";
  } catch {
    return false;
  }
}

/** Load the script and send the first page view. Call once, before render. */
export function initAnalytics(): void {
  if (typeof window === "undefined" || enabled) return;
  if (isEditingSession()) return;
  const w = window;
  const stub: PlausibleFn = w.plausible ?? (((...args: unknown[]) => {
    (stub.q = stub.q ?? []).push(args);
  }) as PlausibleFn);
  stub.init = stub.init ?? ((opts) => {
    stub.o = opts ?? {};
  });
  w.plausible = stub;
  stub.init({
    autoCapturePageviews: false,
    outboundLinks: true,
    captureOnLocalhost: captureOnLocalhost(),
  });
  const s = document.createElement("script");
  s.async = true;
  s.src = SCRIPT_SRC;
  document.head.appendChild(s);
  enabled = true;
  trackPageview();
}

let lastPath: string | null = null;

/** One page view for the current address; a repeat for the same path is ignored. */
export function trackPageview(): void {
  if (!enabled) return;
  const path = window.location.pathname;
  if (path === lastPath) return;
  lastPath = path;
  // The address is passed along rather than read when the script gets to the
  // queued call: a route applied on first load corrects the address in place
  // for a moment, and the script may load inside that moment.
  window.plausible?.("pageview", { url: window.location.origin + path });
}

type PlainEvent = Extract<AnalyticsEvent, { props?: undefined }>["name"];
type PropsEvent = Exclude<AnalyticsEvent, { props?: undefined }>;

/** Send a named event. A no-op when analytics is off (editing sessions, tests). */
export function track(name: PlainEvent): void;
export function track<N extends PropsEvent["name"]>(name: N, props: Extract<PropsEvent, { name: N }>["props"]): void;
export function track(name: string, props?: Record<string, string | number | boolean>): void {
  if (!enabled) return;
  window.plausible?.(name, props ? { props } : undefined);
}

/** A duration as a coarse label, since event properties are grouped by value. */
export function timeBucket(seconds: number): string {
  if (seconds < 5) return "under 5s";
  if (seconds < 15) return "5–15s";
  if (seconds < 30) return "15–30s";
  if (seconds < 60) return "30–60s";
  if (seconds < 180) return "1–3 min";
  return "over 3 min";
}

/** How much of the 90-second game round was played. */
export function playedBucket(seconds: number): string {
  if (seconds < 30) return "under 30s";
  if (seconds < 60) return "30–60s";
  return "60–90s";
}

// ---- Stateful helpers (module state, so the components stay pure) ----

type OpenedVia = Extract<AnalyticsEvent, { name: "Company opened" }>["props"]["via"];
let companyOpen: { name: string; at: number } | null = null;
let nextOpenVia: OpenedVia | null = null;

/** Say how the next company panel is being opened when it isn't a plain click. */
export function noteCompanyOpenedVia(via: OpenedVia): void {
  nextOpenVia = via;
}

/** Call whenever the inspected company changes (null = panel closed): sends
 *  "Company closed" for the one that was open, with how long it was, and
 *  "Company opened" for the new one. */
export function trackCompanyChange(name: string | null, sector: string, fallbackVia: OpenedVia): void {
  const now = performance.now();
  if (companyOpen && companyOpen.name !== name) {
    track("Company closed", { company: companyOpen.name, time: timeBucket((now - companyOpen.at) / 1000) });
    companyOpen = null;
  }
  if (name && companyOpen?.name !== name) {
    companyOpen = { name, at: now };
    track("Company opened", { company: name, sector, via: nextOpenVia ?? fallbackVia });
  }
  nextOpenVia = null;
}

let downloadsSeen = false;

/** Call with whether the About modal is showing its Downloads section. */
export function trackDownloadsSection(atDownloads: boolean): void {
  if (atDownloads && !downloadsSeen) track("Downloads opened");
  downloadsSeen = atDownloads;
}

let gamePhase = "idle";
let gamePlayingSince = 0;

/** Call on every game phase change: opened (welcome card), started (the round
 *  begins), ended (the round ran out, or it was left mid-round). */
export function trackGamePhase(phase: string, hud: { savedCap: number; savedCount: number }): void {
  const prev = gamePhase;
  gamePhase = phase;
  if (prev === phase) return;
  const score = { score: Math.round(hud.savedCap), saved: hud.savedCount };
  if (phase === "intro") track("Game opened");
  else if (phase === "playing") {
    gamePlayingSince = performance.now();
    track("Game started");
  } else if (phase === "ended") track("Game ended", { outcome: "finished", played: "full round", ...score });
  else if (phase === "idle" && prev === "playing") {
    track("Game ended", { outcome: "quit", played: playedBucket((performance.now() - gamePlayingSince) / 1000), ...score });
  }
}
