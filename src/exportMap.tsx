// Static PNG export of the present-year map (3840×2160, 16:9): the full
// canonical desktop canvas across the whole frame, an info column at the left
// drawn over it (headline, counts, sector legend), the Substack QR + logo and a
// note bottom-left, and a QR to the map bottom-right.
//
// The export does NOT re-run physics. It starts from the live, settled layout
// (the composition the map is tuned to) and runs a deterministic geometry pass
// (`computeExportLayout`) that tests the REAL label rectangles and planet
// circles for overlap — not the circular approximation the live collision uses —
// and nudges only the colliding pairs apart, moving the smaller / free planet.
// Because nothing here depends on live React state, MediaMap pre-renders the
// PNG in the background once the layout settles and caches it, so the download
// click is instant.

import type { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { formatValuation, type Bounds, type PlanetNode } from "@media-map/map-core";
import { CANVAS_DESKTOP, flatStyleForSector, hueForSector } from "./sectors";
import {
  EXPORT_H,
  EXPORT_MAP_SCALE_PANEL,
  EXPORT_PANEL_W,
  EXPORT_SLIDE_UNITS_PER_PX,
  EXPORT_W,
  ExportMapScene,
} from "./exportScene";

// Label font shrink (screen-px semantics) for the export only — smaller text
// boxes fit dense clusters of small planets more easily. Applies only when the
// export is NOT given the site's type rules (`ExportInput.type`); with them the
// names are drawn at exactly the site's sizes.
export const EXPORT_LABEL_SIZE_DELTA = 1.5;

/**
 * The site's type rules (layout lab → Type), so the downloaded image sets its
 * names the way the map does: two sizes split at a valuation, and the outline
 * weight. Sizes are in the site's screen px (the export draws at a fixed
 * reference scale, see EXPORT_SLIDE_UNITS_PER_PX).
 */
export type ExportTypeRules = {
  /** Name size for planets valued at or above `thresholdB`. */
  largePx: number;
  /** Name size for the rest, and for text-only entities. */
  smallPx: number;
  /** Valuation ($B) where the large size starts. */
  thresholdB: number;
  /** Black outline around the names in the image. */
  strokePx: number;
};

// Minimum clearance the de-overlap pass enforces, in slide units. LABEL_GAP is
// the total gap between two label boxes (or a label box and a planet edge);
// CIRCLE_GAP between two planet edges. Raise for airier spacing.
const EXPORT_LABEL_GAP = 48;
const EXPORT_CIRCLE_GAP = 30;
// Solver: Gauss-Seidel sweeps, full-strength corrections (under-relaxation was
// measured to converge WORSE on dense jams). Big pinned planets are processed
// last in each sweep so their ejections stick, and the best snapshot seen is
// returned so a late oscillation can't hand back a worse layout.
const EXPORT_MAX_SWEEPS = 150;
const EXPORT_RELAX = 1;
const EXPORT_HEAVY_R = 100; // pinned planets this big get the last word each sweep

export const LABEL_FONT_FAMILY = '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif';

// Canvas-based text measurer. One offscreen 2D context shared across calls.
// Used to compute each planet's rendered label width so collision (live) and the
// export de-overlap pass know how far a label really reaches.
const textMeasureCtx: CanvasRenderingContext2D | null =
  typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
const textWidthCache = new Map<string, number>();
/** Forget cached widths (call once the web font has loaded). */
export function clearTextWidthCache(): void {
  textWidthCache.clear();
}
export function measureLabelTextWidth(text: string, fontPx: number, weight: number = 700): number {
  if (!textMeasureCtx) return text.length * fontPx * 0.55;
  const key = `${weight}|${fontPx}|${text}`;
  const cached = textWidthCache.get(key);
  if (cached !== undefined) return cached;
  textMeasureCtx.font = `${weight} ${fontPx}px ${LABEL_FONT_FAMILY}`;
  const w = textMeasureCtx.measureText(text).width;
  textWidthCache.set(key, w);
  return w;
}

// Companies worth this much ($B) or more get their market cap printed under
// their name in the downloaded image. The lower it is, the more the de-overlap
// pass has to move planets to make room, and how much depends on the
// arrangement that page load got (measured 2026-10-05 over five loads: $10B
// never moved anything far; $1B was gentle on three loads and threw 9–17
// planets over 150 units on the other two; every company moved ~half the map).
// On trial at $3B.
export const EXPORT_VALUATION_MIN_B = 3;

// The names' black outline when the export isn't given the type rules (with
// them, `type.strokePx` is the image's own weight, set in the layout lab).
const DEFAULT_LABEL_STROKE_PX = 1.5;

/**
 * Whether a node's name carries its market cap in the export: Large Cap always
 * (as on the map); with `minB` set, also every company valued at or above it
 * (0 = every company that has a value).
 */
export const exportShowsValuation = (n: PlanetNode, minB: number | null | undefined): boolean =>
  !n.isEntity && (n.sector === "Large Cap" || (minB != null && n.valuation_b > 0 && n.valuation_b >= minB));

/**
 * Half-extents (slide units) of a node's rendered label box, mirroring Planet's
 * `renderNameLabel`: one word per line at `labelPx`, the name at weight 500 with
 * 2% tracking, plus a valuation line (weight 400, 15% gap) for Large Cap.
 */
export function exportLabelHalfExtents(
  n: PlanetNode,
  labelPx: number,
  su: number,
  /** Whether this node's label carries a valuation line (default: Large Cap only). */
  withValuation: boolean = exportShowsValuation(n, null),
): { hw: number; hh: number } {
  const words = (n.labelText ?? n.name).trim().split(/\s+/);
  let maxW = 0;
  for (const w of words) {
    maxW = Math.max(maxW, measureLabelTextWidth(w, labelPx, 500) + 0.02 * labelPx * w.length);
  }
  const withVal = withValuation;
  if (withVal) maxW = Math.max(maxW, measureLabelTextWidth(formatValuation(n.valuation_b), labelPx, 400));
  const totalH = words.length * labelPx + (withVal ? labelPx * 0.15 + labelPx : 0);
  return { hw: (maxW / 2) * su, hh: (totalH / 2) * su };
}

type ExportShape = {
  name: string;
  x: number;
  y: number;
  r: number; // 0 for entities
  hw: number; // label half-width incl. half the label gap
  hh: number;
  weight: number; // inverse mass: how much of a correction this node absorbs
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Deterministic label-aware de-overlap. Each node is a circle (its planet)
 * union a rectangle (its label box); both are inflated by the gaps above. Pairs
 * are tested rect–rect, circle–rect and circle–circle, and each overlap is
 * resolved by its minimum translation, split by mass so the smaller planet
 * moves and a big one barely does (pinned planets are ×10 heavier — nudgeable
 * in a static image, but only when nothing lighter can give way). Gauss-Seidel
 * sweeps until the largest correction is negligible. Returns the new positions
 * plus any pairs that still overlap (two immovable planets authored on top of
 * each other — fix those in Sanity).
 */
export function computeExportLayout(
  nodes: PlanetNode[],
  /** Name size: one for every node, or per node (large / small type). */
  labelPx: number | ((n: PlanetNode) => number),
  su: number,
  bounds: Bounds,
  opts: { sweeps?: number; relax?: number; valuationMinB?: number | null; fitValuations?: boolean } = {},
): {
  pos: Map<string, { x: number; y: number }>;
  unresolved: Array<[string, string]>;
  sweeps: number;
  /** Names whose label carries a market cap (the cut-off's, plus any fitted in). */
  withValuation: Set<string>;
} {
  const maxSweeps = opts.sweeps ?? EXPORT_MAX_SWEEPS;
  const relax = opts.relax ?? EXPORT_RELAX;
  const shapes: ExportShape[] = nodes.map((n) => {
    const { hw, hh } = exportLabelHalfExtents(
      n,
      typeof labelPx === "function" ? labelPx(n) : labelPx,
      su,
      exportShowsValuation(n, opts.valuationMinB),
    );
    const r = n.isEntity ? 0 : n.targetR;
    const massR = Math.max(r, 25) + 25;
    const mass = massR * massR * (n.pinned ? 10 : 1);
    return {
      name: n.name,
      x: n.x,
      y: n.y,
      r: r > 0 ? r + EXPORT_CIRCLE_GAP / 2 : 0,
      hw: hw + EXPORT_LABEL_GAP / 2,
      hh: hh + EXPORT_LABEL_GAP / 2,
      weight: 1 / mass,
    };
  });

  // Big pinned planets ("heavy") are effectively immovable. They also sit partly
  // off-canvas by design (Apple / Space X / Anthropic hug the edges), so they are
  // exempt from bounds clamping — otherwise one overlap could yank Apple inward.
  const heavyOf = new Map(nodes.map((n) => [n.name, n.pinned && !n.isEntity && n.targetR >= EXPORT_HEAVY_R]));
  const keepInBounds = (s: ExportShape) => {
    if (heavyOf.get(s.name)) return;
    const ex = Math.max(s.hw, s.r);
    const ey = Math.max(s.hh, s.r);
    s.x = clamp(s.x, bounds.x0 + ex, bounds.x1 - ex);
    s.y = clamp(s.y, bounds.y0 + ey, bounds.y1 - ey);
  };

  // Minimum translation to push `b` off `a` for each shape pairing; null = clear.
  // `eps` ignores penetrations below a threshold: 0 while resolving (fix
  // everything), ~1 su for the final report so shapes left exactly touching by
  // the last correction aren't flagged on floating-point noise.
  const rectRect = (a: ExportShape, b: ExportShape, eps = 0): [number, number] | null => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const px = a.hw + b.hw - Math.abs(dx);
    const py = a.hh + b.hh - Math.abs(dy);
    if (px <= eps || py <= eps) return null;
    if (px < py) return [(dx < 0 ? -1 : 1) * px, 0];
    return [0, (dy < 0 ? -1 : 1) * py];
  };
  const circleRect = (c: ExportShape, r: ExportShape, eps = 0): [number, number] | null => {
    if (c.r <= 0) return null;
    // Closest point on r's box to c's center; inside the box → push along centers.
    const qx = clamp(c.x, r.x - r.hw, r.x + r.hw);
    const qy = clamp(c.y, r.y - r.hh, r.y + r.hh);
    let dx = qx - c.x;
    let dy = qy - c.y;
    let d = Math.hypot(dx, dy);
    if (d >= c.r - eps) return null;
    if (d < 1e-6) {
      dx = r.x - c.x;
      dy = r.y - c.y;
      d = Math.hypot(dx, dy);
      if (d < 1e-6) {
        dx = 1;
        dy = 0;
        d = 1;
      }
      const pen = c.r + Math.min(r.hw, r.hh);
      return [(dx / d) * pen, (dy / d) * pen];
    }
    const pen = c.r - d;
    return [(dx / d) * pen, (dy / d) * pen];
  };
  const circleCircle = (a: ExportShape, b: ExportShape, eps = 0): [number, number] | null => {
    if (a.r <= 0 || b.r <= 0) return null;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let d = Math.hypot(dx, dy);
    const min = a.r + b.r;
    if (d >= min - eps) return null;
    if (d < 1e-6) {
      dx = 1;
      dy = 0;
      d = 1;
    }
    const pen = min - d;
    return [(dx / d) * pen, (dy / d) * pen];
  };

  // Resolve one pair; returns the largest correction applied (0 = clear).
  const resolvePair = (a: ExportShape, b: ExportShape): number => {
    // Cheap reject: bounding boxes of the unions don't touch.
    const ea = Math.max(a.hw, a.r), eb = Math.max(b.hw, b.r);
    if (Math.abs(b.x - a.x) > ea + eb) return 0;
    const fa = Math.max(a.hh, a.r), fb = Math.max(b.hh, b.r);
    if (Math.abs(b.y - a.y) > fa + fb) return 0;
    const mtvs: Array<[number, number] | null> = [rectRect(a, b), circleRect(a, b), circleCircle(a, b)];
    const rb = circleRect(b, a);
    if (rb) mtvs.push([-rb[0], -rb[1]]); // computed as "push a off b" → flip
    let moved = 0;
    for (const m of mtvs) {
      if (!m) continue;
      // Heavy (big pinned) planets are EXACTLY fixed: the light partner absorbs
      // the whole correction. Splitting by mass gave a heavy planet only ~0.06%
      // of each push, but a stuck neighbour pushes every sweep — over 150 sweeps
      // that crept Apple ~100 units in the export.
      const aHeavy = heavyOf.get(a.name), bHeavy = heavyOf.get(b.name);
      const shareA = aHeavy && !bHeavy ? 0 : bHeavy && !aHeavy ? 1 : a.weight / (a.weight + b.weight);
      const mx = m[0] * relax;
      const my = m[1] * relax;
      a.x -= mx * shareA;
      a.y -= my * shareA;
      b.x += mx * (1 - shareA);
      b.y += my * (1 - shareA);
      keepInBounds(a);
      keepInBounds(b);
      moved = Math.max(moved, Math.hypot(m[0], m[1]));
    }
    return moved;
  };
  const isOverlapping = (a: ExportShape, b: ExportShape, eps: number) =>
    !!(rectRect(a, b, eps) || circleRect(a, b, eps) || circleRect(b, a, eps) || circleCircle(a, b, eps));

  // Big pinned planets ("heavy") are effectively immovable; everything else is
  // "light". Each sweep resolves light–light pairs first, then light–heavy, so
  // a planet ejected off a big pinned one isn't pushed straight back in by a
  // neighbour later in the same sweep. Heavy–heavy pairs are left alone (only
  // authoring can fix two big pins on top of each other) and just reported.
  const light = shapes.filter((s) => !heavyOf.get(s.name));
  const heavy = shapes.filter((s) => heavyOf.get(s.name));

  const REPORT_EPS = 1;
  const countOverlaps = () => {
    let c = 0;
    for (let i = 0; i < shapes.length; i++)
      for (let j = i + 1; j < shapes.length; j++) if (isOverlapping(shapes[i], shapes[j], REPORT_EPS)) c++;
    return c;
  };
  const snapshot = () => shapes.map((s) => ({ x: s.x, y: s.y }));

  let best = { count: Number.POSITIVE_INFINITY, pos: snapshot() };
  let sweepsRun = 0;
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    sweepsRun++;
    let maxMove = 0;
    for (let i = 0; i < light.length; i++)
      for (let j = i + 1; j < light.length; j++) maxMove = Math.max(maxMove, resolvePair(light[i], light[j]));
    for (const l of light) for (const h of heavy) maxMove = Math.max(maxMove, resolvePair(l, h));
    if (maxMove < 0.5) break;
    // Keep the best layout seen so an oscillating jam can't end on a bad frame.
    if (sweep % 10 === 9) {
      const c = countOverlaps();
      if (c < best.count) best = { count: c, pos: snapshot() };
    }
  }
  const finalCount = countOverlaps();
  if (finalCount > best.count) {
    shapes.forEach((s, i) => {
      s.x = best.pos[i].x;
      s.y = best.pos[i].y;
    });
  }

  // Rescue pass. Pairwise corrections can't free a light node wedged between
  // heavy planets and the canvas edge — every push points into a wall (seen in
  // practice: the Publishing pocket between Apple, META and the bottom edge).
  // Relocate each still-colliding light node to the NEAREST free spot instead:
  // sample rings of growing radius around it and take the first spot that
  // clears every other shape and the bounds. Two passes, since freeing one node
  // can free its neighbour.
  const heavySet = new Set(heavy);
  const fits = (s: ExportShape, x: number, y: number) => {
    const ex = Math.max(s.hw, s.r), ey = Math.max(s.hh, s.r);
    if (x - ex < bounds.x0 || x + ex > bounds.x1 || y - ey < bounds.y0 || y + ey > bounds.y1) return false;
    const t = { ...s, x, y };
    for (const o of shapes) if (o !== s && isOverlapping(t, o, 0)) return false;
    return true;
  };
  for (let pass = 0; pass < 2; pass++) {
    let moved = 0;
    for (const s of light) {
      if (!shapes.some((o) => o !== s && isOverlapping(s, o, REPORT_EPS))) continue;
      let placed = false;
      for (let ring = 40; ring <= 800 && !placed; ring += 40) {
        const steps = Math.max(8, Math.round((2 * Math.PI * ring) / 60));
        for (let k = 0; k < steps && !placed; k++) {
          const a = (k / steps) * 2 * Math.PI;
          const x = s.x + ring * Math.cos(a), y = s.y + ring * Math.sin(a);
          if (fits(s, x, y)) {
            s.x = x;
            s.y = y;
            placed = true;
            moved++;
          }
        }
      }
    }
    if (!moved) break;
  }

  // Report what's still overlapping. Two heavy (big pinned) planets are only a
  // problem if their CIRCLES actually intersect — a merely tight gap between
  // two pins is an authoring choice, not an overlap — so test those raw
  // (deflating the circle gap); everything else against the padded shapes.
  const unresolved: Array<[string, string]> = [];
  for (let i = 0; i < shapes.length; i++)
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i], b = shapes[j];
      const hit =
        heavySet.has(a) && heavySet.has(b)
          ? !!circleCircle(a, b, EXPORT_CIRCLE_GAP)
          : isOverlapping(a, b, REPORT_EPS);
      if (hit) unresolved.push([a.name, b.name]);
    }

  // Market caps below the cut-off, where there is room. With everything in its
  // final place, offer each remaining company (largest first) the extra line and
  // keep it only if the taller, maybe wider, label still clears every other
  // shape and the bounds — so no planet moves for it.
  const withValuation = new Set(nodes.filter((n) => exportShowsValuation(n, opts.valuationMinB)).map((n) => n.name));
  if (opts.fitValuations) {
    const order = nodes
      .map((n, i) => ({ n, s: shapes[i] }))
      .filter(({ n }) => !n.isEntity && n.valuation_b > 0 && !withValuation.has(n.name))
      .sort((a, b) => b.n.valuation_b - a.n.valuation_b);
    for (const { n, s } of order) {
      const { hw, hh } = exportLabelHalfExtents(n, typeof labelPx === "function" ? labelPx(n) : labelPx, su, true);
      const before = { hw: s.hw, hh: s.hh };
      s.hw = hw + EXPORT_LABEL_GAP / 2;
      s.hh = hh + EXPORT_LABEL_GAP / 2;
      if (fits(s, s.x, s.y)) withValuation.add(n.name);
      else {
        s.hw = before.hw;
        s.hh = before.hh;
      }
    }
  }

  return { pos: new Map(shapes.map((s) => [s.name, { x: s.x, y: s.y }])), unresolved, sweeps: sweepsRun, withValuation };
}

