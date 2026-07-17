# Project phases — CMS + shared package

Tracking the initiative to add a Sanity CMS and extract the map renderer/physics
into a shared package so the public app and an in-Studio editor draw the map
identically. **This file is the source of truth for engineering status** — the
agent memory just points here, it does not mirror this content. For the dated
schedule see LAUNCH_PLAN.md; for the data model see ARCHITECTURE.md.

## Repo shape
- **Root** = the Vite/React app (React 19). npm workspaces = `["packages/*"]`.
- **`packages/map-core`** = `@media-map/map-core`: ESM, React peer dep,
  data-source-agnostic renderer + physics (`usePhysicsLayout`, `Planet`,
  `ConnectionLine`, sizing/style helpers, types).
- **`studio/`** = Sanity Studio v3 (React 18). **Standalone, not in the
  workspace** (React 18 vs 19 split); consumes `map-core` via
  `file:../packages/map-core`.
- The app now reads **content** (companies, sectors, connections, entities,
  layout knobs) from Sanity; **valuations** still come from the Google Sheet,
  joined by company name. See Phase 4b.

## Phase 1 — shared package — ✅ done
`@media-map/map-core` created + building: types, sizing (`computeAnchorDiam`,
`diameterFor`), style (`hexToRgba`, `hashHue`, `mergeStyle`, `formatValuation`),
agnostic `usePhysicsLayout` (takes pre-resolved `LayoutInput[]`), presentational
`Planet` + `ConnectionLine`.

## Phase 2 — app consumes map-core — ✅ done (visually verified)
Deleted the app's local `usePhysicsLayout` + `Planet`; `MediaMap.tsx` imports
from `@media-map/map-core` with an adapter mapping sheet companies →
`LayoutInput`. `sectors.ts`/`layout.ts`/`connections.ts` keep their own
structurally-identical types, so the Studio + import script are untouched.

## Phase 3 — in-Studio map editor — ✅ done
Custom "Map Editor" Sanity tool (`studio/tools/mapEditor/`) rendering the shared
`map-core` canvas from Sanity data. Studio consumes `map-core` via
`file:../packages/map-core`.
- **3a** ✅ — wired `map-core` into the Studio; `sanityMapData.ts` maps Sanity
  docs → `LayoutInput` (color objects → hex, snake → camel, fallback valuation
  from `manual_valuations`) with a live GROQ hook (`client.listen`); read-only
  canvas renders via shared Planet/ConnectionLine. Typecheck green. (Not yet
  visually verified — needs `sanity dev` with a project ID.)
- **3b** ✅ — drag a planet → commits to `position_overrides` via
  `client.patch` on release; inspector with date-window dropdown, pin toggle,
  "+ New window" / "Delete window". Live sim adjusts neighbors. First-drag with
  no overrides creates a new entry. Files: `studio/tools/mapEditor/patches.ts`,
  `studio/tools/mapEditor/PlanetInspector.tsx`. Typecheck green; needs visual
  verification in `sanity dev`.
- **3c.1** ✅ — staged-changes model (`PendingState`, batched commit through
  a single Sanity transaction) + global year+month selector +
  forward-propagated position editing (overrides stamped `start_date = moment`,
  active override = largest `start_date ≤ moment`) + read-only per-planet
  history. New files: `moment.ts`, `pendingChanges.ts`, `TimeSelector.tsx`,
  `SaveBar.tsx`; rewrote `PlanetInspector.tsx`; rewired `MapEditorTool.tsx`.
  `beforeunload` guard while pending isn't empty. Studio typecheck +
  root build green; lint at baseline. Needs visual verification in `sanity dev`.
- **3c.2** ✅ — connections authoring through the same staged-changes model.
  New `ConnectModePanel` (left, below LayoutKnobs) toggles a sub-mode where
  clicking planet A then B creates a Connection doc stamped with
  `start_date = moment`; a rubber-band line follows the cursor between
  clicks; Escape cancels. Existing connection lines become click-targets;
  selection shows `ConnectionInspector` (right, replaces PlanetInspector
  while selected) with style toggle, description, "End at {moment}",
  "Reopen", and Delete. Canvas + physics filter to
  `connectionActiveAt(moment)`; undated connections forward-propagate as
  always-active (transitional). `commitPending` now drains positions +
  connections in one Sanity transaction (`tx.create` / `tx.patch` /
  `tx.delete`). Studio typecheck + root build green; lint at baseline.
