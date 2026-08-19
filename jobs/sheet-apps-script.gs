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
 * Dates are written as real Dates formatted yyyy-mm-dd, so the published CSV the
 * app reads (loadValuations.ts parses "YYYY-MM-DD") gets a clean date string.
 *
 * ── SETUP ──────────────────────────────────────────────────────────────────
 *  1. In the sheet: Extensions → Apps Script. Delete the stub, paste this file,
 *     Save (name it e.g. "Last Updated stamper").
 *  2. onEdit is a simple trigger — it works immediately after saving. Test by
 *     typing in a manual company's year cell; its Last Updated should fill in.
 *  3. For the daily GF stamp: Apps Script left rail → Triggers (clock icon) →
 *     Add Trigger → function `stampGoogleFinanceRows`, event source "Time-driven",
 *     "Day timer", pick an hour (e.g. after the nightly reconciler). Authorize.
 *  4. (Optional) Run `stampGoogleFinanceRows` once now to backfill every GF row.
 */

/** 1-based index of a column by its header name (0 if missing). */
function colIndex_(sh, header) {
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var i = 0; i < hdr.length; i++) {
    if (String(hdr[i]).trim().toLowerCase() === header.toLowerCase()) return i + 1;
  }
  return 0;
}

/** Simple trigger: fires on every MANUAL cell edit. Stamps the edited row. */
function onEdit(e) {
  var sh = e.range.getSheet();
  var row = e.range.getRow();
  if (row === 1) return; // header row
  var luCol = colIndex_(sh, 'last updated');
  if (!luCol || e.range.getColumn() === luCol) return; // ignore our own writes
  if (!sh.getRange(row, 1).getValue()) return; // blank slug = not a data row
  var cell = sh.getRange(row, luCol);
  cell.setValue(new Date());
  cell.setNumberFormat('yyyy-mm-dd');
}

/** Time-driven (set a DAILY trigger): stamp every Google Finance row as fresh today. */
function stampGoogleFinanceRows() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var last = sh.getLastRow();
  if (last < 2) return;
  var n = last - 1;
  var slugCol = colIndex_(sh, 'slug');
  var srcCol = colIndex_(sh, 'data source');
  var luCol = colIndex_(sh, 'last updated');
  if (!slugCol || !srcCol || !luCol) return;
  var slugs = sh.getRange(2, slugCol, n, 1).getValues();
  var srcs = sh.getRange(2, srcCol, n, 1).getValues();
  var luRange = sh.getRange(2, luCol, n, 1);
  var stamps = luRange.getValues();
  var today = new Date();
  for (var i = 0; i < n; i++) {
    if (!slugs[i][0]) continue;
    if (String(srcs[i][0]).trim().toLowerCase() === 'google finance') stamps[i][0] = today;
  }
  luRange.setValues(stamps);
  luRange.setNumberFormat('yyyy-mm-dd');
}