/** Synchronously render a React element to SVG markup via a detached root. */
export function renderSvgMarkup(el: ReactElement): string {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(el));
  const svg = host.querySelector("svg");
  const markup = svg ? new XMLSerializer().serializeToString(svg) : "";
  root.unmount();
  return markup;
}

// Adobe's license forbids embedding their font files, so the detached export
// render inlines Libre Franklin (the OFL Franklin Gothic revival) as a
// near-identical stand-in. The label font stack lists "franklin-gothic" first,
// then "Libre Franklin"; in the detached render the Adobe face is unavailable,
// so this inlined face wins. One variable file covers every weight. Cached.
let mapFontCssCache: string | null = null;
async function buildMapFontCss(): Promise<string> {
  if (mapFontCssCache !== null) return mapFontCssCache;
  try {
    const res = await fetch("/librefranklin.ttf");
    if (!res.ok) return (mapFontCssCache = "");
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    mapFontCssCache = `@font-face{font-family:'Libre Franklin';font-style:normal;font-weight:100 900;src:url(data:font/ttf;base64,${btoa(bin)}) format('truetype');}`;
  } catch {
    mapFontCssCache = "";
  }
  return mapFontCssCache;
}

// Fetch a same-origin asset (logo / QR svg) as a base64 data URI so it can be
// inlined into the export SVG — external hrefs don't load in a detached
// <img>-rasterized SVG. Cached per URL.
const dataUriCache = new Map<string, string | null>();
async function fetchDataUri(url: string): Promise<string | null> {
  if (dataUriCache.has(url)) return dataUriCache.get(url) ?? null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const uri = await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
    dataUriCache.set(url, uri);
    return uri;
  } catch {
    dataUriCache.set(url, null);
    return null;
  }
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The info column's navy (also behind the QR codes, so their squares vanish
// into the bottom-left mark and match each other).
const EXPORT_PANEL_BG = "#05060f";

