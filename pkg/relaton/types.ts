/**
 * Bibliographic-item types — a deliberate subset of the Relaton model
 * (README.spec.md §2).
 *
 * The full Relaton `BibliographicItem` (relaton-bib Ruby gem, expressed in
 * `lib/metanorma/validate/biblio.rng`) is deeply nested and recursive
 * (organisation subdivisions recurse; contributors carry multiple affiliations
 * with their own contact arrays; ~50 relation types; ~20 date types).
 *
 * This package models a **pragmatic subset** sufficient for document metadata
 * (`bibdata`) and bibliography entries (`bibitem`) in the editor, and for
 * resolving inline `eref` citations. Fields omitted here are not needed for the
 * editor's current coverage; the shape is designed to extend incrementally
 * without breaking existing serialised documents (unknown keys in persisted
 * JSON are tolerated by the editor's loader).
 *
 * @see docs/README.spec.md §2
 */

// ---------------------------------------------------------------------------
// Primitive value types
// ---------------------------------------------------------------------------

/**
 * A typed title of a bibliographic item (README.spec.md §2.1).
 *
 * Mirrors Relaton's `<title type="…" language="…" script="…">` element. The
 * `type` attribute is open-ended but common values are `main` (default),
 * `alternative`, `original`, `subtitle`, `unofficial`.
 */
export interface TypedTitle {
  /** Title variant. Common: `main` (default), `alternative`, `original`, `subtitle`, `unofficial`. */
  type: string;
  /** ISO 639-2 language code, e.g. `"en"`. */
  language: string | null;
  /** ISO 15924 script code, e.g. `"Latn"`. */
  script: string | null;
  /** The title text. */
  content: string;
}

/**
 * A document identifier within a named scheme (README.spec.md §2.2).
 *
 * Mirrors Relaton's `<docidentifier type="…" scope="…" primary="…">`. The
 * `primary` flag marks the identifier used for citation (`citeas`); by
 * convention the first `docid` is primary when none is explicitly flagged.
 */
export interface DocId {
  /** Identifier scheme / namespace, e.g. `"ISO"`, `"urn"`, `"DOI"`. */
  type: string;
  /** The identifier string, e.g. `"ISO 17301-1:2021"`. */
  id: string;
  /** Whether this is the primary citation identifier. */
  primary: boolean;
  /**
   * Scope qualifier when the identifier does not cover the whole document
   * (e.g. a part or format). `null` when unscoped.
   */
  scope: string | null;
}

/**
 * Contact information shared by persons and organisations (README.spec.md §2.3).
 *
 * Mirrors Relaton's `<contact>` element which collects address, phone, email
 * and URI sub-elements. All fields optional.
 */
export interface ContactInfo {
  /** URI / URL, e.g. `"https://www.iso.org"`. */
  uri: string | null;
  /** Postal address (free text). */
  address: string | null;
  /** Telephone number. */
  phone: string | null;
  /** Email address. */
  email: string | null;
}

/**
 * An organisation contributor (README.spec.md §2.3).
 *
 * Mirrors Relaton's `<organization>`. Subdivisions recurse as nested
 * `Organization` entries; the editor exposes the first-level name only, but
 * the type preserves the recursive structure for fidelity.
 */
export interface Organization {
  /** Organisation name. */
  name: string;
  /** Abbreviation, e.g. `"ISO"`. */
  abbreviation: string | null;
  /** Sub-organisations (recursive, Relaton `<subdivision>`). */
  subdivision: Organization[];
  /** External identifiers (Relaton `<identifier>`). */
  identifier: string[];
  /** Contact details. */
  contact: ContactInfo | null;
  /** Logo URI (Relaton `<logo>`). */
  logo: string | null;
}

/**
 * A person's name, decomposed into parts (README.spec.md §2.3).
 *
 * Mirrors Relaton's `<name>` inside `<person>`. Either `completename` or the
 * decomposed fields (surname / given) should be populated.
 */
export interface PersonName {
  /** Pre-formatted full name, used when the name is not decomposed. */
  completename: string | null;
  /** Surname / family name. */
  surname: string | null;
  /** Given / forename(s), including middle names. */
  given: string | null;
  /** Name prefix / honorific, e.g. `"Dr"`, `"Prof"` (Relaton `<prefix>`). */
  prefix: string | null;
  /** Pre-formatted initials (Relaton `<formatted-initials>`). */
  formattedInitials: string | null;
  /** Suffix / addition strings (Relaton `<addition>`). */
  addition: string[];
}

