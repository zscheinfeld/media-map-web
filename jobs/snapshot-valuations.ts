// Mirror the published valuation sheet (CSV) into the repo as
// public/valuations-snapshot.csv — the public app's SAME-ORIGIN fallback and
// the source it heals blank cells from.
//
// Why: the live endpoint fails two ways. (1) Outright — rate limits, transient
// 5xx, an HTML consent page served with a 200. (2) Degraded — the sheet's
// GOOGLEFINANCE() formulas error inside Google's publish pipeline and
// `IFERROR(…, "")` turns each error into a BLANK current-year cell, so the CSV
// arrives with a 200, a valid slug column and the right row count but a third
// of the market caps missing. Measured 2026-09-19: two of three fetches, eight
// seconds apart, were degraded (64 vs 177 current-year values).
//
// So this job (a) re-fetches until it gets a healthy copy, keeping the fullest,
// and (b) refuses to overwrite the existing snapshot with anything worse than
// it. Exits non-zero on failure, so a red run in GitHub Actions is itself a
// record of Google failing at that moment.
//   Env: VALUATIONS_CSV_URL (falls back to VITE_VALUATIONS_CSV_URL). No creds needed.
// Run: npm run snapshot-valuations
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {parseCsv} from './lib.ts' // also loads jobs/.env

const CSV_URL = process.env.VALUATIONS_CSV_URL || process.env.VITE_VALUATIONS_CSV_URL
const OUT = fileURLToPath(new URL('../public/valuations-snapshot.csv', import.meta.url))
const ATTEMPTS = 6

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchOnce(url: string): Promise<string> {
  const res = await fetch(url, {redirect: 'follow'})
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('got an HTML page instead of CSV')
  return text
}

type Shape = {rows: number; year: string; filled: number; prevFilled: number}

/** Roster size + current-year fill (the health signal) of a sheet CSV; null if
 *  it has no `slug` column. Uses the real CSV parser — the Notes column holds
 *  commas inside quotes, so a naive split misaligns columns. */
function shapeOf(csv: string): Shape | null {
  const rows = parseCsv(csv)
  const norm = (h: string) => h.replace(/[^\p{L}\p{N}_ ]+/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  const hdr = rows.findIndex((r) => r.map(norm).includes('slug'))
  if (hdr < 0) return null
  const header = rows[hdr].map(norm)
  const slugIdx = header.indexOf('slug')
  const yearCols = header.map((h, i) => ({h, i})).filter(({h}) => /^\d{4}$/.test(h)).sort((a, b) => b.h.localeCompare(a.h))
  const year = yearCols[0]?.h ?? ''
  const prev = yearCols.find((y) => y.h === String(Number(year) - 1))
  let n = 0, filled = 0, prevFilled = 0
  const has = (r: string[], i: number | undefined) => i !== undefined && (r[i] ?? '').trim() !== '' && (r[i] ?? '').trim() !== '-'
  for (const r of rows.slice(hdr + 1)) {
    if (!(r[slugIdx] ?? '').trim()) continue
    n++
    if (has(r, yearCols[0]?.i)) filled++
    if (has(r, prev?.i)) prevFilled++
  }
  return {rows: n, year, filled, prevFilled}
}

const isDegraded = (s: Shape) => s.prevFilled >= 20 && s.filled < s.prevFilled * 0.85

async function main() {
  if (!CSV_URL) throw new Error("Set VALUATIONS_CSV_URL (the sheet's publish-to-web CSV link).")

  // Fetch until healthy, keeping the fullest copy seen.
  let best: {csv: string; shape: Shape} | null = null
  let lastErr: unknown
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      const csv = await fetchOnce(CSV_URL)
      const shape = shapeOf(csv)
      if (!shape) throw new Error('fetched CSV has no `slug` column — not the valuation sheet')
      if (!best || shape.filled > best.shape.filled) best = {csv, shape}
      if (!isDegraded(shape)) break
      console.warn(`attempt ${i + 1}/${ATTEMPTS}: degraded copy (${shape.filled}/${shape.prevFilled} ${shape.year} values) — retrying`)
    } catch (e) {
      lastErr = e
      console.warn(`attempt ${i + 1}/${ATTEMPTS} failed: ${e instanceof Error ? e.message : e}`)
    }
    if (i < ATTEMPTS - 1) await sleep(2000 * Math.min(i + 1, 4))
  }
  if (!best) throw lastErr instanceof Error ? lastErr : new Error('could not fetch the sheet')
  const {csv, shape} = best
  if (shape.rows < 100) throw new Error(`fetched CSV has only ${shape.rows} rows — refusing to overwrite the snapshot`)

  // Never replace the snapshot with a worse copy: a truncated roster, or fewer
  // current-year values than we already have (a degraded publish).
  if (existsSync(OUT)) {
    const prev = shapeOf(readFileSync(OUT, 'utf8'))
    if (prev) {
      if (shape.rows < prev.rows * 0.8) {
        throw new Error(`fetched CSV has ${shape.rows} rows vs ${prev.rows} in the current snapshot — looks truncated, keeping the old one`)
      }
      if (shape.year === prev.year && shape.filled < prev.filled * 0.9) {
        throw new Error(`fetched CSV has ${shape.filled} ${shape.year} values vs ${prev.filled} in the current snapshot — degraded, keeping the old one`)
      }
    }
  }
  if (isDegraded(shape)) {
    throw new Error(`every attempt was degraded (best: ${shape.filled}/${shape.prevFilled} ${shape.year} values) — not writing`)
  }
  writeFileSync(OUT, csv)
  console.log(`✓ snapshot written: ${shape.rows} companies, ${shape.filled} ${shape.year} values, ${csv.length} bytes → ${OUT}`)
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
