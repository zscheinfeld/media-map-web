// One-off: fix each company's `data_source` reference.
//   - The named list below → "companiesmarketcap.com" (manual, hand-scraped).
//   - Every company WITHOUT a ticker → "Manual entry" (FMP can't fetch it).
//   - Everything else (has a ticker) is left as-is (Financial Modeling Prep).
// Dry-run by default; pass --apply to write. Both data-source docs must already
// exist in Studio (Samsung → companiesmarketcap.com, Access → Manual entry).
import {sanityClient} from './lib.ts'

const client = sanityClient()
const APPLY = process.argv.includes('--apply')

const CMC_NAMES = new Set(
  ['samsung', 'audacy', 'daily mail', 'gannett', 'hybe', 'lg', 'mfe', 'multichoice group', 'schibsted', 'sun tv', 'tf1', 'zee'],
)

const sources = await client.fetch<{_id: string; name?: string; code?: string; type?: string}[]>(
  `*[_type=="dataSource"]{_id, name, code, type}`,
)
const cmc = sources.find((s) => /companiesmarketcap/i.test(`${s.name} ${s.code}`))
const manual = sources.find((s) => (s.name ?? '').toLowerCase() === 'manual entry' || s.code === 'manual')
if (!cmc) throw new Error('No "companiesmarketcap.com" data source found in Sanity.')
if (!manual) throw new Error('No "Manual entry" data source found in Sanity.')
console.log(`companiesmarketcap.com → ${cmc._id} (type=${cmc.type})`)
console.log(`Manual entry          → ${manual._id} (type=${manual.type})`)

const companies = await client.fetch<{_id: string; name?: string; ticker?: string; srcId?: string}[]>(
  `*[_type=="company"]{_id, name, ticker, "srcId": data_source._ref}`,
)

const plan: {id: string; name: string; to: string; ref: string}[] = []
for (const c of companies) {
  const nm = (c.name ?? '').trim().toLowerCase()
  let ref: string | null = null
  let to = ''
  const noTicker = !c.ticker || (c.ticker ?? '').trim().toUpperCase() === 'NA'
  if (CMC_NAMES.has(nm)) { ref = cmc._id; to = 'companiesmarketcap.com' }
  else if (noTicker) { ref = manual._id; to = 'Manual entry' }
  if (ref && c.srcId !== ref) plan.push({id: c._id, name: c.name ?? '', to, ref})
}

const foundCmc = new Set(companies.filter((c) => CMC_NAMES.has((c.name ?? '').trim().toLowerCase())).map((c) => (c.name ?? '').trim().toLowerCase()))
const missing = [...CMC_NAMES].filter((n) => !foundCmc.has(n))

console.log(`\n${plan.length} companies to update:`)
for (const p of plan) console.log(`  ${p.name.padEnd(28)} → ${p.to}`)
if (missing.length) console.log(`\n⚠ companiesmarketcap names NOT matched in Sanity: ${missing.join(', ')}`)

if (!APPLY) {
  console.log('\n(dry run — re-run with `--apply` to write these changes)')
} else {
  const tx = client.transaction()
  for (const p of plan) tx.patch(p.id, (patch) => patch.set({data_source: {_type: 'reference', _ref: p.ref}}))
  await tx.commit()
  console.log(`\n✓ Updated ${plan.length} companies.`)
}
