/**
 * Re-write (no-op `createOrReplace`) every published company / sector /
 * connection document. Content is preserved — this just re-mutates each doc so
 * it re-enters the anonymous (public) read index. Needed because docs imported
 * before the dataset was effectively public don't show up for anonymous readers
 * until they're touched again (a freshly-created doc shows up immediately).
 *
 * Run: `npm run republish-all` (from studio/). Needs SANITY_AUTH_TOKEN (Editor)
 * + SANITY_STUDIO_PROJECT_ID in studio/.env.
 */
import {createClient} from '@sanity/client'

try {
  ;(process as {loadEnvFile?: (path?: string) => void}).loadEnvFile?.('.env')
} catch {
  // rely on already-exported env vars
}

const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production'
const token = process.env.SANITY_AUTH_TOKEN

if (!projectId || !token) {
  console.error('Missing config. Set SANITY_STUDIO_PROJECT_ID (or SANITY_PROJECT_ID) and SANITY_AUTH_TOKEN.')
  process.exit(1)
}

const client = createClient({projectId, dataset, token, apiVersion: '2024-01-01', useCdn: false})

const TYPES = ['company', 'sector', 'connection', 'entity', 'mapSettings', 'dataSource']

type AnyDoc = {_id: string; _rev?: string; [k: string]: unknown}

async function main() {
  // Published docs only (exclude drafts; `createOrReplace` writes the published id).
  const docs = await client.fetch<AnyDoc[]>('*[_type in $types && !(_id in path("drafts.**"))]', {
    types: TYPES,
  })
  console.log(`Re-publishing ${docs.length} document(s) in ${dataset}…`)
  if (docs.length === 0) return

  let done = 0
  for (let i = 0; i < docs.length; i += 50) {
    const tx = client.transaction()
    for (const d of docs.slice(i, i + 50)) {
      const {_rev, ...doc} = d
      void _rev
      tx.createOrReplace(doc as never)
    }
    await tx.commit()
    done += Math.min(50, docs.length - i)
    console.log(`  ${done}/${docs.length}…`)
  }

  console.log(`\nDone. Re-published ${docs.length} document(s). The anonymous read should now see them.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
