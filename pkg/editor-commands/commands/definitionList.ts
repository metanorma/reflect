/**
 * Definition-list commands (definition-lists.md §5).
 *
 * Two pure commands — `insertDefinitionList` and `addDefinitionPair` — plus
 * their pure, state-reading helpers. All preserve the `(dt dd)+` invariant.
 * Commands resolve node types through `state.schema` per README §6.4; no
 * `(schema) => Command` factory is required.
 *
 * Conforms to the Command contract (README §6.2; `EditorCommands.spec.md`
 * §1.5): pure predicate when queried, single transaction when dispatched. No
 * `EditorView`/DOM.
 */

import { TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { Node, Schema } from "prosemirror-model";

// ---------------------------------------------------------------------------
// Pure state-reading predicates (shared by buttons and keymap)
// ---------------------------------------------------------------------------

/**
 * True when the resolved position sits inside a `dl` node (walks the ancestor
 * chain).
 */
export function inDefinitionList(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "dl") return true;
  }
  return false;
}

/**
 * True when the selection's parent accepts `block` content and `dl` is legal at
 * the cursor (definition-lists.md §4.1 enabled detection).
 */
export function canInsertBlock(state: EditorState): boolean {
  const { $from } = state.selection;
  const dlType = state.schema.nodes["dl"];
  if (dlType === undefined) return false;
  return $from.parent.contentMatchAt($from.index()).matchType(dlType) !== null;
}

/**
 * Whether the resolved position sits directly inside a `dd` node, and if so at
 * which depth.
 * @returns the depth of the `dd` ancestor, or `-1` if none.
 */
export function ddDepth($pos: { readonly depth: number; node: (d: number) => Node }): number {
  for (let d = $pos.depth; d >= 1; d--) {
    if ($pos.node(d).type.name === "dd") return d;
  }
  return -1;
}

/**
 * Whether the resolved position sits directly inside a `dt` node.
 * @returns the depth of the `dt` ancestor, or `-1` if none.
 */
export function dtDepth($pos: { readonly depth: number; node: (d: number) => Node }): number {
  for (let d = $pos.depth; d >= 1; d--) {
    if ($pos.node(d).type.name === "dt") return d;
  }
  return -1;
}

/**
 * Whether the resolved position sits directly inside a `dl` node, and if so at
 * which depth.
 * @returns the depth of the `dl` ancestor, or `-1` if none.
 */
export function dlDepthOf($pos: { readonly depth: number; node: (d: number) => Node }): number {
  for (let d = $pos.depth; d >= 1; d--) {
    if ($pos.node(d).type.name === "dl") return d;
  }
  return -1;
}

/**
 * Whether the node at `depth` is the last child of its parent.
 */
export function isLastChild($pos: { readonly index: (d: number) => number; readonly node: (d: number) => Node }, depth: number): boolean {
  const parentDepth = depth - 1;
  if (parentDepth < 0) return false;
  return $pos.index(parentDepth) === $pos.node(parentDepth).childCount - 1;
}

/**
 * Whether the `dt` paired with the `dd` at `theDdDepth` is empty (no inline
 * content). The `dt` is the sibling immediately preceding the `dd`.
 */
export function pairTermIsEmpty(
  $pos: { readonly node: (d: number) => Node; readonly index: (d: number) => number },
  theDdDepth: number,
): boolean {
  const parentDepth = theDdDepth - 1;
  if (parentDepth < 1) return false;
  const parent = $pos.node(parentDepth);
  if (parent.type.name !== "dl") return false;
  const ddIndex = $pos.index(parentDepth);
  if (ddIndex === 0) return false;
  const dt = parent.child(ddIndex - 1);
  if (dt.type.name !== "dt") return false;
  return dt.content.size === 0;
}

// ---------------------------------------------------------------------------
// Shared pair builder (definition-lists.md §5.3)
// ---------------------------------------------------------------------------

/**
 * Build a valid (dt, dd) pair node array. When `termContent` is supplied, it
 * becomes the dt's inline content (used by `insertDefinitionList` to carry the
 * current paragraph's text into the term). Omit it for an empty term.
 *
 * Pure; schema-sourced.
 */
