// Writes public/sanity-snapshot.json: the Sanity docs the site reads (sectors,
// companies, connections, entities, map settings, the About copy) as they are
// at build time. The app paints from this same-origin file first and then
// upgrades to the live read, so first paint needs no cross-origin request —
// and a crawler that renders the page sees the real map. Runs before each
// build; without Sanity credentials it leaves any existing snapshot alone.
import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {ABOUT_Q, COMPANIES_Q, CONNECTIONS_Q, ENTITIES_Q, SECTORS_Q, SETTINGS_Q} from "../src/sanityQueries.js";

// Netlify sets these in the build environment; locally they live in .env.local.
const envFile = new URL("../.env.local", import.meta.url);
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const PROJECT = process.env.VITE_SANITY_PROJECT_ID;
const DATASET = process.env.VITE_SANITY_DATASET || "production";
const TOKEN = process.env.VITE_SANITY_READ_TOKEN;
const OUT = new URL("../public/sanity-snapshot.json", import.meta.url);

if (!PROJECT) {
  console.warn("sanity snapshot: VITE_SANITY_PROJECT_ID unset — skipped");
  process.exit(0);
}
const query = async (groq) => {
  const url = `https://${PROJECT}.api.sanity.io/v2024-01-01/data/query/${DATASET}?perspective=published&query=${encodeURIComponent(groq)}`;
  const res = await fetch(url, TOKEN ? {headers: {Authorization: `Bearer ${TOKEN}`}} : undefined);
  if (!res.ok) throw new Error(`Sanity ${res.status} for ${groq.slice(0, 40)}…`);
  return (await res.json()).result;
};
try {
  const [sectors, companies, connections, entities, settings, about] = await Promise.all(
    [SECTORS_Q, COMPANIES_Q, CONNECTIONS_Q, ENTITIES_Q, SETTINGS_Q, ABOUT_Q].map(query),
  );
  if (!Array.isArray(companies) || companies.length === 0) throw new Error("no companies in the result");
  const snap = {generatedAt: new Date().toISOString(), sectors, companies, connections, entities, settings, about};
  writeFileSync(OUT, JSON.stringify(snap));
  console.log(`sanity snapshot: ${companies.length} companies, ${sectors.length} sectors, ${connections.length} connections, ${entities.length} entities`);
} catch (e) {
  console.warn(`sanity snapshot: ${e instanceof Error ? e.message : e} — ${existsSync(OUT) ? "keeping the previous snapshot" : "no snapshot written"}`);
}
