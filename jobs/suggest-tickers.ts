// Suggest a stock ticker for every public company in Sanity that lacks one, by
// searching FMP by company name. Writes a review CSV (jobs/ticker-suggestions.csv)
// with the uncertain matches floated to the top. You eyeball/fix it, then run
// `npm run apply-tickers` to write the confirmed tickers back to Sanity.
//
// FMP's *search* returns global symbols (incl. .PA/.T), so this populates tickers
// for non-US companies too — they just won't have fetchable market-cap data until
// you move off the US-only Starter plan.
import {writeFileSync} from 'node:fs'
import {FMP_API_KEY, fetchRoster, sanityClient, sleep, toCsv, type Company, type ValuationType} from './lib.ts'
import {TICKER_OVERRIDES} from './ticker-overrides.ts'

// Draft the Sanity "Primary metric": public (found a ticker) → market cap;
// PSM sector → yearly revenue; everything else (private) → fundraising valuation.
// A draft only — the human reviewer overrides in the CSV (e.g. sports leagues).
function draftType(company: Company, ticker: string): ValuationType {
  if ((company.sector ?? '').trim().toLowerCase() === 'psm') return 'yearly_revenue'
  return ticker ? 'market_cap' : 'fundraising_valuation'
}

// Normalize a name for fuzzy comparison: drop case, punctuation, legal/structural suffixes.
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(
      /\b(the|inc|incorporated|corp|corporation|company|co|ltd|limited|plc|sa|se|ag|nv|holdings?|group|class [a-c])\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

type FmpHit = {
  symbol: string
  name: string
  currency?: string
  exchange?: string
  exchangeFullName?: string
}

// On the Starter (US) plan these are the exchanges with usable data; we bias toward them.
const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX', 'NYSEARCA', 'OTC'])

async function fetchHits(endpoint: 'search-name' | 'search-symbol', query: string): Promise<FmpHit[]> {
  // FMP "stable" endpoints (the legacy /api/v3/search 403s on current keys).
  const url = `https://financialmodelingprep.com/stable/${endpoint}?query=${encodeURIComponent(
    query,
  )}&limit=20&apikey=${FMP_API_KEY}`
  const res = await fetch(url)
  if (!res.ok) {
    if (res.status === 401 || res.status === 403)
      throw new Error(`FMP rejected the key (${res.status}). Check FMP_API_KEY in jobs/.env.`)
    return []
  }
  const json = await res.json().catch(() => [])
  return Array.isArray(json) ? (json as FmpHit[]) : []
}

async function search(name: string): Promise<FmpHit[]> {
  const hits = await fetchHits('search-name', name)
  // Acronym / ticker-like names (DJT, MSGE, AMCN…) are missed by name search but
  // found by symbol search — merge those candidates in.
  if (/^[A-Za-z0-9]{1,6}$/.test(name.trim())) {
    const bySymbol = await fetchHits('search-symbol', name.trim())
    const seen = new Set(hits.map((h) => h.symbol))
    for (const h of bySymbol) if (!seen.has(h.symbol)) hits.push(h)
  }
  return hits
}

type Confidence = 'high' | 'medium' | 'low' | 'none'
type Suggestion = {
  company: Company
  ticker: string
  matchedName: string
  exchange: string
  confidence: Confidence
  alternatives: string
}

function pickBest(company: Company, hits: FmpHit[]): Suggestion {
  const target = norm(company.name)
  const scored = hits
    .map((h) => {
      const hn = norm(h.name)
      let score = 0
      if (hn === target) score = 100
      else if (hn.startsWith(target) || target.startsWith(hn)) score = 80
      else if (hn.includes(target) || target.includes(hn)) score = 60
      else {
        const a = new Set(target.split(' '))
        const b = new Set(hn.split(' '))
        const overlap = [...a].filter((t) => b.has(t)).length
        score = overlap >= 1 ? 30 + overlap * 5 : 0
      }
      if (US_EXCHANGES.has(h.exchange ?? '')) score += 8 // prefer US listings on Starter
      if (!h.symbol.includes('.')) score += 3 // prefer plain (usually US) symbols
      return {h, score}
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)

  const top = scored[0]
  const alternatives = scored
    .slice(0, 3)
    .map((s) => `${s.h.symbol} (${s.h.exchange ?? '?'})`)
    .join(' | ')
  if (!top) return {company, ticker: '', matchedName: '', exchange: '', confidence: 'none', alternatives: ''}

  const second = scored[1]
  const clear = !second || top.score - second.score >= 20
  let confidence: Confidence =
    top.score >= 100 && clear ? 'high' : top.score >= 60 ? 'medium' : 'low'
  // Short names (MLS, PBS, EA…) exact-match unrelated same-named firms — never
  // auto-trust them; force a human look.
  if (confidence === 'high' && target.length <= 4) confidence = 'medium'

  return {
    company,
    ticker: top.h.symbol,
    matchedName: top.h.name,
    exchange: top.h.exchange ?? top.h.exchangeFullName ?? '',
    confidence,
    alternatives,
  }
}

async function main() {
  if (!FMP_API_KEY) throw new Error('Set FMP_API_KEY in jobs/.env first.')
  const client = sanityClient()
  const roster = await fetchRoster(client)

  // Companies that should carry a ticker: market-cap type (or unset), no ticker yet.
  const needTicker = roster.filter((c) => (c.valuation_type ?? 'market_cap') === 'market_cap' && !c.ticker)
  const haveTicker = roster.filter((c) => (c.valuation_type ?? 'market_cap') === 'market_cap' && c.ticker)
  const privateCos = roster.filter((c) => (c.valuation_type ?? 'market_cap') !== 'market_cap')

  console.log(
    `Roster: ${roster.length}. Need ticker: ${needTicker.length}. ` +
      `Already have one: ${haveTicker.length}. Private/PSM (skipped): ${privateCos.length}.`,
  )
  if (needTicker.length === 0) {
    console.log('Nothing to look up — every market-cap company already has a ticker.')
    return
  }

  const suggestions: Suggestion[] = []
  for (let i = 0; i < needTicker.length; i++) {
    const c = needTicker[i]
    try {
      suggestions.push(pickBest(c, await search(c.name)))
    } catch (err) {
      console.error(`\n${(err as Error).message}`)
      process.exit(1)
    }
    if ((i + 1) % 20 === 0) console.log(`  …${i + 1}/${needTicker.length}`)
    await sleep(250) // stay well under FMP's rate limit
  }

  // Apply curated overrides (they win over the fuzzy guess), then sort so the
  // rows a human still needs to vet float to the top and trusted ones sink.
  const built = suggestions.map((s) => {
    const ov = TICKER_OVERRIDES[s.company.slug ?? '']
    const type = ov?.type ?? draftType(s.company, s.ticker)
    const ticker = ov ? (ov.ticker ?? '') : type === 'market_cap' ? s.ticker : ''
    const status = ov ? 'curated' : s.confidence
    // Lower priority sorts to the top (more review needed).
    const priority = ov
      ? 5
      : type !== 'market_cap'
        ? 4 // private/PSM, no ticker — usually fine as drafted
        : s.confidence === 'high'
          ? 3
          : s.confidence === 'medium'
            ? 1
            : 0 // none/low market-cap — definitely check
    return {
      cells: [
        s.company.slug ?? '',
        s.company.name,
        s.company.sector ?? '',
        type,
        ticker,
        status,
        s.matchedName,
        s.exchange,
        s.alternatives,
      ] as (string | number)[],
      priority,
      name: s.company.name,
    }
  })
  built.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))

  const header = [
    'slug',
    'company',
    'sector',
    'suggested_type',
    'suggested_ticker',
    'confidence',
    'matched_name',
    'exchange',
    'alternatives',
  ]
  writeFileSync('ticker-suggestions.csv', toCsv([header, ...built.map((b) => b.cells)]))

  const counts = built.reduce(
    (m, b) => ((m[String(b.cells[5])] = (m[String(b.cells[5])] ?? 0) + 1), m),
    {} as Record<string, number>,
  )
  console.log('\nWrote jobs/ticker-suggestions.csv')
  console.log('Status breakdown:', counts)
  console.log(
    '\nReview top-down: `none`/`low`/`medium` market-cap rows need a ticker check ' +
      '(use the alternatives column); `curated` + `high` are trustworthy. ' +
      'Then run `npm run apply-tickers`.',
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
