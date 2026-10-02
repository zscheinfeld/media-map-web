// The style-lab editing panel (?style=1). Three tabs — Sectors, Large Cap,
// Background — plus copy/download/paste of the whole state as JSON so a look
// can be shared or baked into preset.ts. Shift+S hides/shows it.

import { useState } from "react";
import { Planet, ombreStripeColors, type PlanetNode, type PlanetStyle } from "@media-map/map-core";
import {
  DEFAULT_BG,
  EMPTY_RECIPE,
  isHex,
  normalizeState,
  recipeFromStyle,
  type LargeCapRecipe,
  type StyleLab,
} from "./styleLab";

const FONT = '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif';
const PANEL_W = 340;

type Tab = "sectors" | "largecap" | "background";

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
const label: React.CSSProperties = { flex: 1, color: "#8f98a6", fontSize: 12 };
const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 };

/** Colour picker + hex text that stay in sync; commits only valid hex. */
function ColorField({ value, onChange, compact = false }: { value: string; onChange: (hex: string) => void; compact?: boolean }) {
  const [text, setText] = useState(value);
  const [last, setLast] = useState(value);
  if (last !== value) {
    setLast(value);
    setText(value);
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <input
        type="color"
        value={isHex(value) ? value : "#000000"}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        style={{ width: 30, height: 24, padding: 0, border: "1px solid #2a313b", borderRadius: 6, background: "none", cursor: "pointer" }}
      />
      {!compact && (
        <input
          value={text}
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            const h = v.startsWith("#") ? v : `#${v}`;
            if (isHex(h)) onChange(h.toLowerCase());
          }}
          spellCheck={false}
          style={{ ...field, width: 76, fontFamily: "ui-monospace, Menlo, monospace" }}
        />
      )}
    </span>
  );
}

function Range({
  value, min, max, step = 1, onChange, suffix = "",
}: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} style={{ flex: "0 0 120px", accentColor: "#7dd3fc" }} />
      <span style={{ width: 44, textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
        {value}{suffix}
      </span>
    </>
  );
}

