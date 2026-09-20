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

/** slug → set of years ("YYYY") the sheet explicitly hid via a "-" cell. */
export type HiddenData = Map<string, Set<string>>

export type ValuationLoad = {
  values: ValuationData
  /** Years a company is explicitly omitted from ("-" in the cell). */
  hidden: HiddenData
  /** slug → the date ("YYYY-MM-DD") the ingest last refreshed that company. */
  lastUpdated: Map<string, string>
}

// Where the values came from — surfaced in the console + on
// `window.__mediaMapValuations` so a wrong-looking map can be diagnosed in
// seconds: `live` = the published sheet, `snapshot` = the daily mirror at
// /valuations-snapshot.csv (committed by the snapshot-valuations workflow),
// `legacy` = both failed and the app is on its code-bundled fallback.
export type ValuationSource = "live" | "live+snapshot" | "snapshot" | "legacy"

const SNAPSHOT_URL = "/valuations-snapshot.csv"
const LIVE_ATTEMPTS = 3

/**
 * Fetch a CSV with retries + backoff. Google's `pub?output=csv` fails in two
 * ways: an outright non-200, and — nastier — an HTML page (consent / rate limit)
 * served WITH a 200. The latter used to parse as "a sheet with no slug column"
 * and silently produce empty data. Both are treated as a failed attempt here.
 */
async function fetchCsvText(url: string, attempts: number, cache: RequestCache): Promise<string> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {cache})
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (/^\s*<(!doctype|html)/i.test(text)) throw new Error("got an HTML page instead of CSV")
      return text
    } catch (e) {
      lastErr = e
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * 2 ** i))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/** Parse the sheet CSV. Null when it isn't the valuation sheet (no `slug` column). */
function parseValuationCsv(text: string): ValuationLoad | null {
  const values: ValuationData = new Map()
  const hidden: HiddenData = new Map()
  const lastUpdated = new Map<string, string>()
  const rows = parseCsv(text)
  if (rows.length < 2) return null

  // Normalize headers: drop emoji / marker symbols (🔒 ✏️ …) so the sheet can
  // annotate headers ("Slug 🔒", "2026 ✏️") without breaking column detection.
  const norm = (h: string) =>
    h.replace(/[^\p{L}\p{N}_ ]+/gu, " ").replace(/\s+/g, " ").trim().toLowerCase()
  // Find the header row (first row with a `slug` cell), so a legend/key row above
  // it isn't mistaken for the header. Falls back to row 0.
  const headerRow = Math.max(0, rows.findIndex((row) => row.map(norm).includes("slug")))
  const header = rows[headerRow].map(norm)
  const slugIdx = header.indexOf("slug")
  if (slugIdx < 0) return null
  const updatedIdx = header.indexOf("last updated") >= 0 ? header.indexOf("last updated") : header.indexOf("last_updated")
  // Year columns are any header shaped "YYYY".
  const yearCols = header
    .map((h, i) => ({i, h}))
    .filter(({h}) => /^\d{4}$/.test(h))

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r]
    const slug = (row[slugIdx] ?? "").trim()
    if (!slug) continue
    const years = new Map<string, number>()
    for (const {i, h} of yearCols) {
      const cell = (row[i] ?? "").trim()
      if (cell === "-") {
        // Explicit "omit this company from this year's map".
        ;(hidden.get(slug) ?? hidden.set(slug, new Set()).get(slug)!).add(h)
        continue
      }
      if (!cell || cell.toUpperCase() === "NA") continue // blank = manual TBD, NA = not on plan
      const n = Number(cell.replace(/[$,\s]/g, ""))
      if (Number.isFinite(n) && n > 0) years.set(h, n)
    }
    values.set(slug, years)
    const lu = updatedIdx >= 0 ? (row[updatedIdx] ?? "").trim() : ""
    if (lu) lastUpdated.set(slug, lu)
  }
  return {values, hidden, lastUpdated}
}

/** How many companies carry a value for `year`. */
function fillOf(values: ValuationData, year: string): number {
  let n = 0
  for (const years of values.values()) if (years.has(year)) n++
  return n
}

