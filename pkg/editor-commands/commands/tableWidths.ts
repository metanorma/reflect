/**
 * Table column-width commands (tables.md §8.6 — column sizing).
 *
 * The `table` node's `colwidths` attribute stores one percentage string per
 * grid column; `null` is the autowidth mode. This module owns every attr
 * write path:
 *
 * - `setColumnWidths` — the single write primitive (used by the drag plugin
 *   and the numeric channel). **Not** a Command-contract function: its extra
 *   `pos` parameter (the table's doc position) precedes `dispatch`, so it
 *   cannot serve as a predicate via an omitted `dispatch` and is not
 *   adapter-bindable as a toolbar command. Internal write path.
 * - `autoTableWidths` — the "Auto widths" command (returns to `null`).
 * - `distributeColumnsEvenly` — equal shares for every grid column.
 *
 * `autoTableWidths` and `distributeColumnsEvenly` conform to the Command
 * contract (AdvancedMetanormaToolbar/README.md §6.2; EditorCommands.spec.md
 * §1.5): pure predicate when `dispatch` is omitted, single transaction when
 * dispatched. No `EditorView`/DOM.
 */

import type { EditorState, Transaction } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';

import {
  equalWidths,
  tableGridColumnCount,
} from '@metanorma/prosemirror-schema';

/**
 * Minimum column width in pixels, applied at drag time by the resize plugin
 * (converted to a percentage of the table's measured pixel width). The
 * DOM-free commands here use {@link MIN_COLUMN_SHARE_PCT} instead — they
 * have no table geometry to convert against.
 */
export const MIN_COLUMN_WIDTH_PX = 40;

/**
 * Structural minimum share (in percent) used by the DOM-free write paths —
 * a column narrower than 1% cannot render a usable cell border hit area at
 * any realistic table width.
 */
export const MIN_COLUMN_SHARE_PCT = 1;

/** Parse `"16.67%"` → `16.67`. Returns `null` for non-positive percentages. */
function pctToNumber(s: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*%?\s*$/.exec(s);
  if (m === null) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

/** Round to 2 decimals. */
const r2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Enforce `MIN_COLUMN_SHARE_PCT` on a scaled list that already sums to 100:
 * entries below the floor are raised to it, and the equal deficit is taken
 * from the widest entry (so the sum is preserved exactly, in 2-decimal
 * space). When the floor cannot be satisfied for every column, the list is
 * structurally too wide — equal shares are the only reading.
 */
function enforceMinShares(scaled: number[]): string[] {
  const cols = scaled.length;
  if (cols * MIN_COLUMN_SHARE_PCT > 100) return equalWidths(cols);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < cols; i++) {
      const cur = scaled[i] ?? 0;
      if (cur >= MIN_COLUMN_SHARE_PCT) continue;
      const need = r2(MIN_COLUMN_SHARE_PCT - cur);
      let donor = -1;
      for (let j = 0; j < cols; j++) {
        if (j === i) continue;
        const cand = scaled[j] ?? 0;
        if (donor === -1 || cand > (scaled[donor] ?? 0)) donor = j;
      }
      const donorVal = donor >= 0 ? (scaled[donor] ?? 0) : 0;
      if (donor === -1 || donorVal - need < MIN_COLUMN_SHARE_PCT) {
        return equalWidths(cols);
      }
      scaled[i] = r2(cur + need);
      scaled[donor] = r2(donorVal - need);
      changed = true;
    }
  }
  return scaled.map((n) => `${n.toFixed(2)}%`);
}

/** Normalize a number list to the canonical `"N.NN%"` strings (sum exactly 100). */
function toWidthStrings(pcts: number[], cols: number): string[] {
  const clamped = pcts.slice(0, cols);
  while (clamped.length < cols) clamped.push(0);
  const sum = clamped.reduce((a, b) => a + b, 0);
  if (sum <= 0) return equalWidths(cols);
  const scaled = clamped.map((n) => Math.round((n / sum) * 10000) / 100);
  const scaledSum = scaled.reduce((a, b) => a + b, 0);
  const last = scaled.pop() ?? 0;
  scaled.push(r2(last + (100 - scaledSum)));
  return enforceMinShares(scaled);
}

