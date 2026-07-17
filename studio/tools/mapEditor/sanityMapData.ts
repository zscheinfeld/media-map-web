import {useEffect, useState} from 'react'
import {useClient} from 'sanity'
import {hashHue, mergeStyle, type LayoutInput, type PlanetStyle} from '@media-map/map-core'
import {windowActiveAt, yearWindowsActiveAt, type Moment} from './moment'

// The map renders in slide-coordinate space. Mirrors CANVAS_DESKTOP in the
// Vite app's src/sectors.ts (kept in sync by hand for now — both surfaces draw
// the same desktop layout).
export const CANVAS = {x: -2225, y: -1253, w: 5052, h: 3279}

// Fallback planet size when a company has no manual valuations yet. Sanity
// doesn't hold live valuations (those come from the sheet / future Supabase),
// so the editor uses the latest manual entry if present, else this — sizes are
// approximate; the editor is for arranging POSITIONS and connections.
const DEFAULT_VALUATION_B = 100

// --- Sanity → map-core conversions ---------------------------------------

// @sanity/color-input stores colors as objects; map-core wants hex strings.
type SanityColor = {hex?: string} | null | undefined
type SanityPlanetStyle =
  | {
      fill?: SanityColor
      stripes?: SanityColor[]
      stripe_orientation?: 'vertical' | 'horizontal' | 'diagonal'
      stroke?: SanityColor
      stroke_width_px?: number
      glow?: {color?: SanityColor; blur_px?: number; spread_px?: number}
    }
  | null
  | undefined

function toCoreStyle(s: SanityPlanetStyle): PlanetStyle | null {
  if (!s) return null
  const out: PlanetStyle = {}
  if (s.fill?.hex) out.fill = s.fill.hex
  const stripes = (s.stripes ?? []).map((c) => c?.hex).filter((h): h is string => !!h)
  if (stripes.length) out.stripes = stripes
  if (s.stripe_orientation) out.stripeOrientation = s.stripe_orientation
  if (s.stroke?.hex) out.stroke = s.stroke.hex
  if (typeof s.stroke_width_px === 'number') out.strokeWidthPx = s.stroke_width_px
  if (s.glow?.color?.hex) {
    out.glow = {color: s.glow.color.hex, blurPx: s.glow.blur_px, spreadPx: s.glow.spread_px}
  }
  return Object.keys(out).length ? out : null
}

function latestValuation(manual: {value_billions_usd?: number; as_of_date?: string}[] | undefined): number {
  if (!manual || manual.length === 0) return DEFAULT_VALUATION_B
  const sorted = [...manual].sort((a, b) => (b.as_of_date ?? '').localeCompare(a.as_of_date ?? ''))
  return sorted[0]?.value_billions_usd ?? DEFAULT_VALUATION_B
}

// --- Raw GROQ shapes ------------------------------------------------------

type Coord = {x: number; y: number}
type RawPositionOverride = {_key: string; x: number; y: number; pin?: boolean; start_date?: string; end_date?: string}

// A time-bound fact tag on a company, shown in the side panel.
export type RawVital = {_key: string; name: string; statistic?: string; start_date?: string; end_date?: string}

// Evan's own content (LinkedIn / podcast / Substack) attached to a company.
export type RawEshapContent = {
  _key: string
  kind: 'linkedin' | 'podcast' | 'substack'
  title: string
  url: string
  published_date?: string
}
// External finance news about a company.
export type RawExternalArticle = {
  _key: string
  title: string
  url: string
  source?: string
  published_date?: string
}

type RawCompany = {
  _id: string
  name: string
  sector?: {_id: string; name: string; desktop_center?: Coord; default_style?: SanityPlanetStyle} | null
  planet_style?: SanityPlanetStyle
  position_overrides?: RawPositionOverride[]
  appearance_windows?: RawAppearanceWindow[]
  manual_valuations?: {value_billions_usd?: number; as_of_date?: string}[]
  vitals?: RawVital[]
  description?: string
  eshap_content?: RawEshapContent[]
  external_articles?: RawExternalArticle[]
}
type RawSectorCenterOverride = {_key: string; x: number; y: number; start_date?: string}
type RawSector = {
  _id: string
  name: string
  desktop_center?: Coord
  mobile_center?: Coord
  desktop_center_overrides?: RawSectorCenterOverride[]
}
type RawConnection = {
  _id: string
  style: 'solid' | 'dotted'
  description?: string
  from?: string | null
  to?: string | null
  fromId?: string | null
  toId?: string | null
  start_year?: number
  end_year?: number
}
// One time-scoped knob-value entry on the mapSettings singleton (snake_case as
// stored in Sanity). Resolved/forward-propagated in pendingChanges.
export type RawSettingsOverride = {
  _key: string
  start_date?: string
  packing_density?: number
  collide_padding?: number
  label_size_px?: number
  connection_pull?: number
  entity_radius?: number
  size_spacing?: number
  sector_pull?: number
  repulsion?: number
}
type RawMapSettings = {overrides?: RawSettingsOverride[]} | null
type RawAppearanceWindow = {_key: string; start_year?: number; end_year?: number}
type RawEntity = {
  _id: string
  name: string
  sector?: {_id: string; name: string; desktop_center?: Coord} | null
  position_overrides?: RawPositionOverride[]
  appearance_windows?: RawAppearanceWindow[]
}

