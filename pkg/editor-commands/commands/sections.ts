/**
 * Section / clause nesting structural commands (sections.md §5).
 *
 * Four pure commands — `wrapInClause`, `promoteClause`, `demoteClause`,
 * `insertSection` — plus their legality/ancestor helpers. All resolve node
 * types through `state.schema` per README §6.4; no `(schema) => Command`
 * factory is required.
 *
 * Conforms to the Command contract (README §6.2; `EditorCommands.spec.md`
 * §1.5): pure predicate when queried, single transaction when dispatched. No
 * `EditorView`/DOM.
 */

import { TextSelection } from 'prosemirror-state';
import type { EditorState, Transaction } from 'prosemirror-state';
import { Fragment } from 'prosemirror-model';
import { NodeRange } from 'prosemirror-model';
import type { Node, NodeType, ResolvedPos } from 'prosemirror-model';
import { liftTarget } from 'prosemirror-transform';

import { generateId } from '../util.js';
import {
  COHORT_CONTAINER, DOC_CHILD_ORDER, SECTION_COHORT,
} from '@metanorma/prosemirror-schema';
import type { SectionCohort } from '@metanorma/prosemirror-schema';


// ---------------------------------------------------------------------------
// Ancestor-walking helpers (sections.md §5.5)
// ---------------------------------------------------------------------------

/**
 * True when `node` belongs to any section cohort group
 * (`section_front`, `section_body`, or `section_back`).
 */
function isSectionNode(node: Node): boolean {
  const t = node.type;
  return t.isInGroup('section_front')
    || t.isInGroup('section_body')
    || t.isInGroup('section_back');
}

/**
 * Resolve the nearest ancestor of `$pos` that is a section node (any cohort).
 * Returns the node and its depth, or `null` at the doc root.
 */
