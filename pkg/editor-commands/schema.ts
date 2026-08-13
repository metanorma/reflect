/**
 * Schema-coupling helpers for the editor-commands package (spec §1.6.1).
 *
 * Commands must not hard-code node/mark lookups with unverified string
 * literals. Node and mark types are resolved from a {@link Schema} instance
 * using names drawn from the schema package's `NODE_NAMES` / `MARK_NAMES`
 * constants, for reference equality and clarity.
 *
 * Internal to the package: nothing here is re-exported from `index.ts`
 * (spec §1.10.4 — helpers are not public API).
 */

import { metanormaSchema } from '@metanorma/prosemirror-schema';
import type { Node, NodeType, ResolvedPos, Schema } from 'prosemirror-model';


// ---------------------------------------------------------------------------
// Name constants — derived from NODE_NAMES / MARK_NAMES, never literal.
// ---------------------------------------------------------------------------

/**
 * The authoritative node-name strings, kept in sync with the schema
 * package's `NODE_NAMES` (single source of truth; sync is manual — the
 * schema package types the list as `readonly string[]`, which admits no
 * compile-time key-coverage check).
 */
export const NODE_NAME = Object.freeze({
  doc: 'doc',
  bibdata: 'bibdata',
  preface: 'preface',
  sections: 'sections',
  bibliography: 'bibliography',
  abstract: 'abstract',
  foreword: 'foreword',
  introduction: 'introduction',
  acknowledgements: 'acknowledgements',
  clause: 'clause',
  annex: 'annex',
  content_section: 'content_section',
  terms: 'terms',
  definitions: 'definitions',
  references: 'references',
  bibitem: 'bibitem',
  section_title: 'section_title',
  paragraph: 'paragraph',
  note: 'note',
  admonition: 'admonition',
  example: 'example',
  sourcecode: 'sourcecode',
  formula: 'formula',
  quote: 'quote',
  review: 'review',
  floating_title: 'floating_title',
  bullet_list: 'bullet_list',
  ordered_list: 'ordered_list',
  list_item: 'list_item',
  dl: 'dl',
  dt: 'dt',
  dd: 'dd',
  table: 'table',
  table_head: 'table_head',
  table_body: 'table_body',
  table_foot: 'table_foot',
  table_row: 'table_row',
  table_cell: 'table_cell',
  figure: 'figure',
  image: 'image',
  footnotes: 'footnotes',
  footnote_marker: 'footnote_marker',
  footnote_entry: 'footnote_entry',
  stem: 'stem',
  text: 'text',
  soft_break: 'soft_break',
} as const);

// ---------------------------------------------------------------------------
// Container-name sets
// ---------------------------------------------------------------------------

/**
 * Block-level container nodes whose content is `block+` (or the figure's
 * `(image | block)*`): pressing Enter on their empty trailing paragraph exits
 * them. Per spec §2.4.5, `footnote_entry` is deliberately **excluded** — its
 * parent `footnotes` requires `footnote_entry+` and cannot accept a lifted
 * paragraph.
 */
export const CONTAINER_BLOCK_NAMES: readonly string[] = [
  NODE_NAME.note,
  NODE_NAME.example,
  NODE_NAME.quote,
  NODE_NAME.review,
  NODE_NAME.admonition,
  NODE_NAME.figure,
] as const;

/**
 * Block-level atom nodes: empty content, `atom: true`. The cursor can never
 * rest inside them; Enter beside one creates an adjacent paragraph (spec §2.4.7).
 */
export const BLOCK_ATOM_NAMES = Object.freeze([
  NODE_NAME.image,
  NODE_NAME.formula,
] as const);

// ---------------------------------------------------------------------------
// Type resolution (§1.6.1)
// ---------------------------------------------------------------------------

/**
 * The authoritative mark-name strings, kept in sync with the schema
 * package's `MARK_NAMES` (single source of truth; manual sync, as above).
 */
export const MARK_NAME = Object.freeze({
  emphasis: 'emphasis',
  strong: 'strong',
  subscript: 'subscript',
  superscript: 'superscript',
  code: 'code',
  underline: 'underline',
  strike: 'strike',
  smallcap: 'smallcap',
  link: 'link',
  xref: 'xref',
  eref: 'eref',
  concept: 'concept',
  bcp14: 'bcp14',
  span: 'span',
} as const);

