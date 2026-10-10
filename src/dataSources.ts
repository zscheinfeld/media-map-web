// Where a company's numbers come from, read from the valuations sheet's "Link to
// Data Source" column (carried to the site by the daily snapshot). One source per
// line, newest first:
//
//   2026 | Reuters | https://…            a single year
//   2015–2025 | companiesmarketcap.com | https://…   a range
//   Yahoo Finance | https://…             no years: every year with a value
//   https://…                              a bare link (legacy): labelled by its host
//
// The line covering the current year is a manual company's current source; a
// Google Finance company's current source is Google Finance itself ("Live").
// Lines for past years are the history; a line with neither years nor a link
// (e.g. "Not in google finance") is ignored.

export type SourceRef = { label: string; url: string | null };
/** One source for a run of years (newest first in the list). */
export type YearSource = SourceRef & { from: number; to: number };
export type CompanySources = { frequency: "Live" | "Monthly"; current: SourceRef | null; years: YearSource[] };

const YEARS_RE = /^(\d{4})(?:\s*[–—-]\s*(\d{4}))?$/;
const URL_RE = /^https?:\/\/\S+$/i;

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Parse one company's cell. `dataSource` is the sheet's Data Source column
 * ("Google Finance" / "Manual entry" / …), `valueYears` the years the company has
 * a number for, `currentYear` the sheet's newest year column.
 */
export function parseSourceCell(cell: string, dataSource: string, valueYears: number[], currentYear: number): CompanySources | null {
  const live = /google finance/i.test(dataSource);
  type Line = { from: number | null; to: number | null; label: string; url: string | null };
  const lines: Line[] = [];
  for (const raw of cell.split(/\r?\n/)) {
    const parts = raw
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) continue;
    let from: number | null = null;
    let to: number | null = null;
    const m = YEARS_RE.exec(parts[0]);
    if (m) {
      from = Number(m[1]);
      to = m[2] ? Number(m[2]) : from;
      if (from > to) [from, to] = [to, from];
      parts.shift();
    }
    let label = parts[0] ?? "";
    let url: string | null = null;
    if (parts.length >= 2 && URL_RE.test(parts[parts.length - 1])) url = parts[parts.length - 1];
    else if (parts.length === 1 && URL_RE.test(parts[0])) {
      url = parts[0];
      label = hostLabel(url);
    }
    if (!label || (from === null && !url)) continue;
    lines.push({ from, to, label, url });
  }
  const past = valueYears.filter((y) => y < currentYear);
  let current: SourceRef | null = live ? { label: "Google Finance", url: null } : null;
  const years: YearSource[] = [];
  for (const l of lines) {
    if (l.from === null || l.to === null) {
      // No years: the source for every past year with a value — and, for a
      // manual company with no dated line, the current one too.
      if (past.length) years.push({ from: Math.min(...past), to: Math.max(...past), label: l.label, url: l.url });
      if (!live && !current) current = { label: l.label, url: l.url };
      continue;
    }
    if (!live && l.to >= currentYear && !current) current = { label: l.label, url: l.url };
    const to = Math.min(l.to, currentYear - 1);
    if (l.from <= to) years.push({ from: l.from, to, label: l.label, url: l.url });
  }
  years.sort((a, b) => b.to - a.to);
  if (!current && years.length === 0) return null;
  return { frequency: live ? "Live" : "Monthly", current, years };
}