export function nearestSectionAncestor(
  $pos: ResolvedPos,
): { readonly node: Node; readonly depth: number } | null {
  for (let d = $pos.depth; d >= 1; d--) {
    const node = $pos.node(d);
    if (isSectionNode(node)) {
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
 * Resolve the nearest ancestor of `$pos` that belongs to the `section_body`
 * cohort group. Used by `insertSection` to find a body-section sibling anchor.
 */
export function nearestBodySectionAncestor(
  $pos: ResolvedPos,
): { readonly node: Node; readonly depth: number } | null {
  for (let d = $pos.depth; d >= 1; d--) {
    const node = $pos.node(d);
    if (node.type.isInGroup('section_body')) {
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
  // If both are null (both at doc-level outside sections)
  // it's not cross-section.
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
  const clauseType = state.schema.nodes['clause'];
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
  const hasSections = containsNamedChild(docNode, 'sections');
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
// ensureContainer — shared doc-level container creation (§5.0)
// ---------------------------------------------------------------------------

/**
 * Result of {@link ensureContainer}: the container node's position in the
 * (possibly modified) doc, and the position just inside its opening token
 * (where children should be appended).
 */
interface ContainerInfo {
  /** Absolute position of the container node in `tr.doc`. */
  readonly pos: number;
  /** Position just inside the container's opening token (first child). */
  readonly contentStart: number;
  /** Position just before the container's closing token (after last child). */
  readonly contentEnd: number;
}

/**
 * Ensure that the doc has a direct child named `containerName`, creating it at
 * the schema-mandated position if absent (§5.0). Mutates `tr` in place.
 *
 * Position computation uses {@link DOC_CHILD_ORDER}: the new container is
 * inserted immediately after the last existing doc-child that precedes
 * `containerName` in the ordering.
 *
 * @returns The container's position info in the (possibly modified) doc.
 * @throws if `containerName` is not a known node type.
 */
function ensureContainer(
  tr: Transaction,
  containerName: string,
): ContainerInfo {
  const doc = tr.doc;
  const containerType = doc.type.schema.nodes[containerName];
  if (containerType === undefined) {
    throw new Error(`ensureContainer: unknown node type "${containerName}"`);
  }

  // Find an existing container.
  for (let i = 0; i < doc.childCount; i++) {
    if (doc.child(i).type.name === containerName) {
      // Compute the absolute position of the existing container.
      let pos = 0;
      for (let j = 0; j < i; j++) {
        pos += doc.child(j).nodeSize;
      }
      const node = doc.child(i);
      return {
        pos,
        contentStart: pos + 1,
        contentEnd: pos + 1 + node.content.size,
      };
    }
  }

  // Container is missing — compute the insertion position from DOC_CHILD_ORDER.
  // Insert after the last existing doc-child that precedes `containerName` in
  // the ordering.
  const orderIdx = DOC_CHILD_ORDER.indexOf(containerName);
  const effectiveOrder = orderIdx >= 0 ? orderIdx : DOC_CHILD_ORDER.length;

  let insertAfterIdx = -1;
  for (let i = 0; i < doc.childCount; i++) {
    const childName = doc.child(i).type.name;
    const childOrder = DOC_CHILD_ORDER.indexOf(childName);
    if (childOrder >= 0 && childOrder < effectiveOrder) {
      insertAfterIdx = i;
    }
  }

  // Compute the absolute position for the new container.
  let pos = 0;
  for (let i = 0; i <= insertAfterIdx; i++) {
    pos += doc.child(i).nodeSize;
  }

  // Insert the new empty container.
  const containerNode = containerType.create({ id: generateId() });
  tr.insert(pos, containerNode);

  // The container is now at `pos`, its content starts at `pos + 1`.
  // Since the container is newly created and empty,
  // contentStart === contentEnd.
  return {
    pos,
    contentStart: pos + 1,
    contentEnd: pos + 1,
  };
}

/**
 * If the cursor (`$from`) is directly inside the container described by `info`,
 * return the position where a new child should be inserted at the cursor's
 * location (before the child the cursor precedes). Returns `null` if the
 * cursor is not inside this container.
 *
 * This lets `insertSection` insert at the cursor position (e.g. before the
 * first section when a gap cursor is there) rather than always appending to
 * the end of the container.
 */
function cursorPosInContainer(
  $from: ResolvedPos,
  info: ContainerInfo,
): number | null {
  // Only use cursor-relative insertion when the cursor is directly inside the
  // container at depth 1 (e.g. a gap cursor between children). When the cursor
  // is deeper (inside a section's textblock), fall back to append — the body
  // cohort path handles that case via nearestBodySectionAncestor.
  if ($from.depth !== 1) return null;
  const parent = $from.node(1);
  // Verify the parent's position matches the container's position.
  const parentPos = $from.before(1);
  if (parentPos !== info.pos) return null;

  // The cursor is directly inside this container. Compute the insertion
  // position: before the child at the cursor's index.
  const index = $from.index(1);
  let childPos = info.contentStart;
  for (let i = 0; i < index; i++) {
    childPos += parent.child(i).nodeSize;
  }
  return childPos;
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
  const clauseType = schema.nodes['clause'];
  const paragraphType = schema.nodes['paragraph'];
  const sectionTitleType = schema.nodes['section_title'];
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
  // there is no `sections` container, create one via ensureContainer.
  if (range.parent.type.name === 'doc') {
    const info = ensureContainer(tr, 'sections');
    // Re-resolve the range inside the new sections container.
    const offset = tr.doc.nodeSize - state.doc.nodeSize;
    const $newFrom = tr.doc.resolve($from.pos + offset);
    const $newTo = tr.doc.resolve($to.pos + offset);
    range = $newFrom.blockRange($newTo);
    if (range === null) {
      dispatch(tr);
      return true;
    }
    void info;
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
  const clauseType = state.schema.nodes['clause'];
  if (clauseType === undefined) return false;

  const hit = findNearestSectionOfType($from, clauseType);
  if (hit === null) return false;

  // If the parent is a top-level container, the clause is already at the top
  // nesting level → not applicable.
  const parentDepth = hit.depth - 1;
  if (parentDepth < 1) return false;
  const parent = $from.node(parentDepth);
  // A clause can only be promoted within body-section parents.
  if (!parent.type.isInGroup('section_body')) return false;

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
  const clauseType = state.schema.nodes['clause'];
  if (clauseType === undefined) return false;

  const hit = findNearestSectionOfType($from, clauseType);
  if (hit === null) return false;

  const parentDepth = hit.depth - 1;
  if (parentDepth < 1) return false;
  const parent = $from.node(parentDepth);

  // Find the preceding sibling body-section that can legally contain a clause.
  const clauseIndexInParent = $from.index(parentDepth);
  if (clauseIndexInParent === 0) return false;

  let targetSibling: Node | null = null;
  let siblingIndex = -1;
  for (let i = clauseIndexInParent - 1; i >= 0; i--) {
    const sibling = parent.child(i);
    if (
      sibling.type.isInGroup('section_body') &&
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
// insertSection (sections.md §5.4)
// ---------------------------------------------------------------------------

/**
 * Insert a new section node of the given `typeName`, routing it to the correct
 * container based on its cohort (§5.4). Creates the container (`preface`,
 * `sections`, or `bibliography`) if it does not exist.
 *
 * **Body cohort** (clause, annex, content_section, terms, definitions):
 * inserts as a sibling after the nearest enclosing body section, or appends to
 * the `sections` container if no body-section ancestor exists.
 *
 * **Front / back cohort** (abstract, foreword, … / references): finds or
 * creates the `preface` / `bibliography` container and appends the section.
 *
 * The new section gets an empty `section_title` (heading placeholder) and a
 * leading empty `paragraph`. The cursor lands in the `section_title`.
 *
 * @returns `true` if a transaction was / would be dispatched, `false` if
 *          `typeName` is not a recognized section type or the schema lacks it.
 */
export function insertSection(
  state: EditorState,
  typeName: string,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const cohort = SECTION_COHORT[typeName];
  if (cohort === undefined) return false;

  const sectionType = state.schema.nodes[typeName];
  const paragraphType = state.schema.nodes['paragraph'];
  const sectionTitleType = state.schema.nodes['section_title'];
  if (sectionType === undefined || paragraphType === undefined) return false;

  if (dispatch === undefined) return true;

  const { $from } = state.selection;
  const tr = state.tr;

  // Build the new section's children: section_title (heading placeholder) +
  // empty paragraph.
  const children: Node[] = [];
  if (sectionTitleType !== undefined) {
    children.push(sectionTitleType.create());
  }
  children.push(paragraphType.create());
  const sectionNode = sectionType.create(
    { id: generateId() },
    children,
  );

  let insertPos: number;

  if (cohort === 'body') {
    // Body cohort: try to insert as sibling after the nearest body-section.
    const hit = nearestBodySectionAncestor($from);
    if (hit !== null) {
      // Insert after the nearest body section's closing token.
      insertPos = $from.after(hit.depth);
    } else {
      // No body-section ancestor — find or create the `sections` container,
      // then insert at the cursor position if it's inside the container,
      // otherwise append.
      const info = ensureContainer(tr, COHORT_CONTAINER['body']);
      insertPos = cursorPosInContainer($from, info) ?? info.contentEnd;
    }
  } else {
    // Front / back cohort: find or create the container, then insert at
    // the cursor position if it's inside the container, otherwise append.
    const info = ensureContainer(tr, COHORT_CONTAINER[cohort as SectionCohort]);
    insertPos = cursorPosInContainer($from, info) ?? info.contentEnd;
  }

  tr.insert(insertPos, sectionNode);

  // Cursor inside the new section's section_title (if present), otherwise
  // inside the leading paragraph. `insertPos` is the section's opening token
  // position; +1 enters the section, +1 more enters the section_title.
  const cursorOffset = sectionTitleType !== undefined ? 2 : 2;
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + cursorOffset)));
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
  const paragraphType = state.schema.nodes['paragraph'];
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
