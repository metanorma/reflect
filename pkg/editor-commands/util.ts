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
import type { Node, NodeType } from 'prosemirror-model';

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
 * textblock is a `section_title` (a heading is not body content — block
 * insertion commands must not replace it), or when the textblock has no
 * enclosing block parent (depth < 2; cannot happen in this schema, but the
 * guard keeps the helper total).
 */
export function bodyBlockContext(
  state: EditorState,
): { readonly parent: Node; readonly index: number; readonly depth: number } | null {
  const { $from } = state.selection;
  if (!$from.parent.isTextblock) return null;
  if ($from.parent.type.name === 'section_title') return null;
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