function Preview({ name, style }: { name: string; style: PlanetStyle | null }) {
  const node: PlanetNode = {
    name, sector: "Large Cap", valuation_b: 0, r: 60, targetR: 60, hue: 0, style,
    x: 0, y: 0, targetX: 0, targetY: 0, pinned: false,
  };
  return (
    <svg viewBox="-66 -66 132 132" width={132} height={132} style={{ display: "block", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
      <Planet
        node={node}
        slideUnitsPerPx={1}
        isHovered={false}
        onHoverChange={() => {}}
        onClick={() => {}}
        dimmed={false}
        labelSuppressed
      />
    </svg>
  );
}

export function StyleLabPanel({
  lab,
  sectors,
  liveSectorColor,
  largeCapNames,
  liveStyleFor,
}: {
  lab: StyleLab;
  sectors: string[];
  /** The colour a sector shows today (pre-override), for the swatch beside its row. */
  liveSectorColor: (sector: string) => string;
  largeCapNames: string[];
  /** A company's style today (pre-override) — seeds its recipe. */
  liveStyleFor: (name: string) => PlanetStyle | null;
}) {
  const [tab, setTab] = useState<Tab>("sectors");
  const [selected, setSelected] = useState<string>(largeCapNames[0] ?? "");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const { state, setState } = lab;

  if (!lab.open) {
    return (
      <button
        onClick={() => lab.setOpen(true)}
        title="Show style lab (Shift+S)"
        style={{ ...btn, position: "fixed", right: 16, top: 72, zIndex: 60, fontFamily: FONT }}
      >
        Style lab
      </button>
    );
  }

  const json = () => JSON.stringify(state, null, 2);
  const note = (s: string) => {
    setFlash(s);
    window.setTimeout(() => setFlash(null), 1400);
  };

  const recipe: LargeCapRecipe | null = selected ? (state.largeCaps[selected] ?? null) : null;
  const setRecipe = (patch: Partial<LargeCapRecipe>) => {
    if (!selected) return;
    setState((s) => {
      const cur = s.largeCaps[selected] ?? recipeFromStyle(liveStyleFor(selected));
      return { ...s, largeCaps: { ...s.largeCaps, [selected]: { ...cur, ...patch } } };
    });
  };
  const previewStyle = selected ? lab.styleFor(selected, "Large Cap", liveStyleFor(selected)) : null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: PANEL_W,
        zIndex: 60,
        background: "#161a21",
        borderLeft: "1px solid #2a313b",
        color: "#e6e9ef",
        fontFamily: FONT,
        fontSize: 13,
        display: "flex",
        flexDirection: "column",
        boxShadow: "-12px 0 40px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid #2a313b" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#8f98a6", fontWeight: 600 }}>Style lab</div>
          <button onClick={() => lab.setOpen(false)} title="Hide (Shift+S)" style={{ ...btn, padding: "3px 8px" }}>Hide</button>
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
          {(["sectors", "largecap", "background"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                ...btn,
                flex: 1,
                background: tab === t ? "#7dd3fc" : "#1d2229",
                color: tab === t ? "#06212e" : "#e6e9ef",
                borderColor: tab === t ? "#7dd3fc" : "#2a313b",
                fontWeight: tab === t ? 600 : 400,
              }}
            >
              {t === "sectors" ? "Sectors" : t === "largecap" ? "Large Cap" : "Background"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        {tab === "sectors" && (
          <>
            <fieldset style={fs}><legend style={lg}>All sector planets</legend>
              <div style={row}>
                <span style={label}>Outline width</span>
                <Range
                  value={state.sectorStroke?.px ?? 0}
                  min={0} max={4} step={0.25}
                  onChange={(v) => setState((st) => {
                    const next = { ...st };
                    if (v > 0) next.sectorStroke = { px: v, color: st.sectorStroke?.color ?? "#969696" };
                    else delete next.sectorStroke;
                    return next;
                  })}
                  suffix="px"
                />
              </div>
              <div style={row}>
                <span style={label}>Outline colour</span>
                <ColorField
                  value={state.sectorStroke?.color ?? "#969696"}
                  onChange={(h) => setState((st) => ({ ...st, sectorStroke: { px: st.sectorStroke?.px ?? 0.75, color: h } }))}
                />
              </div>
              <p style={{ margin: "4px 0 0", color: "#8f98a6", fontSize: 11, lineHeight: 1.4 }}>
                Every planet outside Large Cap (0 = each sector's own default outline, e.g. AI's white ring).
              </p>
            </fieldset>
            <p style={{ margin: "0 0 10px", color: "#8f98a6", fontSize: 11, lineHeight: 1.4 }}>
              Recolours every flat planet in the sector, its sidebar swatch and list/aggregate colours. Striped planets keep their own palette.
            </p>
            {sectors.map((s) => {
              const over = state.sectors[s] ?? null;
              const live = liveSectorColor(s);
              return (
                <div key={s} style={row}>
                  <span aria-hidden style={{ width: 12, height: 12, borderRadius: 3, background: over ?? live, border: "1px solid rgba(255,255,255,0.25)", flex: "0 0 auto" }} />
                  <span style={{ ...label, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s}</span>
                  <ColorField
                    value={over ?? (isHex(live) ? live : "#888888")}
                    onChange={(hex) => setState((st) => ({ ...st, sectors: { ...st.sectors, [s]: hex } }))}
                  />
                  <button
                    title="Back to live colour"
                    disabled={!over}
                    onClick={() => setState((st) => { const n = { ...st.sectors }; delete n[s]; return { ...st, sectors: n }; })}
                    style={{ ...btn, padding: "2px 7px", opacity: over ? 1 : 0.35 }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </>
        )}

        {tab === "largecap" && (
          <>
            <fieldset style={fs}><legend style={lg}>All Large Cap planets</legend>
              <div style={row}>
                <span style={label}>Outline width</span>
                <Range
                  value={state.largeCapStroke?.px ?? 0}
                  min={0} max={4} step={0.25}
                  onChange={(v) => setState((st) => {
                    const next = { ...st };
                    if (v > 0) next.largeCapStroke = { px: v, color: st.largeCapStroke?.color ?? "#969696" };
                    else delete next.largeCapStroke;
                    return next;
                  })}
                  suffix="px"
                />
              </div>
              <div style={row}>
                <span style={label}>Outline colour</span>
                <ColorField
                  value={state.largeCapStroke?.color ?? "#969696"}
                  onChange={(h) => setState((st) => ({ ...st, largeCapStroke: { px: st.largeCapStroke?.px ?? 0.75, color: h } }))}
                />
              </div>
              <p style={{ margin: "4px 0 0", color: "#8f98a6", fontSize: 11, lineHeight: 1.4 }}>
                Applies to every Large Cap planet. A company recipe's own circle stroke (below) overrides it when set above 0.
              </p>
            </fieldset>
            <div style={row}>
              <span style={label}>Company</span>
              <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ ...field, flex: "0 0 180px" }}>
                {largeCapNames.map((n) => (
                  <option key={n} value={n}>{n}{state.largeCaps[n] ? " •" : ""}</option>
                ))}
              </select>
            </div>
            {selected && (
              <>
                <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "6px 0 12px" }}>
                  <Preview name={selected} style={previewStyle} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    {!recipe ? (
                      <>
                        <span style={{ color: "#8f98a6", fontSize: 11, lineHeight: 1.4 }}>Showing the live style. Start a recipe:</span>
                        <button onClick={() => setRecipe({})} style={btn}>From current stripes</button>
                        <button onClick={() => setRecipe({ ...EMPTY_RECIPE })} style={btn}>Ombré starter</button>
                      </>
                    ) : (
                      <>
                        <span style={{ color: "#8f98a6", fontSize: 11 }}>{recipe.count} stripes · {recipe.stops.length} colours</span>
                        <button
                          onClick={() => setState((st) => { const n = { ...st.largeCaps }; delete n[selected]; return { ...st, largeCaps: n }; })}
                          style={btn}
                        >
                          Remove recipe (back to live)
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {recipe && (
                  <>
                    <fieldset style={fs}><legend style={lg}>Stripes</legend>
                      <div style={row}><span style={label}>Count</span><Range value={recipe.count} min={1} max={60} onChange={(v) => setRecipe({ count: v })} /></div>
                      <div style={row}><span style={label}>Angle</span><Range value={Math.round(recipe.angle)} min={0} max={180} onChange={(v) => setRecipe({ angle: v })} suffix="°" /></div>
                      <div style={row}>
                        <span style={label}>Blend</span>
                        <select value={recipe.blend ?? "oklab"} onChange={(e) => setRecipe({ blend: e.target.value as "oklab" | "srgb" })} style={field}>
                          <option value="oklab">OKLab (smooth)</option>
                          <option value="srgb">sRGB (raw)</option>
                        </select>
                      </div>
                      <div style={row}>
                        <span style={label}>Reverse ramp</span>
                        <input type="checkbox" checked={!!recipe.reverse} onChange={(e) => setRecipe({ reverse: e.target.checked })} style={{ accentColor: "#7dd3fc" }} />
                      </div>
                    </fieldset>

                    <fieldset style={fs}><legend style={lg}>Colours</legend>
                      {recipe.stops.map((hex, i) => (
                        <div key={i} style={row}>
                          <span style={{ width: 18, height: 18, borderRadius: 5, background: "#0e1116", color: "#8f98a6", fontSize: 10, display: "grid", placeItems: "center" }}>{i + 1}</span>
                          <span style={{ flex: 1, height: 20, borderRadius: 5, background: hex, border: "1px solid #2a313b" }} />
                          <ColorField value={hex} onChange={(h) => setRecipe({ stops: recipe.stops.map((s, j) => (j === i ? h : s)) })} />
                          <button
                            disabled={recipe.stops.length <= 1}
                            onClick={() => setRecipe({ stops: recipe.stops.filter((_, j) => j !== i) })}
                            style={{ ...btn, padding: "2px 7px", opacity: recipe.stops.length <= 1 ? 0.35 : 1 }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button onClick={() => setRecipe({ stops: [...recipe.stops, recipe.stops[recipe.stops.length - 1]] })} style={btn}>+ Colour</button>
                        <button onClick={() => setRecipe({ stops: [...recipe.stops].reverse() })} style={btn}>Reverse order</button>
                        <button onClick={() => setRecipe({ stops: randomRamp(recipe.stops.length) })} style={btn}>Randomize</button>
                      </div>
                      <div style={{ display: "flex", marginTop: 10, height: 10, borderRadius: 4, overflow: "hidden", border: "1px solid #2a313b" }}>
                        {ombreStripeColors(recipe).map((c, i) => <span key={i} style={{ flex: 1, background: c }} />)}
                      </div>
                    </fieldset>

                    <fieldset style={fs}><legend style={lg}>Circle stroke</legend>
                      <div style={row}><span style={label}>Width</span><Range value={recipe.strokePx} min={0} max={8} step={0.5} onChange={(v) => setRecipe({ strokePx: v })} suffix="px" /></div>
                      <div style={row}><span style={label}>Colour</span><ColorField value={recipe.strokeColor} onChange={(h) => setRecipe({ strokeColor: h })} /></div>
                    </fieldset>

                    <fieldset style={fs}><legend style={lg}>Stripe strokes</legend>
                      <div style={row}><span style={label}>Width</span><Range value={recipe.stripeStrokePx ?? 0} min={0} max={6} step={0.5} onChange={(v) => setRecipe({ stripeStrokePx: v })} suffix="px" /></div>
                      <div style={row}><span style={label}>Colour</span><ColorField value={recipe.stripeStrokeColor ?? "#0d0f13"} onChange={(h) => setRecipe({ stripeStrokeColor: h })} /></div>
                    </fieldset>
                  </>
                )}
              </>
            )}
          </>
        )}

        {tab === "background" && (
          <>
            <p style={{ margin: "0 0 10px", color: "#8f98a6", fontSize: 11, lineHeight: 1.4 }}>
              The site's vertical gradient (top → middle → bottom). Also used by the list/aggregate views, the page body and the PNG export.
            </p>
            {(["Top", "Middle", "Bottom"] as const).map((n, i) => (
              <div key={n} style={row}>
                <span style={label}>{n}</span>
                <ColorField
                  value={state.bg[i]}
                  onChange={(hex) => setState((st) => { const bg = [...st.bg] as [string, string, string]; bg[i] = hex; return { ...st, bg }; })}
                />
              </div>
            ))}
            <fieldset style={{ ...fs, marginTop: 12 }}><legend style={lg}>Side panel</legend>
              <div style={row}>
                <span style={label}>Panel background</span>
                <ColorField
                  value={state.panelBg ?? "#070e20"}
                  onChange={(hex) => setState((st) => ({ ...st, panelBg: hex }))}
                />
                <button
                  title="Back to the live translucent navy"
                  disabled={!state.panelBg}
                  onClick={() => setState((st) => { const n = { ...st }; delete n.panelBg; return n; })}
                  style={{ ...btn, padding: "2px 7px", opacity: state.panelBg ? 1 : 0.35 }}
                >
                  ✕
                </button>
              </div>
              <p style={{ margin: "4px 0 0", color: "#8f98a6", fontSize: 11, lineHeight: 1.4 }}>
                The left sector panel. Live look is navy at 85% over the page background; this sets a solid colour.
              </p>
            </fieldset>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              <button onClick={() => setState((st) => ({ ...st, bg: [st.bg[1], st.bg[1], st.bg[1]] }))} style={btn}>Make solid (middle)</button>
              <button onClick={() => setState((st) => ({ ...st, bg: [...DEFAULT_BG] as [string, string, string] }))} style={btn}>Live gradient</button>
            </div>
            <div style={{ marginTop: 12, height: 60, borderRadius: 8, background: lab.bgGradient, border: "1px solid #2a313b" }} />
          </>
        )}
      </div>

      <div style={{ padding: "10px 14px", borderTop: "1px solid #2a313b", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            onClick={async () => {
              try { await navigator.clipboard.writeText(json()); note("Copied"); } catch { note("Clipboard blocked"); }
            }}
            style={{ ...btn, background: "#7dd3fc", color: "#06212e", borderColor: "#7dd3fc", fontWeight: 600 }}
          >
            Copy JSON
          </button>
          <button
            onClick={() => {
              const blob = new Blob([json()], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "media-map-style.json"; a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
            style={btn}
          >
            Download
          </button>
          <button onClick={() => setPasteOpen((o) => !o)} style={btn}>Paste…</button>
          <button onClick={() => { lab.resetToPreset(); note("Reset"); }} style={{ ...btn, marginLeft: "auto" }} title="Back to the baked-in default (preset.ts)">Reset to default</button>
          <button onClick={() => { lab.clearAll(); note("Cleared"); }} style={btn} title="Remove every override — the live site's look">Live look</button>
        </div>
        {pasteOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste a style JSON here"
              rows={5}
              spellCheck={false}
              style={{ ...field, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => {
                  try { setState(normalizeState(JSON.parse(pasteText))); setPasteOpen(false); setPasteText(""); note("Applied"); }
                  catch { note("Not valid JSON"); }
                }}
                style={{ ...btn, background: "#7dd3fc", color: "#06212e", borderColor: "#7dd3fc", fontWeight: 600 }}
              >
                Apply
              </button>
              <button onClick={() => setPasteOpen(false)} style={btn}>Cancel</button>
            </div>
          </div>
        )}
        <div style={{ fontSize: 11, color: "#8f98a6", minHeight: 14 }}>
          {flash ?? "Saved in this browser · Shift+S hides the panel"}
        </div>
      </div>
    </div>
  );
}

const fs: React.CSSProperties = { border: "1px solid #2a313b", borderRadius: 10, margin: "0 0 12px", padding: 12, background: "#1d2229" };
const lg: React.CSSProperties = { fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: "#8f98a6", padding: "0 6px", fontWeight: 600 };

/** A pleasant random ramp (ported from Planet Maker's Randomize). */
function randomRamp(n: number): string[] {
  const h0 = Math.random() * 360;
  const dir = Math.random() < 0.5 ? 1 : -1;
  const arc = 40 + Math.random() * 140;
  return Array.from({ length: n }, (_, i) => {
    const f = n > 1 ? i / (n - 1) : 0;
    const h = (h0 + dir * arc * f + 360) % 360;
    const s = 55 + 25 * Math.sin(f * Math.PI);
    const l = 82 - 60 * f;
    return hslHex(h, s, l);
  });
}
function hslHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const c = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${c(f(0))}${c(f(8))}${c(f(4))}`;
}
