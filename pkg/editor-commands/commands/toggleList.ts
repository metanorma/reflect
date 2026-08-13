/**
 * `toggleList` — toggle a list type on/off around the current selection
 * (spec §3).
 *
 * ProseMirror's stock `wrapIn` (from `prosemirror-commands`) can wrap selected
 * blocks in a list but **cannot unwrap** an existing list, so it has no
 * toggle-off semantics. This command provides the wrap / switch / unwrap
 * behaviour the toolbar's `lists` group needs (see `MetanormaToolbar.spec.md`
 * §5.3).
 *
 * Unlike a naïve implementation that calls stock `lift` and `wrapIn` as
 * independent commands (each of which builds and dispatches its own
 * transaction), this command composes all steps **within a single
 * `state.tr`** (spec §1.7.1, §3.3, §3.6.2). That single-transaction discipline
 * is what makes the query form (no `dispatch`) a faithful applicability
 * predicate: the lift+wrap of the switch branch is simulated without ever
 * dispatching.
 *
 * Conforms to the Command contract (§1.5): pure predicate when queried, single
 * transaction when dispatched.
 */

import { liftTarget, findWrapping } from 'prosemirror-transform';
import { NodeSelection } from 'prosemirror-state';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { NodeType } from 'prosemirror-model';

import { NODE_NAME, nodeType, isInside } from '../schema.js';


/**
 * Resolve the list node sitting two levels above the selection's immediate
 * parent (`list > list_item > inline-content`), matching the active-detection
 * rule in spec §3.3 (`$from.node($from.depth - 2)`).
 *
 * Only `bullet_list` and `ordered_list` count; a `dl` is **not** a toggle-list
 * context (§3.5).
 *
 * @returns the list's {@link NodeType}, or `null` when the selection is not
 *          directly inside a (bullet/ordered) list.
 */
function currentListType(state: EditorState): NodeType | null {
  const { $from } = state.selection;
  const depth = $from.depth - 2;
  if (depth < 0) return null;
  const t = $from.node(depth).type;
  const bullet = nodeType(state.schema, NODE_NAME.bullet_list);
  const ordered = nodeType(state.schema, NODE_NAME.ordered_list);
  const isBullet = bullet !== null && t === bullet;
  const isOrdered = ordered !== null && t === ordered;
  if (isBullet || isOrdered) {
    return t;
  }
  return null;
}

/**
 * Toggle a list type on/off around the current selection (spec §3.2).
 *
 * @param state     the editor state to inspect / mutate.
 * @param dispatch  when supplied, receives exactly one transaction (§1.5.2);
 *                  when omitted, the call is a pure applicability test
 *                  (§1.5.1).
 * @param listType  the target list (`bullet_list` / `ordered_list`). When
 *                  omitted, the target is resolved from the active list (for
 *                  the unwrap branch); when there is no active list and no
 *                  target is given, the command is not applicable (§3.2).
 * @returns `true` if a transaction would be / was dispatched, `false` if the
 *          command is not applicable.
 */
export function toggleList(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  listType?: NodeType,
): boolean {
  const { $from, $to } = state.selection;

  // §3.5 — definition-list exclusion. A `dl` is never a valid toggle-list
  // context, even when the selection merely spans into one. Checked first so
  // the command's applicability predicate agrees with the toolbar's
  // `isEnabled` (MetanormaToolbar.spec.md §5.3).
  const fromInDl = isInside(state.schema, $from, NODE_NAME.dl);
  const toInDl = isInside(state.schema, $to, NODE_NAME.dl);
  if (fromInDl || toInDl) {
    return false;
  }

  // §3.4 — node selections on atoms are not applicable. A block atom
  // (`image`/`formula`/`floating_title`) is in the `block` group, so
  // `findWrapping` would otherwise happily wrap it; the spec forbids that
  // (test X3). Non-atom node selections on whole blocks (e.g. a paragraph)
  // fall through to the range logic, which reduces them to a single-block
  // range (§3.4). Structural nodes that cannot be wrapped are rejected later
  // by `findWrapping`/`liftTarget` returning null.
  if (state.selection instanceof NodeSelection && state.selection.node.isAtom) {
    return false;
  }

  const current = currentListType(state);
  // The target defaults to the active list type when none is given (§3.2): the
  // only meaningful action inside a list with no explicit target is to unwrap.
  const target: NodeType | null = listType ?? current;
  if (target === null) {
    // No active list and no target → not applicable (§3.2).
    return false;
  }

  const tr: Transaction = state.tr;

  if (current !== null && current === target) {
    // --- unwrap branch (§3.3) -------------------------------------------
    const range = $from.blockRange($to);
    if (range === null) return false;
    const targetDepth = liftTarget(range);
    if (targetDepth === null) return false;
    tr.lift(range, targetDepth);
  } else if (current !== null) {
    // --- switch branch (§3.3) -------------------------------------------
    // Lift out of the current list first, then re-derive the range on the
    // lifted document (the lift shifts positions) and wrap in the target —
    // all composed within the single `tr`. Recomputing the post-lift range
    // is what keeps the query form (no dispatch) faithful to the effect
    // (§3.3 note, §3.6.1).
    const range = $from.blockRange($to);
    if (range === null) return false;
    const targetDepth = liftTarget(range);
    if (targetDepth === null) return false;
    tr.lift(range, targetDepth);

    const $from2 = tr.doc.resolve(tr.selection.from);
    const $to2 = tr.doc.resolve(tr.selection.to);
    const range2 = $from2.blockRange($to2);
    if (range2 === null) return false;
    const wrapping = findWrapping(range2, target);
    if (wrapping === null) return false;
    tr.wrap(range2, wrapping);
  } else {
    // --- wrap branch (§3.3) ---------------------------------------------
    // `findWrapping` computes the full `list > list_item > <selected block>`
    // chain in one step.
    const range = $from.blockRange($to);
    if (range === null) return false;
    const wrapping = findWrapping(range, target);
    if (wrapping === null) return false;
    tr.wrap(range, wrapping);
  }

  // §1.7.3 / §3.4 — user-initiated command: follow the viewport.
  tr.scrollIntoView();

  // §1.5.2 — exactly one transaction, exactly one dispatch. Building `tr`
  // above does not mutate `state`, so the no-dispatch path is a pure
  // predicate (§1.5.1 / §3.6.1).
  if (dispatch !== undefined) {
    dispatch(tr);
  }
  return true;
}
