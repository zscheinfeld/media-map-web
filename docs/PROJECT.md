# Media Map — project reference

The single source of truth for **what the Media Map is, how it's modeled, and where the build stands.**

- Dated launch schedule + client check-in cadence → [LAUNCH_PLAN.md](LAUNCH_PLAN.md)
- Who-can-edit-what in the valuation sheet (client-facing) → [SHEET_EDITING_GUIDE.md](SHEET_EDITING_GUIDE.md)
- How to work in the codebase (commands, code architecture) → [../CLAUDE.md](../CLAUDE.md)

---

## What it is

A "starfield" of companies. Each company is a **planet** whose size reflects its valuation. Planets cluster into **sectors** (gravity wells), **connections** (lines) show ownership/acquisition relationships, and **entities** are text-only sub-brands (e.g. ABC, Marvel) that hang off a parent. The whole map is tied to a **point in time** (a year), so valuations — and planet sizes — change as you move along the timeline.

Four authored item types — **Companies (Planets)**, **Entities**, **Sectors**, **Connections** — plus a **time dimension**. Attributes below are **authored** (needs a CMS field) or **derived** (the app computes them).

## Architecture at a glance

- **Public app** — Vite + React 19 SPA at the repo root. Renders the map from `@media-map/map-core` (a shared renderer + physics package). No router, no state manager — hooks + an SVG scene.
- **Studio** — Sanity Studio v3 in `studio/` (React 18, standalone — not in the npm workspace). Holds all **structure** (companies, entities, sectors, connections, styles, positions, layout knobs) and an in-Studio **Map Editor** built on the same `map-core` canvas, so the editor and the public map draw identically.
- **Valuations** — a published **Google Sheet**, one column per **year**, filled by a nightly **GitHub Action** (Financial Modeling Prep) plus client manual entry. No database — a sheet is robust at this scale (≈175 companies × ~12 years).
- **`packages/map-core`** — ESM renderer + physics (`usePhysicsLayout`, `Planet`, `ConnectionLine`, sizing/style helpers) + pure `timeScope` helpers. The time-scoping logic lives here so the app and editor can never diverge.
- **Join key** across systems = the company **`slug`**. The app reads **structure from Sanity** and **numbers from the sheet**, both resolved at the viewed year.

## Content model

### 1. Company (Planet)

