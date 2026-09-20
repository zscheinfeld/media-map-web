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
// Optional fallback: the public site's daily snapshot (served CORS-open from
// Netlify, see netlify.toml), e.g. https://<site>.netlify.app/valuations-snapshot.csv.
// Used only when the live sheet fetch fails — which is what turns every planet
// name red in the editor (no live value → the "not live-sourced" flag).
const SNAPSHOT_URL = process.env.SANITY_STUDIO_VALUATIONS_SNAPSHOT_URL as string | undefined

/** Fetch a CSV with retries; an HTML body (Google consent/rate-limit page with
 *  a 200) counts as a failed attempt rather than parsing as an empty sheet. */
async function fetchCsvText(url: string, attempts: number): Promise<string> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {cache: 'no-store'})
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('got an HTML page instead of CSV')
      return text
    } catch (e) {
      lastErr = e
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * 2 ** i))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

const newestYear = (v: ValuationData): string => {
  let y = ''
  for (const years of v.values()) for (const k of years.keys()) if (k > y) y = k
  return y
}
const fillOf = (v: ValuationData, year: string): number => {
  let n = 0
  for (const years of v.values()) if (years.has(year)) n++
  return n
}
/** A "degraded" publish: GOOGLEFINANCE errored inside Google's publish pipeline
 *  and the sheet's IFERROR turned the errors into blank current-year cells — a
 *  200 with a valid slug column but a third of the market caps missing. Detect by
 *  comparing the newest year's fill to the hand-entered previous year's. */
const isDegraded = (v: ValuationData): boolean => {
  const y = newestYear(v)
  if (!y) return false
  const cur = fillOf(v, y)
  const prev = fillOf(v, String(Number(y) - 1))
  return prev >= 20 && cur < prev * 0.85
}

/** slug → (year "YYYY" → value in billions USD). */
export type ValuationData = Map<string, Map<string, number>>
/** slug → set of years ("YYYY") the sheet explicitly hid via a "-" cell. */
export type HiddenData = Map<string, Set<string>>

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

function parseValuations(csv: string): {values: ValuationData; hidden: HiddenData} {
  const values: ValuationData = new Map()
  const hidden: HiddenData = new Map()
  const rows = parseCsv(csv)
  if (rows.length < 2) return {values, hidden}
  // Normalize headers (drop emoji markers like 🔒 / ✏️) and find the header row by
  // locating `slug`, so a KEY/legend row on top doesn't get read as the header.
  const norm = (h: string) =>
    h.replace(/[^\p{L}\p{N}_ ]+/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  const headerRow = Math.max(0, rows.findIndex((row) => row.map(norm).includes('slug')))
  const header = rows[headerRow].map(norm)
  const slugIdx = header.indexOf('slug')
  if (slugIdx < 0) return {values, hidden}
  // Year columns are any header shaped "YYYY".
  const yearCols = header.map((h, i) => ({i, h})).filter(({h}) => /^\d{4}$/.test(h))
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r]
    const slug = (row[slugIdx] ?? '').trim()
    if (!slug) continue
    const years = new Map<string, number>()
    for (const {i, h} of yearCols) {
      const raw = (row[i] ?? '').trim()
      if (raw === '-') {
        // Explicit "omit this company from this year's map".
        ;(hidden.get(slug) ?? hidden.set(slug, new Set()).get(slug)!).add(h)
        continue
      }
      if (!raw || raw.toUpperCase() === 'NA') continue // blank = manual TBD, NA = not on plan
      const n = Number(raw.replace(/[$,\s]/g, ''))
      if (Number.isFinite(n) && n > 0) years.set(h, n)
    }
    values.set(slug, years)
  }
  return {values, hidden}
}

/** True if the sheet explicitly hid this company for the given year (a "-" cell). */
export function isHiddenAt(hidden: HiddenData, slug: string | undefined, year: string): boolean {
  if (!slug) return false
  return hidden.get(slug)?.has(year) ?? false
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
export function useLiveValuations(): {data: ValuationData; hidden: HiddenData; loaded: boolean} {
  const [data, setData] = useState<ValuationData>(() => new Map())
  const [hidden, setHidden] = useState<HiddenData>(() => new Map())
  const [loaded, setLoaded] = useState(!isLiveValuationsConfigured())
  useEffect(() => {
    if (!CSV_URL) return
    let cancelled = false
    ;(async () => {
      try {
        // Live sheet, re-fetched (up to twice) if the copy looks degraded,
        // keeping the fullest. Then heal any still-blank cells from the snapshot.
        let live: {values: ValuationData; hidden: HiddenData} | null = null
        let liveError: string | undefined
        try {
          live = parseValuations(await fetchCsvText(CSV_URL, 3))
          for (let i = 0; isDegraded(live.values) && i < 2; i++) {
            const y = newestYear(live.values)
            console.warn(`[map-editor] live sheet looks degraded (${fillOf(live.values, y)} ${y} values) — re-fetching`)
            await new Promise((r) => setTimeout(r, 1500))
            try {
              const again = parseValuations(await fetchCsvText(CSV_URL, 1))
              if (fillOf(again.values, y) > fillOf(live.values, y)) live = again
            } catch {
              /* keep what we have */
            }
          }
        } catch (e) {
          liveError = e instanceof Error ? e.message : String(e)
        }
        let snapshot: {values: ValuationData; hidden: HiddenData} | null = null
        if (SNAPSHOT_URL) {
          try {
            snapshot = parseValuations(await fetchCsvText(SNAPSHOT_URL, 2))
          } catch {
            /* optional */
          }
        }
        let result = live ?? snapshot
        if (!result) throw new Error(`live sheet failed (${liveError})${SNAPSHOT_URL ? '; snapshot failed too' : '; no snapshot URL configured'}`)
        if (live && snapshot) {
          // Per company, per year: live wins; snapshot fills blanks. Only
          // companies present in the live sheet are touched.
          let healed = 0
          for (const [slug, years] of live.values) {
            const snapYears = snapshot.values.get(slug)
            if (!snapYears) continue
            for (const [y, v] of snapYears) {
              if (!years.has(y) && !live.hidden.get(slug)?.has(y)) {
                years.set(y, v)
                healed++
              }
            }
          }
          result = live
          console[healed ? 'warn' : 'info'](
            `[map-editor] valuations source: live sheet${healed ? ` + ${healed} blank cell(s) filled from the snapshot` : ''}`,
          )
        } else if (live) {
          console[isDegraded(live.values) ? 'warn' : 'info'](
            `[map-editor] valuations source: live sheet${isDegraded(live.values) ? ' (degraded copy — set SANITY_STUDIO_VALUATIONS_SNAPSHOT_URL to heal blanks)' : ''}`,
          )
        } else {
          console.warn(`[map-editor] live sheet failed (${liveError}) — using the daily snapshot`)
        }
        if (!cancelled) {
          setData(result.values)
          setHidden(result.hidden)
        }
      } catch (e) {
        // Leave empty → every name renders red (no live value) and sizes fall
        // back to manual / legacy values. Say so, rather than failing silently.
        console.warn('[map-editor] valuations unavailable — planets will show RED (no live value):', e)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  return {data, hidden, loaded}
}
