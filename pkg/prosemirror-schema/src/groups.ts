/**
 * ProseMirror group-name constants.
 *
 * The three content-model groups introduced by this schema (§4 of the spec).
 * The source `types.ts` groups nodes only for *classification*; these groups
 * drive the ProseMirror *content model* and are a design decision.
 */

/** Inline content of paragraphs / terms. */
export const INLINE_GROUP = "inline" as const;

/** General block-level children of sections, list items, cells, etc. */
export const BLOCK_GROUP = "block" as const;

/** Nestable section nodes. */
export const SECTION_GROUP = "section" as const;