/**
 * An organisational affiliation of a person (README.spec.md §2.3).
 *
 * Mirrors Relaton's `<affiliation>` inside `<person>`.
 */
export interface Affiliation {
  /** Affiliation name (Relaton `<name>` inside `<affiliation>`). */
  name: string | null;
  /** Description of the affiliation (Relaton `<description>`). */
  description: string | null;
  /** The organisation the person is affiliated with. */
  organization: Organization;
}

/**
 * A person contributor (README.spec.md §2.3).
 */
export interface Person {
  /** The person's name. */
  name: PersonName;
  /** Credential / suffix strings, e.g. `["PhD"]` (Relaton `<credential>`). */
  credential: string[];
  /** Organisational affiliations. */
  affiliation: Affiliation[];
  /** Person identifiers (Relaton `<identifier>`). */
  identifier: string[];
  /** Contact details. */
  contact: ContactInfo | null;
}

/** A contributor is either a person or an organisation, with a role. */
export type ContributorEntity = Person | Organization;

/**
 * A role played by a contributor (README.spec.md §2.3).
 *
 * Mirrors Relaton's `<role type="…">` element with a mandatory `type` attribute
 * (controlled vocabulary: author, publisher, editor, …) and optional
 * `<description>` / `<abbreviation>` children.
 */
export interface Role {
  /** Role type from a controlled vocabulary (author, publisher, editor, …). */
  type: string;
  /** Human-readable description of the role. */
  description: string | null;
  /** Abbreviated role label. */
  abbreviation: string | null;
}

/**
 * A contributor to the bibliographic item (README.spec.md §2.3).
 *
 * Mirrors Relaton's `<contributor><role type="…"/>…</contributor>`. A
 * contributor has one or more roles; the `role` array is always non-empty.
 */
export interface Contributor {
  /** Roles this contributor played (at least one). */
  role: Role[];
  /** The person or organisation that contributed. */
  entity: ContributorEntity;
}

/**
 * A significant date in the item's lifecycle (README.spec.md §2.4).
 *
 * Mirrors Relaton's `<date type="…"><on>…</on></date>` (point) or
 * `<date type="…"><from>…</from><to>…</to></date>` (range). Dates are ISO 8601
 * strings (`YYYY`, `YYYY-MM`, or `YYYY-MM-DD`). A free-text `text` field is
 * also supported for non-parseable date expressions.
 */
export interface BibDate {
  /** Lifecycle phase. Common: `published`, `issued`, `circulated`, `updated`, `obsoleted`, `confirmed`. */
  type: string;
  /** Point date (ISO 8601). Present for single-point dates. */
  on: string | null;
  /** Range start (ISO 8601). Present for date ranges. */
  from: string | null;
  /** Range end (ISO 8601). Present for date ranges. */
  to: string | null;
  /** Free-text date expression (Relaton `<text>` inside `<date>`). */
  text: string | null;
}

/**
 * A stage or substage value (README.spec.md §2.5).
 *
 * Mirrors Relaton's `<stage>` / `<substage>` element which carries a value
 * plus optional `abbreviation` attribute and `<name>` child.
 */
export interface Stage {
  /** The stage/substage code (SDO-specific), e.g. `"60"`. */
  value: string | null;
  /** Abbreviation attribute. */
  abbreviation: string | null;
  /** Human-readable name (Relaton `<name>` child). */
  name: string | null;
}

/**
 * Publication / preparation status (README.spec.md §2.5).
 *
 * Mirrors Relaton's `<status><stage/><substage/><iteration/></status>`. The
 * stage/substage values are SDO-specific codes (e.g. ISO uses `"60"` / `"00"`
 * for published).
 */
export interface DocStatus {
  /** Stage (code + optional abbreviation/name). */
  stage: Stage | null;
  /** Substage (code + optional abbreviation/name). */
  substage: Stage | null;
  /** Iteration number within the current stage, e.g. `1`. */
  iteration: string | null;
}

/**
 * Copyright information (README.spec.md §2.6).
 *
 * Mirrors Relaton's `<copyright><from>…</from><to>…</to><owner>…</owner></copyright>`.
 * An item may have multiple copyright entries (different owners / years); each
 * has one or more owner organisations.
 */
export interface Copyright {
  /** Start year of copyright (Relaton `<from>`). */
  from: string | null;
  /** End year of copyright (Relaton `<to>`). */
  to: string | null;
  /** Owner entities (at least one; person or organization). */
  owner: ContributorEntity[];
}

