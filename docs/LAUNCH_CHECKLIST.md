# Launch checklist — remaining steps

*Working checklist of what's left to launch. Complements [LAUNCH_PLAN.md](LAUNCH_PLAN.md) (the schedule) and [PROJECT.md → Build status](PROJECT.md#build-status). Last reviewed: 2026-09-07.*

The site is **already live** (public app + hosted Studio + nightly ingest) on the **old FMP sheet**. Everything below is finishing the Google-Finance switch, filling history, and the pre-launch polish/QA.

---

## 1. Google Finance cut-over — *makes non-US companies work* (they show "NA" on live FMP today)

- [ ] **Finish the last tickers** — Manual holdouts (Schibsted, MultiChoice, NHL, Bertelsmann) + the 4 "verify" ones (EchoStar, Optimum, Angel, eSports).
- [ ] **Enter historical (past-year) values** in the sheet — GF has no history, so 2015–2025 are hand-entered. *Big data-entry lift; drives the whole Time Machine.* Convention: a **`-`** in a year cell means *omit that company from that year's map*.
- [x] **`-` = hide convention** — done (`1344e05`). A `-` cell omits the company from that year's map (public map/list/linear/aggregate/ATH-ATL + the Studio Map Editor all honor it). Takes effect on the app once cut over to the GF sheet; in the hosted editor on the next Studio deploy.
- [x] **Redeploy Studio** — done 2026-09-07; `exchange` / `currency` / `manual_source` are now real fields, and the Map Editor's `SANITY_STUDIO_VALUATIONS_CSV_URL` was repointed at the GF sheet (+ parser fixed for the key row / emoji headers) so the editor sizes planets from GF data.
- [ ] **Install the Last-Updated Apps Script** ([jobs/sheet-apps-script.gs](../jobs/sheet-apps-script.gs)) — paste + add the daily trigger.
- [ ] **Publish the GF sheet to web → CSV** (File → Share → Publish to web → CSV) and grab that URL.
- [ ] **Verify on dev** — point local `.env.local` `VITE_VALUATIONS_CSV_URL` at the GF CSV, `npm run dev`, compare to FMP.
- [ ] **Merge `google-finance-alternative` → main + deploy** *(required before live cut-over — main lacks the key-row + emoji-header handling this sheet needs).*
- [ ] **Wire automation** — add the `GF_SHEET_ID` GitHub secret + the Sanity publish webhook.
- [ ] **Cut over** — set Netlify `VITE_VALUATIONS_CSV_URL` to the GF CSV; redeploy. (Rollback = flip back to the FMP URL.)
- [ ] **Retire FMP** (once confident) — disable the `ingest-valuations` Action.

## 2. Mobile + touch — ✅ mostly done (correction to old docs)

Touch is implemented: **one-finger pan, two-finger pinch-zoom, tap-to-focus**, gesture re-seating, mobile canvas swap, sector drawer, rotate prompt. Remaining:
- [ ] **Real-device QA** across iOS + Android sizes.
- [ ] *(Minor)* Edit-mode **planet dragging on touch** — the drag starts from `onMouseDown`, so authoring positions on a phone may not work (desktop authoring is fine).

## 3. Historical-map editing — ✅ available; QA remaining

The Studio Map Editor's **year picker** scopes appearance windows, connections, and (via the sheet) valuations; both desktop and mobile renderings honor the same time-scoped data. Sector centers are tunable per-view (`mobile_center`). Note: **per-company fine positions are authored once (desktop); mobile auto-lays-out within its own sector centers** via physics — see open question #4.
- [ ] Client QA pass: step through each year, confirm the right companies/connections/sizes render on both desktop and mobile.

## 4. Front-end polish
- [ ] Restyle toward the light mockup; loading-moment animation; final responsive passes.

## 5. QA → launch
- [ ] Full QA pass + bug bash against the checklist.
- [ ] **Confirm the paid-gating decision** (freemium Time-Machine paywall) — launch requirement or post-launch? (Not started.)

---

## Post-launch / not blocking
- Dynamic feeds (auto-pull articles + Eshap content).
- Legacy cleanup (`loadCompanies.ts` / `historical.ts` mock; trim redundant Sanity `manual_valuations`).
