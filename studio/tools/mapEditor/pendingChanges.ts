// Staged-changes state for the Map Editor. Every drag, pin toggle, or override
// clear pushes a primitive op onto `PendingState.positions`; Save batch-commits
// them through `patches.ts`; Reset discards. The hook (MapEditorTool) resolves
// the canvas's visible positions by applying these ops on top of Sanity data.
//
// Forward-propagation semantics live in `activeOverrideAt`: at viewed moment T,
// a planet renders at the override with the LARGEST `startDate ≤ T`. See
// ARCHITECTURE.md → Time-scoping for the full spec.

import {type Moment, activeAt, formatMomentYear, sanityDateToMoment, UNDATED, yearWindowsActiveAt} from './moment'
import type {EditorCompany, EditorConnection, RawSettingsOverride} from './sanityMapData'
import {LAYOUT_KNOBS_DEFAULTS, type LayoutKnobsValues} from './LayoutKnobs'

type RawOverride = EditorCompany['positionOverrides'][number]
export type ConnectionStyle = 'solid' | 'dotted'

// --- Op types ------------------------------------------------------------

/**
 * Each pending op maps 1:1 to a Sanity patch fired on Save. Kept as plain data
 * (no closures) so the reducer can dedupe/coalesce edits in place.
 */
export type PendingPositionOp =
  | {
      kind: 'createOverride'
      companyId: string
      companyName: string
      tempKey: string
      x: number
      y: number
      pin: boolean
      moment: Moment
    }
  | {
      kind: 'updateOverride'
      companyId: string
      companyName: string
      windowKey: string // Sanity _key
      x?: number
      y?: number
      pin?: boolean
    }
  | {
      kind: 'deleteOverride'
      companyId: string
      companyName: string
      windowKey: string // Sanity _key
    }

/**
 * Connection authoring. `createConnection` carries the from/to company IDs
 * (resolved at click-time from `data.companiesByName`) plus a tempKey used as
 * the doc's stable identity until Save assigns a real `_id`. Updates carry
 * partial fields; `endYear: null` is the sentinel for "unset / reopen."
 */
export type PendingConnectionOp =
  | {
      kind: 'createConnection'
      tempKey: string
      from: string
      to: string
      fromId: string
      toId: string
      style: ConnectionStyle
      description: string
      startYear: number
    }
  | {
      kind: 'updateConnection'
      connectionId: string
      style?: ConnectionStyle
      description?: string
      /** number = set, null = unset (reopen), undefined = leave alone. */
      endYear?: number | null
    }
  | {
      kind: 'deleteConnection'
      connectionId: string
    }

/**
 * Sector center authoring — time-scoped via `desktop_center_overrides[]` on
 * the Sector doc (forward-propagation, same model as Company position_overrides).
 * v1 = desktop layout only; mobile_center is left to Structure for now.
 *
 * Each op carries the sector's _id (for the patch) and name (for labels).
 * Resolution at moment T: largest `start_date ≤ T` wins among overrides; if
 * none qualify, the Sector's scalar baseline `center` is the fallback.
 */
export type PendingSectorOp =
  | {
      kind: 'createSectorOverride'
      sectorId: string
      sectorName: string
      tempKey: string
      x: number
      y: number
      moment: Moment
    }
  | {
      kind: 'updateSectorOverride'
      sectorId: string
      sectorName: string
      windowKey: string
      x?: number
      y?: number
    }
  | {
      kind: 'deleteSectorOverride'
      sectorId: string
      sectorName: string
      windowKey: string
    }

export type PendingState = {
  positions: PendingPositionOp[]
  connections: PendingConnectionOp[]
  sectors: PendingSectorOp[]
  // Pending time-scoped layout-knob edits (forward-propagated, same model as
  // sector centers). Each op commits to the mapSettings singleton's overrides[].
  settings: PendingSettingsOp[]
}

export const EMPTY_PENDING: PendingState = {
  positions: [],
  connections: [],
  sectors: [],
  settings: [],
}

