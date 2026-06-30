/**
 * One-time importer: seeds the Sanity dataset from the existing Vite app's data.
 *
 * Sources (all in the sibling Vite app, imported directly so we don't re-encode
 * the shapes):
 *   - The public Google Sheet (same one src/loadCompanies.ts reads) → companies + sectors
 *   - ../src/sectors.ts   → SECTOR_FLAT_STYLES, COMPANY_STYLES, sector centers
 *   - ../src/layout.ts    → COMPANY_POSITIONS
 *   - ../src/connections.ts → COMPANY_CONNECTIONS
 *
 * Idempotent: documents use deterministic _ids derived from slug/code, and we
 * skip anything that already exists. `--reset` wipes the managed types first.
 *
 * Run: see studio/README.md ("Importing data"). Needs SANITY_AUTH_TOKEN +
 * SANITY_STUDIO_PROJECT_ID (or SANITY_PROJECT_ID) in the environment.
 */
import {randomUUID} from 'node:crypto'
import {createClient} from '@sanity/client'

// NOTE: paths are relative to studio/scripts/, so `../../src` reaches the
// repo-root Vite app's source (studio/scripts → studio → repo root → src).
import {
  COMPANY_STYLES,
  SECTOR_CENTERS,
  SECTOR_CENTERS_MOBILE,
  SECTOR_FLAT_STYLES,
  normSector,
  type PlanetStyle,
} from '../../src/sectors'
import {COMPANY_POSITIONS} from '../../src/layout'
import {COMPANY_CONNECTIONS} from '../../src/connections'

// Load studio/.env into process.env (tsx does NOT do this automatically).
// process.loadEnvFile exists in Node 20.12+; the optional-call + try/catch makes
// this a no-op if you've exported the vars another way or are on older Node.
try {
  ;(process as {loadEnvFile?: (path?: string) => void}).loadEnvFile?.('.env')
} catch {
  // No .env file — rely on already-exported environment variables.
}

// --- Config ---------------------------------------------------------------

