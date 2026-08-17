// One-time: upgrade bare US tickers in Sanity to GOOGLEFINANCE prefix form
// ("AAPL" → "NASDAQ:AAPL") using the exchange from the old FMP sheet.
//
// ⚠ CAUTION — NOT for a blind bulk run. The FMP exchange data has errors (e.g. it
// lists Walmart/WMT as NASDAQ when it's NYSE). A WRONG prefix BREAKS GOOGLEFINANCE
// (`NASDAQ:WMT` → #N/A), whereas a bare `WMT` resolves correctly on its own. So
// bare US tickers are actually SAFER. Only use this after verifying the exchange
// values, or for a hand-picked subset — always eyeball the dry run first.
//
// Skips: already-prefixed (has ':'), suffixed non-US (has '.'), OTC-ADR shapes
// (5 letters ending F/Y — re-ticker those by hand), tickerless, and any company
// whose FMP exchange isn't a recognizable US exchange.
//
// DRY RUN BY DEFAULT. Pass --apply to write. Needs an EDITOR Sanity token + the
// service-account creds + SHEET_ID (old FMP sheet).
// Run: npm run gf-prefix-us-tickers            # dry run
//      npm run gf-prefix-us-tickers -- --apply # write
import {google} from 'googleapis'
import {fetchRoster, sanityClient} from './lib.ts'

const APPLY = process.argv.includes('--apply')

/** FMP exchange label → GOOGLEFINANCE prefix (US only). null = not a US exchange. */
function usGfPrefix(ex: string): string | null {
  const e = ex.trim().toUpperCase()
  if (!e) return null
  if (/NASDAQ/.test(e)) return 'NASDAQ'
  if (/NYSE AMERICAN|AMEX|NYSE MKT/.test(e)) return 'NYSEAMERICAN'
  if (/NYSE|NEW YORK/.test(e)) return 'NYSE'
  if (/\bBATS\b|CBOE/.test(e)) return 'BATS'
  return null
}

async function fmpExchanges(): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const id = process.env.SHEET_ID
  if (!id) throw new Error('Set SHEET_ID (the old FMP sheet) to read exchanges from.')
  const auth = new google.auth.GoogleAuth({
    credentials: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) : undefined,
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? undefined : process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  const sheets = google.sheets({version: 'v4', auth})
  const meta = await sheets.spreadsheets.get({spreadsheetId: id})
  const tab = meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1'
  const rows = (await sheets.spreadsheets.values.get({spreadsheetId: id, range: tab})).data.values ?? []
  const H = (rows[0] ?? []).map((h) => String(h).trim().toLowerCase())
  const si = H.indexOf('slug')
  const ei = H.indexOf('exchange')
  if (si < 0 || ei < 0) return out
  for (let r = 1; r < rows.length; r++) {
    const slug = String(rows[r]?.[si] ?? '').trim()
    const ex = String(rows[r]?.[ei] ?? '').trim()
    if (slug && ex) out.set(slug, ex)
  }
  return out
}

async function main() {
  const roster = await fetchRoster(sanityClient())
  const ex = await fmpExchanges()

  const changes: {id: string; name: string; from: string; to: string}[] = []
  const skippedNoExchange: string[] = []
  for (const c of roster) {
    const t = (c.ticker ?? '').trim()
    if (!t || t.toUpperCase() === 'NA') continue
    if (t.includes(':') || t.includes('.')) continue // already prefixed / non-US suffix
    if (/^[A-Z]{4}[FY]$/.test(t.toUpperCase())) continue // OTC ADR — re-ticker by hand
    const gx = usGfPrefix(ex.get(c.slug ?? '') ?? '')
    if (!gx) {
      skippedNoExchange.push(`  ${c.name} (${t})`)
      continue
    }
    changes.push({id: c._id, name: c.name, from: t, to: `${gx}:${t}`})
  }

  changes.sort((a, b) => a.name.localeCompare(b.name))
  for (const ch of changes) console.log(`  ${ch.name.padEnd(26)} ${ch.from.padEnd(8)} → ${ch.to}`)
  console.log(`\n${changes.length} US tickers to prefix.`)
  if (skippedNoExchange.length) {
    console.log(`\nSkipped (bare ticker, no recognizable US exchange — leave as-is or check):\n${skippedNoExchange.join('\n')}`)
  }

  if (!APPLY) {
    console.log(`\n(dry run — nothing written. Re-run with --apply to write to Sanity.)`)
    return
  }
  const client = sanityClient()
  let tx = client.transaction()
  for (const ch of changes) tx = tx.patch(ch.id, (p) => p.set({ticker: ch.to}))
  await tx.commit()
  console.log(`\n✓ Prefixed ${changes.length} tickers in Sanity. Re-run gf-sync-roster to reflect on the sheet.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