// --- Assembled editor data ------------------------------------------------

export type EditorSector = {
  id: string
  name: string
  /** Baseline scalar — always-active fallback when no override applies. */
  center: Coord
  /** Optional time-scoped overrides (forward-propagation; see docs/PROJECT.md). */
  desktopCenterOverrides: RawSectorCenterOverride[]
}
export type EditorCompany = {
  id: string
  name: string
  positionOverrides: RawPositionOverride[]
  appearanceWindows: RawAppearanceWindow[]
  // Optional so the entity placeable (which has none of these) stays structurally
  // assignable where a company/entity union is used (e.g. the inspector).
  vitals?: RawVital[]
  description?: string
  eshapContent?: RawEshapContent[]
  externalArticles?: RawExternalArticle[]
}
// Entities are text-only map nodes. They share the {id, name, positionOverrides}
// shape companies use (so the editor's drag/pin/inspector pipeline works on them
// unchanged) and add appearance windows + a resolved sector center/hue used to
// build their LayoutInput at the current moment.
export type EditorEntity = {
  id: string
  name: string
  positionOverrides: RawPositionOverride[]
  appearanceWindows: RawAppearanceWindow[]
  sector: string
  center: Coord
  hue: number
}
export type EditorConnection = {
  id: string
  from: string
  to: string
  fromId: string
  toId: string
  style: 'solid' | 'dotted'
  description?: string
  /** First year active (from Sanity); absent → undated (active from the start). */
  start_year?: number
  /** Last year active (from Sanity); absent → still active (no end). */
  end_year?: number
}

export type MapData = {
  inputs: LayoutInput[]
  // Active position per company (first override for now; time-scoping later).
  positions: Record<string, {x: number; y: number; pin?: boolean}>
  connections: EditorConnection[]
  // Lookups for write-back interactions (Phase 3b+).
  companiesByName: Record<string, EditorCompany>
  // Text-only entity nodes, keyed by name. Their LayoutInputs are built in the
  // editor at the current moment (appearance-window filtered).
  entitiesByName: Record<string, EditorEntity>
  sectors: EditorSector[]
  // Time-scoped layout-knob overrides from the mapSettings singleton (raw; the
  // editor forward-propagates them at the viewed moment). Empty when the doc
  // doesn't exist yet — the editor falls back to LAYOUT_KNOBS_DEFAULTS.
  settingsOverrides: RawSettingsOverride[]
}

/**
 * Whether a company or entity is visible at moment T: true if T's YEAR falls in
 * any appearance window's [start_year, end_year] range. NO windows = always
 * visible (mirrors the undated-connection convention). Absent start = "from the
 * beginning"; absent end = "through the present."
 */
export function appearanceActiveAt(windows: ReadonlyArray<RawAppearanceWindow>, at: Moment): boolean {
  return yearWindowsActiveAt(windows, at)
}

/**
 * Whether a vital is shown at moment T: true if T is inside its [start, end]
 * window. Undated start = "from the beginning"; undated end = "ongoing".
 */
export function vitalActiveAt(v: {start_date?: string; end_date?: string}, at: Moment): boolean {
  return windowActiveAt(v.start_date, v.end_date, at)
}

