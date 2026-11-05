/**
 * `exitContainerBlock` — Enter behaviour at the end of a container block
 * (spec §2.4.5).
 *
 * Custom command. Container blocks (`note`, `example`, `quote`, `review`,
 * `admonition`, `figure`) share content `block+` (figure: the typed body
 * slot `(image | paragraph+ | figure+)?`). They are "wrapper" blocks the
 * user enters and later wants to leave.
 *
 * Behaviour (spec §2.4.5 table):
 *
 * - empty paragraph that is the container's **last** block → **exit the
 *   container**: lift an empty paragraph out to the nearest position that
 *   ADMITS a paragraph — "just after the container" when its parent takes
 *   blocks, or after the outermost enclosing figure when the container sits
 *   in a parent figure's `figure+` body run (a paragraph is admissible in a
 *   `figure+` run nowhere; `paragraphExitAfter` walks out). If the container
 *   would become empty, it is removed (replaced by the paragraph when the
 *   parent slot allows; otherwise deleted and the paragraph lands at the
 *   walked position).
 * - empty paragraph that is NOT the container's last block → **not applicable**
 *   (falls through to splitBlockKeepMarks); exiting mid-container would
 *   reorder siblings unexpectedly.
 *
 * `footnote_entry` is deliberately excluded: although its content is `block+`,
 * its parent `footnotes` requires `footnote_entry+` and cannot accept a lifted
 * paragraph, so there is no valid place to lift to (spec §2.4.5).
 *
 * Section references (e.g. §2.4.1) in this file refer to
 * `docs/EditorCommands.spec.md`.
 */

import type { Command } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';

import {
  CONTAINER_BLOCK_NAMES,
  nodeType,
  isEmptyTextblock,
} from '../schema.js';
import { paragraphExitAfter } from '../util.js';


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
    if (CONTAINER_BLOCK_NAMES.includes($from.node(d).type.name)) {
      containerDepth = d;
      break;
    }
  }
  if (containerDepth < 0) return false;

  const inner = $from.parent;
  const paraType = nodeType(state.schema, 'paragraph');
  if (paraType === null) return false;
  if (inner.type !== paraType) return false;
  if (!isEmptyTextblock(inner)) return false;

  // Only the container's LAST block triggers exit. Position form: the
  // caret's textblock must END exactly at the container's content end
  // (`after(textblock) === end(container)`; no trailing siblings). The
  // original form compared the two CONTENT ends (`end === end`), which
  // differ by the textblock's close token for any textblock child — always
  // false, so the command never fired (dead at HEAD; found by the nested-
  // figure captions tests, the first unit coverage this command had).
  const inLastBlockOfContainer =
    $from.after($from.depth) === $from.end(containerDepth);
  if (!inLastBlockOfContainer) return false;

  if (dispatch === undefined) return true;

  const tr = state.tr;
  const containerNode = $from.node(containerDepth);

  if (containerNode.childCount === 1) {
    // Container would become empty → remove it entirely, paragraph replaces
    // it — in place when the parent slot admits a paragraph at the
    // container's index, else (a subfigure inside a `figure+` run) delete
    // and land the paragraph at the walked exit position.
    const start = $from.before(containerDepth);
    const end = $from.after(containerDepth);
    const parentDepth = containerDepth - 1;
    const inPlaceOk = $from.node(parentDepth).canReplaceWith(
      $from.index(parentDepth), $from.index(parentDepth) + 1, paraType,
    );
    const para = paraType.create();
    if (inPlaceOk) {
      tr.delete(start, end);
      tr.insert(start, para);
      tr.setSelection(TextSelection.near(tr.doc.resolve(start + 1)));
    } else {
      const exitPos = paragraphExitAfter($from, containerDepth, paraType);
      if (exitPos === null) return false;
      tr.delete(start, end);
      const mapped = tr.mapping.map(exitPos);
      tr.insert(mapped, para);
      tr.setSelection(TextSelection.near(tr.doc.resolve(mapped + 1)));
    }
  } else {
    // Remove the trailing empty paragraph, then add one at the walked exit
    // position (after the container, or after the outermost enclosing
    // figure when "after the container" does not admit a paragraph).
    const paraStart = $from.before($from.depth);
    const paraEnd = $from.after($from.depth);
    const exitPos = paragraphExitAfter($from, containerDepth, paraType);
    if (exitPos === null) return false;
    tr.delete(paraStart, paraEnd);
    // Position computed on the pre-deletion doc must map through the step.
    const mapped = tr.mapping.map(exitPos);
    const para = paraType.create();
    tr.insert(mapped, para);
    tr.setSelection(TextSelection.near(tr.doc.resolve(mapped + 1)));
  }
  tr.scrollIntoView();
  dispatch(tr);
  return true;
};
