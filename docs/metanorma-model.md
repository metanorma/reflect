# Metanorma document model — verified upstream reference

This is a **reference document**, not a spec: it records verified facts about
the upstream Metanorma pipeline and its grammars, pinned to immutable commits
(§1). It is input to the corpus — [`schema.spec.md`](./schema.spec.md) §1.1/§17
owns every editor-side decision derived from it — and it sits outside the
source-of-truth hierarchy of [`CONVENTIONS.md`](./CONVENTIONS.md) §1: nothing
"wins" against it because it states nothing about this repository's behaviour.

Reading rules: statements are **verified** (read in the cited source at the
pinned commit) unless marked otherwise; file references use `repo → path`
notation resolved against the ledger in §1; upstream facts are stated here
exactly once — corpus specs link here rather than restating them.

## 1. Verification ledger

All raw content is reachable as
`https://raw.githubusercontent.com/<org>/<repo>/<sha>/<path>`.

| Repository | Commit | Role |
|---|---|---|
| metanorma/metanorma-standoc | `38a50557` | AsciiDoc→Semantic-XML converter; runtime `validate/` grammars |
| metanorma/standoc-models | `7d5d737c` | Human-authored grammar sources (`grammars/`) |
| metanorma/basicdoc-models | `3b408b71` | Base grammar (`basicdoc.rnc`); submodule of standoc-models |
| metanorma/metanorma | `a62ca5a8` | Pipeline orchestrator (compile driver) |
| metanorma/isodoc | `92b3d2b0` | Semantic→Presentation-XML transform and renderers |

**Naming note (three senses of "isodoc").** Upstream commit `4bad36724d`
(2026-08-17, "grammars: rename isodoc.\* sources to standoc.\* (retire the
misnomer)") renamed the grammar sources in `metanorma/standoc-models`:
`isodoc.rnc`→`standoc.rnc`, `isodoc-presentation.rnc`→
`standoc-presentation.rnc`, and companions. It did **not** rename: (a) the
`metanorma/isodoc` **gem** (the Presentation-XML renderer — "Isodoc" properly
names that gem); (b) the **vendored runtime filename** `validate/
isodoc-compile.rng` in metanorma-standoc (gem code loads that path —
`validate/schema.rb` `schema_file`); (c) `isostandard.rnc`, the actual
ISO-flavour grammar. When this ledger or the corpus says **Standoc**, it
means the shared grammar layer (`grammars/standoc.rnc`); **isodoc** references
below the rename are the gem or the vendored runtime path. The rename commit is
content-neutral for the semantic grammar (one comment word); the drift recorded
in §4 came from the intervening re-sync `8bb23fd5631e`.

**Vendoring note.** The rename is now propagating through the vendoring
layer. standoc-models' `grammars/copy.sh` (at the 2026-08-22 merged PR #46,
"Cutover complete: grammar re-sync, standoc.\* rename, .lml source
migration") vendors under `standoc.*` destination names; at the pinned
metanorma-standoc commit the shipped files are still the legacy
`isodoc.rng`/`isodoc-compile.rng` (a self-consistent chain:
`isodoc-compile.rng` → `isodoc.rng` → `reqt.rng` + `basicdoc.rng`).
Expect the gem's `validate/` filenames — and the `schema_file` path — to
flip to `standoc.*` on the next vendoring pass; the models-side rename is
done, the gem-side flip is pending.