export function pendingCount(state: PendingState): number {
  return (
    state.positions.length +
    state.connections.length +
    state.sectors.length +
    state.settings.length
  )
}

// --- Resolution ----------------------------------------------------------

/**
 * The shape the canvas/inspector consumes: every override that *currently* exists
 * for a planet, with Sanity values + pending edits applied. Sorted by moment.
 */
export type ResolvedOverride = {
  key: string
  x: number
  y: number
  pin: boolean
  moment: Moment
  origin: 'sanity' | 'pending-new' | 'sanity-edited' | 'sanity-deleted-pending'
}

/**
 * Build the resolved overrides for a planet by applying pending ops on top of
 * Sanity's current state. Result excludes deleted overrides and is sorted
 * ascending by moment. Overrides without a `start_date` are kept and treated
 * as `UNDATED` (`''`) — they forward-propagate from the beginning of time and
 * serve as the always-active fallback until a dated override takes over. This
 * is what lets pre-3c data (no dates yet) keep rendering on every map.
 */
export function resolveOverrides(
  sanityOverrides: ReadonlyArray<RawOverride>,
  pending: PendingState,
  companyName: string,
): ResolvedOverride[] {
  const opsForCompany = pending.positions.filter((p) => p.companyName === companyName)
  const deleted = new Set<string>()
  const edits = new Map<string, {x?: number; y?: number; pin?: boolean}>()
  for (const op of opsForCompany) {
    if (op.kind === 'deleteOverride') deleted.add(op.windowKey)
    else if (op.kind === 'updateOverride') {
      const prior = edits.get(op.windowKey) ?? {}
      edits.set(op.windowKey, {
        x: op.x ?? prior.x,
        y: op.y ?? prior.y,
        pin: op.pin ?? prior.pin,
      })
    }
  }
  const resolved: ResolvedOverride[] = []
  for (const so of sanityOverrides) {
    if (deleted.has(so._key)) continue
    const moment = sanityDateToMoment(so.start_date) ?? UNDATED
    const edit = edits.get(so._key)
    resolved.push({
      key: so._key,
      x: edit?.x ?? so.x,
      y: edit?.y ?? so.y,
      pin: edit?.pin ?? !!so.pin,
      moment,
      origin: edit ? 'sanity-edited' : 'sanity',
    })
  }
  for (const op of opsForCompany) {
    if (op.kind === 'createOverride') {
      resolved.push({
        key: op.tempKey,
        x: op.x,
        y: op.y,
        pin: op.pin,
        moment: op.moment,
        origin: 'pending-new',
      })
    }
  }
  resolved.sort((a, b) => (a.moment < b.moment ? -1 : a.moment > b.moment ? 1 : 0))
  return resolved
}

/**
 * Forward-propagation lookup: the override with the largest `moment ≤ at`.
 * Returns null if no override qualifies (planet doesn't yet exist at this moment).
 */
export function activeOverrideAt(
  resolved: ReadonlyArray<ResolvedOverride>,
  at: Moment,
): ResolvedOverride | null {
  return activeAt(resolved, at, (r) => r.moment)
}

// --- Edit operations ----------------------------------------------------

const newTempKey = (): string =>
  `temp_${
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12)
  }`

type EditPatch = {x?: number; y?: number; pin?: boolean}

/**
 * Stage a position/pin edit at the given moment for a planet. If an override
 * already exists at exactly that moment, the op coalesces with it (no churn).
 * If none exists, a new override is created seeded with the active override's
 * position+pin so unchanged fields keep their forward-propagated values.
 */
