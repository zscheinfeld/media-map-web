import {useEffect, useState} from 'react'

// === Live valuation provider (slug × year) ================================
// The public map sizes planets from the published "valuations" Google Sheet
// (VITE_VALUATIONS_CSV_URL there), indexed by company SLUG and YEAR — the nightly
// FMP ingest + client edits write here, and it's read live (no redeploy). This
// module is the Studio-side counterpart so the editor sizes planets from the SAME
// source, at the SAME viewed year, instead of the legacy name-matched fallback
// (sheetValuations.ts). Configure with SANITY_STUDIO_VALUATIONS_CSV_URL (Studio
// exposes SANITY_STUDIO_* to the browser); unset → empty, and the editor falls
// back to manual/legacy values exactly as before.
//
// Kept intentionally parallel to the app's src/loadValuations.ts — if that
// parser changes, change this one too.
// ==========================================================================

const CSV_URL = process.env.SANITY_STUDIO_VALUATIONS_CSV_URL as string | undefined

/** slug → (year "YYYY" → value in billions USD). */
export type ValuationData = Map<string, Map<string, number>>

export function isLiveValuationsConfigured(): boolean {
  return !!CSV_URL
}

// Minimal CSV parser (quoted cells + escaped quotes) — same shape as the app's.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
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
    if (c === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (c === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    if (c === '\r') continue
    cell += c
  }
  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function parseValuations(csv: string): ValuationData {
  const values: ValuationData = new Map()
  const rows = parseCsv(csv)
  if (rows.length < 2) return values
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const slugIdx = header.indexOf('slug')
  if (slugIdx < 0) return values
  // Year columns are any header shaped "YYYY".
  const yearCols = header.map((h, i) => ({i, h})).filter(({h}) => /^\d{4}$/.test(h))
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const slug = (row[slugIdx] ?? '').trim()
    if (!slug) continue
    const years = new Map<string, number>()
    for (const {i, h} of yearCols) {
      const raw = (row[i] ?? '').trim()
      if (!raw || raw.toUpperCase() === 'NA') continue // blank = manual TBD, NA = not on plan
      const n = Number(raw.replace(/[$,\s]/g, ''))
      if (Number.isFinite(n) && n > 0) years.set(h, n)
    }
    values.set(slug, years)
  }
  return values
}

/** Value (billions) for a company in a year ("YYYY"), or undefined if missing/NA/blank. */
export function valuationAt(
  data: ValuationData,
  slug: string | undefined,
  year: string,
): number | undefined {
  if (!slug) return undefined
  return data.get(slug)?.get(year)
}

/**
 * Live valuations by slug × year (from the published sheet). `loaded` flips true
 * once the fetch settles (success OR failure), so the caller can wait for it
 * before the first layout — like sheetValuations, this keeps planet sizes correct
 * from frame one. When unconfigured, `loaded` is true immediately (empty data).
 */
export function useLiveValuations(): {data: ValuationData; loaded: boolean} {
  const [data, setData] = useState<ValuationData>(() => new Map())
  const [loaded, setLoaded] = useState(!isLiveValuationsConfigured())
  useEffect(() => {
    if (!CSV_URL) return
    let cancelled = false
    fetch(CSV_URL)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`Valuations sheet ${r.status}`))))
      .then((csv) => {
        if (!cancelled) setData(parseValuations(csv))
      })
      .catch(() => {
        /* leave empty → editor falls back to manual / legacy values */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return {data, loaded}
}