- **3e** ✅ — **time-scoped sector centers** (mirrors the planet pattern).
  SCHEMA CHANGE: added `sectorCenterOverride` object type + a
  `desktop_center_overrides[]` field on the Sector doc. Scalar
  `desktop_center` stays as the always-active baseline fallback. Editor:
  drag a sector pill at moment T → stages an override at T; tap (no drag)
  → opens a new `SectorInspector` with a read-only history (baseline +
  every override), "Inherited from {moment}" hint when forward-propagated,
  and "Clear override at {moment}". Resolution: `activeSectorOverrideAt`
  (largest start_date ≤ moment) over Sanity+pending; falls back to scalar.
  `commitPending` extended with the same array-keyed patch pattern as
  positions. Three mutually exclusive inspectors now: connection > sector
  > planet. **Run `sanity deploy` after pulling so the new schema fields
  appear in Studio.** Studio typecheck + root build green; lint at baseline.
- **3d** ✅ — drag sector centers → `Sector.desktop_center`. Dashed yellow
  ring markers at each sector's center, labeled with the sector name. Drag
  stages a `setDesktopCenter` op (coalesced per sector); `commitPending`
  patches the doc. Resolved center feeds every planet's `inputs.center`,
  so unparked planets visibly follow the marker live during drag. v1 =
  desktop only; mobile_center still authored in Structure. Studio
  typecheck + root build green; lint at baseline.
Writes via Sanity patch API (transaction-batched on Save). Style quick-edit deferred to v2.
- **3f** ✅ — content-model + editor expansion (the bulk of recent work):
  - **Entities** — text-only sub-brand nodes (ABC/Marvel); schema, drag/pin, appearance windows; connections extended to company↔entity.
  - **Vitals** — time-bound name+statistic tags shown in the side panel.
  - **Description** + restructured related content: **Eshap content** (LinkedIn/podcast/Substack) + **External articles** (Google/Yahoo). Removed the old `article`/`podcast` doc types.
  - **Time-scoped layout knobs** — `mapSettings` singleton with forward-prop overrides (density / collide pad / size spacing / label size / connection pull / entity radius), edited live and saved per moment; per-change list in the Save bar.
  - **Physics** — entity imaginary-radius collision, size-proportional spacing, a hard de-overlap guarantee (eases apart), gentler initial load.
  - **Editor UX** — zoom/pan, "Map at" left column + sector-label toggle.
  - Time-scoping is now **honored in the editor** (forward-prop + windowing); the **public renderer still cheats** (`position_overrides[0]`, all connections) — fixed in 4a/4b.

## Phase 4 — wire the app to Sanity + dynamic data — 🚧 in progress (4a + 4b ✅, 4c LIVE/verifying, 4d next)
The editor + content model are done; the public app now reads CMS **content** from Sanity (4a/4b), with **valuations still on the Google Sheet** pending the data platform. This phase finishes by swapping in real, dynamic valuations. (Engineering breakdown of LAUNCH_PLAN.md Phases 1–2 — that doc holds the schedule + client track.)

