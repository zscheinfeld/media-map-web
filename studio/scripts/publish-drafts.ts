/**
 * Publish every draft document in the dataset.
 *
 * Why this exists: the public read API (the Vite app, anonymous, no token) only
 * returns PUBLISHED documents. If content was authored/imported but left as
 * drafts, the Studio can see it but the public site can't. This promotes each
 * draft to its published id so the public read picks it up.
 *
 * For each `drafts.<id>` it creates/replaces the published `<id>` from the draft
 * body and deletes the draft. Idempotent: re-running with no drafts is a no-op.
 *
 * Run: `npm run publish-drafts` (from studio/). Needs SANITY_AUTH_TOKEN (Editor)
 * + SANITY_STUDIO_PROJECT_ID in studio/.env — same as the import script.
 */
import {createClient} from '@sanity/client'

// Load studio/.env into process.env (tsx does not do this automatically).
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

// `perspective: 'raw'` so the query returns drafts with their real `drafts.*`
// ids (instead of overlaying/stripping them).
const client = createClient({projectId, dataset, token, apiVersion: '2024-01-01', useCdn: false, perspective: 'raw'})

type AnyDoc = {_id: string; _rev?: string; _createdAt?: string; _updatedAt?: string; [k: string]: unknown}

async function main() {
  const drafts = await client.fetch<AnyDoc[]>('*[_id in path("drafts.**")]')
  console.log(`Found ${drafts.length} draft document(s) in ${dataset}.`)
  if (drafts.length === 0) {
    console.log('Nothing to publish — every document is already published.')
    return
  }

  let published = 0
  for (let i = 0; i < drafts.length; i += 50) {
    const tx = client.transaction()
    for (const d of drafts.slice(i, i + 50)) {
      const publishedId = d._id.replace(/^drafts\./, '')
      // Strip system fields; set the published id.
      const {_id, _rev, _createdAt, _updatedAt, ...body} = d
      void _id
      void _rev
      void _createdAt
      void _updatedAt
      tx.createOrReplace({...(body as Record<string, unknown>), _id: publishedId} as never)
      tx.delete(d._id)
    }
    await tx.commit()
    published += Math.min(50, drafts.length - i)
    console.log(`  published ${published}/${drafts.length}…`)
  }

  console.log(`\nDone. Published ${drafts.length} document(s). The public read should now see them.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
