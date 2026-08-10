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
incrementally without breaking existing serialised documents. See §2.9 for a
field-by-field mapping of every Relaton `bibitem` child element to its status
in this subset.

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

### 2.3 Contributors (`Role`, `ContactInfo`, `Organization`, `PersonName`, `Affiliation`, `Person`, `Contributor`)

A contributor is either a person or an organisation, with one or more roles.
The contributor layer is the most deeply nested part of the Relaton model;
the types below mirror Relaton's `<contributor>` element tree faithfully.

#### 2.3.1 `Role`

| Field | Type | Description |
|---|---|---|
| `type` | `string` | Role type from a controlled vocabulary (see below). |
| `description` | `string \| null` | Human-readable description of the role. |
| `abbreviation` | `string \| null` | Abbreviated role label. |

Mirrors Relaton `<role type="…">` with optional `<description>` /
`<abbreviation>` children. The `type` vocabulary: `author`, `publisher`,
`editor`, `translator`, `adapter`, `performer`, `realizer`, `distributor`,
`owner`, `authorizer`, `enabler`, `subject`.

A contributor carries a **non-empty `Role[]` array** — a single entity may play
multiple roles (e.g. both author and editor).

#### 2.3.2 `ContactInfo`

| Field | Type | Description |
|---|---|---|
| `uri` | `string \| null` | URI / URL, e.g. `"https://www.iso.org"`. |
| `address` | `string \| null` | Postal address (free text). |
| `phone` | `string \| null` | Telephone number. |
| `email` | `string \| null` | Email address. |

Mirrors Relaton `<contact>` (shared by persons and organisations). All fields
optional. Relaton decomposes address and phone into sub-elements; this subset
flattens them to single strings.

#### 2.3.3 `Organization`

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Organisation name. |
| `abbreviation` | `string \| null` | Abbreviation, e.g. `"ISO"`. |
| `subdivision` | `Organization[]` | Sub-organisations (recursive, Relaton `<subdivision>`). |
| `identifier` | `string[]` | External identifiers (Relaton `<identifier>`). |
| `contact` | `ContactInfo \| null` | Contact details. |
| `logo` | `string \| null` | Logo URI (Relaton `<logo>`). |

Mirrors Relaton `<organization>`. Subdivisions recurse as nested `Organization`
entries, preserving the full recursive structure. Relaton models `name` as
`oneOrMore` localised names; this subset uses a single `string`.

#### 2.3.4 `PersonName`

| Field | Type | Description |
|---|---|---|
| `completename` | `string \| null` | Pre-formatted full name (used when not decomposed). |
| `surname` | `string \| null` | Surname / family name. |
| `given` | `string \| null` | Given / forename(s), including middle names. |
| `prefix` | `string \| null` | Name prefix / honorific, e.g. `"Dr"`, `"Prof"`. |
| `formattedInitials` | `string \| null` | Pre-formatted initials, e.g. `"J.-P."`. |
| `addition` | `string[]` | Suffix / addition strings, e.g. `["Jr"]`. |

Mirrors Relaton `<name>` inside `<person>`. Either `completename` or the
decomposed fields (`surname` / `given`) should be populated.

#### 2.3.5 `Affiliation`

| Field | Type | Description |
|---|---|---|
| `name` | `string \| null` | Affiliation name (typically a position title). |
| `description` | `string \| null` | Description of the affiliation. |
| `organization` | `Organization` | The organisation the person is affiliated with. |

Mirrors Relaton `<affiliation>` inside `<person>`.

#### 2.3.6 `Person`

| Field | Type | Description |
|---|---|---|
| `name` | `PersonName` | The person's name. |
| `credential` | `string[]` | Credential / suffix strings, e.g. `["PhD"]`. |
| `affiliation` | `Affiliation[]` | Organisational affiliations. |
| `identifier` | `string[]` | Person identifiers (Relaton `<identifier>`). |
| `contact` | `ContactInfo \| null` | Contact details. |

#### 2.3.7 `Contributor`

```ts
type ContributorEntity = Person | Organization;

interface Contributor {
  role: Role[];           // at least one role
  entity: ContributorEntity;
}
```

Mirrors Relaton `<contributor><role type="…"/>…</contributor>`.

