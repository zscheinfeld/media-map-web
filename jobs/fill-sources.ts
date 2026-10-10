// One-off: write the cleaned data-source lists into the Google Finance sheet's
// "Link to Data Source" column, one company per row matched by slug. The lines
// per cell are `years | label | url` (newest first; a line without years is the
// source for every year), which the site reads from the valuations snapshot.
// Rows whose slug is not in sources-fill.json are left untouched.
//
//   npm run fill-sources            # dry run: prints what would change
//   npm run fill-sources -- --apply # writes
//
// Env: GF_SHEET_ID (+ GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS). Optional GF_SHEET_TAB.

import {google} from 'googleapis'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import './lib'

const APPLY = process.argv.includes('--apply')
const FILL: Record<string, string> = JSON.parse(readFileSync(fileURLToPath(new URL('./sources-fill.json', import.meta.url)), 'utf8'))

const normHeader = (h: string) =>
  h.replace(/[^\p{L}\p{N}_ ]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
const colLetter = (i: number) => {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

async function main() {
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
  if (headerRow < 0) throw new Error('No header row with a "slug" column.')
  const header = rows[headerRow].map(normHeader)
  const slugCol = header.indexOf('slug')
  const linkCol = header.indexOf('link to data source')
  if (linkCol < 0) throw new Error('No "Link to Data Source" column — refusing to guess.')
  console.log(`Tab "${tab}", header row ${headerRow + 1}, slug col ${colLetter(slugCol)}, link col ${colLetter(linkCol)}`)

  const data: {range: string; values: string[][]}[] = []
  const seen = new Set<string>()
  let unchanged = 0
  for (let i = headerRow + 1; i < rows.length; i++) {
    const slug = (rows[i]?.[slugCol] ?? '').trim()
    if (!slug || !(slug in FILL)) continue
    seen.add(slug)
    const cur = rows[i]?.[linkCol] ?? ''
    const next = FILL[slug]
    if (cur === next) {
      unchanged++
      continue
    }
    data.push({range: `${tab}!${colLetter(linkCol)}${i + 1}`, values: [[next]]})
    console.log(`${APPLY ? 'write' : 'would write'} ${colLetter(linkCol)}${i + 1} ${slug}: ${JSON.stringify(cur).slice(0, 70)} → ${next.split('\n').length} line(s)`)
  }
  const missing = Object.keys(FILL).filter((s) => !seen.has(s))
  if (missing.length) console.log(`⚠ ${missing.length} slug(s) in sources-fill.json not found in the sheet: ${missing.join(', ')}`)
  console.log(`${data.length} cell(s) to change, ${unchanged} already up to date.`)
  if (!APPLY) {
    console.log('Dry run — pass --apply to write.')
    return
  }
  if (data.length === 0) return
  // RAW: the pipes, dashes and URLs are stored as typed, never interpreted.
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId, requestBody: {valueInputOption: 'RAW', data}})
  console.log(`✓ Wrote ${data.length} cell(s).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
