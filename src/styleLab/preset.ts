// Baked-in style-lab preset: the default look on this branch. Every visitor to
// the branch's deploy sees it (no ?style=1 needed); the panel's "Reset to
// default" returns to it. Replace with the panel's "Copy JSON" output to update.
// `null` would mean the live look, untouched.

import type { StyleLabState } from "./styleLab";

export const LAB_PRESET: StyleLabState | null = {
  "bg": [
    "#080202",
    "#0a0f29",
    "#030118"
  ],
  "sectors": {
    "Telecom": "#53a11e",
    "Advertising": "#ef6262",
    "Gaming": "#9437ff",
    "Audio": "#ff791f",
    "MVPD/BB": "#ffc000",
    "Exhibition": "#ff3fde",
    "Sports Leagues": "#710f20",
    "Studio": "#ef1a1a",
    "Social/Creator": "#42dcb7",
    "HoldingCo": "#9f570f",
    "PSM": "#fcfc06",
    "Hardware/Physical": "#b8b8b8",
    "Local TV": "#fbbcfa",
    "Content Platform": "#ffffa9"
  },
  "largeCaps": {
    "Alphabet": {
      "stops": [
        "#9437ff",
        "#53a11e",
        "#ffc000",
        "#ff791f",
        "#ef1a1a",
        "#3657fd"
      ],
      "count": 17,
      "angle": 120,
      "blend": "oklab",
      "reverse": false,
      "stripeStrokePx": 0,
      "stripeStrokeColor": "#0d0f13",
      "strokePx": 0.5,
      "strokeColor": "#969696"
    },
    "Amazon": {
      "stops": [
        "#9f570f",
        "#18266e",
        "#b8b8b8"
      ],
      "count": 12,
      "angle": 120,
      "blend": "oklab",
      "reverse": true,
      "stripeStrokePx": 0,
      "stripeStrokeColor": "#0d0f13",
      "strokePx": 0,
      "strokeColor": "#0d0f13"
    },
    "Nvidia": {
      "stops": [
        "#ededed",
        "#42dcb7",
        "#2d2d36",
        "#a1ff62"
      ],
      "count": 14,
      "angle": 120,
      "blend": "oklab",
      "reverse": true,
      "stripeStrokePx": 0,
      "stripeStrokeColor": "#0d0f13",
      "strokePx": 1,
      "strokeColor": "#969696"
    },
    "Microsoft": {
      "stops": [
        "#ff791f",
        "#53a11e",
        "#3657fd",
        "#ffc000"
      ],
      "count": 12,
      "angle": 120,
      "blend": "oklab",
      "reverse": true,
      "stripeStrokePx": 0,
      "stripeStrokeColor": "#0d0f13",
      "strokePx": 0,
      "strokeColor": "#0d0f13"
    },
    "Samsung": {
      "stops": [
        "#53a11e",
        "#8196fe",
        "#3657fd",
        "#9437ff",
        "#ef1a1a",
        "#ff791f",
        "#ffc000",
        "#3657fd",
        "#2d2d36"
      ],
      "count": 20,
      "angle": 120,
      "blend": "oklab",
      "reverse": true,
      "stripeStrokePx": 0,
      "stripeStrokeColor": "#0d0f13",
      "strokePx": 0,
      "strokeColor": "#0d0f13"
    },
    "META": {
      "stops": [
        "#3657fd",
        "#b8b8b8"
      ],
      "count": 12,
      "angle": 120,
      "blend": "oklab",
      "reverse": false,
      "stripeStrokePx": 0,
      "stripeStrokeColor": "#0d0f13",
      "strokePx": 0,
      "strokeColor": "#0d0f13"
    },
    "Apple": {
      "stops": [
        "#18266e",
        "#b8b8b8",
        "#2d2d36"
      ],
      "count": 15,
      "angle": 120,
      "blend": "oklab",
      "reverse": false,
      "stripeStrokePx": 0,
      "stripeStrokeColor": "#0d0f13",
      "strokePx": 0,
      "strokeColor": "#0d0f13"
    },
    "Walmart": {
      "stops": [
        "#ffc000",
        "#18266e",
        "#b8b8b8",
        "#ef6262",
        "#2d2d36"
      ],
      "count": 10,
      "angle": 120,
      "blend": "oklab",
      "reverse": false,
      "stripeStrokePx": 0,
      "stripeStrokeColor": "#0d0f13",
      "strokePx": 0,
      "strokeColor": "#0d0f13"
    },
    "ByteDance": {
      "stops": [
        "#42dcb7",
        "#ef1a1a",
        "#2d2d36",
        "#42dcb7",
        "#ef1a1a",
        "#2d2d36"
      ],
      "count": 24,
      "angle": 120,
      "blend": "oklab",
      "reverse": false,
      "stripeStrokePx": 0,
      "stripeStrokeColor": "#0d0f13",
      "strokePx": 0,
      "strokeColor": "#0d0f13"
    },
    "Netflix": {
      "stops": [
        "#000000",
        "#ef1a1a"
      ],
      "count": 10,
      "angle": 120,
      "blend": "oklab",
      "reverse": false,
      "stripeStrokePx": 0,
      "stripeStrokeColor": "#0d0f13",
      "strokePx": 1,
      "strokeColor": "#969696"
    },
    "Alibaba": {
      "stops": [
        "#b8b8b8",
        "#2d2d36",
        "#ff791f"
      ],
      "count": 7,
      "angle": 120,
      "blend": "oklab",
      "reverse": false,
      "stripeStrokePx": 0,
      "stripeStrokeColor": "#0d0f13",
      "strokePx": 0,
      "strokeColor": "#0d0f13"
    },
    "Oracle": {
      "stops": [
        "#b8b8b8",
        "#710f20",
        "#710f20",
        "#b8b8b8"
      ],
      "count": 12,
      "angle": 120,
      "blend": "oklab",
      "reverse": false,
      "stripeStrokePx": 0,
      "stripeStrokeColor": "#0d0f13",
      "strokePx": 0,
      "strokeColor": "#0d0f13"
    },
    "Tencent": {
      "stops": [
        "#b8b8b8",
        "#53a11e",
        "#9f570f"
      ],
      "count": 12,
      "angle": 120,
      "blend": "oklab",
      "reverse": true,
      "stripeStrokePx": 0,
      "stripeStrokeColor": "#0d0f13",
      "strokePx": 0,
      "strokeColor": "#0d0f13"
    },
    "Reliance": {
      "stops": [
        "#53a11e",
        "#ef1a1a",
        "#18266e"
      ],
      "count": 12,
      "angle": 120,
      "blend": "oklab",
      "reverse": false,
      "stripeStrokePx": 0,
      "stripeStrokeColor": "#0d0f13",
      "strokePx": 0,
      "strokeColor": "#0d0f13"
    }
  },
  "largeCapStroke": {
    "px": 0.75,
    "color": "#969696"
  },
  "sectorStroke": {
    "px": 0.75,
    "color": "#969696"
  },
  "panelBg": "#030118"
} as StyleLabState;
