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
 * type the cursor is in (a paragraph, a nested list's paragraph, …), not on an
 * assumed `paragraph` parent.
 */

import type { Schema, ResolvedPos, NodeType } from 'prosemirror-model';
import { canSplit } from 'prosemirror-transform';
import type { Command } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';

import { NODE_NAME, nodeType, isEmptyTextblock } from '../schema.js';


/** Sentinel depth meaning "not inside a list_item". */
const NOT_IN_ITEM = -1;

/**
 * Find the depth of the nearest `list_item` ancestor of `$from`, or
 * {@link NOT_IN_ITEM} if none.
 */
function findItemDepth($from: ResolvedPos, itemType: NodeType): number {
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
    const itemDepth = findItemDepth($from, itemTypeName);
    if (itemDepth === NOT_IN_ITEM) return false;

    const listDepth = itemDepth - 1;
    if (listDepth < 1) return false;
    const listNode = $from.node(listDepth);

    // Is this list nested inside another list_item?
    const parentListItemDepth = listDepth - 1;
    const isNested =
      parentListItemDepth >= 1 &&
      $from.node(parentListItemDepth).type.name === itemTypeName.name;

    // ----- Exit path: empty paragraph at end of item (spec L2/L3) ------------
    // The cursor's textblock is the LAST child of its list_item iff its index
    // within the item is the item's last child index. (An earlier revision used
    // `$from.end($from.depth) === $from.end(itemDepth)`, which silently fails
    // for EMPTY paragraphs: `$from.end` of an empty textblock returns the
    // textblock's open-token position, never matching the item's end.)
    const inner = $from.parent;
    const isLastChildOfItem =
      $from.depth >= 1 &&
      $from.index(itemDepth) === $from.node(itemDepth).childCount - 1;
    if (
      inner.type === paraType &&
      isEmptyTextblock(inner) &&
      isLastChildOfItem &&
      $from.pos === $to.pos
    ) {
      if (dispatch === undefined) return true;
      const tr = state.tr;
      const para = paraType.create();

      // Compute the list's end position ONCE; the post-delete insert position
      // is the same absolute slot (the position just after the list, or after
      // the parent item for the nested exit-one-level case). Positions after
      // the deleted range shift in the new doc, so re-resolve on tr.doc.
      if (isNested) {
        // Exit one level: remove the inner list if it has only this item,
        // otherwise remove just this item; then drop an empty paragraph into
        // the parent list_item as a trailing block.
        if (listNode.childCount === 1) {
          tr.delete($from.before(listDepth), $from.after(listDepth));
        } else {
          tr.delete($from.before(itemDepth), $from.after(itemDepth));
        }
        const insertAt = tr.mapping.map($from.after(listDepth));
        tr.insert(insertAt, para);
        tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)));
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
          const insertAt = tr.mapping.map($from.after(listDepth));
          tr.insert(insertAt, para);
          tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)));
        }
      }
      tr.scrollIntoView();
      dispatch(tr);
      return true;
    }

    // ----- Continue path: split into a new list_item (spec L1) --------------
    // Cursor is in a non-empty textblock, or at the start/middle/end of one
    // that is not the (empty) exit case above. `tr.split(pos, depth, types)`
    // splits through `depth` ancestor levels starting from the textblock. To
    // produce a new sibling list_item, depth must equal the number of levels
    // from the textblock up through (and including) the list_item:
    //   textblockDepth - itemDepth + 1.
    // When the cursor is at the END of the textblock, the second half would be
    // an empty list_item, violating `block+`; upstream solves this by passing
    // a `types` argument that seeds the new item with a default-type block
    // (a paragraph), pre-flighted by `canSplit`. We mirror that here.
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

    const textblockDepth = head.depth;
    const splitDepth = textblockDepth - newItemDepth + 1;

    // When at the end of the textblock, seed the new list_item's first block.
    const atEnd = head.pos === head.end(textblockDepth);
    const itemTypeObj = head.node(newItemDepth).type;
    const nextType = atEnd ? itemTypeObj.contentMatch.defaultType : null;
    const types =
      nextType !== null
        ? [null, { type: nextType }]
        : undefined;

    // Pre-flight: refuse cleanly if the split would produce invalid content.
    if (!canSplit(tr.doc, head.pos, splitDepth, types)) return false;

    tr.split(head.pos, splitDepth, types);
    tr.scrollIntoView();
    dispatch(tr);
    return true;
  };
}
