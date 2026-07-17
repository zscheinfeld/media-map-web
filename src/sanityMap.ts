// Public-app read layer for Sanity. Fetches the raw docs once and resolves "the
// map at moment T" into STRUCTURE the app overlays on its existing pipeline:
// which companies/entities exist, sector centers, hues, styles, position
// overrides, connections, layout-knob settings, and per-company side-panel
// detail — all scoped to T via the SHARED `timeScope` primitives in map-core.
//
// Valuations deliberately stay on the app's sheet + historical-mock path (Phase
// 4b); Sanity supplies structure only, so the ATH/ATL stats sweep and the
// timeline mock keep working unchanged. Supabase replaces valuations in 4c.
//
// NOTE: the Sanity→map-core mapping (`toCoreStyle`, the GROQ + Raw types) mirrors
// the Studio's `sanityMapData.ts` for now; only the high-stakes *time* logic is
// shared. Extract to a shared package if these drift (see PHASES.md Phase 4).

import {useEffect, useMemo, useState} from "react"
import {
  hashHue,
  mergeStyle,
  sanityDateToMoment,
  UNDATED,
  activeAt,
  windowActiveAt,
  yearWindowsActiveAt,
  type LayoutInput,
  type Moment,
  type PlanetStyle,
  type YearWindow,
} from "@media-map/map-core"
import {sanityQuery, isSanityConfigured} from "./sanityClient"

// --- Raw GROQ shapes (mirror studio/tools/mapEditor/sanityMapData.ts) -------

// Style as projected by the query below: hex strings only (NOT the full
// @sanity/color-input color objects — projecting those on the anonymous read
// returned empty results, likely a bad numeric in a color object breaking the
// query). The GROQ `STYLE_PROJ` pulls `.hex` out for each color.
type SanityPlanetStyle =
  | {
      fill?: string | null
      stripes?: (string | null)[] | null
      stripe_orientation?: "vertical" | "horizontal" | "diagonal" | null
      stroke?: string | null
      stroke_width_px?: number | null
      glow?: {color?: string | null; blur_px?: number | null; spread_px?: number | null} | null
    }
  | null
  | undefined

type Coord = {x: number; y: number}
type RawPositionOverride = {x: number; y: number; pin?: boolean; start_date?: string}
type RawCenterOverride = {x: number; y: number; start_date?: string}

export type RawVital = {_key: string; name: string; statistic?: string; start_date?: string; end_date?: string}
export type RawEshapContent = {_key: string; kind: "linkedin" | "podcast" | "substack"; title: string; url: string; published_date?: string}
export type RawExternalArticle = {_key: string; title: string; url: string; source?: string; published_date?: string}

