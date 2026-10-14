/**
 * `insertTable` — insert a `rows × cols` table at the current selection
 * (tables.md §8).
 *
 * Builds a deeply nested, schema-valid subtree
 * (`table > table_body > table_row+ > table_cell+`, each cell seeded with an
 * empty paragraph) and places the cursor in the first cell.
 *
 * Conforms to the Command contract (AdvancedMetanormaToolbar/README.md §6.2;
 * §1.5): pure predicate when queried (no `dispatch`), single transaction when
 * dispatched. No `EditorView`/DOM — the adapter layer in `@metanorma/toolbar`
 * owns the view and focus.
 */

import { TextSelection } from 'prosemirror-state';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { Node, Schema } from 'prosemirror-model';

import { generateId, canInsertBlockAdjacent } from '../util.js';


/** Maximum grid-picker dimensions (tables.md §5.1 — 10 × 10). */
export const MAX_ROWS = 10;
export const MAX_COLS = 10;

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

/**
 * True when a table may be inserted at the current selection (tables.md §7.2).
 *
 * Refuses to nest tables (bails if any ancestor is a `table_cell` or `table`),
 * requires a slot for the table immediately after the cursor's textblock in
 * its block parent, and rejects multi-block range selections. The cursor's
 * textblock must be body content — not a `section_title` heading.
 */
export function canInsertTable(state: EditorState): boolean {
  const { $from } = state.selection;
  const schema = state.schema;

  // 1. Refuse to nest tables: bail if any ancestor is a table_cell or table.
  const cellType = schema.nodes['table_cell'];
  const tableType = schema.nodes['table'];
  if (cellType !== undefined || tableType !== undefined) {
    for (let d = $from.depth; d > 0; d--) {
      const ancestor = $from.node(d);
      if (cellType !== undefined && ancestor.type === cellType) return false;
      if (tableType !== undefined && ancestor.type === tableType) return false;
    }
  }

  // 2. A slot for the table must exist immediately after the cursor's
  // textblock, in the textblock's own parent (insertion-shaped; excludes
  // section_title via the shared body-block context).
  const table = schema.nodes['table'];
  if (table === undefined) return false;
  if (!canInsertBlockAdjacent(state, table)) return false;

  // 3. A range selection spanning multiple block siblings is not supported in
  // v1.
  if (!state.selection.empty) {
    const $to = state.selection.$to;
    if ($from.parent !== $to.parent) return false;
  }

  return true;
}

/**
 * Build the table node tree bottom-up: a seeded empty `table_name` caption
 * first child, then `table_body > table_row+ > table_cell+`, each cell holding
 * a single empty paragraph (a `block`, satisfying `table_cell`'s `block+`
 * content). The `table` node carries a generated `id` (§8.1.2). Node types are
 * resolved off the passed schema, not a captured singleton.
 */
function buildTable(schema: Schema, rows: number, cols: number): Node | null {
  const cellType = schema.nodes['table_cell'];
  const rowType = schema.nodes['table_row'];
  const bodyType = schema.nodes['table_body'];
  const tableType = schema.nodes['table'];
  const paragraphType = schema.nodes['paragraph'];
  const nameType = schema.nodes['table_name'];
  if (
    cellType === undefined ||
    rowType === undefined ||
    bodyType === undefined ||
    tableType === undefined ||
    paragraphType === undefined ||
    nameType === undefined
  ) {
    return null;
  }

  const emptyParagraph = paragraphType.create();

  const rowNodes = Array.from({ length: rows }, () => {
    const cells = Array.from({ length: cols }, () =>
      // colspan/rowspan default to 1 via the schema; we do not set them.
      cellType.create(null, [emptyParagraph]),
    );
    return rowType.create(null, cells);
  });

  const body = bodyType.create(null, rowNodes);
  // table attrs: id is generated (§8.1.2), number defaults null, data {}.
  // The caption is seeded empty (tables.md §8.1.3): Enter inside it exits to
  // the first cell (`exitName`); Backspace on the empty caption deletes it.
  return tableType.create({ id: generateId() }, [nameType.create(), body]);
}

/**
 * Insert a `rows × cols` table at the current selection (tables.md §8.1).
 *
 * @returns `true` if insertion applies / was applied, else `false`.
 */
export function insertTable(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  rows?: number,
  cols?: number,
): boolean {
  // Single shared legality check for query and dispatch paths (§7.2, §8.2.1).
  if (!canInsertTable(state)) return false;

  // Query path: no dispatch → act as a pure applicability predicate, mutate
  // nothing (docs/EditorCommands.spec.md §1.5(1)).
  if (dispatch === undefined) return true;

  const r = clamp(rows ?? 1, 1, MAX_ROWS);
  const c = clamp(cols ?? 1, 1, MAX_COLS);
  const table = buildTable(state.schema, r, c);
  if (table === null) return false;
  const tableType = table.type; // the resolved table node type (from buildTable)

  const tr = state.tr;
  tr.replaceSelectionWith(table);

  // Place the cursor in the seeded empty caption (tables.md §8.1.3): the
  // author types the table's caption first, then Enter (`exitName`) descends
  // into the first cell. Locate the inserted table by its generated id — the
  // position depends on whether replaceSelectionWith replaced an empty
  // textblock wholesale or split a non-empty one at the caret, so neither
  // pre- nor post-replace selection arithmetic is reliable.
  const tableId = table.attrs['id'];
  let tablePos = -1;
  tr.doc.descendants((n, p) => {
    if (tablePos !== -1) return false;
    if (n.type === tableType && n.attrs['id'] === tableId) {
      tablePos = p;
      return false;
    }
    return true;
  });
  const caption = table.firstChild;
  if (tablePos !== -1 && caption !== null && caption.type.name === 'table_name') {
    const captionPos = tablePos + 2; // table open + caption open
    tr.setSelection(TextSelection.near(tr.doc.resolve(captionPos), 1));
  }

  tr.scrollIntoView(); // user-initiated command (§1.7.3)
  dispatch(tr); // exactly one transaction, dispatched once (§1.7.1)
  return true;
}
