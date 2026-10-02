// Style lab (branch experiment, not for main): a live colour/style override
// layer on top of whatever Sanity (or the local fallback) says. Three kinds of
// override, all optional:
//   - sectors:   one flat colour per sector (planets without their own stripes,
//                sidebar swatch, list/aggregate colours)
//   - largeCaps: an ombré-stripe recipe per company (the Planet Maker model)
//   - bg:        the three stops of the site's vertical background gradient
// State lives in localStorage so it survives reloads, and a preset can be baked
// into the build (preset.ts) so a deploy shows the alternative look to anyone.
// The editing panel itself only appears with ?style=1 in the URL.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OmbreStripes, PlanetStyle } from "@media-map/map-core";
import { LAB_PRESET } from "./preset";

export type LargeCapRecipe = OmbreStripes & {
  /** Circle outline, screen px (0 = none) + colour. */
  strokePx: number;
  strokeColor: string;
};

export type StyleLabState = {
  /** Background gradient stops: top, middle (51%), bottom. */
  bg: [string, string, string];
  sectors: Record<string, string>;
  largeCaps: Record<string, LargeCapRecipe>;
  /** Outline for EVERY Large Cap planet (a recipe's own stroke wins when > 0). */
  largeCapStroke?: { px: number; color: string };
  /** Outline for every planet in the other sectors. */
  sectorStroke?: { px: number; color: string };
  /** Solid background for the left side panel (default: translucent navy over the page). */
  panelBg?: string;
};

export const DEFAULT_BG: [string, string, string] = ["#1E0300", "#010C4C", "#070010"];
export const EMPTY_STATE: StyleLabState = { bg: DEFAULT_BG, sectors: {}, largeCaps: {} };

const STORAGE_KEY = "mm-style-lab-v1";
const LARGE_CAP = "Large Cap";
const HEX_RE = /^#[0-9a-f]{6}$/i;

export const isHex = (s: unknown): s is string => typeof s === "string" && HEX_RE.test(s);

/** Coerce anything (stored JSON, a pasted preset) into a valid state. */
export function normalizeState(x: unknown): StyleLabState {
  const o = (x && typeof x === "object" ? x : {}) as Partial<StyleLabState>;
  const bgIn = Array.isArray(o.bg) ? o.bg : [];
  const bg = DEFAULT_BG.map((d, i) => (isHex(bgIn[i]) ? (bgIn[i] as string) : d)) as [string, string, string];
  const sectors: Record<string, string> = {};
  for (const [k, v] of Object.entries(o.sectors ?? {})) if (isHex(v)) sectors[k] = v;
  const largeCaps: Record<string, LargeCapRecipe> = {};
  for (const [k, v] of Object.entries(o.largeCaps ?? {})) {
    const r = normalizeRecipe(v);
    if (r) largeCaps[k] = r;
  }
  const out: StyleLabState = { bg, sectors, largeCaps };
  const lcs = o.largeCapStroke;
  if (lcs && typeof lcs.px === "number" && lcs.px > 0 && isHex(lcs.color)) {
    out.largeCapStroke = { px: Math.min(12, lcs.px), color: lcs.color };
  }
  const ss = o.sectorStroke;
  if (ss && typeof ss.px === "number" && ss.px > 0 && isHex(ss.color)) {
    out.sectorStroke = { px: Math.min(12, ss.px), color: ss.color };
  }
  if (isHex(o.panelBg)) out.panelBg = o.panelBg;
  return out;
}

export function normalizeRecipe(v: unknown): LargeCapRecipe | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<LargeCapRecipe>;
  const stops = Array.isArray(r.stops) ? r.stops.filter(isHex) : [];
  if (!stops.length) return null;
  const num = (n: unknown, d: number, lo: number, hi: number) =>
    typeof n === "number" && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
  return {
    stops,
    count: Math.round(num(r.count, stops.length, 1, 120)),
    angle: num(r.angle, 90, 0, 180),
    blend: r.blend === "srgb" ? "srgb" : "oklab",
    reverse: !!r.reverse,
    stripeStrokePx: num(r.stripeStrokePx, 0, 0, 12),
    stripeStrokeColor: isHex(r.stripeStrokeColor) ? r.stripeStrokeColor : "#0d0f13",
    strokePx: num(r.strokePx, 0, 0, 12),
    strokeColor: isHex(r.strokeColor) ? r.strokeColor : "#0d0f13",
  };
}

/** A starting recipe for a company from the style it has today. */
export function recipeFromStyle(base: PlanetStyle | null | undefined): LargeCapRecipe {
  const stops = base?.ombre?.stops ?? (base?.stripes && base.stripes.length ? base.stripes : [base?.fill ?? "#888888"]);
  const angle =
    base?.ombre?.angle ??
    (base?.stripeOrientation === "horizontal" ? 0 : base?.stripeOrientation === "diagonal" ? 45 : 90);
  const strokeOff = !base?.stroke || base.stroke === "transparent";
  return normalizeRecipe({
    stops: stops.filter(isHex),
    count: base?.ombre?.count ?? stops.length,
    angle,
    blend: base?.ombre?.blend ?? "oklab",
    reverse: base?.ombre?.reverse ?? false,
    stripeStrokePx: base?.ombre?.stripeStrokePx ?? 0,
    stripeStrokeColor: base?.ombre?.stripeStrokeColor,
    strokePx: strokeOff ? 0 : (base?.strokeWidthPx ?? 1),
    strokeColor: strokeOff ? "#0d0f13" : (isHex(base?.stroke) ? base!.stroke! : "#0d0f13"),
  }) ?? { ...EMPTY_RECIPE };
}

