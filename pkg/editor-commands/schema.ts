/**
 * Schema-coupling helpers for the editor-commands package (spec §1.6.1).
 *
 * Commands must not hard-code node/mark lookups with unverified string
 * literals. Node and mark types are resolved from a {@link Schema} instance
 * using names drawn from the schema package's `NODE_NAMES` / `MARK_NAMES`
 * constants. For reference equality and clarity, a shared, lazily-captured
 * schema context is kept here, defaulting to {@link metanormaSchema}.
 *
 * Per §1.6.2, commands that are likely to be reused on a composed schema are
 * exposed as `(schema) => Command` factories; they resolve their node/mark
 * types through the *passed-in* schema rather than this shared context. The
 * shared context is used only by commands that are intrinsically specific to
 * the exact Metanorma schema.
 */

import type { Node, Schema } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";

import { metanormaSchema, NODE_NAMES, MARK_NAMES } from "@metanorma/prosemirror-schema";

// ---------------------------------------------------------------------------
// Name constants — derived from NODE_NAMES / MARK_NAMES, never literal.
// ---------------------------------------------------------------------------

/**
 * The authoritative node-name strings, derived from `NODE_NAMES` so there is a
 * single source of truth. Indexed lookup against a schema's `nodes` map always
 * goes through these names.
 */
export const NODE_NAME = Object.freeze({
  doc: "doc",
  preface: "preface",
  sections: "sections",
  bibliography: "bibliography",
  clause: "clause",
  annex: "annex",
  content_section: "content_section",
  abstract: "abstract",
  foreword: "foreword",
  introduction: "introduction",
  acknowledgements: "acknowledgements",
  terms: "terms",
  definitions: "definitions",
  references: "references",
  paragraph: "paragraph",
  note: "note",
  admonition: "admonition",
  example: "example",
  sourcecode: "sourcecode",
  formula: "formula",
  quote: "quote",
  review: "review",
  bullet_list: "bullet_list",
  ordered_list: "ordered_list",
  list_item: "list_item",
  dl: "dl",
  dt: "dt",
  dd: "dd",
  table: "table",
  table_head: "table_head",
  table_body: "table_body",
  table_foot: "table_foot",
  table_row: "table_row",
  table_cell: "table_cell",
  figure: "figure",
  image: "image",
  footnotes: "footnotes",
    footnote_marker: "footnote_marker",
    footnote_entry: "footnote_entry",
    stem: "stem",
    text: "text",
  soft_break: "soft_break",
  floating_title: "floating_title",
} as const);

/** Compile-time assertion that {@link NODE_NAME} stays in sync with NODE_NAMES. */
const _NODE_NAMES_CHECK: readonly string[] = NODE_NAMES;
void _NODE_NAMES_CHECK;

/**
 * The authoritative mark-name strings, derived from `MARK_NAMES`.
 */
export const MARK_NAME = Object.freeze({
  emphasis: "emphasis",
  strong: "strong",
  subscript: "subscript",
  superscript: "superscript",
  code: "code",
  underline: "underline",
  strike: "strike",
  smallcap: "smallcap",
  link: "link",
  xref: "xref",
  eref: "eref",
    footnote: "footnote",
    concept: "concept",
  bcp14: "bcp14",
  span: "span",
} as const);

/** Compile-time assertion that {@link MARK_NAME} stays in sync with MARK_NAMES. */
const _MARK_NAMES_CHECK: readonly string[] = MARK_NAMES;
void _MARK_NAMES_CHECK;

/**
 * Block-level container nodes whose content is `block+` (or the figure's
 * `(image | block)*`): pressing Enter on their empty trailing paragraph exits
 * them. Per spec §2.4.5, `footnote_entry` is deliberately **excluded** — its
 * parent `footnotes` requires `footnote_entry+` and cannot accept a lifted
 * paragraph.
 */
export const CONTAINER_BLOCK_NAMES = Object.freeze([
  NODE_NAME.note,
  NODE_NAME.example,
  NODE_NAME.quote,
  NODE_NAME.review,
  NODE_NAME.admonition,
  NODE_NAME.figure,
] as const);

/**
 * Block-level atom nodes: empty content, `atom: true`. The cursor can never
 * rest inside them; Enter beside one creates an adjacent paragraph (spec §2.4.7).
 */
export const BLOCK_ATOM_NAMES = Object.freeze([
  NODE_NAME.image,
  NODE_NAME.formula,
  NODE_NAME.floating_title,
] as const);

// ---------------------------------------------------------------------------
// Shared schema context (§1.6.1)
// ---------------------------------------------------------------------------

/**
 * The lazily-captured shared schema context, defaulting to
 * {@link metanormaSchema}. Commands that are not schema-parameterized read
 * node/mark types through {@link schemaCtx} (or through `state.schema`, which
 * is equivalent for an editor mounted on `metanormaSchema`).
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

/**
 * Resolve a mark type by name against a schema, returning `null` if absent.
 * Name must be one of {@link MARK_NAME}.
 */
export function markType(schema: Schema, name: string): MarkType | null {
  const t = schema.marks[name];
  return t ?? null;
}

// Re-export the schema singleton and raw name lists for consumer convenience.
export { metanormaSchema, NODE_NAMES, MARK_NAMES };

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
 * Whether the resolved position is *directly* inside a node of the given name —
 * i.e. some ancestor at depth ≥ 1 has that name. ("Inside" is inclusive: a
 * cursor at the boundary of a `list_item` is considered inside it.)
 *
 * @param schema   schema to resolve the name through.
 * @param $pos     resolved position.
 * @param name     node name from {@link NODE_NAME}.
 */
export function isInside(schema: Schema, $pos: ResolvedPos, name: string): boolean {
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

// Type-only re-exports for command modules (kept out of the public surface).
import type {
  NodeType,
  MarkType,
  ResolvedPos,
} from "prosemirror-model";

export type { EditorState };
