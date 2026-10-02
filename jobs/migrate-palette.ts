// One-off: move the approved colour palette out of the code override layer
// (src/styleLab/preset.ts) and into Sanity, so colour is edited in Studio.
//
// Writes, from the baked preset:
//   - sector.default_style.fill            ← preset.sectors[name]
//   - sector.default_style.stroke(+width)  ← preset.sectorStroke (every sector
//                                            except Large Cap) / preset.largeCapStroke
//   - company.planet_style.ombre           ← preset.largeCaps[name] (stripe recipe)
//   - company.planet_style.stroke(+width)  ← the recipe's own outline, when > 0
//   - mapSettings.background / panel_background ← preset.bg / preset.panelBg
//
// Needs the Studio schema that defines `planetStyle.ombre`, `mapSettings.background`
// and `mapSettings.panel_background` (deploy Studio so editors can see the fields;
// the data is valid either way). Existing `stripes` are left in place as a
// fallback — the ombré recipe wins when present. Draft copies of a document are
// patched too, so publishing a stale draft later can't undo the migration.
//
// Idempotent: a field already at its target value is skipped.
//
// DRY RUN BY DEFAULT. Pass --apply to write. Needs an EDITOR Sanity token.
//   Env: SANITY_PROJECT_ID, SANITY_DATASET, SANITY_AUTH_TOKEN (write).
// Run: npm run migrate-palette              # dry run
//      npm run migrate-palette -- --apply   # write
import {sanityClient} from './lib.ts'
import {LAB_PRESET} from '../src/styleLab/preset.ts'

const APPLY = process.argv.includes('--apply')
const LARGE_CAP = 'Large Cap'

// hex string -> the value shape @sanity/color-input stores (same as
// studio/scripts/import-from-sheet.ts).
function hexToColor(input: string) {
  let h = input.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const d = max - min
  const l = (max + min) / 2
  let hh = 0, s = 0
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rn) hh = (gn - bn) / d + (gn < bn ? 6 : 0)
    else if (max === gn) hh = (bn - rn) / d + 2
    else hh = (rn - gn) / d + 4
    hh /= 6
  }
  const hDeg = Math.round(hh * 360)
  const sv = max === 0 ? 0 : d / max
  return {
    _type: 'color',
    hex: `#${h.slice(0, 6).toLowerCase()}`,
    alpha: 1,
    hsl: {_type: 'hslaColor', h: hDeg, s, l, a: 1},
    hsv: {_type: 'hsvaColor', h: hDeg, s: sv, v: max, a: 1},
    rgb: {_type: 'rgbaColor', r, g, b, a: 1},
  }
}
const key = () => Math.random().toString(36).slice(2, 14)
const lc = (s: string | null | undefined) => (s ?? '').toLowerCase()
const isDraft = (id: string) => id.startsWith('drafts.')

type SectorDoc = {_id: string; name?: string; fill?: string | null; stroke?: string | null; stroke_width_px?: number | null}
type CompanyDoc = {
  _id: string
  name?: string
  sector?: string | null
  stroke?: string | null
  stroke_width_px?: number | null
  ombre?: {
    stops?: (string | null)[] | null
    count?: number | null
    angle?: number | null
    blend?: string | null
    reverse?: boolean | null
    stripe_stroke_px?: number | null
    stripe_stroke_color?: string | null
  } | null
}
type SettingsDoc = {_id: string; bg?: {top?: string | null; middle?: string | null; bottom?: string | null} | null; panel?: string | null}

type Op = {id: string; root: 'default_style' | 'planet_style' | null; set: Record<string, unknown>; lines: string[]}

