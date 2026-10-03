// Baked-in layout-lab preset. When this is non-null, every visitor gets the map
// laid out with it (no ?layout=1 needed), layered on top of Sanity — that is how
// a tuned layout gets shown on a deploy preview. Paste the JSON from the panel's
// "Copy JSON" button here to bake one (drop its `resolved` block — that part is
// only a record of the full values for the eventual Sanity migration).
//
// `null` = no override: layout comes from Sanity exactly as on the live site.

import type { LayoutLabState } from "./layoutLab";

// Tuned on the 2026 map, 2026-10-03. Type stays a fixed px size (no scaling
// with the window); the layout itself is locked so resizing never reshuffles.
export const LAYOUT_PRESET: Partial<LayoutLabState> | null = {
  "seed": 200,
  "seeds": {
    "desktop": 211
  },
  "lockLayout": true,
  "scaleType": false,
  "minTypePx": 0,
  "knobs": {
    "desktop": {
      "sizeSpacing": 0.07,
      "sectorPull": 0,
      "repulsion": 168,
      "gapFill": 0.4,
      "gapMin": 185,
      "centerPull": 0.004,
      "labelLargePx": 12,
      "labelSmallPx": 9,
      "labelStrokePx": 1.2,
      "zoomTypeGrowth": 0.36,
      "zoomTypeMax": 2
    },
    "square": {
      "packingDensity": 0.23,
      "collidePadding": 50,
      "sectorPull": 0.01,
      "repulsion": 300,
      "centerPull": 0,
      "gapFill": 0.4,
      "gapMin": 120,
      "labelLargePx": 10.5,
      "nameThreshold": 4,
      "nameSpacing": 5,
      "zoomTypeGrowth": 0.04
    },
    "full": {
      "nameThreshold": 0,
      "nameSpacing": 7,
      "zoomTypeGrowth": 0.05,
      "zoomTypeMax": 1.7
    }
  },
  "fullFollowsDesktop": true,
  "tablet": {
    "labelLargePx": 9.5,
    "labelSmallPx": 8,
    "nameThreshold": 0,
    "nameSpacing": 7
  },
  "tabletMaxWidth": 1250,
  "positions": {
    "desktop": {
      "META": [{ "from": 2026, "x": -481, "y": 1875, "pin": true }],
      "Nvidia": [{ "from": 2026, "x": 1850, "y": 33, "pin": true }],
      "Space X": [{ "from": 2026, "x": 2526, "y": 1483, "pin": true }],
      "Open AI": [{ "from": 2026, "x": 1834, "y": 1933, "pin": true }],
      "Microsoft": [{ "from": 2026, "x": 1175, "y": 1323, "pin": true }],
      "Amazon": [{ "from": 2026, "x": 825, "y": -969, "pin": true }],
      "Disney": [{ "from": 2026, "x": 201, "y": 202, "pin": true }],
      "Fubo": [{ "from": 2026, "x": 201, "y": -61, "pin": true }],
      "NFL": [{ "from": 2026, "clear": true }],
      "Artémis": [{ "from": 2026, "clear": true }],
      "Hearst": [{ "from": 2026, "clear": true }]
    },
    "square": {
      "Space X": [{ "from": 2026, "x": 1747, "y": 1809, "pin": true }],
      "Open AI": [{ "from": 2026, "x": 1624, "y": 1130, "pin": true }],
      "Microsoft": [{ "from": 2026, "x": 693, "y": 1942, "pin": true }]
    },
    "full": {}
  },
  "sectors": {
    "desktop": {
      "PSM": [{ "from": 2026, "x": -1670, "y": 246 }],
      "Publishing": [{ "from": 2026, "x": -1110, "y": 1245 }],
      "HoldingCo": [{ "from": 2026, "x": -477, "y": 175 }],
      "Studio": [{ "from": 2026, "x": -182, "y": -167 }],
      "Content Platform": [{ "from": 2026, "x": 411, "y": -229 }],
      "Exhibition": [{ "from": 2026, "x": 67, "y": 531 }],
      "Social/Creator": [{ "from": 2026, "x": -497, "y": 1092 }],
      "Hardware/Physical": [{ "from": 2026, "x": 375, "y": 291 }],
      "Audio": [{ "from": 2026, "x": -744, "y": 836 }],
      "Advertising": [{ "from": 2026, "x": -995, "y": 461 }],
      "Local TV": [{ "from": 2026, "x": -429, "y": -629 }],
      "MVPD/BB": [{ "from": 2026, "x": 93, "y": -546 }],
      "Gaming": [{ "from": 2026, "x": 989, "y": -295 }],
      "Sports Leagues": [{ "from": 2026, "x": 793, "y": 441 }]
    },
    "square": {
      "Sports Leagues": [{ "from": 2026, "x": 839, "y": 657 }]
    },
    "full": {}
  }
};
