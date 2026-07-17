// Reads the published valuation Google Sheet (CSV) and indexes market caps by
// (slug, year "YYYY"). One column per year (Phase 5): each PAST year is that
// year's Oct-1 snapshot; the CURRENT year is the latest value. This is the
// Phase 4c data source that replaces the legacy name-matched sheet
// (loadCompanies) + the historical.ts mock.
//
// Configure with VITE_VALUATIONS_CSV_URL (the sheet's "Publish to web → CSV"
// link). Unset → the app keeps using the legacy sheet/mock, so this is safe to
// ship before the sheet exists. The sheet is read live, so client edits + the
// daily ingest appear without a redeploy. Columns are matched by NAME, so the
// newest-first year ordering and the extra vetting columns don't matter here.
import {useEffect, useState} from "react"

const CSV_URL = import.meta.env.VITE_VALUATIONS_CSV_URL as string | undefined

/** slug → (year "YYYY" → value in billions USD). */
export type ValuationData = Map<string, Map<string, number>>

export function isValuationsConfigured(): boolean {
  return !!CSV_URL
}

// Minimal CSV parser (quoted cells + escaped quotes) — same shape as loadCompanies.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else q = false
      } else cell += c
      continue
    }
    if (c === '"') {
      q = true
      continue
    }
    if (c === ",") {
      row.push(cell)
      cell = ""
      continue
    }
    if (c === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
      continue
    }
    if (c === "\r") continue
    cell += c
  }
  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export type ValuationLoad = {
  values: ValuationData
  /** slug → the date ("YYYY-MM-DD") the ingest last refreshed that company. */
  lastUpdated: Map<string, string>
}

export async function loadValuations(): Promise<ValuationLoad> {
  const values: ValuationData = new Map()
  const lastUpdated = new Map<string, string>()
  if (!CSV_URL) return {values, lastUpdated}
  const res = await fetch(CSV_URL)
  if (!res.ok) throw new Error(`Valuations sheet fetch failed: ${res.status}`)
  const rows = parseCsv(await res.text())
  if (rows.length < 2) return {values, lastUpdated}

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const slugIdx = header.indexOf("slug")
  if (slugIdx < 0) return {values, lastUpdated}
  const updatedIdx = header.indexOf("last_updated")
  // Year columns are any header shaped "YYYY".
  const yearCols = header
    .map((h, i) => ({i, h}))
    .filter(({h}) => /^\d{4}$/.test(h))

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const slug = (row[slugIdx] ?? "").trim()
    if (!slug) continue
    const years = new Map<string, number>()
    for (const {i, h} of yearCols) {
      const cell = (row[i] ?? "").trim()
      if (!cell || cell.toUpperCase() === "NA") continue // blank = manual TBD, NA = not on plan
      const n = Number(cell.replace(/[$,\s]/g, ""))
      if (Number.isFinite(n) && n > 0) years.set(h, n)
    }
    values.set(slug, years)
    const lu = updatedIdx >= 0 ? (row[updatedIdx] ?? "").trim() : ""
    if (lu) lastUpdated.set(slug, lu)
  }
  return {values, lastUpdated}
}

/** Value (billions) for a company in a year ("YYYY"), or undefined if missing/NA/blank. */
export function valuationAt(data: ValuationData, slug: string | undefined, year: string): number | undefined {
  if (!slug) return undefined
  return data.get(slug)?.get(year)
}

/** Newest year ("YYYY") with any data, used to advance the map's "current". */
export function latestYear(data: ValuationData): string | undefined {
  let latest: string | undefined
  for (const years of data.values())
    for (const y of years.keys()) if (!latest || y > latest) latest = y
  return latest
}

/** The newest ingest "last_updated" date ("YYYY-MM-DD") across all rows → the
 *  present {year, month}. Decision #3: the current map's month is derived from
 *  when the ingest last ran. Undefined until the sheet loads. */
export function latestUpdated(lastUpdated: Map<string, string>): {year: number; month: number} | undefined {
  let newest: string | undefined
  for (const d of lastUpdated.values()) if (d && (!newest || d > newest)) newest = d
  if (!newest || newest.length < 7) return undefined
  const [y, m] = newest.split("-").map(Number)
  return {year: y, month: m}
}

/** Load the valuation sheet once on mount. Empty maps until loaded / if unconfigured. */
export function useValuations(): {data: ValuationData; lastUpdated: Map<string, string>; loading: boolean} {
  const [data, setData] = useState<ValuationData>(() => new Map())
  const [lastUpdated, setLastUpdated] = useState<Map<string, string>>(() => new Map())
  const [loading, setLoading] = useState(isValuationsConfigured())

  useEffect(() => {
    if (!isValuationsConfigured()) return
    let cancelled = false
    loadValuations()
      .then((res) => {
        if (!cancelled) {
          setData(res.values)
          setLastUpdated(res.lastUpdated)
          setLoading(false)
        }
      })
      .catch((e) => {
        console.warn("[media-map] valuations sheet load failed — falling back to legacy values:", e)
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return {data, lastUpdated, loading}
}
