# Media Map — launch plan

**Window:** Mon Jun 15 → public launch Tue Sep 22, 2026 (~15 working weeks)
**Builder:** Solo dev — building the system; **client** enters data and QAs historical maps in parallel.
**Soft launch:** Tue Sep 8 · **Hard launch:** Tue Sep 22

> **Status (as of Jul 17, 2026): the build is well ahead of this original calendar.** The data/backend, CMS editor, and public-app data-wiring are all done and **live** (public site + hosted Studio + nightly ingest), and the timeline is already the final **yearly** model. The remaining build work is **mobile + touch**, front-end polish, and the QA → launch runway. Note the architecture landed differently than first planned: **valuations live in a Google Sheet (FMP ingest), structure in Sanity — there is no Supabase.** Engineering detail lives in [PROJECT.md → Build status](PROJECT.md#build-status); this doc is the schedule + client track.

This runs as **two parallel tracks.** The build track is mostly sequential; the client track runs alongside the entire time — the client enters data continuously (in the sheet for numbers, in the Sanity editor for structure) and later QAs that historical maps render correctly. APIs auto-fill what they can (public market caps via FMP); the client fills the rest (private + any corrections).

---

## Two-track overview

**Build track (you):** Setup → Data + ingest → CMS / Sanity editor → Frontend data-wiring → **Mobile + touch** → QA → soft launch → harden → hard launch.

**Client track (parallel):**
- **Data entry — ongoing.** Structure in the **Sanity editor** (live); valuation numbers in the **Google Sheet** — see [SHEET_EDITING_GUIDE.md](SHEET_EDITING_GUIDE.md). FMP auto-fills public market caps; the client covers private/PSM figures and any historical corrections.
- **Historical-map QA — ongoing.** As data fills in, the client uses the Map Editor's **year picker** to confirm each yearly map renders correctly and looks right (positions, connections, appearance windows, styling).

---

## Client check-in cadence (tiered)

**Zoom** = decisions and visual/UX feedback; **Async** (short Loom + notes) = progress demos and low-stakes confirmations.

| # | Date | Tier | Topic | |
|---|---|---|---|---|
| 1 | Fri Jun 19 | **Zoom** | Kickoff + scope sign-off (open questions, API sources, data plan) | ✅ past |
| 2 | Fri Jul 3 | Async | Data + ingest live; data-entry workflow handed off | ✅ past |
| 3 | Fri Jul 24 | **Zoom** | Sanity editor walkthrough — train on data entry + historical-map QA | upcoming |
| 4 | Fri Aug 7 | **Zoom** | Design review — map, side panel, timeline | |
| 5 | Fri Aug 28 | Async | Mobile build to test on device + historical-map QA progress | |
| 6 | Tue Sep 8 | **Zoom** | Soft-launch debrief | |
| 7 | Fri Sep 18 | **Zoom** | Go / no-go for public launch | |

---

## Build track — phases

### ✅ Setup, data, CMS editor, frontend data-wiring — done (ahead of schedule)

Delivered via the Sanity + Google-Sheet architecture (not the originally-planned Supabase):
- **Data + ingest** — a Google Sheet is the single source of truth for valuations; a nightly **GitHub Action** pulls public market caps from FMP; the client enters the rest. History is a one-time asset (owned in the sheet). One column per **year**.
- **CMS / Sanity editor + time-scoping** — the in-Studio **Map Editor** authors companies, entities, sectors, connections, positions, styles, and layout knobs, all **year-scoped** via a year picker. Effective date ranges (positions, appearance windows, connection windows) are built and honored on both the editor and the public map.
- **Frontend data-wiring** — the public app reads structure from Sanity + numbers from the sheet, resolved at the viewed year; side panel, per-company primary metric, timeline, and aggregate view all live.

### ⏳ Mobile + touch · the largest remaining build

The app has **no touch handlers** today — only mouse events — so phones can't pan, pinch-zoom, or drag.
- Add touch handlers for pan / pinch-zoom / tap-to-focus.
- Verify the mobile canvas swap, sector drawer, and label behavior on real hardware.
- Test across real iOS + Android devices and sizes.

**Exit:** the map is fully usable by touch on real phones; nothing relies on a mouse.

### ⏳ Frontend polish

- Restyle toward the light mockup; loading-moment animation; final visual/responsive passes across breakpoints.

### ⏳ QA → soft launch

- Full QA pass against the checklist; bug bash; fix criticals.
- **Soft launch Tue Sep 8** to a limited audience.

### ⏳ Feedback + harden (schedule slack)

- Triage soft-launch feedback; performance + error monitoring; final polish. Absorbs any earlier slip.

### ⏳ Hard launch

- **Public launch Tue Sep 22.** Monitor closely; keep a fast-fix loop open.

---

## Key risks & where they're handled

- **Historical private valuations are a data hunt** → off the critical path onto the parallel client track; FMP auto-ingestion reduces manual load. Levers if it runs long: coarser granularity (already annual), cap history depth, or ship present-day and backfill.
- **Client data entry depends on good tooling** → the Sanity editor + the sheet (with [SHEET_EDITING_GUIDE.md](SHEET_EDITING_GUIDE.md)) are live and documented.
- **No touch support today** → its own phase, not an afterthought.
- **Solo dependency chain** → the harden week is intentional buffer; the soft-to-hard gap is recoverable slack.
- **Valuation provider coverage** → FMP Starter is US-only (non-US shows "NA"); a global plan is a cost decision to settle with the client.