- **4a — shared resolve layer (keystone).** *(Time logic done.)* Pure `timeScope` primitives now live in `map-core` — `activeAt` (forward-prop: largest moment ≤ T) + `windowActiveAt` (windowed [start,end]) + date/moment helpers. The Studio's `moment.ts` re-exports them, and the resolution helpers in `pendingChanges.ts` (`activeOverrideAt`, `activeSectorOverrideAt`, `activeSettingsOverrideAt`, `connectionActiveAt`) + `sanityMapData.ts` (`appearanceActiveAt`, `vitalActiveAt`) all route through them — so the editor and the public app share ONE implementation of the divergence-prone logic. **Remaining:** the Sanity→`map-core` *mapping* (`toCoreStyle`, valuation fallback, raw-docs → inputs/positions/connections at T) — deferred to **4b** to co-design with its first real consumer (the public read path) rather than build it speculatively.
- **4b — public app reads Sanity content.** ✅ *Live and runtime-verified against the real project.* `src/sanityClient.ts` (fetch-based public query API) + `src/sanityMap.ts` (Raw types + `toCoreStyle` + `resolveSanityMapAt(docs, T)` → structure-only: companies/entities/positions/connections/settings/centers/styles/`detailByName`, via the shared `timeScope`). Gated by `VITE_SANITY_PROJECT_ID` — unset = falls back to the Google Sheet. Wired in `MediaMap.tsx`: companies/sectors/positions/connections/entities/styles/centers come from Sanity (time-scoped at the viewed month); **valuations stay on the sheet**, joined by name (`baseCompanies`). **Layout knobs are now Sanity-driven** — `sanity.settings` (packing/collide/label/pull + entity radius/size spacing) thread into `anchorDiam`/`labelRadii`/the physics call (`eff` in `MediaMap.tsx`), so the public map matches the editor's spacing.
  - **Read auth gotcha (important):** on this project, docs created via the import API token are **not anonymously readable** even on a public dataset (only Studio-created docs are). So the app authenticates reads with a **Viewer (read-only) token** in `VITE_SANITY_READ_TOKEN` (repo-root `.env.local`, gitignored — ships in the bundle, acceptable for read-only public data). `sanityClient.ts` also pins `perspective=published` (without it, raw drafts leaked in and the map flip-flopped between loads). If reads return empty, check the token first.
  - **Resilient first-load layout:** the non-edit map path in `usePhysicsLayout.ts` re-settles (hard de-overlap converge + cool live sim) on every effect re-run, so late dep changes (container measure, sheet valuations arriving, month resize) can't freeze a half-settled overlapping frame. Only ~29/173 companies have hand-placed positions; the rest auto-layout.
  - **Side-panel content ✅** — `PlanetDetailPanel` now renders `detailByName` (primary-metric value + label, data source, description, vitals chips, Eshap content list, external-articles list) for companies.
  - **Per-company primary metric ✅** — `valuation_type` on the company doc (Latest Market Cap / Fundraising Valuation / Yearly Revenue) drives the panel label; non-market-cap value resolves from the `manual_valuations` array (latest ≤ T, sheet fallback) and feeds planet size. Market cap stays sheet→Supabase.
  - **Two new layout knobs ✅** — `sectorPull` (gravity to sector center) + `repulsion` (`forceManyBody` charge to spread planets), both Sanity-saved + time-scoped.
  - **Entity panel ✅ (decided: none)** — clicking a text entity no longer opens a panel (`!node.isEntity` guard); entities are label-only by design.
  - **Primary-metric size scale ✅ (decided: unified)** — all metrics (market cap / fundraising / revenue) share the one `sqrt` size scale; PSM/private are intentionally smaller. Revisit only if the client asks.
  - **Remaining (all deferred, none block 4c):** (1) **loading-moment animation polish**; (2) **front-end appearance polish** (restyle toward the light mockup); (3) `react-hooks` lint pass — *triaged: none of the 6 are real bugs* (3 are load-bearing setState-in-effect in the physics/seeding, 2 are false-positive `performance.now()` in event-handler closures, 1 is edit-mode-only ref-in-render). They only block adopting the optional React Compiler; leave until/unless that's wanted. The Sanity→map-core mapping in `sanityMap.ts` still mirrors the Studio's `sanityMapData.ts` (only the time logic is shared).