export function makePair(
  schema: Schema,
  termContent?: readonly Node[] | null,
): readonly [Node, Node] {
  const dtType = schema.nodes["dt"];
  const ddType = schema.nodes["dd"];
  const paragraphType = schema.nodes["paragraph"];
  // These node types are guaranteed by the schema; the non-null assertions keep
  // the code honest under noUncheckedIndexedAccess.
  const dt = dtType!.create({}, termContent ?? []);
  const dd = ddType!.create({}, paragraphType!.create());
  return [dt, dd] as const;
}

/**
 * Extract the inline nodes (text + inline marks) of the current paragraph,
 * dropping block wrappers so the content is legal as `dt`'s `inline*` content
 * (definition-lists.md §5.1). For an empty paragraph returns `[]`.
 */
function inlineContentFromSelection(state: EditorState): readonly Node[] {
  const { from, to, empty } = state.selection;
  if (empty) return [];
  const slice = state.doc.slice(from, to, true);
  // Flatten the slice into inline nodes, dropping block wrappers.
  const nodes: Node[] = [];
  slice.content.forEach((node) => {
    if (node.isInline) {
      nodes.push(node);
    } else {
      // Descend into block nodes to extract their inline content.
      node.descendants((child) => {
        if (child.isInline) nodes.push(child);
        return true;
      });
    }
  });
  return nodes;
}

// ---------------------------------------------------------------------------
// insertDefinitionList (definition-lists.md §5.1)
// ---------------------------------------------------------------------------

/**
 * Insert a new definition list (one dt + dd pair) at the current selection,
 * replacing any selected block content with the pair. Leaves the cursor in the
 * (empty) term so the user can type the term immediately. Preserves `(dt dd)+`.
 */
