// The layout-lab editing panel (?layout=1). Device + year + reload up top, then
// three tabs — Physics, Type, Arrange — and copy/download/paste of the whole
// state as JSON so a layout can be shared or baked into preset.ts.
// Shift+L hides/shows it.

import { useState } from "react";
import {
  DEVICE_LABELS,
  LAB_DEVICES,
  LAB_DEVICE_LABELS,
  TABLET_MIN_WIDTH,
  normalizeLayout,
  seedFor,
  type DeviceMode,
  type LayoutKnobs,
  type LayoutLab,
} from "./layoutLab";

const FONT = '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif';
export const LAYOUT_PANEL_W = 340;
const ACCENT = "#a7f3d0";
const ACCENT_INK = "#06281c";

type Tab = "physics" | "type" | "arrange";

const field: React.CSSProperties = {
  background: "#0e1116",
  color: "#e6e9ef",
  border: "1px solid #2a313b",
  borderRadius: 6,
  padding: "4px 6px",
  font: "inherit",
  fontSize: 12,
};
const btn: React.CSSProperties = {
  background: "#1d2229",
  color: "#e6e9ef",
  border: "1px solid #2a313b",
  borderRadius: 7,
  padding: "5px 10px",
  font: "inherit",
  fontSize: 12,
  cursor: "pointer",
};
const primary: React.CSSProperties = { ...btn, background: ACCENT, color: ACCENT_INK, border: `1px solid ${ACCENT}`, fontWeight: 600 };
const plain: React.CSSProperties = { ...btn, fontWeight: 400 };
const fs: React.CSSProperties = { border: "1px solid #2a313b", borderRadius: 10, margin: "0 0 12px", padding: "10px 12px 4px", background: "#1d2229" };
const lg: React.CSSProperties = { fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: "#8f98a6", padding: "0 6px", fontWeight: 600 };
const hint: React.CSSProperties = { fontSize: 11, color: "#8f98a6", lineHeight: 1.35, margin: "0 0 8px" };

type KnobDef = { key: keyof LayoutKnobs; label: string; min: number; max: number; step: number; digits?: number; prefix?: string; suffix?: string; hint?: string };

const SANITY_KNOBS: KnobDef[] = [
  { key: "packingDensity", label: "Planet size", min: 0.05, max: 1.2, step: 0.01, digits: 2, hint: "Share of the canvas covered by planets" },
  { key: "collidePadding", label: "Planet gap", min: 0, max: 160, step: 1, hint: "Minimum space between any two planets" },
  { key: "sizeSpacing", label: "Size-scaled gap", min: 0, max: 0.6, step: 0.01, digits: 2, hint: "Extra space around bigger planets" },
  { key: "sectorPull", label: "Sector pull", min: 0, max: 0.3, step: 0.005, digits: 3, hint: "How tightly planets hug their sector's well" },
  { key: "repulsion", label: "Spread", min: 0, max: 400, step: 1, hint: "Every planet pushes every other away" },
  { key: "connectionPull", label: "Connection pull", min: 0, max: 1.5, step: 0.01, digits: 2 },
  { key: "entityRadius", label: "Entity radius", min: 0, max: 300, step: 2, hint: "Room reserved around text-only entities" },
];
const PACK_KNOBS: KnobDef[] = [
  { key: "gapFill", label: "Gap fill", min: 0, max: 1, step: 0.01, digits: 2, hint: "Pulls small planets into empty pockets inside the cluster" },
  { key: "gapMin", label: "Gap size", min: 0, max: 400, step: 5, hint: "How empty a spot must be before it gets filled" },
  { key: "centerPull", label: "Center pull", min: 0, max: 0.2, step: 0.002, digits: 3, hint: "Draws the whole map toward the middle" },
  { key: "labelFootprint", label: "Label footprint", min: 0, max: 1.5, step: 0.01, digits: 2, hint: "How much of a name's box counts toward spacing — lower packs tighter, names may touch" },
];
const NAME_KNOBS: KnobDef[] = [
  { key: "nameThreshold", label: "Hide names under", min: 0, max: 60, step: 1, suffix: "px", hint: "Planets smaller than this on screen never show a name until hovered" },
  { key: "nameSpacing", label: "Name breathing room", min: 0, max: 60, step: 1, suffix: "px", hint: "Clear space each name keeps from the names already showing. 0 = off" },
];
const ZOOM_KNOBS: KnobDef[] = [
  { key: "zoomTypeGrowth", label: "Growth per zoom", min: 0, max: 1, step: 0.01, digits: 2, hint: "How much names grow with each zoom step past 2× (0.12 = +12%)" },
  { key: "zoomTypeMax", label: "Largest size", min: 1, max: 5, step: 0.1, digits: 1, suffix: "×", hint: "The most names can grow at full zoom, as a multiple of their normal size" },
];
const TYPE_KNOBS: KnobDef[] = [
  { key: "labelLargePx", label: "Large planets", min: 6, max: 28, step: 0.5, digits: 1, suffix: "px" },
  { key: "labelSmallPx", label: "Small planets", min: 4, max: 20, step: 0.5, digits: 1, suffix: "px" },
  { key: "labelThresholdB", label: "Large from", min: 0, max: 1000, step: 5, prefix: "$", suffix: "B", hint: "Planets worth at least this use the large size" },
  { key: "labelStrokePx", label: "Black outline", min: 0, max: 4, step: 0.1, digits: 1, suffix: "px" },
];

