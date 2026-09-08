# Google Finance transition (FMP → GOOGLEFINANCE)

Status: **LIVE** (merged to `main`; cut over 2026-09-08). The public app reads the
Google Finance sheet, the Sanity-webhook reconciler keeps it in sync, and FMP is
retained only as the tested rollback target. Goal (met): replace the paid FMP
market-cap ingest with free Google Finance data.

## The key architectural fact

`GOOGLEFINANCE()` is a **Google Sheets formula, not a REST API.** You can't call
it from the Node/FMP tooling in [jobs/](../jobs). So the market-cap source moves
**out of the ingest job and into the sheet itself** — live formulas in the
current-year column.

**The app is unchanged.** It reads the published CSV
([src/loadValuations.ts](../src/loadValuations.ts)) no matter how the sheet is
populated. This whole transition is data-pipeline only.

Decisions (this branch):
- **Fresh sheet** for Google Finance; the old FMP sheet + its nightly Action stay untouched as a reference.
- **Live formulas** in the current-year column; **historical years entered manually**.
- **Currency + FX_to_USD columns** so every year reads in billions USD.
- **Year columns newest-first** (`2026 … 2015`) — cosmetic only; the app matches by header name, not position.
- **Year rollover:** keep the current year live all year; when a new year starts, **freeze the just-ended year in place** (formula → its last value) and open a new live column. *(No Oct-1 snapshot for now — revisit at the next rollover.)*
- A scheduled **roster reconciler** keeps the sheet in sync with Sanity (adds new companies, dedups, syncs metadata, does the rollover) — **append/metadata-only, never overwrites existing year values**.

## New-sheet schema

Left → right. Only **`slug`** and the **year columns** are load-bearing for the app
([src/loadValuations.ts](../src/loadValuations.ts) joins by `slug`, reads any
`/^\d{4}$/` header); the rest is for humans + sorting.

| Column | Filled by | Notes |
|---|---|---|
| `slug` | reconciler (from Sanity) | **Required** — the join key. |
| `name`, `sector`, `data type`, `data source` | reconciler (mirrors Sanity) | metadata sync; safe to sort by. |
| `ticker` | reconciler | the **GOOGLEFINANCE symbol** (e.g. `NSE:RELIANCE`, `NASDAQ:AAPL`). |
| `exchange` | reconciler | display. |
| `Currency` | reconciler | listing currency (`USD`/`INR`/…). |
| `FX_to_USD` | formula | `=IF(Currency="USD",1,IFERROR(GOOGLEFINANCE("CURRENCY:"&Currency&"USD"),""))` |
| `vetting_status`, `Notes` | you | never touched by the reconciler. |
| `last_updated` | you (optional) | drives the "current month" label; else calendar month. |
| `2026` (current) | live formula | `=IFERROR(GOOGLEFINANCE(ticker,"marketcap")*FX_to_USD/1e9,"")` → billions USD. |
| `2025 … 2015` | you (manual) | static billions-USD snapshots. |

**Sorting is safe:** the app and the reconciler both key off `slug`, and Google
Sheets keeps *same-row* relative references valid through sorts + column moves — and
every per-row formula here references only cells in its own row.

## Year rollover (automated by the reconciler)

Each year column lives its whole life in place — live formula while it's the
running year, frozen static value forever after:

- **New calendar year, no column yet** → insert a new leftmost column (e.g. `2027`) with the live formula; it becomes the current year.
- **A prior year's column still has formulas** → read its computed values and write them back as **static numbers** (the freeze). Runs once at the roll; the value is whatever the formula last held (~year-end). No Oct-1 capture for now.

## Migration plan

Legend: 🤖 = code/tooling (this repo) · 🧑 = manual step (Google Sheets / GitHub /
Netlify). Ordered so the map never runs on stale data and rollback is one env flip.

### Phase 1 — Tooling (🤖, in this branch) ✅ built
- [x] `jobs/gfTicker.ts` — shared ticker→GOOGLEFINANCE + currency + formula helpers.
- [x] `jobs/gf-formulas.ts` — offline preview CSV (`npm run gf-formulas`); optional now that the reconciler populates the sheet directly.
- [x] `jobs/gf-sync-roster.ts` — the **reconciler** (`npm run gf-sync-roster`): adds new companies (with formulas), syncs metadata, dedups, flags orphans + needs-review. **Dry-run by default; `--apply` writes. Never touches existing year values / vetting / notes.**
- [x] `jobs/switch-datasource-to-gf.ts` — bulk re-point companies' `data_source` FMP → Google Finance (+ `--deprecate-fmp`).
- [x] `.github/workflows/gf-sync-roster.yml` — nightly + `workflow_dispatch` + `repository_dispatch` (webhook), `--apply`, targets `GF_SHEET_ID`.
- [ ] *Follow-up:* automate the year rollover (freeze prior year + insert new column) inside the reconciler.

