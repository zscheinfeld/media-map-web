import { useEffect, useMemo, useRef, useState } from "react";
import { loadCompanies, type SheetCompany } from "./loadCompanies";
import {
  usePhysicsLayout,
  sheetPlanetSize,
  ANCHOR_VAL,
  SHEET_SIZE_ANCHOR,
  ANCHOR_DIAM_FALLBACK,
  type PlanetNode,
  type ViewMode,
} from "./usePhysicsLayout";
import { COMPANY_POSITIONS, type PlanetPosition } from "./layout";
import { COMPANY_CONNECTIONS, type Connection } from "./connections";
import {
  CANVAS_DESKTOP,
  SECTOR_CENTERS,
  flatStyleForSector,
  hexToRgba,
  hueForSector,
  isKnownSector,
  sectorCenterFor,
} from "./sectors";
import {
  CURRENT_DATE,
  buildDateRange,
  companiesForDate,
  dateIndex,
  formatDate,
  sameDate,
  valuationForDate,
  type MapDate,
} from "./historical";

const MOBILE_BREAKPOINT_PX = 768;

function useIsMobile(): boolean {
  const [m, setM] = useState<boolean>(() =>
    typeof window !== "undefined" &&
    window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    const handler = (e: MediaQueryListEvent) => setM(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return m;
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

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.4;
// Past this zoom, every planet shows its valuation under the name (not just
// Large Cap, which always shows it). ~2 zoom-button clicks from the default 1×
// (1 × 1.4 × 1.4 ≈ 1.96), or the equivalent scroll.
const VALUATION_ZOOM_THRESHOLD = 1.9;

// Mobile (temporary plan): with the full desktop map fit to a phone, showing
// every label is too cluttered, so only Large Cap names show until the user
// zooms past this threshold (via the on-screen +/- buttons), at which point all
// labels appear. Doesn't affect desktop.
const MOBILE_LABEL_ZOOM_THRESHOLD = 2.5;

const LABEL_SCREEN_PX = 12;
// Below this on-screen diameter, planets render without a visible label
// (label still appears on hover). 0 = always show labels regardless of zoom.
const LABEL_MIN_SCREEN_DIAMETER = 0;
// Minimum label-box dimensions in screen pixels. Small planets need a label
// box that's larger than the planet itself so the text isn't crushed; this
// gives every label enough room for ~12-character names on two lines without
// wrapping mid-word. The box centers on the planet so labels visually extend
// outside the circle, matching the reference design.
const LABEL_MIN_BOX_W_PX = 130;
const LABEL_MIN_BOX_H_PX = 52;

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

function Planet({
  node,
  slideUnitsPerPx,
  isHovered,
  onHoverChange,
  onClick,
  dimmed,
  labelSizePx = LABEL_SCREEN_PX,
  isEditMode = false,
  isSelected = false,
  onPlanetMouseDown,
  showValuation = false,
  suppressNonLargeCapLabel = false,
}: {
  node: PlanetNode;
  slideUnitsPerPx: number;
  isHovered: boolean;
  onHoverChange: (name: string | null) => void;
  onClick: (node: PlanetNode) => void;
  dimmed: boolean;
  labelSizePx?: number;
  isEditMode?: boolean;
  isSelected?: boolean;
  onPlanetMouseDown?: (node: PlanetNode, e: React.MouseEvent) => void;
  showValuation?: boolean;
  suppressNonLargeCapLabel?: boolean;
}) {
  const safeName = node.name.replace(/[^a-z0-9]/gi, "_");
  const gradId = `planet-${safeName}`;
  const clipId = `planet-clip-${safeName}`;
  const glowFilterId = `planet-glow-${safeName}`;
  const hue = node.hue;
  const style = node.style;
  const stripes = style?.stripes && style.stripes.length >= 2 ? style.stripes : null;
  const hasExplicitFill = !!(stripes || style?.fill);
  const glow = style?.glow ?? null;
  // Glow params are screen-pixel based for consistency at any zoom level.
  const glowBlur = glow ? (glow.blurPx ?? 5) * slideUnitsPerPx : 0;
  const glowSpread = glow ? (glow.spreadPx ?? 4) * slideUnitsPerPx : 0;
  const labelFontPx = labelSizePx * slideUnitsPerPx;
  const screenDiameter = (node.r * 2) / slideUnitsPerPx;
  // Mobile temporary plan: hide non-Large-Cap labels until zoomed in. Hover
  // (desktop only in practice) always wins.
  const labelHidden = suppressNonLargeCapLabel && node.sector !== "Large Cap";
  const showLabel = isHovered || (!labelHidden && screenDiameter >= LABEL_MIN_SCREEN_DIAMETER);

  // Stroke defaults: explicit override > stripes[0] at 0.55 alpha > fill at 0.55 alpha > hue-based.
  const baseStrokeColor =
    style?.stroke
    ?? (stripes ? hexToRgba(stripes[0], 0.55) : null)
    ?? (style?.fill ? hexToRgba(style.fill, 0.55) : null)
    ?? `hsla(${hue}, 70%, 75%, 0.55)`;
  const baseStrokeWidth = style?.strokeWidthPx !== undefined
    ? style.strokeWidthPx * slideUnitsPerPx
    : Math.max(1, node.r * 0.01);
  // Hover stroke is computed in screen px (so it looks consistent at any zoom).
  const hoverStrokeWidth = 2.5 * slideUnitsPerPx;

  // Stripe geometry: equal-height rectangles in a "stripe frame", clipped to
  // the planet circle, then rotated to the chosen orientation. The rectangles
  // are sized to cover the circle's bounding box; the clipPath does the rest.
  // Default orientation is "vertical" (90°). Apple etc. opt back to horizontal.
  const stripeAngle = stripes
    ? (style?.stripeOrientation === "horizontal" ? 0
        : style?.stripeOrientation === "diagonal" ? 45
        : 90)
    : 0;

  return (
    <g
      style={{
        cursor: isEditMode ? "grab" : "pointer",
        opacity: dimmed ? 0.2 : 1,
        transition: "opacity 220ms ease",
      }}
      onMouseEnter={() => onHoverChange(node.name)}
      onMouseLeave={() => onHoverChange(null)}
      onMouseDown={onPlanetMouseDown ? (e) => onPlanetMouseDown(node, e) : undefined}
      onClick={() => onClick(node)}
    >
      {glow && (
        <>
          <defs>
            <filter id={glowFilterId} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation={glowBlur} />
            </filter>
          </defs>
          <circle
            cx={node.x}
            cy={node.y}
            r={node.r + glowSpread}
            fill={glow.color}
            filter={`url(#${glowFilterId})`}
          />
        </>
      )}
      {!hasExplicitFill && (
        <defs>
          <radialGradient id={gradId} cx="38%" cy="38%" r="65%">
            <stop offset="0%" stopColor={`hsl(${hue}, 75%, 72%)`} stopOpacity="0.95" />
            <stop offset="55%" stopColor={`hsl(${hue}, 65%, 45%)`} stopOpacity="0.85" />
            <stop offset="100%" stopColor={`hsl(${hue}, 55%, 22%)`} stopOpacity="0.9" />
          </radialGradient>
        </defs>
      )}
      {stripes ? (
        <>
          <defs>
            <clipPath id={clipId}>
              <circle cx={0} cy={0} r={node.r} />
            </clipPath>
          </defs>
          <g transform={`translate(${node.x},${node.y}) rotate(${stripeAngle})`}>
            <g clipPath={`url(#${clipId})`}>
              {stripes.map((c, i) => {
                const stripeH = (2 * node.r) / stripes.length;
                return (
                  <rect
                    key={i}
                    x={-node.r}
                    y={-node.r + i * stripeH}
                    width={2 * node.r}
                    height={stripeH + 0.5 /* fudge to hide hairline seams */}
                    fill={c}
                  />
                );
              })}
            </g>
          </g>
          <circle
            cx={node.x}
            cy={node.y}
            r={node.r}
            fill="none"
            stroke={isHovered ? "rgba(255,255,255,0.95)" : baseStrokeColor}
            strokeWidth={isHovered ? hoverStrokeWidth : baseStrokeWidth}
          />
        </>
      ) : (
        <circle
          cx={node.x}
          cy={node.y}
          r={node.r}
          fill={style?.fill ?? `url(#${gradId})`}
          stroke={isHovered ? "rgba(255,255,255,0.95)" : baseStrokeColor}
          strokeWidth={isHovered ? hoverStrokeWidth : baseStrokeWidth}
        />
      )}
      {/* Edit-mode visual cues — only rendered when ?edit=1 is on. */}
      {/* Pinned planets get a red ring just outside the planet edge. The gap
          (between the planet at r and the ring) keeps it visible even on red
          planets. */}
      {isEditMode && node.pinned && (
        <circle
          cx={node.x}
          cy={node.y}
          r={node.r + 5 * slideUnitsPerPx}
          fill="none"
          stroke="#ff3b30"
          strokeWidth={2 * slideUnitsPerPx}
          pointerEvents="none"
        />
      )}
      {isEditMode && isSelected && (
        <circle
          cx={node.x}
          cy={node.y}
          r={node.r + 6 * slideUnitsPerPx}
          fill="none"
          stroke="#ffe066"
          strokeWidth={2 * slideUnitsPerPx}
          strokeDasharray={`${4 * slideUnitsPerPx} ${3 * slideUnitsPerPx}`}
          pointerEvents="none"
        />
      )}
      {showLabel && (() => {
        // For big planets, the label box matches the circle diameter (label
        // fits inside). For small planets, the box is larger than the circle
        // so the text can render legibly outside the planet's bounding shape.
        const minBoxW = LABEL_MIN_BOX_W_PX * slideUnitsPerPx;
        const minBoxH = LABEL_MIN_BOX_H_PX * slideUnitsPerPx;
        const boxW = Math.max(node.r * 2, minBoxW);
        const boxH = Math.max(node.r * 2, minBoxH);
        return (
          <foreignObject
            x={node.x - boxW / 2}
            y={node.y - boxH / 2}
            width={boxW}
            height={boxH}
            style={{ pointerEvents: "none", overflow: "visible" }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
                color: "#fff",
                fontSize: `${labelFontPx}px`,
                lineHeight: 1.0,
                boxSizing: "border-box",
                textShadow: "0 0 4px rgba(0,0,0,0.7)",
                WebkitTextStroke: `${0.7 * slideUnitsPerPx}px #000`,
                paintOrder: "stroke fill",
                wordBreak: "keep-all",
                overflowWrap: "normal",
                hyphens: "none",
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {node.name.trim().split(/\s+/).map((word, i) => (
                  <div key={i}>{word}</div>
                ))}
              </div>
              {(node.sector === "Large Cap" || showValuation) && (
                <div style={{ fontWeight: 700, opacity: 0.85, marginTop: labelFontPx * 0.15 }}>
                  {formatValuation(node.valuation_b)}
                </div>
              )}
            </div>
          </foreignObject>
        );
      })()}
    </g>
  );
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
  showLabels: boolean;
  onToggleLabels: () => void;
  hoveredSector: string | null;
  onHoverSector: (s: string | null) => void;
  onFocusSector: (s: string) => void;
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
  showLabels,
  onToggleLabels,
  hoveredSector,
  onHoverSector,
  onFocusSector,
  showLabelsToggle = true,
}: SectorPanelProps & { showLabelsToggle?: boolean }) {
  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.4 }}>
        Sectors
      </div>
      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
        {loading ? "Loading…" : error ? "Error" : `${total} companies`}
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
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button onClick={() => onAll(true)} style={pillBtn}>All</button>
        <button onClick={() => onAll(false)} style={pillBtn}>None</button>
      </div>
      {showLabelsToggle && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 10,
            padding: "6px 8px",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <input
            type="checkbox"
            checked={showLabels}
            onChange={onToggleLabels}
            style={{ accentColor: "#9aa6b8" }}
          />
          <span style={{ opacity: 0.85 }}>Show sector labels</span>
        </label>
      )}
      {/* Clear the hover only when the cursor leaves the whole list — not when
          it crosses between rows — so the map doesn't flicker un/re-highlighting
          in the gaps between sector rows. */}
      <div
        style={{ marginTop: 14, display: "flex", flexDirection: "column" }}
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
                borderRadius: 6,
                overflow: "hidden",
                opacity: on ? 1 : 0.45,
                fontSize: 13,
                marginBottom: 4,
                background: isHovered ? "rgba(255,255,255,0.10)" : "transparent",
                border: isHovered
                  ? "1px solid rgba(255,255,255,0.25)"
                  : "1px solid transparent",
                transition: "background 120ms, border-color 120ms",
              }}
            >
              {/* Checkbox half — toggles visibility; hover handled by parent row */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 8px",
                  cursor: "pointer",
                  background: !isHovered && on ? "rgba(255,255,255,0.02)" : "transparent",
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
                  padding: "6px 8px",
                  cursor: "pointer",
                  background: !isHovered && on ? "rgba(255,255,255,0.04)" : "transparent",
                  transition: "background 120ms",
                }}
              >
                <span style={{ flex: 1 }}>{s}</span>
                <span style={{ opacity: 0.5, fontSize: 11 }}>{counts[s] ?? 0}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Sidebar(props: SectorPanelProps) {
  return (
    <aside
      style={{
        width: 240,
        flex: "0 0 240px",
        height: "100vh",
        // Column layout so the title pins to the top and the logo to the bottom
        // while only the sector list scrolls in between.
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "rgba(7, 14, 32, 0.85)",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        color: "#e6edf7",
        padding: "16px 14px",
        boxSizing: "border-box",
        fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
        userSelect: "none",
      }}
    >
      {/* Brand title — pinned at the top of the panel. */}
      <div style={{ flex: "0 0 auto" }}>
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
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.14)",
            margin: "12px 0 14px",
          }}
        />
      </div>

      {/* Sector list — the only scrolling region. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
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
          maxHeight: "82vh",
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px 6px",
          }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.18)", margin: "0 auto" }} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 14px 20px" }}>
          <SectorPanelContent {...sectorProps} showLabelsToggle={false} />
        </div>
        <button
          onClick={onClose}
          aria-label="Close sectors panel"
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 8,
            color: "white",
            width: 32,
            height: 32,
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          ✕
        </button>
      </div>
    </>
  );
}

function PlanetDetailPanel({
  node,
  anchorDiam,
  onClose,
}: {
  node: PlanetNode | null;
  anchorDiam: number;
  onClose: () => void;
}) {
  const open = node !== null;
  const valuation = node?.valuation_b ?? 0;
  // What the renderer actually uses: sqrt(val / 2900) × anchorDiam (slide units).
  const rendererDiameter = node
    ? Math.sqrt(Math.max(valuation, 0) / ANCHOR_VAL) * anchorDiam
    : 0;
  // What the source spreadsheet computes — same formula, fixed anchor 9.77,
  // shown for cross-checking against the original sheet.
  const sheetSize = node ? sheetPlanetSize(valuation) : 0;

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
              {node.name}
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1.5, textTransform: "uppercase" }}>
              {node.sector}
            </div>
          </div>

          <PanelSection label="Data Source">
            <span style={{ fontStyle: "italic", opacity: 0.55, fontSize: 13 }}>
              (placeholder — to be added)
            </span>
          </PanelSection>

          <PanelSection label="Valuation">
            <span style={{ fontSize: 20, fontWeight: 700 }}>
              {formatValuation(valuation)}
            </span>
            <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 8 }}>
              ({valuation.toFixed(1)} B)
            </span>
          </PanelSection>

          <PanelSection label="Planet Size">
            <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
              Formula
            </div>
            <div style={panelCodeStyle}>
              sqrt(valuation / {ANCHOR_VAL}) × appleSize
            </div>

            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 10, lineHeight: 1.55 }}>
              <div>
                <strong style={{ color: "#ffe066" }}>{ANCHOR_VAL}</strong> — Apple's reference
                valuation in billions USD. Dividing by it converts any company's valuation
                into a ratio relative to Apple. Constant.
              </div>
              <div style={{ marginTop: 6 }}>
                <strong style={{ color: "#ffe066" }}>appleSize</strong> — Apple's rendered
                diameter. Auto-computed each render so the cluster fills a target fraction
                of the canvas without overlapping (currently <strong>{anchorDiam.toFixed(1)}</strong> slide units).
                The source spreadsheet uses a fixed value of {SHEET_SIZE_ANCHOR} for the same role,
                in its own units — the formula is identical, only the unit changes.
              </div>
            </div>

            <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1, textTransform: "uppercase", marginTop: 16, marginBottom: 6 }}>
              Calculation (renderer)
            </div>
            <div style={panelCodeStyle}>
              sqrt({valuation.toFixed(1)} / {ANCHOR_VAL}) × {anchorDiam.toFixed(2)}
              {"\n"}= sqrt({(valuation / ANCHOR_VAL).toFixed(6)}) × {anchorDiam.toFixed(2)}
              {"\n"}= {Math.sqrt(valuation / ANCHOR_VAL).toFixed(6)} × {anchorDiam.toFixed(2)}
            </div>

            <div style={{ marginTop: 12, fontSize: 18, fontWeight: 700, color: "#ffe066" }}>
              = {rendererDiameter.toFixed(4)} <span style={{ fontSize: 11, opacity: 0.6, fontWeight: 500 }}>slide units</span>
            </div>

            <div style={{ marginTop: 14, fontSize: 11, opacity: 0.55 }}>
              Sheet cross-check (appleSize = {SHEET_SIZE_ANCHOR}):&nbsp;
              <strong style={{ color: "rgba(255,255,255,0.8)" }}>{sheetSize.toFixed(4)}</strong>
            </div>
          </PanelSection>
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

const panelCodeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 12,
  color: "rgba(255,255,255,0.85)",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 5,
  padding: "8px 10px",
  whiteSpace: "pre-wrap",
  lineHeight: 1.55,
};

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

const pillBtn: React.CSSProperties = {
  flex: 1,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.18)",
  color: "#fff",
  borderRadius: 6,
  padding: "5px 0",
  fontSize: 12,
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
  nodes,
  canvas,
  isActive,
  isSelected,
  onClick,
}: {
  date: MapDate;
  baseCompanies: SheetCompany[];
  nodes: PlanetNode[];
  canvas: { x: number; y: number; w: number; h: number };
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const valByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of baseCompanies) m.set(c.name, valuationForDate(c, date));
    return m;
  }, [baseCompanies, date]);

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
  selectedIdx,
  activeIdx,
  baseCompanies,
  nodes,
  canvas,
  onSelect,
  onAddView,
  canAddView,
}: {
  dates: MapDate[];
  selectedIdx: number;
  activeIdx: number;
  baseCompanies: SheetCompany[];
  nodes: PlanetNode[];
  canvas: { x: number; y: number; w: number; h: number };
  onSelect: (d: MapDate) => void;
  onAddView: () => void;
  canAddView: boolean;
}) {
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

  // Translate the strip so the center of the selected slot lands at the center
  // of the viewport. CSS transition on the transform handles the smooth slide.
  const selectedCenter = selectedIdx * CAROUSEL_SLOT_W + CAROUSEL_SLOT_W / 2;
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
          // easeInOutCubic — symmetric, smoother in/out
          transition: "transform 900ms cubic-bezier(0.65, 0, 0.35, 1)",
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

      {/* "Add view" button — sits below the selected thumbnail's date label. */}
      <button
        aria-label={canAddView ? "Add this view to the saved list" : "View already saved"}
        onClick={() => canAddView && onAddView()}
        disabled={!canAddView}
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
          background: canAddView ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${canAddView ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)"}`,
          color: canAddView ? "white" : "rgba(255,255,255,0.4)",
          fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 1.2,
          cursor: canAddView ? "pointer" : "default",
          backdropFilter: "blur(6px)",
          zIndex: 3,
          transition: "background 160ms, color 160ms, border-color 160ms",
        }}
      >
        <span style={{ opacity: 0.7, fontSize: 13 }}>+</span>
        {canAddView ? "ADD VIEW" : "ALREADY SAVED"}
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
        const isJan = d.month === 1;
        return (
          <button
            key={`${d.year}-${d.month}`}
            data-date={`${d.year}-${d.month}`}
            onClick={() => onSelect(d)}
            onMouseEnter={() => onHover(d)}
            title={formatDate(d)}
            style={{
              flex: "0 0 auto",
              width: 14,
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
                width: isHovered ? 3 : active ? 3 : isJan ? 2 : 1,
                height: isHovered ? 36 : active ? 22 : isJan ? 18 : 12,
                background: isHovered
                  ? "white"
                  : active
                    ? "rgba(180,200,255,0.95)"
                    : isJan
                      ? "rgba(255,255,255,0.5)"
                      : "rgba(255,255,255,0.22)",
                borderRadius: 1,
                transition: "height 140ms ease, width 140ms ease, background 140ms ease",
              }}
            />
            {/* Date label — by default only Jan shows the year. When this tick
                is hovered, reveal the full formatted date (e.g. "May 2026") so
                the user can read the map's date without clicking. */}
            <span
              style={{
                height: 12,
                lineHeight: "12px",
                opacity: isHovered || isJan ? 1 : 0,
                whiteSpace: "nowrap",
                fontWeight: isHovered ? 700 : 500,
                color: isHovered ? "white" : undefined,
                transition: "opacity 140ms ease",
              }}
            >
              {isHovered ? formatDate(d) : isJan ? d.year : ""}
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
}: {
  rows: ListRow[];
  sort: ListSort;
  onSort: (key: ListSortKey) => void;
  active: boolean;
}) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
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
      style={{
        position: "absolute",
        // Start below the floating view-mode toggle (top:16, ~34px tall) so the
        // sticky table header never slides under it.
        top: 60,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: "auto",
        padding: "0 16px 16px",
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
                  style={{ ...th, textAlign: col.align, color: active ? "#fff" : th.color }}
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
        <tbody>
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
              <td style={{ ...td, fontWeight: 700 }}>{r.name}</td>
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

export default function MediaMap() {
  const isMobile = useIsMobile();
  const isEditMode = useIsEditMode();
  // Temporary mobile plan: use the desktop map layout on phones too (same
  // canvas, sector centers, pins, connections) rather than the portrait grid.
  // The whole map is fit to the viewport ("meet"), and only Large Cap labels
  // show until the user zooms in (see suppressNonLargeCapLabel below).
  const canvas = useMemo(() => CANVAS_DESKTOP, []);

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
  const [showSectorLabels, setShowSectorLabels] = useState(false);
  const [hoveredPlanet, setHoveredPlanet] = useState<string | null>(null);
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [mobileSectorsOpen, setMobileSectorsOpen] = useState(false);
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
  // Bookmarks the user explicitly saved via the "Add view" button.
  // Seeded with the latest map so it always appears as a pill by default.
  const [savedViews, setSavedViews] = useState<MapDate[]>([CURRENT_DATE]);

  const selectDate = (d: MapDate) => setActiveDate(d);

  const addActiveToSavedViews = () => {
    setSavedViews(prev => {
      if (prev.some(p => sameDate(p, activeDate))) return prev;
      return [...prev, activeDate];
    });
  };
  const removeSavedView = (d: MapDate) => {
    setSavedViews(prev => prev.filter(p => !sameDate(p, d)));
  };

  // Chronologically-sorted list of saved-view pills. The stack only ever
  // contains explicitly-saved views (added via the "+ Add view" button);
  // clicking a timeline tick does NOT add to this list, it only changes the
  // active date. The pill matching the active date gets a highlight, in place.
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
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  // The spatial layout shown beneath everything: map | linear. "list" is an
  // overlay that fades over whatever layout was last active, so the layout is
  // frozen here and "list" never drives the SVG geometry or the physics hook.
  // This is what lets linear→list fade straight from the strip (instead of
  // briefly snapping to the map) and list→map fade back into place. Updated in
  // lockstep with viewMode via selectView() so the two never drift.
  const [layoutMode, setLayoutMode] = useState<"map" | "linear">("map");
  const selectView = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode !== "list") setLayoutMode(mode);
  };
  // List-view column sort. Default: largest valuation first.
  const [listSort, setListSort] = useState<ListSort>({ key: "valuation", dir: "desc" });

  const dateRange = useMemo(() => buildDateRange(), []);
  const displayedCompanies = useMemo(
    () => sameDate(activeDate, CURRENT_DATE)
      ? companies
      : companiesForDate(companies, activeDate),
    [companies, activeDate],
  );

  // All-time high / low (with the date each occurred) for every company,
  // swept across the full timeline. Independent of the active date, so this
  // only recomputes when the company list changes. Values are mocked today
  // (see historical.ts) — fine as placeholders until real history lands.
  const valuationStats = useMemo(() => {
    const m = new Map<string, { ath: number; athDate: MapDate; atl: number; atlDate: MapDate }>();
    for (const c of companies) {
      let ath = -Infinity, atl = Infinity;
      let athDate = dateRange[0], atlDate = dateRange[0];
      for (const d of dateRange) {
        const v = valuationForDate(c, d);
        if (v > ath) { ath = v; athDate = d; }
        if (v < atl) { atl = v; atlDate = d; }
      }
      m.set(c.name, { ath, athDate, atl, atlDate });
    }
    return m;
  }, [companies, dateRange]);

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
        const sectors = new Set(rows.map(r => r.sector));
        setEnabled(sectors);
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
  }, []);

  const allSectors = useMemo(() => {
    const set = new Set<string>();
    for (const c of companies) set.add(c.sector);
    // Known sectors first (in the order declared in SECTOR_CENTERS), then unknown alphabetically.
    const known = Object.keys(SECTOR_CENTERS).filter(s => set.has(s));
    const knownSet = new Set(known);
    const unknown = [...set].filter(s => !knownSet.has(s)).sort();
    return [...known, ...unknown];
  }, [companies]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of companies) out[c.sector] = (out[c.sector] ?? 0) + 1;
    return out;
  }, [companies]);

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
  const anchorDiam = useMemo(() => {
    if (displayedCompanies.length === 0 || canvas.w <= 0 || canvas.h <= 0) {
      return ANCHOR_DIAM_FALLBACK;
    }
    const ratioSum = displayedCompanies.reduce(
      (sum, c) => sum + Math.max(c.valuation_b, 0) / 2900,
      0,
    );
    if (ratioSum <= 0) return ANCHOR_DIAM_FALLBACK;
    const canvasArea = canvas.w * canvas.h;
    return Math.sqrt((4 * packingDensity * canvasArea) / (Math.PI * ratioSum));
  }, [displayedCompanies, canvas, packingDensity]);

  // Natural slide-units-per-pixel at zoom=1 — used to size label-collision
  // radii. We base the layout on the un-zoomed ratio so the same physics
  // arrangement holds across zoom levels (zooming in just makes the existing
  // spacing more generous). Linear mode is height-fitted; map mode is
  // width-fitted, so we pick whichever dimension drives the active viewBox.
  const naturalSlideUnitsPerPx = useMemo(() => {
    if (containerW === 0 || containerH === 0) return 1;
    return layoutMode === "linear" ? canvas.h / containerH : canvas.w / containerW;
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
        (m, w) => Math.max(m, measureLabelTextWidth(w, labelSizePx, 700)),
        0,
      );
      const lineCount = words.length + (c.sector === "Large Cap" ? 1 : 0);
      const heightPx = lineCount * labelSizePx;
      const halfExtentPx = Math.max(maxWordPx, heightPx) / 2;
      result[c.name] = halfExtentPx * naturalSlideUnitsPerPx;
    }
    return result;
  }, [displayedCompanies, labelSizePx, naturalSlideUnitsPerPx, containerW]);

  // Pass `false` for the mobile flag so the layout uses desktop sector centers
  // on phones too (temporary mobile plan — preserve the desktop arrangement).
  const nodes = usePhysicsLayout(displayedCompanies, enabled, physicsBounds, layoutMode, false, positions, isEditMode, anchorDiam, collidePadding, sectorPositions, labelRadii, connections, connectionPull);

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
      : containerW > 0 ? view.w / containerW : 1;

  // Drag-to-pan (no auto-recenter on release — felt distracting).
  const dragRef = useRef<{ startX: number; startY: number; pan0: { x: number; y: number } } | null>(null);
  // True once the cursor has moved beyond DRAG_THRESHOLD_PX from mousedown.
  // Consumed by the planet onClick so that drag gestures don't accidentally
  // fire the focus-zoom interaction on a planet under the cursor.
  const didDragRef = useRef(false);
  const DRAG_THRESHOLD_PX = 4;

  const onMouseDown = (e: React.MouseEvent) => {
    cancelZoomAnim();
    dragRef.current = { startX: e.clientX, startY: e.clientY, pan0: { ...pan } };
    didDragRef.current = false;
    (e.currentTarget as HTMLElement).style.cursor = "grabbing";
  };
  const onMouseMove = (e: React.MouseEvent) => {
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
    // Commit a sector drag (if active) to the sector-position overrides.
    if (sectorDragRef.current && sectorDragState && didDragRef.current) {
      const name = sectorDragRef.current.name;
      setSectorPositions((prev) => ({
        ...prev,
        [name]: {
          x: Math.round(sectorDragState.x),
          y: Math.round(sectorDragState.y),
        },
      }));
    }
    sectorDragRef.current = null;
    setSectorDragState(null);
    // Commit a planet drag (if active) to the positions state.
    if (planetDragRef.current && dragState && didDragRef.current) {
      const name = planetDragRef.current.name;
      setPositions((prev) => ({
        ...prev,
        [name]: {
          x: Math.round(dragState.x),
          y: Math.round(dragState.y),
          pin: prev[name]?.pin ?? false,
        },
      }));
    }
    planetDragRef.current = null;
    setDragState(null);
    dragRef.current = null;
    (e.currentTarget as HTMLElement).style.cursor = "grab";
  };

  // Begin a planet drag in edit mode. Called from Planet's onMouseDown.
  const onPlanetDragStart = (node: PlanetNode, e: React.MouseEvent) => {
    if (!isEditMode) return;
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
    if (!isEditMode) return;
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
    if (!containerRef.current) return;
    cancelZoomAnim();
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const slideX = view.x + (mx / rect.width) * view.w;
    const slideY = view.y + (my / rect.height) * view.h;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    if (newZoom === zoom) return;
    const newW = canvas.w / newZoom;
    const newH = canvas.h / newZoom;
    const newCx = slideX + (0.5 - mx / rect.width) * newW;
    const newCy = slideY + (0.5 - my / rect.height) * newH;
    setZoom(newZoom);
    setPan({ x: newCx - (canvas.x + canvas.w / 2), y: newCy - (canvas.y + canvas.h / 2) });
  };

  const zoomRafRef = useRef<number | null>(null);
  const cancelZoomAnim = () => {
    if (zoomRafRef.current !== null) {
      cancelAnimationFrame(zoomRafRef.current);
      zoomRafRef.current = null;
    }
  };
  useEffect(() => cancelZoomAnim, []);

  const animateZoomTo = (target: number) => {
    cancelZoomAnim();
    const DURATION = 280;
    const t0 = performance.now();
    let from: number | null = null;
    const tick = (now: number) => {
      const elapsed = now - t0;
      const t = Math.min(1, elapsed / DURATION);
      const k = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setZoom(z => {
        if (from === null) from = z;
        return from + (target - from) * k;
      });
      if (t < 1) zoomRafRef.current = requestAnimationFrame(tick);
      else zoomRafRef.current = null;
    };
    zoomRafRef.current = requestAnimationFrame(tick);
  };

  const zoomBy = (factor: number) => {
    const target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    if (target === zoom) return;
    animateZoomTo(target);
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

  // Reset to the full view, smoothly.
  const resetView = () => {
    animateView(1, { x: 0, y: 0 }, 1100);
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
  const setAll = (on: boolean) => {
    setEnabled(on ? new Set(allSectors) : new Set());
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

  const sectorPanelProps: SectorPanelProps = {
    sectors: allSectors,
    counts,
    enabled,
    onToggle: toggleSector,
    onAll: setAll,
    total: companies.length,
    loading,
    error,
    showLabels: showSectorLabels,
    onToggleLabels: () => setShowSectorLabels(v => !v),
    hoveredSector,
    onHoverSector: setHoveredSector,
    onFocusSector: focusOnSector,
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {!isMobile && <Sidebar {...sectorPanelProps} />}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative",
            background: "linear-gradient(180deg, #1E0300 0%, #010C4C 51%, #070010 100%)" }}>
        {/* Live interactive map — always mounted so physics keeps running.
            Fades out (so it cross-fades with the overlay) in timeline mode
            (carousel) and list mode (table). */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: timelineOpen || viewMode === "list" ? 0 : 1,
            pointerEvents: timelineOpen || viewMode === "list" ? "none" : "auto",
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
          }}
          onMouseDown={layoutMode === "linear" ? undefined : onMouseDown}
          onMouseMove={layoutMode === "linear" ? undefined : onMouseMove}
          onMouseUp={layoutMode === "linear" ? undefined : onMouseUp}
          onMouseLeave={layoutMode === "linear" ? undefined : onMouseUp}
          onWheel={layoutMode === "linear" ? undefined : onWheel}
        >
          <svg
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

            {/* Connection lines — drawn beneath the planets so the circles and
                labels stay on top. Map mode only (in linear mode the planets
                are reordered into a strip, so lines would be meaningless). */}
            {layoutMode === "map" && connections.map((conn, idx) => {
              const a = nodeByName.get(conn.from);
              const b = nodeByName.get(conn.to);
              if (!a || !b) return null;
              // Endpoints follow live drag positions in edit mode.
              const ax = dragState?.name === a.name ? dragState.x : a.x;
              const ay = dragState?.name === a.name ? dragState.y : a.y;
              const bx = dragState?.name === b.name ? dragState.x : b.x;
              const by = dragState?.name === b.name ? dragState.y : b.y;
              const isSelected = isEditMode && selectedConnIdx === idx;
              const isHovered = hoveredConn?.idx === idx;
              const strokeW = (isSelected ? 3.5 : isHovered ? 3 : 2) * slideUnitsPerPx;
              const stroke = isSelected
                ? "#ffe066"
                : isHovered
                  ? "rgba(255,255,255,0.95)"
                  : "rgba(255,255,255,0.6)";
              // Dotted lines use a dash pattern scaled to screen px so the dash
              // length looks constant at any zoom.
              const dash =
                conn.style === "dotted"
                  ? `${8 * slideUnitsPerPx} ${7 * slideUnitsPerPx}`
                  : undefined;
              return (
                <g key={`conn-${idx}`}>
                  {/* Wide transparent hit area so the thin line is easy to hover. */}
                  <line
                    x1={ax}
                    y1={ay}
                    x2={bx}
                    y2={by}
                    stroke="transparent"
                    strokeWidth={Math.max(18 * slideUnitsPerPx, strokeW)}
                    style={{ cursor: isEditMode ? "pointer" : "default" }}
                    onMouseEnter={(e) =>
                      setHoveredConn({ idx, x: e.clientX, y: e.clientY })
                    }
                    onMouseMove={(e) =>
                      setHoveredConn({ idx, x: e.clientX, y: e.clientY })
                    }
                    onMouseLeave={() =>
                      setHoveredConn(prev => (prev?.idx === idx ? null : prev))
                    }
                    onClick={(e) => {
                      if (!isEditMode) return;
                      e.stopPropagation();
                      setSelectedConnIdx(idx);
                    }}
                  />
                  <line
                    x1={ax}
                    y1={ay}
                    x2={bx}
                    y2={by}
                    stroke={stroke}
                    strokeWidth={strokeW}
                    strokeDasharray={dash}
                    strokeLinecap="round"
                    pointerEvents="none"
                    style={{ transition: "stroke 140ms ease" }}
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
                    if (isEditMode) {
                      if (connectMode) {
                        handleConnectClick(node.name);
                      } else {
                        setSelectedPlanet(node.name);
                      }
                    } else {
                      focusOnPlanet(node);
                      setInspectedPlanet(node.name);
                    }
                  }}
                  dimmed={hoveredSector !== null && n.sector !== hoveredSector}
                  labelSizePx={labelSizePx}
                  isEditMode={isEditMode}
                  isSelected={
                    isEditMode &&
                    (selectedPlanet === n.name ||
                      (connectMode && connectFrom === n.name))
                  }
                  onPlanetMouseDown={isEditMode && !connectMode ? onPlanetDragStart : undefined}
                  showValuation={zoom >= VALUATION_ZOOM_THRESHOLD}
                  suppressNonLargeCapLabel={isMobile && zoom < MOBILE_LABEL_ZOOM_THRESHOLD}
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
        />

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
              right: 16,
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
            {(["map", "linear", "list"] as ViewMode[]).map(mode => {
              const active = viewMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => selectView(mode)}
                  aria-pressed={active}
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
                    transition: "background 160ms, color 160ms",
                  }}
                >
                  {mode.toUpperCase()}
                </button>
              );
            })}
          </div>
        )}

        {/* Timeline overlay — carousel of thumbnails + timeline strip at the bottom */}
        {timelineOpen && (
          <div
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
              selectedIdx={dateRange.findIndex(d => sameDate(d, activeDate))}
              activeIdx={dateRange.findIndex(d => sameDate(d, activeDate))}
              baseCompanies={companies}
              nodes={nodes}
              canvas={canvas}
              onSelect={selectDate}
              onAddView={addActiveToSavedViews}
              canAddView={!savedViews.some(v => sameDate(v, activeDate))}
            />
            <TimelineStrip
              dates={dateRange}
              activeDate={activeDate}
              hoveredDate={hoveredDate}
              onSelect={(d) => { setHoveredDate(null); selectDate(d); }}
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
            bottom: timelineOpen ? 72 : 16,
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
                {!isActive && (
                  <span
                    role="button"
                    aria-label={`Remove ${formatDate(d)}`}
                    onClick={(e) => { e.stopPropagation(); removeSavedView(d); }}
                    style={{
                      marginLeft: 4,
                      opacity: isHovered ? 0.7 : 0.35,
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
            aria-label={timelineOpen ? "Timeline open (use close button to close)" : "Open timeline"}
            onClick={() => setTimelineOpen(v => !v)}
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
            <span style={{ opacity: 0.6, fontSize: 12 }}>◷</span>
            TIMELINE
          </button>
        </div>

        {/* Close-timeline button — bottom-right, only when timeline is open. */}
        {timelineOpen && (
          <button
            aria-label="Close timeline"
            onClick={() => setTimelineOpen(false)}
            style={{
              position: "absolute",
              right: 16,
              bottom: 72,
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
            CLOSE TIMELINE
          </button>
        )}

        {/* Incremental month arrows — centered above the timeline strip,
            on the same horizontal line as the close button. */}
        {timelineOpen && (() => {
          const idx = dateRange.findIndex(d => sameDate(d, activeDate));
          const canPrev = idx > 0;
          const canNext = idx >= 0 && idx < dateRange.length - 1;
          const step = (delta: number) => {
            setHoveredDate(null);
            selectDate(dateRange[idx + delta]);
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

        {/* Zoom UI — hidden in timeline mode (no map) and list mode (no zoom) */}
        {!timelineOpen && viewMode !== "list" && (
          <div
            style={{
              position: "absolute",
              right: 16,
              bottom: 16,
              display: "flex",
              flexDirection: "row",
              gap: 8,
              background: "rgba(255,255,255,0.08)",
              padding: 6,
              borderRadius: 10,
              backdropFilter: "blur(6px)",
              border: "1px solid rgba(255,255,255,0.15)",
              zIndex: 10,
            }}
          >
            <button aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)} style={zoomBtnStyle}>+</button>
            <button aria-label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)} style={zoomBtnStyle}>−</button>
            <button
              aria-label="Reset view"
              onClick={resetView}
              style={{ ...zoomBtnStyle, fontSize: 13 }}
            >
              ⟳
            </button>
          </div>
        )}

      </div>

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
        anchorDiam={anchorDiam}
        onClose={() => { setInspectedPlanet(null); resetView(); }}
      />

      {/* Connection hover tooltip — follows the cursor along a hovered line. */}
      {hoveredConn && connections[hoveredConn.idx] && (() => {
        const conn = connections[hoveredConn.idx];
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