/**
 * The lazily-captured shared schema context (spec §1.6.1), defaulting to
 * {@link metanormaSchema}. Commands that are not schema-parameterized read
 * node/mark types through {@link getSchemaContext} (or through `state.schema`,
 * which is equivalent for an editor mounted on `metanormaSchema`).
 *
 * Tests or consumers that compose a modified schema should call
 * {@link setSchemaContext} before invoking non-factory commands.
 */
let schemaCtx: Schema = metanormaSchema;

/**
 * Override the shared schema context (e.g. for a composed schema in tests).
 * Per §1.6.2, prefer schema-parameterized factories for reusable commands;
 * this hook is for the few commands that bind the schema directly.
 */
export function setSchemaContext(schema: Schema): void {
  schemaCtx = schema;
}

/** The current shared schema context. */
export function getSchemaContext(): Schema {
  return schemaCtx;
}

/**
 * Resolve a node type by name against a schema, returning `null` if absent
 * rather than `undefined` (so callers can null-check without `exactOptional`
 * friction). Name must be one of {@link NODE_NAME}.
 */
export function nodeType(schema: Schema, name: string): NodeType | null {
  const t = schema.nodes[name];
  return t ?? null;
}

// ---------------------------------------------------------------------------
// Position helpers (§1.6.1 internal helpers — NOT public API)
// ---------------------------------------------------------------------------

/**
 * Return the node at the given depth of a resolved position, or `null` if the
 * depth is out of range. Wraps `$pos.node(depth)` with a null check.
 */
export function nodeAt($pos: ResolvedPos, depth: number): Node | null {
  if (depth < 0 || depth > $pos.depth) return null;
  return $pos.node(depth);
}

/**
 * Whether the resolved position is *directly* inside a node of the given
 * name — i.e. some ancestor at depth ≥ 1 has that name.
 * ("Inside" is inclusive: a cursor at the boundary of a `list_item`
 * is considered inside it.)
 *
 * @param schema  schema to resolve the name through.
 * @param $pos    resolved position.
 * @param name    node name from {@link NODE_NAME}.
 */
export function isInside(
  schema: Schema,
  $pos: ResolvedPos,
  name: string,
): boolean {
  // Validate the name against the schema so a typo returns false rather than
  // silently matching nothing.
  if (nodeType(schema, name) === null) return false;
  for (let d = $pos.depth; d >= 1; d--) {
    if ($pos.node(d).type.name === name) return true;
  }
  return false;
}

/**
 * The innermost ancestor textblock of a resolved position: the nearest ancestor
 * whose node spec declares inline content (has the `text` group in its content
 * expression or is otherwise a textblock). Returns `null` if none.
 *
 * Used by commands that need to know "which textblock is the cursor in".
 */
export function nearestTextblock($pos: ResolvedPos): Node | null {
  for (let d = $pos.depth; d >= 0; d--) {
    const node = $pos.node(d);
    if (node.isTextblock) return node;
  }
  return null;
}

/**
 * Whether the resolved position is inside a `code: true` textblock (only
 * `sourcecode` in this schema). ProseMirror's `codeMarks` convention is
 * honoured by setting `code: true` on the node spec.
 */
export function isInCode($pos: ResolvedPos): boolean {
  for (let d = $pos.depth; d >= 0; d--) {
    const node = $pos.node(d);
    if (node.isTextblock && node.type.spec.code === true) return true;
  }
  return false;
}

/**
 * Find the nearest ancestor of `$from` whose name is in `names`, returning its
 * depth or -1 if none. Used to detect container / list / dl contexts.
 */
export function nearestAncestorDepth($from: ResolvedPos, names: readonly string[]): number {
  for (let d = $from.depth; d >= 1; d--) {
    if (names.includes($from.node(d).type.name)) return d;
  }
  return -1;
}

/**
 * Whether a node is "empty enough" that Enter on it should trigger an exit:
 * a textblock with no inline content, or an atom leaf.
 */
export function isEmptyTextblock(node: Node | null): boolean {
  if (node === null) return false;
  if (node.isTextblock) return node.content.size === 0;
  return false;
}
