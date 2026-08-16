# Google Finance transition (FMP → GOOGLEFINANCE)

Status: **in progress** (branch `google-finance-alternative`). Goal: replace the
paid FMP market-cap ingest with free Google Finance data.

## The key architectural fact

`GOOGLEFINANCE()` is a **Google Sheets formula, not a REST API.** You can't call
it from the Node/FMP tooling in [jobs/](../jobs). So the market-cap source moves
**out of the ingest job and into the sheet itself** — live formulas in the
current-year column.

**The app is unchanged.** It reads the published CSV
([src/loadValuations.ts](../src/loadValuations.ts)) no matter how the sheet is
populated. This whole transition is data-pipeline only.

Decisions (this branch): **live formulas** in the sheet (no Apps Script / freeze),
and **historical years handled manually** (Google Finance can't return historical
market cap — its history is price/volume only).

## The formula

Each current-year cell returns market cap in **billions USD**:

```
# US listing (already USD):
=IFERROR(GOOGLEFINANCE("NASDAQ:AAPL","marketcap")/1e9,"")

# Non-US listing (convert local currency → USD):
=IFERROR(GOOGLEFINANCE("NSE:RELIANCE","marketcap")*GOOGLEFINANCE("CURRENCY:INRUSD")/1e9,"")
```

`IFERROR(…, "")` keeps a transient `#N/A` from corrupting the published CSV — the
cell just goes blank that refresh, and the app falls back exactly as today.

## Generating the formulas

`jobs/gf-formulas.ts` converts every stored ticker into a GOOGLEFINANCE symbol +
paste-ready formula, in the sheet's row order:

```bash
cd jobs
VALUATIONS_CSV_URL="<published CSV link from app .env.local>" npm run gf-formulas
# → jobs/gf-formulas.csv (columns: slug, name, ticker, gf_ticker, currency,
#   needs_review, formula). Paste the `formula` column down the current-year
#   column; rows flagged `needs_review` are blank — handle them manually.
```

Ticker suffix → GOOGLEFINANCE exchange prefix + currency (see `SUFFIX_MAP` in the
script): `.T`→TYO/JPY, `.HK`→HKG/HKD, `.SS`→SHA/CNY, `.SZ`→SHE/CNY, `.L`→LON/GBP,
`.PA`→EPA/EUR, `.DE`→ETR/EUR, `.F`→FRA/EUR, `.MI`→BIT/EUR, `.AX`→ASX/AUD,
`.KS`→KRX/KRW, `.NS`→NSE/INR, `.TO`→TSE/CAD, … US (no suffix) → NASDAQ:/NYSE:.

## The re-tickering problem (biggest task)

The Sanity tickers were chosen for FMP, which happily uses **OTC/ADR pink-sheet
symbols** for many non-US names — and **GOOGLEFINANCE can't resolve most OTC pink
tickers**. So these come out `needs_review` and must be re-pointed at a
**primary-exchange listing** (local currency, converted) or a **major US-listed
ADR** (NYSE/NASDAQ, USD, no conversion — GF *does* support those):

| Company | Stored (FMP) | Use for Google Finance | Currency |
|---|---|---|---|
| Reliance | `RLNIY` (OTC) | `NSE:RELIANCE` | INR |
| Tencent | `TCTZF` (OTC) | `HKG:0700` | HKD |
| Samsung | `SSNLF` (OTC) | `KRX:005930` | KRW |
| ProSieben | `PBSFY` (OTC) | `ETR:PSM` | EUR |
| Alibaba | (varies) | `NYSE:BABA` *(USD ADR — simplest)* or `HKG:9988` | USD / HKD |

(Verify each in the sheet — GF resolves a symbol if `=GOOGLEFINANCE("SYM","price")`
returns a number.) Private companies (ByteDance, TikTok US, SpaceX, OpenAI,
Anthropic) have no ticker and stay manual regardless of provider.

## Caveats to watch

- **OTC/ADR pink sheets** → mostly unsupported by GF; re-ticker (above).
- **London (`LON:`)** quotes *prices* in pence (GBX); confirm whether `marketcap`
  comes back in GBP or GBX before trusting the conversion.
- **Currency values** (`CURRENCY:xxxUSD`) are live-only in GF (no history), which
  is fine for the live current-year cell.
- **Spot-check the converted numbers** against a known source — GF's non-US market
  caps and share counts can be off (same caution the FMP notes call out).
- **~20-min delay + periodic recalc** — the current-year value drifts intraday;
  acceptable for a "current" snapshot.

## Retiring FMP

Once the current-year formulas are trusted, the FMP ingest
([jobs/ingest-valuations.ts](../jobs/ingest-valuations.ts)) is no longer the
market-cap source. Keep it around until the sheet is fully on GF; then drop the
`FMP_API_KEY` dependency. `suggest-tickers.ts` (FMP name search) can still help
find primary-listing symbols, or retire it too.
