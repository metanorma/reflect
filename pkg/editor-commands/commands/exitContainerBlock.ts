/**
 * `exitContainerBlock` — Enter behaviour at the end of a container block
 * (spec §2.4.5).
 *
 * Custom command. Container blocks (`note`, `example`, `quote`, `review`,
 * `admonition`, `figure`) share content `block+` (figure: `(image | block)*`).
 * They are "wrapper" blocks the user enters and later wants to leave.
 *
 * Behaviour (spec §2.4.5 table):
 *
 * - empty paragraph that is the container's **last** block → **exit the
 *   container**: lift an empty paragraph out to sit *after* the container
 *   (sibling in the container's parent); if the container would become empty,
 *   remove it.
 * - empty paragraph that is NOT the container's last block → **not applicable**
 *   (falls through to splitBlockKeepMarks); exiting mid-container would
 *   reorder siblings unexpectedly.
 *
 * `footnote_entry` is deliberately excluded: although its content is `block+`,
 * its parent `footnotes` requires `footnote_entry+` and cannot accept a lifted
 * paragraph, so there is no valid place to lift to (spec §2.4.5).
 */

import type { Command } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";

import { CONTAINER_BLOCK_NAMES, nodeType, isEmptyTextblock } from "../schema.js";

/**
 * Exit a container block when the cursor is in its empty trailing paragraph.
 *
 * Not a factory: the command resolves node types through `state.schema`, so it
 * works against any schema that names its container nodes as in
 * {@link CONTAINER_BLOCK_NAMES}.
 */
export const exitContainerBlock: Command = (state, dispatch) => {
  const { $from } = state.selection;

  // Find the nearest container-block ancestor.
  let containerDepth = -1;
  for (let d = $from.depth; d > 0; d--) {
    if (CONTAINER_BLOCK_NAMES.includes($from.node(d).type.name as never)) {
      containerDepth = d;
      break;
    }
  }
  if (containerDepth < 0) return false;

  const inner = $from.parent;
  const paraType = nodeType(state.schema, "paragraph");
  if (paraType === null) return false;
  if (inner.type !== paraType) return false;
  if (!isEmptyTextblock(inner)) return false;

  // Only the container's LAST block triggers exit.
  const inLastBlockOfContainer =
    $from.end($from.depth) === $from.end(containerDepth);
  if (!inLastBlockOfContainer) return false;

  if (dispatch === undefined) return true;

  const tr = state.tr;
  const containerNode = $from.node(containerDepth);

  if (containerNode.childCount === 1) {
    // Container would become empty → remove it entirely, paragraph replaces it.
    const start = $from.before(containerDepth);
    const end = $from.after(containerDepth);
    tr.delete(start, end);
    const para = paraType.create();
    tr.insert(start, para);
    tr.setSelection(TextSelection.near(tr.doc.resolve(start + 1)));
  } else {
    // Remove the trailing empty paragraph, then add one after the container.
    const paraStart = $from.before($from.depth);
    const paraEnd = $from.after($from.depth);
    tr.delete(paraStart, paraEnd);
    const insertAt = $from.after(containerDepth);
    const para = paraType.create();
    tr.insert(insertAt, para);
    tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)));
  }
  tr.scrollIntoView();
  dispatch(tr);
  return true;
};
