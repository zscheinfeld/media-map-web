// The welcome card's illustration: a small starfield with five outlined
// "planets" in sector colours. Drawn from public/Game Mode Illustration.svg
// (Figma export) as live SVG so the planets can drift gently up and down.
// Stars carry the mockup's drop shadow (white 15%, blur 5, spread 2); the
// hollow planets carry the same shadow at half strength (7.5%).

const STARS: Array<[number, number, number]> = [
  [232.01, 62.04, 3.41],
  [284.62, 150.73, 1.86],
  [168.37, 72.8, 3.41],
  [139.64, 100.3, 3.41],
  [57.36, 139.22, 3.41],
  [134.81, 148.72, 1.05],
  [373.43, 17.91, 3.41],
  [332.21, 21.78, 1.34],
  [173.82, 127.96, 1.44],
  [90.49, 123.38, 1.44],
  [39.9, 92.25, 1.44],
  [471.87, 28.31, 1.44],
  [318.92, 89.02, 1.44],
  [334.97, 108.67, 0.72],
  [425.8, 20.39, 1.44],
  [156.47, 12.4, 2.76],
  [216.69, 23.64, 1.34],
  [188.1, 42.45, 1.34],
  [241.13, 91.34, 1.34],
  [348.16, 57.12, 1.34],
  [327.76, 143.85, 4.56],
];

const PLANETS: Array<{ cx: number; cy: number; r: number; color: string }> = [
  { cx: 97.95, cy: 52.0, r: 33.34, color: "#53A11E" },
  { cx: 213.96, cy: 128.59, r: 15.2, color: "#FFC000" },
  { cx: 279.29, cy: 111.13, r: 8.01, color: "#3657FD" },
  { cx: 279.99, cy: 40.17, r: 28.98, color: "#EF1A1A" },
  { cx: 428.46, cy: 98.6, r: 56.36, color: "#9437FF" },
];

// Each planet bobs on its own period and phase so they never move in lockstep.
const BOB = [
  { px: 3, s: 4.6, delay: -0.4 },
  { px: 2.5, s: 3.8, delay: -1.9 },
  { px: 2, s: 3.2, delay: -0.9 },
  { px: 3, s: 5.2, delay: -2.6 },
  { px: 3.5, s: 6.0, delay: -1.2 },
];

export function GameIllustration({ height = 160, intense = false }: { height?: number; intense?: boolean }) {
  return (
    <svg
      viewBox="0 0 561 160"
      role="img"
      aria-label="Planets drifting among the stars"
      style={{ display: "block", width: "100%", maxWidth: (561 * height) / 160, height: "auto", margin: "0 auto", overflow: "visible" }}
    >
      <defs>
        {/* Figma drop shadow: X 0, Y 0, blur 5 (stdDeviation 2.5), spread 2, #FFFFFF 15% — on the stars. */}
        {/* The shadow's region covers the whole drawing (plus bob room) in user space — a
            per-element %-region is too tight around the 1–3px stars and crops the
            halo into a visible square. */}
        <filter id="game-illus-shadow" filterUnits="userSpaceOnUse" x={-20} y={-20} width={601} height={200} colorInterpolationFilters="sRGB">
          <feMorphology radius="2" operator="dilate" in="SourceAlpha" result="spread" />
          <feGaussianBlur in="spread" stdDeviation="2.5" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.15 0" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Planets (hollow, coloured stroke): the same shadow at half strength. */}
        {/* Stars while Get Started is hovered: stronger, wider glow. */}
        <filter id="game-illus-shadow-intense" filterUnits="userSpaceOnUse" x={-20} y={-20} width={601} height={200} colorInterpolationFilters="sRGB">
          <feMorphology radius="3" operator="dilate" in="SourceAlpha" result="spread" />
          <feGaussianBlur in="spread" stdDeviation="4" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.35 0" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="game-illus-shadow-soft" filterUnits="userSpaceOnUse" x={-20} y={-20} width={601} height={200} colorInterpolationFilters="sRGB">
          <feMorphology radius="2" operator="dilate" in="SourceAlpha" result="spread" />
          <feGaussianBlur in="spread" stdDeviation="2.5" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.075 0" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {STARS.map(([cx, cy, r], i) => (
        <g key={`s${i}`}>
          <circle cx={cx} cy={cy} r={r} fill="#fff" filter="url(#game-illus-shadow)" />
          {/* Brighter glow on Get Started hover; fades in (filters can't transition). */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="#fff"
            filter="url(#game-illus-shadow-intense)"
            style={{ opacity: intense ? 1 : 0, transition: "opacity 300ms ease" }}
          />
        </g>
      ))}
      {PLANETS.map((p, i) => (
        <g
          key={`p${i}`}
          className="mm-bob"
          style={{
            ["--bob" as string]: `${BOB[i].px}px`,
            animationDuration: `${BOB[i].s}s`,
            animationDelay: `${BOB[i].delay}s`,
          }}
        >
          {/* On Get Started hover the ring fills with its own colour at 50%. */}
          <circle
            cx={p.cx}
            cy={p.cy}
            r={p.r}
            fill={p.color}
            style={{ fillOpacity: intense ? 0.5 : 0, transition: "fill-opacity 300ms ease" }}
          />
          <circle cx={p.cx} cy={p.cy} r={p.r} fill="none" stroke={p.color} strokeWidth={1} filter="url(#game-illus-shadow-soft)" />
        </g>
      ))}
    </svg>
  );
}

