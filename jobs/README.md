# Data jobs

Standalone scripts (not part of the app build) that bootstrap and ingest valuation
data. Run with [`tsx`](https://github.com/privatenumber/tsx). See PHASES.md §4c.

## Setup (once)

```bash
cd jobs
npm install
cp .env.example .env      # then fill in FMP_API_KEY + your Sanity creds
```

`jobs/.env` (gitignored):
- `FMP_API_KEY` — FMP key (Starter is fine for the US-only MVP).
- `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_AUTH_TOKEN` — copy from `studio/.env`.
  The token must be an **Editor** (write) token for `apply-tickers`.

## Ticker bootstrap

Populate each public company's `ticker` in Sanity without typing them by hand.

```bash
npm run suggest-tickers   # → writes ticker-suggestions.csv (uncertain rows on top)
# open the CSV, fix the none/low/medium rows, blank out any that are actually private
npm run apply-tickers     # writes the confirmed tickers back to Sanity
```

`suggest-tickers` searches FMP by company name. It populates non-US tickers too
(they just won't have fetchable market-cap data until you leave the US-only plan).

## Valuation ingest

_(next — `ingest-valuations.ts`: reconcile the Google Sheet from the Sanity roster +
pull FMP market caps. Added after the ticker bootstrap is verified.)_