export function editAt(
  state: PendingState,
  company: {id: string; name: string; positionOverrides: ReadonlyArray<RawOverride>},
  at: Moment,
  patch: EditPatch,
): PendingState {
  const resolved = resolveOverrides(company.positionOverrides, state, company.name)
  const exact = resolved.find((r) => r.moment === at)

  if (exact) {
    if (exact.origin === 'pending-new') {
      return {
        ...state,
        positions: state.positions.map((op) =>
          op.kind === 'createOverride' && op.tempKey === exact.key
            ? {
                ...op,
                x: patch.x ?? op.x,
                y: patch.y ?? op.y,
                pin: patch.pin ?? op.pin,
              }
            : op,
        ),
      }
    }
    // Sanity-backed: merge into a single updateOverride op for the windowKey.
    const existingIdx = state.positions.findIndex(
      (op) => op.kind === 'updateOverride' && op.windowKey === exact.key,
    )
    if (existingIdx >= 0) {
      const existing = state.positions[existingIdx] as Extract<
        PendingPositionOp,
        {kind: 'updateOverride'}
      >
      const next = [...state.positions]
      next[existingIdx] = {
        ...existing,
        x: patch.x ?? existing.x,
        y: patch.y ?? existing.y,
        pin: patch.pin ?? existing.pin,
      }
      return {...state, positions: next}
    }
    return {
      ...state,
      positions: [
        ...state.positions,
        {
          kind: 'updateOverride',
          companyId: company.id,
          companyName: company.name,
          windowKey: exact.key,
          ...patch,
        },
      ],
    }
  }

  // No exact match — create a new override seeded from the active (if any).
  const active = activeOverrideAt(resolved, at)
  return {
    ...state,
    positions: [
      ...state.positions,
      {
        kind: 'createOverride',
        companyId: company.id,
        companyName: company.name,
        tempKey: newTempKey(),
        x: patch.x ?? active?.x ?? 0,
        y: patch.y ?? active?.y ?? 0,
        pin: patch.pin ?? active?.pin ?? false,
        moment: at,
      },
    ],
  }
}

/**
 * Clear an override at exactly the given moment (no-op if none). For pending
 * creates: drops the create op. For Sanity entries: adds a delete op and
 * strips any pending edits for that key.
 */
export function clearAt(
  state: PendingState,
  company: {id: string; name: string; positionOverrides: ReadonlyArray<RawOverride>},
  at: Moment,
): PendingState {
  const resolved = resolveOverrides(company.positionOverrides, state, company.name)
  const exact = resolved.find((r) => r.moment === at)
  if (!exact) return state

  if (exact.origin === 'pending-new') {
    return {
      ...state,
      positions: state.positions.filter(
        (op) => !(op.kind === 'createOverride' && op.tempKey === exact.key),
      ),
    }
  }
  return {
    ...state,
    positions: [
      ...state.positions.filter(
        (op) =>
          !(
            (op.kind === 'updateOverride' && op.windowKey === exact.key) ||
            (op.kind === 'deleteOverride' && op.windowKey === exact.key)
          ),
      ),
      {
        kind: 'deleteOverride',
        companyId: company.id,
        companyName: company.name,
        windowKey: exact.key,
      },
    ],
  }
}

// --- Connection resolution + ops ----------------------------------------

/**
 * The shape the canvas/connection-inspector consumes: every connection that
 * currently exists (Sanity + pending creates − pending deletes), with pending
 * edits applied. Each entry carries enough info to render and to identify
 * itself (Sanity `_id` for existing, `tempKey` for pending creates).
 */
export type ResolvedConnection = {
  key: string
  isPendingNew: boolean
  from: string
  to: string
  fromId: string
  toId: string
  style: ConnectionStyle
  description: string
  startYear: number | undefined
  endYear: number | undefined
}