function buildMapData(
  sectors: RawSector[],
  companies: RawCompany[],
  connections: RawConnection[],
  entities: RawEntity[],
  settings: RawMapSettings,
): MapData {
  const inputs: LayoutInput[] = []
  const positions: MapData['positions'] = {}
  const companiesByName: Record<string, EditorCompany> = {}
  const entitiesByName: Record<string, EditorEntity> = {}

  for (const e of entities) {
    if (!e.name) continue
    const sectorName = e.sector?.name ?? 'Uncategorized'
    entitiesByName[e.name] = {
      id: e._id,
      name: e.name,
      positionOverrides: e.position_overrides ?? [],
      appearanceWindows: e.appearance_windows ?? [],
      sector: sectorName,
      center: e.sector?.desktop_center ?? {x: CANVAS.x + CANVAS.w / 2, y: CANVAS.y + CANVAS.h / 2},
      hue: hashHue(sectorName),
    }
  }

  for (const c of companies) {
    if (!c.name) continue
    const sectorName = c.sector?.name ?? 'Uncategorized'
    inputs.push({
      name: c.name,
      sector: sectorName,
      valuation_b: latestValuation(c.manual_valuations),
      center: c.sector?.desktop_center ?? {x: CANVAS.x + CANVAS.w / 2, y: CANVAS.y + CANVAS.h / 2},
      hue: hashHue(sectorName),
      style: mergeStyle(toCoreStyle(c.sector?.default_style), toCoreStyle(c.planet_style)),
    })
    const overrides = c.position_overrides ?? []
    if (overrides[0]) {
      positions[c.name] = {x: overrides[0].x, y: overrides[0].y, pin: overrides[0].pin}
    }
    companiesByName[c.name] = {
      id: c._id,
      name: c.name,
      positionOverrides: overrides,
      appearanceWindows: c.appearance_windows ?? [],
      vitals: c.vitals ?? [],
      description: c.description,
      eshapContent: c.eshap_content ?? [],
      externalArticles: c.external_articles ?? [],
    }
  }

  const editorConnections: EditorConnection[] = connections
    .filter(
      (c): c is RawConnection & {from: string; to: string; fromId: string; toId: string} =>
        !!c.from && !!c.to && !!c.fromId && !!c.toId,
    )
    .map((c) => ({
      id: c._id,
      from: c.from,
      to: c.to,
      fromId: c.fromId,
      toId: c.toId,
      style: c.style,
      description: c.description,
      start_year: c.start_year,
      end_year: c.end_year,
    }))

  const editorSectors: EditorSector[] = sectors
    .filter((s) => !!s.desktop_center)
    .map((s) => ({
      id: s._id,
      name: s.name,
      center: s.desktop_center as Coord,
      desktopCenterOverrides: s.desktop_center_overrides ?? [],
    }))

  return {
    inputs,
    positions,
    connections: editorConnections,
    companiesByName,
    entitiesByName,
    sectors: editorSectors,
    settingsOverrides: settings?.overrides ?? [],
  }
}

const SECTORS_Q = `*[_type == "sector"]{
  _id, name, desktop_center, mobile_center, desktop_center_overrides
}`
const COMPANIES_Q = `*[_type == "company"]{
  _id, name, description,
  sector->{_id, name, desktop_center, default_style},
  planet_style, position_overrides, appearance_windows, manual_valuations,
  vitals[]{_key, name, statistic, start_date, end_date},
  eshap_content[]{_key, kind, title, url, published_date},
  external_articles[]{_key, title, url, source, published_date}
}`
const CONNECTIONS_Q = `*[_type == "connection"]{
  _id, style, description, start_year, end_year,
  "from": from->name, "to": to->name,
  "fromId": from->_id, "toId": to->_id
}`
const ENTITIES_Q = `*[_type == "entity"]{
  _id, name,
  sector->{_id, name, desktop_center},
  position_overrides, appearance_windows
}`
const SETTINGS_Q = `*[_id == "mapSettings"][0]{
  overrides[]{
    _key, start_date,
    packing_density, collide_padding, label_size_px, connection_pull, entity_radius, size_spacing, sector_pull, repulsion
  }
}`

/**
 * Loads the map from Sanity and keeps it live: refetches on any mutation to a
 * company/sector/connection (so edits — including the editor's own writes —
 * reflect immediately).
 */
export function useSanityMapData(): {data: MapData | null; error: string | null} {
  const client = useClient({apiVersion: '2024-01-01'})
  const [data, setData] = useState<MapData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [sectors, companies, connections, entities, settings] = await Promise.all([
          client.fetch<RawSector[]>(SECTORS_Q),
          client.fetch<RawCompany[]>(COMPANIES_Q),
          client.fetch<RawConnection[]>(CONNECTIONS_Q),
          client.fetch<RawEntity[]>(ENTITIES_Q),
          client.fetch<RawMapSettings>(SETTINGS_Q),
        ])
        if (!cancelled) setData(buildMapData(sectors, companies, connections, entities, settings))
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }
    load()
    const sub = client
      .listen(
        '*[_type in ["company", "sector", "connection", "entity", "mapSettings"]]',
        {},
        {visibility: 'query'},
      )
      .subscribe({next: () => load(), error: () => {}})
    return () => {
      cancelled = true
      sub.unsubscribe()
    }
  }, [client])

  return {data, error}
}
