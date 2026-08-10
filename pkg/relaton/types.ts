/**
 * Bibliographic-item types — a deliberate subset of the Relaton model
 * (Relaton.spec.md §2).
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
 * @see docs/Relaton.spec.md §2
 */

// ---------------------------------------------------------------------------
// Primitive value types
// ---------------------------------------------------------------------------

/**
 * A typed title of a bibliographic item (Relaton.spec.md §2.1).
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
 * A document identifier within a named scheme (Relaton.spec.md §2.2).
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
 * A person's name, decomposed into parts (Relaton.spec.md §2.3).
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
}

/**
 * A person contributor (Relaton.spec.md §2.3).
 */
export interface Person {
  /** The person's name. */
  name: PersonName;
}

/**
 * An organisation contributor (Relaton.spec.md §2.3).
 *
 * Mirrors Relaton's `<organization>`. Subdivision recursion is flattened to a
 * single optional name string for the v1 subset.
 */
export interface Organization {
  /** Organisation name. */
  name: string;
  /** Abbreviation, e.g. `"ISO"`. */
  abbreviation: string | null;
}

/** A contributor is either a person or an organisation, with a role. */
export type ContributorEntity = Person | Organization;

/**
 * A contributor to the bibliographic item (Relaton.spec.md §2.3).
 *
 * Mirrors Relaton's `<contributor><role type="…"/>…</contributor>`. The
 * `role.type` is from a controlled vocabulary (author, publisher, editor, …).
 */
export interface Contributor {
  /** The role this contributor played. Common: `author`, `publisher`, `editor`, `translator`. */
  role: string;
  /** The person or organisation that contributed. */
  entity: ContributorEntity;
}

/**
 * A significant date in the item's lifecycle (Relaton.spec.md §2.4).
 *
 * Mirrors Relaton's `<date type="…"><on>…</on></date>` (point) or
 * `<date type="…"><from>…</from><to>…</to></date>` (range). Dates are ISO 8601
 * strings (`YYYY`, `YYYY-MM`, or `YYYY-MM-DD`).
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
}

/**
 * Publication / preparation status (Relaton.spec.md §2.5).
 *
 * Mirrors Relaton's `<status><stage/><substage/><iteration/></status>`. The
 * stage/substage values are SDO-specific codes (e.g. ISO uses `"60"` / `"00"`
 * for published).
 */
export interface DocStatus {
  /** Stage code (SDO-specific), e.g. `"60"`. */
  stage: string | null;
  /** Substage code (SDO-specific), e.g. `"00"`. */
  substage: string | null;
  /** Iteration number within the current stage, e.g. `1`. */
  iteration: string | null;
}

/**
 * Copyright information (Relaton.spec.md §2.6).
 *
 * Mirrors Relaton's `<copyright><from>…</from><owner>…</owner></copyright>`.
 */
export interface Copyright {
  /** Start year of copyright. */
  from: string | null;
  /** Owner organisation. */
  owner: Organization;
}

/**
 * A typed URI associated with a bibliographic item (Relaton.spec.md §2.7).
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

// ---------------------------------------------------------------------------
// The bibliographic item
// ---------------------------------------------------------------------------

/**
 * A bibliographic description of a document (Relaton.spec.md §2).
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
 * @see docs/Relaton.spec.md §2
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
  /** Copyright holder and year. */
  copyright: Copyright | null;
  /** Abstract / summary text. */
  abstract: string | null;
  /** URI(s) associated with the item (Relaton `<uri type="…">`, zeroOrMore). */
  uri: Uri[];
}

/**
 * A `BibliographicItem` with all array fields initialised and optional fields
 * nulled. Used as the default when creating a new `bibdata` or `bibitem` node.
 *
 * @see docs/Relaton.spec.md §2.7
 */
export function emptyBibliographicItem(): BibliographicItem {
  return {
    type: null,
    title: [],
    docid: [],
    contributor: [],
    date: [],
    status: null,
    language: [],
    script: [],
    edition: null,
    copyright: null,
    abstract: null,
    uri: [],
  };
}
