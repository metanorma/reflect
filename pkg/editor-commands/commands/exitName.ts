/**
 * `exitName` — Enter behaviour inside a `figure_name` / `table_name` caption
 * textblock (spec §2.4.6; inventory §2.7; matrix §2.10).
 *
 * Captions are optional first children of `figure` / `table` with content
 * `inline*`; splitting with `splitBlockKeepMarks` would create a second
 * caption sibling, violating the `figure_name?` / `table_name?` quantifier.
 * Instead, Enter inside a caption moves the cursor on:
 *
 * - `table_name`: move the cursor to the position just after the caption —
 *   `TextSelection.near(..., 1)` descends forward into the first
 *   `table_head`/`table_body` row's first cell paragraph (the table always
 *   has rows: its content expression requires them).
 * - `figure_name`: move to the start of the first following sibling that can
 *   hold a textblock cursor. When no such sibling exists:
 *   - caption is the figure's **only** child (the empty body slot) → insert
 *     an empty paragraph after the caption, INSIDE the figure — choosing the
 *     `paragraph+` branch of the body slot (§8.6) — cursor in it;
 *   - otherwise (the next child is the `image` atom, or an empty imported
 *     subfigure) → **exit the figure**: an empty paragraph after the figure,
 *     at the nearest paragraph-admitting position (`paragraphExitAfter` —
 *     inside a parent figure's `figure+` run, "just after this figure" does
 *     not admit a paragraph, so the walk lands after the outermost enclosing
 *     figure).
 *
 * - cursor NOT inside a caption → **not applicable** (returns `false`).
 *
 * Same shape as `exitSectionTitle` (§2.4.6); the landing rule differs per
 * parent because a table's first content-bearing descendant is inside its
 * rows, while a figure may legitimately have no textblock-bearing child.
 *
 * Section references (e.g. §2.4.6) in this file refer to
 * `docs/EditorCommands.spec.md`.
 */

import type { Command } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';

import { NODE_NAME, nodeType } from '../schema.js';
import { paragraphExitAfter } from '../util.js';


/**
 * Exit a caption textblock on Enter.
 *
 * Not a factory: the command resolves node types through `state.schema`, so it
 * works against any schema that names its caption nodes as in
 * {@link NODE_NAME}.
 */
export const exitName: Command = (state, dispatch) => {
  const { $from } = state.selection;

  // Only applies when the cursor's immediate parent is a caption textblock.
  const parentName = $from.parent.type.name;
  const isFigureName = parentName === NODE_NAME.figure_name;
  if (parentName !== NODE_NAME.table_name && !isFigureName) return false;
  if (dispatch === undefined) return true;

  const tr = state.tr;
  // The caption's position in its parent. `$from.depth` is the caption's
  // depth; `$from.after($from.depth)` is the position just past the caption's
  // closing token — the anchor for the landing rule.
  const captionDepth = $from.depth;
  const captionEnd = $from.after(captionDepth);

  // The parent (figure / table) is at `captionDepth - 1`; the caption's index
  // within it is `$from.index(captionDepth - 1)`.
  const parentDepth = captionDepth - 1;
  const parentNode = $from.node(parentDepth);
  const captionIndex = $from.index(parentDepth);

  if (parentName === NODE_NAME.table_name) {
    // Tables always have row-bearing children (`(table_head | table_body |
    // table_foot)+`): descend forward from just after the caption into the
    // first cell's paragraph.
    tr.setSelection(TextSelection.near(tr.doc.resolve(captionEnd), 1));
  } else {
    // Figure: find the first following sibling that can hold a textblock
    // cursor. Atoms (`image`, `formula`) and nested captions cannot.
    let landIndex = -1;
    for (let i = captionIndex + 1; i < parentNode.childCount; i++) {
      const child = parentNode.child(i);
      if (child.isTextblock) { landIndex = i; break; }
      // A container block (note, example, …) or a nested figure/table holds
      // textblocks in its subtree; `TextSelection.near` will descend into it.
      if (child.isBlock && child.content.size > 0 && !child.isAtom) { landIndex = i; break; }
    }

    if (landIndex !== -1) {
      // Move the cursor to the start of that sibling (descending into it).
      const siblingStart = captionEnd; // start of child at landIndex
      tr.setSelection(TextSelection.near(tr.doc.resolve(siblingStart), 1));
    } else if (parentNode.childCount === captionIndex + 1) {
      // The caption is the figure's only child — the EMPTY body slot: create
      // the paragraph branch inside (`figure_name? (image | paragraph+ |
      // figure+)?` gains its `paragraph+` run), cursor in it.
      const paraType = nodeType(state.schema, NODE_NAME.paragraph);
      if (paraType === null) return false;
      const parentEnd = $from.after(parentDepth);
      tr.insert(parentEnd - 1, paraType.create());
      // The inserted paragraph occupies [parentEnd-1, parentEnd+1); its
      // content starts at parentEnd.
      tr.setSelection(TextSelection.near(tr.doc.resolve(parentEnd), 1));
    } else {
      // No cursor-bearing sibling follows, but the body is NOT empty (the
      // `image` atom, or an empty imported subfigure): a paragraph INSIDE
      // would violate the body-slot XOR — exit the figure instead, landing
      // at the nearest paragraph-admitting position (after the outermost
      // enclosing figure when this figure is a subfigure).
      const paraType = nodeType(state.schema, NODE_NAME.paragraph);
      if (paraType === null) return false;
      const exitPos = paragraphExitAfter($from, parentDepth, paraType);
      if (exitPos === null) return false;
      tr.insert(exitPos, paraType.create());
      tr.setSelection(TextSelection.near(tr.doc.resolve(exitPos + 1), 1));
    }
  }

  tr.scrollIntoView();
  dispatch(tr);
  return true;
};