/**
 * A typed URI associated with a bibliographic item (README.spec.md §2.7).
 *
 * Mirrors Relaton's `<uri type="…">` element (the `bsource` / `TypedUri`
 * define in biblio.rng). The `type` attribute is open-ended but commonly uses
 * IANA link relation types (RFC 8288) such as `"citation"`, `"src"`, `"doi"`.
 * When `type` is omitted (null), the URI is an untyped link to the resource.
 *
 * Relaton allows `zeroOrMore` `<uri>` elements per bibliographic item.
 */
export interface Uri {
  /** Link relation type (open-ended, often IANA types: citation, src, doi). `null` = untyped. */
  type: string | null;
  /** The URI content (an `xsd:anyURI`). */
  content: string;
}

/**
 * A classification entry (README.spec.md §2.8).
 *
 * Mirrors Relaton's `<classification type="…">value</classification>`.
 */
export interface Classification {
  /** Classification scheme, e.g. `"iso"`, `"mehfam"`. */
  type: string;
  /** The classification value / code. */
  value: string;
}

/**
 * Validity period of a bibliographic item (README.spec.md §2.8).
 *
 * Mirrors Relaton's `<validity>` element.
 */
export interface Validity {
  /** Start of validity (ISO 8601). */
  begins: string | null;
  /** End of validity (ISO 8601). */
  ends: string | null;
  /** Revision date / identifier (ISO 8601). */
  revision: string | null;
}

// ---------------------------------------------------------------------------
// The bibliographic item
// ---------------------------------------------------------------------------

/**
 * A bibliographic description of a document (README.spec.md §2).
 *
 * Used for:
 * - **Document metadata** — the `bibdata` node's `item` attr (exactly one per
 *   document, describing the document itself).
 * - **Bibliography entries** — the `bibitem` node's `item` attr (one per entry
 *   inside `references` sections).
 * - **Citation resolution** — `collectBibliographyItems()` gathers all items
 *   from both sources so the `eref` picker can offer known entries.
 *
 * This is a deliberate subset of the full Relaton `BibliographicItem`. All
 * array fields default to empty arrays in the helpers; `null` marks "not set".
 *
 * @see docs/README.spec.md §2
 */
export interface BibliographicItem {
  /** Bibliographic type (ISO 690 / BibTeX superset), e.g. `"standard"`, `"article"`. */
  type: string | null;
  /** Titles (typed, localised). At least one `type: "main"` entry is typical. */
  title: TypedTitle[];
  /** Document identifiers. The `primary` one provides the `citeas` key. */
  docid: DocId[];
  /** Contributors (authors, publishers, editors, …). */
  contributor: Contributor[];
  /** Significant lifecycle dates (published, issued, …). */
  date: BibDate[];
  /** Publication / preparation status. */
  status: DocStatus | null;
  /** ISO 639-2 language codes of the document content. */
  language: string[];
  /** ISO 15924 script codes. */
  script: string[];
  /** Edition information. */
  edition: string | null;
  /** Copyright entries (holders and years). */
  copyright: Copyright[];
  /** Abstract / summary text. */
  abstract: string | null;
  /** URI(s) associated with the item (Relaton `<uri type="…">`, zeroOrMore). */
  uri: Uri[];
  /** Document number for numeric sorting (Relaton `<docnumber>`). */
  docnumber: string | null;
  /** Version identifier (Relaton `<version>`). */
  version: string | null;
  /** Classification entries (Relaton `<classification>`). */
  classification: Classification[];
  /** Keywords (Relaton `<keyword>`, zeroOrMore). */
  keyword: string[];
  /** Validity period (Relaton `<validity>`). */
  validity: Validity | null;
  /** Licence URIs (Relaton `<license>`, zeroOrMore). */
  license: string[];
}

/**
 * A `BibliographicItem` with all array fields initialised and optional fields
 * nulled. Used as the default when creating a new `bibdata` or `bibitem` node.
 *
 * Seeds a single empty main title and a single empty primary docid, per
 * Relaton's `<oneOrMore>` cardinality for both `<title>` and `<docidentifier>`.
 *
 * @see docs/README.spec.md §2.7
 */
export function emptyBibliographicItem(): BibliographicItem {
  return {
    type: null,
    title: [{ type: "main", language: "en", script: null, content: "" }],
    docid: [{ type: "ISO", id: "", primary: true, scope: null }],
    contributor: [],
    date: [],
    status: null,
    language: [],
    script: [],
    edition: null,
    copyright: [],
    abstract: null,
    uri: [],
    docnumber: null,
    version: null,
    classification: [],
    keyword: [],
    validity: null,
    license: [],
  };
}
