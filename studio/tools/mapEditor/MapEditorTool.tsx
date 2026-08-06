import {useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent} from 'react'
import {Box, Button, Card, Flex, Spinner, Stack, Text} from '@sanity/ui'
import {AddIcon, ChevronDownIcon, RemoveIcon} from '@sanity/icons'
import {useClient} from 'sanity'
import {
  ConnectionLine,
  Planet,
  computeAnchorDiam,
  usePhysicsLayout,
  type LayoutInput,
  type PlanetNode,
} from '@media-map/map-core'
import {
  appearanceActiveAt,
  CANVAS,
  useSanityMapData,
  type EditorCompany,
  type EditorEntity,
} from './sanityMapData'
import {useSheetValuations} from './sheetValuations'
import {useLiveValuations, valuationAt as liveValuationAt} from './liveValuations'
import {computeLabelRadii} from './labelRadii'
import {PlanetInspector} from './PlanetInspector'
import {ConnectionInspector} from './ConnectionInspector'
import {SectorInspector} from './SectorInspector'
import {ConnectModePanel} from './ConnectModePanel'
import {LAYOUT_KNOBS_DEFAULTS, LayoutKnobs, type LayoutKnobsValues} from './LayoutKnobs'
import {CollapsibleSection} from './CollapsibleSection'
import {TimeSelector} from './TimeSelector'
import {SaveBar} from './SaveBar'
import {DEFAULT_MOMENT, yearOfMoment, type Moment} from './moment'
import {
  EMPTY_PENDING,
  activeOverrideAt,
  activeSectorOverrideAt,
  activeSettingsOverrideAt,
  clearAt,
  clearSectorAt,
  connectionActiveAt,
  createConnection,
  deleteConnection,
  describePending,
  editAt,
  editConnection,
  editSectorAt,
  editSettingsAt,
  effectiveSectorCenterAt,
  pendingCount,
  resolveConnections,
  resolveOverrides,
  resolveSectorOverrides,
  resolveSettingsOverrides,
  type ConnectionStyle,
  type PendingState,
  type ResolvedConnection,
  type ResolvedOverride,
  type ResolvedSectorOverride,
} from './pendingChanges'
import {commitPending} from './patches'

// Physics keeps planets inside an inset of the canvas (mirrors the app).
const BOUNDS = {
  x0: CANVAS.x + 120,
  y0: CANVAS.y + 120,
  x1: CANVAS.x + CANVAS.w - 120,
  y1: CANVAS.y + CANVAS.h - 120,
}
// Mouse-move threshold for treating a mousedown→up as a drag vs. a click.
const DRAG_THRESHOLD_PX = 4

// Canvas zoom bounds for the lower-right +/- controls. 1 = fit-to-view (the
// default); higher values shrink the SVG viewBox around a clamped pan offset.
const ZOOM_MIN = 1
const ZOOM_MAX = 6
const ZOOM_STEP = 1.3

// Clamp a pan offset (slide units) so the zoomed viewBox stays inside the
// canvas. At zoom 1 the bounds collapse to 0, locking pan to the centered view.
const clampPan = (p: {x: number; y: number}, z: number) => {
  const maxX = (CANVAS.w - CANVAS.w / z) / 2
  const maxY = (CANVAS.h - CANVAS.h / z) / 2
  return {
    x: Math.max(-maxX, Math.min(maxX, p.x)),
    y: Math.max(-maxY, Math.min(maxY, p.y)),
  }
}

type DragRef = {
  name: string
  startScreenX: number
  startScreenY: number
  startSlideX: number
  startSlideY: number
}

/**
 * Phase 3 in-Studio Map Editor.
 *
 *  - 3a: live read-only canvas through the shared `map-core` renderer.
 *  - 3b: drag/pin planets, write back to Sanity.
 *  - 3c.1 (this revision): staged-changes model + global year+month selector
 *    + forward-propagated position editing + read-only per-planet history.
 *    Edits accumulate in `PendingState`; Save batches them through
 *    `commitPending` (one transaction); Reset discards. The viewed moment
 *    drives the canvas via `activeOverrideAt` (largest start_date ≤ moment).
 *  - 3c.2: connections — not yet (next sub-phase).
 */
