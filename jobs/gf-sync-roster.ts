// Roster reconciler for the Google Finance valuation sheet.
//
// Keeps the new GF sheet in sync with the Sanity roster WITHOUT ever touching
// existing valuation data:
//   • adds a row for every roster company missing from the sheet (metadata +
//     FX_to_USD formula + current-year GOOGLEFINANCE formula),
//   • syncs the metadata columns (name/sector/data type/data source/ticker/
//     exchange/Currency) for existing rows from Sanity,
//   • reports duplicate slugs, orphan rows (slug no longer in Sanity), and rows
//     whose ticker GOOGLEFINANCE can't resolve (needs manual re-tickering).
//
// It NEVER writes the year value columns of existing rows, nor vetting_status /
// Notes / last_updated. The current-year formula references the row's ticker +
// FX_to_USD cells, so fixing a ticker in Sanity self-heals the value on the next
// run — no formula rewrite needed.
//
// DRY RUN BY DEFAULT — prints the plan and writes nothing. Pass `--apply` to write.
//   Env: GF_SHEET_ID (+ GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS),
//        SANITY_PROJECT_ID, SANITY_DATASET, SANITY_AUTH_TOKEN. Optional GF_SHEET_TAB.
// Run: npm run gf-sync-roster            # dry run
//      npm run gf-sync-roster -- --apply # write
import {google} from 'googleapis'
import {fetchRoster, sanityClient, type Company} from './lib.ts'
import {gfSymbolFor, fxFormula, marketCapFormula, colLetter} from './gfTicker.ts'

const APPLY = process.argv.includes('--apply')

type SheetTarget = {
  sheets: ReturnType<typeof google.sheets>
  spreadsheetId: string
  tab: string
}

