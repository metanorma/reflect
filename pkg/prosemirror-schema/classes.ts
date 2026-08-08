/**
 * Class-name contract for `toDOM` / `parseDOM` (§8, §9).
 *
 * The single source of truth for every CSS class the schema emits on rendered
 * HTML. Every `toDOM` and `parseDOM` rule in `nodes.ts` / `marks.ts` reads its
 * class from this const; the React node views (`pkg/prosemirror-editor`) and
 * the document stylesheet (`document.css`) consume the same names. Renaming a
 * class therefore touches one symbol here, with the schema `toDOM`/`parseDOM`
 * pairs updated in lockstep.
 *
 * ## Namespace
 *
 * All emitted classes carry the `mn-` prefix. The earlier mix of namespaced
 * (`mn-clause`, `mn-sections`, …) and bare (`figure`, `formula`, `xref`, …)
 * names was unified to the `mn-` prefix in schema.spec.md **v4** for collision
 * safety when the editor is mounted inside a host page that defines its own
 * `.figure` / `.note` / `.example` rules.
 *
 * ## Scope
 *
 * `CLASS` covers ONLY classes emitted by a schema `toDOM` (and matched by the
 * matching `parseDOM`). Editor-chrome classes that exist solely for editor UX
 * (e.g. `mn-image-placeholder`, `mn-section-title-input`) are NOT in this
 * const — they belong to `@metanorma/prosemirror-editor`, not to the schema's
 * serialization contract, and live as raw literals in `editor-chrome.css`.
 *
 * ## Not covered
 *
 * `sourcecode`'s dynamic `language-${language}` class is a Prism / highlight.js
 * interop convention, not a Metanorma-emitted name — it is built inline at the
 * `toDOM` call site and is deliberately absent from this const.
 */

/** Every CSS class emitted by the Metanorma schema's `toDOM` rules. */
export const CLASS = {
  // Structural (§8.1)
  doc:          "mn-doc",
  preface:      "mn-preface",
  sections:     "mn-sections",
  bibliography: "mn-bibliography",

  // Section nodes (§8.2) — all share the `mn-<type>` template
  clause:           "mn-clause",
  annex:            "mn-annex",
  contentSection:   "mn-content-section",
  abstract:         "mn-abstract",
  foreword:         "mn-foreword",
  introduction:     "mn-introduction",
  acknowledgements: "mn-acknowledgements",
  terms:            "mn-terms",
  definitions:      "mn-definitions",
  references:       "mn-references",

  // Section title child node (§8.2)
  sectionTitle: "mn-section-title",

  // Block nodes (§8.3)
  note:          "mn-note",
  admonition:    "mn-admonition",
  example:       "mn-example",
  review:        "mn-review",
  formula:       "mn-formula",
  floatingTitle: "mn-floating-title",

  // Media nodes (§8.6)
  figure:        "mn-figure",

  // Footnote nodes (§8.7)
  footnotes:      "mn-footnotes",
  footnoteEntry:  "mn-footnote-entry",
  footnoteMarker: "mn-footnote-marker",

  // Leaf inline nodes (§8.8)
  stem:          "mn-stem",

  // Formatting marks (§9.1)
  smallcap:      "mn-smallcap",

  // Reference / semantic marks (§9.2)
  xref:          "mn-xref",
  eref:          "mn-eref",
  concept:       "mn-concept",
  bcp14:         "mn-bcp14",
} as const;

/** Type helper: the value type of {@link CLASS}. */
export type ClassName = (typeof CLASS)[keyof typeof CLASS];
