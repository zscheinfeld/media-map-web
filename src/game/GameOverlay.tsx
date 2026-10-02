// Chrome for game mode (see useGameMode): the countdown card, the score HUD in
// the upper right (where the view tabs normally sit), the end-of-round card,
// and the paddle itself — the Eshap logo as a fixed-position <img> so it can
// fly out of the sidebar and across the map.

import { formatValuation } from "@media-map/map-core";
import type { GameHud, GamePhase, PaddleRect } from "./useGameMode";
import { GAME_SECONDS } from "./useGameMode";

const FONT = '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif';

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function GameOverlay({
  phase,
  countdown,
  hud,
  totals,
  paddle,
  onBegin,
  onExit,
  onReplay,
}: {
  phase: GamePhase;
  countdown: number;
  hud: GameHud;
  totals: { cap: number; count: number };
  paddle: PaddleRect | null;
  onBegin: () => void;
  onExit: () => void;
  onReplay: () => void;
}) {
  if (phase === "idle") return null;
  const lostCap = totals.cap - hud.savedCap;

  return (
    <>
      {/* HUD — upper right: two stats (value in yellow, label under) + Exit. */}
      {(phase === "playing" || phase === "countdown") && (
        <div
          style={{
            ...bigCard,
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 13,
            borderRadius: 16,
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            gap: 24,
            textAlign: "left",
          }}
        >
          <Stat value={formatValuation(phase === "countdown" ? totals.cap || hud.savedCap : hud.savedCap)} label={"Market Cap\nSaved"} />
          <Stat value={clock(phase === "countdown" ? GAME_SECONDS : hud.timeLeft)} label={"Time\nRemaining"} />
          <button
            onClick={onExit}
            className="mm-hover"
            style={{
              ...bigBtn,
              // Sized like the map's other pills (Time Machine / About).
              background: "#1b2a4a",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 10,
              color: "#fff",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: 1,
              height: 36,
              padding: "0 14px",
              marginLeft: 4,
            }}
          >
            <span className="cap-center">EXIT GAME</span>
          </button>
        </div>
      )}

      {/* Welcome card — shown on click; Get Started runs the countdown. */}
      {phase === "intro" && (
        <div style={backdrop}>
          <div style={{ ...bigCard, padding: "40px 48px 36px", maxWidth: 640 }}>
            <div
              style={{
                fontSize: 64,
                fontWeight: 600, // Franklin Gothic Demi
                lineHeight: 0.87,
                textTransform: "uppercase",
                letterSpacing: "-0.01em",
              }}
            >
              Welcome to Media Map Game Mode
            </div>
            <p style={{ fontSize: 20, lineHeight: 1.4, margin: "24px 0 0", fontWeight: 400 }}>
              The planets are breaking orbit into media chaos. Move the ESHAP logo with your mouse or
              left/ right keyboard keys to bounce them back before they fall out of the universe.{" "}
              <strong style={{ color: ACCENT_YELLOW, fontWeight: 700 }}>You have {GAME_SECONDS} seconds</strong> to save the most
              market cap possible. Press ESC. at any time to exit.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 32 }}>
              <button onClick={onExit} className="mm-hover" style={{ ...bigBtn, background: "#1f2630", color: "#fff" }}>
                Back to Map
              </button>
              <button onClick={onBegin} className="mm-hover" style={{ ...bigBtn, background: "#3657FD", color: "#fff" }} autoFocus>
                Get Started <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18, lineHeight: 1, marginLeft: 8 }}>arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Countdown card — 5…1, then the round starts. */}
      {phase === "countdown" && (
        <div style={{ ...backdrop, pointerEvents: "none" }}>
          <div style={{ ...bigCard, padding: "24px 96px 36px", minWidth: 420 }}>
            <div
              key={countdown}
              className="mm-count-pop"
              style={{ fontSize: 400, fontWeight: 600, lineHeight: 0.9, fontVariantNumeric: "tabular-nums" }}
            >
              {countdown}
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, textTransform: "uppercase", color: ACCENT_YELLOW, marginTop: 12, letterSpacing: "0.02em" }}>
              Starting in
            </div>
          </div>
        </div>
      )}

      {/* End card — the score, a performance tier, and the tier bar. */}
      {phase === "ended" && (() => {
        const share = totals.cap > 0 ? hud.savedCap / totals.cap : 0;
        const tierIdx = tierIndexFor(share);
        const tier = TIERS[tierIdx];
        return (
          <div style={backdrop}>
            <div style={{ ...bigCard, padding: "40px 56px 36px", minWidth: 560, maxWidth: 680 }}>
              <div style={{ fontSize: 64, fontWeight: 600, lineHeight: 0.95, fontVariantNumeric: "tabular-nums" }}>
                {formatValuation(hud.savedCap)}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.7, marginTop: 14, opacity: 0.9 }}>
                of {formatValuation(totals.cap)} saved. {hud.savedCount} of {totals.count} planets saved.
                <br />
                {formatValuation(Math.max(0, lostCap))} got lost to the chaos.
              </div>
              <div style={{ fontSize: 28, fontWeight: 600, color: tier.color, marginTop: 22 }}>{tier.title}</div>
              <div style={{ fontSize: 14, opacity: 0.7, marginTop: 6 }}>{tier.blurb}</div>
              {/* Tier bar: four butted segments, only the outer corners rounded. */}
              <div style={{ display: "flex", gap: 2, justifyContent: "center", marginTop: 22 }} aria-label={`Tier ${tierIdx + 1} of ${TIERS.length}`}>
                {TIERS.map((t, i) => (
                  <span
                    key={t.title}
                    style={{
                      width: 68,
                      height: 12,
                      borderRadius: i === 0 ? "6px 0 0 6px" : i === TIERS.length - 1 ? "0 6px 6px 0" : 0,
                      background: i <= tierIdx ? t.color : "rgba(255,255,255,0.12)",
                      transition: "background 300ms ease",
                    }}
                  />
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 28 }}>
                <button onClick={onExit} className="mm-hover" style={{ ...bigBtn, background: "#1f2630", color: "#fff" }}>
                  Back to Map
                </button>
                <button onClick={onReplay} className="mm-hover" style={{ ...bigBtn, background: "#3657FD", color: "#fff" }} autoFocus>
                  Play Again <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18, lineHeight: 1, marginLeft: 8 }}>arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* The paddle: fixed-position so it can travel from the sidebar logo. */}
      {paddle && (
        <img
          src="/Evan-logo-new.png"
          alt=""
          draggable={false}
          style={{
            position: "fixed",
            left: paddle.left,
            top: paddle.top,
            width: paddle.w,
            height: paddle.h,
            zIndex: 50,
            pointerEvents: "none",
            userSelect: "none",
            filter: "drop-shadow(0 0 10px rgba(120,160,255,0.55))",
            opacity: paddle.visible ? 1 : 0,
            transition: paddle.animate
              ? "left 900ms cubic-bezier(0.4, 0, 0.2, 1), opacity 360ms ease"
              : "opacity 360ms ease",
          }}
        />
      )}
    </>
  );
}

