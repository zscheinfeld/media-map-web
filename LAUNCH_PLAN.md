# Media Map — Launch Plan

**Window:** Mon Jun 15 → public launch Tue Sep 22, 2026 (~15 working weeks)
**Builder:** Solo dev (you) — building the system; **client** enters data and QAs historical maps in parallel.
**Soft launch:** Tue Sep 8 (limited audience)
**Hard launch:** Tue Sep 22 (public)

This runs as **two parallel tracks.** Your build track is mostly sequential. The client track runs alongside it the entire time: the client enters data continuously (in a spreadsheet at first, then directly in the Sanity editor once it's live) and, later, checks that historical maps render and look right in the editor. APIs auto-fill whatever data they can; the client fills the rest — especially private-company and historical valuations, which can't be sourced automatically.

The key restructure: the historical-data problem is **data sourcing, not engineering**, so it's pulled out of the critical path. Backend wiring is only ~2 weeks; the data acquisition happens in parallel on the client track and doesn't block the build.

---

## Two-track overview

**Build track (you):** Setup → Backend + API → CMS/Sanity editor → Frontend cleanup → Mobile + touch → QA → soft launch → harden → hard launch.

**Client track (parallel):**

- **Data entry — ongoing (Week 1 → soft launch).** Starts in a structured spreadsheet while the editor is being built; moves into the **Sanity editor once it goes live (Jul 24)**. APIs handle what they can automatically; the client covers private + historical figures by hand.
- **Historical-map QA (Week 8 → soft launch).** As historical data fills in, the client uses the Sanity map editor to confirm each historical map renders correctly and is visually well-designed (positions, connections, styling at each point in time).

The hand-off point is the end of **Phase 2**: once the Sanity editor is live, the client's tooling for both data entry and historical-map QA exists.

---

## Client check-in cadence (tiered)

Fast turnaround assumed. **Zoom** = decisions and visual/UX feedback; **Async** (short Loom + written notes) = progress demos and low-stakes confirmations that don't block work.

| # | Date | Tier | Topic |
|---|---|---|---|
| 1 | Fri Jun 19 | **Zoom** | Kickoff + scope sign-off (the 6 open questions, API sources, data plan) |
| 2 | Fri Jul 3 | Async | Backend + API live; data-entry workflow handed off — client begins entry |
| 3 | Fri Jul 24 | **Zoom** | Sanity editor walkthrough — train client on data entry + historical-map QA |
| 4 | Fri Aug 7 | **Zoom** | Design review — map, side panel, timeline |
| 5 | Fri Aug 28 | Async | Mobile build to test on device + historical-map QA progress |
| 6 | Tue Sep 8 | **Zoom** | Soft-launch debrief |
| 7 | Fri Sep 18 | **Zoom** | Go / no-go for public launch |

---

## Build track — phases

### Phase 0 — Setup & scope · Week 1 (Jun 15–19)

Lock scope and stand up the plumbing the rest depends on.

- Freeze v1 scope and write the launch checklist.
- Design the Supabase schema from the content model (companies, sectors, connections, valuations time-series, date-ranged position overrides + connections).
- Choose API sources for valuations; confirm coverage and limits.
- **Stand up the interim data-entry sheet so the client can start immediately** (structured to match the schema, so it migrates cleanly later).

**Exit:** scope frozen, schema designed, API sources confirmed, client unblocked to begin entry.

### Phase 1 — Backend + API · Weeks 2–3 (Jun 22 – Jul 3)

The plumbing — short, because it's mechanical.

- Provision Supabase; create tables; seed from the existing sheet.
- Build API auto-ingestion for the valuations APIs can supply; schedule refreshes.
- Swap `loadCompanies.ts` from the CSV fetch → Supabase, and add real schema validation (today malformed cells are silently dropped).

**Exit:** map renders from Supabase with API-sourced data; ingestion runs on a schedule. *(Client continues entering the rest in parallel.)*

### Phase 2 — CMS / Sanity editor + time-scoping · Weeks 4–6 (Jul 6 – Jul 24)

Build the system the client actually uses. **This is your core deliverable** — the editor is what lets the client author data and QA historical maps.

- Stand up the Sanity editor backed by Supabase; migrate positions, connections, styles, sectors into it.
- Implement effective date ranges on positions and connections (currently planned, not built) — this is what makes historical maps possible.
- Wire the global year+month selector so edits stamp the viewed date.

**Exit (Jul 24, client tooling live):** a non-engineer can add/edit companies, sectors, connections, positions and connections by date, directly in the editor.

### Phase 3 — Frontend cleanup · Weeks 7–8 (Jul 27 – Aug 7)

Polish the views that are mostly there; focus on consistency and responsiveness.

- Main map, side panel, and timeline experience visual passes.
- Make all main views responsive across breakpoints.

**Exit:** every main view looks intentional and reflows cleanly; no layout breaks between mobile and desktop canvases.

### Phase 4 — Mobile + touch · Weeks 9–11 (Aug 10 – Aug 28)

The app has **no touch handlers** today — only mouse events — so mobile can't pan, zoom, or drag. This is implementation plus real-device testing, hence three weeks.

- Add touch handlers for pan / pinch-zoom / tap-to-focus.
- Verify the mobile canvas swap, sector drawer, and label behavior on real hardware.
- Test across real iOS + Android devices and sizes.

**Exit:** the map is fully usable by touch on real phones; nothing relies on a mouse.

### Phase 5 — QA → soft launch · Weeks 12–13 (Aug 31 – Sep 11)

- Full QA pass against the checklist; bug bash; fix criticals.
- **Soft launch Tue Sep 8** to a limited audience to surface real-world issues.

**Exit:** no known critical/high bugs; soft-launch group has access and a way to report problems.

### Phase 6 — Feedback + harden · Week 14 (Sep 14–18)

- Triage and fix soft-launch feedback; performance and error monitoring; final polish.
- **Doubles as schedule slack** — absorbs any earlier slip.

**Exit:** soft-launch findings resolved; analytics + error tracking live; go/no-go made.

### Phase 7 — Hard launch · Week 15 (Sep 21–25)

- **Public launch Tue Sep 22.** Monitor closely; keep a fast-fix loop open.

---

## Key risks & where they're handled

- **Historical private valuations are a data hunt** → moved off the critical path onto the parallel client track (with client data-entry support); API auto-ingestion reduces the manual load. Levers if it runs long: coarsen granularity (annual/quarterly vs monthly), cap history depth (~5 years), or ship present-day at launch and backfill history as a fast-follow.
- **Client data entry depends on good tooling** → Phase 2 (the Sanity editor) is treated as the core deliverable; an interim sheet keeps the client productive before it's live.
- **No touch support today** → its own three-week phase, not an afterthought.
- **Solo dependency chain** → Phase 6 is intentional buffer; the two-week soft-to-hard gap is recoverable slack.

## Open questions to settle in Phase 0

1. Real time-series valuation data in scope (confirmed — yes), and at what granularity (monthly / quarterly / annual)?
2. Fixed/curated sector list, or editor-addable?
3. Only solid/dotted connections, or more relationship types / directionality?
4. Per-company logos, links, or richer profiles?
5. Author mobile positions too, or auto-derive them?
6. One date window per item, or multiple disjoint windows (and is dotted→solid two entries or one with a close date)?
