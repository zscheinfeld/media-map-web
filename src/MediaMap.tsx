import { useEffect, useMemo, useRef, useState } from "react";
import { loadCompanies, type SheetCompany } from "./loadCompanies";
import { usePhysicsLayout, type PlanetNode, type ViewMode } from "./usePhysicsLayout";
import {
  CANVAS_DESKTOP,
  CANVAS_MOBILE,
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

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.4;

const LABEL_SCREEN_PX = 12;
// Below this on-screen diameter, planets render without a visible label
// (label still appears on hover).
const LABEL_MIN_SCREEN_DIAMETER = 36;

function formatValuation(b: number): string {
  if (b >= 1000) return `$${(b / 1000).toFixed(b >= 10000 ? 1 : 2)}T`;
  if (b >= 10) return `$${b.toFixed(0)}B`;
  if (b >= 1) return `$${b.toFixed(1)}B`;
  return `$${(b * 1000).toFixed(0)}M`;
}

function Planet({
  node,
  slideUnitsPerPx,
  isHovered,
  onHoverChange,
  onClick,
  dimmed,
}: {
  node: PlanetNode;
  slideUnitsPerPx: number;
  isHovered: boolean;
  onHoverChange: (name: string | null) => void;
  onClick: (node: PlanetNode) => void;
  dimmed: boolean;
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
  const labelFontPx = LABEL_SCREEN_PX * slideUnitsPerPx;
  const screenDiameter = (node.r * 2) / slideUnitsPerPx;
  const showLabel = screenDiameter >= LABEL_MIN_SCREEN_DIAMETER || isHovered;

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
        cursor: "pointer",
        opacity: dimmed ? 0.2 : 1,
        transition: "opacity 220ms ease",
      }}
      onMouseEnter={() => onHoverChange(node.name)}
      onMouseLeave={() => onHoverChange(null)}
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
      {showLabel && (
        <foreignObject
          x={node.x - node.r}
          y={node.y - node.r}
          width={node.r * 2}
          height={node.r * 2}
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
              lineHeight: 1.15,
              padding: `${labelFontPx * 0.3}px`,
              boxSizing: "border-box",
              textShadow: "0 0 4px rgba(0,0,0,0.7)",
              WebkitTextStroke: `${0.7 * slideUnitsPerPx}px #000`,
              paintOrder: "stroke fill",
              wordBreak: "keep-all",
              overflowWrap: "normal",
              hyphens: "none",
            }}
          >
            <div style={{ fontWeight: 700 }}>{node.name}</div>
            <div style={{ fontWeight: 700, opacity: 0.85, marginTop: labelFontPx * 0.15 }}>
              {formatValuation(node.valuation_b)}
            </div>
          </div>
        </foreignObject>
      )}
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
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
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
              style={{
                display: "flex",
                alignItems: "stretch",
                gap: 0,
                borderRadius: 6,
                overflow: "hidden",
                opacity: on ? 1 : 0.45,
                fontSize: 13,
              }}
            >
              {/* Checkbox half — toggles visibility, does NOT trigger hover/focus */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 8px",
                  cursor: "pointer",
                  background: on ? "rgba(255,255,255,0.02)" : "transparent",
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
              {/* Name half — fires hover (highlight on map) and click (focus zoom) */}
              <div
                role="button"
                onMouseEnter={() => onHoverSector(s)}
                onMouseLeave={() => onHoverSector(null)}
                onClick={() => onFocusSector(s)}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  cursor: "pointer",
                  background: isHovered
                    ? "rgba(255,255,255,0.10)"
                    : on
                      ? "rgba(255,255,255,0.04)"
                      : "transparent",
                  border: isHovered
                    ? "1px solid rgba(255,255,255,0.25)"
                    : "1px solid transparent",
                  borderRadius: 4,
                  transition: "background 120ms, border-color 120ms",
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
        overflowY: "auto",
        background: "rgba(7, 14, 32, 0.85)",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        color: "#e6edf7",
        padding: "16px 14px",
        boxSizing: "border-box",
        fontFamily: 'Calibri, "Helvetica Neue", Arial, sans-serif',
        userSelect: "none",
      }}
    >
      <SectorPanelContent {...props} />
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
  onMouseEnter,
}: {
  date: MapDate;
  baseCompanies: SheetCompany[];
  nodes: PlanetNode[];
  canvas: { x: number; y: number; w: number; h: number };
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
}) {
  const valByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of baseCompanies) m.set(c.name, valuationForDate(c, date));
    return m;
  }, [baseCompanies, date]);

  // Selected thumbnail is visibly larger than non-selected ones.
  const contentWidth = isSelected ? CAROUSEL_SELECTED_W : CAROUSEL_NEIGHBOR_W;

  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
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
        opacity: isSelected ? 1 : 0.7,
        transition:
          "width 700ms cubic-bezier(0.65, 0, 0.35, 1), opacity 500ms cubic-bezier(0.65, 0, 0.35, 1)",
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: `${canvas.w / canvas.h}`,
          background:
            "radial-gradient(ellipse at 30% 30%, #0f2a52 0%, #04102a 60%, #00050f 100%)",
          borderRadius: 10,
          border: isSelected
            ? "2px solid rgba(180, 200, 255, 0.9)"
            : isActive
              ? "2px solid rgba(120, 160, 255, 0.55)"
              : "1px solid rgba(255,255,255,0.12)",
          boxShadow: isSelected
            ? "0 0 32px rgba(120, 160, 255, 0.45)"
            : isActive
              ? "0 0 16px rgba(80, 120, 200, 0.25)"
              : "none",
          overflow: "hidden",
          transition:
            "border-color 600ms cubic-bezier(0.65, 0, 0.35, 1), box-shadow 600ms cubic-bezier(0.65, 0, 0.35, 1)",
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
  onHover,
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
  onHover: (d: MapDate | null) => void;
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
      onMouseLeave={() => onHover(null)}
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
                onMouseEnter={() => onHover(d)}
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
            {/* Year label under the January tick (always) or under any hovered tick */}
            <span
              style={{
                height: 12,
                lineHeight: "12px",
                opacity: isJan ? 1 : 0,
                whiteSpace: "nowrap",
                fontWeight: 500,
              }}
            >
              {isJan ? d.year : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function MediaMap() {
  const isMobile = useIsMobile();
  const canvas = useMemo(
    () => (isMobile ? CANVAS_MOBILE : CANVAS_DESKTOP),
    [isMobile],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState(0);
  const [containerH, setContainerH] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const [companies, setCompanies] = useState<SheetCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [showSectorLabels, setShowSectorLabels] = useState(true);
  const [hoveredPlanet, setHoveredPlanet] = useState<string | null>(null);
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [mobileSectorsOpen, setMobileSectorsOpen] = useState(false);
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

  // Debounced hover setter. Rapid sweeps across the timeline don't trigger
  // a flurry of carousel slides — the slide only fires once the cursor settles.
  const hoverTimerRef = useRef<number | null>(null);
  const setHoveredDateSettled = (d: MapDate | null) => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (d === null) {
      setHoveredDate(null);
      return;
    }
    hoverTimerRef.current = window.setTimeout(() => {
      setHoveredDate(d);
      hoverTimerRef.current = null;
    }, 160);
  };
  useEffect(() => () => {
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
  }, []);

  // Date the carousel is currently centered on. When hovering a timeline mark
  // we preview that date without committing; otherwise we show the active date.
  const displayedCenterDate = hoveredDate ?? activeDate;

  const dateRange = useMemo(() => buildDateRange(), []);
  const displayedCompanies = useMemo(
    () => sameDate(activeDate, CURRENT_DATE)
      ? companies
      : companiesForDate(companies, activeDate),
    [companies, activeDate],
  );


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
  const nodes = usePhysicsLayout(displayedCompanies, enabled, physicsBounds, viewMode, isMobile);

  // In linear mode the strip extends to the right of the canvas; compute the
  // total slide-coord width so the SVG can be sized wider than the viewport
  // and a horizontal scrollbar appears.
  const linearStripSlideWidth = useMemo(() => {
    if (viewMode !== "linear") return canvas.w;
    let maxRight = canvas.x + canvas.w;
    for (const n of nodes) {
      const right = n.x + n.r + 80;
      if (right > maxRight) maxRight = right;
    }
    return Math.max(canvas.w, maxRight - canvas.x);
  }, [nodes, viewMode, canvas]);

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

  const slideUnitsPerPx = containerW > 0 ? view.w / containerW : 1;

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
    dragRef.current = null;
    (e.currentTarget as HTMLElement).style.cursor = "grab";
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
    if (viewMode === "linear") return nodes;
    const pad = 300;
    return nodes.filter(n => {
      if (n.x + n.r < view.x - pad) return false;
      if (n.x - n.r > view.x + view.w + pad) return false;
      if (n.y + n.r < view.y - pad) return false;
      if (n.y - n.r > view.y + view.h + pad) return false;
      return true;
    });
  }, [nodes, view, viewMode]);

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
            background: "radial-gradient(ellipse at 30% 30%, #0f2a52 0%, #04102a 60%, #00050f 100%)" }}>
        {/* Live interactive map — always mounted so physics keeps running.
            Hidden visually when in timeline mode (carousel overlay takes over). */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            visibility: timelineOpen ? "hidden" : "visible",
            pointerEvents: timelineOpen ? "none" : "auto",
          }}
        >
        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: "100%",
            position: "relative",
            overflowX: viewMode === "linear" ? "auto" : "hidden",
            overflowY: "hidden",
            cursor: viewMode === "linear" ? "default" : "grab",
            userSelect: "none",
          }}
          onMouseDown={viewMode === "linear" ? undefined : onMouseDown}
          onMouseMove={viewMode === "linear" ? undefined : onMouseMove}
          onMouseUp={viewMode === "linear" ? undefined : onMouseUp}
          onMouseLeave={viewMode === "linear" ? undefined : onMouseUp}
          onWheel={viewMode === "linear" ? undefined : onWheel}
        >
          <svg
            width={
              viewMode === "linear" && containerH > 0
                ? Math.max(containerW, (linearStripSlideWidth / canvas.h) * containerH)
                : "100%"
            }
            height="100%"
            viewBox={
              viewMode === "linear"
                ? `${canvas.x} ${canvas.y} ${linearStripSlideWidth} ${canvas.h}`
                : `${view.x} ${view.y} ${view.w} ${view.h}`
            }
            preserveAspectRatio={
              viewMode === "linear"
                ? "xMinYMax meet"
                : isMobile
                  ? "xMidYMid slice"
                  : "xMidYMid meet"
            }
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
              width={viewMode === "linear" ? linearStripSlideWidth : canvas.w}
              height={canvas.h}
              fill="url(#starfield)"
              opacity={0.6}
            />

            {/* Sector labels — only in map mode (and never on mobile, where
                they would clutter the smaller viewport). */}
            {viewMode === "map" && showSectorLabels && !isMobile && (() => {
              const visibleSectors = allSectors.filter(s => enabled.has(s));
              const unknownVisible = visibleSectors.filter(s => !isKnownSector(s));
              const labelFontPx = 16 * slideUnitsPerPx;
              return visibleSectors.map(s => {
                const unknownIdx = unknownVisible.indexOf(s);
                const c = sectorCenterFor(s, unknownIdx, unknownVisible.length, isMobile);
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
            ].map(n => (
              <Planet
                key={n.name}
                node={n}
                slideUnitsPerPx={slideUnitsPerPx}
                isHovered={hoveredPlanet === n.name}
                onHoverChange={setHoveredPlanet}
                onClick={(node) => {
                  if (didDragRef.current) return;
                  focusOnPlanet(node);
                }}
                dimmed={hoveredSector !== null && n.sector !== hoveredSector}
              />
            ))}
          </svg>
        </div>
        </div>

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
            {(["map", "linear"] as ViewMode[]).map(mode => {
              const active = viewMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
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
              selectedIdx={dateRange.findIndex(d => sameDate(d, displayedCenterDate))}
              activeIdx={dateRange.findIndex(d => sameDate(d, activeDate))}
              baseCompanies={companies}
              nodes={nodes}
              canvas={canvas}
              onSelect={(d) => { setHoveredDateSettled(null); selectDate(d); }}
              onHover={setHoveredDateSettled}
              onAddView={addActiveToSavedViews}
              canAddView={!savedViews.some(v => sameDate(v, activeDate))}
            />
            <TimelineStrip
              dates={dateRange}
              activeDate={activeDate}
              hoveredDate={hoveredDate}
              onSelect={(d) => { setHoveredDateSettled(null); selectDate(d); }}
              onHover={setHoveredDateSettled}
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
            setHoveredDateSettled(null);
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

        {/* Zoom UI — hidden while in timeline mode */}
        {!timelineOpen && (
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

