/**
 * `exitFloatingTitle` — Enter behaviour inside a `floating_title` textblock
 * (spec §2.4.8, §2.7).
 *
 * `floating_title` is an unnumbered free-standing heading. Semantically it
 * titles the content below it, and in every context that admits a
 * `floating_title` (`sections`, a clause/annex subclause run), the only nodes
 * that may follow it are other subclause-run members (`clause`, another
 * `floating_title`, …) — never a bare paragraph. Splitting it in place with
 * `splitBlockKeepMarks` is schema-valid but unintuitive: it creates a second
 * heading rather than starting the titled content.
 *
 * Instead, Enter inside a floating title exits it:
 *
 * - cursor inside a `floating_title` that has a following sibling → move the
 *   cursor to the start of that sibling (whatever it is).
 * - cursor inside a `floating_title` that is its parent's LAST child → insert
 *   a new `clause` (the section the title names) after it, with an empty
 *   `section_title` + `paragraph`; cursor in the `section_title`.
 * - cursor NOT inside a `floating_title` → **not applicable** (returns
 *   `false`).
 *
 * Section references (e.g. §2.4.1) in this file refer to
 * `docs/EditorCommands.spec.md`.
 */

import type { Command } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';

import { NODE_NAME, nodeType } from '../schema.js';
import { generateId } from '../util.js';


/**
 * Exit a `floating_title` textblock on Enter.
 *
 * Not a factory: the command resolves node types through `state.schema`, so it
 * works against any schema that names its floating-title node as in
 * {@link NODE_NAME}.
 */
export const exitFloatingTitle: Command = (state, dispatch) => {
  const { $from } = state.selection;

  // Only applies when the cursor's immediate parent is a floating_title.
  if ($from.parent.type.name !== NODE_NAME.floating_title) return false;

  if (dispatch === undefined) return true;

  const tr = state.tr;

  // The title's position in its parent. `$from.depth` is the floating_title's
  // depth; `$from.after($from.depth)` is the position just past its closing
  // token — the insertion point for a new clause or the start of the next
  // sibling.
  const titleDepth = $from.depth;
  const titleEnd = $from.after(titleDepth);

  // Check whether the title has a following sibling. The parent container is
  // at `titleDepth - 1`; the title's index within it is
  // `$from.index(titleDepth - 1)`.
  const parentDepth = titleDepth - 1;
  const parentNode = $from.node(parentDepth);
  const titleIndex = $from.index(parentDepth);
  const isLastChild = titleIndex >= parentNode.childCount - 1;

  if (isLastChild) {
    // Nothing follows the title → insert the clause it names: an empty
    // section_title (the heading the user fills next) plus a paragraph.
    const clauseType = nodeType(state.schema, NODE_NAME.clause);
    const sectionTitleType = nodeType(state.schema, NODE_NAME.section_title);
    const paraType = nodeType(state.schema, NODE_NAME.paragraph);
    if (clauseType === null || sectionTitleType === null || paraType === null) {
      return false;
    }
    const clause = clauseType.createAndFill(
      { id: generateId() },
      [sectionTitleType.create(), paraType.create()],
    );
    if (clause === null) return false;
    tr.insert(titleEnd, clause);
    // titleEnd is the clause's opening token; +1 enters the clause, +1 more
    // lands inside its section_title.
    tr.setSelection(TextSelection.near(tr.doc.resolve(titleEnd + 2)));
  } else {
    // Move the cursor to the start of the next sibling, whatever it is.
    tr.setSelection(TextSelection.near(tr.doc.resolve(titleEnd), 1));
  }

  tr.scrollIntoView();
  dispatch(tr);
  return true;
};
