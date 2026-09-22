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
- [x] **Search** — ✅ built ([src/SearchBar.tsx](../src/SearchBar.tsx) + [src/searchMatch.ts](../src/searchMatch.ts)). A search icon sits right of the view tabs; clicking it collapses the tabs leftwards and grows a field into their place (`/` opens, Esc / ✕ / click-away closes). Typing ranks the roster into a dropdown (name-start → word-start or ticker → anywhere; on-year before off-year, then larger first), matched letters bold, up to 8 results, arrow keys + Enter. Non-matching planets and connection lines dim, and matching labels always render even on planets small enough to normally hide them. Picking a result travels per view: **Map** zooms + opens the side panel, **Linear** scrolls the strip, **List** scrolls to + flashes the row, **Aggregate** pins the band's outline until you click away. Findable but greyed with a reason: companies off the viewed year ("appears from 2022") and ones whose sector is toggled off. Accent- and case-insensitive; searches ticker too (`TGNA` → TEGNA). Dependency-free (~250 companies = a linear scan per keystroke).
  - [ ] **QA search, especially on mobile** — the dropdown sits below the bar so the on-screen keyboard doesn't cover it, and the input is 16px so iOS Safari doesn't zoom the page on focus; both need real-device checks. Also worth confirming: the tab-collapse/field-expand animation at narrow widths, that the dropdown matches the bar's width (it stretches to the view-tab pill's edges), and that travel works in all four views on touch.
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

## Roadmap — layout stability

- [ ] **Fix the resize problem: planets ratchet outward on every re-settle** *(~½ day)*. Resizing the browser drives small planets to the edges and leaves gaps in the middle, and it never recovers when the window grows back.
  - **Why resize touches physics at all:** positions are in slide units, so a resize is normally just an SVG rescale — but labels are drawn at a constant *pixel* size, so their collision footprint in slide units grows as the window shrinks (2× at 800px vs 1600px of map width). `labelRadii` is therefore the **only** physics input that changes on a desktop resize, and it re-runs the whole layout.
  - **Why the layout drifts (the real cause):** the steady-state re-settle in [usePhysicsLayout.ts](../packages/map-core/src/usePhysicsLayout.ts) is almost purely expansive — ~140 full-strength `separateOverlaps` sweeps (which move positions directly and only ever push *apart*) plus `ejectFromFixed`, against ~50 cooling sim ticks whose attraction totals only ~15% of the way home at `sectorPull` 0.02. Nothing pulls planets back, so each re-settle is a one-way step: shrink pushes out, growing back doesn't restore. Pinned planets stay put, so only free planets drift — hence voids around the big pinned giants.
  - ⚠️ **Not resize-specific:** *every* re-settle takes the same one-way step — toggling a sector, the live valuations landing, changing a knob. Resize is just the most visible trigger.
  - **Fixes, in order:** (a) **take resize out of the physics** — measure `labelRadii` at a fixed reference width, exactly as the export does (`EXPORT_REF_CONTAINER_W`), so container size stops being a physics input (cost: tighter label spacing on small windows); (b) **make re-settles idempotent** — reseed from each planet's authored target (sector center / pinned override) or the per-year cached layout instead of from already-drifted positions, so re-settling twice equals re-settling once. (a)+(b) together make the layout stable for all triggers.
  - **Stopgaps if the above is deferred** *(reduce frequency, don't fix the cause)*: debounce the re-settle to ~200ms after the drag stops (turns ~60 re-settles per window-drag into 1 — most of the win), and ignore changes under ~5% in slide-units-per-pixel.

## Roadmap — data quality

- [x] **Stop GOOGLEFINANCE currency switches breaking market caps** — ✅ built 2026-09-21 (rollout: run the **GF sync roster** workflow once, see below). GOOGLEFINANCE's `marketcap` is not returned in a stable currency for dual-listed tickers and it **flips without warning — even with an exchange prefix** (`HKG:9988` is already prefixed; the "add the prefix" advice fixes `price`, not `marketcap`). Observed: Alibaba USD → HKD → USD across three days ($2,159B / $36B on the map); `NYSE:SONY` JPY → USD in a day ($0.90B); `OTCMKTS:SGAMY` (Sega Sammy) JPY → USD on 2026-09-21 ($0.03B). Meanwhile ITV/Tencent return local currency — no rule by exchange.
  - **The fix** ([jobs/gfTicker.ts](../jobs/gfTicker.ts) `marketCapFormula`): the current-year formula computes BOTH readings — "local currency" (× FX) and "already USD" (× 1) — and keeps whichever is closer (log-distance) to **last year's value in the same row**. A flip is never subtle (8× HKD, 150× JPY, 1,400× KRW), so the pick is unambiguous. **Near-parity currencies (EUR/GBP/CAD/AUD, rate between ½ and 2) are deliberately excluded** — there a flip is only a 15–40% error, indistinguishable from a real move, and simulation showed the test would "correct" genuine changes. No prior-year value → local reading (previous behaviour). Simulated against the live roster: changes exactly the 2 rows that are broken today (Alibaba, Sega Sammy) and leaves the other 107 untouched.
  - **Set `Currency` to the company's HOME currency, not to USD.** With `USD` (rate 1) both readings are identical and the formula can't disambiguate. So: **Sony → JPY** (currently USD; a JPY flip would show ¥22T as $22T), Alibaba stays HKD, Sega Sammy stays JPY. WPP / Publicis / Deutsche Telekom keep their USD overrides — Google has been consistently USD for those, and their currencies are near parity anyway.
  - **Rollout:** merge → Actions → **GF sync roster** → Run workflow (it rewrites every api row's current-year formula) → set Sony's currency to JPY in Sanity (the webhook re-syncs the sheet).
  - **Still worth doing later:** the `GOOGLEFINANCE(…,"currency")` detection column, and `price × shares` as the fully self-consistent cap (needs a sheet test of `shares` coverage first).
- [ ] **Plausibility check on Google Finance values** *(~½ day; roadmap, not blocking)*. `GOOGLEFINANCE("…","marketcap")` does not return a stable currency for dual-listed tickers — it may be the home currency or the listing currency, and it can **flip without warning**. Seen 2026-09-20: `NYSE:SONY` returned yen in the morning and dollars by evening, so the sheet's ×JPY rate turned $141B into **$0.90B**; same class as `LON:WPP` and `HKG:9988` (Alibaba showed $35.9B against $363B the year before). The daily snapshot does **not** protect against this — it faithfully copies the wrong number. Plan: in the app loader and `jobs/snapshot-valuations.ts`, distrust a **Google-Finance-sourced** current-year value that is more than ~5× off the previous year's (either direction) and keep the last good value instead; surface the flagged rows in `jobs/gf-audit-metadata.ts` and the console. **Manual rows must be exempt** — Anthropic (5.3×), Kobalt (5.8×) and A+E (0.13×) are real jumps. Until then the manual screen is: compare each company's current year to last year, and confirm suspects by implied share count (raw value ÷ share price in each candidate currency).

## Post-launch / not blocking
- Global "Latest from Eshap" feed (Substack/podcast RSS) — the per-company Eshap content stays manual (see §4b).
- Search autocomplete / fuzzy matching (launch ships highlight-only, §4b).
- Legacy cleanup (`loadCompanies.ts` / `historical.ts` mock; trim redundant Sanity `manual_valuations`).
