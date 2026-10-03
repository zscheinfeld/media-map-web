# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project docs (read these — they're the source of truth)

All in [docs/](docs/):

- **[docs/PROJECT.md](docs/PROJECT.md)** — the main reference: content model (companies, entities, sectors, connections), the yearly time-scoping spec, the manual-vs-dynamic data-ownership matrix, **and the build status/roadmap**. (Merges the former ARCHITECTURE.md + PHASES.md.) Update it as the model or status changes.
- **[docs/LAUNCH_PLAN.md](docs/LAUNCH_PLAN.md)** — the dated launch schedule + parallel client data-entry track + check-in cadence.
- **[docs/SHEET_EDITING_GUIDE.md](docs/SHEET_EDITING_GUIDE.md)** — client-facing "who can edit what" for the market-cap sheet: which cells the nightly ingest manages vs. which are hand-editable (past-year values, `vetting_status`, `Notes`), and the manual-vs-FMP rule.

The agent memory store only *points* at these; it does not duplicate them. Keep the docs current rather than re-explaining status in memory.

## Commands

- `npm run dev` — Vite dev server (defaults to http://localhost:5173, falls back to 5174 if busy).
- `npm run build` — runs `tsc -b` then `vite build`. Use this for typechecking; there's no separate `tsc` script.
- `npm run lint` — flat-config ESLint.
- No test runner is configured.

Deployment: Netlify, configured via [netlify.toml](netlify.toml). It builds `npm run build` and publishes `dist/`. SPA fallback redirect already wired (`/* → /index.html`).

## Architecture

This is a single-page Vite + React + TypeScript app that renders a "media map" — a starfield of company "planets" sized by valuation, organized into sectors via a d3-force physics simulation. There's no router, no backend, no state manager; everything is hooks + an SVG scene.

For a content-model / requirements view of the map (the authored item types — companies, entities, sectors, connections — and their attributes, written for non-engineers), see [docs/PROJECT.md](docs/PROJECT.md). Keep it in sync when the data model changes.

### The slide-coordinate space

The map is rendered inside an SVG `viewBox` ("slide units") that does NOT match container pixels. There are two canvases declared in [src/sectors.ts](src/sectors.ts):

- `CANVAS_DESKTOP = { x: -1875, y: -1253, w: 5052, h: 3279 }` — landscape.
- `CANVAS_MOBILE  = { x: -1200, y: -2500, w: 2400, h: 5000 }` — portrait.

A `slideUnitsPerPx` value (computed from `view.w / containerW`) is threaded through label sizing, stroke widths, glow blur radii, etc. — anything that should stay visually constant at any zoom. The convention is: any field named `*Px` is in screen pixels and gets multiplied by `slideUnitsPerPx` at render time.

### Mobile vs desktop

`useIsMobile()` in [MediaMap.tsx](src/MediaMap.tsx) listens on `matchMedia("(max-width: 768px)")`. When `isMobile` flips:
- The active canvas swaps (desktop ↔ mobile).
- `usePhysicsLayout` re-runs the simulation with `isMobile` in its dep array; `sectorCenterFor(..., mobile)` returns mobile-specific positions.
- The SVG's `preserveAspectRatio` switches to `xMidYMid slice` (fills viewport, may crop top/bottom rows).
- The desktop `<Sidebar>` is replaced by a bottom-of-screen `+ Sectors` pill that opens `<MobileSectorDrawer>`. Both share `<SectorPanelContent>`.
- Sector labels on the map are hidden.

### Physics

[src/usePhysicsLayout.ts](src/usePhysicsLayout.ts) builds a d3-force simulation:
- `forceX`/`forceY` attract each node to `node.targetX/targetY` (sector center by default; overridden per-planet by `COMPANY_POSITIONS` — see "Layout" below).
- `liveCollide` is a **custom** collide force (NOT `d3-force-collide`) — it reads `node.r` live each tick instead of caching at init, so radius tweens during month changes don't cause overlaps. Padding is `80` slide units (raised from 30 once labels began overflowing planet circles).
- `boundsForce` clamps nodes inside the canvas inset.
- `r` tweens toward `targetR` each tick. While tweening, `sim.alphaTarget(0.3)` keeps the sim warm so collisions resolve cleanly.
- The hook restarts the sim when its `positionsKey` memo changes (sorted+joined string of all override entries), so drag-commits don't trigger restarts mid-stream.

A "linear" view mode bypasses d3-force entirely and runs a manual rAF easing loop that lays nodes out as a bottom-aligned strip sorted by size. Switching modes snapshots/restores map-mode positions in `savedMapPositionsRef` so planets don't fly across the canvas.

### Styling system (planets, swatches, glows)

[src/sectors.ts](src/sectors.ts) defines `PlanetStyle`:
```ts
{ fill?, stripes?, stripeOrientation?, stroke?, strokeWidthPx?, glow?, swatchBackground? }
```

Two maps key into this shape:
- `SECTOR_FLAT_STYLES` — sector defaults.
- `COMPANY_STYLES` — per-company overrides (e.g. NVIDIA inside Large Cap).

`planetStyleFor(name, sector)` **shallow-merges** the two: `{ ...sectorDefault, ...companyOverride }`. Inheritance only works one level deep. Example: Large Cap sets `stroke: "transparent"` at the sector level; Apple inherits it without redeclaring.

How fields map to rendering, all inside the `Planet` component in [src/MediaMap.tsx](src/MediaMap.tsx):
- `stripes` (2+ colors) → equal-height rectangles inside a rotated `<g>` clipped to the planet circle. Default orientation is **vertical** (90°). Override with `stripeOrientation: "horizontal" | "diagonal"`.
- `fill` (single color) → flat `<circle fill>`.
- Neither → falls back to the per-hue radial gradient driven by `SECTOR_HUES`.
- `glow` → an `<feGaussianBlur>` filter applied to an oversized backing circle drawn *before* the planet. `blurPx` and `spreadPx` are screen pixels.
- `swatchBackground` → sidebar-only override (CSS gradient string). When set, the sidebar renders a **custom checkbox** instead of `<input type="checkbox">` because native `accent-color` can't accept a gradient.

**Ombré stripes.** `PlanetStyle.ombre` (map-core `OmbreStripes`: `stops`, `count`, `angle`, `blend`, `reverse`, optional hairlines) is a stripe *recipe* — N stripes sampled along a colour ramp (`ombreStripeColors` in map-core's style.ts). It wins over `stripes`/`fill`. The Large Cap brand palettes use it.

**Where colour comes from.** On the live site, Sanity: `sector.default_style` + `company.planet_style` (incl. `ombre`) → `styleByName` / `styleBySector` in [src/sanityMap.ts](src/sanityMap.ts); Map Settings carries the background gradient stops and side-panel colour. `SECTOR_FLAT_STYLES` / `COMPANY_STYLES` in [src/sectors.ts](src/sectors.ts) are the **fallback** for when Sanity isn't configured. Sector colour for non-planet surfaces (sidebar swatches, list dots, search, PNG legend) goes through `sectorColorResolved` in MediaMap: style-lab override → Sanity sector fill → local constant.

**Style lab** ([src/styleLab/](src/styleLab/)) — `?style=1` opens a panel that overrides sector colours, per-company ombré recipes, outlines, background and panel colour **at render time** (physics only re-reads `node.style` on a rebuild, so overrides are applied where planets are drawn). Edits persist in localStorage for the editing view only; `preset.ts` can bake a look for every visitor (currently `null` — the approved palette was migrated into Sanity with [jobs/migrate-palette.ts](jobs/migrate-palette.ts)).

**Layout lab** ([src/layoutLab/](src/layoutLab/)) — `?layout=1` opens a panel that overrides layout on top of Sanity: the Sanity physics knobs plus packing forces (`gapFill`/`gapMin`, `centerPull`, `labelFootprint`), type (large/small size split at a valuation threshold, outline, growth on zoom), which names show (`nameThreshold` size floor + `nameSpacing` declutter: largest planet first, skip a name that would crowd one already placed), and per-planet placement / sector wells (Arrange tab; stamped with the viewed year, carried forward). Settings are **per device**: desktop, Phone 1:1, Phone 16:9 (which can follow the desktop layout exactly — `fullFollowsDesktop`), plus Tablet = desktop layout with its own type for windows up to `tabletMaxWidth`. While the lab is active the physics runs in map-core's deterministic mode (`seed`): every rebuild re-solves from scratch, so the layout is a pure function of inputs + settings + seed; "Lock layout" measures label spacing at a fixed design width so a resize never re-runs the solve, and a name hidden by the size floor reserves no room. Names render in their own layer above all planets (`Planet part="body" | "label"`). The settings every visitor gets come from Sanity (Map Settings → Layout, a JSON string) when set, else `preset.ts`; `?layout=1` edits live in localStorage until copied out.

### Game mode

[src/game/](src/game/) — an easter egg: clicking the Eshap logo at the map's top-left (desktop) starts a 90-second Pong-style round. `useGameMode` owns the state machine (`intro` → `countdown` → `playing` → `ended`) and drives `node.x/y` directly in its own rAF loop while `usePhysicsLayout` is `suspended`; on exit it restores the snapshot and the hook resumes **without ticking**, so the layout hands back exactly. Parked planets render as 1px sector-coloured outlines (`ghostStyle.ts`) and cross-fade to their fill when launched. The sidebar collapses for the round; pan/zoom, tabs, search and connection lines are gated on `game.active`.

### Layout: positions, pinning, design mode

Same two-tier pattern as styling, but for planet coordinates.

[src/layout.ts](src/layout.ts) holds `COMPANY_POSITIONS: Record<string, PlanetPosition>` where `PlanetPosition = { x, y, pin? }` in slide-coordinate space. The hook applies overrides per-planet:
- **Soft override** (`pin` absent or false): `targetX/targetY` are set to the override point, so the planet is attracted there but physics still resolves collisions — useful for "near X" relationships.
- **Hard pin** (`pin: true`): additionally sets `node.fx/fy`, which d3-force respects absolutely. Pinned planets don't move; other planets collide against them.
- **No entry**: the sector center remains the attractor (current behavior). `node.pinned` is exposed on the node so the renderer can mark pinned planets in edit mode.

**Design mode** is gated on `?edit=1` in the URL (`useIsEditMode()` reads it once on mount, not reactive). When on:
- A floating `EditorToolbar` appears top-left of the map area: selected planet inspector, pin/unpin/clear-position actions, copy-to-clipboard / download / reset.
- Planets respond to mousedown for drag (separate from canvas pan via `stopPropagation`). The drag is tracked in `planetDragRef` + a `dragState` React state; while a planet is being dragged, the renderer overrides `node.x/y` with `dragState` for that single planet. On mouseup, the new `{x,y}` is committed to the `positions` map, the sim restarts via `positionsKey`, and the pin flag is preserved.
- "Copy positions" / "Download .ts" emit a ready-to-paste `COMPANY_POSITIONS` block sorted alphabetically — the workflow is: drag in browser → copy → paste into [src/layout.ts](src/layout.ts) → commit.

The schema is intentionally CMS-shaped: future Sanity/Contentful migration just changes the data source from `import` to a network fetch. The editor UI itself goes away when Sanity Studio takes over content editing.

### Connections (planet-to-planet lines)

[src/connections.ts](src/connections.ts) holds `COMPANY_CONNECTIONS: Connection[]` where `Connection = { from, to, style, description }`. `from`/`to` are company names; `style` is `"solid"` (wholly owned / closed) or `"dotted"` (partial / in-process acquisition); `description` shows in a hover tooltip. Lines are straight, rendered beneath the planets in `MediaMap.tsx`, map mode only, and follow live node coordinates (including in-progress drags). Each line has a wide transparent hit-area sibling so the thin stroke is easy to hover/click.

Authored in design mode (`?edit=1`): a "Connect planets" sub-mode (click planet A then B creates a line, with a rubber-band preview), a scrollable list of existing connections, a per-connection style toggle + description field + delete, and the same copy/download/reset workflow as positions (paste back into [src/connections.ts](src/connections.ts)).

> **Time-scoping is implemented via Sanity; these local `src/` files are the un-scoped fallback.** The live map time-scopes through Sanity + `map-core`'s `timeScope`: positions **forward-propagate** (each override has a `start_date`; at the viewed year's snapshot moment T the planet renders at the largest `start_date ≤ T`), and connections + appearance windows are **year-range windowed** (`start_year`/`end_year`). The timeline is **yearly** — past years = that year's Oct-1 snapshot, the current year = latest. The Studio Map Editor uses a **year picker** that stamps each year's snapshot moment on edits. Full spec: [docs/PROJECT.md → Time-scoping](docs/PROJECT.md#time-scoping-yearly), incl. the *dotted → solid* convention (two adjacent connection entries). The local [src/connections.ts](src/connections.ts) + [src/layout.ts](src/layout.ts) carry **no dates** — they're the static fallback used only when Sanity isn't configured.

### Data flow

[src/loadCompanies.ts](src/loadCompanies.ts) fetches a public Google Sheets CSV at module init (the sheet ID is hardcoded). The header row is auto-detected by column-name heuristics — there's no schema validation. Missing/malformed cells are silently skipped.

[src/historical.ts](src/historical.ts) does NOT fetch historical data — it generates **deterministic mock** valuations per (company, date) via `hashRand(seed)`. The "current date" is hardcoded as `{ year: 2026, month: 5 }`. The carousel/timeline interacts with this mock data; only the active map mode hits the sheet.

### Interaction details worth knowing

- `didDragRef` in MediaMap.tsx tracks whether a mouse-down → mouse-up exceeded a 4px movement threshold. The planet's `onClick` short-circuits if true so drag-pan doesn't accidentally trigger focus-zoom on a planet under the cursor.
- **Touch is supported** — `onTouchStart/Move/End` on the SVG handle one-finger **pan** and two-finger **pinch-zoom** (`beginPinch`), running in parallel with the mouse (`onMouseDown/Move/Up`) handlers. A `TOUCH_DRAG_THRESHOLD_PX` guard (via `didDragRef`) means a tap that doesn't drag still triggers focus-zoom. One gap: **edit-mode planet dragging starts from `onMouseDown`**, so hand-positioning planets on a touch device may not work (desktop authoring is fine).
- Zoom + pan are unified through `animateView(targetZoom, targetPan, duration)` (easeInOutCubic). `focusOnPlanet` and `focusOnSector` both use it.
- Planet positions in the carousel thumbnails reuse the active simulation's coords — only sizes change per-month. Don't try to run a second simulation for the thumbnails.
- **Labels are always rendered** (threshold is 0). The label `<foreignObject>` is sized `max(planet diameter, 130×52px in screen units)`, so for small planets the text visually overflows the circle. This is intentional and matches the reference design; the bumped collide padding compensates. There is no label-aware spacing yet — neighboring labels can overlap when planets cluster. The planned fix is a Canvas `measureText`-derived "effective radius" fed into `liveCollide`.

### Typography

The typeface the site actually renders is **Libre Franklin** (the OFL Franklin Gothic revival), self-hosted (`public/librefranklin.ttf`, registered `@font-face` in [src/App.css](src/App.css)) and also inlined into the PNG export by `buildMapFontCss` in [MediaMap.tsx](src/MediaMap.tsx). Decided 2026-09-24: Libre Franklin is the launch face; the Adobe ITC Franklin Gothic kit was dropped.

The shared font stack everywhere is still `"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif`, and [index.html](index.html) still links the old Adobe Typekit kit. The kit is domain-locked and the production domain isn't allowlisted, so `"franklin-gothic"` never loads there and Libre Franklin renders. (Optional cleanup: remove the Typekit `<link>`s so every environment — including localhost, if it's on the kit's list — renders the same face.)

Map labels use a thin black SVG/text stroke (`paintOrder: "stroke"`). The planet **name** renders at weight **500 (Medium) + 2% tracking**; the **valuation** number at **400 (Book)** — both in one `<text>` element, split per-`<tspan>` in [packages/map-core/src/Planet.tsx](packages/map-core/src/Planet.tsx). Sector labels are 700.
