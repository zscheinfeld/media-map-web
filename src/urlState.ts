// The address bar follows the app: each view, the Time Machine (and the year it
// is on), a past year's map, the About modal (and its Downloads tab) and the
// game have an address, and back / forward move between them. The address
// never drives a transition of its own — applying one calls the same functions
// a click does. Query strings (?layout=1 and friends) are left alone.

import { START_YEAR } from "./historical";

export type AppView = "map" | "linear" | "aggregate" | "list";
export type AboutSection = "about" | "downloads";

export type AppRoute = {
  view: AppView;
  /** A past year the map is on; null = the current year. */
  year: number | null;
  /** The Time Machine is open (focused on `year` when given). */
  timeMachine: { year: number | null } | null;
  about: AboutSection | null;
  game: boolean;
};

export const HOME_ROUTE: AppRoute = { view: "map", year: null, timeMachine: null, about: null, game: false };

const VIEWS: AppView[] = ["map", "linear", "aggregate", "list"];
const isView = (s: string): s is AppView => (VIEWS as string[]).includes(s);

/** A year that can be on the map: START_YEAR up to the current one. */
export function isRoutableYear(y: number, currentYear: number): boolean {
  return Number.isInteger(y) && y >= START_YEAR && y <= currentYear;
}

export function parseRoute(pathname: string, currentYear: number): AppRoute {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const r: AppRoute = { ...HOME_ROUTE };
  if (parts.length === 0) return r;
  const [head, second] = parts;
  const yearOf = (s: string | undefined) => {
    const y = Number(s);
    return s !== undefined && isRoutableYear(y, currentYear) ? y : null;
  };
  if (head === "time-machine") {
    r.timeMachine = { year: yearOf(second) };
  } else if (head === "about") {
    r.about = second === "downloads" ? "downloads" : "about";
  } else if (head === "game") {
    r.game = true;
  } else if (isView(head)) {
    r.view = head;
    const y = yearOf(second);
    r.year = y !== null && y !== currentYear ? y : null;
  }
  return r;
}

/** The address for a state (one of: game, About, Time Machine, a view at a year). */
export function routePath(r: AppRoute): string {
  if (r.game) return "/game";
  if (r.about) return r.about === "downloads" ? "/about/downloads" : "/about";
  if (r.timeMachine) return r.timeMachine.year !== null ? `/time-machine/${r.timeMachine.year}` : "/time-machine";
  const view = r.view === "map" ? "" : r.view;
  if (r.year !== null) return `/${r.view}/${r.year}`;
  return view ? `/${view}` : "/";
}

const VIEW_LABEL: Record<AppView, string> = { map: "Map", linear: "Linear", aggregate: "Aggregate", list: "List" };

/** The tab title for a state. */
export function routeTitle(r: AppRoute, site: string): string {
  if (r.game) return `Game · ${site}`;
  if (r.about) return `${r.about === "downloads" ? "Downloads" : "About"} · ${site}`;
  if (r.timeMachine) return `Time Machine${r.timeMachine.year !== null ? ` ${r.timeMachine.year}` : ""} · ${site}`;
  if (r.year !== null) return `${r.year} ${VIEW_LABEL[r.view]} · ${site}`;
  return r.view === "map" ? site : `${VIEW_LABEL[r.view]} · ${site}`;
}

/** Every address worth listing in the sitemap (the game is not one). */
export function sitemapPaths(currentYear: number): string[] {
  const out = ["/", "/linear", "/aggregate", "/list", "/time-machine", "/about", "/about/downloads"];
  for (let y = START_YEAR; y <= currentYear; y++) {
    out.push(`/time-machine/${y}`);
    if (y !== currentYear) for (const v of VIEWS) out.push(`/${v}/${y}`);
  }
  return out;
}
