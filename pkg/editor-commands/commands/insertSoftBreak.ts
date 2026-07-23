/**
 * `insertSoftBreak` — insert an inline `soft_break` node at the cursor
 * (spec §2.9 / spec §1.6.3 "soft_break, not hardBreak").
 *
 * Distinct from the structural Enter command, `insertSoftBreak` performs a
 * *line break within the current block*: it inserts the inline atom
 * `soft_break` and advances the cursor past it. No structural change.
 *
 * Bound to `Shift-Enter` (spec §2.8). Inside a code block (`sourcecode`),
 * `Shift-Enter` delegates to the code-newline behaviour (insert `\n`) since
 * `soft_break` is not valid inline content of `sourcecode` (content `text*`).
 */

import type { Command } from "prosemirror-state";

import { nodeType, NODE_NAME } from "../schema.js";
import { isInCode } from "../util.js";

/**
 * Insert a `soft_break` node at the current selection.
 *
 * - Ranged selection: deleted first, then the break inserted at the collapsed
 *   position (standard "typing replaces selection" rule, spec §1.7.5).
 * - Collapsed inside an inline-content textblock (`paragraph`, `dt`, a `dd`'s
 *   block, a list item's block): insert `soft_break`, cursor after it.
 * - Inside `sourcecode` (`code: true`): insert `\n` into the text content
 *   instead (no `soft_break` node — see spec §2.9).
 * - Not applicable (e.g. atom selected, no inline-content textblock): return
 *   `false`.
 */
export const insertSoftBreak: Command = (state, dispatch) => {
  // Inside sourcecode: a newline character is the correct content.
  if (isInCode(state.selection.$from)) {
    if (dispatch === undefined) return true;
    const tr = state.tr.deleteSelection();
    tr.insertText("\n");
    tr.scrollIntoView();
    dispatch(tr);
    return true;
  }

  const sbType = nodeType(state.schema, NODE_NAME.soft_break);
  if (sbType === null) return false;

  // Must be inside a textblock that allows inline content.
  if (!state.selection.$from.parent.isTextblock) return false;

  if (dispatch === undefined) return true;

  const tr = state.tr.deleteSelection();
  tr.replaceSelectionWith(sbType.create());
  tr.scrollIntoView();
  dispatch(tr);
  return true;
};