/**
 * A QR code SVG as a data URI, recoloured for the dark image: white modules on
 * the side panel's navy. The generator's files colour two full-size rects
 * (clipped to "background" and "dot" shapes), and ship either way round — the
 * Substack one pre-inverted, the map one black-on-white — so both are forced.
 */
async function fetchQrDataUri(url: string): Promise<string | null> {
  const key = `qr:${url}`;
  if (dataUriCache.has(key)) return dataUriCache.get(key) ?? null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const svg = (await res.text())
      .replace(/(clip-path="url\('#clip-path-background-color'\)"\s+fill=")[^"]*(")/, `$1${EXPORT_PANEL_BG}$2`)
      .replace(/(clip-path="url\('#clip-path-dot-color'\)"\s+fill=")[^"]*(")/, "$1#ffffff$2");
    const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    dataUriCache.set(key, uri);
    return uri;
  } catch {
    dataUriCache.set(key, null);
    return null;
  }
}

// The QR files carry a blank margin (the "quiet zone") inside their own box:
// this share of the box on each side. The modules are drawn at the size asked
// for — the box is enlarged and shifted by the margin — so a QR sits at the
// same height as the logo beside it rather than a touch smaller.
const QR_QUIET_ZONE = { substack: 0.0362, map: 0.0238 };
// Where the logo file's letters sit within its height: ESHAP's cap height runs
// from 10.9% to 95.7% of the box (the head reaches a little above and below).
const LOGO_CAP = { top: 0.109, height: 0.848 };
function qrImage(uri: string, x: number, y: number, size: number, quiet: number): string {
  const box = size / (1 - 2 * quiet);
  const off = box * quiet;
  return `<image x="${(x - off).toFixed(1)}" y="${(y - off).toFixed(1)}" width="${box.toFixed(1)}" height="${box.toFixed(1)}" href="${uri}" xlink:href="${uri}"/>`;
}

/** The image's artwork (logo + the two QR codes) as data URIs; null where a file is missing. */
export type ExportAssets = { logoUri: string | null; qrUri: string | null; mapQrUri: string | null };
export async function loadExportAssets(): Promise<ExportAssets> {
  const [logoUri, qrUri, mapQrUri] = await Promise.all([
    fetchDataUri("/Evan-logo-new.png"),
    fetchQrDataUri("/Eshap_QR.svg"),
    fetchQrDataUri("/Map_Eshap_TV_QR.svg"),
  ]);
  return { logoUri, qrUri, mapQrUri };
}

// Month abbreviations for the headline ("OCT. 2026"); May is not abbreviated.
const HEADLINE_MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
// The note beside the logo (bottom-left).
const EXPORT_SCALE_NOTE = ["Objects are to scale based on market cap", "except PSM: based on 2024/2025 revenue"];
const EXPORT_MAP_URL_LABEL = "Map.Eshap.TV";

/** The parts of the image's overlay the layout lab's Download tab can adjust. */
export type ExportPanelSettings = {
  /** Space between the legend's rows, image px. */
  legendGap: number;
  /** Headline size, as a multiple of its base size. */
  headlineScale: number;
  /** Space between the headline and the "N Sectors" line, image px. */
  headlineGap: number;
  /** How big the map is drawn (EXPORT_MAP_SCALE_PANEL = as it always was … 1 = fits the height … EXPORT_MAP_SCALE_FILL = fills the width). */
  mapScale: number;
  /** The image's width, px (EXPORT_W at most; the height stays EXPORT_H). Narrower crops the map's sides equally. */
  imageWidth: number;
  /** Slides the map sideways in the image, px (+ = right). */
  mapOffsetX: number;
  /** Legend names in Medium (500), like the planet names, instead of Book (400), like their numbers. */
  legendMedium: boolean;
  /** Legend name size, as a multiple of the "N Companies" line's size. */
  legendScale: number;
  /** Space between the "N Companies" line and the first sector, image px (default: twice `legendGap`). */
  legendTop: number;
  /** Moves the Substack QR up (−) or down (+) on its own, image px. */
  qrOffsetY: number;
  /** Moves the logo and the Substack QR together up (−) or down (+), image px. */
  markOffsetY: number;
};
export const DEFAULT_EXPORT_PANEL: ExportPanelSettings = {
  legendGap: 14,
  headlineScale: 1,
  headlineGap: 68,
  mapScale: EXPORT_MAP_SCALE_PANEL,
  imageWidth: EXPORT_W,
  mapOffsetX: 0,
  legendMedium: false,
  legendScale: 1,
  legendTop: 28,
  qrOffsetY: 0,
  markOffsetY: 0,
};
/** The narrowest the image can be cropped to, px. */
export const EXPORT_MIN_IMAGE_W = 2000;
export const exportImageWidth = (s: Pick<ExportPanelSettings, "imageWidth">) =>
  Math.round(Math.max(EXPORT_MIN_IMAGE_W, Math.min(EXPORT_W, s.imageWidth)));
const EXPORT_HEADLINE_BASE_PX = 58;

export type ExportPanelInput = {
  year: number;
  month: number | null;
  sectors: string[];
  counts: Record<string, number>;
  assets: ExportAssets;
  settings: ExportPanelSettings;
  sectorColorOverride?: (sector: string) => string | null;
};

/**
 * The overlay drawn over the map (as SVG markup, in image px): the headline,
 * counts and sector legend down the left; the Substack QR, logo and scale note
 * bottom-left; the QR to the map bottom-right. No panel background — the map
 * runs underneath. Also drawn live over the map by the lab's Download tab.
 */
export function buildExportPanelMarkup(input: ExportPanelInput): string {
  const { year, month, sectors, counts, assets, settings, sectorColorOverride } = input;
  const W = exportImageWidth(settings), H = EXPORT_H, PANEL_W = EXPORT_PANEL_W;
  const FONT = LABEL_FONT_FAMILY;
  const PAD = 56;
  const sectorTotal = sectors.length;
  const companyTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const parts: string[] = [];

  // Headline: MEDIA / UNIVERSE / {MON. year} (uppercase, Demi 600, -1% tracking,
  // 90% lh). The month is the map's current one, so it rolls over on its own.
  const hlSize = EXPORT_HEADLINE_BASE_PX * settings.headlineScale;
  const hlLH = hlSize * 0.9;
  const monthLabel = month && month >= 1 && month <= 12 ? `${HEADLINE_MONTHS[month - 1]} ` : "";
  const hlLines = ["MEDIA", "UNIVERSE", `${monthLabel}${year}`];
  let cy = PAD + hlSize;
  parts.push(
    `<text font-family='${FONT}' font-weight="600" font-size="${hlSize.toFixed(1)}" fill="#fff" letter-spacing="${(-0.01 * hlSize).toFixed(2)}" style="text-transform:uppercase">` +
      hlLines.map((l, i) => `<tspan x="${PAD}" y="${(cy + i * hlLH).toFixed(1)}">${esc(l)}</tspan>`).join("") +
      `</text>`,
  );
  cy += (hlLines.length - 1) * hlLH + settings.headlineGap;

  // Counts: "N Sectors" (Medium, white), "N Companies" (Book, dimmer, smaller).
  const cSize = 26;
  const c2Size = 20;
  parts.push(`<text x="${PAD}" y="${cy.toFixed(1)}" font-family='${FONT}' font-weight="500" font-size="${cSize}" fill="#fff">${sectorTotal} Sectors</text>`);
  cy += c2Size + 8;
  parts.push(`<text x="${PAD}" y="${cy.toFixed(1)}" font-family='${FONT}' font-weight="400" font-size="${c2Size}" fill="rgba(255,255,255,0.5)">${companyTotal} Companies</text>`);
  // From that line's descenders down to the first sector name.
  cy += c2Size * 0.2 + settings.legendTop;

  // Legend: swatch + name per sector, set like the "N Companies" line (its
  // size, Book weight — or Medium, like the planet names, on request),
  // `legendGap` apart. (No containers, no counts.)
  const nameSize = c2Size * settings.legendScale;
  const nameWeight = settings.legendMedium ? 500 : 400;
  const swSize = Math.max(10, Math.round(nameSize * 0.72));
  const rowH = nameSize;
  let rowTop = cy;
  let rowIndex = 0;
  for (const sector of sectors) {
    const flat = flatStyleForSector(sector);
    const override = sectorColorOverride?.(sector) ?? null;
    const primary = override ?? flat?.fill ?? flat?.stripes?.[0] ?? `hsl(${hueForSector(sector)}, 70%, 55%)`;
    const stroke = flat?.stroke && flat.stroke !== "transparent" ? flat.stroke : null;
    const midY = rowTop + rowH / 2;
    const textY = (midY + nameSize * 0.34).toFixed(1); // baseline for vertical centre
    const swY = (midY - swSize / 2).toFixed(1);
    const rx = Math.max(2, Math.round(swSize / 5));
    // A sector whose key on the map is a colour sweep (Large Cap's rainbow)
    // gets the same here, as a few vertical stripes sampled from it.
    const bands = !override && flat?.swatchBackground ? gradientBands(flat.swatchBackground, LEGEND_SWATCH_STRIPES) : null;
    if (bands) {
      const id = `mm-export-swatch-${rowIndex}`;
      const bw = swSize / bands.length;
      parts.push(
        `<defs><clipPath id="${id}"><rect x="${PAD}" y="${swY}" width="${swSize}" height="${swSize}" rx="${rx}"/></clipPath></defs>` +
          `<g clip-path="url(#${id})">` +
          bands.map((c, i) => `<rect x="${(PAD + i * bw).toFixed(2)}" y="${swY}" width="${(bw + 0.5).toFixed(2)}" height="${swSize}" fill="${c}"/>`).join("") +
          `</g>`,
      );
    } else {
      parts.push(`<rect x="${PAD}" y="${swY}" width="${swSize}" height="${swSize}" rx="${rx}" fill="${primary}"${stroke ? ` stroke="${stroke}" stroke-width="1.5"` : ""}/>`);
    }
    rowIndex++;
    parts.push(`<text x="${PAD + swSize + Math.round(nameSize * 0.6)}" y="${textY}" font-family='${FONT}' font-weight="${nameWeight}" font-size="${nameSize.toFixed(1)}" fill="#fff">${esc(sector)}</text>`);
    rowTop += rowH + settings.legendGap;
  }

  // Bottom-left: the Substack QR, then the Eshap logo, one height, then the
  // scale note beside the logo. (QR files are recoloured white-on-dark by
  // fetchQrDataUri.)
  const markH = 92;
  const markTop = H - PAD - markH + settings.markOffsetY;
  let markX = PAD;
  if (assets.qrUri) {
    // As tall as the logo's letters (their cap height, not the whole mark),
    // and lined up with them — plus the QR's own nudge.
    const capH = markH * LOGO_CAP.height;
    parts.push(qrImage(assets.qrUri, markX, markTop + markH * LOGO_CAP.top + settings.qrOffsetY, capH, QR_QUIET_ZONE.substack));
    markX += capH + 28;
  }
  if (assets.logoUri) {
    const logoW = Math.round(markH * (2625 / 933)); // the logo file's proportions
    parts.push(`<image x="${markX}" y="${markTop}" width="${logoW}" height="${markH}" preserveAspectRatio="xMinYMid meet" href="${assets.logoUri}" xlink:href="${assets.logoUri}"/>`);
    markX += logoW + 36;
  } else {
    markX = Math.max(markX, PANEL_W + PAD);
  }
  // In the "N Companies" style (Book, 60% white):
  const noteStyle = `font-family='${FONT}' font-weight="400" font-size="${cSize}" fill="rgba(255,255,255,0.6)"`;
  const noteLH = 34;
  // The note stays put: it is centred on where the logo sits by default,
  // whatever the logo + QR nudge.
  const noteMid = H - PAD - markH / 2;
  const noteTop = noteMid - ((EXPORT_SCALE_NOTE.length - 1) * noteLH) / 2 + cSize * 0.34;
  parts.push(
    `<text ${noteStyle}>` +
      EXPORT_SCALE_NOTE.map((l, i) => `<tspan x="${markX}" y="${(noteTop + i * noteLH).toFixed(1)}">${esc(l)}</tspan>`).join("") +
      `</text>`,
  );
  // Bottom-right: the QR to the map, with its address underneath.
  const qrSize = 172;
  const qrMargin = 72;
  if (assets.mapQrUri) {
    const qrX = W - qrSize - qrMargin;
    const captionY = H - PAD;
    const qrY = captionY - cSize - 10 - qrSize;
    parts.push(qrImage(assets.mapQrUri, qrX, qrY, qrSize, QR_QUIET_ZONE.map));
    parts.push(`<text ${noteStyle} x="${qrX + qrSize / 2}" y="${captionY}" text-anchor="middle">${esc(EXPORT_MAP_URL_LABEL)}</text>`);
  }
  return `<g>${parts.join("")}</g>`;
}

/** Image px per slide unit at a map scale (see EXPORT_MAP_SCALE_FILL). */
export const exportPxPerUnit = (mapScale: number) => (EXPORT_H * mapScale) / CANVAS_DESKTOP.h;

/** Stripes in the legend's swatch for a sector keyed by a colour sweep (see gradientBands). */
const LEGEND_SWATCH_STRIPES = 4;
/** `n` colours spread evenly along a CSS gradient's colour list (its hex stops, in order). */
function gradientBands(gradient: string, n: number): string[] | null {
  const stops = gradient.match(/#[0-9a-f]{3,8}\b/gi) ?? [];
  if (stops.length < 2) return null;
  return Array.from({ length: n }, (_, i) => stops[Math.round((i * (stops.length - 1)) / Math.max(1, n - 1))]);
}

/** The lab's live preview: the image's frame inside the map area — as large as fits, centred. */
export function exportPreviewFrame(containerW: number, containerH: number, imageW: number = EXPORT_W) {
  const w = Math.min(containerW, (containerH * imageW) / EXPORT_H);
  const h = (w * EXPORT_H) / imageW;
  return { left: (containerW - w) / 2, top: (containerH - h) / 2, w, h };
}

/** Rasterize the composite SVG over the site's background gradient → PNG blob. */
function rasterize(rootSvg: string, W: number, bgStops?: [string, string, string]): Promise<Blob | null> {
  return new Promise((resolve) => {
    const H = EXPORT_H;
    const svgUrl = URL.createObjectURL(new Blob([rootSvg], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        resolve(null);
        return;
      }
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, bgStops?.[0] ?? "#080202");
      g.addColorStop(0.51, bgStops?.[1] ?? "#0a0f29");
      g.addColorStop(1, bgStops?.[2] ?? "#030118");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob((blob) => resolve(blob), "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      console.warn("[media-map] map export failed to rasterize");
      resolve(null);
    };
    img.src = svgUrl;
  });
}

export type ExportInput = {
  /** Live, settled present-year nodes (all enabled sectors). */
  nodes: PlanetNode[];
  connections: Array<{ from: string; to: string; style: "solid" | "dotted" }>;
  /** The site's rendered label size (screen px); the export shrinks it by EXPORT_LABEL_SIZE_DELTA. */
  labelSizePx: number;
  /** The site's type rules. When given they replace `labelSizePx` (and its shrink). */
  type?: ExportTypeRules | null;
  /**
   * Also print the market cap under the name of every company valued at or
   * above this ($B; 0 = all of them). Unset = Large Cap only, as on the map.
   */
  valuationMinB?: number | null;
  bounds: Bounds;
  year: number;
  /** Month of the map's current data (1–12), for the headline ("OCT. 2026"). */
  month?: number;
  sectors: string[];
  counts: Record<string, number>;
  /** Style-lab overrides (branch experiment): background stops + sector colours. */
  bgStops?: [string, string, string];
  sectorColorOverride?: (sector: string) => string | null;
  /** The overlay's adjustable parts (layout lab → Download); defaults otherwise. */
  panel?: ExportPanelSettings | null;
};

/** Name size per node: the map's large / small split, or one shrunk size without the type rules. */
function exportLabelPxOf(input: Pick<ExportInput, "type" | "labelSizePx">): (n: PlanetNode) => number {
  const type = input.type ?? null;
  const flatPx = Math.max(1, input.labelSizePx - EXPORT_LABEL_SIZE_DELTA);
  return (n) => (type ? (!n.isEntity && n.valuation_b >= type.thresholdB ? type.largePx : type.smallPx) : flatPx);
}

/** What making room for the names does to a layout — how the lab judges an arrangement. */
export type ExportLayoutStats = {
  /** Companies on the map (entities excluded). */
  companies: number;
  /** Names that carry a market cap. */
  withValuation: number;
  /** Planets the pass had to move more than 50 / 150 slide units. */
  moved50: number;
  moved150: number;
  /** The single largest move, and whose. */
  worst: { name: string; distance: number } | null;
  /** Pairs it could not separate. */
  unresolved: Array<[string, string]>;
};

/** Run the export's de-overlap pass on these nodes and report how far it moved things. */
export function measureExportLayout(
  input: Pick<ExportInput, "nodes" | "type" | "labelSizePx" | "bounds" | "valuationMinB">,
): ExportLayoutStats {
  const minB = input.valuationMinB ?? null;
  const r = computeExportLayout(input.nodes, exportLabelPxOf(input), EXPORT_SLIDE_UNITS_PER_PX, input.bounds, { valuationMinB: minB });
  let moved50 = 0, moved150 = 0;
  let worst: ExportLayoutStats["worst"] = null;
  for (const n of input.nodes) {
    const q = r.pos.get(n.name);
    const d = q ? Math.hypot(q.x - n.x, q.y - n.y) : 0;
    if (d > 50) moved50++;
    if (d > 150) moved150++;
    if (!worst || d > worst.distance) worst = { name: n.name, distance: d };
  }
  return {
    companies: input.nodes.filter((n) => !n.isEntity && n.valuation_b > 0).length,
    withValuation: r.withValuation.size,
    moved50,
    moved150,
    worst,
    unresolved: r.unresolved,
  };
}

/**
 * Build the export PNG: de-overlap the live layout, render the scene + panel,
 * rasterize. Logs any pairs the pass couldn't separate (both immovable).
 */
export async function buildExportPng(input: ExportInput): Promise<Blob | null> {
  // Yield once so the detached-root render below never runs inside a React
  // event dispatch / commit (flushSync must be called outside of those).
  await new Promise<void>((r) => setTimeout(r, 0));
  const type = input.type ?? null;
  const labelPx = exportLabelPxOf(input);
  const valuationMinB = input.valuationMinB ?? null;
  const { pos, unresolved } = computeExportLayout(input.nodes, labelPx, EXPORT_SLIDE_UNITS_PER_PX, input.bounds, { valuationMinB });
  if (import.meta.env.DEV) {
    // Dev-only handles for tuning: window.__exportProbe(minB) / __exportStats.
    const w = window as unknown as { __exportStats?: unknown; __exportProbe?: unknown };
    w.__exportProbe = (minB: number | null) => measureExportLayout({ ...input, valuationMinB: minB });
    w.__exportStats = measureExportLayout(input);
  }
  if (unresolved.length) {
    console.info(
      `[media-map] export: ${unresolved.length} overlap(s) could not be resolved — two pinned planets whose circles intersect, or a planet with no free space within 800 units. Adjust these in Sanity:`,
      unresolved.map(([a, b]) => `${a} ↔ ${b}`),
    );
  }
  const exportNodes: PlanetNode[] = input.nodes.map((n) => {
    const p = pos.get(n.name) ?? { x: n.x, y: n.y };
    return { ...n, x: p.x, y: p.y, r: n.isEntity ? 0 : n.targetR, fx: null, fy: null };
  });

  const mapMarkup = renderSvgMarkup(
    <ExportMapScene
      nodes={exportNodes}
      connections={input.connections}
      labelPx={labelPx}
      labelStrokePx={type?.strokePx ?? DEFAULT_LABEL_STROKE_PX}
      showValuation={(n) => exportShowsValuation(n, valuationMinB)}
      mapScale={(input.panel ?? DEFAULT_EXPORT_PANEL).mapScale}
      imageW={exportImageWidth(input.panel ?? DEFAULT_EXPORT_PANEL)}
      offsetX={(input.panel ?? DEFAULT_EXPORT_PANEL).mapOffsetX}
    />,
  );
  const [fontCss, assets] = await Promise.all([buildMapFontCss(), loadExportAssets()]);
  const panelSettings = input.panel ?? DEFAULT_EXPORT_PANEL;
  const panel = buildExportPanelMarkup({
    year: input.year,
    month: input.month ?? null,
    sectors: input.sectors,
    counts: input.counts,
    assets,
    settings: panelSettings,
    sectorColorOverride: input.sectorColorOverride,
  });
  const imageW = exportImageWidth(panelSettings);
  const root =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${imageW}" height="${EXPORT_H}" viewBox="0 0 ${imageW} ${EXPORT_H}">` +
    `<style>${fontCss}</style>${mapMarkup}${panel}</svg>`;
  return rasterize(root, imageW, input.bgStops);
}

/** Trigger a browser download of a prepared PNG blob. */
export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  const href = URL.createObjectURL(blob);
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
