/**
 * ProseMirror group-name constants.
 *
 * The content-model groups introduced by this schema (§4 of the spec). The
 * source `types.ts` groups nodes only for *classification*; these groups drive
 * the ProseMirror *content model* and are a design decision.
 *
 * Section nodes are split into three **cohort** groups, one per document
 * region. This lets the container content expressions (`preface`, `sections`,
 * `bibliography`) admit only the section types that belong in that region —
 * enforcing document-level ordering at the schema level rather than in each
 * command. See `cohorts.ts` for the companion metadata.
 */

/** Inline content of paragraphs / terms. */
export const INLINE_GROUP = 'inline' as const;

/** General block-level children of sections, list items, cells, etc. */
export const BLOCK_GROUP = 'block' as const;

/** Front-matter section nodes (abstract, foreword, introduction, acknowledgements, content_section). */
export const SECTION_FRONT_GROUP = 'section_front' as const;

/** Body section nodes (clause, terms, definitions). */
export const SECTION_BODY_GROUP = 'section_body' as const;

/** Annex section nodes (annex) — doc-level siblings, not inside `sections`. */
export const SECTION_ANNEX_GROUP = 'section_annex' as const;

/** Back-matter section nodes (references). */
export const SECTION_BACK_GROUP = 'section_back' as const;
