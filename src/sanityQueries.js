// The GROQ queries the site reads Sanity with — one place, imported by the app
// (sanityMap.ts, AboutModal.tsx) and by scripts/snapshot-sanity.mjs, which runs
// them at build time to write public/sanity-snapshot.json. Plain JS so the
// build script can import it without a TypeScript step.

export const STYLE_PROJ = `{
  "fill": fill.hex,
  "stripes": stripes[].hex,
  stripe_orientation,
  "stroke": stroke.hex,
  stroke_width_px,
  "glow": { "color": glow.color.hex, "blur_px": glow.blur_px, "spread_px": glow.spread_px },
  "ombre": ombre{ "stops": stops[].hex, count, angle, blend, reverse, stripe_stroke_px, "stripe_stroke_color": stripe_stroke_color.hex }
}`
export const SECTORS_Q = `*[_type == "sector"]{ name, desktop_center, mobile_center, desktop_center_overrides[]{x, y, start_date}, mobile_center_overrides[]{x, y, start_date}, "default_style": default_style ${STYLE_PROJ} }`
export const COMPANIES_Q = `*[_type == "company"]{
  ticker,
  name, "slug": slug.current, description,
  sector->{ name, desktop_center, mobile_center, desktop_center_overrides[]{x, y, start_date}, mobile_center_overrides[]{x, y, start_date}, "default_style": default_style ${STYLE_PROJ} },
  "planet_style": planet_style ${STYLE_PROJ}, position_overrides[]{x, y, pin, start_date}, mobile_position_overrides[]{x, y, pin, start_date},
  appearance_windows[]{start_year, end_year},
  vitals[]{_key, name, statistic, start_date, end_date},
  eshap_content[]{_key, kind, title, url, published_date},
  external_articles[]{_key, title, url, source, published_date},
  valuation_type, manual_valuations[]{value_billions_usd, as_of_date}, "data_source": data_source->name
}`
export const CONNECTIONS_Q = `*[_type == "connection"]{ style, description, start_year, end_year, "from": from->name, "to": to->name }`
export const ENTITIES_Q = `*[_type == "entity"]{
  name,
  sector->{ name, desktop_center, mobile_center, desktop_center_overrides[]{x, y, start_date}, mobile_center_overrides[]{x, y, start_date} },
  position_overrides[]{x, y, pin, start_date}, mobile_position_overrides[]{x, y, pin, start_date}, appearance_windows[]{start_year, end_year}
}`
const SETTINGS_KNOBS = `start_date, packing_density, collide_padding, label_size_px, connection_pull, entity_radius, size_spacing, sector_pull, repulsion`
export const SETTINGS_Q = `*[_id == "mapSettings"][0]{ overrides[]{${SETTINGS_KNOBS}}, square_overrides[]{${SETTINGS_KNOBS}}, "background": background{ "top": top.hex, "middle": middle.hex, "bottom": bottom.hex }, "panel_background": panel_background.hex, layout_lab }`

export const ABOUT_Q = `*[_id == "about"][0]{
  "heroUrl": heroImage.asset->url,
  sections[]{
    tabLabel,
    blocks[]{
      _type,
      text, label, action, url, caption,
      "photoUrl": image.asset->url
    }
  }
}`
