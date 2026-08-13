/**
 * `exitSectionTitle` — Enter behaviour inside a `section_title` textblock
 * (spec §2.4.6).
 *
 * The `section_title` node is an optional first child of a section. Its content
 * model is `inline*`; splitting it with `splitBlockKeepMarks` would create a
 * second `section_title` sibling, violating the `section_title?` quantifier.
 * Instead, Enter inside a title moves the cursor to the section's first body
 * block, inserting an empty paragraph immediately after the title if no body
 * block exists yet.
 *
 * Behaviour:
 *
 * - cursor inside a `section_title` that has a following sibling block → move
 *   the cursor to the start of that sibling (the section's first body block).
 * - cursor inside a `section_title` that is the section's LAST child → insert
 *   an empty paragraph after the title; cursor in it.
 * - cursor NOT inside a `section_title` → **not applicable** (returns `false`).
 */

import type { Command } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';

import { NODE_NAME, nodeType } from '../schema.js';


/**
 * Exit a `section_title` textblock on Enter.
 *
 * Not a factory: the command resolves node types through `state.schema`, so it
 * works against any schema that names its section-title node as in
 * {@link NODE_NAME}.
 */
export const exitSectionTitle: Command = (state, dispatch) => {
  const { $from } = state.selection;

  // Only applies when the cursor's immediate parent is a section_title.
  if ($from.parent.type.name !== NODE_NAME.section_title) return false;

  if (dispatch === undefined) return true;

  const tr = state.tr;

  // The title's position in its parent (the section). `$from.depth` is the
  // section_title's depth; `$from.after($from.depth)` is the position just past
  // the title's closing token — the insertion point for a new paragraph or the
  // start of the next sibling.
  const titleDepth = $from.depth;
  const titleEnd = $from.after(titleDepth);

  // Check whether the title has a following sibling (the section's first body
  // block). The clause (title's parent) is at `titleDepth - 1`. The title's
  // index within the clause is `$from.index(titleDepth - 1)`.
  const clauseDepth = titleDepth - 1;
  const clauseNode = $from.node(clauseDepth);
  const titleIndex = $from.index(clauseDepth);
  const isLastChild = titleIndex >= clauseNode.childCount - 1;

  if (isLastChild) {
    // No body block after the title → insert an empty paragraph.
    const paraType = nodeType(state.schema, NODE_NAME.paragraph);
    if (paraType === null) return false;
    tr.insert(titleEnd, paraType.create());
    tr.setSelection(TextSelection.near(tr.doc.resolve(titleEnd + 1)));
  } else {
    // Move cursor to the start of the next sibling (the first body block).
    tr.setSelection(TextSelection.near(tr.doc.resolve(titleEnd), 1));
  }

  tr.scrollIntoView();
  dispatch(tr);
  return true;
};
