// Shared, data-source-agnostic time-scoping primitives. Both the public app and
// the Studio editor resolve "the map at moment T" through these, so the forward-
// propagation + windowing logic can never drift between the two surfaces.
//
// A "moment" is a year+month as a `'YYYY-MM'` string. Lexicographic comparison is
// correct for these (`'YYYY-MM' < 'YYYY-MM+1'`). The empty string `''` (UNDATED)
// is the always-active sentinel: it sorts before any real moment, so a
// forward-propagated override or window with no start applies from the beginning.

export type Moment = string // 'YYYY-MM' or '' (undated, always-active)

export const UNDATED: Moment = ''

export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

export function makeMoment(year: number, month: number): Moment {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function parseMoment(m: Moment): {year: number; month: number} {
  const [y, mm] = m.split('-')
  return {year: parseInt(y, 10), month: parseInt(mm, 10)}
}

export function formatMomentShort(m: Moment): string {
  if (m === UNDATED) return 'Always'
  const {year, month} = parseMoment(m)
  return `${MONTH_NAMES[month - 1]} ${year}`
}

/** Convert a Sanity `'YYYY-MM-DD'` (or undefined/null) → `'YYYY-MM'` moment. */
export function sanityDateToMoment(d: string | undefined | null): Moment | null {
  if (!d || d.length < 7) return null
  return d.slice(0, 7)
}

/** Convert a moment to a Sanity-storage `'YYYY-MM-DD'` (always day = 01). */
export function momentToSanityDate(m: Moment): string {
  return `${m}-01`
}

/**
 * Forward-propagation lookup: of `items`, the one whose moment is the largest
 * value `≤ at`. Returns null if none qualify (e.g. before a planet's first
 * position override). Used for positions, sector centers, and layout-knob
 * settings. `getMoment` extracts each item's effective moment (UNDATED allowed).
 */
export function activeAt<T>(
  items: readonly T[],
  at: Moment,
  getMoment: (item: T) => Moment,
): T | null {
  let best: T | null = null
  let bestMoment: Moment = UNDATED
  let found = false
  for (const item of items) {
    const m = getMoment(item)
    if (m <= at && (!found || m > bestMoment)) {
      best = item
      bestMoment = m
      found = true
    }
  }
  return best
}

export type YearWindow = {start_year?: number | null; end_year?: number | null}

/**
 * Appearance-window lookup (Phase 5, yearly): whether the YEAR of moment `at`
 * falls inside any `[start_year, end_year]` range (inclusive). An empty list is
 * "always active." Absent start = from the beginning of the timeline; absent
 * end = ongoing. Used for company + entity appearance windows.
 */
export function yearWindowsActiveAt(windows: ReadonlyArray<YearWindow>, at: Moment): boolean {
  if (windows.length === 0) return true
  const year = parseInt(at.slice(0, 4), 10)
  if (!Number.isFinite(year)) return true
  return windows.some((w) => {
    const from = w.start_year ?? -Infinity
    const to = w.end_year ?? Infinity
    return year >= from && year <= to
  })
}

/**
 * Windowed lookup: whether moment `at` falls inside `[startDate, endDate]`.
 * Undated start = from the beginning of the timeline; undated end = ongoing.
 * Used for connections, entity appearance windows, and vitals. Takes raw Sanity
 * date strings so callers can pass straight through.
 */
export function windowActiveAt(
  startDate: string | undefined | null,
  endDate: string | undefined | null,
  at: Moment,
): boolean {
  const start = sanityDateToMoment(startDate) ?? UNDATED
  const end = sanityDateToMoment(endDate)
  if (start > at) return false
  if (end !== null && at > end) return false
  return true
}
