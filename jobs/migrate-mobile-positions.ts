// One-time migration: move the SQUARE mobile layout out of code (src/mobileLayout.ts
// → MOBILE_LAYOUTS.square) and into Sanity.
//   • square planet positions → company/entity.mobile_position_overrides (one
//     undated, pinned entry each — the same positionOverride shape as desktop)
//   • square sector centers    → sector.mobile_center {x, y}
// Matches by NAME (case-insensitive), routing a name to a company or an entity.
// Idempotent: re-running overwrites, never appends duplicates. DRY RUN by default;
// pass --apply to write.
//   npm run migrate-mobile-positions            # dry run
//   npm run migrate-mobile-positions -- --apply # write
import {randomBytes} from 'node:crypto'
import {sanityClient, fetchRoster} from './lib.ts'
import {MOBILE_LAYOUTS} from '../src/mobileLayout.ts'

const APPLY = process.argv.includes('--apply')
const key = () => randomBytes(6).toString('hex')
const norm = (s: string) => s.trim().toLowerCase()
type Hit = {id: string; name: string; x: number; y: number}

async function main() {
  const client = sanityClient()
  const roster = await fetchRoster(client)
  const entities = await client.fetch<{_id: string; name: string}[]>(
    `*[_type=="entity" && !(_id in path("drafts.**"))]{_id, name}`,
  )
  const sectors = await client.fetch<{_id: string; name: string}[]>(
    `*[_type=="sector" && !(_id in path("drafts.**"))]{_id, name}`,
  )
  const sq = MOBILE_LAYOUTS.square

  const compByName = new Map(roster.map((c) => [norm(c.name), c]))
  const entByName = new Map(entities.map((e) => [norm(e.name), e]))
  const compSet: Hit[] = []
  const entSet: Hit[] = []
  const posMiss: string[] = []
  for (const [name, pos] of Object.entries(sq.positions)) {
    const xy = {name, x: Math.round(pos.x), y: Math.round(pos.y)}
    const c = compByName.get(norm(name))
    if (c) { compSet.push({id: c._id, ...xy}); continue }
    const e = entByName.get(norm(name))
    if (e) { entSet.push({id: e._id, ...xy}); continue }
    posMiss.push(name)
  }

  const secByName = new Map(sectors.map((s) => [norm(s.name), s]))
  const secSet: Hit[] = []
  const secMiss: string[] = []
  for (const [name, ctr] of Object.entries(sq.sectorCenters)) {
    const s = secByName.get(norm(name))
    if (!s) { secMiss.push(name); continue }
    secSet.push({id: s._id, name, x: Math.round(ctr.x), y: Math.round(ctr.y)})
  }

  console.log(`Companies: ${compSet.length} → mobile_position_overrides`)
  console.log(`Entities:  ${entSet.length} → mobile_position_overrides`)
  console.log(`Sectors:   ${secSet.length} → mobile_center` + (secMiss.length ? `  ⚠ unmatched: ${secMiss.join(', ')}` : ''))
  if (posMiss.length) console.log(`⚠ Positions with no matching company or entity: ${posMiss.join(', ')}`)

  if (!APPLY) { console.log('\n(dry run — nothing written. Re-run with --apply.)'); return }

  const posEntry = (h: Hit) => [{_key: key(), _type: 'positionOverride', x: h.x, y: h.y, pin: true}]
  let tx = client.transaction()
  for (const h of [...compSet, ...entSet]) tx = tx.patch(h.id, (p) => p.set({mobile_position_overrides: posEntry(h)}))
  for (const s of secSet) tx = tx.patch(s.id, (p) => p.set({mobile_center: {x: s.x, y: s.y}}))
  await tx.commit()
  console.log(`\n✓ Wrote ${compSet.length} company + ${entSet.length} entity positions + ${secSet.length} sector centers to Sanity.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
