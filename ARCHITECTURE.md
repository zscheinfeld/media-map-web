# Media Map — Architecture & Content Model

## Overview
The map is a "starfield" of companies. Each company is a **planet** whose size reflects its valuation. Planets are grouped into **sectors** (gravity wells that cluster related companies together), and **connections** (lines) can be drawn between two map nodes to show ownership or acquisition relationships. **Entities** are text-only sub-brands (e.g. ABC, Marvel) that hang off a parent company. The whole map is tied to a **point in time**, so valuations — and therefore planet sizes — can change as you move along a timeline.

There are four authored item types: **Companies (Planets)**, **Entities**, **Sectors**, and **Connections**.

Throughout, attributes are marked as **authored** (a CMS would need a field for them) or **derived** (the app computes them).

---

## 1. Company (Planet)
The core item. Every company appears as one planet.

| Attribute | Authored / Derived | Required | Notes |
|---|---|---|---|
| **Name** | Authored | Yes | Identifier and label text. |
| **Sector** | Authored | Yes | Assigns the planet to a sector group (drives default color + position). |
| **Description** | Authored | Optional | Free-text context about the company (written by Evan). Not time-bound. Shown in the side panel. |
| **Valuation** | Authored | Yes | In billions USD. Drives planet **size** (area scales with valuation, relative to a reference company). |
| **Position override** | Authored | Optional | A specific `x, y` spot stamped with a **start date** (year + month). Two flavors: *soft* (planet is pulled toward the spot but still nudged by neighbors) or *pinned* (locked in place; others move around it). A company can carry multiple overrides at different dates; see [Time-scoping](#time-scoping-effective-dates) for how the active override is chosen. If a company has no overrides, it does not appear on the map. |
| **Fill color** | Authored | Optional | A single flat color. |
| **Stripes** | Authored | Optional | A list of 2+ colors rendered as bands across the planet (used for brands with multi-color logos). Replaces fill. |
| **Stripe orientation** | Authored | Optional | Vertical (default), horizontal, or diagonal. |
| **Outline (stroke) color + width** | Authored | Optional | Planet border. |
| **Glow** | Authored | Optional | A colored halo behind the planet (color + size + blur). |
| **Vitals** | Authored | Optional | A list of time-bound fact tags (each a **name** + optional **statistic**, e.g. "Minecraft" / "230M MAU") shown as small blocks in the map side panel. Each vital carries its own date window (start + optional end), so it only appears on maps within that range. |
| **Eshap content** | Authored | Optional | A list of Evan's own content (LinkedIn post / podcast / Substack post; each a kind + title + URL + optional date). Not time-bound — the side panel shows the most recent. Intended to be pulled in dynamically later. |
| **External articles** | Authored | Optional | A list of recent external finance news (Google / Yahoo Finance; each a title + URL + source + date). Not time-bound — shows the most recent. Intended to be pulled in dynamically from a feed later. |
| **Size** | Derived | — | Computed from valuation. |
| **Label** | Derived | — | Name (and valuation, currently for the largest companies). |

> Note: a planet's look defaults to its **sector's** style and only needs its own style fields when it should differ (e.g. a distinct brand palette).

---

## 2. Entity
A sub-brand or property that hangs off a parent company — e.g. **ABC** or **Marvel** under Disney. An entity renders on the map as a **plain text label** in the same typography as a company name, but with **no circle, fill, glow, or valuation**. It belongs to a sector (gravity well) and is typically tied to a company by a connection line. Its label still claims space in the collision layout (so it doesn't overlap planets or other labels); how much breathing room it gets is tunable via the **Entity padding** knob in the Studio Map Editor's Layout Knobs.

| Attribute | Authored / Derived | Required | Notes |
|---|---|---|---|
| **Name** | Authored | Yes | Label text shown on the map (e.g. "ABC"). |
| **Sector** | Authored | Yes | The sector group it clusters within (drives its on-map home base). |
| **Appearance windows** | Authored | Optional | A list of date ranges (each a **start** + optional **end**) controlling *which maps the entity appears on*. With no windows, the entity is always visible. With windows, it renders only when the viewed moment falls inside one of them. |
| **Position override** | Authored | Optional | Same model as a company: a time-scoped `x, y` (soft or pinned), authored by dragging in the Studio Map Editor. With no override, the entity floats within its sector. |
| **Label** | Derived | — | The name, drawn as text. |

> An entity has **no valuation and no size** — it is not a planet. It connects to companies (or other entities) via the standard [Connection](#3-connection), whose own start/end window controls *on which maps the line is drawn*. So three independent time controls govern an entity: appearance windows (does it show), position overrides (where it sits), and connection windows (is it linked).

---

## 3. Sector
A named group that planets belong to. Sets the default appearance and on-map "home base" for its members.

| Attribute | Authored / Derived | Required | Notes |
|---|---|---|---|
| **Name** | Authored | Yes | Matches the Sector value on each company. |
| **Center position** | Authored | Yes | The "gravity well" the sector's planets cluster around. Separate values for **desktop** (landscape) and **mobile** (portrait) layouts. |
| **Default style** | Authored | Optional | Same style fields as a planet (fill / stripes / stroke / glow) applied to every planet in the sector unless a company overrides it. |
| **Sidebar swatch** | Authored | Optional | A custom color/gradient used for the sector's legend dot (for sectors whose planets are too varied for one color to represent). |
| **Fallback color** | Derived | — | Auto-assigned if no style is set. |

Sector behaviors on the map: can be toggled on/off in the legend, hovering highlights its planets, and clicking focuses/zooms to it.

---

## 4. Connection
A straight line drawn between two map nodes (companies and/or entities) to show a relationship.

| Attribute | Authored / Derived | Required | Notes |
|---|---|---|---|
| **From / To** | Authored | Yes | The two nodes the line links. Each endpoint can be a **company** or an **entity** (so a sub-brand like ABC can connect to its parent Disney). |
| **Style** | Authored | Yes | **Solid** = wholly owned / closed. **Dotted** = partially owned or acquisition in process. |
| **Description** | Authored | Optional | Free text shown in a tooltip when the line is hovered. |
| **Start date** | Authored | Yes | When the relationship became true (typically deal close). The line begins appearing on this date. |
| **End date** | Authored | Optional | When the relationship ended (divestiture, sale). Absent → still active. See [Time-scoping](#time-scoping-effective-dates). |

---

## 5. Time dimension (Timeline)
Every map view is anchored to a **year + month**. As you scrub the timeline, each company's valuation (and thus its planet size) updates for that date. Positions and connections are also anchored to dates — see [Time-scoping](#time-scoping-effective-dates) for how the map evolves over time.

> ⚠️ **Important caveat:** historical valuations are currently **mocked** (generated, not real). Only the present-day map uses real numbers. A real historical data source is a separate requirement to confirm.

---

## Time-scoping (effective dates)
Positions and connections are anchored to dates so the map can change shape over time — planets relocating, acquisitions closing — instead of showing one fixed arrangement at every date.

### Positions (forward propagation)

Each position override carries a single **start date** (year + month) — the moment it became true. At any viewed moment T, a planet renders at the override with the **largest start date ≤ T**. If no override qualifies, the planet does not render at that moment (it does not yet exist on the map).

Example: suppose Disney has three overrides — at 2020-01, 2023-06, and 2026-05.

| Viewed moment | Disney renders at |
|---|---|
| 2019-12 | (not on the map — earliest override is 2020-01) |
| 2020-01 | 2020-01 override |
| 2022-03 | 2020-01 override |
| 2023-06 | 2023-06 override |
| 2026-05 | 2026-05 override |

A company's **earliest override is its first appearance** on the map. Adding a new company requires authoring at least one override; before that date, the planet does not render. This is by design — it prevents recently-added companies from appearing on historical maps where they did not yet exist.

| Field | Required | Meaning |
|---|---|---|
| **Start date** | Yes | Year + month this position becomes true. Forward-propagates until the next override on the same company. |
| **x, y** | Yes | Slide-coordinate position. |
| **Pin** | Optional | Locks the planet at (x, y); other planets collide around it instead of physics resolving it. |

### Connections (windowed)

A connection naturally has two endpoints — when the relationship begins (deal close) and when it ends (divestiture, sale). Each connection renders only on dates inside `[start_date, end_date]`.

| Field | Required | Meaning |
|---|---|---|
| **Start date** | Yes | When this relationship became true (typically deal close). |
| **End date** | Optional | When the relationship ended. Absent → still active. |

The *dotted → solid* transition (acquisition in process → wholly owned) is authored as **two connection entries** with adjacent date ranges — a dotted entry for the in-process window and a solid entry from close onward.

### Editing workflow

The Studio's Map Editor uses a **global year + month selector**. Editors choose a moment T; the canvas shows positions and connections as they are at T. Each drag/edit creates an override or connection stamped with `start_date = T`, automatically becoming the planet's position (or the connection's first-active moment) from that moment forward.

> Status: documented here as the **design target**. The schema models it (positionOverride and connection both carry date fields); the public renderer ([src/MediaMap.tsx](src/MediaMap.tsx)) does **not yet** honor it — today it uses `position_overrides[0]` regardless of date, and all connections are always shown. The Studio editor's global time selector is being built in Phase 3 of the [CMS initiative](PHASES.md).

---

## Data ownership — manual vs dynamic

Which data is hand-authored vs machine-pulled. Valuations move to a time-series store (Supabase) with a daily API ingest; everything else is authored in Sanity. The cross-system join key is the company **`slug`**.

| Data | Source |
|---|---|
| Public-company valuations (current + history) | **Dynamic** — finance API → Supabase, keyed by `ticker` |
| Private-company valuations | **Manual** — Sanity `manual_valuations` (no API can supply these) |
| Any valuation correction / override | **Manual** — Sanity `manual_valuations` (wins over the API for matching dates) |
| Positions, sector centers, connections, styles, entities, layout knobs | **Manual** — Sanity, via the Map Editor |
| Vitals, description | **Manual** — Sanity |
| Eshap content (LinkedIn / podcast / Substack) | **Manual now → dynamic later** |
| External articles (Google / Yahoo Finance) | **Manual now → dynamic later** |

**Valuation resolution precedence** at a given (company, date): manual override (Sanity) → Supabase value → none. The "current month" is represented by the latest daily pull. See PHASES.md → Phase 4 for the wiring sequence.

> The public app does **not yet** read any of this — it's still Google-Sheet-driven. Wiring its read side to Sanity + Supabase is Phase 4.

## Cross-cutting notes
- **Current data source:** a Google Sheet (columns: company name, valuation, sector). This is the piece a CMS would replace.
- **Two layouts:** desktop (landscape) and mobile (portrait) have independent canvas sizes and sector positions.
- **Style inheritance is one level:** company style overrides sector style, field by field.

---

## Open questions worth confirming with the client
1. **Historical data** — is real time-series valuation data in scope, or is "present-day only" acceptable for v1?
2. **Sector list** — is the set of sectors fixed/curated, or should editors be able to add new ones freely?
3. **Connections** — only the two states (solid/dotted)? Or do you need more relationship types (e.g. partnership, investment, JV) or directionality (who owns whom)?
4. **Per-company logos/links** — should a planet carry a logo image, website link, or richer profile (the detail panel currently shows valuation math only)?
5. **Mobile positioning** — are editors expected to author mobile positions too, or should those be auto-derived?
6. **Connection re-activation** — can a relationship lapse and later resume (e.g. a JV that dissolves and is later reformed)? Today the model assumes one continuous window per connection entry; re-activation would mean either multiple entries on the same pair or adding a list of windows. *Dotted → solid* is already settled: two adjacent entries.
