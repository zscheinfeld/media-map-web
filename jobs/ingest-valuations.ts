// Build the `market_cap` valuation sheet from Sanity + FMP.
//
// For every market-cap company with a ticker, pull FMP's daily historical market
// cap (2015→now, in ≤4-year windows to stay under the per-call history cap) and
// sample ONE snapshot per YEAR: each PAST year → the last trading day ≤ Oct 1
// (the Q4-start snapshot, frozen); the CURRENT year → the latest value (refreshed
// daily), labeled in-app with its actual month. One column per year. Non-US tickers
// (402 on the US-only Starter plan), tickerless, and private/PSM companies come out
// as "NA" / blank for manual entry. See PHASES.md Phase 5.
//
// Output: jobs/market_cap.csv → import into the `market_cap` tab of the valuation
// Google Sheet (File → Import → Replace current sheet). The app reads that sheet.
//
// NOTE (MVP): re-importing replaces the whole tab, so manual private/PSM values
// entered in the Sheet would be overwritten. The production job (service account,
// writes individual cells) preserves them — see PHASES.md §4c step ⑤.
import {writeFileSync} from 'node:fs'
import {google} from 'googleapis'
import {FMP_API_KEY, fetchRoster, sanityClient, sleep, toCsv} from './lib.ts'

const START_YEAR = 2015

/** Year strings "2015" … endYear (one column per year). */
function buildYears(endYear: number): string[] {
  const years: string[] = []
  for (let y = START_YEAR; y <= endYear; y++) years.push(String(y))
  return years
}

/** ≤4-year [from,to] windows so each history call stays under FMP's range cap. */
function buildWindows(endYear: number): [string, string][] {
  const wins: [string, string][] = []
  for (let y = START_YEAR; y <= endYear; y += 4) {
    wins.push([`${y}-01-01`, `${Math.min(y + 3, endYear)}-12-31`])
  }
  return wins
}

type HistPoint = {date: string; marketCap: number}

/** Daily market-cap history for a ticker. `covered=false` → not in the plan (NA). */
async function fetchHistory(ticker: string, windows: [string, string][]): Promise<{covered: boolean; daily: HistPoint[]}> {
  const daily: HistPoint[] = []
  for (const [from, to] of windows) {
    const url =
      `https://financialmodelingprep.com/stable/historical-market-capitalization` +
      `?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&limit=2000&apikey=${FMP_API_KEY}`
    const res = await fetch(url)
    if (res.status === 401) throw new Error('FMP rejected the key (401). Check FMP_API_KEY in jobs/.env.')
    if (res.status === 402 || res.status === 403) return {covered: false, daily: []} // not in this plan (e.g. non-US on Starter)
    if (res.ok) {
      const json = await res.json().catch(() => [])
      if (Array.isArray(json)) daily.push(...(json as HistPoint[]))
    }
    await sleep(200)
  }
  return {covered: true, daily}
}

/** Year "YYYY" → snapshot market cap in billions (2dp).
 *  Past years: the last daily point in [Jan 1 … Oct 1] of that year (the Q4-start
 *  snapshot; blank if the company wasn't trading yet). Current year: latest point. */
function yearlyBillions(daily: HistPoint[], currentYear: number): Record<string, number> {
  const toB = (cap: number) => Math.round((cap / 1e9) * 100) / 100
  const pts = daily
    .filter((p) => p?.date && typeof p.marketCap === 'number')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const out: Record<string, number> = {}
  if (pts.length === 0) return out
  for (let y = START_YEAR; y <= currentYear; y++) {
    if (y === currentYear) {
      out[String(y)] = toB(pts[pts.length - 1].marketCap) // latest overall
      continue
    }
    const lo = `${y}-01-01`
    const hi = `${y}-10-01`
    let best: HistPoint | undefined
    for (const p of pts) {
      if (p.date > hi) break // sorted ascending → nothing later can qualify
      if (p.date >= lo) best = p
    }
    if (best) out[String(y)] = toB(best.marketCap)
  }
  return out
}