type RawSector = {
  name: string
  desktop_center?: Coord
  desktop_center_overrides?: RawCenterOverride[]
  default_style?: SanityPlanetStyle
}
type RawManualValuation = {value_billions_usd?: number; as_of_date?: string}
export type ValuationType = "market_cap" | "fundraising_valuation" | "yearly_revenue"
type RawCompany = {
  name: string
  slug?: string
  description?: string
  sector?: RawSector | null
  planet_style?: SanityPlanetStyle
  position_overrides?: RawPositionOverride[]
  appearance_windows?: YearWindow[]
  vitals?: RawVital[]
  eshap_content?: RawEshapContent[]
  external_articles?: RawExternalArticle[]
  valuation_type?: ValuationType
  manual_valuations?: RawManualValuation[]
  data_source?: string
}
type RawEntity = {
  name: string
  sector?: RawSector | null
  position_overrides?: RawPositionOverride[]
  appearance_windows?: YearWindow[]
}
type RawConnection = {style: "solid" | "dotted"; description?: string; start_year?: number; end_year?: number; from?: string | null; to?: string | null}
type RawSettingsOverride = {
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
type RawMapDocs = {
  sectors: RawSector[]
  companies: RawCompany[]
  connections: RawConnection[]
  entities: RawEntity[]
  settings: {overrides?: RawSettingsOverride[]} | null
}

// --- Sanity → map-core conversions -----------------------------------------

function toCoreStyle(s: SanityPlanetStyle): PlanetStyle | null {
  if (!s) return null
  const out: PlanetStyle = {}
  if (s.fill) out.fill = s.fill
  const stripes = (s.stripes ?? []).filter((h): h is string => !!h)
  if (stripes.length) out.stripes = stripes
  if (s.stripe_orientation) out.stripeOrientation = s.stripe_orientation
  if (s.stroke) out.stroke = s.stroke
  if (typeof s.stroke_width_px === "number") out.strokeWidthPx = s.stroke_width_px
  if (s.glow?.color) {
    out.glow = {color: s.glow.color, blurPx: s.glow.blur_px ?? undefined, spreadPx: s.glow.spread_px ?? undefined}
  }
  return Object.keys(out).length ? out : null
}

const overrideMoment = (o: {start_date?: string}): Moment => sanityDateToMoment(o.start_date) ?? UNDATED

/** Sector center at moment T: latest dated override ≤ T, else the baseline. */
function sectorCenterAt(sector: RawSector | null | undefined, at: Moment): Coord | undefined {
  if (!sector) return undefined
  const active = activeAt(sector.desktop_center_overrides ?? [], at, overrideMoment)
  if (active) return {x: active.x, y: active.y}
  return sector.desktop_center
}

// --- Resolved output (structure only — valuations stay on the sheet) -------

export type ResolvedConnection = {from: string; to: string; style: "solid" | "dotted"; description: string}
export type ResolvedKnobs = {
  packingDensity?: number
  collidePadding?: number
  labelSizePx?: number
  connectionPull?: number
  entityRadius?: number
  sizeSpacing?: number
  sectorPull?: number
  repulsion?: number
}
export type CompanyDetail = {
  description?: string
  vitals: {name: string; statistic?: string}[]
  eshapContent: RawEshapContent[]
  externalArticles: RawExternalArticle[]
  /** Which metric this company's primary number represents (drives the label). */
  valuationType: ValuationType
  /** Latest manual valuation (billions USD) effective at T, if any was entered. */
  manualValue?: number
  /** Data-source name (e.g. "Market Data API"), shown in the panel. */
  dataSource?: string
  /** Year ranges this company appears on maps. Empty = always. Kept on every
   *  company (not filtered out) so the aggregate can window bars per-year while
   *  the map filters visibility at the viewed year. */
  appearanceWindows: YearWindow[]
}

export type ResolvedSanityMap = {
  /** The company set authored in Sanity (name + sector + slug) — drives the base list. */
  companies: {name: string; sector: string; slug?: string}[]
  /** Visible entities at T, as map-core inputs (text-only nodes, valuation 0). */
  entities: LayoutInput[]
  /** Sector gravity-well center at T (override-aware). */
  centerBySector: Record<string, Coord>
  /** Sector hue (hashed from name, matching the editor). */
  hueBySector: Record<string, number>
  /** Per-company resolved style (sector default merged with company override). */
  styleByName: Record<string, PlanetStyle | null>
  /** Active position override per company/entity at T (wins over sector center). */
  positions: Record<string, {x: number; y: number; pin?: boolean}>
  /** Connections whose [start,end] window covers T. */
  connections: ResolvedConnection[]
  /** Layout-knob values active at T (forward-propagated), or null. */
  settings: ResolvedKnobs | null
  /** Side-panel content per company (vitals filtered to T; content newest-first). */
  detailByName: Record<string, CompanyDetail>
}

const byDateDesc = (a: {published_date?: string}, b: {published_date?: string}) =>
  (b.published_date ?? "").localeCompare(a.published_date ?? "")

/** Resolve raw Sanity docs into map structure at moment T. */
export function resolveSanityMapAt(raw: RawMapDocs, at: Moment): ResolvedSanityMap {
  const companies: ResolvedSanityMap["companies"] = []
  const entities: LayoutInput[] = []
  const centerBySector: Record<string, Coord> = {}
  const hueBySector: Record<string, number> = {}
  const styleByName: Record<string, PlanetStyle | null> = {}
  const positions: ResolvedSanityMap["positions"] = {}
  const detailByName: Record<string, CompanyDetail> = {}

  const noteSector = (sector: RawSector | null | undefined, name: string) => {
    if (!hueBySector[name]) hueBySector[name] = hashHue(name)
    const center = sectorCenterAt(sector, at)
    if (center && !centerBySector[name]) centerBySector[name] = center
  }

  for (const s of raw.sectors) {
    if (s?.name) noteSector(s, s.name)
  }

  for (const c of raw.companies) {
    if (!c.name) continue
    // NOTE: companies are NOT dropped by appearance window here — every company
    // stays in the resolved set so the aggregate can window bars per-year. The
    // MAP applies the window filter at the viewed year (see MediaMap), using the
    // appearanceWindows carried on each company's detail below.
    const sectorName = c.sector?.name ?? "Uncategorized"
    noteSector(c.sector, sectorName)
    companies.push({name: c.name, sector: sectorName, slug: c.slug})
    styleByName[c.name] = mergeStyle(toCoreStyle(c.sector?.default_style), toCoreStyle(c.planet_style))
    const activePos = activeAt(c.position_overrides ?? [], at, overrideMoment)
    if (activePos) positions[c.name] = {x: activePos.x, y: activePos.y, pin: activePos.pin}
    // Latest manual valuation effective at T (forward-propagated by as_of_date).
    const activeManual = activeAt(
      c.manual_valuations ?? [],
      at,
      (m) => sanityDateToMoment(m.as_of_date) ?? UNDATED,
    )
    detailByName[c.name] = {
      description: c.description,
      vitals: (c.vitals ?? [])
        .filter((v) => windowActiveAt(v.start_date, v.end_date, at))
        .map((v) => ({name: v.name, statistic: v.statistic})),
      eshapContent: [...(c.eshap_content ?? [])].sort(byDateDesc),
      externalArticles: [...(c.external_articles ?? [])].sort(byDateDesc),
      valuationType: c.valuation_type ?? "market_cap",
      manualValue: activeManual?.value_billions_usd,
      dataSource: c.data_source,
      appearanceWindows: c.appearance_windows ?? [],
    }
  }

  for (const e of raw.entities) {
    if (!e.name) continue
    if (!yearWindowsActiveAt(e.appearance_windows ?? [], at)) continue
    const sectorName = e.sector?.name ?? "Uncategorized"
    noteSector(e.sector, sectorName)
    entities.push({
      name: e.name,
      sector: sectorName,
      valuation_b: 0,
      isEntity: true,
      center: centerBySector[sectorName] ?? {x: 0, y: 0},
      hue: hueBySector[sectorName] ?? hashHue(sectorName),
      style: null,
    })
    const activePos = activeAt(e.position_overrides ?? [], at, overrideMoment)
    if (activePos) positions[e.name] = {x: activePos.x, y: activePos.y, pin: activePos.pin}
  }

  const connections: ResolvedConnection[] = raw.connections
    .filter((c): c is RawConnection & {from: string; to: string} => !!c.from && !!c.to)
    .filter((c) => yearWindowsActiveAt([{start_year: c.start_year, end_year: c.end_year}], at))
    .map((c) => ({from: c.from, to: c.to, style: c.style, description: c.description ?? ""}))

  const activeSettings = activeAt(raw.settings?.overrides ?? [], at, overrideMoment)
  const settings: ResolvedKnobs | null = activeSettings
    ? {
        packingDensity: activeSettings.packing_density,
        collidePadding: activeSettings.collide_padding,
        labelSizePx: activeSettings.label_size_px,
        connectionPull: activeSettings.connection_pull,
        entityRadius: activeSettings.entity_radius,
        sizeSpacing: activeSettings.size_spacing,
        sectorPull: activeSettings.sector_pull,
        repulsion: activeSettings.repulsion,
      }
    : null

  return {companies, entities, centerBySector, hueBySector, styleByName, positions, connections, settings, detailByName}
}

// --- GROQ + fetch hook -----------------------------------------------------

// Separate per-type queries (mirrors the Studio's sanityMapData, which fetches
// each type independently). One giant combined object query was returning an
// empty companies array even though they exist — splitting avoids that.
// Pull only the hex strings out of the color objects (projecting the full
// @sanity/color-input objects on the anonymous read returns empty results).
const STYLE_PROJ = `{
  "fill": fill.hex,
  "stripes": stripes[].hex,
  stripe_orientation,
  "stroke": stroke.hex,
  stroke_width_px,
  "glow": { "color": glow.color.hex, "blur_px": glow.blur_px, "spread_px": glow.spread_px }
}`
const SECTORS_Q = `*[_type == "sector"]{ name, desktop_center, desktop_center_overrides[]{x, y, start_date}, "default_style": default_style ${STYLE_PROJ} }`
const COMPANIES_Q = `*[_type == "company"]{
  name, "slug": slug.current, description,
  sector->{ name, desktop_center, desktop_center_overrides[]{x, y, start_date}, "default_style": default_style ${STYLE_PROJ} },
  "planet_style": planet_style ${STYLE_PROJ}, position_overrides[]{x, y, pin, start_date},
  appearance_windows[]{start_year, end_year},
  vitals[]{_key, name, statistic, start_date, end_date},
  eshap_content[]{_key, kind, title, url, published_date},
  external_articles[]{_key, title, url, source, published_date},
  valuation_type, manual_valuations[]{value_billions_usd, as_of_date}, "data_source": data_source->name
}`
const CONNECTIONS_Q = `*[_type == "connection"]{ style, description, start_year, end_year, "from": from->name, "to": to->name }`
const ENTITIES_Q = `*[_type == "entity"]{
  name,
  sector->{ name, desktop_center, desktop_center_overrides[]{x, y, start_date} },
  position_overrides[]{x, y, pin, start_date}, appearance_windows[]{start_year, end_year}
}`
const SETTINGS_Q = `*[_id == "mapSettings"][0]{ overrides[]{start_date, packing_density, collide_padding, label_size_px, connection_pull, entity_radius, size_spacing, sector_pull, repulsion} }`

/**
 * Fetch the raw Sanity map docs once (one query per type). Returns null docs
 * (not an error) when Sanity isn't configured, so callers fall back to the sheet.
 */
export function useSanityMapDocs(): {docs: RawMapDocs | null; loading: boolean; error: string | null} {
  const [docs, setDocs] = useState<RawMapDocs | null>(null)
  const [loading, setLoading] = useState(isSanityConfigured())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSanityConfigured()) return
    let cancelled = false

    Promise.all([
      sanityQuery<RawSector[]>(SECTORS_Q),
      sanityQuery<RawCompany[]>(COMPANIES_Q),
      sanityQuery<RawConnection[]>(CONNECTIONS_Q),
      sanityQuery<RawEntity[]>(ENTITIES_Q),
      sanityQuery<{overrides?: RawSettingsOverride[]} | null>(SETTINGS_Q),
    ])
      .then(([sectors, companies, connections, entities, settings]) => {
        if (!cancelled) setDocs({sectors: sectors ?? [], companies: companies ?? [], connections: connections ?? [], entities: entities ?? [], settings})
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return {docs, loading, error}
}

/** A stable resolver memoized on docs + moment. */
export function useResolvedSanityMap(docs: RawMapDocs | null, at: Moment): ResolvedSanityMap | null {
  return useMemo(() => (docs ? resolveSanityMapAt(docs, at) : null), [docs, at])
}