export function MapEditorTool() {
  const client = useClient({apiVersion: '2024-01-01'})
  const {data, error} = useSanityMapData()
  // Live valuations (slug × year) — the same published sheet the public map uses,
  // so editor planet sizes match production AND resize as the year is scrubbed.
  // The legacy name-matched sheet stays as the final fallback for uncovered rows.
  const {data: liveValuations, loaded: liveValuationsLoaded} = useLiveValuations()
  const {valuations: sheetValuations, loaded: sheetValuationsLoaded} = useSheetValuations()
  const valuationsLoaded = liveValuationsLoaded && sheetValuationsLoaded
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerW, setContainerW] = useState(0)
  const [containerH, setContainerH] = useState(0)
  const [hovered, setHovered] = useState<string | null>(null)

  // Live layout knobs — same set the app's edit toolbar exposed.
  // Layout knobs are persisted to the mapSettings singleton. The live values are
  // derived: pending edits (staged in the changes panel) layer over the saved
  // settings, which themselves fall back to defaults until the doc is created.

  // --- Zoom + pan (lower-right controls) ----------------------------------
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({x: 0, y: 0})
  const [isPanning, setIsPanning] = useState(false)
  // Sector label/marker visibility (the yellow pills). On by default; editors can
  // hide them when they're distracting (also hides the sector drag handles).
  const [showSectorLabels, setShowSectorLabels] = useState(true)
  // Master collapse for the connected left-hand control panel (get it out of the
  // way to see the map); individual sections collapse independently within it.
  const [controlsOpen, setControlsOpen] = useState(true)
  const panDragRef = useRef<{
    startScreenX: number
    startScreenY: number
    startPanX: number
    startPanY: number
  } | null>(null)

  // --- Staged changes ------------------------------------------------------
  const [moment, setMoment] = useState<Moment>(DEFAULT_MOMENT)
  const [pending, setPending] = useState<PendingState>(EMPTY_PENDING)

  // Knob values are time-scoped on the mapSettings singleton (forward-prop). The
  // values active at the viewed moment drive the canvas + the knob panel; editing
  // a knob stages an override stamped at the current moment, so earlier/sparser
  // maps can carry their own settings.
  const knobs = useMemo<LayoutKnobsValues>(() => {
    const resolved = resolveSettingsOverrides(data?.settingsOverrides ?? [], pending)
    return activeSettingsOverrideAt(resolved, moment)?.values ?? LAYOUT_KNOBS_DEFAULTS
  }, [data, pending, moment])
  const setKnob = useCallback(
    (key: keyof LayoutKnobsValues) => (v: number) =>
      setPending((prev) => editSettingsAt(prev, data?.settingsOverrides ?? [], moment, {[key]: v})),
    [data, moment],
  )
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // --- Drag + selection state ---------------------------------------------
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [selectedConnectionKey, setSelectedConnectionKey] = useState<string | null>(null)
  const [hoveredConnectionKey, setHoveredConnectionKey] = useState<string | null>(null)
  const [hoveredSectorId, setHoveredSectorId] = useState<string | null>(null)
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null)
  const planetDragRef = useRef<DragRef | null>(null)
  const didDragRef = useRef(false)
  const [dragState, setDragState] = useState<{name: string; x: number; y: number} | null>(null)

  // --- Connect-mode state -------------------------------------------------
  const [connectMode, setConnectMode] = useState(false)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  // Cursor in slide coords while in connect-mode, for the rubber-band preview.
  const [connectCursor, setConnectCursor] = useState<{x: number; y: number} | null>(null)

  // --- Sector-marker drag state ------------------------------------------
  // Same shape as planet drag but keyed by sectorId. Sector drag has priority
  // over canvas-pan when both could fire (currently no canvas-pan in Studio).
  const sectorDragRef = useRef<{
    sectorId: string
    sectorName: string
    startScreenX: number
    startScreenY: number
    startSlideX: number
    startSlideY: number
  } | null>(null)
  const [sectorDragState, setSectorDragState] = useState<{
    sectorId: string
    x: number
    y: number
  } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      setContainerW(rect.width)
      setContainerH(rect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The visible slide-space window (SVG viewBox). At zoom 1 it equals the full
  // canvas; zooming in shrinks it around the centered, clamped pan offset.
  const view = useMemo(() => {
    const w = CANVAS.w / zoom
    const h = CANVAS.h / zoom
    const cp = clampPan(pan, zoom)
    return {
      x: CANVAS.x + (CANVAS.w - w) / 2 + cp.x,
      y: CANVAS.y + (CANVAS.h - h) / 2 + cp.y,
      w,
      h,
    }
  }, [zoom, pan])

  // Slide-units per screen pixel. "meet" → use the LIMITING ratio (the larger
  // of the two) so labels/strokes render at correct screen px AND drag deltas
  // convert correctly between screen and slide space. Derived from the (zoomed)
  // view so all screen↔slide math follows the current zoom automatically.
  const slideUnitsPerPx =
    containerW > 0 && containerH > 0
      ? Math.max(view.w / containerW, view.h / containerH)
      : containerW > 0
        ? view.w / containerW
        : 1

  // Zoom-independent slide-units-per-pixel (full canvas vs container). Used ONLY
  // for the physics label-collision spacing, so zooming to inspect doesn't shrink
  // label radii and re-pack the layout. Rendering uses the zoomed value above.
  const baseSlideUnitsPerPx =
    containerW > 0 && containerH > 0
      ? Math.max(CANVAS.w / containerW, CANVAS.h / containerH)
      : containerW > 0
        ? CANVAS.w / containerW
        : 1

  // Sector centers resolved against pending edits at the current moment.
  // Time-scoped: forward-prop lookup against `desktop_center_overrides[]`
  // (Sanity + pending), with the Sector's scalar baseline as fallback. A
  // live drag on a sector marker wins so unparked planets in that sector
  // visibly follow the cursor.
  const resolvedSectorCenters = useMemo(() => {
    const out: Record<string, {x: number; y: number}> = {}
    if (!data) return out
    for (const s of data.sectors) {
      const live =
        sectorDragState?.sectorId === s.id
          ? {x: sectorDragState.x, y: sectorDragState.y}
          : effectiveSectorCenterAt(s, pending, s.id, moment)
      out[s.name] = live
    }
    return out
  }, [data, pending, sectorDragState, moment])

  // Live valuations size the planets, matched to the viewed year so scrubbing the
  // TimeSelector resizes them exactly like the public map. Precedence mirrors the
  // app: live sheet (slug × year) → manual Sanity value → legacy name sheet →
  // Sanity default. Wait for data + valuations + container measurement before
  // producing inputs so first layout settles once. Inputs' `center` uses the
  // resolved sector center (Sanity + pending + live drag), so a planet without
  // coordinates "drifts" toward whichever position the sector marker is at now.
  const viewedYear = String(yearOfMoment(moment))
  const inputs = useMemo(() => {
    if (!data || !valuationsLoaded || containerW === 0) return []
    // Only companies whose appearance windows cover the current moment are laid
    // out (no windows = always visible), mirroring the entity rule below.
    const companyInputs = data.inputs
      .filter((i) => appearanceActiveAt(data.companiesByName[i.name]?.appearanceWindows ?? [], moment))
      .map((i) => {
        const comp = data.companiesByName[i.name]
        // i.valuation_b already carries manual-or-default; explicit precedence:
        const live = liveValuationAt(liveValuations, comp?.slug, viewedYear)
        const v = live ?? comp?.manualValue ?? sheetValuations[i.name.toLowerCase()]
        const center = resolvedSectorCenters[i.sector] ?? i.center
        // Red name when the value isn't live-sourced for the viewed year (NA /
        // blank / not in the sheet) — matches the public map's #ff6b6b flag.
        const labelColor = live === undefined ? '#ff6b6b' : undefined
        return v === undefined
          ? {...i, center, labelColor}
          : {...i, valuation_b: v, center, labelColor}
      })
    // Entities are text-only nodes; only those whose appearance windows cover the
    // current moment are laid out. Their gravity center tracks the live sector.
    const entityInputs: LayoutInput[] = Object.values(data.entitiesByName)
      .filter((e) => appearanceActiveAt(e.appearanceWindows, moment))
      .map((e) => ({
        name: e.name,
        sector: e.sector,
        valuation_b: 0,
        isEntity: true,
        center: resolvedSectorCenters[e.sector] ?? e.center,
        hue: e.hue,
        style: null,
      }))
    return [...companyInputs, ...entityInputs]
  }, [data, valuationsLoaded, liveValuations, sheetValuations, viewedYear, containerW, resolvedSectorCenters, moment])

  // Companies + entities share the {id, name, positionOverrides} shape, so the
  // drag/pin/inspector/connect pipeline treats them uniformly. Keyed by name.
  const placeablesByName = useMemo<Record<string, EditorCompany | EditorEntity>>(
    () => (data ? {...data.companiesByName, ...data.entitiesByName} : {}),
    [data],
  )

  const anchorDiam = useMemo(
    () => computeAnchorDiam(inputs.map((i) => i.valuation_b), CANVAS.w * CANVAS.h, knobs.packingDensity),
    [inputs, knobs.packingDensity],
  )
  const labelRadii = useMemo(
    () => computeLabelRadii(inputs, knobs.labelSizePx, baseSlideUnitsPerPx),
    [inputs, knobs.labelSizePx, baseSlideUnitsPerPx],
  )

  // Effective positions = forward-propagation lookup at the current moment,
  // applied across Sanity overrides + pending ops. Planets with no qualifying
  // override fall back to the sector center via `usePhysicsLayout`'s default
  // (transitional behavior; once the public renderer enforces strict forward
  // prop, planets without overrides won't render at all — see docs/PROJECT.md).
  const positions = useMemo(() => {
    if (!data) return {}
    const out: Record<string, {x: number; y: number; pin?: boolean}> = {}
    const placeables = [
      ...Object.values(data.companiesByName),
      ...Object.values(data.entitiesByName),
    ]
    for (const p of placeables) {
      const resolved = resolveOverrides(p.positionOverrides, pending, p.name)
      const active = activeOverrideAt(resolved, moment)
      if (active) {
        out[p.name] = {x: active.x, y: active.y, pin: active.pin}
      }
    }
    return out
  }, [data, pending, moment])

  // Resolved connections = Sanity + pending creates − pending deletes (with
  // pending edits merged). The physics sim sees the full set so spring forces
  // and label-aware collide stay consistent regardless of time filter; only
  // the renderer/inspector uses `connectionActiveAt(moment)` to decide what to
  // show on canvas.
  const resolvedConnections: ResolvedConnection[] = useMemo(
    () => (data ? resolveConnections(data.connections, pending) : []),
    [data, pending],
  )
  const activeConnections = useMemo(
    () => resolvedConnections.filter((c) => connectionActiveAt(c, moment)),
    [resolvedConnections, moment],
  )

  const nodes = usePhysicsLayout({
    inputs,
    bounds: BOUNDS,
    viewMode: 'map',
    positions,
    isEditMode: true,
    anchorDiam,
    collidePadding: knobs.collidePadding,
    entityRadius: knobs.entityRadius,
    sizeSpacing: knobs.sizeSpacing,
    sectorPull: knobs.sectorPull,
    repulsion: knobs.repulsion,
    labelRadii,
    connections: activeConnections.map((c) => ({from: c.from, to: c.to})),
    connectionStrength: knobs.connectionPull,
    dragging: dragState,
  })

  const nodeByName = useMemo(() => new Map(nodes.map((n) => [n.name, n])), [nodes])

  // --- Drag + connect handlers --------------------------------------------

  const onPlanetMouseDown = (node: PlanetNode, e: ReactMouseEvent) => {
    e.stopPropagation()
    // Connect-mode short-circuits drag — clicks pick the two endpoints.
    if (connectMode) {
      if (!connectFrom) {
        setConnectFrom(node.name)
        setConnectCursor({x: node.x, y: node.y})
      } else if (connectFrom !== node.name && data) {
        const fromNode = placeablesByName[connectFrom]
        const toNode = placeablesByName[node.name]
        if (fromNode && toNode) {
          setPending((prev) =>
            createConnection(prev, {
              from: fromNode.name,
              to: toNode.name,
              fromId: fromNode.id,
              toId: toNode.id,
              startYear: yearOfMoment(moment),
            }),
          )
        }
        setConnectFrom(null)
        setConnectCursor(null)
      }
      return
    }
    planetDragRef.current = {
      name: node.name,
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      startSlideX: node.x,
      startSlideY: node.y,
    }
    didDragRef.current = false
    setSelectedName(node.name)
    setSelectedConnectionKey(null)
    setSelectedSectorId(null)
  }

  // Background-drag pan (only bound to the <svg>, so overlay panels/buttons are
  // never hijacked). Disabled in connect mode and when fully zoomed out.
  const onCanvasMouseDown = (e: ReactMouseEvent) => {
    if (connectMode || zoom <= ZOOM_MIN) return
    const cp = clampPan(pan, zoom)
    panDragRef.current = {
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      startPanX: cp.x,
      startPanY: cp.y,
    }
    setIsPanning(true)
  }

  const onContainerMouseMove = (e: ReactMouseEvent) => {
    // Background pan in progress — move the viewBox opposite the cursor.
    if (panDragRef.current && containerW > 0) {
      const dx = e.clientX - panDragRef.current.startScreenX
      const dy = e.clientY - panDragRef.current.startScreenY
      setPan(
        clampPan(
          {
            x: panDragRef.current.startPanX - dx * slideUnitsPerPx,
            y: panDragRef.current.startPanY - dy * slideUnitsPerPx,
          },
          zoom,
        ),
      )
      return
    }
    // In connect mode, track the cursor in slide coords so the rubber-band
    // line follows the pointer toward the eventual second planet.
    if (connectMode && connectFrom && containerRef.current && containerW > 0) {
      const rect = containerRef.current.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      // Map screen → slide via the viewBox + the rendered SVG aspect (xMidYMid meet).
      // The simpler invariant: slide units per px is the same on both axes (meet),
      // and the viewBox center maps to the container center.
      const slidePerPx = slideUnitsPerPx
      const cx = view.x + view.w / 2
      const cy = view.y + view.h / 2
      setConnectCursor({
        x: cx + (mx - rect.width / 2) * slidePerPx,
        y: cy + (my - rect.height / 2) * slidePerPx,
      })
    }
    // Sector drag — wins over planet drag when both refs are set (they
    // shouldn't be in practice; sector mousedown does stopPropagation).
    if (sectorDragRef.current && containerW > 0) {
      const dx = e.clientX - sectorDragRef.current.startScreenX
      const dy = e.clientY - sectorDragRef.current.startScreenY
      if (!didDragRef.current && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        didDragRef.current = true
      }
      setSectorDragState({
        sectorId: sectorDragRef.current.sectorId,
        x: sectorDragRef.current.startSlideX + dx * slideUnitsPerPx,
        y: sectorDragRef.current.startSlideY + dy * slideUnitsPerPx,
      })
      return
    }
    if (!planetDragRef.current || containerW === 0) return
    const dx = e.clientX - planetDragRef.current.startScreenX
    const dy = e.clientY - planetDragRef.current.startScreenY
    if (!didDragRef.current && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      didDragRef.current = true
    }
    setDragState({
      name: planetDragRef.current.name,
      x: planetDragRef.current.startSlideX + dx * slideUnitsPerPx,
      y: planetDragRef.current.startSlideY + dy * slideUnitsPerPx,
    })
  }

  const onContainerMouseUp = () => {
    // End a background pan (mutually exclusive with planet/sector drags).
    if (panDragRef.current) {
      panDragRef.current = null
      setIsPanning(false)
      return
    }
    // Sector drag commit (precedence over planet drag).
    if (sectorDragRef.current) {
      const sDrag = sectorDragRef.current
      const sState = sectorDragState
      sectorDragRef.current = null
      setSectorDragState(null)
      // Tap without drag → select the sector for the inspector.
      if (!didDragRef.current) {
        setSelectedSectorId(sDrag.sectorId)
        setSelectedName(null)
        setSelectedConnectionKey(null)
        return
      }
      if (sState && data) {
        const sector = data.sectors.find((s) => s.id === sDrag.sectorId)
        if (sector) {
          setPending((prev) => editSectorAt(prev, sector, moment, sState.x, sState.y))
        }
      }
      return
    }
    const drag = planetDragRef.current
    const state = dragState
    planetDragRef.current = null
    setDragState(null)
    if (!drag || !state || !didDragRef.current || !data) return
    const placeable = placeablesByName[drag.name]
    if (!placeable) return
    setPending((prev) => editAt(prev, placeable, moment, {x: state.x, y: state.y}))
  }

  const onSectorMarkerMouseDown = (
    sector: {id: string; name: string; center: {x: number; y: number}},
    e: ReactMouseEvent,
  ) => {
    e.stopPropagation()
    // Honor in-flight pending edit when computing the drag-start origin so
    // re-dragging a sector starts from its current visual position, not from
    // the stale Sanity center.
    const liveCenter = resolvedSectorCenters[sector.name] ?? sector.center
    sectorDragRef.current = {
      sectorId: sector.id,
      sectorName: sector.name,
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      startSlideX: liveCenter.x,
      startSlideY: liveCenter.y,
    }
    didDragRef.current = false
  }

  // --- Inspector data + handlers ------------------------------------------

  // Resolves a company OR entity (both share the inspector/override shape).
  const selectedCompany = selectedName ? (placeablesByName[selectedName] ?? null) : null
  const history: ResolvedOverride[] = useMemo(
    () =>
      selectedCompany
        ? resolveOverrides(selectedCompany.positionOverrides, pending, selectedCompany.name)
        : [],
    [selectedCompany, pending],
  )
  const activeOverride = useMemo(
    () => activeOverrideAt(history, moment),
    [history, moment],
  )
  const isActiveAtCurrentMoment = activeOverride?.moment === moment

  const onTogglePin = useCallback(
    (next: boolean) => {
      if (!selectedCompany) return
      // Pin acts at the current moment. If an override exists at exactly
      // `moment`, mutates it; otherwise creates a new override at `moment`
      // seeded with the active position so the pin "takes effect from this
      // moment forward" without moving the planet.
      setPending((prev) => editAt(prev, selectedCompany, moment, {pin: next}))
    },
    [selectedCompany, moment],
  )

  const onClearAtCurrentMoment = useCallback(() => {
    if (!selectedCompany) return
    setPending((prev) => clearAt(prev, selectedCompany, moment))
  }, [selectedCompany, moment])

  // --- Connection inspector data + handlers --------------------------------

  const selectedConnection = useMemo(
    () => resolvedConnections.find((c) => c.key === selectedConnectionKey) ?? null,
    [resolvedConnections, selectedConnectionKey],
  )

  const connTarget = useCallback(
    (c: ResolvedConnection) => ({key: c.key, isPendingNew: c.isPendingNew}),
    [],
  )

  const onConnectionStyle = useCallback(
    (next: ConnectionStyle) => {
      if (!selectedConnection) return
      setPending((prev) => editConnection(prev, connTarget(selectedConnection), {style: next}))
    },
    [selectedConnection, connTarget],
  )

  const onConnectionDescription = useCallback(
    (next: string) => {
      if (!selectedConnection) return
      setPending((prev) =>
        editConnection(prev, connTarget(selectedConnection), {description: next}),
      )
    },
    [selectedConnection, connTarget],
  )

  const onConnectionEndAtCurrentMoment = useCallback(() => {
    if (!selectedConnection) return
    setPending((prev) =>
      editConnection(prev, connTarget(selectedConnection), {
        endYear: yearOfMoment(moment),
      }),
    )
  }, [selectedConnection, moment, connTarget])

  const onConnectionReopen = useCallback(() => {
    if (!selectedConnection) return
    setPending((prev) => editConnection(prev, connTarget(selectedConnection), {endYear: null}))
  }, [selectedConnection, connTarget])

  const onConnectionDelete = useCallback(() => {
    if (!selectedConnection) return
    setPending((prev) => deleteConnection(prev, connTarget(selectedConnection)))
    setSelectedConnectionKey(null)
  }, [selectedConnection, connTarget])

  // --- Sector inspector data + handlers -----------------------------------

  const selectedSector = useMemo(
    () => (selectedSectorId ? (data?.sectors.find((s) => s.id === selectedSectorId) ?? null) : null),
    [data, selectedSectorId],
  )
  const sectorHistory: ResolvedSectorOverride[] = useMemo(
    () =>
      selectedSector
        ? resolveSectorOverrides(selectedSector.desktopCenterOverrides, pending, selectedSector.id)
        : [],
    [selectedSector, pending],
  )
  const activeSectorOverride = useMemo(
    () => activeSectorOverrideAt(sectorHistory, moment),
    [sectorHistory, moment],
  )
  const isSectorActiveAtCurrentMoment = activeSectorOverride?.moment === moment

  const onClearSectorAtCurrentMoment = useCallback(() => {
    if (!selectedSector) return
    setPending((prev) => clearSectorAt(prev, selectedSector, moment))
  }, [selectedSector, moment])

  // --- Connect-mode controls ----------------------------------------------

  const toggleConnectMode = useCallback(() => {
    setConnectMode((m) => !m)
    setConnectFrom(null)
    setConnectCursor(null)
  }, [])

  const cancelConnectSelection = useCallback(() => {
    setConnectFrom(null)
    setConnectCursor(null)
  }, [])

  // Escape cancels the current step of connect mode.
  useEffect(() => {
    if (!connectMode) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (connectFrom) {
          setConnectFrom(null)
          setConnectCursor(null)
        } else {
          setConnectMode(false)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [connectMode, connectFrom])

  // --- Save / Reset --------------------------------------------------------

  const onSave = useCallback(async () => {
    if (pendingCount(pending) === 0 || isSaving) return
    setIsSaving(true)
    setSaveError(null)
    try {
      await commitPending(client, pending)
      // Sanity listen will refetch and the editor re-renders from the new
      // authoritative state. Clear pending now that Sanity has the truth.
      setPending(EMPTY_PENDING)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSaving(false)
    }
  }, [client, pending, isSaving])

  const onReset = useCallback(() => {
    setPending(EMPTY_PENDING)
    setSaveError(null)
  }, [])

  // --- Zoom controls -------------------------------------------------------
  const applyZoom = useCallback((next: number) => {
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next))
    setZoom(z)
    setPan((p) => clampPan(p, z))
  }, [])
  const zoomIn = useCallback(() => applyZoom(zoom * ZOOM_STEP), [applyZoom, zoom])
  const zoomOut = useCallback(() => applyZoom(zoom / ZOOM_STEP), [applyZoom, zoom])
  const zoomReset = useCallback(() => {
    setZoom(1)
    setPan({x: 0, y: 0})
  }, [])

  // Warn the user before they navigate away with unsaved changes.
  useEffect(() => {
    if (pendingCount(pending) === 0) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [pending])

  // --- Render -------------------------------------------------------------

  // Human-readable list of every staged change for the Save bar (settings expand
  // per knob, so two slider tweaks read + count as two).
  const changes = useMemo(
    () =>
      describePending(pending, {
        settingsOverrides: data?.settingsOverrides ?? [],
        connectionLabel: (id) => {
          const c = resolvedConnections.find((rc) => rc.key === id)
          return c ? `${c.from} → ${c.to}` : 'connection'
        },
      }),
    [pending, data, resolvedConnections],
  )

  const loading = !error && (!data || !valuationsLoaded)

  return (
    <div
      ref={containerRef}
      onMouseMove={onContainerMouseMove}
      onMouseUp={onContainerMouseUp}
      onMouseLeave={onContainerMouseUp}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #1E0300 0%, #010C4C 51%, #070010 100%)',
        cursor: isPanning ? 'grabbing' : zoom > ZOOM_MIN ? 'grab' : 'default',
      }}
    >
      {data && !error && (
        <svg
          width="100%"
          height="100%"
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          style={{display: 'block'}}
          onMouseDown={onCanvasMouseDown}
        >
          {/* Connection lines beneath the planets. Endpoints follow live drag.
              Filtered to those active at the current moment so the canvas
              reflects the "map as of T" semantics. */}
          {activeConnections.map((conn) => {
            const a = nodeByName.get(conn.from)
            const b = nodeByName.get(conn.to)
            if (!a || !b) return null
            const ax = dragState?.name === a.name ? dragState.x : a.x
            const ay = dragState?.name === a.name ? dragState.y : a.y
            const bx = dragState?.name === b.name ? dragState.x : b.x
            const by = dragState?.name === b.name ? dragState.y : b.y
            const isSelected = selectedConnectionKey === conn.key
            const isHovered = hoveredConnectionKey === conn.key
            return (
              <ConnectionLine
                key={conn.key}
                ax={ax}
                ay={ay}
                bx={bx}
                by={by}
                connectionStyle={conn.style}
                slideUnitsPerPx={slideUnitsPerPx}
                interactive={!connectMode}
                isSelected={isSelected}
                isHovered={isHovered}
                onMouseEnter={() => setHoveredConnectionKey(conn.key)}
                onMouseLeave={() => setHoveredConnectionKey(null)}
                onClick={(e) => {
                  if (connectMode) return
                  e.stopPropagation()
                  setSelectedConnectionKey(conn.key)
                  setSelectedName(null)
                  setSelectedSectorId(null)
                }}
              />
            )
          })}

          {/* Rubber-band preview in connect mode: from the first-clicked
              planet's live coords to the cursor's slide-space position. */}
          {connectMode && connectFrom && connectCursor && (() => {
            const a = nodeByName.get(connectFrom)
            if (!a) return null
            const ax = dragState?.name === a.name ? dragState.x : a.x
            const ay = dragState?.name === a.name ? dragState.y : a.y
            return (
              <line
                x1={ax}
                y1={ay}
                x2={connectCursor.x}
                y2={connectCursor.y}
                stroke="rgba(255,224,102,0.8)"
                strokeWidth={2.5 * slideUnitsPerPx}
                strokeDasharray={`${10 * slideUnitsPerPx} ${8 * slideUnitsPerPx}`}
                strokeLinecap="round"
                pointerEvents="none"
              />
            )
          })()}

          {/* Hovered planet drawn last so its label/stroke sit on top. */}
          {[...nodes.filter((n) => n.name !== hovered), ...nodes.filter((n) => n.name === hovered)].map(
            (n) => {
              const renderNode =
                dragState?.name === n.name ? {...n, x: dragState.x, y: dragState.y} : n
              return (
                <Planet
                  key={n.name}
                  node={renderNode}
                  slideUnitsPerPx={slideUnitsPerPx}
                  isHovered={hovered === n.name}
                  onHoverChange={setHovered}
                  onClick={() => {}}
                  dimmed={false}
                  isEditMode
                  isSelected={selectedName === n.name}
                  onPlanetMouseDown={onPlanetMouseDown}
                  labelSizePx={knobs.labelSizePx}
                />
              )
            },
          )}

          {/* Sector marker = the labeled pill itself. Rendered AFTER planets
              so it's always readable on top. Drag the pill to move the
              sector center; the pill IS the click target. Width estimated
              from character count (Calibri-bold ≈ 0.55 em/char). Subtle
              hover state nudges border + background brightness so editors
              know the pill is interactive without it screaming. Hidden entirely
              when the "Sector labels" toggle is off. */}
          {showSectorLabels && data.sectors.map((s) => {
            const live = resolvedSectorCenters[s.name] ?? s.center
            const isDragging = sectorDragState?.sectorId === s.id
            const isSelected = selectedSectorId === s.id
            const isHovered = !isDragging && hoveredSectorId === s.id
            const fontSize = 15 * slideUnitsPerPx
            const textW = s.name.length * fontSize * 0.55
            const padX = 12 * slideUnitsPerPx
            const padY = 6 * slideUnitsPerPx
            const rectW = textW + padX * 2
            const rectH = fontSize + padY * 2
            const strokeAlpha = isDragging || isSelected ? 0.98 : isHovered ? 0.9 : 0.7
            const bgAlpha = isHovered || isDragging || isSelected ? 0.9 : 0.78
            const strokeWidth =
              (isDragging || isSelected ? 2.2 : isHovered ? 1.8 : 1.5) * slideUnitsPerPx
            return (
              <g
                key={`sector-${s.id}`}
                transform={`translate(${live.x}, ${live.y})`}
                style={{cursor: 'grab'}}
                onMouseDown={(e) => onSectorMarkerMouseDown(s, e)}
                onMouseEnter={() => setHoveredSectorId(s.id)}
                onMouseLeave={() => setHoveredSectorId(null)}
              >
                <rect
                  x={-rectW / 2}
                  y={-rectH / 2}
                  width={rectW}
                  height={rectH}
                  rx={5 * slideUnitsPerPx}
                  fill={`rgba(7,14,32,${bgAlpha})`}
                  stroke={`rgba(255,224,102,${strokeAlpha})`}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${6 * slideUnitsPerPx} ${5 * slideUnitsPerPx}`}
                  style={{transition: 'fill 140ms ease, stroke 140ms ease, stroke-width 140ms ease'}}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  pointerEvents="none"
                  style={{
                    fontFamily: 'Calibri, system-ui, sans-serif',
                    fontWeight: 700,
                    fontSize,
                    fill: isHovered ? '#fff5b8' : 'rgba(255,224,102,0.95)',
                    letterSpacing: 0.3,
                    transition: 'fill 140ms ease',
                  }}
                >
                  {s.name}
                </text>
              </g>
            )
          })}
        </svg>
      )}

      {/* Left control panel (top-left): one connected, collapsible card. A master
          header collapses the whole panel to get it out of the way; inside, each
          section (Map at / Layout / Connections) is an independent accordion so
          the tall slider list can be tucked away without hiding the year picker. */}
      {data && !error && (
        <Card
          radius={3}
          shadow={2}
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            width: 280,
            maxHeight: 'calc(100% - 24px)',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(7,14,32,0.92)',
            overflow: 'hidden',
          }}
        >
          <Flex
            align="center"
            justify="space-between"
            onClick={() => setControlsOpen((o) => !o)}
            style={{
              cursor: 'pointer',
              userSelect: 'none',
              padding: '10px 12px',
              borderBottom: controlsOpen ? '1px solid rgba(255,255,255,0.12)' : undefined,
              flex: '0 0 auto',
            }}
          >
            <Text
              size={1}
              weight="semibold"
              style={{color: '#ffe066', letterSpacing: 1, textTransform: 'uppercase'}}
            >
              Map Controls
            </Text>
            <Text
              size={2}
              style={{
                color: 'rgba(255,255,255,0.6)',
                display: 'inline-flex',
                transition: 'transform 140ms ease',
                transform: controlsOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              }}
            >
              <ChevronDownIcon />
            </Text>
          </Flex>
          {controlsOpen && (
            <Box style={{overflowY: 'auto', flex: '1 1 auto'}}>
              <CollapsibleSection title="Map at" first>
                <TimeSelector
                  bare
                  moment={moment}
                  onChange={setMoment}
                  showSectorLabels={showSectorLabels}
                  onToggleSectorLabels={setShowSectorLabels}
                />
              </CollapsibleSection>
              <CollapsibleSection title="Layout">
                <LayoutKnobs
                  bare
                  packingDensity={knobs.packingDensity}
                  collidePadding={knobs.collidePadding}
                  labelSizePx={knobs.labelSizePx}
                  connectionPull={knobs.connectionPull}
                  entityRadius={knobs.entityRadius}
                  sizeSpacing={knobs.sizeSpacing}
                  sectorPull={knobs.sectorPull}
                  repulsion={knobs.repulsion}
                  setPackingDensity={setKnob('packingDensity')}
                  setCollidePadding={setKnob('collidePadding')}
                  setLabelSizePx={setKnob('labelSizePx')}
                  setConnectionPull={setKnob('connectionPull')}
                  setEntityRadius={setKnob('entityRadius')}
                  setSizeSpacing={setKnob('sizeSpacing')}
                  setSectorPull={setKnob('sectorPull')}
                  setRepulsion={setKnob('repulsion')}
                  anchorDiam={anchorDiam}
                />
              </CollapsibleSection>
              <CollapsibleSection title="Connections">
                <ConnectModePanel
                  bare
                  connectMode={connectMode}
                  connectFrom={connectFrom}
                  onToggle={toggleConnectMode}
                  onCancel={cancelConnectSelection}
                />
              </CollapsibleSection>
            </Box>
          )}
        </Card>
      )}

      {/* Staged-changes bar (top-right). */}
      {data && !error && (
        <SaveBar
          changes={changes}
          isSaving={isSaving}
          saveError={saveError}
          onSave={onSave}
          onReset={onReset}
        />
      )}

      {/* Right-side inspectors. Only one shows at a time. Precedence:
          connection > sector > planet — the most recently-selected target wins
          (the click handlers set their own and clear the other two). */}
      {selectedConnection ? (
        <ConnectionInspector
          connection={selectedConnection}
          currentMoment={moment}
          onStyleChange={onConnectionStyle}
          onDescriptionChange={onConnectionDescription}
          onEndAtCurrentMoment={onConnectionEndAtCurrentMoment}
          onReopen={onConnectionReopen}
          onDelete={onConnectionDelete}
          onClose={() => setSelectedConnectionKey(null)}
        />
      ) : selectedSector ? (
        <SectorInspector
          selectedSector={selectedSector}
          history={sectorHistory}
          activeOverride={activeSectorOverride}
          isActiveAtCurrentMoment={isSectorActiveAtCurrentMoment}
          currentMoment={moment}
          onClearAtCurrentMoment={onClearSectorAtCurrentMoment}
          onClose={() => setSelectedSectorId(null)}
        />
      ) : (
        <PlanetInspector
          selectedCompany={selectedCompany}
          history={history}
          activeOverride={activeOverride}
          isActiveAtCurrentMoment={isActiveAtCurrentMoment}
          currentMoment={moment}
          onTogglePin={onTogglePin}
          onClearAtCurrentMoment={onClearAtCurrentMoment}
          onClose={() => setSelectedName(null)}
        />
      )}

      {/* Zoom controls (bottom-right). +/- step the zoom; the percentage button
          resets to fit. Pan by dragging the empty canvas once zoomed in. */}
      {data && !error && (
        <Card
          padding={1}
          radius={2}
          shadow={1}
          style={{position: 'absolute', bottom: 12, right: 12, background: 'rgba(7,14,32,0.92)'}}
        >
          <Stack space={1}>
            <Button
              mode="bleed"
              icon={AddIcon}
              padding={2}
              fontSize={1}
              onClick={zoomIn}
              disabled={zoom >= ZOOM_MAX}
              title="Zoom in"
            />
            <Button
              mode="bleed"
              text={`${Math.round(zoom * 100)}%`}
              padding={2}
              fontSize={0}
              onClick={zoomReset}
              disabled={zoom === ZOOM_MIN && pan.x === 0 && pan.y === 0}
              title="Reset zoom"
            />
            <Button
              mode="bleed"
              icon={RemoveIcon}
              padding={2}
              fontSize={1}
              onClick={zoomOut}
              disabled={zoom <= ZOOM_MIN}
              title="Zoom out"
            />
          </Stack>
        </Card>
      )}

      {loading && (
        <Flex align="center" justify="center" style={{position: 'absolute', inset: 0}}>
          <Spinner muted />
        </Flex>
      )}
      {error && (
        <Card padding={4} tone="critical" style={{position: 'absolute', top: 12, left: 12}}>
          <Text>Failed to load map data: {error}</Text>
        </Card>
      )}
    </div>
  )
}