const SUFFIX_EXCHANGE: Record<string, string> = {
  T: 'Tokyo', PA: 'Euronext Paris', L: 'London', KS: 'Korea (KOSPI)', KQ: 'Korea (KOSDAQ)',
  HK: 'Hong Kong', DE: 'XETRA', F: 'Frankfurt', MI: 'Milan', SS: 'Shanghai', SZ: 'Shenzhen',
  TO: 'Toronto', V: 'TSX Venture', AS: 'Euronext Amsterdam', BR: 'Euronext Brussels',
  ST: 'Stockholm', OL: 'Oslo', SW: 'SIX Swiss', BO: 'Bombay', NS: 'NSE India',
  TW: 'Taiwan', TWO: 'Taipei', MX: 'Mexico', JO: 'Johannesburg', SI: 'Singapore', BK: 'Thailand',
}

/** Readable exchange from a ticker suffix (used when the profile isn't on the plan). */
function inferExchange(ticker: string): string {
  const dot = ticker.lastIndexOf('.')
  if (dot < 0) return '' // plain symbol = US; profile fills the exact exchange when covered
  const suf = ticker.slice(dot + 1).toUpperCase()
  return SUFFIX_EXCHANGE[suf] ?? suf
}

type Profile = {covered: boolean; exchange: string; name: string; marketCapB?: number}

/** FMP profile → exchange, resolved name, and the CURRENT market cap (billions). */
async function fetchProfile(ticker: string): Promise<Profile> {
  const url = `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(ticker)}&apikey=${FMP_API_KEY}`
  const res = await fetch(url)
  if (res.status === 401) throw new Error('FMP rejected the key (401). Check FMP_API_KEY in jobs/.env.')
  if (res.status === 402 || res.status === 403 || !res.ok)
    return {covered: false, exchange: inferExchange(ticker), name: ''}
  const json = await res.json().catch(() => [])
  const p = Array.isArray(json) ? json[0] : null
  if (!p) return {covered: false, exchange: inferExchange(ticker), name: ''}
  const marketCapB = typeof p.marketCap === 'number' ? Math.round((p.marketCap / 1e9) * 100) / 100 : undefined
  return {covered: true, exchange: p.exchange ?? inferExchange(ticker), name: p.companyName ?? '', marketCapB}
}

// ── Google Sheets write mode (Action / service account) ─────────────────────
type SheetTarget = {sheets: ReturnType<typeof google.sheets>; spreadsheetId: string; tabName: string; sheetId: number}

const isWriteMode = () =>
  !!(process.env.SHEET_ID && (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS))

async function openSheet(): Promise<SheetTarget> {
  // The Action passes the key as JSON content (a secret); locally you can instead
  // point GOOGLE_APPLICATION_CREDENTIALS at the downloaded key file.
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const auth = new google.auth.GoogleAuth({
    credentials: json ? JSON.parse(json) : undefined,
    keyFile: json ? undefined : process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({version: 'v4', auth})
  const spreadsheetId = process.env.SHEET_ID as string
  // Target the named tab if given, else the first sheet in the spreadsheet.
  const meta = await sheets.spreadsheets.get({spreadsheetId})
  const tabName = process.env.SHEET_TAB ?? meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1'
  const sheetId = meta.data.sheets?.find((s) => s.properties?.title === tabName)?.properties?.sheetId ?? 0
  return {sheets, spreadsheetId, tabName, sheetId}
}

/** Force the year value columns to a plain number format. A freshly created year
 *  column can otherwise inherit a neighbour's date format, which renders market
 *  caps as dates (e.g. 151.61 → "1900-05-30") and breaks the published-CSV parse.
 *  Only the value block is touched — vetting_status validation etc. is untouched. */
async function enforceNumberFormat(t: SheetTarget, firstValCol: number, valCount: number): Promise<void> {
  await t.sheets.spreadsheets.batchUpdate({
    spreadsheetId: t.spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {sheetId: t.sheetId, startRowIndex: 1, startColumnIndex: firstValCol, endColumnIndex: firstValCol + valCount},
            cell: {userEnteredFormat: {numberFormat: {type: 'NUMBER', pattern: '0.##'}}},
            fields: 'userEnteredFormat.numberFormat',
          },
        },
      ],
    },
  })
}