- The `<BibliographicItemForm>` presents `contributor` as a **repeating list**:
  each row has a role `<select>` (from the controlled vocabulary in §2.3.1), an
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
| `text` | `string \| null` | Free-text date expression (Relaton `<text>` inside `<date>`). |

Mirrors Relaton `<date type="…">` with `<on>` (point) or `<from>`/`<to>`
(range), plus a free-text `<text>` child for non-parseable date expressions.

### 2.5 `Stage` and `DocStatus`

#### 2.5.1 `Stage`

| Field | Type | Description |
|---|---|---|
| `value` | `string \| null` | The stage/substage code (SDO-specific), e.g. `"60"`. |
| `abbreviation` | `string \| null` | Abbreviation attribute. |
| `name` | `string \| null` | Human-readable name (Relaton `<name>` child). |

Mirrors Relaton `<stage>` / `<substage>` element which carries a value plus
optional `abbreviation` attribute and `<name>` child.

#### 2.5.2 `DocStatus`

| Field | Type | Description |
|---|---|---|
| `stage` | `Stage \| null` | Stage (code + optional abbreviation/name). |
| `substage` | `Stage \| null` | Substage (code + optional abbreviation/name). |
| `iteration` | `string \| null` | Iteration within the current stage. |

Mirrors Relaton `<status><stage/><substage/><iteration/></status>`.

### 2.6 `Copyright`

| Field | Type | Description |
|---|---|---|
| `from` | `string \| null` | Start year (Relaton `<from>`). |
| `to` | `string \| null` | End year (Relaton `<to>`). |
| `owner` | `Organization[]` | Owner organisations (at least one). |

Mirrors Relaton `<copyright><from/><to/><owner/></copyright>`. An item may have
multiple copyright entries (different owners / years); each entry has one or
more owner organisations.

### 2.7 Component types used by `BibliographicItem`

#### 2.7.1 `Uri`

| Field | Type | Description |
|---|---|---|
| `type` | `string \| null` | Link relation type (open-ended, often IANA types: citation, src, doi). `null` = untyped. |
| `content` | `string` | The URI content (an `xsd:anyURI`). |

Mirrors Relaton `<uri type="…">`. Relaton allows `zeroOrMore` `<uri>` elements
per bibliographic item.

#### 2.7.2 `Classification`

| Field | Type | Description |
|---|---|---|
| `type` | `string` | Classification scheme, e.g. `"iso"`, `"mehfam"`. |
| `value` | `string` | The classification value / code. |

Mirrors Relaton `<classification type="…">value</classification>`.

#### 2.7.3 `Validity`

| Field | Type | Description |
|---|---|---|
| `begins` | `string \| null` | Start of validity (ISO 8601). |
| `ends` | `string \| null` | End of validity (ISO 8601). |
| `revision` | `string \| null` | Revision date / identifier (ISO 8601). |

Mirrors Relaton `<validity>` element.

### 2.8 `BibliographicItem` (composite)

| Field | Type | Default |
|---|---|---|
| `type` | `string \| null` | `null` |
| `title` | `TypedTitle[]` | seeded: `[{ type:"main", language:"en", script:null, content:"" }]` |
| `docid` | `DocId[]` | seeded: `[{ type:"ISO", id:"", primary:true, scope:null }]` |
| `contributor` | `Contributor[]` | `[]` |
| `date` | `BibDate[]` | `[]` |
| `status` | `DocStatus \| null` | `null` |
| `language` | `string[]` | `[]` |
| `script` | `string[]` | `[]` |
| `edition` | `string \| null` | `null` |
| `copyright` | `Copyright[]` | `[]` |
| `abstract` | `string \| null` | `null` |
| `uri` | `Uri[]` | `[]` |
| `docnumber` | `string \| null` | `null` |
| `version` | `string \| null` | `null` |
| `classification` | `Classification[]` | `[]` |
| `keyword` | `string[]` | `[]` |
| `validity` | `Validity \| null` | `null` |
| `license` | `string[]` | `[]` |

`emptyBibliographicItem()` returns a fresh item with all array fields
initialised and optional fields nulled. Per Relaton's `<oneOrMore>` cardinality
for both `<title>` and `<docidentifier>`, it seeds a single empty main title
(`{ type:"main", language:"en", script:null, content:"" }`) and a single empty
primary docid (`{ type:"ISO", id:"", primary:true, scope:null }`).