const ACCENT_YELLOW = "#FCFC06";

/** Performance tiers by share of market cap saved (ascending). */
const TIERS: Array<{ min: number; title: string; blurb: string; color: string }> = [
  { min: 0,    title: "You’re a Media Intern.",       blurb: "The chaos won this round. Fetch coffee, try again.",            color: "#ff791f" },
  { min: 0.1,  title: "You’re a Media Analyst.",      blurb: "You can read the map — now learn to hold it together.",   color: "#8196fe" },
  { min: 0.2,  title: "You’re a Media Mogul.",        blurb: "Most of the universe is still standing. Impressive.",          color: "#ff3fde" },
  { min: 0.3,  title: "You’re a Media Wizard!",       blurb: "Media gravity itself answers to you.",                                color: "#42dcb7" },
];
function tierIndexFor(share: number): number {
  let idx = 0;
  TIERS.forEach((t, i) => { if (share >= t.min) idx = i; });
  return idx;
}

/** HUD stat: big yellow value with a two-line label beneath. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ minWidth: 72 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: ACCENT_YELLOW, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 12, lineHeight: 1.2, marginTop: 3, whiteSpace: "pre-line", opacity: 0.9 }}>{label}</div>
    </div>
  );
}

/** Dimmed, blurred backdrop behind the cards — same recipe as the About modal. */
const backdrop: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 14,
  display: "grid",
  placeItems: "center",
  background: "rgba(2,5,12,0.72)",
  backdropFilter: "blur(3px)",
};

/** The big intro / countdown card: solid navy, generous radius, centred type. */
const bigCard: React.CSSProperties = {
  background: "#0b1322",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 28,
  boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
  color: "#fff",
  fontFamily: FONT,
  textAlign: "center",
};

const bigBtn: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 16,
  fontWeight: 500,
  height: 48,
  padding: "0 22px",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
};