async function main() {
  const preset = LAB_PRESET
  if (!preset) {
    console.log('src/styleLab/preset.ts has no preset (LAB_PRESET is null) — nothing to migrate.')
    return
  }
  const client = sanityClient()
  const ops: Op[] = []
  const warnings: string[] = []

  // ---- Sectors ----------------------------------------------------------
  const sectors = await client.fetch<SectorDoc[]>(
    `*[_type == "sector"]{_id, name, "fill": default_style.fill.hex, "stroke": default_style.stroke.hex, "stroke_width_px": default_style.stroke_width_px}`,
  )
  const sectorNames = new Set(sectors.map((s) => s.name))
  for (const name of Object.keys(preset.sectors)) {
    if (!sectorNames.has(name)) warnings.push(`preset sector "${name}" has no sector document in Sanity — skipped`)
  }
  for (const s of sectors) {
    if (!s.name) continue
    const set: Record<string, unknown> = {}
    const lines: string[] = []
    const fill = preset.sectors[s.name]
    if (fill && lc(s.fill) !== lc(fill)) {
      set['default_style.fill'] = hexToColor(fill)
      lines.push(`fill     ${s.fill ?? '(none)'} → ${fill}`)
    }
    const outline = s.name === LARGE_CAP ? preset.largeCapStroke : preset.sectorStroke
    if (outline && (lc(s.stroke) !== lc(outline.color) || s.stroke_width_px !== outline.px)) {
      set['default_style.stroke'] = hexToColor(outline.color)
      set['default_style.stroke_width_px'] = outline.px
      lines.push(`outline  ${s.stroke ?? '(none)'} ${s.stroke_width_px ?? '-'}px → ${outline.color} ${outline.px}px`)
    }
    if (lines.length) ops.push({id: s._id, root: 'default_style', set, lines: [`SECTOR  ${s.name}${isDraft(s._id) ? '  [draft]' : ''}`, ...lines]})
  }

  // ---- Large Cap companies (ombré recipes) --------------------------------
  const names = Object.keys(preset.largeCaps)
  const companies = await client.fetch<CompanyDoc[]>(
    `*[_type == "company" && name in $names]{_id, name, "sector": sector->name,
      "stroke": planet_style.stroke.hex, "stroke_width_px": planet_style.stroke_width_px,
      "ombre": planet_style.ombre{ "stops": stops[].hex, count, angle, blend, reverse, stripe_stroke_px, "stripe_stroke_color": stripe_stroke_color.hex }}`,
    {names},
  )
  const found = new Set(companies.map((c) => c.name))
  for (const n of names) if (!found.has(n)) warnings.push(`preset company "${n}" has no company document in Sanity — skipped`)
  for (const c of companies) {
    if (!c.name) continue
    const r = preset.largeCaps[c.name]
    if (!r) continue
    const set: Record<string, unknown> = {}
    const lines: string[] = []
    const cur = c.ombre
    const same =
      !!cur &&
      JSON.stringify((cur.stops ?? []).map(lc)) === JSON.stringify(r.stops.map(lc)) &&
      cur.count === r.count &&
      cur.angle === r.angle &&
      (cur.blend ?? 'oklab') === (r.blend ?? 'oklab') &&
      !!cur.reverse === !!r.reverse &&
      (cur.stripe_stroke_px ?? 0) === (r.stripeStrokePx ?? 0)
    if (!same) {
      set['planet_style.ombre'] = {
        _type: 'ombreStripes',
        stops: r.stops.map((h) => ({...hexToColor(h), _key: key()})),
        count: r.count,
        angle: r.angle,
        blend: r.blend ?? 'oklab',
        reverse: !!r.reverse,
        stripe_stroke_px: r.stripeStrokePx ?? 0,
        ...(r.stripeStrokeColor ? {stripe_stroke_color: hexToColor(r.stripeStrokeColor)} : {}),
      }
      lines.push(
        `recipe   ${cur ? `${cur.count} stripes @ ${cur.angle}°` : '(none)'} → ${r.count} stripes @ ${r.angle}°${r.reverse ? ' reversed' : ''}, ${r.stops.join(' ')}`,
      )
    }
    if (r.strokePx > 0 && (lc(c.stroke) !== lc(r.strokeColor) || c.stroke_width_px !== r.strokePx)) {
      set['planet_style.stroke'] = hexToColor(r.strokeColor)
      set['planet_style.stroke_width_px'] = r.strokePx
      lines.push(`outline  ${c.stroke ?? '(sector default)'} ${c.stroke_width_px ?? '-'}px → ${r.strokeColor} ${r.strokePx}px`)
    }
    if (c.sector !== LARGE_CAP) warnings.push(`"${c.name}" has a recipe but its sector is "${c.sector}" (not Large Cap) — migrated anyway`)
    if (lines.length) ops.push({id: c._id, root: 'planet_style', set, lines: [`COMPANY ${c.name}${isDraft(c._id) ? '  [draft]' : ''}`, ...lines]})
  }

  // ---- Map settings (background + side panel) -----------------------------
  const settings = await client.fetch<SettingsDoc[]>(
    `*[_id in ["mapSettings", "drafts.mapSettings"]]{_id, "bg": background{ "top": top.hex, "middle": middle.hex, "bottom": bottom.hex }, "panel": panel_background.hex}`,
  )
  const settingsTargets: SettingsDoc[] = settings.length ? settings : [{_id: 'mapSettings'}]
  for (const st of settingsTargets) {
    const set: Record<string, unknown> = {}
    const lines: string[] = []
    const [top, middle, bottom] = preset.bg
    if (lc(st.bg?.top) !== lc(top) || lc(st.bg?.middle) !== lc(middle) || lc(st.bg?.bottom) !== lc(bottom)) {
      set['background'] = {top: hexToColor(top), middle: hexToColor(middle), bottom: hexToColor(bottom)}
      lines.push(`background  ${st.bg ? `${st.bg.top} ${st.bg.middle} ${st.bg.bottom}` : '(built-in gradient)'} → ${top} ${middle} ${bottom}`)
    }
    if (preset.panelBg && lc(st.panel) !== lc(preset.panelBg)) {
      set['panel_background'] = hexToColor(preset.panelBg)
      lines.push(`side panel  ${st.panel ?? '(built-in navy)'} → ${preset.panelBg}`)
    }
    if (lines.length) ops.push({id: st._id, root: null, set, lines: [`SETTINGS ${st._id}${settings.length ? '' : '  [will be created]'}`, ...lines]})
  }

  // ---- Report -------------------------------------------------------------
  console.log(`Palette migration — ${APPLY ? 'APPLY' : 'dry run'}\n`)
  for (const op of ops) {
    console.log(op.lines[0])
    for (const l of op.lines.slice(1)) console.log(`    ${l}`)
  }
  const fieldCount = ops.reduce((n, o) => n + Object.keys(o.set).length, 0)
  console.log(`\n${ops.length} document(s), ${fieldCount} field(s) to change.`)
  if (warnings.length) {
    console.log('\nWarnings:')
    for (const w of warnings) console.log(`  - ${w}`)
  }
  if (!ops.length) {
    console.log('\nNothing to do — Sanity already matches the preset.')
    return
  }
  if (!APPLY) {
    console.log('\n(dry run — nothing written. Re-run with --apply to write.)')
    return
  }

  // One transaction: it all lands or none of it does.
  let tx = client.transaction()
  if (!settings.length) tx = tx.createIfNotExists({_id: 'mapSettings', _type: 'mapSettings'})
  for (const op of ops) {
    tx = tx.patch(op.id, (p) => {
      const q = op.root ? p.setIfMissing({[op.root]: {_type: 'planetStyle'}}) : p
      return q.set(op.set)
    })
  }
  await tx.commit()
  console.log(`\n✓ wrote ${ops.length} document(s).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
