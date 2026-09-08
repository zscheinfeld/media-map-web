# Launch checklist — remaining steps

*Working checklist of what's left to launch. Complements [LAUNCH_PLAN.md](LAUNCH_PLAN.md) (the schedule) and [PROJECT.md → Build status](PROJECT.md#build-status). Last reviewed: 2026-09-08.*

The site is **live on the Google Finance sheet** (public app + hosted Studio + Sanity-webhook reconciler). The FMP→GF switch is **done** (§1); everything below it is polish/QA + optional cleanup.

---

## 1. Google Finance cut-over — ✅ DONE (2026-09-08) — *non-US companies now populate live*

- [x] **Re-ticker the roster** — Japanese via OTCMKTS+JPY, non-US primary listings, Currency override field. A few genuine Manual holdouts remain (Schibsted, MultiChoice, NHL, Bertelsmann) + verify (EchoStar, Optimum, Angel, eSports) — enter as you confirm. See [[gf-exchange-support]].
- [x] **Historical values** filled (~123–169/year, 2015→2026) → the Time Machine survives the cut-over.
- [x] **`-` = hide convention** — a `-` cell omits the company from that year's map (app + editor).
- [x] **Redeploy Studio** — `exchange`/`currency`/`manual_source` + Square-mode mobile-position authoring are live; editor reads the GF sheet.
- [x] **Publish GF sheet → CSV** + **verify on dev** — done (non-US now populate).
- [x] **Merge `google-finance-alternative` → main** — done (`d4f3af8`); deployed (app still reads FMP until the env var flips).
- [x] **Automation** — 4 GitHub secrets set; `workflow_dispatch` test green; **Sanity webhook live** (publish a company → `repository_dispatch` → reconciler runs in ~30s, verified end-to-end). Nightly cron + manual dispatch are backups. (See [GOOGLE_FINANCE.md → Phase 4](GOOGLE_FINANCE.md).)
- [x] **Cut over** — Netlify `VITE_VALUATIONS_CSV_URL` set to the GF CSV (`2PACX-1vQ6iO…`) + deployed; live site verified (non-US populate). **Rollback = set the env var back to the FMP URL + redeploy.**
- [x] **Last-Updated Apps Script** ([jobs/sheet-apps-script.gs](../jobs/sheet-apps-script.gs)) installed in the sheet — `onEdit` stamps manual rows on edit; daily `stampGoogleFinanceRows` trigger stamps GF rows. (Replaced an older row-1/no-emoji version that silently no-op'd once the KEY row + emoji headers were added.) Blank manual rows backfilled with the launch date.
- [x] **Retire FMP** — nightly `ingest-valuations` cron disabled (still manually runnable for rollback). Full teardown (delete workflow + `FMP_API_KEY`/`SHEET_ID`) deferred; costs nothing idle.
- [ ] **Record the FMP rollback URL** — paste the FMP published CSV into [GOOGLE_FINANCE.md → Phase 6](GOOGLE_FINANCE.md) (currently a `TODO` placeholder). Grab it from Netlify env-var history.

## 2. Mobile + touch — ✅ mostly done (correction to old docs)

Touch is implemented: **one-finger pan, two-finger pinch-zoom, tap-to-focus**, gesture re-seating, mobile canvas swap, sector drawer, rotate prompt. Remaining:
- [ ] **Real-device QA** across iOS + Android sizes.
- [ ] *(Minor)* Edit-mode **planet dragging on touch** — the drag starts from `onMouseDown`, so authoring positions on a phone may not work (desktop authoring is fine).

## 3. Historical-map editing — ✅ available; QA remaining

The Studio Map Editor's **year picker** scopes appearance windows, connections, and (via the sheet) valuations. An **Aspect ratio dropdown (Desktop / Square)** now lets you author **both** layouts: Square mode swaps to the square canvas + sector `mobile_center` + per-planet `mobile_position_overrides`, and dragging saves to the mobile field (desktop drags still save the desktop field). The square layout was migrated out of code (`MOBILE_LAYOUTS.square`) into Sanity — company + entity `mobile_position_overrides` and sector `mobile_center`. The app's square view reads those (falling back to code) once cut over/deployed.
- [ ] Client QA pass: step through each year in both Desktop and Square modes; confirm the right companies/connections/sizes/positions render.

## 4. Front-end polish
- [ ] Restyle toward the light mockup; loading-moment animation; final responsive passes.

## 5. QA → launch
- [ ] Full QA pass + bug bash against the checklist.
- [ ] **Confirm the paid-gating decision** (freemium Time-Machine paywall) — launch requirement or post-launch? (Not started.)

---

## Post-launch / not blocking
- Dynamic feeds (auto-pull articles + Eshap content).
- Legacy cleanup (`loadCompanies.ts` / `historical.ts` mock; trim redundant Sanity `manual_valuations`).
