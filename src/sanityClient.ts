// Read-only Sanity access for the public app. Uses Sanity's public query HTTP
// API directly via `fetch` — no `@sanity/client` dependency and no auth, since
// the dataset is read publicly. Reads hit the CDN host for cached responses.
//
// Configure with Vite env vars (e.g. in a `.env.local`):
//   VITE_SANITY_PROJECT_ID=...        (from studio/sanity.config.ts)
//   VITE_SANITY_DATASET=production     (optional, defaults to "production")
//   VITE_SANITY_API_VERSION=2024-01-01 (optional)
//
// When VITE_SANITY_PROJECT_ID is unset the app falls back to the Google Sheet
// (see the data source switch in MediaMap), so this is safe to ship before the
// project is configured.

const PROJECT_ID = import.meta.env.VITE_SANITY_PROJECT_ID as string | undefined
const DATASET = (import.meta.env.VITE_SANITY_DATASET as string | undefined) ?? "production"
const API_VERSION = (import.meta.env.VITE_SANITY_API_VERSION as string | undefined) ?? "2024-01-01"
// Optional read-only (Viewer) token. Needed when documents created via the API
// token (e.g. the importer) aren't anonymously readable — an authenticated read
// sees all published docs. NOTE: this token ships in the client bundle, so use a
// Viewer (read-only) token and only on a dataset whose data is meant to be public.
const READ_TOKEN = import.meta.env.VITE_SANITY_READ_TOKEN as string | undefined

/** Whether a Sanity project is configured (else the app uses the sheet). */
export function isSanityConfigured(): boolean {
  return !!PROJECT_ID
}

/** Run a GROQ query against the public read API and return its `result`. */
export async function sanityQuery<T>(groq: string): Promise<T> {
  if (!PROJECT_ID) {
    throw new Error("Sanity is not configured (VITE_SANITY_PROJECT_ID is unset).")
  }
  // Use the live API host (not the `apicdn` CDN). The CDN is eventually
  // consistent and was serving a stale empty result here; the live host is
  // always fresh. For a read on page load the rate limits are fine. (Switch to
  // `apicdn` for higher-traffic caching once the data is stable.)
  //
  // `perspective=published` is REQUIRED for deterministic reads: without it the
  // authenticated (token) read returns the raw dataset including `drafts.*`,
  // which made the map flip between the published layout and unpublished draft
  // edits across refreshes. The public site should only ever show published
  // content, so we pin the perspective here.
  const url =
    `https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}` +
    `?perspective=published&query=${encodeURIComponent(groq)}`
  const res = await fetch(url, READ_TOKEN ? {headers: {Authorization: `Bearer ${READ_TOKEN}`}} : undefined)
  if (!res.ok) throw new Error(`Sanity query failed: ${res.status}`)
  const json = (await res.json()) as {result: T}
  return json.result
}
