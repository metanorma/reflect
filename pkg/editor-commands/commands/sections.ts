/**
 * Section / clause nesting structural commands (sections.md §5).
 *
 * Four pure commands — `wrapInClause`, `promoteClause`, `demoteClause`,
 * `setSectionType` — plus their legality/ancestor helpers. All resolve node
 * types through `state.schema` per README §6.4; no `(schema) => Command`
 * factory is required.
 *
 * Conforms to the Command contract (README §6.2; `EditorCommands.spec.md`
 * §1.5): pure predicate when queried, single transaction when dispatched. No
 * `EditorView`/DOM.
 */

import { TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { Fragment } from "prosemirror-model";
import { NodeRange } from "prosemirror-model";
import type { Node, NodeType, ResolvedPos } from "prosemirror-model";
import { liftTarget } from "prosemirror-transform";

import { generateId } from "../util.js";

// ---------------------------------------------------------------------------
// Ancestor-walking helpers (sections.md §5.5)
// ---------------------------------------------------------------------------

/** The ten section node names (group "section"), excluding `floating_title`. */
const SECTION_NAMES: ReadonlySet<string> = new Set([
  "clause", "annex", "content_section", "abstract", "foreword",
  "introduction", "acknowledgements", "terms", "definitions", "references",
]);

/**
 * Resolve the nearest ancestor of `$pos` whose type is in group "section".
 * Returns the node and its depth, or `null` at the doc root.
 */
export function nearestSectionAncestor(
  $pos: ResolvedPos,
): { readonly node: Node; readonly depth: number } | null {
  for (let d = $pos.depth; d >= 1; d--) {
    const node = $pos.node(d);
    if (SECTION_NAMES.has(node.type.name)) {
      return { node, depth: d };
    }
  }
  return null;
}

/**
 * Resolve the nearest ancestor of `$pos` that is exactly `type`. Returns node +
 * depth, or `null`.
 */
export function findNearestSectionOfType(
  $pos: ResolvedPos,
  type: NodeType,
): { readonly node: Node; readonly depth: number } | null {
  for (let d = $pos.depth; d >= 1; d--) {
    const node = $pos.node(d);
    if (node.type === type) {
      return { node, depth: d };
    }
  }
  return null;
}

/**
 * True when `parent` may contain a child of `childType` inserted at the
 * position currently occupied by `childIndex` (sections.md §5.1). Built on
 * `canReplaceWith` — never a hand-coded allow-list.
 */
export function parentAccepts(
  parent: Node,
  childType: NodeType,
  childIndex: number,
): boolean {
  return parent.canReplaceWith(childIndex, childIndex, childType);
}

/**
 * Whether the selection spans a section boundary (cross-section selection
 * guard, §5.1 step 5). If `$from` and `$to` resolve to *different* nearest
 * section ancestors, the range spans a section boundary.
 */
function crossSectionSelection($from: ResolvedPos, $to: ResolvedPos): boolean {
  const fromSec = nearestSectionAncestor($from);
  const toSec = nearestSectionAncestor($to);
  // If both are null (both at doc-level outside sections) it's not cross-section.
  if (fromSec === null && toSec === null) return false;
  if (fromSec === null || toSec === null) return true;
  return fromSec.node !== toSec.node;
}

/**
 * True when the selection sits inside a node whose content expression permits a
 * `clause` child (sections.md §5.1). Walks the ancestor chain and asks each
 * ancestor whether a clause can occupy a child slot at the cursor index.
 */
export function canWrapInClause(state: EditorState): boolean {
  const { $from, $to } = state.selection;
  const clauseType = state.schema.nodes["clause"];
  if (clauseType === undefined) return false;

  // §5.1 step 5 — cross-section selection guard.
  if (!state.selection.empty && crossSectionSelection($from, $to)) {
    return false;
  }

  // Walk ancestors from immediate parent up; ask each whether a clause child
  // is legal at the cursor index.
  for (let d = $from.depth; d >= 1; d--) {
    const ancestor = $from.node(d);
    const index = $from.indexAfter(d);
    if (parentAccepts(ancestor, clauseType, index)) return true;
  }

  // §5.1 step 6 — doc-top-level fallback: if no ancestor admits a clause but
  // the doc does not yet have a `sections` container (or the cursor is directly
  // under doc between containers), the wrap command will auto-create one.
  const docNode = $from.node(0);
  const hasSections = containsNamedChild(docNode, "sections");
  if (!hasSections) return true;

  return false;
}

/** Whether `parent` has a direct child whose type name matches `name`. */
function containsNamedChild(parent: Node, name: string): boolean {
  for (let i = 0; i < parent.childCount; i++) {
    if (parent.child(i).type.name === name) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// wrapInClause (sections.md §5.2)
// ---------------------------------------------------------------------------

/**
 * Wrap the block(s) covered by the selection in a new `clause` node containing
 * an empty `section_title` (for the heading) and a leading empty `paragraph`,
 * then place the selection in the `section_title` (sections.md §5.2).
 *
 * @returns `true` if a transaction was / would be dispatched, `false` if
 *          wrapping is not legal at the current selection.
 */
export function wrapInClause(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  if (!canWrapInClause(state)) return false;
  if (dispatch === undefined) return true;

  const schema = state.schema;
  const clauseType = schema.nodes["clause"];
  const paragraphType = schema.nodes["paragraph"];
  const sectionsType = schema.nodes["sections"];
  const sectionTitleType = schema.nodes["section_title"];
  if (clauseType === undefined || paragraphType === undefined) return false;

  const { $from, $to } = state.selection;
  const tr = state.tr;

  // The new clause: an empty section_title (heading placeholder) + a leading
  // empty paragraph. The selection's block content becomes the clause's
  // remaining children (§5.2 step 3). The section_title is created if the
  // schema has it; otherwise the clause has just the paragraph.
  const clauseAttrs = { id: generateId() };
  const leadingParagraph = paragraphType.create();
  const sectionTitle = sectionTitleType?.create();

  // Determine the block range to wrap. For a collapsed cursor, wrap the single
  // block containing the cursor.
  let range = $from.blockRange($to);
  if (range === null) {
    dispatch(tr);
    return true;
  }

  // §5.2 step 4 — doc-top-level fallback. If the range's parent is the doc and
  // there is no `sections` container, create one at the schema-mandated position.
  if (range.parent.type.name === "doc" && sectionsType !== undefined) {
    // Find or create the `sections` container.
    let sectionsPos = -1;
    for (let i = 0; i < range.parent.childCount; i++) {
      if (range.parent.child(i).type.name === "sections") {
        sectionsPos = i;
        break;
      }
    }
    if (sectionsPos < 0) {
      // Insert a `sections` container. Position: immediately after `preface` if
      // present, otherwise at doc start; before `bibliography`/`footnotes`.
      let insertAt = 0;
      for (let i = 0; i < range.parent.childCount; i++) {
        const childName = range.parent.child(i).type.name;
        if (childName === "preface") insertAt = i + 1;
      }
      // Compute the absolute position: sum of child sizes + 1 (for the doc open
      // token) up to insertAt.
      let pos = 1;
      for (let i = 0; i < insertAt; i++) {
        pos += range.parent.child(i).nodeSize;
      }
      const sectionsNode = sectionsType.create({ id: generateId() });
      tr.insert(pos, sectionsNode);
      // Re-resolve the range inside the new sections container.
      const $newFrom = tr.doc.resolve($from.pos + sectionsNode.nodeSize);
      const $newTo = tr.doc.resolve($to.pos + sectionsNode.nodeSize);
      range = $newFrom.blockRange($newTo);
      if (range === null) {
        dispatch(tr);
        return true;
      }
    }
  }

  // Wrap the range with the clause (a single node wrapping). The clause's
  // children are the wrapped blocks; the section_title and leading empty
  // paragraph are inserted as its first children below.
  tr.wrap(range, [{ type: clauseType, attrs: clauseAttrs }]);

  // The wrap inserts the clause around `range`. After the wrap, position
  // `range.start + 1` is just inside the new clause's opening token, before its
  // first child. Insert the section_title (heading placeholder) and the leading
  // empty paragraph there so they become the clause's first children.
  // `range.start` is `range.$from.before(range.depth + 1)`, a position derived
  // from the pre-wrap resolution; the wrap does not shift it (it inserts
  // *around* the range, leaving `range.start` as the position just before the
  // wrapped content, now inside the new clause).
  if (sectionTitle !== undefined) {
    tr.insert(range.start + 1, sectionTitle);
  }
  tr.insert(range.start + 1 + (sectionTitle?.nodeSize ?? 0), leadingParagraph);

  // Place the cursor inside the section_title if it exists (heading first),
  // otherwise inside the leading paragraph.
  const titleOffset = sectionTitle !== undefined ? 1 : 0;
  const paraOffset = titleOffset + (sectionTitle?.nodeSize ?? 0) + 1;
  const cursorPos = range.start + (sectionTitle !== undefined ? 2 : paraOffset);
  tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos), 1));

  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

// ---------------------------------------------------------------------------
// promoteClause / demoteClause (sections.md §5.3)
// ---------------------------------------------------------------------------

/**
 * Lift the nearest enclosing clause out one nesting level (sections.md §5.3).
 *
 * @returns `true` if a transaction was / would be dispatched, `false` if the
 *          clause is already at the top nesting level or no enclosing clause.
 */
export function promoteClause(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const { $from, $to } = state.selection;
  const clauseType = state.schema.nodes["clause"];
  if (clauseType === undefined) return false;

  const hit = findNearestSectionOfType($from, clauseType);
  if (hit === null) return false;

  // If the parent is a top-level container, the clause is already at the top
  // nesting level → not applicable.
  const parentDepth = hit.depth - 1;
  if (parentDepth < 1) return false;
  const parent = $from.node(parentDepth);
  if (!SECTION_NAMES.has(parent.type.name)) return false;

  // Build a NodeRange that spans the *clause node itself* as a child of its
  // parent. The naive `$from.blockRange($to, (n) => n.type === clauseType)`
  // would return a range whose `.parent` IS the clause (range.depth ===
  // hit.depth), i.e. a range spanning the clause's CHILDREN (the paragraph),
  // not the clause. Lifting that range would lift the inner paragraph out of
  // the clause, destroying the clause node instead of promoting it. We need
  // range.depth === hit.depth - 1 (the clause's parent), so `tr.lift` operates
  // on the clause as a unit.
  const range = new NodeRange($from, $to, parentDepth);
  const target = liftTarget(range);
  if (target === null) return false;

  if (dispatch === undefined) return true;

  const tr = state.tr;
  tr.lift(range, target);
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

/**
 * Nest the nearest enclosing clause as the last child of its preceding sibling
 * section that can legally contain it (sections.md §5.3).
 *
 * @returns `true` if a transaction was / would be dispatched, `false` if no
 *          legal deeper target exists.
 */
export function demoteClause(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const { $from } = state.selection;
  const clauseType = state.schema.nodes["clause"];
  if (clauseType === undefined) return false;

  const hit = findNearestSectionOfType($from, clauseType);
  if (hit === null) return false;

  const parentDepth = hit.depth - 1;
  if (parentDepth < 1) return false;
  const parent = $from.node(parentDepth);

  // Find the preceding sibling section that can legally contain a clause.
  const clauseIndexInParent = $from.index(parentDepth);
  if (clauseIndexInParent === 0) return false;

  let targetSibling: Node | null = null;
  let siblingIndex = -1;
  for (let i = clauseIndexInParent - 1; i >= 0; i--) {
    const sibling = parent.child(i);
    if (
      SECTION_NAMES.has(sibling.type.name) &&
      parentAccepts(sibling, clauseType, sibling.childCount)
    ) {
      targetSibling = sibling;
      siblingIndex = i;
      break;
    }
  }
  if (targetSibling === null || siblingIndex < 0) return false;

  // Validate that the moved clause's content is legal under the sibling.
  if (!targetSibling.type.validContent(
    targetSibling.content.append(Fragment.from(hit.node)),
  )) {
    return false;
  }

  if (dispatch === undefined) return true;

  // Compute positions: delete the clause from its current position, insert it
  // at the end of the sibling's content.
  const clauseStart = $from.before(hit.depth);
  const clauseEnd = $from.after(hit.depth);
  // Sibling's position: parent start + offset of sibling + sibling content size.
  let siblingPos = $from.before(parentDepth) + 1;
  for (let i = 0; i < siblingIndex; i++) {
    siblingPos += parent.child(i).nodeSize;
  }
  const insertAt = siblingPos + targetSibling.content.size;

  const tr = state.tr;
  // Delete first (earlier position), adjusting insert position if it was after.
  tr.delete(clauseStart, clauseEnd);
  tr.insert(insertAt, hit.node);
  // Restore selection inside the moved clause.
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)));
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