// ---- Countdown backdrop -----------------------------------------------------
// The countdown card's background: a denser field of rings and stars that runs
// off the card's edges (the card clips it). Positions from the Figma mockup, in
// the units of a 1368×885 card; the SVG scales them to the real card size.

const COUNT_RINGS: Array<{ cx: number; cy: number; r: number; color: string }> = [
  { cx: 83, cy: 83, r: 117, color: "#53A11E" },
  { cx: 716, cy: 23, r: 62, color: "#EF1A1A" },
  { cx: 1245, cy: 135, r: 175, color: "#9437FF" },
  { cx: 493, cy: 282, r: 43, color: "#FCFC06" },
  { cx: 1067, cy: 423, r: 28, color: "#3657FD" },
  { cx: 1271, cy: 515, r: 43, color: "#FCFC06" },
  { cx: 280, cy: 581, r: 75, color: "#EF1A1A" },
  { cx: 860, cy: 737, r: 178, color: "#53A11E" },
  { cx: 1360, cy: 692, r: 45, color: "#3657FD" },
  { cx: 5, cy: 775, r: 45, color: "#FCFC06" },
  { cx: 457, cy: 800, r: 20, color: "#3657FD" },
];

const COUNT_STARS: Array<[number, number, number]> = [
  [397, 50, 4.0],
  [520, 93, 11.0],
  [954, 101, 4.0],
  [328, 156, 5.0],
  [228, 252, 21.0],
  [852, 212, 5.0],
  [908, 281, 2.67],
  [1007, 267, 4.0],
  [57, 331, 5.0],
  [347, 348, 5.0],
  [1237, 375, 15.0],
  [927, 403, 15.0],
  [211, 420, 4.0],
  [71, 549, 11.0],
  [995, 553, 6.0],
  [1140, 543, 4.0],
  [1142, 636, 4.0],
  [462, 675, 4.0],
  [168, 738, 4.0],
  [305, 776, 11.0],
  [1176, 793, 30.0],
];

export function CountdownBackdrop() {
  return (
    <svg
      viewBox="0 0 1368 885"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
    >
      <defs>
        {/* Drop shadow in screen terms (≈ blur 5 / spread 2 at the card's size). */}
        <filter id="count-shadow" filterUnits="userSpaceOnUse" x={-200} y={-200} width={1768} height={1285} colorInterpolationFilters="sRGB">
          <feMorphology radius="4" operator="dilate" in="SourceAlpha" result="spread" />
          <feGaussianBlur in="spread" stdDeviation="5" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.15 0" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="count-shadow-soft" filterUnits="userSpaceOnUse" x={-200} y={-200} width={1768} height={1285} colorInterpolationFilters="sRGB">
          <feMorphology radius="4" operator="dilate" in="SourceAlpha" result="spread" />
          <feGaussianBlur in="spread" stdDeviation="5" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.075 0" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {COUNT_STARS.map(([cx, cy, r], i) => (
        <circle key={`s${i}`} cx={cx} cy={cy} r={r} fill="#fff" filter="url(#count-shadow)" />
      ))}
      {COUNT_RINGS.map((p, i) => (
        <g
          key={`r${i}`}
          className="mm-bob"
          style={{
            ["--bob" as string]: `${4 + (i % 3) * 2}px`,
            animationDuration: `${3.4 + (i % 5) * 0.7}s`,
            animationDelay: `${-0.6 * i}s`,
          }}
        >
          <circle cx={p.cx} cy={p.cy} r={p.r} fill="none" stroke={p.color} strokeWidth={4} filter="url(#count-shadow-soft)" />
        </g>
      ))}
    </svg>
  );
}
