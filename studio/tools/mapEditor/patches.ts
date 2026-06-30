import type {SanityClient} from 'sanity'
import {momentToSanityDate} from './moment'
import type {PendingPositionOp, PendingState} from './pendingChanges'

// Sanity write helpers for the Map Editor. Each helper wraps a single
// `client.patch().commit()` call; `commitPending` drains a whole batch of
// staged ops via `client.transaction()`. The Studio's `client.listen()`
// subscription in sanityMapData.ts refetches after each commit, so on Save
// the canvas updates from authoritative Sanity state — no optimistic merging.

// Fixed id of the singleton settings doc (mirrors deskStructure + sanityMapData).
const MAP_SETTINGS_ID = 'mapSettings'

const newKey = (): string => {
  // crypto.randomUUID is available in modern browsers (Sanity Studio runs there).
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  }
  return Math.random().toString(36).slice(2, 14)
}

/** Set the x/y of a specific position_overrides entry on a company. */
export async function setPositionXY(
  client: SanityClient,
  companyId: string,
  windowKey: string,
  x: number,
  y: number,
): Promise<void> {
  await client
    .patch(companyId)
    .set({
      [`position_overrides[_key=="${windowKey}"].x`]: Math.round(x),
      [`position_overrides[_key=="${windowKey}"].y`]: Math.round(y),
    })
    .commit()
}

/** Toggle/set the `pin` flag on a specific window. */
export async function setPositionPin(
  client: SanityClient,
  companyId: string,
  windowKey: string,
  pin: boolean,
): Promise<void> {
  await client
    .patch(companyId)
    .set({[`position_overrides[_key=="${windowKey}"].pin`]: pin})
    .commit()
}

/**
 * Append a new position_overrides entry. Returns the new entry's `_key` so the
 * caller can immediately select/edit it. Used when a planet has no overrides
 * yet (first drag) or the user clicks "+ New window".
 */
export async function createPositionWindow(
  client: SanityClient,
  companyId: string,
  initial: {x: number; y: number; pin?: boolean; start_date?: string; end_date?: string},
): Promise<string> {
  const key = newKey()
  const entry: Record<string, unknown> = {
    _key: key,
    _type: 'positionOverride',
    x: Math.round(initial.x),
    y: Math.round(initial.y),
    pin: initial.pin ?? false,
  }
  if (initial.start_date) entry.start_date = initial.start_date
  if (initial.end_date) entry.end_date = initial.end_date
  await client
    .patch(companyId)
    .setIfMissing({position_overrides: []})
    .append('position_overrides', [entry])
    .commit()
  return key
}

/** Remove a position_overrides entry by `_key`. */
export async function deletePositionWindow(
  client: SanityClient,
  companyId: string,
  windowKey: string,
): Promise<void> {
  await client
    .patch(companyId)
    .unset([`position_overrides[_key=="${windowKey}"]`])
    .commit()
}

/**
 * Drain a batch of staged ops to Sanity in one transaction. Patches are grouped
 * per company doc so a single doc only revs once even if multiple overrides
 * changed. Throws on any commit error — caller leaves pending state intact so
 * the user can retry.
 *
 * The transaction guarantees atomicity at the Sanity-doc level: either every
 * patch for a doc applies or none do.
 */
