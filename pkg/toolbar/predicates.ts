/**
 * Shared state predicates and schema-name guards (§7, §13).
 *
 * Extracted from the former `MetanormaToolbar.tsx` monolith and imported by
 * the group modules. All functions are pure (no `EditorView`, no DOM).
 */

import type { MarkType, NodeType } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";

import { metanormaSchema } from "@metanorma/prosemirror-schema";

// ---------------------------------------------------------------------------
// Schema lookups (noUncheckedIndexedAccess → guard every index)
// ---------------------------------------------------------------------------

/** Resolve a mark type by name, throwing if absent (programmer error). */
export function requireMark(name: string): MarkType {
  const mt = metanormaSchema.marks[name];
  if (mt === undefined) {
    throw new Error(`MetanormaToolbar: schema has no mark "${name}"`);
  }
  return mt;
}

/** Resolve a node type by name, throwing if absent (programmer error). */
export function requireNode(name: string): NodeType {
  const nt = metanormaSchema.nodes[name];
  if (nt === undefined) {
    throw new Error(`MetanormaToolbar: schema has no node "${name}"`);
  }
  return nt;
}

// Group string — matches BLOCK_GROUP ("block") from the schema package,
// duplicated here so this module stays self-contained.
const BLOCK_GROUP = "block";

// ---------------------------------------------------------------------------
// Selection predicates
// ---------------------------------------------------------------------------

/**
 * Mark *types* active on the selection (§5.1 active rule): `storedMarks` for a
 * collapsed cursor, otherwise the marks at the end of the selection range.
 */
export function activeMarkTypes(state: EditorState): readonly MarkType[] {
  const marks =
    state.selection.empty
      ? (state.storedMarks ?? state.selection.$from.marks())
      : state.selection.$to.marks();
  return marks.map((m) => m.type);
}

/**
 * Whether the selection sits in inline content (§5.1 enabled rule). Returns
 * `false` inside atom nodes (`formula`, `image`) and the code-only `sourcecode`
 * node (`content: "text*"`, not rich text). (`floating_title` is a textblock
 * with inline content, so it IS an inline context.)
 */
export function isInlineContext(state: EditorState): boolean {
  const parent = state.selection.$from.parent;
  // sourcecode is a text block but code-only: disable formatting there.
  if (parent.type === requireNode("sourcecode")) {
    return false;
  }
  // `inlineContent` is true when the node's content expression accepts inline
  // nodes (text). Atom/leaf nodes (formula, image) and pure block-content
  // nodes have it false.
  return parent.type.inlineContent;
}

/**
 * Whether the selection's parent is a wrappable block (§5.2 / §5.3 enabled
 * rule): the parent belongs to the schema's `block` group, so `wrapIn` / list
 * wrapping can legally apply to it.
 */
export function isBlockContext(state: EditorState): boolean {
  return state.selection.$from.parent.type.isInGroup(BLOCK_GROUP);
}

/** Whether `mark` is present at the current selection (§5.1). */
export function isMarkActive(state: EditorState, mark: MarkType): boolean {
  return activeMarkTypes(state).includes(mark);
}

/** Whether the nearest list ancestor is `listType` (§5.3 active rule). */
export function isListActive(state: EditorState, listType: NodeType): boolean {
  const depth = state.selection.$from.depth - 2;
  if (depth < 0) return false;
  return state.selection.$from.node(depth).type === listType;
}

/** Whether the immediate parent block is of `type` (§5.2 active rule). */
export function isBlockWrapActive(state: EditorState, type: NodeType): boolean {
  return state.selection.$from.parent.type === type;
}
