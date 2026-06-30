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

import {MONTH_NAMES} from '@media-map/map-core'

export const DEFAULT_MOMENT = '2026-05'

export const MONTHS_BY_NUMBER: ReadonlyArray<{value: number; label: string}> =
  MONTH_NAMES.map((label, i) => ({value: i + 1, label}))
