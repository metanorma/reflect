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
| metanorma/metanorma-standoc | `601c3761` | AsciiDoc→Semantic-XML converter; runtime `validate/` grammars |
| metanorma/standoc-models | `a3596dc9` | Human-authored grammar sources (`grammars/`) |
| metanorma/basicdoc-models | `d2a94b1a` | Base grammar (`basicdoc.rnc`); submodule of standoc-models |
| metanorma/metanorma | `08ea913c` | Pipeline orchestrator (compile driver) |
| metanorma/isodoc | `8d8f3524` | Semantic→Presentation-XML transform and renderers |

**Re-verification.** Facts below were verified 2026-08-16 at these commits,
except two marked *(2026-08-11)*, which predate the pinning. Re-verify on the
next metanorma-standoc release; drift then surfaces as a diff against a known
commit.

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
  (`validate/schema.rb` `schema_file`), gated on `@novalid`.
- Presentation XML is produced by isodoc's `PresentationXMLConvert`, reached
  through the metanorma driver (`compile/compile.rb` `generate_presentation_xml`
  → `compile/render.rb` `process_ext(:presentation)` → `@processor.output`).
- **Presentation XML is not RelaxNG-validated at runtime.** At the pinned
  isodoc commit neither `PresentationXMLConvert` nor its base `Convert` class
  defines any `validate` method; the only runtime RNG pass is the Semantic one
  above. The single runtime grammar, `isodoc-compile.rng`, is therefore the
  Semantic-XML grammar even though its compiled model also admits
  presentation-only constructs (§3).

## 3. Semantic vs Presentation — the layering test

Grammar sources live in `standoc-models → grammars/`: `basicdoc.rnc` (base,
from the basicdoc-models submodule), `isodoc.rnc` (the Standoc Semantic
grammar, combines basicdoc), and `isodoc-presentation.rnc` (a separate
Presentation grammar). The runtime `validate/` directory ships only the
compiled combination — the `.rnc` sources are model-level artifacts, not wired
into runtime validation.

`isodoc-presentation.rnc` opens with `include "isodoc.rnc" { … }`, then
continues after the closing brace. The include block **redefines** base
patterns (plain `=` — replacement, not addition); the post-block tail
**extends** them with RelaxNG combines: `&=` (interleave — adds
attributes/children) and `|=` (choice — adds alternatives).

**The layering test.** A construct is authorable **Semantic** — fair game for
the editor — if and only if it appears in `isodoc.rnc` (directly or via
basicdoc.rnc); constructs that exist only in `isodoc-presentation.rnc` are
authored by the presentation transform and must never be emitted by the
editor. The test governs **membership**, not shape: a redefined construct
still appears in `isodoc.rnc` and remains authorable in its Semantic shape.

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
`isodoc.rnc`, not presentation additions.

## 4. Element models (load-bearing subset)

From `basicdoc-models → grammars/basicdoc.rnc` and `isodoc.rnc`:

| Element | Verified shape |
|---|---|
| root `metanorma` | `bibdata` **required** first child (then `termdocsource*`, `misccontainer?`, `boilerplate?`); body = `preface?`, `sections` (required), `annex*`, `bibliography?`, `indexsect*`, `colophon?` |
| `preface` | `(content \| abstract \| foreword \| introduction \| acknowledgements \| executivesummary)+` — sections only |
| `sections` | `(clause \| terms \| term-clause \| definitions \| floating-title)+` — sections only |
| `figure` | `RequiredId` + `unnumbered?`/`subsequence?`/`class?`; no `src`, `title`, or `number` attribute. Body: optional caption child (`tname?`), then one of `image`/`video`/`audio`/`pre`/`paragraph-with-footnote+`/`figure*`, then `fn*`, `dl?`, `note*`, `source?` |
| `image` | `RequiredId`; `src` (anyURI) and `mimetype` **required**; `alt?`, `title?`, `longdesc?`, `filename?`, `width?`, `height?` |
| `formula` | `RequiredId`; body = **required** `stem` child, then `dl?`, `note*` — not an empty atom |
| `stem` | **required** `type` = `MathML`\|`AsciiMath`\|`LaTeX` (basicdoc) plus **required** `block` boolean (isodoc combine) and `number-format?`; content = `text?`, `mathml?`, `asciimath?`, `latexmath?` child elements. Used both inline (in the `TextElement` choice) and as formula's math content |

`stem`'s display mode is the `block` boolean — not the `type` enum, which
selects the encoding. The encoding lives in child elements selected by `type`;
there are no `asciimath`/`mathml` attributes on stem or formula.

## 5. Identifiers and cross-references

Every id-bearing element carries `RequiredId = attribute id { xsd:ID }`
(basicdoc — required). `isodoc.rnc` combines add optional `anchor` (text) and
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
