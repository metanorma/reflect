/**
 * `history.ts` — undo / redo command re-exports (undo-redo.md §7).
 *
 * `prosemirror-history`'s `undo` / `redo` are already plain ProseMirror commands
 * of the canonical `(state, dispatch?) => boolean` shape. Per
 * `EditorCommands.spec.md` §1.10.3, an upstream command reused **unchanged** is
 * re-exported under its **standard name** rather than wrapped in a thin
 * function. This module therefore simply re-exports `undo` / `redo` (and the
 * `undoDepth` / `redoDepth` selectors and the `history` plugin factory).
 *
 * They already conform to the Command contract (`EditorCommands.spec.md` §1.5):
 * pure, query/dispatch parity, non-throwing, and view-free.
 *
 * `HistoryOptions` is re-declared here (and re-exported) because
 * `prosemirror-history` does not export it as a named type — it only uses it
 * internally as the parameter type of `history()`. This local interface is
 * structurally identical.
 */

export {
  undo,
  redo,
  undoDepth,
  redoDepth,
  history,
} from "prosemirror-history";

/**
 * Configuration for the `history()` plugin (undo-redo.md §3, §4.1).
 *
 * Re-declared here because `prosemirror-history` does not export it as a named
 * type; this interface is structurally identical to the upstream one.
 */
export interface HistoryOptions {
  /** The delay (ms) after which a new undo group is started. Default 500. */
  readonly newGroupDelay?: number;
  /** The number of history events collected before the oldest are discarded. */
  readonly depth?: number;
}

