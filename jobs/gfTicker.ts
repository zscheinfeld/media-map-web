// Shared GOOGLEFINANCE ticker + formula helpers for the Google Finance tooling
// (gf-formulas.ts preview + gf-sync-roster.ts reconciler).
//
// Converts a stored ticker into a GOOGLEFINANCE symbol + its listing currency.
// Accepts three shapes:
//   • already GF format  "NSE:RELIANCE"  → passed through; currency from the prefix
//   • FMP suffix         "RELIANCE.NS"   → mapped to "NSE:RELIANCE" (+ INR)
//   • plain US symbol    "AAPL" (+exch)  → "NASDAQ:AAPL" (+ USD)
// OTC/ADR pink sheets (no dot, no exchange) can't be resolved reliably → flagged.

// GOOGLEFINANCE exchange prefix → listing currency.
export const GX_CCY: Record<string, string> = {
  NASDAQ: 'USD', NYSE: 'USD', NYSEAMERICAN: 'USD', BATS: 'USD',
  TYO: 'JPY', HKG: 'HKD', SHA: 'CNY', SHE: 'CNY', LON: 'GBP',
  EPA: 'EUR', AMS: 'EUR', EBR: 'EUR', ETR: 'EUR', FRA: 'EUR', BIT: 'EUR', BME: 'EUR',
  ASX: 'AUD', KRX: 'KRW', KOSDAQ: 'KRW', NSE: 'INR', BOM: 'INR',
  TSE: 'CAD', CVE: 'CAD', SWX: 'CHF', STO: 'SEK', OSL: 'NOK', SGX: 'SGD',
  TPE: 'TWD', BMV: 'MXN', JSE: 'ZAR', BKK: 'THB',
}

// FMP ticker suffix → GOOGLEFINANCE exchange prefix.
const SUFFIX_GX: Record<string, string> = {
  T: 'TYO', HK: 'HKG', SS: 'SHA', SZ: 'SHE', L: 'LON', PA: 'EPA', AS: 'AMS',
  BR: 'EBR', DE: 'ETR', F: 'FRA', MI: 'BIT', MC: 'BME', AX: 'ASX', KS: 'KRX',
  KQ: 'KOSDAQ', NS: 'NSE', BO: 'BOM', TO: 'TSE', V: 'CVE', SW: 'SWX', ST: 'STO',
  OL: 'OSL', SI: 'SGX', TW: 'TPE', TWO: 'TPE', MX: 'BMV', JO: 'JSE', BK: 'BKK',
}

// US exchange names as they appear in the sheet/Sanity → GF prefix.
const US_EXCHANGE: Record<string, string> = {
  NASDAQ: 'NASDAQ', NYSE: 'NYSE', 'NYSE AMERICAN': 'NYSEAMERICAN',
  NYSEAMERICAN: 'NYSEAMERICAN', AMEX: 'NYSEAMERICAN', BATS: 'BATS',
}

export type GfResolved = {
  /** GOOGLEFINANCE symbol, e.g. "NSE:RELIANCE" — '' when unresolvable. */
  gfTicker: string
  /** Listing currency, e.g. "INR". '' when unknown. */
  currency: string
  /** Non-empty when the row needs a human to fix the ticker (OTC/ADR/unknown). */
  review: string
}

/** Map a stored ticker (+ optional exchange) to a GOOGLEFINANCE symbol + currency. */
export function resolveGf(ticker: string, exchange = ''): GfResolved {
  const t = (ticker ?? '').trim()
  const ex = (exchange ?? '').trim().toUpperCase()
  if (!t || t.toUpperCase() === 'NA') return {gfTicker: '', currency: '', review: 'no ticker'}

  // Already a GOOGLEFINANCE symbol ("EXCH:SYMBOL").
  if (t.includes(':')) {
    const gx = t.slice(0, t.indexOf(':')).toUpperCase()
    return {gfTicker: t, currency: GX_CCY[gx] ?? '', review: GX_CCY[gx] ? '' : `unknown GF prefix ${gx}`}
  }

  // FMP suffix ("SYMBOL.NS").
  const dot = t.lastIndexOf('.')
  if (dot >= 0) {
    const base = t.slice(0, dot)
    const suf = t.slice(dot + 1).toUpperCase()
    const gx = SUFFIX_GX[suf]
    if (gx) return {gfTicker: `${gx}:${base}`, currency: GX_CCY[gx] ?? '', review: ''}
    return {gfTicker: '', currency: '', review: `unknown suffix .${suf}`}
  }

  // Plain symbol.
  if (US_EXCHANGE[ex]) return {gfTicker: `${US_EXCHANGE[ex]}:${t}`, currency: 'USD', review: ''}
  if (ex) return {gfTicker: t, currency: 'USD', review: `unmapped exchange "${exchange}"`}
  // No exchange info (the Sanity roster doesn't carry it). Bare US symbols resolve
  // on GOOGLEFINANCE as-is, so DON'T flag them; only flag the classic OTC-ADR shape
  // — 5 letters ending F (foreign ordinary) or Y (ADR), e.g. RLNIY / TCTZF / PBSFY —
  // which GF usually can't resolve and needs re-tickering to a primary listing.
  const otc = /^[A-Z]{4}[FY]$/.test(t.toUpperCase())
  return {gfTicker: t, currency: 'USD', review: otc ? 'likely OTC ADR — re-ticker to primary listing' : ''}
}

