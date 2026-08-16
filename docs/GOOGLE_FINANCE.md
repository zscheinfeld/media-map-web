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
**historical years handled manually**, and a **fresh sheet** for Google Finance
(the old FMP sheet + its nightly Action stay untouched as a reference).

## Migration plan

Legend: 🤖 = code/tooling (this repo) · 🧑 = manual step (Google Sheets / GitHub /
Netlify). Ordered so the map never runs on stale data and rollback is one env flip.

### Phase 1 — Tooling (🤖, in this branch)
- [x] `jobs/gf-formulas.ts` — generate paste-ready GOOGLEFINANCE formulas from the roster's tickers (`npm run gf-formulas`).
- [ ] Extract the ticker→GF mapping into a shared module so the reconciler reuses it.
- [ ] `jobs/gf-sync-roster.ts` — the **roster reconciler**: add rows for new Sanity companies (with their GF formula), guarantee one row per slug (dedup), flag orphans. **Append/metadata-only — never writes existing rows' year values**, so formulas + manual history are safe.
- [ ] `.github/workflows/gf-sync-roster.yml` — run the reconciler weekly + on-demand, targeting the new sheet (`GF_SHEET_ID`).

### Phase 2 — Create & seed the new sheet (🧑)
- [ ] Create a **new Google Sheet** (e.g. "Media Map — valuations (Google Finance)").
- [ ] `npm run gf-formulas` → import `gf-formulas.csv` as the seed.
- [ ] Shape it for the app parser: a **`slug`** column + year columns `2015…<current>`; put the formula under the **current-year** header; fill past years manually. *(Optional `last_updated` column for the "current month" label.)*
- [ ] Re-ticker the `needs_review` rows (OTC/ADR → primary listings or major US ADRs — see table below), in Sanity or directly in the sheet.
- [ ] **Share the sheet with the service-account email** (so the reconciler can write) and **Publish to web → CSV**.

### Phase 3 — Verify on dev (🧑 + 🤖)
- [ ] Point **local** `.env.local` `VITE_VALUATIONS_CSV_URL` at the new sheet's CSV.
- [ ] Compare the dev map against the old (FMP) map — spot-check US names (should match) and each re-tickered non-US name. Fix formulas/tickers until it's right.

### Phase 4 — Wire the reconciler (🧑)
- [ ] Add the **`GF_SHEET_ID`** GitHub secret (the new sheet's ID).
- [ ] Run `gf-sync-roster` once via **workflow_dispatch**; confirm it adds any missing companies and reports no duplicates. Then let the weekly schedule take over.

### Phase 5 — Production cut-over (🧑)
- [ ] Change `VITE_VALUATIONS_CSV_URL` in **Netlify → Environment variables** to the new sheet's CSV; redeploy.
- [ ] Verify the live map. **Rollback = flip the env var back to the old URL.**

### Phase 6 — Retire FMP (🧑, once confident)
- [ ] Disable the old **`ingest-valuations`** Action (GitHub → Actions → Disable), or leave it running to keep the reference sheet fresh — your call.
- [ ] Later: drop the `FMP_API_KEY` secret and retire `jobs/ingest-valuations.ts`.

**Where things can go wrong:** OTC re-tickering (Phase 2) is the real work; London pence + non-US share-count accuracy need spot-checks (Phase 3); the reconciler must stay append/metadata-only (Phase 1) or it'll clobber formulas.

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
