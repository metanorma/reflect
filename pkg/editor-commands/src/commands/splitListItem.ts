/**
 * `splitListItem` — Enter behaviour inside a list (spec §2.4.3).
 *
 * Adapted from `prosemirror-schema-list`'s stock `splitListItem`, generalised
 * for the Metanorma `list_item` content model `block+` (not a bare
 * `paragraph`). Exposed as a `(schema) => Command` factory per spec §1.6.2,
 * because list logic is likely to be reused on a composed schema.
 *
 * Behaviour (spec §2.4.3 table):
 *
 * - middle/end of a non-empty block in a list_item → split the inner block;
 *   the tail becomes the first block of a **new list_item** after the current
 *   one (list continues).
 * - start of a non-empty paragraph in a list_item → split the paragraph in
 *   place; list structure unaffected (per the plain-paragraph rule).
 * - empty paragraph in a **top-level** list_item → **exit the list**: replace
 *   the empty paragraph + its item with an empty paragraph *after* the list;
 *   if the list would become empty, remove the list entirely.
 * - empty paragraph in a **nested** list_item → **exit one level**: lift the
 *   empty paragraph into the parent list_item as a trailing block; remove the
 *   nested list if it becomes empty.
 *
 * Because list items are generalised, the split operates on whichever block
 * type the cursor is in (a paragraph, a nested list's paragraph, …), not on
 * an assumed `paragraph` parent.
 */

import type { Schema } from "prosemirror-model";
import type { Command } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";

import { NODE_NAME, nodeType, isEmptyTextblock } from "../schema.js";

/** Sentinel depth meaning "not inside a list_item". */
const NOT_IN_ITEM = -1;

/**
 * Find the depth of the nearest `list_item` ancestor of `$from`, or
 * {@link NOT_IN_ITEM} if none.
 */
function findItemDepth(
  $from: { depth: number; node(d: number): { type: { name: string } } },
  itemType: { name: string },
): number {
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === itemType.name) return d;
  }
  return NOT_IN_ITEM;
}

/**
 * Build a `splitListItem` command bound to a specific schema.
 *
 * @param schema the schema to resolve list / list_item / paragraph types from.
 * @returns a {@link Command} that continues or exits a list on Enter.
 */
export function splitListItem(schema: Schema): Command {
  const itemTypeName = nodeType(schema, NODE_NAME.list_item);
  const paraType = nodeType(schema, NODE_NAME.paragraph);
  if (itemTypeName === null || paraType === null) {
    return () => false;
  }

  return (state, dispatch) => {
    const { $from, $to } = state.selection;
    const itemDepth = findItemDepth($from as never, itemTypeName as never);
    if (itemDepth === NOT_IN_ITEM) return false;

    const listDepth = itemDepth - 1;
    if (listDepth < 1) return false;
    const listNode = $from.node(listDepth);

    // Is this list nested inside another list_item?
    const parentListItemDepth = listDepth - 1;
    const isNested =
      parentListItemDepth >= 1 &&
      $from.node(parentListItemDepth).type.name === itemTypeName.name;

    // ----- Exit path: empty paragraph at end of item ----------------------
    const inner = $from.parent;
    const inLastBlockOfItem = $from.depth >= 1 &&
      $from.end($from.depth) === $from.end(itemDepth);
    if (
      inner.type === paraType &&
      isEmptyTextblock(inner) &&
      inLastBlockOfItem &&
      $from.pos === $to.pos
    ) {
      if (dispatch === undefined) return true;
      const tr = state.tr;
      const para = paraType.create();

      if (isNested) {
        // Exit one level: remove the inner list if it has only this item,
        // otherwise remove just this item; then drop an empty paragraph into
        // the parent list_item as a trailing block.
        if (listNode.childCount === 1) {
          tr.delete($from.before(listDepth), $from.after(listDepth));
          const insertAt = $from.after(listDepth);
          tr.insert(insertAt, para);
          tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)));
        } else {
          tr.delete($from.before(itemDepth), $from.after(itemDepth));
          const insertAt = $from.after(listDepth);
          tr.insert(insertAt, para);
          tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)));
        }
      } else {
        // Top-level: replace item+para with a paragraph *after* the list; if
        // this was the only item, remove the whole list.
        if (listNode.childCount === 1) {
          const listStart = $from.before(listDepth);
          tr.delete(listStart, $from.after(listDepth));
          tr.insert(listStart, para);
          tr.setSelection(TextSelection.near(tr.doc.resolve(listStart + 1)));
        } else {
          tr.delete($from.before(itemDepth), $from.after(itemDepth));
          const insertAt = $from.after(listDepth);
          tr.insert(insertAt, para);
          tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)));
        }
      }
      tr.scrollIntoView();
      dispatch(tr);
      return true;
    }

    // ----- Continue path: split into a new list_item -----------------------
    if (dispatch === undefined) return true;
    const tr = state.tr;
    tr.deleteSelection();

    // Re-resolve item depth (positions may have shifted after deletion).
    const head = tr.selection.$from;
    let newItemDepth = NOT_IN_ITEM;
    for (let d = head.depth; d > 0; d--) {
      if (head.node(d).type.name === itemTypeName.name) {
        newItemDepth = d;
        break;
      }
    }
    if (newItemDepth === NOT_IN_ITEM) return false;

    // `tr.split(pos, depth)` with depth = (itemDepth - textblockDepth + 1)
    // splits from the textblock up through the list_item, producing a new
    // sibling item whose first block is the tail of the split. This is the
    // generalised form of upstream `splitListItem` for `block+` content: we
    // don't assume the inner block is a paragraph.
    const textblockDepth = head.depth;
    const splitDepth = newItemDepth - textblockDepth + 1;
    tr.split(head.pos, splitDepth);
    tr.scrollIntoView();
    dispatch(tr);
    return true;
  };
}
