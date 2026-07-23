/**
 * Public API for `@metanorma/prosemirror-schema` (§11).
 *
 * Assembles the single ProseMirror `Schema` whose node/mark vocabulary,
 * content model, attributes, and DOM serialization rules mirror the
 * Metanorma Mirror document model.
 *
 * Section references (e.g. §11, §3.1) throughout this package refer to
 * `docs/schema.spec.md`, unless otherwise specified.
 */

import { Schema } from "prosemirror-model";

import { metanormaNodes } from "./nodes.js";
import { metanormaMarks } from "./marks.js";

// ---------------------------------------------------------------------------
// Assembled schema (§10)
// ---------------------------------------------------------------------------

/** The assembled Metanorma ProseMirror schema. */
export const metanormaSchema: Schema = new Schema({
  nodes: metanormaNodes,
  marks: metanormaMarks,
});

// ---------------------------------------------------------------------------
// Raw spec maps — for consumers that compose a modified schema.
// ---------------------------------------------------------------------------

export { metanormaNodes } from "./nodes.js";
export { metanormaMarks } from "./marks.js";

// ---------------------------------------------------------------------------
// Convenience lookups — in §3 group order.
// ---------------------------------------------------------------------------

/**
 * The 42 node names, in §3.1 group order. The authoritative list that the
 * schema's `nodes` map must contain exactly.
 */
export const NODE_NAMES: readonly string[] = [
  // STRUCTURAL_TYPES (4)
  "doc", "preface", "sections", "bibliography",
  // SECTION_TYPES (10)
  "clause", "annex", "content_section", "abstract", "foreword",
  "introduction", "acknowledgements", "terms", "definitions", "references",
  // BLOCK_TYPES (8)
  "paragraph", "note", "admonition", "example", "sourcecode",
  "formula", "quote", "review",
  // LIST_TYPES (6)
  "bullet_list", "ordered_list", "list_item", "dl", "dt", "dd",
  // TABLE_TYPES (6)
  "table", "table_head", "table_body", "table_foot", "table_row", "table_cell",
  // MEDIA_TYPES (2)
  "figure", "image",
  // FOOTNOTE_TYPES (3)
  "footnotes", "footnote_marker", "footnote_entry",
  // LEAF_TYPES (3)
  "text", "soft_break", "floating_title",
];

/**
 * The 16 mark names, in §3.2 order. The authoritative list that the schema's
 * `marks` map must contain exactly.
 */
export const MARK_NAMES: readonly string[] = [
  // Formatting marks (8)
  "emphasis", "strong", "subscript", "superscript", "code",
  "underline", "strike", "smallcap",
  // Reference / semantic marks (8)
  "link", "xref", "eref", "footnote", "stem", "concept", "bcp14", "span",
];

// ---------------------------------------------------------------------------
// Runtime guard (§6.1)
// ---------------------------------------------------------------------------

/**
 * Assert that image attributes carry a non-empty `src`.
 *
 * Because `ImageAttrs.src` is required in TypeScript but ProseMirror needs a
 * default, `src` defaults to `""`; this guard is used by input rules / paste
 * handling to reject empty `src` before creating an `image` node.
 *
 * @throws {Error} when `src` is missing or empty.
 */
export function assertValidImageAttrs(
  attrs: { src?: unknown },
): asserts attrs is { src: string } {
  if (typeof attrs.src !== "string" || attrs.src === "") {
    throw new Error(
      "assertValidImageAttrs: 'src' must be a non-empty string.",
    );
  }
}
