import type {MouseEvent as ReactMouseEvent} from "react"
import type {PlanetNode} from "./types.js"
import {formatValuation, hexToRgba, ombreStripeColors} from "./style.js"

export type PlanetProps = {
  node: PlanetNode
  /** Slide-units-per-screen-pixel, so *Px props stay constant on screen at any zoom. */
  slideUnitsPerPx: number
  isHovered: boolean
  onHoverChange: (name: string | null) => void
  onClick: (node: PlanetNode) => void
  dimmed: boolean
  /** Label font size in screen px (multiplied by slideUnitsPerPx). */
  labelSizePx?: number
  isEditMode?: boolean
  isSelected?: boolean
  onPlanetMouseDown?: (node: PlanetNode, e: ReactMouseEvent) => void
  /** Render the valuation line under the name. Caller owns the rule (zoom threshold, Large Cap, etc.). */
  showValuation?: boolean
  /** Hide the name label unless hovered. Caller owns the rule (e.g. mobile shows only Large Cap). */
  labelSuppressed?: boolean
  /** Below this on-screen diameter the label is hidden (unless hovered). 0 = always show. */
  labelMinScreenDiameter?: number
  /** Hide entity (text-only) labels unless hovered/edit. Entities have r=0 so the
   *  diameter threshold can't reveal them on zoom — the caller drives this from a
   *  zoom threshold instead (e.g. hidden on mobile until zoomed in). */
  entityLabelSuppressed?: boolean
  /** Search match: always show the label (even on planets small enough to hide
   *  it). The match reads through everything else dimming, not a colour change. */
  highlighted?: boolean
  /** Black outline around the label text, screen px. */
  labelStrokePx?: number
  /**
   * Which part to draw. "all" (default) = circle + name together. "body" = the
   * circle without its name; "label" = only the name. The caller draws every
   * body first and every label after, so a planet drawn later can never cover a
   * neighbour's name. (Entities are all-name: they draw in "all"/"body" and are
   * skipped for "label".)
   */
  part?: "all" | "body" | "label"
  /**
   * Prefix for this planet's SVG ids (gradient / clip / glow). Needed when the
   * same company is drawn more than once on a page (the Time Machine draws
   * every year's map): ids are document-wide, so two copies would otherwise
   * share one clip circle and one would be clipped at the other's size.
   */
  idPrefix?: string
}