export const EMPTY_RECIPE: LargeCapRecipe = {
  stops: ["#ffd8a8", "#ff9a76", "#e8628c", "#8b5cf6", "#2b2f77"],
  count: 12,
  angle: 0,
  blend: "oklab",
  reverse: false,
  stripeStrokePx: 0,
  stripeStrokeColor: "#0d0f13",
  strokePx: 0,
  strokeColor: "#0d0f13",
};

export function bgGradientOf(bg: [string, string, string]): string {
  return `linear-gradient(180deg, ${bg[0]} 0%, ${bg[1]} 51%, ${bg[2]} 100%)`;
}

/** The style a planet renders with under the lab's overrides. */
export function labStyleFor(
  state: StyleLabState,
  name: string,
  sector: string,
  base: PlanetStyle | null | undefined,
): PlanetStyle | null {
  const sectorStroke = sector === LARGE_CAP && state.largeCapStroke ? state.largeCapStroke : null;
  const lc = state.largeCaps[name];
  if (lc) {
    const { strokePx, strokeColor, ...ombre } = lc;
    const stroke = strokePx > 0 ? { px: strokePx, color: strokeColor } : sectorStroke;
    return {
      ...(base ?? {}),
      fill: undefined,
      stripes: undefined,
      stripeOrientation: undefined,
      ombre,
      stroke: stroke ? stroke.color : "transparent",
      strokeWidthPx: stroke ? stroke.px : 0,
    };
  }
  if (sectorStroke) {
    return { ...(base ?? {}), stroke: sectorStroke.color, strokeWidthPx: sectorStroke.px };
  }
  const sec = state.sectors[sector];
  let out: PlanetStyle | null = base ?? null;
  // Striped planets (Large Cap brand palettes) keep their own look; a sector
  // colour only recolours the flat planets.
  if (sec && !((base?.stripes && base.stripes.length >= 2) || base?.ombre)) {
    out = { ...(base ?? {}), fill: sec };
  }
  if (sector !== LARGE_CAP && state.sectorStroke) {
    out = { ...(out ?? {}), stroke: state.sectorStroke.color, strokeWidthPx: state.sectorStroke.px };
  }
  return out;
}

/** One representative colour for a styled planet (swatches, list dots, bands). */
export function primaryColorOf(style: PlanetStyle | null | undefined): string | null {
  return style?.fill ?? style?.ombre?.stops?.[0] ?? style?.stripes?.[0] ?? null;
}

function readEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const v = new URLSearchParams(window.location.search).get("style");
  return v === "1" || v === "true";
}

function loadState(): StyleLabState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeState(JSON.parse(raw));
  } catch {
    /* private mode / blocked storage — fall through */
  }
  return normalizeState(LAB_PRESET ?? EMPTY_STATE);
}

export function useStyleLab() {
  const enabled = useMemo(() => readEnabled(), []);
  const [state, setState] = useState<StyleLabState>(loadState);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  // The page background behind everything (visible under the sidebar's
  // translucent panel and during view fades) follows the gradient's bottom stop.
  useEffect(() => {
    document.body.style.background = state.bg[2];
    return () => {
      document.body.style.background = "";
    };
  }, [state.bg]);

  // Shift+S hides/shows the panel so the map can be viewed clean.
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "S" || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  const hasOverrides =
    !!state.largeCapStroke ||
    !!state.sectorStroke ||
    !!state.panelBg ||
    Object.keys(state.sectors).length > 0 ||
    Object.keys(state.largeCaps).length > 0 ||
    state.bg.some((c, i) => c.toLowerCase() !== DEFAULT_BG[i].toLowerCase());

  const styleFor = useCallback(
    (name: string, sector: string, base: PlanetStyle | null | undefined) => labStyleFor(state, name, sector, base),
    [state],
  );
  const sectorColor = useCallback((sector: string): string | null => state.sectors[sector] ?? null, [state]);

  return {
    enabled,
    open,
    setOpen,
    state,
    setState,
    hasOverrides,
    styleFor,
    sectorColor,
    bgGradient: bgGradientOf(state.bg),
    bgStops: state.bg,
    panelBg: state.panelBg ?? null,
    /** Back to the baked preset (or the live look when there is none). */
    resetToPreset: () => setState(normalizeState(LAB_PRESET ?? EMPTY_STATE)),
    clearAll: () => setState(EMPTY_STATE),
  };
}

export type StyleLab = ReturnType<typeof useStyleLab>;