export function resolveConnections(
  sanityConnections: ReadonlyArray<EditorConnection>,
  pending: PendingState,
): ResolvedConnection[] {
  const deleted = new Set<string>()
  const edits = new Map<
    string,
    {style?: ConnectionStyle; description?: string; endYear?: number | null}
  >()
  for (const op of pending.connections) {
    if (op.kind === 'deleteConnection') deleted.add(op.connectionId)
    else if (op.kind === 'updateConnection') {
      const prior = edits.get(op.connectionId) ?? {}
      edits.set(op.connectionId, {
        style: op.style ?? prior.style,
        description: op.description ?? prior.description,
        // For endYear: undefined = inherit prior; null/number = override.
        endYear: op.endYear === undefined ? prior.endYear : op.endYear,
      })
    }
  }
  const resolved: ResolvedConnection[] = []
  for (const c of sanityConnections) {
    if (deleted.has(c.id)) continue
    const edit = edits.get(c.id)
    const endOverride = edit?.endYear
    resolved.push({
      key: c.id,
      isPendingNew: false,
      from: c.from,
      to: c.to,
      fromId: c.fromId,
      toId: c.toId,
      style: edit?.style ?? c.style,
      description: edit?.description ?? c.description ?? '',
      startYear: c.start_year,
      endYear: endOverride === null ? undefined : (endOverride ?? c.end_year),
    })
  }
  for (const op of pending.connections) {
    if (op.kind === 'createConnection') {
      resolved.push({
        key: op.tempKey,
        isPendingNew: true,
        from: op.from,
        to: op.to,
        fromId: op.fromId,
        toId: op.toId,
        style: op.style,
        description: op.description,
        startYear: op.startYear,
        endYear: undefined,
      })
    }
  }
  return resolved
}

/**
 * A connection is active at moment T if T's YEAR falls in its [start_year,
 * end_year] range. Absent start = "from the beginning"; absent end = "still
 * active" (also the transitional always-active behavior for undated entries).
 */
export function connectionActiveAt(c: ResolvedConnection, at: Moment): boolean {
  return yearWindowsActiveAt([{start_year: c.startYear, end_year: c.endYear}], at)
}

const newConnectionTempKey = (): string =>
  `tempConn_${
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12)
  }`

/** Stage a new connection at the current moment. Default style: solid. */
export function createConnection(
  state: PendingState,
  args: {
    from: string
    to: string
    fromId: string
    toId: string
    style?: ConnectionStyle
    description?: string
    startYear: number
  },
): PendingState {
  return {
    ...state,
    connections: [
      ...state.connections,
      {
        kind: 'createConnection',
        tempKey: newConnectionTempKey(),
        from: args.from,
        to: args.to,
        fromId: args.fromId,
        toId: args.toId,
        style: args.style ?? 'solid',
        description: args.description ?? '',
        startYear: args.startYear,
      },
    ],
  }
}

/**
 * Stage an edit on a connection (Sanity-existing or pending-new). Partial
 * fields; pass `endYear: null` to clear it (reopen). Coalesces with any prior
 * pending edit on the same target.
 */
export function editConnection(
  state: PendingState,
  target: {key: string; isPendingNew: boolean},
  patch: {style?: ConnectionStyle; description?: string; endYear?: number | null},
): PendingState {
  if (target.isPendingNew) {
    return {
      ...state,
      connections: state.connections.map((op) =>
        op.kind === 'createConnection' && op.tempKey === target.key
          ? {
              ...op,
              style: patch.style ?? op.style,
              description: patch.description ?? op.description,
            }
          : op,
      ),
    }
  }
  const idx = state.connections.findIndex(
    (op) => op.kind === 'updateConnection' && op.connectionId === target.key,
  )
  if (idx >= 0) {
    const existing = state.connections[idx] as Extract<
      PendingConnectionOp,
      {kind: 'updateConnection'}
    >
    const next = [...state.connections]
    next[idx] = {
      ...existing,
      style: patch.style ?? existing.style,
      description: patch.description ?? existing.description,
      endYear: patch.endYear === undefined ? existing.endYear : patch.endYear,
    }
    return {...state, connections: next}
  }
  return {
    ...state,
    connections: [
      ...state.connections,
      {kind: 'updateConnection', connectionId: target.key, ...patch},
    ],
  }
}

/**
 * Stage a connection deletion. For pending creates, just drops the create op
 * (nothing was ever committed). For Sanity-existing entries, adds a delete op
 * and strips any pending edits for the same id.
 */
export function deleteConnection(
  state: PendingState,
  target: {key: string; isPendingNew: boolean},
): PendingState {
  if (target.isPendingNew) {
    return {
      ...state,
      connections: state.connections.filter(
        (op) => !(op.kind === 'createConnection' && op.tempKey === target.key),
      ),
    }
  }
  return {
    ...state,
    connections: [
      ...state.connections.filter(
        (op) =>
          !(
            (op.kind === 'updateConnection' && op.connectionId === target.key) ||
            (op.kind === 'deleteConnection' && op.connectionId === target.key)
          ),
      ),
      {kind: 'deleteConnection', connectionId: target.key},
    ],
  }
}