- **4c — valuation data (Google Sheet + FMP ingest) — 🚧 NEXT (building).** **Decided: no database.** One **Google Sheet is the single source of truth for every valuation number**; Sanity stays structure/content only. The app already reads a public sheet CSV, so the read path barely changes. A **spreadsheet is robust enough** at this scale (175 companies × monthly × a few metrics ≈ tens of thousands of cells vs Google's ~10M ceiling); migrate to a DB only at much larger scale (thousands of companies, daily granularity, server-side queries) — and the app reads through one `loadValuations` loader, so that swap stays localized.
  - **Decisions locked:** provider **FMP Starter ($20/mo) for the MVP** (US-only — non-US companies show **"NA"** until a fuller plan is chosen with the client); history **monthly back to ~2015**; job host **GitHub Action** (daily cron + manual `workflow_dispatch`); **all numbers in the Sheet, outside Sanity**; reads at **runtime** via the Sheet's published-CSV URL (public, read-only — no token); client enters manual numbers **in the Sheet**, and uses Sanity only for structure/content.
  - **Multi-metric by design — one tab per metric.** Start with a `market_cap` tab; add `employees`, `revenue`, etc. as new tabs later (each: one row per company `slug`, a column per month). Adding a metric = a new tab + a ~3-line read change. Slow facts (employee count) can be a single "current" column rather than monthly. Division of labour: **automatable numbers (market cap, employees, revenue from FMP) → the Sheet**; **editorial/curated facts → Sanity `vitals`.**
  - **Sheet schema** (per metric tab): `slug | name | sector | type | ticker | vetting_status | exchange | fmp_company | last_updated | <months, newest-first>`. Months run newest→oldest (current month next to `last_updated`, easy to edit; a new month is added at the left). Public rows filled by the job; private/PSM rows filled by the client. Vetting aids: `fmp_company` (what the ticker *resolves to*) + the visible numbers expose wrong tickers at a glance (e.g. `UMG → UMGP → "Universal Media Group Inc." → $0`); **`vetting_status`** = `Needs approval` (has data) / `Incomplete data` (none) / `Approved` (client-set, **preserved** across runs); **`last_updated`** = the date the ingest last refreshed that row. The app reads by **column name**, so order/extra columns don't matter, and the side-panel *label* still comes from Sanity's `valuation_type`.
  - **Vetting can happen in the sheet itself.** `apply-tickers` accepts either `ticker-suggestions.csv` (`suggested_*` columns) **or** the vetted `market_cap` sheet (`ticker`/`type` columns), both keyed by `slug` — so the client vets numbers + ticker + resolved-name together in one Google Sheet, you export it, and `apply-tickers` writes the corrections back to Sanity.
  - **History is a one-time asset you own** — 2015→last month never changes, so it's pulled once and saved in the Sheet forever (no recurring cost for *past* data). The **only** recurring need is acquiring **new months** as time passes (they don't exist until they happen). MVP **simulates daily refresh**; the real cadence (true daily-auto vs periodic manual one-shot) is a freshness choice to settle with the client. **Accuracy note:** FMP's `historical-market-capitalization` returns *exact* historical market cap (shares-as-of-each-date baked in) — so history is never approximated. If a price-only feed is ever used for the live month, that's `price × shares` (shares drift ~1–3%/yr → re-baseline on refresh); the direct-market-cap endpoint avoids even that.
  - **Provider research outcome (June 2026), for when the client plan is chosen:** global coverage **+** market-cap-over-time is the scarce combo. **Massive = Polygon rebranded, US-only (~$199/mo)** — same gap as cheap FMP. **yfinance** = free + global but a fragile scraper (Yahoo IP-blocks cron runners) — MVP-only. The viable global options are **FMP Ultimate (~$100/mo, exact historical market cap)** or **EODHD (~$20/mo prices, ~$60/mo with fundamentals)**. Cost-optimal reliable path: FMP Ultimate **one month per refresh** (own the exact history) + a cheap price feed for the live month — pay only when refreshing, not monthly.
  - **Reconcile/ingest job** (`jobs/ingest-valuations.ts`, run by the Action): (1) read the roster from Sanity (`slug, name, ticker, is_public, valuation_type`); (2) read the existing sheet to preserve manual values + `Approved` status; (3) **ensure a row exists per company** (append by `slug` if missing — so *adding a company in Sanity auto-creates its Sheet row*); (4) **public + covered**: **HISTORY IS FROZEN — a daily run refreshes ONLY the current-month cell** from the live FMP profile (`marketCap`) and copies every past month straight from the sheet (no re-fetch). The current-month column is *new* the first day of a new month, so a new month = a new left-most column automatically. A **brand-new company** (no history in the sheet yet) gets a **one-time full backfill** (`historical-market-capitalization`, month-end sampled, ≤5-yr windows); (5) **private/PSM, non-US, or fetch fails** → blank/"NA"/preserved manual. **Never deletes rows**; **never rewrites historical columns** for existing companies. So daily cost ≈ one profile call per public company, not a full-history pull. Writes via the **Google Sheets API + service account** (in-place `values.update`, no clear). Manual `workflow_dispatch` syncs immediately after adding a company.
  - **Sanity trim:** retire the `manual_valuations` array (numbers move to the Sheet); **keep `valuation_type`**.
  - **App read-path ✅ (wired, runtime).** `src/loadValuations.ts` fetches the Sheet CSV (`VITE_VALUATIONS_CSV_URL`), indexes by `(slug, month)`, serves `valuationAt(slug, month)` + `latestMonth()`. `slug` now threads through `sanityMap.ts` (`companies[].slug`). In `MediaMap`: planet sizes + side-panel number resolve **valuation sheet → Sanity manual → legacy sheet** (so uncovered companies still render); the timeline + thumbnails read the sheet too. **Red labels** flag not-live-sourced values (NA/blank) via a `labelColor` field threaded through `LayoutInput`/`PlanetNode`/`Planet`. The map's **"current" month derives from the sheet's latest column** (`currentDate`), so it auto-advances when the ingest adds a month (CURRENT_DATE is now the calendar-month fallback).
  - **Side-panel extras ✅:** the panel shows the company's **`last_updated`** date ("Updated Jun 28, 2026", live companies only) and a **scrubable Historical Market Cap line chart** (`HistoryChart`) — year (X) + rounded value (Y) axes, a cursor + readout that tracks the month/value, shown only for companies with ≥12 months of data. Still TODO: trim Sanity `manual_valuations`, retire `loadCompanies.ts` + `sheetValuations.ts` + the `historical.ts` mock once the sheet fully covers the roster.
  - **Provisioning (user):** (a) **FMP Starter API key**; (b) create the **Google Sheet** (one `market_cap` tab, header row per the schema); (c) **Google Cloud service account** (JSON key) + share the Sheet with its email as Editor; (d) **GitHub repo secrets:** `FMP_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `SHEET_ID`, `SANITY_READ_TOKEN`. **Needs runtime verification** against the real services.
  - **Ticker + primary-metric bootstrap (`jobs/`, built ✅).** The existing sheet has **no ticker column**, so both the `ticker` and the `valuation_type` ("Primary metric") are auto-drafted, reviewed as a spreadsheet, and written back to Sanity. Pipeline:
    - `jobs/suggest-tickers.ts` — for each company: searches FMP (`/stable/search-name` + `/stable/search-symbol` for acronyms; the legacy `/api/v3/search` 403s on current keys) and drafts a `valuation_type` (found a ticker → `market_cap`; PSM sector → `yearly_revenue`; else → `fundraising_valuation`). `jobs/ticker-overrides.ts` (a curated `slug → {ticker, type}` map) **wins over the fuzzy guess and survives re-runs**. Output: `ticker-suggestions.csv` with review-needed rows floated to top, trusted/`curated` rows sunk, plus `matched_name`/`alternatives` reference columns.
    - **Client-vetting round-trip:** the CSV is the hand-off artifact — the client vets `suggested_type` + `suggested_ticker` in Google Sheets (using the `confidence` + `alternatives` columns; ignores `slug`). The vetted CSV comes back; confident corrections are **folded into `ticker-overrides.ts`** (so re-runs keep them) and `jobs/apply-tickers.ts` writes `ticker` + `valuation_type` to Sanity in one transaction. Re-running later only surfaces genuinely new/unreviewed companies.
    - Name-matching is imperfect for ambiguous media names (same-named different/public-vs-private companies), so the human/client vet is required — the tool produces a strong draft, not a finished answer. FMP *search* returns global symbols, so non-US tickers populate too (data lights up when the plan leaves US-only Starter). `jobs/` is a standalone tsx workspace (own `package.json`/`.env`), not in the app build.
  - **Automation ✅ (built, pending provisioning).** Decided on **GitHub Actions over Netlify** for the ingest: no function timeout for a ~3–5 min job, a built-in manual "Run workflow" trigger, and it runs the existing `jobs/` script as-is (Netlify just hosts the site, which reads the published sheet straight from the browser — no function needed). `ingest-valuations` now has a **write mode**: when `SHEET_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON` are set it reads the sheet (preserving manual private/PSM values), then overwrites it via the Sheets API (`googleapis`); else it emits the local CSV. Workflow: [.github/workflows/ingest-valuations.yml](.github/workflows/ingest-valuations.yml) — daily cron + `workflow_dispatch`. Writes via **in-place `values.update` (no clear)** so the sheet's formatting + data validation survive each run (don't reintroduce a clear). **Write mode confirmed working** via a local smoke-test (service account wrote all 173 rows; manual values preserved). **User provisioning:** Google Cloud service account + Sheets API → share the sheet with its email (Editor) → GitHub secrets `FMP_API_KEY`, `SANITY_PROJECT_ID`, `SANITY_AUTH_TOKEN`, `SHEET_ID` (from the *edit* URL), `GOOGLE_SERVICE_ACCOUNT_JSON`.
  - **Build order:** ⓪ ticker bootstrap ✅ → ① `ingest-valuations.ts` ✅ → ② sheet populated ✅ → ③ app read-path ✅ → ⑤ service account + Action ✅ → **secrets added by user + all `jobs/`/workflow commits on `main` ✅ — first *scheduled* run pending overnight verification (00:00 UTC ≈ 8pm ET)** → ④ then trim Sanity `manual_valuations` + retire `loadCompanies.ts`/`sheetValuations.ts`/`historical.ts` mock once the sheet fully covers the roster.
  - **🚀 LAUNCHED (Jun 30, 2026).** The `Sanity` branch was merged to `main` (PR #4) and the public site is **live at https://eshap-media-map.netlify.app** reading Sanity + the valuation sheet. To get there: (a) added the four `VITE_*` env vars in Netlify (they're only in the gitignored `.env.local`, so the build needs them); (b) **added a Sanity CORS origin** for the Netlify URL (with credentials) — *token reads are CORS-blocked until the exact origin is allowlisted; this was the cause of the "all labels red / Failed to fetch" symptom*. **Keep `VITE_*` secrets marked NOT-secret in Netlify** (they're inlined into the public bundle by design; marking them secret trips Netlify's build-output secret scanner).
  - **Studio hosted ✅** at **https://eshap-media-map.sanity.studio** (`sanity deploy`; `studioHost` pinned in [studio/sanity.cli.ts](studio/sanity.cli.ts) so deploys never prompt — the interactive prompt also crashes on the old CLI + Node 23). Gotcha trail: the CLI's logged-in account was only `editor`, AND a `SANITY_AUTH_TOKEN` robot token in `studio/.env` **silently overrode every interactive login** (logout failed with "robot user"). Fix: deploy with a project **"Deploy Studio (Token only)"** token passed inline (`SANITY_AUTH_TOKEN=… npx sanity deploy`). Invite the client via manage → Members → Editor; Studio = structure/content, **Sheet = the valuation numbers the client vets**.
  - **Ingest hardening (Jun 30) ✅** — three fixes, all on `main`: (1) **ticker-change → full re-pull**: each row stores its `ticker`; when Sanity's ticker differs, that row's *entire* history is re-fetched for the new symbol instead of freezing the old symbol's stale history (edit tickers in **Sanity**, not the sheet — the sheet is overwritten from the roster). (2) **schedule → 00:00 UTC** (was 09:00). (3) **forced NUMBER format on month columns each run** (`enforceMonthFormat`): a newly created month column had inherited a neighbour's *date* format, rendering market caps as dates (`151.61 → "1900-05-30"`) — which also breaks the published-CSV parse. Values were always correct; this guarantees the display/CSV stay numeric. Verified by a real local write (173 rows, 100 FMP / 14 NA, history + Approved + manual values preserved).
  - **TODO — Studio Map Editor must size planets from the valuation sheet (parity, incl. history).** The editor still sizes planets from Sanity (`manual_valuations`/fallback in `studio/tools/mapEditor/sanityMapData.ts`), so the **scale there doesn't match the public map**, which sizes from the valuation **sheet** by `(slug, month)`. Wire the editor to also load the valuation CSV (reuse the app's `loadValuations` logic — `VITE_VALUATIONS_CSV_URL`) and resolve each planet's `valuation_b` from the sheet at the editor's **current moment, including historical months**, so sizes are correct as the TimeSelector scrubs. **Needed so positions can be adjusted accurately when planet scale changes month-to-month** (the whole point of placing planets per-moment). Note the Studio is a standalone workspace — it'll need its own env var for the CSV URL.
- **4d — dynamic feeds.** Auto-pull external articles + Eshap content (schema is already feed-shaped).

## Phase 5 — yearly historical maps (Oct-1 snapshots) — 🚧 IN PROGRESS
Move the timeline from **monthly** to **yearly**. Each *past* year's map = that year's **Oct 1 (Q4-start) snapshot**; the *current* year's map = the most recent data, labeled with its actual month (e.g. "JUL 2026"). Cross-cutting: touches the data pipeline, the sheet, the app read-path + timeline UI, Sanity/Studio time-scoping, and the aggregate view.

**Progress:**
- ✅ **Ingest** (`jobs/ingest-valuations.ts`): `buildYears` + `yearlyBillions` (Oct-1 past / latest current), daily refresh of the current-year column only, year-rollover full re-pull, one-time legacy-month sweep (`clearTabValues`, preserves client Notes/vetting). `enforceNumberFormat`.
- ✅ **App read-path**: `loadValuations` keyed by year + `latestYear`/`latestUpdated`; `historical.buildYearRange` + present-aware `formatDate`; MediaMap `currentDate`/`valAt`/liveness by year; timeline strip labels every year; aggregate X-axis = years. Build green.
- ✅ **Sheet regeneration** — done (2026-07-17). Write-mode run swept the monthly columns → 12 yearly ones (`2015…2026`), full FMP backfill for the 101 `api` rows, 72 `manual` rows (companiesmarketcap.com + Manual entry) left blank for client entry. Oct-1 snapshots validated against real history (e.g. NVIDIA 2022=301, 2023=1073, 2024=2870). Also repaired a pre-existing duplicate-`slug`/missing-`name` header. Client Notes / vetting_status / data-source columns preserved.
- ✅ **Deployed** — app read-path + yearly ingest pushed to `main` (Netlify + the daily cron now both run the yearly code).
- ✅ **Studio TimeSelector → year picker** — `momentForYear` maps each year to its snapshot moment (past = `Y-10`, current = now), matching the public app's `buildYearRange`. Position/pin/sector/connection edits stamp `start_date` at that moment (no schema change); inspectors + connection windows + save-bar labels now read as years. **Needs a Studio redeploy** (`cd studio && npm run deploy`) to go live at eshap-media-map.sanity.studio.
- ⏳ **Docs** — ARCHITECTURE.md time-scoping spec + retire the monthly mock note.

### The model
- **Snapshot rule:** year Y (< current) → market cap on the last trading day **≤ Oct 1, Y**. Current year → the latest available value (still refreshed daily).
- **Year rollover:** when the calendar year turns over, the just-ended year *freezes* to its Oct-1 snapshot (re-sampled once) and a fresh current-year column opens.

### Decisions (locked)
1. **Sheet columns = one per year** (`2015 … 2026`, newest-first; cell = that year's snapshot). ~138 monthly columns → ~12.
2. **Past-year label = the year itself** (`2025`). The present map keeps its month (`JUL 2026`).
3. **Present-month = derived from the run date** (the newest `last_updated`) — no extra metadata cell.

### Work by area
- **Ingest (`jobs/ingest-valuations.ts`) — biggest change.** `buildMonths` → `buildYears`; sample FMP daily history at the last trading day ≤ Oct 1 for each past year, latest value for the current year. Daily run refreshes only the current-year column; past years frozen. Year-rollover backfills the newly-past year's Oct-1 value + opens a new current-year column. Manual companies (companiesmarketcap.com) now fill ~12 yearly cells. `enforceMonthFormat` → year columns.
- **Sheet.** Columns become yearly (decision #1). One-time re-generation via a full FMP backfill that re-samples Oct-1 per year.
- **App read-path.** `historical.ts`: `buildDateRange` → list of years, each carrying its snapshot moment (Oct-1 / latest). `loadValuations.valuationAt(slug, year)`. Timeline/carousel/thumbnails → per-year (labels: past = year, present = month). `currentDate`/`activeDate` → year-based; present-month label from the run date.
- **Sanity / Studio time-scoping.** No schema change (`start_date` stays a date). The Studio TimeSelector → **year picker**; edits stamp `start_date` = the year's snapshot date (Oct 1, or "now" for the current year). The public renderer resolves positions/connections at each year's snapshot moment (forward-prop unchanged).
- **Aggregate view (`MediaMap.tsx`).** X axis = years (~12 bars instead of ~138); each bar = the year's snapshot stack. Stacking / ordering / intro / zoom logic unchanged — just fewer, cleaner data points.
- **Docs.** ARCHITECTURE.md time-scoping spec + the manual-vs-dynamic matrix; retire the monthly `historical.ts` mock.

### Build order
① lock the 3 decisions → ② ingest refactor + one-time sheet re-generation → ③ app read-path + timeline UI → ④ aggregate view → ⑤ Studio TimeSelector + time-scoping moments → ⑥ docs. Data + read-path first so the maps render; Studio + aggregate follow.

See the **manual-vs-dynamic matrix** in ARCHITECTURE.md.