export function insertDefinitionList(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  if (!canInsertBlock(state)) return false;

  if (dispatch === undefined) return true;

  const schema = state.schema;
  const dlType = schema.nodes["dl"];
  if (dlType === undefined) return false;

  // Derive the term's inline content from the selection's slice.
  const termContent = inlineContentFromSelection(state);
  const [termNode, descNode] = makePair(schema, termContent);
  const dlNode = dlType.create({}, [termNode, descNode]);

  const tr = state.tr;
  const { $from } = state.selection;

  // Replace the current block with the dl. `replaceRangeWith` at the block
  // boundary correctly handles the empty-paragraph case.
  const start = $from.before($from.depth);
  const end = $from.end($from.depth) + 1; // +1 to include the block boundary
  tr.replaceRangeWith(start, end, dlNode);

  // Place the cursor inside the new dt. Resolve and verify the parent is `dt`.
  const termTextPos = start + 2; // dl + 1 → dt + 1 → text start
  const $termPos = tr.doc.resolve(termTextPos);
  if ($termPos.parent.type.name === "dt") {
    tr.setSelection(TextSelection.near($termPos));
  } else {
    // Fallback: resolve via TextSelection.near.
    tr.setSelection(TextSelection.near(tr.doc.resolve(start + 1)));
  }

  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

// ---------------------------------------------------------------------------
// addDefinitionPair (definition-lists.md §5.2)
// ---------------------------------------------------------------------------

/**
 * Insert a new (dt, dd) pair into the definition list containing the selection.
 * The pair is inserted immediately after the pair whose dd currently contains
 * the selection (or appended at the end of the dl if the cursor is in the
 * final dd). Cursor is moved into the new dt.
 *
 * Returns `false` if the selection is not inside a dl. Preserves `(dt dd)+`.
 */
export function addDefinitionPair(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const { $from } = state.selection;
  const theDlDepth = dlDepthOf($from);
  if (theDlDepth < 1) return false;

  if (dispatch === undefined) return true;

  const schema = state.schema;
  const theDdDepth = ddDepth($from);
  // Compute the insertion position: immediately after the dd containing the
  // selection (or after the last child of the dl if cursor is in a dt).
  let posAfter: number;
  if (theDdDepth > 0) {
    posAfter = $from.end(theDdDepth) + 1;
  } else {
    posAfter = $from.end(theDlDepth) + 1;
  }

  // Build an empty pair.
  const [termNode, descNode] = makePair(schema);

  const tr = state.tr;
  tr.insert(posAfter, [termNode, descNode]);

  // Move the cursor into the new dt.
  const newTermPos = posAfter + 1;
  const $termPos = tr.doc.resolve(newTermPos);
  if ($termPos.parent.type.name === "dt") {
    tr.setSelection(TextSelection.near($termPos));
  } else {
    tr.setSelection(TextSelection.near(tr.doc.resolve(posAfter)));
  }

  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

// ---------------------------------------------------------------------------
// Keymap helpers (used by the definitionListKeymap plugin in @metanorma/toolbar)
// ---------------------------------------------------------------------------

/**
 * Move the cursor from the current `dt` to the start of its sibling `dd`
 * (definition-lists.md §6.1, Enter in a dt). Pure; uses `dispatch` if supplied.
 *
 * @param state    the editor state.
 * @param dispatch optional dispatch callback.
 * @param theDtDepth the depth of the `dt` ancestor (from `dtDepth`).
 * @returns `true` if the move applied, `false` otherwise.
 */
export function jumpToSiblingDescription(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  theDtDepth?: number,
): boolean {
  const { $from } = state.selection;
  const depth = theDtDepth ?? dtDepth($from);
  if (depth < 1) return false;
  // The dd is the next sibling of the dt. Its position is after the dt.
  const ddPos = $from.after(depth);
  const $ddPos = state.doc.resolve(ddPos);
  if ($ddPos.parent.type.name !== "dl") return false;
  // Descend into the dd's first block.
  const dd = state.doc.nodeAt(ddPos);
  if (dd === null || dd.type.name !== "dd") return false;

  if (dispatch === undefined) return true;

  const tr = state.tr;
  // Cursor at the start of the dd's first child block.
  tr.setSelection(TextSelection.near(state.doc.resolve(ddPos + 1), 1));
  dispatch(tr);
  return true;
}

/**
 * Exit a definition list: remove the trailing empty `(dt, dd)` pair and insert
 * a new paragraph after the dl, moving the cursor there (definition-lists.md
 * §6.1 last row). All in a single transaction so Undo restores the pre-exit
 * state.
 *
 * @returns `true` if the exit applied, `false` if the cursor is not in the
 *          last dd of a dl whose term is empty.
 */
export function exitDefinitionList(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const { $from } = state.selection;
  const theDdDepth = ddDepth($from);
  if (theDdDepth < 1) return false;
  const theDlDepth = dlDepthOf($from);
  if (theDlDepth < 1) return false;

  // Only the last dd of the dl, with an empty term, triggers exit.
  if (!isLastChild($from, theDdDepth)) return false;
  if (!pairTermIsEmpty($from, theDdDepth)) return false;

  if (dispatch === undefined) return true;

  const tr = state.tr;
  const paragraphType = state.schema.nodes["paragraph"];
  if (paragraphType === undefined) return false;

  // If the dl has only one pair, replace the entire dl with a paragraph.
  const dlNode = $from.node(theDlDepth);
  const pairCount = dlNode.childCount; // each pair is dt + dd = 2 children
  if (pairCount <= 2) {
    // Remove the entire dl and insert a paragraph in its place.
    const dlStart = $from.before(theDlDepth);
    const dlEnd = $from.after(theDlDepth);
    tr.delete(dlStart, dlEnd);
    const para = paragraphType.create();
    tr.insert(dlStart, para);
    tr.setSelection(TextSelection.near(tr.doc.resolve(dlStart + 1)));
  } else {
    // Remove the trailing (dt, dd) pair, then insert a paragraph after the dl.
    const dtStart = $from.before(theDdDepth) - 1; // -1 to reach the dt boundary
    // The dt is the sibling before the dd.
    const ddStart = $from.before(theDdDepth);
    const ddEnd = $from.after(theDdDepth);
    // Delete from the dt start (dtStart) to ddEnd.
    tr.delete(dtStart >= 0 ? dtStart : ddStart - 2, ddEnd);
    // Insert paragraph after the dl.
    const dlEnd = tr.doc.resolve($from.pos).end(theDlDepth) + 1;
    const para = paragraphType.create();
    tr.insert(dlEnd, para);
    tr.setSelection(TextSelection.near(tr.doc.resolve(dlEnd + 1)));
  }

  tr.scrollIntoView();
  dispatch(tr);
  return true;
}
