/**
 * `outdent.ts` — outdent command re-export (outdent.md §3).
 *
 * `prosemirror-commands`'s `lift` is already a plain ProseMirror command of the
 * canonical `(state, dispatch?) => boolean` shape. Per
 * `EditorCommands.spec.md` §1.10.3, an upstream command reused **unchanged**
 * is re-exported under its **standard name** rather than wrapped in a thin
 * function. This module therefore simply re-exports `lift` as the Outdent
 * action — a general-purpose "decrease nesting level" primitive.
 *
 * It already conforms to the Command contract (`EditorCommands.spec.md` §1.5):
 * pure, query/dispatch parity, non-throwing, and view-free. The query
 * (`lift(state) === true`) is the toolbar button's `isEnabled` test.
 */

export { lift } from "prosemirror-commands";
