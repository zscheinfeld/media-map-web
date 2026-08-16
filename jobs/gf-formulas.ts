// Google Finance transition helper.
//
// GOOGLEFINANCE is a *Google Sheets formula*, not an API — so the market-cap
// ingest moves out of this Node/FMP tooling and into the sheet itself. This
// script does the one tedious mechanical part: converting each company's stored
// ticker (FMP-style, e.g. `RELIANCE.NS`) into a GOOGLEFINANCE symbol
// (`NSE:RELIANCE`) and emitting a paste-ready formula that returns the market cap
// in **billions USD** (with per-exchange currency conversion baked in).
//
// It reads the CURRENTLY PUBLISHED valuations sheet (same row order), so the
// generated `formula` column can be pasted straight down the current-year column
// and lines up 1:1. Rows GF can't resolve confidently (OTC/ADR pink sheets, no
// ticker) are flagged `needs_review` and left blank for manual handling.
//
// Run: VALUATIONS_CSV_URL=<published csv url> npm run gf-formulas
//   (or: npm run gf-formulas -- ./some-local.csv)
// Output: jobs/gf-formulas.csv
import {writeFileSync, readFileSync} from 'node:fs'
import {parseCsv, toCsv} from './lib.ts'

// FMP suffix → [GOOGLEFINANCE exchange prefix, listing currency]. Market cap for
// a non-US listing comes back in the listing currency, so we multiply by
// CURRENCY:<ccy>USD. US listings (no suffix) are already USD.
const SUFFIX_MAP: Record<string, {gx: string; ccy: string}> = {
  T: {gx: 'TYO', ccy: 'JPY'},
  HK: {gx: 'HKG', ccy: 'HKD'},
  SS: {gx: 'SHA', ccy: 'CNY'},
  SZ: {gx: 'SHE', ccy: 'CNY'},
  L: {gx: 'LON', ccy: 'GBP'}, // NB: London quotes prices in pence; verify marketcap unit
  PA: {gx: 'EPA', ccy: 'EUR'},
  AS: {gx: 'AMS', ccy: 'EUR'},
  BR: {gx: 'EBR', ccy: 'EUR'},
  DE: {gx: 'ETR', ccy: 'EUR'},
  F: {gx: 'FRA', ccy: 'EUR'},
  MI: {gx: 'BIT', ccy: 'EUR'},
  MC: {gx: 'BME', ccy: 'EUR'},
  AX: {gx: 'ASX', ccy: 'AUD'},
  KS: {gx: 'KRX', ccy: 'KRW'},
  KQ: {gx: 'KOSDAQ', ccy: 'KRW'},
  NS: {gx: 'NSE', ccy: 'INR'},
  BO: {gx: 'BOM', ccy: 'INR'},
  TO: {gx: 'TSE', ccy: 'CAD'},
  V: {gx: 'CVE', ccy: 'CAD'},
  SW: {gx: 'SWX', ccy: 'CHF'},
  ST: {gx: 'STO', ccy: 'SEK'},
  OL: {gx: 'OSL', ccy: 'NOK'},
  SI: {gx: 'SGX', ccy: 'SGD'},
  TW: {gx: 'TPE', ccy: 'TWD'},
  TWO: {gx: 'TPE', ccy: 'TWD'},
  MX: {gx: 'BMV', ccy: 'MXN'},
  JO: {gx: 'JSE', ccy: 'ZAR'},
  BK: {gx: 'BKK', ccy: 'THB'},
}

// US exchanges as they appear in the sheet's `exchange` column → GF prefix.
const US_EXCHANGE: Record<string, string> = {
  NASDAQ: 'NASDAQ',
  NYSE: 'NYSE',
  'NYSE AMERICAN': 'NYSEAMERICAN',
  NYSEAMERICAN: 'NYSEAMERICAN',
  AMEX: 'NYSEAMERICAN',
  BATS: 'BATS',
}

type Resolved = {gfTicker: string; ccy: string; review: string}

