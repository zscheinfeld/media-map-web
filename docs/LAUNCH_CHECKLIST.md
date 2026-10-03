# Launch checklist — remaining steps

*Working checklist of what's left to launch. Complements [LAUNCH_PLAN.md](LAUNCH_PLAN.md) (the schedule) and [PROJECT.md → Build status](PROJECT.md#build-status). Last reviewed: 2026-10-03.*

The site is **live on the Google Finance sheet** (public app + hosted Studio + Sanity-webhook reconciler). The FMP→GF switch is **done** (§1); everything below it is polish/QA + optional cleanup.

**Just shipped (2026-09-18, merged to `main` via PR #7 — commit `6259048`):**
- **Download reworked** (§4b) — 16:9 branded export, pre-rendered in the background, label-aware de-overlap.
- **Historical map layout improved** (§3) — year-transition animations + stable, cached per-year layouts. *Mobile still needs adjusting.*
- **About page** (§4b) — mobile height fix + active tab stays left-aligned (built 2026-09-13).
- **Studio Map Editor** — typed X/Y positions, draggable Changes panel + collapsible inspector, draft/published duplicate fix. *Studio redeployed 2026-09-18 — live.*

**▶ Pick back up here (in order):**
1. **Author the About Modal content** in Studio + fill the Substack / More-from-Eshap / Feedback links (Studio is redeployed, so the `about` singleton is available).
2. ~~Add the `VALUATIONS_CSV_URL` GitHub secret + run the Snapshot valuations workflow; set `SANITY_STUDIO_VALUATIONS_SNAPSHOT_URL` + redeploy Studio~~ — ✅ done 2026-09-20. The daily snapshot is live and is now the map's first-paint baseline (see [GOOGLE_FINANCE.md → Resilience](GOOGLE_FINANCE.md#resilience-the-daily-snapshot-is-the-baseline-the-live-sheet-upgrades-it)).
3. ~~**Adobe Fonts kit**~~ — ✅ not needed (2026-09-24): Libre Franklin (self-hosted) is the launch typeface; see §4c.
4. **Historical maps on mobile** (§3) — adjust the year-transition layouts for the mobile/square view.
5. Then the remaining launch features (§4b: search, dynamic news feed), launch infra (§4c), QA passes (§2/§3/§5), and decisions (domain, analytics).

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
- [ ] **Real-device QA** across iOS + Android sizes. Include the 2026-10-03 changes, so far only checked on desktop: the restyled modals (About + DOWNLOAD button — card size/corners, 85% dim + blur, fade in/out, scrolling inside the card), the logo hover, and the Time Machine's "Explore this map" button. Blur (`backdrop-filter`) is the one most likely to look different or cost performance on older phones.
- *Map editing (Studio and `?edit=1`) is desktop-only — mouse/trackpad. Touch dragging deliberately not supported (decided 2026-09-24: no tablet editing planned).*

## 3. Historical-map editing — ✅ available; QA remaining

The Studio Map Editor's **year picker** scopes appearance windows, connections, and (via the sheet) valuations. An **Aspect ratio dropdown (Desktop / Square)** now lets you author **both** layouts: Square mode swaps to the square canvas + sector `mobile_center` + per-planet `mobile_position_overrides`, and dragging saves to the mobile field (desktop drags still save the desktop field). The square layout was migrated out of code (`MOBILE_LAYOUTS.square`) into Sanity — company + entity `mobile_position_overrides` and sector `mobile_center`. The app's square view reads those (falling back to code) once cut over/deployed.
- [x] **Historical map layout** — ✅ improved (2026-09-18). Time Machine "Explore" replays a fly-out-from-the-sector-wells intro; saved-year pill toggles smoothly morph between **cached per-year layouts** (each tagged with the inputs it was resolved from, so switching is instant and a stale layout is re-resolved). Fixed: planets clustering on transition, the ~½s lag toggling to past years, residual overlap when returning to the present year, and a future `last_updated` showing a future month. Vitals now show on the present year only.
- [ ] **Historical layout on mobile** — the transition/caching work was tuned on desktop; adjust and verify it on the mobile/square view.
- [ ] Client QA pass: step through each year in both Desktop and Square modes; confirm the right companies/connections/sizes/positions render.

## 4. Front-end polish
- [ ] Restyle toward the light mockup; loading-moment animation; final responsive passes.

## 3b. Content entry
- [x] **Vitals entered** — ✅ done (2026-10-01). The client has entered company vitals (the time-bound fact tags, e.g. "Minecraft" / "230M MAU") in Studio; they show in the side panel for the present year.

## 4b. Launch features (targeted for launch — short plans)

Each is grounded in existing code, not a from-scratch build. Rough effort in brackets.

- [x] **About page** — ✅ built as the **About modal** ([src/AboutModal.tsx](../src/AboutModal.tsx)), opened by the map's **DOWNLOAD** button (bottom-right, download icon; was "ABOUT (ⓘ)" until 2026-10-03). The map PNG download lives in the modal's Downloads tab. Dimmed backdrop, hero image, sticky auto-scroll tab bar (mobile: swipeable with a right-edge fade), 500px reading column, custom blue scrollbar. **Fully CMS-driven** via a new Sanity `about` singleton built as a **block/page-builder**: a hero image + sections (each = one tab), each composed of mix-and-match blocks — *Section header, Body copy, Primary (blue) / Secondary (grey) button, Link, Photo*. Buttons link out (incl. `mailto:`) or trigger the map-snapshot download. Empty → falls back to built-in default copy. *(2026-09-18: on mobile the modal height uses `dvh` so it clears the browser toolbars, and the tab row slides to keep the active tab left-aligned with the column.)* **Remaining:** author real content in Studio (Studio redeployed 2026-09-18) + fill Substack/Eshap/feedback links.
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

- [x] ~~**Adobe Fonts kit (ITC Franklin Gothic)**~~ — ✅ **not needed** (decided 2026-09-24): the self-hosted **Libre Franklin** looks right and is what the live site already renders (the Typekit kit isn't domain-allowlisted, so it falls back). No Adobe-side steps. *Optional cleanup:* remove the Typekit `<link>`s from [index.html](../index.html) so every environment renders the same face.

- [x] **Custom domain → `map.eshap.tv`** — ✅ **live since 2026-10-02** (Let's Encrypt cert, set as Netlify primary). All steps done 2026-10-03. Note: the old `eshap-media-map.netlify.app` address still serves the site too — Netlify's "primary domain" does NOT redirect it; a forwarding rule would be needed and isn't wanted for now. eshap.tv is registered at GoDaddy but its **DNS is on Cloudflare** (nameservers `*.ns.cloudflare.com`), so GoDaddy DNS edits do nothing.
  1. [x] **Sanity CORS** — add `https://map.eshap.tv` at sanity.io/manage → API → CORS origins (do any time; without it the map loads with no data on the new domain).
  2. [x] **Cloudflare (account holder)** — (a) add `TXT` `subdomain-owner-verification` = the value Netlify's add-domain screen shows (was `0c92e7a7339447ac53f0a3848a77f3ff`; re-check it); (b) edit the `map` record → `CNAME` `map` → `eshap-media-map.netlify.app`, **DNS only** (grey cloud); (c) turn off/delete the redirect rule for map.eshap.tv (Rules → Redirect Rules / Page Rules).
  3. [x] **Verify DNS from here** before clicking anything in Netlify (`dig TXT subdomain-owner-verification.eshap.tv`, `dig CNAME map.eshap.tv`).
  4. [x] **Netlify** — Domain management → Add a domain → `map.eshap.tv` → *Add subdomain* → **Set as primary domain**.
  5. [x] **Netlify HTTPS** — Domain management → HTTPS → *Verify DNS configuration* → *Provision certificate*. Confirm `https://map.eshap.tv` loads with a valid cert and Sanity data.
  6. [x] **Code** — `og:url` / `og:image` / `twitter:image` in [index.html](../index.html) point at `https://map.eshap.tv` (2026-10-03). After deploy, refresh the stored preview in the LinkedIn Post Inspector / Facebook Sharing Debugger.
  7. [x] **Studio** — set `SANITY_STUDIO_VALUATIONS_SNAPSHOT_URL` in `studio/.env` to `https://map.eshap.tv/valuations-snapshot.csv` (the netlify.app URL will redirect once the custom domain is primary, which can break the cross-origin fetch), then **redeploy Studio**. Deploy with `SANITY_AUTH_TOKEN= npx sanity deploy` — the robot token in `studio/.env` otherwise overrides your login and lacks deploy rights. ✅ done (2026-10-03).
- [x] **Fix `<title>`** — ✅ set to **"ESHAP Media Universe"** (2026-09-24). The iOS home-screen label (`apple-mobile-web-app-title`) stays the shorter "Media Universe" so it isn't truncated under the icon.
- [x] **Proper favicon set** — ✅ done (2026-10-01, PR #20/#21): `public/favicon/` — SVG + 16/32 PNG + `.ico`, full-bleed 180px `apple-touch-icon.png`, `site.webmanifest` (dark navy theme). *Remaining:* re-export the two `android-chrome-*.png` full-bleed (still circle-on-transparent; Android launchers crop to their own shape).
- [x] **OG / social share meta** — ✅ done (2026-10-01, PR #21): meta description + Open Graph + `twitter:card=summary_large_image` in [index.html](../index.html), 1200×630 `public/og-image.png` (~300 KB). Description credits Evan Shapiro, media cartographer. URLs point at the Netlify host until the custom domain lands (see above). *Note:* the title/legend sit in the image's far-left strip, which square crops (WhatsApp/iMessage) cut off.
- [ ] **Analytics** — none installed. **Decision first:** Google Analytics 4 (`gtag.js` + a `G-XXXXXXX` Measurement ID) — powerful but sets cookies, so it likely needs a consent banner (GDPR/UK). Cookieless alternatives (**Plausible**, **Netlify Analytics**, Fathom) need no banner and are far simpler — worth considering for a content site. Pick one, then wire the snippet into [index.html](../index.html). *(If GA4: need the Measurement ID + a call on the consent-banner requirement.)*

## 5. QA → launch
- [ ] Full QA pass + bug bash against the checklist.
- [x] ~~**Confirm the paid-gating decision**~~ — ✅ decided 2026-09-24: **no paywall**. Everything stays free; the conversion path is the Substack subscribe pipeline (About modal buttons + the download's Substack QR).

---

## Roadmap — layout stability

- [ ] **Fix the resize problem: planets ratchet outward on every re-settle** *(~½ day)*. Resizing the browser drives small planets to the edges and leaves gaps in the middle, and it never recovers when the window grows back. **Related (found 2026-10-03):** opening/closing the sidebar logs a React "Maximum update depth exceeded" warning in development — while the sidebar animates, the map width changes every frame, `labelRadii` is re-measured each frame and the physics sim rebuilds each frame. No visible breakage; production builds don't print the warning, but the per-frame rebuilds still cost work during the slide. A debounce of `labelRadii` alone did NOT remove the warning (tried, reverted) — investigate alongside the ratchet.
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
- [ ] **DECISION: currency flips for the near-parity currencies (EUR / GBP / CAD / AUD)** — *open; Zach thinking it over (2026-09-22)*. The fix above covers the far-from-parity currencies (HKD, JPY, KRW, INR, CNY, SEK — ✅ verified live: Sega Sammy self-corrected $0.03B → $4.39B; Alibaba corrects once its Currency is set to HKD). It **deliberately does nothing** for currencies with a rate between ½ and 2, where a flip is a 15–34% error indistinguishable from a real move.
  - **Exposure:** ~18 companies, but very lopsided — **Deutsche Telekom $151B** (EUR, on a *USD override* → the same fragile setup Alibaba had), then UMG $31B, Publicis $28B, Quebecor $10B, WPP $5.5B; the other 13 are all under $5B. Planet radius scales with √value, so a flip is a **7–16% size error** — visible on Deutsche Telekom, a few pixels on the small ones. The top three are ~$210B of the group's ~$250B.
  - **Options, ranked:**
    1. **Ratio-signature correction** *(~1 day; recommended if automating)* — a flip has a fingerprint: the value changes **overnight by exactly the FX rate** (EUR ×1.148/×0.871, GBP ×1.34/×0.746), which a genuine move almost never does. Detect it day-over-day (the snapshot job already has yesterday's value; the app already compares live vs snapshot; the FX rate is in the sheet's `FX_to_USD` column) and **undo it** (`÷ fx`) rather than hold the old value — so it self-corrects even if Google switches permanently and nothing goes stale. Failure mode: a genuine move of exactly ~fx on one day gets "corrected" for that day, then snaps right. Protects every currency, not just these.
    2. **Run the 5-minute sheet test first** (`"currency"`, `"marketcap"`, `"price"`, `"shares"`, `price×shares` for `EPA:PUB`, `ETR:DTE`, `LON:WPP`). If Google's `"currency"` attribute flips in sync with `marketcap`, feeding it into `fxFormula` is the cheapest fix of all; if `"shares"` is populated for European listings, `price × shares` is fully self-consistent. WPP (price in pence, cap in USD) is the known counter-example.
    3. **Manual entry for the top three only** (Deutsche Telekom, UMG, Publicis — monthly check). Zero automation risk; covers 85% of the exposure; 3 companies of upkeep, not 18.
    4. **Manual entry for all 18.** The ones you'd forget.
    5. **Accept it.** 7–16% on mid-size planets, a few days at a time.
  - **Whatever is chosen:** Deutsche Telekom's USD override should be revisited — at $151B it's the one that matters, and a flip back to EUR would read ~$173B until noticed.
- [ ] **Plausibility check on Google Finance values** *(~½ day; roadmap, not blocking)*. `GOOGLEFINANCE("…","marketcap")` does not return a stable currency for dual-listed tickers — it may be the home currency or the listing currency, and it can **flip without warning**. Seen 2026-09-20: `NYSE:SONY` returned yen in the morning and dollars by evening, so the sheet's ×JPY rate turned $141B into **$0.90B**; same class as `LON:WPP` and `HKG:9988` (Alibaba showed $35.9B against $363B the year before). The daily snapshot does **not** protect against this — it faithfully copies the wrong number. Plan: in the app loader and `jobs/snapshot-valuations.ts`, distrust a **Google-Finance-sourced** current-year value that is more than ~5× off the previous year's (either direction) and keep the last good value instead; surface the flagged rows in `jobs/gf-audit-metadata.ts` and the console. **Manual rows must be exempt** — Anthropic (5.3×), Kobalt (5.8×) and A+E (0.13×) are real jumps. Until then the manual screen is: compare each company's current year to last year, and confirm suspects by implied share count (raw value ÷ share price in each candidate currency).

## Roadmap — accessibility

- [ ] **Accessibility controls** *(~1–2 days; roadmap, not blocking)*. Today the app has ARIA labels on its buttons/toggles and a keyboard-navigable search combobox, but the map itself is mouse/touch-only and there are no user-facing a11y settings. In rough priority order:
  - **Reduced motion** — honour `prefers-reduced-motion` (skip the fly-in intro, year-transition tweens, Aggregate grow-up and focus-zoom easing; jump straight to the settled state) and expose a manual **"Reduce motion"** toggle for people who haven't set the OS preference. Cheapest and highest-value item.
  - **Keyboard access to the map** — planets are plain SVG `<g onClick>` with no `tabIndex`/`role`, so a keyboard user can't reach them. Add `role="button"` + `tabIndex` + Enter/Space on each planet, a visible focus ring, and an "Esc closes the side panel" path. Search already gets keyboard users to a company, so this is the one that unlocks the rest.
  - **Text size / contrast** — a **"Larger labels"** toggle (bumps `labelSizePx` + side-panel type) and a **high-contrast** mode (solid label backgrounds, stronger strokes, no dimmed non-matches). Check the grey-on-dark UI text (e.g. `rgba(255,255,255,0.55)` captions) against WCAG AA 4.5:1.
  - **Screen-reader fallback** — the SVG is opaque to assistive tech. Give it an `aria-label` summary ("Media map: N companies across M sectors, sized by market cap") and point readers at the **List view**, which is already a real table — may just need `<th scope>`/caption polish.
  - **Where the controls live:** a small "Accessibility" section in the existing settings/`tune` menu on mobile and the sidebar footer on desktop; persist in `localStorage`. Audit with Lighthouse + axe before calling it done.

## Post-launch / not blocking
- Global "Latest from Eshap" feed (Substack/podcast RSS) — the per-company Eshap content stays manual (see §4b).
- Search autocomplete / fuzzy matching (launch ships highlight-only, §4b).
- Legacy cleanup (`loadCompanies.ts` / `historical.ts` mock; trim redundant Sanity `manual_valuations`).
