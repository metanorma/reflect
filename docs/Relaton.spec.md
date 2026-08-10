# Metanorma Relaton — Bibliographic Model Specification

This spec defines the package providing a deliberate-subset Relaton
bibliographic data model for the Metanorma editor. It is consumed by the schema
(`bibdata` / `bibitem` node attrs), the editor (`eref` citation resolution,
NodeView summaries), and the GUI (document title display).

**Spec version:** 1

**Spec dependencies:** [`schema.spec.md`](./schema.spec.md) v5

**Scope.** This package owns the `BibliographicItem` TypeScript type, pure
derivation helpers (`citeas`, `label`, `primaryDocid`), and a document walker
(`collectBibliographyItems`). It has **no ProseMirror dependency** and **no
XML/YAML parsing** — the editor's only serialization format is ProseMirror
JSON (`.mn.json`).

---

## 1. Purpose

Provide a single, shared bibliographic model that all Relaton-data consumers in
the editor import, so the `BibliographicItem` shape, citation-key derivation,
and display-label logic are defined once with zero duplication.

### 1.1 Deliberate-subset principle

The full Relaton `BibliographicItem` (relaton-bib Ruby gem, expressed in
`lib/metanorma/validate/biblio.rng`) is deeply nested and recursive: organisation
subdivisions recurse as organisations; contributors carry multiple affiliations
with their own contact arrays; there are ~50 relation types and ~20 date types.
This package models a **pragmatic subset** sufficient for the editor's current
coverage. Omitted fields are not needed yet; the type is designed to extend
incrementally without breaking existing serialised documents.

### 1.2 No XML

The editor's only serialization format is ProseMirror JSON. There is no
Semantic-XML or Presentation-XML import or export path in this editor, and none
is planned. Relaton XML parsing/serialization is therefore out of scope. If an
XML interop path is added in the future, it will live in a separate converter
module, not in this package.

### 1.3 No off-the-shelf JS implementation

Relaton is a Ruby-only ecosystem (`relaton-bib`, `relaton`, `relaton-render`,
flavor gems). No JavaScript or TypeScript port exists. The closest JS library,
`citation-js`, targets CSL-JSON (the Citation Style Language world), not
Relaton's model; adapting it would be more work than writing this subset. The
helpers here are small pure functions, self-contained and headlessly testable.

---

## 2. The `BibliographicItem` type

The central type, modelling a bibliographic description of a document. Used for
document metadata (`bibdata`), bibliography entries (`bibitem`), and citation
resolution (`eref` picker).

### 2.1 `TypedTitle`

| Field | Type | Description |
|---|---|---|
| `type` | `string` | Title variant. Common: `"main"` (default), `"alternative"`, `"original"`, `"subtitle"`, `"unofficial"`. |
| `language` | `string \| null` | ISO 639-2 language code, e.g. `"en"`. |
| `script` | `string \| null` | ISO 15924 script code, e.g. `"Latn"`. |
| `content` | `string` | The title text. |

Mirrors Relaton `<title type="…" language="…" script="…">`.

### 2.2 `DocId`

| Field | Type | Description |
|---|---|---|
| `type` | `string` | Identifier scheme, e.g. `"ISO"`, `"urn"`, `"DOI"`. |
| `id` | `string` | The identifier string, e.g. `"ISO 17301-1:2021"`. |
| `primary` | `boolean` | Whether this is the primary citation identifier. |
| `scope` | `string \| null` | Scope qualifier (part, format), or `null`. |

Mirrors Relaton `<docidentifier type="…" scope="…" primary="…">`.

### 2.3 `Contributor`, `Person`, `Organization`

```
Contributor { role: string, entity: Person | Organization }
Person      { name: PersonName }
PersonName  { completename: string|null, surname: string|null, given: string|null }
Organization { name: string, abbreviation: string|null }
```

- `role` is from a controlled vocabulary: `author`, `publisher`, `editor`,
  `translator`, `adapter`, `performer`, `realizer`, `distributor`, `owner`,
  `authorizer`, `enabler`, `subject`.
