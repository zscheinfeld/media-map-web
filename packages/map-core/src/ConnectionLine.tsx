import type {MouseEvent as ReactMouseEvent} from "react"
import type {ConnectionStyle} from "./types.js"

export type ConnectionLineProps = {
  ax: number
  ay: number
  bx: number
  by: number
  connectionStyle: ConnectionStyle
  slideUnitsPerPx: number
  isSelected?: boolean
  isHovered?: boolean
  /** Shows a pointer cursor on the hit area (edit mode). */
  interactive?: boolean
  onMouseEnter?: (e: ReactMouseEvent) => void
  onMouseMove?: (e: ReactMouseEvent) => void
  onMouseLeave?: (e: ReactMouseEvent) => void
  onClick?: (e: ReactMouseEvent) => void
}

// Presentational connection line: a wide transparent hit-area sibling under a
// thin visible stroke (solid or dotted). Endpoints/selection/hover state are
// resolved by the caller (which owns the data source and live drag positions).
export function ConnectionLine({
  ax,
  ay,
  bx,
  by,
  connectionStyle,
  slideUnitsPerPx,
  isSelected = false,
  isHovered = false,
  interactive = false,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  onClick,
}: ConnectionLineProps) {
  const strokeW = (isSelected ? 3.5 : isHovered ? 3 : 2) * slideUnitsPerPx
  const stroke = isSelected
    ? "#ffe066"
    : isHovered
      ? "rgba(255,255,255,0.95)"
      : "rgba(255,255,255,0.6)"
  // Dash scaled to screen px so it looks constant at any zoom.
  const dash = connectionStyle === "dotted" ? `${8 * slideUnitsPerPx} ${7 * slideUnitsPerPx}` : undefined

  return (
    <g>
      <line
        x1={ax}
        y1={ay}
        x2={bx}
        y2={by}
        stroke="transparent"
        strokeWidth={Math.max(18 * slideUnitsPerPx, strokeW)}
        style={{cursor: interactive ? "pointer" : "default"}}
        onMouseEnter={onMouseEnter}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
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
        style={{transition: "stroke 140ms ease"}}
      />
    </g>
  )
}
