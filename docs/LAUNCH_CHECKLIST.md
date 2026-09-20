# Launch checklist — remaining steps

*Working checklist of what's left to launch. Complements [LAUNCH_PLAN.md](LAUNCH_PLAN.md) (the schedule) and [PROJECT.md → Build status](PROJECT.md#build-status). Last reviewed: 2026-09-20.*

The site is **live on the Google Finance sheet** (public app + hosted Studio + Sanity-webhook reconciler). The FMP→GF switch is **done** (§1); everything below it is polish/QA + optional cleanup.

**Just shipped (2026-09-18, merged to `main` via PR #7 — commit `6259048`):**
- **Download reworked** (§4b) — 16:9 branded export, pre-rendered in the background, label-aware de-overlap.
- **Historical map layout improved** (§3) — year-transition animations + stable, cached per-year layouts. *Mobile still needs adjusting.*
- **About page** (§4b) — mobile height fix + active tab stays left-aligned (built 2026-09-13).
- **Studio Map Editor** — typed X/Y positions, draggable Changes panel + collapsible inspector, draft/published duplicate fix. *Studio redeployed 2026-09-18 — live.*

**▶ Pick back up here (in order):**
1. **Author the About Modal content** in Studio + fill the Substack / More-from-Eshap / Feedback links (Studio is redeployed, so the `about` singleton is available).
2. ~~Add the `VALUATIONS_CSV_URL` GitHub secret + run the Snapshot valuations workflow; set `SANITY_STUDIO_VALUATIONS_SNAPSHOT_URL` + redeploy Studio~~ — ✅ done 2026-09-20. The daily snapshot is live and is now the map's first-paint baseline (see [GOOGLE_FINANCE.md → Resilience](GOOGLE_FINANCE.md#resilience-the-daily-snapshot-is-the-baseline-the-live-sheet-upgrades-it)).
3. **Adobe Fonts kit** (§4c) — add the Netlify/prod domain(s) to the kit, and activate **Medium (500) + Demi (600)**. Until the domain is added, the *live* site renders the Libre Franklin fallback, not real Franklin Gothic.
4. **Historical maps on mobile** (§3) — adjust the year-transition layouts for the mobile/square view.
5. Then the remaining launch features (§4b: search, dynamic news feed), launch infra (§4c), QA passes (§2/§3/§5), and decisions (paywall, domain, analytics).

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
- [x] **Historical map layout** — ✅ improved (2026-09-18). Time Machine "Explore" replays a fly-out-from-the-sector-wells intro; saved-year pill toggles smoothly morph between **cached per-year layouts** (each tagged with the inputs it was resolved from, so switching is instant and a stale layout is re-resolved). Fixed: planets clustering on transition, the ~½s lag toggling to past years, residual overlap when returning to the present year, and a future `last_updated` showing a future month. Vitals now show on the present year only.
- [ ] **Historical layout on mobile** — the transition/caching work was tuned on desktop; adjust and verify it on the mobile/square view.
- [ ] Client QA pass: step through each year in both Desktop and Square modes; confirm the right companies/connections/sizes/positions render.

## 4. Front-end polish
- [ ] Restyle toward the light mockup; loading-moment animation; final responsive passes.

## 4b. Launch features (targeted for launch — short plans)

Each is grounded in existing code, not a from-scratch build. Rough effort in brackets.

- [x] **About page** — ✅ built as the **About modal** ([src/AboutModal.tsx](../src/AboutModal.tsx)), opened by the map's **ABOUT (ⓘ)** button (which replaced the standalone download button; the map download now lives in the modal's Downloads tab). Dimmed backdrop, hero image, sticky auto-scroll tab bar (mobile: swipeable with a right-edge fade), 500px reading column, custom blue scrollbar. **Fully CMS-driven** via a new Sanity `about` singleton built as a **block/page-builder**: a hero image + sections (each = one tab), each composed of mix-and-match blocks — *Section header, Body copy, Primary (blue) / Secondary (grey) button, Link, Photo*. Buttons link out (incl. `mailto:`) or trigger the map-snapshot download. Empty → falls back to built-in default copy. *(2026-09-18: on mobile the modal height uses `dvh` so it clears the browser toolbars, and the tab row slides to keep the active tab left-aligned with the column.)* **Remaining:** author real content in Studio (Studio redeployed 2026-09-18) + fill Substack/Eshap/feedback links.
- [ ] **Search (highlight-on-map)** *(½–1 day)*. Reuse what's already there: a text input filters the `nodes` list by company name; matches stay full-opacity while non-matches fade to `opacity: 0.12` — the **exact pattern already used for sector hover** ([MediaMap.tsx](../src/MediaMap.tsx) ~L2786/L4955). Single match → optional `focusOnPlanet()` zoom (already exists). No new data or deps. Scope is deliberately minimal: highlight only, no autocomplete.
- [ ] **Dynamic news feed** *(~1 day + tuning + one decision)*. The schema + side-panel rendering already exist (`external_articles[]` / `eshap_content[]` per company, rendered at [MediaMap.tsx](../src/MediaMap.tsx) ~L1143). "Dynamic" = a nightly GitHub Action (same pattern as `gf-sync-roster`) that pulls **free RSS → writes Sanity `external_articles`**:
  - Public cos → **Yahoo Finance RSS** (`feeds.finance.yahoo.com/rss/2.0/headline?s=<TICKER>`, ticker-keyed); private / no-ticker → **Google News RSS** (`news.google.com/rss/search?q=<name>`) fallback. Both free, no key. Cap ~5 recent, dedup by URL.
  - **Eshap content stays manual** (LinkedIn has no public API; Substack/podcast RSS isn't per-company — Evan curating 2–3 links per company is better UX). Optional later: a **global "Latest from Eshap"** strip pulled from his Substack/podcast RSS.
  - ⚠️ **Open decisions before building:** (a) approval gate? — write auto-pulled articles in an *unapproved* state (mirroring `vetting_status`) and show only approved, vs. show-all-and-delete-junk; (b) accept unofficial-RSS fragility, or pay for a sturdier API (Finnhub/NewsAPI) later; (c) global Eshap feed — yes/no.
- [x] **Download: consistent framing + branding** — ✅ done (2026-09-18; [src/exportMap.tsx](../src/exportMap.tsx) + [src/exportScene.tsx](../src/exportScene.tsx)).
  - **3840×2160 (16:9) PNG of the present-year map only**, always the full canonical desktop canvas (zoom- and window-size-independent), right-aligned.
  - **Left info panel** styled like the site side panel (MEDIA UNIVERSE {year} headline, sector/company counts, sector legend in subtle containers, Eshap logo) + a **Substack QR** bottom-right (white on `#070111`, from `public/Eshap_QR.svg`).
  - **No label overlaps:** before rendering, a label-aware pass tests the real label boxes + planet circles and nudges only the colliding (smaller / unpinned) planets apart; labels are 1.5px smaller than on-site. Pairs it can't separate (two pinned planets) are logged to the browser console — fix those in the Map Editor.
  - **Instant download:** the PNG is pre-rendered in the background once the map settles and re-rendered when it changes.
  - Tunables at the top of `exportMap.tsx`: `EXPORT_LABEL_GAP`, `EXPORT_CIRCLE_GAP`, `EXPORT_LABEL_SIZE_DELTA`.

## 4c. Launch infra / SEO / analytics

- [ ] **Adobe Fonts kit (ITC Franklin Gothic)** — the global typeface is now Franklin Gothic via a Typekit kit (family `"franklin-gothic"`; see [CLAUDE.md → Typography](../CLAUDE.md)). **Two Adobe-side steps:** (a) **add domains** (`localhost`, Netlify preview + the production domain) to the kit or the font silently falls back to Libre Franklin; (b) **activate the Medium (500) and Demi (600) styles** in the ITC Franklin Gothic family — the app already uses 500 (planet names, some headers) and 600 (modal title), which render as Book/Bold until those weights are activated.

- [ ] **Custom domain** — point the real launch URL at Netlify: add it in Netlify → Domain management, set the registrar DNS (CNAME/ALIAS or A records), let Netlify provision HTTPS (Let's Encrypt). **Do this early** — the OG tags (§4c) bake in the final URL. (The download QR points at Substack, so it doesn't depend on the domain.) *(Need: the domain name.)*
- [ ] **Fix `<title>`** — [index.html](../index.html) still says `media-map-web` (the repo name); set it to the real product name (e.g. "Media Universe", matching `apple-mobile-web-app-title`). One-liner; also seeds the default OG/tab title.
- [ ] **Proper favicon set** — a placeholder `/favicon.svg` exists; add a branded `favicon.svg` + a `favicon.ico` fallback (older browsers) + `apple-touch-icon.png` (180×180, iOS home screen) + optional `site.webmanifest` (PWA name/icons — the app already opts into standalone home-screen launch).
- [ ] **OG / social share meta** — none exist. Add `og:title`, `og:description`, `og:url`, `og:image` + `twitter:card=summary_large_image` to [index.html](../index.html), and a **1200×630 OG image**. *(Synergy: the §4b exporter ([src/exportMap.tsx](../src/exportMap.tsx)) already renders a clean, branded map PNG — reuse it to generate the OG image.)* Verify with the Facebook/LinkedIn/Twitter debuggers post-deploy.
- [ ] **Analytics** — none installed. **Decision first:** Google Analytics 4 (`gtag.js` + a `G-XXXXXXX` Measurement ID) — powerful but sets cookies, so it likely needs a consent banner (GDPR/UK). Cookieless alternatives (**Plausible**, **Netlify Analytics**, Fathom) need no banner and are far simpler — worth considering for a content site. Pick one, then wire the snippet into [index.html](../index.html). *(If GA4: need the Measurement ID + a call on the consent-banner requirement.)*

## 5. QA → launch
- [ ] Full QA pass + bug bash against the checklist.
- [ ] **Confirm the paid-gating decision** (freemium Time-Machine paywall) — launch requirement or post-launch? (Not started.)

---

## Roadmap — data quality
- [ ] **Plausibility check on Google Finance values** *(~½ day; roadmap, not blocking)*. `GOOGLEFINANCE("…","marketcap")` does not return a stable currency for dual-listed tickers — it may be the home currency or the listing currency, and it can **flip without warning**. Seen 2026-09-20: `NYSE:SONY` returned yen in the morning and dollars by evening, so the sheet's ×JPY rate turned $141B into **$0.90B**; same class as `LON:WPP` and `HKG:9988` (Alibaba showed $35.9B against $363B the year before). The daily snapshot does **not** protect against this — it faithfully copies the wrong number. Plan: in the app loader and `jobs/snapshot-valuations.ts`, distrust a **Google-Finance-sourced** current-year value that is more than ~5× off the previous year's (either direction) and keep the last good value instead; surface the flagged rows in `jobs/gf-audit-metadata.ts` and the console. **Manual rows must be exempt** — Anthropic (5.3×), Kobalt (5.8×) and A+E (0.13×) are real jumps. Until then the manual screen is: compare each company's current year to last year, and confirm suspects by implied share count (raw value ÷ share price in each candidate currency).

## Post-launch / not blocking
- Global "Latest from Eshap" feed (Substack/podcast RSS) — the per-company Eshap content stays manual (see §4b).
- Search autocomplete / fuzzy matching (launch ships highlight-only, §4b).
- Legacy cleanup (`loadCompanies.ts` / `historical.ts` mock; trim redundant Sanity `manual_valuations`).
