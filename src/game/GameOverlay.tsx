// Chrome for game mode (see useGameMode): the countdown card, the score HUD in
// the upper right (where the view tabs normally sit), the end-of-round card,
// and the paddle itself — the Eshap logo as a fixed-position <img> so it can
// fly out of the sidebar and across the map.

import { formatValuation } from "@media-map/map-core";
import type { GameHud, GamePhase, PaddleRect } from "./useGameMode";
import { GAME_SECONDS } from "./useGameMode";

const FONT = '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif';

const card: React.CSSProperties = {
  background: "rgba(7,14,32,0.88)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 14,
  backdropFilter: "blur(10px)",
  boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
  color: "#fff",
  fontFamily: FONT,
  textAlign: "center",
};

const btn: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: 1,
  textTransform: "uppercase",
  borderRadius: 8,
  padding: "10px 18px",
  cursor: "pointer",
};

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function GameOverlay({
  phase,
  countdown,
  hud,
  totals,
  paddle,
  onExit,
  onReplay,
}: {
  phase: GamePhase;
  countdown: number;
  hud: GameHud;
  totals: { cap: number; count: number };
  paddle: PaddleRect | null;
  onExit: () => void;
  onReplay: () => void;
}) {
  if (phase === "idle") return null;
  const lostCap = totals.cap - hud.savedCap;

  return (
    <>
      {/* HUD — upper right. */}
      {(phase === "playing" || phase === "countdown") && (
        <div
          style={{
            ...card,
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 13,
            padding: "10px 16px",
            minWidth: 190,
            textAlign: "right",
          }}
        >
          <div style={{ fontSize: 10, letterSpacing: 1.6, opacity: 0.6 }}>MARKET CAP SAVED</div>
          <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
            {formatValuation(phase === "countdown" ? totals.cap || hud.savedCap : hud.savedCap)}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 4, fontSize: 12, opacity: 0.75 }}>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {clock(phase === "countdown" ? GAME_SECONDS : hud.timeLeft)}
            </span>
            <span style={{ opacity: 0.7 }}>Esc to quit</span>
          </div>
        </div>
      )}

      {/* Countdown card — centered, counts 5…1 then disappears. */}
      {phase === "countdown" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 14,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ ...card, padding: "28px 44px", pointerEvents: "auto" }}>
            <div style={{ fontSize: 11, letterSpacing: 2.4, opacity: 0.65 }}>YOU'VE ENTERED</div>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 1.5, marginTop: 2 }}>GAME MODE</div>
            <div
              key={countdown}
              className="mm-count-pop"
              style={{ fontSize: 110, fontWeight: 700, lineHeight: 1, margin: "8px 0 10px", fontVariantNumeric: "tabular-nums" }}
            >
              {countdown}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.85, maxWidth: 360 }}>
              The planets are breaking orbit. Move the Eshap logo with your mouse
              or <kbd style={kbd}>←</kbd> <kbd style={kbd}>→</kbd> to bounce them back
              before they fall out of the universe.
            </div>
            <div style={{ fontSize: 12, opacity: 0.55, marginTop: 10 }}>90 seconds · Esc to leave</div>
          </div>
        </div>
      )}

      {/* End card. */}
      {phase === "ended" && (
        <div
          style={{ position: "absolute", inset: 0, zIndex: 14, display: "grid", placeItems: "center" }}
        >
          <div style={{ ...card, padding: "28px 44px", minWidth: 360 }}>
            <div style={{ fontSize: 11, letterSpacing: 2.4, opacity: 0.65 }}>TIME'S UP</div>
            <div style={{ fontSize: 13, letterSpacing: 1.2, opacity: 0.7, marginTop: 14 }}>YOU SAVED</div>
            <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>
              {formatValuation(hud.savedCap)}
            </div>
            <div style={{ fontSize: 14, opacity: 0.8, marginTop: 6 }}>
              of {formatValuation(totals.cap)} · {hud.savedCount} of {totals.count} planets
            </div>
            {lostCap > 0 && (
              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 4 }}>
                {formatValuation(lostCap)} drifted into the void
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 22 }}>
              <button
                onClick={onReplay}
                className="mm-hover"
                style={{ ...btn, background: "rgba(120,160,255,0.22)", border: "1px solid rgba(150,180,255,0.6)", color: "#fff" }}
              >
                Play again
              </button>
              <button
                onClick={onExit}
                className="mm-hover"
                style={{ ...btn, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff" }}
              >
                Back to the map
              </button>
            </div>
          </div>
        </div>
      )}

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

const kbd: React.CSSProperties = {
  display: "inline-block",
  padding: "0 6px",
  borderRadius: 4,
  border: "1px solid rgba(255,255,255,0.35)",
  fontFamily: FONT,
  fontSize: 12,
  lineHeight: "18px",
};
