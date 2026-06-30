# Media Map — Sanity Studio (CMS)

This is the content management surface for the Media Map project. It's a
[Sanity Studio v3](https://www.sanity.io/docs/sanity-studio) app that lives
alongside the existing Vite/React app in the same repo (`studio/` is a sibling
of `src/`). The two are developed and deployed independently.

- **The map (read side)** stays fully public.
- **This Studio (edit side)** is private, gated by Sanity's built-in auth.

> ⚠️ **Not yet wired to the app.** For this phase the Studio is standalone — the
> React app still reads company data from the Google Sheet (`src/loadCompanies.ts`)
> and does **not** read from Sanity. Connecting them is a later milestone. They
> are two independent surfaces in one repo.

## Data model overview

| Type | What it is |
|------|------------|
| **Company** | A "planet". Has a sector, a data source, optional manual valuations, per-company style overrides, and time-scoped position overrides. |
| **Sector** | A grouping + a "gravity well" on the map (desktop & mobile center coordinates). Holds a default style that its companies inherit. |
| **Connection** | A line between two companies (solid = wholly owned/closed, dotted = partial/in-process). Optionally time-scoped. |
| **Article** / **Podcast** | Editorial content that can be attached to one or more companies. |
| **DataSource** | Where a company's valuation comes from (e.g. FMP, Yahoo, Manual). Drives the company data-source dropdown and the future refresh job. |

Relationships:

- A **Company** references one **Sector** and one **DataSource**, and can
  reference many **Articles** / **Podcasts**.
- A **Connection** references two **Companies** (`from` / `to`).
- A **Company** inherits its **Sector**'s `default_style` and overrides
  individual fields via its own `planet_style` (one-level shallow merge).

**Styling & data-source nuances** (also documented inline in the schema files):

- `planet_style` / `default_style`: only fill in what differs from the default.
  Stripes (2+) win over a flat fill. The form shows a **live planet preview**.
- `manual_valuations` (on Company): each entry surgically overrides the API feed
  **for its matching date only** — it does not blanket-replace the feed. For
  private companies, manual entries are the *only* valuation source.
- `ticker`: required when the selected DataSource is type `api`; the field hides
  itself for `manual` sources and shows that source's `ticker_format_hint`.
- `last_synced`: written by the future refresh job; read-only in the Studio. The
  Company list flags a public company as **⚠ stale** if it's missing or >48h old.
- Time-scoping: `position_overrides[]` and `desktop_center_overrides[]` use
  **forward propagation** (the override with the largest `start_date ≤ T`
  wins at moment T); Connections use a **window** (`[start_date, end_date]`).
  Undated entries are always-active fallbacks. The Map Editor is the
  intended authoring surface — see the [Map Editor](#map-editor-visual-map-authoring)
  section below.

## Setup

Requires Node 18+.

```bash
cd studio
npm install
```

### Configure project ID, dataset, and token

Project ID and dataset are read from environment variables (see `.env.example`).
Copy it and fill in your values:

```bash
cp .env.example .env
```

```dotenv
SANITY_STUDIO_PROJECT_ID=your_project_id   # from sanity.io/manage
SANITY_STUDIO_DATASET=production
SANITY_AUTH_TOKEN=your_write_token         # only needed for the import script
```

If you don't have a project yet, create one:

```bash
npx sanity@latest init --bare   # creates a project, prints its ID
```

Then put the printed project ID in `.env` (or in `sanity.cli.ts`).

> Env vars are read by `sanity.config.ts` and `sanity.cli.ts`. The `SANITY_STUDIO_*`
> prefix is Sanity's convention for values inlined into the Studio build, which
> `sanity dev`/`build` load from `.env` automatically. The **import script** loads
> `studio/.env` itself (via `process.loadEnvFile`, Node 20.12+), so `npm run import`
> picks it up too — no need to export or inline the vars.

## Run locally

```bash
cd studio
npm run dev
```

Opens the Studio at http://localhost:3333. Log in with the Sanity account that
has access to the project.

## Map Editor (visual map authoring)

The **Map Editor** is a custom Sanity tool ([tools/mapEditor/](tools/mapEditor/))
that renders the live map and lets you author positions, connections, and
sector centers by dragging on the canvas. Every edit writes back to the same
Sanity docs you'd otherwise edit in the Structure tab — both surfaces stay in
sync via Sanity's real-time subscription.

Open it from the tool switcher in the top nav — the **Earth globe** icon
labeled "Map Editor".

> ⚠️ **Schema-deploy reminder.** When you pull changes that add new schema
> fields (most recently: `sectorCenterOverride` + `desktop_center_overrides[]`
> on the Sector doc), run `npm run deploy` to re-publish the Studio so the new
> fields render in Structure's doc editor. Map Editor patches will still land
> in Sanity without a redeploy, but you won't be able to view the new fields
> from Structure until you redeploy.

### Layout

| Where | What |
|---|---|
| **Top-left** | **Layout Knobs** — live sliders for planet size (density), spacing, label size, connection pull. Visual only; not saved to Sanity. |
| **Top-center** | **Time selector** — year + month. Picks the moment T you're authoring. The canvas shows the map as it was at T. |
| **Top-right** | **Save / Reset bar** — pending change count, Save (commits everything in one Sanity transaction), Reset (discards). |
| **Left, below Layout Knobs** | **Connect panel** — toggles the connect sub-mode for drawing new connections. |
| **Right (when selected)** | **Inspector** — for the selected planet, connection, or sector. Most recently selected wins (priority: connection > sector > planet). |

### The staged-changes model

Every drag, pin toggle, connection edit, or sector move accumulates as a
**pending change**. Nothing hits Sanity until you click **Save**.

- Pending count in the Save bar shows how many ops are queued.
- **Save** runs all of them in a single Sanity transaction. If any patch
  fails, nothing commits — fix and retry.
- **Reset** discards the entire pending set and the canvas snaps back to the
  authoritative Sanity state.
- The browser asks for confirmation before closing the tab if pending changes
  are unsaved.

This is intentionally different from Sanity's Structure tab (which saves
field-by-field as you type). The Map Editor's model is "experiment, then
commit" — useful for tweaking many planets together.

### Time-scoping & the moment selector

The map can look different at different moments. You pick a moment T at the
top; every edit you make is stamped with `start_date = T`.

**For positions (planets) and sector centers** — **forward propagation**:

- At moment T, the override with the **largest `start_date ≤ T`** wins.
  ("Takes effect from this moment forward, until a later override.")
- If no override qualifies: a planet falls back to its sector's center; a
  sector falls back to its scalar `desktop_center` baseline.
- **Undated entries are always-active** — they apply at every moment until a
  dated override forward-propagates over them. Pre-time-scoping data
  consists entirely of undated entries; they keep working.

**For connections** — **window-based**: a connection renders only when T is
inside `[start_date, end_date]`. End-dated connections disappear from maps
after their end date; clearing `end_date` (**Reopen**) brings them back.

The Inspector's read-only **History** list shows every override on the
selected item, sorted by start_date, with **Always** for undated entries and
badges for `sanity` / `sanity-edited` / `pending-new`.

### Working with planets

- **Click a planet** → selects it; Planet inspector opens.
- **Drag a planet** → the planet follows the cursor; neighbors collision-
  respond around it live. On release, the new position is staged at the
  current moment. Dragging the same planet twice at the same moment
  coalesces into one pending op.
- **Inspector** shows: position at the current moment (with "Inherited from
  {earlier moment}" if forward-propagated, or "No specific coordinates yet"
  for undirected sector-cluster fallbacks); **Pinned** toggle (pin = locked
  here, collisions push other planets around it); **Clear override at
  {moment}** (only when an override was authored exactly at T); and a
  read-only **History** list of every override on this planet.

### Working with connections

Toggle **Connect planets** in the left panel to enter connect sub-mode:

1. Click planet A → a dashed yellow rubber-band line follows your cursor.
2. Click planet B → creates a new Connection (stamped with
   `start_date = current moment`, default style **solid**).
3. The mode stays on so you can author several in a row. **Escape** cancels
   the current selection or exits the mode.

Outside connect mode, **click an existing line** to select it. The
Connection inspector lets you:

- Toggle **style** (solid / dotted).
- Edit the hover-tooltip **description**.
- **End at {moment}** → sets `end_date` so the connection stops appearing
  on maps after T. Becomes **Reopen** when `end_date` is set.
- **Delete connection** → removes the Connection doc entirely on Save.

For acquisitions, the convention is **two adjacent connection entries**:
a dotted entry for the in-process window, and a solid entry from the close
date forward. (One Connection doc per window — adjust `end_date` on the
dotted entry to match the start of the solid entry.)

### Working with sectors

Each sector renders as a yellow-dashed labeled **pill** at its center. The
pill is itself the click/drag target.

- **Drag** the pill → stages a new sector center at the current moment.
  Planets in that sector that don't have specific coordinates visibly drift
  along live, so you can see how the layout reorganizes.
- **Click** the pill (no drag) → opens the Sector inspector. Shows the
  effective center at the current moment, the **baseline scalar** (Sanity's
  `desktop_center`, always-active), every override sorted by date, and
  **Clear override at {moment}**.
- Sectors are always attractors — no pin toggle.

Use this when, for example, large pinned planets within a sector change in
size or position across the timeline and the cluster needs to re-anchor.

> Mobile sector centers (`mobile_center`) are authored in Structure — the
> Map Editor renders desktop only.

### The Structure tab still works in parallel

Both surfaces edit the same docs; changes flow both ways via Sanity's
real-time subscription. The Map Editor refetches automatically when
something else mutates a Company, Sector, or Connection.

Caveats:

- **Pending changes in the Map Editor are local-only until Save.** They
  don't appear in Structure until you commit.
- **Last write wins.** If you and another editor both edit the same field,
  Sanity doesn't merge — whoever Saves last clobbers the other. Coordinate
  on bulk edits.
- The Map Editor exposes a **subset** of fields (positions, pin, connection
  style/description/dates, sector center). Other fields (planet style,
  attached articles, manual valuations, ticker, etc.) stay in Structure.
- Field-level changes from Structure patches **only the field you touched**
  — patches use specific `set` paths, not full-doc replacement, so the Map
  Editor's pending state for other fields on the same doc stays valid.

### Known limitations

- **The public app doesn't read Sanity yet.** Map Editor edits land in
  Sanity but don't drive the public map; the app still reads the Google
  Sheet and local constants. Wiring the public read side is a separate,
  unscheduled milestone.
- **Desktop only.** The Map Editor renders `CANVAS_DESKTOP`; mobile layout
  authoring would need a separate mode and isn't built.
- **No surgical undo.** Reset discards *everything* pending. For per-field
  undo across sessions, use Sanity's built-in doc revision history (clock
  icon in Structure on any open doc).

