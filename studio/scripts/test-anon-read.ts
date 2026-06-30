/**
 * Diagnostic: does a TOKEN-created document become readable by an ANONYMOUS
 * reader on this dataset? Creates a throwaway company with the token, then
 * queries it back with NO token (a true anonymous read), reports, and deletes it.
 *
 * Tells us whether `import --reset` (which recreates docs via the token) would
 * fix the "anonymous can't see imported companies" problem, or whether it's a
 * deeper access-control issue.
 *
 * Run: `npm run test-anon-read` (from studio/).
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
  console.error('Missing config. Set SANITY_STUDIO_PROJECT_ID and SANITY_AUTH_TOKEN.')
  process.exit(1)
}

const client = createClient({projectId, dataset, token, apiVersion: '2024-01-01', useCdn: false})

// Anonymous read: plain fetch, NO Authorization header.
async function anonCount(filter: string): Promise<number> {
  const url =
    `https://${projectId}.api.sanity.io/v2024-01-01/data/query/${dataset}` +
    `?query=${encodeURIComponent(`count(*[${filter}])`)}`
  const res = await fetch(url)
  const json = (await res.json()) as {result: number}
  return json.result
}

async function main() {
  const id = 'company.zz-token-anon-test'
  console.log('Creating a throwaway company with the token…')
  await client.createOrReplace({
    _id: id,
    _type: 'company',
    name: 'ZZ Token Anon Test',
    slug: {_type: 'slug', current: 'zz-token-anon-test'},
  })

  await new Promise((r) => setTimeout(r, 1500)) // let it index

  const seesTest = await anonCount(`_id == "${id}"`)
  const seesAllCompanies = await anonCount(`_type == "company"`)

  console.log('\n--- Anonymous read test ---')
  console.log(`Token-created test doc visible to anonymous:  ${seesTest}  (1 = yes, 0 = no)`)
  console.log(`Total companies visible to anonymous:         ${seesAllCompanies}`)
  console.log(
    seesTest === 1
      ? '\n=> Token-created docs ARE anonymously readable. `npm run import -- --reset` should fix everything.'
      : '\n=> Even a fresh token-created doc is NOT anonymously readable. This is an ACCESS-CONTROL issue (a grant / role), not staleness — check the project Access settings.',
  )

  console.log('\nCleaning up the throwaway doc…')
  await client.delete(id)
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