/** Map a stored ticker (+ its sheet exchange) to a GOOGLEFINANCE symbol + currency. */
function resolve(ticker: string, exchange: string): Resolved {
  const t = ticker.trim()
  const ex = exchange.trim().toUpperCase()
  if (!t || t.toUpperCase() === 'NA') return {gfTicker: '', ccy: '', review: 'no ticker'}

  const dot = t.lastIndexOf('.')
  if (dot >= 0) {
    const base = t.slice(0, dot)
    const suf = t.slice(dot + 1).toUpperCase()
    const m = SUFFIX_MAP[suf]
    if (m) return {gfTicker: `${m.gx}:${base}`, ccy: m.ccy, review: ''}
    return {gfTicker: '', ccy: '', review: `unknown suffix .${suf}`}
  }

  // No suffix → a US listing (prefix by exchange) OR an OTC/ADR pink-sheet symbol
  // (no exchange in the sheet). GOOGLEFINANCE is unreliable for OTC pink tickers,
  // so flag those rather than emit a formula that silently returns #N/A.
  if (US_EXCHANGE[ex]) return {gfTicker: `${US_EXCHANGE[ex]}:${t}`, ccy: 'USD', review: ''}
  if (!ex) return {gfTicker: t, ccy: 'USD', review: 'OTC/ADR? verify GF coverage'}
  return {gfTicker: t, ccy: 'USD', review: `unmapped exchange "${exchange}"`}
}

/** Paste-ready cell formula → market cap in billions USD (blank on error). */
function formulaFor(r: Resolved): string {
  if (!r.gfTicker) return ''
  const cap = `GOOGLEFINANCE("${r.gfTicker}","marketcap")`
  const usd = r.ccy && r.ccy !== 'USD' ? `${cap}*GOOGLEFINANCE("CURRENCY:${r.ccy}USD")` : cap
  return `=IFERROR(${usd}/1e9,"")`
}

async function loadCsvText(): Promise<string> {
  const arg = process.argv[2]
  if (arg) return readFileSync(arg, 'utf8')
  const url = process.env.VALUATIONS_CSV_URL
  if (!url) {
    throw new Error(
      'Set VALUATIONS_CSV_URL (the published-CSV link, copy from the app .env.local ' +
        'VITE_VALUATIONS_CSV_URL) or pass a local CSV path as the first argument.',
    )
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`)
  return res.text()
}

async function main() {
  const rows = parseCsv(await loadCsvText())
  if (rows.length < 2) throw new Error('Sheet has no data rows.')
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const slugIdx = header.indexOf('slug')
  const nameIdx = header.indexOf('name')
  const tickerIdx = header.indexOf('ticker')
  const exIdx = header.indexOf('exchange')
  if (slugIdx < 0 || tickerIdx < 0) throw new Error('Sheet needs at least `slug` and `ticker` columns.')

  const out: (string | number)[][] = [['slug', 'name', 'ticker', 'gf_ticker', 'currency', 'needs_review', 'formula']]
  let ok = 0
  let review = 0
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const slug = (row[slugIdx] ?? '').trim()
    if (!slug) continue
    const ticker = row[tickerIdx] ?? ''
    const exchange = exIdx >= 0 ? (row[exIdx] ?? '') : ''
    const r = resolve(ticker, exchange)
    const formula = formulaFor(r)
    if (formula && !r.review) ok++
    if (r.review) review++
    out.push([
      slug,
      nameIdx >= 0 ? (row[nameIdx] ?? '') : '',
      ticker,
      r.gfTicker,
      r.ccy,
      r.review,
      formula,
    ])
  }

  writeFileSync('gf-formulas.csv', toCsv(out))
  console.log(
    `Wrote jobs/gf-formulas.csv — ${out.length - 1} rows, ${ok} auto-mapped, ${review} need review.\n` +
      `Paste the "formula" column down the current-year column (rows are in sheet order).\n` +
      `Rows flagged in "needs_review" (OTC/ADR, unknown suffix, no ticker) are left blank — handle manually.`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