/**
 * A published copy can be "degraded": Google Finance errors inside Google's
 * publish pipeline, and the sheet's `IFERROR(…, "")` turns each error into a
 * BLANK current-year cell — so the CSV arrives with a 200, a valid slug column
 * and the right row count, but a third of the market caps missing. Detect it by
 * comparing the newest year's fill to the previous (hand-entered, never-blank)
 * year's: healthy ≈ 1.0, degraded ≈ 0.35 when it was measured.
 */
function isDegraded(load: ValuationLoad): boolean {
  const year = latestYear(load.values)
  if (!year) return false
  const cur = fillOf(load.values, year)
  const prev = fillOf(load.values, String(Number(year) - 1))
  return prev >= 20 && cur < prev * 0.85
}

/**
 * Fill cells the live copy is missing from the snapshot — per company, per year.
 * Only companies present in the live sheet are touched (a row deleted from the
 * sheet stays deleted), and a live value always wins; hidden ("-") cells are
 * hand-entered so the live set is authoritative. Returns how many cells healed.
 */
function healFromSnapshot(live: ValuationLoad, snapshot: ValuationLoad): number {
  let healed = 0
  for (const [slug, liveYears] of live.values) {
    const snapYears = snapshot.values.get(slug)
    if (!snapYears) continue
    for (const [year, v] of snapYears) {
      if (!liveYears.has(year) && !live.hidden.get(slug)?.has(year)) {
        liveYears.set(year, v)
        healed++
      }
    }
    if (!live.lastUpdated.get(slug)) {
      const lu = snapshot.lastUpdated.get(slug)
      if (lu) live.lastUpdated.set(slug, lu)
    }
  }
  return healed
}

/** The daily snapshot (same-origin, cached): the BASELINE the map paints from.
 *  Null only if the file is missing or unparseable — it's committed to the repo,
 *  so in practice this resolves in tens of milliseconds. */
export async function fetchSnapshotValuations(): Promise<ValuationLoad | null> {
  try {
    return parseValuationCsv(await fetchCsvText(SNAPSHOT_URL, 2, "default"))
  } catch {
    return null
  }
}

export type LiveResult =
  | {load: ValuationLoad; source: "live" | "live+snapshot"; detail?: string}
  | {error: string}

/**
 * The live published sheet, healed cell-by-cell from the snapshot. A degraded
 * copy (see isDegraded) is healed immediately when a snapshot exists; only when
 * there's nothing to heal from is it worth re-fetching for a fuller copy.
 */
export async function fetchLiveValuations(snapshotP: Promise<ValuationLoad | null>): Promise<LiveResult> {
  if (!CSV_URL) return {error: "VITE_VALUATIONS_CSV_URL not set"}
  let live: ValuationLoad | null
  try {
    live = parseValuationCsv(await fetchCsvText(CSV_URL, LIVE_ATTEMPTS, "no-store"))
  } catch (e) {
    return {error: e instanceof Error ? e.message : String(e)}
  }
  if (!live) return {error: "live CSV had no slug column"}
  const snapshot = await snapshotP
  if (isDegraded(live) && !snapshot) {
    // Nothing to heal from → try again (up to twice), keeping the fullest copy.
    // A healthy copy was measured to come back on roughly one fetch in three.
    const year = latestYear(live.values) ?? "?"
    for (let i = 0; isDegraded(live) && i < 2; i++) {
      console.warn(`[media-map] live sheet looks degraded (${fillOf(live.values, year)} ${year} values), no snapshot — re-fetching`)
      await new Promise((r) => setTimeout(r, 1500))
      try {
        const again = parseValuationCsv(await fetchCsvText(CSV_URL, 1, "no-store"))
        if (again && fillOf(again.values, year) > fillOf(live.values, year)) live = again
      } catch {
        /* keep what we have */
      }
    }
    return {load: live, source: "live", detail: isDegraded(live) ? "degraded copy, no snapshot to heal from" : undefined}
  }
  const healed = snapshot ? healFromSnapshot(live, snapshot) : 0
  return healed > 0
    ? {load: live, source: "live+snapshot", detail: `${healed} blank cell(s) filled from the daily snapshot`}
    : {load: live, source: "live"}
}

