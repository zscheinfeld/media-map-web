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

  // Plain symbol → US listing by exchange, else OTC/ADR (GF unreliable) → flag.
  if (US_EXCHANGE[ex]) return {gfTicker: `${US_EXCHANGE[ex]}:${t}`, currency: 'USD', review: ''}
  if (!ex) return {gfTicker: t, currency: 'USD', review: 'OTC/ADR? verify GF coverage'}
  return {gfTicker: t, currency: 'USD', review: `unmapped exchange "${exchange}"`}
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

/** Current-year cell formula: market cap × FX ÷ 1e9 (billions USD), referencing
 *  the row's ticker + FX_to_USD cells. Blank when there's no GF ticker. */
export function marketCapFormula(hasGfTicker: boolean, tickerCol: number, fxCol: number, row1: number): string {
  if (!hasGfTicker) return ''
  const t = `${colLetter(tickerCol)}${row1}`
  const fx = `${colLetter(fxCol)}${row1}`
  return `=IFERROR(GOOGLEFINANCE(${t},"marketcap")*${fx}/1e9,"")`
}