| Attribute | Authored / Derived | Required | Notes |
|---|---|---|---|
| **Name** | Authored | Yes | Identifier + label text. |
| **Sector** | Authored | Yes | Assigns the planet to a sector group (drives default color + home position). |
| **Description** | Authored | Optional | Free-text context, shown in the side panel. Not time-bound. |
| **Valuation** | Derived from the sheet | Yes | In billions USD, per year. Drives planet **size** (area scales with valuation). Market caps come from the valuation sheet; private/PSM values come from Sanity `manual_valuations`. |
| **Data source** | Authored (Sanity ref) | Yes | Which provider supplies the valuation: type `api` (Financial Modeling Prep) or `manual` (companiesmarketcap.com, Manual entry). Drives whether the ingest auto-fills the row. |
| **Position override** | Authored | Optional | An `x, y` spot stamped with a **start date**. *Soft* (pulled toward it, neighbors still nudge) or *pinned* (locked; others collide around it). Multiple overrides at different dates — see [Time-scoping](#time-scoping-yearly). With no override, the planet floats within its sector. |
| **Appearance windows** | Authored | Optional | A list of **year ranges** (`start_year` + optional `end_year`) controlling which yearly maps the company appears on. Empty = always visible. |
| **Fill / Stripes / Stripe orientation / Stroke / Glow** | Authored | Optional | Styling. Stripes (2+ colors) replace fill; orientation = vertical (default) / horizontal / diagonal. Defaults to the **sector's** style; only set when a company should differ. |
| **Vitals** | Authored | Optional | Time-bound fact tags (name + optional statistic, e.g. "Minecraft" / "230M MAU"), each with its own date window. Shown in the side panel. |
| **Eshap content / External articles** | Authored (→ dynamic later) | Optional | Evan's own content (LinkedIn/podcast/Substack) and external finance news. Side panel shows the most recent. |
| **Size, Label** | Derived | — | Size from valuation; label = name (+ valuation for the largest). |

### 2. Entity

A sub-brand/property that hangs off a parent — e.g. **ABC** or **Marvel** under Disney. Renders as a **plain text label** (same typography as a company name) with **no circle, fill, glow, or valuation**. It belongs to a sector and is typically tied to a company by a connection. Its label still claims collision space (tunable via the **Entity padding** knob).

| Attribute | Authored / Derived | Required | Notes |
|---|---|---|---|
| **Name** | Authored | Yes | Label text (e.g. "ABC"). |
| **Sector** | Authored | Yes | Its on-map home base. |
| **Appearance windows** | Authored | Optional | Year ranges controlling which maps it appears on (same model as a company). Empty = always visible. |
| **Position override** | Authored | Optional | Time-scoped `x, y` (soft or pinned), authored by dragging in the Map Editor. |

> An entity has **no valuation and no size**. Three independent time controls govern it: **appearance windows** (does it show), **position overrides** (where it sits), and its **connection windows** (is it linked).

### 3. Sector

A named group planets belong to; sets default appearance + on-map home base.

| Attribute | Authored / Derived | Required | Notes |
|---|---|---|---|
| **Name** | Authored | Yes | Matches the Sector value on each company. |
| **Center position** | Authored | Yes | The "gravity well" its planets cluster around. Separate **desktop** (landscape) + **mobile** (portrait) values, each time-scoped (`desktop_center` baseline + overrides). |
| **Default style** | Authored | Optional | Planet style fields applied to every member unless a company overrides them. |
| **Sidebar swatch** | Authored | Optional | Custom legend-dot color/gradient for varied sectors. |

Behaviors: toggle on/off in the legend, hover to highlight members, click to focus/zoom.

### 4. Connection

A straight line between two map nodes (companies and/or entities).

| Attribute | Authored / Derived | Required | Notes |
|---|---|---|---|
| **From / To** | Authored | Yes | The two nodes. Each endpoint can be a **company** or an **entity**. |
| **Style** | Authored | Yes | **Solid** = wholly owned / closed. **Dotted** = partial / acquisition in process. |
| **Description** | Authored | Optional | Tooltip text on hover. |
| **Effective from / until (year)** | Authored | Optional | `start_year` + optional `end_year`. The line renders only on years inside the window. Absent start = from the beginning; absent end = through the present. |

### 5. Time dimension

Every map view is anchored to a **year**. Past years render that year's **Oct 1 (Q4-start) snapshot**; the **current year** renders the latest data, labeled with its actual month (e.g. "JUL 2026"). Valuations are **real** (from the sheet), not mocked. Scrubbing the timeline updates each planet's size, and moves positions/connections/appearances to their state at that year.

## Time-scoping (yearly)

Positions, connections, and appearances are anchored to dates so the map changes shape over time instead of showing one fixed arrangement. Each year maps to a single **snapshot moment**: a past year `Y` → `Y-10` (its Oct-1 snapshot); the current year → the present month. The app and the editor resolve at these same moments through `map-core`'s shared `timeScope` helpers.

- **Positions (forward propagation).** Each override carries a **start date**. At the viewed year's moment T, a planet renders at the override with the **largest start date ≤ T**. If none qualifies, it doesn't render. A company's **earliest override is its first appearance** — but with sheet-driven auto-layout, most companies have no hand-placed override and simply float within their sector.
- **Appearance windows (companies + entities).** A `[start_year, end_year]` list; the node renders only on years inside a window (empty = always). Shared `yearWindowsActiveAt` enforces this in both the public resolver and the Studio editor. In the **aggregate view**, each company's bars appear only in its window years.
- **Connections (windowed).** A `[start_year, end_year]` window; the line renders only on years inside it. The *dotted → solid* transition (in-process → closed) is authored as **two connection entries** with adjacent year ranges.
- **Editing workflow.** The Studio Map Editor uses a global **year picker**. Choosing a year scopes the canvas to that year's snapshot; each drag/pin/connection edit stamps `start_date` (or `start_year`/`end_year`) at that moment. Inspectors, connection windows, and save-bar labels all read as years.

## Data & ownership — manual vs dynamic

**Structure** is authored in Sanity; **valuation numbers** live in the Google Sheet. The cross-system join key is the company **`slug`**.

| Data | Source |
|---|---|
| Public-company market caps (current + yearly history) | **Dynamic** — Financial Modeling Prep → the Google Sheet, keyed by `ticker` |
| Company **data source** (which provider) | **Manual — Sanity** `data_source` reference (`api` → FMP ingest fills it; `manual` → hand-entered). Mirrored into the sheet's "data source" column every run — edit it in Sanity, not the sheet. |
| Private / PSM valuations | **Manual** — Sanity `manual_valuations` (no API supplies these) |
| Positions, sector centers, connections, styles, entities, appearance windows, layout knobs | **Manual** — Sanity, via the Map Editor |
| Vitals, description | **Manual** — Sanity |
| Eshap content, external articles | **Manual now → dynamic later** (schema is already feed-shaped) |

**Valuation precedence** at a (company, year): sheet market cap → Sanity manual value → legacy name-matched sheet (so uncovered/"NA" companies still render). The map's "current" year = the newest year column in the sheet; the present month label comes from the newest ingest `last_updated`.

> **Sheet-cell ownership** — exactly which cells the nightly ingest writes vs. which are hand-editable (past-year values, `vetting_status`, `Notes`) is documented for non-engineers in [SHEET_EDITING_GUIDE.md](SHEET_EDITING_GUIDE.md). Short version: structure columns mirror Sanity; for FMP companies the ingest only ever rewrites the **current-year** value, so past years are freely correctable.

## Build status

The system is **live** — public app at `https://eshap-media-map.netlify.app`, Studio at `https://eshap-media-map.sanity.studio`, nightly ingest on a GitHub Action.

| Phase | Status |
|---|---|
| **1 — Shared `map-core` package** (renderer + physics + `timeScope`) | ✅ done |
| **2 — Public app consumes `map-core`** | ✅ done |
| **3 — In-Studio Map Editor** (full content model: companies, entities, sectors, connections, vitals, content, time-scoped layout knobs, de-overlap physics) | ✅ done |
| **4 — Public app reads Sanity + valuation sheet** (structure from Sanity at the viewed year; market caps from the sheet + FMP GitHub Action ingest; side panel, per-company primary metric, red "not-live" labels) | ✅ done |
| **5 — Yearly historical maps** (one column per year; past = Oct-1 snapshot, current = latest; year picker; appearance windows on companies + entities as year ranges; connection year ranges; per-year aggregate windowing) | ✅ done |

**Outstanding:**
- **Studio redeploy** (`cd studio && npm run deploy`, Deploy-Studio token) to ship the Phase 5 CMS changes (year picker, appearance windows, connection year ranges). The public app + ingest are already live.
- **Mobile + touch** — the app has **no touch handlers** yet (mouse only), so phones can't pan/pinch/drag. This is the largest remaining build (see LAUNCH_PLAN.md).
- **Dynamic feeds (4d)** — auto-pull external articles + Eshap content.
- **Front-end polish** — restyle toward the light mockup; loading-moment animation.
- **Studio Map Editor planet sizing** — the editor still sizes planets from Sanity, not the valuation sheet, so its scale doesn't match the public map. Wire it to read the sheet at the editor's current year.
- **Legacy cleanup** — retire `loadCompanies.ts` / `sheetValuations.ts` / the `historical.ts` mock once the sheet fully covers the roster; trim Sanity `manual_valuations` where the sheet now covers it.
- **Paid access / gating** — gate the historical **timeline (Time Machine)** behind paid membership as a *freemium funnel*: the present-day map stays free (the hook), the historical maps become the paid perk. Recommended direction (to avoid a second paywall): keep it on **Substack** and unlock via a link / rotating code dropped in paid-only posts (zero backend) → optionally graduate to **email verification** against Evan's Substack paid-subscriber export (adds the app's first auth + a serverless gate + a periodic list sync). Substack has no real-time subscriber API, so it's an email-identity + list problem. A full options brief (incl. non-Substack routes: Memberful / Stripe / Ghost / etc.) was prepared for Evan. Not started.

## Open questions worth confirming with the client

1. **Sector list** — fixed/curated, or editor-addable?
2. **Connections** — only solid/dotted, or more relationship types / directionality (who owns whom)?
3. **Per-company logos/links** — should a planet carry a logo, website link, or richer profile?
4. **Mobile positioning** — author mobile positions too, or auto-derive?
5. **Connection re-activation** — can a relationship lapse and resume? Today one continuous window per entry (multiple entries = multiple windows). *Dotted → solid* is settled: two adjacent entries.
6. **Valuation provider** — FMP Starter is US-only (non-US shows "NA"). Moving to a global plan (FMP Ultimate / EODHD) is a cost decision to make with the client.