// Same sheet the Vite app reads (src/loadCompanies.ts).
const SHEET_ID = '1ZVOsVf4fcoh1y08MecBcYtuVWfM54hTP9WVhBDAmgrc'
const GID = '0'
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`

const MANAGED_TYPES = ['company', 'sector', 'connection', 'article', 'podcast', 'dataSource']

const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production'
const token = process.env.SANITY_AUTH_TOKEN

if (!projectId || !token) {
  console.error(
    'Missing config. Set SANITY_STUDIO_PROJECT_ID (or SANITY_PROJECT_ID) and SANITY_AUTH_TOKEN.',
  )
  process.exit(1)
}

const client = createClient({projectId, dataset, token, apiVersion: '2024-01-01', useCdn: false})

// --- Helpers --------------------------------------------------------------

const genKey = () => randomUUID().replace(/-/g, '').slice(0, 12)

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// hex string -> the value shape @sanity/color-input stores.
function hexToColor(input: string) {
  let h = input.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  const l = (max + min) / 2
  let hh = 0
  let s = 0
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

const isHex = (v: string | undefined): v is string => !!v && /^#?[0-9a-f]{3,8}$/i.test(v)

// Port a src PlanetStyle into the Sanity `planetStyle` object shape. Returns
// undefined if there's nothing to store. `swatchBackground` is intentionally
// NOT included — on the Sanity side it lives on the Sector document, not on
// planetStyle.
function toPlanetStyle(ps: PlanetStyle | undefined): Record<string, unknown> | undefined {
  if (!ps) return undefined
  const out: Record<string, unknown> = {_type: 'planetStyle'}
  if (isHex(ps.fill)) out.fill = hexToColor(ps.fill)
  if (ps.stripes && ps.stripes.length >= 2) {
    out.stripes = ps.stripes
      .filter(isHex)
      .map((c) => ({...hexToColor(c), _key: genKey()}))
  }
  if (ps.stripeOrientation) out.stripe_orientation = ps.stripeOrientation
  if (isHex(ps.stroke)) out.stroke = hexToColor(ps.stroke) // skips "transparent"
  if (typeof ps.strokeWidthPx === 'number') out.stroke_width_px = ps.strokeWidthPx
  if (ps.glow && isHex(ps.glow.color)) {
    out.glow = {
      _type: 'glow',
      color: hexToColor(ps.glow.color),
      blur_px: ps.glow.blurPx ?? 5,
      spread_px: ps.glow.spreadPx ?? 4,
    }
  }
  return Object.keys(out).length > 1 ? out : undefined
}

// Case-insensitive lookups for the per-company maps (sheet casing varies).
const companyStylesLower = new Map(
  Object.entries(COMPANY_STYLES).map(([k, v]) => [k.toLowerCase(), v]),
)
const companyPositionsLower = new Map(
  Object.entries(COMPANY_POSITIONS).map(([k, v]) => [k.toLowerCase(), v]),
)

// --- CSV parsing (mirrors src/loadCompanies.ts) ---------------------------

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += c
      continue
    }
    if (c === '"') {
      inQuotes = true
      continue
    }
    if (c === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (c === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    if (c === '\r') continue
    cell += c
  }
  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function findHeaderRow(rows: string[][]) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = rows[i].map((c) => c.trim().toLowerCase())
    const nameCol = r.findIndex((c) => c.includes('company name') || c === 'company' || c === 'name')
    const valCol = r.findIndex((c) => c.startsWith('valuation'))
    if (nameCol >= 0 && valCol >= 0) {
      const sectorCol = r.findIndex((c) => c === 'sector' || c === 'category')
      return {index: i, name: nameCol, val: valCol, sector: sectorCol}
    }
  }
  return null
}

function toNum(s: string | undefined): number | undefined {
  if (!s) return undefined
  const cleaned = s.replace(/[$,\s]/g, '')
  if (!cleaned || /^[a-z]/i.test(cleaned)) return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

type SheetRow = {name: string; valuation: number; sector: string; nonPublic: boolean}

function parseSheet(csv: string): SheetRow[] {
  const rows = parseCsv(csv)
  const header = findHeaderRow(rows)
  if (!header) throw new Error('Could not find header row (need COMPANY NAME + VALUATION columns).')
  const out: SheetRow[] = []
  const seen = new Set<string>()
  for (let i = header.index + 1; i < rows.length; i++) {
    const r = rows[i]
    const name = (r[header.name] ?? '').trim()
    if (!name) continue
    if (/^all companies$/i.test(name) || /^total$/i.test(name)) continue
    const valuation = toNum(r[header.val])
    if (valuation === undefined) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const sector = normSector(header.sector >= 0 ? r[header.sector] : undefined)
    // The only machine-readable non-public marker in the CSV is the literal
    // "NOT PUBLIC" note (the sheet otherwise flags private companies by cell
    // color, which CSV export drops). Anything else defaults to public/FMP;
    // editors can flip is_public in the Studio.
    const nonPublic = r.some((cell) => /not public/i.test(cell))
    out.push({name, valuation, sector, nonPublic})
  }
  return out
}

// --- Document builders ----------------------------------------------------

const sectorId = (name: string) => `sector.${slugify(name)}`
const companyId = (name: string) => `company.${slugify(name)}`
const DATA_SOURCES = {
  fmp: {
    _id: 'dataSource.fmp',
    _type: 'dataSource',
    name: 'Financial Modeling Prep',
    code: 'fmp',
    type: 'api',
    status: 'active',
    coverage_notes: 'US public equities; some international coverage',
    ticker_format_hint: 'US tickers like DIS; international suffixes like .PA, .L, .T',
  },
  yahoo: {
    _id: 'dataSource.yahoo',
    _type: 'dataSource',
    name: 'Yahoo Finance',
    code: 'yahoo',
    type: 'api',
    status: 'active',
    coverage_notes: 'Broad international coverage; unofficial endpoints',
    ticker_format_hint: 'Similar to FMP but some symbols differ',
  },
  manual: {
    _id: 'dataSource.manual',
    _type: 'dataSource',
    name: 'Manual entry',
    code: 'manual',
    type: 'manual',
    status: 'active',
    coverage_notes: 'Editor-entered valuations; the only source for private companies',
  },
} as const

// --- Main -----------------------------------------------------------------

async function main() {
  const reset = process.argv.includes('--reset')

  if (reset) {
    console.log('--reset: deleting all managed documents…')
    await client.delete({query: `*[_type in $types]`, params: {types: MANAGED_TYPES}})
  }

  // Which docs already exist (so we skip rather than duplicate).
  const existingIds = new Set<string>(
    await client.fetch<string[]>('*[_type in $types]._id', {types: MANAGED_TYPES}),
  )

  const created: Record<string, number> = {dataSource: 0, sector: 0, company: 0, connection: 0}
  let skipped = 0

  // Commit a batch of docs, skipping ones that already exist.
  async function commit(docs: Record<string, unknown>[]) {
    const fresh = docs.filter((d) => {
      const id = d._id as string
      if (existingIds.has(id)) {
        skipped++
        return false
      }
      existingIds.add(id)
      return true
    })
    for (let i = 0; i < fresh.length; i += 50) {
      const tx = client.transaction()
      for (const d of fresh.slice(i, i + 50)) tx.create(d as never)
      await tx.commit()
    }
    for (const d of fresh) created[d._type as string] = (created[d._type as string] ?? 0) + 1
  }

  // 1. Data sources (referenced by companies — create first).
  await commit(Object.values(DATA_SOURCES) as unknown as Record<string, unknown>[])

  // 2. Fetch + parse the sheet.
  console.log('Fetching sheet…')
  const res = await fetch(SHEET_URL)
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`)
  const sheetRows = parseSheet(await res.text())
  console.log(`Parsed ${sheetRows.length} companies from sheet.`)

  // 3. Sectors (unique, referenced by companies).
  const sectorNames = [...new Set(sheetRows.map((r) => r.sector))]
  const sectorDocs = sectorNames.map((name) => {
    const desktop = SECTOR_CENTERS[name] ?? SECTOR_CENTERS['Uncategorized'] ?? {x: 0, y: 0}
    const mobile = SECTOR_CENTERS_MOBILE[name] ?? SECTOR_CENTERS_MOBILE['Uncategorized'] ?? {x: 0, y: 0}
    const flat = SECTOR_FLAT_STYLES[name]
    return {
      _id: sectorId(name),
      _type: 'sector',
      name,
      slug: {_type: 'slug', current: slugify(name)},
      desktop_center: {x: desktop.x, y: desktop.y},
      mobile_center: {x: mobile.x, y: mobile.y},
      default_style: toPlanetStyle(flat),
      swatch_background: flat?.swatchBackground,
    }
  })
  await commit(sectorDocs)

  // 4. Companies.
  const knownCompanyIds = new Set<string>(
    [...existingIds].filter((id) => id.startsWith('company.')),
  )
  const companyDocs = sheetRows.map((row) => {
    const style = toPlanetStyle(companyStylesLower.get(row.name.toLowerCase()))
    const pos = companyPositionsLower.get(row.name.toLowerCase())
    const id = companyId(row.name)
    knownCompanyIds.add(id)
    return {
      _id: id,
      _type: 'company',
      name: row.name,
      slug: {_type: 'slug', current: slugify(row.name)},
      sector: {_type: 'reference', _ref: sectorId(row.sector)},
      is_public: !row.nonPublic,
      data_source: {
        _type: 'reference',
        _ref: row.nonPublic ? DATA_SOURCES.manual._id : DATA_SOURCES.fmp._id,
      },
      ...(style ? {planet_style: style} : {}),
      ...(pos
        ? {
            position_overrides: [
              {_type: 'positionOverride', _key: genKey(), x: pos.x, y: pos.y, pin: !!pos.pin},
            ],
          }
        : {}),
    }
  })
  await commit(companyDocs)

  // 5. Connections (resolve names → company refs; skip if an endpoint is unknown).
  const connectionDocs: Record<string, unknown>[] = []
  for (const c of COMPANY_CONNECTIONS) {
    const fromId = companyId(c.from)
    const toId = companyId(c.to)
    if (!knownCompanyIds.has(fromId) || !knownCompanyIds.has(toId)) {
      console.warn(`Skipping connection "${c.from}" → "${c.to}" (a company isn't in the sheet).`)
      continue
    }
    connectionDocs.push({
      _id: `connection.${slugify(c.from)}__${slugify(c.to)}`,
      _type: 'connection',
      from: {_type: 'reference', _ref: fromId},
      to: {_type: 'reference', _ref: toId},
      style: c.style,
      description: c.description || undefined,
    })
  }
  await commit(connectionDocs)

  // 6. Summary.
  console.log('\nImport complete:')
  console.log(`  Data sources: ${created.dataSource}`)
  console.log(`  Sectors:      ${created.sector}`)
  console.log(`  Companies:    ${created.company}`)
  console.log(`  Connections:  ${created.connection}`)
  console.log(`  Skipped (already existed): ${skipped}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
