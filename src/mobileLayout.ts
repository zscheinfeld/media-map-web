// Hand-placed planet positions for the mobile "vertical" (4:5) view — the
// portrait counterpart to COMPANY_POSITIONS in layout.ts. Authored in the
// browser via `?edit=mobile` (drag planets + scale slider), then copied/
// downloaded and pasted back here. Coordinates are in CANVAS_MOBILE_45 slide
// space (x ∈ [-1000, 1000], y ∈ [-1250, 1250]).
//
// This is the local fallback, same pattern as layout.ts: a future Sanity
// migration just swaps this import for a mobile-position field on each company.
export type MobilePosition = { x: number; y: number };

// Per-sector gravity wells for the 4:5 view — the point each sector's
// not-hand-placed planets are attracted to. Drag them in ?edit=mobile.
// Sectors with no entry fall back to the scaled default mobile grid.
export const MOBILE_SECTOR_CENTERS: Record<string, MobilePosition> = {
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
};

export const MOBILE_COMPANY_POSITIONS: Record<string, MobilePosition> = {
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
};

// Global 4:5-view settings, tuned with the ?edit=mobile sliders.
//   scale          — planet-size multiplier (1 = auto)
//   collidePadding — min gap between planets (no overlap)
//   sizeSpacing    — extra gap scaled by planet radius
//   repulsion      — long-range push that fills empty space
//   sectorPull     — gravity toward each sector's center (lower = fills more)
//   nameThreshold  — min on-screen planet diameter (px) to show a company name
export const MOBILE_LAYOUT_SETTINGS = {
  scale: 1.0,
  collidePadding: 12,
  sizeSpacing: 0.05,
  repulsion: 16,
  sectorPull: 0.05,
  nameThreshold: 10,
};
