/**
 * `enterDefinitionList` — Enter behaviour inside a definition list
 * (spec §2.4.4).
 *
 * Fully custom — there is no upstream command for the `(dt dd)+` model (spec
 * §1.6.3). The alternation invariant is the dominant constraint: a `dl` is
 * never left with two adjacent `dt` or two adjacent `dd` nodes, and never with
 * a trailing `dt` lacking a `dd`.
 *
 * Behaviour (spec §2.4.4 table):
 *
 * - inside a `dt` that has a following `dd` → **commit the term**: move the
 *   cursor to the start of that `dd`'s first block. No new node.
 * - inside a `dt` with no following `dd` (defensive; should not occur in a
 *   valid doc) → insert a `dd` (empty paragraph) after the `dt`; cursor in it.
 * - middle/end of a non-last block inside a `dd` → **not applicable** (returns
 *   `false`); the chain falls through to `splitBlockKeepMarks`. (Kept out of
 *   this command to honour spec §1.9.3 "no hidden ordering".)
 * - end of the LAST block, the `dd` is the LAST child of the `dl`, block
 *   non-empty → **start a new entry**: insert a `(dt empty, dd empty-paragraph)`
 *   pair after the `dd`; cursor in the new `dt`.
 * - empty paragraph as the only block of the last `dd` → **exit the dl**:
 *   remove the trailing `(dt dd)` pair; if it was the only pair, remove the
 *   `dl`; insert an empty paragraph after; cursor in it.
 * - empty paragraph in a `dd` that is NOT last → **not applicable** (falls
 *   through to split).
 *
 * Enter never splits a `dt` (terms are single-line).
 */

import type { Schema } from "prosemirror-model";
import type { Command } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";

import { NODE_NAME, nodeType, isEmptyTextblock } from "../schema.js";

/** Sentinel depth meaning "not inside a dl / dt / dd". */
const NOT_FOUND = -1;

/**
 * Build an `enterDefinitionList` command bound to the given schema.
 *
 * Exposed as a plain `Command` (not a factory) in the spec's §2.7 inventory,
 * but we still resolve types through `state.schema` so the command is safe on
 * a composed schema at runtime. The schema parameter is accepted for symmetry
 * with {@link splitListItem} and for unit-testability against a fixture schema.
 */
export function enterDefinitionList(schema: Schema): Command {
  const dlType = nodeType(schema, NODE_NAME.dl);
  const dtType = nodeType(schema, NODE_NAME.dt);
  const ddType = nodeType(schema, NODE_NAME.dd);
  const paraType = nodeType(schema, NODE_NAME.paragraph);
  if (dlType === null || dtType === null || ddType === null || paraType === null) {
    return () => false;
  }

  return (state, dispatch) => {
    const { $from } = state.selection;

    // Locate dt / dd / dl ancestors, if any.
    let dtDepth = NOT_FOUND;
    let ddDepth = NOT_FOUND;
    let dlDepth = NOT_FOUND;
    for (let d = $from.depth; d > 0; d--) {
      const t = $from.node(d).type;
      if (t === dtType && dtDepth === NOT_FOUND) dtDepth = d;
      if (t === ddType && ddDepth === NOT_FOUND) ddDepth = d;
      if (t === dlType && dlDepth === NOT_FOUND) dlDepth = d;
    }

    // ----- Case A: inside a `dt` -----------------------------------------
    if (dtDepth !== NOT_FOUND && dlDepth !== NOT_FOUND && dtDepth > dlDepth) {
      const dlNode = $from.node(dlDepth);
      // Index of this dt within its dl.
      const dtIndex = $from.index(dlDepth);
      const hasFollowingDd =
        dtIndex + 1 < dlNode.childCount &&
        dlNode.child(dtIndex + 1).type === ddType;

      if (dispatch === undefined) return true;

      const tr = state.tr;
      if (hasFollowingDd) {
        // Commit the term: move cursor to the start of the following dd's
        // first block.
        const ddStart = $from.after(dtDepth); // start of the dd node
        // Cursor lands at the start of the dd's content.
        const target = ddStart + 1;
        tr.setSelection(TextSelection.near(tr.doc.resolve(target), 1));
        tr.scrollIntoView();
        dispatch(tr);
        return true;
      }
      // Defensive: dt without a following dd. Insert a dd (empty paragraph).
      const dd = ddType.create(null, paraType.create());
      tr.insert($from.after(dtDepth), dd);
      tr.setSelection(TextSelection.near(tr.doc.resolve($from.after(dtDepth) + 2)));
      tr.scrollIntoView();
      dispatch(tr);
      return true;
    }

    // ----- Case B: inside a `dd` -----------------------------------------
    if (ddDepth !== NOT_FOUND && dlDepth !== NOT_FOUND && ddDepth > dlDepth) {
      const dlNode = $from.node(dlDepth);
      const ddIndex = $from.index(dlDepth);
      const isLastDd = ddIndex === dlNode.childCount - 1;
      const inner = $from.parent;

      // B1: empty paragraph as the only block of the LAST dd → exit the dl.
      if (
        isLastDd &&
        inner.type === paraType &&
        isEmptyTextblock(inner) &&
        inner === $from.node(ddDepth).firstChild
      ) {
        if (dispatch === undefined) return true;
        const tr = state.tr;
        // The trailing (dt dd) pair starts one child before this dd.
        const pairStart = $from.before(ddDepth) - dlNode.child(ddIndex - 1).nodeSize;
        const pairEnd = $from.after(ddDepth);
        tr.delete(pairStart, pairEnd);
        // If this was the only pair, the dl is now empty → remove it.
        let insertAt = pairStart;
        if (dlNode.childCount === 2) {
          insertAt = $from.before(dlDepth);
          tr.delete($from.before(dlDepth), $from.after(dlDepth));
        }
        const para = paraType.create();
        tr.insert(insertAt, para);
        tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)));
        tr.scrollIntoView();
        dispatch(tr);
        return true;
      }

      // B2: end of the LAST block, dd is the LAST child of the dl, block
      // non-empty → start a new (dt dd) pair.
      const atEndOfInner = $from.pos === $from.end($from.depth);
      const inLastBlockOfDd = $from.end($from.depth) === $from.end(ddDepth);
      if (
        isLastDd &&
        inLastBlockOfDd &&
        atEndOfInner &&
        !isEmptyTextblock(inner)
      ) {
        if (dispatch === undefined) return true;
        const tr = state.tr;
        const newDt = dtType.create();
        const newDd = ddType.create(null, paraType.create());
        // Insert after this dd.
        const insertAt = $from.after(ddDepth);
        tr.insert(insertAt, [newDt, newDd]);
        // Cursor in the new dt.
        tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)));
        tr.scrollIntoView();
        dispatch(tr);
        return true;
      }

      // B3: otherwise (mid-dd, non-last dd, empty paragraph in a non-last dd)
      // → not applicable. The chain falls through to splitBlockKeepMarks,
      // which splits the inner block in place. Returning false here keeps
      // composition explicit (spec §1.9.3).
      return false;
    }

    // Not inside a dl / dt / dd.
    return false;
  };
}