/**
 * One-shot resolution (used by tooling/tests): the live sheet healed from the
 * snapshot, else the snapshot alone. Throws only if BOTH are unavailable. The
 * app's hook below streams the same two sources instead — snapshot first for an
 * instant, correct first paint, then the live upgrade in place.
 */
export async function loadValuations(): Promise<ValuationLoad & {source: ValuationSource; detail?: string}> {
  if (!CSV_URL) return {values: new Map(), hidden: new Map(), lastUpdated: new Map(), source: "legacy"}
  const snapshotP = fetchSnapshotValuations()
  const live = await fetchLiveValuations(snapshotP)
  if ("load" in live) return {...live.load, source: live.source, detail: live.detail}
  console.warn(`[media-map] live valuations sheet unavailable (${live.error}) — using the daily snapshot`)
  const snapshot = await snapshotP
  if (snapshot) return {...snapshot, source: "snapshot", detail: live.error}
  throw new Error(`live: ${live.error}; snapshot: unavailable`)
}

/** True if the sheet explicitly hid this company for the given year (a "-" cell). */
export function isHiddenAt(hidden: HiddenData, slug: string | undefined, year: string): boolean {
  if (!slug) return false
  return hidden.get(slug)?.has(year) ?? false
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
export function useValuations(): {
  data: ValuationData
  hidden: HiddenData
  lastUpdated: Map<string, string>
  loading: boolean
  /** Which tier the values came from (see ValuationSource). */
  source: ValuationSource
} {
  const [data, setData] = useState<ValuationData>(() => new Map())
  const [source, setSource] = useState<ValuationSource>("legacy")
  const [hidden, setHidden] = useState<HiddenData>(() => new Map())
  const [lastUpdated, setLastUpdated] = useState<Map<string, string>>(() => new Map())
  const [loading, setLoading] = useState(isValuationsConfigured())

  useEffect(() => {
    if (!isValuationsConfigured()) return
    let cancelled = false
    let haveLive = false
    const note = (source: ValuationSource, detail?: string) => {
      const w = window as unknown as {__mediaMapValuations?: unknown}
      w.__mediaMapValuations = {source, detail, loadedAt: new Date().toISOString()}
      const msg = `[media-map] valuations source: ${source}${detail ? ` (${detail})` : ""}`
      if (source === "live" || (source === "snapshot" && detail === "live pending")) console.info(msg)
      else console.warn(msg)
    }
    const apply = (load: ValuationLoad, src: ValuationSource, detail?: string) => {
      setData(load.values)
      setHidden(load.hidden)
      setLastUpdated(load.lastUpdated)
      setSource(src)
      setLoading(false)
      note(src, detail)
    }

    // 1) Snapshot first — same-origin + cached, so the map paints (correctly)
    //    within tens of ms instead of waiting on Google. Skipped only if the live
    //    sheet somehow beat it.
    const snapshotP = fetchSnapshotValuations()
    snapshotP.then((snap) => {
      if (!cancelled && snap && !haveLive) apply(snap, "snapshot", "live pending")
    })

    // 2) Live sheet — upgrades the snapshot in place when it lands (planet sizes
    //    tween to the fresh values). If it never lands, the snapshot simply stays.
    fetchLiveValuations(snapshotP).then(async (res) => {
      if (cancelled) return
      if ("load" in res) {
        haveLive = true
        apply(res.load, res.source, res.detail)
        return
      }
      const snap = await snapshotP
      if (snap) {
        // Already painted from the snapshot above; just record why live is absent.
        setSource("snapshot")
        setLoading(false)
        note("snapshot", `live unavailable: ${res.error}`)
      } else {
        console.warn("[media-map] valuations sheet AND snapshot failed — on legacy code-bundled values:", res.error)
        setSource("legacy")
        setLoading(false)
        note("legacy", res.error)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return {data, hidden, lastUpdated, loading, source}
}
