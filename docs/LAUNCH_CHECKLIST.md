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
- [x] **Record the FMP rollback URL** — the FMP published CSV is recorded (+ verified) in [GOOGLE_FINANCE.md → Phase 6](GOOGLE_FINANCE.md).

## 2. Mobile + touch — ✅ mostly done (correction to old docs)

Touch is implemented: **one-finger pan, two-finger pinch-zoom, tap-to-focus**, gesture re-seating, mobile canvas swap, sector drawer, rotate prompt. Remaining:
- [ ] **Real-device QA** across iOS + Android sizes.
- [ ] *(Minor)* Edit-mode **planet dragging on touch** — the drag starts from `onMouseDown`, so authoring positions on a phone may not work (desktop authoring is fine).

## 3. Historical-map editing — ✅ available; QA remaining

The Studio Map Editor's **year picker** scopes appearance windows, connections, and (via the sheet) valuations. An **Aspect ratio dropdown (Desktop / Square)** now lets you author **both** layouts: Square mode swaps to the square canvas + sector `mobile_center` + per-planet `mobile_position_overrides`, and dragging saves to the mobile field (desktop drags still save the desktop field). The square layout was migrated out of code (`MOBILE_LAYOUTS.square`) into Sanity — company + entity `mobile_position_overrides` and sector `mobile_center`. The app's square view reads those (falling back to code) once cut over/deployed.
- [ ] Client QA pass: step through each year in both Desktop and Square modes; confirm the right companies/connections/sizes/positions render.

## 4. Front-end polish
- [ ] Restyle toward the light mockup; loading-moment animation; final responsive passes.

## 4b. Launch features (targeted for launch — short plans)

Each is grounded in existing code, not a from-scratch build. Rough effort in brackets.

- [ ] **About page** *(few hrs)*. No router exists — the app is one SVG scene. Add a lightweight **overlay/modal** toggled by a header button (optionally a `?about=1` URL). Copy from a small Sanity singleton (model on the existing `mapSettings` singleton) so Evan edits it without a deploy; hard-coded copy is the fallback.
- [ ] **Search (highlight-on-map)** *(½–1 day)*. Reuse what's already there: a text input filters the `nodes` list by company name; matches stay full-opacity while non-matches fade to `opacity: 0.12` — the **exact pattern already used for sector hover** ([MediaMap.tsx](../src/MediaMap.tsx) ~L2786/L4955). Single match → optional `focusOnPlanet()` zoom (already exists). No new data or deps. Scope is deliberately minimal: highlight only, no autocomplete.
- [ ] **Dynamic news feed** *(~1 day + tuning + one decision)*. The schema + side-panel rendering already exist (`external_articles[]` / `eshap_content[]` per company, rendered at [MediaMap.tsx](../src/MediaMap.tsx) ~L1143). "Dynamic" = a nightly GitHub Action (same pattern as `gf-sync-roster`) that pulls **free RSS → writes Sanity `external_articles`**:
  - Public cos → **Yahoo Finance RSS** (`feeds.finance.yahoo.com/rss/2.0/headline?s=<TICKER>`, ticker-keyed); private / no-ticker → **Google News RSS** (`news.google.com/rss/search?q=<name>`) fallback. Both free, no key. Cap ~5 recent, dedup by URL.
  - **Eshap content stays manual** (LinkedIn has no public API; Substack/podcast RSS isn't per-company — Evan curating 2–3 links per company is better UX). Optional later: a **global "Latest from Eshap"** strip pulled from his Substack/podcast RSS.
  - ⚠️ **Open decisions before building:** (a) approval gate? — write auto-pulled articles in an *unapproved* state (mirroring `vetting_status`) and show only approved, vs. show-all-and-delete-junk; (b) accept unofficial-RSS fragility, or pay for a sturdier API (Finnhub/NewsAPI) later; (c) global Eshap feed — yes/no.
- [ ] **Download: consistent framing + branding** *(½–1 day)*. Two parts:
  - **Zoom-independent framing (main issue).** `downloadMapImage` ([MediaMap.tsx](../src/MediaMap.tsx) ~L4486) currently derives the export viewBox from `view` (the live pan/zoom), so the PNG looks different depending on how the user is zoomed. Fix: **always export a fixed canonical frame** — the full active canvas (`CANVAS_DESKTOP`/`CANVAS_MOBILE` from [sectors.ts](../src/sectors.ts)), padded to 16:9 — regardless of current pan/zoom. Result: every download of a given year/mode looks identical.
  - **Add ESHAP logo + QR code** to the exported image. Composite both onto the canvas after `drawImage` (fixed corners, sized in output px): the ESHAP logo (already at `/ESHAP logo.png`, inline as a data URI for the detached render) and a **QR code** (generate with a small lib like `qrcode`, or pre-render a static PNG) pointing at the site URL. Decide placement (e.g. logo bottom-left, QR bottom-right) + whether the QR is static (site home) or deep-links to the current year/view.
  - *(Secondary, only if labels still look off:)* gate rasterization on `document.fonts.ready` so labels don't fall back to Arial, and settle physics before capture.

## 4c. Launch infra / SEO / analytics

- [ ] **Custom domain** — point the real launch URL at Netlify: add it in Netlify → Domain management, set the registrar DNS (CNAME/ALIAS or A records), let Netlify provision HTTPS (Let's Encrypt). **Do this early** — the OG tags (§4c) and the download QR code (§4b) both bake in the final URL. *(Need: the domain name.)*
- [ ] **Fix `<title>`** — [index.html](../index.html) still says `media-map-web` (the repo name); set it to the real product name (e.g. "Media Universe", matching `apple-mobile-web-app-title`). One-liner; also seeds the default OG/tab title.
- [ ] **Proper favicon set** — a placeholder `/favicon.svg` exists; add a branded `favicon.svg` + a `favicon.ico` fallback (older browsers) + `apple-touch-icon.png` (180×180, iOS home screen) + optional `site.webmanifest` (PWA name/icons — the app already opts into standalone home-screen launch).
- [ ] **OG / social share meta** — none exist. Add `og:title`, `og:description`, `og:url`, `og:image` + `twitter:card=summary_large_image` to [index.html](../index.html), and a **1200×630 OG image**. *(Synergy: the §4b download exporter already rasterizes the map to a PNG — reuse it to generate the OG image.)* Verify with the Facebook/LinkedIn/Twitter debuggers post-deploy.
- [ ] **Analytics** — none installed. **Decision first:** Google Analytics 4 (`gtag.js` + a `G-XXXXXXX` Measurement ID) — powerful but sets cookies, so it likely needs a consent banner (GDPR/UK). Cookieless alternatives (**Plausible**, **Netlify Analytics**, Fathom) need no banner and are far simpler — worth considering for a content site. Pick one, then wire the snippet into [index.html](../index.html). *(If GA4: need the Measurement ID + a call on the consent-banner requirement.)*

## 5. QA → launch
- [ ] Full QA pass + bug bash against the checklist.
- [ ] **Confirm the paid-gating decision** (freemium Time-Machine paywall) — launch requirement or post-launch? (Not started.)

---

## Post-launch / not blocking
- Global "Latest from Eshap" feed (Substack/podcast RSS) — the per-company Eshap content stays manual (see §4b).
- Search autocomplete / fuzzy matching (launch ships highlight-only, §4b).
- Legacy cleanup (`loadCompanies.ts` / `historical.ts` mock; trim redundant Sanity `manual_valuations`).
