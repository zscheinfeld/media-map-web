// Shared helpers for the data jobs (Sanity client, roster fetch, CSV, env).
import {createClient, type SanityClient} from '@sanity/client'

// Load jobs/.env into process.env (Node 20.6+). tsx does not do this for us.
try {
  ;(process as {loadEnvFile?: (path?: string) => void}).loadEnvFile?.('.env')
} catch {
  // fall back to already-exported env vars
}

export const FMP_API_KEY = process.env.FMP_API_KEY ?? ''

const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_DATASET || 'production'
const token = process.env.SANITY_AUTH_TOKEN

/** Authenticated Sanity client (needs an Editor token for writes). */
export function sanityClient(): SanityClient {
  if (!projectId) throw new Error('Missing SANITY_PROJECT_ID — copy it into jobs/.env from studio/.env.')
  return createClient({projectId, dataset, token, apiVersion: '2024-01-01', useCdn: false})
}

export type ValuationType = 'market_cap' | 'fundraising_valuation' | 'yearly_revenue'

export type Company = {
  _id: string
  name: string
  slug?: string
  ticker?: string
  is_public?: boolean
  valuation_type?: ValuationType
  sector?: string
  /** "api" | "manual" — the referenced data source's type. "manual" means the
   *  client fills this company by hand, so the ingest skips FMP for it. */
  dataSourceType?: string
  /** The data source's display name, e.g. "companiesmarketcap.com" — written into
   *  the sheet's "data entry method" column so the source is visible there. */
  dataSourceName?: string
}

/** Every company in Sanity, with the fields the jobs care about. */
export async function fetchRoster(client: SanityClient): Promise<Company[]> {
  return client.fetch<Company[]>(
    `*[_type == "company"]{_id, name, "slug": slug.current, ticker, is_public, valuation_type, "sector": sector->name, "dataSourceType": data_source->type, "dataSourceName": data_source->name} | order(name asc)`,
  )
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Serialize a 2D array to CSV text (quotes cells containing comma/quote/newline). */
export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map((r) => r.map(esc).join(',')).join('\n')
}

/** Minimal CSV parser (handles quoted cells + escaped quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else q = false
      } else cell += c
      continue
    }
    if (c === '"') {
      q = true
      continue
    }
    if (c === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (c === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    if (c === '\r') continue
    cell += c
  }
  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}
