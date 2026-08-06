import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { loadCompanies, type SheetCompany } from "./loadCompanies";
import {
  usePhysicsLayout,
  Planet,
  ConnectionLine,
  computeAnchorDiam,
  makeMoment,
  yearWindowsActiveAt,
  type PlanetNode,
  type ViewMode,
  type LayoutInput,
} from "@media-map/map-core";
import { COMPANY_POSITIONS, type PlanetPosition } from "./layout";
import { COMPANY_CONNECTIONS, type Connection } from "./connections";
import { isSanityConfigured } from "./sanityClient";
import { useSanityMapDocs, useResolvedSanityMap, type CompanyDetail, type ValuationType } from "./sanityMap";

// Side-panel label for each company's primary metric (chosen in Sanity).
const VALUATION_LABELS: Record<ValuationType, string> = {
  market_cap: "Latest Market Cap",
  fundraising_valuation: "Fundraising Valuation",
  yearly_revenue: "Yearly Revenue",
};
import { MOBILE_LAYOUTS, type MobileViewType, type MobileLayout, type MobileSettings } from "./mobileLayout";
import {
  CANVAS_DESKTOP,
  CANVAS_MOBILE_45,
  CANVAS_MOBILE_HORIZONTAL,
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
import { useValuations, valuationAt, latestYear, latestUpdated, type ValuationData } from "./loadValuations";

const MOBILE_BREAKPOINT_PX = 768;

// "Mobile" = a narrow (portrait-phone) viewport OR a phone held in landscape.
// The landscape clause keys off a coarse pointer + short viewport so a phone on
// its side (wider than the breakpoint) still gets the mobile chrome (drawer +
// touch controls), while a desktop window or an iPad in landscape does not.
const MOBILE_MEDIA_QUERY =
  `(max-width: ${MOBILE_BREAKPOINT_PX}px), ` +
  `(max-height: 500px) and (orientation: landscape) and (pointer: coarse)`;

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

// ---- Mobile view types + per-type layouts ----
// Each mobile view type is an independently-authored layout (settings, planet
// positions, sector wells) on its own canvas: `full` reuses the desktop
// landscape canvas (unplaced planets fall back to the desktop layout);
// `vertical` is 4:5 portrait; `horizontal` is 16:9 landscape.
const CANVAS_BY_TYPE: Record<MobileViewType, { x: number; y: number; w: number; h: number }> = {
  full: CANVAS_DESKTOP,
  vertical: CANVAS_MOBILE_45,
  horizontal: CANVAS_MOBILE_HORIZONTAL,
};
const MOBILE_VIEW_TYPES: MobileViewType[] = ["full", "vertical", "horizontal"];

const MOBILE_VIEW_STORE_KEY = "mm.mobileViewType";
function loadMobileViewType(): MobileViewType {
  if (typeof window === "undefined") return "full";
  try {
    const raw = window.localStorage.getItem(MOBILE_VIEW_STORE_KEY);
    if (raw === "full" || raw === "vertical" || raw === "horizontal") return raw;
  } catch {
    /* ignore */
  }
  return "full";
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
const LIST_BG_GRADIENT = "linear-gradient(180deg, #1E0300 0%, #010C4C 51%, #070010 100%)";

// The gradient's stops (0% / 51% / 100%), as RGB, for per-row sampling.
const LIST_GRADIENT_STOPS: [number, [number, number, number]][] = [
  [0, [30, 3, 0]],
  [0.51, [1, 12, 76]],
  [1, [7, 0, 16]],
];
// Solid color of the background gradient at vertical fraction `f` (0 = top).
function sampleListGradient(f: number): string {
  const clamped = f < 0 ? 0 : f > 1 ? 1 : f;
  let [f0, c0] = LIST_GRADIENT_STOPS[0];
  for (let i = 1; i < LIST_GRADIENT_STOPS.length; i++) {
    const [f1, c1] = LIST_GRADIENT_STOPS[i];
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
const USD_FLAG_COLOR = "#3ba9ff";
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
}: {
  open: boolean;
  onToggle: () => void;
  viewType: MobileViewType;
  onViewType: (t: MobileViewType) => void;
}) {
  const calibri = 'Calibri, "Helvetica Neue", Arial, sans-serif';
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        zIndex: 14,
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
          background: open ? "rgba(120,160,255,0.22)" : "rgba(0,0,0,0.5)",
          border: open ? "1px solid rgba(150,180,255,0.6)" : "1px solid rgba(255,255,255,0.2)",
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
          <span style={{ fontFamily: calibri, fontSize: 11, opacity: 0.85 }}>Map view</span>
          {MOBILE_VIEW_TYPES.map((opt) => (
            <button
              key={opt}
              onClick={() => onViewType(opt)}
              style={{
                fontFamily: calibri,
                fontSize: 13,
                padding: "8px 10px",
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "left",
                textTransform: "capitalize",
                color: "white",
                background: viewType === opt ? "rgba(120,160,255,0.25)" : "rgba(255,255,255,0.06)",
                border: viewType === opt ? "1px solid rgba(150,180,255,0.6)" : "1px solid rgba(255,255,255,0.15)",
              }}
            >
              {opt}
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
const labelScaleForZoom = (zoom: number) =>
  Math.min(LABEL_GROW_MAX, Math.max(1, 1 + (zoom - LABEL_GROW_START) * 0.12));

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

function formatValuation(b: number): string {
  if (b >= 1000) return `$${(b / 1000).toFixed(b >= 10000 ? 1 : 2)}T`;
  if (b >= 10) return `$${b.toFixed(0)}B`;
  if (b >= 1) return `$${b.toFixed(1)}B`;
  return `$${(b * 1000).toFixed(0)}M`;
}

// Canvas-based text measurer. One offscreen 2D context shared across calls.
// Used to compute each planet's rendered label width so the collision force
// can keep small planets with long names from overlapping their neighbors.
const LABEL_FONT_FAMILY = 'Calibri, "Helvetica Neue", Arial, sans-serif';
const textMeasureCtx: CanvasRenderingContext2D | null =
  typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
const textWidthCache = new Map<string, number>();
function measureLabelTextWidth(text: string, fontPx: number, weight: number = 700): number {
  if (!textMeasureCtx) return text.length * fontPx * 0.55;
  const key = `${weight}|${fontPx}|${text}`;
  const cached = textWidthCache.get(key);
  if (cached !== undefined) return cached;
  textMeasureCtx.font = `${weight} ${fontPx}px ${LABEL_FONT_FAMILY}`;
  const w = textMeasureCtx.measureText(text).width;
  textWidthCache.set(key, w);
  return w;
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
};

const pillBtn: React.CSSProperties = {
  flex: 1,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.18)",
  color: "#fff",
  borderRadius: 6,
  padding: "5px 0",
  fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
  fontSize: 16,
  cursor: "pointer",
};

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
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.4 }}>Sectors</div>
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
        <button onClick={() => onAll(true)} className="mm-hover" style={pillBtn}>All</button>
        <button onClick={() => onAll(false)} className="mm-hover" style={pillBtn}>None</button>
      </div>
      </div>
      {/* Sector list — the ONLY scrolling region (header above stays fixed).
          Clear the hover only when the cursor leaves the whole list — not when
          it crosses between rows — so the map doesn't flicker. */}
      <div
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
          const customBg = flat?.swatchBackground ?? null;
          const primary = flat?.fill ?? flat?.stripes?.[0] ?? null;
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
                    tabIndex={0}
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
          background: "rgba(7, 14, 32, 0.85)",
          color: "#e6edf7",
          padding: "16px 14px",
          fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
          userSelect: "none",
        }}
      >
      {/* Brand title + collapse button — pinned at the top of the panel. */}
      <div style={{ flex: "0 0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              lineHeight: 1.1,
            }}
          >
            Media Universe
          </div>
          <button onClick={onCollapse} aria-label="Collapse panel" title="Collapse panel" className="panel-icon-btn" style={iconBtnStyle}>
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

      {/* ESHAP logo — pinned at the lower left of the panel. */}
      <div style={{ flex: "0 0 auto", paddingTop: 14, marginTop: 4 }}>
        <img
          src="/ESHAP%20logo.png"
          alt="ESHAP"
          style={{ width: 96, height: "auto", display: "block" }}
        />
      </div>
      </div>
    </aside>
  );
}

