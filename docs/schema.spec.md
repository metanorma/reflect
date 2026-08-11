# Metanorma Mirror — ProseMirror Schema Specification

This spec defines the ProseMirror schema module. Ignore the preexisting
`pkg/schema` subpackage and any prior ProseMirror usage in this repository —
this document supersedes them as the source of truth for the schema.

**Source of truth for the document model:**
`src/types.ts` of [`metanorma/metanorma-mirror-js`](https://github.com/metanorma/metanorma-mirror-js/blob/main/src/types.ts)
(commit on `main` at the time of writing). Every node name, mark name, and
attribute in this schema is derived directly from that file's exported
constants (`MARK_TYPES`, `STRUCTURAL_TYPES`, `SECTION_FRONT_TYPES`,
`SECTION_BODY_TYPES`, `SECTION_BACK_TYPES`, `BLOCK_TYPES`,
`LIST_TYPES`, `TABLE_TYPES`, `MEDIA_TYPES`, `FOOTNOTE_TYPES`,
`INLINE_ATOM_TYPES`, `LEAF_TYPES`)
and its attribute interfaces (`NodeAttrsByType`, `MarkAttrsByType`, `BaseAttrs`).

---

## 1. Purpose

Define a single `prosemirror-model` `Schema` whose node and mark vocabulary,
content model, attributes, and DOM serialization rules faithfully mirror the
**Metanorma Mirror** document model. The schema must:

1. Contain **exactly** the node types and mark types enumerated in `types.ts`
   (no more, no less).
2. Accept a `MirrorDocument` (the `MirrorNode` tree from `types.ts`) via
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
Metanorma Presentation XML without the converter having to guess between
competing representations of the same fact (no dual source of truth). Attribute
and element names in the schema need not match the XML names — a dedicated
converter performs those renames and structural reshapes. Where a Presentation
XML value is required but cannot be derived from anything the editor models
(e.g. `mimetype`, `reviewer`, `depth`), the converter may **invent** a default,
but such invention is a schema limitation, surfaced in §17.

Four dual-source-of-truth issues are resolved in this spec so that conversion is
unambiguous: `figure.src` lives only on the `image` child (§17.1); `formula` and
`stem` carry a `type` discriminator selecting the authoritative encoding
(§17.2); the `concept` mark carries a `kind` discriminator selecting the
reference-element type (§17.3); and footnote references use a single
`footnote_marker` node, with no competing `footnote` mark (§3.2).

---

## 2. Module layout

A new workspace package, distinct from the ignored `pkg/schema`:

```
pkg/prosemirror-schema/
├── package.json          ← name: "@metanorma/prosemirror-schema"
├── tsconfig.json         ← extends ../../tsconfig.json
├── index.ts              ← public exports (§11)
├── nodes.ts              ← nodeSpec map (§8)
├── marks.ts              ← markSpec map (§9)
├── attrs.ts              ← shared attribute helpers (§6)
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

## 3. Vocabulary (derived from `types.ts`)

### 3.1 Node types (46)

| Group constant | Members |
|---|---|
| `STRUCTURAL_TYPES` (5) | `doc`, `bibdata`, `preface`, `sections`, `bibliography` |
| `SECTION_FRONT_TYPES` (4) | `abstract`, `foreword`, `introduction`, `acknowledgements` |
| `SECTION_BODY_TYPES` (5) | `clause`, `annex`, `content_section`, `terms`, `definitions` |
| `SECTION_BACK_TYPES` (1) | `references` |
| `BIBITEM_TYPES` (1) | `bibitem` |
| `BLOCK_TYPES` (9) | `paragraph`, `note`, `admonition`, `example`, `sourcecode`, `formula`, `quote`, `review`, `floating_title` |
| `LIST_TYPES` (6) | `bullet_list`, `ordered_list`, `list_item`, `dl`, `dt`, `dd` |
| `TABLE_TYPES` (6) | `table`, `table_head`, `table_body`, `table_foot`, `table_row`, `table_cell` |
| `MEDIA_TYPES` (2) | `figure`, `image` |
| `FOOTNOTE_TYPES` (3) | `footnotes`, `footnote_marker`, `footnote_entry` |
| `INLINE_ATOM_TYPES` (1) | `stem` |
| `SECTION_TITLE_TYPES` (1) | `section_title` |
| `LEAF_TYPES` (2) | `text`, `soft_break` |

**Note.** `section_title` is a standalone textblock (content `inline*`) that
appears only as the optional leading child of a section node (§8.2). It is not
a member of any PM content group (neither `block` nor `inline`), so it cannot be
inserted as a general block or appear in arbitrary containers — only the section
content expressions reference it (§8.2).

**Note.** `floating_title` is listed in `BLOCK_TYPES` and is modelled as a
**block textblock** with `content: "inline*"` and a `depth` attribute (§8.3). It
carries `id` and `depth` (not `SectionAttrs`). Its inline content is the heading
text, so it supports full inline markup (emphasis, links, etc.).

### 3.2 Mark types (14)

`emphasis`, `strong`, `subscript`, `superscript`, `code`, `underline`,
`strike`, `smallcap`, `link`, `xref`, `eref`, `concept`, `bcp14`, `span`.

**Note.** Footnote references are modelled by the `footnote_marker` **inline
node** (§3.1, §8.7), which directly mirrors the inline Presentation-XML `<fn>`
element (body co-located at the reference site). There is **no** `footnote` mark:
an earlier draft carried both representations, which created a dual source of
truth for the same fact — a converter could not decide which was authoritative.
The mark has been removed to keep conversion unambiguous (§1.1).

---

## 4. ProseMirror group design

`types.ts` groups nodes for *classification*; ProseMirror groups drive the
*content model*. The mapping below is a design decision (the source file does
not prescribe content expressions). Six groups are introduced:

| PM group | Members | Notes |
|---|---|---|
| `inline` | `text`, `soft_break`, `footnote_marker`, `stem` | Inline content of paragraphs / terms. |
| `block` | `paragraph`, `note`, `admonition`, `example`, `sourcecode`, `formula`, `quote`, `review`, `bullet_list`, `ordered_list`, `dl`, `table`, `figure`, `floating_title` | General block-level children of sections, list items, cells, etc. Deliberately **excludes** `image`, `list_item`, `dt`, `dd`, `table_*` parts, `footnote_entry`, and `section_title` (contextual only — `section_title` appears solely as the optional leading child of a section node). |
| `section_front` | `abstract`, `foreword`, `introduction`, `acknowledgements` | Front-matter section nodes (inside `preface`). |
| `section_body` | `clause`, `annex`, `content_section`, `terms`, `definitions` | Body section nodes (inside `sections`). Nestable: a body section's content expression may reference `section_body` for nesting. |
| `section_back` | `references` | Back-matter section nodes (inside `bibliography`). |

The three cohort groups (`section_front`, `section_body`, `section_back`) are
the structural backbone of the document ordering: each container's content
expression admits only its own cohort's section types (§8.1), so the schema
itself enforces that front-matter sections appear only in `preface`, body
sections only in `sections`, and back-matter sections only in `bibliography`.
The companion cohort metadata (§8.0a) maps each type to its cohort and drives
command-level routing.

---

## 5. Content model overview

| Node | Content expression | Rationale |
|---|---|---|
| `doc` | `(bibdata preface? sections? bibliography? footnotes?)` | Root: required bibdata (document metadata), optional front matter, body, back matter, footnotes container. |
| `preface` | `(section_front \| block)*` | Front-matter sections (abstract/foreword/…) plus blocks. |
| `sections` | `(section_body \| block)*` | Main body. |
| `bibliography` | `references+` | Back matter; `references` is the sole `section_back` member. |
| `bibdata` | *(empty)* | Atom: document-level bibliographic metadata. Stores a `BibliographicItem` (from `@metanorma/relaton`) as a single JSON `item` attr. Required first child of `doc` (§8.1). |
| `bibitem` | *(empty)* | Atom: a single bibliography entry. Stores a `BibliographicItem` as a single JSON `item` attr. Permitted only inside `references` sections (§8.2). |
| `clause` | `section_title? (clause \| block)*` | Clauses nest clauses + blocks; optional leading heading textblock. |
| `annex` | `section_title? (annex \| clause \| block)*` | Annexes may contain annexes, clauses, blocks; optional leading heading. |
| `content_section` | `section_title? (section_body \| block)*` | Generic nestable container; optional leading heading. |
| `abstract`, `foreword`, `introduction`, `acknowledgements` | `section_title? block+` | Front-matter leaves: optional heading + blocks only, no nesting. |
| `terms`, `definitions` | `section_title? (clause \| block)*` | Term/definition containers may nest `clause`; optional leading heading. |
| `references` | `section_title? (clause \| bibitem \| block)*` | Bibliography entries (often nested clauses); optional leading heading. |
| `section_title` | `inline*` | Standalone textblock: the heading of its parent section. Appears only as the optional leading child of a section node (no group membership). |
| `floating_title` | `inline*` | Block textblock; free-standing unnumbered heading. Carries `id` and `depth` attrs. |
| `paragraph` | `inline*` | |
| `note`, `example`, `quote`, `review` | `block+` | Container blocks. |
| `admonition` | `block+` | Container; `type` attr classifies it. |
| `sourcecode` | `text*` | Raw text content (a `code_block`-style node). |
| `formula` | *(empty)* | Atom leaf; math in `asciimath` attr (when `type="asciimath"`) or `mathml` attr (when `type="mathml"`). |
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

`types.ts` uses open interfaces: `BaseAttrs` has `[key: string]: unknown`, and
nodes/marks not present in `NodeAttrsByType`/`MarkAttrsByType` fall back to
`Record<string, unknown>` (`AttrsFor`, `MirrorMark.attrs`). ProseMirror
attributes must be **declared** with a default, so this schema adopts the
following rules:

1. **Typed attributes** listed in `NodeAttrsByType` / `MarkAttrsByType` are
   declared explicitly with `default: null` for every optional field (mirroring
   the `?` optionality in the source).
2. **Catch-all `data` attribute.** Every node and mark declares a
   `data: { default: {} }` attribute that captures the open index-signature
   keys (`[key: string]: unknown`) for round-tripping. `data` is **serialized
   to JSON but never rendered to the DOM**; it preserves arbitrary attributes
   the typed interfaces permit.
3. **Numeric defaults.** `table_cell`'s `colspan`/`rowspan` default to `1`
   (not `null`) because they are real table-spanning values; `ordered_list`
   adds `order: { default: 1 }` (permitted by its open attr set).
4. **`null` vs `undefined`.** All optional attrs use `default: null`. Under the
   repo's `exactOptionalPropertyTypes`, JSON produced by `toJSON()` uses `null`,
   never `undefined`.

### 6.1 Attribute map by node

| Node | Declared attributes (beyond `data`) | Source interface |
|---|---|---|
| `clause`, `annex`, `content_section`, `abstract`, `foreword`, `introduction`, `acknowledgements`, `terms`, `definitions`, `references` | `id`, `number` | `SectionAttrs` (= `BaseAttrs`; `title` is no longer an attribute — the heading is a `section_title` child node, §8.2) |
| `floating_title` | `id`, `depth` (default `1`) | Metanorma `<floating-title>` (RequiredId + required `depth` int + TextElement inline content) |
| `section_title` | *(none beyond `data`)* | open — the heading text is inline content, not an attribute |
| `preface`, `sections`, `bibliography` | `id`, `number` | `BaseAttrs` |
| `bibdata` | `item` | open — a `BibliographicItem` JSON object (`@metanorma/relaton`). Default `null`. |
| `bibitem` | `item` | open — a `BibliographicItem` JSON object (`@metanorma/relaton`). Default `null`. |
| `formula` | `id`, `number`, `type` (enum `asciimath` \| `mathml`, default `"asciimath"`), `asciimath`, `mathml` | `FormulaAttrs` |
| `stem` | `type` (enum `asciimath` \| `mathml`, default `"asciimath"`), `asciimath`, `mathml` | open |
| `figure` | `id`, `number`, `title` | `FigureAttrs` (the `src` attr is dropped — `src` lives only on the `image` child, avoiding a dual source of truth; see §17.1) |
| `table` | `id`, `number`, `title` | `TableAttrs` |
| `table_cell` | `colspan` (default `1`), `rowspan` (default `1`) | `TableCellAttrs` |
| `image` | `src` (default `""`), `alt` | `ImageAttrs` (`src` required in TS → default `""` + runtime validation) |
| `admonition` | `type` | `AdmonitionAttrs` |
| `sourcecode` | `language` | `SourcecodeAttrs` (the `text` field of `SourcecodeAttrs` is dropped — the code text lives in the node's `text*` content, not an attribute; carrying both would be a dual source of truth on conversion, §1.1) |
| `ordered_list` | `order` (default `1`) | open (`Record<string, unknown>`) |
| `footnote_entry` | `id`, `number` | open |
| `footnote_marker` | `id`, `target` | open |
| `paragraph`, `note`, `example`, `quote`, `review`, `bullet_list`, `list_item`, `dl`, `dt`, `dd`, `table_head`, `table_body`, `table_foot`, `table_row`, `footnotes`, `soft_break` | *(none beyond `data`)* | open |

**`image.src` validation.** Because `ImageAttrs.src` is required in TypeScript
but ProseMirror needs a default, `src` defaults to `""` and the module exports a
runtime guard `assertValidImageAttrs(attrs)` used by input rules / paste handling
to reject empty `src`.

### 6.2 Attribute map by mark

| Mark | Declared attributes (beyond `data`) | Source |
|---|---|---|
| `link` | `href` | `LinkMarkAttrs` (`target` is dropped — Presentation-XML `<link>` carries a single required `target` URL, and `href` is that URL; a second URL-shaped attr would be a dual source of truth, §1.1) |
| `xref` | `target` | `XrefMarkAttrs` |
| `eref` | `cite` | open — the external citation key |
| `concept` | `ref`, `kind` (enum `"eref" \| "xref" \| "termref"`, default `"xref"`) | open — `ref` is the concept reference; `kind` discriminates the Presentation-XML child element emitted on export (`<eref>` / `<xref>` / `<termref>`). Without `kind`, a flat `ref` cannot tell the converter which reference type to emit and conversion is ambiguous (§1.1). `erefstack` (a stack of erefs, the fourth XML choice) is not supported — folded into `eref`. |
| `bcp14` | `type` | open — BCP 14 keyword (e.g. `"MUST"`) |
| `span` | `class` | open — generic span class |
| `emphasis`, `strong`, `subscript`, `superscript`, `code`, `underline`, `strike`, `smallcap` | *(none beyond `data`)* | boolean-style marks |

---

## 7. `inclusive` / `excludes` conventions

| Mark | `inclusive` | Notes |
|---|---|---|
| `emphasis`, `strong`, `subscript`, `superscript`, `code`, `underline`, `strike`, `smallcap` | `true` (default) | Formatting continues while typing. |
| `link`, `xref`, `eref`, `concept`, `bcp14`, `span` | `false` | Reference/semantic marks do **not** extend on typing. |

`code` is modelled as **non-exclusive** (it may co-exist with other marks) to
match the open mark model of `types.ts`; no `excludes` is set on any mark.
**Implementer note.** If strict inline-code behaviour is later required, set
`excludes` on `code` to the full mark-name list. Out of scope for v1.

---

## 8. Node specifications

Each entry below contributes one key to the `nodes` map passed to `new Schema`.
`text` uses ProseMirror's built-in via `schema.text` — declare it explicitly
with `group: "inline"` so `inline*` content resolves.

### 8.0 The `CLASS` contract

Every CSS class emitted by a `toDOM` (and matched by the corresponding
`parseDOM` rule) lives in a single typed const `CLASS`, exported from
`@metanorma/prosemirror-schema` (`classes.ts`) and documented in §11.

```ts
export const CLASS = {
  doc: "mn-doc", preface: "mn-preface", /* …sections… */
  bibdata: "mn-bibdata", bibitem: "mn-bibitem",
  sectionTitle: "mn-section-title",
  note: "mn-note", formula: "mn-formula", figure: "mn-figure",
  smallcap: "mn-smallcap", xref: "mn-xref", /* … */
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

The three cohort groups (`section_front`, `section_body`, `section_back`)
drive the container content expressions (§8.1): each container admits only the
section types in its cohort. The companion metadata in `cohorts.ts` maps each
section type name to its cohort and is the single source of truth consulted by
commands and the toolbar. It is exported from the public API (§11).

```ts
/** The three document regions a section type may belong to. */
export type SectionCohort = "front" | "body" | "back";

/** Section type name → its cohort. Authoritative mapping (§8.2 group assignments must agree). */
export const SECTION_COHORT: Readonly<Record<string, SectionCohort>>;

/** Cohort → the container node name it belongs in (`front`→`preface`, `body`→`sections`, `back`→`bibliography`). */
export const COHORT_CONTAINER: Readonly<Record<SectionCohort, string>>;

/** Doc-level child ordering, matching `doc.content` = `(bibdata preface? sections? bibliography? footnotes?)`. */
export const DOC_CHILD_ORDER: readonly string[];

/** Front-matter section types, in canonical (document-appearance) order. */
export const FRONT_TYPES: readonly string[];
/** Body section types, in canonical order. */
export const BODY_TYPES: readonly string[];
/** Back-matter section types. */
export const BACK_TYPES: readonly string[];

/** Whether two section types are in the same cohort. */
export function sameCohort(a: string, b: string): boolean;
```

**`DOC_CHILD_ORDER`** is consulted by the `ensureContainer` helper
([EditorCommands.spec.md](./EditorCommands.spec.md) §5) to compute the correct
insertion position when a container must be created.

**`sameCohort()`** is the design hook for future same-cohort type-change support
(e.g. converting a `clause` into an `annex`): the schema content expressions
already permit same-cohort replacements (shared group, compatible content);
the guard is the command layer's responsibility. Cross-cohort conversion is
deliberately not offered — the user creates a new section instead.

### 8.1 Structural nodes

| Node | Spec essentials |
|---|---|
| `doc` | `content: "(bibdata preface? sections? bibliography? footnotes?)"`; `toDOM: ["div", {class: CLASS.doc}, 0]`; no `parseDOM`. |
| `bibdata` | `content: ""`; `atom: true`; `attrs: { item: { default: null }, ...DATA_ATTR }`; `toDOM: ["div", {class: CLASS.bibdata}]`; no `parseDOM` (doc-level, created by default doc / loader). |
| `preface` | `content: "(section_front \| block)*"`; `toDOM: ["section", {class: CLASS.preface}, 0]`; `parseDOM: [{tag: "section.mn-preface"}]`. |
| `sections` | `content: "(section_body \| block)*"`; `toDOM: ["section", {class: CLASS.sections}, 0]`; `parseDOM: [{tag: "section.mn-sections"}]`. |
| `bibliography` | `content: "references+"`; `toDOM: ["section", {class: CLASS.bibliography}, 0]`; `parseDOM: [{tag: "section.mn-bibliography"}]`. |

### 8.2 Section nodes

All section nodes share `toDOM`/`parseDOM` shape (a `<section>` whose class is
`mn-<type>` and whose `id`/`number` attrs are mirrored to `data-*`):

```ts
function sectionToDOM(cls: string) {
  return (node: Node) => {
    const attrs: Record<string, string> = { class: cls };
    if (node.attrs.id !== null) attrs["data-id"] = node.attrs.id;
    if (node.attrs.number !== null) attrs["data-number"] = node.attrs.number;
    return ["section", attrs, 0] as DOMOutputSpec;
  };
}
// parseDOM: [{ tag: `section.${cls}`, getAttrs(el) { return { id: el.getAttribute("data-id"), number: el.getAttribute("data-number") } } }]
```

Each section node is assigned to exactly one **cohort group** (§4) that
determines which container it may appear in. The group assignments agree with
`SECTION_COHORT` (§8.0a):

| Node | Cohort group | `content` | class |
|---|---|---|---|
| `clause` | `section_body` | `section_title? (clause \| block)*` | `mn-clause` |
| `annex` | `section_body` | `section_title? (annex \| clause \| block)*` | `mn-annex` |
| `content_section` | `section_body` | `section_title? (section_body \| block)*` | `mn-content-section` |
| `abstract` | `section_front` | `section_title? block+` | `mn-abstract` |
| `foreword` | `section_front` | `section_title? block+` | `mn-foreword` |
| `introduction` | `section_front` | `section_title? block+` | `mn-introduction` |
| `acknowledgements` | `section_front` | `section_title? block+` | `mn-acknowledgements` |
| `terms` | `section_body` | `section_title? (clause \| block)*` | `mn-terms` |
| `definitions` | `section_body` | `section_title? (clause \| block)*` | `mn-definitions` |
| `references` | `section_back` | `section_title? (bibitem \| block)*` | `mn-references` |
| `bibitem` | *(no group — only inside `references`)* | *(empty atom)* | `mn-bibitem` |

**Heading model.** Every section node's content expression begins with an
optional `section_title` child — the heading textblock. The `section_title`
renders through the section's content hole (`0` in `sectionToDOM`) automatically;
no special-cased rendering is needed. The heading is editable inline like any
other textblock and supports full inline markup (emphasis, links, etc.),
matching Metanorma Presentation XML's `<title>` child element (§17).

**Bibliography entries.** The `references` section node's content expression
permits `bibitem` atom nodes alongside blocks. Each `bibitem` stores a
`BibliographicItem` (from `@metanorma/relaton`) as a single JSON `item` attr
and renders as a compact summary via a NodeView. `bibitem` has no group
membership — it is insertable only inside `references` via a dedicated command,
not as a general block.

### 8.3 Block nodes

| Node | `content` | `toDOM` | `parseDOM` |
|---|---|---|---|
| `paragraph` | `inline*` | `["p", 0]` | `[{tag: "p"}]` |
| `note` | `block+` | `["div", {class: CLASS.note}, 0]` | `[{tag: "div.mn-note"}]` |
| `example` | `block+` | `["div", {class: CLASS.example}, 0]` | `[{tag: "div.mn-example"}]` |
| `quote` | `block+` | `["blockquote", 0]` | `[{tag: "blockquote"}]` |
| `review` | `block+` | `["div", {class: CLASS.review}, 0]` | `[{tag: "div.mn-review"}]` |
| `admonition` | `block+` | `["div", {class: \`mn-admonition ${type}\`, "data-type": type}, 0]` (function) | `[{tag: "div.mn-admonition", getAttrs: el => ({ type: el.getAttribute("data-type") })}]` |
| `sourcecode` | `text*`, `code: true` | `["pre", {class: \`language-${language}\`}, ["code", 0]]` (function) | `[{tag: "pre", getAttrs: el => ({ language: /language-(\S+)/.exec(el.className)?.[1] ?? null })}]` |
| `formula` | *(empty)* atom | `["div", {class: CLASS.formula, "data-type": type, "data-asciimath": asciimath, "data-mathml": mathml, "data-number": number}]` (function; no content slot; only the encoding selected by `type` is authoritative — see §17.2) | `[{tag: "div.mn-formula", getAttrs: el => ({ type: el.getAttribute("data-type") ?? "asciimath", asciimath: el.getAttribute("data-asciimath"), mathml: el.getAttribute("data-mathml"), number: el.getAttribute("data-number") })}]` |
| `floating_title` | `inline*`, `group: "block"` | `["div", {class: CLASS.floatingTitle, "data-id": id, "data-depth": depth}, 0]` (function) | `[{tag: "div.mn-floating-title", getAttrs: el => ({ id: el.getAttribute("data-id"), depth: Number(el.getAttribute("data-depth") ?? "1") })}]` |
| `section_title` | `inline*` (no group) | `["div", {class: CLASS.sectionTitle}, 0]` | `[{tag: "div.mn-section-title"}]` |

**`sourcecode.code: true`.** The `sourcecode` node spec sets `code: true`, the
ProseMirror convention marking a textblock as a code block. This is what makes
`EditorState`'s code-context detection (`isInCode`) and the stock code-newline
command work inside `sourcecode`; the editor-commands package relies on it
(`EditorCommands.spec.md` §1.6.3).

### 8.4 List nodes

| Node | `group` | `content` | `toDOM` | `parseDOM` |
|---|---|---|---|---|
| `bullet_list` | `block` | `list_item+` | `["ul", 0]` | `[{tag: "ul"}]` |
| `ordered_list` | `block` | `list_item+` | `["ol", attrs, 0]` where `attrs` contains `start` only when `order > 1` (function) | `[{tag: "ol", getAttrs: el => ({ order: el.hasAttribute("start") ? Number(el.getAttribute("start")) : 1 })}]` |
| `list_item` | — | `block+` | `["li", 0]` | `[{tag: "li"}]` |
| `dl` | `block` | `(dt dd)+` | `["dl", 0]` | `[{tag: "dl"}]` |
| `dt` | — | `inline*` | `["dt", 0]` | `[{tag: "dt"}]` |
| `dd` | — | `block+` | `["dd", 0]` | `[{tag: "dd"}]` |

### 8.5 Table nodes

| Node | `content` | `toDOM` | `parseDOM` |
|---|---|---|---|
| `table` | `(table_head \| table_body \| table_foot)+`, `group: "block"` | `["table", 0]` | `[{tag: "table"}]` |
| `table_head` | `table_row+` | `["thead", 0]` | `[{tag: "thead"}]` |
| `table_body` | `table_row+` | `["tbody", 0]` | `[{tag: "tbody"}]` |
| `table_foot` | `table_row+` | `["tfoot", 0]` | `[{tag: "tfoot"}]` |
| `table_row` | `table_cell+` | `["tr", 0]` | `[{tag: "tr"}]` |
| `table_cell` | `block+` | `["td", {colspan, rowspan}, 0]` (function) | `[{tag: "td"}, {tag: "th"}]` (both map to `table_cell`) |

**Note.** The catalog has no `th` type; both `<td>` and `<th>` parse to
`table_cell`.

### 8.6 Media nodes

| Node | `content` | `atom`/leaf | `toDOM` | `parseDOM` |
|---|---|---|---|---|
| `figure` | `(image \| block)*`, `group: "block"` | — | `["figure", {class: CLASS.figure, "data-id": id}, 0]` (function) | `[{tag: "figure"}]` |
| `image` | *(empty)* | atom, `draggable: true` | `["img", {src, alt, "data-src": src}]` (function; **no content slot** — leaf) | `[{tag: "img", getAttrs: el => ({ src: el.getAttribute("src"), alt: el.getAttribute("alt") })}]` |

### 8.7 Footnote nodes

| Node | `content` | inline? | `toDOM` | `parseDOM` |
|---|---|---|---|---|
| `footnotes` | `footnote_entry+` | no | `["section", {class: CLASS.footnotes}, 0]` | `[{tag: "section.mn-footnotes"}, {tag: "ol.mn-footnotes"}]` |
| `footnote_entry` | `block+` | no | `["div", {class: CLASS.footnoteEntry, "data-id": id, "data-number": number}, 0]` (function) | `[{tag: ".mn-footnote-entry", getAttrs: el => ({ id: el.getAttribute("data-id"), number: el.getAttribute("data-number") })}]` |
| `footnote_marker` | *(empty)* | **yes** (`group: "inline"`, `inline: true`, atom) | `["sup", {class: CLASS.footnoteMarker, "data-target": target}]` (function; no content slot) | `[{tag: "sup.mn-footnote-marker", getAttrs: el => ({ target: el.getAttribute("data-target") })}]` |

### 8.8 Leaf inline nodes

| Node | `group` | `toDOM` | `parseDOM` |
|---|---|---|---|
| `text` | `inline` | *(built-in)* | *(built-in)* |
| `soft_break` | `inline`, `inline: true`, `atom: true` | `["br"]` | `[{tag: "br"}]` |
| `stem` | `inline`, `inline: true`, `atom: true` | `["span", {class: CLASS.stem, "data-type": type, "data-asciimath": asciimath, "data-mathml": mathml}]` (function; no content slot; only the encoding selected by `type` is authoritative) | `[{tag: "span.mn-stem", getAttrs: el => ({ type: el.getAttribute("data-type") ?? "asciimath", asciimath: el.getAttribute("data-asciimath"), mathml: el.getAttribute("data-mathml") })}]` |

---

## 9. Mark specifications

Each entry contributes one key to the `marks` map. Unless noted, `toDOM` opens
with the mark tag and `0` (content hole), and `parseDOM` uses the tag.

### 9.1 Formatting marks

| Mark | `toDOM` | `parseDOM` |
|---|---|---|
| `emphasis` | `["em", 0]` | `[{tag: "em"}, {tag: "i"}]` |
| `strong` | `["strong", 0]` | `[{tag: "strong"}, {tag: "b"}]` |
| `subscript` | `["sub", 0]` | `[{tag: "sub"}]` |
| `superscript` | `["sup", 0]` | `[{tag: "sup"}]` |
| `code` | `["code", 0]` | `[{tag: "code"}]` |
| `underline` | `["u", 0]` | `[{tag: "u"}]` |
| `strike` | `["s", 0]` | `[{tag: "s"}, {tag: "strike"}, {tag: "del"}]` |
| `smallcap` | `["span", {class: CLASS.smallcap}, 0]` | `[{tag: "span.mn-smallcap"}, {style: "font-variant=small-caps"}]` |

### 9.2 Reference / semantic marks

| Mark | Attrs | `toDOM` | `parseDOM` |
|---|---|---|---|
| `link` | `href` | `["a", {href}, 0]` (function; omit attr when null) | `[{tag: "a[href]", getAttrs: el => ({ href: el.getAttribute("href") })}]` |
| `xref` | `target` | `["a", {class: CLASS.xref, "data-target": target}, 0]` (function) | `[{tag: "a.mn-xref", getAttrs: el => ({ target: el.getAttribute("data-target") })}]` |
| `eref` | `cite` | `["cite", {class: CLASS.eref, "data-cite": cite}, 0]` (function) | `[{tag: "cite.mn-eref", getAttrs: el => ({ cite: el.getAttribute("data-cite") })}]` |
| `concept` | `ref`, `kind` | `["span", {class: CLASS.concept, "data-ref": ref, "data-kind": kind}, 0]` (function) | `[{tag: "span.mn-concept", getAttrs: el => ({ ref: el.getAttribute("data-ref"), kind: el.getAttribute("data-kind") ?? "xref" })}]` |
| `bcp14` | `type` | `["span", {class: CLASS.bcp14, "data-type": type}, 0]` (function) | `[{tag: "span.mn-bcp14", getAttrs: el => ({ type: el.getAttribute("data-type") })}]` |
| `span` | `class` | `["span", {class}, 0]` (function) | `[{tag: "span[data-class]", getAttrs: el => ({ class: el.getAttribute("data-class") }), priority: 1}]` |

**`span` parse priority.** The generic `span` mark parses with low priority
(`priority: 1`) so that the more specific `span.mn-smallcap` / `span.mn-concept`
/ `span.mn-bcp14` rules win during HTML ingestion.

---

## 10. Schema assembly

```ts
import { Schema } from "prosemirror-model";
import { metanormaNodes } from "./nodes";
import { metanormaMarks } from "./marks";

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
import type { Schema, NodeSpec, MarkSpec } from "prosemirror-model";

/** The assembled schema. */
export const metanormaSchema: Schema;

/** Raw spec maps, for consumers that compose a modified schema. */
export const metanormaNodes: Record<string, NodeSpec>;
export const metanormaMarks: Record<string, MarkSpec>;

/** Convenience lookups derived from the schema. */
export const NODE_NAMES: readonly string[];   // 46 entries, in §3.1 order
export const MARK_NAMES: readonly string[];   // 14 entries, in §3.2 order

/** The CSS class emitted by every `toDOM`/`parseDOM` rule (§8.0). */
export const CLASS: { readonly doc: "mn-doc"; /* …one key per emitting node/mark… */ };
export type ClassName = (typeof CLASS)[keyof typeof CLASS];

/** Section cohort metadata (§8.0a). */
export type SectionCohort = "front" | "body" | "back";
export const SECTION_COHORT: Readonly<Record<string, SectionCohort>>;
export const COHORT_CONTAINER: Readonly<Record<SectionCohort, string>>;
export const DOC_CHILD_ORDER: readonly string[];
export const FRONT_TYPES: readonly string[];
export const BODY_TYPES: readonly string[];
export const BACK_TYPES: readonly string[];
export function sameCohort(a: string, b: string): boolean;

/** Runtime guard for image insertion (§6.1). */
export function assertValidImageAttrs(attrs: { src?: unknown }): asserts attrs is { src: string };
```

---

## 12. JSON round-trip (`MirrorNode` compatibility)

A `MirrorNode` is `{ type, attrs?, content?, marks?, text? }`, and a
`MirrorMark` is `{ type, attrs? }`. ProseMirror's `Node.toJSON()` /
`Mark.toJSON()` already emit exactly these fields, so the round-trip contract
reduces to:

1. **`nodeFromJSON`** accepts any well-formed `MirrorDocument`. Unknown
   attributes on a node/mark are stored into that node/mark's `data` attribute
   (§6) so nothing is silently dropped.
2. **`toJSON`** of a node loaded from a `MirrorDocument` reproduces the same
   `type`, the same typed attribute values, and the same extra keys (via
   `data`). `marks`, `content`, and `text` round-trip identically.
3. The 46 node names and 14 mark names in the schema are the editor-side
   vocabulary. They are derived from (but not identical to) the `MirrorNodeType`
   union and `MirrorMarkType` constant of `types.ts`: the `footnote` mark is
   dropped in favour of the `footnote_marker` node (§3.2), and `stem` is
   reclassified from mark to node (§3.1).

**Note.** Because `data` is itself a JSON object, deeply nested extra
attributes survive the round-trip. The module **must not** flatten `data` into
top-level attrs on output — `toJSON` emits typed attrs at the top level and
everything else under `data`, matching the open-attribute shape of `types.ts`.

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
4. A representative `MirrorDocument` containing one example of **each** node
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
   `atom: true`, `group: "inline"`); all three may appear inside `paragraph`.
10. `assertValidImageAttrs({ src: "" })` throws; `assertValidImageAttrs({ src: "x.png" })` does not.

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

This satisfies `doc.content` = `(bibdata preface? sections? bibliography? footnotes?)`.

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

## 17. Conversion to Metanorma Presentation XML

As stated in §1.1, this schema covers a **subset** of the Metanorma document
model. It is designed for **unambiguous convertibility**: every document the
editor can produce must map to a single, well-defined Metanorma Presentation XML
structure. A dedicated converter performs attribute/element renames and
structural reshapes (e.g. `cite` → `citeas`, `href` → `target`, `number` →
`reference`, the `section_title` child node → a `<title>`/`<name>` child
element, the doc-level `footnotes`/`footnote_entry`/`footnote_marker` split → a single inline
`<fn>` with body). Name and shape differences are **not** incompatibilities.

Two dual-source-of-truth issues are resolved in this spec so that conversion is
unambiguous:

### 17.1 `src` lives only on `image` (not `figure`)

`figure` no longer carries a `src` attribute (§6.1). The image source is stored
exactly once, on the `image` child of the figure. This removes the previous
ambiguity where `figure.src` and `figure > image.src` could disagree with no
way to decide which is authoritative. A figure's image is always its `image`
child node.

### 17.2 `formula` / `stem` carry a `type` discriminator

Both `formula` and `stem` now declare a `type` attribute (enum: `"asciimath"` |
`"mathml"`, default `"asciimath"`). The `type` selects which encoding is
**authoritative** for conversion; the converter emits only that encoding
(Metanorma `<stem type="AsciiMath">` or `<stem type="MathML">` carries a single
encoding). The non-selected attribute may still be populated for editor-side
preview but is **ignored on export**. This removes the previous ambiguity where
parallel, simultaneously-populated `asciimath` and `mathml` attributes had no
defined winner.

### 17.3 `concept` carries a `kind` discriminator

Presentation-XML `<concept>` (isodoc) expresses its reference as a **choice of
child elements** — `<eref>` (bibliographic definition), `<xref>` (definition in
the current document), or `<termref>` (definition in a termbase). Each maps to a
different output element, so a single flat reference string cannot tell the
converter which one to emit.

The `concept` mark therefore declares a `kind` attribute (enum: `"eref"` |
`"xref"` | `"termref"`, default `"xref"`) alongside `ref` (§6.2, §9.2). `kind`
selects the XML child element; `ref` supplies the pointer value
(`<eref citeas>` / `<xref target>` / `<termref target>`). The default of
`"xref"` keeps export deterministic even when `kind` is unset, so the
internal-concept-definition case works without an explicit `kind`.

The fourth XML choice, `<erefstack>` (a stack of erefs), is **not supported** —
it is folded into `kind: "eref"` (a single `<eref>`), which is the common case.
This is a known coverage gap, not an ambiguity.

### 17.4 Values the converter must invent (schema coverage gaps)

The following Metanorma Presentation XML values are **required** (or commonly
expected) but have **no typed slot** in this schema, so a converter must
synthesise a default on export. These are accepted limitations of the covered
subset, not ambiguities:

| XML target | Required? | Converter strategy |
|---|---|---|
| `<image mimetype="…">` | required | Infer from `src` `data:`-URL MIME prefix, else from filename extension, else a fallback constant. |
| `<image id="…">` | required | Synthesise a content GUID (the editor does not model `id` on `image`). |
| `<floating-title depth="…">` | required | Derive from heading level context, else a constant default. |
| `<review reviewer="…">` | required | Default placeholder (the editor does not model `reviewer`). |
| `<eref citeas="…">`, `<link target="…">`, `<fn reference="…">` | required | Direct rename of the editor attr (`cite`, `href`, `number`). |

### 17.5 Features not represented (dropped on import)

The following Metanorma features exist in the covered element families but have
**no representation** in this schema, so a Presentation-XML → editor import
**drops** them (and export cannot recreate them). Each is a known coverage gap:

| Feature | XML location | Status |
|---|---|---|
| Sourcecode callouts, annotations, `<name>` caption, line numbering (`linenums`) | `<sourcecode>` | dropped — schema models raw code text only |
| Table key/legend, table notes, column widths (`colgroup`), source citation | `<table>` | dropped — schema models head/body/foot rows only |
| Row-header cells (`<th>` inside `<tbody>`) | `<tr>` | dropped — single `table_cell` type; only header rows (via `table_head`/`<thead>`) are distinguished |
| List numbering style (`<ol type="…">`: roman/arabic/…) | `<ol>` | dropped — schema models `start` only |
| Cell alignment (`align`, `valign`) | `<td>`/`<th>` | dropped |
| Ordered-list `start`, section/block `obligation`, `unnumbered`, `inline-header`, `number` override | various | carried via the `data` catch-all if present on import; not typed or editable |

### 17.6 Over-permissive content (coerced on export)

The schema's content expressions are intentionally **looser** than Metanorma XML
so the editor is ergonomic. A converter must normalise these on export (this is
coercion, not ambiguity — there is a single valid target):

- `table` permits head-only / multiple bodies; XML requires exactly one
  `<tbody>` (with optional `thead`/`tfoot`).
- `note`/`example`/`quote`/`review`/`admonition`/`dd` allow `block+`; XML
  restricts their bodies to paragraphs (with footnote) plus a limited subset.
- `abstract`/`foreword`/`introduction`/`acknowledgements` use `block+`; XML
  models them as `Content-Section` (`block*, clause*`) — the converter
  serialises their block children as paragraphs/clauses as appropriate.

