// Layout lab (branch experiment, not for main): a live layout/physics/type
// override layer on top of whatever Sanity (or the local fallback) says.
//
//   - knobs:     physics + type settings, one set per device mode (desktop /
//                phone square / phone full). Each is an OVERRIDE; anything not
//                set keeps the live value.
//   - positions: per-planet placement edits (pin / soft / free), stamped with
//                the year they were made in and carried forward, like Studio.
//   - sectors:   per-sector gravity-well moves, stamped the same way.
//   - seed:      the layout is deterministic — same settings, same map.
//
// State lives in localStorage so it survives reloads, and a preset can be baked
// into the build (preset.ts) so a deploy shows the layout to anyone. The panel
// itself only appears with ?layout=1 in the URL.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_EXPORT_PANEL, EXPORT_MIN_IMAGE_W } from "../exportMap";
import { EXPORT_MAP_SCALE_FILL, EXPORT_MAP_SCALE_PANEL, EXPORT_W } from "../exportScene";
import { LAYOUT_PRESET } from "./preset";

export type DeviceMode = "desktop" | "square" | "full";
export const DEVICE_MODES: DeviceMode[] = ["desktop", "square", "full"];
export const DEVICE_LABELS: Record<DeviceMode, string> = {
  desktop: "Desktop",
  square: "Phone · Square",
  full: "Phone · Full",
};
/** The phone frame the mobile modes render inside (CSS px). */
export const PHONE_FRAME = { w: 390, h: 844 };
/** The tablet preview frame's height cap; its width is chosen in the panel
 *  (anywhere in the tablet range, by default the top of it). */
export const TABLET_FRAME = { h: 1180 };
/** Narrowest window that still gets the desktop/tablet UI (the phone breakpoint + 1). */
export const TABLET_MIN_WIDTH = 769;

// What the panel's Device switch can show. "tablet" is not a layout of its own:
// it is the desktop layout with its own TYPE settings, used on windows between
// the phone breakpoint and `tabletMaxWidth`.
export type LabDevice = DeviceMode | "tablet";
export const LAB_DEVICES: LabDevice[] = ["desktop", "tablet", "square", "full"];
export const LAB_DEVICE_LABELS: Record<LabDevice, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  square: "Phone 1:1",
  full: "Phone 16:9",
};

export type LayoutKnobs = {
  // --- the knobs Sanity's Map Settings already has ---
  packingDensity: number;
  collidePadding: number;
  sizeSpacing: number;
  sectorPull: number;
  repulsion: number;
  connectionPull: number;
  entityRadius: number;
  // --- new packing controls ---
  /** Pull free planets into empty pockets inside the cluster. */
  gapFill: number;
  /** How empty (slide units from every planet) a spot must be to count as a gap. */
  gapMin: number;
  /** Pull everything toward the middle of the canvas. */
  centerPull: number;
  /** How much of a label's box counts toward spacing (1 = the whole label). */
  labelFootprint: number;
  // --- type ---
  labelLargePx: number;
  labelSmallPx: number;
  labelStrokePx: number;
  /** Valuation ($B) at or above which a planet uses the large type size. */
  labelThresholdB: number;
  /** Names are hidden on planets smaller than this on screen (px). 0 = always shown. */
  nameThreshold: number;
  /** Declutter: clear space (px) a name must keep from every name already
   *  showing; names are handed out largest planet first. 0 = off (size rule only). */
  nameSpacing: number;
  /** How much names grow per zoom step once past 2× zoom (0.12 = +12% each). */
  zoomTypeGrowth: number;
  /** The most names can grow when zoomed in (1.7 = 170% of their size). */
  zoomTypeMax: number;
  // --- resize ---
  /** Map width (px) the layout is designed at; type is its stated size here. */
  designWidth: number;
};
/** The knobs a tablet can override — type only; everything else is desktop's. */
export const TYPE_KEYS: (keyof LayoutKnobs)[] = [
  "labelLargePx", "labelSmallPx", "labelStrokePx", "labelThresholdB", "nameThreshold", "nameSpacing", "zoomTypeGrowth", "zoomTypeMax",
];
export const KNOB_KEYS: (keyof LayoutKnobs)[] = [
  "packingDensity", "collidePadding", "sizeSpacing", "sectorPull", "repulsion", "connectionPull", "entityRadius",
  "gapFill", "gapMin", "centerPull", "labelFootprint",
  "labelLargePx", "labelSmallPx", "labelStrokePx", "labelThresholdB", "nameThreshold", "nameSpacing", "zoomTypeGrowth", "zoomTypeMax",
  "designWidth",
];