/** Existing sheet state preserved across runs: per-slug month values, vetting
 *  status, the ticker each row was built from (to detect Sanity ticker changes),
 *  the raw header (so we keep the sheet's column ORDER + any extra columns like a
 *  manual "Notes"), and each row's raw cells (to carry those extra columns over).
 *  Value columns are keyed by year ("YYYY"). */
async function readExisting(
  t: SheetTarget,
): Promise<{
  values: Map<string, Map<string, number>>
  status: Map<string, string>
  tickers: Map<string, string>
  header: string[]
  rawBySlug: Map<string, string[]>
}> {
  const values = new Map<string, Map<string, number>>()
  const status = new Map<string, string>()
  const tickers = new Map<string, string>()
  const rawBySlug = new Map<string, string[]>()
  const resp = await t.sheets.spreadsheets.values.get({spreadsheetId: t.spreadsheetId, range: t.tabName})
  const rows = resp.data.values ?? []
  if (rows.length < 2) return {values, status, tickers, header: [], rawBySlug}
  const header = rows[0].map((h) => String(h))
  const headerLower = header.map((h) => h.trim().toLowerCase())
  const slugIdx = headerLower.indexOf('slug')
  if (slugIdx < 0) return {values, status, tickers, header, rawBySlug}
  const statusIdx = headerLower.indexOf('vetting_status')
  const tickerIdx = headerLower.indexOf('ticker')
  const yearCols = headerLower.map((h, i) => ({i, h})).filter(({h}) => /^\d{4}$/.test(h))
  for (let r = 1; r < rows.length; r++) {
    const row = (rows[r] ?? []).map((c) => String(c ?? ''))
    const slug = (row[slugIdx] ?? '').trim()
    if (!slug) continue
    const yearsVals = new Map<string, number>()
    for (const {i, h} of yearCols) {
      const cell = (row[i] ?? '').trim()
      if (!cell || cell.toUpperCase() === 'NA') continue
      const n = Number(cell.replace(/[$,\s]/g, ''))
      if (Number.isFinite(n)) yearsVals.set(h, n)
    }
    values.set(slug, yearsVals)
    const st = statusIdx >= 0 ? (row[statusIdx] ?? '').trim() : ''
    if (st) status.set(slug, st)
    const tk = tickerIdx >= 0 ? (row[tickerIdx] ?? '').trim() : ''
    if (tk) tickers.set(slug, tk)
    rawBySlug.set(slug, row)
  }
  return {values, status, tickers, header, rawBySlug}
}

async function writeGrid(t: SheetTarget, grid: (string | number)[][]): Promise<void> {
  // In-place value update (NO clear): the Sheets values API overwrites only cell
  // VALUES — it leaves formatting, column widths, and data validation untouched.
  // The grid only grows (new year columns / companies), so nothing is orphaned;
  // a removed company just leaves a stale row the app ignores (not in the roster).
  await t.sheets.spreadsheets.values.update({
    spreadsheetId: t.spreadsheetId,
    range: `${t.tabName}!A1`,
    valueInputOption: 'RAW',
    requestBody: {values: grid},
  })
}

/** One-time sweep for the monthly→yearly migration: clears ONLY cell VALUES over
 *  the whole tab (formatting + data validation survive a values.clear), so the
 *  ~138 stale monthly columns don't linger to the right of the new 12 year
 *  columns. Everything worth keeping (client Notes/vetting, the lead columns) was
 *  already captured by readExisting and is rewritten by the following writeGrid. */
async function clearTabValues(t: SheetTarget): Promise<void> {
  await t.sheets.spreadsheets.values.clear({spreadsheetId: t.spreadsheetId, range: t.tabName})
}

