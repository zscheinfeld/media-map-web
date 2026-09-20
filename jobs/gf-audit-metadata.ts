// READ-ONLY audit: Google Finance sheet metadata vs the Sanity roster.
//
// Answers "did anyone type metadata into the sheet without reflecting it in
// Sanity?" — which matters because Sanity is the source of truth for the managed
// metadata columns, so the next `gf-sync-roster --apply` would OVERWRITE any
// sheet-only edit. This script shows you those before that happens.
//
// It compares exactly the columns the reconciler manages (name / sector / data
// type / data source / ticker / exchange / currency) using the same
// normalization, so a "differs" here is precisely a cell the reconciler would
// rewrite. It also reports rows only in the sheet, companies only in Sanity,
// duplicate slugs on either side, and hand-typed current-year values that the
// reconciler would replace with a GOOGLEFINANCE formula.
//
// WRITES NOTHING — it authenticates with the Google `spreadsheets.readonly`
// scope and only issues Sanity queries, so it cannot modify either side.
//   Env (same as the reconciler): GF_SHEET_ID (+ GOOGLE_SERVICE_ACCOUNT_JSON or
//        GOOGLE_APPLICATION_CREDENTIALS), SANITY_PROJECT_ID, SANITY_DATASET,
//        SANITY_AUTH_TOKEN. Optional GF_SHEET_TAB.
// Run: npm run gf-audit-metadata           # human-readable report
//      npm run gf-audit-metadata -- --json # machine-readable
import {google} from 'googleapis'
import {fetchRoster, sanityClient, type Company} from './lib.ts'
import {gfSymbolFor} from './gfTicker.ts'

const AS_JSON = process.argv.includes('--json')

