// Runs after `vite build`. Two things crawlers need that a JavaScript app
// doesn't give them on its own:
//   1. Real text in the HTML: the About copy and an index of the companies by
//      sector (from the build-time snapshots), in a visually hidden block that
//      the app leaves alone. Same content the site shows; nothing a reader sees.
//   2. One HTML file per address (dist/about.html, dist/map/2020.html …) with
//      its own title, description, canonical and og:url. Netlify's pretty URLs
//      serve `about.html` at /about without a redirect (a directory with an
//      index.html would 301 to /about/, changing the app's addresses), and a
//      real file wins over the SPA fallback, so /about gets its own headline.
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const indexPath = join(dist, "index.html");
if (!existsSync(indexPath)) {
  console.warn("prerender: dist/index.html missing — skipped");
  process.exit(0);
}
let html = readFileSync(indexPath, "utf8");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const plain = (s) => String(s).replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();

// ---- 1. the hidden content block ------------------------------------------
const snapPath = join(root, "public", "sanity-snapshot.json");
const snap = existsSync(snapPath) ? JSON.parse(readFileSync(snapPath, "utf8")) : null;
const valPath = join(root, "public", "valuations-snapshot.csv");
const latest = new Map(); // slug -> $B
if (existsSync(valPath)) {
  const rows = readFileSync(valPath, "utf8").split(/\r?\n/).map((l) => l.split(","));
  const h = rows.findIndex((r) => r[0] === "Slug");
  if (h >= 0) {
    const years = rows[h].map((c, i) => ({c: c.trim(), i})).filter(({c}) => /^\d{4}$/.test(c));
    const cur = years.reduce((a, b) => (Number(b.c) > Number(a.c) ? b : a));
    for (const r of rows.slice(h + 1)) {
      const v = Number(r[cur.i]);
      if (r[0] && Number.isFinite(v) && v > 0) latest.set(r[0], v);
    }
  }
}
const fmt = (b) => (b >= 1000 ? `$${(b / 1000).toFixed(2)}T` : b >= 1 ? `$${b.toFixed(b >= 100 ? 0 : 1)}B` : `$${Math.round(b * 1000)}M`);
let block = "";
if (snap) {
  const companies = (snap.companies ?? []).filter((c) => c?.name && c?.sector?.name);
  const bySector = new Map();
  for (const c of companies) (bySector.get(c.sector.name) ?? bySector.set(c.sector.name, []).get(c.sector.name)).push(c);
  const sectors = [...bySector.keys()].sort();
  block += `<div id="mm-seo" class="sr-only" aria-hidden="true">\n`;
  block += `<h2>About the Media Universe map</h2>\n`;
  for (const s of snap.about?.sections ?? []) {
    for (const b of s.blocks ?? []) {
      if (b._type === "aboutSectionHeader" && b.text) block += `<h3>${esc(plain(b.text))}</h3>\n`;
      else if (b._type === "aboutBody" && b.text) for (const para of String(b.text).split(/\n\s*\n/)) if (para.trim()) block += `<p>${esc(plain(para))}</p>\n`;
    }
  }
  block += `<h2>${companies.length} companies in ${sectors.length} sectors</h2>\n`;
  for (const s of sectors) {
    const list = bySector.get(s).sort((a, b) => (latest.get(b.slug) ?? 0) - (latest.get(a.slug) ?? 0));
    block += `<h3>${esc(s)}</h3>\n<ul>\n` + list.map((c) => `<li>${esc(c.name)}${latest.has(c.slug) ? ` (${fmt(latest.get(c.slug))})` : ""}</li>`).join("\n") + `\n</ul>\n`;
  }
  block += `</div>\n`;
  html = html.replace("</body>", block + "</body>");
  writeFileSync(indexPath, html);
  console.log(`prerender: content block with ${companies.length} companies in ${sectors.length} sectors`);
} else {
  console.warn("prerender: no sanity snapshot — content block skipped");
}

// ---- 2. one HTML file per address ------------------------------------------
const SITE = "https://map.eshap.tv";
const SHORT = "ESHAP Media Universe";
const START_YEAR = 2015;
const VIEWS = {map: "Map", linear: "Linear", aggregate: "Aggregate", list: "List"};
const currentYear = new Date().getFullYear();
const pages = [];
pages.push(["/linear", `Linear · ${SHORT}`, "Evan Shapiro's Media Universe, lined up: every media and tech company as a planet sorted by market value, largest to smallest."]);
pages.push(["/aggregate", `Aggregate · ${SHORT}`, "The media universe year by year: the combined market value of media and tech companies since 2015, stacked by company, from Evan Shapiro's Media Universe map."]);
pages.push(["/list", `List · ${SHORT}`, "Every company on Evan Shapiro's Media Universe map as a table: sector, market value, all-time high and low."]);
pages.push(["/time-machine", `Time Machine · ${SHORT}`, "Travel the media universe back to 2015: Evan Shapiro's Media Universe map for every year, side by side."]);
pages.push(["/about", `About · ${SHORT}`, "About Evan Shapiro's Media Universe map: what it shows, how the companies are measured, and the methodology behind the planets."]);
pages.push(["/about/downloads", `Downloads · ${SHORT}`, "Download Evan Shapiro's Media Universe map as a high-resolution image, and find the full analysis on Substack."]);
for (let y = START_YEAR; y <= currentYear; y++) {
  pages.push([`/time-machine/${y}`, `Time Machine ${y} · ${SHORT}`, `The ${y} media universe in Evan Shapiro's Time Machine: that year's map of media and tech companies by market value.`]);
  if (y !== currentYear) for (const [v, label] of Object.entries(VIEWS)) pages.push([`/${v}/${y}`, `${y} ${label} · ${SHORT}`, `Evan Shapiro's Media Universe map as it stood in ${y}: media and tech companies drawn as planets sized by that year's market value.`]);
}
const title = /<title>[^<]*<\/title>/;
const desc = /<meta name="description" content="[^"]*" \/>/;
const canon = /<link rel="canonical" href="[^"]*" \/>/;
const ogUrl = /<meta property="og:url" content="[^"]*" \/>/;
const ogTitle = /<meta property="og:title" content="[^"]*" \/>/;
const twTitle = /<meta name="twitter:title" content="[^"]*" \/>/;
let n = 0;
for (const [path, t, d] of pages) {
  const page = html
    .replace(title, `<title>${esc(t)}</title>`)
    .replace(desc, `<meta name="description" content="${esc(d)}" />`)
    .replace(canon, `<link rel="canonical" href="${SITE}${path}" />`)
    .replace(ogUrl, `<meta property="og:url" content="${SITE}${path}" />`)
    .replace(ogTitle, `<meta property="og:title" content="${esc(t)}" />`)
    .replace(twTitle, `<meta name="twitter:title" content="${esc(t)}" />`);
  const out = join(dist, `${path}.html`);
  mkdirSync(dirname(out), {recursive: true});
  writeFileSync(out, page);
  n++;
}
console.log(`prerender: ${n} address pages written`);
