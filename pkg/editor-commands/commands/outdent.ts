/**
 * `outdent.ts` — outdent command (outdent.md §3).
 *
 * Wraps `prosemirror-commands`'s `lift` with a guard that prevents lifting out
 * of structural containers where a bare paragraph would be invalid or
 * unexpected (e.g. lifting a paragraph out of a `references` section into
 * `bibliography`). Without this guard, `lift` sees that both `references` and
 * `bibliography` accept `block` children and happily moves the paragraph,
 * destroying the references structure.
 *
 * Conforms to the Command contract (`EditorCommands.spec.md` §1.5): pure,
 * query/dispatch parity, non-throwing, and view-free.
 */

import { lift as pmLift } from 'prosemirror-commands';
import type { Command } from 'prosemirror-state';

/** Node type names where lifting a block child out is structurally harmful. */
const NO_LIFT_ANCESTORS: ReadonlySet<string> = new Set([
  'references',
]);

/**
 * The Outdent command — a guarded `lift`.
 *
 * Delegates to stock `lift` unless the cursor is inside a `references` node
 * (or another structural container in `NO_LIFT_ANCESTORS`), in which case it
 * returns `false` (disabled).
 */
export const lift: Command = (state, dispatch) => {
  const { $from } = state.selection;
  for (let d = $from.depth; d >= 1; d--) {
    if (NO_LIFT_ANCESTORS.has($from.node(d).type.name)) return false;
  }
  return pmLift(state, dispatch);
};
