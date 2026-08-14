/**
 * Section cohort metadata — the canonical domain model for which document
 * region each section type belongs to (§8.0a).
 *
 * The three cohort groups in `groups.ts` (`section_front`, `section_body`,
 * `section_back`) drive ProseMirror's content validation: each container
 * (`preface`, `sections`, `bibliography`) admits only the section types in its
 * cohort. This module provides the companion metadata that commands and the
 * toolbar consume — cohort membership, container mapping, doc ordering, and
 * the section-type lists used to build menus.
 *
 * It is also the design hook for future same-cohort type changes: a future
 * `changeSectionType(state, target, dispatch)` would guard with
 * `sameCohort(currentType, target)`. The schema content expressions already
 * permit same-cohort `replaceRangeWith` (shared group, compatible content);
 * the guard is the command layer's responsibility.
 */

/**
 * The three document regions a section type may belong to.
 *
 * - `"front"` — front matter (inside `preface`).
 * - `"body"`  — main body (inside `sections`).
 * - `"back"`  — back matter (inside `bibliography`).
 */
export type SectionCohort = "front" | "body" | "annex" | "back";

/**
 * Section type name → its cohort. Authoritative mapping consulted by commands
 * (`insertSection`, `ensureContainer`) and toolbar menus. Must agree with the
 * `group` assignments on each section node spec in `nodes.ts` (§8.2).
 */
export const SECTION_COHORT: Readonly<Record<string, SectionCohort>> = {
  // Front matter
  abstract: "front",
  foreword: "front",
  introduction: "front",
  acknowledgements: "front",
  content_section: "front",
  // Body
  clause: "body",
  terms: "body",
  definitions: "body",
  // Annexes — doc-level siblings, no container
  annex: "annex",
  // Back matter
  references: "back",
};

/**
 * Cohort → the container node name it belongs in. Used by `insertSection` to
 * resolve the target container for a given section type. The `"annex"` cohort
 * is deliberately absent: annexes are doc-level siblings (see
 * {@link DOC_CHILD_ORDER}), not children of a container.
 */
export const COHORT_CONTAINER: Readonly<Record<string, string>> = {
  front: "preface",
  body: "sections",
  back: "bibliography",
};

/**
 * The doc-level child ordering (§8.1): `doc.content` =
 * `(bibdata preface? sections? annex* bibliography? footnotes?)`. Commands
 * that create or relocate containers consult this to compute the correct
 * insertion position.
 */
export const DOC_CHILD_ORDER: readonly string[] = [
  "bibdata", "preface", "sections", "annex", "bibliography", "footnotes",
];

// ---------------------------------------------------------------------------
// Section-type lists by cohort — for menu rendering
// ---------------------------------------------------------------------------

/** Front-matter section types, in canonical (document-appearance) order. */
export const FRONT_TYPES: readonly string[] = [
  "abstract", "foreword", "introduction", "acknowledgements", "content_section",
];

/** Body section types, in canonical order. */
export const BODY_TYPES: readonly string[] = [
  "clause", "terms", "definitions",
];

/** Annex section types — doc-level siblings, no container. */
export const ANNEX_TYPES: readonly string[] = [
  "annex",
];

/** Back-matter section types. */
export const BACK_TYPES: readonly string[] = [
  "references",
];

/**
 * Whether two section types are in the same cohort. The foundation for future
 * same-cohort type-change support: cross-cohort conversion is deliberately not
 * offered (the user creates a new section instead), but same-cohort conversion
 * (e.g. `clause` → `terms`) is structurally permitted by the schema.
 */
export function sameCohort(a: string, b: string): boolean {
  return SECTION_COHORT[a] === SECTION_COHORT[b];
}