// ---------------------------------------------------------------------------
// setSectionType (sections.md §5.4)
// ---------------------------------------------------------------------------

/**
 * Convert the nearest enclosing section node into `targetType`, preserving its
 * `id`, `title`, `data`, and children iff `targetType.validContent(current.content)`
 * (sections.md §5.4).
 *
 * @returns `true` if a transaction was / would be dispatched, `false` if no
 *          enclosing section, it is already `targetType`, or the content is
 *          not legal under `targetType`.
 */
export function setSectionType(
  state: EditorState,
  targetType: NodeType,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const { $from } = state.selection;
  const hit = nearestSectionAncestor($from);
  if (hit === null) return false;
  if (hit.node.type === targetType) return false;

  // §5.4 step 2 — validate content under the target type.
  if (!targetType.validContent(hit.node.content)) return false;

  // §5.4 step 3 — createChecked re-validates (throws if invalid), so guard
  // with validContent first (done above).
  let replacement: Node;
  try {
    replacement = targetType.createChecked(
      { ...hit.node.attrs },
      hit.node.content,
    );
  } catch {
    return false;
  }

  if (dispatch === undefined) return true;

  const tr = state.tr;
  const pos = $from.before(hit.depth);
  tr.replaceRangeWith(pos, pos + hit.node.nodeSize, replacement);
  // Re-select inside the new node.
  tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

// ---------------------------------------------------------------------------
// insertClauseAfter (sections.md §5.5)
// ---------------------------------------------------------------------------

/**
 * Insert a new `clause` as a **sibling** following the nearest enclosing
 * section node (sections.md §5.5). Unlike `wrapInClause` (which creates a
 * child), this inserts at the same depth as the current section — a direct
 * one-step way to add a following clause without wrap-then-promote.
 *
 * @returns `true` if a transaction was / would be dispatched, `false` if no
 *          enclosing section, the section is a top-level child of `doc`, or
 *          the parent cannot legally accept a clause after it.
 */
export function insertClauseAfter(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const { $from } = state.selection;
  const clauseType = state.schema.nodes["clause"];
  const paragraphType = state.schema.nodes["paragraph"];
  const sectionTitleType = state.schema.nodes["section_title"];
  if (clauseType === undefined || paragraphType === undefined) return false;

  const hit = nearestSectionAncestor($from);
  if (hit === null) return false;

  // The section's parent must be at depth >= 1 (not a direct child of doc —
  // doc's content expression does not permit bare clause children).
  const parentDepth = hit.depth - 1;
  if (parentDepth < 1) return false;

  const parent = $from.node(parentDepth);
  const sectionIndex = $from.index(parentDepth);

  // Validate that the parent can legally accept a clause child after the
  // current section.
  if (!parentAccepts(parent, clauseType, sectionIndex + 1)) return false;

  if (dispatch === undefined) return true;

  // Build the new clause's children: section_title (heading placeholder) +
  // empty paragraph.
  const children = [];
  if (sectionTitleType !== undefined) {
    children.push(sectionTitleType.create());
  }
  children.push(paragraphType.create());

  const tr = state.tr;
  const newClause = clauseType.create(
    { id: generateId() },
    children,
  );

  // Insert after the current section's closing token, inside the parent.
  const insertAt = $from.after(hit.depth);
  tr.insert(insertAt, newClause);

  // Cursor inside the new clause's section_title (if present), otherwise the
  // leading paragraph. After insertion, `insertAt` is the clause's opening
  // token position. `+1` enters the clause, `+1` more enters the section_title.
  const cursorOffset = sectionTitleType !== undefined ? 2 : 2;
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + cursorOffset)));
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

// ---------------------------------------------------------------------------
// insertLeadingParagraph (sections.md §5.6)
// ---------------------------------------------------------------------------

/**
 * Insert an empty paragraph at the **start** of the nearest enclosing section,
 * before any subclauses (sections.md §5.6). Addresses the case where a clause
 * contains only nested subclauses and the user wants to add introductory text
 * above them. The clause content model `(clause | block)*` permits this mix.
 *
 * @returns `true` if a transaction was / would be dispatched, `false` if no
 *          enclosing section.
 */
export function insertLeadingParagraph(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const { $from } = state.selection;
  const paragraphType = state.schema.nodes["paragraph"];
  if (paragraphType === undefined) return false;

  const hit = nearestSectionAncestor($from);
  if (hit === null) return false;

  if (dispatch === undefined) return true;

  const tr = state.tr;
  // Just inside the section's opening token, before its first child.
  const pos = $from.before(hit.depth) + 1;
  tr.insert(pos, paragraphType.create());
  tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}