- Person names: either `completename` (pre-formatted) or decomposed into
  `surname` / `given`.
- Organisation subdivision recursion is flattened to a single `name` + optional
  `abbreviation` for the v1 subset.
- The `<BibliographicItemForm>` presents `contributor` as a **repeating list**:
  each row has a role `<select>` (from the controlled vocabulary above), an
  entity-type toggle (Organization ↔ Person), a name field, and a remove button.
  Two "Add" buttons (organization / person) append new entries. This matches the
  common Metanorma document pattern of multiple contributors (e.g. an ISO
  standard typically has a publisher organization, one or more author
  organizations, and sometimes individual editors).

### 2.4 `BibDate`

| Field | Type | Description |
|---|---|---|
| `type` | `string` | Lifecycle phase. Common: `published`, `issued`, `circulated`, `updated`, `obsoleted`, `confirmed`. |
| `on` | `string \| null` | Point date (ISO 8601: `YYYY`, `YYYY-MM`, `YYYY-MM-DD`). |
| `from` | `string \| null` | Range start. |
| `to` | `string \| null` | Range end. |

### 2.5 `DocStatus`

| Field | Type | Description |
|---|---|---|
| `stage` | `string \| null` | Stage code (SDO-specific), e.g. `"60"`. |
| `substage` | `string \| null` | Substage code, e.g. `"00"`. |
| `iteration` | `string \| null` | Iteration within the current stage. |

### 2.6 `Copyright`

| Field | Type | Description |
|---|---|---|
| `from` | `string \| null` | Start year. |
| `owner` | `Organization` | Owner organisation. |

### 2.7 `BibliographicItem` (composite)

| Field | Type | Default |
|---|---|---|
| `type` | `string \| null` | `null` |
| `title` | `TypedTitle[]` | `[]` |
| `docid` | `DocId[]` | `[]` |
| `contributor` | `Contributor[]` | `[]` |
| `date` | `BibDate[]` | `[]` |
| `status` | `DocStatus \| null` | `null` |
| `language` | `string[]` | `[]` |
| `script` | `string[]` | `[]` |
| `edition` | `string \| null` | `null` |
| `copyright` | `Copyright \| null` | `null` |
| `abstract` | `string \| null` | `null` |

`emptyBibliographicItem()` returns a fresh item with all defaults.

---

## 3. Pure derivation helpers

These functions contain no runtime state and no ProseMirror dependency.

### 3.1 `primaryDocid(item) → DocId | null`

Returns the `docid` whose `primary` flag is `true`. If none is flagged, returns
the first `docid` (Relaton convention). Returns `null` when there are no
docids.

### 3.2 `citeas(item) → string | null`

Returns the citation key — the primary docid's `id` string. This is the value
stored in `eref` marks' `cite` attribute and used by the converter for
`<eref citeas="…">`. Returns `null` when there is no primary docid.

There is no separate stored `citeas` field; it is always derived.

### 3.3 `mainTitle(item) → TypedTitle | null`

Prefers a title with `type: "main"`; falls back to the first title; returns
`null` when there are no titles.

### 3.4 `formatContributor(contributor) → string`

Persons render as `"Surname, Given"` (or `completename` when undecomposed).
Organisations render as their name.

### 3.5 `primaryAuthor(item) → Contributor | null`

Returns the first contributor with `role: "author"`, or the first contributor
of any role, or `null`.

### 3.6 `label(item) → string`

A compact display label for dropdowns and NodeView summaries:

- If the item has a primary docid and a title: `"[ISO 17301-1:2021] Rice model"`.
- If no docid but a title: `"Rice model"`.
- If no docid and no title: the first contributor's formatted name, or
  `"(untitled)"`.

This is a display label, not a fully-rendered citation. A future
`relaton-render`-style formatter would produce the formatted reference string
for export rendering; that is out of scope for v1.

---

## 4. `collectBibliographyItems(doc) → BibliographicItem[]`

