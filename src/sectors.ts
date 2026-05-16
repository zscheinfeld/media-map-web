// Canvas bounding box in slide-coord space — drives the SVG viewBox and the
// physics bounds. Two layouts: a wide landscape canvas for desktop, and a
// portrait canvas for mobile so planets fill a vertical viewport.
export const CANVAS_DESKTOP = { x: -1875, y: -1253, w: 5052, h: 3279 };
export const CANVAS_MOBILE = { x: -1200, y: -2500, w: 2400, h: 5000 };

// Sector → canvas position (slide-coord space). These are the "gravity wells"
// the physics simulation pulls each sector's planets toward.
//
// Edit these positions to relocate a sector on the map. Sector names below
// match the values in the SECTOR column of the Google Sheet (case-insensitive
// match — see `lookupSectorCenter`).
// Canvas spans x: -1875 → 3177, y: -1253 → 2026 (center ≈ 688, 386).
// Sector centers are distributed so the visual centroid sits near (688, 386).
export const SECTOR_CENTERS: Record<string, { x: number; y: number }> = {
  // Top band (y ≈ -700)
  "Telecom":           { x: -1300, y: -700 },
  "Local TV":          { x:  -400, y: -700 },
  "Hardware/Physical": { x:  1600, y: -700 },

  // Upper-middle band (y ≈ -200)
  "PSM":               { x: -1200, y: -150 },
  "Content Platform":  { x:  -300, y: -150 },
  "Studio":            { x:   600, y: -100 },
  "MVPD/BB":           { x:  1500, y: -150 },

  // Center band (y ≈ 350) — Large Cap dominates the middle since its planets are huge.
  "HoldingCo":         { x: -1300, y:  350 },
  "Advertising":       { x:  -400, y:  350 },
  "Large Cap":         { x:   650, y:  350 },
  "Sports Leagues":    { x:  2000, y:  350 },

  // Lower-middle band (y ≈ 900)
  "Publishing":        { x: -1300, y:  900 },
  "Audio":             { x:  -400, y:  900 },
  "Gaming":            { x:  1500, y:  900 },
  "Exhibition":        { x:  2500, y:  900 },

  // Bottom band (y ≈ 1450)
  "Social/Creator":    { x:  -400, y: 1450 },
  "AI":                { x:  1800, y: 1450 },

  "Uncategorized":     { x:   688, y:  386 },
};

// Mobile sector centers — two-column grid arranged top-to-bottom inside
// CANVAS_MOBILE. Large Cap sits solo on its center row since its planets
// (Apple, etc.) are large and need vertical clearance from the side rows.
//
// X positions are pushed near the canvas edges (±900 in a 2400-wide canvas)
// so that with `xMidYMid slice` the side-column planets extend visually to the
// edges of the phone screen. Y range is kept inside [-1900, 1900] so the top
// and bottom rows aren't clipped on common phone aspect ratios.
export const SECTOR_CENTERS_MOBILE: Record<string, { x: number; y: number }> = {
  "Telecom":           { x: -900, y: -1900 },
  "MVPD/BB":           { x:  900, y: -1900 },

  "Local TV":          { x: -900, y: -1525 },
  "Content Platform":  { x:  900, y: -1525 },

  "PSM":               { x: -900, y: -1150 },
  "Studio":            { x:  900, y: -1150 },

  "HoldingCo":         { x: -900, y:  -775 },
  "Advertising":       { x:  900, y:  -775 },

  "Large Cap":         { x:    0, y:     0 },

  "Publishing":        { x: -900, y:   775 },
  "Audio":             { x:  900, y:   775 },

  "Sports Leagues":    { x: -900, y:  1150 },
  "Gaming":            { x:  900, y:  1150 },

  "Exhibition":        { x: -900, y:  1525 },
  "Hardware/Physical": { x:  900, y:  1525 },

  "Social/Creator":    { x: -900, y:  1900 },
  "AI":                { x:  900, y:  1900 },

  "Uncategorized":     { x:    0, y:     0 },
};

// Stable color per sector (HSL hue). Anything not listed gets a hash-derived hue.
export const SECTOR_HUES: Record<string, number> = {
  "Large Cap":          210,
  "Studio":             280,
  "Content Platform":   195,
  "MVPD/BB":            170,
  "Local TV":           150,
  "PSM":                100,
  "Telecom":            190,
  "Sports Leagues":      30,
  "Gaming":             260,
  "Social/Creator":     320,
  "Publishing":          50,
  "Audio":              130,
  "Advertising":         80,
  "HoldingCo":          340,
  "Exhibition":          10,
  "AI":                 240,
  "Hardware/Physical":  200,
  "Uncategorized":        0,
};

// Build a case-insensitive lookup so "telecom"/"TELECOM"/"Telecom" all match.
const centersByLower = new Map<string, { x: number; y: number }>();
const mobileCentersByLower = new Map<string, { x: number; y: number }>();
const huesByLower = new Map<string, number>();
const canonicalByLower = new Map<string, string>();
for (const k of Object.keys(SECTOR_CENTERS)) {
  centersByLower.set(k.toLowerCase(), SECTOR_CENTERS[k]);
  canonicalByLower.set(k.toLowerCase(), k);
}
for (const k of Object.keys(SECTOR_CENTERS_MOBILE)) {
  mobileCentersByLower.set(k.toLowerCase(), SECTOR_CENTERS_MOBILE[k]);
}
for (const k of Object.keys(SECTOR_HUES)) {
  huesByLower.set(k.toLowerCase(), SECTOR_HUES[k]);
}

export function normSector(s: string | undefined): string {
  const t = (s ?? "").trim();
  if (!t) return "Uncategorized";
  // If it matches a known sector (case-insensitive), return the canonical form
  // so positions and colors line up.
  return canonicalByLower.get(t.toLowerCase()) ?? t;
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function hueForSector(sector: string): number {
  return huesByLower.get(sector.toLowerCase()) ?? hashHue(sector);
}

export function isKnownSector(sector: string): boolean {
  return centersByLower.has(sector.toLowerCase());
}

/**
 * Resolve a sector center. Unknown sectors get auto-placed on a ring around
 * the canvas center, ordered by `index` so positions stay stable across renders.
 */
export function sectorCenterFor(
  sector: string,
  index: number,
  totalUnknown: number,
  mobile = false,
): { x: number; y: number } {
  const centers = mobile ? mobileCentersByLower : centersByLower;
  const known = centers.get(sector.toLowerCase());
  if (known) return known;
  const angle = (index / Math.max(1, totalUnknown)) * Math.PI * 2;
  if (mobile) {
    const radius = 900;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  }
  const radius = 1400;
  return {
    x: 688 + Math.cos(angle) * radius,
    y: 386 + Math.sin(angle) * radius,
  };
}