function MobileSectorTriggerBar({ onOpen }: { onOpen: () => void }) {
  return (
    <div
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        padding: "10px 12px",
        background: "rgba(7,14,32,0.95)",
        borderTop: "1px solid rgba(255,255,255,0.10)",
        boxSizing: "border-box",
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
          fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
          fontSize: 14,
          fontWeight: 600,
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
          fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
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

// Minimum months of data before a company is "complete" enough to chart.
const CHART_MONTHS_MIN = 12;

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
function HistoryChart({ series }: { series: { month: string; value: number }[] }) {
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
        <span style={{ fontSize: 16, fontWeight: 700 }}>{formatValuation(cs.value)}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
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

function PlanetDetailPanel({
  node,
  detail,
  lastUpdated,
  history,
  onClose,
}: {
  node: PlanetNode | null;
  detail: CompanyDetail | null;
  lastUpdated?: string;
  history: { month: string; value: number }[];
  onClose: () => void;
}) {
  const open = node !== null;
  const valuation = node?.valuation_b ?? 0;

  return (
    <aside
      aria-hidden={!open}
      style={{
        position: "fixed",
        // Inset on all four sides so the panel floats — clear of the view-mode
        // toggle (top-right) above and the zoom controls (bottom-right) below,
        // with the same 16px right margin as those controls. Corner radius
        // matches the floating control groups.
        top: 72,
        right: 16,
        bottom: 80,
        width: 340,
        maxWidth: "calc(100vw - 32px)",
        background: "rgba(7,14,32,0.92)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 10,
        backdropFilter: "blur(6px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
        color: "#e6edf7",
        fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
        padding: "22px 24px",
        boxSizing: "border-box",
        overflowY: "auto",
        // Fade up from a slight offset below the resting position. Smoother
        // and less directional than a slide-in from the edge.
        transform: open ? "translateY(0)" : "translateY(14px)",
        opacity: open ? 1 : 0,
        transition:
          "transform 460ms cubic-bezier(0.22, 1, 0.36, 1), opacity 380ms cubic-bezier(0.22, 1, 0.36, 1)",
        zIndex: 30,
        pointerEvents: open ? "auto" : "none",
      }}
    >
      {node && (
        <>
          <button
            onClick={onClose}
            aria-label="Close detail panel"
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              width: 28,
              height: 28,
              display: "grid",
              placeItems: "center",
              background: "rgba(255,255,255,0.08)",
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
            <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1, marginBottom: 6 }}>
              {usdFlag(node.name).display}
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1.5, textTransform: "uppercase" }}>
              {node.sector}
            </div>
          </div>

          <PanelSection label={VALUATION_LABELS[detail?.valuationType ?? "market_cap"]}>
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>
              {formatValuation(valuation)}
            </span>
            {lastUpdated && (
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 5 }}>
                Updated {formatContentDate(lastUpdated)}
              </div>
            )}
          </PanelSection>

          {history.length >= CHART_MONTHS_MIN && (
            <PanelSection label="Historical Market Cap">
              <HistoryChart series={history} />
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

          {detail && detail.vitals.length > 0 && (
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
                    <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.1 }}>{v.name}</div>
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
        </>
      )}
    </aside>
  );
}

function PanelSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22, paddingBottom: 18, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
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
              <span style={{ fontWeight: 700, fontSize: 13 }}>{r.title}</span>
              {r.meta && (
                <span style={{ opacity: 0.5, fontSize: 12, marginLeft: 6, textTransform: "capitalize" }}>
                  {r.meta}
                </span>
              )}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {r.date && <span style={{ opacity: 0.55, fontSize: 12 }}>{formatContentDate(r.date)}</span>}
              {r.url && <span style={{ opacity: 0.7 }}>→</span>}
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
          fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
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
        fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
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
              fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
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
          label="Spacing (collide pad)"
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
                    fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
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
                fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
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
          fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
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
  fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
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

const THUMB_ANCHOR_VAL = 4308;
const THUMB_ANCHOR_DIAM = 1143;

// Carousel slot sizing
const CAROUSEL_SLOT_W = 220;
const CAROUSEL_NEIGHBOR_W = 180;  // visual width of non-selected
const CAROUSEL_SELECTED_W = 360;  // visual width of selected
const CAROUSEL_VISIBLE_HALFWIDTH = 8; // how many slots to render on each side

/**
 * Static, non-interactive map preview used in the timeline carousel.
 * Reuses the *active* simulation's positions for visual continuity — only
 * sizes change based on each month's mocked valuations.
 */