function KnobRow({
  def, value, live, overridden, onChange, onReset,
}: { def: KnobDef; value: number; live: number; overridden: boolean; onChange: (v: number) => void; onReset: () => void }) {
  const fmt = (v: number) => `${def.prefix ?? ""}${v.toFixed(def.digits ?? 0)}${def.suffix ?? ""}`;
  return (
    <div style={{ marginBottom: 8 }} title={def.hint}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, color: overridden ? "#e6e9ef" : "#8f98a6", fontSize: 12 }}>{def.label}</span>
        <input
          type="range"
          min={def.min}
          max={Math.max(def.max, value)}
          step={def.step}
          value={value}
          onChange={(e) => onChange(+e.target.value)}
          style={{ flex: "0 0 128px", accentColor: ACCENT }}
        />
        <button
          onClick={onReset}
          disabled={!overridden}
          title={overridden ? `Back to the live value (${fmt(live)})` : "Live value"}
          style={{
            width: 58, textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums",
            background: "none", border: "none", padding: 0, font: "inherit",
            color: overridden ? ACCENT : "#8f98a6", cursor: overridden ? "pointer" : "default",
          }}
        >
          {fmt(value)}
        </button>
      </div>
    </div>
  );
}

function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12, cursor: "pointer" }}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: ACCENT }} />
      <span>{children}</span>
    </label>
  );
}

/** A typed coordinate: commits on Enter / blur, ↑↓ nudge by 1 (Shift = 10). */
function CoordField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null); // null = not being edited
  const shown = text ?? String(Math.round(value));
  const commit = (raw: string) => {
    const v = Number(raw);
    setText(null);
    if (raw.trim() !== "" && Number.isFinite(v) && Math.round(v) !== Math.round(value)) onCommit(Math.round(v));
  };
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
      <span style={{ color: "#8f98a6", fontSize: 12 }}>{label}</span>
      <input
        value={shown}
        inputMode="numeric"
        spellCheck={false}
        onFocus={(e) => { setText(String(Math.round(value))); e.target.select(); }}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          else if (e.key === "Escape") { setText(null); (e.target as HTMLInputElement).blur(); }
          else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const base = Number(shown);
            const next = (Number.isFinite(base) ? Math.round(base) : Math.round(value)) + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1);
            setText(String(next));
            onCommit(next);
          }
        }}
        style={{ ...field, width: "100%", minWidth: 0, fontFamily: "ui-monospace, Menlo, monospace", fontVariantNumeric: "tabular-nums" }}
      />
    </label>
  );
}

export type LabSelection = {
  name: string;
  x: number;
  y: number;
  pinned: boolean;
  /** How the map places it now; `edited` = the lab changed it. "soft" only
   *  comes from Sanity (attracted at the sector-pull strength). */
  kind: "pin" | "home" | "soft" | "free";
  edited: boolean;
};

