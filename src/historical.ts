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

/** Years × 12 months of historical maps to mock — going back from CURRENT_DATE. */
const HISTORY_YEARS = 10;

/** Build the list of all map dates (oldest → newest). */
export function buildDateRange(): MapDate[] {
  const out: MapDate[] = [];
  const startYear = CURRENT_DATE.year - HISTORY_YEARS;
  const startMonth = CURRENT_DATE.month;
  let y = startYear;
  let m = startMonth;
  while (y < CURRENT_DATE.year || (y === CURRENT_DATE.year && m <= CURRENT_DATE.month)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

const MONTH_LABELS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

export function formatDate(d: MapDate, mode: "short" | "long" = "short"): string {
  if (mode === "long") {
    return `${MONTH_LABELS[d.month - 1]} ${d.year}`;
  }
  return `${MONTH_LABELS[d.month - 1]} ${d.year}`;
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