// --- Sector center resolution + ops -------------------------------------

type RawSectorCenterOverride = {_key: string; x: number; y: number; start_date?: string}

export type ResolvedSectorOverride = {
  key: string
  x: number
  y: number
  moment: Moment
  origin: 'sanity' | 'pending-new' | 'sanity-edited'
}

/**
 * Build the resolved override list for a sector by applying pending ops on top
 * of Sanity's `desktop_center_overrides[]`. Same shape as planet position
 * resolution — undated entries are kept as `UNDATED` (always-active baseline,
 * lowest precedence) until they get a stamped `start_date`.
 */
export function resolveSectorOverrides(
  sanityOverrides: ReadonlyArray<RawSectorCenterOverride>,
  pending: PendingState,
  sectorId: string,
): ResolvedSectorOverride[] {
  const opsForSector = pending.sectors.filter((op) => op.sectorId === sectorId)
  const deleted = new Set<string>()
  const edits = new Map<string, {x?: number; y?: number}>()
  for (const op of opsForSector) {
    if (op.kind === 'deleteSectorOverride') deleted.add(op.windowKey)
    else if (op.kind === 'updateSectorOverride') {
      const prior = edits.get(op.windowKey) ?? {}
      edits.set(op.windowKey, {x: op.x ?? prior.x, y: op.y ?? prior.y})
    }
  }
  const resolved: ResolvedSectorOverride[] = []
  for (const so of sanityOverrides) {
    if (deleted.has(so._key)) continue
    const moment = sanityDateToMoment(so.start_date) ?? UNDATED
    const edit = edits.get(so._key)
    resolved.push({
      key: so._key,
      x: edit?.x ?? so.x,
      y: edit?.y ?? so.y,
      moment,
      origin: edit ? 'sanity-edited' : 'sanity',
    })
  }
  for (const op of opsForSector) {
    if (op.kind === 'createSectorOverride') {
      resolved.push({
        key: op.tempKey,
        x: op.x,
        y: op.y,
        moment: op.moment,
        origin: 'pending-new',
      })
    }
  }
  resolved.sort((a, b) => (a.moment < b.moment ? -1 : a.moment > b.moment ? 1 : 0))
  return resolved
}

/**
 * Forward-propagation lookup for sector overrides: the override with the
 * largest `moment ≤ at`. Returns null if no override qualifies — callers fall
 * back to the Sector's baseline scalar `center`.
 */
export function activeSectorOverrideAt(
  resolved: ReadonlyArray<ResolvedSectorOverride>,
  at: Moment,
): ResolvedSectorOverride | null {
  return activeAt(resolved, at, (r) => r.moment)
}

/**
 * Effective sector center at a moment: active override if any, else the
 * baseline scalar. This is the value the editor's marker renders at AND the
 * `center` every `LayoutInput` for the sector inherits, so unparked planets
 * track the sector live.
 */
export function effectiveSectorCenterAt(
  sector: {center: {x: number; y: number}; desktopCenterOverrides: ReadonlyArray<RawSectorCenterOverride>},
  pending: PendingState,
  sectorId: string,
  at: Moment,
): {x: number; y: number} {
  const resolved = resolveSectorOverrides(sector.desktopCenterOverrides, pending, sectorId)
  const active = activeSectorOverrideAt(resolved, at)
  return active ? {x: active.x, y: active.y} : sector.center
}

const newSectorTempKey = (): string =>
  `tempSect_${
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12)
  }`

/**
 * Stage a sector-center edit at the given moment. Coalesces — if an override
 * already exists at exactly that moment (Sanity-existing or pending-new), the
 * x/y replace the prior values. Otherwise a new override is created at moment T.
 */
