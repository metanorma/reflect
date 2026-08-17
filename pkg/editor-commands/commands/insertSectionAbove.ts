/**
 * `insertSectionAbove` — Enter behaviour at the START of a non-empty
 * `section_title` (spec §2.4.8, §2.7 chain position 4).
 *
 * Word-processor parity: in Word / Google Docs / Apple Pages, pressing Enter
 * with the caret before the first character of a heading pushes the heading
 * down and leaves an empty heading above, caret with the existing text. The
 * analogous structural outcome here is a NEW SAME-TYPE SIBLING SECTION
 * immediately BEFORE the current section (empty `section_title` + empty
 * `paragraph`, fresh generated id), with the caret remaining at offset 0 of
 * the current title.
 *
 * This is the only Enter affordance for "create a section BEFORE this one"
 * without gap-cursor fiddling (`insertSection` only ever inserts after the
 * nearest body-section ancestor).
 *
 * Applicability (all must hold; any failure returns `false` so the chain
 * falls through to `exitSectionTitle`):
 *
 * - the selection is a collapsed `TextSelection`;
 * - the caret's parent is a `section_title` (guards every Enter state deeper
 *   in a section body out at the first test);
 * - the caret is at offset 0 of that title;
 * - the title is NON-EMPTY — every section-creation command
 *   (`wrapInClause`, `demoteClause`, `insertSection`, `exitFloatingTitle`)
 *   lands the caret at offset 0 of a fresh EMPTY title, where Enter must
 *   keep meaning "skip the title, go to the body";
 * - the section parent's content expression admits a same-type sibling at
 *   the current section's index — pre-flighted with
 *   `parent.canReplaceWith(sectionIndex, sectionIndex, sectionType)`, never
 *   a hand-coded allow-list (sections.ts §5.4 convention). Stricter
 *   Metanorma flavors (e.g. one that caps a section type at a single
 *   occurrence) therefore degrade gracefully to `exitSectionTitle` with no
 *   command fork.
 *
 * On dispatch, one transaction: insert the sibling BEFORE the current
 * section (`tr.insert($from.before(sectionDepth), …)` — the position just
 * before the current section's opening token, INSIDE its parent; inserting
 * before the title instead would nest the new section inside the current
 * one), keep the caret at offset 0 of the current title via the mapped
 * position, `scrollIntoView`.
 *
 * Section references (e.g. §2.4.8) in this file refer to
 * `docs/EditorCommands.spec.md`.
 */

import { TextSelection } from 'prosemirror-state';
import type { Command } from 'prosemirror-state';

import { NODE_NAME, nodeType } from '../schema.js';
import { generateId } from '../util.js';


/**
 * Insert a same-type sibling section above the section whose title the caret
 * starts, keeping the caret at offset 0 of the current title.
 *
 * Not a factory: the command resolves node types through `state.schema`, so
 * it works against any schema that names its section-title node as in
 * {@link NODE_NAME}.
 */
export const insertSectionAbove: Command = (state, dispatch) => {
  const { selection } = state;
  const { $from } = selection;

  // Collapsed text selection only — a range starting at offset 0 must not
  // mint a section while a selection sits there (spec §2.4.8).
  if (!(selection instanceof TextSelection) || !selection.empty) return false;

  // Only applies when the cursor's immediate parent is a section_title.
  if ($from.parent.type.name !== NODE_NAME.section_title) return false;

  // Offset 0 of a NON-EMPTY title only.
  if ($from.parentOffset !== 0) return false;
  if ($from.parent.content.size === 0) return false;

  // The section that owns the title sits one level up.
  const sectionDepth = $from.depth - 1;
  const sectionParent = $from.node(sectionDepth - 1);
  const sectionIndex = $from.index(sectionDepth - 1);
  const sectionType = $from.node(sectionDepth).type;

  // Schema-derived legality: may the parent hold another child of the same
  // section type at the current section's index? Refusal degrades to
  // `exitSectionTitle` via the chain fall-through.
  if (!sectionParent.canReplaceWith(
    sectionIndex,
    sectionIndex,
    sectionType,
  )) {
    return false;
  }

  if (dispatch === undefined) return true;

  // Build the sibling: empty section_title + empty paragraph, fresh id.
  const sectionTitleType = nodeType(state.schema, NODE_NAME.section_title);
  const paraType = nodeType(state.schema, NODE_NAME.paragraph);
  if (sectionTitleType === null || paraType === null) return false;
  const sibling = sectionType.createAndFill(
    { id: generateId() },
    [sectionTitleType.create(), paraType.create()],
  );
  if (sibling === null) return false;

  const tr = state.tr;

  // Position arithmetic (load-bearing): `$from.before(sectionDepth)` is the
  // position immediately BEFORE the current section's opening token, inside
  // the parent. Inserting there puts the sibling BEFORE the current section
  // without touching it. All positions inside the current section shift by
  // `sibling.nodeSize`; map the caret's position through the insertion to
  // keep it at offset 0 of the current title.
  const insertPos = $from.before(sectionDepth);
  tr.insert(insertPos, sibling);

  const mappedTitleStart = tr.mapping.map($from.before($from.depth));
  tr.setSelection(TextSelection.create(
    tr.doc,
    mappedTitleStart + 1,
  ));

  tr.scrollIntoView();
  dispatch(tr);
  return true;
};
