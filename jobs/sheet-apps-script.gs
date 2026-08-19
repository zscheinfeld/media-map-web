/**
 * Auto-stamps the "Last Updated" column of the Google Finance valuation sheet.
 *
 *   • Manual edit of any data cell  → onEdit stamps that row with today's date.
 *   • Google Finance (live) rows     → a DAILY time-trigger stamps them "today",
 *                                      since their market caps refresh continuously.
 *
 * Google Sheets has NO event for a GOOGLEFINANCE recalculation, and onEdit does
 * NOT fire on API writes (the nightly reconciler) or on formula recalcs — so the
 * daily trigger is how live rows get their freshness date.
 *
 * Robust to: a KEY/legend row above the header (the header row is found by locating
 * "slug"), and emoji markers in headers ("Ticker 🔒", "Last Updated ⏱️") — both are
 * normalized away before matching. Dates are written yyyy-mm-dd for the CSV parser.
 *
 * ── SETUP ──────────────────────────────────────────────────────────────────
 *  1. In the sheet: Extensions → Apps Script. Delete the stub, paste this file, Save.
 *  2. onEdit is a simple trigger — works immediately. Test by editing a manual
 *     company's year cell; its Last Updated should fill in.
 *  3. Daily GF stamp: Triggers (clock icon) → Add Trigger → `stampGoogleFinanceRows`
 *     → Time-driven → Day timer. Authorize.
 *  4. (Optional) Run `stampGoogleFinanceRows` once now to backfill every GF row.
 */

/** Normalize a header for matching: drop emoji / markers, collapse space, lowercase. */
function norm_(h) {
  return String(h == null ? '' : h).replace(/[^\p{L}\p{N}_ ]+/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** 1-based index of the header row (first row containing a `slug` cell). Falls back to 1. */
function headerRow_(sh) {
  var n = Math.min(sh.getLastRow(), 10) || 1;
  var top = sh.getRange(1, 1, n, sh.getLastColumn()).getValues();
  for (var r = 0; r < top.length; r++) {
    if (top[r].map(norm_).indexOf('slug') >= 0) return r + 1;
  }
  return 1;
}

/** 1-based index of a column by header name in the header row (0 if missing). */
function colIndex_(sh, header, hRow) {
  var hdr = sh.getRange(hRow, 1, 1, sh.getLastColumn()).getValues()[0].map(norm_);
  var t = norm_(header);
  for (var i = 0; i < hdr.length; i++) if (hdr[i] === t) return i + 1;
  return 0;
}

/** Simple trigger: fires on every MANUAL cell edit. Stamps the edited row. */
function onEdit(e) {
  var sh = e.range.getSheet();
  var row = e.range.getRow();
  var hRow = headerRow_(sh);
  if (row <= hRow) return; // key row / header row
  var luCol = colIndex_(sh, 'last updated', hRow);
  if (!luCol || e.range.getColumn() === luCol) return; // ignore our own writes
  if (!sh.getRange(row, 1).getValue()) return; // blank slug = not a data row
  var cell = sh.getRange(row, luCol);
  cell.setValue(new Date());
  cell.setNumberFormat('yyyy-mm-dd');
}

/** Time-driven (set a DAILY trigger): stamp every Google Finance row as fresh today. */
function stampGoogleFinanceRows() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var hRow = headerRow_(sh);
  var last = sh.getLastRow();
  if (last <= hRow) return;
  var n = last - hRow;
  var slugCol = colIndex_(sh, 'slug', hRow);
  var srcCol = colIndex_(sh, 'data source', hRow);
  var luCol = colIndex_(sh, 'last updated', hRow);
  if (!slugCol || !srcCol || !luCol) return;
  var slugs = sh.getRange(hRow + 1, slugCol, n, 1).getValues();
  var srcs = sh.getRange(hRow + 1, srcCol, n, 1).getValues();
  var luRange = sh.getRange(hRow + 1, luCol, n, 1);
  var stamps = luRange.getValues();
  var today = new Date();
  for (var i = 0; i < n; i++) {
    if (!slugs[i][0]) continue;
    if (norm_(srcs[i][0]) === 'google finance') stamps[i][0] = today;
  }
  luRange.setValues(stamps);
  luRange.setNumberFormat('yyyy-mm-dd');
}