/** Same header normalization the reconciler uses (emoji/marker tolerant). */
const normHeader = (h: unknown): string =>
  String(h ?? '')
    .replace(/[^\p{L}\p{N}_ ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const findCol = (headerLower: string[], ...names: string[]): number => {
  for (const n of names) {
    const i = headerLower.indexOf(n)
    if (i >= 0) return i
  }
  return -1
}

/**
 * What Sanity says each managed column should contain — mirrors
 * `managedValues` in gf-sync-roster.ts, minus the FMP-exchange bridge (that
 * supplement only fills a blank, and we don't want the audit to depend on the
 * retired FMP sheet). A blank Sanity exchange is therefore reported as
 * "(blank)" rather than guessed.
 */
function expectedValues(c: Company): Record<string, string> {
  const base = {
    name: c.name ?? '',
    sector: c.sector ?? '',
    type: c.valuation_type ?? 'market_cap',
    source: c.dataSourceName ?? '',
  }
  if (c.dataSourceType === 'manual') return {...base, ticker: '', exchange: '', currency: ''}
  const raw = (c.ticker ?? '').trim()
  const bareTicker = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw
  const prefixFromTicker = raw.includes(':') ? raw.slice(0, raw.indexOf(':')).toUpperCase() : ''
  const exchange = !bareTicker ? '' : (c.exchange ?? '').trim().toUpperCase() || prefixFromTicker
  const currency = (c.currency ?? '').trim().toUpperCase() || gfSymbolFor(bareTicker, exchange).currency
  return {...base, ticker: bareTicker, exchange, currency}
}

/** Mirrors the reconciler's rule for "this row's current-year cell is a formula". */
function wantsGfFormula(c: Company): boolean {
  return c.dataSourceType !== 'manual' && (c.valuation_type ?? 'market_cap') === 'market_cap' && !!c.ticker
}

const FIELD_LABEL: Record<string, string> = {
  name: 'Name',
  sector: 'Sector',
  type: 'Data type',
  source: 'Data source',
  ticker: 'Ticker',
  exchange: 'Exchange',
  currency: 'Currency',
}

type Diff = {slug: string; row: number; field: string; sanity: string; sheet: string; sheetOnly: boolean}

async function main() {
  // READ-ONLY scope: this token cannot write to the spreadsheet.
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const auth = new google.auth.GoogleAuth({
    credentials: json ? JSON.parse(json) : undefined,
    keyFile: json ? undefined : process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  const sheets = google.sheets({version: 'v4', auth})
  const spreadsheetId = process.env.GF_SHEET_ID as string
  if (!spreadsheetId) throw new Error('Set GF_SHEET_ID (the Google Finance sheet id).')
  const meta = await sheets.spreadsheets.get({spreadsheetId})
  const tab = process.env.GF_SHEET_TAB ?? meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1'

  const roster = await fetchRoster(sanityClient())
  // FORMULA rendering so a live GF formula is distinguishable from a typed number.
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: tab,
    valueRenderOption: 'FORMULA',
  })
  const rows = resp.data.values ?? []
  if (rows.length === 0) throw new Error('Sheet is empty.')

  const hdrIdx = Math.max(0, rows.findIndex((row) => (row ?? []).map(normHeader).includes('slug')))
  const H = (rows[hdrIdx] ?? []).map(normHeader)
  const col: Record<string, number> = {
    slug: findCol(H, 'slug'),
    name: findCol(H, 'name'),
    sector: findCol(H, 'sector'),
    type: findCol(H, 'data type', 'type'),
    source: findCol(H, 'data source', 'data_source'),
    ticker: findCol(H, 'ticker'),
    exchange: findCol(H, 'exchange'),
    currency: findCol(H, 'currency'),
  }
  if (col.slug < 0) throw new Error('Sheet needs a `slug` column (the join key).')
  const currentYear = new Date().getFullYear()
  const curYearCol = H.findIndex((h) => h === String(currentYear))

  // Index sheet rows by slug (first wins; extras recorded as duplicates).
  // Rows with NO slug are collected separately: slug is the join key for the app,
  // the reconciler AND this audit, so an unslugged row is invisible everywhere —
  // it renders on no map and is silently skipped by every job. That makes it the
  // most likely place for "typed into the sheet only" data to hide. Rows with a
  // stray single cell (a formula filled down past the data) aren't real content.
  const bySlug = new Map<string, {row1: number; cells: string[]}>()
  const sheetDups: {slug: string; rows: number[]}[] = []
  const dupRows = new Map<string, number[]>()
  const noSlugRows: {row: number; name: string; filled: number}[] = []
  for (let r = hdrIdx + 1; r < rows.length; r++) {
    const cells = (rows[r] ?? []).map((c) => String(c ?? ''))
    const slug = (cells[col.slug] ?? '').trim()
    if (!slug) {
      const filled = cells.filter((c) => c.trim() !== '').length
      const name = col.name >= 0 ? (cells[col.name] ?? '').trim() : ''
      if (name || filled >= 3) noSlugRows.push({row: r + 1, name, filled})
      continue
    }
    if (bySlug.has(slug)) dupRows.set(slug, [...(dupRows.get(slug) ?? [bySlug.get(slug)!.row1]), r + 1])
    else bySlug.set(slug, {row1: r + 1, cells})
  }
  for (const [slug, rs] of dupRows) sheetDups.push({slug, rows: rs})

  const diffs: Diff[] = []
  const missingFromSheet: string[] = []
  const typedCurrentYear: {slug: string; row: number; value: string}[] = []
  const sanityDups: string[] = []
  const seen = new Set<string>()

  for (const c of roster) {
    if (!c.slug) continue
    if (seen.has(c.slug)) {
      sanityDups.push(c.slug)
      continue
    }
    seen.add(c.slug)
    const existing = bySlug.get(c.slug)
    if (!existing) {
      missingFromSheet.push(`${c.slug} (${c.name})`)
      continue
    }
    for (const [key, expected] of Object.entries(expectedValues(c))) {
      const ci = col[key]
      if (ci < 0) continue
      const actual = (existing.cells[ci] ?? '').trim()
      if (actual !== expected) {
        diffs.push({
          slug: c.slug,
          row: existing.row1,
          field: FIELD_LABEL[key] ?? key,
          sanity: expected,
          sheet: actual,
          // The signature of "typed into the sheet, never entered in Sanity".
          sheetOnly: expected === '' && actual !== '',
        })
      }
    }
    // A hand-typed number where the reconciler maintains a formula gets replaced.
    if (curYearCol >= 0 && wantsGfFormula(c)) {
      const cur = (existing.cells[curYearCol] ?? '').trim()
      if (cur && !cur.startsWith('=')) typedCurrentYear.push({slug: c.slug, row: existing.row1, value: cur})
    }
  }

  const rosterSlugs = new Set(roster.map((c) => c.slug).filter(Boolean) as string[])
  const sheetOnlyRows = [...bySlug.entries()]
    .filter(([s]) => !rosterSlugs.has(s))
    .map(([slug, v]) => ({slug, row: v.row1, name: (v.cells[col.name] ?? '').trim()}))

  if (AS_JSON) {
    console.log(
      JSON.stringify(
        {diffs, noSlugRows, sheetOnlyRows, missingFromSheet, sheetDups, sanityDups, typedCurrentYear},
        null,
        2,
      ),
    )
    return
  }

  // ---- Report ----
  const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n))
  const show = (v: string) => (v === '' ? '(blank)' : v)
  console.log(`\nGF sheet ↔ Sanity metadata audit  •  READ-ONLY (nothing was modified)`)
  console.log(`Sheet tab "${tab}" · ${bySlug.size} rows · Sanity roster ${rosterSlugs.size} companies\n`)

  const sheetOnlyDiffs = diffs.filter((d) => d.sheetOnly)
  const conflicts = diffs.filter((d) => !d.sheetOnly)

  if (sheetOnlyDiffs.length) {
    console.log(`⚠️  FILLED IN THE SHEET, BLANK IN SANITY — ${sheetOnlyDiffs.length} cell(s)`)
    console.log(`   Most likely "entered in the sheet, never added to Sanity". The`)
    console.log(`   reconciler would CLEAR these. Copy into Sanity to keep them.`)
    for (const d of sheetOnlyDiffs) {
      console.log(`   row ${String(d.row).padStart(4)}  ${pad(d.slug, 26)} ${pad(d.field, 12)} sheet="${d.sheet}"`)
    }
    console.log()
  }

  if (conflicts.length) {
    console.log(`⚠️  DIFFERENT VALUES — ${conflicts.length} cell(s)`)
    console.log(`   The reconciler would overwrite the sheet with the Sanity value.\n`)
    console.log(`   row   slug                       field        Sanity → Sheet`)
    for (const d of conflicts) {
      console.log(
        `   ${String(d.row).padStart(4)}  ${pad(d.slug, 26)} ${pad(d.field, 12)} ${show(d.sanity)} → ${show(d.sheet)}`,
      )
    }
    console.log()
  }

  if (noSlugRows.length) {
    console.log(`⚠️  ROWS WITH NO SLUG — ${noSlugRows.length}`)
    console.log(`   Slug is the join key, so these are invisible to the map, to the`)
    console.log(`   reconciler and to the rest of this audit. Data here does nothing.`)
    for (const r of noSlugRows) {
      console.log(`   row ${String(r.row).padStart(4)}  ${pad(r.name || '(no name)', 40)} ${r.filled} filled cells`)
    }
    console.log()
  }

  if (sheetOnlyRows.length) {
    console.log(`⚠️  ROWS ONLY IN THE SHEET — ${sheetOnlyRows.length}`)
    console.log(`   No Sanity company with this slug, so they never render on the map.`)
    for (const r of sheetOnlyRows) console.log(`   row ${String(r.row).padStart(4)}  ${pad(r.slug, 26)} ${r.name}`)
    console.log()
  }

  if (missingFromSheet.length) {
    console.log(`ℹ️  IN SANITY, NOT IN THE SHEET — ${missingFromSheet.length}`)
    console.log(`   The reconciler would ADD these rows (normal for new companies).`)
    for (const s of missingFromSheet) console.log(`   ${s}`)
    console.log()
  }

  if (typedCurrentYear.length) {
    console.log(`⚠️  HAND-TYPED ${currentYear} VALUES ON FORMULA ROWS — ${typedCurrentYear.length}`)
    console.log(`   These rows are set to auto-update, so the reconciler would replace`)
    console.log(`   the typed number with a GOOGLEFINANCE formula.`)
    for (const t of typedCurrentYear) console.log(`   row ${String(t.row).padStart(4)}  ${pad(t.slug, 26)} "${t.value}"`)
    console.log()
  }

  if (sheetDups.length) {
    console.log(`⚠️  DUPLICATE SLUGS IN THE SHEET — ${sheetDups.length}`)
    for (const d of sheetDups) console.log(`   ${pad(d.slug, 26)} rows ${d.rows.join(', ')}`)
    console.log()
  }
  if (sanityDups.length) {
    console.log(`⚠️  DUPLICATE SLUGS IN SANITY — ${sanityDups.length}`)
    for (const s of sanityDups) console.log(`   ${s}`)
    console.log()
  }

  const total =
    sheetOnlyDiffs.length +
    conflicts.length +
    noSlugRows.length +
    sheetOnlyRows.length +
    typedCurrentYear.length +
    sheetDups.length +
    sanityDups.length
  console.log(total === 0 ? '✅ No mismatches — the sheet matches Sanity.\n' : `${total} item(s) to review.\n`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