### Phase 2 — Create & populate the new sheet (🧑) ✅ done
- [x] New Google Sheet created (`GF_SHEET_ID` = `1hDi6Kw55yGSDk5f0FWNDLW7JNbwiVb9TZrJzd4pZMZE`), shared Editor with the service account, header row set. Note: a **KEY/legend row sits above the header** and headers carry **🔒/✏️ emoji markers** — all tooling normalizes emoji and finds the header row by locating `slug`.
- [x] Reconciler run + re-tickered the roster in Sanity. Key findings (in [[gf-exchange-support]] memory): GOOGLEFINANCE has **no data for TYO/SHA** → Japanese names use `OTCMKTS:<US OTC ticker>` reporting in JPY; Sony uses `NYSE:SONY` (JPY). A **Currency override** field on the company (+ entity) handles OTCMKTS/ADR cases; KRX (Samsung/LG) verified real via implied-share-count. Non-US primary listings work on HKG/LON/NSE/EPA/ETR/AMS/TSE/SHE/ASX/BIT/BME/STO/KRX.
- [x] Past-year history filled (~123–169 companies per year, 2015→2026).
- [x] Sheet **Published to web → CSV**.

### Phase 3 — Verify on dev (🧑 + 🤖) ✅ done
- [x] `.env.local` `VITE_VALUATIONS_CSV_URL` pointed at the GF CSV; dev map verified (non-US now populated; US matches).

### Phase 4 — Wire the reconciler (🧑) ✅ done (webhook pending)
- [x] Branch merged to `main` so the workflow is on the default branch.
- [x] **GitHub secrets set** (`gh secret set`, repo `zscheinfeld/media-map-web`): `GF_SHEET_ID`, `SANITY_PROJECT_ID` (`haxcsjkn`), `SANITY_AUTH_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_JSON` (contents of the service-account key file). `SANITY_DATASET` is hardcoded `production` in the workflow.
- [x] `workflow_dispatch` test run **succeeded** (5 metadata + formula updates, 0 new).
- [x] **Sanity webhook** for instant-on-publish — **live & verified** (a company publish fires `repository_dispatch` → reconciler in ~30s). A fine-grained PAT (repo `media-map-web`, **Contents: Read/write** + Metadata) is set in the webhook's `Authorization: Bearer` header. In manage.sanity.io → **project** `haxcsjkn` → API → Webhooks:
  - URL `https://api.github.com/repos/zscheinfeld/media-map-web/dispatches`; POST; trigger Create/Update/Delete; **filter** `_type == "company"`.
  - Headers: `Authorization: Bearer <PAT>` (name=`Authorization`, value=`Bearer <token>` — no `< >`), `Accept: application/vnd.github+json`.
  - **Projection** (this is the request body): `{"event_type":"sanity-company-change"}` — must equal a `repository_dispatch.types` entry.
  - Debug via the webhook's **Attempts** log: `204` = accepted; `401 Bad credentials` = malformed/invalid token in the Authorization header; `422` = the Projection/`event_type` is wrong.

### Phase 5 — Production cut-over (🧑) ✅ done (2026-09-08)
- [x] Set `VITE_VALUATIONS_CSV_URL` in **Netlify → Environment variables** to the GF published CSV (`2PACX-1vQ6iO…`); triggered a deploy. *(Vite bakes env at build time — set it, then deploy.)*
- [x] Verified the live map (non-US companies populate). **Rollback = set the env var back to the FMP URL + redeploy.**

### Phase 6 — Retire FMP (🧑) ✅ done (2026-09-08, kept as rollback)
- [x] **`ingest-valuations` nightly schedule disabled** — the cron in [.github/workflows/ingest-valuations.yml](../.github/workflows/ingest-valuations.yml) is commented out; the workflow stays **manually runnable** (`workflow_dispatch`) so the FMP sheet can be freshened if we ever roll back.
- [ ] *Fully retire later:* delete the workflow file + `jobs/ingest-valuations.ts` and drop the `FMP_API_KEY` / `SHEET_ID` secrets. Not urgent — costs nothing sitting idle.

**Rollback target (FMP):**
- FMP published CSV URL (verified 2026-09-08 — non-US primary listings show `NA`, the pre-GF state):
  `https://docs.google.com/spreadsheets/d/e/2PACX-1vS9BZhbZLqumuFYBcEzqp33tZXaoaRjP9onsu9tgzJ2QeuE5yPxjk_6Og4JmK3FFewoj0JGIwDstPMc/pub?output=csv`
- To roll back: set Netlify `VITE_VALUATIONS_CSV_URL` to that URL → redeploy; optionally run the `ingest-valuations` workflow once (manual dispatch) to refresh the FMP sheet first. Note: rolling back re-introduces `NA` for all non-US primary listings — that's expected (it's why we moved to GF).

**Where things can go wrong:** OTC re-tickering (Phase 2) is the real work; London pence + non-US share-count accuracy need spot-checks (Phase 3); the reconciler must stay append/metadata-only (Phase 1) or it'll clobber formulas.

## The formula

The current-year cell reads the market cap in **billions USD**, pulling the rate
from the row's `FX_to_USD` column (see schema above):

```
# FX_to_USD column (row 2): 1 for USD, else the live rate:
=IF(Currency="USD",1,IFERROR(GOOGLEFINANCE("CURRENCY:"&Currency&"USD"),""))

# current-year column: market cap × FX ÷ 1e9:
=IFERROR(GOOGLEFINANCE(ticker,"marketcap")*FX_to_USD/1e9,"")
```

`IFERROR(…, "")` keeps a transient `#N/A` from corrupting the published CSV — the
cell just goes blank that refresh, and the app falls back exactly as today.
`gf-formulas.ts` currently emits a **self-contained** variant (FX baked into each
cell); it'll be reworked to the FX-column layout above as part of Phase 1.

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
