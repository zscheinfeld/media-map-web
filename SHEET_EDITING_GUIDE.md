# Spreadsheet editing guide — who can edit what

This is the market-cap Google Sheet that feeds the map. A **nightly automation**
pulls fresh market caps from the data provider (Financial Modeling Prep, "FMP")
and writes them in. This guide explains which cells you can safely edit by hand
and which ones the automation manages — so nothing you type gets overwritten.

## The two systems, in one line

- **Sanity** (the CMS) owns the *structure*: which companies exist, their name,
  sector, ticker, data source, styling, positions, and connections.
- **This sheet** owns the *numbers*: each company's market cap, one column per year.

Edit structure in **Sanity**. Edit numbers in **the sheet**.

## TL;DR

- ✅ **You can freely edit** (never overwritten): `vetting_status`, `Notes`, and
  **every past-year value** (2015 → last year) for **any** company — plus **all**
  year values for manual-source companies.
- 🔒 **Automation-managed — don't hand-edit here**: `slug`, `name`, `sector`,
  `data type`, `ticker` (edit these in Sanity), `exchange`, `fmp_company`,
  `last_updated`, and the **current-year** value for FMP companies.

## Column-by-column

| Column | Who owns it | Where to edit |
|---|---|---|
| `slug`, `name`, `sector`, `data type`, `ticker` | Sanity (rewritten nightly) | **In Sanity** — sheet edits get overwritten |
| `data source` | Reference only | Shows the source set in Sanity. To *change* a company's source, do it in **Sanity** (the app reads Sanity, not this cell) |
| `exchange`, `fmp_company`, `last_updated` | Automation (FMP) | Leave alone |
| `vetting_status` | **You** | ✅ Edit freely in the sheet |
| `Notes` | **You** | ✅ Edit freely in the sheet |
| **Current-year** value (e.g. `2026`) — **FMP** companies | Automation (refreshed nightly) | Leave alone |
| **Past-year** values (2015 … last year) — **any** company | **You** | ✅ Edit freely — never overwritten |
| **All** year values — **manual** companies | **You** | ✅ Edit freely — never overwritten |

## The three rules that matter most

1. **Manual-source companies → fill any year, any time.** The automation never
   touches their market-cap values.

2. **FMP companies → only the *current year* is automatic.** Every past year is
   yours. If you spot a wrong historical number for an FMP company, just fix it —
   the automation preserves your correction and only keeps updating the current
   year going forward.

3. **Enter plain numbers, in billions of USD.** e.g. `1243.8` for a $1.24T
   company. Commas and decimals are fine (`1,243.8` works). **Do not** include
   `$`, `B`, or other letters — a value like `$1.2B` is read as invalid and gets
   **erased on the next nightly run**. Just the number.

## How to tell a manual company from an FMP company

Look at the **`data source`** column:

- **"companiesmarketcap.com"** or **"Manual entry"** → manual. Fill in every year.
- **"Financial Modeling Prep"** → FMP. Only correct past years if needed; leave
  the current year to the automation.

## Handy to know: force a full re-pull

If you ever want the automation to **re-fetch an FMP company's entire history**
from scratch (for example, after correcting its ticker in Sanity), **clear that
company's year cells**. The next nightly run sees the row is empty and re-pulls
the full history for it. (Leaving cells filled = the automation only touches the
current year.)

## When does the automation run?

Once a day, at midnight (UTC). Edits you make during the day are safe — the run
reads the sheet, keeps everything it's supposed to keep, and only rewrites the
cells listed as automation-managed above.
