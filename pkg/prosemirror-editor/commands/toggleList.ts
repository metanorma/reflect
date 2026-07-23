/**
 * `toggleList` — toggle a list type on/off around the current selection (§5.3).
 *
 * ProseMirror's `prosemirror-commands` `wrapIn` can wrap selected blocks in a
 * list, but **cannot unwrap** an existing list. This helper adds the toggle
 * semantics the toolbar needs:
 *
 * - Already inside `listType`  → lift the selected block(s) out of the list.
 * - Inside a *different* list  → lift out first, then wrap in `listType`.
 * - Not in a list              → wrap the selected block(s) in a `list_item`
 *   inside `listType` (`wrapIn` computes the full `list > list_item > content`
 *   chain via ProseMirror's `findWrapping`).
 *
 * Defined here (rather than in the schema package) because it depends on
 * `prosemirror-commands`, which is an editor-layer concern.
 */

import { lift, wrapIn } from "prosemirror-commands";
import type { NodeType } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/**
 * Resolve the list node sitting two levels above the selection's immediate
 * parent (`list > list_item > inline-content`), matching the active-detection
 * rule in §5.3 (`$from.node(-2)`).
 *
 * @returns the list's {@link NodeType}, or `null` when the selection is not
 *          directly inside a list.
 */
function currentListType(state: EditorState): NodeType | null {
  const { $from } = state.selection;
  const depth = $from.depth - 2;
  if (depth < 0) return null;
  const nodeType = $from.node(depth).type;
  const bullet = state.schema.nodes["bullet_list"];
  const ordered = state.schema.nodes["ordered_list"];
  if (nodeType === bullet || nodeType === ordered) {
    return nodeType;
  }
  return null;
}

/**
 * Toggle a list type on/off around the current selection.
 *
 * @param view      The editor view to dispatch against.
 * @param listType  The target list node type (`bullet_list` / `ordered_list`).
 * @returns `true` if a transaction was dispatched.
 */
export function toggleList(view: EditorView, listType: NodeType): boolean {
  const dispatch = (tr: Transaction): void => {
    view.dispatch(tr);
  };

  const current = currentListType(view.state);

  // Case 1: same list type → unwrap (lift the block(s) out of the list).
  if (current === listType) {
    return lift(view.state, dispatch);
  }

  // Case 2: different list type → lift out of the current list first. `lift`
  // dispatches synchronously, so `view.state` is updated for the wrap below.
  if (current !== null) {
    lift(view.state, dispatch);
  }

  // Case 3 (and continuation of 2): wrap in the target list. `wrapIn(listType)`
  // asks `findWrapping` for the full chain, producing `list > list_item > <the
  // selected block>` in one step.
  return wrapIn(listType)(view.state, dispatch);
}
