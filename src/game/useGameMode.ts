// Easter-egg "game mode": click the Eshap logo and the map becomes a Pong-style
// rescue. The logo flies to the bottom of the map and becomes the paddle; every
// planet launches (in waves, smallest first — so Large Cap goes last) and
// ricochets off the viewport's top/left/right edges and off the Large Cap
// planets, which stay solid whether parked or in flight. Anything that reaches
// the bottom edge falls out of the universe unless the paddle bounces it back.
// Ninety seconds; the score is the market cap still in play.
//
// The game drives node.x/y directly while it runs (the d3 sim is suspended via
// usePhysicsLayout's `suspended` option) and restores the pre-game layout on
// exit, so the map hands back exactly as it was. Motion is simulated in slide
// units; the paddle is an HTML <img> positioned in screen px and converted each
// frame. Desktop only (mouse + arrow keys).

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { PlanetNode } from "@media-map/map-core";

export type GamePhase = "idle" | "countdown" | "playing" | "ended";

export const GAME_SECONDS = 90;
const COUNTDOWN_FROM = 5;
const REPLAY_COUNTDOWN_FROM = 3;
/** Waves launch across this window; the rest of the round is pure catching
 *  (the final, Large Cap wave arrives with ~20s left). */
const RELEASE_WINDOW_S = 70;
const WAVES = 18;
/** Planet speed in slide units / s, first wave → last wave. */
const SPEED_MIN = 520;
const SPEED_MAX = 820;
/** Paddle (the logo) width in px — larger than the sidebar logo so it's catchable. */
export const PADDLE_W = 150;
const PADDLE_KEY_SPEED = 1100; // px/s with ← / →
const MAX_BOUNCE = Math.PI / 3; // 60° off vertical when a planet hits the paddle's edge
const OBSTACLE_SECTOR = "Large Cap";

type Mover = {
  node: PlanetNode;
  vx: number;
  vy: number;
  speed: number;
  /** Collision radius. Entities are text-only (r = 0), so they use their label extent. */
  cr: number;
  releaseAt: number; // seconds after play starts
  active: boolean;
  lost: boolean;
};

/** The visible viewport in slide units (the game's walls) + the px→slide scale. */
type Walls = { x0: number; y0: number; x1: number; y1: number; supp: number };

/** Screen-px rect for the paddle <img>. `animate` = CSS-transition its travel. */
export type PaddleRect = { left: number; top: number; w: number; h: number; animate: boolean };

export type GameHud = {
  timeLeft: number;
  savedCap: number;
  savedCount: number;
  /** Names of planets that fell through — the renderer hides these. */
  lost: Set<string>;
};

const EMPTY_HUD: GameHud = { timeLeft: GAME_SECONDS, savedCap: 0, savedCount: 0, lost: new Set() };