### 2.9 Relationship to full Relaton

Every direct child element of the Relaton `<bibitem>` / `<bibdata>` element
(29 children, from `biblio.rng`) is listed below with its status in this subset:

| Relaton element | Status | Notes |
|---|---|---|
| `formattedref` | omitted | Pre-formatted full reference string; the editor derives display labels from component fields (§3.6 `label`). |
| `title` | modeled | `TypedTitle[]` (§2.1). |
| `uri` | modeled | `Uri[]` (§2.7.1). |
| `docidentifier` | modeled | `DocId[]` (§2.2). |
| `docnumber` | modeled | `string \| null`. Numeric sorting identifier. |
| `date` | modeled | `BibDate[]` (§2.4), including the `text` free-text field. |
| `contributor` | modeled | `Contributor[]` (§2.3), with `Role[]`, recursive `Organization` subdivisions, `Affiliation`, `ContactInfo`, `PersonName` prefix/initials/credential. |
| `edition` | simplified | `string \| null`. Relaton has a `number` attribute (numeric) plus formatted content; we use a single string. |
| `version` | simplified | `string \| null`. Relaton allows `zeroOrMore` `<version>` with `type`, `revision-date`, `<draft>`; we use a single string. |
| `note` | omitted | Bibliographic notes. |
| `language` | modeled | `string[]`. |
| `locale` | omitted | Geographic locale codes. |
| `script` | modeled | `string[]`. |
| `abstract` | simplified | `string \| null`. Relaton uses `FormattedString` (content with a `format` attribute, potentially multi-block); we use a single plain-text string. |
| `status` | modeled | `DocStatus \| null` (§2.5), with `Stage` value/abbreviation/name for both stage and substage. |
| `copyright` | modeled | `Copyright[]` (§2.6), with `owner: Organization[]` and `to` end-year. |
| `relation` | omitted | Document-to-document relations (~50 types). |
| `series` | omitted | Series membership information. |
| `medium` | omitted | Medium / transmission format (content, genre, media type, carrier, size, scale). |
| `place` | omitted | Geographic location of production. |
| `price` | omitted | Access price and currency. |
| `extent` | omitted | Extent / locality within the item. |
| `size` | omitted | Bibliographic size (pages, volumes, etc.). |
| `accesslocation` | omitted | Archive / access pathway locations. |
| `license` | simplified | `string[]`. Relaton `<license>` is a complex element; we store licence URIs / identifiers as plain strings. |
| `classification` | modeled | `Classification[]` (§2.7.2). |
| `keyword` | simplified | `string[]`. Relaton `<keyword>` supports hierarchical `<taxon>` taxonomy with controlled-vocabulary identifiers; we use a flat string array. |
| `validity` | modeled | `Validity \| null` (§2.7.3). |
| `depiction` | omitted | Visual depiction (image) of the item. |

**Attributes on `BibliographicItem` itself:**

| Relaton attribute | Status | Notes |
|---|---|---|
| `type` | modeled | `type: string \| null` (ISO 690 / BibTeX superset). |
| `schema-version` | omitted | Relaton schema version stamp. |

**Summary:** 12 modeled, 5 simplified, 12 omitted (29 children total).

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

Formats a contributor's entity name for display. Uses an `isOrganization()` type
guard to dispatch:

- **Organisations** (`formatOrganization`): render as the organisation name,
  optionally followed by the first subdivision's name in parentheses, e.g.
  `"ISO (TC 154)"`.
- **Persons** (`formatPerson`): render as `"Prefix Surname, Given Initials"`
  (or `completename` when undecomposed), with credentials appended after a
  trailing comma, e.g. `"Smith, John R., PhD"`. The `prefix` (honorific) leads
  when present: `"Dr Smith, John"`. `formattedInitials` are appended after the
  given name when present.

Role information is part of the `Contributor`, not the entity, and is handled
separately by callers that group contributors by role.

### 3.5 `primaryAuthor(item) → Contributor | null`

