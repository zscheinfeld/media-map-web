// "Moment" time-scoping for the editor. The primitives now live in
// `@media-map/map-core` (`timeScope`) so the public app and the Studio share one
// implementation — this module just re-exports them and adds the Studio-only
// config (default moment + the month dropdown options).
//
// See the package's `timeScope.ts` for the full semantics (UNDATED sentinel,
// forward-propagation via `activeAt`, windowing via `windowActiveAt`).

export {
  type Moment,
  UNDATED,
  MONTH_NAMES,
  makeMoment,
  parseMoment,
  formatMomentShort,
  sanityDateToMoment,
  momentToSanityDate,
  activeAt,
  windowActiveAt,
} from '@media-map/map-core'

import {MONTH_NAMES, makeMoment, parseMoment, type Moment} from '@media-map/map-core'

// ── Yearly time-scoping (Phase 5) ───────────────────────────────────────────
// The editor scopes by YEAR, not month. Each year maps to a single snapshot
// moment, mirroring the public app's `buildYearRange`:
//   • a PAST year Y   → its Oct-1 (Q4-start) snapshot → moment `Y-10`
//   • the CURRENT year → the present month ("now")     → moment `Y-<thisMonth>`
// Both the canvas resolution AND the start_date stamped on edits use this
// moment, so the Studio shows exactly what the public renderer resolves.
const EDITOR_START_YEAR = 2015
const _now = new Date()
export const EDITOR_CURRENT_YEAR = _now.getFullYear()
const EDITOR_CURRENT_MONTH = _now.getMonth() + 1

/** Snapshot moment for a year: Oct for past years, the present month for the
 *  current (or any future) year. */
export function momentForYear(year: number): Moment {
  return year >= EDITOR_CURRENT_YEAR ? makeMoment(year, EDITOR_CURRENT_MONTH) : makeMoment(year, 10)
}

/** The year a moment belongs to (its `YYYY`). */
export function yearOfMoment(moment: Moment): number {
  return parseMoment(moment).year
}

/** Year-only label for a moment ("2025"), with "(now)" on the current year. */
export function formatMomentYear(moment: Moment): string {
  const y = parseMoment(moment).year
  return y >= EDITOR_CURRENT_YEAR ? `${y} (now)` : `${y}`
}

/** [min, max] years offered by the picker (2015 → the current year). */
export const EDITOR_YEAR_RANGE: [number, number] = [EDITOR_START_YEAR, EDITOR_CURRENT_YEAR]

export const DEFAULT_MOMENT: Moment = momentForYear(EDITOR_CURRENT_YEAR)

export const MONTHS_BY_NUMBER: ReadonlyArray<{value: number; label: string}> =
  MONTH_NAMES.map((label, i) => ({value: i + 1, label}))