export function editSectorAt(
  state: PendingState,
  sector: {id: string; name: string; desktopCenterOverrides: ReadonlyArray<RawSectorCenterOverride>},
  at: Moment,
  x: number,
  y: number,
): PendingState {
  const resolved = resolveSectorOverrides(sector.desktopCenterOverrides, state, sector.id)
  const exact = resolved.find((r) => r.moment === at)
  const rx = Math.round(x)
  const ry = Math.round(y)

  if (exact) {
    if (exact.origin === 'pending-new') {
      return {
        ...state,
        sectors: state.sectors.map((op) =>
          op.kind === 'createSectorOverride' && op.tempKey === exact.key
            ? {...op, x: rx, y: ry}
            : op,
        ),
      }
    }
    const idx = state.sectors.findIndex(
      (op) => op.kind === 'updateSectorOverride' && op.windowKey === exact.key,
    )
    if (idx >= 0) {
      const next = [...state.sectors]
      next[idx] = {...next[idx], x: rx, y: ry} as PendingSectorOp
      return {...state, sectors: next}
    }
    return {
      ...state,
      sectors: [
        ...state.sectors,
        {
          kind: 'updateSectorOverride',
          sectorId: sector.id,
          sectorName: sector.name,
          windowKey: exact.key,
          x: rx,
          y: ry,
        },
      ],
    }
  }

  return {
    ...state,
    sectors: [
      ...state.sectors,
      {
        kind: 'createSectorOverride',
        sectorId: sector.id,
        sectorName: sector.name,
        tempKey: newSectorTempKey(),
        x: rx,
        y: ry,
        moment: at,
      },
    ],
  }
}

/**
 * Clear the sector override at exactly the given moment. No-op if none exists.
 * For pending-new overrides: drops the create op. For Sanity entries: adds a
 * delete op and strips any pending edits for the same key.
 */
export function clearSectorAt(
  state: PendingState,
  sector: {id: string; name: string; desktopCenterOverrides: ReadonlyArray<RawSectorCenterOverride>},
  at: Moment,
): PendingState {
  const resolved = resolveSectorOverrides(sector.desktopCenterOverrides, state, sector.id)
  const exact = resolved.find((r) => r.moment === at)
  if (!exact) return state

  if (exact.origin === 'pending-new') {
    return {
      ...state,
      sectors: state.sectors.filter(
        (op) => !(op.kind === 'createSectorOverride' && op.tempKey === exact.key),
      ),
    }
  }
  return {
    ...state,
    sectors: [
      ...state.sectors.filter(
        (op) =>
          !(
            (op.kind === 'updateSectorOverride' && op.windowKey === exact.key) ||
            (op.kind === 'deleteSectorOverride' && op.windowKey === exact.key)
          ),
      ),
      {
        kind: 'deleteSectorOverride',
        sectorId: sector.id,
        sectorName: sector.name,
        windowKey: exact.key,
      },
    ],
  }
}

// --- Layout-knob (map settings) resolution + ops ------------------------
//
// Knob values are time-scoped on the mapSettings singleton's `overrides[]`, with
// the same forward-propagation model as positions/sector-centers: at moment T,
// the override with the largest start_date ≤ T wins; if none qualify, the editor
// falls back to LAYOUT_KNOBS_DEFAULTS. Editing a knob at moment T mutates the
// override authored exactly at T, or creates a new one seeded from the active
// (forward-propagated) values so the other knobs keep their inherited values.

export type PendingSettingsOp =
  | {kind: 'createSettingsOverride'; tempKey: string; values: LayoutKnobsValues; moment: Moment}
  | {kind: 'updateSettingsOverride'; windowKey: string; values: Partial<LayoutKnobsValues>}

export type ResolvedSettingsOverride = {
  key: string
  values: LayoutKnobsValues
  moment: Moment
  origin: 'sanity' | 'pending-new' | 'sanity-edited'
}