export function LayoutLabPanel({
  lab, mode, live, knobs, typeBase, years, year, onYear, onRefresh, mapWidth, stats, selection, onSelectionKind, onSelectionMove, onSelectionRevert, movedSectors, onRevertSector,
}: {
  lab: LayoutLab;
  /** The device mode the map is in now (follows the Device switch). */
  mode: DeviceMode;
  /** Live (pre-override) knob values for this mode + year. */
  live: LayoutKnobs;
  /** Resolved values the sliders show. */
  knobs: LayoutKnobs;
  /** For a type-only device (Tablet, or Phone 16:9 following desktop): the type
   *  values it has before its own overrides. */
  typeBase: LayoutKnobs;
  years: number[];
  year: number;
  onYear: (year: number) => void;
  onRefresh: () => void;
  /** Current map width in px, for the design-width readout. */
  mapWidth: number;
  stats: { planets: number; pinned: number; soft: number; held: number };
  selection: LabSelection | null;
  onSelectionKind: (kind: "pin" | "home" | "free") => void;
  /** Typed coordinates for the selected planet (slide units). */
  onSelectionMove: (x: number, y: number) => void;
  onSelectionRevert: () => void;
  movedSectors: string[];
  onRevertSector: (name: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("physics");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const { state, setState } = lab;

  if (!lab.open) {
    return (
      <button
        onClick={() => lab.setOpen(true)}
        title="Show layout lab (Shift+L)"
        style={{ ...btn, position: "fixed", right: 16, top: 72, zIndex: 60, fontFamily: FONT }}
      >
        Layout lab
      </button>
    );
  }

  const note = (s: string) => {
    setFlash(s);
    window.setTimeout(() => setFlash(null), 1400);
  };
  const over = state.knobs[mode];
  const rows = (defs: KnobDef[]) =>
    defs.map((d) => (
      <KnobRow
        key={d.key}
        def={d}
        value={knobs[d.key]}
        live={live[d.key]}
        overridden={over[d.key] !== undefined}
        onChange={(v) => lab.setKnob(mode, d.key, v)}
        onReset={() => lab.setKnob(mode, d.key, null)}
      />
    ));
  // Type-only devices: Tablet, and Phone 16:9 when it follows the desktop
  // layout. Their layout is desktop's; only the type rows are their own.
  const tablet = lab.device === "tablet";
  const fullMirror = lab.device === "full" && state.fullFollowsDesktop;
  const typeOnly = tablet || fullMirror;
  const typeOver = tablet ? state.tablet : state.knobs.full;
  const setTypeKnob = (key: keyof LayoutKnobs, v: number | null) =>
    tablet ? lab.setTabletKnob(key, v) : lab.setKnob("full", key, v);
  const typeRows = (defs: KnobDef[]) =>
    !typeOnly
      ? rows(defs)
      : defs.map((d) => (
          <KnobRow
            key={d.key}
            def={d}
            value={typeOver[d.key] ?? typeBase[d.key]}
            live={typeBase[d.key]}
            overridden={typeOver[d.key] !== undefined}
            onChange={(v) => setTypeKnob(d.key, v)}
            onReset={() => setTypeKnob(d.key, null)}
          />
        ));
  const followToggle = lab.device === "full" && (
    <fieldset style={fs}>
      <legend style={lg}>Phone 16:9 layout</legend>
      <Toggle on={state.fullFollowsDesktop} onChange={(v) => setState((s) => ({ ...s, fullFollowsDesktop: v }))}>
        Use the desktop layout
      </Toggle>
      <p style={hint}>
        On: this view is the desktop map exactly — same planets in the same places — with its own type settings.
        Off: it has its own sliders, pins and wells.
      </p>
    </fieldset>
  );
  const tabletNote = (
    <p style={hint}>
      {tablet ? "Tablet uses" : "Phone 16:9 is using"} the desktop layout as it is — only the type is separate.
      Switch to Desktop to change the layout.
    </p>
  );
  const frozen = Object.values(state.positions[mode]).filter((list) => list.some((e) => "frozen" in e && e.frozen)).length;
  const posEdits = Object.keys(state.positions[mode]).length - frozen;

  return (
    <div
      style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: LAYOUT_PANEL_W, zIndex: 60,
        background: "#161a21", borderLeft: "1px solid #2a313b", color: "#e6e9ef",
        fontFamily: FONT, fontSize: 13, display: "flex", flexDirection: "column",
        boxShadow: "-12px 0 40px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #2a313b" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#8f98a6", fontWeight: 600 }}>Layout lab</div>
          <button onClick={() => lab.setOpen(false)} title="Hide (Shift+L)" style={{ ...btn, padding: "3px 8px" }}>Hide</button>
        </div>

        {/* Device: desktop, or a phone-sized frame in one of the two mobile views. */}
        <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
          {LAB_DEVICES.map((d) => (
            <button
              key={d}
              onClick={() => { lab.setDevice(d); if (d === "tablet") setTab("type"); }}
              style={{ ...(lab.device === d ? primary : plain), flex: 1, padding: "5px 2px", fontSize: 11.5 }}
            >
              {LAB_DEVICE_LABELS[d]}
            </button>
          ))}
        </div>

        {/* Year + reload-as-first-load + a different random start. */}
        <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
          <select
            value={year}
            onChange={(e) => onYear(+e.target.value)}
            style={{ ...field, flex: "0 0 86px", padding: "5px 6px" }}
            aria-label="Map year"
          >
            {years.slice().reverse().map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button onClick={onRefresh} style={{ ...btn, flex: 1 }} title="Reload the map as it appears on first page load, with these settings">
            ↻ Reload map
          </button>
          <button
            onClick={() => setState((s) => ({ ...s, seeds: { ...s.seeds, [mode]: seedFor(s, mode) + 1 } }))}
            disabled={typeOnly || state.shuffleEachLoad}
            style={{ ...btn, opacity: typeOnly || state.shuffleEachLoad ? 0.45 : 1 }}
            title={
              state.shuffleEachLoad
                ? "Every page load already gets a new arrangement — press Reload map to see another"
                : typeOnly
                ? "This view uses the desktop layout — shuffle it from Desktop"
                : `Try a different starting arrangement for ${DEVICE_LABELS[mode]} only (seed ${seedFor(state, mode)}). The same seed always gives the same map.`
            }
          >
            Shuffle
          </button>
        </div>

        <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
          {(["physics", "type", "arrange"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ ...(tab === t ? primary : plain), flex: 1 }}>
              {t === "physics" ? "Physics" : t === "type" ? "Type" : "Arrange"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        {tab === "physics" && (
          <fieldset style={fs}>
            <legend style={lg}>Arrangement</legend>
            <Toggle on={state.shuffleEachLoad} onChange={(v) => setState((s) => ({ ...s, shuffleEachLoad: v }))}>
              New arrangement on every visit
            </Toggle>
            <p style={hint}>
              {state.shuffleEachLoad
                ? "Each page load starts the planets from a different scatter, so small planets land in different spots each visit. It holds for the whole visit — resizing never reshuffles. Reload map shows another."
                : "Everyone gets the same arrangement on every load. Shuffle tries a different one."}
            </p>
          </fieldset>
        )}
        {tab === "physics" && followToggle}
        {typeOnly && tab !== "type" && tabletNote}
        {!typeOnly && tab === "physics" && (
          <>
            <fieldset style={fs}>
              <legend style={lg}>Fill the gaps</legend>
              {rows(PACK_KNOBS)}
            </fieldset>
            <fieldset style={fs}>
              <legend style={lg}>Map settings (as in Sanity)</legend>
              {rows(SANITY_KNOBS)}
            </fieldset>
            <fieldset style={fs}>
              <legend style={lg}>Resizing</legend>
              <Toggle on={state.lockLayout} onChange={(v) => setState((s) => ({ ...s, lockLayout: v }))}>
                Lock layout (resizing never reshuffles)
              </Toggle>
              {state.lockLayout && (
                <>
                  <KnobRow
                    def={{ key: "designWidth", label: "Design width", min: 280, max: 1800, step: 10, suffix: "px", hint: "The map width the layout is tuned for" }}
                    value={knobs.designWidth}
                    live={live.designWidth}
                    overridden={over.designWidth !== undefined}
                    onChange={(v) => lab.setKnob(mode, "designWidth", v)}
                    onReset={() => lab.setKnob(mode, "designWidth", null)}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ flex: 1, fontSize: 11, color: "#8f98a6" }}>Map is {Math.round(mapWidth)}px wide now</span>
                    <button onClick={() => lab.setKnob(mode, "designWidth", Math.round(mapWidth))} style={{ ...btn, padding: "3px 8px", fontSize: 11 }}>Use this</button>
                  </div>
                  <Toggle on={state.scaleType} onChange={(v) => setState((s) => ({ ...s, scaleType: v }))}>
                    Type scales with the map (like an SVG)
                  </Toggle>
                  {state.scaleType && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ flex: 1, color: "#8f98a6", fontSize: 12 }}>Smallest type</span>
                      <input
                        type="range" min={0} max={12} step={0.5} value={state.minTypePx}
                        onChange={(e) => setState((s) => ({ ...s, minTypePx: +e.target.value }))}
                        style={{ flex: "0 0 128px", accentColor: ACCENT }}
                      />
                      <span style={{ width: 58, textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                        {state.minTypePx === 0 ? "none" : `${state.minTypePx}px`}
                      </span>
                    </div>
                  )}
                </>
              )}
            </fieldset>
            <p style={hint}>
              {stats.planets} planets · {stats.pinned} pinned · {stats.held} held · {stats.soft} soft-placed. Pinned
              planets ignore every slider here; held ones only respond to Planet size and the two gap sliders. Change
              either in Arrange. Click a green value to return it to live.
            </p>
          </>
        )}

        {tab === "type" && (
          <>
            <fieldset style={fs}>
              <legend style={lg}>Planet names</legend>
              {typeRows(TYPE_KNOBS)}
            </fieldset>
            <fieldset style={fs}>
              <legend style={lg}>Which names show</legend>
              {typeRows(NAME_KNOBS)}
              <p style={hint}>
                With breathing room on, names go to the largest planets first and a name is skipped if it would sit
                closer than this to one already showing. Lower "Hide names under" to let small planets in empty
                areas pick up names. More names appear as you zoom in.
              </p>
            </fieldset>
            <fieldset style={fs}>
              <legend style={lg}>When zoomed in</legend>
              {typeRows(ZOOM_KNOBS)}
              <p style={hint}>Names keep their size up to 2× zoom, then grow by this much per zoom step until they reach the largest size.</p>
            </fieldset>
            {tablet && (
              <fieldset style={fs}>
                <legend style={lg}>Tablet range</legend>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }} title="Windows this wide or narrower — but wider than a phone — get the tablet type">
                  <span style={{ flex: 1, color: "#8f98a6", fontSize: 12 }}>Up to window width</span>
                  <input
                    type="range" min={800} max={1400} step={10} value={state.tabletMaxWidth}
                    onChange={(e) => setState((s) => ({ ...s, tabletMaxWidth: +e.target.value }))}
                    style={{ flex: "0 0 128px", accentColor: ACCENT }}
                  />
                  <span style={{ width: 58, textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{state.tabletMaxWidth}px</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }} title="How wide the preview frame is — try both ends of the range">
                  <span style={{ flex: 1, color: "#8f98a6", fontSize: 12 }}>Preview width</span>
                  <input
                    type="range" min={TABLET_MIN_WIDTH} max={state.tabletMaxWidth} step={1} value={lab.tabletPreviewW}
                    onChange={(e) => lab.setTabletPreviewW(+e.target.value)}
                    style={{ flex: "0 0 128px", accentColor: ACCENT }}
                  />
                  <span style={{ width: 58, textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{lab.tabletPreviewW}px</span>
                </div>
                {typeof window !== "undefined" && window.innerWidth - LAYOUT_PANEL_W - 32 < lab.tabletPreviewW && (
                  <p style={{ ...hint, color: "#fbbf24" }}>
                    Your browser window is too narrow to show {lab.tabletPreviewW}px beside this panel, so the preview is
                    squeezed. Widen the window or hide the panel (Shift+L).
                  </p>
                )}
                <p style={hint}>
                  Visitors whose window is between {TABLET_MIN_WIDTH}px and the top of the range get these type settings on
                  the desktop layout. Green values differ from desktop; click one to match desktop again.
                </p>
              </fieldset>
            )}
            <p style={hint}>
              Sizes are at the design width ({Math.round(knobs.designWidth)}px){state.lockLayout && state.scaleType ? "; type then scales with the map." : "."}
              {" "}Spacing follows the type, so bigger names push planets apart — trim that with Label footprint in Physics.
            </p>
          </>
        )}

        {!typeOnly && tab === "arrange" && (
          <>
            <fieldset style={fs}>
              <legend style={lg}>Arrange</legend>
              <Toggle on={lab.arrange} onChange={lab.setArrange}>Drag planets and sector wells</Toggle>
              {lab.arrange && <Toggle on={lab.showWells} onChange={lab.setShowWells}>Show sector wells</Toggle>}
              <p style={hint}>
                Dragging a planet pins it there. Edits take effect from {year} onward (earlier years keep
                their own), the same way Studio stamps them.
              </p>
            </fieldset>
            {/* Bulk "hold this layout" was tried and dropped; this only appears if a
                saved state still carries held planets, so they can be released. */}
            {frozen > 0 && (
              <fieldset style={fs}>
                <legend style={lg}>Hold</legend>
                <p style={hint}>{frozen} planets are holding their spots for {DEVICE_LABELS[mode]}, so most sliders don't move them.</p>
                <button onClick={() => { lab.unfreeze(mode); note("Released"); }} style={{ ...btn, width: "100%", marginBottom: 8 }}>
                  Release hold (keeps planets you moved)
                </button>
              </fieldset>
            )}
            {lab.arrange && (
              <fieldset style={fs}>
                <legend style={lg}>Selected planet</legend>
                {selection ? (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      <strong style={{ fontSize: 13 }}>{selection.name}</strong>
                    </div>
                    <div style={{ display: "flex", gap: 10, marginBottom: 8 }} title="Type a position, or use ↑ ↓ to nudge (Shift = 10). Setting one pins a free planet.">
                      <CoordField key={`${selection.name}-x`} label="X" value={selection.x} onCommit={(v) => onSelectionMove(v, Math.round(selection.y))} />
                      <CoordField key={`${selection.name}-y`} label="Y" value={selection.y} onCommit={(v) => onSelectionMove(Math.round(selection.x), v)} />
                    </div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                      {(["pin", "home", "free"] as const).map((k) => (
                        <button
                          key={k}
                          onClick={() => onSelectionKind(k)}
                          style={{ ...(selection.kind === k ? primary : plain), flex: 1 }}
                          title={
                            k === "pin" ? "Locked exactly here; others move around it"
                              : k === "home" ? "Stays here, but moves aside if a neighbour needs the room"
                                : "No set position — placed by the physics"
                          }
                        >
                          {k === "pin" ? "Pinned" : k === "home" ? "Home" : "Free"}
                        </button>
                      ))}
                    </div>
                    {selection.kind === "soft" && <p style={hint}>Soft-placed in Sanity: drawn toward this spot at the Sector pull strength.</p>}
                    <button onClick={onSelectionRevert} disabled={!selection.edited} style={{ ...btn, width: "100%", marginBottom: 8, opacity: selection.edited ? 1 : 0.45 }}>
                      Back to live placement
                    </button>
                  </>
                ) : (
                  <p style={hint}>Click a planet on the map.</p>
                )}
              </fieldset>
            )}
            {(posEdits > 0 || movedSectors.length > 0) && (
              <fieldset style={fs}>
                <legend style={lg}>Edits in this view</legend>
                <p style={hint}>{posEdits} planet{posEdits === 1 ? "" : "s"} · {movedSectors.length} sector well{movedSectors.length === 1 ? "" : "s"}</p>
                {movedSectors.map((s) => (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ flex: 1, fontSize: 12 }}>{s}</span>
                    <button onClick={() => onRevertSector(s)} style={{ ...btn, padding: "2px 8px", fontSize: 11 }}>Reset well</button>
                  </div>
                ))}
                <button onClick={() => { lab.clearArrangement(mode); note("Cleared"); }} style={{ ...btn, width: "100%", marginBottom: 8 }}>
                  Clear all {DEVICE_LABELS[mode]} placement edits
                </button>
              </fieldset>
            )}
          </>
        )}
      </div>

      <div style={{ borderTop: "1px solid #2a313b", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            onClick={() => { navigator.clipboard?.writeText(lab.exportJson()).then(() => note("Copied"), () => note("Copy failed")); }}
            style={primary}
          >
            Copy JSON
          </button>
          <button
            onClick={() => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([lab.exportJson()], { type: "application/json" }));
              a.download = "layout-lab.json";
              a.click();
              URL.revokeObjectURL(a.href);
            }}
            style={btn}
          >
            Download
          </button>
          <button onClick={() => setPasteOpen((o) => !o)} style={btn}>Paste…</button>
          <button onClick={() => { lab.resetToPreset(); note("Reset"); }} style={{ ...btn, marginLeft: "auto" }} title="Discard changes in this browser and go back to the published layout">Reset</button>
          <button onClick={() => { lab.clearAll(); note("Cleared"); }} style={btn} title="Remove every override">Clear</button>
        </div>
        {pasteOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste a layout JSON here"
              rows={5}
              spellCheck={false}
              style={{ ...field, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => {
                  try { setState(normalizeLayout(JSON.parse(pasteText))); setPasteOpen(false); setPasteText(""); note("Applied"); }
                  catch { note("Not valid JSON"); }
                }}
                style={primary}
              >
                Apply
              </button>
              <button onClick={() => setPasteOpen(false)} style={btn}>Cancel</button>
            </div>
          </div>
        )}
        <div style={{ fontSize: 11, color: lab.unpublished && !flash ? "#fbbf24" : "#8f98a6", minHeight: 14, lineHeight: 1.35 }}>
          {flash ??
            (lab.unpublished
              ? "Unpublished changes (saved in this browser only). To publish: Copy JSON, then paste it in Studio's Layout lab tab and press Publish."
              : "Matches the published layout · Shift+L hides")}
        </div>
      </div>
    </div>
  );
}
