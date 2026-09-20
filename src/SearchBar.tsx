// Company search for the map's top bar. Closed it's a single icon button beside
// the view tabs; open, the tabs collapse (the parent animates that) and this
// grows into a text field over the space they occupied. Typing ranks the roster
// into a dropdown and reports the matching names up so the map can dim the rest;
// picking a result hands it back to the parent, which knows how each view
// "travels" (zoom on Map, scroll on Linear/List, highlight on Aggregate).
//
// Deliberately dependency-free: ~250 companies, so matching is a linear scan per
// keystroke, and the combobox behaviour is small enough to own.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatValuation } from "@media-map/map-core";
import { fold, rankMatches, type SearchItem } from "./searchMatch";

const FONT = '"franklin-gothic", "Libre Franklin", "Helvetica Neue", Arial, sans-serif';
const MAX_RESULTS = 8;

/** The label with the matched run emphasised. */
function Highlighted({ label, query }: { label: string; query: string }) {
  const q = fold(query.trim());
  const at = q ? fold(label).indexOf(q) : -1;
  if (at < 0) return <>{label}</>;
  return (
    <>
      {label.slice(0, at)}
      <span style={{ color: "#fff", fontWeight: 700 }}>{label.slice(at, at + q.length)}</span>
      {label.slice(at + q.length)}
    </>
  );
}

export function SearchBar({
  open,
  onOpenChange,
  items,
  onMatchesChange,
  onSelect,
  expandedWidth,
  isMobile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: SearchItem[];
  /** Names of on-year matches for the current query; null = no active query. */
  onMatchesChange: (names: Set<string> | null) => void;
  onSelect: (item: SearchItem) => void;
  /** Width to grow to — the tabs' measured width, so the field fills their place. */
  expandedWidth: number;
  isMobile: boolean;
}) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const ranked = useMemo(() => rankMatches(items, query), [items, query]);
  const shown = ranked.slice(0, MAX_RESULTS);
  const selectable = shown.filter((r) => !r.offYearHint);

  // Tell the map which planets match (ALL matches, not just the visible 8).
  useEffect(() => {
    if (!open || !query.trim()) {
      onMatchesChange(null);
      return;
    }
    onMatchesChange(new Set(ranked.filter((r) => !r.offYearHint).map((r) => r.name)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, ranked]);

  // Every way out (pick, Esc, ✕, click-away) goes through here, so the query is
  // cleared at the moment of closing rather than in an effect afterwards.
  const close = () => {
    setQuery("");
    setActiveIdx(0);
    onOpenChange(false);
  };

  // Focus on open.
  useEffect(() => {
    if (!open) return;
    // Wait for the width transition to start so iOS doesn't scroll the page.
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [open]);

  // "/" opens search from anywhere (unless the user is already typing somewhere).
  useEffect(() => {
    if (open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      onOpenChange(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Click / tap outside closes.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (item: SearchItem) => {
    if (item.offYearHint) return;
    onSelect(item);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!selectable.length) return;
      const d = e.key === "ArrowDown" ? 1 : -1;
      setActiveIdx((i) => (i + d + selectable.length) % selectable.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = selectable[activeIdx];
      if (item) pick(item);
    }
  };

  const activeName = selectable[activeIdx]?.name;
  const iconBtn: React.CSSProperties = {
    flex: "0 0 auto",
    width: 30,
    height: 28,
    display: "grid",
    placeItems: "center",
    background: "transparent",
    border: "none",
    borderRadius: 7,
    color: "rgba(255,255,255,0.75)",
    cursor: "pointer",
    padding: 0,
  };

  return (
    <div
      ref={rootRef}
      style={{
        // Deliberately NOT positioned: the dropdown below is absolute, so it
        // anchors to the nearest positioned ancestor — the view-tab pill that
        // wraps this — letting it match the bar's width exactly.
        display: "flex",
        alignItems: "center",
        // Closed: just the icon. Open: grows over where the tabs were.
        width: open ? expandedWidth : 30,
        transition: "width 260ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <button
        type="button"
        aria-label={open ? "Search" : "Search companies"}
        title="Search companies ( / )"
        className="mm-hover"
        onClick={() => (open ? inputRef.current?.focus() : onOpenChange(true))}
        style={iconBtn}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18, display: "block", lineHeight: 1 }}>
          search
        </span>
      </button>

      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIdx(0); // a new query starts from its best match
        }}
        onKeyDown={onKeyDown}
        placeholder="Search companies"
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeName ? `${listId}-${activeName}` : undefined}
        tabIndex={open ? 0 : -1}
        spellCheck={false}
        autoComplete="off"
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          width: 0,
          background: "transparent",
          border: "none",
          outline: "none",
          color: "white",
          fontFamily: FONT,
          // 16px on mobile stops iOS Safari zooming the page on focus.
          fontSize: isMobile ? 16 : 13,
          letterSpacing: 0.3,
          padding: open ? "0 4px" : 0,
          opacity: open ? 1 : 0,
          transition: "opacity 180ms ease",
        }}
      />

      {open && (
        <button
          type="button"
          aria-label="Close search"
          className="mm-hover"
          onClick={close}
          style={{ ...iconBtn, color: "rgba(255,255,255,0.6)", fontSize: 14 }}
        >
          ✕
        </button>
      )}

      {open && query.trim() && (
        <div
          id={listId}
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 9px)",
            // Stretch to the pill's outer edges (-1 clears its 1px border) so the
            // dropdown is exactly as wide as the search bar, at any tab width.
            left: -1,
            right: -1,
            maxWidth: "calc(100vw - 32px)",
            background: "rgba(10,14,24,0.94)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 10,
            backdropFilter: "blur(10px)",
            boxShadow: "0 12px 34px rgba(0,0,0,0.55)",
            padding: 4,
            fontFamily: FONT,
          }}
        >
          {shown.length === 0 ? (
            <div style={{ padding: "10px 12px", fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
              No companies match “{query.trim()}”
            </div>
          ) : (
            shown.map((r) => {
              const disabled = !!r.offYearHint;
              const active = !disabled && r.name === activeName;
              return (
                <div
                  key={r.name}
                  id={`${listId}-${r.name}`}
                  role="option"
                  aria-selected={active}
                  aria-disabled={disabled}
                  onMouseEnter={() => {
                    const i = selectable.findIndex((s) => s.name === r.name);
                    if (i >= 0) setActiveIdx(i);
                  }}
                  // mousedown (not click) so the input's blur can't swallow it.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(r);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 7,
                    cursor: disabled ? "default" : "pointer",
                    background: active ? "rgba(255,255,255,0.12)" : "transparent",
                    opacity: disabled ? 0.45 : 1,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      flex: "0 0 auto",
                      width: 10,
                      height: 10,
                      borderRadius: r.isEntity ? 2 : "50%",
                      background: r.color,
                      border: "1px solid rgba(255,255,255,0.25)",
                    }}
                  />
                  <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 13,
                        fontWeight: 500,
                        color: "rgba(255,255,255,0.72)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      <Highlighted label={r.label} query={query} />
                    </span>
                    <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>
                      {r.offYearHint ?? r.sector}
                    </span>
                  </span>
                  {!disabled && r.valuation !== undefined && r.valuation > 0 && (
                    <span
                      style={{
                        flex: "0 0 auto",
                        fontSize: 12,
                        color: "rgba(255,255,255,0.7)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatValuation(r.valuation)}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
