// One-time: populate the new Sanity `exchange` field and normalize tickers to
// bare symbols, so every company is consistently {bare ticker, exchange code}.
//
//   • ticker "NSE:RELIANCE"  → ticker "RELIANCE", exchange "NSE"   (split)
//   • ticker "4813.T"        → ticker "4813",     exchange "TYO"   (via resolveGf)
//   • ticker "AAPL" (bare)   → exchange "NASDAQ" from the FMP sheet (ticker kept)
//   • OTC ADRs (RLNIY, …)    → skipped (re-ticker to a primary listing by hand)
//   • already has an exchange → skipped (idempotent)
//
// DRY RUN BY DEFAULT. Pass --apply to write. Needs an EDITOR Sanity token, the
// service-account creds, and SHEET_ID (old FMP sheet, for US exchanges).
// Run: npm run gf-backfill-exchange            # dry run
//      npm run gf-backfill-exchange -- --apply # write
import {google} from 'googleapis'
import {fetchRoster, sanityClient} from './lib.ts'
import {resolveGf} from './gfTicker.ts'

const APPLY = process.argv.includes('--apply')

/** FMP exchange label → GOOGLEFINANCE prefix (US only). */
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
  if (!id) return out
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

type Patch = {id: string; name: string; from: string; set: {ticker?: string; exchange: string}}

async function main() {
  const roster = await fetchRoster(sanityClient())
  const fmp = await fmpExchanges()

  const patches: Patch[] = []
  const skipped: string[] = []
  for (const c of roster) {
    const t = (c.ticker ?? '').trim()
    if (!t || t.toUpperCase() === 'NA') continue
    if ((c.exchange ?? '').trim()) continue // already set — idempotent
    if (/^[A-Z]{4}[FY]$/.test(t.toUpperCase())) {
      skipped.push(`  ${c.name} (${t}) — OTC ADR, re-ticker to a primary listing`)
      continue
    }
    if (t.includes(':')) {
      const i = t.indexOf(':')
      patches.push({id: c._id, name: c.name, from: t, set: {ticker: t.slice(i + 1), exchange: t.slice(0, i).toUpperCase()}})
    } else if (t.includes('.')) {
      const r = resolveGf(t)
      if (r.gfTicker.includes(':')) {
        const i = r.gfTicker.indexOf(':')
        patches.push({id: c._id, name: c.name, from: t, set: {ticker: r.gfTicker.slice(i + 1), exchange: r.gfTicker.slice(0, i)}})
      } else skipped.push(`  ${c.name} (${t}) — ${r.review || 'unresolved suffix'}`)
    } else {
      const gx = usGfPrefix(fmp.get(c.slug ?? '') ?? '')
      if (gx) patches.push({id: c._id, name: c.name, from: t, set: {exchange: gx}})
      else skipped.push(`  ${c.name} (${t}) — no US exchange match in the FMP sheet`)
    }
  }

  patches.sort((a, b) => a.name.localeCompare(b.name))
  for (const p of patches) {
    const tick = p.set.ticker !== undefined ? ` ticker→${p.set.ticker}` : ''
    console.log(`  ${p.name.padEnd(26)} ${p.from.padEnd(14)} → exchange=${p.set.exchange}${tick}`)
  }
  console.log(`\n${patches.length} companies to backfill.`)
  if (skipped.length) console.log(`\nSkipped (${skipped.length}):\n${skipped.join('\n')}`)

  if (!APPLY) {
    console.log(`\n(dry run — nothing written. Re-run with --apply to write to Sanity.)`)
    return
  }
  const client = sanityClient()
  let tx = client.transaction()
  for (const p of patches) tx = tx.patch(p.id, (patch) => patch.set(p.set))
  await tx.commit()
  console.log(`\n✓ Backfilled ${patches.length} companies. Re-run gf-sync-roster to reflect on the sheet.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
