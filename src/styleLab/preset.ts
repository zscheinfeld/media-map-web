// Baked-in style-lab preset. When this is non-null, every visitor sees the map
// styled with it (no ?style=1 needed), layered on top of Sanity — that is how an
// alternative look gets shown on a deploy preview. Paste the JSON from the
// panel's "Copy JSON" button here to bake one.
//
// `null` = no override: the look comes from Sanity (sector default styles,
// company planet styles incl. ombré recipes, Map Settings background). The
// palette approved in Oct 2026 was migrated there by jobs/migrate-palette.ts.

import type { StyleLabState } from "./styleLab";

export const LAB_PRESET: StyleLabState | null = null;