/** A placement edit, effective from `from` (a year) onward. */
// `hold` = a home: the planet stays here but still makes room for neighbours.
// `frozen` marks a home written in bulk by "Hold this layout" rather than
// placed by hand — releasing the hold removes only those.
export type PosEdit =
  | { from: number; x: number; y: number; pin: boolean; hold?: boolean; frozen?: boolean }
  | { from: number; clear: true };
export type SectorEdit = { from: number; x: number; y: number };
export type ResolvedPos = { x: number; y: number; pin: boolean; hold?: boolean } | null; // null = freed

export type LayoutLabState = {
  /** Starting-arrangement seed; `seeds` overrides it per device, so shuffling
   *  the phone layout never reshuffles desktop. */
  seed: number;
  seeds: Partial<Record<DeviceMode, number>>;
  /** Lay out at the design width so resizing the window never reshuffles. */
  /** Every page load starts from its own random arrangement (the seeds below
   *  are then unused). It stays put for the whole visit — a resize never
   *  reshuffles. Off = the same arrangement for everyone, from `seed`/`seeds`. */
  shuffleEachLoad: boolean;
  lockLayout: boolean;
  /** Type scales with the map (like an SVG) instead of staying a fixed px size. */
  scaleType: boolean;
  /** Floor for scaled type, screen px (0 = none). */
  minTypePx: number;
  knobs: Record<DeviceMode, Partial<LayoutKnobs>>;
  /** Phone 16:9 shows the DESKTOP layout exactly (same canvas, so it fits);
   *  only its type settings (TYPE_KEYS in knobs.full) stay its own. */
  fullFollowsDesktop: boolean;
  /** Tablet type overrides (TYPE_KEYS only), layered on the desktop values. */
  tablet: Partial<LayoutKnobs>;
  /** Windows up to this wide (and wider than a phone) use the tablet type. */
  tabletMaxWidth: number;
  positions: Record<DeviceMode, Record<string, PosEdit[]>>;
  sectors: Record<DeviceMode, Record<string, SectorEdit[]>>;
  /** The downloaded image (always the desktop map of the present year). */
  download: DownloadSettings;
};

export type DownloadSettings = {
  /**
   * The arrangement the image is drawn from. A number = always that one
   * (chosen because its names fit well), whatever arrangement the visitor's
   * screen happens to show; null = the one on the visitor's screen.
   */
  seed: number | null;
  /** Companies worth this much ($B) or more get their market cap under their name. */
  valuationMinB: number;
  /** Black outline around the names in the image, px (the map's own is the Type tab's). */
  outlinePx: number;
  /**
   * Name sizes in the image, as multiples of the map's desktop type (Type tab):
   * the large size (big companies) and the small size (everyone else).
   */
  largeScale: number;
  smallScale: number;
  /**
   * Planets placed by hand IN THE IMAGE ONLY (slide units) — the online map is
   * not touched. They belong to the fixed arrangement above: picking another
   * arrangement clears them.
   */
  moves: Record<string, { x: number; y: number }>;
  /** The overlay (headline, legend) and the map's size in the image — see ExportPanelSettings. */
  legendGap: number;
  headlineScale: number;
  headlineGap: number;
  mapScale: number;
  imageWidth: number;
  mapOffsetX: number;
  legendMedium: boolean;
  legendScale: number;
  legendTop: number;
  qrOffsetY: number;
  markOffsetY: number;
  countSize: boolean;
};
// What the image uses until a layout with its own `download` is published.
// Chosen by eye in the lab on 2026-10-05: arrangement #153934, a market cap
// under EVERY company, and the small names at 78% of the map's size so they
// all fit with very little moved.
export const DEFAULT_DOWNLOAD: DownloadSettings = {
  seed: 153934,
  valuationMinB: 0,
  outlinePx: 2,
  largeScale: 1,
  smallScale: 0.78,
  // Asmodee is drawn in toward Sony (the arrangement leaves it out on its own).
  moves: { Asmodee: { x: 1313, y: -575 } },
  ...DEFAULT_EXPORT_PANEL,
};

