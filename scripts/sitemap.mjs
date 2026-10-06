// Writes public/sitemap.xml from the addresses the app answers to (see
// src/urlState.ts). Runs before each build, so a new year appears on its own.
import { writeFileSync } from "node:fs";

const SITE = "https://map.eshap.tv";
const START_YEAR = 2015; // keep in step with src/historical.ts
const VIEWS = ["map", "linear", "aggregate", "list"];
const currentYear = new Date().getFullYear();
const today = new Date().toISOString().slice(0, 10);

const paths = ["/", "/linear", "/aggregate", "/list", "/time-machine", "/about", "/about/downloads"];
for (let y = START_YEAR; y <= currentYear; y++) {
  paths.push(`/time-machine/${y}`);
  if (y !== currentYear) for (const v of VIEWS) paths.push(`/${v}/${y}`);
}
const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  paths
    .map((p) => `  <url>\n    <loc>${SITE}${p}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p === "/" ? "daily" : "weekly"}</changefreq>\n  </url>`)
    .join("\n") +
  `\n</urlset>\n`;
writeFileSync(new URL("../public/sitemap.xml", import.meta.url), xml);
console.log(`sitemap: ${paths.length} addresses`);