export async function commitPending(
  client: SanityClient,
  state: PendingState,
): Promise<void> {
  // Group ops by companyId so each doc gets one patch.
  const byCompany = new Map<string, PendingPositionOp[]>()
  for (const op of state.positions) {
    const arr = byCompany.get(op.companyId) ?? []
    arr.push(op)
    byCompany.set(op.companyId, arr)
  }

  const tx = client.transaction()
  for (const [companyId, ops] of byCompany) {
    let patch = client.patch(companyId)
    let needsSetIfMissing = false
    const sets: Record<string, unknown> = {}
    const unsets: string[] = []
    const appends: Record<string, unknown>[] = []

    for (const op of ops) {
      if (op.kind === 'createOverride') {
        needsSetIfMissing = true
        const entry: Record<string, unknown> = {
          _key: op.tempKey,
          _type: 'positionOverride',
          x: Math.round(op.x),
          y: Math.round(op.y),
          pin: op.pin,
          start_date: momentToSanityDate(op.moment),
        }
        appends.push(entry)
      } else if (op.kind === 'updateOverride') {
        if (op.x !== undefined) {
          sets[`position_overrides[_key=="${op.windowKey}"].x`] = Math.round(op.x)
        }
        if (op.y !== undefined) {
          sets[`position_overrides[_key=="${op.windowKey}"].y`] = Math.round(op.y)
        }
        if (op.pin !== undefined) {
          sets[`position_overrides[_key=="${op.windowKey}"].pin`] = op.pin
        }
      } else if (op.kind === 'deleteOverride') {
        unsets.push(`position_overrides[_key=="${op.windowKey}"]`)
      }
    }

    if (needsSetIfMissing) patch = patch.setIfMissing({position_overrides: []})
    if (Object.keys(sets).length > 0) patch = patch.set(sets)
    if (unsets.length > 0) patch = patch.unset(unsets)
    if (appends.length > 0) patch = patch.append('position_overrides', appends)
    tx.patch(patch)
  }

  // Connection ops piggyback on the same transaction so positions + connections
  // either both commit or neither does.
  for (const op of state.connections) {
    if (op.kind === 'createConnection') {
      const doc: {_type: 'connection'} & Record<string, unknown> = {
        _type: 'connection',
        from: {_type: 'reference', _ref: op.fromId},
        to: {_type: 'reference', _ref: op.toId},
        style: op.style,
        start_date: momentToSanityDate(op.startMoment),
      }
      if (op.description) doc.description = op.description
      tx.create(doc)
    } else if (op.kind === 'updateConnection') {
      let patch = client.patch(op.connectionId)
      const sets: Record<string, unknown> = {}
      const unsets: string[] = []
      if (op.style !== undefined) sets.style = op.style
      if (op.description !== undefined) sets.description = op.description
      if (op.endDate === null) unsets.push('end_date')
      else if (op.endDate !== undefined) sets.end_date = op.endDate
      if (Object.keys(sets).length > 0) patch = patch.set(sets)
      if (unsets.length > 0) patch = patch.unset(unsets)
      tx.patch(patch)
    } else if (op.kind === 'deleteConnection') {
      tx.delete(op.connectionId)
    }
  }

  // Sector override ops — grouped per sector doc so a single doc revs once
  // even if multiple overrides changed (same shape as the per-company
  // position_overrides patch logic above).
  const bySector = new Map<string, typeof state.sectors>()
  for (const op of state.sectors) {
    const arr = bySector.get(op.sectorId) ?? []
    arr.push(op)
    bySector.set(op.sectorId, arr)
  }
  for (const [sectorId, ops] of bySector) {
    let patch = client.patch(sectorId)
    let needsSetIfMissing = false
    const sets: Record<string, unknown> = {}
    const unsets: string[] = []
    const appends: Record<string, unknown>[] = []
    for (const op of ops) {
      if (op.kind === 'createSectorOverride') {
        needsSetIfMissing = true
        appends.push({
          _key: op.tempKey,
          _type: 'sectorCenterOverride',
          x: Math.round(op.x),
          y: Math.round(op.y),
          start_date: momentToSanityDate(op.moment),
        })
      } else if (op.kind === 'updateSectorOverride') {
        if (op.x !== undefined) {
          sets[`desktop_center_overrides[_key=="${op.windowKey}"].x`] = Math.round(op.x)
        }
        if (op.y !== undefined) {
          sets[`desktop_center_overrides[_key=="${op.windowKey}"].y`] = Math.round(op.y)
        }
      } else if (op.kind === 'deleteSectorOverride') {
        unsets.push(`desktop_center_overrides[_key=="${op.windowKey}"]`)
      }
    }
    if (needsSetIfMissing) patch = patch.setIfMissing({desktop_center_overrides: []})
    if (Object.keys(sets).length > 0) patch = patch.set(sets)
    if (unsets.length > 0) patch = patch.unset(unsets)
    if (appends.length > 0) patch = patch.append('desktop_center_overrides', appends)
    tx.patch(patch)
  }

  // Layout knobs → the mapSettings singleton's time-scoped overrides[]. Same
  // append/set pattern as positions and sector overrides; the doc is created on
  // first save. Part of the same transaction as everything else.
  if (state.settings.length > 0) {
    tx.createIfNotExists({_id: MAP_SETTINGS_ID, _type: 'mapSettings'})
    let patch = client.patch(MAP_SETTINGS_ID)
    let needsSetIfMissing = false
    const sets: Record<string, unknown> = {}
    const appends: Record<string, unknown>[] = []
    for (const op of state.settings) {
      if (op.kind === 'createSettingsOverride') {
        needsSetIfMissing = true
        appends.push({
          _key: op.tempKey,
          _type: 'mapSettingsOverride',
          start_date: momentToSanityDate(op.moment),
          packing_density: op.values.packingDensity,
          collide_padding: op.values.collidePadding,
          label_size_px: op.values.labelSizePx,
          connection_pull: op.values.connectionPull,
          entity_radius: op.values.entityRadius,
          size_spacing: op.values.sizeSpacing,
          sector_pull: op.values.sectorPull,
          repulsion: op.values.repulsion,
        })
      } else {
        const v = op.values
        const k = op.windowKey
        if (v.packingDensity !== undefined) sets[`overrides[_key=="${k}"].packing_density`] = v.packingDensity
        if (v.collidePadding !== undefined) sets[`overrides[_key=="${k}"].collide_padding`] = v.collidePadding
        if (v.labelSizePx !== undefined) sets[`overrides[_key=="${k}"].label_size_px`] = v.labelSizePx
        if (v.connectionPull !== undefined) sets[`overrides[_key=="${k}"].connection_pull`] = v.connectionPull
        if (v.entityRadius !== undefined) sets[`overrides[_key=="${k}"].entity_radius`] = v.entityRadius
        if (v.sizeSpacing !== undefined) sets[`overrides[_key=="${k}"].size_spacing`] = v.sizeSpacing
        if (v.sectorPull !== undefined) sets[`overrides[_key=="${k}"].sector_pull`] = v.sectorPull
        if (v.repulsion !== undefined) sets[`overrides[_key=="${k}"].repulsion`] = v.repulsion
      }
    }
    if (needsSetIfMissing) patch = patch.setIfMissing({overrides: []})
    if (Object.keys(sets).length > 0) patch = patch.set(sets)
    if (appends.length > 0) patch = patch.append('overrides', appends)
    tx.patch(patch)
  }

  await tx.commit()
}