const perMode = <T,>(make: () => T): Record<DeviceMode, T> => ({ desktop: make(), square: make(), full: make() });

export const EMPTY_LAYOUT: LayoutLabState = {
  seed: 1,
  seeds: {},
  shuffleEachLoad: true,
  lockLayout: true,
  scaleType: false,
  minTypePx: 0,
  knobs: perMode(() => ({})),
  fullFollowsDesktop: false,
  tablet: {},
  tabletMaxWidth: 1024,
  positions: perMode(() => ({})),
  sectors: perMode(() => ({})),
  download: { ...DEFAULT_DOWNLOAD },
};

const STORAGE_KEY = "mm-layout-lab-v1";
const UI_KEY = "mm-layout-lab-ui-v1";

const fin = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Coerce anything (stored JSON, a pasted preset) into a valid state. */
export function normalizeLayout(x: unknown): LayoutLabState {
  const o = (x && typeof x === "object" ? x : {}) as Partial<LayoutLabState>;
  const out: LayoutLabState = {
    seed: fin(o.seed) ? Math.round(o.seed) : EMPTY_LAYOUT.seed,
    seeds: {},
    shuffleEachLoad: typeof o.shuffleEachLoad === "boolean" ? o.shuffleEachLoad : EMPTY_LAYOUT.shuffleEachLoad,
    lockLayout: typeof o.lockLayout === "boolean" ? o.lockLayout : EMPTY_LAYOUT.lockLayout,
    scaleType: typeof o.scaleType === "boolean" ? o.scaleType : EMPTY_LAYOUT.scaleType,
    minTypePx: fin(o.minTypePx) ? Math.max(0, o.minTypePx) : 0,
    knobs: perMode(() => ({})),
    fullFollowsDesktop: !!o.fullFollowsDesktop,
    tablet: {},
    tabletMaxWidth: fin(o.tabletMaxWidth) ? Math.max(769, Math.round(o.tabletMaxWidth)) : EMPTY_LAYOUT.tabletMaxWidth,
    positions: perMode(() => ({})),
    sectors: perMode(() => ({})),
    download: {
      // No `download` at all (a layout saved before it existed) → the defaults;
      // present but without a seed → "use the arrangement on screen".
      seed: !o.download ? DEFAULT_DOWNLOAD.seed : fin(o.download.seed) ? Math.max(0, Math.round(o.download.seed)) : null,
      valuationMinB: fin(o.download?.valuationMinB) ? Math.max(0, o.download.valuationMinB) : DEFAULT_DOWNLOAD.valuationMinB,
      outlinePx: fin(o.download?.outlinePx) ? Math.max(0, o.download.outlinePx) : DEFAULT_DOWNLOAD.outlinePx,
      largeScale: fin(o.download?.largeScale) && o.download.largeScale > 0 ? o.download.largeScale : DEFAULT_DOWNLOAD.largeScale,
      smallScale: fin(o.download?.smallScale) && o.download.smallScale > 0 ? o.download.smallScale : DEFAULT_DOWNLOAD.smallScale,
      legendGap: fin(o.download?.legendGap) ? Math.max(0, o.download.legendGap) : DEFAULT_DOWNLOAD.legendGap,
      headlineScale: fin(o.download?.headlineScale) && o.download.headlineScale > 0 ? o.download.headlineScale : DEFAULT_DOWNLOAD.headlineScale,
      headlineGap: fin(o.download?.headlineGap) ? Math.max(0, o.download.headlineGap) : DEFAULT_DOWNLOAD.headlineGap,
      mapScale: fin(o.download?.mapScale) ? Math.max(EXPORT_MAP_SCALE_PANEL, Math.min(EXPORT_MAP_SCALE_FILL, o.download.mapScale)) : DEFAULT_DOWNLOAD.mapScale,
      imageWidth: fin(o.download?.imageWidth) ? Math.round(Math.max(EXPORT_MIN_IMAGE_W, Math.min(EXPORT_W, o.download.imageWidth))) : DEFAULT_DOWNLOAD.imageWidth,
      mapOffsetX: fin(o.download?.mapOffsetX) ? Math.round(Math.max(-1200, Math.min(1200, o.download.mapOffsetX))) : DEFAULT_DOWNLOAD.mapOffsetX,
      legendMedium: typeof o.download?.legendMedium === "boolean" ? o.download.legendMedium : DEFAULT_DOWNLOAD.legendMedium,
      legendScale: fin(o.download?.legendScale) && o.download.legendScale > 0 ? o.download.legendScale : DEFAULT_DOWNLOAD.legendScale,
      legendTop: fin(o.download?.legendTop) ? Math.max(0, o.download.legendTop) : DEFAULT_DOWNLOAD.legendTop,
      qrOffsetY: fin(o.download?.qrOffsetY) ? Math.round(Math.max(-200, Math.min(200, o.download.qrOffsetY))) : DEFAULT_DOWNLOAD.qrOffsetY,
      markOffsetY: fin(o.download?.markOffsetY) ? Math.round(Math.max(-400, Math.min(400, o.download.markOffsetY))) : DEFAULT_DOWNLOAD.markOffsetY,
      countSize: typeof o.download?.countSize === "boolean" ? o.download.countSize : DEFAULT_DOWNLOAD.countSize,
      // No `download` at all → the default moves; otherwise only what it lists.
      moves: !o.download
        ? { ...DEFAULT_DOWNLOAD.moves }
        : Object.fromEntries(
            Object.entries(o.download.moves ?? {})
              .filter(([, q]) => q && fin(q.x) && fin(q.y))
              .map(([name, q]) => [name, { x: Math.round(q.x), y: Math.round(q.y) }]),
          ),
    },
  };
  const tabletIn = (o.tablet ?? {}) as Record<string, unknown>;
  for (const key of TYPE_KEYS) if (fin(tabletIn[key])) out.tablet[key] = tabletIn[key] as number;
  for (const m of DEVICE_MODES) {
    const sd = o.seeds?.[m];
    if (fin(sd)) out.seeds[m] = Math.round(sd);
    const k = (o.knobs?.[m] ?? {}) as Record<string, unknown>;
    for (const key of KNOB_KEYS) if (fin(k[key])) out.knobs[m][key] = k[key] as number;
    for (const [name, list] of Object.entries(o.positions?.[m] ?? {})) {
      const edits: PosEdit[] = [];
      for (const e of Array.isArray(list) ? list : []) {
        if (!e || !fin(e.from)) continue;
        if ("clear" in e && e.clear) edits.push({ from: e.from, clear: true });
        else if ("x" in e && fin(e.x) && fin(e.y)) {
          // A bulk-written entry is always a home, never a hard pin.
          const hold = !!e.hold || !!e.frozen;
          edits.push({ from: e.from, x: e.x, y: e.y, pin: hold ? false : !!e.pin, ...(hold ? { hold: true } : {}), ...(e.frozen ? { frozen: true } : {}) });
        }
      }
      if (edits.length) out.positions[m][name] = edits.sort((a, b) => a.from - b.from);
    }
    for (const [name, list] of Object.entries(o.sectors?.[m] ?? {})) {
      const edits = (Array.isArray(list) ? list : [])
        .filter((e) => e && fin(e.from) && fin(e.x) && fin(e.y))
        .map((e) => ({ from: e.from, x: e.x, y: e.y }))
        .sort((a, b) => a.from - b.from);
      if (edits.length) out.sectors[m][name] = edits;
    }
  }
  return out;
}