/**
 * The table node starting exactly at doc position `pos`, or `null` when no
 * `table` node begins there. (`doc.nodeAt(pos)` — the node starting at the
 * position, not an ancestor lookup.)
 */
function tableAt(state: EditorState, pos: number): Node | null {
  const node = state.doc.nodeAt(pos);
  if (node === null || node.type.name !== 'table') return null;
  return node;
}

/** Nearest enclosing `table` ancestor of the selection, or `null`. */
function nearestEnclosingTable(state: EditorState): Node | null {
  const { $from } = state.selection;
  for (let d = $from.depth; d >= 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'table') return node;
  }
  return null;
}

/**
 * Set the `colwidths` attribute of the table at doc position `pos`.
 *
 * **Internal write path** — the signature (extra `pos` before `dispatch`)
 * deviates from the Command contract, so this is exported for the resize
 * plugin and the numeric channel only; it is not toolbar-bindable.
 *
 * `pcts` are percentage numbers (any normalization state); they are clamped
 * to `MIN_COLUMN_SHARE_PCT`, forced to the table's grid column count, and
 * normalized to 2-decimal strings summing to exactly 100 (last column
 * absorbs the rounding residual) before the single `setNodeMarkup`.
 *
 * @returns `true` when a transaction was dispatched, `false` when `pos` is
 * not a table or the input is unrecoverable.
 */
export function setColumnWidths(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  pos: number,
  pcts: readonly number[],
): boolean {
  const table = tableAt(state, pos);
  if (table === null) return false;
  const cols = tableGridColumnCount(table);
  if (cols <= 0) return false;
  const positive = pcts.filter((n) => Number.isFinite(n) && n > 0);
  if (positive.length === 0) return false;

  const widths = toWidthStrings(positive, cols);
  const tr = state.tr;
  tr.setNodeAttribute(pos, 'colwidths', widths);
  dispatch(tr);
  return true;
}

/**
 * Return the nearest enclosing table to autowidth mode (`colwidths: null`).
 *
 * Predicate (no `dispatch`): applicable iff the selection sits inside a
 * table that currently has fixed column widths.
 */
export function autoTableWidths(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const table = nearestEnclosingTable(state);
  if (table === null) return false;
  if (table.attrs['colwidths'] == null) return false;

  if (dispatch === undefined) return true;

  const pos = tablePosOf(state);
  if (pos === null) return false;
  const tr = state.tr;
  tr.setNodeAttribute(pos, 'colwidths', null);
  dispatch(tr);
  return true;
}

/**
 * Set every grid column of the nearest enclosing table to an equal share.
 *
 * Predicate (no `dispatch`): applicable iff the selection sits inside a
 * table. Works in both modes — on an autowidth table it materializes equal
 * widths (the one intentional mode flip besides first-drag).
 */
export function distributeColumnsEvenly(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const table = nearestEnclosingTable(state);
  if (table === null) return false;

  if (dispatch === undefined) return true;

  const cols = tableGridColumnCount(table);
  if (cols <= 0) return false;
  const pos = tablePosOf(state);
  if (pos === null) return false;
  const widths = equalWidths(cols);
  const tr = state.tr;
  tr.setNodeAttribute(pos, 'colwidths', widths);
  dispatch(tr);
  return true;
}

/** Doc position of the selection's nearest enclosing table, or `null`. */
function tablePosOf(state: EditorState): number | null {
  const { $from } = state.selection;
  for (let d = $from.depth; d >= 0; d--) {
    if ($from.node(d).type.name === 'table') return $from.before(d);
  }
  return null;
}

export { pctToNumber };
