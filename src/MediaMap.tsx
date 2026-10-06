import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadCompanies, type SheetCompany } from "./loadCompanies";
import {
  usePhysicsLayout,
  type SolveLayoutOptions,
  Planet,
  ConnectionLine,
  computeAnchorDiam,
  diameterFor,
  makeMoment,
  yearWindowsActiveAt,
  type PlanetNode,
  type ViewMode,
  type LayoutInput,
} from "@media-map/map-core";
import { COMPANY_POSITIONS, type PlanetPosition } from "./layout";
import { AboutModal } from "./AboutModal";
import { COMPANY_CONNECTIONS, type Connection } from "./connections";
import { isSanityConfigured } from "./sanityClient";
import { useSanityMapDocs, useResolvedSanityMap, resolveSanityMapAt, type CompanyDetail, type ResolvedSanityMap, type ValuationType } from "./sanityMap";
import { buildExportPanelMarkup, buildExportPng, clearTextWidthCache, downloadBlob, exportImageWidth, exportPreviewFrame, exportPxPerUnit, exportShowsValuation, loadExportAssets, measureExportLayout, measureLabelTextWidth, DEFAULT_EXPORT_PANEL, EXPORT_VALUATION_MIN_B, type ExportAssets, type ExportLayoutStats, type ExportPanelSettings } from "./exportMap";
import { ExportPreviewOverlay } from "./exportPreview";
import { StarfieldDefs } from "./exportScene";
import { parseRoute, routePath, routeTitle, type AboutSection, type AppRoute } from "./urlState";
import { SearchBar } from "./SearchBar";
import { getSolvedYears, solveLayoutInBackground, solvedLayoutFor, useSolvedYears, useYearLayoutSolver, type YearPlanet } from "./yearLayouts";
import { useGameMode } from "./game/useGameMode";
import { GameOverlay } from "./game/GameOverlay";
import { ghostColorFor, ghostStyleFor } from "./game/ghostStyle";
import { bgGradientOf, useStyleLab } from "./styleLab/styleLab";
import { StyleLabPanel } from "./styleLab/StyleLabPanel";
import {
  PHONE_FRAME,
  TABLET_FRAME,
  TYPE_KEYS,
  positionsAt,
  resolveKnobs,
  sectorsAt,
  seedFor,
  useLayoutLab,
  type DeviceMode,
  type LayoutKnobs,
  type LayoutLab,
} from "./layoutLab/layoutLab";
import { LAYOUT_PANEL_W, LayoutLabPanel, type LabSelection } from "./layoutLab/LayoutLabPanel";
import type { SearchItem } from "./searchMatch";

// Side-panel label for each company's primary metric (chosen in Sanity).
/** What a screen reader calls each view tab. */
const VIEW_TAB_LABELS: Record<AppViewMode, string> = {
  map: "Map view",
  linear: "Linear view",
  aggregate: "Historical aggregate view",
  list: "List view",
};
const VALUATION_LABELS: Record<ValuationType, string> = {
  market_cap: "Latest Market Cap",
  fundraising_valuation: "Fundraising Valuation",
  yearly_revenue: "Yearly Revenue",
};
import { MOBILE_LAYOUTS, type MobileViewType, type MobileLayout, type MobileSettings, type MobilePosition } from "./mobileLayout";
import {
  CANVAS_DESKTOP,
  CANVAS_MOBILE_45,
  CANVAS_MOBILE_SQUARE,
  SECTOR_CENTERS,
  flatStyleForSector,
  hexToRgba,
  hueForSector,
  isKnownSector,
  planetStyleFor,
  sectorCenterFor,
} from "./sectors";
import {
  CURRENT_DATE,
  buildYearRange,
  dateIndex,
  formatDate,
  sameDate,
  valuationForDate,
  type MapDate,
} from "./historical";
import { useValuations, valuationAt, isHiddenAt, latestYear, latestUpdated } from "./loadValuations";

const MOBILE_BREAKPOINT_PX = 768;

// "Mobile" = a narrow (portrait-phone) viewport OR a phone held in landscape.
// The landscape clause keys off a coarse pointer + short viewport so a phone on
// its side (wider than the breakpoint) still gets the mobile chrome (drawer +
// touch controls), while a desktop window or an iPad in landscape does not.
const MOBILE_MEDIA_QUERY =
  `(max-width: ${MOBILE_BREAKPOINT_PX}px), ` +
  `(max-height: 500px) and (orientation: landscape) and (pointer: coarse)`;

/** Layout lab: longest the first paint waits for late-arriving data (ms after the snapshot). */
const LIVE_WAIT_MS = 1200;

/** The type a phone view has before any lab override (the live phone values). */
function phoneTypeDefaults(labelPx: number, nameThreshold: number): Partial<LayoutKnobs> {
  return {
    labelLargePx: labelPx,
    labelSmallPx: labelPx,
    labelStrokePx: 1.2,
    labelThresholdB: 100,
    nameThreshold,
    nameSpacing: 0,
    zoomTypeGrowth: LABEL_GROW_RATE,
    zoomTypeMax: LABEL_GROW_MAX,
  };
}
/** Only the type knobs of an override set. */
function pickTypeKnobs(over: Partial<LayoutKnobs>): Partial<LayoutKnobs> {
  const out: Partial<LayoutKnobs> = {};
  for (const k of TYPE_KEYS) if (over[k] !== undefined) out[k] = over[k];
  return out;
}

/** Live match for a media query (layout lab: the tablet type range). */
function useMediaQuery(query: string): boolean {
  const [m, setM] = useState<boolean>(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setM(mq.matches);
    const handler = (e: MediaQueryListEvent) => setM(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);
  return m;
}

// A fresh number each time it is asked — turns "this object changed" into
// something that can sit in a cache key.
let stampCounter = 0;
const nextStampId = () => ++stampCounter;

/** The window's height, px, kept current on resize (a phone's toolbar showing / hiding). */
function useWindowHeight(): number {
  const [h, setH] = useState<number>(() => (typeof window !== "undefined" ? window.innerHeight : 800));
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return h;
}

// Phone: a selected planet's detail panel sits across the bottom of the screen
// — as wide as the row of controls at the top, this share of the window tall —
// and the map shows the planet in the space left between that row and the panel.
// The top row (view tabs, settings) stays in view and in reach.
const MOBILE_DETAIL_BOTTOM = 16;
const MOBILE_DETAIL_SIDE = 16;
const MOBILE_DETAIL_HEIGHT_SHARE = 0.62;
/** Where the top row of controls ends, px from the top (16 + the pill's height). */
const MOBILE_TOP_CONTROLS_BOTTOM = 58;
// How big the focused planet is drawn in that space: at most this share of the
// screen's width and of the space's height (small planets stop at the max zoom).
const MOBILE_FOCUS_WIDTH_SHARE = 0.5;
const MOBILE_FOCUS_HEIGHT_SHARE = 0.76;

function useIsMobile(): boolean {
  const [m, setM] = useState<boolean>(() =>
    typeof window !== "undefined" && window.matchMedia(MOBILE_MEDIA_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
    const handler = (e: MediaQueryListEvent) => setM(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return m;
}

// True while the viewport is portrait (taller than wide). Drives the horizontal
// view's "rotate your phone" prompt.
function useIsPortrait(): boolean {
  const [p, setP] = useState<boolean>(() =>
    typeof window !== "undefined" && window.matchMedia("(orientation: portrait)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const handler = (e: MediaQueryListEvent) => setP(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return p;
}

// ---- Mobile view types + per-type layouts ----
// Each mobile view type is an independently-authored layout (settings, planet
// positions, sector wells) on its own canvas: `full` reuses the desktop
// landscape canvas (unplaced planets fall back to the desktop layout);
// `vertical` is 4:5 portrait; `horizontal` is 16:9 landscape.
const CANVAS_BY_TYPE: Record<MobileViewType, { x: number; y: number; w: number; h: number }> = {
  full: CANVAS_DESKTOP,
  vertical: CANVAS_MOBILE_45,
  // Horizontal uses the desktop canvas so it inherits the full view's placement
  // pixel-for-pixel (it's the landscape/rotated-phone experience of the full map).
  horizontal: CANVAS_DESKTOP,
  square: CANVAS_MOBILE_SQUARE,
};
const MOBILE_VIEW_TYPES: MobileViewType[] = ["horizontal", "full", "square", "vertical"];
// The mobile views actually offered — in the public switcher AND the in-app
// editor, matching the Sanity Studio editor (Full + Square only). Horizontal /
// vertical are retired: MOBILE_VIEW_TYPES keeps all four so their saved layout
// data still loads, but nothing surfaces them for selection.
const MOBILE_VIEW_TYPES_OFFERED: MobileViewType[] = ["square", "full"];
const DEFAULT_MOBILE_VIEW: MobileViewType = "square";
// Display labels for the view-type tabs (switcher + editor selector).
const MOBILE_VIEW_LABELS: Record<MobileViewType, string> = {
  horizontal: "Horizontal",
  full: "Full 16:9",
  square: "Square 1:1",
  vertical: "Vertical 4:5",
};

// Horizontal + square start from the FULL view's placement + wells (inherited at
// runtime; their own entries override per-planet). Full itself also seeds the
// desktop layout for un-authored planets.
const inheritsFullLayout = (t: MobileViewType) => t === "horizontal" || t === "square";

const MOBILE_VIEW_STORE_KEY = "mm.mobileViewType";
function loadMobileViewType(): MobileViewType {
  if (typeof window === "undefined") return DEFAULT_MOBILE_VIEW;
  try {
    const raw = window.localStorage.getItem(MOBILE_VIEW_STORE_KEY);
    // Only accept a still-offered view: a returning visitor whose saved choice
    // was horizontal/vertical falls back to the default rather than being stuck
    // on a layout the switcher no longer shows.
    if (raw && (MOBILE_VIEW_TYPES_OFFERED as string[]).includes(raw)) return raw as MobileViewType;
  } catch {
    /* ignore */
  }
  return DEFAULT_MOBILE_VIEW;
}

// Deep-clone the default layouts so the in-memory editor state doesn't mutate
// the imported constants.
function cloneMobileLayouts(
  src: Record<MobileViewType, MobileLayout>,
): Record<MobileViewType, MobileLayout> {
  const out = {} as Record<MobileViewType, MobileLayout>;
  for (const t of MOBILE_VIEW_TYPES) {
    const l = src[t];
    out[t] = {
      settings: { ...l.settings },
      positions: { ...l.positions },
      sectorCenters: { ...l.sectorCenters },
    };
  }
  return out;
}

// Editor sliders for a mobile view's settings.
const MOBILE_SETTINGS_FIELDS: { key: keyof MobileSettings; label: string; min: number; max: number; step: number }[] = [
  { key: "scale", label: "Planet scale", min: 0.3, max: 3, step: 0.05 },
  { key: "collidePadding", label: "Planet gap", min: 0, max: 120, step: 2 },
  { key: "sizeSpacing", label: "Size-scaled gap", min: 0, max: 0.4, step: 0.01 },
  { key: "repulsion", label: "Spread (fill space)", min: 0, max: 120, step: 2 },
  { key: "sectorPull", label: "Sector pull", min: 0, max: 0.25, step: 0.01 },
  { key: "nameThreshold", label: "Name visibility (px)", min: 0, max: 120, step: 5 },
];

// The map area's background gradient — shared so the aggregate view samples the
// exact same colors, and the list view's frozen Company column can sample a flat
// tone per row (see sampleListGradient) so it re-creates the gradient behind it.
const LIST_BG_GRADIENT = "linear-gradient(180deg, #080202 0%, #0a0f29 51%, #030118 100%)";

function hexRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// Solid color of the background gradient at vertical fraction `f` (0 = top),
// for the live gradient's three stops (0% / 51% / 100%).
function sampleListGradient(f: number, bgStops: [string, string, string]): string {
  const stops: [number, [number, number, number]][] = [
    [0, hexRgb(bgStops[0])],
    [0.51, hexRgb(bgStops[1])],
    [1, hexRgb(bgStops[2])],
  ];
  const clamped = f < 0 ? 0 : f > 1 ? 1 : f;
  let [f0, c0] = stops[0];
  for (let i = 1; i < stops.length; i++) {
    const [f1, c1] = stops[i];
    if (clamped <= f1) {
      const t = f1 === f0 ? 0 : (clamped - f0) / (f1 - f0);
      return `rgb(${Math.round(c0[0] + (c1[0] - c0[0]) * t)}, ${Math.round(c0[1] + (c1[1] - c0[1]) * t)}, ${Math.round(c0[2] + (c1[2] - c0[2]) * t)})`;
    }
    [f0, c0] = [f1, c1];
  }
  return `rgb(${c0[0]}, ${c0[1]}, ${c0[2]})`;
}

// "Needs USD conversion" authoring marker. Some companies carry a literal
// " - CONVERT TO USD" suffix in their (Sanity) name as a reminder that their
// valuation still needs converting. `usdFlag` strips the marker for display and
// reports the flag, so the app can show the clean name and tint it bright blue
// (a "fix me" cue) instead of printing the marker text on the map.
// TEMP: label tint disabled — all labels render white for now. Restore this
// const (and its uses in the map input + list view) to bring the cue back.
// const USD_FLAG_COLOR = "#3ba9ff";
const USD_FLAG_STRIP_RE = /[\s\-–—]*convert\s+to\s+usd\s*!*\s*$/i;
function usdFlag(name: string): { display: string; flag: boolean } {
  const flag = /convert\s+to\s+usd/i.test(name);
  return { display: flag ? name.replace(USD_FLAG_STRIP_RE, "").trim() || name : name, flag };
}

// Floating gear button (top-right) that switches the mobile view type
// (full / vertical / horizontal). Layout authoring lives in the ?edit=mobile
// desktop editor; on the phone this is just the view switcher.
function MobileViewSwitcher({
  open,
  onToggle,
  viewType,
  onViewType,
  elevated = false,
  hidden = false,
}: {
  open: boolean;
  onToggle: () => void;
  viewType: MobileViewType;
  onViewType: (t: MobileViewType) => void;
  /** Raise above the horizontal rotate-prompt overlay (z 40) so it stays usable. */
  elevated?: boolean;
  /** Fade out (search is using the full top row). */
  hidden?: boolean;
}) {
  const fontStack = '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif';
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        zIndex: elevated ? 45 : 14,
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : "auto",
        transition: "opacity 160ms ease",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
      }}
    >
      <button
        aria-label="Map view"
        aria-pressed={open}
        onClick={onToggle}
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          // At rest: the control pills' fill and 0.5px hairline (it sits beside
          // the view tabs' pill). Open: the blue "active" look.
          background: open ? "rgba(120,160,255,0.22)" : PILL_BG,
          border: open ? "1px solid rgba(150,180,255,0.6)" : "none",
          boxShadow: open ? undefined : PILL_HAIRLINE,
          color: "white",
          display: "grid",
          placeItems: "center",
          backdropFilter: "blur(6px)",
          cursor: "pointer",
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 20, display: "block", lineHeight: 1 }}>
          tune
        </span>
      </button>
      {open && (
        <div
          style={{
            width: 200,
            background: "rgba(10,14,24,0.92)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 12,
            padding: 14,
            backdropFilter: "blur(10px)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span style={{ fontFamily: fontStack, fontSize: 11, opacity: 0.85 }}>Map view</span>
          {MOBILE_VIEW_TYPES_OFFERED.map((opt) => (
            <button
              key={opt}
              onClick={() => onViewType(opt)}
              style={{
                fontFamily: fontStack,
                fontSize: 13,
                padding: "8px 10px",
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "left",
                color: "white",
                background: viewType === opt ? "rgba(120,160,255,0.25)" : "rgba(255,255,255,0.06)",
                border: viewType === opt ? "1px solid rgba(150,180,255,0.6)" : "1px solid rgba(255,255,255,0.15)",
              }}
            >
              {MOBILE_VIEW_LABELS[opt]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Design-mode toggle: `?edit=1` (or `?edit=true`) in the URL turns on the
 * editor toolbar and drag-to-position interaction. Read once on mount —
 * intentionally not reactive, the URL flag isn't expected to change mid-session.
 */
function useIsEditMode(): boolean {
  return useMemo(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    const v = params.get("edit");
    return v === "1" || v === "true";
  }, []);
}

/**
 * Mobile-layout editor: `?edit=mobile` forces the 4:5 portrait view + drag
 * editing on ANY device (so you can author the mobile layout on desktop with a
 * mouse). Read once on mount.
 */
function useMobileEditMode(): boolean {
  return useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("edit") === "mobile";
  }, []);
}

const MIN_ZOOM = 1; // = the on-load / reset view; users can't zoom out past it
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.4;
// Label type stays a constant on-screen size up to LABEL_GROW_START, then grows
// linearly to LABEL_GROW_MAX at full zoom — so names/values get more prominent
// as you zoom into a cluster. Line-height is a ratio in Planet, so leading (the
// line-spacing %) scales with the font automatically.
const LABEL_GROW_START = 2;
const LABEL_GROW_MAX = 1.7;
const LABEL_GROW_RATE = 0.12;
const labelScaleForZoom = (zoom: number, rate = LABEL_GROW_RATE, max = LABEL_GROW_MAX) =>
  Math.min(max, Math.max(1, 1 + (zoom - LABEL_GROW_START) * rate));

// Ease the pan back to center as the map zooms toward MIN_ZOOM, so the most
// zoomed-out level is always the centered default view (0 at MIN_ZOOM → 1 by
// MIN_ZOOM + RECENTER_RANGE).
const RECENTER_RANGE = 0.5;
const centerFactorForZoom = (z: number) => Math.min(1, Math.max(0, (z - MIN_ZOOM) / RECENTER_RANGE));
// Past this zoom, every planet shows its valuation under the name (not just
// Large Cap, which always shows it). ~2 zoom-button clicks from the default 1×
// (1 × 1.4 × 1.4 ≈ 1.96), or the equivalent scroll.
const VALUATION_ZOOM_THRESHOLD = 1.9;

// Mobile (temporary plan): with the full desktop map fit to a phone, showing
// every label is too cluttered, so only Large Cap names show until the user
// zooms past this threshold (via the on-screen +/- buttons), at which point all
// labels appear. Doesn't affect desktop.
const MOBILE_LABEL_ZOOM_THRESHOLD = 2.5;

// Mobile: text-only entities (sub-brands) are hidden by default to reduce
// clutter, and reveal once the user zooms past this threshold. Entities have
// r=0 so the diameter-based name threshold can't reveal them — this drives it.
const ENTITY_MOBILE_ZOOM_THRESHOLD = 2.0;

function formatValuation(b: number): string {
  if (b >= 1000) return `$${(b / 1000).toFixed(b >= 10000 ? 1 : 2)}T`;
  if (b >= 10) return `$${b.toFixed(0)}B`;
  if (b >= 1) return `$${b.toFixed(1)}B`;
  return `$${(b * 1000).toFixed(0)}M`;
}


type SectorPanelProps = {
  sectors: string[];
  counts: Record<string, number>;
  enabled: Set<string>;
  onToggle: (s: string) => void;
  onAll: (on: boolean) => void;
  total: number;
  loading: boolean;
  error: string | null;
  hoveredSector: string | null;
  onHoverSector: (s: string | null) => void;
  onFocusSector: (s: string) => void;
  /** Style lab (branch experiment): a sector's override colour, if any. */
  sectorColorOverride?: (s: string) => string | null;
  /** Style lab: solid background for the side panel. */
  panelBackground?: string | null;
};

/** Fill of the control pills over the map (view tabs; zoom / refresh; download). */
const PILL_BG = "rgba(10, 15, 41, 0.5)";
/** 0.5px inside hairline for the control pills (white at 15%). */
const PILL_HAIRLINE = "inset 0 0 0 0.5px rgba(255,255,255,0.15)";

const pillBtn: React.CSSProperties = {
  flex: 1,
  background: "rgba(255,255,255,0.08)",
  // The 0.5px hairline comes from the `mm-hairline` class (App.css), so it can
  // combine with the hover highlight. Padding is 5px + the 1px a border used to take.
  border: "none",
  color: "#fff",
  borderRadius: 6,
  padding: "6px 0",
  fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
  fontSize: 16,
  cursor: "pointer",
};

/**
 * Keyboard movement inside a list that is one Tab stop from outside (the
 * sector checkboxes, the List view's rows): the arrow keys move between its
 * items and Home / End jump to the first / last. Tab leaves the list, as the
 * convention has it.
 */
function moveWithinGroup(e: React.KeyboardEvent<HTMLElement>, itemSelector: string) {
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(itemSelector));
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  let to: number | null = null;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") to = Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowUp" ? -1 : 1)));
  else if (e.key === "Home") to = 0;
  else if (e.key === "End") to = items.length - 1;
  if (to === null) return;
  e.preventDefault();
  items[to].focus();
  items[to].scrollIntoView({ block: "nearest" });
}

function SectorPanelContent({
  sectors,
  counts,
  enabled,
  onToggle,
  onAll,
  total,
  loading,
  error,
  hoveredSector,
  onHoverSector,
  onFocusSector,
  onClose,
  sectorColorOverride,
}: SectorPanelProps & { onClose?: () => void }) {
  // The mobile drawer is the only caller that passes `onClose`, so it doubles as
  // the mobile/desktop discriminator. Sector rows read larger on the phone
  // (touch target) and tighter on desktop.
  const mobile = !!onClose;
  const rowFont = mobile ? 16 : 13;
  const rowPadV = mobile ? 8 : 6;
  const rowGap = mobile ? 8 : 4; // vertical space between rows
  const countFont = mobile ? 12 : 11;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Fixed header — Sectors title, count, and All/None stay put while the
          sector list below scrolls. */}
      <div style={{ flex: "0 0 auto" }}>
      {/* Header: title + company count. In the mobile drawer (`onClose` set) the
          grab handle + ✕ share this row instead of a separate header. */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        {onClose && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute", top: -4, left: "50%", transform: "translateX(-50%)",
              width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.22)",
            }}
          />
        )}
        <div>
          <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: 0.4 }}>Sectors</div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
            {loading ? "Loading…" : error ? "Error" : `${total} companies`}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close sectors panel"
            style={{
              flex: "0 0 auto",
              background: "rgba(255,255,255,0.10)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 8, color: "white", width: 30, height: 30,
              display: "grid", placeItems: "center", cursor: "pointer", fontSize: 14,
            }}
          >
            ✕
          </button>
        )}
      </div>
      {error && (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: "#ff9d9d",
            background: "rgba(255, 70, 70, 0.08)",
            border: "1px solid rgba(255, 70, 70, 0.25)",
            padding: 8,
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        <button onClick={() => onAll(true)} aria-label="Toggle all sectors visible" className="mm-hover mm-hairline" style={pillBtn}>All</button>
        <button onClick={() => onAll(false)} aria-label="Toggle all sectors hidden" className="mm-hover mm-hairline" style={pillBtn}>None</button>
      </div>
      </div>
      {/* Sector list — the ONLY scrolling region (header above stays fixed).
          Clear the hover only when the cursor leaves the whole list — not when
          it crosses between rows — so the map doesn't flicker. */}
      {/* Keyboard: the 17 checkboxes are not in the page's Tab order (a lap of
          the page would walk through every one). "Skip to sectors" lands on the
          first; the arrow keys and Home / End move between them; Tab leaves. */}
      <div
        id="mm-sectors"
        role="group"
        aria-label="Sectors"
        onKeyDown={(e) => moveWithinGroup(e, "[data-sector-toggle]")}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain", // don't chain the scroll to the page/map
          marginTop: 14,
          paddingBottom: "calc(4px + env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
        }}
        onMouseLeave={() => onHoverSector(null)}
      >
        {sectors.map(s => {
          const hue = hueForSector(s);
          const flat = flatStyleForSector(s);
          const labFill = sectorColorOverride?.(s) ?? null;
          const customBg = labFill ? null : (flat?.swatchBackground ?? null);
          const primary = labFill ?? flat?.fill ?? flat?.stripes?.[0] ?? null;
          const swatchBg = customBg ?? primary ?? `hsl(${hue}, 70%, 55%)`;
          const swatchBorder =
            customBg ? "none"
            : flat?.stroke && flat.stroke !== "transparent" ? `1px solid ${flat.stroke}`
            : "none";
          const swatchGlow = customBg
            ? "rgba(255,255,255,0.25)"
            : primary ? hexToRgba(primary, 0.6) : `hsla(${hue}, 80%, 60%, 0.6)`;
          // Sectors with a `glow` get a stronger, sector-tinted halo around
          // the swatch — matches the on-map effect (e.g. PSM red glow).
          const swatchBoxShadow = flat?.glow
            ? `0 0 8px 2px ${flat.glow.color}`
            : `0 0 6px ${swatchGlow}`;
          // For sectors with a contrasting stroke (e.g. AI: black fill on dark sidebar),
          // use the stroke color for the checkbox accent so the tick stays visible.
          const accent =
            (flat?.stroke && flat.stroke !== "transparent" ? flat.stroke : null)
            ?? primary ?? `hsl(${hue}, 70%, 60%)`;
          const on = enabled.has(s);
          const isHovered = hoveredSector === s;
          return (
            <div
              key={s}
              onMouseEnter={() => onHoverSector(s)}
              style={{
                display: "flex",
                alignItems: "stretch",
                gap: 0,
                // The list is a column flexbox; without this, rows default to
                // flex-shrink:1 and get COMPRESSED to fit when the content is
                // taller than the container (short phone drawer) — which ate the
                // padding and clipped the text. Keep each row at its natural
                // height and let the container scroll instead.
                flexShrink: 0,
                borderRadius: 6,
                overflow: "hidden",
                opacity: on ? 1 : 0.45,
                fontSize: rowFont,
                lineHeight: 1.1,
                marginBottom: rowGap,
                // Visible card so the row's padding reads — no outline (hover is
                // signalled by the background alone).
                background: isHovered ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                transition: "background 120ms",
              }}
            >
              {/* Checkbox half — toggles visibility; hover handled by parent row */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: `${rowPadV}px 8px`,
                  cursor: "pointer",
                  background: "transparent",
                  transition: "background 120ms",
                }}
              >
                {customBg ? (
                  <span
                    role="checkbox"
                    tabIndex={-1}
                    data-sector-toggle=""
                    aria-checked={on}
                    aria-label={`Toggle ${s}`}
                    onClick={() => onToggle(s)}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        onToggle(s);
                      }
                    }}
                    style={{
                      position: "relative",
                      width: 13,
                      height: 13,
                      // border-box keeps the visual footprint identical whether
                      // we render a border (unchecked) or not (checked), so the
                      // row height doesn't shift between states.
                      boxSizing: "border-box",
                      margin: 0,
                      borderRadius: 2,
                      // No border when checked (matches native look across the rest of the panel).
                      // A faint outline on the unchecked state keeps the box visible.
                      border: on ? "none" : "1px solid rgba(255,255,255,0.35)",
                      overflow: "hidden",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "0 0 auto",
                      verticalAlign: "middle",
                      transition: "border-color 120ms",
                    }}
                  >
                    {on && (
                      <>
                        {/* Gradient layer — blurred so the color transitions feel softer. */}
                        <span
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            inset: -2,
                            background: customBg,
                            filter: "blur(1px)",
                          }}
                        />
                        {/* Native-style check, rendered crisply on top of the blurred gradient. */}
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 16 16"
                          width={11}
                          height={11}
                          style={{ position: "relative", display: "block", overflow: "visible" }}
                        >
                          <path
                            d="M 3.5 8.5 L 6.8 11.6 L 12.5 5.4"
                            stroke="white"
                            strokeWidth={2}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </>
                    )}
                  </span>
                ) : (
                  <input
                    type="checkbox"
                    tabIndex={-1}
                    data-sector-toggle=""
                    checked={on}
                    onChange={() => onToggle(s)}
                    style={{
                      width: 13,
                      height: 13,
                      margin: 0,
                      boxSizing: "border-box",
                      verticalAlign: "middle",
                      accentColor: accent,
                      cursor: "pointer",
                    }}
                    aria-label={`Toggle ${s}`}
                  />
                )}
                {customBg ? (
                  <span
                    style={{
                      position: "relative",
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      boxShadow: `0 0 6px ${swatchGlow}`,
                      overflow: "hidden",
                      flex: "0 0 auto",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        inset: -2,
                        background: customBg,
                        filter: "blur(1px)",
                      }}
                    />
                  </span>
                ) : (
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: swatchBg,
                      border: swatchBorder,
                      boxShadow: swatchBoxShadow,
                      flex: "0 0 auto",
                    }}
                  />
                )}
              </label>
              {/* Name half — click triggers focus zoom; hover handled by parent row */}
              <div
                role="button"
                onClick={() => onFocusSector(s)}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: `${rowPadV}px 8px`,
                  cursor: "pointer",
                  background: "transparent",
                  transition: "background 120ms",
                }}
              >
                <span style={{ flex: 1 }}>{s}</span>
                <span style={{ opacity: 0.5, fontSize: countFont }}>{counts[s] ?? 0}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: 2,
  borderRadius: 6,
  lineHeight: 0,
};

function Sidebar({ open, onCollapse, ...props }: SectorPanelProps & { open: boolean; onCollapse: () => void }) {
  return (
    <aside
      style={{
        flex: `0 0 ${open ? 240 : 0}px`,
        width: open ? 240 : 0,
        height: "100vh",
        overflow: "hidden",
        // Animate the width so collapse/expand slides smoothly (the map re-fits
        // live via its ResizeObserver as this animates).
        transition: "flex-basis 320ms ease, width 320ms ease",
        borderRight: open ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
      }}
    >
      {/* Fixed-width inner so the content never reflows while the panel width
          animates — it simply clips. */}
      <div
        style={{
          width: 240,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
          background: props.panelBackground ?? "#030118",
          color: "#e6edf7",
          padding: "16px 14px",
          fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
          userSelect: "none",
        }}
      >
      {/* Brand title + collapse button — pinned at the top of the panel. */}
      <div style={{ flex: "0 0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div
            style={{
              fontSize: 26,
              fontWeight: 600, // ITC Franklin Gothic Demi — activate Demi in the Adobe Fonts kit; until then CSS rounds 600 → 700
              letterSpacing: "-0.01em", // -1%
              textTransform: "uppercase",
              lineHeight: 0.9, // 90%
            }}
          >
            Media Universe
          </div>
          <button onClick={onCollapse} aria-label="Collapse sector side panel" title="Collapse sector side panel" className="panel-icon-btn" style={iconBtnStyle}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>left_panel_close</span>
          </button>
        </div>
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.14)",
            margin: "12px 0 14px",
          }}
        />
      </div>

      {/* SectorPanelContent scrolls its own list internally (header pinned). */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <SectorPanelContent {...props} />
      </div>

      {/* Substack CTA — pinned at the bottom of the panel, full width (same
          width as the All / None pills above). The Eshap logo now lives at the
          bottom-left of the map instead. */}
      <div style={{ flex: "0 0 auto", paddingTop: 14, marginTop: 4 }}>
        <a
          href="https://eshap.substack.com/"
          target="_blank"
          rel="noreferrer"
          aria-label="Full map analysis on Substack"
          // Royal blue → white with blue text on hover (colours in App.css).
          className="mm-blue-btn"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 11px",
            borderRadius: 8,
            textDecoration: "none",
            fontSize: 15,
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          {/* Drawn as a mask so the flag takes the button's text colour on hover. */}
          <span className="mm-flag" aria-hidden style={{ width: 15, height: 17.65, flex: "0 0 auto" }} />
          <span>Full Map Analysis</span>
        </a>
      </div>
      </div>
    </aside>
  );
}

/** How the phone's bottom controls leave and return around a focused planet. */
const MOBILE_FOCUS_STEP_ASIDE = "transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms ease";

function MobileSectorTriggerBar({ onOpen, hidden = false }: { onOpen: () => void; hidden?: boolean }) {
  return (
    <div
      aria-hidden={hidden}
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        padding: "10px 12px",
        background: "rgba(7,14,32,0.95)",
        borderTop: "1px solid rgba(255,255,255,0.10)",
        boxSizing: "border-box",
        // Steps aside (slides down and fades) while a planet is in focus. It
        // keeps its place in the layout, so the map above it doesn't resize.
        transform: hidden ? "translateY(100%)" : "translateY(0)",
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : undefined,
        transition: MOBILE_FOCUS_STEP_ASIDE,
      }}
    >
      <button
        onClick={onOpen}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 10,
          color: "white",
          padding: "10px 14px",
          fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: 0.6,
          cursor: "pointer",
        }}
      >
        + Sectors
      </button>
    </div>
  );
}

function MobileSectorDrawer({
  open,
  onClose,
  ...sectorProps
}: SectorPanelProps & { open: boolean; onClose: () => void }) {
  return (
    <>
      {/* Backdrop — click anywhere outside the drawer to close */}
      <div
        onClick={onClose}
        aria-hidden={!open}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 240ms ease",
          zIndex: 50,
        }}
      />
      {/* Drawer */}
      <div
        role="dialog"
        aria-label="Sectors"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: "80dvh", // DEFINITE height (not max) so the inner height:100%
          // + list overflow chain resolves — otherwise the list can't scroll.
          display: "flex",
          flexDirection: "column",
          background: "rgba(7,14,32,0.97)",
          borderTop: "1px solid rgba(255,255,255,0.12)",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          color: "#e6edf7",
          fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
          userSelect: "none",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 280ms cubic-bezier(0.4, 0, 0.2, 1)",
          zIndex: 51,
          boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ flex: 1, minHeight: 0, padding: "14px 14px 0" }}>
          <SectorPanelContent {...sectorProps} onClose={onClose} />
        </div>
      </div>
    </>
  );
}

// Minimum data points before a company is chartable. The series is YEARLY (one
// point per year column in the sheet), so 2 = the fewest that can draw a line.
// Was 12 back when the series was monthly; left at 12 it meant "every one of the
// 12 year columns", which silently hid the chart for a third of the roster —
// anything younger than 2015 (WBD, A24, Canal+…) or with a single gap (IPG: 11/12).
const CHART_YEARS_MIN = 2;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtMonthLabel(m: string): string {
  const [y, mo] = m.split("-");
  if (!mo) return y; // yearly key "YYYY"
  return `${MONTHS_SHORT[Number(mo) - 1] ?? mo} ${y}`;
}

// "Nice" round number ≥ x (1/2/5 × 10ⁿ) — for clean axis steps.
function niceNum(x: number): number {
  if (x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / 10 ** exp;
  const nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return nf * 10 ** exp;
}
// Evenly-spaced round tick values spanning [min, max].
function niceTicks(min: number, max: number, count: number): number[] {
  const step = niceNum((max - min || max || 1) / count);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step * 0.5; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks.length >= 2 ? ticks : [min, max];
}

/** Scrubable historical market-cap line chart with year (X) + value (Y) axes. */
function HistoryChart({ series, label }: { series: { month: string; value: number }[]; label?: string }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const W = 300, H = 132;
  const M = { top: 8, right: 6, bottom: 18, left: 36 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const n = series.length;

  const values = series.map((s) => s.value);
  const yTicks = niceTicks(Math.min(...values), Math.max(...values), 3);
  const yMin = yTicks[0], yMax = yTicks[yTicks.length - 1];
  const yRange = yMax - yMin || 1;

  const xAt = (i: number) => M.left + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => M.top + (1 - (v - yMin) / yRange) * plotH;

  const path = series
    .map((s, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(s.value).toFixed(1)}`)
    .join(" ");

  // X year labels — thinned to ~5 across the span.
  const years = [...new Set(series.map((s) => s.month.slice(0, 4)))];
  const yearStep = Math.max(1, Math.ceil(years.length / 5));
  const yearTicks = years
    .filter((_, i) => i % yearStep === 0)
    .map((y) => ({ year: y, x: xAt(series.findIndex((s) => s.month.startsWith(y))) }));

  const cur = hoverIdx ?? n - 1; // default readout = latest point
  const cs = series[cur];

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * W;
    const ratio = (vbX - M.left) / plotW;
    setHoverIdx(Math.round(Math.max(0, Math.min(1, ratio)) * (n - 1)));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.6 }}>{fmtMonthLabel(cs.month)}</span>
        <span style={{ fontSize: 16, fontWeight: 500 }}>{formatValuation(cs.value)}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        // Keyboard / screen readers: a Tab stop that reads the whole series.
        role="img"
        tabIndex={0}
        aria-label={label}
        style={{ display: "block", cursor: "crosshair", overflow: "visible" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Y gridlines + value labels */}
        {yTicks.map((t, i) => (
          <g key={`y${i}`}>
            <line x1={M.left} y1={yAt(t)} x2={W - M.right} y2={yAt(t)} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
            <text x={M.left - 5} y={yAt(t) + 3} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.4)">
              {formatValuation(t)}
            </text>
          </g>
        ))}
        {/* X year labels */}
        {yearTicks.map((yt, i) => (
          <text key={`x${i}`} x={yt.x} y={H - 4} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.4)">
            {yt.year}
          </text>
        ))}
        <path d={path} fill="none" stroke="#7aa2ff" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
        <line x1={xAt(cur)} y1={M.top} x2={xAt(cur)} y2={M.top + plotH} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
        <circle cx={xAt(cur)} cy={yAt(cs.value)} r={3.5} fill="#fff" stroke="#7aa2ff" strokeWidth={1.5} />
      </svg>
    </div>
  );
}

/** Phone detail panel: gap between its scroll bar and the panel's top / bottom edge, px. */
const DETAIL_SCROLL_INSET = 12;

function PlanetDetailPanel({
  node,
  detail,
  lastUpdated,
  history,
  isPresent,
  onClose,
  mobileHeight = null,
}: {
  node: PlanetNode | null;
  detail: CompanyDetail | null;
  lastUpdated?: string;
  history: { month: string; value: number }[];
  /** True when the viewed year is the present — Vitals only show then. */
  isPresent: boolean;
  onClose: () => void;
  /**
   * Phone: the panel's height, px. It then sits across the bottom of the
   * screen (see MOBILE_DETAIL_BOTTOM) and its contents scroll inside it; null =
   * the desktop side panel.
   */
  mobileHeight?: number | null;
}) {
  const open = node !== null;
  const valuation = node?.valuation_b ?? 0;
  const mobile = mobileHeight !== null;
  const nodeName = node?.name ?? null;
  const valuationLabel = VALUATION_LABELS[detail?.valuationType ?? "market_cap"];
  // What a screen reader hears when the panel opens (focus lands on the panel):
  // name, sector, the valuation, the data source and the vitals. The chart and
  // any links are Tab stops after that.
  const summary = node
    ? [
        `${node.sector}.`,
        `${valuationLabel} ${formatValuation(valuation)}${lastUpdated ? `, updated ${formatContentDate(lastUpdated)}` : ""}.`,
        detail?.dataSource ? `Data source ${detail.dataSource}.` : "",
        isPresent && detail && detail.vitals.length > 0
          ? `Vitals: ${detail.vitals.map((v) => (v.statistic ? `${v.name} ${v.statistic}` : v.name)).join(", ")}.`
          : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";
  const historyLabel =
    history.length > 0
      ? `Historical ${valuationLabel.replace(/^Latest /, "").toLowerCase()}, ${history[0].month.slice(0, 4)} to ${history[history.length - 1].month.slice(0, 4)}: ${history
          .map((h) => `${h.month.slice(0, 4)} ${formatValuation(h.value)}`)
          .join(", ")}.`
      : undefined;

  // Keyboard: focus moves to the panel when a company opens (it reads the
  // summary above), Escape closes, and focus goes back to where it was (the
  // map, or the List row) on close.
  const panelRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const from = document.activeElement as HTMLElement | null;
    if (from && !panelRef.current?.contains(from)) returnFocusRef.current = from;
    const id = requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(id);
      const back = returnFocusRef.current;
      if (back && back.isConnected) back.focus({ preventScroll: true });
    };
  }, [open, nodeName]);

  // Phone: the panel is cropped, so it shows its own scroll bar (phones only
  // flash theirs while scrolling, and can't be styled) — the light blue of the
  // other scroll bars. `thumb` is its top and height, px, within the track.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [thumb, setThumb] = useState<{ top: number; h: number } | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!mobile || !el) return;
    el.scrollTop = 0; // a newly picked planet starts at the top
    let raf = 0;
    const measure = () => {
      raf = 0;
      const track = el.clientHeight - 2 * DETAIL_SCROLL_INSET;
      if (el.scrollHeight <= el.clientHeight + 1 || track <= 0) return setThumb(null);
      const h = Math.max(28, (el.clientHeight / el.scrollHeight) * track);
      const top = (el.scrollTop / (el.scrollHeight - el.clientHeight)) * (track - h);
      setThumb({ top, h });
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    queue();
    el.addEventListener("scroll", queue, { passive: true });
    const ro = new ResizeObserver(queue);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", queue);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mobile, nodeName, mobileHeight]);

  return (
    <aside
      ref={panelRef}
      aria-hidden={!open}
      role="region"
      tabIndex={-1}
      aria-label={node ? `${usdFlag(node.name).display} detail panel` : "Company detail panel"}
      aria-describedby="mm-detail-summary"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      data-detail-panel=""
      style={{
        position: "fixed",
        // Inset on all four sides so the panel floats — clear of the view-mode
        // toggle (top-right) above and the zoom controls (bottom-right) below,
        // with the same 16px right margin as those controls. Corner radius
        // matches the floating control groups.
        ...(mobile
          ? {
              // Phone: across the bottom, as wide as the controls row up top.
              bottom: `calc(${MOBILE_DETAIL_BOTTOM}px + env(safe-area-inset-bottom))`,
              left: MOBILE_DETAIL_SIDE,
              right: MOBILE_DETAIL_SIDE,
              height: mobileHeight ?? undefined,
            }
          : { top: 72, right: 16, bottom: 80, width: 340, maxWidth: "calc(100vw - 32px)" }),
        // Phone: a little more solid, since it lies over the bottom controls.
        background: mobile ? "rgba(7,14,32,0.97)" : "rgba(7,14,32,0.92)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 10,
        backdropFilter: "blur(6px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
        color: "#e6edf7",
        fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
        // Phone: the contents scroll in an inner box (below), so the ✕ and the
        // scroll bar stay put.
        padding: mobile ? 0 : "22px 24px",
        boxSizing: "border-box",
        overflowY: mobile ? "hidden" : "auto",
        // Fade up from a slight offset below the resting position. Smoother
        // and less directional than a slide-in from the edge.
        transform: open ? "translateY(0)" : "translateY(14px)",
        opacity: open ? 1 : 0,
        transition:
          "transform 460ms cubic-bezier(0.22, 1, 0.36, 1), opacity 380ms cubic-bezier(0.22, 1, 0.36, 1)",
        zIndex: 30,
        pointerEvents: open ? "auto" : "none",
        outline: "none",
      }}
    >
      <p id="mm-detail-summary" className="sr-only">{summary}</p>
      {node && (
        <div
          ref={scrollerRef}
          className={mobile ? "mm-hide-scrollbar" : undefined}
          style={
            mobile
              ? {
                  height: "100%",
                  overflowY: "auto",
                  padding: "22px 24px",
                  boxSizing: "border-box",
                  // Reaching either end doesn't start scrolling the page behind.
                  overscrollBehavior: "contain",
                }
              : undefined
          }
        >
         <div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close detail panel"
            style={{
              // Placed against the panel, not the scrolling box inside it — so on
              // a phone it stays in the corner while the contents scroll past.
              position: "absolute",
              top: 14,
              right: 14,
              width: mobile ? 32 : 28,
              height: mobile ? 32 : 28,
              display: "grid",
              placeItems: "center",
              // Phone: solid, as text scrolls underneath it.
              background: mobile ? "#1b2236" : "rgba(255,255,255,0.08)",
              zIndex: 1,
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 6,
              color: "white",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ✕
          </button>

          <div style={{ marginBottom: 24, paddingRight: 36 }}>
            <div style={{ fontSize: 24, fontWeight: 500, lineHeight: 1.1, marginBottom: 6 }}>
              {usdFlag(node.name).display}
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1.5, textTransform: "uppercase" }}>
              {node.sector}
            </div>
          </div>

          <PanelSection label={VALUATION_LABELS[detail?.valuationType ?? "market_cap"]}>
            <span style={{ fontSize: 26, fontWeight: 500, letterSpacing: -0.5 }}>
              {formatValuation(valuation)}
            </span>
            {lastUpdated && (
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 5 }}>
                Updated {formatContentDate(lastUpdated)}
              </div>
            )}
          </PanelSection>

          {history.length >= CHART_YEARS_MIN && (
            <PanelSection label="Historical Market Cap">
              <HistoryChart series={history} label={historyLabel} />
            </PanelSection>
          )}

          {detail?.dataSource && (
            <PanelSection label="Data Source">
              <span style={{ fontSize: 14 }}>{detail.dataSource}</span>
            </PanelSection>
          )}

          {detail?.description && (
            <PanelSection label="Eshap's Overview">
              <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0, opacity: 0.9 }}>
                {detail.description}
              </p>
            </PanelSection>
          )}

          {/* Vitals are current-state facts (users, MAU, etc.), so they only make
              sense on the present map — hide them entirely on Time Machine years. */}
          {isPresent && detail && detail.vitals.length > 0 && (
            <PanelSection label="Vitals">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {detail.vitals.map((v, i) => (
                  <div
                    key={i}
                    style={{
                      background: "rgba(255,255,255,0.07)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 7,
                      padding: "8px 11px",
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.1 }}>{v.name}</div>
                    {v.statistic && (
                      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 3 }}>{v.statistic}</div>
                    )}
                  </div>
                ))}
              </div>
            </PanelSection>
          )}

          {detail && detail.eshapContent.length > 0 && (
            <PanelSection label="Related Eshap Content">
              <ContentList
                rows={detail.eshapContent.map((c) => ({
                  title: c.title,
                  meta: c.kind,
                  date: c.published_date,
                  url: c.url,
                }))}
              />
            </PanelSection>
          )}

          {detail && detail.externalArticles.length > 0 && (
            <PanelSection label="External Articles">
              <ContentList
                rows={detail.externalArticles.map((a) => ({
                  title: a.title,
                  meta: a.source,
                  date: a.published_date,
                  url: a.url,
                }))}
              />
            </PanelSection>
          )}
         </div>
        </div>
      )}
      {mobile && open && thumb && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            right: 5,
            top: DETAIL_SCROLL_INSET + thumb.top,
            width: 4,
            height: thumb.h,
            borderRadius: 4,
            background: "#8196fe", // the other scroll bars' light blue (App.css)
            pointerEvents: "none",
          }}
        />
      )}
    </aside>
  );
}

function PanelSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22, paddingBottom: 18, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.6, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

/** Format a Sanity date ("2022-11-14") as "Nov 14, 2022" for the content lists. */
function formatContentDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

/** A list of dated, optionally-linked rows (Eshap content / external articles). */
function ContentList({
  rows,
}: {
  rows: { title: string; meta?: string; date?: string; url?: string }[];
}) {
  return (
    <div>
      {rows.map((r, i) => {
        const rowStyle: React.CSSProperties = {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          padding: "10px 0",
          borderTop: i > 0 ? "1px solid rgba(255,255,255,0.08)" : "none",
          color: "#e6edf7",
          textDecoration: "none",
        };
        const inner = (
          <>
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 500, fontSize: 13 }}>{r.title}</span>
              {r.meta && (
                <span style={{ opacity: 0.5, fontSize: 12, marginLeft: 6, textTransform: "capitalize" }}>
                  {r.meta}
                </span>
              )}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {r.date && <span style={{ opacity: 0.55, fontSize: 12 }}>{formatContentDate(r.date)}</span>}
              {r.url && <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16, lineHeight: 1, opacity: 0.7 }}>arrow_forward</span>}
            </span>
          </>
        );
        return r.url ? (
          <a key={i} href={r.url} target="_blank" rel="noreferrer" style={rowStyle}>
            {inner}
          </a>
        ) : (
          <div key={i} style={rowStyle}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function EditorToolbar({
  selectedName,
  selectedPosition,
  selectedNode,
  isDirty,
  overrideCount,
  sectorOverrideCount,
  onTogglePin,
  onClearPosition,
  onDeselect,
  onSaveClipboard,
  onSaveDownload,
  onReset,
  onSaveSectorsClipboard,
  onResetSectors,
  packingDensity,
  setPackingDensity,
  collidePadding,
  setCollidePadding,
  labelSizePx,
  setLabelSizePx,
  connectionPull,
  setConnectionPull,
  anchorDiamPreview,
  collapsed,
  onToggleCollapsed,
  connectMode,
  onToggleConnectMode,
  connectFrom,
  connections,
  selectedConnIdx,
  onSelectConnection,
  selectedConnection,
  onUpdateConnection,
  onDeleteConnection,
  connectionsDirty,
  onSaveConnectionsClipboard,
  onSaveConnectionsDownload,
  onResetConnections,
}: {
  selectedName: string | null;
  selectedPosition: PlanetPosition | null;
  selectedNode: PlanetNode | null;
  isDirty: boolean;
  overrideCount: number;
  sectorOverrideCount: number;
  onTogglePin: () => void;
  onClearPosition: () => void;
  onDeselect: () => void;
  onSaveClipboard: () => void;
  onSaveDownload: () => void;
  onReset: () => void;
  onSaveSectorsClipboard: () => void;
  onResetSectors: () => void;
  packingDensity: number;
  setPackingDensity: (v: number) => void;
  collidePadding: number;
  setCollidePadding: (v: number) => void;
  labelSizePx: number;
  setLabelSizePx: (v: number) => void;
  connectionPull: number;
  setConnectionPull: (v: number) => void;
  anchorDiamPreview: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  connectMode: boolean;
  onToggleConnectMode: () => void;
  connectFrom: string | null;
  connections: Connection[];
  selectedConnIdx: number | null;
  onSelectConnection: (idx: number) => void;
  selectedConnection: Connection | null;
  onUpdateConnection: (patch: Partial<Connection>) => void;
  onDeleteConnection: () => void;
  connectionsDirty: boolean;
  onSaveConnectionsClipboard: () => void;
  onSaveConnectionsDownload: () => void;
  onResetConnections: () => void;
}) {
  // Collapsed: render a small floating chip in the corner instead of the full
  // panel, so the map is unobstructed while you arrange planets.
  if (collapsed) {
    return (
      <button
        onClick={onToggleCollapsed}
        aria-label="Expand edit toolbar"
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(7,14,32,0.92)",
          border: "1px solid rgba(255,224,102,0.4)",
          borderRadius: 8,
          padding: "6px 10px",
          color: "#ffe066",
          fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1,
          cursor: "pointer",
          backdropFilter: "blur(6px)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
        }}
      >
        <span>✎ EDIT</span>
        {isDirty && <span style={{ color: "#ffd166", fontSize: 9 }}>●</span>}
        <span style={{ opacity: 0.5, fontSize: 10 }}>▸</span>
      </button>
    );
  }

  // Display either the override position (if set) or the planet's live physics
  // position (with a hint that it isn't pinned yet).
  const liveX = selectedNode ? Math.round(selectedNode.x) : null;
  const liveY = selectedNode ? Math.round(selectedNode.y) : null;
  const isPinned = !!selectedPosition?.pin;
  const hasOverride = !!selectedPosition;

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        zIndex: 20,
        width: 250,
        // Cap the height to the viewport and scroll internally — the panel can
        // grow tall once positions, sectors, and connections are all expanded.
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
        background: "rgba(7,14,32,0.92)",
        border: "1px solid rgba(255,224,102,0.4)",
        borderRadius: 10,
        padding: 12,
        color: "#e6edf7",
        fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
        fontSize: 12,
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, letterSpacing: 1, fontSize: 11, color: "#ffe066" }}>
          ✎ EDIT MODE
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 10, opacity: 0.7 }}>
            {isDirty ? <span style={{ color: "#ffd166" }}>● unsaved</span> : <span>saved</span>}
          </div>
          <button
            onClick={onToggleCollapsed}
            aria-label="Collapse toolbar"
            style={{
              width: 20,
              height: 20,
              display: "grid",
              placeItems: "center",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 4,
              color: "rgba(255,255,255,0.75)",
              fontSize: 11,
              padding: 0,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ▾
          </button>
        </div>
      </div>
      <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 10 }}>
        {overrideCount} position override{overrideCount === 1 ? "" : "s"}
      </div>

      {/* Layout knobs — live-tweakable sliders. Drag to see the map update. */}
      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 6,
          padding: 10,
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, letterSpacing: 1, textTransform: "uppercase" }}>
            Layout Knobs
          </span>
          <button
            onClick={() => {
              setPackingDensity(0.5);
              setCollidePadding(30);
              setLabelSizePx(10);
              setConnectionPull(0.55);
            }}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "rgba(255,255,255,0.65)",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 9,
              cursor: "pointer",
              fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
            }}
            aria-label="Reset knobs to defaults"
          >
            Reset
          </button>
        </div>
        <SliderRow
          label="Planet size (density)"
          value={packingDensity}
          min={0.10}
          max={1.20}
          step={0.05}
          onChange={setPackingDensity}
          format={(v) => v.toFixed(2)}
        />
        <SliderRow
          label="Planet gap"
          value={collidePadding}
          min={0}
          max={300}
          step={5}
          onChange={setCollidePadding}
          format={(v) => `${v}`}
        />
        <SliderRow
          label="Label size"
          value={labelSizePx}
          min={6}
          max={20}
          step={1}
          onChange={setLabelSizePx}
          format={(v) => `${v}px`}
        />
        <SliderRow
          label="Connection pull"
          value={connectionPull}
          min={0}
          max={4}
          step={0.05}
          onChange={setConnectionPull}
          format={(v) => v.toFixed(2)}
        />
        <div style={{ fontSize: 9, opacity: 0.45, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
          Apple ≈ {anchorDiamPreview.toFixed(0)} slide units
        </div>
      </div>

      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 6,
          padding: 8,
          marginBottom: 10,
        }}
      >
        {selectedName ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontWeight: 700 }}>{selectedName}</span>
              <button onClick={onDeselect} style={editorMiniBtn} aria-label="Deselect">
                ✕
              </button>
            </div>
            <div style={{ opacity: 0.7, fontSize: 11, marginBottom: 8, fontVariantNumeric: "tabular-nums" }}>
              {hasOverride
                ? <>x: {Math.round(selectedPosition!.x)}, y: {Math.round(selectedPosition!.y)}{isPinned ? " (pinned)" : " (soft)"}</>
                : <>x: {liveX}, y: {liveY} <span style={{ opacity: 0.6 }}>(no override)</span></>
              }
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={onTogglePin} style={editorBtn}>
                {isPinned ? "Unpin" : "Pin"}
              </button>
              {hasOverride && (
                <button onClick={onClearPosition} style={editorBtn}>
                  Clear
                </button>
              )}
            </div>
          </>
        ) : (
          <div style={{ opacity: 0.6, fontStyle: "italic", fontSize: 11 }}>
            Click a planet to select it.<br />Drag to reposition.
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button onClick={onSaveClipboard} style={editorBtnPrimary} disabled={!isDirty}>
          📋 Copy positions
        </button>
        <button onClick={onSaveDownload} style={editorBtn} disabled={!isDirty}>
          ⬇ Download .ts
        </button>
        <button onClick={onReset} style={editorBtnDanger} disabled={!isDirty}>
          ↺ Reset to file
        </button>
      </div>

      {/* Sector overrides — drag the yellow sector chips on the map to move
          a sector's gravity well, then copy the result here. */}
      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
          Sector positions
        </div>
        <div style={{ fontSize: 10, opacity: 0.55, marginBottom: 8, lineHeight: 1.4 }}>
          {sectorOverrideCount === 0
            ? "Drag the yellow sector chips on the map to override their default centers."
            : `${sectorOverrideCount} sector${sectorOverrideCount === 1 ? "" : "s"} overridden. Copy outputs SECTOR_CENTERS with overrides merged in.`}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            onClick={onSaveSectorsClipboard}
            style={editorBtnPrimary}
            disabled={sectorOverrideCount === 0}
          >
            📋 Copy SECTOR_CENTERS
          </button>
          <button
            onClick={onResetSectors}
            style={editorBtnDanger}
            disabled={sectorOverrideCount === 0}
          >
            ↺ Reset sectors
          </button>
        </div>
      </div>

      {/* Connections — draw lines between planets. Solid = wholly owned,
          dotted = partial / in-process acquisition. */}
      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
          Connections
        </div>
        <div style={{ fontSize: 10, opacity: 0.55, marginBottom: 8, lineHeight: 1.4 }}>
          {connectMode
            ? connectFrom
              ? `Click the second planet to connect to ${connectFrom}.`
              : "Click the first planet to start a connection."
            : `${connections.length} connection${connections.length === 1 ? "" : "s"}. Click one below (or a line on the map) to edit it.`}
        </div>
        <button
          onClick={onToggleConnectMode}
          style={connectMode ? editorBtnPrimary : editorBtn}
        >
          {connectMode ? "✕ Cancel connect" : "+ Connect planets"}
        </button>

        {/* List of existing connections — click a row to select & edit it. */}
        {connections.length > 0 && (
          <div
            style={{
              marginTop: 8,
              maxHeight: 140,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            {connections.map((c, i) => {
              const active = selectedConnIdx === i;
              return (
                <button
                  key={`${c.from}-${c.to}-${i}`}
                  onClick={() => onSelectConnection(i)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    textAlign: "left",
                    width: "100%",
                    background: active ? "rgba(255,224,102,0.18)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${active ? "rgba(255,224,102,0.55)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 5,
                    padding: "4px 6px",
                    color: active ? "#ffe066" : "#e6edf7",
                    fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                  title={c.description || `${c.from} → ${c.to}`}
                >
                  <span style={{ opacity: 0.7, flex: "0 0 auto", fontVariantNumeric: "tabular-nums" }}>
                    {c.style === "solid" ? "──" : "┄┄"}
                  </span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.from} → {c.to}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {selectedConnection && (
          <div
            style={{
              marginTop: 8,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              padding: 8,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 6 }}>
              {selectedConnection.from} → {selectedConnection.to}
            </div>
            {/* Style toggle: solid (wholly owned) vs dotted (partial / in-process). */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button
                onClick={() => onUpdateConnection({ style: "solid" })}
                style={selectedConnection.style === "solid" ? editorBtnPrimary : editorBtn}
                title="Wholly owned / closed"
              >
                ── Solid
              </button>
              <button
                onClick={() => onUpdateConnection({ style: "dotted" })}
                style={selectedConnection.style === "dotted" ? editorBtnPrimary : editorBtn}
                title="Partial / in-process acquisition"
              >
                ┄┄ Dotted
              </button>
            </div>
            <textarea
              value={selectedConnection.description}
              onChange={(e) => onUpdateConnection({ description: e.target.value })}
              placeholder="Description (shown on hover)…"
              rows={3}
              style={{
                width: "100%",
                boxSizing: "border-box",
                resize: "vertical",
                background: "rgba(0,0,0,0.25)",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 5,
                color: "#fff",
                fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
                fontSize: 11,
                padding: "5px 6px",
                marginBottom: 8,
              }}
            />
            <button onClick={onDeleteConnection} style={editorBtnDanger}>
              🗑 Delete connection
            </button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          <button
            onClick={onSaveConnectionsClipboard}
            style={editorBtnPrimary}
            disabled={!connectionsDirty}
          >
            📋 Copy connections
          </button>
          <button
            onClick={onSaveConnectionsDownload}
            style={editorBtn}
            disabled={!connectionsDirty}
          >
            ⬇ Download .ts
          </button>
          <button
            onClick={onResetConnections}
            style={editorBtnDanger}
            disabled={!connectionsDirty}
          >
            ↺ Reset connections
          </button>
        </div>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 10,
          marginBottom: 2,
          fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <span style={{ opacity: 0.75 }}>{label}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", color: "#ffe066", fontWeight: 600 }}>
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: "100%",
          accentColor: "#ffe066",
          cursor: "pointer",
          display: "block",
        }}
      />
    </div>
  );
}

const editorBtn: React.CSSProperties = {
  flex: 1,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.18)",
  color: "#fff",
  borderRadius: 5,
  padding: "5px 8px",
  fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.3,
  cursor: "pointer",
};

const editorBtnPrimary: React.CSSProperties = {
  ...editorBtn,
  background: "rgba(255,224,102,0.18)",
  borderColor: "rgba(255,224,102,0.55)",
  color: "#ffe066",
};

const editorBtnDanger: React.CSSProperties = {
  ...editorBtn,
  background: "rgba(255,80,80,0.10)",
  borderColor: "rgba(255,120,120,0.35)",
  color: "rgba(255,180,180,0.95)",
};

const editorMiniBtn: React.CSSProperties = {
  width: 18,
  height: 18,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.18)",
  color: "rgba(255,255,255,0.8)",
  borderRadius: 4,
  fontSize: 11,
  padding: 0,
  cursor: "pointer",
};


const CAROUSEL_VISIBLE_HALFWIDTH = 8; // how many slots to render on each side

// ---- Time Machine layout ----
// A depth carousel: the focused year's map sits front and centre, its
// neighbours step back behind it on both sides — each one smaller, dimmer and
// tucked closer in than the last. The numbers below are tunable live with
// ?tm=1 (a small panel in the Time Machine); the defaults are what ships.
type TmTuning = {
  /** Width of the focused map, px. */
  focusW: number;
  /** On a narrow screen the focused map is at most this share of the screen's width. */
  maxScreenShare: number;
  /**
   * Height of the maps relative to the map's own proportions: 1 = the whole
   * map, uncropped; above 1 = taller (the sides are cropped to fill); below 1 =
   * shorter (top and bottom cropped).
   */
  mapHeight: number;
  /** A jump of several years: time added per extra year, ms (one year takes 640ms). */
  jumpExtraMs: number;
  /** Size of the furthest-back maps, as a fraction of the focused one. */
  depth: number;
  /** Distance from the focused map's centre to its first neighbour's, px. */
  spread: number;
  /** How much more see-through each map is than the one in front of it (0 = all solid). */
  opacityStep: number;
  /** How much darker each map is than the one in front of it (0 = no dimming). */
  dimStep: number;
  /** The same as opacityStep, but for the year labels under the maps. */
  labelOpacityStep: number;
  /** Opening animation: how long each map takes to arrive, ms. */
  introMs: number;
  /** Opening animation: how long the Explore row and the year strip take to arrive, ms. */
  introUiMs: number;
  /** Opening animation: delay between one map and the next one out, ms. */
  introStagger: number;
  /** Opening animation: 0 = constant speed, 1 = fast start with a long, soft landing. */
  introEase: number;
  /** Opening animation: how far below its place each map starts, px (negative = above). */
  introRise: number;
  /** "Explore this map": how long the focused map takes to grow into the real map, ms. */
  exploreMs: number;
  /** Height and corner radius of the Explore button, px. */
  exploreH: number;
  exploreRadius: number;
  /** Distance between the year ticks in the strip, px. */
  tickSpread: number;
  /** Height of an ordinary tick, px. */
  tickH: number;
  /** Height of the focused year's tick, px. */
  tickActiveH: number;
  /**
   * Padding of the year strip, px: between the years and the bottom of the
   * screen, and the same again between the focused tick and the strip's top.
   */
  stripBottom: number;
  /**
   * How the planets in the year maps are drawn: 0 = outlines only (like game
   * mode), 1 = realistic (as on the map itself, stripes and all), 2 = hybrid —
   * realistic on the focused / hovered map, outlines on the rest.
   */
  planetMode: number;
  /** Outline thickness of the bigger planets in the year maps, px on the focused map. */
  strokeBigPx: number;
  /** The same, for the smaller planets. */
  strokeSmallPx: number;
};
const TM_OUTLINE = 0;
const TM_REALISTIC = 1;
const TM_HYBRID = 2;
const TM_DEFAULTS: TmTuning = {
  // Tuned by eye in the ?tm=1 panel, 2026-10-04.
  focusW: 535, maxScreenShare: 0.84, mapHeight: 1, jumpExtraMs: 110, depth: 0.38, spread: 250, opacityStep: 0.11, dimStep: 0.47, labelOpacityStep: 0.51,
  introMs: 900, introUiMs: 500, introStagger: 110, introEase: 0.9, introRise: 90,
  exploreMs: 750,
  // The mock draws every button ~1.38× the site's size (its 34px buttons are
  // ~47px there), so its 64px Explore button with 16px corners is 47px / 12px here.
  exploreH: 47, exploreRadius: 12,
  tickSpread: 63, tickH: 28, tickActiveH: 41, stripBottom: 16,
  planetMode: TM_REALISTIC, strokeBigPx: 0.85, strokeSmallPx: 0.85,
};
// How quickly size and spacing fall away with each step back.
const TM_SCALE_FALLOFF = 0.6;
const TM_SPREAD_FALLOFF = 0.66;
// Maps more than this many steps back fade out entirely, so the back of the
// stack ends cleanly instead of smearing into a pile.
const TM_VISIBLE_STEPS = 3.5;
// Moving between years: one step takes TM_SLIDE_MS; each further step of a
// longer jump adds `jumpExtraMs` (up to six steps' worth).
const TM_SLIDE_MS = 640;
// A swipe let go: the carousel keeps the finger's speed and a critically damped
// spring brings it to rest on a year. Higher = stiffer (shorter coast, quicker stop).
const TM_SWIPE_OMEGA = 0.0075; // per ms
// "Explore this map": how quickly everything except the focused map clears away.
const TM_EXPLORE_FADE_MS = 220;
// Phones get their own copy of every setting — one per phone view, since the
// two views have differently shaped maps (1:1 is square, 16:9 is the wide
// desktop map). Tune them with ?tm=1 on a phone (or a phone-width window / the
// layout lab's phone preview) and paste the result here. Two values mean
// something different on a phone:
//  - the focused map's size is `maxScreenShare` of the screen's width
//    (`focusW` isn't used), so one slider sizes it on every phone;
//  - `spread` is in px on a TM_PHONE_REF_W-wide screen and scales with the
//    screen, so the carousel keeps its proportions from phone to phone.
const TM_PHONE_REF_W = 390;
// Phone 1:1 (the default phone view). Tuned by eye in the ?tm=1 panel, 2026-10-05.
const TM_DEFAULTS_PHONE_SQUARE: TmTuning = {
  focusW: 425, maxScreenShare: 0.68, mapHeight: 0.96, jumpExtraMs: 110, depth: 0.08, spread: 115,
  opacityStep: 0.11, dimStep: 0.47, labelOpacityStep: 0.51,
  introMs: 900, introUiMs: 500, introStagger: 110, introEase: 0.9, introRise: 90,
  exploreMs: 750,
  exploreH: 47, exploreRadius: 12,
  tickSpread: 63, tickH: 28, tickActiveH: 41, stripBottom: 16,
  planetMode: TM_REALISTIC, strokeBigPx: 0.85, strokeSmallPx: 0.85,
};
// Phone 16:9: the same, with a slightly larger and taller map (the wide map is
// short at phone width). Tuned by eye, 2026-10-05.
const TM_DEFAULTS_PHONE_FULL: TmTuning = { ...TM_DEFAULTS_PHONE_SQUARE, maxScreenShare: 0.75, mapHeight: 1.08 };
/** Which set of Time Machine values is in use. */
type TmDevice = "desktop" | "square" | "full";
const TM_DEVICE_DEFAULTS: Record<TmDevice, TmTuning> = {
  desktop: TM_DEFAULTS,
  square: TM_DEFAULTS_PHONE_SQUARE,
  full: TM_DEFAULTS_PHONE_FULL,
};
const TM_DEVICE_KEYS: Record<TmDevice, string> = {
  desktop: "mm-time-machine-tuning-v1",
  square: "mm-time-machine-tuning-phone-square-v1",
  full: "mm-time-machine-tuning-phone-full-v1",
};
const TM_DEVICES = Object.keys(TM_DEVICE_DEFAULTS) as TmDevice[];

/** Opening-animation easing: blends from linear (0) to a strong ease-out (1). */
function tmIntroEasing(intensity: number): string {
  const e = Math.max(0, Math.min(1, intensity));
  const mix = (a: number, b: number) => (a + (b - a) * e).toFixed(3);
  return `cubic-bezier(${mix(1 / 3, 0.16)}, ${mix(1 / 3, 1)}, ${mix(2 / 3, 0.3)}, ${mix(2 / 3, 1)})`;
}

// Year labels — one size for the years under the maps and the years in the strip.
const TM_YEAR_PX = 11;
const TM_YEAR_FOCUS_PX = 13;
// Year strip: the tick's gap (3) + the year under it (14).
const TM_STRIP_LABEL_ROOM = 17;
/**
 * Full height of the year strip: its top border, the tallest tick and the year
 * under it, and the same padding above the tick as below the year.
 */
const tmStripHeight = (t: TmTuning) =>
  1 + t.stripBottom + Math.max(t.tickH, t.tickActiveH) + TM_STRIP_LABEL_ROOM + t.stripBottom;

/** Reads one device's saved tuning (only keys we know, only finite numbers). */
function loadTmTuning(key: string, defaults: TmTuning): TmTuning {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<TmTuning> | null;
    const out = { ...defaults };
    for (const k of Object.keys(defaults) as (keyof TmTuning)[]) {
      if (raw && typeof raw[k] === "number" && Number.isFinite(raw[k])) out[k] = raw[k] as number;
    }
    return out;
  } catch {
    return defaults;
  }
}

/**
 * Time Machine tuning for this device (desktop, or one of the two phone
 * views): the defaults, or — with ?tm=1 — live-editable values kept in this
 * browser.
 */
function useTmTuning(device: TmDevice) {
  const enabled = useMemo(() => {
    if (typeof window === "undefined") return false;
    const v = new URLSearchParams(window.location.search).get("tm");
    return v === "1" || v === "true";
  }, []);
  const [sets, setSets] = useState<Record<TmDevice, TmTuning>>(() =>
    enabled
      ? (Object.fromEntries(TM_DEVICES.map((d) => [d, loadTmTuning(TM_DEVICE_KEYS[d], TM_DEVICE_DEFAULTS[d])])) as Record<TmDevice, TmTuning>)
      : TM_DEVICE_DEFAULTS,
  );
  useEffect(() => {
    if (!enabled) return;
    try {
      for (const d of TM_DEVICES) localStorage.setItem(TM_DEVICE_KEYS[d], JSON.stringify(sets[d]));
    } catch {
      /* ignore */
    }
  }, [enabled, sets]);
  const setTuning = useCallback(
    (fn: (t: TmTuning) => TmTuning) => setSets((all) => ({ ...all, [device]: fn(all[device]) })),
    [device],
  );
  return { enabled, tuning: sets[device], setTuning, defaults: TM_DEVICE_DEFAULTS[device] };
}

// Whether the ?tm=1 panel is tucked away, and which tab it is on — kept for the
// visit, so they survive the Time Machine being closed and opened again.
let tmPanelHidden = false;
let tmPanelTab: "layout" | "planets" = "layout";

/** The ?tm=1 panel: sliders for the Time Machine's layout and its planets' look. */
function TmTuningPanel({
  tuning,
  setTuning,
  defaults,
  device,
  setName,
  onReplay,
}: {
  tuning: TmTuning;
  setTuning: (fn: (t: TmTuning) => TmTuning) => void;
  /** The shipped values for this device (what Reset goes back to). */
  defaults: TmTuning;
  /**
   * Which set is being edited, and where the panel can sit: "desktop"; "phone"
   * (a real phone-width screen — the panel shares it with the Time Machine);
   * "phone-preview" (the layout lab's phone frame, with room beside it).
   */
  device: "desktop" | "phone" | "phone-preview";
  /** Name of the set being edited, shown in the header (e.g. "Phone 1:1"). */
  setName: string;
  /** Play the opening animation again. */
  onReplay: () => void;
}) {
  const [flash, setFlash] = useState<string | null>(null);
  const [hidden, setHidden] = useState(tmPanelHidden);
  const hide = (v: boolean) => {
    tmPanelHidden = v;
    setHidden(v);
  };
  const [tab, setTab] = useState<"layout" | "planets">(tmPanelTab);
  const pickTab = (t: "layout" | "planets") => {
    tmPanelTab = t;
    setTab(t);
  };
  type Row = { key: keyof TmTuning; label: string; min: number; max: number; step: number; digits?: number; suffix?: string };
  const planetRows: Row[] = [
    { key: "strokeBigPx", label: "Bigger planet stroke", min: 0, max: 4, step: 0.05, digits: 2, suffix: "px" },
    { key: "strokeSmallPx", label: "Smaller planet stroke", min: 0, max: 4, step: 0.05, digits: 2, suffix: "px" },
  ];
  const modes: { value: number; label: string; hint: string }[] = [
    { value: TM_OUTLINE, label: "Outline", hint: "Every planet is an outline in its sector colour, as in game mode." },
    { value: TM_REALISTIC, label: "Realistic", hint: "Every planet is drawn as on the map itself, stripes included." },
    { value: TM_HYBRID, label: "Hybrid", hint: "Realistic on the focused or hovered map; outlines on the others." },
  ];
  const layoutRows: Row[] = [
    // Desktop sizes the focused map in px (capped in a narrow window); a phone
    // sizes it as a share of the screen's width — one slider there.
    ...(device === "desktop"
      ? ([
          { key: "focusW", label: "Focused map size", min: 120, max: 900, step: 5, suffix: "px" },
          { key: "maxScreenShare", label: "Max share of window width", min: 0.4, max: 1, step: 0.01, digits: 2 },
        ] as Row[])
      : ([{ key: "maxScreenShare", label: "Focused map size (share of screen)", min: 0.3, max: 1, step: 0.01, digits: 2 }] as Row[])),
    { key: "mapHeight", label: "Map height (1 = whole map)", min: 0.4, max: 2.4, step: 0.01, digits: 2, suffix: "×" },
    { key: "depth", label: "Depth (smallest map)", min: 0.05, max: 1, step: 0.01, digits: 2 },
    { key: "spread", label: "Spread", min: 40, max: 600, step: 5, suffix: "px" },
    { key: "opacityStep", label: "Opacity differential", min: 0, max: 0.9, step: 0.01, digits: 2 },
    { key: "dimStep", label: "Dim intensity", min: 0, max: 0.9, step: 0.01, digits: 2 },
    { key: "labelOpacityStep", label: "Year opacity differential", min: 0, max: 0.9, step: 0.01, digits: 2 },
    { key: "jumpExtraMs", label: "Year jump: extra time per year", min: 0, max: 400, step: 5, suffix: "ms" },
    { key: "introMs", label: "Intro duration", min: 100, max: 2500, step: 10, suffix: "ms" },
    { key: "introUiMs", label: "Intro duration: bar + Explore", min: 100, max: 2500, step: 10, suffix: "ms" },
    { key: "introStagger", label: "Intro offset", min: 0, max: 600, step: 5, suffix: "ms" },
    { key: "introEase", label: "Intro easing intensity", min: 0, max: 1, step: 0.01, digits: 2 },
    { key: "introRise", label: "Intro start height", min: -300, max: 300, step: 2, suffix: "px" },
    { key: "exploreMs", label: "Explore: grow into the map", min: 150, max: 2500, step: 10, suffix: "ms" },
    { key: "exploreH", label: "Explore button height", min: 30, max: 90, step: 1, suffix: "px" },
    { key: "exploreRadius", label: "Explore corner radius", min: 0, max: 45, step: 1, suffix: "px" },
    { key: "tickSpread", label: "Hash spread", min: 24, max: 160, step: 1, suffix: "px" },
    { key: "tickH", label: "Hash height", min: 4, max: 80, step: 1, suffix: "px" },
    { key: "tickActiveH", label: "Focused hash height", min: 8, max: 140, step: 1, suffix: "px" },
    { key: "stripBottom", label: "Timeline padding (top + bottom)", min: 0, max: 120, step: 1, suffix: "px" },
  ];
  const rows = tab === "layout" ? layoutRows : planetRows;
  const btn: React.CSSProperties = {
    background: "#1d2229", color: "#e6e9ef", border: "1px solid #2a313b", borderRadius: 7, padding: "5px 10px", font: "inherit", fontSize: 12, cursor: "pointer",
  };
  // Drawn straight into the page (not inside the Time Machine), so it can sit
  // outside the layout lab's phone frame and is never clipped by the map area.
  const font = '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif';
  const place: React.CSSProperties =
    device === "phone"
      ? { position: "fixed", top: 58, left: 8, right: 8, maxHeight: "42vh", overflowY: "auto", background: "rgba(22,26,33,0.86)" }
      : device === "phone-preview"
        ? { position: "fixed", top: 62, left: 16, width: 320, maxHeight: "calc(100vh - 80px)", overflowY: "auto", background: "#161a21" }
        : { position: "fixed", top: 62, right: 16, width: 320, maxHeight: "calc(100vh - 80px)", overflowY: "auto", background: "#161a21" };
  if (typeof document === "undefined") return null;
  if (hidden) {
    return createPortal(
      <button
        onClick={() => hide(false)}
        style={{ ...btn, position: "fixed", top: place.top, left: place.left, right: device === "phone" ? undefined : place.right, zIndex: 400, background: "#161a21", fontFamily: font }}
      >
        Show sliders
      </button>,
      document.body,
    );
  }
  return createPortal(
    <div
      style={{
        ...place, zIndex: 400, border: "1px solid #2a313b", borderRadius: 10, boxSizing: "border-box",
        padding: "12px 14px 10px", color: "#e6e9ef", fontFamily: font, fontSize: 12,
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <span style={{ flex: 1, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#8f98a6", fontWeight: 600 }}>
          Time Machine · <span style={{ color: "#a7f3d0" }}>{setName}</span>
        </span>
        <button style={{ ...btn, padding: "3px 9px", fontSize: 11 }} onClick={() => hide(true)} title="Hide the sliders">Hide</button>
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {(["layout", "planets"] as const).map((t) => (
          <button
            key={t}
            onClick={() => pickTab(t)}
            style={{
              ...btn, flex: 1, padding: "5px 0",
              background: tab === t ? "#2a313b" : "#1d2229", color: tab === t ? "#ffffff" : "#8f98a6", fontWeight: tab === t ? 600 : 400,
            }}
          >
            {t === "layout" ? "Layout" : "Planet appearance"}
          </button>
        ))}
      </div>
      {tab === "planets" && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {modes.map((m) => (
              <button
                key={m.value}
                onClick={() => setTuning((t) => ({ ...t, planetMode: m.value }))}
                style={{
                  ...btn, flex: 1, padding: "6px 0",
                  background: tuning.planetMode === m.value ? "#a7f3d0" : "#1d2229",
                  color: tuning.planetMode === m.value ? "#06281c" : "#e6e9ef",
                  border: `1px solid ${tuning.planetMode === m.value ? "#a7f3d0" : "#2a313b"}`,
                  fontWeight: tuning.planetMode === m.value ? 600 : 400,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div style={{ color: "#8f98a6", fontSize: 11, lineHeight: 1.35, marginTop: 7 }}>
            {modes.find((m) => m.value === tuning.planetMode)?.hint}
          </div>
        </div>
      )}
      {rows.map((r) => (
        <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ flex: 1, color: tuning[r.key] === defaults[r.key] ? "#8f98a6" : "#e6e9ef" }}>{r.label}</span>
          <input
            type="range" min={r.min} max={r.max} step={r.step} value={tuning[r.key]}
            onChange={(e) => setTuning((t) => ({ ...t, [r.key]: +e.target.value }))}
            style={{ flex: "0 0 110px", accentColor: "#a7f3d0" }}
          />
          <span style={{ width: 46, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {tuning[r.key].toFixed(r.digits ?? 0)}{r.suffix ?? ""}
          </span>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
        <button
          style={{ ...btn, background: "#a7f3d0", color: "#06281c", border: "1px solid #a7f3d0", fontWeight: 600 }}
          onClick={() => {
            navigator.clipboard?.writeText(JSON.stringify(tuning, null, 2)).then(() => setFlash("Copied"), () => setFlash("Copy failed"));
            window.setTimeout(() => setFlash(null), 1400);
          }}
        >
          Copy settings
        </button>
        <button style={btn} onClick={onReplay} title="Play the opening animation again">Replay intro</button>
        <button style={btn} onClick={() => setTuning(() => defaults)}>Reset</button>
        <span style={{ color: "#8f98a6", fontSize: 11 }}>{flash ?? ""}</span>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Static, non-interactive map preview used in the timeline carousel.
 * Reuses the *active* simulation's positions for visual continuity — only
 * sizes change based on each month's mocked valuations.
 */
/** Royal blue shared by the Substack CTA and the Time Machine's Explore button. */
const EXPLORE_BLUE = "#3657FD";
// The focused map's border + glow while it (or the Explore button) is hovered.
const EXPLORE_HOVER_GLOW = "#FFFFFF";
// One timing for the whole hover: the Explore button turning white and the
// focused map's border + glow turning white start and finish together.
const EXPLORE_HOVER_TRANSITION = "180ms ease";
// The slower glow used when the focus moves from one year's map to another.
const FOCUS_GLOW_MS = 600;

const noop = () => {};
function MapThumbnail({
  date,
  layout,
  canvas,
  isActive,
  isSelected,
  onClick,
  exploreHover = false,
  onExploreHoverChange,
  width,
  height,
  scale,
  labelShiftX,
  dim,
  labelDim,
  brightness,
  exploring = false,
  moving = false,
  planetMode,
  strokeBigPx,
  strokeSmallPx,
  bigThresholdB,
  mapPx,
}: {
  date: MapDate;
  /** This year's solved layout; undefined while it is still being worked out. */
  layout: YearPlanet[] | undefined;
  canvas: { x: number; y: number; w: number; h: number };
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
  /** Selected thumb only: the shared "explore" hover (this thumb OR the button). */
  exploreHover?: boolean;
  onExploreHoverChange?: (hovered: boolean) => void;
  /** Layout width of the map (the focused size); `scale` shrinks it visually. */
  width: number;
  /** Layout height of the map. Other than the map's own proportions = cropped to fill. */
  height: number;
  scale: number;
  /** Sideways nudge for the year label, to sit under the map's visible part. */
  labelShiftX: number;
  /** Opacity of the map for its place in the stack (1 = focused). */
  dim: number;
  /** Opacity of the year label for its place in the stack. */
  labelDim: number;
  /** Brightness for its place in the stack (1 = focused, lower = darker). */
  brightness: number;
  /** "Explore this map" is playing: the year label clears away. */
  exploring?: boolean;
  /** The carousel is turning: fade and dimming track it, with no easing of their own. */
  moving?: boolean;
  /** How the planets are drawn (TM_OUTLINE / TM_REALISTIC / TM_HYBRID). */
  planetMode: number;
  /** Outline thickness, px on the focused map: planets at/over the threshold, and under it. */
  strokeBigPx: number;
  strokeSmallPx: number;
  /** Valuation ($B) from which a planet counts as "bigger". */
  bigThresholdB: number;
  /** Width of the real map on screen, px — the realistic render is a miniature of it. */
  mapPx: number;
}) {
  // Local hover state — only used to surface a stroke that signals
  // clickability. It does NOT propagate up to the carousel, so hovering
  // a non-selected thumbnail no longer slides the strip.
  const [isHovered, setIsHovered] = useState(false);

  // True once this map has been the focused one for a moment. Until then its
  // glow eases in slowly (a change of focus); after that, hover changes use the
  // Explore button's quicker timing so the two finish together.
  const [hoverTimed, setHoverTimed] = useState(false);
  useEffect(() => {
    if (!isSelected) {
      const id = window.setTimeout(() => setHoverTimed(false), 0);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setHoverTimed(true), FOCUS_GLOW_MS + 50);
    return () => window.clearTimeout(id);
  }, [isSelected]);

  // The planets, as one or two layers. Built once per layout / setting (not per
  // frame of the carousel sliding), since a map is ~170 planets.
  // Screen px per slide unit in this thumbnail (it fills its box, cropping if
  // the box isn't the map's shape).
  const pxPerSu = Math.max(width / canvas.w, height / canvas.h);
  const realOn = planetMode === TM_REALISTIC || (planetMode === TM_HYBRID && (isSelected || isHovered));
  const wantOutline = planetMode !== TM_REALISTIC;
  const wantReal = planetMode !== TM_OUTLINE;
  const outlineLayer = useMemo(() => {
    if (!wantOutline || !layout) return null;
    const suPerPx = 1 / pxPerSu;
    return layout.map((p) => {
      // Text-only entities have no circle; sub-pixel planets are skipped.
      if (p.isEntity || p.r < 2) return null;
      return (
        <circle
          key={p.name}
          cx={p.x}
          cy={p.y}
          r={p.r}
          fill="none"
          stroke={ghostColorFor(p as unknown as PlanetNode)}
          strokeWidth={(p.valuation_b >= bigThresholdB ? strokeBigPx : strokeSmallPx) * suPerPx}
        />
      );
    });
  }, [wantOutline, layout, pxPerSu, bigThresholdB, strokeBigPx, strokeSmallPx]);
  const realLayer = useMemo(() => {
    if (!wantReal || !layout) return null;
    // Pixel-sized details (glow, stripe hairlines) are scaled as if this were the
    // real map shrunk to thumbnail size; the outline thickness is the slider's.
    const mini = mapPx / (canvas.w * pxPerSu);
    return layout.map((p) => {
      if (p.isEntity || p.r < 2) return null;
      const strokeWidthPx = (p.valuation_b >= bigThresholdB ? strokeBigPx : strokeSmallPx) * mini;
      const node = {
        ...p, targetR: p.r, targetX: p.x, targetY: p.y, pinned: false, style: { ...(p.style ?? {}), strokeWidthPx },
      } as PlanetNode;
      return (
        <Planet
          key={p.name}
          part="body"
          idPrefix={`tm${date.year}-`}
          node={node}
          slideUnitsPerPx={canvas.w / mapPx}
          isHovered={false}
          onHoverChange={noop}
          onClick={noop}
          dimmed={false}
        />
      );
    });
  }, [wantReal, layout, canvas.w, pxPerSu, mapPx, bigThresholdB, strokeBigPx, strokeSmallPx, date.year]);

  // The map box is laid out at the focused size and shrunk with a transform;
  // the label rides up under the shrunken map's bottom edge.
  const boxH = height;
  const labelLift = -(boxH * (1 - scale)) / 2;

  // Border priority: selected (strongest) > hovered (signals clickability) >
  // active > default. Hover only kicks in when the thumb isn't already selected.
  const border = isSelected
    ? `2px solid ${exploreHover ? EXPLORE_HOVER_GLOW : "rgba(180, 200, 255, 0.9)"}`
    : isHovered
      ? "2px solid rgba(255,255,255,0.7)"
      : isActive
        ? "2px solid rgba(120, 160, 255, 0.55)"
        : "1px solid rgba(255,255,255,0.12)";

  return (
    <button
      onClick={onClick}
      // Mouse / touch only: the keyboard turns the carousel with the arrow
      // buttons and the year hashes, so the maps are not Tab stops.
      tabIndex={-1}
      aria-hidden
      aria-label={isSelected ? `Explore the ${formatDate(date)} map` : `Show ${formatDate(date)}`}
      onMouseEnter={() => { setIsHovered(true); if (isSelected) onExploreHoverChange?.(true); }}
      onMouseLeave={() => { setIsHovered(false); if (isSelected) onExploreHoverChange?.(false); }}
      style={{
        flex: "0 0 auto",
        width,
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        // The button's own box is the full focused size; only the (scaled) map
        // and its label take the pointer, so a small map at the back doesn't
        // catch clicks meant for the ones around it.
        pointerEvents: "none",
      }}
    >
      <div
        // The focused map is what "Explore this map" grows into the real one.
        data-tm-focus-map={isSelected ? "" : undefined}
        style={{
          width: "100%",
          height,
          boxSizing: "border-box",
          transform: `scale(${scale})`,
          transformOrigin: "center",
          // A map further back is more see-through; hovering one lifts it a little.
          opacity: Math.min(1, dim * (isHovered ? 1.35 : 1)),
          // Darker the further back; hovering a map at the back lifts it part-way.
          filter: `brightness(${isHovered ? Math.min(1, brightness + (1 - brightness) * 0.5) : brightness})`,
          pointerEvents: "auto",
          background:
            "radial-gradient(ellipse at 30% 30%, #0f2a52 0%, #04102a 60%, #00050f 100%)",
          borderRadius: 10,
          border,
          // The focused map keeps its pale-blue glow; it turns white while it
          // or the Explore button is hovered.
          boxShadow: isSelected
            ? exploreHover
              ? `0 0 40px ${hexToRgba(EXPLORE_HOVER_GLOW, 0.85)}`
              : "0 0 32px rgba(120, 160, 255, 0.45)"
            : isActive
              ? "0 0 16px rgba(80, 120, 200, 0.25)"
              : "none",
          overflow: "hidden",
          // Hover (only once this map has settled as the focused one) uses the
          // same timing as the Explore button; a change of focus keeps the
          // slower glow.
          transition:
            (hoverTimed
              ? `border-color ${EXPLORE_HOVER_TRANSITION}, box-shadow ${EXPLORE_HOVER_TRANSITION}`
              : `border-color 200ms ease, box-shadow ${FOCUS_GLOW_MS}ms cubic-bezier(0.65, 0, 0.35, 1)`) +
            // Size and place follow the carousel frame by frame (no easing of
            // their own); only the hover lift is eased — and not while the
            // carousel turns, where an eased fade would trail a step behind.
            (moving ? "" : ", filter 200ms ease, opacity 200ms ease"),
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`${canvas.x} ${canvas.y} ${canvas.w} ${canvas.h}`}
          // Fills the box; identical to "meet" when the box has the map's shape.
          preserveAspectRatio="xMidYMid slice"
        >
          {/* The planets fade in once this year's layout has been solved. They
              never take the pointer — the whole map is one button. */}
          <g style={{ opacity: layout ? 1 : 0, transition: "opacity 320ms ease", pointerEvents: "none" }}>
            {outlineLayer && (
              <g style={{ opacity: wantReal && realOn ? 0 : 1, transition: "opacity 320ms ease" }}>{outlineLayer}</g>
            )}
            {realLayer && (
              <g style={{ opacity: realOn ? 1 : 0, transition: "opacity 320ms ease" }}>{realLayer}</g>
            )}
          </g>
        </svg>
      </div>
      <div
        style={{
          fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
          fontSize: isSelected ? TM_YEAR_FOCUS_PX : TM_YEAR_PX,
          fontWeight: isSelected ? 700 : isActive ? 600 : 500,
          color: isSelected
            ? "rgba(255,255,255,0.95)"
            : isActive
              ? "rgba(220, 230, 255, 0.85)"
              : "rgba(255,255,255,0.55)",
          letterSpacing: 1,
          transform: `translate(${labelShiftX}px, ${labelLift}px)`,
          // The years fade with distance on their own setting, separate from the maps.
          opacity: exploring ? 0 : Math.min(1, labelDim * (isHovered ? 1.35 : 1)),
          pointerEvents: "auto",
          transition: `color 220ms ease, font-size 220ms ease${moving ? "" : ", opacity 200ms ease"}`,
        }}
      >
        {formatDate(date)}
      </div>
    </button>
  );
}

function Carousel({
  dates,
  position,
  animate,
  canvas,
  onSelect,
  onSettle,
  onExplore,
  tuning,
  bigThresholdB,
  exploring,
  phone,
}: {
  dates: MapDate[];
  /** Fractional index into `dates` — where the carousel is headed. */
  position: number;
  /** Ease the transforms (clicks/snap) vs. track the scroll 1:1 (wheel scrub). */
  animate: boolean;
  canvas: { x: number; y: number; w: number; h: number };
  onSelect: (d: MapDate) => void;
  /** A drag / swipe ended: settle on this year (index into `dates`). */
  onSettle: (index: number) => void;
  /** Open the focused map — or the given one, when a swipe is still coasting to it. */
  onExplore: (d?: MapDate) => void;
  tuning: TmTuning;
  /** Valuation ($B) from which a planet counts as "bigger" (its own stroke slider). */
  bigThresholdB: number;
  /** "Explore this map" is playing: everything but the focused map clears away. */
  exploring: boolean;
  /** Phone layout: the map is sized from the screen's width (see TM_PHONE_REF_W). */
  phone: boolean;
}) {
  // Nearest whole year — the focused map + the centre of the render window.
  const selectedIdx = Math.max(0, Math.min(dates.length - 1, Math.round(position)));
  // Where the carousel is DRAWN. A wheel scrub (`animate` off) is followed 1:1.
  // A jump — an arrow, a click, a hash mark — is travelled: the drawn position
  // glides to the target, so every map on the way swings through the centre
  // (growing, coming forward, falling back) however far the jump is. (Easing
  // each map straight to its new slot instead made far jumps slide flat across
  // each other and pop in front / behind.)
  const [glide, setGlide] = useState(position);
  // Keep the glide value on the wheel's position while scrubbing, so a jump or
  // the snap that follows starts from what is on screen.
  if (!animate && glide !== position) setGlide(position);
  // Dragging / swiping sideways turns the carousel by hand: `drag` is how far
  // (in years) the finger has pulled it from where it was, 1:1.
  const [drag, setDrag] = useState<number | null>(null);
  // A swipe let go coasts to rest on a year HERE, inside the carousel; the rest
  // of the page hears of the new year only once it lands (`onSettle`). Telling
  // it at the moment of release re-rendered the whole map before the coast
  // could start — a visible freeze on a phone. `base` is the year the page was
  // on; if that changes under the coast (an arrow, the strip) the coast is over.
  const [settle, setSettle] = useState<{ target: number; base: number } | null>(null);
  if (settle && settle.base !== position) setSettle(null);
  const settleTarget = settle && settle.base === position ? settle.target : null;
  const shown = Math.max(0, Math.min(dates.length - 1, (animate ? glide : position) + (drag ?? 0)));
  const shownRef = useRef(position);
  // The frame request of whatever is moving the carousel (a jump's tween or a
  // swipe's coast) — one at a time.
  const glideRafRef = useRef(0);
  const jumpExtraMs = tuning.jumpExtraMs;
  useEffect(() => {
    if (!animate) {
      shownRef.current = position;
      return;
    }
    const from = shownRef.current;
    const dist = Math.abs(position - from);
    if (dist < 0.0005) return;
    // One step takes the usual slide time; further jumps take a little longer.
    const ms = TM_SLIDE_MS + Math.min(6, Math.max(0, dist - 1)) * jumpExtraMs;
    const t0 = performance.now();
    const tick = (now: number) => {
      const u = Math.max(0, Math.min(1, (now - t0) / ms));
      const k = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; // ease in-out (cubic)
      const v = u >= 1 ? position : from + (position - from) * k;
      shownRef.current = v;
      setGlide(v);
      if (u < 1) glideRafRef.current = requestAnimationFrame(tick);
    };
    glideRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(glideRafRef.current);
    // The jump's length is fixed when it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, animate]);
  const onSettleRef = useRef(onSettle);
  useEffect(() => {
    onSettleRef.current = onSettle;
  });
  // The coast after a swipe: x(t) = target + (A + B·t)·e^(−ωt) — it leaves at
  // the finger's speed (`v0`, years/ms) and eases onto the year, with no
  // stop-and-restart. Only the carousel re-renders while it runs.
  const coastTo = (from: number, target: number, v0: number) => {
    cancelAnimationFrame(glideRafRef.current);
    setSettle({ target, base: position });
    const A = from - target;
    // At either end of the years there is nowhere to overshoot to: arrive no
    // faster than the spring can absorb, rather than running into the end.
    const atEnd = target <= 0 || target >= dates.length - 1;
    const vMax = TM_SWIPE_OMEGA * Math.abs(A);
    const v = atEnd ? Math.max(-vMax, Math.min(vMax, v0)) : v0;
    const B = v + TM_SWIPE_OMEGA * A;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.max(0, now - t0);
      const e = Math.exp(-TM_SWIPE_OMEGA * t);
      let v = target + (A + B * t) * e;
      const speed = Math.abs((B - TM_SWIPE_OMEGA * (A + B * t)) * e);
      // At rest to the eye (well under a pixel off, barely moving): land.
      const done = t > 1600 || (Math.abs(v - target) < 0.004 && speed < 0.00003);
      if (done) v = target;
      shownRef.current = v;
      setGlide(v);
      if (done) {
        setSettle(null);
        onSettleRef.current(target);
      } else glideRafRef.current = requestAnimationFrame(tick);
    };
    glideRafRef.current = requestAnimationFrame(tick);
  };
  /** Cut a coast short: land on its year now (something needs the year settled). */
  const landNow = (target: number) => {
    cancelAnimationFrame(glideRafRef.current);
    shownRef.current = target;
    setGlide(target);
    setSettle(null);
    onSettle(target);
  };
  // While a finger turns the carousel the focus (glow, bold year) rides on
  // whichever map is in front, rather than sticking to the year it started on.
  // After it is let go, the focus goes to the year it is coasting to.
  const frontIdx = drag !== null ? Math.round(shown) : (settleTarget ?? selectedIdx);
  const activeIdx = frontIdx;
  // In motion: the maps' fade and dimming follow frame by frame (see MapThumbnail).
  const moving = drag !== null || !animate || settleTarget !== null || Math.abs(shown - position) > 0.002;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState(0);
  const [exploreHover, setExploreHover] = useState(false);
  // Each year's solved layout, by year (missing while still being solved).
  const layouts = useSolvedYears();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerW(el.getBoundingClientRect().width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Opening animation: when the Time Machine opens, the focused map arrives
  // first and the others follow outward, one beat apart. Only on open — maps
  // that mount later (stepping through years) just appear in place.
  const [entering, setEntering] = useState(true);
  const introTotal = Math.max(tuning.introMs, tuning.introUiMs) + tuning.introStagger * (TM_VISIBLE_STEPS + 1) + 80;
  useEffect(() => {
    const id = window.setTimeout(() => setEntering(false), introTotal);
    return () => window.clearTimeout(id);
    // Timed once per opening (a replay remounts the carousel).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const introStyle = (stepsOut: number, ms = tuning.introMs): React.CSSProperties | undefined =>
    entering
      ? ({
          animation: `tm-in ${ms}ms ${tmIntroEasing(tuning.introEase)} ${Math.round(stepsOut * tuning.introStagger)}ms both`,
          // How far below its place the map starts (read by the tm-in keyframes).
          "--tm-rise": `${tuning.introRise}px`,
        } as React.CSSProperties)
      : undefined;

  // Track the previous selected index. During a slide, render all the slots
  // the carousel passes through so it never goes blank mid-transition.
  // (Keyed on the map in front, so a long swipe keeps its far side mounted too.)
  const prevSelectedIdxRef = useRef(selectedIdx);
  const [renderRange, setRenderRange] = useState({
    minIdx: Math.max(0, selectedIdx - CAROUSEL_VISIBLE_HALFWIDTH),
    maxIdx: Math.min(dates.length - 1, selectedIdx + CAROUSEL_VISIBLE_HALFWIDTH),
  });

  useEffect(() => {
    const prev = prevSelectedIdxRef.current;
    const target = frontIdx;
    prevSelectedIdxRef.current = target;
    // Union the previous + target windows so the entire transition path stays mounted.
    const unionMin = Math.max(0, Math.min(prev, target) - CAROUSEL_VISIBLE_HALFWIDTH);
    const unionMax = Math.min(
      dates.length - 1,
      Math.max(prev, target) + CAROUSEL_VISIBLE_HALFWIDTH,
    );
    setRenderRange({ minIdx: unionMin, maxIdx: unionMax });
    // After the slide finishes, contract back to a narrow window around target.
    const TRANSITION_MS = 920;
    const timer = window.setTimeout(() => {
      setRenderRange({
        minIdx: Math.max(0, target - CAROUSEL_VISIBLE_HALFWIDTH),
        maxIdx: Math.min(dates.length - 1, target + CAROUSEL_VISIBLE_HALFWIDTH),
      });
    }, TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [frontIdx, dates.length]);

  const slots: number[] = [];
  for (let i = renderRange.minIdx; i <= renderRange.maxIdx; i++) slots.push(i);

  // Desktop: the focused map is `focusW` wide; in a narrow window it shrinks to
  // fit, and the spread with it. Phone: its width is a share of the screen and
  // the spread scales with the screen (see TM_PHONE_REF_W).
  const fit = containerW > 0 ? Math.min(1, (containerW * tuning.maxScreenShare) / tuning.focusW) : 1;
  const screenW = containerW || TM_PHONE_REF_W;
  const focusW = phone ? screenW * tuning.maxScreenShare : tuning.focusW * fit;
  const spread = phone ? tuning.spread * (screenW / TM_PHONE_REF_W) : tuning.spread * fit;
  const focusH = (focusW / (canvas.w / canvas.h)) * tuning.mapHeight;
  // The map, its label and the Explore row are centred as one group.
  const LABEL_SPACE = 30; // label + its gap under the map
  const ROW_GAP = 22; // label → Explore row
  const groupH = focusH + LABEL_SPACE + ROW_GAP + tuning.exploreH;
  const mapCenterY = `calc(50% - ${(groupH - focusH) / 2}px)`;
  const exploreTop = `calc(50% - ${(groupH - focusH) / 2}px + ${focusH / 2 + LABEL_SPACE + ROW_GAP}px)`;

  // Where a map sits `o` steps from the focus: its size and sideways offset.
  // Each step sideways is shorter than the last, so the stack bunches up toward
  // the back instead of marching off-screen.
  const place = (o: number) => {
    const steps = Math.abs(o);
    return {
      scale: tuning.depth + (1 - tuning.depth) * Math.pow(TM_SCALE_FALLOFF, steps),
      x: Math.sign(o) * spread * ((1 - Math.pow(TM_SPREAD_FALLOFF, steps)) / (1 - TM_SPREAD_FALLOFF)),
    };
  };

  // ---- Drag / swipe sideways (mouse or touch) ----
  // One year per `spread` px of travel, the distance between the focused map
  // and its neighbour. A press that doesn't travel is still a click.
  const dragRef = useRef<{ id: number; x0: number; moved: boolean; lastX: number; lastT: number; v: number } | null>(null);
  const draggedRef = useRef(false); // true through the click that ends a drag, to swallow it
  const stepPx = Math.max(40, spread);
  const onPointerDown = (e: React.PointerEvent) => {
    if (exploring || (e.pointerType === "mouse" && e.button !== 0)) return;
    dragRef.current = { id: e.pointerId, x0: e.clientX, moved: false, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.id) return;
    let dx = e.clientX - d.x0;
    if (!d.moved) {
      if (Math.abs(dx) < 6) return;
      d.moved = true;
      draggedRef.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      // Caught mid-glide: it stops where it is and follows the finger from there.
      cancelAnimationFrame(glideRafRef.current);
      // Measure the pull from here, so the carousel doesn't jump by the 6px
      // it took to tell a drag from a tap.
      d.x0 = e.clientX;
      dx = 0;
    }
    // Finger speed (px/ms), lightly smoothed, for the flick at the end.
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = d.v * 0.6 + ((e.clientX - d.lastX) / dt) * 0.4;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    setDrag(-dx / stepPx); // pull left → later years
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.id) return;
    dragRef.current = null;
    if (!d.moved) return;
    // Let go: the carousel keeps the finger's speed, slows, and comes to rest on
    // a year — the one it would coast to (see TM_SWIPE_OMEGA).
    const now = shown;
    const stale = e.timeStamp - d.lastT > 120; // paused before lifting → no flick
    const v0 = stale ? 0 : Math.max(-0.03, Math.min(0.03, -d.v / stepPx)); // years/ms
    const coast = Math.max(-5, Math.min(5, v0 / TM_SWIPE_OMEGA));
    const target = Math.max(0, Math.min(dates.length - 1, Math.round(now + coast)));
    shownRef.current = now;
    setGlide(now);
    setDrag(null);
    if (animate) coastTo(now, target, v0);
    else onSettle(target);
    // The click that follows this pointerup belongs to the drag, not to a map.
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 0);
  };
  // Explore pressed while a swipe is still coasting: land first, and open the
  // year it was heading for.
  const explore = () => {
    if (settleTarget === null) return onExplore();
    landNow(settleTarget);
    onExplore(dates[settleTarget]);
  };

  // Keyboard: the arrows are the first thing to focus when the Time Machine opens.
  const prevBtnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => prevBtnRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, []);
  const canPrev = frontIdx > 0;
  const canNext = frontIdx < dates.length - 1;
  const stepBtn = (enabled: boolean): React.CSSProperties => ({
    ...arrowBtnStyle(enabled),
    width: 34,
    height: 34,
    borderRadius: 8,
  });

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      style={{
        flex: 1,
        position: "relative",
        // Sideways drags turn the carousel, so the browser must not claim them.
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        cursor: drag !== null ? "grabbing" : undefined,
        // Clipped to the carousel — except while the focused map grows into the
        // real map, which reaches past it (the Time Machine's own edge clips then).
        overflow: exploring ? "visible" : "hidden",
        // Its own stacking context: the maps' z-order stays inside the carousel
        // and can't climb over the controls around it.
        zIndex: 0,
      }}
    >
      {slots.map((i) => {
        const d = dates[i];
        const isSelected = i === frontIdx;
        const isActive = i === activeIdx;
        // Steps back from the focus (fractional while scrubbing).
        const o = i - shown;
        const steps = Math.abs(o);
        const { scale, x } = place(o);
        // The year label sits under the part of the map you can actually see.
        // A map at the back is partly covered by the one in front of it, so
        // its label moves out to the middle of the exposed strip instead of
        // staying centred (where it would be hidden behind that map).
        let labelShiftX = 0;
        const j = i + (o < 0 ? 1 : -1); // the map in front of this one
        if (steps > 0 && j >= 0 && j < dates.length) {
          const front = place(o + (o < 0 ? 1 : -1));
          const half = (focusW * scale) / 2;
          const frontHalf = (focusW * front.scale) / 2;
          const stripMid =
            o < 0
              ? (x - half + Math.min(x + half, front.x - frontHalf)) / 2
              : (x + half + Math.max(x - half, front.x + frontHalf)) / 2;
          // Eases in over the first step, so the focused map's label stays put.
          labelShiftX = (stripMid - x) * Math.min(1, steps);
        }
        // Each step back is a little more see-through and a little darker.
        const farFade = Math.max(0, Math.min(1, TM_VISIBLE_STEPS + 0.5 - steps));
        const dim = Math.pow(1 - tuning.opacityStep, steps) * farFade;
        const labelDim = Math.pow(1 - tuning.labelOpacityStep, steps) * farFade;
        const brightness = Math.pow(1 - tuning.dimStep, steps);
        return (
          <div
            key={`${d.year}-${d.month}`}
            style={{
              position: "absolute",
              left: "50%",
              top: mapCenterY,
              // Centred on the MAP (not the map + label), then moved sideways.
              transform: `translate(-50%, ${-focusH / 2}px) translateX(${x}px)`,
              zIndex: 100 - Math.round(steps * 10),
              transition: `opacity ${TM_EXPLORE_FADE_MS}ms ease`,
              opacity: exploring && !isSelected ? 0 : 1,
              pointerEvents: "none",
              visibility: dim <= 0.001 ? "hidden" : "visible",
            }}
          >
            <div className="tm-enter" style={introStyle(steps)}>
            <MapThumbnail
              date={d}
              layout={layouts[d.year]}
              canvas={canvas}
              isActive={isActive}
              isSelected={isSelected}
              // The focused map opens it (same as Explore); a neighbour only
              // comes into focus.
              onClick={() => {
                if (draggedRef.current) return; // the click a drag ends with
                if (isSelected) explore();
                else onSelect(d);
              }}
              exploreHover={isSelected && exploreHover}
              onExploreHoverChange={setExploreHover}
              width={focusW}
              height={focusH}
              scale={scale}
              labelShiftX={labelShiftX}
              dim={dim}
              labelDim={labelDim}
              brightness={brightness}
              exploring={exploring}
              moving={moving}
              planetMode={tuning.planetMode}
              strokeBigPx={tuning.strokeBigPx}
              strokeSmallPx={tuning.strokeSmallPx}
              bigThresholdB={bigThresholdB}
              // The Time Machine fills the map's area, so its width is the map's.
              mapPx={containerW || 1100}
            />
            </div>
          </div>
        );
      })}

      {/* Step back · Explore · step forward — one row under the focused map.
          It arrives with the first neighbours. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: exploreTop,
          transform: "translateX(-50%)",
          opacity: exploring ? 0 : 1,
          transition: `opacity ${TM_EXPLORE_FADE_MS}ms ease`,
          zIndex: 200,
        }}
      >
      <div className="tm-enter" style={{ display: "flex", alignItems: "center", gap: 12, ...introStyle(1, tuning.introUiMs) }}>
        <button
          ref={prevBtnRef}
          aria-label="Previous year"
          className="tm-btn"
          onClick={() => canPrev && onSelect(dates[frontIdx - 1])}
          disabled={!canPrev}
          style={stepBtn(canPrev)}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>arrow_back</span>
        </button>
        {/* "Explore this map" — loads the map at the focused year and closes
            the Time Machine. */}
        <button
          aria-label="Explore the map at this view"
          onClick={explore}
          onMouseEnter={() => setExploreHover(true)}
          onMouseLeave={() => setExploreHover(false)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: tuning.exploreH,
            boxSizing: "border-box",
            padding: "0 24px",
            borderRadius: tuning.exploreRadius,
            // Royal blue (the Substack CTA's colour); hovering it OR the focused
            // map turns it white with navy text.
            background: exploreHover ? EXPLORE_HOVER_GLOW : EXPLORE_BLUE,
            border: `1px solid ${exploreHover ? EXPLORE_HOVER_GLOW : EXPLORE_BLUE}`,
            color: exploreHover ? "#18266E" : "#ffffff",
            fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: 1,
            whiteSpace: "nowrap",
            cursor: "pointer",
            transition: `background ${EXPLORE_HOVER_TRANSITION}, color ${EXPLORE_HOVER_TRANSITION}, border-color ${EXPLORE_HOVER_TRANSITION}`,
          }}
        >
          EXPLORE THIS MAP
        </button>
        <button
          aria-label="Next year"
          className="tm-btn"
          onClick={() => canNext && onSelect(dates[frontIdx + 1])}
          disabled={!canNext}
          style={stepBtn(canNext)}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>arrow_forward</span>
        </button>
      </div>
      </div>
    </div>
  );
}

function TimelineStrip({
  dates,
  activeDate,
  hoveredDate,
  onSelect,
  onHover,
  tuning,
  exploring,
}: {
  dates: MapDate[];
  activeDate: MapDate;
  hoveredDate: MapDate | null;
  onSelect: (d: MapDate) => void;
  onHover: (d: MapDate | null) => void;
  tuning: TmTuning;
  /** "Explore this map" is playing: the strip clears away. */
  exploring: boolean;
}) {
  // Room for the tallest tick + the year under it.
  const stripH = tmStripHeight(tuning);
  const tickBoxH = Math.max(tuning.tickH, tuning.tickActiveH) + TM_STRIP_LABEL_ROOM;
  const stripRef = useRef<HTMLDivElement | null>(null);
  // Opening animation: the whole strip slides up from below the screen's edge
  // as it fades in, on the same clock as the focused map. Only on open.
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setEntering(false), tuning.introUiMs + 80);
    return () => window.clearTimeout(id);
    // Timed once per opening (a replay remounts the strip).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Scroll the active month into view when it changes.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(
      `[data-date="${activeDate.year}-${activeDate.month}"]`,
    );
    const strip = stripRef.current;
    if (el && strip) {
      // Scroll the strip itself, sideways only. (scrollIntoView would also
      // scroll the Time Machine around it while the strip is sliding in.)
      strip.scrollTo({ left: el.offsetLeft + el.offsetWidth / 2 - strip.clientWidth / 2, behavior: "smooth" });
    }
  }, [activeDate]);

  return (
    <div
      ref={stripRef}
      className="tm-enter"
      onMouseLeave={() => onHover(null)}
      style={{
        opacity: exploring ? 0 : 1,
        transition: `opacity ${TM_EXPLORE_FADE_MS}ms ease`,
        animation: entering && !exploring ? `tm-strip-in ${tuning.introUiMs}ms ${tmIntroEasing(tuning.introEase)} both` : undefined,
        height: stripH,
        flex: `0 0 ${stripH}px`,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "flex-end",
        // Center the ticks in the strip; `safe` falls back to left-aligned +
        // scrollable if they ever get wider than the container.
        justifyContent: "safe center",
        gap: 0,
        padding: `0 16px ${tuning.stripBottom}px`,
        overflowX: "auto",
        background: "rgba(7,14,32,0.85)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {dates.map(d => {
        const active = sameDate(d, activeDate);
        const isHovered = hoveredDate !== null && sameDate(d, hoveredDate);
        return (
          <button
            key={`${d.year}-${d.month}`}
            data-date={`${d.year}-${d.month}`}
            aria-label={`${d.year} media map`}
            aria-current={isActive ? "true" : undefined}
            onClick={() => onSelect(d)}
            onMouseEnter={() => onHover(d)}
            title={formatDate(d)}
            style={{
              flex: "0 0 auto",
              width: tuning.tickSpread,
              height: tickBoxH,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 3,
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: isHovered || active ? "white" : "rgba(255,255,255,0.55)",
              fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
              fontSize: active ? TM_YEAR_FOCUS_PX : TM_YEAR_PX,
              letterSpacing: 1,
              position: "relative",
            }}
          >
            <span
              style={{
                width: isHovered ? 3 : active ? 3 : 2,
                // The focused year's tick stands tall; a hovered one rises
                // part-way toward it.
                height: active ? tuning.tickActiveH : isHovered ? (tuning.tickH + tuning.tickActiveH) / 2 : tuning.tickH,
                background: isHovered || active ? "white" : "rgba(255,255,255,0.4)",
                borderRadius: 1,
                transition: "height 140ms ease, width 140ms ease, background 140ms ease",
              }}
            />
            {/* Every tick is a year now. Show the year always; on hover reveal the
                full label (the present year adds its month, e.g. "JUL 2026"). */}
            <span
              style={{
                height: 14,
                lineHeight: "14px",
                whiteSpace: "nowrap",
                fontWeight: isHovered || active ? 700 : 500,
                color: isHovered ? "white" : undefined,
                transition: "opacity 140ms ease",
              }}
            >
              {isHovered ? formatDate(d) : d.year}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---- List view (sortable company table) ----

type ListSortKey = "company" | "sector" | "valuation" | "ath" | "atl";
type ListSort = { key: ListSortKey; dir: "asc" | "desc" };

type ListRow = {
  name: string;
  sector: string;
  valuation: number;
  ath: number;
  athDate: MapDate;
  atl: number;
  atlDate: MapDate;
};

// CSS `background` for a sector's indicator dot — mirrors the sidebar swatch:
// custom gradient if set, else the flat/first-stripe color, else the hue.
function sectorDotBackground(sector: string): string {
  const flat = flatStyleForSector(sector);
  const customBg = flat?.swatchBackground ?? null;
  const primary = flat?.fill ?? flat?.stripes?.[0] ?? null;
  return customBg ?? primary ?? `hsl(${hueForSector(sector)}, 70%, 55%)`;
}

// Phone: the frozen Company column's width, px (it was as wide as the longest
// name on one line, 200px — over half the screen). Names wrap inside it.
const LIST_COMPANY_COL_MOBILE = 140;
const LIST_COMPANY_PAD_LEFT = 20;
const LIST_COMPANY_PAD_RIGHT_MOBILE = 8;

function CompanyListView({
  rows,
  sort,
  onSort,
  active,
  isMobile,
  focusRow,
  sectorColorOverride,
  bgStops,
  onSelect,
}: {
  rows: ListRow[];
  sort: ListSort;
  onSort: (key: ListSortKey) => void;
  active: boolean;
  isMobile: boolean;
  /** A search pick: scroll this row into view and flash it (token re-fires). */
  focusRow: { name: string; token: number } | null;
  /** A row was chosen (click, Enter or Space): open that company's details. */
  onSelect: (name: string) => void;
  sectorColorOverride?: (s: string) => string | null;
  /** The live background gradient stops, sampled for the frozen column. */
  bgStops: [string, string, string];
}) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  // The flash is DERIVED from the pick until its timer marks that token spent,
  // so the effect only scrolls; state changes happen in the timeout callback.
  const [spentToken, setSpentToken] = useState<number | null>(null);
  const flashRow = focusRow && focusRow.token !== spentToken ? focusRow.name : null;
  useEffect(() => {
    if (!focusRow || !tbodyRef.current) return;
    const row = Array.from(tbodyRef.current.children).find(
      (el) => (el as HTMLElement).dataset.name === focusRow.name,
    ) as HTMLElement | undefined;
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = window.setTimeout(() => setSpentToken(focusRow.token), 2200);
    return () => window.clearTimeout(t);
  }, [focusRow]);
  // Freeze the Company column on mobile so its names stay visible while the row
  // scrolls horizontally. Each frozen cell is painted (below) with the solid
  // color of the background gradient at its own vertical position, so the stacked
  // column re-creates the gradient behind it. Hover is a box-shadow so it doesn't
  // fight the direct-DOM background writes.
  const stickyHead: React.CSSProperties = isMobile
    ? { position: "sticky", left: 0, zIndex: 3 }
    : {};
  const stickyCell = (hovered: boolean): React.CSSProperties =>
    isMobile
      ? {
          position: "sticky",
          left: 0,
          zIndex: 1,
          boxShadow: hovered ? "inset 0 0 0 999px rgba(255,255,255,0.06)" : undefined,
        }
      : {};
  // Paint each frozen cell's background from its live screen position, matching
  // the map-area gradient (0% at viewport top → 100% at bottom). Direct DOM
  // writes on scroll/resize avoid re-rendering 170 rows per frame.
  useEffect(() => {
    if (!isMobile) return;
    const scroller = scrollRef.current;
    const tbody = tbodyRef.current;
    if (!scroller || !tbody) return;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const cells = Array.from(tbody.querySelectorAll<HTMLElement>("td[data-frozen]"));
      if (!cells.length) return;
      const vh = window.innerHeight || 1;
      // Rows differ in height (a wrapped name is taller), so each cell is
      // measured. All the reads first, then the writes.
      const mids = cells.map((cell) => {
        const r = cell.getBoundingClientRect();
        return r.top + r.height / 2;
      });
      cells.forEach((cell, i) => {
        cell.style.backgroundColor = sampleListGradient(mids[i] / vh, bgStops);
      });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    paint();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // `rows` in deps so a sort re-order repaints (cells move but keep inline bg).
  }, [isMobile, rows, active, bgStops]);
  const columns: { key: ListSortKey; label: string; align: "left" | "right" }[] = [
    { key: "company", label: "Company", align: "left" },
    { key: "sector", label: "Sector", align: "left" },
    { key: "valuation", label: "Valuation", align: "left" },
    { key: "ath", label: "All-Time High", align: "left" },
    { key: "atl", label: "All-Time Low", align: "left" },
  ];
  const th: React.CSSProperties = {
    position: "sticky",
    top: 0,
    // Fully opaque + above the body so rows scrolling underneath are never
    // visible through the sticky header. Pairs with `border-collapse: separate`
    // on the table — with `collapse`, cell backgrounds don't fully composite
    // over sticky scrolled content and you'd see values bleed through.
    zIndex: 2,
    background: "#070e20",
    padding: "10px 14px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.7)",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    borderBottom: "1px solid rgba(255,255,255,0.15)",
  };
  const td: React.CSSProperties = {
    padding: "9px 14px",
    fontSize: 13,
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    whiteSpace: "nowrap",
  };
  return (
    <div
      ref={scrollRef}
      aria-hidden={!active}
      // Never a Tab stop itself (Chrome makes a scroller focusable when nothing
      // inside it is); the rows are the stops.
      tabIndex={-1}
      // Keyboard: the List is one Tab stop (its first row). The arrow keys and
      // Home / End move between rows; Tab leaves. Enter / Space opens the company.
      onKeyDown={(e) => moveWithinGroup(e, "tr[role='button']")}
      style={{
        position: "absolute",
        // Start below the floating view-mode toggle (top:16, ~34px tall) so the
        // sticky table header never slides under it.
        top: 60,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: "auto",
        // Mobile: no horizontal padding so the frozen Company column sits flush
        // to the screen edge and no data peeks to its left.
        padding: isMobile ? "0 0 16px" : "0 16px 16px",
        boxSizing: "border-box",
        zIndex: 5,
        fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
        // Fade up on enter / fade down on exit (cross-fades with the map, which
        // fades out underneath). Always mounted so the exit transition can play.
        // Container handles the cross-fade with the map underneath; the rows
        // themselves do a staggered slide-up (below) for a more dynamic load.
        opacity: active ? 1 : 0,
        pointerEvents: active ? "auto" : "none",
        transition: "opacity 320ms ease",
      }}
    >
      <table
        style={{
          width: "100%",
          maxWidth: 1100,
          margin: "0 auto",
          // `separate` (not `collapse`) so the sticky header's opaque background
          // fully hides rows scrolling beneath it; spacing 0 keeps it visually
          // tight like a collapsed table.
          borderCollapse: "separate",
          borderSpacing: 0,
          color: "#e6edf7",
          // No panel background — rows carry a very subtle fill of their own so
          // the table feels open over the map gradient.
        }}
      >
        <thead>
          <tr>
            {columns.map(col => {
              const active = sort.key === col.key;
              return (
                <th
                  key={col.key}
                  onClick={() => onSort(col.key)}
                  style={{
                    ...th,
                    ...(col.key === "company"
                      ? { ...stickyHead, paddingLeft: LIST_COMPANY_PAD_LEFT, ...(isMobile ? { paddingRight: LIST_COMPANY_PAD_RIGHT_MOBILE } : {}) }
                      : {}),
                    textAlign: col.align,
                    color: active ? "#fff" : th.color,
                  }}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                >
                  {col.label}
                  {/* Fixed-width arrow slot: the active (▲/▼) and inactive (▾)
                      glyphs have different widths, so reserving a constant
                      inline-block width keeps the column from shifting when the
                      sort state changes. */}
                  <span
                    style={{
                      display: "inline-block",
                      width: "1em",
                      textAlign: "center",
                      opacity: active ? 0.9 : 0.25,
                      marginLeft: 6,
                    }}
                  >
                    {active ? (sort.dir === "asc" ? "▲" : "▼") : "▾"}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody ref={tbodyRef}>
          {rows.map((r, i) => {
            // Staggered slide-up on enter: each row's opacity/transform is
            // delayed a little more than the last so they cascade in. Delay is
            // capped so long lists don't take forever, and only applied on enter
            // (no delay on exit, and never on the hover-background transition).
            const enterDelay = active ? Math.min(i * 22, 360) : 0;
            return (
            <tr
              key={r.name}
              data-name={r.name}
              // A row is a button: it opens the company's details. Reachable by
              // keyboard (Tab, then Enter or Space) — the accessible way to every
              // company, since the map's planets are not focusable one by one.
              role="button"
              tabIndex={active && i === 0 ? 0 : -1}
              onClick={() => onSelect(r.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(r.name);
                }
              }}
              onFocus={() => setHoveredRow(r.name)}
              onBlur={() => setHoveredRow(prev => (prev === r.name ? null : prev))}
              onMouseEnter={() => setHoveredRow(r.name)}
              onMouseLeave={() => setHoveredRow(prev => (prev === r.name ? null : prev))}
              style={{
                background: flashRow === r.name
                  ? "rgba(255,255,255,0.2)"
                  : hoveredRow === r.name
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(255,255,255,0.03)",
                opacity: active ? 1 : 0,
                transform: active ? "translateY(0)" : "translateY(10px)",
                transition: `opacity 320ms ease ${enterDelay}ms, transform 320ms ease ${enterDelay}ms, background 120ms ease`,
                cursor: "pointer",
              }}
            >
              <td
                data-frozen={isMobile ? "" : undefined}
                style={{
                  ...td,
                  fontWeight: 700,
                  ...stickyCell(hoveredRow === r.name),
                  paddingLeft: LIST_COMPANY_PAD_LEFT,
                  ...(isMobile ? { paddingRight: LIST_COMPANY_PAD_RIGHT_MOBILE, whiteSpace: "normal", lineHeight: 1.25 } : {}),
                }}
              >
                {isMobile ? (
                  // A table cell takes its width from its content, so the
                  // column's width is set on a box inside it.
                  <div
                    style={{
                      width: LIST_COMPANY_COL_MOBILE - LIST_COMPANY_PAD_LEFT - LIST_COMPANY_PAD_RIGHT_MOBILE,
                      overflowWrap: "break-word",
                    }}
                  >
                    {usdFlag(r.name).display}
                  </div>
                ) : (
                  usdFlag(r.name).display
                )}
              </td>
              <td style={td}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: 3,
                      flex: "0 0 auto",
                      background: sectorColorOverride?.(r.sector) ?? sectorDotBackground(r.sector),
                      boxShadow: "0 0 5px rgba(0,0,0,0.4)",
                    }}
                  />
                  {r.sector}
                </span>
              </td>
              <td style={{ ...td, textAlign: "left", fontVariantNumeric: "tabular-nums" }}>
                {formatValuation(r.valuation)}
              </td>
              <td style={{ ...td, textAlign: "left", fontVariantNumeric: "tabular-nums" }}>
                {formatValuation(r.ath)}
                <span style={{ opacity: 0.5, fontSize: 11, marginLeft: 6 }}>{formatDate(r.athDate)}</span>
              </td>
              <td style={{ ...td, textAlign: "left", fontVariantNumeric: "tabular-nums" }}>
                {formatValuation(r.atl)}
                <span style={{ opacity: 0.5, fontSize: 11, marginLeft: 6 }}>{formatDate(r.atlDate)}</span>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Material Symbols names for the mobile view tabs (desktop spells the words out). */
const VIEW_ICONS: Record<AppViewMode, string> = {
  map: "map",
  linear: "linear_scale",
  aggregate: "bar_chart",
  list: "list",
};

// ---- Aggregate view (stacked market-cap-over-time chart) ----
// A fourth view alongside map/linear/list. Every company is a vertical run of
// yearly bars whose height = its valuation; bands are ordered PER YEAR (largest
// on top) so you can track a company rising/falling. The stack is normalized so
// the single highest-total year fills the plot height. Multi-color planets
// collapse to their single most-saturated swatch. The +/- buttons zoom the time axis.

type AppViewMode = ViewMode | "aggregate";
type AggBand = { name: string; sector: string; color: string; /** Near-black band: keeps all four edges at any height. */ dark?: boolean; values: number[] };
type AggregateData = { dates: MapDate[]; bands: AggBand[]; maxTotal: number };

// Same blue gradient the maps use, so the aggregate view feels of a piece.
const AGG_GRADIENT = LIST_BG_GRADIENT;
const AGG_GAP_STROKE = "rgba(0,0,0,0.35)";
// Every bar carries a thin light edge, set INSIDE the bar: left and right
// always, top and bottom only when the bar is taller than AGG_EDGE_MIN_H (so
// the thin bands at the bottom of a column don't turn into a block of lines).
// Near-black bands (Apple's charcoal, the AI companies' black) keep all four
// edges at any height — without them they vanish into the background and each
// other.
const AGG_EDGE_COLOR = "#ACACAC";
const AGG_EDGE_PX = 0.5;
const AGG_EDGE_MIN_H = 8;
/** True for a hex colour that is black or a very dark neutral (not a dark blue/red). */
function isNearBlack(c: string): boolean {
  const m = c.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return Math.max(n >> 16, (n >> 8) & 255, n & 255) <= 64;
}

// Per-company band colour for the Aggregate view (keyed by lowercased company
// name). A company listed here always uses this colour; everyone else takes the
// most saturated colour of their planet's palette.
const AGG_COLOR_OVERRIDES: Record<string, string> = {
  alphabet: "#EF1A1A",
  apple: "#2D2D36",
  microsoft: "#FFC000",
  amazon: "#18266E",
  walmart: "#EF6262",
  nvidia: "#A1FF62",
  samsung: "#FF3FDE",
};

/** HSL saturation (0..1) of a hex / hsl / rgb color — used to pick the most
 *  vivid swatch from a multi-color planet palette. */
function colorSaturation(c: string): number {
  const s = c.trim().toLowerCase();
  let m = s.match(/^hsla?\(\s*[\d.]+\s*,\s*([\d.]+)%/);
  if (m) return Math.min(1, parseFloat(m[1]) / 100);
  let r = 0, g = 0, b = 0;
  if ((m = s.match(/^#([0-9a-f]{3})$/))) {
    r = parseInt(m[1][0] + m[1][0], 16); g = parseInt(m[1][1] + m[1][1], 16); b = parseInt(m[1][2] + m[1][2], 16);
  } else if ((m = s.match(/^#([0-9a-f]{6})$/))) {
    r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16);
  } else if ((m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/))) {
    r = +m[1]; g = +m[2]; b = +m[3];
  } else return 0;
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255;
  if (mx === mn) return 0;
  const l = (mx + mn) / 2, d = mx - mn;
  return l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
}

/** The most-saturated color in a palette (multi-color planets → one band color). */
function mostSaturatedColor(colors: string[]): string {
  let best = colors[0] ?? "#888888", bs = -1;
  for (const c of colors) { const sat = colorSaturation(c); if (sat > bs) { bs = sat; best = c; } }
  return best;
}

/** SVG path of discrete monthly rectangles for one company band. */
function barsPath(xLeft: (i: number) => number, barW: number, upper: number[], lower: number[], values: number[], M: number): string {
  let d = "";
  for (let i = 0; i < M; i++) {
    if (values[i] <= 0) continue;
    const x = xLeft(i).toFixed(1), x2 = (xLeft(i) + barW).toFixed(1), u = upper[i].toFixed(1), l = lower[i].toFixed(1);
    d += `M${x},${u} L${x2},${u} L${x2},${l} L${x},${l} Z`;
  }
  return d;
}

/** Space under the Aggregate plot for the year labels. The map's bottom controls
 *  rise by this much in Aggregate so they end at the plot's bottom edge instead
 *  of sitting on the years. */
const AGG_PAD_BOTTOM = 26;
// Touch scrubbing on a zoomed chart: a finger held within this many px of the
// left / right edge scrolls the chart, up to this many px per frame.
const AGG_EDGE_SCROLL_PX = 44;
const AGG_EDGE_SCROLL_SPEED = 9;
/** Distance from the view's right edge to the right edge of the last bar (the
 *  plot's right padding plus half the gap between columns). */
const AGG_LAST_BAR_RIGHT = 15;
/** How far the map controls sit inside the last bar's right and bottom edges. */
const AGG_CONTROLS_INSET = 8;

/** The inside edge lines for one band's bars (see AGG_EDGE_*). */
function barEdgesPath(
  xLeft: (i: number) => number,
  barW: number,
  upper: number[],
  lower: number[],
  values: number[],
  M: number,
  allFour: boolean,
): string {
  const inset = AGG_EDGE_PX / 2;
  const f = (n: number) => n.toFixed(2);
  let d = "";
  for (let i = 0; i < M; i++) {
    if (values[i] <= 0) continue;
    const x0 = xLeft(i), x1 = x0 + barW, u = upper[i], l = lower[i];
    if (l - u <= 0) continue;
    d += `M${f(x0 + inset)},${f(u)} L${f(x0 + inset)},${f(l)} M${f(x1 - inset)},${f(u)} L${f(x1 - inset)},${f(l)}`;
    if (allFour || l - u > AGG_EDGE_MIN_H) {
      d += `M${f(x0)},${f(u + inset)} L${f(x1)},${f(u + inset)} M${f(x0)},${f(l - inset)} L${f(x1)},${f(l - inset)}`;
    }
  }
  return d;
}

// Intro-animation timing/offsets — tuned via the dev overlay, then baked in.
// posOffset: px the bar slides up from · hFrac: fraction of height that grows ·
// stagM/stagC: month/company stagger spans · duration: ms · easing: out-cubic.
const AGG_INTRO = { posOffset: 90, hFrac: 1, stagM: 0.2, stagC: 0.15, duration: 980 };

function AggregateView({
  active,
  data,
  zoomTarget,
  highlightSector,
  highlightCompany,
  onClearHighlight,
  isMobile = false,
  bg,
}: {
  active: boolean;
  data: AggregateData;
  /** Style lab: background gradient override. */
  bg?: string;
  zoomTarget: number;
  highlightSector: string | null;
  /** A search pick, pinned like a hover until the user clicks anywhere. */
  highlightCompany: string | null;
  onClearHighlight: () => void;
  /** Mobile's view-tab pill sits top-left, over where the caption normally goes. */
  isMobile?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<{ i: number; k: number | null; sx: number; sy: number; touch?: boolean; scrollLeft?: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Mobile drops the caption below the view-tab pill (top 16 + ~40 tall) and lets
  // it wrap to two lines, so the chart starts lower to clear it.
  const captionTop = isMobile ? 66 : 12;
  const padL = 12, padR = 14, padT = isMobile ? 108 : 34, padB = AGG_PAD_BOTTOM;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Staggered grow-up intro: `intro` eases 0→1 when the view becomes active; the
  // per-bar transform (slide + grow, staggered) lives in `shapes`.
  const [intro, setIntro] = useState(0);
  const introAnimRef = useRef<number | null>(null);
  useEffect(() => {
    if (introAnimRef.current !== null) cancelAnimationFrame(introAnimRef.current);
    if (!active) { setIntro(0); return; }
    setIntro(0);
    const t0 = performance.now(), dur = AGG_INTRO.duration;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      setIntro(p);
      introAnimRef.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    introAnimRef.current = requestAnimationFrame(step);
    return () => { if (introAnimRef.current !== null) cancelAnimationFrame(introAnimRef.current); };
  }, [active]);

  // Ease the displayed zoom toward the +/- buttons' target (easeInOutCubic).
  const [zoom, setZoom] = useState(zoomTarget);
  const zoomRef = useRef(zoom);
  const zoomAnimRef = useRef<number | null>(null);
  useEffect(() => {
    const from = zoomRef.current, to = zoomTarget;
    if (Math.abs(to - from) < 1e-3) return;
    if (zoomAnimRef.current !== null) cancelAnimationFrame(zoomAnimRef.current);
    const t0 = performance.now(), dur = 320;
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      zoomRef.current = from + (to - from) * ease(p);
      setZoom(zoomRef.current);
      zoomAnimRef.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    zoomAnimRef.current = requestAnimationFrame(step);
    return () => { if (zoomAnimRef.current !== null) cancelAnimationFrame(zoomAnimRef.current); };
  }, [zoomTarget]);

  // Anchor zoom to the RIGHT edge (the present): keep the chart scrolled fully
  // right as it grows, so zooming spreads the past out to the left. Runs on each
  // zoom frame before paint (no flicker); between zooms you can still pan left.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pw = (el.clientWidth - padL - padR) * zoom;
    el.scrollLeft = Math.max(0, padL + pw + padR - el.clientWidth);
  }, [zoom]);

  const { dates, bands, maxTotal } = data;
  const M = dates.length;
  const plotW = Math.max(0, (dims.w - padL - padR) * zoom);
  const svgW = padL + plotW + padR;
  const plotH = Math.max(0, dims.h - padT - padB);
  const plotBottom = padT + plotH;
  const scale = maxTotal > 0 ? plotH / maxTotal : 0;
  const slotW = M > 0 ? plotW / M : 0;
  const barGap = 2;
  const barW = Math.max(0.75, slotW - barGap);
  const xLeft = (i: number) => padL + i * slotW + barGap / 2;
  const xCenter = (i: number) => padL + i * slotW + slotW / 2;

  const totals = useMemo(() => {
    const t = new Array(M).fill(0);
    for (const b of bands) for (let i = 0; i < M; i++) t[i] += b.values[i];
    return t;
  }, [bands, M]);

  const peakIdx = useMemo(() => {
    let idx = 0;
    for (let i = 1; i < M; i++) if (totals[i] > totals[idx]) idx = i;
    return idx;
  }, [totals, M]);

  // Per-month stacking: within each month, companies are ordered largest-on-top,
  // so each company's vertical position can differ month to month. `upper[k][i]` /
  // `lower[k][i]` are the y-edges of company k's bar in month i. Only depends on
  // the values + vertical scale (not the horizontal zoom).
  const stacks = useMemo(() => {
    const N = bands.length;
    const upper: number[][] = Array.from({ length: N }, () => new Array(M).fill(0));
    const lower: number[][] = Array.from({ length: N }, () => new Array(M).fill(0));
    if (scale) {
      const idx = bands.map((_, k) => k);
      for (let i = 0; i < M; i++) {
        const order = idx
          .filter((k) => bands[k].values[i] > 0)
          .sort((a, b) => bands[b].values[i] - bands[a].values[i]);
        let top = plotBottom - totals[i] * scale;
        for (const k of order) {
          const h = bands[k].values[i] * scale;
          upper[k][i] = top;
          lower[k][i] = top + h;
          top += h;
        }
      }
    }
    return { upper, lower };
  }, [bands, totals, scale, plotBottom, M]);

  // One single-color path per company (discrete yearly bars). A dark stroke +
  // the 2px year gap separate bars horizontally and companies vertically.
  const shapes = useMemo(() => {
    if (!plotW || !plotH || !scale) return [] as { fill: string; edges: string; sector: string; name: string; d: string }[];
    // Intro transform (driven by the tuning controls): each bar slides up from
    // `posOffset` px low and grows in height (top eased down by `heightPct`% of its
    // final height), staggered left→right by month and slightly per company.
    const animating = intro < 1;
    const N = bands.length;
    const { posOffset, hFrac, stagM, stagC } = AGG_INTRO;
    const denom = 1 - stagM - stagC;
    const fm = animating ? Array.from({ length: M }, (_, i) => (M <= 1 ? 1 : i / (M - 1))) : null;
    const progress = (i: number, gc: number) => {
      const t = Math.max(0, Math.min(1, (intro - stagM * fm![i] - stagC * gc) / denom));
      return 1 - Math.pow(1 - t, 3); // easeOutCubic
    };
    return bands.map((b, k) => {
      let up = stacks.upper[k];
      let lo = stacks.lower[k];
      if (animating) {
        const gc = N <= 1 ? 0 : k / (N - 1);
        const u = stacks.upper[k], l = stacks.lower[k];
        const nu = new Array(M), nl = new Array(M);
        for (let i = 0; i < M; i++) {
          const p = progress(i, gc);
          const translate = (1 - p) * posOffset;                 // whole bar slides up
          const heightComp = (1 - p) * hFrac * (l[i] - u[i]);    // top eased down = grow
          nl[i] = l[i] + translate;
          nu[i] = u[i] + heightComp + translate;
        }
        up = nu;
        lo = nl;
      }
      return {
        fill: b.color,
        sector: b.sector,
        name: b.name,
        d: barsPath(xLeft, barW, up, lo, b.values, M),
        edges: barEdgesPath(xLeft, barW, up, lo, b.values, M, !!b.dark),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bands, stacks, plotW, plotH, scale, barW, slotW, M, intro]);

  // Outline of the hovered band (feedback), recomputed only while hovering.
  const hoverOutline = useMemo(() => {
    if (hover?.k == null || !scale) return null;
    const k = hover.k;
    return barsPath(xLeft, barW, stacks.upper[k], stacks.lower[k], bands[k].values, M);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover, bands, stacks, scale, barW, slotW, M]);

  // Outline of the company a search pick pinned (same shape as the hover outline).
  const pinnedOutline = useMemo(() => {
    if (!highlightCompany || !scale) return null;
    const k = bands.findIndex((b) => b.name === highlightCompany);
    if (k < 0) return null;
    return barsPath(xLeft, barW, stacks.upper[k], stacks.lower[k], bands[k].values, M);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightCompany, bands, stacks, scale, barW, slotW, M]);

  // The band + year under a point of the screen (mouse pointer or finger).
  const hoverAt = (clientX: number, clientY: number, touch: boolean) => {
    const svg = svgRef.current;
    if (!svg || M === 0 || slotW <= 0 || !scale) return;
    const rect = svg.getBoundingClientRect();
    const sx = clientX - rect.left, sy = clientY - rect.top;
    const i = Math.max(0, Math.min(M - 1, Math.floor((sx - padL) / slotW)));
    let k: number | null = null;
    for (let b = 0; b < bands.length; b++) {
      if (bands[b].values[i] > 0 && sy >= stacks.upper[b][i] && sy <= stacks.lower[b][i]) { k = b; break; }
    }
    setHover({ i, k, sx, sy, touch, scrollLeft: scrollRef.current?.scrollLeft ?? 0 });
  };
  const hoverAtRef = useRef(hoverAt);
  useEffect(() => {
    hoverAtRef.current = hoverAt;
  });

  // Touch: a finger dragged over the chart scrubs it — the tooltip follows from
  // band to band (the chart's own sideways scroll is switched off for touch,
  // `touchAction: none`). A zoomed chart is wider than the screen, so holding
  // the finger near the left or right edge scrolls it along instead. The
  // tooltip stays up after the finger lifts, where it can be read.
  const touchRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const edgeRafRef = useRef<number | null>(null);
  const stopEdgeScroll = () => {
    if (edgeRafRef.current !== null) cancelAnimationFrame(edgeRafRef.current);
    edgeRafRef.current = null;
  };
  const edgeScrollStep = () => {
    edgeRafRef.current = null;
    const t = touchRef.current, el = scrollRef.current;
    if (!t || !el) return;
    const box = el.getBoundingClientRect();
    const fromLeft = t.x - box.left, fromRight = box.right - t.x;
    // Faster the closer the finger is to the edge.
    const pull = fromLeft < AGG_EDGE_SCROLL_PX ? -(1 - Math.max(0, fromLeft) / AGG_EDGE_SCROLL_PX)
      : fromRight < AGG_EDGE_SCROLL_PX ? 1 - Math.max(0, fromRight) / AGG_EDGE_SCROLL_PX
      : 0;
    if (pull === 0) return;
    const before = el.scrollLeft;
    el.scrollLeft = before + pull * AGG_EDGE_SCROLL_SPEED;
    if (el.scrollLeft === before) return; // already at that end
    hoverAtRef.current(t.x, t.y, true);
    edgeRafRef.current = requestAnimationFrame(edgeScrollStep);
  };
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse") return;
    touchRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    hoverAt(e.clientX, e.clientY, true);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse") {
      hoverAt(e.clientX, e.clientY, false);
      return;
    }
    const t = touchRef.current;
    if (!t || t.id !== e.pointerId) return;
    t.x = e.clientX;
    t.y = e.clientY;
    hoverAt(e.clientX, e.clientY, true);
    if (edgeRafRef.current === null) edgeRafRef.current = requestAnimationFrame(edgeScrollStep);
  };
  const onPointerEnd = (e: React.PointerEvent<SVGSVGElement>) => {
    if (touchRef.current?.id !== e.pointerId) return;
    touchRef.current = null;
    stopEdgeScroll();
  };
  useEffect(
    () => () => {
      if (edgeRafRef.current !== null) cancelAnimationFrame(edgeRafRef.current);
    },
    [],
  );
  // Leaving the view drops a tooltip a finger left behind.
  useEffect(() => {
    if (active) return;
    const id = window.setTimeout(() => setHover(null), 0);
    return () => window.clearTimeout(id);
  }, [active]);

  const hoverBand = hover?.k != null ? bands[hover.k] : null;

  return (
    <div
      ref={wrapRef}
      // A search pick stays pinned until the user clicks anywhere in the chart.
      onClick={() => {
        if (highlightCompany) onClearHighlight();
      }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5,
        fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
        background: bg ?? AGG_GRADIENT,
        opacity: active ? 1 : 0,
        pointerEvents: active ? "auto" : "none",
        transition: "opacity 320ms ease",
        overflow: "hidden",
      }}
    >
      {/* Scroll layer — the chart scrolls horizontally when zoomed; the caption
          and tuning panel below stay fixed. */}
      {/* position: relative so the hover tooltip (absolute, in chart coordinates)
          scrolls with the chart — without it the tooltip was placed as if the
          chart weren't scrolled, i.e. off-screen whenever it was zoomed in. */}
      <div ref={scrollRef} style={{ position: "relative", width: "100%", height: "100%", overflowX: "auto", overflowY: "hidden" }}>
        <svg
          ref={svgRef}
          width={svgW}
          height={dims.h}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setHover(null);
          }}
          // A finger on the chart scrubs the tooltip rather than scrolling it.
          style={{ display: "block", cursor: "crosshair", touchAction: "none" }}
        >
          {dims.w > 0 && dates.map((d, i) => (
            <g key={i}>
              <line x1={xCenter(i)} y1={padT} x2={xCenter(i)} y2={plotBottom} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              <text x={xCenter(i)} y={plotBottom + 16} fill="rgba(255,255,255,0.45)" fontSize={10} textAnchor="middle">{d.year}</text>
            </g>
          ))}
          {shapes.map((s, idx) => (
            <path
              key={idx}
              d={s.d}
              fill={s.fill}
              stroke={AGG_GAP_STROKE}
              strokeWidth={0.75}
              shapeRendering="crispEdges"
              style={{
                opacity:
                  (highlightSector && s.sector !== highlightSector) || (highlightCompany && s.name !== highlightCompany)
                    ? 0.12
                    : 1,
                transition: "opacity 160ms ease",
              }}
            />
          ))}
          {/* Light inside edges, drawn over every fill so the neighbouring bands'
              gap lines don't swallow them. */}
          {shapes.map((s, idx) =>
            s.edges ? (
              <path
                key={`e${idx}`}
                d={s.edges}
                fill="none"
                stroke={AGG_EDGE_COLOR}
                strokeWidth={AGG_EDGE_PX}
                pointerEvents="none"
                style={{
                  opacity:
                    (highlightSector && s.sector !== highlightSector) || (highlightCompany && s.name !== highlightCompany)
                      ? 0.12
                      : 1,
                  transition: "opacity 160ms ease",
                }}
              />
            ) : null,
          )}
          {pinnedOutline && <path d={pinnedOutline} fill="none" stroke="#fff" strokeWidth={2} />}
          {hoverOutline && <path d={hoverOutline} fill="none" stroke="#fff" strokeWidth={2} />}
        </svg>
        {hover && hoverBand && (
          <div
            style={{
              position: "absolute",
              // Under a finger the tooltip sits above it, centred, kept on screen;
              // beside a mouse pointer it sits below and to the right.
              left: hover.touch
                ? Math.max((hover.scrollLeft ?? 0) + 8, Math.min(hover.sx - 80, (hover.scrollLeft ?? 0) + dims.w - 200))
                : Math.min(hover.sx + 14, svgW - 190),
              top: hover.touch
                ? Math.max(8, hover.sy - 78)
                : Math.max(8, Math.min(hover.sy + 14, dims.h - 70)),
              pointerEvents: "none",
              background: "rgba(6,12,28,0.95)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 12,
              color: "#fff",
              maxWidth: 200,
              boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{usdFlag(hoverBand.name).display}</div>
            <div style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatValuation(hoverBand.values[hover.i])} · {formatDate(dates[hover.i])}
            </div>
          </div>
        )}
      </div>

      {maxTotal > 0 && dims.w > 0 && (
        <div style={{ position: "absolute", top: captionTop, left: 14, right: 14, lineHeight: 1.35, fontSize: 11, letterSpacing: 0.6, color: "rgba(255,255,255,0.55)", pointerEvents: "none" }}>
          Total market cap over time · height relative to peak ({formatValuation(maxTotal)}, {formatDate(dates[peakIdx])})
        </div>
      )}

    </div>
  );
}

// Floating toolbar for the mobile layout editor (?edit=mobile): a view-type
// selector (full/vertical/horizontal), that view's settings sliders, sector-well
// toggle, per-planet clear, and export of the whole per-type MOBILE_LAYOUTS.
function MobileEditorToolbar({
  viewType,
  onViewType,
  placed,
  total,
  settings,
  onSetting,
  showWells,
  onToggleWells,
  onRefreshPhysics,
  sectors,
  enabledSectors,
  onToggleSector,
  selectedName,
  selectedPlaced,
  onClearSelected,
  onDeselect,
  onCopy,
  onDownload,
  onReset,
}: {
  viewType: MobileViewType;
  onViewType: (t: MobileViewType) => void;
  placed: number;
  total: number;
  settings: MobileSettings;
  onSetting: (key: keyof MobileSettings, value: number) => void;
  showWells: boolean;
  onToggleWells: () => void;
  onRefreshPhysics: () => void;
  sectors: string[];
  enabledSectors: Set<string>;
  onToggleSector: (s: string) => void;
  selectedName: string | null;
  selectedPlaced: boolean;
  onClearSelected: () => void;
  onDeselect: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onReset: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [sectorsOpen, setSectorsOpen] = useState(false);
  // Drag the whole panel by its header so it can be moved off the planets.
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 16, y: 16 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({ x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy });
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, []);
  const onHeaderMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.preventDefault();
  };
  const fontStack = '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif';
  const btn: React.CSSProperties = {
    fontFamily: fontStack,
    fontSize: 12,
    color: "white",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 6,
    padding: "5px 10px",
    cursor: "pointer",
  };
  return (
    <div
      style={{
        position: "absolute",
        top: pos.y,
        left: pos.x,
        zIndex: 20,
        width: 250,
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
        background: "rgba(10,14,24,0.94)",
        border: "1px solid rgba(255,255,255,0.16)",
        borderRadius: 12,
        padding: 14,
        backdropFilter: "blur(10px)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontFamily: fontStack,
        color: "white",
      }}
    >
      {/* Header doubles as the drag handle (grab anywhere but the buttons). */}
      <div
        onMouseDown={onHeaderMouseDown}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, cursor: "grab", userSelect: "none" }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.4 }}>Mobile layout ⠿</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, opacity: 0.6 }}>{placed}/{total}</span>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand" : "Collapse"}
            style={{ ...btn, padding: "2px 8px", lineHeight: 1 }}
          >
            {collapsed ? "▸" : "▾"}
          </button>
        </span>
      </div>
      {/* View-type selector — which mobile layout you're editing. */}
      <div style={{ display: "flex", gap: 6 }}>
        {MOBILE_VIEW_TYPES_OFFERED.map((opt) => (
          <button
            key={opt}
            onClick={() => onViewType(opt)}
            style={{
              flex: 1,
              fontFamily: fontStack,
              fontSize: 10,
              padding: "6px 2px",
              borderRadius: 6,
              cursor: "pointer",
              color: "white",
              background: viewType === opt ? "rgba(120,160,255,0.28)" : "rgba(255,255,255,0.06)",
              border: viewType === opt ? "1px solid rgba(150,180,255,0.6)" : "1px solid rgba(255,255,255,0.15)",
            }}
          >
            {MOBILE_VIEW_LABELS[opt]}
          </button>
        ))}
      </div>
      {collapsed ? null : (
      <>
      <button
        onClick={onToggleWells}
        style={{ ...btn, background: showWells ? "rgba(124,224,255,0.25)" : "rgba(255,255,255,0.08)", borderColor: showWells ? "rgba(124,224,255,0.6)" : "rgba(255,255,255,0.2)" }}
      >
        {showWells ? "Hide sector wells" : "Show sector wells"}
      </button>
      {/* Re-settle the sim from current positions, keeping all settings/pins. */}
      <button onClick={onRefreshPhysics} style={btn}>↻ Refresh physics</button>
      {/* Sector on/off — collapsible chip grid; toggling filters the planets. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          onClick={() => setSectorsOpen((o) => !o)}
          style={{ ...btn, display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <span>Sectors ({enabledSectors.size}/{sectors.length})</span>
          <span style={{ opacity: 0.7 }}>{sectorsOpen ? "▾" : "▸"}</span>
        </button>
        {sectorsOpen && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {sectors.map((s) => {
              const on = enabledSectors.has(s);
              return (
                <button
                  key={s}
                  onClick={() => onToggleSector(s)}
                  title={s}
                  style={{
                    fontFamily: fontStack,
                    fontSize: 10.5,
                    padding: "4px 8px",
                    borderRadius: 999,
                    cursor: "pointer",
                    color: on ? "white" : "rgba(255,255,255,0.5)",
                    background: on ? "rgba(120,160,255,0.28)" : "rgba(255,255,255,0.05)",
                    border: on ? "1px solid rgba(150,180,255,0.6)" : "1px solid rgba(255,255,255,0.14)",
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {MOBILE_SETTINGS_FIELDS.map((f) => (
        <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.85 }}>
            <span>{f.label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.7 }}>
              {f.step < 1 ? settings[f.key].toFixed(2) : Math.round(settings[f.key])}
            </span>
          </span>
          <input
            type="range"
            min={f.min}
            max={f.max}
            step={f.step}
            value={settings[f.key]}
            onChange={(e) => onSetting(f.key, Number(e.target.value))}
            style={{ width: "100%", accentColor: "#9db4ff", cursor: "pointer" }}
          />
        </label>
      ))}
      <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.35 }}>
        {selectedName ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ color: "#ffe066" }}>{selectedName}</span>
              {selectedPlaced ? " · placed" : " · auto"}
            </span>
            <span style={{ display: "flex", gap: 4, flex: "0 0 auto" }}>
              {selectedPlaced && (
                <button onClick={onClearSelected} style={{ ...btn, padding: "3px 8px" }}>Clear</button>
              )}
              <button onClick={onDeselect} style={{ ...btn, padding: "3px 8px" }}>✕</button>
            </span>
          </div>
        ) : (
          <span>Drag planets to place them inside the dashed frame.</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={onCopy} style={{ ...btn, flex: 1 }}>Copy</button>
        <button onClick={onDownload} style={{ ...btn, flex: 1 }}>Download</button>
        <button onClick={onReset} style={btn}>Reset</button>
      </div>
      </>
      )}
    </div>
  );
}

// Layout lab (?layout=1) page frame. Desktop: the map keeps its full size and
// the panel floats over it (Shift+L hides it). Phone modes: the whole app renders inside a
// phone-sized box — the `transform` makes that box the containing block for
// position:fixed children (drawers, modals), so they stay inside it too.
// Without ?layout=1 this renders its children untouched.
function LabFrame({ lab, panel, children }: { lab: LayoutLab; panel: React.ReactNode; children: React.ReactNode }) {
  if (!lab.enabled) return <>{children}</>;
  const phone = lab.device === "square" || lab.device === "full";
  const framed = lab.device !== "desktop";
  const frame = phone ? PHONE_FRAME : { w: lab.tabletPreviewW, h: TABLET_FRAME.h };
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        // A framed preview sits beside the panel (so none of it is covered);
        // the desktop map keeps its full width and the panel floats over it.
        paddingRight: framed && lab.open ? LAYOUT_PANEL_W : 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: framed ? "rgba(0,0,0,0.45)" : undefined,
      }}
    >
      <div
        style={
          framed
            ? {
                position: "relative",
                width: frame.w,
                maxWidth: "calc(100% - 32px)",
                height: `min(${frame.h}px, calc(100% - 32px))`,
                transform: "translateZ(0)",
                overflow: "hidden",
                borderRadius: phone ? 28 : 18,
                boxShadow: "0 0 0 1px rgba(255,255,255,0.28), 0 24px 60px rgba(0,0,0,0.6)",
              }
            : { position: "relative", width: "100%", height: "100%", transform: "translateZ(0)", overflow: "hidden" }
        }
      >
        {children}
      </div>
      {panel}
    </div>
  );
}

export default function MediaMap() {
  const realIsMobile = useIsMobile();
  // Layout lab (branch experiment): layout/physics/type overrides + a phone
  // preview. Its Device switch forces the mobile UI inside a phone-sized frame.
  const llab = useLayoutLab();
  const labPhone = llab.device === "square" || llab.device === "full";
  const isMobile = realIsMobile || labPhone;
  const isEditMode = useIsEditMode();
  // Mobile view type + per-type layouts. On the phone the gear switches the view
  // type (persisted); ?edit=mobile is the desktop editor whose selector controls
  // `mobileEditType`. `activeType` is whichever is being shown/edited; its layout
  // (settings + positions + sector wells) drives the canvas and physics.
  const [mobileViewType, setMobileViewType] = useState<MobileViewType>(loadMobileViewType);
  const [mobileEditType, setMobileEditType] = useState<MobileViewType>("vertical");
  const mobileEdit = useMobileEditMode();
  const activeType: MobileViewType = mobileEdit
    ? mobileEditType
    : labPhone
      ? (llab.device as MobileViewType)
      : mobileViewType;
  // A mobile authored view is active (phone or editor); desktop non-edit = false.
  const mobileView = isMobile || mobileEdit;
  // The horizontal view is the landscape/rotated-phone experience. On a real
  // phone held portrait, prompt the user to rotate instead of showing the map.
  // (In the desktop editor we always show the map so it stays authorable.)
  const isPortrait = useIsPortrait();
  const showRotatePrompt = isMobile && !mobileEdit && activeType === "horizontal" && isPortrait;
  const [mobileLayouts, setMobileLayouts] = useState<Record<MobileViewType, MobileLayout>>(
    () => cloneMobileLayouts(MOBILE_LAYOUTS),
  );
  const activeLayout = mobileLayouts[activeType];
  const activeSettings = activeLayout.settings;
  // mobilePositions + mobileSectorCenters are defined below, after `sanity` (they
  // layer Sanity's square positions/centers over the MOBILE_LAYOUTS code fallback).
  const [showSectorWells, setShowSectorWells] = useState(true);
  // Bump to re-settle the physics sim from current positions without changing
  // any layout settings (the editor's "Refresh physics" button).
  const [physicsBump, setPhysicsBump] = useState(0);
  // Two year-transition intros, bumped by the click handlers (batched with
  // setActiveDate, so the physics re-runs once — no pre-settle flash):
  //   resettleToken  → comparison A/B (saved-date pills): re-pack + grow in place.
  //   flyIntroToken  → a direct Time-Machine "Explore": full fly-out-from-wells.
  const [resettleToken, setResettleToken] = useState(0);
  const [flyIntroToken, setFlyIntroToken] = useState(0);
  // Mutators scoped to the active view type.
  const updateActiveLayout = (fn: (l: MobileLayout) => MobileLayout) =>
    setMobileLayouts((prev) => ({ ...prev, [activeType]: fn(prev[activeType]) }));
  const setActiveSetting = (key: keyof MobileSettings, value: number) =>
    updateActiveLayout((l) => ({ ...l, settings: { ...l.settings, [key]: value } }));

  // The active view's canvas: full = desktop landscape; vertical = 4:5;
  // horizontal = 16:9. Desktop (non-mobile, non-edit) uses the desktop canvas.
  const canvas = useMemo(
    () => (mobileView ? CANVAS_BY_TYPE[activeType] : CANVAS_DESKTOP),
    [mobileView, activeType],
  );

  // Per-company position overrides. Seeded from the file at mount; mutated in
  // memory by the editor; saved by exporting back to layout.ts (manual paste).
  const [positions, setPositions] = useState<Record<string, PlanetPosition>>(
    () => ({ ...COMPANY_POSITIONS }),
  );

  // Editor-only state. Selected planet drives the inspector; dragState is the
  // planet currently being dragged in slide-coords. Both are no-ops outside
  // edit mode.
  const [selectedPlanet, setSelectedPlanet] = useState<string | null>(null);
  const [dragState, setDragState] = useState<
    { name: string; x: number; y: number } | null
  >(null);
  // Track the mousedown screen position + the planet's slide position so we
  // can translate cursor deltas into slide-coord deltas without re-reading
  // node state every frame.
  const planetDragRef = useRef<
    { name: string; startScreenX: number; startScreenY: number; startSlideX: number; startSlideY: number } | null
  >(null);
  // Same pattern, but for dragging a sector's gravity-well marker. Distinct
  // ref so the container's onMouseMove can branch cleanly between planet,
  // sector, and pan drags.
  const sectorDragRef = useRef<
    { name: string; startScreenX: number; startScreenY: number; startSlideX: number; startSlideY: number } | null
  >(null);
  const [sectorDragState, setSectorDragState] = useState<
    { name: string; x: number; y: number } | null
  >(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const [companies, setCompanies] = useState<SheetCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [showSectorLabels] = useState(false); // sector labels off (toggle removed)
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const mapSvgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredPlanet, setHoveredPlanet] = useState<string | null>(null);
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [mobileSectorsOpen, setMobileSectorsOpen] = useState(false);
  // Gear panel open/close (phone view switcher).
  const [switcherOpen, setSwitcherOpen] = useState(false);
  // Persist the phone's chosen view type.
  useEffect(() => {
    try {
      window.localStorage.setItem(MOBILE_VIEW_STORE_KEY, mobileViewType);
    } catch {
      /* ignore */
    }
  }, [mobileViewType]);
  // Name of the planet currently shown in the right-side detail panel.
  // Set on click in non-edit mode; cleared by the panel's close button.
  const [inspectedPlanet, setInspectedPlanet] = useState<string | null>(null);
  const windowH = useWindowHeight();
  // Phone: a planet is in focus (its detail panel is open across the bottom) —
  // the bottom controls, which it covers, step aside.
  const mobileFocus = isMobile && inspectedPlanet !== null;
  // --- Search (top bar, beside the view tabs) ---
  const [searchOpen, setSearchOpen] = useState(false);
  // Game mode (easter egg on the map's logo). Declared up here because the
  // physics hook below needs to know when to hand the nodes over.
  const [gameActive, setGameActive] = useState(false);
  const gameLogoRef = useRef<HTMLButtonElement | null>(null);
  // The sidebar collapses for the game; this remembers whether to reopen it.
  const sidebarBeforeGameRef = useRef(true);
  // Names matching the live query → everything else on the map dims. null = idle.
  const [searchMatches, setSearchMatches] = useState<Set<string> | null>(null);
  // Aggregate view: the band a search result pinned (click anywhere to release).
  const [aggHighlight, setAggHighlight] = useState<string | null>(null);
  // List view: the row a search result scrolled to (token re-fires the same name).
  const [listFocus, setListFocus] = useState<{ name: string; token: number } | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const [tabsWidth, setTabsWidth] = useState(300);
  // Live-tunable layout knobs surfaced in the edit-mode toolbar so you can
  // drag-tweak planet size, spacing, and label size without redeploying.
  const [packingDensity, setPackingDensity] = useState(0.5);
  const [collidePadding, setCollidePadding] = useState(30);
  const [labelSizePx, setLabelSizePx] = useState(10);
  // Strength of the attraction between connected planets (edit-mode slider).
  const [connectionPull, setConnectionPull] = useState(0.55);
  // Edit-mode toolbar collapse state — handy when laying out planets so the
  // toolbar doesn't obscure the upper-left of the map.
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  // In-memory overrides for sector centers (sectors.ts SECTOR_CENTERS).
  // Edited via draggable sector markers; flushed to source by copying the
  // generated TS snippet from the toolbar.
  const [sectorPositions, setSectorPositions] = useState<Record<string, { x: number; y: number }>>({});

  // ---- Connections (lines between planets) ----
  // Seeded from connections.ts at mount; edited in memory; flushed to source
  // by copying/downloading the generated array from the edit toolbar.
  const [connections, setConnections] = useState<Connection[]>(
    () => COMPANY_CONNECTIONS.map(c => ({ ...c })),
  );
  // When true, the next two planet clicks define a new connection. The first
  // click sets connectFrom; the second creates the connection.
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  // Index into `connections` of the line currently selected for editing.
  const [selectedConnIdx, setSelectedConnIdx] = useState<number | null>(null);
  // Connection currently under the cursor + the screen-space point to anchor
  // its tooltip. Drives the hover tooltip overlay (works in and out of edit mode).
  const [hoveredConn, setHoveredConn] = useState<{ idx: number; x: number; y: number } | null>(null);
  // Live cursor position in slide coords while drawing a new connection — used
  // to render the rubber-band line from the source planet to the pointer.
  const [connectCursor, setConnectCursor] = useState<{ x: number; y: number } | null>(null);
  // The currently-rendered date.
  const [activeDate, setActiveDate] = useState<MapDate>(CURRENT_DATE);

  // --- Sanity read side (Phase 4b) ---------------------------------------
  // When VITE_SANITY_PROJECT_ID is set, the map's STRUCTURE (which companies +
  // entities exist, sector centers, hues, styles, positions, connections) comes
  // from Sanity, resolved at the viewed month. Valuations still come from the
  // sheet (joined by company name) until Supabase lands (4c). Unset → `sanity`
  // is null and the app uses the Google Sheet + local files exactly as before.
  const { docs: sanityDocs, loading: sanityLoading, error: sanityError } = useSanityMapDocs();
  const sanity = useResolvedSanityMap(sanityDocs, makeMoment(activeDate.year, activeDate.month));
  // The published layout (Map Settings → Layout in Sanity) replaces the preset
  // baked into the build — that is how a layout tuned in the lab goes live
  // without a deploy.
  const publishedLayout = sanityDocs?.settings?.layout_lab ?? null;
  const { setRemote: setLabRemote } = llab;
  useEffect(() => {
    setLabRemote(publishedLayout);
  }, [setLabRemote, publishedLayout]);
  // Style lab (branch experiment): colour/style overrides layered on top of
  // Sanity at RENDER time (node.style is only re-read by physics on a rebuild).
  const lab = useStyleLab();
  // Stable callbacks pulled out so hooks can list them as dependencies.
  const { styleFor: labStyleFor, sectorColor: labSectorColor } = lab;
  // Background + side panel: a style-lab override wins, else Sanity's Map
  // Settings, else the built-in gradient / translucent navy.
  const sanityBg = sanity?.background ?? null;
  const bgStops = lab.bgIsCustom || !sanityBg ? lab.bgStops : sanityBg;
  const bgGradient = bgGradientOf(bgStops);
  const panelBg = lab.panelBg ?? sanity?.panelBg ?? null;
  // The page background (visible under the translucent sidebar and during view
  // fades) follows the gradient's bottom stop.
  // A sector's colour: a style-lab override, else Sanity's sector default, else
  // null (callers fall back to the built-in sector styles). Feeds the sidebar
  // swatches, list dots, search results and the PNG legend.
  const sanitySectorStyles = sanity?.styleBySector;
  const sectorColorResolved = useCallback(
    (s: string): string | null => labSectorColor(s) ?? sanitySectorStyles?.[s]?.fill ?? null,
    [labSectorColor, sanitySectorStyles],
  );
  const bgBottom = bgStops[2];
  useEffect(() => {
    document.body.style.background = bgBottom;
    return () => {
      document.body.style.background = "";
    };
  }, [bgBottom]);

  // Square positions/centers live in Sanity (mobile_position_overrides + sector
  // mobile_center, resolved at the viewed year); merge over the MOBILE_LAYOUTS.square
  // code fallback so the Studio editor's Square-mode edits drive the live mobile map.
  // (The `…Of(sn)` helpers below take the Sanity map resolved at ANY year, so
  // the Time Machine can build another year's layout from the very same code
  // the live map uses for the year on screen.)
  const mobilePositionsOf = (sn: ResolvedSanityMap | null) => {
    if (activeType === "square" && sn && Object.keys(sn.mobilePositions).length) {
      const merged: Record<string, MobilePosition> = { ...activeLayout.positions };
      for (const [name, p] of Object.entries(sn.mobilePositions)) merged[name] = { x: p.x, y: p.y };
      return merged;
    }
    return activeLayout.positions;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mobilePositions = useMemo(() => mobilePositionsOf(sanity), [activeType, activeLayout.positions, sanity]);
  const mobileSectorCentersOf = (sn: ResolvedSanityMap | null) => {
    const base = inheritsFullLayout(activeType)
      ? { ...mobileLayouts.full.sectorCenters, ...activeLayout.sectorCenters }
      : activeLayout.sectorCenters;
    if (activeType === "square" && sn && Object.keys(sn.mobileCenterBySector).length) {
      return { ...base, ...sn.mobileCenterBySector };
    }
    return base;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mobileSectorCenters = useMemo(() => mobileSectorCentersOf(sanity), [activeType, activeLayout.sectorCenters, mobileLayouts.full.sectorCenters, sanity]);
  // Surface a failed Sanity read (otherwise it falls back to the sheet silently).
  useEffect(() => {
    if (sanityError) console.warn("[media-map] Sanity read failed — using the sheet instead:", sanityError);
  }, [sanityError]);
  // Real market caps from the valuation Google Sheet (Phase 4c), indexed by
  // (slug, month). Falls back to the legacy sheet + mock when unconfigured/missing.
  const {
    data: valData,
    hidden: hiddenByYear,
    lastUpdated: lastUpdatedBySlug,
    loading: valuationsLoading,
    settled: valuationsSettled,
  } = useValuations();
  // Layout lab (deterministic layout): every change of inputs is a full solve,
  // so painting early and then again as later data lands means two solves and a
  // hitch mid-animation. Two things land after the snapshot: the live valuation
  // sheet, and the legacy sheet (the fallback value for the few companies the
  // valuation sheet doesn't cover). Hold the first paint for both — but only
  // briefly: after LIVE_WAIT_MS go ahead with what there is.
  const stillArriving = !valuationsSettled || loading;
  const [liveWaitOver, setLiveWaitOver] = useState(false);
  useEffect(() => {
    if (valuationsLoading || !stillArriving) return;
    const id = window.setTimeout(() => setLiveWaitOver(true), LIVE_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [valuationsLoading, stillArriving]);
  const holdForLive = llab.active && stillArriving && !liveWaitOver;
  // The map's "current" view = the newest YEAR column in the valuation sheet (so
  // the view advances when a year rolls over), with its MONTH derived from the
  // newest ingest "last_updated" (decision #3). Falls back to the calendar date
  // until the sheet loads.
  const currentDate = useMemo<MapDate>(() => {
    const year = latestYear(valData);
    if (!year) return CURRENT_DATE;
    const updated = latestUpdated(lastUpdatedBySlug);
    // Month from the run date when it lands in the newest year; else calendar month.
    // Never let a stray FUTURE last_updated (a bad sheet date) push the label past
    // today's actual month — clamp to the calendar month in the current year.
    let month = CURRENT_DATE.month;
    if (updated && String(updated.year) === year) {
      month =
        Number(year) === CURRENT_DATE.year
          ? Math.min(updated.month, CURRENT_DATE.month)
          : updated.month;
    }
    return { year: Number(year), month };
  }, [valData, lastUpdatedBySlug]);
  const currentYearKey = String(currentDate.year);
  // Once the sheet loads, advance the default view to its latest month — unless
  // the user has already scrubbed away from the initial (calendar) month.
  useEffect(() => {
    setActiveDate((prev) =>
      sameDate(prev, CURRENT_DATE) && !sameDate(currentDate, CURRENT_DATE) ? currentDate : prev,
    );
  }, [currentDate]);
  // Legacy valuation lookup (by lowercased name) — the fallback for companies the
  // new sheet doesn't cover yet (non-US "NA", or not in it).
  const sheetValByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of companies) m.set(c.name.toLowerCase(), c.valuation_b);
    return m;
  }, [companies]);
  // Valuation at a date: the new sheet (by slug + year) wins; else the legacy mock.
  const valAt = (c: SheetCompany, d: MapDate): number =>
    valuationAt(valData, c.slug, String(d.year)) ?? valuationForDate(c, d);
  // A company's appearance windows (Sanity). Empty = always visible. Used to
  // filter the map at the viewed year and to window the aggregate per-year.
  const windowsFor = (name: string) => sanity?.detailByName[name]?.appearanceWindows ?? [];
  // Base company set: Sanity names/sectors + sheet valuations when configured,
  // else the raw sheet companies. Feeds the timeline mock + ATH/ATL stats.
  const baseCompaniesOf = (sn: ResolvedSanityMap | null): SheetCompany[] => {
    if (!sn) return companies;
    return sn.companies.map((c) => {
      const sheetVal = sheetValByName.get(c.name.toLowerCase()) ?? 0;
      const detail = sn.detailByName[c.name];
      // Precedence: the valuation sheet's market cap for the current year (by
      // slug) → the manually-entered Sanity value (private/PSM) → the legacy
      // sheet (so non-US "NA" / uncovered companies still render).
      const valuation_b =
        valuationAt(valData, c.slug, currentYearKey) ?? detail?.manualValue ?? sheetVal;
      return { name: c.name, sector: c.sector, slug: c.slug, valuation_b };
    });
  };
  const baseCompanies = useMemo<SheetCompany[]>(() => {
    // While Sanity is configured but still loading, return NOTHING. Otherwise the
    // physics first-load animation fires on the sheet fallback, then the real
    // Sanity data (and sector seeding) arrives mid-animation, changes the layout
    // hook's deps, tears the running tween down, and freezes a half-settled,
    // overlapping frame. Holding empty until the data lands makes the first-anim
    // run once on stable data and complete every time.
    if (isSanityConfigured() && sanityLoading) return [];
    // Likewise wait for the valuation sheet (live / snapshot / gave up). Without
    // this the map rendered as soon as Sanity landed — every planet sized from
    // the legacy fallback for a second or two, then a jolt when the real values
    // arrived (and companies absent from the legacy sheet, e.g. Space X, blinked
    // in late). The Studio editor has always gated on this; the app didn't.
    if (valuationsLoading || holdForLive) return [];
    return baseCompaniesOf(sanity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sanity, sanityLoading, valuationsLoading, holdForLive, companies, sheetValByName, valData, currentYearKey]);
  // "Last updated" date per company name (join slug → date from the sheet).
  const lastUpdatedByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of baseCompanies) {
      const lu = c.slug ? lastUpdatedBySlug.get(c.slug) : undefined;
      if (lu) m.set(c.name, lu);
    }
    return m;
  }, [baseCompanies, lastUpdatedBySlug]);
  // Yearly market-cap series (oldest → newest) for the inspected company's chart.
  // The `month` field carries a year key ("YYYY"); HistoryChart labels it as a year.
  const inspectedHistory = useMemo<{ month: string; value: number }[]>(() => {
    if (!inspectedPlanet) return [];
    const slug = baseCompanies.find((c) => c.name === inspectedPlanet)?.slug;
    const years = slug ? valData.get(slug) : undefined;
    if (!years) return [];
    return [...years.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, value]) => ({ month, value }));
  }, [inspectedPlanet, baseCompanies, valData]);
  // The saved-view pills shown lower-left. The current year is always one of
  // them and can't be removed; exploring a past year (via the timeline) adds
  // its pill here. Seeded with the present; kept in sync with `currentDate`.
  const [savedViews, setSavedViews] = useState<MapDate[]>([CURRENT_DATE]);

  // A/B comparison between saved-year pills → re-pack + grow in place.
  const selectDate = (d: MapDate) => {
    setActiveDate(d);
    if (d.year !== activeDate.year) setResettleToken((n) => n + 1);
  };

  const removeSavedView = (d: MapDate) => {
    if (d.year === currentDate.year) return; // the current year is never removable
    setSavedViews(prev => prev.filter(p => !sameDate(p, d)));
    if (sameDate(d, activeDate)) {
      setActiveDate(currentDate); // closed the active view → back to the present
      if (currentDate.year !== activeDate.year) setResettleToken((n) => n + 1);
    }
  };

  // Keep exactly one current-year pill, equal to `currentDate` (so its month
  // label stays fresh as the ingest advances), and always present.
  useEffect(() => {
    setSavedViews(prev => {
      const next = prev.some(v => v.year === currentDate.year)
        ? prev.map(v => (v.year === currentDate.year ? currentDate : v))
        : [currentDate, ...prev];
      const seen = new Set<string>();
      return next.filter(v => {
        const k = `${v.year}-${v.month}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    });
  }, [currentDate]);

  // Chronologically-sorted list of saved-view pills. Clicking a timeline tick
  // only changes the active date; pills are added via "Explore map". The pill
  // matching the active date gets a highlight, in place.
  const displayedViewDates = useMemo(() => {
    return savedViews
      .slice()
      .sort((a, b) => dateIndex(a) - dateIndex(b));
  }, [savedViews]);

  // Track which pill the cursor is over so we can show a hover style.
  const [hoveredViewKey, setHoveredViewKey] = useState<string | null>(null);
  const [timelineButtonHovered, setTimelineButtonHovered] = useState(false);

  const [hoveredDate, setHoveredDate] = useState<MapDate | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);

  const dateRange = useMemo(() => buildYearRange(currentDate), [currentDate]);
  // Time Machine layout numbers (tunable with ?tm=1).
  // Desktop, or the phone view in use (the editor-only phone views share 1:1's).
  const tm = useTmTuning(!isMobile ? "desktop" : activeType === "full" ? "full" : "square");
  // Bumped by the tuning panel's "Replay intro": remounts the carousel so its
  // opening animation plays again.
  const [tmIntroToken, setTmIntroToken] = useState(0);

  // Timeline picker (smooth): the carousel + strip FOCUS a candidate year without
  // moving the live map — only "Explore map" commits it. `scrollIdx` is a
  // FRACTIONAL index into dateRange, so wheel motion tracks the scroll
  // continuously and eases to the nearest year when you stop. Opening defaults to
  // the PREVIOUS year (you're already looking at the present).
  const clampIdx = (i: number) => Math.max(0, Math.min(dateRange.length - 1, i));
  const [scrollIdx, setScrollIdx] = useState(0);
  const [timelineAnimate, setTimelineAnimate] = useState(true);
  const focusIdx = clampIdx(Math.round(scrollIdx));
  const timelineFocus = dateRange[focusIdx] ?? activeDate;
  const openTimeline = () => {
    const i = dateRange.findIndex(d => d.year === currentDate.year - 1);
    setTimelineAnimate(true);
    setScrollIdx(i >= 0 ? i : Math.max(0, dateRange.length - 1));
    setTimelineOpen(true);
  };
  // A click / arrow / strip pick eases to that exact year.
  const focusOn = (d: MapDate) => {
    const i = dateRange.findIndex(x => sameDate(x, d));
    if (i < 0) return;
    setTimelineAnimate(true);
    setScrollIdx(i);
  };
  // "Explore this map". When the focused year's layout is already solved (so
  // its thumbnail IS the map, planet for planet), the thumbnail grows into the
  // real map: `exploring` is set, the map switches year underneath, and the
  // effect further down runs the hand-over before closing the Time Machine.
  // Otherwise (other views, reduced motion, layout not ready) it closes at once
  // and the map flies out from its wells, as before.
  const [exploring, setExploring] = useState<MapDate | null>(null);
  const onExploreMap = (d?: MapDate) => {
    if (exploring) return;
    const target = d ?? timelineFocus;
    setSavedViews(prev => (prev.some(p => sameDate(p, target)) ? prev : [...prev, target]));
    setActiveDate(target);
    const canGrow =
      viewMode === "map" &&
      exploreGrowReadyRef.current &&
      !!getSolvedYears()[target.year] &&
      !(typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    if (canGrow) {
      setExploring(target);
      return;
    }
    setFlyIntroToken((n) => n + 1); // fly out from the wells
    setTimelineOpen(false);
  };
  // Whether the map's layout is the seeded, repeatable kind (set further down,
  // once the layout lab's knobs are known) — only then does a thumbnail match.
  const exploreGrowReadyRef = useRef(false);
  // Wheel scrubs the carousel continuously (motion tied to the scroll, no per-year
  // snapping mid-gesture), then eases to the nearest year ~130ms after you stop.
  // Down / right → newer.
  const wheelSnapRef = useRef<number | null>(null);
  const onTimelineWheel = (e: React.WheelEvent) => {
    const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!raw) return;
    setHoveredDate(null);
    setTimelineAnimate(false); // track the wheel 1:1 while scrubbing
    setScrollIdx(prev => clampIdx(prev + raw * 0.01)); // ~one year per ~100px
    if (wheelSnapRef.current !== null) window.clearTimeout(wheelSnapRef.current);
    wheelSnapRef.current = window.setTimeout(() => {
      setTimelineAnimate(true);
      setScrollIdx(prev => clampIdx(Math.round(prev)));
    }, 130);
  };

  const [viewMode, setViewMode] = useState<AppViewMode>("map");
  const [aboutOpen, setAboutOpen] = useState(false);
  // Which About tab the reader is on (first vs Downloads), and the tab to open
  // on — both for the address bar (/about, /about/downloads).
  const [aboutSection, setAboutSection] = useState<AboutSection>("about");
  const [aboutOpenAt, setAboutOpenAt] = useState<AboutSection>("about");
  // The spatial layout shown beneath everything: map | linear. "list" is an
  // overlay that fades over whatever layout was last active, so the layout is
  // frozen here and "list" never drives the SVG geometry or the physics hook.
  // This is what lets linear→list fade straight from the strip (instead of
  // briefly snapping to the map) and list→map fade back into place. Updated in
  // lockstep with viewMode via selectView() so the two never drift.
  const [layoutMode, setLayoutMode] = useState<"map" | "linear">("map");
  const selectView = (mode: AppViewMode) => {
    setViewMode(mode);
    if (mode !== "aggregate") setAggHighlight(null); // an Aggregate search pin is Aggregate-only
    if (mode === "map" || mode === "linear") setLayoutMode(mode);
  };
  // List-view column sort. Default: largest valuation first.
  const [listSort, setListSort] = useState<ListSort>({ key: "valuation", dir: "desc" });
  // Aggregate-view time-axis zoom target (the +/- buttons set it in discrete
  // steps; AggregateView eases its displayed zoom toward this target).
  const AGG_ZOOM_STEP = 1.6;
  const AGG_MAX_ZOOM = 16;
  const [aggZoomTarget, setAggZoomTarget] = useState(1);
  const aggZoomBy = (f: number) => setAggZoomTarget((t) => Math.min(AGG_MAX_ZOOM, Math.max(1, t * f)));

  // Hide companies whose appearance windows don't cover the viewed year, or
  // that the sheet explicitly omitted for this year (a "-" cell). The map,
  // list + linear views all read this; the aggregate keeps every company and
  // windows per-year instead.
  const displayedOf = (base: SheetCompany[], sn: ResolvedSanityMap | null, date: MapDate) => {
    const moment = makeMoment(date.year, date.month);
    const yearKey = String(date.year);
    const visible = base.filter(
      (c) =>
        yearWindowsActiveAt(sn?.detailByName[c.name]?.appearanceWindows ?? [], moment) &&
        !isHiddenAt(hiddenByYear, c.slug, yearKey),
    );
    return sameDate(date, currentDate)
      ? visible
      : visible.map((c) => ({ ...c, valuation_b: valAt(c, date) }));
  };
  const displayedCompanies = useMemo(
    () => displayedOf(baseCompanies, sanity, activeDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseCompanies, activeDate, currentDate, valData, hiddenByYear, sanity],
  );

  // Aggregate view: every company's valuation across the whole timeline, ordered
  // by the CURRENT map's valuation (largest first). Colors mirror the planets.
  const aggregateData = useMemo<AggregateData>(() => {
    const bands: AggBand[] = baseCompanies.map((c) => {
      const baseStyle = sanity ? (sanity.styleByName[c.name] ?? null) : planetStyleFor(c.name, c.sector);
      // Style-lab palette (sector colours / Large Cap ombré recipes) applies here too.
      const style = labStyleFor(c.name, c.sector, baseStyle);
      const hue = sanity?.hueBySector[c.sector] ?? hueForSector(c.sector);
      const palette = style?.ombre?.stops?.length
        ? style.ombre.stops
        : style?.stripes && style.stripes.length
          ? style.stripes
          : [style?.fill ?? `hsl(${hue}, 65%, 55%)`];
      const color = AGG_COLOR_OVERRIDES[c.name.trim().toLowerCase()] ?? mostSaturatedColor(palette);
      // A company contributes a bar only in years its appearance windows cover
      // (empty = all years); outside the window its value is 0 (no bar).
      const windows = windowsFor(c.name);
      const values = dateRange.map((d) =>
        yearWindowsActiveAt(windows, makeMoment(d.year, d.month)) &&
        !isHiddenAt(hiddenByYear, c.slug, String(d.year))
          ? Math.max(0, valAt(c, d))
          : 0,
      );
      return { name: c.name, sector: c.sector, color, dark: isNearBlack(color), values };
    });
    // Stacking order is decided PER MONTH in AggregateView (largest on top for
    // that month), so no global ordering is applied here.
    let maxTotal = 0;
    for (let i = 0; i < dateRange.length; i++) {
      let t = 0;
      for (const b of bands) t += b.values[i];
      if (t > maxTotal) maxTotal = t;
    }
    return { dates: dateRange, bands, maxTotal };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseCompanies, dateRange, valData, hiddenByYear, sanity, labStyleFor]);

  // All-time high / low (with the date each occurred) for every company,
  // swept across the full timeline. Independent of the active date, so this
  // only recomputes when the company list changes. Values are mocked today
  // (see historical.ts) — fine as placeholders until real history lands.
  const valuationStats = useMemo(() => {
    const m = new Map<string, { ath: number; athDate: MapDate; atl: number; atlDate: MapDate }>();
    for (const c of baseCompanies) {
      const windows = windowsFor(c.name);
      let ath = -Infinity, atl = Infinity;
      let athDate = dateRange[0], atlDate = dateRange[0];
      for (const d of dateRange) {
        // outside its window, or explicitly hidden that year ("-")
        if (!yearWindowsActiveAt(windows, makeMoment(d.year, d.month)) || isHiddenAt(hiddenByYear, c.slug, String(d.year))) continue;
        const v = valAt(c, d);
        if (v > ath) { ath = v; athDate = d; }
        if (v < atl) { atl = v; atlDate = d; }
      }
      // A company whose window covers no year in range has no stats — fall back to 0.
      if (!Number.isFinite(ath)) { ath = 0; atl = 0; }
      m.set(c.name, { ath, athDate, atl, atlDate });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseCompanies, dateRange, valData, hiddenByYear]);

  // Rows for the list view: enabled sectors only (so the sidebar filter still
  // applies), valuation at the active date, ATH/ATL across all time, sorted by
  // the active column.
  const listRows = useMemo<ListRow[]>(() => {
    const rows: ListRow[] = displayedCompanies
      .filter(c => enabled.has(c.sector))
      .map(c => {
        const stats = valuationStats.get(c.name);
        return {
          name: c.name,
          sector: c.sector,
          valuation: c.valuation_b,
          ath: stats?.ath ?? c.valuation_b,
          athDate: stats?.athDate ?? CURRENT_DATE,
          atl: stats?.atl ?? c.valuation_b,
          atlDate: stats?.atlDate ?? CURRENT_DATE,
        };
      });
    const { key, dir } = listSort;
    rows.sort((a, b) => {
      let cmp = 0;
      switch (key) {
        case "company": cmp = a.name.localeCompare(b.name); break;
        case "sector": cmp = a.sector.localeCompare(b.sector) || a.name.localeCompare(b.name); break;
        case "valuation": cmp = a.valuation - b.valuation; break;
        case "ath": cmp = a.ath - b.ath; break;
        case "atl": cmp = a.atl - b.atl; break;
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [displayedCompanies, enabled, valuationStats, listSort]);

  const handleListSort = (key: ListSortKey) => {
    setListSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        // Text columns default A→Z; numeric columns default high→low.
        : { key, dir: key === "company" || key === "sector" ? "asc" : "desc" },
    );
  };


  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadCompanies()
      .then(rows => {
        if (cancelled) return;
        setCompanies(rows);
        setError(null);
      })
      .catch(e => {
        if (cancelled) return;
        setError(e?.message ?? String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed the sector legend once data is available, from whichever source is live:
  // Sanity when configured + loaded, otherwise the sheet. If the Sanity read is
  // still pending we wait; if it FAILS, `baseCompanies` is the sheet, so we seed
  // from the sheet and the map never blanks. One-shot (ref) so user toggles
  // survive timeline scrubbing.
  const enabledSeeded = useRef(false);
  useEffect(() => {
    if (enabledSeeded.current) return;
    if (isSanityConfigured() && sanityLoading) return; // wait for the Sanity read to settle
    // Companies are held back until the valuations land; seeding before then
    // would see only the entities' sectors and switch every other sector off.
    if (baseCompanies.length === 0) return;
    const sectors = new Set<string>();
    for (const c of baseCompanies) sectors.add(c.sector);
    for (const e of sanity?.entities ?? []) sectors.add(e.sector);
    if (sectors.size === 0) return; // no data yet (sheet still loading)
    setEnabled(sectors);
    enabledSeeded.current = true;
  }, [baseCompanies, sanity, sanityLoading]);

  const allSectors = useMemo(() => {
    const set = new Set<string>();
    for (const c of baseCompanies) set.add(c.sector);
    // Known sectors first (in the order declared in SECTOR_CENTERS), then unknown alphabetically.
    const known = Object.keys(SECTOR_CENTERS).filter(s => set.has(s));
    const knownSet = new Set(known);
    const unknown = [...set].filter(s => !knownSet.has(s)).sort();
    return [...known, ...unknown];
  }, [baseCompanies]);

  // Desktop-canvas gravity center for a sector (Sanity → local sector override →
  // computed default). ONE resolver so the Full view's planets AND the draggable
  // sector-well handles use the exact same coordinate — otherwise the handle
  // renders in a different fallback spot than the planets it controls.
  const unknownSectorList = useMemo(() => allSectors.filter(s => !isKnownSector(s)), [allSectors]);
  const desktopCenterOf = (sn: ResolvedSanityMap | null, unknown: string[]) => (s: string) =>
    sn?.centerBySector[s] ??
    sectorPositions[s] ??
    sectorCenterFor(s, unknown.indexOf(s), unknown.length, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const desktopCenterForSector = useMemo(() => desktopCenterOf(sanity, unknownSectorList), [sanity, sectorPositions, unknownSectorList]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of baseCompanies) out[c.sector] = (out[c.sector] ?? 0) + 1;
    return out;
  }, [baseCompanies]);

  // Bounds for the physics simulation: inset inside the canvas bbox so planets
  // keep breathing room from the edges.
  const physicsBounds = useMemo(() => ({
    x0: canvas.x + 120,
    y0: canvas.y + 120,
    x1: canvas.x + canvas.w - 120,
    y1: canvas.y + canvas.h - 120,
  }), [canvas]);
  // Apple's slide-unit diameter, sized so the cluster of visible planets fills
  // a target fraction of the canvas area. Each planet's area is proportional
  // to `valuation_b / ANCHOR_VAL`, so the total cluster area scales with
  // `anchorDiam² × Σ(val_i / ANCHOR_VAL)`. Solving for `anchorDiam` against
  // the canvas area gives an Apple size that auto-adjusts to the dataset:
  // filter down to one sector and the planets grow; show everything and
  // they shrink.
  //
  // PACKING_DENSITY (live-tunable via the editor) is the only knob: fraction
  // of canvas area covered by planet ink. ~0.55 packs tightly without
  // overflowing; bump down for breathing room, up for a denser cluster.
  // Layout knobs: Sanity's saved Map Editor settings (at the viewed moment) win
  // over the local edit-toolbar state, so the public map matches the editor's
  // spacing/density. Falls back to the local defaults when Sanity has no settings.
  // Layout lab: Phone 16:9 can follow the DESKTOP layout exactly (same canvas).
  // Then every layout input below is desktop's; only type stays the phone's.
  const fullMirror = llab.active && llab.applied.fullFollowsDesktop && isMobile && !mobileEdit && activeType === "full";
  const layoutMobile = mobileView && !fullMirror;
  const effLiveOf = (sn: ResolvedSanityMap | null) => {
    const effBase = {
      packingDensity: sn?.settings?.packingDensity ?? packingDensity,
      collidePadding: sn?.settings?.collidePadding ?? collidePadding,
      labelSizePx: sn?.settings?.labelSizePx ?? labelSizePx,
      connectionPull: sn?.settings?.connectionPull ?? connectionPull,
      entityRadius: sn?.settings?.entityRadius,
      sizeSpacing: sn?.settings?.sizeSpacing,
      sectorPull: sn?.settings?.sectorPull,
      repulsion: sn?.settings?.repulsion,
    };
    // On a mobile view, the active view type's own settings drive the physics so
    // all planets spread to FILL its frame without overlapping (unplaced ones flow
    // around the pins). Desktop = effBase.
    // Mobile physics: Sanity's SQUARE knobs win when authored (Map Editor → Square
    // mode), so mobile spacing is tunable in the CMS and time-scoped per year like
    // desktop. Until then it falls back to the per-view-type values baked into
    // mobileLayout.ts — i.e. adding the first square override is what moves mobile
    // physics from code to the CMS, and nothing changes before that.
    const sq = sn?.squareSettings;
    return {
      ...effBase,
      ...(layoutMobile
        ? {
            sectorPull: sq?.sectorPull ?? activeSettings.sectorPull,
            collidePadding: sq?.collidePadding ?? activeSettings.collidePadding,
            sizeSpacing: sq?.sizeSpacing ?? activeSettings.sizeSpacing,
            repulsion: sq?.repulsion ?? activeSettings.repulsion,
            // These four have no mobileLayout.ts equivalent, so they fall through
            // to the desktop-authored values exactly as before.
            packingDensity: sq?.packingDensity ?? effBase.packingDensity,
            labelSizePx: sq?.labelSizePx ?? effBase.labelSizePx,
            connectionPull: sq?.connectionPull ?? effBase.connectionPull,
            entityRadius: sq?.entityRadius ?? effBase.entityRadius,
          }
        : {}),
    };
  };
  const effLive = effLiveOf(sanity);

  // ---- Layout lab: knob overrides on top of the live values --------------
  const labMode: DeviceMode = !layoutMobile ? "desktop" : activeType === "square" ? "square" : "full";
  // The live (pre-override) value of every lab knob for this mode + year. Label
  // footprint starts at the ratio the live site already has: its spacing is
  // measured at Sanity's label size while names are drawn at `labelSizePx`.
  const liveKnobsOf = (effLive: ReturnType<typeof effLiveOf>): LayoutKnobs => ({
      packingDensity: effLive.packingDensity,
      collidePadding: effLive.collidePadding,
      sizeSpacing: effLive.sizeSpacing ?? 0,
      sectorPull: effLive.sectorPull ?? 0.035,
      repulsion: effLive.repulsion ?? 0,
      connectionPull: effLive.connectionPull,
      entityRadius: effLive.entityRadius ?? 140,
      gapFill: 0,
      gapMin: 60,
      centerPull: 0,
      labelFootprint: Math.round((effLive.labelSizePx / labelSizePx) * 100) / 100,
      labelLargePx: labelSizePx,
      labelSmallPx: labelSizePx,
      labelStrokePx: 1.2,
      labelThresholdB: 100,
      nameThreshold: layoutMobile ? activeSettings.nameThreshold : 0,
      nameSpacing: 0,
      zoomTypeGrowth: LABEL_GROW_RATE,
      zoomTypeMax: LABEL_GROW_MAX,
      designWidth: layoutMobile ? PHONE_FRAME.w : 1100,
  });
  const liveKnobs = useMemo<LayoutKnobs>(
    () => liveKnobsOf(effLive),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effLive.packingDensity, effLive.collidePadding, effLive.sizeSpacing, effLive.sectorPull, effLive.repulsion, effLive.connectionPull, effLive.entityRadius, effLive.labelSizePx, labelSizePx, layoutMobile, activeSettings.nameThreshold],
  );
  // K = the knobs the map lays out with (debounced); null when the lab is off,
  // which leaves every code path below exactly as it is on the live site.
  const labKnobOverrides = llab.applied.knobs[labMode];
  const K = useMemo<LayoutKnobs | null>(
    () => (llab.active ? resolveKnobs(labKnobOverrides, liveKnobs) : null),
    [llab.active, labKnobOverrides, liveKnobs],
  );
  const { noteLive: labNoteLive } = llab;
  useEffect(() => {
    if (llab.enabled) labNoteLive(labMode, liveKnobs);
  }, [llab.enabled, labNoteLive, labMode, liveKnobs]);
  const effOf = (effLive: ReturnType<typeof effLiveOf>, K: LayoutKnobs | null) =>
    K
      ? {
          ...effLive,
          packingDensity: K.packingDensity,
          collidePadding: K.collidePadding,
          sizeSpacing: K.sizeSpacing,
          sectorPull: K.sectorPull,
          repulsion: K.repulsion,
          connectionPull: K.connectionPull,
          entityRadius: K.entityRadius,
        }
      : effLive;
  const eff = effOf(effLive, K);
  // Tablet = the desktop layout with its own type. In the editor the Device
  // switch decides; for visitors it is the window width (above the phone
  // breakpoint, up to tabletMaxWidth). KT = the knobs names are DRAWN with;
  // K stays the desktop set, so spacing — and the layout — never changes.
  const isTabletWidth = useMediaQuery(`(max-width: ${llab.applied.tabletMaxWidth}px)`);
  const tabletType = !mobileView && (llab.enabled ? llab.device === "tablet" : llab.active && isTabletWidth);
  const tabletOverrides = llab.applied.tablet;
  // Phone 16:9 following desktop: the phone's own type (live phone defaults +
  // its TYPE_KEYS overrides) on top of the desktop layout knobs.
  const fullTypeOverrides = llab.applied.knobs.full;
  const phoneNameThreshold = activeSettings.nameThreshold;
  const KT = useMemo<LayoutKnobs | null>(() => {
    if (!K) return null;
    if (tabletType) return { ...K, ...tabletOverrides };
    if (fullMirror) return { ...K, ...phoneTypeDefaults(labelSizePx, phoneNameThreshold), ...pickTypeKnobs(fullTypeOverrides) };
    return K;
  }, [K, tabletType, tabletOverrides, fullMirror, fullTypeOverrides, labelSizePx, phoneNameThreshold]);
  const labLocked = !!K && llab.applied.lockLayout;
  // Name size as DRAWN (tablet-aware); `labelPxOf` below is the size spacing is measured at.
  // Linear is one strip of planets side by side with room for every name, so
  // every name there uses the LARGE size — the small size is for the crowded map.
  const typePxOf = useCallback(
    (valuation_b: number, isEntity?: boolean) =>
      KT
        ? layoutMode === "linear" || (!isEntity && valuation_b >= KT.labelThresholdB)
          ? KT.labelLargePx
          : KT.labelSmallPx
        : labelSizePx,
    [KT, labelSizePx, layoutMode],
  );
  // Name size for a planet: large or small type either side of the threshold
  // (entities are always small). Lab off → the one live size.
  const labelPxOf = useCallback(
    (valuation_b: number, isEntity?: boolean) =>
      K ? (!isEntity && valuation_b >= K.labelThresholdB ? K.labelLargePx : K.labelSmallPx) : labelSizePx,
    [K, labelSizePx],
  );
  // Dragging planets / sector wells in the lab's Arrange tab.
  const arrange = llab.arrange && !llab.downloadView && layoutMode === "map" && !gameActive;
  // Layout lab → Download, with a fixed arrangement: planets can be dragged to
  // place them IN THE IMAGE ONLY (the online map's layout is not touched).
  const downloadMoves = llab.applied.download.moves;
  const dlArrange = llab.downloadView && llab.applied.download.seed != null && layoutMode === "map" && !gameActive && !mobileView;
  // Layout lab → Download: the desktop map previews the downloaded image — framed
  // as the image frames it, its names at the image's sizes, with the image's
  // overlay drawn on top (see ExportPreviewOverlay).
  const exportPreview = llab.downloadView && layoutMode === "map" && !gameActive && !mobileView;
  // The year Sanity's own data last set each planet's position / each sector's
  // well, as of the year `sn` is resolved at — for the positions and wells the
  // layout lab layers its edits over (see `mobilePinnedOf`, `inputsOf`). A lab
  // edit yields to a later-dated one here (see `positionsAt`).
  const labBaseYearsOf = (sn: ResolvedSanityMap | null) => {
    const pos: Record<string, number> = {};
    const wells: Record<string, number> = {};
    if (!sn) return { positions: pos, sectors: wells };
    if (!layoutMobile) return { positions: sn.since.positions, sectors: sn.since.centers };
    // A phone view, in the order `mobilePinnedOf` stacks its sources.
    const inherits = inheritsFullLayout(activeType);
    if (activeType === "full" || inherits) {
      Object.assign(pos, sn.since.positions);
      Object.assign(wells, sn.since.centers);
      if (inherits) for (const name of Object.keys(mobileLayouts.full.positions)) delete pos[name]; // set in code: undated
    }
    for (const name of Object.keys(activeLayout.positions)) delete pos[name];
    for (const name of Object.keys(mobileSectorCentersOf(null))) delete wells[name];
    if (activeType === "square") {
      if (Object.keys(sn.mobilePositions).length) Object.assign(pos, sn.since.mobilePositions);
      if (Object.keys(sn.mobileCenterBySector).length) {
        for (const name of Object.keys(sn.mobileCenterBySector)) delete wells[name];
        Object.assign(wells, sn.since.mobileCenters);
      }
    }
    return { positions: pos, sectors: wells };
  };
  // Placement + sector-well edits in force at the viewed year.
  const labYear = activeDate.year;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const labBaseYears = useMemo(() => labBaseYearsOf(sanity), [sanity, layoutMobile, activeType, activeLayout, mobileLayouts]);
  const labPositions = useMemo(
    () => (llab.active ? positionsAt(llab.applied, labMode, labYear, labBaseYears.positions) : null),
    [llab.active, llab.applied, labMode, labYear, labBaseYears],
  );
  const labSectors = useMemo(
    () => (llab.active ? sectorsAt(llab.applied, labMode, labYear, labBaseYears.sectors) : {}),
    [llab.active, llab.applied, labMode, labYear, labBaseYears],
  );
  // Text is measured for spacing, so re-measure once the web font has loaded —
  // otherwise a cold load (fallback font) lays out differently from a warm one.
  const [fontEpoch, setFontEpoch] = useState(0);
  useEffect(() => {
    if (!llab.active || typeof document === "undefined" || !document.fonts) return;
    let on = true;
    document.fonts.ready.then(() => {
      if (!on) return;
      clearTextWidthCache();
      setFontEpoch((e) => e + 1);
    });
    return () => {
      on = false;
    };
  }, [llab.active]);

  const anchorDiamOf = (displayed: SheetCompany[], density: number) =>
    computeAnchorDiam(
      displayed.map((c) => c.valuation_b),
      canvas.w * canvas.h,
      density,
      // Mobile view: per-type global planet-size multiplier.
    ) * (mobileView ? activeSettings.scale : 1);
  const anchorDiam = useMemo(
    () => anchorDiamOf(displayedCompanies, eff.packingDensity),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayedCompanies, canvas, eff.packingDensity, mobileView, activeSettings.scale],
  );

  // Natural slide-units-per-pixel at zoom=1 — used to size label-collision
  // radii. We base the layout on the un-zoomed ratio so the same physics
  // arrangement holds across zoom levels (zooming in just makes the existing
  // spacing more generous). Linear mode is height-fitted; map mode is
  // width-fitted, so we pick whichever dimension drives the active viewBox.
  const naturalSlideUnitsPerPx = useMemo(() => {
    if (containerW === 0 || containerH === 0) return 1;
    // Map mode fits with "meet" (contain) → the limiting dimension is whichever
    // ratio is larger. Landscape canvas in a landscape-ish box is width-limited
    // (canvas.w/containerW); the portrait canvas is height-limited.
    return layoutMode === "linear"
      ? canvas.h / containerH
      : Math.max(canvas.w / containerW, canvas.h / containerH);
  }, [layoutMode, canvas, containerW, containerH]);

  // Per-planet label half-extent (slide units). The label is rendered as one
  // word per line, centered on the planet; the bounding rectangle is
  // max-word-width × (lineCount * lineHeight). We take half of the longer
  // dimension as the effective collision radius — using `max(W, H)` not the
  // diagonal so the spacing matches what the eye perceives as "the label
  // reaches this far from center" without overshooting at the corners.
  const lockedMeasure = labLocked && layoutMode !== "linear";
  const labelRadiiOf = (a: {
    displayed: SheetCompany[];
    entities: LayoutInput[] | undefined;
    K: LayoutKnobs | null;
    /** The live label size spacing is measured at when the lab is off. */
    labelSizePx: number;
    anchorDiam: number;
    linear: boolean;
  }) => {
    const { linear, K } = a;
    // Lab "lock layout": measure at the DESIGN width, not the window's, so the
    // spacing — and therefore the whole layout — doesn't depend on window size.
    const locked = !linear && !!K && llab.applied.lockLayout;
    // Slide units per pixel at zoom 1 (see `naturalSlideUnitsPerPx`).
    const natural =
      containerW === 0 || containerH === 0
        ? 1
        : linear
          ? canvas.h / containerH
          : Math.max(canvas.w / containerW, canvas.h / containerH);
    if (!locked && natural === 1 && containerW === 0) return {};
    const result: Record<string, number> = {};
    // LINEAR mode is one horizontal strip, so a label's WIDTH is what decides
    // whether neighbours collide — and it has to be the width actually DRAWN:
    //  • at the rendered font size (the site draws the local `labelSizePx`, scaled
    //    by zoom — not the smaller Sanity-saved size the map-mode physics measures);
    //  • at the CURRENT zoom: labels are a constant pixel size, but Linear's zoom
    //    changes how many slide units a pixel covers (viewBox height = canvas.h /
    //    zoom), so zooming out makes every label wider in layout terms;
    //  • including the 2% name tracking, plus a few px of breathing room.
    // Map mode keeps its existing measurement so the authored layout is unchanged.
    const fontPxFor = (valuation_b: number, isEntity?: boolean) =>
      linear
        ? typePxOf(valuation_b, isEntity) * labelScaleForZoom(zoom, KT?.zoomTypeGrowth, KT?.zoomTypeMax)
        : K
          ? !isEntity && valuation_b >= K.labelThresholdB ? K.labelLargePx : K.labelSmallPx
          : a.labelSizePx;
    const suPerPx =
      linear && containerH > 0 ? canvas.h / zoom / containerH : locked ? canvas.w / K.designWidth : natural;
    const footprint = K && !linear ? K.labelFootprint : 1;
    // Layout lab: a name that never shows at rest (planet under the "hide names
    // under" size) reserves no room. On a phone a hidden name's box is wider
    // than most planets, and reserving one for every planet asks for more
    // space than the canvas has — the solve jams, planets overlap and get
    // shoved off the map.
    const nameCanShow = (valuation_b: number) =>
      !K || linear || K.nameThreshold <= 0 || diameterFor(valuation_b, a.anchorDiam) / suPerPx >= K.nameThreshold;
    const LINEAR_LABEL_PAD_PX = 4;
    const halfExtent = (label: string, extraLines: number, fontPx: number) => {
      const words = label.trim().split(/\s+/);
      const maxWordPx = words.reduce(
        (m, w) => Math.max(m, measureLabelTextWidth(w, fontPx, 500) + (linear ? 0.02 * fontPx * w.length : 0)),
        0,
      );
      if (linear) return (maxWordPx / 2 + LINEAR_LABEL_PAD_PX) * suPerPx;
      // Map mode — match Planet's rendering: lineHeight = 1.0, one word per line;
      // Large Cap planets also render a valuation line, so one extra line of height.
      const heightPx = (words.length + extraLines) * fontPx;
      return (Math.max(maxWordPx, heightPx) / 2) * suPerPx * footprint;
    };
    for (const c of a.displayed) {
      // Linear measures the text that's drawn (the "convert to USD" authoring
      // marker is stripped from the label); map mode keeps measuring the full name.
      const label = linear ? usdFlag(c.name).display : c.name;
      result[c.name] = nameCanShow(c.valuation_b)
        ? halfExtent(label, c.sector === "Large Cap" ? 1 : 0, fontPxFor(c.valuation_b))
        : 0;
    }
    // Text-only entity nodes (Sanity sub-brands) were missing from this map
    // entirely — they got no `labelRadii` entry, so the physics hook fell back to
    // one fixed `entityRadius` constant for every entity regardless of its actual
    // name length. Measure them the same way (entities never show a valuation line).
    // (Lab, mobile: entity names are hidden until zoomed in, so they reserve none either.)
    for (const e of a.entities ?? []) {
      result[e.name] = K && layoutMobile && !linear ? 0 : halfExtent(e.name, 0, fontPxFor(0, true));
    }
    return result;
  };
  const labelRadii = useMemo(
    () =>
      labelRadiiOf({
        displayed: displayedCompanies,
        entities: sanity?.entities,
        K,
        labelSizePx: eff.labelSizePx,
        anchorDiam,
        linear: layoutMode === "linear",
      }),
    // When locked, the window size is deliberately NOT a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayedCompanies, sanity?.entities, eff.labelSizePx, lockedMeasure ? 0 : naturalSlideUnitsPerPx, lockedMeasure ? 0 : containerW, lockedMeasure ? 0 : containerH, layoutMode, zoom, labelSizePx, canvas, K, KT, labelPxOf, typePxOf, lockedMeasure, fontEpoch, anchorDiam, layoutMobile],
  );

  // Adapter: resolve the sheet's companies into map-core's data-source-agnostic
  // LayoutInput (visible-only, with each planet's default center, hue, and style
  // resolved from sectors.ts). The `false` mobile flag keeps desktop sector
  // centers on phones too (temporary mobile plan). Sector overrides win over the
  // default center; a per-company position override (passed via `positions`)
  // then wins over that inside the hook.
  const inputsOf = (a: {
    displayed: SheetCompany[];
    sn: ResolvedSanityMap | null;
    labSectors: Record<string, { x: number; y: number }>;
    desktopCenter: (sector: string) => { x: number; y: number };
    mobileCenters: Record<string, { x: number; y: number }>;
  }): LayoutInput[] => {
    const { sn, labSectors } = a;
    const allSectors = Array.from(new Set(a.displayed.map((c) => c.sector))).sort();
    const unknownSectors = allSectors.filter((s) => !isKnownSector(s));
    // TEMP: only used by the disabled not-live red flag.
    // const activeYearKey = String(activeDate.year);
    const companyInputs = a.displayed
      .filter((c) => enabled.has(c.sector))
      .map((c) => {
        const unknownIdx = unknownSectors.indexOf(c.sector);
        // Mobile 4:5 view: start unplaced planets from the mobile sector centers
        // scaled into the smaller 4:5 canvas (they'll be dragged into place in
        // the editor; hand-placed ones are pinned via `positions`). Otherwise
        // Sanity wins, then local defaults.
        const desktopCenter = () => a.desktopCenter(c.sector);
        let center: { x: number; y: number };
        if (layoutMobile) {
          const well = a.mobileCenters[c.sector];
          if (well) center = well;
          else if (activeType === "full" || inheritsFullLayout(activeType)) center = desktopCenter();
          else {
            // vertical: scale the mobile sector grid into the canvas.
            const c0 = sectorCenterFor(c.sector, unknownIdx, unknownSectors.length, true);
            center = { x: c0.x * (canvas.w / 3000), y: c0.y * (canvas.h / 5000) };
          }
        } else {
          center = desktopCenter();
        }
        center = labSectors[c.sector] ?? center; // layout-lab well move
        // TEMP: not-live red disabled — was:
        // const live = valuationAt(valData, c.slug, activeYearKey) !== undefined;
        // "Convert to USD" authoring marker: strip it from the drawn label. Colour
        // is temporarily white too. `name` stays the full identity for matching.
        const usd = usdFlag(c.name);
        return {
          name: c.name,
          sector: c.sector,
          valuation_b: c.valuation_b,
          center,
          hue: sn?.hueBySector[c.sector] ?? hueForSector(c.sector),
          style: sn ? (sn.styleByName[c.name] ?? null) : planetStyleFor(c.name, c.sector),
          // TEMP: all labels white — USD-flag blue + not-live red disabled for now.
          // Restore with: usd.flag ? USD_FLAG_COLOR : live ? undefined : "#ff6b6b"
          labelColor: undefined,
          ...(usd.flag ? { labelText: usd.display } : {}),
        };
      });
    // Text-only entity nodes (Sanity only), filtered to enabled sectors.
    const entityInputs = (sn?.entities ?? [])
      .filter((e) => enabled.has(e.sector))
      .map((e) => (labSectors[e.sector] ? { ...e, center: labSectors[e.sector] } : e));
    return [...companyInputs, ...entityInputs];
  };
  const inputs = useMemo<LayoutInput[]>(
    () => inputsOf({ displayed: displayedCompanies, sn: sanity, labSectors, desktopCenter: desktopCenterForSector, mobileCenters: mobileSectorCenters }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayedCompanies, enabled, sectorPositions, sanity, valData, activeDate, mobileView, layoutMobile, activeType, canvas, mobileSectorCenters, desktopCenterForSector, labSectors],
  );

  // Connections used for both physics and rendering: Sanity (windowed at T) when
  // configured, else the local edit-state. The edit-mode connection authoring
  // (selection/draw/export) still operates on the local `connections` state.
  const effectiveConnections = sanity ? sanity.connections : connections;

  // Mobile placements as hard pins so planets stay exactly where they're dropped;
  // live drags override via `dragState` in the renderer. Un-authored planets fall
  // back to their sector well + physics — except the FULL view, which falls back
  // to the desktop layout so it starts as the desktop map.
  const mobilePinnedOf = (sn: ResolvedSanityMap | null, mobilePos: Record<string, MobilePosition>) => {
    const out: Record<string, PlanetPosition> = {};
    // Full + the inheriting types (horizontal/square) start from the desktop
    // layout so every planet is placed; horizontal/square then layer full's
    // authored positions on top, and finally this view's own overrides win.
    if (activeType === "full" || inheritsFullLayout(activeType)) {
      const base = sn ? sn.positions : positions;
      for (const [name, p] of Object.entries(base)) out[name] = { ...p };
      if (inheritsFullLayout(activeType)) {
        for (const [name, p] of Object.entries(mobileLayouts.full.positions))
          out[name] = { x: p.x, y: p.y, pin: true };
      }
    }
    for (const [name, p] of Object.entries(mobilePos)) out[name] = { x: p.x, y: p.y, pin: true };
    return out;
  };
  const mobilePinnedPositions = useMemo(
    () => mobilePinnedOf(sanity, mobilePositions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mobilePositions, activeType, sanity, positions, mobileLayouts.full.positions],
  );

  // Mobile view uses the per-type pins; desktop uses Sanity/local. The layout
  // lab's placement edits layer on top (null = freed back to pure physics).
  const basePositions = layoutMobile ? mobilePinnedPositions : sanity ? sanity.positions : positions;
  const withLabPositions = (
    base: Record<string, PlanetPosition>,
    lab: ReturnType<typeof positionsAt> | null,
  ): Record<string, PlanetPosition> => {
    if (!lab || Object.keys(lab).length === 0) return base;
    const out: Record<string, PlanetPosition> = { ...base };
    for (const [name, p] of Object.entries(lab)) {
      if (p) out[name] = { x: p.x, y: p.y, pin: p.pin, hold: p.hold };
      else delete out[name];
    }
    return out;
  };
  const physicsPositions = useMemo<Record<string, PlanetPosition>>(
    () => withLabPositions(basePositions, labPositions),
    [basePositions, labPositions],
  );

  // Layout lab: deterministic solve. A fresh arrangement per page load (held
  // for the whole visit), or the published seed when that is switched off.
  // The downloaded image can use one fixed arrangement of its own (layout lab →
  // Download). While the editor is on that tab, the desktop map shows it.
  const downloadSeed = llab.active ? llab.applied.download.seed : null;
  const previewDownloadSeed = llab.downloadView && downloadSeed != null && !layoutMobile;
  const layoutSeed = K
    ? previewDownloadSeed
      ? downloadSeed
      : llab.applied.shuffleEachLoad
        ? llab.sessionSeed
        : seedFor(llab.applied, labMode)
    : null;
  // Everything that decides the layout on screen (the same shape `yearSpecAt`
  // builds for any other year).
  const liveSolveOpts: SolveLayoutOptions = {
    inputs,
    bounds: physicsBounds,
    positions: physicsPositions,
    anchorDiam,
    collidePadding: eff.collidePadding,
    entityRadius: eff.entityRadius,
    sizeSpacing: eff.sizeSpacing,
    sectorPull: eff.sectorPull,
    repulsion: eff.repulsion,
    labelRadii,
    connections: effectiveConnections,
    connectionStrength: eff.connectionPull,
    seed: layoutSeed,
    // Layout lab: the gap-filling forces.
    centerPull: K?.centerPull,
    gapFill: K?.gapFill,
    gapMin: K?.gapMin,
  };
  const nodes = usePhysicsLayout({
    ...liveSolveOpts,
    viewMode: layoutMode,
    isEditMode: isEditMode || mobileEdit,
    restartToken: physicsBump,
    resettleToken,
    flyIntroToken,
    layoutKey: String(activeDate.year),
    suspended: gameActive,
    // Switching year: if the Time Machine has already solved this exact layout
    // in the background, use it rather than solving it again on the spot.
    presolved: () => (K ? solvedLayoutFor(activeDate.year, liveSolveOpts) : null),
    // Under the Time Machine the map isn't visible, so a year switch just lands.
    instant: timelineOpen,
  });
  // ---- Time Machine: each year's real layout ------------------------------
  // The solve options for ANY year, built by the same helpers the live map
  // uses for the year on screen (so for that year they are identical).
  const yearSpecAt = (date: MapDate): SolveLayoutOptions | null => {
    if (baseCompanies.length === 0) return null;
    const sn = sanityDocs ? resolveSanityMapAt(sanityDocs, makeMoment(date.year, date.month)) : null;
    const base = baseCompaniesOf(sn);
    const displayed = displayedOf(base, sn, date);
    const effLiveY = effLiveOf(sn);
    const Ky = llab.active ? resolveKnobs(labKnobOverrides, liveKnobsOf(effLiveY)) : null;
    const effY = effOf(effLiveY, Ky);
    const anchorY = anchorDiamOf(displayed, effY.packingDensity);
    const unknown = Array.from(new Set(base.map((c) => c.sector))).filter((x) => !isKnownSector(x)).sort();
    const basePos = layoutMobile ? mobilePinnedOf(sn, mobilePositionsOf(sn)) : sn ? sn.positions : positions;
    const baseYears = labBaseYearsOf(sn);
    return {
      inputs: inputsOf({
        displayed,
        sn,
        labSectors: llab.active ? sectorsAt(llab.applied, labMode, date.year, baseYears.sectors) : {},
        desktopCenter: desktopCenterOf(sn, unknown),
        mobileCenters: mobileSectorCentersOf(sn),
      }),
      bounds: physicsBounds,
      positions: withLabPositions(basePos, llab.active ? positionsAt(llab.applied, labMode, date.year, baseYears.positions) : null),
      anchorDiam: anchorY,
      collidePadding: effY.collidePadding,
      entityRadius: effY.entityRadius,
      sizeSpacing: effY.sizeSpacing,
      sectorPull: effY.sectorPull,
      repulsion: effY.repulsion,
      labelRadii: labelRadiiOf({ displayed, entities: sn?.entities, K: Ky, labelSizePx: effY.labelSizePx, anchorDiam: anchorY, linear: false }),
      connections: sn ? sn.connections : connections,
      connectionStrength: effY.connectionPull,
      seed: layoutSeed,
      centerPull: Ky?.centerPull,
      gapFill: Ky?.gapFill,
      gapMin: Ky?.gapMin,
    };
  };
  // A new object whenever something `yearSpecAt` reads has changed. The solver
  // then re-checks every year; a year whose inputs turn out the same comes
  // straight from its cache.
  const yearSpecStamp = useMemo(
    () => ({}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      sanityDocs, companies, sheetValByName, valData, hiddenByYear, currentDate, baseCompanies.length > 0, enabled,
      sectorPositions, positions, connections, canvas, physicsBounds, llab.active, llab.applied, labMode, layoutSeed,
      layoutMobile, mobileView, activeType, activeLayout, mobileLayouts, packingDensity, collidePadding, labelSizePx,
      connectionPull, fontEpoch, labLocked ? 0 : containerW, labLocked ? 0 : containerH,
    ],
  );
  useYearLayoutSolver({
    dates: dateRange,
    specAt: yearSpecAt,
    stamp: yearSpecStamp,
    // Ahead of time on desktop, so the Time Machine opens with its maps ready;
    // on a phone only once it is opened (the solve is heavier there). Never
    // while authoring, where the layout is being dragged around live.
    prefetch: !isMobile && !isEditMode && !mobileEdit && !gameActive,
    urgent: timelineOpen,
    // Closed, the Time Machine will open on last year — solve outward from there.
    focusYear: timelineOpen ? timelineFocus.year : currentDate.year - 1,
  });

  useEffect(() => {
    exploreGrowReadyRef.current = !!K && layoutMode === "map";
  }, [K, layoutMode]);
  // "Explore this map" hand-over: the focused thumbnail grows to exactly where
  // the real map's canvas sits while the real map grows from the thumbnail's
  // place in step with it, so the two coincide the whole way and simply
  // cross-fade. The map comes up first (underneath); then the thumbnail fades
  // off it, which is what brings the names in.
  const mapLayerRef = useRef<HTMLDivElement | null>(null);
  const exploreMs = tm.tuning.exploreMs;
  useEffect(() => {
    if (!exploring) return;
    const anims: Animation[] = [];
    let raf = 0;
    let raf2 = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setTimelineOpen(false);
      // The map layer's own opacity is back to 1 a frame or two after that; only
      // then let go of the animations that were holding it.
      raf = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          for (const a of anims) a.cancel();
          setExploring(null);
        });
      });
    };
    const start = () => {
      const layer = mapLayerRef.current;
      const ctm = mapSvgRef.current?.getScreenCTM();
      const box = document.querySelector<HTMLElement>("[data-tm-focus-map]");
      const thumbSvg = box?.querySelector("svg");
      if (!layer || !ctm || !box || !thumbSvg) return finish();
      // Where the canvas sits on screen in the real map, and in the thumbnail.
      const p0 = new DOMPoint(canvas.x, canvas.y).matrixTransform(ctm);
      const p1 = new DOMPoint(canvas.x + canvas.w, canvas.y + canvas.h).matrixTransform(ctm);
      const big = { x: p0.x, y: p0.y, w: p1.x - p0.x, h: p1.y - p0.y };
      // (The thumbnail may be cropped — a taller or shorter box — so its canvas
      // is measured the same way rather than taken from the box.)
      const tctm = thumbSvg.getScreenCTM();
      if (!tctm) return finish();
      const q0 = new DOMPoint(canvas.x, canvas.y).matrixTransform(tctm);
      const q1 = new DOMPoint(canvas.x + canvas.w, canvas.y + canvas.h).matrixTransform(tctm);
      const small = { left: q0.x, top: q0.y, width: q1.x - q0.x, height: q1.y - q0.y };
      const L = layer.getBoundingClientRect();
      if (big.w <= 0 || small.width <= 0) return finish();
      const s = small.width / big.w; // real map → thumbnail size
      const timing: KeyframeAnimationOptions = { duration: exploreMs, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "both" };
      // The real map: starts shrunk onto the thumbnail, ends at rest. Only
      // transform + opacity are animated — the same as the thumbnail — so the
      // browser runs both off the main thread, on one clock, and they stay
      // locked together (anything else, e.g. a clip, would let one lag).
      const dx = small.left - L.left - (big.x - L.left) * s;
      const dy = small.top - L.top - (big.y - L.top) * s;
      anims.push(layer.animate(
        [
          { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0, offset: 0 },
          { opacity: 1, offset: 0.4 },
          { transformOrigin: "0 0", transform: "translate(0px, 0px) scale(1)", opacity: 1, offset: 1 },
        ],
        timing,
      ));
      // The thumbnail: grows about its centre onto the real map's canvas.
      const cur = new DOMMatrix(getComputedStyle(box).transform).a || 1;
      const tx = big.x + big.w / 2 - (small.left + small.width / 2);
      const ty = big.y + big.h / 2 - (small.top + small.height / 2);
      const grow = box.animate(
        [
          { transform: `translate(0px, 0px) scale(${cur})`, opacity: 1, offset: 0 },
          { opacity: 1, offset: 0.4 },
          { transform: `translate(${tx}px, ${ty}px) scale(${cur / s})`, opacity: 0, offset: 1 },
        ],
        timing,
      );
      anims.push(grow);
      grow.onfinish = finish;
    };
    // Two frames on: the map has been re-laid-out for the explored year by then.
    raf = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(start);
    });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(raf2);
      for (const a of anims) a.cancel();
    };
    // Runs once per Explore; the geometry is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploring]);

  // In linear mode the strip extends to the right of the canvas; compute the
  // total slide-coord width so the SVG can be sized wider than the viewport
  // and a horizontal scrollbar appears.
  const linearStripSlideWidth = useMemo(() => {
    if (layoutMode !== "linear") return canvas.w;
    let maxRight = canvas.x + canvas.w;
    for (const n of nodes) {
      const right = n.x + Math.max(n.r, n.labelRadius ?? 0) + 80;
      if (right > maxRight) maxRight = right;
    }
    return Math.max(canvas.w, maxRight - canvas.x);
  }, [nodes, layoutMode, canvas]);

  // measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setContainerW(rect.width);
      setContainerH(rect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const exportMapScale = llab.active ? llab.applied.download.mapScale : DEFAULT_EXPORT_PANEL.mapScale;
  const exportImageW = exportImageWidth(llab.active ? llab.applied.download : DEFAULT_EXPORT_PANEL);
  const exportOffsetX = llab.active ? llab.applied.download.mapOffsetX : DEFAULT_EXPORT_PANEL.mapOffsetX;
  const view = useMemo(() => {
    // Both desktop and the mobile 4:5 view frame the whole canvas ("meet"), so
    // the 4:5 view shows the entire portrait frame (fits the measured region on
    // a phone; letterboxed in the wide desktop editor).
    if (exportPreview && containerW > 0 && containerH > 0) {
      // Previewing the image: the canvas is drawn exactly as the image draws it
      // in the 16:9 frame inside the map area (centred; its own zoom and pan
      // wait until the preview is off).
      const f = exportPreviewFrame(containerW, containerH, exportImageW);
      const pxPerUnit = (f.h * exportMapScale) / canvas.h;
      const z = pxPerUnit / Math.min(containerW / canvas.w, containerH / canvas.h);
      const w = canvas.w / z;
      const h = canvas.h / z;
      // Slid sideways: the view's centre moves the other way, by the same
      // distance in slide units (the image's px per unit at this map size).
      const slide = exportOffsetX / exportPxPerUnit(exportMapScale);
      return { x: canvas.x + (canvas.w - w) / 2 - slide, y: canvas.y + (canvas.h - h) / 2, w, h };
    }
    const w = canvas.w / zoom;
    const h = canvas.h / zoom;
    const cx = canvas.x + canvas.w / 2 + pan.x;
    const cy = canvas.y + canvas.h / 2 + pan.y;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }, [zoom, pan, canvas, exportPreview, exportMapScale, exportImageW, exportOffsetX, containerW, containerH]);

  // Linear mode and map mode use different viewBox geometry, so the
  // slide-units-per-pixel ratio (used to size labels, strokes, glows, etc. so
  // they stay visually constant at any zoom) has to be derived from whichever
  // viewBox is actually live. In linear mode the viewBox height = canvas.h/zoom
  // and is height-fitted to containerH, so slideUnitsPerPx = canvas.h/(containerH*zoom).
  const slideUnitsPerPx =
    layoutMode === "linear"
      ? containerH > 0 ? canvas.h / (containerH * zoom) : 1
      : containerW > 0 && containerH > 0
        ? Math.max(view.w / containerW, view.h / containerH) // "meet": limiting ratio
        : 1;

  // Drag-to-pan (no auto-recenter on release — felt distracting).
  const dragRef = useRef<{ startX: number; startY: number; pan0: { x: number; y: number } } | null>(null);
  // True once the cursor has moved beyond DRAG_THRESHOLD_PX from mousedown.
  // Consumed by the planet onClick so that drag gestures don't accidentally
  // fire the focus-zoom interaction on a planet under the cursor.
  const didDragRef = useRef(false);
  // Set when a planet is clicked, so the click bubbling up to the map container
  // isn't treated as a background click (which closes the panel + zooms out).
  const bgClickSuppressRef = useRef(false);
  const DRAG_THRESHOLD_PX = 4;
  // Timestamp of the last touch event. Browsers fire *emulated* mouse events
  // after touches; the touch handlers own pan/pinch, so the mouse handlers
  // ignore anything within ~600ms of a touch (the emulated CLICK still fires,
  // so tap-to-focus keeps working). See onTouch* below.
  const lastTouchRef = useRef(0);
  const isSyntheticMouse = () => performance.now() - lastTouchRef.current < 600;

  const onMouseDown = (e: React.MouseEvent) => {
    if (isSyntheticMouse()) return;
    cancelZoomAnim();
    dragRef.current = { startX: e.clientX, startY: e.clientY, pan0: { ...pan } };
    didDragRef.current = false;
    (e.currentTarget as HTMLElement).style.cursor = "grabbing";
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (isSyntheticMouse()) return;
    // While drawing a connection, track the cursor in slide coords so the
    // rubber-band line can follow the pointer to the next planet.
    if (connectMode && connectFrom !== null && containerRef.current && containerW > 0) {
      const rect = containerRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setConnectCursor({
        x: view.x + (mx / rect.width) * view.w,
        y: view.y + (my / rect.height) * view.h,
      });
    }
    // Sector drag wins over planet drag wins over pan.
    if (sectorDragRef.current && containerW > 0) {
      const screenDx = e.clientX - sectorDragRef.current.startScreenX;
      const screenDy = e.clientY - sectorDragRef.current.startScreenY;
      if (!didDragRef.current && Math.hypot(screenDx, screenDy) > DRAG_THRESHOLD_PX) {
        didDragRef.current = true;
      }
      const newX = sectorDragRef.current.startSlideX + screenDx * slideUnitsPerPx;
      const newY = sectorDragRef.current.startSlideY + screenDy * slideUnitsPerPx;
      setSectorDragState({ name: sectorDragRef.current.name, x: newX, y: newY });
      return;
    }
    // Planet drag in edit mode takes precedence over canvas pan.
    if (planetDragRef.current && containerW > 0) {
      const screenDx = e.clientX - planetDragRef.current.startScreenX;
      const screenDy = e.clientY - planetDragRef.current.startScreenY;
      if (!didDragRef.current && Math.hypot(screenDx, screenDy) > DRAG_THRESHOLD_PX) {
        didDragRef.current = true;
      }
      const newX = planetDragRef.current.startSlideX + screenDx * slideUnitsPerPx;
      const newY = planetDragRef.current.startSlideY + screenDy * slideUnitsPerPx;
      setDragState({ name: planetDragRef.current.name, x: newX, y: newY });
      return;
    }
    if (!dragRef.current || containerW === 0) return;
    const screenDx = e.clientX - dragRef.current.startX;
    const screenDy = e.clientY - dragRef.current.startY;
    if (!didDragRef.current && Math.hypot(screenDx, screenDy) > DRAG_THRESHOLD_PX) {
      didDragRef.current = true;
    }
    const dx = screenDx * slideUnitsPerPx;
    const dy = screenDy * slideUnitsPerPx;
    setPan({ x: dragRef.current.pan0.x - dx, y: dragRef.current.pan0.y - dy });
  };
  const onMouseUp = (e: React.MouseEvent) => {
    if (isSyntheticMouse()) return;
    // Commit a sector-well drag (if active). Mobile editor → 4:5 wells; else
    // the desktop sector-position overrides.
    if (sectorDragRef.current && sectorDragState && didDragRef.current) {
      const name = sectorDragRef.current.name;
      const pos = { x: Math.round(sectorDragState.x), y: Math.round(sectorDragState.y) };
      if (arrange) llab.setSector(labMode, labYear, name, pos);
      else if (mobileEdit) updateActiveLayout((l) => ({ ...l, sectorCenters: { ...l.sectorCenters, [name]: pos } }));
      else setSectorPositions((prev) => ({ ...prev, [name]: pos }));
    }
    sectorDragRef.current = null;
    setSectorDragState(null);
    // Commit a planet drag (if active). In the mobile editor it writes the 4:5
    // placement; otherwise the desktop positions.
    if (planetDragRef.current && dragState && didDragRef.current) {
      const name = planetDragRef.current.name;
      const x = Math.round(dragState.x);
      const y = Math.round(dragState.y);
      if (dlArrange) {
        llab.setDownloadMove(name, { x, y });
      } else if (arrange) {
        // Seat the node at the drop point first, so the re-solve tweens the
        // neighbours around it instead of flying this planet back in.
        const dropped = nodes.find((n) => n.name === name);
        if (dropped) {
          dropped.x = x;
          dropped.y = y;
        }
        // A held planet keeps its hold at the new spot; anything else is pinned.
        const held = !!physicsPositions[name]?.hold;
        llab.setPosition(labMode, labYear, name, held ? { x, y, pin: false, hold: true } : { x, y, pin: true });
      } else if (mobileEdit) {
        updateActiveLayout((l) => ({ ...l, positions: { ...l.positions, [name]: { x, y } } }));
      } else {
        setPositions((prev) => ({
          ...prev,
          [name]: { x, y, pin: prev[name]?.pin ?? false },
        }));
      }
    }
    planetDragRef.current = null;
    setDragState(null);
    dragRef.current = null;
    (e.currentTarget as HTMLElement).style.cursor = "grab";
  };

  // ---- Touch (mobile): 1-finger pan, 2-finger pinch-zoom ------------------
  // A tap (no move) falls through to the browser's emulated click, so the
  // existing planet/background onClick handles tap-to-focus + tap-to-zoom-out.
  // `touch-action: none` on the container disables native scroll/zoom so these
  // gestures are ours. Edit-mode planet dragging stays mouse-only (desktop).
  const TOUCH_DRAG_THRESHOLD_PX = 8;
  const touchRef = useRef<
    | { mode: "pan"; startX: number; startY: number; pan0: { x: number; y: number } }
    | { mode: "pinch"; dist0: number; zoom0: number; midX: number; midY: number; slideX: number; slideY: number }
    | null
  >(null);
  const touchDist = (t: React.TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const beginPan = (t: React.Touch) => {
    touchRef.current = { mode: "pan", startX: t.clientX, startY: t.clientY, pan0: { ...pan } };
  };
  const beginPinch = (touches: React.TouchList) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const midX = (touches[0].clientX + touches[1].clientX) / 2 - rect.left;
    const midY = (touches[0].clientY + touches[1].clientY) / 2 - rect.top;
    touchRef.current = {
      mode: "pinch",
      dist0: touchDist(touches) || 1,
      zoom0: zoom,
      midX,
      midY,
      // The slide point under the pinch center, held fixed as we scale.
      slideX: view.x + (midX / rect.width) * view.w,
      slideY: view.y + (midY / rect.height) * view.h,
    };
    didDragRef.current = true; // a pinch is never a tap
  };
  const onTouchStart = (e: React.TouchEvent) => {
    lastTouchRef.current = performance.now();
    cancelZoomAnim();
    didDragRef.current = false;
    if (e.touches.length >= 2) beginPinch(e.touches);
    else beginPan(e.touches[0]);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    lastTouchRef.current = performance.now();
    const st = touchRef.current;
    if (!st || containerW === 0 || !containerRef.current) return;
    if (st.mode === "pinch" && e.touches.length >= 2) {
      const rect = containerRef.current.getBoundingClientRect();
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, st.zoom0 * (touchDist(e.touches) / st.dist0)));
      const newW = canvas.w / newZoom;
      const newH = canvas.h / newZoom;
      const newCx = st.slideX + (0.5 - st.midX / rect.width) * newW;
      const newCy = st.slideY + (0.5 - st.midY / rect.height) * newH;
      const cf = centerFactorForZoom(newZoom);
      setZoom(newZoom);
      setPan({ x: (newCx - (canvas.x + canvas.w / 2)) * cf, y: (newCy - (canvas.y + canvas.h / 2)) * cf });
    } else if (st.mode === "pan" && e.touches.length === 1) {
      const t = e.touches[0];
      const screenDx = t.clientX - st.startX;
      const screenDy = t.clientY - st.startY;
      if (!didDragRef.current && Math.hypot(screenDx, screenDy) > TOUCH_DRAG_THRESHOLD_PX) didDragRef.current = true;
      setPan({ x: st.pan0.x - screenDx * slideUnitsPerPx, y: st.pan0.y - screenDy * slideUnitsPerPx });
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    lastTouchRef.current = performance.now();
    // Fingers remaining? Re-seat the gesture so lifting one of two doesn't jump.
    if (e.touches.length >= 2) beginPinch(e.touches);
    else if (e.touches.length === 1) beginPan(e.touches[0]);
    else touchRef.current = null;
  };

  // Begin a planet drag in edit mode. Called from Planet's onMouseDown.
  const onPlanetDragStart = (node: PlanetNode, e: React.MouseEvent) => {
    if (!isEditMode && !mobileEdit && !arrange && !dlArrange) return;
    e.stopPropagation();
    cancelZoomAnim();
    planetDragRef.current = {
      name: node.name,
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      startSlideX: node.x,
      startSlideY: node.y,
    };
    didDragRef.current = false;
    setSelectedPlanet(node.name);
  };
  // Begin a sector-marker drag in edit mode.
  const onSectorDragStart = (
    sectorName: string,
    centerX: number,
    centerY: number,
    e: React.MouseEvent,
  ) => {
    if (!isEditMode && !mobileEdit && !arrange) return;
    e.stopPropagation();
    cancelZoomAnim();
    sectorDragRef.current = {
      name: sectorName,
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      startSlideX: centerX,
      startSlideY: centerY,
    };
    didDragRef.current = false;
  };

  // ---- Editor actions ----
  const togglePin = (name: string) => {
    setPositions((prev) => {
      const existing = prev[name];
      if (existing) {
        return { ...prev, [name]: { ...existing, pin: !existing.pin } };
      }
      // No override yet: pin at the planet's current physics-resolved position.
      const node = nodes.find((n) => n.name === name);
      if (!node) return prev;
      return {
        ...prev,
        [name]: { x: Math.round(node.x), y: Math.round(node.y), pin: true },
      };
    });
  };
  const clearPosition = (name: string) => {
    setPositions((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };
  const resetPositions = () => {
    setPositions({ ...COMPANY_POSITIONS });
    setSelectedPlanet(null);
  };
  const exportPositionsAsCode = (): string => {
    const entries = Object.entries(positions)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, p]) => {
        const pinPart = p.pin ? ", pin: true" : "";
        return `  ${JSON.stringify(name)}: { x: ${Math.round(p.x)}, y: ${Math.round(p.y)}${pinPart} },`;
      })
      .join("\n");
    return `// Generated by the in-app design mode. Replace COMPANY_POSITIONS in src/layout.ts with this.\nexport const COMPANY_POSITIONS: Record<string, PlanetPosition> = {\n${entries}\n};\n`;
  };
  const saveToClipboard = async () => {
    const code = exportPositionsAsCode();
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Fallback if clipboard API is unavailable — just log so the user can copy manually.
      console.log(code);
    }
  };
  const saveAsDownload = () => {
    const code = exportPositionsAsCode();
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "company_positions.ts";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---- Mobile editor export ----
  // Emits the whole per-type MOBILE_LAYOUTS object (paste over it in
  // src/mobileLayout.ts).
  const exportMobileLayoutAsCode = () => {
    const rec = (obj: Record<string, { x: number; y: number }>, indent: string) =>
      Object.entries(obj)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, p]) => `${indent}${JSON.stringify(name)}: { x: ${Math.round(p.x)}, y: ${Math.round(p.y)} },`)
        .join("\n");
    const typeBlock = (t: MobileViewType) => {
      const l = mobileLayouts[t];
      const s = l.settings;
      return (
        `  ${t}: {\n` +
        `    settings: { scale: ${s.scale.toFixed(3)}, collidePadding: ${Math.round(s.collidePadding)}, ` +
        `sizeSpacing: ${s.sizeSpacing.toFixed(3)}, repulsion: ${Math.round(s.repulsion)}, ` +
        `sectorPull: ${s.sectorPull.toFixed(3)}, nameThreshold: ${Math.round(s.nameThreshold)} },\n` +
        `    sectorCenters: {\n${rec(l.sectorCenters, "      ")}\n    },\n` +
        `    positions: {\n${rec(l.positions, "      ")}\n    },\n` +
        `  },`
      );
    };
    return (
      `// Generated by ?edit=mobile. Paste over MOBILE_LAYOUTS in src/mobileLayout.ts.\n` +
      `export const MOBILE_LAYOUTS: Record<MobileViewType, MobileLayout> = {\n` +
      MOBILE_VIEW_TYPES.map(typeBlock).join("\n") +
      `\n};\n`
    );
  };
  const saveMobileToClipboard = async () => {
    const code = exportMobileLayoutAsCode();
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      console.log(code);
    }
  };
  const saveMobileAsDownload = () => {
    const blob = new Blob([exportMobileLayoutAsCode()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mobileLayout.ts";
    a.click();
    URL.revokeObjectURL(url);
  };
  // Reset the ACTIVE view type's layout to the on-disk default.
  const resetMobilePositions = () =>
    updateActiveLayout(() => {
      const d = MOBILE_LAYOUTS[activeType];
      return { settings: { ...d.settings }, positions: { ...d.positions }, sectorCenters: { ...d.sectorCenters } };
    });
  const clearMobilePosition = (name: string) =>
    updateActiveLayout((l) => {
      const positions = { ...l.positions };
      delete positions[name];
      return { ...l, positions };
    });

  // True when in-memory positions differ from the on-disk source.
  const isDirty = useMemo(() => {
    const keys = new Set([...Object.keys(positions), ...Object.keys(COMPANY_POSITIONS)]);
    for (const k of keys) {
      const a = positions[k];
      const b = COMPANY_POSITIONS[k];
      if (!a !== !b) return true;
      if (a && b && (a.x !== b.x || a.y !== b.y || !!a.pin !== !!b.pin)) return true;
    }
    return false;
  }, [positions]);

  // ---- Sector position editor actions ----
  const resetSectorPositions = () => setSectorPositions({});
  const saveSectorsToClipboard = async () => {
    // Output the FULL SECTOR_CENTERS map (originals merged with overrides)
    // in a paste-ready TS block.
    const merged: Record<string, { x: number; y: number }> = {
      ...SECTOR_CENTERS,
      ...sectorPositions,
    };
    const entries = Object.entries(merged)
      .map(
        ([name, p]) =>
          `  ${JSON.stringify(name)}: { x: ${Math.round(p.x)}, y: ${Math.round(p.y)} },`,
      )
      .join("\n");
    const code = `// Generated by the in-app design mode. Replace SECTOR_CENTERS in src/sectors.ts with this.\nexport const SECTOR_CENTERS: Record<string, { x: number; y: number }> = {\n${entries}\n};\n`;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      console.log(code);
    }
  };

  // ---- Connection editor actions ----
  // A planet was clicked while in connect mode. First click picks the source;
  // second click (a different planet) creates the connection and selects it.
  const handleConnectClick = (name: string) => {
    if (connectFrom === null) {
      setConnectFrom(name);
      return;
    }
    if (connectFrom === name) {
      // Clicking the same planet twice cancels the in-progress connection.
      setConnectFrom(null);
      return;
    }
    // Avoid duplicate lines between the same pair (in either direction).
    const exists = connections.some(
      c =>
        (c.from === connectFrom && c.to === name) ||
        (c.from === name && c.to === connectFrom),
    );
    if (!exists) {
      setConnections(prev => [
        ...prev,
        { from: connectFrom, to: name, style: "solid", description: "" },
      ]);
      setSelectedConnIdx(connections.length);
    }
    setConnectFrom(null);
    setConnectMode(false);
  };
  const toggleConnectMode = () => {
    setConnectMode(prev => {
      const next = !prev;
      if (!next) setConnectFrom(null);
      return next;
    });
    setSelectedConnIdx(null);
  };
  const updateSelectedConn = (patch: Partial<Connection>) => {
    if (selectedConnIdx === null) return;
    setConnections(prev =>
      prev.map((c, i) => (i === selectedConnIdx ? { ...c, ...patch } : c)),
    );
  };
  const deleteSelectedConn = () => {
    if (selectedConnIdx === null) return;
    setConnections(prev => prev.filter((_, i) => i !== selectedConnIdx));
    setSelectedConnIdx(null);
  };
  const resetConnections = () => {
    setConnections(COMPANY_CONNECTIONS.map(c => ({ ...c })));
    setSelectedConnIdx(null);
    setConnectFrom(null);
    setConnectMode(false);
  };
  const exportConnectionsAsCode = (): string => {
    const entries = connections
      .map(
        c =>
          `  { from: ${JSON.stringify(c.from)}, to: ${JSON.stringify(c.to)}, style: ${JSON.stringify(c.style)}, description: ${JSON.stringify(c.description)} },`,
      )
      .join("\n");
    return `// Generated by the in-app design mode. Replace COMPANY_CONNECTIONS in src/connections.ts with this.\nexport const COMPANY_CONNECTIONS: Connection[] = [\n${entries}\n];\n`;
  };
  const saveConnectionsToClipboard = async () => {
    const code = exportConnectionsAsCode();
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      console.log(code);
    }
  };
  const saveConnectionsAsDownload = () => {
    const code = exportConnectionsAsCode();
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "company_connections.ts";
    a.click();
    URL.revokeObjectURL(url);
  };
  // True when in-memory connections differ from the on-disk source.
  const connectionsDirty = useMemo(() => {
    if (connections.length !== COMPANY_CONNECTIONS.length) return true;
    return connections.some((c, i) => {
      const b = COMPANY_CONNECTIONS[i];
      return (
        !b ||
        c.from !== b.from ||
        c.to !== b.to ||
        c.style !== b.style ||
        c.description !== b.description
      );
    });
  }, [connections]);

  // Effective sector center: in-memory override wins over the on-disk value.
  // Used by both the physics layer and the sector-label / draggable-marker
  // renderers so they all agree on where each sector lives.
  const effectiveSectorCenter = (
    sector: string,
    unknownIdx: number,
    unknownTotal: number,
  ): { x: number; y: number } => {
    const override = sectorPositions[sector];
    if (override) return override;
    // Desktop centers on mobile too (temporary mobile plan — see canvas above).
    return sectorCenterFor(sector, unknownIdx, unknownTotal, false);
  };

  // LINEAR: let a vertical wheel scroll the strip sideways. The strip hides
  // vertical overflow and the page doesn't scroll, so a mouse wheel (which only
  // emits deltaY) previously did nothing — only trackpad sideways swipes and
  // shift+wheel worked. Horizontal-dominant deltas are left to native scrolling
  // so trackpad gestures keep their momentum. Registered natively with
  // `passive: false` because React marks wheel listeners passive, which would
  // make preventDefault() a no-op plus a console warning.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || layoutMode !== "linear") return;
    const onWheelNative = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // sideways → native
      // deltaMode: 0 = pixels, 1 = lines (Firefox mouse wheels), 2 = pages.
      const step = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? el.clientWidth : 1;
      el.scrollLeft += e.deltaY * step;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheelNative, {passive: false});

    // Touch: the strip's own sideways swipe is native (`touch-action: pan-x`).
    // A mostly VERTICAL swipe — the natural "scroll on" gesture on a phone —
    // would do nothing, so it drives the strip too: up moves on, down goes
    // back, with a little momentum when the finger lifts.
    let touch: { id: number; x0: number; y0: number; left0: number; axis: "x" | "y" | null; lastY: number; lastT: number; v: number } | null = null;
    let coast = 0;
    const stopCoast = () => {
      if (coast) cancelAnimationFrame(coast);
      coast = 0;
    };
    const onTouchStartNative = (e: TouchEvent) => {
      stopCoast();
      if (e.touches.length !== 1) {
        touch = null;
        return;
      }
      const p = e.touches[0];
      touch = { id: p.identifier, x0: p.clientX, y0: p.clientY, left0: el.scrollLeft, axis: null, lastY: p.clientY, lastT: e.timeStamp, v: 0 };
    };
    const onTouchMoveNative = (e: TouchEvent) => {
      if (!touch) return;
      const p = Array.from(e.touches).find((q) => q.identifier === touch!.id);
      if (!p) return;
      const dx = p.clientX - touch.x0;
      const dy = p.clientY - touch.y0;
      if (touch.axis === null) {
        if (Math.hypot(dx, dy) < 8) return;
        touch.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
        // Start from where the strip is NOW (it may have moved under a sideways start).
        touch.left0 = el.scrollLeft;
        touch.y0 = p.clientY;
        touch.lastY = p.clientY;
        touch.lastT = e.timeStamp;
        return;
      }
      if (touch.axis !== "y") return; // sideways → native scrolling
      if (e.cancelable) e.preventDefault();
      el.scrollLeft = touch.left0 - (p.clientY - touch.y0);
      const dt = Math.max(1, e.timeStamp - touch.lastT);
      touch.v = touch.v * 0.6 + ((p.clientY - touch.lastY) / dt) * 0.4; // px/ms, smoothed
      touch.lastY = p.clientY;
      touch.lastT = e.timeStamp;
    };
    const onTouchEndNative = (e: TouchEvent) => {
      const t = touch;
      touch = null;
      if (!t || t.axis !== "y" || e.timeStamp - t.lastT > 120) return; // paused before lifting → no momentum
      let v = t.v;
      let last = performance.now();
      const step = (now: number) => {
        const dt = Math.min(40, now - last);
        last = now;
        el.scrollLeft -= v * dt;
        v *= Math.pow(0.95, dt / 16.7);
        coast = Math.abs(v) > 0.02 ? requestAnimationFrame(step) : 0;
      };
      if (Math.abs(v) > 0.05) coast = requestAnimationFrame(step);
    };
    el.addEventListener("touchstart", onTouchStartNative, {passive: true});
    el.addEventListener("touchmove", onTouchMoveNative, {passive: false});
    el.addEventListener("touchend", onTouchEndNative, {passive: true});
    el.addEventListener("touchcancel", onTouchEndNative, {passive: true});
    return () => {
      stopCoast();
      el.removeEventListener("wheel", onWheelNative);
      el.removeEventListener("touchstart", onTouchStartNative);
      el.removeEventListener("touchmove", onTouchMoveNative);
      el.removeEventListener("touchend", onTouchEndNative);
      el.removeEventListener("touchcancel", onTouchEndNative);
    };
  }, [layoutMode]);

  const onWheel = (e: React.WheelEvent) => {
    // Pinch-to-zoom only: trackpad pinch sends a wheel event with ctrlKey set.
    // Plain two-finger scroll (no ctrlKey) is ignored, so it never zooms the map.
    if (!containerRef.current || !e.ctrlKey) return;
    cancelZoomAnim();
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const slideX = view.x + (mx / rect.width) * view.w;
    const slideY = view.y + (my / rect.height) * view.h;
    const factor = Math.exp(-e.deltaY * 0.01); // proportional to the pinch amount
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    if (newZoom === zoom) return;
    const newW = canvas.w / newZoom;
    const newH = canvas.h / newZoom;
    const newCx = slideX + (0.5 - mx / rect.width) * newW;
    const newCy = slideY + (0.5 - my / rect.height) * newH;
    // Ease the pan toward center as we approach the fully-zoomed-out level.
    const cf = centerFactorForZoom(newZoom);
    setZoom(newZoom);
    setPan({ x: (newCx - (canvas.x + canvas.w / 2)) * cf, y: (newCy - (canvas.y + canvas.h / 2)) * cf });
  };

  const zoomRafRef = useRef<number | null>(null);
  const cancelZoomAnim = () => {
    if (zoomRafRef.current !== null) {
      cancelAnimationFrame(zoomRafRef.current);
      zoomRafRef.current = null;
    }
  };
  useEffect(() => cancelZoomAnim, []);

  // Block the browser from pinch-zooming the whole page (which crops the fixed
  // UI). Trackpad pinch fires a wheel event with ctrlKey set; we preventDefault
  // that via a NON-passive listener (React's onWheel is passive and can't). The
  // map keeps its own JS wheel-zoom, so pinching over the map still zooms it.
  useEffect(() => {
    const blockPageZoom = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    window.addEventListener("wheel", blockPageZoom, { passive: false });
    return () => window.removeEventListener("wheel", blockPageZoom);
  }, []);

  const animateZoomTo = (target: number, targetPan?: { x: number; y: number }) => {
    cancelZoomAnim();
    const DURATION = 280;
    const t0 = performance.now();
    let fromZoom: number | null = null;
    let fromPan: { x: number; y: number } | null = null;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / DURATION);
      const k = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setZoom(z => {
        if (fromZoom === null) fromZoom = z;
        return fromZoom + (target - fromZoom) * k;
      });
      if (targetPan) {
        setPan(p => {
          if (fromPan === null) fromPan = p;
          return { x: fromPan.x + (targetPan.x - fromPan.x) * k, y: fromPan.y + (targetPan.y - fromPan.y) * k };
        });
      }
      if (t < 1) zoomRafRef.current = requestAnimationFrame(tick);
      else zoomRafRef.current = null;
    };
    zoomRafRef.current = requestAnimationFrame(tick);
  };

  const zoomBy = (factor: number) => {
    const target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    if (target === zoom) return;
    // Ease the pan toward center as we zoom out, so full zoom-out lands centered.
    const cf = centerFactorForZoom(target);
    animateZoomTo(target, { x: pan.x * cf, y: pan.y * cf });
  };

  // Animate zoom + pan together over `duration` ms with easeInOutCubic.
  const animateView = (
    targetZoom: number,
    targetPan: { x: number; y: number },
    duration = 950,
  ) => {
    cancelZoomAnim();
    const t0 = performance.now();
    let fromZoom: number | null = null;
    let fromPan: { x: number; y: number } | null = null;
    const tick = (now: number) => {
      const elapsed = now - t0;
      const t = Math.min(1, elapsed / duration);
      // easeInOutCubic — smooth at both ends, gentle start, gentle stop
      const k = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setZoom(z => {
        if (fromZoom === null) fromZoom = z;
        return fromZoom + (targetZoom - fromZoom) * k;
      });
      setPan(p => {
        if (!fromPan) fromPan = { ...p };
        return {
          x: fromPan.x + (targetPan.x - fromPan.x) * k,
          y: fromPan.y + (targetPan.y - fromPan.y) * k,
        };
      });
      if (t < 1) zoomRafRef.current = requestAnimationFrame(tick);
      else zoomRafRef.current = null;
    };
    zoomRafRef.current = requestAnimationFrame(tick);
  };

  // Click-to-focus on a planet. On a phone, when its detail panel will open
  // (`underPanel`), the planet is framed in the space the panel leaves: centred
  // between the top row of controls and the panel's top edge.
  const focusOnPlanet = (node: PlanetNode, underPanel = false) => {
    const el = containerRef.current;
    if (underPanel && isMobile && el && node.r > 0) {
      const box = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // The panel's top edge: measured (it is in the page even while closed;
      // offsetTop ignores its closing transform), else worked out.
      const panel = document.querySelector<HTMLElement>("[data-detail-panel]");
      const panelTop = panel ? panel.offsetTop : vh - MOBILE_DETAIL_BOTTOM - Math.round(vh * MOBILE_DETAIL_HEIGHT_SHARE);
      const spaceTop = MOBILE_TOP_CONTROLS_BOTTOM;
      const spaceH = Math.max(80, panelTop - spaceTop);
      const targetY = spaceTop + spaceH / 2; // window px
      const diam = Math.max(24, Math.min(box.width * MOBILE_FOCUS_WIDTH_SHARE, spaceH * MOBILE_FOCUS_HEIGHT_SHARE));
      // Slide units per px at zoom 1 (the "meet" fit), then at the target zoom.
      const fit = Math.max(canvas.w / box.width, canvas.h / box.height);
      const targetZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit / ((2 * node.r) / diam)));
      const su = fit / targetZoom;
      // The view's centre is drawn at the map area's centre; put the planet
      // `dy` px from that (above it, here).
      const dy = targetY - (box.top + box.height / 2);
      animateView(targetZoom, {
        x: node.x - (canvas.x + canvas.w / 2),
        y: node.y - (canvas.y + canvas.h / 2) - dy * su,
      });
      return;
    }
    const targetViewW = Math.max(node.r * 6, canvas.w / MAX_ZOOM);
    const targetZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, canvas.w / targetViewW));
    const targetPan = {
      x: node.x - (canvas.x + canvas.w / 2),
      y: node.y - (canvas.y + canvas.h / 2),
    };
    animateView(targetZoom, targetPan);
  };

  // Bring a company into view the way the ACTIVE layout expects. Map zooms and
  // pans to it. Linear has no pan — its zoom scales the whole strip from the left
  // edge — so running the map routine there just zoomed toward the start of the
  // strip (Apple) whatever was clicked. Linear scrolls the strip instead, centring
  // the company in the part of the viewport the side panel won't cover.
  const SIDE_PANEL_COVER_PX = 340 + 16 + 16; // panel width + its right margin + a gap
  const travelToNode = (node: PlanetNode, panelWillOpen: boolean) => {
    if (layoutMode !== "linear") {
      focusOnPlanet(node, panelWillOpen);
      return;
    }
    const el = containerRef.current;
    if (!el || containerH <= 0) return;
    const pxPerSlideUnit = (containerH * zoom) / canvas.h;
    const visibleW = el.clientWidth - (panelWillOpen && !isMobile ? SIDE_PANEL_COVER_PX : 0);
    el.scrollTo({
      left: Math.max(0, (node.x - canvas.x) * pxPerSlideUnit - visibleW / 2),
      behavior: "smooth",
    });
  };

  // Reset to the default view, smoothly. In vertical mode the base view is
  // already the content-fit (see the `view` memo), so zoom=1/pan=0 frames it.
  const resetView = () => {
    animateView(1, { x: 0, y: 0 }, 1100);
  };

  // === Game mode (easter egg) — see src/game/useGameMode.ts ===
  const game = useGameMode({
    nodes,
    enabled: !isMobile && !isEditMode && !mobileEdit,
    containerRef,
    logoRef: gameLogoRef,
    containerW,
    containerH,
    canvas,
    slideUnitsPerPx: naturalSlideUnitsPerPx,
    onActiveChange: setGameActive,
    onStart: () => {
      // The game needs the whole map in view with nothing on top of it — the
      // sidebar collapses too (restored on exit).
      setInspectedPlanet(null);
      setHoveredPlanet(null);
      setTimelineOpen(false);
      setSearchOpen(false);
      setSearchMatches(null);
      selectView("map");
      resetView();
      sidebarBeforeGameRef.current = sidebarOpen;
      setSidebarOpen(false);
    },
    onExit: () => {
      setSidebarOpen(sidebarBeforeGameRef.current);
    },
  });

  // === Static PNG export (see exportMap.tsx) ===
  // Pre-rendered in the background from the settled PRESENT-year layout and
  // cached, so the About-modal download is instant. Regenerated (debounced)
  // whenever the present layout, label size, connections or sector set change.
  // No physics re-run and no live-state mutation: the export takes the on-screen
  // composition and applies a deterministic label-aware de-overlap pass.
  const isPresentYear = activeDate.year === currentDate.year;
  const exportCacheRef = useRef<{ key: string; blob: Blob } | null>(null);
  const exportInFlightRef = useRef<Promise<Blob | null> | null>(null);
  // The map's type rules for the downloaded image. Always the DESKTOP set (the
  // image is the desktop map), whatever window or device it is made on — so the
  // tablet / phone type overrides never leak into the file.
  const desktopKnobs = llab.applied.knobs.desktop;
  const downloadCfg = llab.applied.download;
  const exportType = useMemo(
    () =>
      llab.active
        ? {
            // The map's desktop sizes, times the image's own scales (layout lab → Download).
            largePx: (desktopKnobs.labelLargePx ?? labelSizePx) * downloadCfg.largeScale,
            smallPx: (desktopKnobs.labelSmallPx ?? labelSizePx) * downloadCfg.smallScale,
            thresholdB: desktopKnobs.labelThresholdB ?? 100,
            // The image has its own outline weight too.
            strokePx: downloadCfg.outlinePx,
          }
        : null,
    [llab.active, desktopKnobs, labelSizePx, downloadCfg],
  );
  // The downloaded image prints the market cap under the name of every company
  // worth this much or more (the map itself shows it for Large Cap only). Set in
  // the layout lab's Download tab.
  const exportValuationMinB = llab.active ? llab.applied.download.valuationMinB : EXPORT_VALUATION_MIN_B;
  // The image's overlay settings (layout lab → Download), else the defaults.
  const exportPanelCfg = useMemo<ExportPanelSettings>(
    () =>
      llab.active
        ? {
            legendGap: downloadCfg.legendGap,
            headlineScale: downloadCfg.headlineScale,
            headlineGap: downloadCfg.headlineGap,
            mapScale: downloadCfg.mapScale,
            imageWidth: downloadCfg.imageWidth,
            mapOffsetX: downloadCfg.mapOffsetX,
            legendMedium: downloadCfg.legendMedium,
            legendScale: downloadCfg.legendScale,
          }
        : DEFAULT_EXPORT_PANEL,
    [llab.active, downloadCfg],
  );
  // Where the image's planets come from. With a fixed download arrangement
  // (desktop only — the image is the desktop map): the PRESENT year, solved in
  // the background with that seed, whatever is on screen. Otherwise: the
  // arrangement on screen.
  const exportFixedSeed = K && downloadSeed != null && !layoutMobile && !isEditMode && !mobileEdit ? downloadSeed : null;
  const yearSpecStampId = useMemo(() => nextStampId(), [yearSpecStamp]);
  const exportMoves = llab.active ? llab.applied.download.moves : null;
  const getExportNodes = useCallback(async (): Promise<PlanetNode[]> => {
    if (exportFixedSeed == null) return nodes;
    const spec = yearSpecAt(currentDate);
    if (!spec) return nodes;
    const fixed = { ...spec, seed: exportFixedSeed };
    const planets = await solveLayoutInBackground(fixed);
    const at = new Map(planets.map((q) => [q.name, q]));
    return fixed.inputs.flatMap((inp) => {
      const q = at.get(inp.name);
      if (!q) return [];
      const pos = fixed.positions?.[inp.name];
      // Placed by hand for the image (layout lab → Download): sits exactly
      // there, and counts as pinned so the name pass moves others around it.
      const moved = exportMoves?.[inp.name];
      const x = moved ? moved.x : q.x;
      const y = moved ? moved.y : q.y;
      return [{
        name: inp.name, sector: inp.sector, valuation_b: inp.valuation_b, isEntity: inp.isEntity,
        r: q.r, targetR: q.r, hue: inp.hue, style: inp.style, x, y, targetX: x, targetY: y,
        pinned: !!pos?.pin || !!moved, labelColor: inp.labelColor, labelText: inp.labelText,
      }];
    });
    // `yearSpecStampId` stands for everything `yearSpecAt` reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportFixedSeed, nodes, currentDate, yearSpecStampId, exportMoves]);
  const exportKey = useMemo(
    () =>
      (exportFixedSeed != null
        ? `fixed:${exportFixedSeed}:${yearSpecStampId}:${JSON.stringify(exportMoves ?? {})}`
        : nodes.map((n) => `${n.name}:${Math.round(n.x)},${Math.round(n.y)},${Math.round(n.targetR)}`).join("|")) +
      `#${currentDate.year}-${currentDate.month}|${labelSizePx}|${exportType ? Object.values(exportType).join("/") : ""}|${exportValuationMinB}|${effectiveConnections.length}|${allSectors.filter((s) => enabled.has(s)).join(",")}` +
      // Style lab: any override change invalidates the cached PNG.
      `|${lab.hasOverrides ? JSON.stringify(lab.state) : ""}|${bgStops.join(",")}|${JSON.stringify(exportPanelCfg)}`,
    [exportFixedSeed, yearSpecStampId, exportMoves, nodes, currentDate.year, currentDate.month, labelSizePx, exportType, exportValuationMinB, exportPanelCfg, effectiveConnections, allSectors, enabled, lab.hasOverrides, lab.state, bgStops],
  );
  const generateExportPng = useCallback(async (): Promise<Blob | null> => {
    // Let an in-flight render finish first, then re-check: it may have produced
    // exactly this key (or a stale one, in which case we build the fresh one).
    if (exportInFlightRef.current) await exportInFlightRef.current;
    if (exportCacheRef.current?.key === exportKey) return exportCacheRef.current.blob;
    const run = getExportNodes()
      .then((source) =>
        buildExportPng({
          nodes: lab.hasOverrides ? source.map((n) => ({ ...n, style: labStyleFor(n.name, n.sector, n.style) })) : source,
          bgStops,
          sectorColorOverride: sectorColorResolved,
          connections: effectiveConnections,
          labelSizePx,
          type: exportType,
          valuationMinB: exportValuationMinB,
          panel: exportPanelCfg,
          bounds: physicsBounds,
          year: currentDate.year,
          month: currentDate.month,
          sectors: allSectors,
          counts,
        }),
      )
      .then((blob) => {
        if (blob) exportCacheRef.current = { key: exportKey, blob };
        return blob;
      })
      .catch((err) => {
        console.warn("[media-map] export failed:", err);
        return null;
      })
      .finally(() => {
        exportInFlightRef.current = null;
      });
    exportInFlightRef.current = run;
    return run;
  }, [exportKey, getExportNodes, effectiveConnections, labelSizePx, exportType, exportValuationMinB, exportPanelCfg, physicsBounds, currentDate.year, currentDate.month, allSectors, counts, lab.hasOverrides, labStyleFor, bgStops, sectorColorResolved]);

  // Layout lab → Download: how well the names fit this arrangement at this
  // cut-off — measured on the very nodes the image would be drawn from.
  const [exportFit, setExportFit] = useState<ExportLayoutStats | null>(null);
  useEffect(() => {
    if (!llab.downloadView) return;
    let stale = false;
    const t = window.setTimeout(() => {
      void getExportNodes()
        .then((source) => {
          if (!stale && source.length) setExportFit(measureExportLayout({ nodes: source, type: exportType, labelSizePx, bounds: physicsBounds, valuationMinB: exportValuationMinB }));
        })
        .catch(() => {});
    }, 450); // after the on-screen layout has stopped moving
    return () => {
      stale = true;
      window.clearTimeout(t);
    };
  }, [llab.downloadView, getExportNodes, exportType, labelSizePx, physicsBounds, exportValuationMinB]);

  // Background pre-render: desktop, present year, map mode, not authoring.
  // Debounced so the settle's per-tick node updates don't each kick off a 4K
  // rasterization — it runs ~2.5s after the layout stops moving.
  // (With a fixed download arrangement the image doesn't depend on the view or
  // year on screen, so only the device / authoring conditions apply.)
  const exportFromScreen = exportFixedSeed == null;
  useEffect(() => {
    if (isMobile || isEditMode || mobileEdit || nodes.length === 0) return;
    if (exportFromScreen && (layoutMode !== "map" || !isPresentYear)) return;
    const t = window.setTimeout(() => {
      void generateExportPng();
    }, 2500);
    return () => window.clearTimeout(t);
  }, [generateExportPng, isMobile, isEditMode, mobileEdit, layoutMode, isPresentYear, nodes.length, exportFromScreen]);

  // Download the PRESENT map as a 3840×2160 (16:9) PNG. On the present year this
  // is the cached render (instant) or a fresh one if the layout changed since; on
  // a Time Machine year it serves the last cached present render (the export is
  // present-only), building from the current layout only as a last resort.
  const downloadMapImage = async () => {
    let blob =
      !exportFromScreen || (isPresentYear && layoutMode === "map")
        ? await generateExportPng()
        : (exportCacheRef.current?.blob ?? null);
    if (!blob) {
      console.warn("[media-map] no present-year export cached; rendering the current layout instead");
      blob = await generateExportPng();
    }
    if (!blob) return;
    downloadBlob(blob, `media-universe-${currentDate.year}.png`);
  };

  // Zoom + center on the bounding box of all planets in a sector.
  const focusOnSector = (sector: string) => {
    const matching = nodes.filter(n => n.sector === sector);
    if (matching.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of matching) {
      if (n.x - n.r < minX) minX = n.x - n.r;
      if (n.y - n.r < minY) minY = n.y - n.r;
      if (n.x + n.r > maxX) maxX = n.x + n.r;
      if (n.y + n.r > maxY) maxY = n.y + n.r;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // 40% padding around the bbox so the cluster doesn't kiss the viewport edges
    const PAD = 1.4;
    const bw = Math.max(maxX - minX, 1) * PAD;
    const bh = Math.max(maxY - minY, 1) * PAD;
    const targetZoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min(canvas.w / bw, canvas.h / bh)),
    );
    const targetPan = {
      x: cx - (canvas.x + canvas.w / 2),
      y: cy - (canvas.y + canvas.h / 2),
    };
    animateView(targetZoom, targetPan, 950);
  };

  const toggleSector = (s: string) => {
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  // Cull off-view planets in map mode. Linear mode extends far past the
  // map viewBox to the right (the scrollbar handles navigation), so don't
  // cull there — we'd hide everything outside the initial canvas region.
  // Layout lab type: with "type scales with the map" the names keep their size
  // in MAP units (set at the design width), so they shrink and grow with the
  // window exactly as the planets do. Otherwise they stay a fixed px size.
  const typeScale =
    K && labLocked && llab.applied.scaleType && layoutMode !== "linear" && containerW > 0
      ? canvas.w / K.designWidth / naturalSlideUnitsPerPx
      : 1;
  const renderLabelPx = (n: PlanetNode) => {
    // Previewing the image: its own name sizes (layout lab → Download).
    if (exportPreview && exportType) return !n.isEntity && n.valuation_b >= exportType.thresholdB ? exportType.largePx : exportType.smallPx;
    const px = typePxOf(n.valuation_b, n.isEntity);
    const sized = KT ? Math.max(Math.min(llab.applied.minTypePx, px), px * typeScale) : px;
    return sized * labelScaleForZoom(zoom, KT?.zoomTypeGrowth, KT?.zoomTypeMax);
  };
  const labelStrokePxEff = exportPreview && exportType ? exportType.strokePx : KT ? KT.labelStrokePx * Math.max(typeScale, 0.5) : undefined;
  // Which names carry a market cap: the image's rule while previewing it.
  const showValuationFor = (n: PlanetNode) =>
    exportPreview ? exportShowsValuation(n, exportValuationMinB) : zoom >= VALUATION_ZOOM_THRESHOLD || n.sector === "Large Cap";
  // The image's overlay, drawn over the map while previewing (its artwork is
  // loaded once, on first use).
  const [exportAssets, setExportAssets] = useState<ExportAssets | null>(null);
  useEffect(() => {
    if (!exportPreview || exportAssets) return;
    let on = true;
    void loadExportAssets().then((a) => {
      if (on) setExportAssets(a);
    });
    return () => {
      on = false;
    };
  }, [exportPreview, exportAssets]);
  const exportPreviewMarkup = useMemo(() => {
    if (!exportPreview) return null;
    return buildExportPanelMarkup({
      year: currentDate.year,
      month: currentDate.month,
      sectors: allSectors,
      counts,
      assets: exportAssets ?? { logoUri: null, qrUri: null, mapQrUri: null },
      settings: exportPanelCfg,
      sectorColorOverride: sectorColorResolved,
    });
  }, [exportPreview, currentDate.year, currentDate.month, allSectors, counts, exportAssets, exportPanelCfg, sectorColorResolved]);
  const nameThresholdEff = KT ? KT.nameThreshold : mobileView ? activeSettings.nameThreshold : 0;
  // Name declutter (layout lab "Name breathing room"): hand names out largest
  // planet first, skipping any whose box would come within `nameSpacing` px of
  // a name already placed. Dense areas thin out; with a low size floor, small
  // planets in empty areas pick names up. Computed on SETTLED positions (a
  // short pause after the nodes stop changing) so names don't flicker while
  // planets are still easing into place; re-run live on zoom.
  const nameSpacing = KT?.nameSpacing ?? 0;
  const [settledNodes, setSettledNodes] = useState<PlanetNode[] | null>(null);
  useEffect(() => {
    if (nameSpacing <= 0) return;
    const id = window.setTimeout(() => setSettledNodes(nodes), 120);
    return () => window.clearTimeout(id);
  }, [nodes, nameSpacing]);
  const shownNames = useMemo(() => {
    if (!KT || nameSpacing <= 0 || !settledNodes || layoutMode === "linear" || slideUnitsPerPx <= 0) return null;
    const su = slideUnitsPerPx;
    const zoomScale = labelScaleForZoom(zoom, KT.zoomTypeGrowth, KT.zoomTypeMax);
    const withValAll = zoom >= VALUATION_ZOOM_THRESHOLD;
    const half = nameSpacing / 2;
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    const out = new Set<string>();
    const candidates = settledNodes
      .filter((n) => !n.isEntity && (2 * n.r) / su >= KT.nameThreshold)
      .sort((a, b) => b.r - a.r);
    for (const n of candidates) {
      const base = !n.isEntity && n.valuation_b >= KT.labelThresholdB ? KT.labelLargePx : KT.labelSmallPx;
      const px = Math.max(Math.min(llab.applied.minTypePx, base), base * typeScale) * zoomScale;
      // Widths are measured once at 10px and scaled (text width is linear in size).
      const words = (n.labelText ?? n.name).trim().split(/\s+/);
      let w = 0;
      for (const word of words) w = Math.max(w, (measureLabelTextWidth(word, 10, 500) + 0.2 * word.length) * (px / 10));
      let h = words.length * px;
      if (withValAll || n.sector === "Large Cap") {
        h += px * 1.15;
        w = Math.max(w, measureLabelTextWidth(formatValuation(n.valuation_b), 10, 400) * (px / 10));
      }
      const cx = n.x / su;
      const cy = n.y / su;
      const box = { l: cx - w / 2 - half, r: cx + w / 2 + half, t: cy - h / 2 - half, b: cy + h / 2 + half };
      if (placed.some((p) => p.l < box.r && p.r > box.l && p.t < box.b && p.b > box.t)) continue;
      placed.push(box);
      out.add(n.name);
    }
    return out;
  }, [KT, nameSpacing, settledNodes, layoutMode, slideUnitsPerPx, zoom, typeScale, llab.applied.minTypePx]);
  // While the declutter is on it alone decides which names show.
  const nameHidden = (n: PlanetNode, fallback: boolean) => (shownNames ? !shownNames.has(n.name) : fallback);
  const nameFloor = shownNames ? 0 : nameThresholdEff;

  // A sector's gravity well as the layout uses it now (lab move → mobile well →
  // desktop well) — what the Arrange handles sit on.
  const sectorWellNow = (s: string) =>
    labSectors[s] ?? (layoutMobile ? (mobileSectorCenters[s] ?? desktopCenterForSector(s)) : desktopCenterForSector(s));

  // Names draw in a separate pass above all planets — except in the edit modes
  // (there a name is a grab target on its own planet) and the game (its planets
  // are stacked cross-fading pairs).
  const namesOnTop = !(isEditMode || mobileEdit || arrange || dlArrange) && !game.active;

  const visibleNodes = useMemo(() => {
    if (game.active) return nodes.filter(n => !game.hud.lost.has(n.name));
    if (layoutMode === "linear") return nodes;
    const pad = 300;
    return nodes.filter(n => {
      if (n.x + n.r < view.x - pad) return false;
      if (n.x - n.r > view.x + view.w + pad) return false;
      if (n.y + n.r < view.y - pad) return false;
      if (n.y - n.r > view.y + view.h + pad) return false;
      return true;
    });
  }, [nodes, view, layoutMode, game.active, game.hud.lost]);

  // Lookup by company name so connection lines can resolve their endpoints to
  // live node coordinates (which follow physics + any in-progress drag).
  const nodeByName = useMemo(() => {
    const m = new Map<string, PlanetNode>();
    for (const n of nodes) m.set(n.name, n);
    return m;
  }, [nodes]);

  const setAll = (on: boolean) => {
    setEnabled(on ? new Set(allSectors) : new Set());
  };

  // ---- Search: what's findable in the CURRENT view, and how a pick "travels" ----
  const searchItems = useMemo<SearchItem[]>(() => {
    const tick = sanity?.tickerByName ?? {};
    const sectorColor = (sec: string) => {
      const flat = flatStyleForSector(sec);
      return sectorColorResolved(sec) ?? flat?.fill ?? flat?.stripes?.[0] ?? `hsl(${sanity?.hueBySector[sec] ?? hueForSector(sec)}, 70%, 55%)`;
    };
    const planetColor = (n: PlanetNode) => {
      const st = labStyleFor(n.name, n.sector, n.style);
      return st?.fill ?? st?.ombre?.stops?.[0] ?? st?.stripes?.[0] ?? `hsl(${n.hue}, 70%, 55%)`;
    };
    // Aggregate spans every year, so its bands are the whole searchable set.
    if (viewMode === "aggregate") {
      return aggregateData.bands.map((b) => ({
        name: b.name,
        label: usdFlag(b.name).display,
        sector: b.sector,
        color: b.color,
        ticker: tick[b.name],
      }));
    }
    let onYear: SearchItem[];
    if (viewMode === "list") {
      onYear = listRows.map((r) => {
        const n = nodeByName.get(r.name);
        return {
          name: r.name,
          label: usdFlag(r.name).display,
          sector: r.sector,
          color: n ? planetColor(n) : sectorColor(r.sector),
          valuation: r.valuation,
          ticker: tick[r.name],
        };
      });
    } else {
      onYear = nodes.map((n) => ({
        name: n.name,
        label: n.labelText ?? n.name,
        sector: n.sector,
        color: planetColor(n),
        valuation: n.isEntity ? undefined : n.valuation_b,
        isEntity: n.isEntity,
        ticker: tick[n.name],
      }));
    }
    const present = new Set(onYear.map((i) => i.name));
    const extra: SearchItem[] = [];
    // On this year's map, but its sector is switched off in the panel.
    for (const c of displayedCompanies) {
      if (present.has(c.name) || enabled.has(c.sector)) continue;
      present.add(c.name);
      extra.push({
        name: c.name,
        label: usdFlag(c.name).display,
        sector: c.sector,
        color: sectorColor(c.sector),
        ticker: tick[c.name],
        offYearHint: `Hidden — the ${c.sector} sector is switched off`,
      });
    }
    // On the roster, but not on the viewed year: findable, with when it appears.
    const year = activeDate.year;
    for (const c of sanityDocs?.companies ?? []) {
      if (!c.name || present.has(c.name)) continue;
      present.add(c.name);
      const years = [...(c.slug ? (valData.get(c.slug)?.keys() ?? []) : [])].map(Number).sort((a, b) => a - b);
      if (!years.length) continue;
      const min = years[0], max = years[years.length - 1];
      const sec = c.sector?.name ?? "";
      extra.push({
        name: c.name,
        label: usdFlag(c.name).display,
        sector: sec,
        color: sectorColor(sec),
        ticker: c.ticker,
        offYearHint:
          year < min
            ? `Not on the ${year} map — appears from ${min}`
            : year > max
              ? `Not on the ${year} map — last appears in ${max}`
              : `Not on the ${year} map`,
      });
    }
    return [...onYear, ...extra];
  }, [viewMode, aggregateData, listRows, nodes, nodeByName, displayedCompanies, enabled, sanity, sanityDocs, valData, activeDate.year, labStyleFor, sectorColorResolved]);

  const onSearchSelect = (item: SearchItem) => {
    setSearchMatches(null);
    if (viewMode === "aggregate") {
      setAggHighlight(item.name); // pinned like a hover; click anywhere releases it
      return;
    }
    if (viewMode === "list") {
      // Incrementing token (not a timestamp) so picking the same row again re-fires.
      setListFocus((prev) => ({ name: item.name, token: (prev?.token ?? 0) + 1 }));
      return;
    }
    const node = nodeByName.get(item.name);
    if (!node) return;
    travelToNode(node, !node.isEntity);
    if (!node.isEntity) setInspectedPlanet(node.name); // entities have no detail panel
  };

  // The search field grows to the width the tabs occupied. Observe rather than
  // measure once: the tabs widen when the web font lands, and `scrollWidth` is the
  // full content width even while they're collapsed behind the open search.
  // Re-attached whenever the pill remounts (timeline / game mode unmount it);
  // the 0 an unmounting element reports is ignored so the tabs never collapse.
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (el.scrollWidth > 0) setTabsWidth(el.scrollWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [timelineOpen, game.active]);

  const sectorPanelProps: SectorPanelProps = {
    sectors: allSectors,
    counts,
    enabled,
    onToggle: toggleSector,
    onAll: setAll,
    // Companies actually on the map (same figure the export panel shows) — not
    // the legacy sheet's row count, which is what made the panel say "173"
    // regardless of what was rendered.
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    loading: loading || valuationsLoading,
    error,
    hoveredSector,
    onHoverSector: setHoveredSector,
    onFocusSector: focusOnSector,
    sectorColorOverride: sectorColorResolved,
    panelBackground: panelBg,
  };

  // Lab-only debug handle (?layout=1): the live nodes, for measuring a layout
  // from the console or a test script.
  useEffect(() => {
    if (!llab.enabled) return;
    (window as unknown as { __mmLayout?: unknown }).__mmLayout = {
      nodes, get yearLayouts() { return getSolvedYears(); }, labBaseYears, sanityPositions: sanity?.positions ?? {}, bounds: physicsBounds, canvas, mode: labMode, knobs: K, typeKnobs: KT, tabletType,
      pinSources: {
        sanityDesktop: Object.keys(sanity?.positions ?? {}),
        sanityMobile: Object.keys(sanity?.mobilePositions ?? {}),
        fileFull: Object.keys(mobileLayouts.full.positions),
        fileThisView: Object.keys(activeLayout.positions),
      },
    };
  }, [llab.enabled, nodes, physicsBounds, canvas, labMode, K, KT, tabletType, labBaseYears, sanity]);

  // ---- Layout lab panel wiring (only rendered with ?layout=1) ------------
  const labGoToYear = (year: number) => {
    const target = dateRange.find((d) => d.year === year);
    if (!target) return;
    setActiveDate(target);
    setFlyIntroToken((n) => n + 1); // load it as a first page load would
    setSavedViews((prev) => (prev.some((p) => sameDate(p, target)) ? prev : [...prev, target]));
    setInspectedPlanet(null);
    resetView();
  };
  const labReload = () => {
    setInspectedPlanet(null);
    resetView();
    // Stands in for a new page load: with "new arrangement on every visit" on,
    // that means a new starting arrangement too.
    if (llab.state.shuffleEachLoad) llab.reshuffle();
    setFlyIntroToken((n) => n + 1);
  };
  const labSelectedNode = arrange && selectedPlanet ? nodes.find((n) => n.name === selectedPlanet) ?? null : null;
  const labSelection: LabSelection | null = labSelectedNode
    ? {
        name: labSelectedNode.name,
        x: physicsPositions[labSelectedNode.name]?.x ?? labSelectedNode.x,
        y: physicsPositions[labSelectedNode.name]?.y ?? labSelectedNode.y,
        pinned: labSelectedNode.pinned,
        kind: !physicsPositions[labSelectedNode.name]
          ? "free"
          : physicsPositions[labSelectedNode.name].pin
            ? "pin"
            : physicsPositions[labSelectedNode.name].hold
              ? "home"
              : "soft",
        edited: !!llab.state.positions[labMode][labSelectedNode.name],
      }
    : null;
  // ---- The address bar (see urlState.ts) ----
  // What the app is showing, as a route; its path is written to the address
  // bar whenever it changes, and a route read from the address bar (first load,
  // back / forward) is applied through the same functions a click would call.
  const currentRoute = useMemo<AppRoute>(
    () => ({
      view: viewMode,
      year: activeDate.year !== currentDate.year ? activeDate.year : null,
      timeMachine: timelineOpen ? { year: timelineFocus.year } : null,
      about: aboutOpen ? aboutSection : null,
      game: game.active,
    }),
    [viewMode, activeDate.year, currentDate.year, timelineOpen, timelineFocus.year, aboutOpen, aboutSection, game.active],
  );
  // While a route from the address bar is being applied (several state changes,
  // a few renders), the address is corrected in place rather than pushed again.
  const routeApplyingUntilRef = useRef(0);
  const applyRoute = (r: AppRoute) => {
    routeApplyingUntilRef.current = performance.now() + 400;
    if (r.view !== viewMode) selectView(r.view);
    const wantYear = r.year ?? currentDate.year;
    const d = dateRange.find((x) => x.year === wantYear) ?? currentDate;
    if (!sameDate(d, activeDate)) {
      setActiveDate(d);
      // A past year gets its pill, as Explore gives it.
      if (d.year !== currentDate.year) setSavedViews((prev) => (prev.some((p) => sameDate(p, d)) ? prev : [...prev, d]));
    }
    if (r.timeMachine) {
      if (!timelineOpen) openTimeline();
      const y = r.timeMachine.year;
      const focus = y !== null ? dateRange.find((x) => x.year === y) : null;
      if (focus) focusOn(focus);
    } else if (timelineOpen) {
      setTimelineOpen(false);
    }
    if (r.about) {
      setAboutOpenAt(r.about);
      setAboutSection(r.about);
      setAboutOpen(true);
    } else if (aboutOpen) {
      setAboutOpen(false);
    }
    if (r.game && !game.active && !isMobile) game.start();
    else if (!r.game && game.active) game.exit();
  };
  const applyRouteRef = useRef(applyRoute);
  useEffect(() => {
    applyRouteRef.current = applyRoute;
  });
  // First load: the address decides what opens (the game once the map has planets).
  const routeLoadedRef = useRef(false);
  useEffect(() => {
    if (routeLoadedRef.current || typeof window === "undefined") return;
    const r = parseRoute(window.location.pathname, currentDate.year);
    if (r.game && nodes.length === 0) return; // wait for the planets
    routeLoadedRef.current = true;
    if (routePath(r) !== "/") applyRouteRef.current(r);
  }, [currentDate.year, nodes.length]);
  // The Time Machine button gets focus back when the Time Machine closes.
  const timelineWasOpenRef = useRef(false);
  useEffect(() => {
    if (timelineWasOpenRef.current && !timelineOpen) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>("button[aria-label='Open time machine']")?.focus({ preventScroll: true }));
    }
    timelineWasOpenRef.current = timelineOpen;
  }, [timelineOpen]);
  // Back / forward.
  useEffect(() => {
    const onPop = () => applyRouteRef.current(parseRoute(window.location.pathname, currentDate.year));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [currentDate.year]);
  // Write the address and the tab title. Query strings (?layout=1 …) are kept.
  useEffect(() => {
    if (typeof window === "undefined" || !routeLoadedRef.current) return;
    const path = routePath(currentRoute);
    document.title = routeTitle(currentRoute, "ESHAP Media Universe");
    if (window.location.pathname === path) return;
    const url = path + window.location.search + window.location.hash;
    if (performance.now() < routeApplyingUntilRef.current) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }, [currentRoute]);

  // ---- Keyboard access to the map ----
  // The map area is one Tab stop. With it focused, the arrow keys move a focus
  // ring from planet to planet (the nearest one in that direction), Home / End
  // go to the biggest / smallest, Enter opens the company's details, Escape
  // closes them and zooms out. Each move is announced through a live region.
  // The planets themselves stay out of the accessibility tree (180 SVG nodes
  // would be noise); the List view is the table form of the same companies.
  const [kbPlanet, setKbPlanet] = useState<string | null>(null);
  const [mapHasFocus, setMapHasFocus] = useState(false);
  const [a11yNote, setA11yNote] = useState("");
  const kbNodes = useMemo(() => nodes.filter((n) => !n.isEntity && enabled.has(n.sector)), [nodes, enabled]);
  const kbCurrent = kbPlanet ? kbNodes.find((n) => n.name === kbPlanet) ?? null : null;
  const describe = (n: PlanetNode) => `${usdFlag(n.name).display}, ${n.sector}, ${formatValuation(n.valuation_b)}`;
  // Bring a planet into the viewport (at the current zoom) if it is outside it.
  const keepInView = (n: PlanetNode) => {
    const pad = n.r + 40 * slideUnitsPerPx;
    const inside = n.x - pad >= view.x && n.x + pad <= view.x + view.w && n.y - pad >= view.y && n.y + pad <= view.y + view.h;
    if (inside || layoutMode === "linear") return;
    animateView(zoom, { x: n.x - (canvas.x + canvas.w / 2), y: n.y - (canvas.y + canvas.h / 2) }, 350);
  };
  const moveKbFocus = (n: PlanetNode) => {
    setKbPlanet(n.name);
    setA11yNote(describe(n));
    keepInView(n);
  };
  // Landing on the map by keyboard (Tab, a skip link): the ring goes straight
  // to the biggest company, so the stop is visible and spoken at once. A mouse
  // click also focuses the map area, but shows nothing.
  const landOnMap = () => {
    if (kbCurrent || kbNodes.length === 0) return;
    const biggest = [...kbNodes].sort((a, b) => b.valuation_b - a.valuation_b)[0];
    moveKbFocus(biggest);
  };
  const focusMap = () => {
    containerRef.current?.focus({ preventScroll: true });
    landOnMap();
  };
  const onMapKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget || game.active || timelineOpen || kbNodes.length === 0) return;
    const dirs: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    if (e.key in dirs) {
      e.preventDefault();
      const [dx, dy] = dirs[e.key];
      // No planet yet: start from the one nearest the middle of the view.
      const from = kbCurrent ?? { x: view.x + view.w / 2, y: view.y + view.h / 2, name: "" };
      let best: PlanetNode | null = null, bestScore = Infinity;
      for (const n of kbNodes) {
        if (n.name === from.name) continue;
        const ox = n.x - from.x, oy = n.y - from.y;
        const along = ox * dx + oy * dy; // progress in the key's direction
        if (along <= 0) continue;
        const across = Math.abs(ox * dy - oy * dx); // sideways drift
        if (kbCurrent && across > along * 1.5) continue; // stay within a cone
        const score = along + across * 0.6;
        if (score < bestScore) { best = n; bestScore = score; }
      }
      if (best) moveKbFocus(best);
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const sorted = [...kbNodes].sort((a, b) => b.valuation_b - a.valuation_b);
      moveKbFocus(e.key === "Home" ? sorted[0] : sorted[sorted.length - 1]);
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && kbCurrent) {
      e.preventDefault();
      travelToNode(kbCurrent, true);
      setInspectedPlanet(kbCurrent.name);
      setA11yNote(`Opened details for ${usdFlag(kbCurrent.name).display}`);
      return;
    }
    if (e.key === "Escape") {
      if (inspectedPlanet || zoom > MIN_ZOOM + 0.01) {
        e.preventDefault();
        setInspectedPlanet(null);
        if (layoutMode !== "linear") resetView();
        setA11yNote("Closed details");
      }
    }
  };
  // The ring follows the planet only while the map has keyboard focus.
  const kbRingNode = mapHasFocus && kbCurrent ? (dragState && dragState.name === kbCurrent.name ? { ...kbCurrent, x: dragState.x, y: dragState.y } : kbCurrent) : null;
  const a11ySummary = `${kbNodes.length} media companies in ${allSectors.filter((s) => enabled.has(s)).length} sectors, drawn as planets sized by market cap. Use the arrow keys to move between companies, Enter to open a company's details, Escape to close them. The List view shows the same companies as a table.`;

  const layoutLabPanel = llab.enabled ? (
    <LayoutLabPanel
      lab={llab}
      mode={labMode}
      live={liveKnobs}
      knobs={resolveKnobs(llab.state.knobs[labMode], liveKnobs)}
      typeBase={{
        ...resolveKnobs(llab.state.knobs[labMode], liveKnobs),
        ...(fullMirror ? phoneTypeDefaults(labelSizePx, activeSettings.nameThreshold) : {}),
      }}
      years={dateRange.map((d) => d.year)}
      year={activeDate.year}
      onYear={labGoToYear}
      downloadFit={exportFit}
      onDownloadPreview={downloadMapImage}
      downloadSelected={dlArrange ? selectedPlanet : null}
      downloadBasePx={{
        large: llab.state.knobs.desktop.labelLargePx ?? labelSizePx,
        small: llab.state.knobs.desktop.labelSmallPx ?? labelSizePx,
      }}
      onRefresh={labReload}
      mapWidth={containerW}
      stats={{
        planets: nodes.filter((n) => !n.isEntity).length,
        pinned: nodes.filter((n) => n.pinned).length,
        soft: nodes.filter((n) => !n.pinned && !n.hold && !!physicsPositions[n.name]).length,
        held: nodes.filter((n) => n.hold).length,
      }}
      selection={labSelection}
      onSelectionKind={(kind) => {
        if (!labSelectedNode) return;
        const name = labSelectedNode.name;
        if (kind === "free") llab.setPosition(labMode, labYear, name, null);
        else {
          // Pin, or make a home, where it sits now.
          const at = { x: Math.round(labSelectedNode.x), y: Math.round(labSelectedNode.y) };
          llab.setPosition(labMode, labYear, name, kind === "pin" ? { ...at, pin: true } : { ...at, pin: false, hold: true });
        }
      }}
      onSelectionMove={(x, y) => {
        if (!labSelectedNode) return;
        const name = labSelectedNode.name;
        // A held or soft planet keeps its kind (its spot moves); anything else is pinned there.
        const cur = physicsPositions[name];
        const soft = !!cur && !cur.pin && !cur.hold;
        if (!soft) {
          labSelectedNode.x = x;
          labSelectedNode.y = y;
        }
        llab.setPosition(labMode, labYear, name, cur?.hold ? { x, y, pin: false, hold: true } : { x, y, pin: !soft });
      }}
      onSelectionRevert={() => labSelectedNode && llab.revertPosition(labMode, labSelectedNode.name)}
      movedSectors={Object.keys(labSectors).sort()}
      onRevertSector={(s) => llab.revertSector(labMode, s)}
    />
  ) : null;

  return (
    <LabFrame lab={llab} panel={layoutLabPanel}>
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        width: "100%",
        height: "100%", // fill .app (100dvh) so bottom controls aren't clipped on mobile
        overflow: "hidden",
      }}
    >
      {/* The first Tab stops: straight to the map, the search or the download,
          ahead of the side panel's many sector checkboxes. */}
      <nav aria-label="Skip to">
        <button className="mm-skip" onClick={focusMap}>Skip to the map</button>
        <button className="mm-skip" onClick={() => document.getElementById("mm-search-btn")?.focus()}>Skip to search</button>
        <button
          className="mm-skip"
          onClick={() => {
            if (isMobile) setMobileSectorsOpen(true);
            requestAnimationFrame(() => document.querySelector<HTMLElement>("#mm-sectors [data-sector-toggle]")?.focus());
          }}
        >
          Skip to sectors
        </button>
        <button className="mm-skip" onClick={() => document.getElementById("mm-download-btn")?.focus()}>Skip to download</button>
      </nav>
      {!isMobile && (
        <Sidebar
          {...sectorPanelProps}
          open={sidebarOpen}
          onCollapse={() => setSidebarOpen(false)}
        />
      )}
      {!isMobile && (
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sector side panel"
          // Invisible while the panel is open: out of the Tab order too.
          tabIndex={sidebarOpen || game.active ? -1 : 0}
          aria-hidden={sidebarOpen || game.active}
          title="Open sector side panel"
          className="panel-icon-btn"
          style={{
            position: "fixed",
            top: 16,
            left: 16,
            zIndex: 30,
            background: "transparent",
            border: "none",
            padding: 2,
            cursor: "pointer",
            display: "inline-flex",
            lineHeight: 0,
            // Fade in after the panel has slid away; fade out quickly when it opens.
            // (color transition kept so the 50%→100% hover still animates.)
            // Hidden while the sidebar is open, and for the whole game (the
            // panel collapses for play and must stay closed).
            opacity: sidebarOpen || game.active ? 0 : 1,
            pointerEvents: sidebarOpen || game.active ? "none" : "auto",
            transition: sidebarOpen
              ? "opacity 150ms ease, color 150ms ease"
              : "opacity 220ms ease 200ms, color 150ms ease",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 24 }}>left_panel_open</span>
        </button>
      )}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative",
            background: bgGradient }}>
        {/* Horizontal view on a portrait phone: cover the map with a rotate
            prompt. The map stays mounted underneath so physics keeps running and
            it's ready the instant the phone is turned. */}
        {showRotatePrompt && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 40,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 18,
              textAlign: "center",
              padding: 32,
              background: bgGradient,
              color: "#e6edf7",
              fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
              textShadow: "none",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 64, opacity: 0.85, transform: "rotate(90deg)", textShadow: "none", filter: "none" }}
            >
              screen_rotation
            </span>
            <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, maxWidth: 320, textShadow: "none" }}>
              Please rotate your phone to<br />view the full map
            </span>
          </div>
        )}
        {/* Live interactive map — always mounted so physics keeps running.
            Fades out (so it cross-fades with the overlay) in timeline mode
            (carousel) and list mode (table). */}
        <div
          ref={mapLayerRef}
          style={{
            position: "absolute",
            // Fill the whole map area. In the mobile 4:5 view the canvas is
            // width-limited under "meet", so it spans the full phone width and
            // extends behind the tab/control overlays (which sit on top).
            inset: 0,
            opacity: timelineOpen || viewMode === "list" || viewMode === "aggregate" ? 0 : 1,
            pointerEvents: timelineOpen || viewMode === "list" || viewMode === "aggregate" ? "none" : "auto",
            // While "Explore this map" hands over, that animation owns the fade.
            transition: exploring ? "none" : "opacity 360ms ease",
          }}
        >
        <div
          ref={containerRef}
          tabIndex={0}
          role="application"
          aria-label="Media universe map"
          aria-describedby="mm-map-help"
          onKeyDown={onMapKeyDown}
          onFocus={(e) => {
            if (e.target !== e.currentTarget) return;
            setMapHasFocus(true);
            if (e.currentTarget.matches(":focus-visible")) landOnMap();
          }}
          onBlur={(e) => { if (e.target === e.currentTarget) setMapHasFocus(false); }}
          style={{
            width: "100%",
            height: "100%",
            position: "relative",
            // The focus ring is drawn around the focused planet instead.
            outline: "none",
            overflowX: layoutMode === "linear" ? "auto" : "hidden",
            overflowY: "hidden",
            cursor: layoutMode === "linear" ? "default" : "grab",
            userSelect: "none",
            // Map mode owns all touch gestures (pan/pinch in JS); linear keeps
            // native horizontal scroll.
            touchAction: layoutMode === "linear" ? "pan-x" : "none",
          }}
          onMouseDown={layoutMode === "linear" || game.active ? undefined : onMouseDown}
          onMouseMove={layoutMode === "linear" || game.active ? undefined : onMouseMove}
          onMouseUp={layoutMode === "linear" || game.active ? undefined : onMouseUp}
          onMouseLeave={layoutMode === "linear" || game.active ? undefined : onMouseUp}
          onWheel={layoutMode === "linear" || game.active ? undefined : onWheel}
          onTouchStart={layoutMode === "linear" || game.active ? undefined : onTouchStart}
          onTouchMove={layoutMode === "linear" || game.active ? undefined : onTouchMove}
          onTouchEnd={layoutMode === "linear" || game.active ? undefined : onTouchEnd}
          onClick={() => {
            // Click on the map background while zoomed in (a focused planet, a
            // focused sector, or any pinch/zoom) → close the side panel and zoom
            // all the way out. Planet clicks set the suppress flag so they focus.
            if (bgClickSuppressRef.current) { bgClickSuppressRef.current = false; return; }
            if (didDragRef.current || game.active) return;
            if (layoutMode === "linear") {
              // Linear's zoom is the user's chosen strip scale, not a "focused"
              // state to back out of — just close the panel.
              if (inspectedPlanet) setInspectedPlanet(null);
              return;
            }
            if (inspectedPlanet || zoom > MIN_ZOOM + 0.01) {
              setInspectedPlanet(null);
              resetView();
            }
          }}
        >
          <p id="mm-map-help" className="sr-only">{a11ySummary}</p>
          <div className="sr-only" aria-live="polite" aria-atomic="true">{a11yNote}</div>
          <svg
            ref={mapSvgRef}
            aria-hidden="true"
            width={
              layoutMode === "linear" && containerH > 0
                ? Math.max(containerW, (linearStripSlideWidth / canvas.h) * containerH * zoom)
                : "100%"
            }
            height="100%"
            viewBox={
              layoutMode === "linear"
                ? (() => {
                    // Zoom controls how many slide units of vertical space the
                    // viewport shows: zoom < 1 → taller viewBox → planets appear
                    // smaller and more of the strip fits horizontally (with
                    // preserveAspectRatio "meet", scale is uniform). The viewBox
                    // is centered vertically on the canvas so the centered strip
                    // stays at viewport center at any zoom.
                    const vbH = canvas.h / zoom;
                    const vbY = canvas.y + canvas.h / 2 - vbH / 2;
                    return `${canvas.x} ${vbY} ${linearStripSlideWidth} ${vbH}`;
                  })()
                : `${view.x} ${view.y} ${view.w} ${view.h}`
            }
            // Always fit the whole map ("meet") — including mobile, which used
            // to "slice"/crop. Temporary mobile plan shows the full desktop map.
            preserveAspectRatio="xMidYMid meet"
            style={{ display: "block" }}
          >
            <StarfieldDefs />

            <rect
              x={canvas.x}
              y={canvas.y}
              width={layoutMode === "linear" ? linearStripSlideWidth : canvas.w}
              height={canvas.h}
              fill="url(#starfield)"
              opacity={0.6}
            />

            {/* 4:5 frame guide — the mobile canvas bounds, shown in the editor. */}
            {mobileEdit && (
              <rect
                x={canvas.x}
                y={canvas.y}
                width={canvas.w}
                height={canvas.h}
                fill="none"
                stroke="#ffe066"
                strokeWidth={3 * slideUnitsPerPx}
                strokeDasharray={`${12 * slideUnitsPerPx} ${8 * slideUnitsPerPx}`}
                pointerEvents="none"
              />
            )}

            {/* Connection lines — drawn beneath the planets so the circles and
                labels stay on top. Map mode only (in linear mode the planets
                are reordered into a strip, so lines would be meaningless). */}
            {layoutMode === "map" && !game.active && effectiveConnections.map((conn, idx) => {
              const a = nodeByName.get(conn.from);
              const b = nodeByName.get(conn.to);
              if (!a || !b) return null;
              // Endpoints follow live drag positions in edit mode.
              const ax = dragState?.name === a.name ? dragState.x : a.x;
              const ay = dragState?.name === a.name ? dragState.y : a.y;
              const bx = dragState?.name === b.name ? dragState.x : b.x;
              const by = dragState?.name === b.name ? dragState.y : b.y;
              // Dim with the planets on sector-hover: a line stays lit if either
              // endpoint is in the hovered sector (its relationships), else it dims.
              const connDimmed =
                (hoveredSector !== null && a.sector !== hoveredSector && b.sector !== hoveredSector) ||
                (searchMatches !== null && !searchMatches.has(a.name) && !searchMatches.has(b.name));
              return (
                <g
                  key={`conn-${idx}`}
                  style={{ opacity: connDimmed ? 0.2 : 1, transition: "opacity 220ms ease" }}
                >
                  <ConnectionLine
                    ax={ax}
                    ay={ay}
                    bx={bx}
                    by={by}
                    connectionStyle={conn.style}
                    slideUnitsPerPx={slideUnitsPerPx}
                    isSelected={isEditMode && selectedConnIdx === idx}
                    isHovered={hoveredConn?.idx === idx}
                    interactive={isEditMode}
                    // No connection hover/tap on mobile — drop the handlers so the
                    // hit-area goes inert (see ConnectionLine).
                    onMouseEnter={isMobile ? undefined : (e) => setHoveredConn({ idx, x: e.clientX, y: e.clientY })}
                    onMouseMove={isMobile ? undefined : (e) => setHoveredConn({ idx, x: e.clientX, y: e.clientY })}
                    onMouseLeave={isMobile ? undefined : () => setHoveredConn((prev) => (prev?.idx === idx ? null : prev))}
                    onClick={
                      isMobile
                        ? undefined
                        : (e) => {
                            if (!isEditMode) return;
                            e.stopPropagation();
                            setSelectedConnIdx(idx);
                          }
                    }
                  />
                </g>
              );
            })}

            {/* Rubber-band line while drawing a new connection in edit mode. */}
            {isEditMode && connectMode && connectFrom !== null && connectCursor && (() => {
              const a = nodeByName.get(connectFrom);
              if (!a) return null;
              return (
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={connectCursor.x}
                  y2={connectCursor.y}
                  stroke="#ffe066"
                  strokeWidth={2 * slideUnitsPerPx}
                  strokeDasharray={`${6 * slideUnitsPerPx} ${5 * slideUnitsPerPx}`}
                  pointerEvents="none"
                  opacity={0.8}
                />
              );
            })()}

            {/* Sector labels — only in map mode (and never on mobile, where
                they would clutter the smaller viewport). */}
            {layoutMode === "map" && showSectorLabels && !isMobile && (() => {
              const visibleSectors = allSectors.filter(s => enabled.has(s));
              const unknownVisible = visibleSectors.filter(s => !isKnownSector(s));
              const labelFontPx = 16 * slideUnitsPerPx;
              return visibleSectors.map(s => {
                const unknownIdx = unknownVisible.indexOf(s);
                const c = effectiveSectorCenter(s, unknownIdx, unknownVisible.length);
                const isHighlighted = hoveredSector === s;
                const isFaded = hoveredSector !== null && !isHighlighted;
                const fill = isHighlighted
                  ? "rgba(255,255,255,0.95)"
                  : isFaded
                    ? "rgba(255,255,255,0.12)"
                    : "rgba(255,255,255,0.55)";
                return (
                  <text
                    key={`sec-${s}`}
                    x={c.x}
                    y={c.y}
                    textAnchor="middle"
                    fill={fill}
                    stroke="#000"
                    strokeWidth={0.8 * slideUnitsPerPx}
                    fontSize={labelFontPx}
                    fontWeight={700}
                    style={{
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      pointerEvents: "none",
                      paintOrder: "stroke fill",
                      transition: "fill 220ms ease",
                    }}
                  >
                    {s}
                  </text>
                );
              });
            })()}

            {/* Render hovered planet last so its stroke draws on top. */}
            {[
              ...visibleNodes.filter(n => n.name !== hoveredPlanet),
              ...visibleNodes.filter(n => n.name === hoveredPlanet),
            ].map(n => {
              // While dragging in edit mode, render the dragged planet at its
              // live cursor position (override node.x/y just for this frame).
              const placed = dlArrange ? downloadMoves[n.name] : undefined;
              const dragNode =
                dragState && dragState.name === n.name
                  ? { ...n, x: dragState.x, y: dragState.y }
                  : placed
                    ? { ...n, x: placed.x, y: placed.y }
                    : n;
              const styled = lab.hasOverrides
                ? { ...dragNode, style: labStyleFor(n.name, n.sector, n.style) }
                : dragNode;
              // Previewing the image: no pin cues (every planet of a fixed
              // arrangement is pinned), so it looks as the image will.
              const renderNode = exportPreview && styled.pinned ? { ...styled, pinned: false } : styled;
              // Game mode: a parked planet is a transparent disc with a 1px
              // sector-coloured outline; when it launches it cross-fades back
              // to its normal look (two stacked renders, opacity-tweened).
              if (game.active && !n.isEntity) {
                const launched = game.hud.launched.has(n.name);
                const fade = { transition: "opacity 700ms ease" } as const;
                return (
                  <g key={n.name}>
                    <g style={{ ...fade, opacity: launched ? 0 : 1 }}>
                      <Planet
                        node={{ ...renderNode, style: ghostStyleFor(renderNode) }}
                        slideUnitsPerPx={slideUnitsPerPx}
                        isHovered={false}
                        onHoverChange={setHoveredPlanet}
                        onClick={() => {}}
                        dimmed={false}
                        labelSizePx={renderLabelPx(n)}
                        labelStrokePx={labelStrokePxEff}
                        showValuation={showValuationFor(n)}
                        labelSuppressed={nameHidden(n, mobileView ? false : isMobile && zoom < MOBILE_LABEL_ZOOM_THRESHOLD && n.sector !== "Large Cap")}
                        labelMinScreenDiameter={nameFloor}
                      />
                    </g>
                    <g style={{ ...fade, opacity: launched ? 1 : 0, pointerEvents: launched ? undefined : "none" }}>
                      <Planet
                        node={renderNode}
                        slideUnitsPerPx={slideUnitsPerPx}
                        isHovered={false}
                        onHoverChange={setHoveredPlanet}
                        onClick={() => {}}
                        dimmed={false}
                        labelSizePx={renderLabelPx(n)}
                        labelStrokePx={labelStrokePxEff}
                        showValuation={showValuationFor(n)}
                        labelSuppressed={nameHidden(n, mobileView ? false : isMobile && zoom < MOBILE_LABEL_ZOOM_THRESHOLD && n.sector !== "Large Cap")}
                        labelMinScreenDiameter={nameFloor}
                      />
                    </g>
                  </g>
                );
              }
              return (
                <Planet
                  key={n.name}
                  part={namesOnTop ? "body" : "all"}
                  node={renderNode}
                  slideUnitsPerPx={slideUnitsPerPx}
                  isHovered={hoveredPlanet === n.name}
                  onHoverChange={setHoveredPlanet}
                  onClick={(node) => {
                    if (didDragRef.current || game.active) return;
                    bgClickSuppressRef.current = true; // a planet click, not a background click
                    if (isEditMode || mobileEdit || arrange || dlArrange) {
                      if (connectMode) {
                        handleConnectClick(node.name);
                      } else {
                        setSelectedPlanet(node.name);
                      }
                    } else if (mobileFocus) {
                      // Phone, a planet already in focus: a tap anywhere on the
                      // map — a planet included — backs out, like the ✕.
                      setInspectedPlanet(null);
                      if (isSyntheticMouse()) setHoveredPlanet(null);
                      if (layoutMode !== "linear") resetView(); // Linear keeps its strip zoom
                    } else if (!node.isEntity) {
                      // Entities (text-only sub-brands) have no detail panel.
                      travelToNode(node, true);
                      setInspectedPlanet(node.name);
                      // A tap leaves the planet "hovered" (the browser's emulated
                      // mouse events, and a finger never moves off again), which
                      // drew the white hover ring around the planet in focus.
                      if (isSyntheticMouse()) setHoveredPlanet(null);
                    }
                  }}
                  // No sector-hover dimming mid-game: the cursor sweeps across the
                  // sidebar while steering the paddle and would dim the field.
                  dimmed={
                    !game.active &&
                    ((hoveredSector !== null && n.sector !== hoveredSector) ||
                      (searchMatches !== null && !searchMatches.has(n.name)))
                  }
                  highlighted={searchMatches !== null && searchMatches.has(n.name)}
                  labelSizePx={renderLabelPx(n)}
                        labelStrokePx={labelStrokePxEff}
                  isEditMode={isEditMode || mobileEdit || arrange || dlArrange}
                  isSelected={
                    (isEditMode || mobileEdit || arrange || dlArrange) &&
                    (selectedPlanet === n.name ||
                      (connectMode && connectFrom === n.name))
                  }
                  onPlanetMouseDown={(isEditMode || mobileEdit || arrange || dlArrange) && !connectMode ? onPlanetDragStart : undefined}
                  showValuation={showValuationFor(n)}
                  // Mobile view: show names by on-screen size (tunable threshold).
                  // Desktop: only Large Cap until zoomed in.
                  labelSuppressed={nameHidden(
                    n,
                    mobileView ? false : isMobile && zoom < MOBILE_LABEL_ZOOM_THRESHOLD && n.sector !== "Large Cap",
                  )}
                  labelMinScreenDiameter={nameFloor}
                  // Mobile: hide entities by default, reveal once zoomed in.
                  entityLabelSuppressed={mobileView && zoom < ENTITY_MOBILE_ZOOM_THRESHOLD}
                />
              );
            })}

            {/* Names in their own layer above every planet, so a planet drawn
                later never covers a neighbour's name (the hovered one last). */}
            {namesOnTop &&
              [
                ...visibleNodes.filter((n) => n.name !== hoveredPlanet),
                ...visibleNodes.filter((n) => n.name === hoveredPlanet),
              ]
                .filter((n) => !n.isEntity)
                .map((n) => (
                  <Planet
                    key={`name-${n.name}`}
                    part="label"
                    node={n}
                    slideUnitsPerPx={slideUnitsPerPx}
                    isHovered={hoveredPlanet === n.name}
                    onHoverChange={setHoveredPlanet}
                    onClick={() => {}}
                    dimmed={
                      (hoveredSector !== null && n.sector !== hoveredSector) ||
                      (searchMatches !== null && !searchMatches.has(n.name))
                    }
                    highlighted={searchMatches !== null && searchMatches.has(n.name)}
                    labelSizePx={renderLabelPx(n)}
                    labelStrokePx={labelStrokePxEff}
                    showValuation={showValuationFor(n)}
                    labelSuppressed={nameHidden(
                      n,
                      mobileView ? false : isMobile && zoom < MOBILE_LABEL_ZOOM_THRESHOLD && n.sector !== "Large Cap",
                    )}
                    labelMinScreenDiameter={nameFloor}
                  />
                ))}

            {/* Draggable sector markers — edit mode only. Rendered after the
                planets so they sit on top in z-order and can be grabbed. */}
            {isEditMode && layoutMode === "map" && (() => {
              const visibleSectors = allSectors.filter(s => enabled.has(s));
              const unknownVisible = visibleSectors.filter(s => !isKnownSector(s));
              const chipW = 110 * slideUnitsPerPx;
              const chipH = 24 * slideUnitsPerPx;
              const chipFontPx = 11 * slideUnitsPerPx;
              return visibleSectors.map(s => {
                const unknownIdx = unknownVisible.indexOf(s);
                const baseCenter = effectiveSectorCenter(s, unknownIdx, unknownVisible.length);
                // While being dragged, render at the live cursor position.
                const liveCenter =
                  sectorDragState && sectorDragState.name === s
                    ? { x: sectorDragState.x, y: sectorDragState.y }
                    : baseCenter;
                const isOverridden = !!sectorPositions[s];
                return (
                  <g
                    key={`sec-marker-${s}`}
                    transform={`translate(${liveCenter.x},${liveCenter.y})`}
                    style={{ cursor: "grab" }}
                    onMouseDown={(e) => onSectorDragStart(s, baseCenter.x, baseCenter.y, e)}
                  >
                    <rect
                      x={-chipW / 2}
                      y={-chipH / 2}
                      width={chipW}
                      height={chipH}
                      rx={4 * slideUnitsPerPx}
                      fill={isOverridden ? "rgba(255,224,102,0.40)" : "rgba(255,224,102,0.18)"}
                      stroke="#ffe066"
                      strokeWidth={1.5 * slideUnitsPerPx}
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={chipFontPx}
                      fontWeight={700}
                      fill="#ffe066"
                      stroke="rgba(0,0,0,0.75)"
                      strokeWidth={0.6 * slideUnitsPerPx}
                      style={{
                        paintOrder: "stroke fill",
                        letterSpacing: 0.8,
                        textTransform: "uppercase",
                        pointerEvents: "none",
                        userSelect: "none",
                      }}
                    >
                      {s}
                    </text>
                  </g>
                );
              });
            })()}

            {/* Mobile 4:5 sector wells — draggable gravity centers. */}
            {mobileEdit && showSectorWells && (() => {
              const visibleSectors = allSectors.filter((s) => enabled.has(s));
              const unknownVisible = visibleSectors.filter((s) => !isKnownSector(s));
              const chipW = 110 * slideUnitsPerPx;
              const chipH = 24 * slideUnitsPerPx;
              const chipFontPx = 11 * slideUnitsPerPx;
              return visibleSectors.map((s) => {
                const unknownIdx = unknownVisible.indexOf(s);
                const c0 = sectorCenterFor(s, unknownIdx, unknownVisible.length, true);
                // Handle fallback must match the planets' gravity: Full uses the
                // desktop-canvas center; vertical/horizontal use the scaled grid.
                const baseCenter =
                  mobileSectorCenters[s] ??
                  (activeType === "full" || inheritsFullLayout(activeType)
                    ? desktopCenterForSector(s)
                    : { x: c0.x * 0.66, y: c0.y * 0.5 });
                const liveCenter =
                  sectorDragState && sectorDragState.name === s
                    ? { x: sectorDragState.x, y: sectorDragState.y }
                    : baseCenter;
                const isOverridden = !!mobileSectorCenters[s];
                return (
                  <g
                    key={`msec-${s}`}
                    transform={`translate(${liveCenter.x},${liveCenter.y})`}
                    style={{ cursor: "grab" }}
                    onMouseDown={(e) => onSectorDragStart(s, baseCenter.x, baseCenter.y, e)}
                  >
                    <circle r={7 * slideUnitsPerPx} fill="#7ce0ff" opacity={0.9} />
                    <rect
                      x={-chipW / 2}
                      y={chipH * 0.4}
                      width={chipW}
                      height={chipH}
                      rx={4 * slideUnitsPerPx}
                      fill={isOverridden ? "rgba(124,224,255,0.45)" : "rgba(124,224,255,0.18)"}
                      stroke="#7ce0ff"
                      strokeWidth={1.5 * slideUnitsPerPx}
                    />
                    <text
                      x={0}
                      y={chipH * 0.4 + chipH / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={chipFontPx}
                      fontWeight={700}
                      fill="#7ce0ff"
                      stroke="rgba(0,0,0,0.75)"
                      strokeWidth={0.6 * slideUnitsPerPx}
                      style={{ paintOrder: "stroke fill", letterSpacing: 0.8, textTransform: "uppercase", pointerEvents: "none", userSelect: "none" }}
                    >
                      {s}
                    </text>
                  </g>
                );
              });
            })()}

            {/* Layout lab → Arrange: draggable sector wells. Only the dot is a
                handle; the name is click-through so it never blocks a planet. */}
            {arrange && llab.showWells &&
              allSectors.filter((s) => enabled.has(s)).map((s) => {
                const baseCenter = sectorWellNow(s);
                const liveCenter =
                  sectorDragState && sectorDragState.name === s
                    ? { x: sectorDragState.x, y: sectorDragState.y }
                    : baseCenter;
                const moved = !!labSectors[s];
                return (
                  <g key={`lab-well-${s}`} transform={`translate(${liveCenter.x},${liveCenter.y})`}>
                    <circle
                      r={(moved ? 7 : 6) * slideUnitsPerPx}
                      fill={moved ? "#a7f3d0" : "rgba(167,243,208,0.35)"}
                      stroke="#a7f3d0"
                      strokeWidth={1.5 * slideUnitsPerPx}
                      style={{ cursor: "grab" }}
                      onMouseDown={(e) => onSectorDragStart(s, baseCenter.x, baseCenter.y, e)}
                    >
                      <title>{`${s} well — drag to move`}</title>
                    </circle>
                    <text
                      x={0}
                      y={15 * slideUnitsPerPx}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={9 * slideUnitsPerPx}
                      fontWeight={700}
                      fill="#a7f3d0"
                      stroke="rgba(0,0,0,0.85)"
                      strokeWidth={2 * slideUnitsPerPx}
                      style={{ paintOrder: "stroke fill", letterSpacing: 0.8, textTransform: "uppercase", pointerEvents: "none", userSelect: "none" }}
                    >
                      {s}
                    </text>
                  </g>
                );
              })}
            {/* Keyboard focus ring around the planet the arrow keys are on. */}
            {kbRingNode && (
              <circle
                cx={kbRingNode.x}
                cy={kbRingNode.y}
                r={kbRingNode.r + 6 * slideUnitsPerPx}
                fill="none"
                stroke="#8196fe"
                strokeWidth={3 * slideUnitsPerPx}
                pointerEvents="none"
              />
            )}
          </svg>
          {exportPreview && exportPreviewMarkup && (
            <ExportPreviewOverlay containerW={containerW} containerH={containerH} imageW={exportImageW} markup={exportPreviewMarkup} />
          )}
        </div>
        </div>

        {/* List view — sortable company table. Always mounted (so it can fade
            out on exit); `active` drives the cross-fade with the map, which
            fades out underneath. The sim keeps running so returning to map is
            instant. */}
        <CompanyListView
          sectorColorOverride={sectorColorResolved}
          bgStops={bgStops}
          rows={listRows}
          sort={listSort}
          onSort={handleListSort}
          active={viewMode === "list" && !timelineOpen}
          isMobile={isMobile}
          focusRow={listFocus}
          onSelect={(name) => {
            setInspectedPlanet(name);
            setA11yNote(`Opened details for ${usdFlag(name).display}`);
          }}
        />

        {/* Aggregate view — stacked market-cap-over-time chart (overlay, like list). */}
        <AggregateView
          bg={bgGradient}
          active={viewMode === "aggregate" && !timelineOpen}
          data={aggregateData}
          zoomTarget={aggZoomTarget}
          highlightSector={hoveredSector}
          highlightCompany={aggHighlight}
          onClearHighlight={() => setAggHighlight(null)}
          isMobile={isMobile}
        />

        {/* Mobile layout editor toolbar — only with ?edit=mobile. */}
        {mobileEdit && (
          <MobileEditorToolbar
            viewType={mobileEditType}
            onViewType={setMobileEditType}
            placed={Object.keys(mobilePositions).length}
            total={displayedCompanies.filter((c) => enabled.has(c.sector)).length}
            settings={activeSettings}
            onSetting={setActiveSetting}
            showWells={showSectorWells}
            onToggleWells={() => setShowSectorWells((v) => !v)}
            onRefreshPhysics={() => setPhysicsBump((n) => n + 1)}
            sectors={allSectors}
            enabledSectors={enabled}
            onToggleSector={toggleSector}
            selectedName={selectedPlanet}
            selectedPlaced={!!(selectedPlanet && mobilePositions[selectedPlanet])}
            onClearSelected={() => selectedPlanet && clearMobilePosition(selectedPlanet)}
            onDeselect={() => setSelectedPlanet(null)}
            onCopy={saveMobileToClipboard}
            onDownload={saveMobileAsDownload}
            onReset={resetMobilePositions}
          />
        )}

        {/* Editor toolbar — only rendered when ?edit=1 is in the URL. */}
        {isEditMode && (
          <EditorToolbar
            selectedName={selectedPlanet}
            selectedPosition={
              selectedPlanet ? positions[selectedPlanet] ?? null : null
            }
            selectedNode={
              selectedPlanet
                ? nodes.find((n) => n.name === selectedPlanet) ?? null
                : null
            }
            isDirty={isDirty}
            overrideCount={Object.keys(positions).length}
            sectorOverrideCount={Object.keys(sectorPositions).length}
            onTogglePin={() => selectedPlanet && togglePin(selectedPlanet)}
            onClearPosition={() => selectedPlanet && clearPosition(selectedPlanet)}
            onDeselect={() => setSelectedPlanet(null)}
            onSaveClipboard={saveToClipboard}
            onSaveDownload={saveAsDownload}
            onReset={resetPositions}
            onSaveSectorsClipboard={saveSectorsToClipboard}
            onResetSectors={resetSectorPositions}
            packingDensity={packingDensity}
            setPackingDensity={setPackingDensity}
            collidePadding={collidePadding}
            setCollidePadding={setCollidePadding}
            labelSizePx={labelSizePx}
            setLabelSizePx={setLabelSizePx}
            connectionPull={connectionPull}
            setConnectionPull={setConnectionPull}
            anchorDiamPreview={anchorDiam}
            collapsed={isToolbarCollapsed}
            onToggleCollapsed={() => setIsToolbarCollapsed(v => !v)}
            connectMode={connectMode}
            onToggleConnectMode={toggleConnectMode}
            connectFrom={connectFrom}
            connections={connections}
            selectedConnIdx={selectedConnIdx}
            onSelectConnection={setSelectedConnIdx}
            selectedConnection={selectedConnIdx !== null ? connections[selectedConnIdx] ?? null : null}
            onUpdateConnection={updateSelectedConn}
            onDeleteConnection={deleteSelectedConn}
            connectionsDirty={connectionsDirty}
            onSaveConnectionsClipboard={saveConnectionsToClipboard}
            onSaveConnectionsDownload={saveConnectionsAsDownload}
            onResetConnections={resetConnections}
          />
        )}

        {/* View-mode toggle — upper-right of the canvas (the game HUD takes its spot) */}
        {!timelineOpen && !game.active && (
          <div
            style={{
              // Positioned, so it's also the containing block the search
              // dropdown stretches to (see SearchBar) — keep it that way.
              position: "absolute",
              top: 16,
              // Mobile: anchor to the left edge; desktop: keep it upper-right.
              ...(isMobile ? { left: 16 } : { right: 16 }),
              zIndex: 12,
              display: "flex",
              background: PILL_BG,
              // 0.5px hairline (see PILL_HAIRLINE); padding is 4px + the 1px a
              // border used to take.
              boxShadow: PILL_HAIRLINE,
              borderRadius: 10,
              padding: 5,
              backdropFilter: "blur(6px)",
              gap: 2,
              alignItems: "center",
            }}
          >
            {/* The tabs collapse leftwards while search is open; the search field
                grows over the space they leave. */}
            <div
              ref={tabsRef}
              role="tablist"
              aria-label="Views"
              aria-hidden={searchOpen}
              style={{
                display: "flex",
                gap: 2,
                overflow: "hidden",
                maxWidth: searchOpen ? 0 : tabsWidth + 8,
                opacity: searchOpen ? 0 : 1,
                pointerEvents: searchOpen ? "none" : "auto",
                transition: "max-width 260ms cubic-bezier(0.4, 0, 0.2, 1), opacity 160ms ease",
              }}
            >
            {(["map", "linear", "aggregate", "list"] as AppViewMode[]).map(mode => {
              const active = viewMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => selectView(mode)}
                  role="tab"
                  aria-selected={active}
                  aria-label={VIEW_TAB_LABELS[mode]}
                  title={isMobile ? mode.charAt(0).toUpperCase() + mode.slice(1) : undefined}
                  className="mm-hover"
                  style={{
                    background: active ? "rgba(255,255,255,0.18)" : "transparent",
                    color: active ? "white" : "rgba(255,255,255,0.65)",
                    border: "none",
                    borderRadius: 7,
                    padding: isMobile ? "4px 10px" : "6px 14px",
                    fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
                    fontSize: 12,
                    fontWeight: 500,
                    letterSpacing: 1.2,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flex: "0 0 auto",
                    transition: "background 160ms, color 160ms, box-shadow 160ms",
                  }}
                >
                  {isMobile ? (
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: 20,
                        display: "block",
                        lineHeight: 1,
                        // linear_scale reads right-to-left in our strip (big → small).
                        transform: mode === "linear" ? "rotate(180deg)" : undefined,
                      }}
                    >
                      {VIEW_ICONS[mode]}
                    </span>
                  ) : (
                    <span className="cap-center">{mode.toUpperCase()}</span>
                  )}
                </button>
              );
            })}
            </div>
            <SearchBar
              open={searchOpen}
              onOpenChange={(o) => {
                setSearchOpen(o);
                if (o) setSwitcherOpen(false); // its menu would sit under the results
                if (!o) setSearchMatches(null);
              }}
              items={searchItems}
              onMatchesChange={setSearchMatches}
              onSelect={onSearchSelect}
              // Mobile's icon tabs are narrow, so there the field takes the full
              // row (screen minus gutters and the pill's padding + border); the
              // settings button on the right fades out while search is open.
              expandedWidth={isMobile ? Math.max(tabsWidth + 32, containerW - 42) : tabsWidth + 32}
              isMobile={isMobile}
            />
          </div>
        )}

        <GameOverlay
          phase={game.phase}
          countdown={game.countdown}
          hud={game.hud}
          totals={game.totals}
          paddle={game.paddle}
          closing={game.closing}
          onBegin={game.begin}
          onExit={game.exit}
          onReplay={game.replay}
        />

        {/* Timeline overlay — carousel of thumbnails + timeline strip at the bottom */}
        {timelineOpen && (
          <div
            onWheel={onTimelineWheel}
            role="region"
            aria-label="Time Machine"
            // ← → step a year (as the arrow buttons do); Escape closes.
            onKeyDown={(e) => {
              if (exploring) return;
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                const d = dateRange[clampIdx(focusIdx + (e.key === "ArrowLeft" ? -1 : 1))];
                if (d) { e.preventDefault(); setHoveredDate(null); focusOn(d); }
              } else if (e.key === "Escape") {
                e.preventDefault();
                setTimelineOpen(false);
              }
            }}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              zIndex: 5,
              // The year strip starts below the bottom edge when it slides in.
              // `clip`, not `hidden`: nothing in here should be able to scroll it.
              overflow: "clip",
              // Hands off while "Explore this map" plays out.
              pointerEvents: exploring ? "none" : undefined,
            }}
          >
            <Carousel
              key={tmIntroToken}
              dates={dateRange}
              position={scrollIdx}
              animate={timelineAnimate}
              canvas={canvas}
              onSelect={focusOn}
              onSettle={(index) => {
                setTimelineAnimate(true);
                setScrollIdx(clampIdx(index));
              }}
              onExplore={onExploreMap}
              tuning={tm.tuning}
              // The same big / small split the map's type uses.
              bigThresholdB={KT?.labelThresholdB ?? 100}
              exploring={!!exploring}
              phone={isMobile}
            />
            <TimelineStrip
              key={`strip-${tmIntroToken}`}
              dates={dateRange}
              activeDate={timelineFocus}
              hoveredDate={hoveredDate}
              onSelect={(d) => { setHoveredDate(null); focusOn(d); }}
              onHover={setHoveredDate}
              tuning={tm.tuning}
              exploring={!!exploring}
            />
            {tm.enabled && (
              <TmTuningPanel
                tuning={tm.tuning}
                setTuning={tm.setTuning}
                defaults={tm.defaults}
                device={!isMobile ? "desktop" : realIsMobile ? "phone" : "phone-preview"}
                setName={!isMobile ? "Desktop" : activeType === "full" ? "Phone 16:9" : "Phone 1:1"}
                onReplay={() => setTmIntroToken((n) => n + 1)}
              />
            )}
          </div>
        )}

        {/* Eshap logo — top-left of the map, hugging the side panel (desktop).
            Drops below the "open panel" icon while the sidebar is collapsed.
            Easter egg: clicking it starts game mode — it fades out here and the
            paddle fades in at the bottom of the map. */}
        {!isMobile && (
          <button
            ref={gameLogoRef}
            type="button"
            onClick={game.start}
            className="eshap-logo eshap-logo--faint"
            aria-label="Eshap — play the game"
            style={{
              position: "absolute",
              left: 16,
              top: sidebarOpen ? 16 : 56,
              zIndex: 11,
              display: "block",
              lineHeight: 0,
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              // Hidden during the game (it becomes the paddle) and in the List /
              // Aggregate views, where it would sit on top of their headers.
              opacity: game.active || viewMode === "list" || viewMode === "aggregate" ? 0 : undefined,
              pointerEvents: game.active || viewMode === "list" || viewMode === "aggregate" ? "none" : "auto",
              transition: "top 240ms ease, opacity 360ms ease",
            }}
          >
            {/* The logo is white artwork on transparency, so it's drawn as a CSS
                mask filled with `background-color` — that lets hover recolour it
                (see .eshap-logo--faint in App.css). 2625×933 source. */}
            <span className="eshap-logo-mark" aria-hidden style={{ width: 96, height: Math.round((96 * 933) / 2625) }} />
          </button>
        )}

        {/* Bottom-left pill stack. Timeline button is always the first pill
            (at the bottom). Saved views + the active view appear above in
            chronological order; the pill matching the active date is highlighted.
            Pill widths follow their content (parent uses alignItems flex-start). */}
        <div
          style={{
            position: "absolute",
            left: 16,
            // Clear the mobile browser's home indicator / toolbar safe area.
            bottom: "calc(16px + env(safe-area-inset-bottom))",
            zIndex: 11,
            // Hidden while the game runs — the paddle sweeps through this corner —
            // and in Aggregate, which shows every year at once (so neither the
            // year pills nor the Time Machine apply).
            display: game.active || viewMode === "aggregate" ? "none" : "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 6,
            // The whole stack steps aside while the Time Machine is open: the year
            // pills pick the MAP's year, and once you're in, the Time Machine
            // button has done its job (Close Timeline is the way out).
            // On a phone it also steps aside (down and out) while a planet is in
            // focus, with the other bottom controls: the detail panel sits there.
            opacity: timelineOpen || mobileFocus ? 0 : 1,
            pointerEvents: timelineOpen || mobileFocus ? "none" : undefined,
            // Hidden: gone from the Tab order and screen readers too (after the fade).
            visibility: timelineOpen || mobileFocus ? "hidden" : "visible",
            transform: mobileFocus ? "translateY(28px)" : "translateY(0)",
            transition:
              (mobileFocus || isMobile ? MOBILE_FOCUS_STEP_ASIDE : "opacity 200ms ease") +
              (timelineOpen || mobileFocus ? ", visibility 0s linear 320ms" : ", visibility 0s"),
          }}
        >
          {displayedViewDates.map(d => {
            const key = `${d.year}-${d.month}`;
            const isActive = sameDate(d, activeDate);
            const isHovered = hoveredViewKey === key;
            // The current year is permanent (no ✕); every past-year view can be
            // removed, and shows its ✕ persistently so that's discoverable.
            const isCurrentYear = d.year === currentDate.year;
            return (
              <button
                key={key}
                aria-label={isActive ? `Currently showing ${formatDate(d)}` : `Switch to ${formatDate(d)}`}
                className={timelineOpen ? "tm-btn" : undefined}
                onClick={() => { if (!isActive) selectDate(d); }}
                onMouseEnter={() => setHoveredViewKey(key)}
                onMouseLeave={() => setHoveredViewKey(prev => prev === key ? null : prev)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: isActive
                    ? "rgba(120,160,255,0.22)"
                    : isHovered
                      ? "rgba(255,255,255,0.12)"
                      : "rgba(255,255,255,0.05)",
                  border: isActive
                    ? "1px solid rgba(150,180,255,0.6)"
                    : isHovered
                      ? "1px solid rgba(255,255,255,0.30)"
                      : "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 10,
                  // Same box as the map's other controls: 34px tall, 12px at the sides.
                  height: 34,
                  boxSizing: "border-box",
                  padding: "0 12px",
                  backdropFilter: "blur(6px)",
                  color: isActive ? "white" : isHovered ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.7)",
                  fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: 1,
                  // Always a pointer: the pill has a hover state even when it is
                  // the year already showing (clicking it then does nothing).
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 160ms, color 160ms, border-color 160ms",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ opacity: 0.5, fontSize: 11 }}>{isActive ? "●" : "◎"}</span>
                {/* In a span so the Time Machine hover veil sits under it (see .tm-btn). */}
                <span>{formatDate(d)}</span>
                {!isCurrentYear && (
                  <span
                    role="button"
                    aria-label={`Remove ${formatDate(d)}`}
                    onClick={(e) => { e.stopPropagation(); removeSavedView(d); }}
                    style={{
                      marginLeft: 4,
                      opacity: isHovered ? 1 : 0.6,
                      fontSize: 12,
                      lineHeight: 1,
                      padding: "0 2px",
                      transition: "opacity 160ms",
                    }}
                  >
                    ✕
                  </span>
                )}
              </button>
            );
          })}

          {/* Explicit Timeline trigger — always the bottom pill */}
          <button
            aria-label={timelineOpen ? "Time machine open (use close button to close)" : "Open time machine"}
            // In the Time Machine the light pills go dark on hover (App.css).
            className={timelineOpen ? "tm-btn" : undefined}
            onClick={() => (timelineOpen ? setTimelineOpen(false) : openTimeline())}
            onMouseEnter={() => setTimelineButtonHovered(true)}
            onMouseLeave={() => setTimelineButtonHovered(false)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              // The control pills' 0.5px hairline, but a lighter fill than theirs so
              // the button isn't missed. Hover adds the light wash the other
              // controls get (.mm-hover's, done here because the hairline already
              // uses the box-shadow).
              background: "rgba(255,255,255,0.08)",
              border: "none",
              boxShadow: timelineButtonHovered ? `${PILL_HAIRLINE}, inset 0 0 0 200px rgba(255,255,255,0.08)` : PILL_HAIRLINE,
              borderRadius: 10,
              height: 34,
              boxSizing: "border-box",
              // 12px + the 1px a border used to take.
              padding: "0 13px",
              backdropFilter: "blur(6px)",
              color: "white",
              fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: 1,
              cursor: "pointer",
              textAlign: "left",
              transition: "box-shadow 160ms",
              whiteSpace: "nowrap",
            }}
          >
            <span className="material-symbols-outlined" style={{ opacity: 0.6, fontSize: 16 }}>history</span>
            <span className="cap-center">TIME MACHINE</span>
          </button>
        </div>

        {/* Close-timeline button — upper-right, only when timeline is open
            (the view-mode toggle that normally sits here is hidden while open). */}
        {timelineOpen && (
          <button
            aria-label="Close timeline"
            className="tm-btn"
            onClick={() => setTimelineOpen(false)}
            style={{
              position: "absolute",
              right: 16,
              top: 16,
              zIndex: 11,
              opacity: exploring ? 0 : 1,
              transition: `opacity ${TM_EXPLORE_FADE_MS}ms ease`,
              pointerEvents: exploring ? "none" : undefined,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(120,160,255,0.18)",
              border: "1px solid rgba(150,180,255,0.5)",
              borderRadius: 10,
              height: 34,
              boxSizing: "border-box",
              padding: "0 12px",
              backdropFilter: "blur(6px)",
              color: "white",
              fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: 1,
              cursor: "pointer",
            }}
          >
            <span style={{ opacity: 0.5, fontSize: 11 }}>✕</span>
            <span className="cap-center">CLOSE TIMELINE</span>
          </button>
        )}

        {/* Zoom + download UI — hidden in timeline mode (no map). Download stays
            in every view; the zoom group folds away in List (nothing to zoom). */}
        {!timelineOpen && !game.active && (
          <div
            style={{
              position: "absolute",
              // In Aggregate the controls tuck into the bottom-right corner of
              // the last (right-most) bar, AGG_CONTROLS_INSET in from its right
              // and bottom edges, clear of the year labels below the plot.
              right: viewMode === "aggregate" ? AGG_LAST_BAR_RIGHT + AGG_CONTROLS_INSET : 16,
              bottom: `calc(${viewMode === "aggregate" ? AGG_PAD_BOTTOM + AGG_CONTROLS_INSET : 16}px + env(safe-area-inset-bottom))`,
              display: "flex",
              flexDirection: "row",
              gap: 8,
              zIndex: 10,
              // Phone: steps aside while a planet is in focus (see the year pills).
              opacity: mobileFocus ? 0 : 1,
              pointerEvents: mobileFocus ? "none" : undefined,
              transform: mobileFocus ? "translateY(28px)" : "translateY(0)",
              transition: `bottom 240ms ease, right 240ms ease, ${MOBILE_FOCUS_STEP_ASIDE}`,
            }}
          >
            {/* − / + / refresh. In List (nothing to zoom) it fades out and back in;
                it keeps its place, so Download — to its right — never moves. Hidden
                from keyboard and screen readers once faded. */}
            <div
              aria-hidden={viewMode === "list"}
              style={{
                display: "flex",
                flexDirection: "row",
                gap: 8,
                background: PILL_BG,
                // 6px + the 1px a border used to take, so the pill keeps its size.
                padding: 7,
                borderRadius: 10,
                backdropFilter: "blur(6px)",
                // A 0.5px hairline around the pill (the buttons inside have no
                // stroke). Drawn as an inset shadow: browsers round a 0.5px
                // `border` up to a full pixel.
                boxShadow: PILL_HAIRLINE,
                opacity: viewMode === "list" ? 0 : 1,
                visibility: viewMode === "list" ? "hidden" : "visible",
                pointerEvents: viewMode === "list" ? "none" : "auto",
                transition: viewMode === "list" ? "opacity 220ms ease, visibility 0s linear 220ms" : "opacity 220ms ease",
              }}
            >
              {/* On a phone − / + are left out of the Map view (you pinch to
                  zoom) and of Linear (you swipe along the strip). They stay in
                  Aggregate, where they are the only way to zoom. */}
              {!(isMobile && (viewMode === "map" || viewMode === "linear")) && (
                <>
                  <button aria-label="Zoom out" className="mm-hover" onClick={() => (viewMode === "aggregate" ? aggZoomBy(1 / AGG_ZOOM_STEP) : zoomBy(1 / ZOOM_STEP))} style={{ ...zoomBtnStyle, color: ICON_GREY }}>−</button>
                  <button aria-label="Zoom in" className="mm-hover" onClick={() => (viewMode === "aggregate" ? aggZoomBy(AGG_ZOOM_STEP) : zoomBy(ZOOM_STEP))} style={{ ...zoomBtnStyle, color: ICON_GREY }}>+</button>
                </>
              )}
              <button
                aria-label="Refresh view"
                className="mm-hover"
                onClick={() => (viewMode === "aggregate" ? setAggZoomTarget(1) : resetView())}
                style={{
                  ...zoomBtnStyle,
                  // Mobile: icon-only, so keep the square 34×34 zoom-button footprint
                  // (grid + placeItems:center) → same width as − / +, icon centered.
                  // Desktop: auto-width pill with the REFRESH label.
                  ...(isMobile
                    ? {}
                    : {
                        width: "auto",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "0 13px", // 12px + the 1px the removed border used to take
                        fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
                        fontSize: 13,
                        fontWeight: 500,
                        letterSpacing: 1,
                      }),
                }}
              >
                {!isMobile && <span className="cap-center">REFRESH</span>}
                <span
                  className="material-symbols-outlined"
                  style={{
                    opacity: isMobile ? 1 : 0.6,
                    fontSize: isMobile ? 18 : 16,
                    display: "block",
                    lineHeight: 1,
                  }}
                >
                  refresh
                </span>
              </button>
            </div>
            {/* Download — in every view. */}
            <div
              style={{
                display: "flex",
                background: PILL_BG,
                // 6px + the 1px a border used to take, so the pill keeps its size.
                padding: 7,
                borderRadius: 10,
                backdropFilter: "blur(6px)",
                // A 0.5px hairline around the pill (the buttons inside have no
                // stroke). Drawn as an inset shadow: browsers round a 0.5px
                // `border` up to a full pixel.
                boxShadow: PILL_HAIRLINE,
              }}
            >
              <button
                id="mm-download-btn"
                aria-label="Download the map and more about the Media Universe"
                title="Download"
                className="mm-hover"
                onClick={() => setAboutOpen(true)}
                style={{
                  ...zoomBtnStyle,
                  // Label stays white (zoomBtnStyle color); only the icon is grey.
                  // Mobile: icon-only square; desktop: auto-width pill with the DOWNLOAD label.
                  ...(isMobile
                    ? {}
                    : {
                        width: "auto",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "0 13px", // 12px + the 1px the removed border used to take
                        fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
                        fontSize: 13,
                        fontWeight: 500,
                        letterSpacing: 1,
                      }),
                }}
              >
                {!isMobile && <span className="cap-center">DOWNLOAD</span>}
                <span className="material-symbols-outlined" style={{ fontSize: isMobile ? 20 : 18, display: "block", lineHeight: 1, color: ICON_GREY }}>download</span>
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Mobile-only: gear button that switches the mobile view type. Hidden
          while the timeline is open (CLOSE TIMELINE sits in the same spot). */}
      {isMobile && !mobileEdit && !timelineOpen && (
        <MobileViewSwitcher
          open={switcherOpen}
          onToggle={() => setSwitcherOpen((o) => !o)}
          viewType={mobileViewType}
          onViewType={(t) => { setMobileViewType(t); setSwitcherOpen(false); }}
          elevated={showRotatePrompt}
          hidden={searchOpen}
        />
      )}

      {/* Mobile-only: bottom pill bar that opens the sectors drawer. */}
      {isMobile && (
        <MobileSectorTriggerBar onOpen={() => setMobileSectorsOpen(true)} hidden={mobileFocus} />
      )}
      {isMobile && (
        <MobileSectorDrawer
          {...sectorPanelProps}
          // The drawer covers the map on mobile, so zooming to a sector behind it
          // is pointless — tapping the name just toggles the sector instead.
          onFocusSector={sectorPanelProps.onToggle}
          open={mobileSectorsOpen}
          onClose={() => setMobileSectorsOpen(false)}
        />
      )}

      {/* Right-side planet detail panel — opens on planet click in non-edit mode. */}
      {/* Style lab panel — ?style=1 only (branch experiment). */}
      {lab.enabled && (
        <StyleLabPanel
          lab={lab}
          sectors={allSectors}
          liveSectorColor={(s) => {
            const flat = flatStyleForSector(s);
            return sanity?.styleBySector[s]?.fill ?? flat?.fill ?? flat?.stripes?.[0] ?? `hsl(${sanity?.hueBySector[s] ?? hueForSector(s)}, 70%, 55%)`;
          }}
          largeCapNames={nodes.filter((n) => n.sector === "Large Cap" && !n.isEntity).map((n) => n.name).sort()}
          liveStyleFor={(name) => nodes.find((n) => n.name === name)?.style ?? null}
        />
      )}
      <PlanetDetailPanel
        node={inspectedPlanet ? nodes.find((n) => n.name === inspectedPlanet) ?? null : null}
        detail={inspectedPlanet ? sanity?.detailByName[inspectedPlanet] ?? null : null}
        lastUpdated={inspectedPlanet ? lastUpdatedByName.get(inspectedPlanet) : undefined}
        history={inspectedHistory}
        isPresent={activeDate.year === currentDate.year}
        onClose={() => {
          setInspectedPlanet(null);
          if (layoutMode !== "linear") resetView(); // Linear keeps its strip zoom
        }}
        mobileHeight={isMobile ? Math.round(windowH * MOBILE_DETAIL_HEIGHT_SHARE) : null}
      />

      {/* Connection hover tooltip — follows the cursor along a hovered line. */}
      {hoveredConn && effectiveConnections[hoveredConn.idx] && (() => {
        const conn = effectiveConnections[hoveredConn.idx];
        return (
          <div
            style={{
              position: "fixed",
              left: hoveredConn.x + 14,
              top: hoveredConn.y + 14,
              zIndex: 60,
              maxWidth: 260,
              background: "rgba(7,14,32,0.95)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 8,
              padding: "8px 10px",
              color: "#e6edf7",
              fontFamily: '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif',
              fontSize: 12,
              lineHeight: 1.4,
              boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
              backdropFilter: "blur(6px)",
              pointerEvents: "none",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: conn.description ? 4 : 0 }}>
              {conn.from} → {conn.to}
            </div>
            <div style={{ fontSize: 10, opacity: 0.6, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: conn.description ? 4 : 0 }}>
              {conn.style === "solid" ? "Wholly owned" : "Partial / in-process"}
            </div>
            {conn.description && <div style={{ opacity: 0.9 }}>{conn.description}</div>}
          </div>
        );
      })()}

      <AboutModal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        onDownloadMap={downloadMapImage}
        initialSection={aboutOpenAt}
        onSectionChange={setAboutSection}
      />
    </div>
    </LabFrame>
  );
}

const arrowBtnStyle = (enabled: boolean): React.CSSProperties => ({
  width: 38,
  height: 38,
  display: "grid",
  placeItems: "center",
  // The Time Machine button's look: light fill + the pills' 0.5px hairline
  // (an inset shadow — a 0.5px border would be rounded up to 1px).
  background: enabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
  color: enabled ? "white" : "rgba(255,255,255,0.25)",
  border: "none",
  boxShadow: enabled ? PILL_HAIRLINE : "inset 0 0 0 0.5px rgba(255,255,255,0.06)",
  // No border, so the Time Machine hover veil (.tm-btn) needn't reach past the edge.
  ["--tm-veil-inset" as string]: "0px",
  borderRadius: 8,
  cursor: enabled ? "pointer" : "default",
  fontSize: 22,
  fontWeight: 400,
  lineHeight: 1,
  backdropFilter: "blur(6px)",
  transition: "background 160ms ease, color 160ms ease",
});

// Shared light-grey for the map-control icons (TIME MACHINE / REFRESH / +/− /
// download), matching the 0.6-opacity grey the TIME MACHINE + REFRESH icons use.
const ICON_GREY = "rgba(255,255,255,0.6)";

const zoomBtnStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  display: "grid",
  // Spelled out, not `placeItems`: Refresh and Download add `alignItems` for
  // their desktop (labelled) form, and when the window narrows to the phone
  // layout React removes it again — which also wiped the align-items half of a
  // `placeItems` shorthand and left the icons sitting high.
  alignItems: "center",
  justifyItems: "center",
  background: "rgba(255,255,255,0.1)",
  color: "white",
  // No stroke at all — not even a transparent one: the hover highlight
  // (.mm-hover, an inset shadow) stops at the border, so any border shows up
  // as a ring on hover.
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 18,
  fontWeight: 600,
  lineHeight: 1,
};

