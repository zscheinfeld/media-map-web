// Curated source of truth for ticker + primary metric, keyed by Sanity slug.
// These WIN over the fuzzy name match in suggest-tickers, and survive re-runs —
// so a corrected company never reverts to a bad guess when the script runs again.
//
// This is where the round-trip lands: when the client vets the spreadsheet and
// you hand the corrections back, they get folded in here, and the next
// suggest-tickers run + handoff only contains genuinely new/unreviewed companies.
//
//   {ticker, type:'market_cap'}         → public; use exactly this ticker.
//   {type:'fundraising_valuation'}      → private; clears any bad public match.
//   {type:'yearly_revenue'}             → PSM/revenue (usually auto from sector).
export type Override = {
  ticker?: string
  type?: 'market_cap' | 'fundraising_valuation' | 'yearly_revenue'
}

export const TICKER_OVERRIDES: Record<string, Override> = {
  // ── Public, corrected: the name search matched the wrong same-named company ──
  meta: {ticker: 'META', type: 'market_cap'},
  sirius: {ticker: 'SIRI', type: 'market_cap'}, // Sirius XM (not SiriusPoint)
  zoom: {ticker: 'ZM', type: 'market_cap'}, // Zoom Video (not a JP audio co)
  nyt: {ticker: 'NYT', type: 'market_cap'},
  unity: {ticker: 'U', type: 'market_cap'}, // Unity Software (not a bank)
  ea: {ticker: 'EA', type: 'market_cap'}, // Electronic Arts
  apollo: {ticker: 'APO', type: 'market_cap'}, // Apollo Global Management
  charter: {ticker: 'CHTR', type: 'market_cap'}, // Charter Communications
  gannett: {ticker: 'GCI', type: 'market_cap'},
  rogers: {ticker: 'RCI', type: 'market_cap'}, // Rogers Communications
  'take-two': {ticker: 'TTWO', type: 'market_cap'},
  'at-t': {ticker: 'T', type: 'market_cap'},
  newscorp: {ticker: 'NWSA', type: 'market_cap'}, // News Corp
  amcn: {ticker: 'AMCX', type: 'market_cap'}, // AMC Networks
  fox: {ticker: 'FOX', type: 'market_cap'}, // Fox Corp (FOX or FOXA)
  'paramount-skydance': {ticker: 'PSKY', type: 'market_cap'},
  sony: {ticker: 'SONY', type: 'market_cap'}, // NYSE ADR

  // ── Private: clear the bad public-namesake the search latched onto ──
  a24: {type: 'fundraising_valuation'},
  angel: {type: 'fundraising_valuation'}, // Angel Studios
  bloomberg: {type: 'fundraising_valuation'}, // Bloomberg LP
  concord: {type: 'fundraising_valuation'}, // Concord (music)
  cox: {type: 'fundraising_valuation'}, // Cox Enterprises
  epic: {type: 'fundraising_valuation'}, // Epic Games
  hallmark: {type: 'fundraising_valuation'},
  neon: {type: 'fundraising_valuation'}, // NEON (film distributor)
  valve: {type: 'fundraising_valuation'},
  vox: {type: 'fundraising_valuation'}, // Vox Media
  nielsen: {type: 'fundraising_valuation'}, // taken private in 2022
}