Returns the first contributor whose `role` array contains an entry with
`type === "author"` (i.e. `c.role.some(r => r.type === "author")`), or the
first contributor of any role, or `null`.

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
  index.ts                  — public API re-exports
  types.ts                  — BibliographicItem + component types + emptyBibliographicItem
  helpers.ts                — citeas, label, primaryDocid, mainTitle, formatContributor, primaryAuthor
  collect.ts                — collectBibliographyItems
  BibliographicItemForm.tsx — React form component (peer-dep: react)
  bibitem-form.css          — form styles
  global.d.ts               — CSS-module type declarations
  test.mjs                  — headless unit tests (node:test)
  package.json              — @metanorma/relaton, zero runtime deps
  tsconfig.json             — extends ../../tsconfig.json
```

Compile with `yarn workspace @metanorma/relaton compile`.
Test with `yarn workspace @metanorma/relaton test`.

---

## 6. Consumers

| Consumer | What it uses |
|---|---|
| `@metanorma/prosemirror-schema` | `BibliographicItem` type (for `bibdata`/`bibitem` attr documentation) |
| `@metanorma/prosemirror-editor` | `label()` / `citeas()` for NodeView summaries |
| `@metanorma/toolbar` | `BibliographicItem` type + `BibliographicItemForm` for bib editing, `collectBibliographyItems` + `label` for eref picker |
| `editor-gui` | `BibliographicItem` type + `mainTitle` for sidebar title display |

---

## 7. Test plan

Headless unit tests (no DOM, no ProseMirror), run via `node:test`:

| Test | Input | Expected |
|---|---|---|
| `citeas` — explicit primary | item with 2 docids, first `primary: false`, second `primary: true` | second docid's `id` |
| `citeas` — implicit primary | item with 1 docid, `primary: false` | first docid's `id` |
| `citeas` — seeded primary | `emptyBibliographicItem()` (seeds primary docid with empty id) | `""` |
| `citeas` — no docids | item with `docid: []` | `null` |
| `primaryDocid` — explicit primary | ISO item | docid with `id: "ISO 17301-1:2021"` |
| `primaryDocid` — null when empty | item with `docid: []` | `null` |
| `mainTitle` — prefers type main | ISO item | `TypedTitle` with `content: "Rice model"` |
| `mainTitle` — seeded main title | `emptyBibliographicItem()` | `TypedTitle` with `type: "main"`, `content: ""` |
| `label` — docid + title | ISO item | `"[ISO 17301-1:2021] Rice model"` |
| `label` — title only | item with title, no docid | `"Rice model"` |
| `label` — nothing | empty item (`docid: []`, `title: []`) | `"(untitled)"` |
| `label` — author only | item with contributor, no title/docid | author name |
| `label` — multiple contributors, no title/docid | publisher + author | author name |
| `label` — organizations only, no title/docid | publisher + sponsor | first org name |
| `formatContributor` — person decomposed | `{ surname: "Doe", given: "John" }` | `"Doe, John"` |
| `formatContributor` — person completename | `{ completename: "John Doe" }` | `"John Doe"` |
| `formatContributor` — organization | `{ name: "ISO" }` | `"ISO"` |
| `formatContributor` — person with prefix | `{ surname: "Smith", given: "John", prefix: "Dr" }` | `"Dr Smith, John"` |
| `formatContributor` — person with initials | `{ surname: "Smith", given: "John", formattedInitials: "R." }` | `"Smith, John R."` |
| `formatContributor` — person with credential | `{ surname: "Smith", given: "John" }`, `credential: ["PhD"]` | `"Smith, John, PhD"` |
| `formatContributor` — organization with subdivision | `{ name: "ISO", subdivision: [{ name: "TC 154" }] }` | `"ISO (TC 154)"` |
| `primaryAuthor` — first author among mixed roles | publisher + editor + 2 authors | first author contributor |
| `primaryAuthor` — author among multiple roles | contributor with `role: [{type:"author"},{type:"editor"}]` | that contributor |
| `primaryAuthor` — null when empty | item with `contributor: []` | `null` |
| `collectBibliographyItems` — full doc | doc JSON with bibdata + 2 bibitems | 3 items, bibdata first |
| `collectBibliographyItems` — bibdata only | doc with bibdata, no bibitems | 1 item |
| `collectBibliographyItems` — empty doc | `{ type: "doc", content: [] }` | `[]` |
| `collectBibliographyItems` — non-node input | `null`, `"string"`, `42`, `[]`, `undefined` | `[]` |
| `collectBibliographyItems` — malformed item attr | bibitem with `item: "not an object"` / missing item / `title` not array | skipped (not included) |
