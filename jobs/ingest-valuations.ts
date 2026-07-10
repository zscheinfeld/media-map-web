// Build the `market_cap` valuation sheet from Sanity + FMP.
//
// For every market-cap company with a ticker, pull FMP's daily historical market
// cap (2015→now, in ≤4-year windows to stay under the per-call history cap),
// sample the latest value in each month, and emit one row per company with a
// column per month. Non-US tickers (402 on the US-only Starter plan), tickerless,
// and private/PSM companies come out as "NA" / blank for manual entry.
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

const pad2 = (n: number) => String(n).padStart(2, '0')

/** "YYYY-MM" from 2015-01 through the current month. */
function buildMonths(endYear: number, endMonth: number): string[] {
  const months: string[] = []
  for (let y = START_YEAR; y <= endYear; y++) {
    const last = y === endYear ? endMonth : 12
    for (let m = 1; m <= last; m++) months.push(`${y}-${pad2(m)}`)
  }
  return months
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

/** month "YYYY-MM" → latest market cap that month, in billions (rounded to 2dp). */
function monthlyBillions(daily: HistPoint[]): Record<string, number> {
  const byMonth: Record<string, {date: string; cap: number}> = {}
  for (const p of daily) {
    if (!p?.date || typeof p.marketCap !== 'number') continue
    const m = p.date.slice(0, 7)
    if (!byMonth[m] || p.date > byMonth[m].date) byMonth[m] = {date: p.date, cap: p.marketCap}
  }
  const out: Record<string, number> = {}
  for (const m of Object.keys(byMonth)) out[m] = Math.round((byMonth[m].cap / 1e9) * 100) / 100
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

/** Force the month columns to a plain number format. A freshly created month
 *  column can otherwise inherit a neighbour's date format, which renders market
 *  caps as dates (e.g. 151.61 → "1900-05-30") and breaks the published-CSV parse.
 *  Only the month block is touched — vetting_status validation etc. is untouched. */
async function enforceMonthFormat(t: SheetTarget, firstMonthCol: number, monthCount: number): Promise<void> {
  await t.sheets.spreadsheets.batchUpdate({
    spreadsheetId: t.spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {sheetId: t.sheetId, startRowIndex: 1, startColumnIndex: firstMonthCol, endColumnIndex: firstMonthCol + monthCount},
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
 *  manual "Notes"), and each row's raw cells (to carry those extra columns over). */
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
  const monthCols = headerLower.map((h, i) => ({i, h})).filter(({h}) => /^\d{4}-\d{2}$/.test(h))
  for (let r = 1; r < rows.length; r++) {
    const row = (rows[r] ?? []).map((c) => String(c ?? ''))
    const slug = (row[slugIdx] ?? '').trim()
    if (!slug) continue
    const months = new Map<string, number>()
    for (const {i, h} of monthCols) {
      const cell = (row[i] ?? '').trim()
      if (!cell || cell.toUpperCase() === 'NA') continue
      const n = Number(cell.replace(/[$,\s]/g, ''))
      if (Number.isFinite(n)) months.set(h, n)
    }
    values.set(slug, months)
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
  // The grid only grows (new month columns / companies), so nothing is orphaned;
  // a removed company just leaves a stale row the app ignores (not in the roster).
  await t.sheets.spreadsheets.values.update({
    spreadsheetId: t.spreadsheetId,
    range: `${t.tabName}!A1`,
    valueInputOption: 'RAW',
    requestBody: {values: grid},
  })
}

async function main() {
  if (!FMP_API_KEY) throw new Error('Set FMP_API_KEY in jobs/.env first.')
  const now = new Date()
  const endYear = now.getFullYear()
  const endMonth = now.getMonth() + 1
  const months = buildMonths(endYear, endMonth)
  const windows = buildWindows(endYear)
  const today = now.toISOString().slice(0, 10) // YYYY-MM-DD — the "last updated" stamp

  const roster = await fetchRoster(sanityClient())
  const fetchable = roster.filter((c) => (c.valuation_type ?? 'market_cap') === 'market_cap' && c.ticker)

  // Write mode (Action / service account): read the sheet first so manually-
  // entered private/PSM values survive the overwrite. Else → local CSV.
  const writeMode = isWriteMode()
  let target: SheetTarget | null = null
  let preserve = new Map<string, Map<string, number>>()
  let preserveTicker = new Map<string, string>()
  let preserveHeader: string[] = []
  let preserveRaw = new Map<string, string[]>()
  if (writeMode) {
    target = await openSheet()
    const ex = await readExisting(target)
    preserve = ex.values
    preserveTicker = ex.tickers
    preserveHeader = ex.header
    preserveRaw = ex.rawBySlug
    console.log(`Write mode → tab "${target.tabName}". Preserving values, vetting_status + manual columns from ${preserve.size} existing rows.`)
  }
  console.log(`${roster.length} companies; ${fetchable.length} market-cap with a ticker. Columns: ${months.length} months.`)

  // Emit columns newest-month-first, so the current month sits just right of
  // `type` (easy to edit, no scrolling) and each new month lands at the left.
  const cols = [...months].reverse()
  const currentMonth = months[months.length - 1] // the only month a daily run refreshes

  // Column layout: keep the sheet's existing non-month columns (their ORDER +
  // any extra columns like a manual "Notes"), then append the canonical month
  // columns. Managed fields are refreshed each run; unknown columns are carried
  // over per row. On a brand-new sheet, fall back to the default layout.
  const isMonth = (h: string) => /^\d{4}-\d{2}$/.test(h.trim())
  const DEFAULT_LEAD = ['slug', 'name', 'sector', 'type', 'ticker', 'vetting_status', 'exchange', 'fmp_company', 'last_updated']
  const leadHeader = preserveHeader.length ? preserveHeader.filter((h) => !isMonth(h)) : DEFAULT_LEAD
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
    let exchange = ''
    let fmpCompany = ''
    let lastUpdated = ''
    let valueCells: (string | number)[]
    if (type === 'market_cap' && ticker) {
      const prof = await fetchProfile(ticker)
      exchange = prof.exchange
      fmpCompany = prof.name
      if (!prof.covered) {
        valueCells = cols.map(() => 'NA') // ticker not on this plan (non-US on Starter)
        na++
      } else {
        const existing = preserve.get(c.slug ?? '')
        const prevTicker = preserveTicker.get(c.slug ?? '')
        // A changed ticker (edited in Sanity) invalidates the stored history —
        // it belonged to the OLD symbol. Force a full re-pull for the new one.
        const tickerChanged = !!prevTicker && prevTicker.toUpperCase() !== ticker.toUpperCase()
        const hasHistory = !!existing && !tickerChanged && [...existing.keys()].some((m) => m !== currentMonth)
        if (hasHistory) {
          // DAILY: history is frozen — preserve every past month from the sheet,
          // refresh ONLY the current month from the live profile.
          valueCells = cols.map((m) =>
            m === currentMonth ? prof.marketCapB ?? existing.get(m) ?? '' : existing.get(m) ?? '',
          )
          lastUpdated = today
          filled++
        } else {
          // BACKFILL: first time we've seen this company, OR its ticker changed →
          // re-pull the entire history for the (new) symbol.
          if (tickerChanged) console.log(`  ticker changed for "${c.slug}": ${prevTicker} → ${ticker} — re-pulling full history`)
          const {covered, daily} = await fetchHistory(ticker, windows)
          if (!covered || daily.length === 0) {
            valueCells = cols.map(() => 'NA')
            na++
          } else {
            const mb = monthlyBillions(daily)
            valueCells = cols.map((m) => (m in mb ? mb[m] : ''))
            lastUpdated = today
            filled++
          }
        }
      }
      if (++done % 20 === 0) console.log(`  …${done}/${fetchable.length} processed`)
      await sleep(150)
    } else {
      // private / PSM / no ticker → keep any manual value already in the sheet
      const ex = preserve.get(c.slug ?? '')
      valueCells = cols.map((m) => ex?.get(m) ?? '')
    }
    // vetting_status is CLIENT-OWNED — the action never writes it. It's preserved
    // per row by the unknown-column carry-over below (blank on brand-new rows).
    const managed = new Map<string, string | number>([
      ['slug', c.slug ?? ''],
      ['name', c.name],
      ['sector', c.sector ?? ''],
      ['type', type],
      ['ticker', ticker],
      ['exchange', exchange],
      ['fmp_company', fmpCompany],
      ['last_updated', lastUpdated],
    ])
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
    await writeGrid(target, grid)
    await enforceMonthFormat(target, grid[0].length - cols.length, cols.length)
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