async function main() {
  if (!FMP_API_KEY) throw new Error('Set FMP_API_KEY in jobs/.env first.')
  const now = new Date()
  const endYear = now.getFullYear()
  const years = buildYears(endYear)
  const windows = buildWindows(endYear)
  const today = now.toISOString().slice(0, 10) // YYYY-MM-DD — the "last updated" stamp

  const roster = await fetchRoster(sanityClient())
  const fetchable = roster.filter((c) => (c.valuation_type ?? 'market_cap') === 'market_cap' && c.ticker)

  // Write mode (Action / service account): read the sheet first so manually-
  // entered private/PSM values survive the overwrite. Else → local CSV.
  const writeMode = isWriteMode()
  let target: SheetTarget | null = null
  let preserve = new Map<string, Map<string, number>>()
  let preserveHeader: string[] = []
  let preserveRaw = new Map<string, string[]>()
  if (writeMode) {
    target = await openSheet()
    const ex = await readExisting(target)
    preserve = ex.values
    preserveHeader = ex.header
    preserveRaw = ex.rawBySlug
    console.log(`Write mode → tab "${target.tabName}". Preserving values, vetting_status + manual columns from ${preserve.size} existing rows.`)
  }
  console.log(`${roster.length} companies; ${fetchable.length} market-cap with a ticker. Columns: ${years.length} years.`)

  // Emit columns newest-year-first, so the current year sits just right of
  // `type` (easy to edit, no scrolling) and each new year lands at the left.
  const cols = [...years].reverse()
  const currentCol = String(endYear) // the only year column a daily run refreshes

  // Column layout: keep the sheet's existing non-year columns (their ORDER +
  // any extra columns like a manual "Notes"), then append the canonical year
  // columns. Managed fields are refreshed each run; unknown columns are carried
  // over per row. On a brand-new sheet, fall back to the default layout.
  const isYearCol = (h: string) => /^\d{4}$/.test(h.trim())
  // Legacy monthly columns ("YYYY-MM") from before the yearly migration. Dropped
  // from the lead so they aren't re-propagated, and swept once (below).
  const isLegacyMonthCol = (h: string) => /^\d{4}-\d{2}$/.test(h.trim())
  const DEFAULT_LEAD = ['slug', 'name', 'sector', 'type', 'ticker', 'vetting_status', 'exchange', 'fmp_company', 'last_updated']
  const leadHeader = preserveHeader.length
    ? preserveHeader.filter((h) => !isYearCol(h) && !isLegacyMonthCol(h))
    : DEFAULT_LEAD
  // First yearly run over a still-monthly sheet → clear stale month columns once.
  const sweepLegacy = writeMode && preserveHeader.some(isLegacyMonthCol)
  if (sweepLegacy) console.log(`Monthly→yearly migration: sweeping legacy month columns (client Notes/vetting preserved).`)
  const leadLower = leadHeader.map((h) => h.trim().toLowerCase())
  const existingColIdx = new Map<string, number>()
  preserveHeader.forEach((h, i) => existingColIdx.set(h.trim().toLowerCase(), i))

  const rows: (string | number)[][] = []
  let filled = 0
  let na = 0
  let done = 0
  for (const c of roster) {
    const type = c.valuation_type ?? 'market_cap'
    const ticker = c.ticker ?? ''
    // Manual = the company's Sanity data source is a manual one → skip FMP.
    const manual = c.dataSourceType === 'manual'
    let exchange = ''
    let fmpCompany = ''
    let lastUpdated = ''
    let valueCells: (string | number)[]
    let fetched = false
    if (type === 'market_cap' && ticker && !manual) {
      fetched = true
      const prof = await fetchProfile(ticker)
      exchange = prof.exchange
      fmpCompany = prof.name
      if (!prof.covered) {
        valueCells = cols.map(() => 'NA') // ticker not on this plan (non-US on Starter)
        na++
      } else {
        const existing = preserve.get(c.slug ?? '')
        // Once a company has ANY value on the sheet, the action ONLY touches the
        // current-year column — every past year is preserved verbatim, so the
        // client can correct historical figures (or the action just leaves them)
        // and the edit is never overwritten. History is not re-pulled on ticker
        // changes or year rollovers; the current year simply keeps updating and
        // the just-ended year freezes at whatever it last held.
        const hasHistory = !!existing && existing.size > 0
        if (hasHistory) {
          // DAILY: refresh ONLY the current-year column from the live profile;
          // preserve every other year exactly as it sits on the sheet.
          valueCells = cols.map((y) =>
            y === currentCol ? prof.marketCapB ?? existing.get(y) ?? '' : existing.get(y) ?? '',
          )
          lastUpdated = today
          filled++
        } else {
          // FIRST FILL: a brand-new company (or one whose value cells are empty)
          // → pull the full history once to seed every year. After this it has
          // values on the sheet, so subsequent runs only touch the current year.
          // (Clearing an FMP company's year cells re-triggers this — the manual
          // "refresh full history" escape hatch, e.g. after a ticker fix.)
          const {covered, daily} = await fetchHistory(ticker, windows)
          if (!covered || daily.length === 0) {
            valueCells = cols.map(() => 'NA')
            na++
          } else {
            const yb = yearlyBillions(daily, endYear)
            if (prof.marketCapB != null) yb[currentCol] = prof.marketCapB // freshest present value
            valueCells = cols.map((y) => (y in yb ? yb[y] : ''))
            lastUpdated = today
            filled++
          }
        }
      }
      if (++done % 20 === 0) console.log(`  …${done}/${fetchable.length} processed`)
      await sleep(150)
    } else {
      // Manual entry, private/PSM, or no ticker → keep the existing year values
      // (and the FMP-derived columns) exactly as-is; the action doesn't touch them.
      const ex = preserve.get(c.slug ?? '')
      valueCells = cols.map((y) => ex?.get(y) ?? '')
    }
    // vetting_status AND the "data source" column are CLIENT-OWNED — the action
    // never writes them. Both are preserved per row by the unknown-column
    // carry-over below (blank on brand-new rows). NOTE: whether a company is
    // FMP-regenerated is decided from SANITY's data source TYPE (api vs manual),
    // not from this sheet column — so leaving the column untouched here doesn't
    // change which rows get new data (only Financial Modeling Prep = api rows do).
    const managed = new Map<string, string | number>([
      ['slug', c.slug ?? ''],
      ['name', c.name],
      ['sector', c.sector ?? ''],
      ['type', type],
      ['data type', type], // alias, in case the "type" column was renamed "data type"
      ['ticker', ticker],
    ])
    // exchange / fmp_company / last_updated are FMP-derived, so only write them
    // when we actually fetched — otherwise (manual entry / no ticker) preserve them.
    if (fetched) {
      managed.set('exchange', exchange)
      managed.set('fmp_company', fmpCompany)
      managed.set('last_updated', lastUpdated)
    }
    const raw = preserveRaw.get(c.slug ?? '')
    const leadCells = leadLower.map((colLower) => {
      if (managed.has(colLower)) return managed.get(colLower) as string | number
      // Unknown column (e.g. a manual "Notes") → carry the existing value over.
      const ci = existingColIdx.get(colLower)
      return ci !== undefined && raw ? (raw[ci] ?? '') : ''
    })
    rows.push([...leadCells, ...valueCells])
  }

  const grid = [
    [...leadHeader, ...cols],
    ...rows,
  ]
  if (writeMode && target) {
    if (sweepLegacy) await clearTabValues(target)
    await writeGrid(target, grid)
    await enforceNumberFormat(target, grid[0].length - cols.length, cols.length)
    console.log(`\nWrote ${rows.length} rows directly to the sheet — ${filled} with FMP data, ${na} "NA", manual values preserved.`)
  } else {
    writeFileSync('market_cap.csv', toCsv(grid))
    console.log(
      `\nWrote jobs/market_cap.csv — ${filled} with FMP data, ${na} "NA" (not covered on Starter), the rest blank. ` +
        `Import it into the sheet, or set SHEET_ID + GOOGLE_SERVICE_ACCOUNT_JSON to write directly.`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
