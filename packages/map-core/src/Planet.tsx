import type {MouseEvent as ReactMouseEvent} from "react"
import type {PlanetNode} from "./types.js"
import {formatValuation, hexToRgba} from "./style.js"

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
}: PlanetProps) {
  const safeName = node.name.replace(/[^a-z0-9]/gi, "_")
  const gradId = `planet-${safeName}`
  const clipId = `planet-clip-${safeName}`
  const glowFilterId = `planet-glow-${safeName}`
  const hue = node.hue
  const style = node.style
  const stripes = style?.stripes && style.stripes.length >= 2 ? style.stripes : null
  const hasExplicitFill = !!(stripes || style?.fill)
  const glow = style?.glow ?? null
  const glowBlur = glow ? (glow.blurPx ?? 5) * slideUnitsPerPx : 0
  const glowSpread = glow ? (glow.spreadPx ?? 4) * slideUnitsPerPx : 0
  const labelFontPx = labelSizePx * slideUnitsPerPx
  const screenDiameter = (node.r * 2) / slideUnitsPerPx
  const showLabel = isHovered || (!labelSuppressed && screenDiameter >= labelMinScreenDiameter)

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
    const rows = words.map((w, i) => ({text: w, y: top + lineH / 2 + i * lineH, opacity: 1}))
    if (valText) rows.push({text: valText, y: top + words.length * lineH + gap + lineH / 2, opacity: 0.85})
    return (
      <text
        x={node.x}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily='Calibri, "Helvetica Neue", Arial, sans-serif'
        fontWeight={700}
        fontSize={labelFontPx}
        fill={node.labelColor ?? "#fff"}
        stroke="#000"
        strokeWidth={1.2 * slideUnitsPerPx}
        paintOrder="stroke"
        // In edit mode the visible text is a grab/select target (entities have no
        // circle); otherwise it's click-through.
        style={{pointerEvents: isEditMode ? "auto" : "none", cursor: isEditMode ? "grab" : undefined}}
      >
        {rows.map((r, i) => (
          <tspan key={i} x={node.x} y={r.y} opacity={r.opacity}>
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
        {renderNameLabel(false)}
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

  // Default stripe orientation is vertical (90°).
  const stripeAngle = stripes
    ? style?.stripeOrientation === "horizontal"
      ? 0
      : style?.stripeOrientation === "diagonal"
        ? 45
        : 90
    : 0

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
      {showLabel && renderNameLabel(showValuation)}
    </g>
  )
}
