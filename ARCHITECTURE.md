# Media Map — Architecture & Content Model

## Overview
The map is a "starfield" of companies. Each company is a **planet** whose size reflects its valuation. Planets are grouped into **sectors** (gravity wells that cluster related companies together), and **connections** (lines) can be drawn between two planets to show ownership or acquisition relationships. The whole map is tied to a **point in time**, so valuations — and therefore planet sizes — can change as you move along a timeline.

There are three authored item types: **Companies (Planets)**, **Sectors**, and **Connections**.

Throughout, attributes are marked as **authored** (a CMS would need a field for them) or **derived** (the app computes them).

---

## 1. Company (Planet)
The core item. Every company appears as one planet.

| Attribute | Authored / Derived | Required | Notes |
|---|---|---|---|
| **Name** | Authored | Yes | Identifier and label text. |
| **Sector** | Authored | Yes | Assigns the planet to a sector group (drives default color + position). |
| **Valuation** | Authored | Yes | In billions USD. Drives planet **size** (area scales with valuation, relative to a reference company). |
| **Position override** | Authored | Optional | A specific `x, y` spot. Two flavors: *soft* (planet is pulled toward the spot but still nudged by neighbors) or *pinned* (locked in place; others move around it). If absent, the planet just floats within its sector cluster. Can carry an **effective date range** (see [Time-scoping](#time-scoping-effective-date-ranges)) so a planet can sit in different places at different points on the timeline. |
| **Fill color** | Authored | Optional | A single flat color. |
| **Stripes** | Authored | Optional | A list of 2+ colors rendered as bands across the planet (used for brands with multi-color logos). Replaces fill. |
| **Stripe orientation** | Authored | Optional | Vertical (default), horizontal, or diagonal. |
| **Outline (stroke) color + width** | Authored | Optional | Planet border. |
| **Glow** | Authored | Optional | A colored halo behind the planet (color + size + blur). |
| **Size** | Derived | — | Computed from valuation. |
| **Label** | Derived | — | Name (and valuation, currently for the largest companies). |

> Note: a planet's look defaults to its **sector's** style and only needs its own style fields when it should differ (e.g. a distinct brand palette).

---

## 2. Sector
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

## 3. Connection
A straight line drawn between two planets to show a relationship.

| Attribute | Authored / Derived | Required | Notes |
|---|---|---|---|
| **From / To** | Authored | Yes | The two companies the line links. |
| **Style** | Authored | Yes | **Solid** = wholly owned / closed. **Dotted** = partially owned or acquisition in process. |
| **Description** | Authored | Optional | Free text shown in a tooltip when the line is hovered. |
| **Effective date range** | Authored | Optional | When the line should appear on the timeline (see [Time-scoping](#time-scoping-effective-date-ranges)). Natural for acquisitions that close on a specific date. Default: the entire timeline. |

---

## 4. Time dimension (Timeline)
Every map view is anchored to a **year + month**. As you scrub the timeline, each company's valuation (and thus its planet size) updates for that date. By default, **positions and connections stay put** across the whole timeline — but either can be scoped to a date range so the map can change shape over time (see [Time-scoping](#time-scoping-effective-date-ranges)).

> ⚠️ **Important caveat:** historical valuations are currently **mocked** (generated, not real). Only the present-day map uses real numbers. A real historical data source is a separate requirement to confirm.

---

## Time-scoping (effective date ranges)
Position overrides and connections can each carry an optional **effective date range** so they only apply during part of the timeline. This lets the map reflect how the landscape actually changed — planets relocating, acquisitions closing — rather than showing one fixed arrangement at every date.

A date range is two optional endpoints, each a **year + month** (matching the timeline's granularity):

| Field | Required | Meaning |
|---|---|---|
| **Start** | Optional | First date the item applies. Absent → from the start of the timeline. |
| **End** | Optional | Last date the item applies. Absent → through the end of the timeline. |

- **Default (both absent)** → the item is active across the **entire timeline**. This matches today's behavior, so nothing breaks if a range is never set.
- **Positions:** a single company may have **multiple** position overrides, each with its own range, to describe moves over time. On any date outside all of its ranges, the planet falls back to drifting within its sector cluster.
- **Connections:** a line only renders on dates inside its range. The **same pair** can have a *dotted* entry covering the "in-process" window followed by a *solid* entry covering the "post-close" window, capturing the transition from pending to wholly-owned.

> Status: this is a **planned content-model addition** — it is documented here so the CMS can be designed for it, but it is not yet implemented in the app. Today, positions ([src/layout.ts](src/layout.ts)) and connections ([src/connections.ts](src/connections.ts)) are timeline-wide.

---

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
6. **Time-scoping granularity** — is a single start/end window per item enough, or do editors need multiple disjoint windows (e.g. a connection that lapses and later resumes)? And should the *dotted → solid* transition be authored as two entries, or as one connection with a separate "close date"?