/** Fill a raw (snake_case, possibly-partial) override into full knob values. */
function rawSettingsValues(o: RawSettingsOverride): LayoutKnobsValues {
  return {
    packingDensity: o.packing_density ?? LAYOUT_KNOBS_DEFAULTS.packingDensity,
    collidePadding: o.collide_padding ?? LAYOUT_KNOBS_DEFAULTS.collidePadding,
    labelSizePx: o.label_size_px ?? LAYOUT_KNOBS_DEFAULTS.labelSizePx,
    connectionPull: o.connection_pull ?? LAYOUT_KNOBS_DEFAULTS.connectionPull,
    entityRadius: o.entity_radius ?? LAYOUT_KNOBS_DEFAULTS.entityRadius,
    sizeSpacing: o.size_spacing ?? LAYOUT_KNOBS_DEFAULTS.sizeSpacing,
    sectorPull: o.sector_pull ?? LAYOUT_KNOBS_DEFAULTS.sectorPull,
    repulsion: o.repulsion ?? LAYOUT_KNOBS_DEFAULTS.repulsion,
  }
}

export function resolveSettingsOverrides(
  sanityOverrides: ReadonlyArray<RawSettingsOverride>,
  pending: PendingState,
): ResolvedSettingsOverride[] {
  const edits = new Map<string, Partial<LayoutKnobsValues>>()
  for (const op of pending.settings) {
    if (op.kind === 'updateSettingsOverride') {
      edits.set(op.windowKey, {...(edits.get(op.windowKey) ?? {}), ...op.values})
    }
  }
  const resolved: ResolvedSettingsOverride[] = []
  for (const so of sanityOverrides) {
    const moment = sanityDateToMoment(so.start_date) ?? UNDATED
    const edit = edits.get(so._key)
    const base = rawSettingsValues(so)
    resolved.push({
      key: so._key,
      values: edit ? {...base, ...edit} : base,
      moment,
      origin: edit ? 'sanity-edited' : 'sanity',
    })
  }
  for (const op of pending.settings) {
    if (op.kind === 'createSettingsOverride') {
      resolved.push({key: op.tempKey, values: op.values, moment: op.moment, origin: 'pending-new'})
    }
  }
  resolved.sort((a, b) => (a.moment < b.moment ? -1 : a.moment > b.moment ? 1 : 0))
  return resolved
}

/** Forward-propagation lookup: the override with the largest `moment ≤ at`. */
export function activeSettingsOverrideAt(
  resolved: ReadonlyArray<ResolvedSettingsOverride>,
  at: Moment,
): ResolvedSettingsOverride | null {
  return activeAt(resolved, at, (r) => r.moment)
}

const newSettingsTempKey = (): string =>
  `tempSet_${
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12)
  }`

/**
 * Stage a knob edit at moment T. Coalesces with an existing override at exactly
 * T (pending-new or Sanity-backed); otherwise creates a new override seeded from
 * the active forward-propagated values so untouched knobs keep their values.
 */
export function editSettingsAt(
  state: PendingState,
  sanityOverrides: ReadonlyArray<RawSettingsOverride>,
  at: Moment,
  patch: Partial<LayoutKnobsValues>,
): PendingState {
  const resolved = resolveSettingsOverrides(sanityOverrides, state)
  const exact = resolved.find((r) => r.moment === at)

  if (exact) {
    if (exact.origin === 'pending-new') {
      return {
        ...state,
        settings: state.settings.map((op) =>
          op.kind === 'createSettingsOverride' && op.tempKey === exact.key
            ? {...op, values: {...op.values, ...patch}}
            : op,
        ),
      }
    }
    const idx = state.settings.findIndex(
      (op) => op.kind === 'updateSettingsOverride' && op.windowKey === exact.key,
    )
    if (idx >= 0) {
      const existing = state.settings[idx] as Extract<
        PendingSettingsOp,
        {kind: 'updateSettingsOverride'}
      >
      const next = [...state.settings]
      next[idx] = {...existing, values: {...existing.values, ...patch}}
      return {...state, settings: next}
    }
    return {
      ...state,
      settings: [...state.settings, {kind: 'updateSettingsOverride', windowKey: exact.key, values: patch}],
    }
  }

  const active = activeSettingsOverrideAt(resolved, at)
  const base = active?.values ?? LAYOUT_KNOBS_DEFAULTS
  return {
    ...state,
    settings: [
      ...state.settings,
      {kind: 'createSettingsOverride', tempKey: newSettingsTempKey(), values: {...base, ...patch}, moment: at},
    ],
  }
}