async function openSheet(): Promise<SheetTarget> {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const auth = new google.auth.GoogleAuth({
    credentials: json ? JSON.parse(json) : undefined,
    keyFile: json ? undefined : process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({version: 'v4', auth})
  const spreadsheetId = process.env.GF_SHEET_ID as string
  if (!spreadsheetId) throw new Error('Set GF_SHEET_ID (the Google Finance sheet id).')
  const meta = await sheets.spreadsheets.get({spreadsheetId})
  const tab = process.env.GF_SHEET_TAB ?? meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1'
  return {sheets, spreadsheetId, tab}
}

const findCol = (headerLower: string[], ...names: string[]): number => {
  for (const n of names) {
    const i = headerLower.indexOf(n)
    if (i >= 0) return i
  }
  return -1
}

/** Read slug → exchange from the old FMP sheet (which has the exchange FMP's
 *  profile reported, e.g. NASDAQ/NYSE) as a supplement, since Sanity doesn't
 *  carry it. Empty map if the sheet is unset/unreadable. */
async function readFmpExchanges(sheets: SheetTarget['sheets'], id: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  try {
    const meta = await sheets.spreadsheets.get({spreadsheetId: id})
    const tab = meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1'
    const resp = await sheets.spreadsheets.values.get({spreadsheetId: id, range: tab})
    const rows = resp.data.values ?? []
    const HH = (rows[0] ?? []).map((h) => String(h).trim().toLowerCase())
    const si = HH.indexOf('slug')
    const ei = HH.indexOf('exchange')
    if (si < 0 || ei < 0) return out
    for (let r = 1; r < rows.length; r++) {
      const slug = String(rows[r]?.[si] ?? '').trim()
      const ex = String(rows[r]?.[ei] ?? '').trim()
      if (slug && ex && ex.toUpperCase() !== 'NA') out.set(slug, ex)
    }
  } catch {
    /* old sheet gone/unshared → no supplement */
  }
  return out
}

/** Sanity company → the managed metadata each column should hold (by col-key).
 *  Ticker column is kept BARE (symbol only); Exchange is its own column. If the
 *  Sanity ticker is still a combined "EXCH:SYMBOL", it's split here so the sheet
 *  stays consistent. */
function managedValues(c: Company, fmpExchange: Map<string, string>): Record<string, string> {
  const raw = (c.ticker ?? '').trim()
  const bareTicker = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw
  const prefixFromTicker = raw.includes(':') ? raw.slice(0, raw.indexOf(':')).toUpperCase() : ''
  // Prefer the Sanity `exchange` field; else a prefix embedded in the ticker;
  // else the FMP-sheet bridge (for companies not yet backfilled).
  const exchange =
    (c.exchange ?? '').trim().toUpperCase() || prefixFromTicker || (fmpExchange.get(c.slug ?? '') ?? '')
  return {
    slug: c.slug ?? '',
    name: c.name ?? '',
    sector: c.sector ?? '',
    type: c.valuation_type ?? 'market_cap',
    source: c.dataSourceName ?? '',
    ticker: bareTicker,
    exchange,
    currency: gfSymbolFor(bareTicker, exchange).currency,
  }
}

/** A company gets a live GOOGLEFINANCE formula only when its data source is NOT
 *  manual (manual = human-entered value), it's a market-cap company, and it has a
 *  ticker. Matches the old FMP ingest, which fetched everything except `manual`. */
function wantsGfFormula(c: Company): boolean {
  return c.dataSourceType !== 'manual' && (c.valuation_type ?? 'market_cap') === 'market_cap' && !!c.ticker
}

async function main() {
  const t = await openSheet()
  const roster = await fetchRoster(sanityClient())
  // Supplement blank exchanges (bare US tickers) from the old FMP sheet.
  const fmpExchange = process.env.SHEET_ID
    ? await readFmpExchanges(t.sheets, process.env.SHEET_ID)
    : new Map<string, string>()

  const resp = await t.sheets.spreadsheets.values.get({spreadsheetId: t.spreadsheetId, range: t.tab})
  const rows = resp.data.values ?? []
  if (rows.length === 0) {
    throw new Error('Sheet is empty — add the header row first (see docs/GOOGLE_FINANCE.md → New-sheet schema).')
  }
  const header = rows[0].map((h) => String(h ?? ''))
  const H = header.map((h) => h.trim().toLowerCase())
  const col: Record<string, number> = {
    slug: findCol(H, 'slug'),
    name: findCol(H, 'name'),
    sector: findCol(H, 'sector'),
    type: findCol(H, 'data type', 'type'),
    source: findCol(H, 'data source', 'data_source'),
    ticker: findCol(H, 'ticker'),
    exchange: findCol(H, 'exchange'),
    currency: findCol(H, 'currency'),
    fx: findCol(H, 'fx_to_usd', 'fx to usd', 'fx'),
  }
  if (col.slug < 0) throw new Error('Sheet needs a `slug` column (the join key).')

  const yearCols = H.map((h, i) => ({i, h})).filter(({h}) => /^\d{4}$/.test(h))
  const currentYear = new Date().getFullYear()
  const curYearCol = yearCols.find((y) => y.h === String(currentYear))?.i ?? -1

  // Existing rows by slug (+ duplicate detection). Track the last row that
  // actually has a slug so appends land right after the real data, not after any
  // trailing empty grid rows Sheets may return.
  const bySlug = new Map<string, {row1: number; cells: string[]}>()
  const dupSlugs: string[] = []
  let lastSlugRow = 1 // header
  for (let r = 1; r < rows.length; r++) {
    const cells = (rows[r] ?? []).map((c) => String(c ?? ''))
    const slug = (cells[col.slug] ?? '').trim()
    if (!slug) continue
    lastSlugRow = r + 1
    if (bySlug.has(slug)) dupSlugs.push(slug)
    else bySlug.set(slug, {row1: r + 1, cells})
  }
  const rosterSlugs = new Set(roster.map((c) => c.slug).filter(Boolean) as string[])
  const orphans = [...bySlug.keys()].filter((s) => !rosterSlugs.has(s))

  // Classify: new companies to add, metadata cells to update, needs-review.
  const toAdd: Company[] = []
  const metaUpdates: {range: string; value: string}[] = []
  const formulaUpdates: {range: string; value: string}[] = [] // current-year formula (USER_ENTERED)
  const review: string[] = []
  const rosterSeen = new Set<string>()
  const rosterDups: string[] = []
  for (const c of roster) {
    if (!c.slug) continue
    if (rosterSeen.has(c.slug)) {
      rosterDups.push(c.slug) // two Sanity docs share a slug — skip, warn, fix in Sanity
      continue
    }
    rosterSeen.add(c.slug)
    const r = gfSymbolFor(c.ticker ?? '', c.exchange)
    if (r.review && wantsGfFormula(c)) {
      review.push(`  ${c.slug}: ${r.review} (${c.ticker})`)
    }
    const managed = managedValues(c, fmpExchange)
    const existing = bySlug.get(c.slug)
    if (!existing) {
      toAdd.push(c)
      continue
    }
    for (const [key, val] of Object.entries(managed)) {
      const ci = col[key]
      if (ci < 0 || val === '') continue
      const cur = (existing.cells[ci] ?? '').trim()
      if (cur !== val) metaUpdates.push({range: `${t.tab}!${colLetter(ci)}${existing.row1}`, value: val})
    }
    // Refresh the current-year formula for api companies (the reconciler owns it),
    // so the new bare-ticker + separate-exchange format reaches existing rows.
    if (wantsGfFormula(c) && curYearCol >= 0 && col.ticker >= 0 && col.fx >= 0) {
      formulaUpdates.push({
        range: `${t.tab}!${colLetter(curYearCol)}${existing.row1}`,
        value: marketCapFormula(col.exchange, col.ticker, col.fx, existing.row1),
      })
    }
  }

  // Build the new-company rows (with correct row numbers so per-row formulas
  // reference the right cells). Appended right after the last existing row.
  const startRow1 = lastSlugRow + 1
  const newRows: (string | number)[][] = toAdd.map((c, k) => {
    const row1 = startRow1 + k
    const managed = managedValues(c, fmpExchange)
    const cells: (string | number)[] = new Array(header.length).fill('')
    for (const [key, val] of Object.entries(managed)) {
      if (col[key] >= 0) cells[col[key]] = val
    }
    if (col.currency >= 0 && col.fx >= 0) cells[col.fx] = fxFormula(col.currency, row1)
    if (wantsGfFormula(c) && curYearCol >= 0 && col.ticker >= 0 && col.fx >= 0) {
      cells[curYearCol] = marketCapFormula(col.exchange, col.ticker, col.fx, row1)
    }
    return cells
  })

  // ---- Report ----
  console.log(`Sheet "${t.tab}"  ·  ${rows.length - 1} rows  ·  roster ${roster.length} companies`)
  console.log(`Columns: ${Object.entries(col).filter(([, v]) => v >= 0).map(([k]) => k).join(', ')}` +
    `  ·  year cols: ${yearCols.map((y) => y.h).join(', ') || '(none)'}`)
  if (curYearCol < 0) {
    console.log(`⚠ No current-year column "${currentYear}" — add it to the header so new rows get live formulas (rollover automation is a follow-up).`)
  }
  console.log(`\n+ Add ${toAdd.length} new companies:`)
  for (const c of toAdd) console.log(`  ${c.slug}  (${gfSymbolFor(c.ticker ?? '', c.exchange).gfTicker || c.ticker || 'no ticker'})`)
  console.log(`\n~ ${metaUpdates.length} metadata + ${formulaUpdates.length} current-year formula updates on existing rows.`)
  if (rosterDups.length) console.log(`\n⚠ Duplicate slugs in Sanity (only the first is added — fix in Studio): ${[...new Set(rosterDups)].join(', ')}`)
  if (dupSlugs.length) console.log(`\n⚠ Duplicate slugs in the sheet (fix manually): ${[...new Set(dupSlugs)].join(', ')}`)
  if (orphans.length) console.log(`\n⚠ Orphan rows (slug not in Sanity — left as-is): ${orphans.join(', ')}`)
  if (review.length) console.log(`\n⚠ Needs re-tickering in Sanity (GF can't resolve):\n${review.join('\n')}`)

  if (!APPLY) {
    console.log(`\n(dry run — nothing written. Re-run with --apply to write.)`)
    return
  }

  // ---- Apply ----
  if (newRows.length) {
    await t.sheets.spreadsheets.values.update({
      spreadsheetId: t.spreadsheetId,
      range: `${t.tab}!A${startRow1}`,
      valueInputOption: 'USER_ENTERED', // so =GOOGLEFINANCE lands as a live formula
      requestBody: {values: newRows},
    })
  }
  if (metaUpdates.length) {
    await t.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: t.spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW', // metadata is plain text
        data: metaUpdates.map((u) => ({range: u.range, values: [[u.value]]})),
      },
    })
  }
  if (formulaUpdates.length) {
    await t.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: t.spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED', // formulas
        data: formulaUpdates.map((u) => ({range: u.range, values: [[u.value]]})),
      },
    })
  }
  console.log(`\n✓ Wrote ${newRows.length} new rows + ${metaUpdates.length} metadata + ${formulaUpdates.length} formula updates. Past years, vetting, and notes untouched.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