## Importing data (one-time seed)

`npm run import` populates the dataset from the existing app's data:

1. Fetches the same Google Sheet the Vite app reads.
2. Creates a **Sector** per unique sector and a **Company** per row.
3. Ports `SECTOR_FLAT_STYLES`, `COMPANY_STYLES`, and sector center coordinates
   from `../src/sectors.ts` into `Sector.default_style`,
   `Company.planet_style`, and `Sector.desktop_center` / `mobile_center`.
4. Ports `COMPANY_POSITIONS` from `../src/layout.ts` into a single-element
   `position_overrides` array on each matching company.
5. Creates one **Connection** per entry in `../src/connections.ts`.
6. Seeds three **DataSource** docs (FMP, Yahoo, Manual).
7. Assigns each company's data source: companies the sheet marks **"NOT PUBLIC"**
   get the **Manual** source (and `is_public = false`); everything else gets
   **FMP**.
8. Prints a summary of what was created.

```bash
# Needs a write-enabled token. Either put it in .env and export, or inline it:
SANITY_AUTH_TOKEN=sk... SANITY_STUDIO_PROJECT_ID=abc123 npm run import
```

- **Idempotent:** documents use deterministic IDs (`company.<slug>`,
  `sector.<slug>`, `dataSource.<code>`, `connection.<fromSlug>__<toSlug>`), so
  re-running skips anything that already exists instead of duplicating.
- **`--reset`:** wipe all managed documents first (handy during development):
  ```bash
  SANITY_AUTH_TOKEN=sk... SANITY_STUDIO_PROJECT_ID=abc123 npm run import -- --reset
  ```

Notes / known limitations:

- The script imports the data modules from `../src` directly, so it must run
  from inside `studio/` with the Vite app present as a sibling.
- The sheet's only machine-readable public/private signal is the literal
  "NOT PUBLIC" note; private companies flagged only by cell color in the sheet
  will import as public. Flip `is_public` in the Studio to correct them.
- Connections whose `from`/`to` company isn't present in the sheet are skipped
  with a warning.
- It does **not** seed valuations — `manual_valuations` starts empty (valuation
  history is out of scope for this phase).

## Deploy to a shared Studio URL

To share with the client at `https://<your-project>.sanity.studio`:

```bash
cd studio
npm run deploy   # = sanity deploy
```

The first deploy asks you to choose the studio hostname. Requires the project ID
to be set (env or `sanity.cli.ts`) and a logged-in Sanity account.

## Typecheck

```bash
cd studio
npm run typecheck   # tsc --noEmit
```
