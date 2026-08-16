// Bulk-switch companies' Sanity `data_source` from FMP to Google Finance, and
// (optionally) retire FMP as a selectable source.
//
// "Data source" is a reference to a `dataSource` document, so this:
//   1. ensures a "Google Finance" dataSource doc exists (creates it if missing),
//   2. re-points every company that currently references the FMP source to it,
//   3. with --deprecate-fmp, flips the FMP source's status to "deprecated" so it
//      drops out of the Studio dropdown (existing history keeps resolving).
//
// DRY RUN BY DEFAULT. Pass --apply to write. Needs an EDITOR Sanity token.
//   Env: SANITY_PROJECT_ID, SANITY_DATASET, SANITY_AUTH_TOKEN (write).
// Run: npm run switch-datasource-to-gf              # dry run
//      npm run switch-datasource-to-gf -- --apply   # write
//      npm run switch-datasource-to-gf -- --apply --deprecate-fmp
import {sanityClient} from './lib.ts'

const APPLY = process.argv.includes('--apply')
const DEPRECATE_FMP = process.argv.includes('--deprecate-fmp')

const GF_CODE = 'gf'
const GF_NAME = 'Google Finance'

type Src = {_id: string; name?: string; code?: string; status?: string}

async function main() {
  const client = sanityClient()

  const sources = await client.fetch<Src[]>(`*[_type == "dataSource"]{_id, name, code, status}`)
  const fmp = sources.find(
    (s) => s.code?.toLowerCase() === 'fmp' || /fmp|financial modeling/i.test(s.name ?? ''),
  )
  let gf = sources.find((s) => s.code?.toLowerCase() === GF_CODE || /google finance/i.test(s.name ?? ''))

  if (!fmp) console.log('⚠ No FMP data source found — will only ensure the GF source + report.')
  else console.log(`FMP source: ${fmp.name} (${fmp._id})`)

  // Companies currently pointing at FMP.
  const affected: {_id: string; name: string}[] = fmp
    ? await client.fetch(`*[_type == "company" && data_source._ref == $id]{_id, name}`, {id: fmp._id})
    : []
  console.log(`GF source: ${gf ? `${gf.name} (${gf._id})` : '(will create)'}`)
  console.log(`Companies to re-point FMP → GF: ${affected.length}`)
  affected.forEach((c) => console.log(`  ${c.name}`))
  if (DEPRECATE_FMP && fmp) console.log(`Will set FMP status → "deprecated".`)

  if (!APPLY) {
    console.log(`\n(dry run — nothing written. Re-run with --apply to write.)`)
    return
  }

  // 1. Ensure the GF source exists.
  if (!gf) {
    const created = await client.create({
      _type: 'dataSource',
      name: GF_NAME,
      code: GF_CODE,
      type: 'api',
      status: 'active',
    })
    gf = {_id: created._id, name: GF_NAME, code: GF_CODE, status: 'active'}
    console.log(`✓ Created "${GF_NAME}" data source (${gf._id}).`)
  }

  // 2. Re-point companies (one transaction).
  if (affected.length) {
    let tx = client.transaction()
    for (const c of affected) {
      tx = tx.patch(c._id, (p) => p.set({data_source: {_type: 'reference', _ref: gf!._id}}))
    }
    await tx.commit()
    console.log(`✓ Re-pointed ${affected.length} companies to "${GF_NAME}".`)
  }

  // 3. Optionally deprecate FMP.
  if (DEPRECATE_FMP && fmp) {
    await client.patch(fmp._id).set({status: 'deprecated'}).commit()
    console.log(`✓ FMP data source set to "deprecated" (hidden from the dropdown).`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