/** Build the GOOGLEFINANCE symbol from a (bare) ticker + separate exchange code.
 *  This is the new model: Sanity stores `ticker` bare + `exchange` (e.g. NASDAQ),
 *  and we combine them → "NASDAQ:AAPL". Falls back to `resolveGf` when there's no
 *  exchange (a bare US ticker, or a legacy already-prefixed / suffixed ticker). */
export function gfSymbolFor(ticker: string, exchange?: string): GfResolved {
  const t = (ticker ?? '').trim()
  const ex = (exchange ?? '').trim().toUpperCase()
  if (!t || t.toUpperCase() === 'NA') return {gfTicker: '', currency: '', review: 'no ticker'}
  if (t.includes(':')) return resolveGf(t) // already a full GF symbol (not yet split)
  if (ex) {
    // OTCMKTS (US over-the-counter) is a valid GF prefix but spans every country,
    // so its currency can't be inferred — it comes from the Sanity override.
    if (ex === 'OTCMKTS' || ex === 'OTC') return {gfTicker: `${ex}:${t}`, currency: '', review: ''}
    const ccy = GX_CCY[ex] ?? ''
    return {gfTicker: `${ex}:${t}`, currency: ccy, review: ccy ? '' : `unknown exchange ${ex}`}
  }
  return resolveGf(t) // bare symbol → US-as-is or OTC-ADR flag
}

/** 0-based column index → A1 letter (0→A, 26→AA). */
export function colLetter(idx: number): string {
  let n = idx
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

/** FX_to_USD cell formula (references the row's Currency cell). */
export function fxFormula(currencyCol: number, row1: number): string {
  const c = `${colLetter(currencyCol)}${row1}`
  return `=IF(${c}="USD",1,IFERROR(GOOGLEFINANCE("CURRENCY:"&${c}&"USD"),""))`
}

/** Current-year cell formula: market cap → billions USD.
 *
 *  GOOGLEFINANCE's `marketcap` attribute is NOT returned in a stable currency for
 *  dual-listed tickers — even with an exchange prefix. Observed on `HKG:9988`
 *  (Alibaba): USD one day, HKD the next, USD again the day after; `NYSE:SONY` went
 *  JPY → USD in a day. A hand-set Currency column can't follow that, so the map
 *  showed $2,159B / $36B / $0.90B on those days.
 *
 *  So the formula computes BOTH readings — "this is local currency" (× FX) and
 *  "this is already USD" (× 1) — and keeps whichever is closer to LAST YEAR's
 *  value in the same row. A flip is never subtle (8× for HKD, 150× for JPY, 1,400×
 *  for KRW), so the choice is unambiguous where it matters. Currencies near
 *  parity (EUR, GBP, CAD, AUD — rate between ½ and 2) are deliberately LEFT
 *  ALONE: there a flip is only a 15–40% error, which is indistinguishable from a
 *  genuine year-over-year move, and simulating against the live roster showed the
 *  test would "correct" real changes on those rows. With no prior-year number (a
 *  new company, or a `-`), also falls back to the local reading — i.e. the
 *  previous behaviour.
 *
 *  The sheet keeps Ticker BARE (e.g. AAPL) and Exchange separate (NASDAQ), so the
 *  GF symbol is built inline: EXCH:TICKER when an exchange is present, else the
 *  bare ticker. References the row's exchange + ticker + FX_to_USD + prior-year
 *  cells. `prevYearCol` < 0 → no disambiguation (plain local reading). */
export function marketCapFormula(
  exchangeCol: number,
  tickerCol: number,
  fxCol: number,
  row1: number,
  prevYearCol = -1,
): string {
  const t = `${colLetter(tickerCol)}${row1}`
  const fx = `${colLetter(fxCol)}${row1}`
  const ex = exchangeCol >= 0 ? `${colLetter(exchangeCol)}${row1}` : ''
  const sym = ex ? `IF(${ex}="",${t},${ex}&":"&${t})` : t
  if (prevYearCol < 0) return `=IFERROR(GOOGLEFINANCE(${sym},"marketcap")*${fx}/1e9,"")`
  const prev = `${colLetter(prevYearCol)}${row1}`
  // raw = Google's number in billions; loc = read as local currency; usd = read as
  // already-USD. Pick by log-distance to last year so 8× and ⅛× are treated alike.
  return (
    `=IFERROR(LET(raw,GOOGLEFINANCE(${sym},"marketcap")/1e9,loc,raw*${fx},prev,${prev},` +
    `IF(OR(NOT(ISNUMBER(prev)),prev<=0,ABS(LN(${fx}))<LN(2)),loc,` +
    `IF(ABS(LN(loc/prev))<=ABS(LN(raw/prev)),loc,raw))),"")`
  )
}