// Presentational planet: fill OR stripes (stripes win when 2+), optional glow,
// stroke, and a foreignObject label. Edit-mode cues (red pinned ring, yellow
// selection ring) render when isEditMode is set. No data-source coupling.
export function Planet({
  node,
  slideUnitsPerPx,
  isHovered,
  onHoverChange,
  onClick,
  dimmed,
  labelSizePx = 12,
  isEditMode = false,
  isSelected = false,
  onPlanetMouseDown,
  showValuation = false,
  labelSuppressed = false,
  labelMinScreenDiameter = 0,
  entityLabelSuppressed = false,
  highlighted = false,
  labelStrokePx = 1.2,
  part = "all",
  idPrefix = "",
}: PlanetProps) {
  const safeName = node.name.replace(/[^a-z0-9]/gi, "_")
  const gradId = `${idPrefix}planet-${safeName}`
  const clipId = `${idPrefix}planet-clip-${safeName}`
  const glowFilterId = `${idPrefix}planet-glow-${safeName}`
  const hue = node.hue
  const style = node.style
  // Ombré recipe wins over a plain stripe list (style-lab experiment).
  const ombre = style?.ombre && style.ombre.count >= 1 && style.ombre.stops.length >= 1 ? style.ombre : null
  const ombreColors = ombre ? ombreStripeColors(ombre) : null
  const stripes = ombreColors && ombreColors.length
    ? ombreColors
    : style?.stripes && style.stripes.length >= 2
      ? style.stripes
      : null
  const hasExplicitFill = !!(stripes || style?.fill)
  const glow = style?.glow ?? null
  const glowBlur = glow ? (glow.blurPx ?? 5) * slideUnitsPerPx : 0
  const glowSpread = glow ? (glow.spreadPx ?? 4) * slideUnitsPerPx : 0
  const labelFontPx = labelSizePx * slideUnitsPerPx
  const screenDiameter = (node.r * 2) / slideUnitsPerPx
  const showLabel = isHovered || highlighted || (!labelSuppressed && screenDiameter >= labelMinScreenDiameter)

  // Reusable name label as native SVG <text> (word-stacked, coloured fill + black
  // outline). SVG text scales correctly with the viewBox on every browser —
  // HTML-in-foreignObject labels mis-scale AND get text-inflated on iOS Safari
  // (giant ghost labels). Shared by the planet body + the entity branch.
  const renderNameLabel = (withValuation: boolean) => {
    const words = (node.labelText ?? node.name).trim().split(/\s+/)
    const valText = withValuation ? formatValuation(node.valuation_b) : null
    const lineH = labelFontPx
    const gap = valText ? labelFontPx * 0.15 : 0
    const totalH = words.length * lineH + (valText ? gap + lineH : 0)
    const top = node.y - totalH / 2
    const rows = words.map((w, i) => ({text: w, y: top + lineH / 2 + i * lineH, opacity: 1, isVal: false}))
    if (valText)
      rows.push({text: valText, y: top + words.length * lineH + gap + lineH / 2, opacity: 0.85, isVal: true})
    // Company name = ITC Franklin Gothic Medium (500) + 2% tracking; the valuation
    // number stays Book (400) with normal tracking. Weight/spacing are set per
    // <tspan> so both share one <text> (and one outline). Tracking is 2% of the
    // font size, in slide units, so it scales with zoom like everything else.
    const nameTracking = 0.02 * labelFontPx
    return (
      <text
        x={node.x}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily='"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif'
        fontSize={labelFontPx}
        fill={node.labelColor ?? "#fff"}
        stroke="#000"
        strokeWidth={labelStrokePx * slideUnitsPerPx}
        paintOrder="stroke"
        // In edit mode the visible text is a grab/select target (entities have no
        // circle); otherwise it's click-through.
        style={{pointerEvents: isEditMode ? "auto" : "none", cursor: isEditMode ? "grab" : undefined}}
      >
        {rows.map((r, i) => (
          <tspan
            key={i}
            x={node.x}
            y={r.y}
            opacity={r.opacity}
            fontWeight={r.isVal ? 400 : 500}
            letterSpacing={r.isVal ? 0 : nameTracking}
          >
            {r.text}
          </tspan>
        ))}
      </text>
    )
  }

  // Entities are text-only: no circle/fill/glow/stroke/valuation. Render just the
  // label (always shown — it IS the node) plus edit-mode cues drawn as a small
  // ring centered on the label, since there's no circle to outline.
  if (node.isEntity) {
    if (part === "label") return null
    // Ring radius keyed off the label half-extent so selection stays legible at
    // any label width; clamped to a small minimum for very short names.
    const cueR = Math.max(node.labelRadius ?? 0, 24 * slideUnitsPerPx)
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
        {isEditMode && node.pinned && (
          <circle
            cx={node.x}
            cy={node.y}
            r={cueR}
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
            r={cueR + 4 * slideUnitsPerPx}
            fill="none"
            stroke="#ffe066"
            strokeWidth={2 * slideUnitsPerPx}
            strokeDasharray={`${4 * slideUnitsPerPx} ${3 * slideUnitsPerPx}`}
            pointerEvents="none"
          />
        )}
        {/* Entities are all-label. Hidden when the caller suppresses them (e.g.
            mobile, zoomed out); revealed on hover, in edit mode, or once the
            caller stops suppressing (zoomed in past its threshold). */}
        {(isEditMode || isHovered || highlighted || !entityLabelSuppressed) && renderNameLabel(false)}
      </g>
    )
  }

  // Name-only pass: just the label, click-through, dimming with its planet.
  if (part === "label") {
    if (!showLabel) return null
    return (
      <g style={{opacity: dimmed ? 0.2 : 1, transition: "opacity 220ms ease", pointerEvents: "none"}}>
        {renderNameLabel(showValuation)}
      </g>
    )
  }

  // Stroke defaults: explicit > stripes[0]@0.55 > fill@0.55 > hue-based.
  const baseStrokeColor =
    style?.stroke ??
    (stripes ? hexToRgba(stripes[0], 0.55) : null) ??
    (style?.fill ? hexToRgba(style.fill, 0.55) : null) ??
    `hsla(${hue}, 70%, 75%, 0.55)`
  const baseStrokeWidth =
    style?.strokeWidthPx !== undefined
      ? style.strokeWidthPx * slideUnitsPerPx
      : Math.max(1, node.r * 0.01)
  const hoverStrokeWidth = 2.5 * slideUnitsPerPx

  // Default stripe orientation is vertical (90°). Ombré carries its own angle.
  const stripeAngle = ombre
    ? ombre.angle
    : stripes
      ? style?.stripeOrientation === "horizontal"
        ? 0
        : style?.stripeOrientation === "diagonal"
          ? 45
          : 90
      : 0
  const stripeEdgePx = ombre?.stripeStrokePx ?? 0

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
          <circle cx={node.x} cy={node.y} r={node.r + glowSpread} fill={glow.color} filter={`url(#${glowFilterId})`} />
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
                const stripeH = (2 * node.r) / stripes.length
                return (
                  <rect
                    key={i}
                    x={-node.r}
                    y={-node.r + i * stripeH}
                    width={2 * node.r}
                    height={stripeH + 0.5}
                    fill={c}
                  />
                )
              })}
              {/* Ombré: hairline between adjacent stripes, clipped to the circle. */}
              {stripeEdgePx > 0 &&
                stripes.slice(1).map((_, i) => {
                  const y = -node.r + ((i + 1) * 2 * node.r) / stripes.length
                  const half = Math.sqrt(Math.max(0, node.r * node.r - y * y))
                  return (
                    <line
                      key={`edge-${i}`}
                      x1={-half}
                      y1={y}
                      x2={half}
                      y2={y}
                      stroke={ombre?.stripeStrokeColor ?? baseStrokeColor}
                      strokeWidth={stripeEdgePx * slideUnitsPerPx}
                    />
                  )
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
      {/* Pinned planets: red ring just outside the edge (gap keeps it visible on red planets). */}
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
      {part !== "body" && showLabel && renderNameLabel(showValuation)}
    </g>
  )
}