**Re-verification.** Facts below were verified 2026-08-16 at the then-pins,
re-verified 2026-08-18, and re-verified **2026-09-25** at the §1 pins
(trigger: metanorma-standoc main advanced past its release-trigger pin).
Grammar sources: `standoc.rnc` and `standoc-presentation.rnc` are
**byte-identical** to the 2026-08-18 verification — §3 stands as verified.
All drift is in `basicdoc.rnc` (submodule `50fe9e85` → `3b408b71`, PR #46);
recorded in §4. Re-verify on the next metanorma-standoc release; drift then
surfaces as a diff against a known commit.

## 2. Pipeline and artifacts

The Metanorma compile pipeline is a fixed chain; the editor targets the
Semantic-XML stage.

```
AsciiDoc ──(standoc makexml1 + cleanup)──► Semantic XML
              │                                   │
              │                    validated here (RNG, Jing)
              │                                   ▼
              │            (isodoc PresentationXMLConvert) ──► Presentation XML
              │                                                       │
              └── metanorma compile driver orchestrates all stages     ▼
                                                          HTML / PDF / DOCX
```

- Semantic XML is produced by standoc (`converter/base.rb` `makexml`:
  `makexml1` → `cleanup` → validate) and validated there: content checks
  (`validate/validate.rb` — xref integrity, empty-block, MathML via Plurimath)
  plus RelaxNG via Jing against `validate/isodoc-compile.rng`
  (`validate/schema.rb` `schema_file`), gated on `@novalid`. Since the
  2026-09-25 re-verification the gem's lib paths are flat — `lib/metanorma/
  converter/base.rb` etc. (a 2026-09 restructure flattened the old
  `lib/metanorma/standoc/…` prefix; the `validate/` runtime paths are
  unchanged).
- Presentation XML is produced by isodoc's `PresentationXMLConvert`, reached
  through the metanorma driver (`compile/compile.rb` `generate_presentation_xml`
  → `compile/render.rb` `process_ext(:presentation)` → `@processor.output`).
- **Presentation XML is not RelaxNG-validated at runtime.** isodoc's
  `PresentationXMLConvert` gained a `validate` method
  (`presentation_function/ids.rb` `id_validate`) by the 2026-09-25
  re-verification — but it performs ID/IDREF bookkeeping (adding
  missing presxml ids to `fmt-*` targets, repeat-id checks, contenthash
  cleanup), not grammar validation; no RelaxNG pass exists on the
  presentation path. The single runtime RNG grammar remains
  `isodoc-compile.rng`, the Semantic-XML grammar, even though its compiled
  model also admits presentation-only constructs (§3).

## 3. Semantic vs Presentation — the layering test

Grammar sources live in `standoc-models → grammars/`: `basicdoc.rnc` (base,
from the basicdoc-models submodule), `standoc.rnc` (the Standoc Semantic
grammar, combines basicdoc; named `isodoc.rnc` before the 2026-08-17 rename —
§1), and `standoc-presentation.rnc` (a separate Presentation grammar). The
runtime `validate/` directory ships only the compiled combination — the `.rnc`
sources are model-level artifacts, not wired into runtime validation.

`standoc-presentation.rnc` opens with `include "standoc.rnc" { … }`, then
continues after the closing brace. The include block **redefines** base
patterns (plain `=` — replacement, not addition); the post-block tail
**extends** them with RelaxNG combines: `&=` (interleave — adds
attributes/children) and `|=` (choice — adds alternatives).

**The layering test.** A construct is authorable **Semantic** — fair game for
the editor — if and only if it appears in `standoc.rnc` (directly or via
basicdoc.rnc); constructs that exist only in `standoc-presentation.rnc` are
authored by the presentation transform and must never be emitted by the
editor. The test governs **membership**, not shape: a redefined construct
still appears in `standoc.rnc` and remains authorable in its Semantic shape.

Presentation-only elements: `semx`, plus the `fmt-*` rendering elements
(`fmt-title`, `fmt-name`, `fmt-xref-label`, `fmt-sourcecode`, `fmt-figure`,
`fmt-stem`, `fmt-eref`, `fmt-origin`, `fmt-link`, `fmt-concept`,
`fmt-related`, `fmt-identifier`, `fmt-provision`, `fmt-termsource`,
`fmt-source`, `fmt-preferred`, `fmt-admitted`, `fmt-deprecates`,
`fmt-annotation-start/-end/-body`, `fmt-footnote-container`, `fmt-fn-body`,
`fmt-fn-label`, `fmt-date-inline`, `fmt-ul`, `fmt-ol`, `fmt-definition`).

Presentation-only attributes: `displayorder`, `semx-id`, `original-id`, and
the per-element attributes of the elements above.

Presentation reduces to `empty` (post-block combines) — rendered away, not
authored: `preface`, `toc`, `docidentifier`, `span`, `btitle`,
`annex-subsection`, `indexsect`, `index`, `index-xref`.

Verified in-block redefinitions at the pinned commit:

- `IdRefType` → `xsd:IDREF` — value-transforming (see below)
- `tname` — restructured around the `fmt-name` caption
- `ol/@type` — closed to a five-value enum
- `eref/@citeas` — made required, regenerated by the transform
- `sections` — admits a leading `paragraph*` run and `references` children

The editor authors the Semantic shape and lets the transform adapt it. Of
these, only the value-transforming redefinitions constrain authoring:
`IdRefType` is plain `text` in Semantic (cross-references point at `@anchor`)
but `xsd:IDREF` in Presentation (pointing at `@id`), so the editor must
author the Semantic form and let the transform rewrite the values (§5).
Content-dropping reductions like the `empty` list above need no editor
attention — the transform performs the removal.

**Note.** `number` and `branch-number` on `Section-Attributes` (user-supplied
numbering overrides, mutually exclusive) are **Semantic** — base definitions in
`standoc.rnc`, not presentation additions.

## 4. Element models (load-bearing subset)

From `basicdoc-models → grammars/basicdoc.rnc` and `standoc.rnc`:

| Element | Verified shape |
|---|---|
| root `metanorma` | `bibdata` **required** first child (then `termdocsource*`, `misccontainer?`, `boilerplate?`); body = `preface?`, `sections` (required), `annex*`, `bibliography?`, `indexsect*`, `colophon?` |
| `preface` | `(content \| abstract \| foreword \| introduction \| acknowledgements \| executivesummary)+` — sections only |
| `sections` | `(clause \| terms \| term-clause \| definitions \| floating-title)+` — sections only |
| `figure` | `RequiredId` + `unnumbered?`/`subsequence?`/`class?`; no `src`, `title`, or `number` attribute. Body: optional caption child (`tname?`), then one of `image`/`video`/`audio`/`pre`/`paragraph-with-footnote+`/`figure*`, then `fn*`, `dl?`, `note*`, `source?` |
| `image` | `RequiredId`; `src` (anyURI) and `mimetype` **required**; `alt?`, `title?`, `longdesc?`, `filename?`, `width?`, `height?` |
| `formula` | `RequiredId`; body = **required** `stem` child, then `dl?`, `note*` — not an empty atom |
| `stem` | **required** `type` = `MathML`\|`AsciiMath`\|`LaTeX` (basicdoc) plus **required** `block` boolean (standoc combine) and `number-format?`; content = `text?`, `mathml?`, `asciimath?`, `latexmath?` child elements. Used both inline (in the `TextElement` choice) and as formula's math content |

**Drift since the 2026-08-16 pin** (all in `basicdoc.rnc`; the standoc-models
submodule moved twice — `d2a94b1a` → `50fe9e85` at the `8bb23fd5` re-sync
(2026-08-17), `50fe9e85` → `3b408b71` at PR #46 (2026-08-22). Re-verified
2026-09-25 against the full `d2a94b1a` → `3b408b71` diff):

- `OlAttributes.@type` widened from the closed five-value enum
  (`roman`\|`alphabet`\|`arabic`\|`roman_upper`\|`alphabet_upper`) to admit
  **any text** — a renderer-native numbering format string passed through for
  the target rendering language (e.g. xml2rfc v2 `R%d`, carried by
  metanorma-ietf). The five named literals survive but are no longer exclusive.
- `ExampleBody` is no longer redefined wholesale by standoc; the caption
  (`tname?`), cardinality, and trailing `note*` moved back to the base layer
  and standoc overrides only the content-alternative hook `ExampleBodyContent`
  so higher layers' `|=` extensions attach to the governing definition
  (metanorma-model-iso#160). **Semantic content set is unchanged** for the
  editor's purposes.
- `TdBody` table cells: inline branch admits `fn` alongside `TextElement`, and
  the block branch, `paragraph-with-footnote+` at the 2026-08-16 pin (briefly
  `(paragraph-with-footnote | note)+`), is now `BasicBlock+`
  (metanorma-model-iso#154/#157 — AsciiDoc `a|` cells, Pandoc). The 2026-08-18
  pass missed this change (it read the submodule at the ledger's stale pin);
  recorded correctly here since 2026-09-25.
- `index`/`index-xref`: `index-secondary` and `index-tertiary` are now
  **optional** (required at the 2026-08-16 pin). Also missed by the 2026-08-18
  pass; recorded since 2026-09-25.
- **Attribute register family (new, PR #46 window)**: `reg-attribute`
  (element `attribute`, `@key` + `@scheme?` + text or `value*` children) is
  admitted as a leading child across essentially every body model
  (`ParagraphBody`, `NoteBody`, `FormulaBody`, `QuoteBody`, `SourceBody`,
  `TableBody`, `FigureBody`, `UlBody`/`OlBody`/`DlBody`, `LiBody`, `dd`,
  `ExampleBody`, `TdBody`, and basicdoc's generic `section`/`document`
  containers — not the standoc `Clause-Section`); a sibling `variable-ref`
  inline element (`@name`, inline
  content — model home for `{attr}` / template variables) joins `TextElement`,
  `PureTextElement`, and `NestedTextElement`; `amend/newcontent` additionally
  admits `document*`.
- **Block-content relaxations (PR #46 window)**: `quote` body, `admonition`
  body, `li` items, and `dd` definitions widened from
  `paragraph-with-footnote`-only shapes to `BasicBlock` content (`li` and `dd`
  now allow zero or more blocks — a bare empty item is valid);
  `thead`/`tfoot` widened from a single `tr` to `tr+`;
  `review/@reviewer` is now optional. All widenings.
- Everything else in the table above and §3 is otherwise unchanged
  (`sections`, `clause`/`Clause-Section`, annex structure, `preface`,
  `bibliography`, `references`, `floating-title`, `section-title`, `table`
  container shape, all `BasicBlock` extensions, `start`).

`stem`'s display mode is the `block` boolean — not the `type` enum, which
selects the encoding. The encoding lives in child elements selected by `type`;
there are no `asciimath`/`mathml` attributes on stem or formula.

## 5. Identifiers and cross-references

Every id-bearing element carries `RequiredId = attribute id { xsd:ID }`
(basicdoc — required). `standoc.rnc` combines add optional `anchor` (text) and
`source`.

The upstream emission lifecycle (standoc):

1. **At authoring** (`converter/blocks.rb` `id_attr`): `@id` is always a
   generated placeholder `"_" + UUIDTools random UUID`; `@anchor` carries the
   user's AsciiDoc id (`[[name]]`), only when supplied.
2. **At cleanup** (`cleanup/inline.rb` `contenthash_id_make`): every
   GUID-shaped `@id` is replaced by a content-derived hash
   (`Metanorma::Utils.contenthash`; algorithm lives in the unpinned
   metanorma-utils gem *(2026-08-11)*). `@anchor` is preserved and aliased
   into the id map used for resolution.
3. **At the presentation transform** *(2026-08-11)*: cross-reference targets
   are resolved through the anchor map and rewritten to the content-hash
   `@id` (normalized to the `xsd:IDREF` of §3); `@anchor` is dropped.

Uniqueness of `id`/`anchor` is enforced by standoc content checks
(STANDOC_36); Jing runs with `id_check: false` because `IdRefType` is `text`
in Semantic XML.

**Consequence for the editor:** Semantic `xref/@target` values and id-bearing
elements' stable identifiers are **not interchangeable** with `@id` — a
Semantic-targeting editor emits `@anchor` on id-bearing elements and points
references at anchors, never at generated GUIDs or content hashes.

## 6. Bibliography pointers

The Relaton bibliographic model grammars ship with standoc's runtime tree:
`metanorma-standoc → lib/metanorma/validate/biblio.rng` and
`biblio-standoc.rng`. Relaton itself is a Ruby-only ecosystem; no off-the-shelf
JavaScript implementation exists (citation-js targets CSL-JSON, not Relaton).
This repository's modeled subset is specified — with its coverage table — in
[`pkg/relaton/README.spec.md`](../pkg/relaton/README.spec.md).
