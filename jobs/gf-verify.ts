// Sanity-check the Google Finance sheet against the old FMP sheet: compares the
// current-year (live) value per slug and reports matches, big diffs, and gaps.
// Read-only. Run: npm run gf-verify
//   Env: GF_SHEET_ID + SHEET_ID (old FMP) + service-account creds.
import {google} from 'googleapis'

// Load jobs/.env (Node 20.6+), same as lib.ts.
try {
  ;(process as {loadEnvFile?: (path?: string) => void}).loadEnvFile?.('.env')
} catch {
  /* fall back to already-exported env vars */
}

const YEAR = String(new Date().getFullYear())

async function client() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const auth = new google.auth.GoogleAuth({
    credentials: json ? JSON.parse(json) : undefined,
    keyFile: json ? undefined : process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  return google.sheets({version: 'v4', auth})
}

/** slug → current-year value (number) for a sheet. */
async function read(sheets: ReturnType<typeof google.sheets>, id: string): Promise<Map<string, number>> {
  const meta = await sheets.spreadsheets.get({spreadsheetId: id})
  const tab = meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1'
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: tab,
    valueRenderOption: 'UNFORMATTED_VALUE',
  })
  const rows = resp.data.values ?? []
  const H = (rows[0] ?? []).map((h) => String(h).trim().toLowerCase())
  const slugI = H.indexOf('slug')
  const yearI = H.indexOf(YEAR)
  const out = new Map<string, number>()
  if (slugI < 0 || yearI < 0) return out
  for (let r = 1; r < rows.length; r++) {
    const slug = String(rows[r]?.[slugI] ?? '').trim()
    if (!slug) continue
    const raw = rows[r]?.[yearI]
    const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/[$,\s]/g, ''))
    if (Number.isFinite(n) && n > 0) out.set(slug, n)
  }
  return out
}

async function main() {
  const gfId = process.env.GF_SHEET_ID
  const fmpId = process.env.SHEET_ID
  if (!gfId || !fmpId) throw new Error('Set GF_SHEET_ID and SHEET_ID.')
  const sheets = await client()
  const [gf, fmp] = await Promise.all([read(sheets, gfId), read(sheets, fmpId)])

  const close: string[] = []
  const diff: string[] = []
  const gfOnly: string[] = []
  const fmpOnly: string[] = []
  const slugs = new Set([...gf.keys(), ...fmp.keys()])
  for (const s of [...slugs].sort()) {
    const g = gf.get(s)
    const f = fmp.get(s)
    if (g && f) {
      const pct = Math.abs(g - f) / f
      const line = `  ${s.padEnd(26)} GF ${g.toFixed(1)}  vs  FMP ${f.toFixed(1)}  (${(pct * 100).toFixed(0)}%)`
      if (pct <= 0.1) close.push(line)
      else diff.push(line)
    } else if (g) gfOnly.push(`  ${s.padEnd(26)} GF ${g.toFixed(1)}  (FMP had none)`)
    else if (f) fmpOnly.push(`  ${s.padEnd(26)} FMP ${f.toFixed(1)}  (GF blank — re-ticker?)`)
  }

  console.log(`Current-year (${YEAR}) comparison — GF sheet vs FMP sheet\n`)
  console.log(`✓ Within 10%: ${close.length}`)
  console.log(`\n⚠ Differ >10% (check currency/ticker):\n${diff.join('\n') || '  (none)'}`)
  console.log(`\n⚠ Blank in GF but present in FMP (likely OTC to re-ticker):\n${fmpOnly.join('\n') || '  (none)'}`)
  console.log(`\n＋ New coverage GF has that FMP didn't:\n${gfOnly.join('\n') || '  (none)'}`)
  console.log(`\n(first 8 close matches as a spot-check:)\n${close.slice(0, 8).join('\n')}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
