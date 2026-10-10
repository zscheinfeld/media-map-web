// One-off: move a list of companies (jobs/manual-switch.json — Quebecor and Banijay, from Zach's
// "International Companies" sheet, 2026-10-10) from Google Finance to manual entry:
//   1. Sanity: point each company's `data_source` at the "Manual entry" source.
//   2. Sheet: write the hand-found current-year value over the GOOGLEFINANCE
//      formula, set the Data Source column to "Manual entry" (the nightly sync
//      would do this anyway), and put `2026 | label | url` at the top of the
//      "Link to Data Source" column so the panel shows it as the current source.
// Rows are matched by slug. DRY RUN BY DEFAULT; --apply writes.
//
// Env: SANITY_PROJECT_ID, SANITY_DATASET, SANITY_AUTH_TOKEN (write),
//      GF_SHEET_ID (+ GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS).

import {google} from 'googleapis'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {sanityClient} from './lib.ts'

const APPLY = process.argv.includes('--apply')
type Row = {name: string; slug: string; value_2026: number; url: string; label: string}
const PLAN: Row[] = JSON.parse(readFileSync(fileURLToPath(new URL('./manual-switch.json', import.meta.url)), 'utf8'))

const normHeader = (h: string) => h.replace(/[^\p{L}\p{N}_ ]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
const colLetter = (i: number) => {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

async function switchSanity() {
  const client = sanityClient()
  const sources = await client.fetch<{_id: string; name?: string}[]>(`*[_type == "dataSource"]{_id, name}`)
  const manual = sources.find((s) => /manual/i.test(s.name ?? ''))
  if (!manual) throw new Error('No "Manual entry" dataSource document in Sanity.')
  const slugs = PLAN.map((r) => r.slug)
  const companies = await client.fetch<{_id: string; name: string; slug: string; src: string | null}[]>(
    `*[_type == "company" && slug.current in $slugs]{_id, name, "slug": slug.current, "src": data_source->name}`,
    {slugs},
  )
  const missing = slugs.filter((s) => !companies.some((c) => c.slug === s))
  if (missing.length) console.log(`⚠ not in Sanity: ${missing.join(', ')}`)
  const todo = companies.filter((c) => c.src !== manual.name)
  for (const c of todo) console.log(`${APPLY ? 'sanity' : 'sanity (dry)'} ${c.slug}: ${c.src ?? '—'} → ${manual.name}`)
  console.log(`Sanity: ${todo.length} to switch, ${companies.length - todo.length} already manual.`)
  if (!APPLY || todo.length === 0) return
  let tx = client.transaction()
  for (const c of todo) tx = tx.patch(c._id, (p) => p.set({data_source: {_type: 'reference', _ref: manual._id}}))
  await tx.commit()
  console.log(`✓ Sanity: switched ${todo.length}.`)
}

async function writeSheet() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const auth = new google.auth.GoogleAuth({
    credentials: json ? JSON.parse(json) : undefined,
    keyFile: json ? undefined : process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({version: 'v4', auth})
  const spreadsheetId = process.env.GF_SHEET_ID as string
  if (!spreadsheetId) throw new Error('Set GF_SHEET_ID.')
  const meta = await sheets.spreadsheets.get({spreadsheetId})
  const tab = process.env.GF_SHEET_TAB ?? meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1'
  const rows = (await sheets.spreadsheets.values.get({spreadsheetId, range: tab})).data.values ?? []
  const headerRow = rows.findIndex((r) => (r ?? []).map(normHeader).includes('slug'))
  const header = rows[headerRow].map(normHeader)
  const col = (name: string) => {
    const i = header.indexOf(name)
    if (i < 0) throw new Error(`No "${name}" column.`)
    return i
  }
  const slugCol = col('slug'), srcCol = col('data source'), linkCol = col('link to data source')
  const years = header.map((h, i) => ({h, i})).filter(({h}) => /^\d{4}$/.test(h))
  const current = years.reduce((a, b) => (Number(b.h) > Number(a.h) ? b : a))
  console.log(`Sheet tab "${tab}": current year column ${current.h} = ${colLetter(current.i)}`)

  const data: {range: string; values: (string | number)[][]}[] = []
  const bySlug = new Map(PLAN.map((r) => [r.slug, r]))
  const seen = new Set<string>()
  for (let i = headerRow + 1; i < rows.length; i++) {
    const slug = (rows[i]?.[slugCol] ?? '').trim()
    const r = bySlug.get(slug)
    if (!r) continue
    seen.add(slug)
    const rowN = i + 1
    const curVal = rows[i]?.[current.i] ?? ''
    const curSrc = rows[i]?.[srcCol] ?? ''
    const curLink = rows[i]?.[linkCol] ?? ''
    const line = `${current.h} | ${r.label} | ${r.url}`
    const lines = curLink.split(/\r?\n/).filter((l: string) => l.trim() && !l.trim().startsWith(`${current.h} |`))
    const nextLink = [line, ...lines].join('\n')
    console.log(`${APPLY ? 'sheet' : 'sheet (dry)'} row ${rowN} ${slug}: ${current.h} ${JSON.stringify(curVal).slice(0, 24)} → ${r.value_2026}; source "${curSrc}" → "Manual entry"; link +1 line`)
    data.push({range: `${tab}!${colLetter(current.i)}${rowN}`, values: [[r.value_2026]]})
    if (curSrc !== 'Manual entry') data.push({range: `${tab}!${colLetter(srcCol)}${rowN}`, values: [['Manual entry']]})
    if (curLink !== nextLink) data.push({range: `${tab}!${colLetter(linkCol)}${rowN}`, values: [[nextLink]]})
  }
  const missing = PLAN.filter((r) => !seen.has(r.slug)).map((r) => r.slug)
  if (missing.length) console.log(`⚠ not in the sheet: ${missing.join(', ')}`)
  console.log(`Sheet: ${data.length} cell(s) to write across ${seen.size} rows.`)
  if (!APPLY || data.length === 0) return
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId, requestBody: {valueInputOption: 'RAW', data}})
  console.log(`✓ Sheet: wrote ${data.length} cell(s).`)
}

async function main() {
  await switchSanity()
  await writeSheet()
  if (!APPLY) console.log('Dry run — pass --apply to write.')
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
