# Reflect — ProseMirror Schema Specification

**Source of truth for the document model: the Metanorma document model**, as
expressed in the Semantic XML that the Metanorma pipeline
(`metanorma-standoc`) authors and validates (the compiled RelaxNG grammar
`lib/metanorma/validate/isodoc-compile.rng` in
[`metanorma/metanorma-standoc`](https://github.com/metanorma/metanorma-standoc),
human-authored source `grammars/isodoc.rnc` in
[`metanorma/standoc-models`](https://github.com/metanorma/standoc-models)).
The goal is **alignment**: every construct the editor models corresponds to a
well-defined Semantic-XML construct, so documents convert unambiguously (§1.1).
Presentation XML — the rendering-oriented layer with `fmt-*` elements and
`semx` wrappers — is generated downstream by the pipeline, not authored by
this editor.

---

## 1. Purpose

Define a single `prosemirror-model` `Schema` whose node and mark vocabulary,
content model, attributes, and DOM serialization rules are **aligned with the
Metanorma document model** (Semantic XML): each editor construct maps to a
single well-defined XML construct. The schema must:

1. Contain **exactly** the node types and mark types enumerated in §3
   (no more, no less).
2. Accept a `MetanormaDocument` (the JSON tree of §12) via
   `Schema.nodeFromJSON(...)` and reproduce an equivalent tree via
   `Node.toJSON()` (lossless round-trip for every typed attribute).
3. Provide `toDOM` / `parseDOM` so documents can be rendered to HTML and parsed
   back from HTML without information loss for the round-tripped attributes.

### 1.1 Coverage and convertibility to Metanorma XML

The schema covers a **subset** of the Metanorma document model, not all of it —
a complex Metanorma document is generally *not* representable in this schema,
and a lossless Metanorma-XML → ProseMirror → Metanorma-XML round-trip is **not**
a goal. What the schema *does* guarantee is **unambiguous convertibility**: any
document the editor can produce under this schema must convert to valid
Metanorma **Semantic XML** (the authoring form the pipeline validates; §17)
without the converter having to guess between competing representations of the
same fact (no dual source of truth). Attribute and element names in the schema
need not match the XML names — a dedicated converter performs those renames and
structural reshapes. Where a Semantic-XML value is required but cannot be
derived from anything the editor models (e.g. `mimetype`, `reviewer`, `depth`),
the converter may **invent** a default, but such invention is a schema
limitation, surfaced in §17.

Four dual-source-of-truth issues are resolved in this spec so that conversion is
unambiguous (the first three are detailed in §17): `figure.src` lives only on
the `image` child (§17.1); `formula` and `stem` carry a `type` discriminator
selecting the authoritative encoding (§17.2); the `concept` mark carries a
`kind` discriminator selecting the reference-element type (§17.3); and
footnote references use a single `footnote_marker` node, with no competing
`footnote` mark (§3.2).

---

## 2. Module layout

A workspace package:

```
pkg/prosemirror-schema/
├── package.json          ← name: '@metanorma/prosemirror-schema'
├── tsconfig.json         ← extends ../../tsconfig.json
├── index.ts              ← public exports (§11)
├── nodes.ts              ← nodeSpec map (§8)
├── marks.ts              ← markSpec map (§9)
├── attrs.ts              ← shared attribute helpers (§6)
├── classes.ts            ← `CLASS` const for toDOM/parseDOM (§8.0)
├── cohorts.ts            ← section cohort metadata (§8.0a)
└── groups.ts             ← group-name constants
```

**Note.** The implementer may choose a different package path, but the **public
exports** (§11) and the schema contents must match this spec exactly.

### 2.1 Dependencies

| Package | Version | Purpose |
|---|---|---|
| `prosemirror-model` | `^1.22.0` | `Schema`, `NodeSpec`, `MarkSpec`, `DOMOutputSpec` |

No other runtime dependencies. The package has **zero** DOM dependency at
schema- definition time (`toDOM`/`parseDOM` describe structure only).

---

## 3. Vocabulary

The vocabulary is the editor-side naming of the Metanorma document-model
constructs it covers (§1.1). Names need not match the XML element names — the
converter performs renames (§17) — but each name denotes exactly one XML
construct.

### 3.1 Node types (46)

| Group constant | Members |
|---|---|
| `STRUCTURAL_TYPES` (5) | `doc`, `bibdata`, `preface`, `sections`, `bibliography` |
| `SECTION_FRONT_TYPES` (5) | `abstract`, `foreword`, `introduction`, `acknowledgements`, `content_section` |
| `SECTION_BODY_TYPES` (3) | `clause`, `terms`, `definitions` |
| `SECTION_ANNEX_TYPES` (1) | `annex` |
| `SECTION_BACK_TYPES` (1) | `references` |
| `BIBITEM_TYPES` (1) | `bibitem` |
| `BLOCK_TYPES` (8) | `paragraph`, `note`, `admonition`, `example`, `sourcecode`, `formula`, `quote`, `review` |
| `LIST_TYPES` (6) | `bullet_list`, `ordered_list`, `list_item`, `dl`, `dt`, `dd` |
| `TABLE_TYPES` (6) | `table`, `table_head`, `table_body`, `table_foot`, `table_row`, `table_cell` |
| `MEDIA_TYPES` (2) | `figure`, `image` |
| `FOOTNOTE_TYPES` (3) | `footnotes`, `footnote_marker`, `footnote_entry` |
| `INLINE_ATOM_TYPES` (1) | `stem` |
| `SECTION_TITLE_TYPES` (1) | `section_title` |
| `FLOATING_TITLE_TYPES` (1) | `floating_title` |
| `LEAF_TYPES` (2) | `text`, `soft_break` |

**Note.** `section_title` is a standalone textblock (content `inline*`) that
appears only as the optional leading child of a section node (§8.2). It is not
a member of any PM content group (neither `block` nor `inline`), so it cannot be
inserted as a general block or appear in arbitrary containers — only the section
content expressions reference it (§8.2).

**Note.** `floating_title` is a **groupless textblock** (content `inline*`,
no PM group membership), modelled after Isodoc's `floating-title`, which is
never a `BasicBlock`. Like `section_title`, it can appear only where a content
expression names it explicitly — at the top level of `sections`, and in the
subclause branches of `clause` and `annex` (§8.2). Carrying `id` and `depth`
(not the `id`/`number` pair of section nodes, §6.1), its inline content is
the heading text, so it supports
full inline markup (emphasis, links, etc.).

### 3.2 Mark types (14)

`emphasis`, `strong`, `subscript`, `superscript`, `code`, `underline`,
`strike`, `smallcap`, `link`, `xref`, `eref`, `concept`, `bcp14`, `span`.

**Note.** Footnote references are modelled by the `footnote_marker` **inline
node** (§3.1, §8.7), which directly mirrors the inline Metanorma `<fn>`
element (body co-located at the reference site). There is **no** `footnote`
mark: the mark would be a second representation of the same fact — a dual
source of truth the converter could not resolve — so footnote references have
a single representation (§1.1).

---

## 4. ProseMirror group design

The document model classifies nodes into cohorts for *classification*;
ProseMirror groups drive the *content model*. The mapping below is a design
decision (the document model does not prescribe content expressions). Six
groups are introduced:

| PM group | Members | Notes |
|---|---|---|
| `inline` | `text`, `soft_break`, `footnote_marker`, `stem` | Inline content of paragraphs / terms. |
| `block` | `paragraph`, `note`, `admonition`, `example`, `sourcecode`, `formula`, `quote`, `review`, `bullet_list`, `ordered_list`, `dl`, `table`, `figure` | General block-level children of sections, list items, cells, etc. Deliberately **excludes** `image`, `list_item`, `dt`, `dd`, `table_*` parts, `footnote_entry`, `section_title`, and `floating_title` (all contextual — see below). |
| `section_front` | `abstract`, `foreword`, `introduction`, `acknowledgements`, `content_section` | Front-matter section nodes (inside `preface`). |
| `section_body` | `clause`, `terms`, `definitions` | Body section nodes (inside `sections`). Nestable: a body section's content expression may reference `section_body` members for nesting. |
| `section_annex` | `annex` | Annex section nodes — **doc-level siblings**, not children of any container (§8.1). |
| `section_back` | `references` | Back-matter section nodes (inside `bibliography`). |

The four cohort groups (`section_front`, `section_body`, `section_annex`,
`section_back`) are the structural backbone of the document ordering. Three of
them have a dedicated container whose content expression admits only that
cohort's section types (§8.1): the schema itself enforces that front-matter
sections appear only in `preface`, body sections only in `sections`, and
back-matter sections only in `bibliography`. The **annex cohort has no
container** — `annex` nodes are direct children of `doc`, ordered after
`sections` and before `bibliography` (Isodoc root child order), enforced by the
`doc.content` expression rather than a container's. The companion cohort
metadata (§8.0a) maps each type to its cohort and drives command-level routing.

**Groupless nodes.** Two textblocks carry **no** PM group membership and are
admissible only where a content expression names them explicitly:
`section_title` (the optional leading heading child of a section node, §8.2) and
`floating_title` (the free-standing unnumbered heading, admitted at `sections`
top level and in the subclause branches of `clause` and `annex`, §8.3). Because
neither is in the `block` group, neither can be inserted as a general block or
appear inside container blocks (`note`, `example`, `dd`, …) — only the
positions that name them accept them. This matches Isodoc, where
`floating-title` is never a `BasicBlock`.

---

## 5. Content model overview

| Node | Content expression | Rationale |
|---|---|---|
| `doc` | `(bibdata preface? sections? annex* bibliography? footnotes?)` | Root: required bibdata (document metadata), optional front matter, body, **doc-level annexes** (Isodoc root child order: after `sections`, before `bibliography`), back matter, footnotes container. |
| `preface` | `section_front+` | Front-matter sections (abstract/foreword/…, `content_section`). |
| `sections` | `(section_body \| floating_title)+` | Main body. Isodoc's `sections` admits `floating-title` at top level alongside the body section types. |
| `bibliography` | `references+` | Back matter; `references` is the sole `section_back` member. |
| `bibdata` | *(empty)* | Atom: document-level bibliographic metadata. Stores a `BibliographicItem` (from `@metanorma/relaton`, [`README.spec.md`](../pkg/relaton/README.spec.md)) as a single JSON `item` attr. Required first child of `doc` (§8.1). |
| `bibitem` | *(empty)* | Atom: a single bibliography entry. Stores a `BibliographicItem` as a single JSON `item` attr. Permitted only inside `references` sections (§8.2). |
| `clause` | `section_title? (block+ \| (clause \| terms \| definitions \| floating_title)+)` | Isodoc `Clause-Section`, **strict XOR**: a clause holds either blocks (leaf) or subclauses, never both — no hanging paragraphs in the numbered body hierarchy. Optional leading heading textblock. |
| `annex` | `section_title? block* (clause \| terms \| definitions \| references \| floating_title)*` | Isodoc `Annex-Section-Body`, **non-strict**: optional prefatory blocks then subclauses (in any mix). **Doc-level** — `annex` is a direct child of `doc`, not nested in a container and not self-nesting. Admits `references` subclauses. Optional leading heading. |
| `content_section` | `section_title? block* content_section*` | Isodoc `content` (`Content-Section`): the unnumbered generic preface clause. **Front-matter only**; nests `content_section` subclauses. Serializes as `<clause>` on export (§17.6). Optional leading heading. |
| `abstract`, `foreword`, `introduction`, `acknowledgements` | `section_title? block* content_section*` | Isodoc `Content-Section` shape: optional prefatory blocks, then `content_section` subclauses. Optional leading heading. |
| `terms` | `section_title? block* (terms \| definitions)*` | Isodoc `terms`: prefatory blocks, then nested `terms`/`definitions` (the term-entry subtree is out of scope, §17.5). |
| `definitions` | `section_title? (block \| definitions)+` | Isodoc `definitions`: at least one child required. |
| `references` | `section_title? block* bibitem* references*` | Isodoc `references`: exact ordered sequence — prefatory blocks, then `bibitem` entries, then nested `references`. Optional leading heading. |
| `section_title` | `inline*` | Standalone textblock: the heading of its parent section. Appears only as the optional leading child of a section node (no group membership). |
| `floating_title` | `inline*` | **Groupless textblock** (no PM group); free-standing unnumbered heading. Carries `id` and `depth` attrs. Admissible only where named explicitly: at `sections` top level, and in the subclause branches of `clause` and `annex` (§8.3) — never as a general `block`. |
| `paragraph` | `inline*` | |
| `note`, `example`, `quote`, `review` | `block+` | Container blocks. |
| `admonition` | `block+` | Container; `type` attr classifies it. |
| `sourcecode` | `text*` | Raw text content (a `code_block`-style node). |
| `formula` | *(empty)* | Atom leaf; math in `asciimath` attr (when `type='asciimath'`) or `mathml` attr (when `type='mathml'`). |
| `stem` | *(empty)* | Inline atom leaf; inline-formula math in `asciimath`/`mathml` attr, selected by the `type` attr. |
| `bullet_list` | `list_item+` | |
| `ordered_list` | `list_item+` | |
| `list_item` | `block+` | At least one block (conventionally a paragraph). |
| `dl` | `(dt dd)+` | Definition list: alternating term/description pairs. |
| `dt` | `inline*` | Definition term. |
| `dd` | `block+` | Definition description. |
| `table` | `(table_head \| table_body \| table_foot)+` | Honour the typed head/body/foot parts. |
| `table_head`, `table_body`, `table_foot` | `table_row+` | |
| `table_row` | `table_cell+` | |
| `table_cell` | `block+` | |
| `figure` | `(image \| block)*` | An optional `image` plus caption/other blocks. `image` is allowed **only** here. |
| `image` | *(empty)* | Atom leaf; `src` attr required. |
| `footnotes` | `footnote_entry+` | Single container of all footnote entries (doc-level). |
| `footnote_entry` | `block+` | Footnote body. |
| `footnote_marker` | *(empty)* | Inline atom leaf; references a `footnote_entry` by id. |
| `soft_break` | *(empty)* | Inline atom leaf. |
| `text` | *(built-in)* | Group `inline`. |

---

## 6. Attribute conventions

The editor's JSON attribute model is open: every node/mark accepts extra keys
beyond its typed attributes, carried in `Record<string, unknown>`
(`MetanormaMark.attrs`, §12). ProseMirror
attributes must be **declared** with a default, so this schema adopts the
following rules:

1. **Typed attributes** — those enumerated for each node and mark in §6.1 /
   §6.2 — are declared explicitly with `default: null` for every optional
   field.
2. **Catch-all `data` attribute.** Every node and mark declares a
   `data: { default: {} }` attribute that captures the extra keys beyond the
   typed set (§12's open `attrs` record) for round-tripping. `data` is
   **serialized to JSON but never rendered to the DOM**.
3. **Numeric defaults.** `table_cell`'s `colspan`/`rowspan` default to `1`
   (not `null`) because they are real table-spanning values; `ordered_list`
   adds `order: { default: 1 }` (permitted by its open attr set).
4. **`null` vs `undefined`.** All optional attrs use `default: null`. Under the
   repo's `exactOptionalPropertyTypes`, JSON produced by `toJSON()` uses `null`,
   never `undefined`.

### 6.1 Attribute map by node

| Node | Declared attributes (beyond `data`) | Notes |
|---|---|---|
| `clause`, `annex`, `content_section`, `abstract`, `foreword`, `introduction`, `acknowledgements`, `terms`, `definitions`, `references` | `id`, `number` | `title` is not an attribute — the heading is a `section_title` child node (§8.2). |
| `floating_title` | `id`, `depth` (default `1`) | Mirrors Metanorma `<floating-title>` (RequiredId + required `depth` int + TextElement inline content). |
| `section_title` | *(none beyond `data`)* | The heading text is inline content, not an attribute. |
| `preface`, `sections`, `bibliography` | `id`, `number` | |
| `bibdata` | `item` | A `BibliographicItem` JSON object (`@metanorma/relaton`). Default `null`. |
| `bibitem` | `item` | A `BibliographicItem` JSON object (`@metanorma/relaton`). Default `null`. |
| `formula` | `id`, `number`, `type` (enum `asciimath` \| `mathml`, default `'asciimath'`), `asciimath`, `mathml` | |
| `stem` | `type` (enum `asciimath` \| `mathml`, default `'asciimath'`), `asciimath`, `mathml` | |
| `figure` | `id`, `number`, `title` | The `src` attr is dropped — `src` lives only on the `image` child, avoiding a dual source of truth (§17.1). |
| `table` | `id`, `number`, `title` | |
| `table_cell` | `colspan` (default `1`), `rowspan` (default `1`) | Real table-spanning values, hence `1` not `null` (§6 rule 3). |
| `image` | `src` (default `''`), `alt` | `src` is required semantically → default `''` + the runtime guard below. |
| `admonition` | `type` | |
| `sourcecode` | `language` | A `text` attr is deliberately absent — the code text lives in the node's `text*` content, not an attribute; carrying both would be a dual source of truth on conversion (§1.1). |
| `ordered_list` | `order` (default `1`) | |
| `footnote_entry` | `id`, `number` | |
| `footnote_marker` | `id`, `target` | |
| `paragraph`, `note`, `example`, `quote`, `review`, `bullet_list`, `list_item`, `dl`, `dt`, `dd`, `table_head`, `table_body`, `table_foot`, `table_row`, `footnotes`, `soft_break` | *(none beyond `data`)* | |

**`image.src` validation.** The image source is semantically required, but
ProseMirror needs an attr default, so `src` defaults to `''` and the module
exports a runtime guard `assertValidImageAttrs(attrs)` used by input rules /
paste handling to reject empty `src`.

### 6.2 Attribute map by mark

| Mark | Declared attributes (beyond `data`) | Notes |
|---|---|---|
| `link` | `href` | Single URL attr — Semantic-XML `<link>` carries one required `target` URL, and `href` is that URL; a second URL-shaped attr would be a dual source of truth (§1.1). |
| `xref` | `target` | |
| `eref` | `cite` | The external citation key. |
| `concept` | `ref`, `kind` (enum `'eref' \| 'xref' \| 'termref'`, default `'xref'`) | `ref` is the concept reference; `kind` discriminates the Semantic-XML child element emitted on export (`<eref>` / `<xref>` / `<termref>`). Without `kind`, a flat `ref` cannot tell the converter which reference type to emit and conversion is ambiguous (§1.1). `erefstack` (a stack of erefs, the fourth XML choice) is not supported — folded into `eref`. |
| `bcp14` | `type` | BCP 14 keyword (e.g. `"MUST"`). |
| `span` | `class` | Generic span class. |
| `emphasis`, `strong`, `subscript`, `superscript`, `code`, `underline`, `strike`, `smallcap` | *(none beyond `data`)* | Boolean-style marks. |

---

## 7. `inclusive` / `excludes` conventions

| Mark | `inclusive` | Notes |
|---|---|---|
| `emphasis`, `strong`, `subscript`, `superscript`, `code`, `underline`, `strike`, `smallcap` | `true` (default) | Formatting continues while typing. |
| `link`, `xref`, `eref`, `concept`, `bcp14`, `span` | `false` | Reference/semantic marks do **not** extend on typing. |

`code` is modelled as **non-exclusive** (it may co-exist with other marks) to
keep the mark model open; no `excludes` is set on any mark.
**Implementer note.** If strict inline-code behaviour is later required, set
`excludes` on `code` to the full mark-name list. Out of scope for v1.

---

## 8. Node specifications

Each entry below contributes one key to the `nodes` map passed to `new Schema`.
`text` uses ProseMirror's built-in via `schema.text` — declare it explicitly
with `group: 'inline'` so `inline*` content resolves.

### 8.0 The `CLASS` contract

Every CSS class emitted by a `toDOM` (and matched by the corresponding
`parseDOM` rule) lives in a single typed const `CLASS`, exported from
`@metanorma/prosemirror-schema` (`classes.ts`) and documented in §11.

```ts
export const CLASS = {
  doc: 'mn-doc', preface: 'mn-preface', /* …sections… */
  bibdata: 'mn-bibdata', bibitem: 'mn-bibitem',
  sectionTitle: 'mn-section-title',
  note: 'mn-note', formula: 'mn-formula', figure: 'mn-figure',
  smallcap: 'mn-smallcap', xref: 'mn-xref', /* … */
} as const;
```

The node/mark `toDOM`/`parseDOM` rules in §8.1–§8.8 and §9 read their class
from this const; the React node views (`pkg/prosemirror-editor`) and the
document stylesheet (`document.css`) consume the same names. **All emitted
classes carry the `mn-` prefix.** Renaming a class touches one symbol in
`CLASS`, with the schema's `toDOM`/`parseDOM` pairs updated in lockstep.

**Scope.** `CLASS` covers ONLY classes emitted by a schema `toDOM`.
Editor-chrome classes that exist solely for editor UX (e.g.
`mn-image-placeholder`) are NOT in the const — they
belong to `@metanorma/prosemirror-editor`, not to the schema's serialization
contract. `sourcecode`'s dynamic `language-${language}` class is a Prism /
highlight.js interop convention and is likewise absent.

### 8.0a Section cohort metadata (`cohorts.ts`)

The four cohort groups (`section_front`, `section_body`, `section_annex`,
`section_back`) drive the container content expressions (§8.1): each
container admits only the section types in its cohort. The companion metadata
in `cohorts.ts` maps each section type name to its cohort and is the single
source of truth consulted by commands and the toolbar. It is exported from the
public API (§11).

```ts
/**
 * The four document regions a section type may belong to.
 *
 * - `'front'` — front matter (inside `preface`).
 * - `'body'`  — main body (inside `sections`).
 * - `'annex'` — annexes (doc-level siblings; no container).
 * - `'back'`  — back matter (inside `bibliography`).
 */
export type SectionCohort = 'front' | 'body' | 'annex' | 'back';

/** Section type name → its cohort. Authoritative mapping (§8.2 group assignments must agree). */
export const SECTION_COHORT: Readonly<Record<string, SectionCohort>>;

/**
 * Cohort → the container node name it belongs in (`front`→`preface`,
 * `body`→`sections`, `back`→`bibliography`). The `'annex'` cohort is
 * deliberately absent: annexes are doc-level siblings (see `DOC_CHILD_ORDER`),
 * not children of a container.
 */
export const COHORT_CONTAINER: Readonly<Record<string, string>>;

/** Doc-level child ordering, matching `doc.content` = `(bibdata preface? sections? annex* bibliography? footnotes?)`. */
export const DOC_CHILD_ORDER: readonly string[];

/** Front-matter section types, in canonical (document-appearance) order. */
export const FRONT_TYPES: readonly string[];
/** Body section types, in canonical order. */
export const BODY_TYPES: readonly string[];
/** Annex section types — doc-level siblings, no container. */
export const ANNEX_TYPES: readonly string[];
/** Back-matter section types. */
export const BACK_TYPES: readonly string[];

/** Whether two section types are in the same cohort. */
export function sameCohort(a: string, b: string): boolean;
```

**`DOC_CHILD_ORDER`** is consulted by the `ensureContainer` helper
([EditorCommands.spec.md](./EditorCommands.spec.md) §5) to compute the correct
insertion position when a container must be created.

**`sameCohort()`** is the design hook for future same-cohort type-change support
(e.g. converting a `clause` into a `terms`): the schema content expressions
already permit same-cohort replacements (shared group, compatible content);
the guard is the command layer's responsibility. Cross-cohort conversion is
deliberately not offered — the user creates a new section instead.

### 8.1 Structural nodes

| Node | Spec essentials |
|---|---|
| `doc` | `content: '(bibdata preface? sections? annex* bibliography? footnotes?)'`; `toDOM: ['div', {class: CLASS.doc}, 0]`; no `parseDOM`. Annexes are doc-level siblings between `sections` and `bibliography` (Isodoc root child order). |
| `bibdata` | `content: ''`; `atom: true`; `attrs: { item: { default: null }, ...DATA_ATTR }`; `toDOM: ['div', {class: CLASS.bibdata}]`; no `parseDOM` (doc-level, created by default doc / loader). |
| `preface` | `content: 'section_front+'`; `toDOM: ['section', {class: CLASS.preface}, 0]`; `parseDOM: [{tag: 'section.mn-preface'}]`. |
| `sections` | `content: '(section_body \| floating_title)+'`; `toDOM: ['section', {class: CLASS.sections}, 0]`; `parseDOM: [{tag: 'section.mn-sections'}]`. Isodoc's `sections` admits `floating-title` at top level alongside the body section types (§8.3). |
| `bibliography` | `content: 'references+'`; `toDOM: ['section', {class: CLASS.bibliography}, 0]`; `parseDOM: [{tag: 'section.mn-bibliography'}]`. |

The three containers (`preface`, `sections`, `bibliography`) each admit only
their own cohort's section types — no bare blocks — matching Isodoc, where the
root's children are the section elements themselves.

### 8.2 Section nodes

All section nodes share `toDOM`/`parseDOM` shape (a `<section>` whose class is
`mn-<type>` and whose `id`/`number` attrs are mirrored to `data-*`):

```ts
function sectionToDOM(cls: string) {
  return (node: Node) => {
    const attrs: Record<string, string> = { class: cls };
    if (node.attrs.id !== null) attrs['data-id'] = node.attrs.id;
    if (node.attrs.number !== null) attrs['data-number'] = node.attrs.number;
    return ['section', attrs, 0] as DOMOutputSpec;
  };
}
// parseDOM: [{ tag: `section.${cls}`, getAttrs(el) { return { id: el.getAttribute('data-id'), number: el.getAttribute('data-number') } } }]
```

Each section node is assigned to exactly one **cohort group** (§4) that
determines where it may appear. The group assignments agree with
`SECTION_COHORT` (§8.0a):

| Node | Cohort group | `content` | class |
|---|---|---|---|
| `clause` | `section_body` | `section_title? (block+ \| (clause \| terms \| definitions \| floating_title)+)` | `mn-clause` |
| `annex` | `section_annex` | `section_title? block* (clause \| terms \| definitions \| references \| floating_title)*` | `mn-annex` |
| `content_section` | `section_front` | `section_title? block* content_section*` | `mn-content-section` |
| `abstract` | `section_front` | `section_title? block* content_section*` | `mn-abstract` |
| `foreword` | `section_front` | `section_title? block* content_section*` | `mn-foreword` |
| `introduction` | `section_front` | `section_title? block* content_section*` | `mn-introduction` |
| `acknowledgements` | `section_front` | `section_title? block* content_section*` | `mn-acknowledgements` |
| `terms` | `section_body` | `section_title? block* (terms \| definitions)*` | `mn-terms` |
| `definitions` | `section_body` | `section_title? (block \| definitions)+` | `mn-definitions` |
| `references` | `section_back` | `section_title? block* bibitem* references*` | `mn-references` |
| `bibitem` | *(no group — only inside `references`)* | *(empty atom)* | `mn-bibitem` |

**Strict clause XOR.** `clause` implements Isodoc's `Clause-Section` exactly: a
clause holds **either** a run of blocks (it is then a leaf) **or** a run of
subclauses (`clause` / `terms` / `definitions` / `floating_title`) — never both.
There are no hanging paragraphs in the numbered body hierarchy. The strictness
has a command-level consequence: inserting a subclause into a block-bearing
clause is only possible after the blocks are folded into a subclause first; the
`ensureSubclauseCapacity` accommodation performs that wrap in the same
transaction ([EditorCommands.spec.md](./EditorCommands.spec.md) §5).

**Annex placement.** `annex` is a **doc-level sibling**, not a child of
`sections` — `doc.content` places `annex*` after `sections` and before
`bibliography` (Isodoc root child order). Annexes do not nest inside each
other; their subclauses are `clause` / `terms` / `definitions` / `references` /
`floating_title`, preceded by optional prefatory blocks (`Annex-Section-Body`
is non-strict, unlike `Clause-Section`).

**`content_section` is Isodoc `content`.** The node's name is the grammar's
internal pattern name (`Content-Section`, reached from the `<content>`
element), not an XML element name: on export it serializes as a `<clause>`
element (§17.6). It is **front-matter only** (inside `preface`) — the generic
unnumbered clause — and the four named front-matter sections
(`abstract`/`foreword`/`introduction`/`acknowledgements`) nest it as
subclauses.

**Ordered `references` content.** `references` admits an exact ordered
sequence — optional prefatory blocks, then `bibitem` entries, then nested
`references` — matching Isodoc's `Bibliography-Section` rather than a free
interleave.

**Heading model.** Every section node's content expression begins with an
optional `section_title` child — the heading textblock. The `section_title`
renders through the section's content hole (`0` in `sectionToDOM`) automatically;
no special-cased rendering is needed. The heading is editable inline like any
other textblock and supports full inline markup (emphasis, links, etc.),
matching Metanorma Semantic XML's `<title>` child element (§17).

**Bibliography entries.** The `references` section node's content expression
permits `bibitem` atom nodes after the prefatory blocks. Each `bibitem` stores a
  `BibliographicItem` (from `@metanorma/relaton`, see
  [`README.spec.md`](../pkg/relaton/README.spec.md)) as a single JSON `item` attr
and renders as a compact summary via a NodeView. `bibitem` has no group
membership — it is insertable only inside `references` via a dedicated command,
not as a general block.

### 8.3 Block nodes

| Node | `content` | `toDOM` | `parseDOM` |
|---|---|---|---|
| `paragraph` | `inline*` | `['p', 0]` | `[{tag: 'p'}]` |
| `note` | `block+` | `['div', {class: CLASS.note}, 0]` | `[{tag: 'div.mn-note'}]` |
| `example` | `block+` | `['div', {class: CLASS.example}, 0]` | `[{tag: 'div.mn-example'}]` |
| `quote` | `block+` | `['blockquote', 0]` | `[{tag: 'blockquote'}]` |
| `review` | `block+` | `['div', {class: CLASS.review}, 0]` | `[{tag: 'div.mn-review'}]` |
| `admonition` | `block+` | `['div', {class: \`mn-admonition ${type}\`, 'data-type': type}, 0]` (function) | `[{tag: 'div.mn-admonition', getAttrs: el => ({ type: el.getAttribute('data-type') })}]` |
| `sourcecode` | `text*`, `code: true` | `['pre', {class: \`language-${language}\`}, ['code', 0]]` (function) | `[{tag: 'pre', getAttrs: el => ({ language: /language-(\S+)/.exec(el.className)?.[1] ?? null })}]` |
| `formula` | *(empty)* atom | `['div', {class: CLASS.formula, 'data-type': type, 'data-asciimath': asciimath, 'data-mathml': mathml, 'data-number': number}]` (function; no content slot; only the encoding selected by `type` is authoritative — see §17.2) | `[{tag: 'div.mn-formula', getAttrs: el => ({ type: el.getAttribute('data-type') ?? 'asciimath', asciimath: el.getAttribute('data-asciimath'), mathml: el.getAttribute('data-mathml'), number: el.getAttribute('data-number') })}]` |
| `floating_title` | `inline*` (no group — **groupless textblock**) | `['div', {class: CLASS.floatingTitle, 'data-id': id, 'data-depth': depth}, 0]` (function) | `[{tag: 'div.mn-floating-title', getAttrs: el => ({ id: el.getAttribute('data-id'), depth: Number(el.getAttribute('data-depth') ?? '1') })}]` |

`floating_title` is a **groupless textblock**: it has no PM group membership, so
it can appear only where a content expression names it explicitly — at the top
level of `sections`, and in the subclause branches of `clause` and `annex`
(§8.2). This mirrors Isodoc's `floating-title`, which is never a `BasicBlock`;
the editor's legal positions are in exact parity with Isodoc, so a converter
needs no positional coercion (§17.6).
| `section_title` | `inline*` (no group) | `['div', {class: CLASS.sectionTitle}, 0]` | `[{tag: 'div.mn-section-title'}]` |

**`sourcecode.code: true`.** The `sourcecode` node spec sets `code: true`, the
ProseMirror convention marking a textblock as a code block. This is what makes
`EditorState`'s code-context detection (`isInCode`) and the stock code-newline
command work inside `sourcecode`; the editor-commands package relies on it
(`EditorCommands.spec.md` §1.6.3).

### 8.4 List nodes

| Node | `group` | `content` | `toDOM` | `parseDOM` |
|---|---|---|---|---|
| `bullet_list` | `block` | `list_item+` | `['ul', 0]` | `[{tag: 'ul'}]` |
| `ordered_list` | `block` | `list_item+` | `['ol', attrs, 0]` where `attrs` contains `start` only when `order > 1` (function) | `[{tag: 'ol', getAttrs: el => ({ order: el.hasAttribute('start') ? Number(el.getAttribute('start')) : 1 })}]` |
| `list_item` | — | `block+` | `['li', 0]` | `[{tag: 'li'}]` |
| `dl` | `block` | `(dt dd)+` | `['dl', 0]` | `[{tag: 'dl'}]` |
| `dt` | — | `inline*` | `['dt', 0]` | `[{tag: 'dt'}]` |
| `dd` | — | `block+` | `['dd', 0]` | `[{tag: 'dd'}]` |

### 8.5 Table nodes

| Node | `content` | `toDOM` | `parseDOM` |
|---|---|---|---|
| `table` | `(table_head \| table_body \| table_foot)+`, `group: 'block'` | `['table', 0]` | `[{tag: 'table'}]` |
| `table_head` | `table_row+` | `['thead', 0]` | `[{tag: 'thead'}]` |
| `table_body` | `table_row+` | `['tbody', 0]` | `[{tag: 'tbody'}]` |
| `table_foot` | `table_row+` | `['tfoot', 0]` | `[{tag: 'tfoot'}]` |
| `table_row` | `table_cell+` | `['tr', 0]` | `[{tag: 'tr'}]` |
| `table_cell` | `block+` | `['td', {colspan, rowspan}, 0]` (function) | `[{tag: 'td'}, {tag: 'th'}]` (both map to `table_cell`) |

**Note.** The catalog has no `th` type; both `<td>` and `<th>` parse to
`table_cell`.

### 8.6 Media nodes

| Node | `content` | `atom`/leaf | `toDOM` | `parseDOM` |
|---|---|---|---|---|
| `figure` | `(image \| block)*`, `group: 'block'` | — | `['figure', {class: CLASS.figure, 'data-id': id}, 0]` (function) | `[{tag: 'figure'}]` |
| `image` | *(empty)* | atom, `draggable: true` | `['img', {src, alt, 'data-src': src}]` (function; **no content slot** — leaf) | `[{tag: 'img', getAttrs: el => ({ src: el.getAttribute('src'), alt: el.getAttribute('alt') })}]` |

### 8.7 Footnote nodes

| Node | `content` | inline? | `toDOM` | `parseDOM` |
|---|---|---|---|---|
| `footnotes` | `footnote_entry+` | no | `['section', {class: CLASS.footnotes}, 0]` | `[{tag: 'section.mn-footnotes'}, {tag: 'ol.mn-footnotes'}]` |
| `footnote_entry` | `block+` | no | `['div', {class: CLASS.footnoteEntry, 'data-id': id, 'data-number': number}, 0]` (function) | `[{tag: '.mn-footnote-entry', getAttrs: el => ({ id: el.getAttribute('data-id'), number: el.getAttribute('data-number') })}]` |
| `footnote_marker` | *(empty)* | **yes** (`group: 'inline'`, `inline: true`, atom) | `['sup', {class: CLASS.footnoteMarker, 'data-target': target}]` (function; no content slot) | `[{tag: 'sup.mn-footnote-marker', getAttrs: el => ({ target: el.getAttribute('data-target') })}]` |

### 8.8 Leaf inline nodes

| Node | `group` | `toDOM` | `parseDOM` |
|---|---|---|---|
| `text` | `inline` | *(built-in)* | *(built-in)* |
| `soft_break` | `inline`, `inline: true`, `atom: true` | `['br']` | `[{tag: 'br'}]` |
| `stem` | `inline`, `inline: true`, `atom: true` | `['span', {class: CLASS.stem, 'data-type': type, 'data-asciimath': asciimath, 'data-mathml': mathml}]` (function; no content slot; only the encoding selected by `type` is authoritative) | `[{tag: 'span.mn-stem', getAttrs: el => ({ type: el.getAttribute('data-type') ?? 'asciimath', asciimath: el.getAttribute('data-asciimath'), mathml: el.getAttribute('data-mathml') })}]` |

---

## 9. Mark specifications

Each entry contributes one key to the `marks` map. Unless noted, `toDOM` opens
with the mark tag and `0` (content hole), and `parseDOM` uses the tag.

### 9.1 Formatting marks

| Mark | `toDOM` | `parseDOM` |
|---|---|---|
| `emphasis` | `['em', 0]` | `[{tag: 'em'}, {tag: 'i'}]` |
| `strong` | `['strong', 0]` | `[{tag: 'strong'}, {tag: 'b'}]` |
| `subscript` | `['sub', 0]` | `[{tag: 'sub'}]` |
| `superscript` | `['sup', 0]` | `[{tag: 'sup'}]` |
| `code` | `['code', 0]` | `[{tag: 'code'}]` |
| `underline` | `['u', 0]` | `[{tag: 'u'}]` |
| `strike` | `['s', 0]` | `[{tag: 's'}, {tag: 'strike'}, {tag: 'del'}]` |
| `smallcap` | `['span', {class: CLASS.smallcap}, 0]` | `[{tag: 'span.mn-smallcap'}, {style: 'font-variant=small-caps'}]` |

### 9.2 Reference / semantic marks

| Mark | Attrs | `toDOM` | `parseDOM` |
|---|---|---|---|
| `link` | `href` | `['a', {href}, 0]` (function; omit attr when null) | `[{tag: 'a[href]', getAttrs: el => ({ href: el.getAttribute('href') })}]` |
| `xref` | `target` | `['a', {class: CLASS.xref, 'data-target': target}, 0]` (function) | `[{tag: 'a.mn-xref', getAttrs: el => ({ target: el.getAttribute('data-target') })}]` |
| `eref` | `cite` | `['cite', {class: CLASS.eref, 'data-cite': cite}, 0]` (function) | `[{tag: 'cite.mn-eref', getAttrs: el => ({ cite: el.getAttribute('data-cite') })}]` |
| `concept` | `ref`, `kind` | `['span', {class: CLASS.concept, 'data-ref': ref, 'data-kind': kind}, 0]` (function) | `[{tag: 'span.mn-concept', getAttrs: el => ({ ref: el.getAttribute('data-ref'), kind: el.getAttribute('data-kind') ?? 'xref' })}]` |
| `bcp14` | `type` | `['span', {class: CLASS.bcp14, 'data-type': type}, 0]` (function) | `[{tag: 'span.mn-bcp14', getAttrs: el => ({ type: el.getAttribute('data-type') })}]` |
| `span` | `class` | `['span', {class}, 0]` (function) | `[{tag: 'span[data-class]', getAttrs: el => ({ class: el.getAttribute('data-class') }), priority: 1}]` |

**`span` parse priority.** The generic `span` mark parses with low priority
(`priority: 1`) so that the more specific `span.mn-smallcap` / `span.mn-concept`
/ `span.mn-bcp14` rules win during HTML ingestion.

---

## 10. Schema assembly

```ts
import { Schema } from 'prosemirror-model';
import { metanormaNodes } from './nodes';
import { metanormaMarks } from './marks';

export const metanormaSchema = new Schema({
  nodes: metanormaNodes,
  marks: metanormaMarks,
});
```

`nodes` **must** contain exactly the 46 names in §3.1 (including `text`, which
ProseMirror requires). `marks` **must** contain exactly the 14 names in §3.2.
The spec order is not semantically significant but should follow the group order
in §3 for readability.

---

## 11. Public API (`index.ts`)

```ts
import type { Schema, NodeSpec, MarkSpec } from 'prosemirror-model';

/** The assembled schema. */
export const metanormaSchema: Schema;

/** Raw spec maps, for consumers that compose a modified schema. */
export const metanormaNodes: Record<string, NodeSpec>;
export const metanormaMarks: Record<string, MarkSpec>;

/** Convenience lookups derived from the schema. */
export const NODE_NAMES: readonly string[];   // 46 entries, in §3.1 order
export const MARK_NAMES: readonly string[];   // 14 entries, in §3.2 order

/** The CSS class emitted by every `toDOM`/`parseDOM` rule (§8.0). */
export const CLASS: { readonly doc: 'mn-doc'; /* …one key per emitting node/mark… */ };
export type ClassName = (typeof CLASS)[keyof typeof CLASS];

/** Section cohort metadata (§8.0a). */
export type SectionCohort = 'front' | 'body' | 'annex' | 'back';
export const SECTION_COHORT: Readonly<Record<string, SectionCohort>>;
/** No `'annex'` key — annexes are doc-level siblings, not container children (§8.0a). */
export const COHORT_CONTAINER: Readonly<Record<string, string>>;
export const DOC_CHILD_ORDER: readonly string[];
export const FRONT_TYPES: readonly string[];
export const BODY_TYPES: readonly string[];
export const ANNEX_TYPES: readonly string[];
export const BACK_TYPES: readonly string[];
export function sameCohort(a: string, b: string): boolean;

/** Runtime guard for image insertion (§6.1). */
export function assertValidImageAttrs(attrs: { src?: unknown }): asserts attrs is { src: string };
```

---

## 12. JSON round-trip (open attribute model)

A document is the JSON tree `{ type, attrs?, content?, marks?, text? }` (the
`MetanormaDocument` / `MetanormaMark` types,
`pkg/prosemirror-editor/types.ts`), with open `attrs` records. ProseMirror's
`Node.toJSON()` / `Mark.toJSON()` already emit exactly these fields, so the
round-trip contract reduces to:

1. **`nodeFromJSON`** accepts any well-formed `MetanormaDocument`. Unknown
   attributes on a node/mark are stored into that node/mark's `data` attribute
   (§6) so nothing is silently dropped.
2. **`toJSON`** of a node loaded from a `MetanormaDocument` reproduces the same
   `type`, the same typed attribute values, and the same extra keys (via
   `data`). `marks`, `content`, and `text` round-trip identically.
3. The 46 node names and 14 mark names in the schema are the editor-side
   vocabulary (§3). They are the editor's own naming of the covered
   document-model constructs — the `footnote` mark is absent in favour of the
   `footnote_marker` node (§3.2), and `stem` is an inline node rather than a
   mark (§3.1).

**Note.** Because `data` is itself a JSON object, deeply nested extra
attributes survive the round-trip. The module **must not** flatten `data` into
top-level attrs on output — `toJSON` emits typed attrs at the top level and
everything else under `data`, preserving the open-attribute shape.

---

## 13. TypeScript constraints

Inherits the root `tsconfig.json` (`strict`, `noImplicitAny`,
`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
`verbatimModuleSyntax`, `isolatedModules`):

- Use `import type` for all `prosemirror-model` type-only imports.
- `toDOM` functions that return conditional `DOMOutputSpec`s must avoid
  `undefined`-valued object properties (use conditional spreads or omit keys),
  because `exactOptionalPropertyTypes` forbids assigning `undefined` to
  optional props.
- `NodeSpec.attrs` values are `{ default: T }` objects; never annotate them as
  optional.

---

## 14. Acceptance criteria

1. `yarn workspace @metanorma/prosemirror-schema compile` succeeds with **zero**
   TypeScript errors under the repo tsconfig.
2. `metanormaSchema.spec.nodes` contains **exactly** the 46 names in §3.1 and
   `metanormaSchema.spec.marks` contains **exactly** the 14 names in §3.2
   (asserted by a unit test against `NODE_NAMES` / `MARK_NAMES`).
3. For every node type `T` with a typed attribute interface, constructing
   `metanormaSchema.nodeFromJSON({ type: T, attrs: {...all typed fields...} })`
   and calling `.toJSON()` reproduces each typed field value unchanged.
4. A representative `MetanormaDocument` containing one example of **each** node
   group and **each** mark round-trips through `nodeFromJSON` → `toJSON` with
   no loss of typed attributes and no loss of keys carried in `data`.
5. `metanormaSchema.nodeFromJSON(defaultDoc)` (§15) does not throw.
6. For each node and mark, `toDOM` then `parseDOM` recovers the stored
   attributes (render a node to a DOM node, parse it back, compare relevant
   attrs) — covered by a table-driven test.
7. `image` is **not** a member of the `block` group; `figure` is the only block
   whose content expression mentions `image`.
8. `table_cell` parses both `<td>` and `<th>`; `colspan`/`rowspan` default to 1.
9. `soft_break`, `footnote_marker`, and `stem` are inline atoms (`inline: true`,
   `atom: true`, `group: 'inline'`); all three may appear inside `paragraph`.
10. `assertValidImageAttrs({ src: '' })` throws; `assertValidImageAttrs({ src: 'x.png' })` does not.

---

## 15. Default document

For sanity checks and editor bootstrap:

```jsonc
{
  "type": "doc",
  "content": [
    {
      "type": "bibdata",
      "attrs": { "item": null }
    },
    {
      "type": "sections",
      "content": [
        {
          "type": "clause",
          "attrs": { "id": "_document_container" },
          "content": [
            { "type": "section_title" },
            { "type": "paragraph" }
          ]
        }
      ]
    }
  ]
}
```

An empty `paragraph` (no child `text` node) is used: `nodeFromJSON` fills it
with an empty text node as needed, producing an empty editable paragraph.

This satisfies `doc.content` = `(bibdata preface? sections? annex* bibliography? footnotes?)`.

---

## 16. Out of scope (v1)

Deferred and **not** required by this spec:

- Commands, keymaps, input rules, or any editor behaviour (this is a schema-only
  module).
- Collaborative editing / Yjs bindings.
- Math rendering for `formula` / `stem` (store attributes only).
- Syntax highlighting inside `sourcecode`.
- Table column resize / cell-merge UI helpers (`prosemirror-tables` integration).
- Enforcing `footnote_marker.target` ↔ `footnote_entry.id` referential integrity
  (the schema captures the ids; cross-validation is a higher-layer concern).
- Restricting `code` mark exclusivity (§7).

---

## 17. Conversion to Metanorma Semantic XML

As stated in §1.1, this schema covers a **subset** of the Metanorma document
model. It is designed for **unambiguous convertibility**: every document the
editor can produce must map to a single, well-defined Metanorma Semantic XML
structure — the authoring form that `metanorma-standoc` validates
(`isodoc-compile.rng`). A dedicated converter performs attribute/element
renames and structural reshapes (e.g. `cite` → `citeas`, `href` → `target`,
`number` → `reference`, the `section_title` child node → a `<title>`/`<name>`
child element, the doc-level `footnotes`/`footnote_entry`/`footnote_marker` split → a single inline
`<fn>` with body). Name and shape differences are **not** incompatibilities.
`<eref citeas>`, `<link target>`, and `<fn reference>` are direct renames of
the typed editor attrs (`cite`, `href`, `number`) — no invention involved.
Presentation XML is generated downstream from Semantic XML by the pipeline's
presentation transform; the editor never authors it.

Four dual-source-of-truth issues are resolved in this spec so that conversion
is unambiguous; §1.1 enumerates them (§17.1–§17.3 detail the first three):

### 17.1 `src` lives only on `image` (not `figure`)

`figure` carries no `src` attribute (§6.1). The image source is stored
exactly once, on the `image` child of the figure, so the two can never
disagree; a figure's image is always its `image` child node.

### 17.2 `formula` / `stem` carry a `type` discriminator

Both `formula` and `stem` declare a `type` attribute (enum: `'asciimath'` |
`'mathml'`, default `'asciimath'`). The `type` selects which encoding is
**authoritative** for conversion; the converter emits only that encoding
(Metanorma `<stem type="AsciiMath">` or `<stem type="MathML">` carries a single
encoding). The non-selected attribute may still be populated for editor-side
preview but is **ignored on export**, so parallel `asciimath` and `mathml`
attributes always have a defined winner.

### 17.3 `concept` carries a `kind` discriminator

Semantic-XML `<concept>` (isodoc) expresses its reference as a **choice of
child elements** — `<eref>` (bibliographic definition), `<xref>` (definition in
the current document), or `<termref>` (definition in a termbase). Each maps to a
different output element, so a single flat reference string cannot tell the
converter which one to emit.

The `concept` mark therefore declares a `kind` attribute (enum: `'eref'` |
`'xref'` | `'termref'`, default `'xref'`) alongside `ref` (§6.2, §9.2). `kind`
selects the XML child element; `ref` supplies the pointer value
(`<eref citeas>` / `<xref target>` / `<termref target>`). The default of
`'xref'` keeps export deterministic even when `kind` is unset, so the
internal-concept-definition case works without an explicit `kind`.

The fourth XML choice, `<erefstack>` (a stack of erefs), is **not supported** —
it is folded into `kind: 'eref'` (a single `<eref>`), which is the common case.
This is a known coverage gap, not an ambiguity.

### 17.4 Values the converter must invent (schema coverage gaps)

The following Metanorma Semantic XML values are **required** (or commonly
expected) but have **no typed slot** in this schema, so a converter must
synthesise a default on export. These are accepted limitations of the covered
subset, not ambiguities:

| XML target | Required? | Converter strategy |
|---|---|---|
| `<image mimetype="…">` | required | Infer from `src` `data:`-URL MIME prefix, else from filename extension, else a fallback constant. |
| `<image id="…">` | required | Synthesise a content GUID (the editor does not model `id` on `image`). |
| `<floating-title depth="…">` | required | Derive from heading level context, else a constant default. |
| `<review reviewer="…">` | required | Default placeholder (the editor does not model `reviewer`). |

### 17.5 Features not represented (dropped on import)

The following Metanorma features exist in the covered element families but have
**no representation** in this schema, so a Semantic-XML → editor import
**drops** them (and export cannot recreate them). Each is a known coverage gap:

| Feature | XML location | Status |
|---|---|---|
| Sourcecode callouts, annotations, `<name>` caption, line numbering (`linenums`) | `<sourcecode>` | dropped — schema models raw code text only |
| Table key/legend, table notes, column widths (`colgroup`), source citation | `<table>` | dropped — schema models head/body/foot rows only |
| Row-header cells (`<th>` inside `<tbody>`) | `<tr>` | dropped — single `table_cell` type; only header rows (via `table_head`/`<thead>`) are distinguished |
| List numbering style (`<ol type="…">`: roman/arabic/…) | `<ol>` | dropped — schema models `start` only |
| Cell alignment (`align`, `valign`) | `<td>`/`<th>` | dropped |
| Ordered-list `start`, section/block `obligation`, `unnumbered`, `number` override | various | carried via the `data` catch-all if present on import; not typed or editable |
| `executivesummary` (preface section type) | root `<preface>` | dropped — the front-matter vocabulary covers `abstract`/`foreword`/`introduction`/`acknowledgements`/`content_section` only |
| `appendix` (the strict annex-to-annex subclause) | `<annex>` children | dropped — `annex`'s subclause vocabulary is `clause`/`terms`/`definitions`/`references`/`floating_title` |
| `reference-clause` (the non-strict clause admitted inside `<bibliography>`) | `<bibliography>` | dropped — `bibliography` admits only `references` (strict variant) |
| Term-entry subtree (`term`, `preferred`, `admitted`, `deprecated`, `definition`, `termdocsource`, …) | `<terms>` | dropped — `terms` holds prefatory blocks and nested `terms`/`definitions` only; the term-entry elements have no typed nodes |
| Annex `inline-header` attribute | `<annex>` | carried via the `data` catch-all if present on import; not typed or editable |
| Doc-level `metanorma-extension`, `boilerplate`, `index`, `colophon` | root | dropped — `doc.content` admits only `bibdata`/`preface`/`sections`/`annex`/`bibliography`/`footnotes` |

### 17.6 Over-permissive content (coerced on export)

The schema's content expressions are intentionally **looser** than Metanorma XML
so the editor is ergonomic. A converter must normalise these on export (this is
coercion, not ambiguity — there is a single valid target):

- `table` permits head-only / multiple bodies; XML requires exactly one
  `<tbody>` (with optional `thead`/`tfoot`).
- `note`/`example`/`quote`/`review`/`admonition`/`dd` allow `block+`; XML
  restricts their bodies to paragraphs (with footnote) plus a limited subset.
- `content_section` serializes as a `<clause>` element — its name is the
  grammar's internal pattern name (`Content-Section`, reached from `<content>`),
  not an XML element name (§8.2).

`floating_title` is **not** a source of over-permissiveness: it is a groupless
textblock whose legal positions (§8.3) — `sections` top level and the subclause
branches of `clause` and `annex` — match Isodoc exactly, so no positional
coercion applies on export.

