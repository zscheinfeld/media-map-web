import type {MouseEvent as ReactMouseEvent} from "react"
import type {ConnectionStyle} from "./types.js"
import {boxEdgeDistance} from "./labelBox.js"

/** A name box (half-extents, slide units) the line should stop short of. */
export type LineEndBox = {hw: number; hh: number}

/** Gap between a line's end and an entity's name, screen px. */
export const ENTITY_LINE_GAP_PX = 8

export type ConnectionLineProps = {
  ax: number
  ay: number
  bx: number
  by: number
  connectionStyle: ConnectionStyle
  slideUnitsPerPx: number
  /** Entity ends: the name's box. The line stops ENTITY_LINE_GAP_PX short of it
   *  rather than running through the text (planet ends need nothing — the
   *  circle covers the line). */
  aBox?: LineEndBox
  bBox?: LineEndBox
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
  aBox,
  bBox,
  isSelected = false,
  isHovered = false,
  interactive = false,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  onClick,
}: ConnectionLineProps) {
  if (aBox || bBox) {
    const len = Math.hypot(bx - ax, by - ay)
    if (len > 0) {
      const dx = (bx - ax) / len
      const dy = (by - ay) / len
      const gap = ENTITY_LINE_GAP_PX * slideUnitsPerPx
      const cutA = aBox ? boxEdgeDistance(aBox.hw, aBox.hh, dx, dy) + gap : 0
      const cutB = bBox ? boxEdgeDistance(bBox.hw, bBox.hh, dx, dy) + gap : 0
      // Ends so close the names meet: draw nothing rather than a reversed stub.
      if (cutA + cutB >= len) return null
      ;[ax, ay, bx, by] = [ax + dx * cutA, ay + dy * cutA, bx - dx * cutB, by - dy * cutB]
    }
  }
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
        // Inert when no handlers are wired (e.g. mobile) so it neither shows a
        // hover tooltip nor intercepts taps meant for panning.
        pointerEvents={onMouseEnter || onMouseMove || onClick ? undefined : "none"}
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
