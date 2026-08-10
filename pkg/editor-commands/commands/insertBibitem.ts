/**
 * `insertBibitem` — insert a new `bibitem` atom node inside a `references`
 * section (Relaton integration).
 *
 * A pure `Command` (EditorCommands.spec.md §1.5): reads `state.schema` directly,
 * no EditorView/DOM, no factory, non-throwing. Query/dispatch parity.
 */

import type { EditorState, Transaction } from "prosemirror-state";
import { NodeSelection } from "prosemirror-state";

/**
 * Insert an empty `bibitem` atom node at the current selection.
 *
 * Applicable only when the cursor is inside a `references` section node (the
 * sole container whose content expression permits `bibitem`). When dispatched,
 * replaces the selection with a new `bibitem` node (item: null) and sets a
 * NodeSelection on it, so the NodeView's click-to-edit popover can be opened
 * immediately.
 *
 * @param state  The editor state.
 * @param dispatch  The dispatch function (omit to query applicability).
 * @returns `true` if applicable (inside a `references` section), `false` otherwise.
 */
export function insertBibitem(
  state: EditorState,
  dispatch?: ((tr: Transaction) => void) | undefined,
): boolean {
  const { bibitem: bibitemType } = state.schema.nodes;
  if (bibitemType === undefined) return false;

  // Applicable only inside a `references` section.
  const $from = state.selection.$from;
  let inReferences = false;
  for (let d = $from.depth; d >= 0; d--) {
    if ($from.node(d).type.name === "references") {
      inReferences = true;
      break;
    }
  }
  if (!inReferences) return false;

  if (dispatch !== undefined) {
    const node = bibitemType.create({ item: null });
    const tr = state.tr.replaceSelectionWith(node);
    // Place a NodeSelection on the newly inserted node so the user can
    // immediately interact with it (click to edit, or arrow past it).
    const pos = tr.selection.from;
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    dispatch(tr);
  }

  return true;
}