export function useGameMode({
  nodes,
  enabled,
  containerRef,
  logoRef,
  containerW,
  containerH,
  canvas,
  slideUnitsPerPx,
  onActiveChange,
  onStart,
  onExit,
}: {
  nodes: PlanetNode[];
  enabled: boolean;
  /** The map's scroll/measure container (the paddle and walls are relative to it). */
  containerRef: RefObject<HTMLDivElement | null>;
  /** The sidebar logo — the paddle's travel starts from its on-screen rect. */
  logoRef: RefObject<HTMLElement | null>;
  containerW: number;
  containerH: number;
  canvas: { x: number; y: number; w: number; h: number };
  /** Slide units per screen px at zoom 1 (the game locks the view there). */
  slideUnitsPerPx: number;
  /** Fires with true on start and false on exit — the app suspends physics on it. */
  onActiveChange: (active: boolean) => void;
  /** App-side prep: close panels, switch to Map view, reset zoom. */
  onStart: () => void;
  onExit: () => void;
}) {
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM);
  const [hud, setHud] = useState<GameHud>(EMPTY_HUD);
  const [totals, setTotals] = useState({ cap: 0, count: 0 });
  const [paddle, setPaddle] = useState<PaddleRect | null>(null);

  // Latest props, mirrored before paint so the rAF loop / listeners read fresh
  // values without re-subscribing.
  const propsRef = useRef({ nodes, containerW, containerH, canvas, slideUnitsPerPx, onActiveChange, onStart, onExit });
  useLayoutEffect(() => {
    propsRef.current = { nodes, containerW, containerH, canvas, slideUnitsPerPx, onActiveChange, onStart, onExit };
  });

  const phaseRef = useRef<GamePhase>("idle");
  const moversRef = useRef<Mover[]>([]);
  const obstaclesRef = useRef<PlanetNode[]>([]);
  const wallsRef = useRef<Walls | null>(null);
  // Pre-game layout, holding the node objects themselves so `restore` writes
  // through the ref (the game owns node.x/y while it runs).
  const snapshotRef = useRef<Array<{ node: PlanetNode; x: number; y: number }>>([]);
  const rafRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const t0Ref = useRef(0);
  const lastFrameRef = useRef(0);
  // Paddle: center x in container px, fixed geometry measured from the logo.
  const paddleXRef = useRef(0);
  const paddleGeomRef = useRef({ h: 44, bottomGap: 16 });
  const containerRectRef = useRef<DOMRect | null>(null);
  const keysRef = useRef({ left: false, right: false });
  const lostRef = useRef<Set<string>>(new Set());
  const savedCapRef = useRef(0);
  const savedCountRef = useRef(0);

  const setPhaseBoth = (p: GamePhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const stopLoops = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
  };

  /** Put every planet back where it was before the game. */
  const restore = () => {
    for (const { node, x, y } of snapshotRef.current) {
      node.x = x;
      node.y = y;
      node.vx = 0;
      node.vy = 0;
    }
    moversRef.current = [];
    lostRef.current = new Set();
  };

  const finish = () => {
    stopLoops();
    setPhaseBoth("ended");
  };

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - lastFrameRef.current) / 1000);
    lastFrameRef.current = now;
    const elapsed = (now - t0Ref.current) / 1000;
    if (elapsed >= GAME_SECONDS) {
      setHud({ timeLeft: 0, savedCap: savedCapRef.current, savedCount: savedCountRef.current, lost: lostRef.current });
      finish();
      return;
    }
    const walls = wallsRef.current;
    const cRect = containerRectRef.current;
    if (!walls || !cRect) return;

    // Paddle: keys nudge it; the mouse sets it directly (listener below).
    const keys = keysRef.current;
    if (keys.left !== keys.right) {
      paddleXRef.current += (keys.right ? 1 : -1) * PADDLE_KEY_SPEED * dt;
    }
    paddleXRef.current = Math.max(PADDLE_W / 2, Math.min(cRect.width - PADDLE_W / 2, paddleXRef.current));
    const geom = paddleGeomRef.current;
    const paddleTopPx = cRect.height - geom.bottomGap - geom.h;
    // Paddle in slide units.
    const pTop = walls.y0 + paddleTopPx * walls.supp;
    const pLeft = walls.x0 + (paddleXRef.current - PADDLE_W / 2) * walls.supp;
    const pRight = pLeft + PADDLE_W * walls.supp;
    const pMid = (pLeft + pRight) / 2;
    const pHalf = (pRight - pLeft) / 2;

    const obstacles = obstaclesRef.current;
    let lostChanged = false;
    for (const m of moversRef.current) {
      if (m.lost) continue;
      if (!m.active) {
        if (elapsed < m.releaseAt) continue;
        m.active = true;
      }
      const n = m.node;
      const yBefore = n.y; // for the swept paddle test below
      n.x += m.vx * dt;
      n.y += m.vy * dt;

      // Side + top walls.
      if (n.x - m.cr < walls.x0) { n.x = walls.x0 + m.cr; m.vx = Math.abs(m.vx); }
      else if (n.x + m.cr > walls.x1) { n.x = walls.x1 - m.cr; m.vx = -Math.abs(m.vx); }
      if (n.y - m.cr < walls.y0) { n.y = walls.y0 + m.cr; m.vy = Math.abs(m.vy); }

      // Large Cap planets: solid, reflect off the surface normal.
      for (const o of obstacles) {
        if (o === n) continue;
        const dx = n.x - o.x;
        const dy = n.y - o.y;
        const minD = m.cr + o.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        n.x = o.x + nx * minD;
        n.y = o.y + ny * minD;
        const dot = m.vx * nx + m.vy * ny;
        if (dot < 0) {
          m.vx -= 2 * dot * nx;
          m.vy -= 2 * dot * ny;
        }
      }

      // Paddle: a swept test on the TOP face — the planet's bottom edge was at
      // or above the paddle's top line at the start of this frame and is at or
      // below it now, so it crossed the face during the frame. Speed-proof (no
      // tunnelling for small fast planets), and a planet that was already past
      // the line can't be scooped up by sliding the paddle into it from the
      // side. Its centre must also be over the paddle, not just grazing a corner.
      // The exit angle depends on where along the paddle it hit.
      if (
        m.vy > 0 &&
        yBefore + m.cr <= pTop + 2 &&
        n.y + m.cr >= pTop &&
        n.x >= pLeft - m.cr * 0.5 &&
        n.x <= pRight + m.cr * 0.5
      ) {
        const offset = Math.max(-1, Math.min(1, (n.x - pMid) / pHalf));
        const angle = offset * MAX_BOUNCE;
        m.vx = m.speed * Math.sin(angle);
        m.vy = -m.speed * Math.cos(angle);
        n.y = pTop - m.cr;
      }

      // Fell out the bottom.
      if (n.y - m.cr > walls.y1) {
        m.lost = true;
        m.active = false;
        lostRef.current = new Set(lostRef.current).add(n.name);
        savedCapRef.current -= n.valuation_b;
        savedCountRef.current -= 1;
        lostChanged = true;
        // Park it off-canvas so nothing (hover, export) can find it mid-game.
        n.y = walls.y1 + 10_000;
      }
    }

    setHud((h) => ({
      timeLeft: Math.max(0, Math.ceil(GAME_SECONDS - elapsed)),
      savedCap: savedCapRef.current,
      savedCount: savedCountRef.current,
      lost: lostChanged ? lostRef.current : h.lost,
    }));
    const left = cRect.left + paddleXRef.current - PADDLE_W / 2;
    setPaddle((p) => (p && p.left === left && !p.animate ? p : p ? { ...p, left, animate: false } : p));
    rafRef.current = requestAnimationFrame(frame);
  };

  const beginPlay = () => {
    const { nodes, containerW, containerH, canvas, slideUnitsPerPx: supp } = propsRef.current;
    // Walls = the visible viewport at zoom 1 ("meet" fit, centered on the canvas).
    const visW = containerW * supp;
    const visH = containerH * supp;
    const x0 = canvas.x + canvas.w / 2 - visW / 2;
    const y0 = canvas.y + canvas.h / 2 - visH / 2;
    wallsRef.current = { x0, y0, x1: x0 + visW, y1: y0 + visH, supp };

    // Large Cap planets are solid for everyone else (read live, so they stay
    // solid once they launch too). Everything launches, smallest first.
    obstaclesRef.current = nodes.filter((n) => n.sector === OBSTACLE_SECTOR && !n.isEntity);
    const launchable = [...nodes].sort((a, b) => a.valuation_b - b.valuation_b);
    const perWave = Math.max(1, Math.ceil(launchable.length / WAVES));
    const waveGap = RELEASE_WINDOW_S / Math.max(1, WAVES - 1);
    moversRef.current = launchable.map((node, i) => {
      const wave = Math.floor(i / perWave);
      const k = wave / Math.max(1, WAVES - 1);
      const speed = SPEED_MIN + (SPEED_MAX - SPEED_MIN) * k;
      // Random heading, but never near-horizontal (it would shuttle between the
      // side walls forever and never threaten the bottom).
      const theta = Math.random() * Math.PI * 2;
      let vx = Math.cos(theta) * speed;
      let vy = Math.sin(theta) * speed;
      if (Math.abs(vy) < 0.35 * speed) {
        vy = Math.sign(vy || 1) * 0.35 * speed;
        vx = Math.sign(vx || 1) * Math.sqrt(speed * speed - vy * vy);
      }
      return {
        node,
        vx,
        vy,
        speed,
        cr: node.isEntity ? Math.max(24, (node.labelRadius ?? 0) * 0.6) : node.r,
        releaseAt: wave * waveGap,
        active: false,
        lost: false,
      };
    });
    const cap = launchable.reduce((s, n) => s + n.valuation_b, 0);
    savedCapRef.current = cap;
    savedCountRef.current = launchable.length;
    lostRef.current = new Set();
    setTotals({ cap, count: launchable.length });
    setHud({ timeLeft: GAME_SECONDS, savedCap: cap, savedCount: launchable.length, lost: lostRef.current });
    keysRef.current = { left: false, right: false };

    setPhaseBoth("playing");
    t0Ref.current = performance.now();
    lastFrameRef.current = t0Ref.current;
    rafRef.current = requestAnimationFrame(frame);
  };

  const startCountdown = (from: number) => {
    setCountdown(from);
    setPhaseBoth("countdown");
    let n = from;
    countdownTimerRef.current = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        beginPlay();
      } else {
        setCountdown(n);
      }
    }, 1000);
  };

  const start = useCallback(() => {
    if (!enabled || phaseRef.current !== "idle") return;
    const container = containerRef.current;
    const logo = logoRef.current;
    if (!container || !logo) return;
    const { nodes, onActiveChange, onStart } = propsRef.current;
    if (nodes.length === 0) return;

    snapshotRef.current = nodes.map((n) => ({ node: n, x: n.x, y: n.y }));
    // Show the full stake on the HUD during the countdown (play recomputes it).
    setTotals({ cap: nodes.reduce((sum, n) => sum + n.valuation_b, 0), count: nodes.length });

    // The paddle starts as the sidebar logo (same rect), then flies to bottom
    // center of the map keeping the logo's distance from the bottom edge.
    const cRect = container.getBoundingClientRect();
    const lRect = logo.getBoundingClientRect();
    containerRectRef.current = cRect;
    const aspect = lRect.width > 0 ? lRect.height / lRect.width : 0.45;
    const h = PADDLE_W * aspect;
    const bottomGap = Math.max(8, cRect.bottom - lRect.bottom);
    paddleGeomRef.current = { h, bottomGap };
    paddleXRef.current = cRect.width / 2;
    setPaddle({ left: lRect.left, top: lRect.top, w: lRect.width, h: lRect.height, animate: false });
    window.setTimeout(() => {
      setPaddle({
        left: cRect.left + cRect.width / 2 - PADDLE_W / 2,
        top: cRect.bottom - bottomGap - h,
        w: PADDLE_W,
        h,
        animate: true,
      });
    }, 40);

    onActiveChange(true);
    onStart();
    startCountdown(COUNTDOWN_FROM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, containerRef, logoRef]);

  const exit = useCallback(() => {
    if (phaseRef.current === "idle") return;
    stopLoops();
    restore();
    setPaddle(null);
    setHud(EMPTY_HUD);
    setPhaseBoth("idle");
    propsRef.current.onActiveChange(false);
    propsRef.current.onExit();
  }, []);

  const replay = useCallback(() => {
    if (phaseRef.current !== "ended") return;
    restore();
    // Re-measure in case the window changed; paddle snaps back to center.
    const container = containerRef.current;
    if (container) containerRectRef.current = container.getBoundingClientRect();
    const cRect = containerRectRef.current;
    if (cRect) {
      paddleXRef.current = cRect.width / 2;
      setPaddle((p) => (p ? { ...p, left: cRect.left + cRect.width / 2 - PADDLE_W / 2, animate: true } : p));
    }
    setHud({ ...EMPTY_HUD, lost: new Set() });
    startCountdown(REPLAY_COUNTDOWN_FROM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  // Controls while the game is up: Esc leaves, ← → and the mouse drive the paddle.
  useEffect(() => {
    if (phase === "idle") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        exit();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        keysRef.current.left = true;
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        keysRef.current.right = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") keysRef.current.left = false;
      else if (e.key === "ArrowRight") keysRef.current.right = false;
    };
    const onMove = (e: MouseEvent) => {
      const r = containerRectRef.current;
      // Only while playing, and only while the cursor is over the map: during
      // the countdown the mouse is still parked on the sidebar logo, and that
      // used to yank the paddle to the left edge the moment play began.
      if (!r || phaseRef.current !== "playing" || e.clientX < r.left || e.clientX > r.right) return;
      paddleXRef.current = Math.max(PADDLE_W / 2, Math.min(r.width - PADDLE_W / 2, e.clientX - r.left));
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMove);
    };
  }, [phase, exit]);

  // Tear down on unmount.
  useEffect(() => stopLoops, []);

  return {
    phase,
    active: phase !== "idle",
    countdown,
    hud,
    totals,
    paddle,
    start,
    exit,
    replay,
  };
}