Walks a ProseMirror document (JSON or live node) and collects all
`BibliographicItem` values from `bibdata` and `bibitem` nodes.

### 4.1 Signature

```ts
function collectBibliographyItems(doc: unknown): BibliographicItem[]
```

### 4.2 Zero-PM-dependency design

The `doc` parameter is typed `unknown` so this package does not need
`prosemirror-model` as a dependency. The function narrows structurally: a valid
PM node JSON is a plain object with a string `type` and optional `content`
array. Non-node-shaped input yields `[]`.

### 4.3 Collection order

The document's `bibdata` node (first child of `doc`) is collected first,
followed by every `bibitem` node in document order. This ordering ensures the
self-document's metadata is available for `eref` resolution alongside
bibliography entries.

### 4.4 No deduplication

The returned array may contain items with the same `citeas` key (e.g. if a
bibliography entry duplicates the document's own `bibdata`). Deduplication is
the caller's responsibility — the eref picker should prefer the first match.

### 4.5 Attr extraction

Both `bibdata` and `bibitem` nodes store the `BibliographicItem` as a single
JSON attr named `item`. The walker spot-checks that the four array-typed fields
(`title`, `docid`, `contributor`, `date`) are arrays before accepting the value,
so malformed attrs are silently skipped rather than crashing the helpers.

---

## 5. Package layout

```
pkg/relaton/
  index.ts      — public API re-exports
  types.ts      — BibliographicItem + component types + emptyBibliographicItem
  helpers.ts    — citeas, label, primaryDocid, mainTitle, formatContributor, primaryAuthor
  collect.ts    — collectBibliographyItems
  package.json  — @metanorma/relaton, zero deps
  tsconfig.json — extends ../../tsconfig.json
```

Compile with `yarn workspace @metanorma/relaton compile`.

---

## 6. Consumers

| Consumer | What it uses |
|---|---|
| `@metanorma/prosemirror-schema` | `BibliographicItem` type (for `bibdata`/`bibitem` attr documentation) |
| `@metanorma/prosemirror-editor` | `label()` / `citeas()` for NodeView summaries |
| `@metanorma/toolbar` | `BibliographicItem` type for `<BibliographicItemForm>`, `collectBibliographyItems` + `label` for eref picker |
| `editor-gui` | `BibliographicItem` type + `mainTitle` for sidebar title display |

---

## 7. Test plan

Headless unit tests (no DOM, no ProseMirror):

| Test | Input | Expected |
|---|---|---|
| `citeas` — explicit primary | item with 2 docids, first `primary: false`, second `primary: true` | second docid's `id` |
| `citeas` — implicit primary | item with 1 docid, `primary: false` | first docid's `id` |
| `citeas` — no docids | item with empty `docid: []` | `null` |
| `label` — docid + title | ISO item | `"[ISO 17301-1:2021] Rice model"` |
| `label` — title only | item with title, no docid | `"Rice model"` |
| `label` — nothing | empty item | `"(untitled)"` |
| `label` — author only | item with contributor, no title/docid | author name |
| `formatContributor` — person decomposed | `{ surname: "Doe", given: "John" }` | `"Doe, John"` |
| `formatContributor` — person completename | `{ completename: "John Doe" }` | `"John Doe"` |
| `formatContributor` — organization | `{ name: "ISO" }` | `"ISO"` |
| `primaryAuthor` — first author among mixed roles | publisher + editor + 2 authors | first author contributor |
| `label` — multiple contributors, no title/docid | publisher + author | author name |
| `label` — organizations only, no title/docid | publisher + sponsor | first org name |
| `collectBibliographyItems` — full doc | doc JSON with bibdata + 2 bibitems | 3 items, bibdata first |
| `collectBibliographyItems` — empty doc | `{ type: "doc", content: [] }` | `[]` |
| `collectBibliographyItems` — non-node input | `null`, `"string"`, `42`, `[]` | `[]` |
| `collectBibliographyItems` — malformed item attr | bibitem with `item: "not an object"` | skipped (not included) |
