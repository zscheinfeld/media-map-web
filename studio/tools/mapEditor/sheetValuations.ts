import {useEffect, useState} from 'react'

// === Valuation provider ===================================================
// The editor needs planet sizes, but valuations don't live in Sanity (only
// `manual_valuations` overrides do). For now the editor reads the same public
// Google Sheet the app uses, matched by company name. This is the single swap
// point: when valuations move to Supabase, replace the fetch/parse below with
// a Supabase query and keep the return contract — a map of
// lowercased-company-name → valuation in billions USD.
// ==========================================================================

const SHEET_ID = '1ZVOsVf4fcoh1y08MecBcYtuVWfM54hTP9WVhBDAmgrc'
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += c
      continue
    }
    if (c === '"') {
      inQuotes = true
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

function toNum(s: string | undefined): number | undefined {
  if (!s) return undefined
  const cleaned = s.replace(/[$,\s]/g, '')
  if (!cleaned || /^[a-z]/i.test(cleaned)) return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

function parseValuations(csv: string): Record<string, number> {
  const rows = parseCsv(csv)
  let header: {index: number; name: number; val: number} | null = null
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = rows[i].map((c) => c.trim().toLowerCase())
    const nameCol = r.findIndex((c) => c.includes('company name') || c === 'company' || c === 'name')
    const valCol = r.findIndex((c) => c.startsWith('valuation'))
    if (nameCol >= 0 && valCol >= 0) {
      header = {index: i, name: nameCol, val: valCol}
      break
    }
  }
  if (!header) return {}
  const out: Record<string, number> = {}
  for (let i = header.index + 1; i < rows.length; i++) {
    const name = (rows[i][header.name] ?? '').trim()
    if (!name || /^all companies$/i.test(name) || /^total$/i.test(name)) continue
    const val = toNum(rows[i][header.val])
    if (val === undefined) continue
    out[name.toLowerCase()] = val
  }
  return out
}

/**
 * Live valuations by lowercased company name (from the sheet). `loaded` flips
 * true once the fetch settles (success OR failure) — the caller waits for it
 * before the first layout so planets are sized correctly from frame one
 * (otherwise the sim settles at fallback sizes, then planets resize and overlap).
 */
export function useSheetValuations(): {valuations: Record<string, number>; loaded: boolean} {
  const [valuations, setValuations] = useState<Record<string, number>>({})
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch(SHEET_URL)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`Sheet fetch ${r.status}`))))
      .then((csv) => {
        if (!cancelled) setValuations(parseValuations(csv))
      })
      .catch(() => {
        /* leave empty → planets fall back to manual_valuations / default size */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return {valuations, loaded}
}
