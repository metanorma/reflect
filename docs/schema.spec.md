# Metanorma Mirror — ProseMirror Schema Specification

This spec defines the ProseMirror schema module. Ignore the preexisting
`pkg/schema` subpackage and any prior ProseMirror usage in this repository —
this document supersedes them as the source of truth for the schema.

**Spec version:** 1

**Source of truth for the document model:**
`src/types.ts` of [`metanorma/metanorma-mirror-js`](https://github.com/metanorma/metanorma-mirror-js/blob/main/src/types.ts)
(commit on `main` at the time of writing). Every node name, mark name, and
attribute in this schema is derived directly from that file's exported
constants (`MARK_TYPES`, `STRUCTURAL_TYPES`, `SECTION_TYPES`, `BLOCK_TYPES`,
`LIST_TYPES`, `TABLE_TYPES`, `MEDIA_TYPES`, `FOOTNOTE_TYPES`, `LEAF_TYPES`)
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

> The implementer may choose a different package path, but the **public
> exports** (§11) and the schema contents must match this spec exactly.

### 2.1 Dependencies

| Package | Version | Purpose |
|---|---|---|
| `prosemirror-model` | `^1.22.0` | `Schema`, `NodeSpec`, `MarkSpec`, `DOMOutputSpec` |

No other runtime dependencies. The package has **zero** DOM dependency at
schema- definition time (`toDOM`/`parseDOM` describe structure only).

---

## 3. Vocabulary (derived from `types.ts`)

### 3.1 Node types (42)

| Group constant | Members |
|---|---|
| `STRUCTURAL_TYPES` (4) | `doc`, `preface`, `sections`, `bibliography` |
| `SECTION_TYPES` (10) | `clause`, `annex`, `content_section`, `abstract`, `foreword`, `introduction`, `acknowledgements`, `terms`, `definitions`, `references` |
| `BLOCK_TYPES` (8) | `paragraph`, `note`, `admonition`, `example`, `sourcecode`, `formula`, `quote`, `review` |
| `LIST_TYPES` (6) | `bullet_list`, `ordered_list`, `list_item`, `dl`, `dt`, `dd` |
| `TABLE_TYPES` (6) | `table`, `table_head`, `table_body`, `table_foot`, `table_row`, `table_cell` |
| `MEDIA_TYPES` (2) | `figure`, `image` |
| `FOOTNOTE_TYPES` (3) | `footnotes`, `footnote_marker`, `footnote_entry` |
| `LEAF_TYPES` (3) | `text`, `soft_break`, `floating_title` |

> `floating_title` is listed in `LEAF_TYPES` but carries `SectionAttrs` in
> `NodeAttrsByType`. It is modelled as a **block leaf** whose visible text lives
> in its `title` attribute (§8.4).

### 3.2 Mark types (16)

`emphasis`, `strong`, `subscript`, `superscript`, `code`, `underline`,
`strike`, `smallcap`, `link`, `xref`, `eref`, `footnote`, `concept`,
`bcp14`, `span`.

---

## 4. ProseMirror group design

`types.ts` groups nodes for *classification*; ProseMirror groups drive the
*content model*. The mapping below is a design decision (the source file does
not prescribe content expressions). Three groups are introduced:

| PM group | Members | Notes |
|---|---|---|
| `inline` | `text`, `soft_break`, `footnote_marker` | Inline content of paragraphs / terms. |
| `block` | `paragraph`, `note`, `admonition`, `example`, `sourcecode`, `formula`, `quote`, `review`, `bullet_list`, `ordered_list`, `dl`, `table`, `figure`, `floating_title` | General block-level children of sections, list items, cells, etc. Deliberately **excludes** `image`, `list_item`, `dt`, `dd`, `table_*` parts, and `footnote_entry` (contextual only). |
| `section` | `clause`, `annex`, `content_section`, `abstract`, `foreword`, `introduction`, `acknowledgements`, `terms`, `definitions`, `references` | Nestable section nodes. |

---

## 5. Content model overview

| Node | Content expression | Rationale |
|---|---|---|
| `doc` | `(preface? sections? bibliography? footnotes?)` | Root: optional front matter, body, back matter, footnotes container. |
| `preface` | `(section \| block)*` | Front-matter sections (abstract/foreword/…) plus blocks. |
| `sections` | `(section \| block)*` | Main body. |
| `bibliography` | `(section \| block)*` | Back matter; `references` is in the `section` group. |
| `clause` | `(clause \| block)*` | Clauses nest clauses + blocks. |
| `annex` | `(annex \| clause \| block)*` | Annexes may contain annexes, clauses, blocks. |
| `content_section` | `(section \| block)*` | Generic nestable container. |
| `abstract`, `foreword`, `introduction`, `acknowledgements` | `block+` | Front-matter leaves: blocks only, no nesting. |
| `terms`, `definitions` | `(clause \| block)*` | Term/definition containers may nest `clause`. |
| `references` | `(clause \| block)*` | Bibliography entries (often nested clauses). |
| `floating_title` | *(empty)* | Leaf; text in `title` attr. |
| `paragraph` | `inline*` | |
| `note`, `example`, `quote`, `review` | `block+` | Container blocks. |
| `admonition` | `block+` | Container; `type` attr classifies it. |
| `sourcecode` | `text*` | Raw text content (a `code_block`-style node). |
| `formula` | *(empty)* | Atom leaf; math in attrs. |
| `stem` | *(empty)* | Inline atom leaf; inline-formula math in attrs (`asciimath`/`mathml`). |
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
| `clause`, `annex`, `content_section`, `abstract`, `foreword`, `introduction`, `acknowledgements`, `terms`, `definitions`, `references`, `floating_title` | `id`, `number`, `title` | `SectionAttrs` (extends `BaseAttrs`) |
| `preface`, `sections`, `bibliography` | `id`, `number` | `BaseAttrs` |
| `formula` | `id`, `number`, `asciimath`, `mathml`, `math_text` | `FormulaAttrs` |
| `stem` | `asciimath`, `mathml` | open |
| `figure` | `id`, `number`, `title`, `src` | `FigureAttrs` |
| `table` | `id`, `number`, `title` | `TableAttrs` |
| `table_cell` | `colspan` (default `1`), `rowspan` (default `1`) | `TableCellAttrs` |
| `image` | `src` (default `""`), `alt` | `ImageAttrs` (`src` required in TS → default `""` + runtime validation) |
| `admonition` | `type` | `AdmonitionAttrs` |
| `sourcecode` | `text`, `language` | `SourcecodeAttrs` |
| `ordered_list` | `order` (default `1`) | open (`Record<string, unknown>`) |
| `footnote_entry` | `id`, `number` | open |
| `footnote_marker` | `id`, `target` | open |
| `paragraph`, `note`, `example`, `quote`, `review`, `bullet_list`, `list_item`, `dl`, `dt`, `dd`, `table_head`, `table_body`, `table_foot`, `table_row`, `footnotes`, `soft_break` | *(none beyond `data`)* | open |

> **`image.src` validation.** Because `ImageAttrs.src` is required in TypeScript
> but ProseMirror needs a default, `src` defaults to `""` and the module exports
> a runtime guard `assertValidImageAttrs(attrs)` used by input rules / paste
> handling to reject empty `src`.

### 6.2 Attribute map by mark

| Mark | Declared attributes (beyond `data`) | Source |
|---|---|---|
| `link` | `href`, `target` | `LinkMarkAttrs` |
| `xref` | `target` | `XrefMarkAttrs` |
| `eref` | `cite` | open — the external citation key |
| `footnote` | `id` | open — references `footnote_entry.id` |
| `concept` | `ref` | open — concept reference |
| `bcp14` | `type` | open — BCP 14 keyword (e.g. `"MUST"`) |
| `span` | `class` | open — generic span class |
| `emphasis`, `strong`, `subscript`, `superscript`, `code`, `underline`, `strike`, `smallcap` | *(none beyond `data`)* | boolean-style marks |

---

## 7. `inclusive` / `excludes` conventions

| Mark | `inclusive` | Notes |
|---|---|---|
| `emphasis`, `strong`, `subscript`, `superscript`, `code`, `underline`, `strike`, `smallcap` | `true` (default) | Formatting continues while typing. |
| `link`, `xref`, `eref`, `footnote`, `concept`, `bcp14`, `span` | `false` | Reference/semantic marks do **not** extend on typing. |

`code` is modelled as **non-exclusive** (it may co-exist with other marks) to
match the open mark model of `types.ts`; no `excludes` is set on any mark.
> Implementer note: if strict inline-code behaviour is later required, set
> `excludes` on `code` to the full mark-name list. Out of scope for v1.

---

## 8. Node specifications

Each entry below contributes one key to the `nodes` map passed to `new Schema`.
`text` uses ProseMirror's built-in via `schema.text` — declare it explicitly
with `group: "inline"` so `inline*` content resolves.

### 8.1 Structural nodes

| Node | Spec essentials |
|---|---|
| `doc` | `content: "(preface? sections? bibliography? footnotes?)"`; `toDOM: ["div", {class: "mn-doc"}, 0]`; no `parseDOM`. |
| `preface` | `content: "(section \| block)*"`; `toDOM: ["section", {class: "mn-preface"}, 0]`; `parseDOM: [{tag: "section.mn-preface"}]`. |
| `sections` | `content: "(section \| block)*"`; `toDOM: ["section", {class: "mn-sections"}, 0]`; `parseDOM: [{tag: "section.mn-sections"}]`. |
| `bibliography` | `content: "(section \| block)*"`; `toDOM: ["section", {class: "mn-bibliography"}, 0]`; `parseDOM: [{tag: "section.mn-bibliography"}]`. |

### 8.2 Section nodes (`group: "section"`)

All section nodes share `toDOM`/`parseDOM` shape (a `<section>` whose class is
`mn-<type>` and whose `id`/`number` attrs are mirrored to `data-*`):

```ts
function sectionToDOM(cls: string) {
  return (node: Node) => ["section", {
    class: cls,
    "data-id": node.attrs.id ?? undefined,
    "data-number": node.attrs.number ?? undefined,
  }, 0] as DOMOutputSpec;
}
// parseDOM: [{ tag: `section.${cls}`, getAttrs(el) { return { id: el.getAttribute("data-id"), number: el.getAttribute("data-number") } } }]
```

| Node | `content` | class |
|---|---|---|
| `clause` | `(clause \| block)*` | `mn-clause` |
| `annex` | `(annex \| clause \| block)*` | `mn-annex` |
| `content_section` | `(section \| block)*` | `mn-content-section` |
| `abstract` | `block+` | `mn-abstract` |
| `foreword` | `block+` | `mn-foreword` |
| `introduction` | `block+` | `mn-introduction` |
| `acknowledgements` | `block+` | `mn-acknowledgements` |
| `terms` | `(clause \| block)*` | `mn-terms` |
| `definitions` | `(clause \| block)*` | `mn-definitions` |
| `references` | `(clause \| block)*` | `mn-references` |

### 8.3 Block nodes

| Node | `content` | `toDOM` | `parseDOM` |
|---|---|---|---|
| `paragraph` | `inline*` | `["p", 0]` | `[{tag: "p"}]` |
| `note` | `block+` | `["div", {class: "note"}, 0]` | `[{tag: "div.note"}]` |
| `example` | `block+` | `["div", {class: "example"}, 0]` | `[{tag: "div.example"}]` |
| `quote` | `block+` | `["blockquote", 0]` | `[{tag: "blockquote"}]` |
| `review` | `block+` | `["div", {class: "review"}, 0]` | `[{tag: "div.review"}]` |
| `admonition` | `block+` | `["div", {class: `admonition ${type}`, "data-type": type}, 0]` (function) | `[{tag: "div.admonition", getAttrs: el => ({ type: el.getAttribute("data-type") })}]` |
| `sourcecode` | `text*` | `["pre", {class: `language-${language}`}, ["code", 0]]` (function) | `[{tag: "pre", getAttrs: el => ({ language: /language-(\S+)/.exec(el.className)?.[1] ?? null })}]` |
| `formula` | *(empty)* atom | `["div", {class: "formula", "data-asciimath": asciimath, "data-mathml": mathml, "data-number": number}, 0]` (function) | `[{tag: "div.formula", getAttrs: el => ({ asciimath: el.getAttribute("data-asciimath"), mathml: el.getAttribute("data-mathml"), number: el.getAttribute("data-number") })}]` |
| `stem` | *(empty)* inline atom | `["span", {class: "stem", "data-asciimath": asciimath, "data-mathml": mathml}]` (function; no content slot) | `[{tag: "span.stem", getAttrs: el => ({ asciimath: el.getAttribute("data-asciimath"), mathml: el.getAttribute("data-mathml") })}]` |
| `floating_title` | *(empty)* atom, `group: "block"` | `["div", {class: "floating-title", "data-id": id}, title ?? ""]` (function) | `[{tag: ".floating-title", getAttrs: el => ({ title: el.textContent, id: el.getAttribute("data-id") })}]` |

### 8.4 List nodes

| Node | `group` | `content` | `toDOM` | `parseDOM` |
|---|---|---|---|---|
| `bullet_list` | `block` | `list_item+` | `["ul", 0]` | `[{tag: "ul"}]` |
| `ordered_list` | `block` | `list_item+` | `["ol", {start: order > 1 ? order : undefined}, 0]` (function) | `[{tag: "ol", getAttrs: el => ({ order: el.hasAttribute("start") ? Number(el.getAttribute("start")) : 1 })}]` |
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

> The catalog has no `th` type; both `<td>` and `<th>` parse to `table_cell`.

### 8.6 Media nodes

| Node | `content` | `atom`/leaf | `toDOM` | `parseDOM` |
|---|---|---|---|---|
| `figure` | `(image \| block)*`, `group: "block"` | — | `["figure", {class: "figure", "data-id": id}, 0]` (function) | `[{tag: "figure"}]` |
| `image` | *(empty)* | atom, `draggable: true` | `["img", {src, alt, "data-src": src}]` (function; **no content slot** — leaf) | `[{tag: "img", getAttrs: el => ({ src: el.getAttribute("src"), alt: el.getAttribute("alt") })}]` |

### 8.7 Footnote nodes

| Node | `content` | inline? | `toDOM` | `parseDOM` |
|---|---|---|---|---|
| `footnotes` | `footnote_entry+` | no | `["section", {class: "footnotes"}, 0]` | `[{tag: "section.footnotes"}, {tag: "ol.footnotes"}]` |
| `footnote_entry` | `block+` | no | `["div", {class: "footnote-entry", "data-id": id, "data-number": number}, 0]` (function) | `[{tag: ".footnote-entry", getAttrs: el => ({ id: el.getAttribute("data-id"), number: el.getAttribute("data-number") })}]` |
| `footnote_marker` | *(empty)* | **yes** (`group: "inline"`, `inline: true`, atom) | `["sup", {class: "footnote-marker", "data-target": target}, 0]` (function) | `[{tag: "sup.footnote-marker", getAttrs: el => ({ target: el.getAttribute("data-target") })}]` |

### 8.8 Leaf inline nodes

| Node | `group` | `toDOM` | `parseDOM` |
|---|---|---|---|
| `text` | `inline` | *(built-in)* | *(built-in)* |
| `soft_break` | `inline`, `inline: true`, `atom: true` | `["br"]` | `[{tag: "br"}]` |

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
| `smallcap` | `["span", {class: "smallcap"}, 0]` | `[{tag: "span.smallcap"}, {style: "font-variant=small-caps"}]` |

### 9.2 Reference / semantic marks

| Mark | Attrs | `toDOM` | `parseDOM` |
|---|---|---|---|
| `link` | `href`, `target` | `["a", {href, target}, 0]` (function; omit attrs when null) | `[{tag: "a[href]", getAttrs: el => ({ href: el.getAttribute("href"), target: el.getAttribute("target") })}]` |
| `xref` | `target` | `["a", {class: "xref", "data-target": target}, 0]` (function) | `[{tag: "a.xref", getAttrs: el => ({ target: el.getAttribute("data-target") })}]` |
| `eref` | `cite` | `["cite", {class: "eref", "data-cite": cite}, 0]` (function) | `[{tag: "cite.eref", getAttrs: el => ({ cite: el.getAttribute("data-cite") })}]` |
| `footnote` | `id` | `["sup", {class: "footnote", "data-id": id}, 0]` (function) | `[{tag: "sup.footnote", getAttrs: el => ({ id: el.getAttribute("data-id") })}]` |
| `concept` | `ref` | `["span", {class: "concept", "data-ref": ref}, 0]` (function) | `[{tag: "span.concept", getAttrs: el => ({ ref: el.getAttribute("data-ref") })}]` |
| `bcp14` | `type` | `["span", {class: "bcp14", "data-type": type}, 0]` (function) | `[{tag: "span.bcp14", getAttrs: el => ({ type: el.getAttribute("data-type") })}]` |
| `span` | `class` | `["span", {class}, 0]` (function) | `[{tag: "span[data-class]", getAttrs: el => ({ class: el.getAttribute("data-class") }), priority: 1}]` |

> **`span` parse priority.** The generic `span` mark parses with low priority
> (`priority: 1`) so that the more specific `span.smallcap` /
> `span.concept` / `span.bcp14` rules win during HTML ingestion.

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

`nodes` **must** contain exactly the 42 names in §3.1 (including `text`, which
ProseMirror requires). `marks` **must** contain exactly the 16 names in §3.2.
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
export const NODE_NAMES: readonly string[];   // 42 entries, in §3.1 order
export const MARK_NAMES: readonly string[];   // 16 entries, in §3.2 order

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
3. The 42 node names and 16 mark names in the schema are **exactly** the
   members of the `MirrorNodeType` union and `MirrorMarkType` constant.

> Because `data` is itself a JSON object, deeply nested extra attributes survive
> the round-trip. The module **must not** flatten `data` into top-level attrs on
> output — `toJSON` emits typed attrs at the top level and everything else under
> `data`, matching the open-attribute shape of `types.ts`.

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
2. `metanormaSchema.spec.nodes` contains **exactly** the 42 names in §3.1 and
   `metanormaSchema.spec.marks` contains **exactly** the 16 names in §3.2
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
9. `soft_break` and `footnote_marker` are inline atoms (`inline: true`,
   `atom: true`, `group: "inline"`); both may appear inside `paragraph`.
10. `assertValidImageAttrs({ src: "" })` throws; `assertValidImageAttrs({ src: "x.png" })` does not.

---

## 15. Default document

For sanity checks and editor bootstrap:

```jsonc
{
  "type": "doc",
  "content": [
    {
      "type": "sections",
      "content": [
        {
          "type": "clause",
          "attrs": { "id": "_document_container", "title": null },
          "content": [
            { "type": "paragraph", "content": [{ "type": "text", "text": "" }] }
          ]
        }
      ]
    }
  ]
}
```

This satisfies `doc.content` = `(preface? sections? bibliography? footnotes?)`.

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
