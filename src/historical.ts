import type { SheetCompany } from "./loadCompanies";

export type MapDate = { year: number; month: number /* 1-12 */ };

// The actual current calendar month — the synchronous fallback for the map's
// "current" view + the timeline range end. The app overrides this with the
// latest month present in the valuation sheet (see MediaMap `currentDate`), so
// the view never sits ahead of the data.
export const CURRENT_DATE: MapDate = (() => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
})();

/** First year the timeline covers (matches the ingest's START_YEAR). */
export const START_YEAR = 2015;

// The month a past year's snapshot represents: Oct 1 (Q4 start). Stored on the
// MapDate so the Sanity time-scoping moment resolves at "YYYY-10" (Oct) for past
// years; it is never displayed (past labels show the year only — decision #2).
const SNAPSHOT_MONTH = 10;

/** Build the yearly map dates (oldest → newest): one entry per year from
 *  START_YEAR through `current.year`. Past years carry the Oct-1 snapshot month;
 *  the current year carries `current.month` (the present month, for its label). */
export function buildYearRange(current: MapDate = CURRENT_DATE, startYear: number = START_YEAR): MapDate[] {
  const out: MapDate[] = [];
  for (let y = startYear; y < current.year; y++) out.push({ year: y, month: SNAPSHOT_MONTH });
  out.push({ year: current.year, month: current.month });
  return out;
}

const MONTH_LABELS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

/** Label for a map date. The present map (same year as `current`) shows its
 *  month + year (e.g. "JUL 2026"); every past year shows just the year ("2025"). */
export function formatDate(d: MapDate, current: MapDate = CURRENT_DATE): string {
  if (d.year === current.year) return `${MONTH_LABELS[d.month - 1]} ${d.year}`;
  return `${d.year}`;
}

export function sameDate(a: MapDate, b: MapDate): boolean {
  return a.year === b.year && a.month === b.month;
}

export function dateIndex(d: MapDate): number {
  return d.year * 12 + (d.month - 1);
}

/** Deterministic pseudo-random in [0,1) from a string seed. */
function hashRand(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Convert to [0, 1)
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Mock historical valuation for a given (company, date).
 * - Older dates → broader variance.
 * - For dates at-or-after the current date, returns the original valuation.
 */
export function valuationForDate(c: SheetCompany, d: MapDate): number {
  if (sameDate(d, CURRENT_DATE) || dateIndex(d) >= dateIndex(CURRENT_DATE)) {
    return c.valuation_b;
  }
  // Months back from current
  const monthsBack = dateIndex(CURRENT_DATE) - dateIndex(d);
  // Smoothly increasing variance band: ±15% at 1 month back, ±60% at 120 months back.
  const maxVar = 0.15 + Math.min(monthsBack / 120, 1) * 0.45;
  const r = hashRand(`${c.name}|${d.year}-${d.month}`); // 0..1
  // Map r to -1..1
  const sign = (r * 2 - 1);
  // Deterministic per-company drift: companies generally were smaller in the past.
  const driftR = hashRand(`drift|${c.name}`);
  const baseDrift = (1 - Math.min(monthsBack / 120, 1) * (0.35 + driftR * 0.15)); // 65%-50% of current
  const factor = baseDrift * (1 + sign * maxVar);
  return Math.max(0, c.valuation_b * factor);
}

/** Returns a copy of the company list with valuations mocked for `date`. */
export function companiesForDate(
  base: SheetCompany[],
  date: MapDate,
): SheetCompany[] {
  return base.map(c => ({
    ...c,
    valuation_b: valuationForDate(c, date),
  }));
}