/** The edit in force at `year`: the one with the largest `from` ≤ year. */
function editAt<T extends { from: number }>(list: T[] | undefined, year: number): T | null {
  let best: T | null = null;
  for (const e of list ?? []) if (e.from <= year && (!best || e.from >= best.from)) best = e;
  return best;
}
/** Replace (or add) the edit stamped `from`, keeping the list sorted. */
function withEdit<T extends { from: number }>(list: T[] | undefined, edit: T): T[] {
  return [...(list ?? []).filter((e) => e.from !== edit.from), edit].sort((a, b) => a.from - b.from);
}

/** The seed a device mode lays out with. */
export function seedFor(state: LayoutLabState, mode: DeviceMode): number {
  return state.seeds[mode] ?? state.seed;
}

export function resolveKnobs(over: Partial<LayoutKnobs>, live: LayoutKnobs): LayoutKnobs {
  return { ...live, ...over };
}

function readEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const v = new URLSearchParams(window.location.search).get("layout");
  return v === "1" || v === "true";
}

// Saved edits only count in the editing view (?layout=1). A plain visitor always
// gets the baked preset, so a newly pushed preset isn't shadowed by a stale copy.
function loadState(editing: boolean): LayoutLabState {
  if (editing) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeLayout(JSON.parse(raw));
    } catch {
      /* private mode / blocked storage — fall through */
    }
  }
  return normalizeLayout(LAYOUT_PRESET ?? EMPTY_LAYOUT);
}