function MapThumbnail({
  date,
  baseCompanies,
  valData,
  nodes,
  canvas,
  isActive,
  isSelected,
  onClick,
}: {
  date: MapDate;
  baseCompanies: SheetCompany[];
  valData: ValuationData;
  nodes: PlanetNode[];
  canvas: { x: number; y: number; w: number; h: number };
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const valByName = useMemo(() => {
    const m = new Map<string, number>();
    // Real value from the sheet for this year (by slug); else the legacy mock.
    for (const c of baseCompanies)
      m.set(c.name, valuationAt(valData, c.slug, String(date.year)) ?? valuationForDate(c, date));
    return m;
  }, [baseCompanies, valData, date]);

  // Local hover state — only used to surface a stroke that signals
  // clickability. It does NOT propagate up to the carousel, so hovering
  // a non-selected thumbnail no longer slides the strip.
  const [isHovered, setIsHovered] = useState(false);

  // Selected thumbnail is visibly larger than non-selected ones.
  const contentWidth = isSelected ? CAROUSEL_SELECTED_W : CAROUSEL_NEIGHBOR_W;

  // Border priority: selected (strongest) > hovered (signals clickability) >
  // active > default. Hover only kicks in when the thumb isn't already selected.
  const border = isSelected
    ? "2px solid rgba(180, 200, 255, 0.9)"
    : isHovered
      ? "2px solid rgba(255,255,255,0.7)"
      : isActive
        ? "2px solid rgba(120, 160, 255, 0.55)"
        : "1px solid rgba(255,255,255,0.12)";

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        flex: "0 0 auto",
        width: contentWidth,
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        opacity: isSelected ? 1 : isHovered ? 0.9 : 0.7,
        transition:
          "width 700ms cubic-bezier(0.65, 0, 0.35, 1), opacity 200ms ease",
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: `${canvas.w / canvas.h}`,
          background:
            "radial-gradient(ellipse at 30% 30%, #0f2a52 0%, #04102a 60%, #00050f 100%)",
          borderRadius: 10,
          border,
          boxShadow: isSelected
            ? "0 0 32px rgba(120, 160, 255, 0.45)"
            : isActive
              ? "0 0 16px rgba(80, 120, 200, 0.25)"
              : "none",
          overflow: "hidden",
          transition:
            "border-color 200ms ease, box-shadow 600ms cubic-bezier(0.65, 0, 0.35, 1)",
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`${canvas.x} ${canvas.y} ${canvas.w} ${canvas.h}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {nodes.map(n => {
            const v = valByName.get(n.name) ?? 0;
            const r = (THUMB_ANCHOR_DIAM * Math.sqrt(Math.max(v, 0) / THUMB_ANCHOR_VAL)) / 2;
            if (r < 2) return null;
            // Thumbnail dots are too small for visible stripes; show the first
            // stripe color (or the flat fill) as a representative dot.
            const primary = n.style?.fill ?? n.style?.stripes?.[0] ?? null;
            const fill = primary ?? `hsl(${n.hue}, 65%, 55%)`;
            const stroke = n.style?.stroke
              ?? (primary ? hexToRgba(primary, 0.5) : `hsla(${n.hue}, 70%, 75%, 0.5)`);
            return (
              <circle
                key={n.name}
                cx={n.x}
                cy={n.y}
                r={r}
                fill={fill}
                stroke={stroke}
                strokeWidth={Math.max(1, r * 0.04)}
              />
            );
          })}
        </svg>
      </div>
      <div
        style={{
          fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
          fontSize: isSelected ? 13 : 11,
          fontWeight: isSelected ? 700 : isActive ? 600 : 500,
          color: isSelected
            ? "rgba(255,255,255,0.95)"
            : isActive
              ? "rgba(220, 230, 255, 0.85)"
              : "rgba(255,255,255,0.55)",
          letterSpacing: 1,
          transition: "color 220ms ease, font-size 220ms ease",
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
  baseCompanies,
  valData,
  nodes,
  canvas,
  onSelect,
  onExplore,
}: {
  dates: MapDate[];
  /** Fractional index into `dates` — the carousel's horizontal position. */
  position: number;
  /** Ease the transform (clicks/snap) vs. track the scroll 1:1 (wheel scrub). */
  animate: boolean;
  baseCompanies: SheetCompany[];
  valData: ValuationData;
  nodes: PlanetNode[];
  canvas: { x: number; y: number; w: number; h: number };
  onSelect: (d: MapDate) => void;
  onExplore: () => void;
}) {
  // Nearest whole year — drives which thumb is enlarged + the render window.
  const selectedIdx = Math.max(0, Math.min(dates.length - 1, Math.round(position)));
  const activeIdx = selectedIdx;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerW(el.getBoundingClientRect().width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Track the previous selected index. During a slide, render all the slots
  // the strip passes through so the carousel never goes blank mid-transition.
  const prevSelectedIdxRef = useRef(selectedIdx);
  const [renderRange, setRenderRange] = useState({
    minIdx: Math.max(0, selectedIdx - CAROUSEL_VISIBLE_HALFWIDTH),
    maxIdx: Math.min(dates.length - 1, selectedIdx + CAROUSEL_VISIBLE_HALFWIDTH),
  });

  useEffect(() => {
    const prev = prevSelectedIdxRef.current;
    const target = selectedIdx;
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
  }, [selectedIdx, dates.length]);

  const slots: number[] = [];
  for (let i = renderRange.minIdx; i <= renderRange.maxIdx; i++) slots.push(i);

  // Translate the strip so the (fractional) position lands at the viewport
  // center — so wheel scrubbing tracks continuously, not just per whole year.
  const selectedCenter = position * CAROUSEL_SLOT_W + CAROUSEL_SLOT_W / 2;
  const translateX = containerW > 0 ? containerW / 2 - selectedCenter : 0;

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        padding: "24px 0",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          height: "100%",
          width: dates.length * CAROUSEL_SLOT_W,
          transform: `translateX(${translateX}px)`,
          // Ease for clicks + the snap-on-release; none while scrubbing so the
          // strip tracks the wheel 1:1. easeInOutCubic — symmetric in/out.
          transition: animate ? "transform 640ms cubic-bezier(0.65, 0, 0.35, 1)" : "none",
        }}
      >
        {slots.map(i => {
          const d = dates[i];
          const isSelected = i === selectedIdx;
          const isActive = i === activeIdx;
          return (
            <div
              key={`${d.year}-${d.month}`}
              style={{
                position: "absolute",
                left: i * CAROUSEL_SLOT_W,
                top: 0,
                width: CAROUSEL_SLOT_W,
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: isSelected ? 2 : 1,
              }}
            >
              <MapThumbnail
                date={d}
                baseCompanies={baseCompanies}
                valData={valData}
                nodes={nodes}
                canvas={canvas}
                isActive={isActive}
                isSelected={isSelected}
                onClick={() => onSelect(d)}
              />
            </div>
          );
        })}
      </div>

      {/* "Explore map" — loads the map at the selected view and closes the
          timeline. Sits below the selected thumbnail's date label. */}
      <button
        aria-label="Explore the map at this view"
        onClick={onExplore}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          // half of selected thumb height (≈ 117) + label gap (≈ 26) + button gap (16)
          transform: "translate(-50%, calc(117px + 42px))",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 8,
          background: "rgba(120,160,255,0.18)",
          border: "1px solid rgba(150,180,255,0.5)",
          color: "white",
          fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: 1,
          cursor: "pointer",
          backdropFilter: "blur(6px)",
          zIndex: 3,
          transition: "background 160ms, color 160ms, border-color 160ms",
        }}
      >
        EXPLORE MAP
        <span style={{ opacity: 0.7, fontSize: 13 }}>→</span>
      </button>
    </div>
  );
}

function TimelineStrip({
  dates,
  activeDate,
  hoveredDate,
  onSelect,
  onHover,
}: {
  dates: MapDate[];
  activeDate: MapDate;
  hoveredDate: MapDate | null;
  onSelect: (d: MapDate) => void;
  onHover: (d: MapDate | null) => void;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  // Scroll the active month into view when it changes.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(
      `[data-date="${activeDate.year}-${activeDate.month}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [activeDate]);

  return (
    <div
      ref={stripRef}
      onMouseLeave={() => onHover(null)}
      style={{
        height: 76,
        flex: "0 0 76px",
        display: "flex",
        alignItems: "flex-end",
        // Center the ticks in the strip; `safe` falls back to left-aligned +
        // scrollable if they ever get wider than the container.
        justifyContent: "safe center",
        gap: 0,
        padding: "0 16px 8px",
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
            onClick={() => onSelect(d)}
            onMouseEnter={() => onHover(d)}
            title={formatDate(d)}
            style={{
              flex: "0 0 auto",
              width: 44,
              height: 60,
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
              fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
              fontSize: 10,
              letterSpacing: 0.5,
              position: "relative",
            }}
          >
            <span
              style={{
                width: isHovered ? 3 : active ? 3 : 2,
                height: isHovered ? 36 : active ? 24 : 16,
                background: isHovered
                  ? "white"
                  : active
                    ? "rgba(180,200,255,0.95)"
                    : "rgba(255,255,255,0.4)",
                borderRadius: 1,
                transition: "height 140ms ease, width 140ms ease, background 140ms ease",
              }}
            />
            {/* Every tick is a year now. Show the year always; on hover reveal the
                full label (the present year adds its month, e.g. "JUL 2026"). */}
            <span
              style={{
                height: 12,
                lineHeight: "12px",
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

function CompanyListView({
  rows,
  sort,
  onSort,
  active,
  isMobile,
}: {
  rows: ListRow[];
  sort: ListSort;
  onSort: (key: ListSortKey) => void;
  active: boolean;
  isMobile: boolean;
}) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
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
      const cells = tbody.querySelectorAll<HTMLElement>("td[data-frozen]");
      const n = cells.length;
      if (!n) return;
      const rect = tbody.getBoundingClientRect();
      const rowH = rect.height / n;
      const vh = window.innerHeight || 1;
      cells.forEach((cell, i) => {
        cell.style.backgroundColor = sampleListGradient((rect.top + (i + 0.5) * rowH) / vh);
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
  }, [isMobile, rows, active]);
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
        fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
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
                  style={{ ...th, ...(col.key === "company" ? { ...stickyHead, paddingLeft: 20 } : {}), textAlign: col.align, color: active ? "#fff" : th.color }}
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
              onMouseEnter={() => setHoveredRow(r.name)}
              onMouseLeave={() => setHoveredRow(prev => (prev === r.name ? null : prev))}
              style={{
                background: hoveredRow === r.name
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(255,255,255,0.03)",
                opacity: active ? 1 : 0,
                transform: active ? "translateY(0)" : "translateY(10px)",
                transition: `opacity 320ms ease ${enterDelay}ms, transform 320ms ease ${enterDelay}ms, background 120ms ease`,
                cursor: "pointer",
              }}
            >
              <td data-frozen={isMobile ? "" : undefined} style={{ ...td, fontWeight: 700, ...stickyCell(hoveredRow === r.name), paddingLeft: 20, ...(usdFlag(r.name).flag ? { color: USD_FLAG_COLOR } : {}) }}>{usdFlag(r.name).display}</td>
              <td style={td}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: 3,
                      flex: "0 0 auto",
                      background: sectorDotBackground(r.sector),
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

// ---- Aggregate view (stacked market-cap-over-time chart) ----
// A fourth view alongside map/linear/list. Every company is a vertical run of
// yearly bars whose height = its valuation; bands are ordered PER YEAR (largest
// on top) so you can track a company rising/falling. The stack is normalized so
// the single highest-total year fills the plot height. Multi-color planets
// collapse to their single most-saturated swatch. The +/- buttons zoom the time axis.

type AppViewMode = ViewMode | "aggregate";
type AggBand = { name: string; sector: string; color: string; values: number[] };
type AggregateData = { dates: MapDate[]; bands: AggBand[]; maxTotal: number };

// Same blue gradient the maps use, so the aggregate view feels of a piece.
const AGG_GRADIENT = LIST_BG_GRADIENT;
const AGG_GAP_STROKE = "rgba(0,0,0,0.35)";

// Per-company band color overrides (keyed by lowercased company name). Used when
// a planet's own palette doesn't read well as a single stacked band.
const AGG_COLOR_OVERRIDES: Record<string, string> = {
  apple: "#155E9D",
  microsoft: "#A9812E",
  alphabet: "#A73632",
  meta: "#94959F",
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

// Intro-animation timing/offsets — tuned via the dev overlay, then baked in.
// posOffset: px the bar slides up from · hFrac: fraction of height that grows ·
// stagM/stagC: month/company stagger spans · duration: ms · easing: out-cubic.
const AGG_INTRO = { posOffset: 90, hFrac: 1, stagM: 0.2, stagC: 0.15, duration: 980 };

function AggregateView({ active, data, zoomTarget, highlightSector }: { active: boolean; data: AggregateData; zoomTarget: number; highlightSector: string | null }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<{ i: number; k: number | null; sx: number; sy: number } | null>(null);
  const padL = 12, padR = 14, padT = 34, padB = 26;

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
    if (!plotW || !plotH || !scale) return [] as { fill: string; sector: string; d: string }[];
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
      return { fill: b.color, sector: b.sector, d: barsPath(xLeft, barW, up, lo, b.values, M) };
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

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    if (M === 0 || slotW <= 0 || !scale) return;
    const i = Math.max(0, Math.min(M - 1, Math.floor((sx - padL) / slotW)));
    let k: number | null = null;
    for (let b = 0; b < bands.length; b++) {
      if (bands[b].values[i] > 0 && sy >= stacks.upper[b][i] && sy <= stacks.lower[b][i]) { k = b; break; }
    }
    setHover({ i, k, sx, sy });
  };

  const hoverBand = hover?.k != null ? bands[hover.k] : null;

  return (
    <div
      ref={wrapRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5,
        fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
        background: AGG_GRADIENT,
        opacity: active ? 1 : 0,
        pointerEvents: active ? "auto" : "none",
        transition: "opacity 320ms ease",
        overflow: "hidden",
      }}
    >
      {/* Scroll layer — the chart scrolls horizontally when zoomed; the caption
          and tuning panel below stay fixed. */}
      <div ref={scrollRef} style={{ width: "100%", height: "100%", overflowX: "auto", overflowY: "hidden" }}>
        <svg
          width={svgW}
          height={dims.h}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          style={{ display: "block", cursor: "crosshair" }}
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
              style={{ opacity: highlightSector && s.sector !== highlightSector ? 0.12 : 1, transition: "opacity 160ms ease" }}
            />
          ))}
          {hoverOutline && <path d={hoverOutline} fill="none" stroke="#fff" strokeWidth={1.2} />}
        </svg>
        {hover && hoverBand && (
          <div
            style={{
              position: "absolute",
              left: Math.min(hover.sx + 14, svgW - 190),
              top: Math.max(8, Math.min(hover.sy + 14, dims.h - 70)),
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
        <div style={{ position: "absolute", top: 12, left: 14, fontSize: 11, letterSpacing: 0.6, color: "rgba(255,255,255,0.55)", pointerEvents: "none" }}>
          Total market cap over time · height relative to peak ({formatValuation(maxTotal)}, {formatDate(dates[peakIdx])})
        </div>
      )}

    </div>
  );
}

// Fetch the app's Calibri TTFs and inline them as @font-face data URIs. Used
// when rasterizing the map SVG to PNG: an <img>-loaded SVG can't fetch external
// fonts, so embedding them keeps the label typography correct (and same-origin
// data URIs avoid tainting the export canvas). Cached after the first build.
let mapFontCssCache: string | null = null;
async function buildMapFontCss(): Promise<string> {
  if (mapFontCssCache !== null) return mapFontCssCache;
  const fonts = [
    { url: "/calibri.ttf", weight: 400 },
    { url: "/calibri_bold.ttf", weight: 700 },
  ];
  const faces = await Promise.all(
    fonts.map(async (f) => {
      try {
        const res = await fetch(f.url);
        if (!res.ok) return "";
        const bytes = new Uint8Array(await res.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
          bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        return `@font-face{font-family:'Calibri';font-style:normal;font-weight:${f.weight};src:url(data:font/ttf;base64,${btoa(bin)}) format('truetype');}`;
      } catch {
        return "";
      }
    }),
  );
  mapFontCssCache = faces.filter(Boolean).join("\n");
  return mapFontCssCache;
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
  const calibri = 'Calibri, "Helvetica Neue", Arial, sans-serif';
  const btn: React.CSSProperties = {
    fontFamily: calibri,
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
        fontFamily: calibri,
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
        {MOBILE_VIEW_TYPES.map((opt) => (
          <button
            key={opt}
            onClick={() => onViewType(opt)}
            style={{
              flex: 1,
              fontFamily: calibri,
              fontSize: 11,
              padding: "6px 0",
              borderRadius: 6,
              cursor: "pointer",
              textTransform: "capitalize",
              color: "white",
              background: viewType === opt ? "rgba(120,160,255,0.28)" : "rgba(255,255,255,0.06)",
              border: viewType === opt ? "1px solid rgba(150,180,255,0.6)" : "1px solid rgba(255,255,255,0.15)",
            }}
          >
            {opt}
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
                    fontFamily: calibri,
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

export default function MediaMap() {
  const isMobile = useIsMobile();
  const isEditMode = useIsEditMode();
  // Mobile view type + per-type layouts. On the phone the gear switches the view
  // type (persisted); ?edit=mobile is the desktop editor whose selector controls
  // `mobileEditType`. `activeType` is whichever is being shown/edited; its layout
  // (settings + positions + sector wells) drives the canvas and physics.
  const [mobileViewType, setMobileViewType] = useState<MobileViewType>(loadMobileViewType);
  const [mobileEditType, setMobileEditType] = useState<MobileViewType>("vertical");
  const mobileEdit = useMobileEditMode();
  const activeType: MobileViewType = mobileEdit ? mobileEditType : mobileViewType;
  // A mobile authored view is active (phone or editor); desktop non-edit = false.
  const mobileView = isMobile || mobileEdit;
  const [mobileLayouts, setMobileLayouts] = useState<Record<MobileViewType, MobileLayout>>(
    () => cloneMobileLayouts(MOBILE_LAYOUTS),
  );
  const activeLayout = mobileLayouts[activeType];
  const activeSettings = activeLayout.settings;
  const mobilePositions = activeLayout.positions;
  const mobileSectorCenters = activeLayout.sectorCenters;
  const [showSectorWells, setShowSectorWells] = useState(true);
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
  // Surface a failed Sanity read (otherwise it falls back to the sheet silently).
  useEffect(() => {
    if (sanityError) console.warn("[media-map] Sanity read failed — using the sheet instead:", sanityError);
  }, [sanityError]);
  // Real market caps from the valuation Google Sheet (Phase 4c), indexed by
  // (slug, month). Falls back to the legacy sheet + mock when unconfigured/missing.
  const { data: valData, lastUpdated: lastUpdatedBySlug } = useValuations();
  // The map's "current" view = the newest YEAR column in the valuation sheet (so
  // the view advances when a year rolls over), with its MONTH derived from the
  // newest ingest "last_updated" (decision #3). Falls back to the calendar date
  // until the sheet loads.
  const currentDate = useMemo<MapDate>(() => {
    const year = latestYear(valData);
    if (!year) return CURRENT_DATE;
    const updated = latestUpdated(lastUpdatedBySlug);
    // Month from the run date when it lands in the newest year; else calendar month.
    const month = updated && String(updated.year) === year ? updated.month : CURRENT_DATE.month;
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
  const baseCompanies = useMemo<SheetCompany[]>(() => {
    // While Sanity is configured but still loading, return NOTHING. Otherwise the
    // physics first-load animation fires on the sheet fallback, then the real
    // Sanity data (and sector seeding) arrives mid-animation, changes the layout
    // hook's deps, tears the running tween down, and freezes a half-settled,
    // overlapping frame. Holding empty until the data lands makes the first-anim
    // run once on stable data and complete every time.
    if (isSanityConfigured() && sanityLoading) return [];
    if (!sanity) return companies;
    return sanity.companies.map((c) => {
      const sheetVal = sheetValByName.get(c.name.toLowerCase()) ?? 0;
      const detail = sanity.detailByName[c.name];
      // Precedence: the valuation sheet's market cap for the current year (by
      // slug) → the manually-entered Sanity value (private/PSM) → the legacy
      // sheet (so non-US "NA" / uncovered companies still render).
      const valuation_b =
        valuationAt(valData, c.slug, currentYearKey) ?? detail?.manualValue ?? sheetVal;
      return { name: c.name, sector: c.sector, slug: c.slug, valuation_b };
    });
  }, [sanity, sanityLoading, companies, sheetValByName, valData, currentYearKey]);
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

  const selectDate = (d: MapDate) => setActiveDate(d);

  const removeSavedView = (d: MapDate) => {
    if (d.year === currentDate.year) return; // the current year is never removable
    setSavedViews(prev => prev.filter(p => !sameDate(p, d)));
    if (sameDate(d, activeDate)) setActiveDate(currentDate); // closed the active view → back to the present
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
  const onExploreMap = () => {
    const target = timelineFocus;
    setActiveDate(target);
    setSavedViews(prev => (prev.some(p => sameDate(p, target)) ? prev : [...prev, target]));
    setTimelineOpen(false);
  };
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
  // The spatial layout shown beneath everything: map | linear. "list" is an
  // overlay that fades over whatever layout was last active, so the layout is
  // frozen here and "list" never drives the SVG geometry or the physics hook.
  // This is what lets linear→list fade straight from the strip (instead of
  // briefly snapping to the map) and list→map fade back into place. Updated in
  // lockstep with viewMode via selectView() so the two never drift.
  const [layoutMode, setLayoutMode] = useState<"map" | "linear">("map");
  const selectView = (mode: AppViewMode) => {
    setViewMode(mode);
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

  const displayedCompanies = useMemo(
    () => {
      // Hide companies whose appearance windows don't cover the viewed year (the
      // map, list + linear views all read this; the aggregate keeps every company
      // and windows per-year instead).
      const activeMoment = makeMoment(activeDate.year, activeDate.month);
      const visible = baseCompanies.filter((c) => yearWindowsActiveAt(windowsFor(c.name), activeMoment));
      return sameDate(activeDate, currentDate)
        ? visible
        : visible.map((c) => ({ ...c, valuation_b: valAt(c, activeDate) }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseCompanies, activeDate, currentDate, valData, sanity],
  );

  // Aggregate view: every company's valuation across the whole timeline, ordered
  // by the CURRENT map's valuation (largest first). Colors mirror the planets.
  const aggregateData = useMemo<AggregateData>(() => {
    const bands: AggBand[] = baseCompanies.map((c) => {
      const style = sanity ? (sanity.styleByName[c.name] ?? null) : planetStyleFor(c.name, c.sector);
      const hue = sanity?.hueBySector[c.sector] ?? hueForSector(c.sector);
      const palette = style?.stripes && style.stripes.length
        ? style.stripes
        : [style?.fill ?? `hsl(${hue}, 65%, 55%)`];
      const color = AGG_COLOR_OVERRIDES[c.name.trim().toLowerCase()] ?? mostSaturatedColor(palette);
      // A company contributes a bar only in years its appearance windows cover
      // (empty = all years); outside the window its value is 0 (no bar).
      const windows = windowsFor(c.name);
      const values = dateRange.map((d) =>
        yearWindowsActiveAt(windows, makeMoment(d.year, d.month)) ? Math.max(0, valAt(c, d)) : 0,
      );
      return { name: c.name, sector: c.sector, color, values };
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
  }, [baseCompanies, dateRange, valData, sanity]);

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
        if (!yearWindowsActiveAt(windows, makeMoment(d.year, d.month))) continue; // outside its window
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
  }, [baseCompanies, dateRange, valData]);

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
  const effBase = {
    packingDensity: sanity?.settings?.packingDensity ?? packingDensity,
    collidePadding: sanity?.settings?.collidePadding ?? collidePadding,
    labelSizePx: sanity?.settings?.labelSizePx ?? labelSizePx,
    connectionPull: sanity?.settings?.connectionPull ?? connectionPull,
    entityRadius: sanity?.settings?.entityRadius,
    sizeSpacing: sanity?.settings?.sizeSpacing,
    sectorPull: sanity?.settings?.sectorPull,
    repulsion: sanity?.settings?.repulsion,
  };
  // On a mobile view, the active view type's own settings drive the physics so
  // all planets spread to FILL its frame without overlapping (unplaced ones flow
  // around the pins). Desktop = effBase.
  const eff = {
    ...effBase,
    ...(mobileView
      ? {
          sectorPull: activeSettings.sectorPull,
          collidePadding: activeSettings.collidePadding,
          sizeSpacing: activeSettings.sizeSpacing,
          repulsion: activeSettings.repulsion,
        }
      : {}),
  };

  const anchorDiam = useMemo(
    () =>
      computeAnchorDiam(
        displayedCompanies.map((c) => c.valuation_b),
        canvas.w * canvas.h,
        eff.packingDensity,
        // Mobile view: per-type global planet-size multiplier.
      ) * (mobileView ? activeSettings.scale : 1),
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
  const labelRadii = useMemo(() => {
    if (naturalSlideUnitsPerPx === 1 && containerW === 0) return {};
    const result: Record<string, number> = {};
    // Match Planet's rendering: lineHeight = 1.0, fontWeight 700, Calibri.
    // Large Cap planets also render a valuation line below the name (with a
    // small top margin), so they get one extra line of height.
    for (const c of displayedCompanies) {
      const words = c.name.trim().split(/\s+/);
      const maxWordPx = words.reduce(
        (m, w) => Math.max(m, measureLabelTextWidth(w, eff.labelSizePx, 700)),
        0,
      );
      const lineCount = words.length + (c.sector === "Large Cap" ? 1 : 0);
      const heightPx = lineCount * eff.labelSizePx;
      const halfExtentPx = Math.max(maxWordPx, heightPx) / 2;
      result[c.name] = halfExtentPx * naturalSlideUnitsPerPx;
    }
    return result;
  }, [displayedCompanies, eff.labelSizePx, naturalSlideUnitsPerPx, containerW]);

  // Adapter: resolve the sheet's companies into map-core's data-source-agnostic
  // LayoutInput (visible-only, with each planet's default center, hue, and style
  // resolved from sectors.ts). The `false` mobile flag keeps desktop sector
  // centers on phones too (temporary mobile plan). Sector overrides win over the
  // default center; a per-company position override (passed via `positions`)
  // then wins over that inside the hook.
  const inputs = useMemo<LayoutInput[]>(() => {
    const allSectors = Array.from(new Set(displayedCompanies.map((c) => c.sector))).sort();
    const unknownSectors = allSectors.filter((s) => !isKnownSector(s));
    const activeYearKey = String(activeDate.year);
    const companyInputs = displayedCompanies
      .filter((c) => enabled.has(c.sector))
      .map((c) => {
        const unknownIdx = unknownSectors.indexOf(c.sector);
        // Mobile 4:5 view: start unplaced planets from the mobile sector centers
        // scaled into the smaller 4:5 canvas (they'll be dragged into place in
        // the editor; hand-placed ones are pinned via `positions`). Otherwise
        // Sanity wins, then local defaults.
        const desktopCenter = () =>
          sanity?.centerBySector[c.sector] ??
          sectorPositions[c.sector] ??
          sectorCenterFor(c.sector, unknownIdx, unknownSectors.length, false);
        let center: { x: number; y: number };
        if (mobileView) {
          const well = mobileSectorCenters[c.sector];
          if (well) center = well;
          else if (activeType === "full") center = desktopCenter();
          else {
            // vertical/horizontal: scale the mobile sector grid into the canvas.
            const c0 = sectorCenterFor(c.sector, unknownIdx, unknownSectors.length, true);
            center = { x: c0.x * (canvas.w / 3000), y: c0.y * (canvas.h / 5000) };
          }
        } else {
          center = desktopCenter();
        }
        // Red label when the value isn't live-sourced from the valuation sheet
        // yet (NA / blank / not in it) — it's still shown via the legacy fallback.
        const live = valuationAt(valData, c.slug, activeYearKey) !== undefined;
        // "Convert to USD" authoring marker: strip it from the drawn label and
        // tint the name bright blue as a "needs fixing" cue (wins over the red
        // not-live flag). `name` stays the full identity for matching.
        const usd = usdFlag(c.name);
        return {
          name: c.name,
          sector: c.sector,
          valuation_b: c.valuation_b,
          center,
          hue: sanity?.hueBySector[c.sector] ?? hueForSector(c.sector),
          style: sanity ? (sanity.styleByName[c.name] ?? null) : planetStyleFor(c.name, c.sector),
          labelColor: usd.flag ? USD_FLAG_COLOR : live ? undefined : "#ff6b6b",
          ...(usd.flag ? { labelText: usd.display } : {}),
        };
      });
    // Text-only entity nodes (Sanity only), filtered to enabled sectors.
    const entityInputs = (sanity?.entities ?? []).filter((e) => enabled.has(e.sector));
    return [...companyInputs, ...entityInputs];
  }, [displayedCompanies, enabled, sectorPositions, sanity, valData, activeDate, mobileView, activeType, canvas, mobileSectorCenters]);

  // Connections used for both physics and rendering: Sanity (windowed at T) when
  // configured, else the local edit-state. The edit-mode connection authoring
  // (selection/draw/export) still operates on the local `connections` state.
  const effectiveConnections = sanity ? sanity.connections : connections;

  // Mobile placements as hard pins so planets stay exactly where they're dropped;
  // live drags override via `dragState` in the renderer. Un-authored planets fall
  // back to their sector well + physics — except the FULL view, which falls back
  // to the desktop layout so it starts as the desktop map.
  const mobilePinnedPositions = useMemo(() => {
    const out: Record<string, PlanetPosition> = {};
    if (activeType === "full") {
      const base = sanity ? sanity.positions : positions;
      for (const [name, p] of Object.entries(base)) out[name] = { ...p };
    }
    for (const [name, p] of Object.entries(mobilePositions)) out[name] = { x: p.x, y: p.y, pin: true };
    return out;
  }, [mobilePositions, activeType, sanity, positions]);

  const nodes = usePhysicsLayout({
    inputs,
    bounds: physicsBounds,
    viewMode: layoutMode,
    // Mobile view uses the per-type pins; desktop uses Sanity/local.
    positions: mobileView ? mobilePinnedPositions : sanity ? sanity.positions : positions,
    isEditMode: isEditMode || mobileEdit,
    anchorDiam,
    collidePadding: eff.collidePadding,
    entityRadius: eff.entityRadius,
    sizeSpacing: eff.sizeSpacing,
    sectorPull: eff.sectorPull,
    repulsion: eff.repulsion,
    labelRadii,
    connections: effectiveConnections,
    connectionStrength: eff.connectionPull,
  });
  // In linear mode the strip extends to the right of the canvas; compute the
  // total slide-coord width so the SVG can be sized wider than the viewport
  // and a horizontal scrollbar appears.
  const linearStripSlideWidth = useMemo(() => {
    if (layoutMode !== "linear") return canvas.w;
    let maxRight = canvas.x + canvas.w;
    for (const n of nodes) {
      const right = n.x + n.r + 80;
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

  const view = useMemo(() => {
    // Both desktop and the mobile 4:5 view frame the whole canvas ("meet"), so
    // the 4:5 view shows the entire portrait frame (fits the measured region on
    // a phone; letterboxed in the wide desktop editor).
    const w = canvas.w / zoom;
    const h = canvas.h / zoom;
    const cx = canvas.x + canvas.w / 2 + pan.x;
    const cy = canvas.y + canvas.h / 2 + pan.y;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }, [zoom, pan, canvas]);

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
      if (mobileEdit) updateActiveLayout((l) => ({ ...l, sectorCenters: { ...l.sectorCenters, [name]: pos } }));
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
      if (mobileEdit) {
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
    if (!isEditMode && !mobileEdit) return;
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
    if (!isEditMode && !mobileEdit) return;
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

  // Click-to-focus on a planet.
  const focusOnPlanet = (node: PlanetNode) => {
    const targetViewW = Math.max(node.r * 6, canvas.w / MAX_ZOOM);
    const targetZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, canvas.w / targetViewW));
    const targetPan = {
      x: node.x - (canvas.x + canvas.w / 2),
      y: node.y - (canvas.y + canvas.h / 2),
    };
    animateView(targetZoom, targetPan);
  };

  // Reset to the default view, smoothly. In vertical mode the base view is
  // already the content-fit (see the `view` memo), so zoom=1/pan=0 frames it.
  const resetView = () => {
    animateView(1, { x: 0, y: 0 }, 1100);
  };

  // Export the current map as a 1920×1080 PNG. Clones the live map SVG, reframes
  // it to a 16:9 viewBox around the current view, embeds the fonts, rasterizes to
  // a canvas over the map's background gradient, and downloads it.
  const downloadMapImage = async () => {
    const svg = mapSvgRef.current;
    if (!svg) return;
    const W = 3840, H = 2160;
    // Present map → "YYYY-MM"; past years → just "YYYY" (matches the on-map label).
    const dateStr = activeDate.year === currentDate.year
      ? `${activeDate.year}-${String(activeDate.month).padStart(2, "0")}`
      : `${activeDate.year}`;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    // 16:9 viewBox centered on the current view so the export fills the frame.
    const targetAspect = W / H;
    const viewAspect = view.w / view.h;
    let exW: number, exH: number;
    if (viewAspect > targetAspect) { exW = view.w; exH = view.w / targetAspect; }
    else { exH = view.h; exW = view.h * targetAspect; }
    const exX = view.x + view.w / 2 - exW / 2;
    const exY = view.y + view.h / 2 - exH / 2;
    clone.setAttribute("viewBox", `${exX} ${exY} ${exW} ${exH}`);
    clone.setAttribute("width", String(W));
    clone.setAttribute("height", String(H));
    clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

    // Chrome taints a canvas drawn from ANY SVG that contains <foreignObject>, so
    // convert the (foreignObject) planet labels to native SVG <text>: word-stacked
    // name + valuation, centered on the planet, keeping the black outline.
    const SVGNS = "http://www.w3.org/2000/svg";
    clone.querySelectorAll("foreignObject").forEach((fo) => {
      const x = parseFloat(fo.getAttribute("x") || "0");
      const y = parseFloat(fo.getAttribute("y") || "0");
      const w = parseFloat(fo.getAttribute("width") || "0");
      const h = parseFloat(fo.getAttribute("height") || "0");
      const styled = fo.querySelector("div") as HTMLElement | null;
      const fs = (styled && parseFloat(styled.style.fontSize)) || 12;
      const fill = styled?.style.color || "#fff";
      const strokeW =
        parseFloat(styled?.style.getPropertyValue("-webkit-text-stroke-width") || "") ||
        parseFloat(styled?.style.getPropertyValue("-webkit-text-stroke") || "") ||
        fs * 0.1;
      const lines: string[] = [];
      fo.querySelectorAll("div").forEach((d) => {
        if (d.children.length === 0) {
          const t = (d.textContent || "").trim();
          if (t) lines.push(t);
        }
      });
      if (!lines.length) { fo.remove(); return; }
      const cx = x + w / 2;
      const cy = y + h / 2;
      const text = document.createElementNS(SVGNS, "text");
      text.setAttribute("x", String(cx));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.setAttribute("font-family", 'Calibri, "Helvetica Neue", Arial, sans-serif');
      text.setAttribute("font-weight", "700");
      text.setAttribute("font-size", String(fs));
      text.setAttribute("fill", fill);
      text.setAttribute("stroke", "#000");
      text.setAttribute("stroke-width", String(strokeW));
      text.setAttribute("paint-order", "stroke");
      const y0 = cy - ((lines.length - 1) * fs) / 2;
      lines.forEach((line, i) => {
        const ts = document.createElementNS(SVGNS, "tspan");
        ts.setAttribute("x", String(cx));
        if (i === 0) ts.setAttribute("y", String(y0));
        else ts.setAttribute("dy", String(fs));
        ts.textContent = line;
        text.appendChild(ts);
      });
      fo.replaceWith(text);
    });

    const fontCss = await buildMapFontCss();
    if (fontCss) {
      const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
      styleEl.textContent = fontCss;
      clone.insertBefore(styleEl, clone.firstChild);
    }

    const svgStr = new XMLSerializer().serializeToString(clone);
    const svgUrl = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(svgUrl); return; }
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#1E0300");
      g.addColorStop(0.51, "#010C4C");
      g.addColorStop(1, "#070010");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        const href = URL.createObjectURL(blob);
        a.href = href;
        a.download = `media-universe-${dateStr}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      console.warn("[media-map] map export failed to rasterize");
    };
    img.src = svgUrl;
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
  const visibleNodes = useMemo(() => {
    if (layoutMode === "linear") return nodes;
    const pad = 300;
    return nodes.filter(n => {
      if (n.x + n.r < view.x - pad) return false;
      if (n.x - n.r > view.x + view.w + pad) return false;
      if (n.y + n.r < view.y - pad) return false;
      if (n.y - n.r > view.y + view.h + pad) return false;
      return true;
    });
  }, [nodes, view, layoutMode]);

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

  const sectorPanelProps: SectorPanelProps = {
    sectors: allSectors,
    counts,
    enabled,
    onToggle: toggleSector,
    onAll: setAll,
    total: companies.length,
    loading,
    error,
    hoveredSector,
    onHoverSector: setHoveredSector,
    onFocusSector: focusOnSector,
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        width: "100%",
        height: "100%", // fill .app (100dvh) so bottom controls aren't clipped on mobile
        overflow: "hidden",
      }}
    >
      {!isMobile && <Sidebar {...sectorPanelProps} open={sidebarOpen} onCollapse={() => setSidebarOpen(false)} />}
      {!isMobile && (
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open panel"
          title="Open panel"
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
            opacity: sidebarOpen ? 0 : 1,
            pointerEvents: sidebarOpen ? "none" : "auto",
            transition: sidebarOpen
              ? "opacity 150ms ease, color 150ms ease"
              : "opacity 220ms ease 200ms, color 150ms ease",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 24 }}>left_panel_open</span>
        </button>
      )}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative",
            background: LIST_BG_GRADIENT }}>
        {/* Live interactive map — always mounted so physics keeps running.
            Fades out (so it cross-fades with the overlay) in timeline mode
            (carousel) and list mode (table). */}
        <div
          style={{
            position: "absolute",
            // Fill the whole map area. In the mobile 4:5 view the canvas is
            // width-limited under "meet", so it spans the full phone width and
            // extends behind the tab/control overlays (which sit on top).
            inset: 0,
            opacity: timelineOpen || viewMode === "list" || viewMode === "aggregate" ? 0 : 1,
            pointerEvents: timelineOpen || viewMode === "list" || viewMode === "aggregate" ? "none" : "auto",
            transition: "opacity 360ms ease",
          }}
        >
        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: "100%",
            position: "relative",
            overflowX: layoutMode === "linear" ? "auto" : "hidden",
            overflowY: "hidden",
            cursor: layoutMode === "linear" ? "default" : "grab",
            userSelect: "none",
            // Map mode owns all touch gestures (pan/pinch in JS); linear keeps
            // native horizontal scroll.
            touchAction: layoutMode === "linear" ? "pan-x" : "none",
          }}
          onMouseDown={layoutMode === "linear" ? undefined : onMouseDown}
          onMouseMove={layoutMode === "linear" ? undefined : onMouseMove}
          onMouseUp={layoutMode === "linear" ? undefined : onMouseUp}
          onMouseLeave={layoutMode === "linear" ? undefined : onMouseUp}
          onWheel={layoutMode === "linear" ? undefined : onWheel}
          onTouchStart={layoutMode === "linear" ? undefined : onTouchStart}
          onTouchMove={layoutMode === "linear" ? undefined : onTouchMove}
          onTouchEnd={layoutMode === "linear" ? undefined : onTouchEnd}
          onClick={() => {
            // Click on the map background while zoomed in (a focused planet, a
            // focused sector, or any pinch/zoom) → close the side panel and zoom
            // all the way out. Planet clicks set the suppress flag so they focus.
            if (bgClickSuppressRef.current) { bgClickSuppressRef.current = false; return; }
            if (didDragRef.current) return;
            if (inspectedPlanet || zoom > MIN_ZOOM + 0.01) {
              setInspectedPlanet(null);
              resetView();
            }
          }}
        >
          <svg
            ref={mapSvgRef}
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
            <defs>
              <pattern
                id="starfield"
                x="0"
                y="0"
                width="180"
                height="180"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="14" cy="29" r="0.7" fill="white" opacity="0.8" />
                <circle cx="74" cy="61" r="0.4" fill="white" opacity="0.6" />
                <circle cx="120" cy="14" r="0.6" fill="white" opacity="0.5" />
                <circle cx="42" cy="111" r="0.5" fill="white" opacity="0.7" />
                <circle cx="151" cy="98" r="0.3" fill="white" opacity="0.45" />
                <circle cx="167" cy="142" r="0.7" fill="white" opacity="0.65" />
                <circle cx="93" cy="156" r="0.4" fill="white" opacity="0.5" />
                <circle cx="32" cy="68" r="0.3" fill="white" opacity="0.4" />
              </pattern>
            </defs>

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
            {layoutMode === "map" && effectiveConnections.map((conn, idx) => {
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
                hoveredSector !== null && a.sector !== hoveredSector && b.sector !== hoveredSector;
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

            {/* Render hovered planet last so its label/stroke draw on top. */}
            {[
              ...visibleNodes.filter(n => n.name !== hoveredPlanet),
              ...visibleNodes.filter(n => n.name === hoveredPlanet),
            ].map(n => {
              // While dragging in edit mode, render the dragged planet at its
              // live cursor position (override node.x/y just for this frame).
              const renderNode =
                dragState && dragState.name === n.name
                  ? { ...n, x: dragState.x, y: dragState.y }
                  : n;
              return (
                <Planet
                  key={n.name}
                  node={renderNode}
                  slideUnitsPerPx={slideUnitsPerPx}
                  isHovered={hoveredPlanet === n.name}
                  onHoverChange={setHoveredPlanet}
                  onClick={(node) => {
                    if (didDragRef.current) return;
                    bgClickSuppressRef.current = true; // a planet click, not a background click
                    if (isEditMode || mobileEdit) {
                      if (connectMode) {
                        handleConnectClick(node.name);
                      } else {
                        setSelectedPlanet(node.name);
                      }
                    } else if (!node.isEntity) {
                      // Entities (text-only sub-brands) have no detail panel.
                      focusOnPlanet(node);
                      setInspectedPlanet(node.name);
                    }
                  }}
                  dimmed={hoveredSector !== null && n.sector !== hoveredSector}
                  labelSizePx={labelSizePx * labelScaleForZoom(zoom)}
                  isEditMode={isEditMode || mobileEdit}
                  isSelected={
                    (isEditMode || mobileEdit) &&
                    (selectedPlanet === n.name ||
                      (connectMode && connectFrom === n.name))
                  }
                  onPlanetMouseDown={(isEditMode || mobileEdit) && !connectMode ? onPlanetDragStart : undefined}
                  showValuation={zoom >= VALUATION_ZOOM_THRESHOLD || n.sector === "Large Cap"}
                  // Mobile view: show names by on-screen size (tunable threshold).
                  // Desktop: only Large Cap until zoomed in.
                  labelSuppressed={
                    mobileView
                      ? false
                      : isMobile && zoom < MOBILE_LABEL_ZOOM_THRESHOLD && n.sector !== "Large Cap"
                  }
                  labelMinScreenDiameter={mobileView ? activeSettings.nameThreshold : 0}
                />
              );
            })}

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
                const baseCenter = mobileSectorCenters[s] ?? { x: c0.x * 0.66, y: c0.y * 0.5 };
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
          </svg>
        </div>
        </div>

        {/* List view — sortable company table. Always mounted (so it can fade
            out on exit); `active` drives the cross-fade with the map, which
            fades out underneath. The sim keeps running so returning to map is
            instant. */}
        <CompanyListView
          rows={listRows}
          sort={listSort}
          onSort={handleListSort}
          active={viewMode === "list" && !timelineOpen}
          isMobile={isMobile}
        />

        {/* Aggregate view — stacked market-cap-over-time chart (overlay, like list). */}
        <AggregateView
          active={viewMode === "aggregate" && !timelineOpen}
          data={aggregateData}
          zoomTarget={aggZoomTarget}
          highlightSector={hoveredSector}
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

        {/* View-mode toggle — upper-right of the canvas */}
        {!timelineOpen && (
          <div
            style={{
              position: "absolute",
              top: 16,
              // Mobile: anchor to the left edge; desktop: keep it upper-right.
              ...(isMobile ? { left: 16 } : { right: 16 }),
              zIndex: 12,
              display: "flex",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 10,
              padding: 4,
              backdropFilter: "blur(6px)",
              gap: 2,
            }}
          >
            {(["map", "linear", "aggregate", "list"] as AppViewMode[]).map(mode => {
              const active = viewMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => selectView(mode)}
                  aria-pressed={active}
                  className="mm-hover"
                  style={{
                    background: active ? "rgba(255,255,255,0.18)" : "transparent",
                    color: active ? "white" : "rgba(255,255,255,0.65)",
                    border: "none",
                    borderRadius: 7,
                    padding: "6px 14px",
                    fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    letterSpacing: 1.2,
                    cursor: "pointer",
                    transition: "background 160ms, color 160ms, box-shadow 160ms",
                  }}
                >
                  <span className="cap-center">{mode.toUpperCase()}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Timeline overlay — carousel of thumbnails + timeline strip at the bottom */}
        {timelineOpen && (
          <div
            onWheel={onTimelineWheel}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              zIndex: 5,
            }}
          >
            <Carousel
              dates={dateRange}
              position={scrollIdx}
              animate={timelineAnimate}
              baseCompanies={baseCompanies}
              valData={valData}
              nodes={nodes}
              canvas={canvas}
              onSelect={focusOn}
              onExplore={onExploreMap}
            />
            <TimelineStrip
              dates={dateRange}
              activeDate={timelineFocus}
              hoveredDate={hoveredDate}
              onSelect={(d) => { setHoveredDate(null); focusOn(d); }}
              onHover={setHoveredDate}
            />
          </div>
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
            bottom: `calc(${timelineOpen ? 72 : 16}px + env(safe-area-inset-bottom))`,
            zIndex: 11,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 6,
            transition: "bottom 240ms ease",
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
                  padding: "8px 14px",
                  backdropFilter: "blur(6px)",
                  color: isActive ? "white" : isHovered ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.7)",
                  fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  letterSpacing: 1,
                  cursor: isActive ? "default" : "pointer",
                  textAlign: "left",
                  transition: "background 160ms, color 160ms, border-color 160ms",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ opacity: 0.5, fontSize: 11 }}>{isActive ? "●" : "◎"}</span>
                {formatDate(d)}
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
            onClick={() => (timelineOpen ? setTimelineOpen(false) : openTimeline())}
            onMouseEnter={() => setTimelineButtonHovered(true)}
            onMouseLeave={() => setTimelineButtonHovered(false)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: timelineOpen
                ? "rgba(120,160,255,0.18)"
                : timelineButtonHovered
                  ? "rgba(255,255,255,0.14)"
                  : "rgba(255,255,255,0.08)",
              border: timelineOpen
                ? "1px solid rgba(150,180,255,0.5)"
                : timelineButtonHovered
                  ? "1px solid rgba(255,255,255,0.28)"
                  : "1px solid rgba(255,255,255,0.15)",
              borderRadius: 10,
              padding: "8px 14px",
              backdropFilter: "blur(6px)",
              color: "white",
              fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 1,
              cursor: "pointer",
              textAlign: "left",
              transition: "background 160ms, border-color 160ms",
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
            onClick={() => setTimelineOpen(false)}
            style={{
              position: "absolute",
              right: 16,
              top: 16,
              zIndex: 11,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(120,160,255,0.18)",
              border: "1px solid rgba(150,180,255,0.5)",
              borderRadius: 10,
              padding: "8px 14px",
              backdropFilter: "blur(6px)",
              color: "white",
              fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 1,
              cursor: "pointer",
            }}
          >
            <span style={{ opacity: 0.5, fontSize: 11 }}>✕</span>
            <span className="cap-center">CLOSE TIMELINE</span>
          </button>
        )}

        {/* Incremental step arrows — centered horizontally above the timeline strip.
            Step the picker FOCUS (not the live map — that commits via Explore map). */}
        {timelineOpen && (() => {
          const idx = focusIdx;
          const canPrev = idx > 0;
          const canNext = idx >= 0 && idx < dateRange.length - 1;
          const step = (delta: number) => {
            setHoveredDate(null);
            focusOn(dateRange[idx + delta]);
          };
          return (
            <div
              style={{
                position: "absolute",
                left: "50%",
                bottom: 72,
                transform: "translateX(-50%)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                zIndex: 11,
              }}
            >
              <button
                aria-label="Previous month"
                onClick={() => canPrev && step(-1)}
                disabled={!canPrev}
                style={arrowBtnStyle(canPrev)}
              >
                ‹
              </button>
              <button
                aria-label="Next month"
                onClick={() => canNext && step(1)}
                disabled={!canNext}
                style={arrowBtnStyle(canNext)}
              >
                ›
              </button>
            </div>
          );
        })()}

        {/* Zoom + download UI — hidden in timeline mode (no map) and list mode */}
        {!timelineOpen && viewMode !== "list" && (
          <div
            style={{
              position: "absolute",
              right: 16,
              bottom: "calc(16px + env(safe-area-inset-bottom))",
              display: "flex",
              flexDirection: "row",
              gap: 8,
              zIndex: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                gap: 8,
                background: "rgba(255,255,255,0.08)",
                padding: 6,
                borderRadius: 10,
                backdropFilter: "blur(6px)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              <button aria-label="Zoom out" className="mm-hover" onClick={() => (viewMode === "aggregate" ? aggZoomBy(1 / AGG_ZOOM_STEP) : zoomBy(1 / ZOOM_STEP))} style={zoomBtnStyle}>−</button>
              <button aria-label="Zoom in" className="mm-hover" onClick={() => (viewMode === "aggregate" ? aggZoomBy(AGG_ZOOM_STEP) : zoomBy(ZOOM_STEP))} style={zoomBtnStyle}>+</button>
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
                        padding: "0 12px",
                        fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
                        fontSize: 13,
                        fontWeight: 600,
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
            {viewMode === "map" && (
              <div
                style={{
                  display: "flex",
                  background: "rgba(255,255,255,0.08)",
                  padding: 6,
                  borderRadius: 10,
                  backdropFilter: "blur(6px)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                <button
                  aria-label="Download map (3840×2160 PNG)"
                  title="Download map (3840×2160)"
                  className="mm-hover"
                  onClick={downloadMapImage}
                  style={zoomBtnStyle}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>download</span>
                </button>
              </div>
            )}
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
        />
      )}

      {/* Mobile-only: bottom pill bar that opens the sectors drawer. */}
      {isMobile && (
        <MobileSectorTriggerBar onOpen={() => setMobileSectorsOpen(true)} />
      )}
      {isMobile && (
        <MobileSectorDrawer
          {...sectorPanelProps}
          open={mobileSectorsOpen}
          onClose={() => setMobileSectorsOpen(false)}
        />
      )}

      {/* Right-side planet detail panel — opens on planet click in non-edit mode. */}
      <PlanetDetailPanel
        node={inspectedPlanet ? nodes.find((n) => n.name === inspectedPlanet) ?? null : null}
        detail={inspectedPlanet ? sanity?.detailByName[inspectedPlanet] ?? null : null}
        lastUpdated={inspectedPlanet ? lastUpdatedByName.get(inspectedPlanet) : undefined}
        history={inspectedHistory}
        onClose={() => { setInspectedPlanet(null); resetView(); }}
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
              fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
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
    </div>
  );
}

const arrowBtnStyle = (enabled: boolean): React.CSSProperties => ({
  width: 38,
  height: 38,
  display: "grid",
  placeItems: "center",
  background: enabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
  color: enabled ? "white" : "rgba(255,255,255,0.25)",
  border: `1px solid ${enabled ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)"}`,
  borderRadius: 8,
  cursor: enabled ? "pointer" : "default",
  fontSize: 22,
  fontWeight: 400,
  lineHeight: 1,
  backdropFilter: "blur(6px)",
  transition: "background 160ms ease, color 160ms ease",
});

const zoomBtnStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  display: "grid",
  placeItems: "center",
  background: "rgba(0,0,0,0.45)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 18,
  fontWeight: 600,
  lineHeight: 1,
};

