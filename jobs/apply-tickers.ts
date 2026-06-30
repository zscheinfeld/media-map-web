// Read the reviewed jobs/ticker-suggestions.csv and write each `suggested_ticker`
// onto the matching Sanity company (by slug), in one transaction. Rows with a
// blank ticker are skipped (e.g. private companies you cleared during review).
//
// Patches the published documents directly (the app reads published) — needs an
// Editor (write) token in jobs/.env.
import {readFileSync} from 'node:fs'
import {parseCsv, sanityClient} from './lib.ts'

async function main() {
  const client = sanityClient()

  let text: string
  try {
    text = readFileSync('ticker-suggestions.csv', 'utf8')
  } catch {
    throw new Error('jobs/ticker-suggestions.csv not found — run `npm run suggest-tickers` first.')
  }

  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim()))
  const header = rows.shift()
  if (!header) throw new Error('Empty CSV.')
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name)
  const firstCol = (...names: string[]) => {
    for (const n of names) {
      const i = col(n)
      if (i >= 0) return i
    }
    return -1
  }
  // Accept either the ticker-suggestions.csv (suggested_*) or the vetted
  // market_cap sheet (ticker / type), both keyed by slug.
  const slugIdx = col('slug')
  const tickerIdx = firstCol('suggested_ticker', 'ticker')
  const typeIdx = firstCol('suggested_type', 'valuation_type', 'type')
  if (slugIdx < 0 || (tickerIdx < 0 && typeIdx < 0))
    throw new Error('CSV needs a `slug` column plus a ticker (`suggested_ticker`/`ticker`) and/or a type column.')

  const VALID_TYPES = new Set(['market_cap', 'fundraising_valuation', 'yearly_revenue'])
  const updates = rows
    .map((r) => ({
      slug: (r[slugIdx] ?? '').trim(),
      ticker: (r[tickerIdx] ?? '').trim(),
      type: typeIdx >= 0 ? (r[typeIdx] ?? '').trim() : '',
    }))
    .filter((u) => u.slug && (u.ticker || VALID_TYPES.has(u.type)))

  console.log(`${updates.length} rows to apply (ticker and/or primary metric)…`)
  if (updates.length === 0) return

  // Resolve slug → published _id.
  const docs = await client.fetch<{_id: string; slug: string}[]>(
    `*[_type=="company" && slug.current in $slugs]{_id, "slug": slug.current}`,
    {slugs: updates.map((u) => u.slug)},
  )
  const idBySlug = new Map(docs.map((d) => [d.slug, d._id]))

  let tx = client.transaction()
  let tickers = 0
  let types = 0
  const missing: string[] = []
  for (const u of updates) {
    const id = idBySlug.get(u.slug)
    if (!id) {
      missing.push(u.slug)
      continue
    }
    const set: Record<string, string> = {}
    if (u.ticker) {
      set.ticker = u.ticker
      tickers++
    }
    if (VALID_TYPES.has(u.type)) {
      set.valuation_type = u.type
      types++
    }
    if (Object.keys(set).length) tx = tx.patch(id, (p) => p.set(set))
  }

  await tx.commit()
  console.log(`Done. Set ticker on ${tickers}, primary metric on ${types} companies.`)
  if (missing.length) console.log(`No company matched these slugs (skipped): ${missing.join(', ')}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