type UiState = { device: LabDevice; arrange: boolean; showWells: boolean; tabletW?: number };
function loadUi(): UiState {
  const d: UiState = { device: "desktop", arrange: false, showWells: true };
  try {
    const raw = JSON.parse(localStorage.getItem(UI_KEY) ?? "null") as Partial<UiState> | null;
    if (raw && LAB_DEVICES.includes(raw.device as LabDevice)) d.device = raw.device as LabDevice;
    if (raw && typeof raw.arrange === "boolean") d.arrange = raw.arrange;
    if (raw && typeof raw.showWells === "boolean") d.showWells = raw.showWells;
    if (raw && fin(raw.tabletW)) d.tabletW = raw.tabletW;
  } catch {
    /* ignore */
  }
  return d;
}

/** Key-order-independent JSON, for comparing two states. */
function canon(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canon).join(",")}]`;
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(x) ?? "null";
}

const PRESET_STATE = normalizeLayout(LAYOUT_PRESET ?? EMPTY_LAYOUT);

export function useLayoutLab() {
  const enabled = useMemo(() => readEnabled(), []);
  // The PUBLISHED layout: what Sanity's Map Settings carries (set by the map once
  // the Sanity read lands), else the preset baked into the build.
  const [remote, setRemoteState] = useState<LayoutLabState | null>(null);
  const published = remote ?? PRESET_STATE;
  /** Overrides apply for the editor AND for every visitor when a layout is published. */
  const active = enabled || LAYOUT_PRESET != null || remote != null;
  const [state, setState] = useState<LayoutLabState>(() => loadState(enabled));
  // The map reads a DEBOUNCED copy: a from-scratch solve per slider tick would
  // make the sliders stutter, so the solve waits for the drag to pause.
  const [applied, setApplied] = useState(state);
  useEffect(() => {
    const id = window.setTimeout(() => setApplied(state), 140);
    return () => window.clearTimeout(id);
  }, [state]);

  // This visit's starting arrangement, used when "new arrangement on every
  // visit" is on: drawn once per page load, so the layout holds through resizes,
  // view changes and year changes, and differs on the next load. The lab's
  // Reload button draws a fresh one (it stands in for a new page load).
  const [sessionSeed, setSessionSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000));
  const reshuffle = useCallback(() => setSessionSeed(Math.floor(Math.random() * 1_000_000_000)), []);

  const [ui, setUi] = useState<UiState>(() => (enabled ? loadUi() : { device: "desktop", arrange: false, showWells: true }));
  const [open, setOpen] = useState(true);
  // The panel's Download tab is open: the map shows the download's arrangement.
  const [downloadView, setDownloadView] = useState(false);

  /** The map hands over the JSON published in Sanity (Map Settings → Layout). */
  const setRemote = useCallback(
    (raw: string | null | undefined) => {
      if (!raw || !raw.trim()) return;
      let parsed: LayoutLabState;
      try {
        parsed = normalizeLayout(JSON.parse(raw));
      } catch {
        console.warn("[media-map] Map Settings → Layout is not valid JSON; using the built-in layout.");
        return;
      }
      setRemoteState(parsed);
      // Visitors always get the published layout. The editor keeps its own
      // unpublished work — but if it holds nothing beyond the built-in preset,
      // it follows the published layout too. Applied at once (no debounce) so
      // the first paint already uses it.
      const adopt = (s: LayoutLabState) => (!enabled || canon(s) === canon(PRESET_STATE) ? parsed : s);
      setState(adopt);
      setApplied(adopt);
    },
    [enabled],
  );
  /** True when the editor holds changes that aren't what's published. */
  const unpublished = enabled && canon(state) !== canon(published);

  useEffect(() => {
    if (!enabled) return; // only the editing view persists
    try {
      // Only UNPUBLISHED work is kept in this browser; once it matches what's
      // published there is nothing to keep, and the editor follows Sanity.
      if (canon(state) === canon(published)) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [enabled, state, published]);
  useEffect(() => {
    if (!enabled) return;
    try {
      localStorage.setItem(UI_KEY, JSON.stringify(ui));
    } catch {
      /* ignore */
    }
  }, [enabled, ui]);

  // Shift+L hides/shows the panel so the map can be viewed clean.
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "L" || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  // Live (pre-override) knob values per mode, noted by the map as each mode is
  // viewed — so the export can carry complete, resolved settings for Sanity.
  const liveRef = useRef<Partial<Record<DeviceMode, LayoutKnobs>>>({});
  const noteLive = useCallback((mode: DeviceMode, live: LayoutKnobs) => {
    liveRef.current[mode] = live;
  }, []);

  const setKnob = useCallback((mode: DeviceMode, key: keyof LayoutKnobs, value: number | null) => {
    setState((s) => {
      const next = { ...s.knobs[mode] };
      if (value == null) delete next[key];
      else next[key] = value;
      return { ...s, knobs: { ...s.knobs, [mode]: next } };
    });
  }, []);

  // Placement edits skip the slider debounce: the map should answer a drop at once.
  const setBoth = useCallback((fn: (s: LayoutLabState) => LayoutLabState) => {
    setState(fn);
    setApplied(fn);
  }, []);
  /** Give every listed planet a home where it is now (it still makes room for neighbours). */
  const freezeAll = useCallback(
    (mode: DeviceMode, year: number, list: { name: string; x: number; y: number }[]) => {
      setBoth((s) => {
        const forMode = { ...s.positions[mode] };
        for (const p of list) {
          forMode[p.name] = withEdit(forMode[p.name], { from: year, x: p.x, y: p.y, pin: false, hold: true, frozen: true });
        }
        return { ...s, positions: { ...s.positions, [mode]: forMode } };
      });
    },
    [setBoth],
  );
  /** Drop the pins Freeze wrote; planets moved by hand since keep their place. */
  const unfreeze = useCallback(
    (mode: DeviceMode) => {
      setBoth((s) => {
        const forMode: Record<string, PosEdit[]> = {};
        for (const [name, list] of Object.entries(s.positions[mode])) {
          const kept = list.filter((e) => !("frozen" in e && e.frozen));
          if (kept.length) forMode[name] = kept;
        }
        return { ...s, positions: { ...s.positions, [mode]: forMode } };
      });
    },
    [setBoth],
  );

  const setTabletKnob = useCallback((key: keyof LayoutKnobs, value: number | null) => {
    setState((s) => {
      const next = { ...s.tablet };
      if (value == null) delete next[key];
      else next[key] = value;
      return { ...s, tablet: next };
    });
  }, []);

  const setPosition = useCallback((mode: DeviceMode, year: number, name: string, pos: ResolvedPos) => {
    setBoth((s) => {
      const edit: PosEdit = pos
        ? { from: year, x: pos.x, y: pos.y, pin: pos.pin, ...(pos.hold && !pos.pin ? { hold: true } : {}) }
        : { from: year, clear: true };
      const forMode = { ...s.positions[mode], [name]: withEdit(s.positions[mode][name], edit) };
      return { ...s, positions: { ...s.positions, [mode]: forMode } };
    });
  }, [setBoth]);
  /** Drop every lab edit for a planet (back to its live placement). */
  const revertPosition = useCallback((mode: DeviceMode, name: string) => {
    setBoth((s) => {
      const forMode = { ...s.positions[mode] };
      delete forMode[name];
      return { ...s, positions: { ...s.positions, [mode]: forMode } };
    });
  }, [setBoth]);
  const setSector = useCallback((mode: DeviceMode, year: number, name: string, pos: { x: number; y: number }) => {
    setBoth((s) => {
      const forMode = { ...s.sectors[mode], [name]: withEdit(s.sectors[mode][name], { from: year, ...pos }) };
      return { ...s, sectors: { ...s.sectors, [mode]: forMode } };
    });
  }, [setBoth]);
  const revertSector = useCallback((mode: DeviceMode, name: string) => {
    setBoth((s) => {
      const forMode = { ...s.sectors[mode] };
      delete forMode[name];
      return { ...s, sectors: { ...s.sectors, [mode]: forMode } };
    });
  }, [setBoth]);
  const clearArrangement = useCallback((mode: DeviceMode) => {
    setBoth((s) => ({
      ...s,
      positions: { ...s.positions, [mode]: {} },
      sectors: { ...s.sectors, [mode]: {} },
    }));
  }, [setBoth]);

  /** JSON for sharing/baking: the state, plus resolved knobs for modes seen. */
  const exportJson = useCallback(() => {
    const resolved: Partial<Record<DeviceMode, LayoutKnobs>> = {};
    for (const m of DEVICE_MODES) {
      const live = liveRef.current[m];
      if (live) resolved[m] = resolveKnobs(state.knobs[m], live);
    }
    return JSON.stringify({ ...state, resolved }, null, 2);
  }, [state]);

  return {
    enabled,
    active,
    open,
    setOpen,
    /** Immediate state — what the panel shows. */
    state,
    setState,
    /** Debounced state — what the map lays out with. */
    applied,
    device: enabled ? ui.device : ("desktop" as LabDevice),
    setDevice: (device: LabDevice) => setUi((u) => ({ ...u, device })),
    arrange: enabled && ui.arrange,
    setArrange: (arrange: boolean) => setUi((u) => ({ ...u, arrange })),
    showWells: ui.showWells,
    setShowWells: (showWells: boolean) => setUi((u) => ({ ...u, showWells })),
    /** Width of the tablet preview frame: anywhere in the tablet range (default: its top). */
    tabletPreviewW: Math.max(TABLET_MIN_WIDTH, Math.min(state.tabletMaxWidth, ui.tabletW ?? state.tabletMaxWidth)),
    setTabletPreviewW: (tabletW: number) => setUi((u) => ({ ...u, tabletW })),
    setKnob,
    setTabletKnob,
    setPosition,
    revertPosition,
    setSector,
    revertSector,
    clearArrangement,
    freezeAll,
    unfreeze,
    noteLive,
    exportJson,
    setRemote,
    unpublished,
    sessionSeed,
    reshuffle,
    /** The editor is on its Download tab (the map then previews that arrangement). */
    downloadView: enabled && downloadView,
    setDownloadView,
    setDownload: (patch: Partial<DownloadSettings>) =>
      setState((s) => {
        const next = { ...s.download, ...patch };
        // Hand placements were made for one arrangement; another one starts clean.
        if ("seed" in patch && patch.seed !== s.download.seed && !("moves" in patch)) next.moves = {};
        return { ...s, download: next };
      }),
    /** Place (or, with null, un-place) one planet in the downloaded image only. Applied at once. */
    setDownloadMove: (name: string, pos: { x: number; y: number } | null) =>
      setBoth((s) => {
        const moves = { ...s.download.moves };
        if (pos) moves[name] = { x: Math.round(pos.x), y: Math.round(pos.y) };
        else delete moves[name];
        return { ...s, download: { ...s.download, moves } };
      }),
    /** Back to the published layout (Sanity, else the built-in preset). */
    resetToPreset: () => setState(published),
    clearAll: () => setState(normalizeLayout(EMPTY_LAYOUT)),
  };
}

export type LayoutLab = ReturnType<typeof useLayoutLab>;

/**
 * Placement edits in force at `year` for a mode: name → position, or null = freed.
 *
 * `baseYears` (optional) is the year the layer UNDERNEATH (Sanity's own
 * positions) last set each planet, as of `year`. An edit carries forward only
 * until something later replaces it — in the lab OR underneath: if the layer
 * underneath has a later-dated entry than the lab's, that one stands and the
 * lab's edit is left out. (A tie goes to the lab.)
 */
export function positionsAt(
  state: LayoutLabState,
  mode: DeviceMode,
  year: number,
  baseYears?: Record<string, number>,
): Record<string, ResolvedPos> {
  const out: Record<string, ResolvedPos> = {};
  for (const [name, list] of Object.entries(state.positions[mode])) {
    const e = editAt(list, year);
    if (!e) continue;
    if (baseYears && baseYears[name] > e.from) continue;
    out[name] = "clear" in e ? null : { x: e.x, y: e.y, pin: e.pin, hold: e.hold };
  }
  return out;
}
/** Sector-well moves in force at `year` for a mode (`baseYears`: as in `positionsAt`). */
export function sectorsAt(
  state: LayoutLabState,
  mode: DeviceMode,
  year: number,
  baseYears?: Record<string, number>,
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  for (const [name, list] of Object.entries(state.sectors[mode])) {
    const e = editAt(list, year);
    if (!e) continue;
    if (baseYears && baseYears[name] > e.from) continue;
    out[name] = { x: e.x, y: e.y };
  }
  return out;
}
