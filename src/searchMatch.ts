// Search matching for the map's top-bar search (see SearchBar.tsx). Kept apart
// from the component so the file that exports a component exports only that,
// and so the ranking can be exercised on its own.

export type SearchItem = {
  /** Identity — the node / row / band name the parent acts on. */
  name: string;
  /** What's drawn on the map (authoring markers stripped). */
  label: string;
  sector: string;
  /** Sector swatch colour for the result row. */
  color: string;
  /** Billions USD; absent for text-only entities. */
  valuation?: number;
  ticker?: string;
  isEntity?: boolean;
  /** Set when the company isn't on the viewed year: shown greyed, not selectable. */
  offYearHint?: string;
};

/** Case- and accent-insensitive ("artemis" finds "Artémis"). Precomposed input
 *  keeps its length, so match offsets index straight into the original label. */
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Every item matching `query`, best first: name starts with it → a word starts
 * with it (or the ticker does) → it appears anywhere. Ties: companies on the
 * viewed year before off-year ones, then bigger first, then alphabetical.
 */
export function rankMatches(items: SearchItem[], query: string): SearchItem[] {
  const q = fold(query.trim());
  if (!q) return [];
  const scored: { item: SearchItem; score: number }[] = [];
  for (const item of items) {
    const label = fold(item.label);
    const ticker = item.ticker ? fold(item.ticker) : "";
    let score = -1;
    if (label.startsWith(q)) score = 0;
    else if (label.split(/[\s/+&().,-]+/).some((w) => w.startsWith(q)) || (ticker && ticker.startsWith(q))) score = 1;
    else if (label.includes(q)) score = 2;
    if (score >= 0) scored.push({ item, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      Number(!!a.item.offYearHint) - Number(!!b.item.offYearHint) ||
      (b.item.valuation ?? 0) - (a.item.valuation ?? 0) ||
      a.item.label.localeCompare(b.item.label),
  );
  return scored.map((s) => s.item);
}
