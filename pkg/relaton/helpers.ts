/**
 * Pure derivation helpers over `BibliographicItem` (Relaton.spec.md §3).
 *
 * These functions contain no runtime state and no ProseMirror dependency. They
 * are the single source of truth for deriving citation keys, display labels,
 * and primary identifiers from a `BibliographicItem`, shared by:
 *
 * - The `eref` picker (offers items by `label`, stores `citeas`).
 * - The `bibdata` / `bibitem` NodeViews (render a compact summary).
 * - Any future validation / reference-integrity decoration.
 */

import type {
  BibliographicItem,
  Contributor,
  ContributorEntity,
  DocId,
  Organization,
  Person,
  PersonName,
  TypedTitle,
} from './types.js';

/**
 * Return the primary document identifier, if any (Relaton.spec.md §3.1).
 *
 * The primary identifier is the `docid` whose `primary` flag is `true`. If none
 * is explicitly flagged, the first `docid` is used (Relaton convention). Returns
 * `null` when the item has no docids at all.
 */
export function primaryDocid(item: BibliographicItem): DocId | null {
  const explicit = item.docid.find((d) => d.primary);
  if (explicit !== undefined) return explicit;
  return item.docid[0] ?? null;
}

/**
 * Return the citation key (`citeas`) for the item, if any (Relaton.spec.md §3.2).
 *
 * This is the identifier string used by `eref` marks' `cite` attribute and by
 * the Metanorma converter for `<eref citeas="…">`. It is derived from the
 * primary docid's `id` field — there is no separate stored `citeas` field.
 */
export function citeas(item: BibliographicItem): string | null {
  const primary = primaryDocid(item);
  return primary?.id ?? null;
}

/**
 * Return the main title content of the item, if any (Relaton.spec.md §3.3).
 *
 * Prefers a title with `type: "main"`; falls back to the first title;
 * returns `null` when there are no titles.
 */
export function mainTitle(item: BibliographicItem): TypedTitle | null {
  const main = item.title.find((t) => t.type === "main");
  if (main !== undefined) return main;
  return item.title[0] ?? null;
}

/**
 * Format a contributor's entity name for display (Relaton.spec.md §3.4).
 *
 * Persons render as `"Prefix Surname, Given, Credentials"` (or `completename`
 * when undecomposed). Organisations render as their name, optionally followed
 * by the first subdivision's name in parentheses, e.g. `"ISO (TC 154)"`.
 *
 * Note: role information is part of the `Contributor`, not the entity, and is
 * handled separately by callers that group contributors by role.
 */
export function formatContributor(contributor: Contributor): string {
  const { entity } = contributor;
  if (isOrganization(entity)) {
    return formatOrganization(entity);
  }
  return formatPerson(entity);
}

/** Type guard: is this entity an Organization (name is a string)? */
function isOrganization(entity: ContributorEntity): entity is Organization {
  return typeof (entity as Organization).name === "string";
}

/**
 * Format an organisation name, appending the first subdivision's name in
 * parentheses when present, e.g. `"ISO (TC 154)"`.
 */
function formatOrganization(org: Organization): string {
  let name = org.name;
  const sub = org.subdivision[0]?.name;
  if (sub !== undefined && sub !== "") {
    name = `${name} (${sub})`;
  }
  return name;
}

/**
 * Format a person's name for display.
 *
 * - `completename` takes precedence when set.
 * - Otherwise renders as `"Prefix Surname, Given"` with `formattedInitials`
 *   appended after the given name; the `prefix` (honorific) leads when present.
 * - Credentials (e.g. PhD) are appended after a trailing comma.
 */
function formatPerson(person: Person): string {
  const n = person.name;
  let base: string;
  if (n.completename !== null && n.completename !== "") {
    base = n.completename;
  } else {
    base = formatDecomposedName(n);
  }
  const creds = person.credential.filter((c) => c !== "");
  if (creds.length > 0) {
    return `${base}, ${creds.join(" ")}`;
  }
  return base;
}

/** Format a decomposed name (surname/given) honouring prefix and initials. */
function formatDecomposedName(n: PersonName): string {
  const { prefix, surname, given, formattedInitials } = n;
  // Build the "Surname, Given" core.
  let core = "";
  const givenParts: string[] = [];
  if (given !== null) givenParts.push(given);
  if (formattedInitials !== null) givenParts.push(formattedInitials);
  const givenStr = givenParts.join(" ");

  if (surname !== null && givenStr !== "") {
    core = `${surname}, ${givenStr}`;
  } else if (surname !== null) {
    core = surname;
  } else {
    core = givenStr;
  }

  if (core === "") return "";
  // Prefix leads when present: "Dr Smith, John"
  if (prefix !== null && prefix !== "") {
    return `${prefix} ${core}`;
  }
  return core;
}

/**
 * Return the primary author (first contributor with an `"author"` role), if
 * any (Relaton.spec.md §3.5). A contributor matches when any of its roles has
 * `type === "author"`.
 */
export function primaryAuthor(item: BibliographicItem): Contributor | null {
  const author = item.contributor.find((c) =>
    c.role.some((r) => r.type === "author"),
  );
  if (author !== undefined) return author;
  return item.contributor[0] ?? null;
}

/**
 * Return a compact human-readable label for the item (Relaton.spec.md §3.6).
 *
 * Used by the `eref` picker (dropdown entries) and by the `bibdata` /
 * `bibitem` NodeViews (summary line). The format is intentionally simple:
 *
 * - If the item has a primary docid: `"[ISO 17301-1:2021] Rice model"`.
 * - If no docid but a title: `"Rice model"`.
 * - If no docid and no title: the first contributor, or `"(untitled)"`.
 *
 * This is a display label, not a fully-rendered citation. A future
 * `relaton-render`-style formatter would produce the formatted reference string
 * for export rendering; that is out of scope for the v1 subset.
 */
export function label(item: BibliographicItem): string {
  const title = mainTitle(item);
  const id = citeas(item);

  if (id !== null && title !== null) {
    return `[${id}] ${title.content}`;
  }
  if (title !== null) {
    return title.content;
  }
  const author = primaryAuthor(item);
  if (author !== null) {
    const name = formatContributor(author);
    if (name !== '') return name;
  }
  return "(untitled)";
}
