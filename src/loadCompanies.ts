import { normSector } from "./sectors";

export type SheetCompany = {
  name: string;
  valuation_b: number;
  sector: string;
  planetSize?: number;
};

const SHEET_ID = "1ZVOsVf4fcoh1y08MecBcYtuVWfM54hTP9WVhBDAmgrc";
const GID = "0";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { row.push(cell); cell = ""; continue; }
    if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    if (c === "\r") continue;
    cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function findHeaderRow(rows: string[][]): { index: number; map: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = rows[i].map(c => c.trim().toLowerCase());
    const nameCol = r.findIndex(c => c.includes("company name") || c === "company" || c === "name");
    const valCol = r.findIndex(c => c.startsWith("valuation"));
    if (nameCol >= 0 && valCol >= 0) {
      const sectorCol = r.findIndex(c => c === "sector" || c === "category");
      const sizeCol = r.findIndex(c => c === "planet size" || c === "planet_size");
      return {
        index: i,
        map: { name: nameCol, val: valCol, sector: sectorCol, size: sizeCol },
      };
    }
  }
  return null;
}

function toNum(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const cleaned = s.replace(/[$,\s]/g, "");
  if (!cleaned || /^[a-z]/i.test(cleaned)) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

export async function loadCompanies(): Promise<SheetCompany[]> {
  const res = await fetch(SHEET_URL);
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  const csv = await res.text();
  const rows = parseCsv(csv);
  const header = findHeaderRow(rows);
  if (!header) throw new Error("Could not find header row in sheet (need COMPANY NAME + VALUATION columns).");

  const { map } = header;
  const out: SheetCompany[] = [];
  const seen = new Set<string>();
  for (let i = header.index + 1; i < rows.length; i++) {
    const r = rows[i];
    const name = (r[map.name] ?? "").trim();
    if (!name) continue;
    // Skip aggregate / footer rows.
    if (/^all companies$/i.test(name)) continue;
    if (/^total$/i.test(name)) continue;
    const val = toNum(r[map.val]);
    if (val === undefined) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const sector = normSector(map.sector >= 0 ? r[map.sector] : undefined);
    const planetSize = map.size >= 0 ? toNum(r[map.size]) : undefined;
    out.push({ name, valuation_b: val, sector, planetSize });
  }
  return out;
}
