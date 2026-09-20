// Static PNG export of the present-year map (3840×2160, 16:9): the full
// canonical desktop canvas right-aligned into the frame, a left info panel that
// mirrors the site's side panel, and the Substack QR.
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
import { flatStyleForSector, hueForSector } from "./sectors";
import {
  EXPORT_H,
  EXPORT_PANEL_W,
  EXPORT_SLIDE_UNITS_PER_PX,
  EXPORT_W,
  ExportMapScene,
} from "./exportScene";

// Label font shrink (screen-px semantics) for the export only — smaller text
// boxes fit dense clusters of small planets more easily. 0 = same as the site.
export const EXPORT_LABEL_SIZE_DELTA = 1.5;

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

/**
 * Half-extents (slide units) of a node's rendered label box, mirroring Planet's
 * `renderNameLabel`: one word per line at `labelPx`, the name at weight 500 with
 * 2% tracking, plus a valuation line (weight 400, 15% gap) for Large Cap.
 */
export function exportLabelHalfExtents(
  n: PlanetNode,
  labelPx: number,
  su: number,
): { hw: number; hh: number } {
  const words = (n.labelText ?? n.name).trim().split(/\s+/);
  let maxW = 0;
  for (const w of words) {
    maxW = Math.max(maxW, measureLabelTextWidth(w, labelPx, 500) + 0.02 * labelPx * w.length);
  }
  const withVal = !n.isEntity && n.sector === "Large Cap";
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
  labelPx: number,
  su: number,
  bounds: Bounds,
  opts: { sweeps?: number; relax?: number } = {},
): { pos: Map<string, { x: number; y: number }>; unresolved: Array<[string, string]>; sweeps: number } {
  const maxSweeps = opts.sweeps ?? EXPORT_MAX_SWEEPS;
  const relax = opts.relax ?? EXPORT_RELAX;
  const shapes: ExportShape[] = nodes.map((n) => {
    const { hw, hh } = exportLabelHalfExtents(n, labelPx, su);
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

  return { pos: new Map(shapes.map((s) => [s.name, { x: s.x, y: s.y }])), unresolved, sweeps: sweepsRun };
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

/** Left info panel (matches the site side panel's type styles) + the QR. */
function buildPanelMarkup(
  year: number,
  sectors: string[],
  counts: Record<string, number>,
  logoUri: string | null,
  qrUri: string | null,
): string {
  const W = EXPORT_W, H = EXPORT_H, PANEL_W = EXPORT_PANEL_W;
  const FONT = LABEL_FONT_FAMILY;
  const PAD = 56;
  const sectorTotal = sectors.length;
  const companyTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${PANEL_W}" height="${H}" fill="#05060f"/>`);

  // Headline: MEDIA / UNIVERSE / {year} (uppercase, Demi 600, -1% tracking, 90% lh).
  const hlSize = 58;
  const hlLH = hlSize * 0.9;
  const hlLines = ["MEDIA", "UNIVERSE", String(year)];
  let cy = PAD + hlSize;
  parts.push(
    `<text font-family='${FONT}' font-weight="600" font-size="${hlSize}" fill="#fff" letter-spacing="${(-0.01 * hlSize).toFixed(2)}" style="text-transform:uppercase">` +
      hlLines.map((l, i) => `<tspan x="${PAD}" y="${cy + i * hlLH}">${esc(l)}</tspan>`).join("") +
      `</text>`,
  );
  cy += (hlLines.length - 1) * hlLH + 68;

  // Counts.
  const cSize = 26;
  parts.push(`<text x="${PAD}" y="${cy}" font-family='${FONT}' font-weight="500" font-size="${cSize}" fill="#fff">${sectorTotal} Sectors</text>`);
  cy += 34;
  parts.push(`<text x="${PAD}" y="${cy}" font-family='${FONT}' font-weight="400" font-size="${cSize}" fill="rgba(255,255,255,0.6)">${companyTotal} Companies</text>`);
  cy += 62;

  // Legend — one subtle rounded container per sector (matches the sidebar rows),
  // with vertical padding for breathing room. Contents: swatch + name + count.
  const logoReserve = 150;
  const rowGap = 10;
  const availH = H - cy - PAD - logoReserve;
  const containerH = Math.min(66, (availH - (sectorTotal - 1) * rowGap) / Math.max(1, sectorTotal));
  const nameSize = 24;
  const swSize = Math.min(28, containerH - 22);
  const innerPadX = 18;
  const rowW = PANEL_W - PAD * 2;
  let rowTop = cy;
  for (const s of sectors) {
    const flat = flatStyleForSector(s);
    const primary = flat?.fill ?? flat?.stripes?.[0] ?? `hsl(${hueForSector(s)}, 70%, 55%)`;
    const stroke = flat?.stroke && flat.stroke !== "transparent" ? flat.stroke : null;
    const midY = rowTop + containerH / 2;
    const textY = (midY + nameSize * 0.34).toFixed(1); // baseline for vertical center
    const swY = (midY - swSize / 2).toFixed(1);
    parts.push(`<rect x="${PAD}" y="${rowTop.toFixed(1)}" width="${rowW}" height="${containerH.toFixed(1)}" rx="8" fill="rgba(255,255,255,0.05)"/>`);
    parts.push(`<rect x="${PAD + innerPadX}" y="${swY}" width="${swSize}" height="${swSize}" rx="5" fill="${primary}"${stroke ? ` stroke="${stroke}" stroke-width="1.5"` : ""}/>`);
    parts.push(`<text x="${PAD + innerPadX + swSize + 14}" y="${textY}" font-family='${FONT}' font-weight="500" font-size="${nameSize}" fill="#fff">${esc(s)}</text>`);
    parts.push(`<text x="${PANEL_W - PAD - innerPadX}" y="${textY}" text-anchor="end" font-family='${FONT}' font-weight="400" font-size="${nameSize}" fill="rgba(255,255,255,0.55)">${counts[s] ?? 0}</text>`);
    rowTop += containerH + rowGap;
  }

  // Eshap logo — bottom-left.
  if (logoUri) {
    const logoH = 70;
    parts.push(`<image x="${PAD}" y="${H - PAD - logoH}" width="200" height="${logoH}" preserveAspectRatio="xMinYMid meet" href="${logoUri}" xlink:href="${logoUri}"/>`);
  }

  // Substack QR — bottom-right over the map (the SVG is pre-inverted: white
  // modules on #070111 so it sits quietly on the dark background).
  const qrSize = 188;
  const qrMargin = 72;
  const qr = qrUri
    ? `<image x="${W - qrSize - qrMargin}" y="${H - qrSize - qrMargin}" width="${qrSize}" height="${qrSize}" href="${qrUri}" xlink:href="${qrUri}"/>`
    : "";
  return `<g>${parts.join("")}</g>${qr}`;
}

/** Rasterize the composite SVG over the site's background gradient → PNG blob. */
function rasterize(rootSvg: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const W = EXPORT_W, H = EXPORT_H;
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
      g.addColorStop(0, "#1E0300");
      g.addColorStop(0.51, "#010C4C");
      g.addColorStop(1, "#070010");
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
  bounds: Bounds;
  year: number;
  sectors: string[];
  counts: Record<string, number>;
};

/**
 * Build the export PNG: de-overlap the live layout, render the scene + panel,
 * rasterize. Logs any pairs the pass couldn't separate (both immovable).
 */
export async function buildExportPng(input: ExportInput): Promise<Blob | null> {
  // Yield once so the detached-root render below never runs inside a React
  // event dispatch / commit (flushSync must be called outside of those).
  await new Promise<void>((r) => setTimeout(r, 0));
  const labelPx = Math.max(1, input.labelSizePx - EXPORT_LABEL_SIZE_DELTA);
  const { pos, unresolved } = computeExportLayout(input.nodes, labelPx, EXPORT_SLIDE_UNITS_PER_PX, input.bounds);
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
    <ExportMapScene nodes={exportNodes} connections={input.connections} labelPx={labelPx} />,
  );
  const [fontCss, logoUri, qrUri] = await Promise.all([
    buildMapFontCss(),
    fetchDataUri("/Evan-logo-new.png"),
    fetchDataUri("/Eshap_QR.svg"),
  ]);
  const panel = buildPanelMarkup(input.year, input.sectors, input.counts, logoUri, qrUri);
  const root =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${EXPORT_W}" height="${EXPORT_H}" viewBox="0 0 ${EXPORT_W} ${EXPORT_H}">` +
    `<style>${fontCss}</style>${mapMarkup}${panel}</svg>`;
  return rasterize(root);
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
