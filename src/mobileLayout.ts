// Per-view-type mobile layouts — the mobile counterpart to layout.ts, one
// independent layout per mobile view type (full / vertical / horizontal). Each
// has its own physics settings, hand-placed planet positions, and sector
// gravity wells, all separate from desktop AND from each other. Authored in the
// browser via `?edit=mobile` (view-type selector + drag + sliders), then copied
// back here. Coordinates are in each type's own canvas slide-space.
//
// Local fallback, same pattern as layout.ts: a future Sanity migration swaps
// these for per-view-type fields on each company.
export type MobilePosition = { x: number; y: number };
export type MobileViewType = "full" | "vertical" | "horizontal";

export type MobileSettings = {
  scale: number; // planet-size multiplier (1 = auto)
  collidePadding: number; // min gap between planets (no overlap)
  sizeSpacing: number; // extra gap scaled by planet radius
  repulsion: number; // long-range push that fills empty space
  sectorPull: number; // gravity toward each sector's center (lower = fills more)
  nameThreshold: number; // min on-screen planet diameter (px) to show a name
};

export type MobileLayout = {
  settings: MobileSettings;
  positions: Record<string, MobilePosition>; // hand-placed planets (pinned)
  sectorCenters: Record<string, MobilePosition>; // per-sector gravity wells
};

const DEFAULT_SETTINGS: MobileSettings = {
  scale: 1.0,
  collidePadding: 12,
  sizeSpacing: 0.05,
  repulsion: 16,
  sectorPull: 0.05,
  nameThreshold: 10,
};

export const MOBILE_LAYOUTS: Record<MobileViewType, MobileLayout> = {
  // Landscape-fit view. Empty positions/wells fall back to the desktop layout.
  full: {
    settings: { ...DEFAULT_SETTINGS },
    positions: {},
    sectorCenters: {},
  },

  // 4:5 portrait view (authored).
  vertical: {
    settings: { ...DEFAULT_SETTINGS, collidePadding: 12, sizeSpacing: 0.05, repulsion: 16, sectorPull: 0.05, nameThreshold: 10 },
    sectorCenters: {
      "Advertising": { x: 400, y: -215 },
      "Audio": { x: 339, y: 169 },
      "Content Platform": { x: 219, y: -512 },
      "Exhibition": { x: 132, y: 734 },
      "Gaming": { x: 543, y: 464 },
      "HoldingCo": { x: -608, y: -300 },
      "Large Cap": { x: 143, y: 1593 },
      "Local TV": { x: -303, y: -574 },
      "MVPD/BB": { x: 496, y: -992 },
      "PSM": { x: 63, y: -932 },
      "Publishing": { x: -7, y: -99 },
      "Sports Leagues": { x: -353, y: 451 },
      "Studio": { x: 700, y: -460 },
      "Telecom": { x: -351, y: -899 },
    },
    positions: {
      "Alibaba": { x: 647, y: -1130 },
      "Alphabet": { x: -804, y: -586 },
      "Amazon": { x: 954, y: -760 },
      "Antrhopic": { x: 506, y: 799 },
      "Apple": { x: -875, y: 245 },
      "ByteDance": { x: -117, y: 228 },
      "Charter": { x: -54, y: -759 },
      "Comcast": { x: -23, y: -537 },
      "COX": { x: 47, y: -805 },
      "Disney": { x: 139, y: -386 },
      "Epic": { x: 290, y: -590 },
      "Marvel": { x: 136, y: -241 },
      "META": { x: -772, y: 889 },
      "MFE": { x: 431, y: -497 },
      "Microsoft": { x: -101, y: 1143 },
      "Netflix": { x: -238, y: -231 },
      "Nexstar": { x: -271, y: -688 },
      "Nvidia": { x: 814, y: 92 },
      "Open AI": { x: 555, y: 1136 },
      "Oracle": { x: 130, y: 495 },
      "Paramount Skydance": { x: 125, y: 302 },
      "ProSieben": { x: 490, y: -432 },
      "Reliance": { x: -373, y: 733 },
      "Riot": { x: 209, y: -697 },
      "Samsung": { x: -190, y: -1199 },
      "Space X": { x: 914, y: 831 },
      "TEGNA": { x: -287, y: -801 },
      "Tencent": { x: 385, y: -769 },
      "Tik Tok US": { x: 4, y: 378 },
      "WALMART": { x: 229, y: -1124 },
      "WBD": { x: 131, y: 102 },
      "Xumo": { x: -147, y: -668 },
    },
  },

  // Landscape (rotated-phone) view — to be authored.
  horizontal: {
    settings: { ...DEFAULT_SETTINGS },
    positions: {},
    sectorCenters: {},
  },
};