// --- Human-readable change list -----------------------------------------
//
// Expands the staged ops into one line per individual change for the Save bar.
// Settings ops expand PER KNOB (so adjusting two sliders reads as two lines),
// diffing each create override against the saved forward-propagated baseline so
// only the knobs the editor actually touched are listed.

const KNOB_LABELS: Record<keyof LayoutKnobsValues, string> = {
  packingDensity: 'Planet size',
  collidePadding: 'Spacing',
  labelSizePx: 'Label size',
  connectionPull: 'Connection pull',
  entityRadius: 'Entity radius',
  sizeSpacing: 'Size spacing',
  sectorPull: 'Sector pull',
  repulsion: 'Spread',
}
const KNOB_KEYS = Object.keys(KNOB_LABELS) as (keyof LayoutKnobsValues)[]

function formatKnobValue(key: keyof LayoutKnobsValues, val: number): string {
  if (key === 'sizeSpacing') return `${Math.round(val * 100)}%`
  if (key === 'labelSizePx') return `${val}px`
  if (key === 'sectorPull') return val.toFixed(3)
  if (key === 'packingDensity' || key === 'connectionPull') return val.toFixed(2)
  return `${Math.round(val)}`
}

const momentSuffix = (m: Moment): string => (m === UNDATED ? '' : ` · ${formatMomentYear(m)}`)

export type DescribePendingCtx = {
  settingsOverrides: ReadonlyArray<RawSettingsOverride>
  /** id (sanity _id or pending tempKey) → "From → To" for connection ops. */
  connectionLabel: (id: string) => string
}

export function describePending(state: PendingState, ctx: DescribePendingCtx): string[] {
  const out: string[] = []

  for (const op of state.positions) {
    if (op.kind === 'deleteOverride') out.push(`Cleared ${op.companyName}'s position`)
    else if (op.kind === 'updateOverride' && op.x === undefined && op.y === undefined) {
      out.push(`${op.pin ? 'Pinned' : 'Unpinned'} ${op.companyName}`)
    } else out.push(`Moved ${op.companyName}`)
  }

  for (const op of state.connections) {
    if (op.kind === 'createConnection') out.push(`Connected ${op.from} → ${op.to}`)
    else if (op.kind === 'deleteConnection') out.push(`Removed ${ctx.connectionLabel(op.connectionId)}`)
    else {
      const label = ctx.connectionLabel(op.connectionId)
      if (op.endYear === null) out.push(`Reopened ${label}`)
      else if (op.endYear) out.push(`Ended ${label} at ${op.endYear}`)
      else if (op.style) out.push(`Set ${label} to ${op.style}`)
      else out.push(`Edited ${label}`)
    }
  }

  for (const op of state.sectors) {
    if (op.kind === 'deleteSectorOverride') out.push(`Cleared sector ${op.sectorName} override`)
    else out.push(`Moved sector ${op.sectorName}`)
  }

  const savedResolved = resolveSettingsOverrides(ctx.settingsOverrides, EMPTY_PENDING)
  for (const op of state.settings) {
    if (op.kind === 'updateSettingsOverride') {
      const moment = savedResolved.find((r) => r.key === op.windowKey)?.moment ?? UNDATED
      for (const key of KNOB_KEYS) {
        const v = op.values[key]
        if (v !== undefined) out.push(`${KNOB_LABELS[key]} → ${formatKnobValue(key, v)}${momentSuffix(moment)}`)
      }
    } else {
      const base = activeSettingsOverrideAt(savedResolved, op.moment)?.values ?? LAYOUT_KNOBS_DEFAULTS
      for (const key of KNOB_KEYS) {
        if (op.values[key] !== base[key]) {
          out.push(`${KNOB_LABELS[key]} → ${formatKnobValue(key, op.values[key])}${momentSuffix(op.moment)}`)
        }
      }
    }
  }

  return out
}
