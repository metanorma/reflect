/**
 * Shared command utilities (spec §1.9.2).
 *
 * Re-exports the `chainCommands` combinator from `prosemirror-commands` so
 * consumers can compose command sequences (spec §1.9.2): "try A, else B, else
 * C". The Enter keymap (§2.8) uses it to assemble the dispatch chain from the
 * individual Enter commands.
 *
 * `generateId()` is the shared id-generation helper used by all node-insertion
 * commands (tables, figures, sections, footnotes) so they are immediately
 * referenceable by `xref`/`eref`.
 *
 * The block-context helpers (`bodyBlockContext`,
 * `canReplaceCurrentBlockWith`, `canInsertBlockAdjacent`) are the shared
 * legality machinery behind the block-insertion predicates
 * (`canInsertBlock`, `canInsertTable`, `canInsertFigure`). They are internal
 * to this package — re-exported nowhere.
 *
 * Section references (e.g. §1.9.2) below refer to
 * `docs/EditorCommands.spec.md`.
 */

import type { EditorState } from 'prosemirror-state';
import type { Node, NodeType, ResolvedPos } from 'prosemirror-model';

export { chainCommands } from 'prosemirror-commands';

/**
 * Generate a fresh, unique id string via `crypto.randomUUID()`.
 *
 * Used by all node-insertion commands (tables, figures, sections, footnotes)
 * so the created node is immediately referenceable by `xref`/`eref`. Ids are
 * immutable once generated — they are not renumbered on serialize.
 *
 * Falls back to a timestamp+random string when `crypto.randomUUID` is not
 * available (older runtimes / non-secure contexts).
 */
export function generateId(): string {
  const c: typeof globalThis.crypto | undefined =
    typeof globalThis !== 'undefined' && typeof globalThis.crypto === 'object'
      ? globalThis.crypto
      : undefined;
  if (c !== undefined && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  return [
    'id',
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 10),
  ].join('-');
}

// ---------------------------------------------------------------------------
// Block-context helpers (internal)
// ---------------------------------------------------------------------------

/**
 * The body-block context at the cursor: the parent that directly holds the
 * cursor's textblock, plus the textblock's child index in it.
 *
 * Returns `null` when the cursor is not inside a textblock, when the
 * textblock is a `section_title` heading or a `figure_name`/`table_name`
 * caption (headings and captions are not body content — block insertion
 * commands must not replace or neighbour them), or when the textblock has no
 * enclosing block parent (depth < 2; cannot happen in this schema, but the
 * guard keeps the helper total).
 */
export function bodyBlockContext(
  state: EditorState,
): { readonly parent: Node; readonly index: number; readonly depth: number } | null {
  const { $from } = state.selection;
  if (!$from.parent.isTextblock) return null;
  const name = $from.parent.type.name;
  if (
    name === 'section_title' ||
    name === 'figure_name' ||
    name === 'table_name'
  ) return null;
  if ($from.depth < 2) return null;
  const parentDepth = $from.depth - 1;
  return {
    parent: $from.node(parentDepth),
    index: $from.index(parentDepth),
    depth: parentDepth,
  };
}

/**
 * Whether the cursor's textblock can be **replaced** by a node of `type` in
 * its parent — the legality question for commands that swap the current block
 * for the new node (e.g. `insertDefinitionList`, which
 * `replaceRangeWith`s over the textblock's extent).
 *
 * Replacement-shaped: `canReplaceWith(index, index + 1, type)`, matching the
 * actual transaction. An insertion-shaped check
 * (`contentMatchAt(index).matchType`) would ask a different question and can
 * diverge wherever the content expression is positionally ordered.
 */
export function canReplaceCurrentBlockWith(
  state: EditorState,
  type: NodeType,
): boolean {
  const ctx = bodyBlockContext(state);
  if (ctx === null) return false;
  return ctx.parent.canReplaceWith(ctx.index, ctx.index + 1, type);
}

/**
 * Whether a node of `type` can be inserted **immediately after** the cursor's
 * textblock, keeping the textblock — the legality question for commands that
 * insert beside the current block (tables, figures).
 *
 * Insertion-shaped: `canReplaceWith(index + 1, index + 1, type)`.
 */
export function canInsertBlockAdjacent(
  state: EditorState,
  type: NodeType,
): boolean {
  const ctx = bodyBlockContext(state);
  if (ctx === null) return false;
  return ctx.parent.canReplaceWith(ctx.index + 1, ctx.index + 1, type);
}

/**
 * The textblock the parent's content expression admits at `index` — the
 * generalized answer to "what block may replace the node at `index` here?".
 *
 * Uses the match's `defaultType` (the first type the expression accepts at
 * that slot), kept only when a same-slot replacement by it is actually legal
 * (`canReplaceWith(index, index + 1, type)`) and it is a textblock (so a
 * cursor can live inside it). Returns `null` when no textblock is admissible
 * — a slot like `(dl | table)` admits none.
 *
 * Shared by the dl-removal branches of `emptyTextblockBackspace` and the
 * Enter-exit commands, so a restrictive flavor degrades uniformly instead of
 * hard-coding "paragraph" where it would be schema-invalid.
 */
export function admittedTextblock(
  parent: Node,
  index: number,
): NodeType | null {
  const type = parent.contentMatchAt(index).defaultType;
  if (type === null) return null;
  if (!type.isTextblock) return null;
  if (!parent.canReplaceWith(index, index + 1, type)) return null;
  return type;
}

/**
 * The exit target for "leave this figure" Enter commands: the position
 * immediately after the node at `depth` — or, when that position's parent
 * does not admit a paragraph there, the position after the next enclosing
 * node whose parent does. Shared by `exitName` (Enter in a caption whose
 * body cannot host the caret — the image atom), `exitContainerBlock`
 * (lifting a trailing paragraph out of a figure), and `createParagraphNear`
 * (Enter on a node-selected atom inside a figure).
 *
 * Why the walk is needed: a figure may sit inside another figure's `figure+`
 * body run (`figure_name? (image | paragraph+ | figure+)?`), and a paragraph
 * is admissible in a `figure+` run nowhere — inserting "after the subfigure"
 * unconditionally would be rejected by the step machinery (`TransformError`
 * from `tr.step`'s post-step validation) or "repaired" by the replace fitter
 * into a sibling-figure fission. The walk computes the correct position
 * instead of relying on either failure mode.
 *
 * Insertion-shaped legality at each candidate (`canReplaceWith(i, i, t)`),
 * the same question `canInsertBlockAdjacent` asks. Returns `null` when no
 * ancestor admits a paragraph at all (cannot happen in this schema — every
 * figure's ancestor chain reaches a `block+` container — but the helper
 * stays total for composed schemas).
 */
export function paragraphExitAfter(
  $pos: ResolvedPos,
  depth: number,
  paraType: NodeType,
): number | null {
  for (let d = depth; d >= 1; d--) {
    const parentDepth = d - 1;
    // $pos is strictly inside node(d), so index(parentDepth) is node(d)'s
    // child index in its parent — the slot after it is index + 1.
    const index = $pos.index(parentDepth) + 1;
    if ($pos.node(parentDepth).canReplaceWith(index, index, paraType)) {
      return $pos.after(d);
    }
  }
  return null;
}
