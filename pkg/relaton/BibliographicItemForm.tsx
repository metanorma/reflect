/**
 * `<BibliographicItemForm>` — a presentational React form for editing a
 * `BibliographicItem` (Relaton subset).
 *
 * Shared by:
 * - The `bibdata` NodeView / Sidebar metadata button (document-level metadata).
 * - The `bibitem` NodeView (bibliography entries).
 *
 * Pure React: no ProseMirror imports, no EditorView, no transactions. The
 * parent owns the save/cancel lifecycle and binds `value` / `onChange` to
 * either React state (bibdata panel) or node attrs (NodeView popover).
 *
 * Lives in `@metanorma/relaton` because it is a view over the relaton model —
 * it has zero dependencies on ProseMirror, `@metanorma/toolbar`, or any other
 * editor package. React is a peer dependency.
 *
 * @see docs/Relaton.spec.md §2
 */

import React, { useState, useCallback } from 'react';

import type {
  BibliographicItem,
  TypedTitle,
  DocId,
  Contributor,
  ContributorEntity,
  Copyright,
  Person,
  Organization,
  PersonName,
  BibDate,
  DocStatus,
  Stage,
  Uri,
  Classification,
  Validity,
  ContactInfo,
} from './types.js';
import { emptyBibliographicItem } from './types.js';

import './bibitem-form.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BibliographicItemFormProps {
  /** The current bibliographic item. */
  readonly value: BibliographicItem;
  /** Called on every field change with the updated item. */
  readonly onChange: (next: BibliographicItem) => void;
}

// ---------------------------------------------------------------------------
// Field helpers — shallow-clone the item and patch a single field
// ---------------------------------------------------------------------------

/** Shallow-clone the item with one top-level field replaced. */
function patch(item: BibliographicItem, patch: Partial<BibliographicItem>): BibliographicItem {
  return { ...item, ...patch };
}

/** Ensure the item has a main title entry; return a mutable copy. */
function ensureMainTitle(item: BibliographicItem): TypedTitle[] {
  const main = item.title.find((t) => t.type === "main");
  if (main !== undefined) return [...item.title];
  return [...item.title, { type: 'main', language: 'en', script: null, content: '' }];
}

/** Update the content of the main title. */
function setMainTitleContent(item: BibliographicItem, content: string): BibliographicItem {
  const titles = ensureMainTitle(item);
  const idx = titles.findIndex((t) => t.type === "main");
  if (idx < 0) return item;
  const updated: TypedTitle = { ...titles[idx]!, content };
  titles[idx] = updated;
  return patch(item, { title: titles });
}

/** Update the language of the main title. */
function setMainTitleLanguage(item: BibliographicItem, language: string): BibliographicItem {
  const titles = ensureMainTitle(item);
  const idx = titles.findIndex((t) => t.type === "main");
  if (idx < 0) return item;
  const updated: TypedTitle = { ...titles[idx]!, language: language || null };
  titles[idx] = updated;
  return patch(item, { title: titles });
}

/** Ensure the item has at least one docid; return the primary one (or first). */
function ensureDocid(item: BibliographicItem): DocId {
  if (item.docid.length > 0) {
    return item.docid.find((d) => d.primary) ?? item.docid[0]!;
  }
  return { type: 'ISO', id: '', primary: true, scope: null };
}

/** Update the primary docid's type, replacing the old entry. */
function setDocIdType(item: BibliographicItem, type: string): BibliographicItem {
  const rest = item.docid.filter((d) => !d.primary);
  const current = ensureDocid(item);
  return patch(item, { docid: [{ ...current, type }, ...rest] });
}

/** Update the primary docid's id string. */
function setDocIdValue(item: BibliographicItem, id: string): BibliographicItem {
  const rest = item.docid.filter((d) => !d.primary);
  const current = ensureDocid(item);
  return patch(item, { docid: [{ ...current, id }, ...rest] });
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Ensure the item has a published date entry; return it. */
function ensurePublishedDate(item: BibliographicItem): BibDate {
  const pub = item.date.find((d) => d.type === "published");
  if (pub !== undefined) return pub;
  return { type: 'published', on: '', from: null, to: null, text: null };
}

/** Replace (or insert) the published date entry. */
function setPublishedDate(item: BibliographicItem, next: BibDate): BibliographicItem {
  const rest = item.date.filter((d) => d.type !== "published");
  return patch(item, { date: [next, ...rest] });
}

/** Update the published date's `on` value (point date). Clears range fields. */
function setPublishedDateOn(item: BibliographicItem, on: string): BibliographicItem {
  const cur = ensurePublishedDate(item);
  return setPublishedDate(item, { ...cur, on, from: null, to: null });
}

/** Update the published date's `from` value (range start). Clears `on`. */
function setPublishedDateFrom(item: BibliographicItem, from: string): BibliographicItem {
  const cur = ensurePublishedDate(item);
  return setPublishedDate(item, { ...cur, on: null, from: from || null });
}

/** Update the published date's `to` value (range end). */
function setPublishedDateTo(item: BibliographicItem, to: string): BibliographicItem {
  const cur = ensurePublishedDate(item);
  return setPublishedDate(item, { ...cur, on: null, to: to || null });
}

/** Update the published date's free-text field. */
function setPublishedDateText(item: BibliographicItem, text: string): BibliographicItem {
  const cur = ensurePublishedDate(item);
  return setPublishedDate(item, { ...cur, text: text || null });
}

// ---------------------------------------------------------------------------
// Contributor list helpers
// ---------------------------------------------------------------------------

/** Role options presented in the contributor <select>. */
const ROLES = [
  "author", "publisher", "editor", "translator", "adapter",
  "performer", "realizer", "distributor", "owner", "authorizer",
  "enabler", "subject",
] as const;

/** Create a default empty organization contributor. */
function emptyOrgContributor(roleType: string = "publisher"): Contributor {
  return {
    role: [{ type: roleType, description: null, abbreviation: null }],
    entity: { name: '', abbreviation: null, subdivision: [], identifier: [], contact: null, logo: null },
  };
}

/** Create a default empty person contributor. */
function emptyPersonContributor(roleType: string = "author"): Contributor {
  return {
    role: [{ type: roleType, description: null, abbreviation: null }],
    entity: {
      name: { completename: '', surname: null, given: null, prefix: null, formattedInitials: null, addition: [] },
      credential: [],
      affiliation: [],
      identifier: [],
      contact: null,
    },
  };
}

/** Type guard: is this entity a Person? */
function isPersonEntity(entity: ContributorEntity): entity is Person {
  return "name" in entity && typeof entity.name === "object";
}

/** Type guard: is this entity an Organization? */
function isOrgEntity(entity: ContributorEntity): entity is Organization {
  return "name" in entity && typeof entity.name === "string";
}

/** Type guard: is this contributor's entity a Person? */
function isPerson(c: Contributor): boolean {
  return isPersonEntity(c.entity);
}

/** Type guard: is this contributor's entity an Organization? */
function isOrg(c: Contributor): boolean {
  return isOrgEntity(c.entity);
}

/** Update a single contributor at index `idx` in the list. */
function updateContributor(item: BibliographicItem, idx: number, next: Contributor): BibliographicItem {
  const contributors = [...item.contributor];
  if (idx < 0 || idx >= contributors.length) return item;
  contributors[idx] = next;
  return patch(item, { contributor: contributors });
}

/** Remove the contributor at index `idx`. */
function removeContributor(item: BibliographicItem, idx: number): BibliographicItem {
  const contributors = item.contributor.filter((_, i) => i !== idx);
  return patch(item, { contributor: contributors });
}

/** Add a new contributor to the end of the list. */
function addContributor(item: BibliographicItem, c: Contributor): BibliographicItem {
  return patch(item, { contributor: [...item.contributor, c] });
}

/** Change a contributor's first role type (reads/writes role[0].type). */
function setContributorRole(item: BibliographicItem, idx: number, roleType: string): BibliographicItem {
  const c = item.contributor[idx];
  if (c === undefined) return item;
  const roleHead = c.role[0] ?? { type: "author", description: null, abbreviation: null };
  const role: typeof roleHead = { ...roleHead, type: roleType };
  const newRoles = [role, ...c.role.slice(1)];
  return updateContributor(item, idx, { ...c, role: newRoles });
}

/** Change a contributor's first role description. */
function setContributorRoleDescription(item: BibliographicItem, idx: number, description: string): BibliographicItem {
  const c = item.contributor[idx];
  if (c === undefined) return item;
  const roleHead = c.role[0] ?? { type: "author", description: null, abbreviation: null };
  const role: typeof roleHead = { ...roleHead, description: description || null };
  const newRoles = [role, ...c.role.slice(1)];
  return updateContributor(item, idx, { ...c, role: newRoles });
}

/** Change a contributor's first role abbreviation. */
function setContributorRoleAbbrev(item: BibliographicItem, idx: number, abbreviation: string): BibliographicItem {
  const c = item.contributor[idx];
  if (c === undefined) return item;
  const roleHead = c.role[0] ?? { type: "author", description: null, abbreviation: null };
  const role: typeof roleHead = { ...roleHead, abbreviation: abbreviation || null };
  const newRoles = [role, ...c.role.slice(1)];
  return updateContributor(item, idx, { ...c, role: newRoles });
}

/** Change a contributor's entity type (person ↔ organization). */
function setContributorEntityType(item: BibliographicItem, idx: number, kind: "person" | "org"): BibliographicItem {
  const current = item.contributor[idx];
  if (current === undefined) return item;
  const roleType = current.role[0]?.type ?? "author";
  return updateContributor(item, idx,
    kind === "person" ? emptyPersonContributor(roleType) : emptyOrgContributor(roleType),
  );
}

/** Set an organization contributor's name. */
function setOrgName(item: BibliographicItem, idx: number, name: string): BibliographicItem {
  const c = item.contributor[idx];
  if (c === undefined || !isOrg(c)) return item;
  const org = c.entity as Organization;
  return updateContributor(item, idx, {
    role: c.role,
    entity: { ...org, name },
  });
}

/** Set a person contributor's completename. */
function setPersonCompleteness(item: BibliographicItem, idx: number, completename: string): BibliographicItem {
  const c = item.contributor[idx];
  if (c === undefined || !isPerson(c)) return item;
  const person = c.entity as Person;
  return updateContributor(item, idx, {
    role: c.role,
    entity: { ...person, name: { ...person.name, completename } },
  });
}

/** Set a person contributor's surname. */
function setPersonSurname(item: BibliographicItem, idx: number, surname: string): BibliographicItem {
  const c = item.contributor[idx];
  if (c === undefined || !isPerson(c)) return item;
  const person = c.entity as Person;
  const name: PersonName = { ...person.name, surname: surname || null };
  return updateContributor(item, idx, {
    role: c.role,
    entity: { ...person, name },
  });
}

/** Set a person contributor's given name. */
function setPersonGiven(item: BibliographicItem, idx: number, given: string): BibliographicItem {
  const c = item.contributor[idx];
  if (c === undefined || !isPerson(c)) return item;
  const person = c.entity as Person;
  const name: PersonName = { ...person.name, given: given || null };
  return updateContributor(item, idx, {
    role: c.role,
    entity: { ...person, name },
  });
}

/** Set a person contributor's name prefix (honorific). */
function setPersonPrefix(item: BibliographicItem, idx: number, prefix: string): BibliographicItem {
  const c = item.contributor[idx];
  if (c === undefined || !isPerson(c)) return item;
  const person = c.entity as Person;
  const name: PersonName = { ...person.name, prefix: prefix || null };
  return updateContributor(item, idx, {
    role: c.role,
    entity: { ...person, name },
  });
}

/** Set a person contributor's formatted initials. */
function setPersonInitials(item: BibliographicItem, idx: number, formattedInitials: string): BibliographicItem {
  const c = item.contributor[idx];
  if (c === undefined || !isPerson(c)) return item;
  const person = c.entity as Person;
  const name: PersonName = { ...person.name, formattedInitials: formattedInitials || null };
  return updateContributor(item, idx, {
    role: c.role,
    entity: { ...person, name },
  });
}

/** Set a person contributor's credentials (comma-separated input → array). */
function setPersonCredentials(item: BibliographicItem, idx: number, credentials: string): BibliographicItem {
  const c = item.contributor[idx];
  if (c === undefined || !isPerson(c)) return item;
  const person = c.entity as Person;
  const credential = splitCommas(credentials);
  return updateContributor(item, idx, { role: c.role, entity: { ...person, credential } });
}

/** Set a person contributor's identifiers (comma-separated input → array). */
function setPersonIdentifier(item: BibliographicItem, idx: number, identifiers: string): BibliographicItem {
  const c = item.contributor[idx];
  if (c === undefined || !isPerson(c)) return item;
  const person = c.entity as Person;
  const identifier = splitCommas(identifiers);
  return updateContributor(item, idx, { role: c.role, entity: { ...person, identifier } });
}

/** Set a person contributor's contact field. */
function setPersonContact(item: BibliographicItem, idx: number, field: keyof ContactInfo, value: string): BibliographicItem {
  const c = item.contributor[idx];
  if (c === undefined || !isPerson(c)) return item;
  const person = c.entity as Person;
  const contact: ContactInfo = person.contact ?? { uri: null, address: null, phone: null, email: null };
  const nextContact: ContactInfo = { ...contact, [field]: value || null };
  return updateContributor(item, idx, { role: c.role, entity: { ...person, contact: nextContact } });
}

/** Set an org contributor's subdivisions (comma-separated names → stub Orgs). */
function setOrgSubdivisions(item: BibliographicItem, idx: number, subdivisions: string): BibliographicItem {
  const c = item.contributor[idx];
  if (c === undefined || !isOrg(c)) return item;
  const org = c.entity as Organization;
  const subdivision: Organization[] = splitCommas(subdivisions).map((name) => ({
    name, abbreviation: null, subdivision: [], identifier: [], contact: null, logo: null,
  }));
  return updateContributor(item, idx, { role: c.role, entity: { ...org, subdivision } });
}

/** Set an org contributor's identifiers (comma-separated input → array). */
function setOrgIdentifier(item: BibliographicItem, idx: number, identifiers: string): BibliographicItem {
  const c = item.contributor[idx];
  if (c === undefined || !isOrg(c)) return item;
  const org = c.entity as Organization;
  const identifier = splitCommas(identifiers);
  return updateContributor(item, idx, { role: c.role, entity: { ...org, identifier } });
}

/** Set an org contributor's contact field. */
function setOrgContact(item: BibliographicItem, idx: number, field: keyof ContactInfo, value: string): BibliographicItem {
  const c = item.contributor[idx];
  if (c === undefined || !isOrg(c)) return item;
  const org = c.entity as Organization;
  const contact: ContactInfo = org.contact ?? { uri: null, address: null, phone: null, email: null };
  const nextContact: ContactInfo = { ...contact, [field]: value || null };
  return updateContributor(item, idx, { role: c.role, entity: { ...org, contact: nextContact } });
}

/** Set an org contributor's logo URL. */
function setOrgLogo(item: BibliographicItem, idx: number, logo: string): BibliographicItem {
  const c = item.contributor[idx];
  if (c === undefined || !isOrg(c)) return item;
  const org = c.entity as Organization;
  return updateContributor(item, idx, { role: c.role, entity: { ...org, logo: logo || null } });
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

/** Ensure a non-null status object (does not write back). */
function ensureStatus(item: BibliographicItem): DocStatus {
  return item.status ?? { stage: null, substage: null, iteration: null };
}

/** Ensure a Stage object is non-null. */
function ensureStage(stage: Stage | null): Stage {
  return stage ?? { value: null, abbreviation: null, name: null };
}

/** Update the status stage value. */
function setStatusStage(item: BibliographicItem, stageValue: string): BibliographicItem {
  const current = ensureStatus(item);
  const nextStage = ensureStage(current.stage);
  return patch(item, { status: { ...current, stage: { ...nextStage, value: stageValue || null } } });
}

/** Update the status substage value. */
function setStatusSubstage(item: BibliographicItem, substageValue: string): BibliographicItem {
  const current = ensureStatus(item);
  const nextSub = ensureStage(current.substage);
  return patch(item, { status: { ...current, substage: { ...nextSub, value: substageValue || null } } });
}

/** Update the status iteration. */
function setStatusIteration(item: BibliographicItem, iteration: string): BibliographicItem {
  const current = ensureStatus(item);
  return patch(item, { status: { ...current, iteration: iteration || null } });
}

/** Update the language array (single-value for v1). */
function setLanguage(item: BibliographicItem, lang: string): BibliographicItem {
  return patch(item, { language: lang ? [lang] : [] });
}

/** Update the script array (single-value for v1). */
function setScript(item: BibliographicItem, script: string): BibliographicItem {
  return patch(item, { script: script ? [script] : [] });
}

// ---------------------------------------------------------------------------
// URI list helpers
// ---------------------------------------------------------------------------

/** Common URI types (IANA link relations, RFC 8288) + Relaton-specific. */
const URI_TYPES = [
  "citation", "src", "doi", "about", "alternate", "canonical",
  "describedby", "edition", "licence", "predecessor", "successor",
] as const;

/** Add a new empty URI to the end of the list. */
function addUri(item: BibliographicItem): BibliographicItem {
  return patch(item, { uri: [...item.uri, { type: 'citation', content: '' }] });
}

/** Update a single URI at index `idx`. */
function updateUri(item: BibliographicItem, idx: number, next: Uri): BibliographicItem {
  const uris = [...item.uri];
  if (idx < 0 || idx >= uris.length) return item;
  uris[idx] = next;
  return patch(item, { uri: uris });
}

/** Remove the URI at index `idx`. */
function removeUri(item: BibliographicItem, idx: number): BibliographicItem {
  return patch(item, { uri: item.uri.filter((_, i) => i !== idx) });
}

// ---------------------------------------------------------------------------
// Copyright list helpers
// ---------------------------------------------------------------------------

/** Add a new empty copyright entry to the end of the list. */
function addCopyright(item: BibliographicItem): BibliographicItem {
  const empty: Copyright = {
    from: '',
    to: null,
    owner: [{ name: '', abbreviation: null, subdivision: [], identifier: [], contact: null, logo: null }],
  };
  return patch(item, { copyright: [...item.copyright, empty] });
}

/** Update a single copyright entry at index `idx`. */
function updateCopyright(item: BibliographicItem, idx: number, next: Copyright): BibliographicItem {
  const entries = [...item.copyright];
  if (idx < 0 || idx >= entries.length) return item;
  entries[idx] = next;
  return patch(item, { copyright: entries });
}

/** Remove the copyright entry at index `idx`. */
function removeCopyright(item: BibliographicItem, idx: number): BibliographicItem {
  return patch(item, { copyright: item.copyright.filter((_, i) => i !== idx) });
}

/** Set the `from` year of the copyright entry at `idx`. */
function setCopyrightFrom(item: BibliographicItem, idx: number, from: string): BibliographicItem {
  const c = item.copyright[idx];
  if (c === undefined) return item;
  return updateCopyright(item, idx, { ...c, from });
}

/** Set the `to` year of the copyright entry at `idx`. */
function setCopyrightTo(item: BibliographicItem, idx: number, to: string): BibliographicItem {
  const c = item.copyright[idx];
  if (c === undefined) return item;
  return updateCopyright(item, idx, { ...c, to: to || null });
}

/** Set the first owner's organization name of the copyright entry at `idx`. */
function setCopyrightOwnerOrgName(item: BibliographicItem, idx: number, name: string): BibliographicItem {
  const c = item.copyright[idx];
  if (c === undefined) return item;
  const ownerHead = c.owner[0];
  if (ownerHead === undefined || !isOrgEntity(ownerHead)) return item;
  const owner: Organization = { ...ownerHead, name };
  return updateCopyright(item, idx, { ...c, owner: [owner, ...c.owner.slice(1)] });
}

/** Set the first owner's person completename of the copyright entry at `idx`. */
function setCopyrightOwnerPersonName(item: BibliographicItem, idx: number, completename: string): BibliographicItem {
  const c = item.copyright[idx];
  if (c === undefined) return item;
  const ownerHead = c.owner[0];
  if (ownerHead === undefined || !isPersonEntity(ownerHead)) return item;
  const person = ownerHead as Person;
  const owner: Person = { ...person, name: { ...person.name, completename } };
  return updateCopyright(item, idx, { ...c, owner: [owner, ...c.owner.slice(1)] });
}

/** Change the first owner's entity type (org ↔ person) of the copyright entry at `idx`. */
function setCopyrightOwnerType(item: BibliographicItem, idx: number, kind: "org" | "person"): BibliographicItem {
  const c = item.copyright[idx];
  if (c === undefined) return item;
  const owner: ContributorEntity = kind === "person"
    ? { name: { completename: '', surname: null, given: null, prefix: null, formattedInitials: null, addition: [] }, credential: [], affiliation: [], identifier: [], contact: null }
    : { name: '', abbreviation: null, subdivision: [], identifier: [], contact: null, logo: null };
  return updateCopyright(item, idx, { ...c, owner: [owner, ...c.owner.slice(1)] });
}

// ---------------------------------------------------------------------------
// Classification list helpers
// ---------------------------------------------------------------------------

/** Add a new empty classification entry. */
function addClassification(item: BibliographicItem): BibliographicItem {
  return patch(item, { classification: [...item.classification, { type: '', value: '' }] });
}

/** Update a classification entry at `idx`. */
function updateClassification(item: BibliographicItem, idx: number, next: Classification): BibliographicItem {
  const entries = [...item.classification];
  if (idx < 0 || idx >= entries.length) return item;
  entries[idx] = next;
  return patch(item, { classification: entries });
}

/** Remove the classification entry at `idx`. */
function removeClassification(item: BibliographicItem, idx: number): BibliographicItem {
  return patch(item, { classification: item.classification.filter((_, i) => i !== idx) });
}

// ---------------------------------------------------------------------------
// License list helpers
// ---------------------------------------------------------------------------

/** Add a new empty license URI entry. */
function addLicense(item: BibliographicItem): BibliographicItem {
  return patch(item, { license: [...item.license, ''] });
}

/** Update a license URI at `idx`. */
function setLicenseAt(item: BibliographicItem, idx: number, uri: string): BibliographicItem {
  const licenses = [...item.license];
  if (idx < 0 || idx >= licenses.length) return item;
  licenses[idx] = uri;
  return patch(item, { license: licenses });
}

/** Remove the license URI at `idx`. */
function removeLicense(item: BibliographicItem, idx: number): BibliographicItem {
  return patch(item, { license: item.license.filter((_, i) => i !== idx) });
}

// ---------------------------------------------------------------------------
// Validity helpers
// ---------------------------------------------------------------------------

/** Ensure a non-null validity object (does not write back). */
function ensureValidity(item: BibliographicItem): Validity {
  return item.validity ?? { begins: null, ends: null, revision: null };
}

/** Update the validity `begins` field. */
function setValidityBegins(item: BibliographicItem, begins: string): BibliographicItem {
  const cur = ensureValidity(item);
  return patch(item, { validity: { ...cur, begins: begins || null } });
}

/** Update the validity `ends` field. */
function setValidityEnds(item: BibliographicItem, ends: string): BibliographicItem {
  const cur = ensureValidity(item);
  return patch(item, { validity: { ...cur, ends: ends || null } });
}

/** Update the validity `revision` field. */
function setValidityRevision(item: BibliographicItem, revision: string): BibliographicItem {
  const cur = ensureValidity(item);
  return patch(item, { validity: { ...cur, revision: revision || null } });
}

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

/** Split a comma-separated string into a trimmed, de-emptyed array. */
function splitCommas(input: string): string[] {
  return input.split(",").map((s) => s.trim()).filter((s) => s !== "");
}

/** Join an array back into a comma-separated display string. */
function joinCommas(arr: string[]): string {
  return arr.join(", ");
}

/** Document-type options, grouped by scheme (ISO 690 + SDO-specific). */
const DOC_TYPE_GROUPS = [
  {
    label: "ISO 690",
    options: [
      { value: "standard", label: "standard" },
      { value: "article", label: "article" },
      { value: "book", label: "book" },
      { value: "booklet", label: "booklet" },
      { value: "manual", label: "manual" },
      { value: "proceedings", label: "proceedings" },
      { value: "presentation", label: "presentation" },
      { value: "thesis", label: "thesis" },
      { value: "techreport", label: "techreport" },
      { value: "misc", label: "misc" },
      { value: "electronic resource", label: "electronic resource" },
      { value: "dataset", label: "dataset" },
      { value: "website", label: "website" },
      { value: "software", label: "software" },
    ],
  },
  {
    label: "SDO-specific",
    options: [
      { value: "bipm:brochure", label: "BIPM: brochure" },
      { value: "bipm:monographie", label: "BIPM: monographie" },
      { value: "bipm:rapport", label: "BIPM: rapport" },
      { value: "bipm:white-paper", label: "BIPM: white-paper" },
      { value: "csa:guidance", label: "CSA: guidance" },
      { value: "csa:recommended-practice", label: "CSA: recommended-practice" },
      { value: "csa:standard", label: "CSA: standard" },
      { value: "csa:supplement", label: "CSA: supplement" },
      { value: "csa:technical-report", label: "CSA: technical-report" },
      { value: "csa:update", label: "CSA: update" },
      { value: "iec:specification", label: "IEC: specification" },
      { value: "iec:technical-report", label: "IEC: technical-report" },
      { value: "iec:technical-specification", label: "IEC: technical-specification" },
      { value: "iec:publicly-available-specification", label: "IEC: publicly-available-specification" },
      { value: "iec:guide", label: "IEC: guide" },
      { value: "iec:industry-technical-agreement", label: "IEC: industry-technical-agreement" },
      { value: "iec:systems-reference-document", label: "IEC: systems-reference-document" },
      { value: "iec:technology-trend-report", label: "IEC: technology-trend-report" },
      { value: "iec:conductor-type-report", label: "IEC: conductor-type-report" },
      { value: "iec:directive", label: "IEC: directive" },
      { value: "iec:supplement", label: "IEC: supplement" },
      { value: "iec:component-specification", label: "IEC: component-specification" },
      { value: "ieee:guide", label: "IEEE: guide" },
      { value: "ieee:recommended-practice", label: "IEEE: recommended-practice" },
      { value: "ieee:standard", label: "IEEE: standard" },
      { value: "ieee:whitepaper", label: "IEEE: whitepaper" },
      { value: "ietf:rfc", label: "IETF: rfc" },
      { value: "ietf:internet-draft", label: "IETF: internet-draft" },
      { value: "iho:specification", label: "IHO: specification" },
      { value: "iho:other", label: "IHO: other" },
      { value: "iso:international-standard", label: "ISO: international-standard" },
      { value: "iso:technical-specification", label: "ISO: technical-specification" },
      { value: "iso:technical-report", label: "ISO: technical-report" },
      { value: "iso:publicly-available-specification", label: "ISO: publicly-available-specification" },
      { value: "iso:international-workshop-agreement", label: "ISO: international-workshop-agreement" },
      { value: "iso:guide", label: "ISO: guide" },
      { value: "iso:amendment", label: "ISO: amendment" },
      { value: "iso:technical-corrigendum", label: "ISO: technical-corrigendum" },
      { value: "iso:directive", label: "ISO: directive" },
      { value: "iso:specification", label: "ISO: specification" },
      { value: "iso:committee-document", label: "ISO: committee-document" },
      { value: "iso:recommendation", label: "ISO: recommendation" },
      { value: "itu:recommendation", label: "ITU: recommendation" },
      { value: "itu:technical-service-bulletin", label: "ITU: technical-service-bulletin" },
      { value: "itu:question", label: "ITU: question" },
      { value: "itu:resolution", label: "ITU: resolution" },
      { value: "itu:supplement", label: "ITU: supplement" },
      { value: "nist:nist-sp", label: "NIST: nist-sp" },
      { value: "nist:nist-fips", label: "NIST: nist-fips" },
      { value: "nist:nist-cswp", label: "NIST: nist-cswp" },
      { value: "nist:nist-ir", label: "NIST: nist-ir" },
      { value: "ogc:abstract-specification-topic", label: "OGC: abstract-specification-topic" },
      { value: "ogc:best-practice", label: "OGC: best-practice" },
      { value: "ogc:community-standard", label: "OGC: community-standard" },
      { value: "ogc:discussion-paper", label: "OGC: discussion-paper" },
      { value: "ogc:engineering-report", label: "OGC: engineering-report" },
      { value: "ogc:other-policy", label: "OGC: other-policy" },
      { value: "ogc:policy", label: "OGC: policy" },
      { value: "ogc:reference-model", label: "OGC: reference-model" },
      { value: "ogc:release-notes", label: "OGC: release-notes" },
      { value: "ogc:standard", label: "OGC: standard" },
      { value: "ogc:test-suite", label: "OGC: test-suite" },
      { value: "ogc:user-guide", label: "OGC: user-guide" },
      { value: "ogc:white-paper", label: "OGC: white-paper" },
      { value: "un:recommendation", label: "UN: recommendation" },
      { value: "un:plenary", label: "UN: plenary" },
      { value: "un:addendum", label: "UN: addendum" },
      { value: "un:corrigendum", label: "UN: corrigendum" },
      { value: "un:revision", label: "UN: revision" },
    ],
  },
] as const;

/** ISO 15924 script options. */
const SCRIPTS = ["Latn", "Cyrl", "Arab", "Hans", "Hant", "Jpan", "Kore"] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BibliographicItemForm({
  value,
  onChange,
}: BibliographicItemFormProps): React.JSX.Element {
  const [draft, setDraft] = useState<BibliographicItem>(value ?? emptyBibliographicItem());
  const [dateRange, setDateRange] = useState(() => {
    const pub = ensurePublishedDate(draft);
    return pub.on === null && (pub.from !== null || pub.to !== null);
  });
  // Keywords are stored as a string[] in the model but edited as free text.
  // Keep a local raw-text state so the user can type commas without the
  // split→join round-trip erasing the trailing comma on every keystroke.
  const [keywordText, setKeywordText] = useState(joinCommas(draft.keyword));

  const update = useCallback(
    (next: BibliographicItem) => {
      setDraft(next);
      onChange(next);
    },
    [onChange],
  );

  const mainTitle = draft.title.find((t) => t.type === 'main')?.content ?? '';
  const mainTitleLang = draft.title.find((t) => t.type === 'main')?.language ?? 'en';
  const docid = ensureDocid(draft);
  const pub = ensurePublishedDate(draft);
  const statusStage = draft.status?.stage?.value ?? '';
  const statusSubstage = draft.status?.substage?.value ?? '';
  const statusIteration = draft.status?.iteration ?? '';
  const language = draft.language[0] ?? '';
  const script = draft.script[0] ?? '';

  return (
    <div className="mn-bibitem-form">
      {/* ---- Title ---- */}
      <label className="mn-bibitem-form__field">
        <span className="mn-bibitem-form__label">Title</span>
        <input
          type="text"
          className="mn-bibitem-form__input"
          value={mainTitle}
          onChange={(e) => update(setMainTitleContent(draft, e.target.value))}
        />
      </label>

      {/* ---- Doc identifier ---- */}
      <div className="mn-bibitem-form__row">
        <label className="mn-bibitem-form__field mn-bibitem-form__field--id-type">
          <span className="mn-bibitem-form__label">ID type</span>
          <select
            className="mn-bibitem-form__select"
            value={docid.type}
            onChange={(e) => update(setDocIdType(draft, e.target.value))}
          >
            <option value="ISO">ISO</option>
            <option value="IEC">IEC</option>
            <option value="IEEE">IEEE</option>
            <option value="RFC">RFC</option>
            <option value="DOI">DOI</option>
            <option value="urn">URN</option>
            <option value="ISBN">ISBN</option>
            <option value="ISSN">ISSN</option>
          </select>
        </label>
        <label className="mn-bibitem-form__field mn-bibitem-form__field--id-value">
          <span className="mn-bibitem-form__label">Identifier</span>
          <input
            type="text"
            className="mn-bibitem-form__input"
            value={docid.id}
            placeholder="e.g. ISO 17301-1:2021" title="e.g. ISO 17301-1:2021"
            onChange={(e) => update(setDocIdValue(draft, e.target.value))}
          />
        </label>
      </div>

      {/* ---- Doc type + Doc number + Edition + Version ---- */}
      <div className="mn-bibitem-form__row">
        <label className="mn-bibitem-form__field mn-bibitem-form__field--status">
          <span className="mn-bibitem-form__label">Document type</span>
          <select
            className="mn-bibitem-form__select"
            value={draft.type ?? ''}
            onChange={(e) => update(patch(draft, { type: e.target.value || null }))}
          >
            <option value=''>—</option>
            {DOC_TYPE_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="mn-bibitem-form__field mn-bibitem-form__field--id-value">
          <span className="mn-bibitem-form__label">Doc number</span>
          <input
            type="text"
            className="mn-bibitem-form__input"
            value={draft.docnumber ?? ''}
            placeholder="Numeric identifier for sorting (e.g. 17301)" title="Numeric identifier for sorting (e.g. 17301)"
            onChange={(e) => update(patch(draft, { docnumber: e.target.value || null }))}
          />
        </label>
      </div>
      <div className="mn-bibitem-form__row">
        <label className="mn-bibitem-form__field mn-bibitem-form__field--id-value">
          <span className="mn-bibitem-form__label">Edition</span>
          <input
            type="text"
            className="mn-bibitem-form__input"
            value={draft.edition ?? ''}
            placeholder="e.g. 2" title="e.g. 2"
            onChange={(e) => update(patch(draft, { edition: e.target.value || null }))}
          />
        </label>
        <label className="mn-bibitem-form__field mn-bibitem-form__field--id-value">
          <span className="mn-bibitem-form__label">Version</span>
          <input
            type="text"
            className="mn-bibitem-form__input"
            value={draft.version ?? ''}
            placeholder="e.g. 1.2 or WD" title="e.g. 1.2 or WD"
            onChange={(e) => update(patch(draft, { version: e.target.value || null }))}
          />
        </label>
      </div>

      {/* ---- Abstract ---- */}
      <label className="mn-bibitem-form__field">
        <span className="mn-bibitem-form__label">Abstract</span>
        <textarea
          className="mn-bibitem-form__textarea"
          value={draft.abstract ?? ''}
          placeholder="Summary of the document…" title="Summary of the document…"
          rows={3}
          onChange={(e) => update(patch(draft, { abstract: e.target.value || null }))}
        />
      </label>

      {/* ---- Contributors (repeating list) ---- */}
      <div className="mn-bibitem-form__contributors">
        <div className="mn-bibitem-form__section-header">Contributors</div>
        {draft.contributor.map((c, idx) => (
          <ContributorRow
            key={idx}
            contributor={c}
            onRoleChange={(role) => update(setContributorRole(draft, idx, role))}
            onRoleDescriptionChange={(d) => update(setContributorRoleDescription(draft, idx, d))}
            onRoleAbbrevChange={(a) => update(setContributorRoleAbbrev(draft, idx, a))}
            onTypeChange={(kind) => update(setContributorEntityType(draft, idx, kind))}
            onOrgNameChange={(name) => update(setOrgName(draft, idx, name))}
            onOrgSubdivisionsChange={(s) => update(setOrgSubdivisions(draft, idx, s))}
            onOrgIdentifierChange={(i) => update(setOrgIdentifier(draft, idx, i))}
            onOrgContactChange={(field, v) => update(setOrgContact(draft, idx, field, v))}
            onOrgLogoChange={(l) => update(setOrgLogo(draft, idx, l))}
            onPersonNameChange={(name) => update(setPersonCompleteness(draft, idx, name))}
            onPersonSurnameChange={(name) => update(setPersonSurname(draft, idx, name))}
            onPersonGivenChange={(name) => update(setPersonGiven(draft, idx, name))}
            onPersonPrefixChange={(name) => update(setPersonPrefix(draft, idx, name))}
            onPersonInitialsChange={(name) => update(setPersonInitials(draft, idx, name))}
            onPersonCredentialsChange={(cr) => update(setPersonCredentials(draft, idx, cr))}
            onPersonIdentifierChange={(i) => update(setPersonIdentifier(draft, idx, i))}
            onPersonContactChange={(field, v) => update(setPersonContact(draft, idx, field, v))}
            onRemove={() => update(removeContributor(draft, idx))}
          />
        ))}
        <div className="mn-bibitem-form__contributor-add">
          <button
            type="button"
            className="mn-bibitem-form__add-btn"
            onClick={() => update(addContributor(draft, emptyOrgContributor("publisher")))}
          >
            + Add organization
          </button>
          <button
            type="button"
            className="mn-bibitem-form__add-btn"
            onClick={() => update(addContributor(draft, emptyPersonContributor("author")))}
          >
            + Add person
          </button>
        </div>
      </div>

      {/* ---- Date + Status row ---- */}
      <div className="mn-bibitem-form__row">
        <div className="mn-bibitem-form__field mn-bibitem-form__field--date">
          <span className="mn-bibitem-form__label">Published</span>
          <div className="mn-bibitem-form__row mn-bibitem-form__row--compact">
            <select
              className="mn-bibitem-form__select mn-bibitem-form__date-mode"
              value={dateRange ? 'range' : 'point'}
              onChange={(e) => {
                if (e.target.value === 'range') {
                  setDateRange(true);
                  update(setPublishedDate(draft, { type: "published", on: null, from: "", to: null, text: pub.text ?? null }));
                } else {
                  setDateRange(false);
                  update(setPublishedDate(draft, { type: "published", on: "", from: null, to: null, text: pub.text ?? null }));
                }
              }}
            >
              <option value="point">Point</option>
              <option value="range">Range</option>
            </select>
            {dateRange ? (
              <>
                <input
                  type="text"
                  className="mn-bibitem-form__input"
                  value={pub.from ?? ''}
                  placeholder="From (YYYY)" title="From (YYYY)"
                  onChange={(e) => update(setPublishedDateFrom(draft, e.target.value))}
                />
                <input
                  type="text"
                  className="mn-bibitem-form__input"
                  value={pub.to ?? ''}
                  placeholder="To (YYYY)" title="To (YYYY)"
                  onChange={(e) => update(setPublishedDateTo(draft, e.target.value))}
                />
              </>
            ) : (
              <input
                type="text"
                className="mn-bibitem-form__input"
                value={pub.on ?? ''}
                placeholder="YYYY or YYYY-MM-DD" title="YYYY or YYYY-MM-DD"
                onChange={(e) => update(setPublishedDateOn(draft, e.target.value))}
              />
            )}
          </div>
          <input
            type="text"
            className="mn-bibitem-form__input mn-bibitem-form__date-text"
            value={pub.text ?? ''}
            placeholder="Display text for non-ISO dates (e.g. 'circa 1990', 'Q2 2021')" title="Display text for non-ISO dates (e.g. 'circa 1990', 'Q2 2021')"
            onChange={(e) => update(setPublishedDateText(draft, e.target.value))}
          />
        </div>
        <div className="mn-bibitem-form__field mn-bibitem-form__field--status">
          <span className="mn-bibitem-form__label">Stage / Substage</span>
          <div className="mn-bibitem-form__row mn-bibitem-form__row--compact">
            <input
              type="text"
              className="mn-bibitem-form__input"
              value={statusStage}
              placeholder="SDO-specific (ISO: 10–60, IEEE: active/approved)" title="SDO-specific (ISO: 10–60, IEEE: active/approved)"
              onChange={(e) => update(setStatusStage(draft, e.target.value))}
            />
            <input
              type="text"
              className="mn-bibitem-form__input"
              value={statusSubstage}
              placeholder="SDO-specific (ISO: 00)" title="SDO-specific (ISO: 00)"
              onChange={(e) => update(setStatusSubstage(draft, e.target.value))}
            />
          </div>
          <input
            type="text"
            className="mn-bibitem-form__input"
            value={statusIteration}
            placeholder="Draft number (e.g. 2)" title="Draft number (e.g. 2)"
            onChange={(e) => update(setStatusIteration(draft, e.target.value))}
          />
        </div>
      </div>

      {/* ---- Language + Script + Title-language row ---- */}
      <div className="mn-bibitem-form__row">
        <label className="mn-bibitem-form__field mn-bibitem-form__field--lang">
          <span className="mn-bibitem-form__label">Language</span>
          <select
            className="mn-bibitem-form__select"
            value={language}
            onChange={(e) => update(setLanguage(draft, e.target.value))}
          >
            <option value=''>—</option>
            <option value='en'>English (en)</option>
            <option value='fr'>French (fr)</option>
            <option value='de'>German (de)</option>
            <option value='ru'>Russian (ru)</option>
            <option value='zh'>Chinese (zh)</option>
            <option value='ja'>Japanese (ja)</option>
            <option value='ar'>Arabic (ar)</option>
          </select>
        </label>
        <label className="mn-bibitem-form__field mn-bibitem-form__field--lang">
          <span className="mn-bibitem-form__label">Script</span>
          <select
            className="mn-bibitem-form__select"
            value={script}
            onChange={(e) => update(setScript(draft, e.target.value))}
          >
            <option value=''>—</option>
            {SCRIPTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="mn-bibitem-form__field mn-bibitem-form__field--title-lang">
          <span className="mn-bibitem-form__label">Title language</span>
          <select
            className="mn-bibitem-form__select"
            value={mainTitleLang ?? ''}
            onChange={(e) => update(setMainTitleLanguage(draft, e.target.value))}
          >
            <option value=''>—</option>
            <option value='en'>English (en)</option>
            <option value='fr'>French (fr)</option>
            <option value='de'>German (de)</option>
            <option value='ru'>Russian (ru)</option>
            <option value='zh'>Chinese (zh)</option>
            <option value='ja'>Japanese (ja)</option>
            <option value='ar'>Arabic (ar)</option>
          </select>
        </label>
      </div>

      {/* ---- Keywords ---- */}
      <label className="mn-bibitem-form__field">
        <span className="mn-bibitem-form__label">Keywords</span>
        <input
          type="text"
          className="mn-bibitem-form__input"
          value={keywordText}
          placeholder="Comma-separated (e.g. rice, grain, cereal)" title="Comma-separated (e.g. rice, grain, cereal)"
          onChange={(e) => {
            setKeywordText(e.target.value);
            update(patch(draft, { keyword: splitCommas(e.target.value) }));
          }}
          onBlur={() => setKeywordText(joinCommas(draft.keyword))}
        />
      </label>

      {/* ---- URIs (repeating list) ---- */}
      <div className="mn-bibitem-form__contributors">
        <div className="mn-bibitem-form__section-header">URIs</div>
        {draft.uri.map((u, idx) => (
          <div key={idx} className="mn-bibitem-form__contributor">
            <div className="mn-bibitem-form__contributor-row">
              <select
                className="mn-bibitem-form__select mn-bibitem-form__contributor-role"
                value={u.type ?? ''}
                onChange={(e) => update(updateUri(draft, idx, { ...u, type: e.target.value || null }))}
              >
                {URI_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                <option value=''>(untyped)</option>
              </select>
              <input
                type="url"
                className="mn-bibitem-form__input"
                value={u.content}
                placeholder="https://…" title="https://…"
                onChange={(e) => update(updateUri(draft, idx, { ...u, content: e.target.value }))}
              />
              <button
                type="button"
                className="mn-bibitem-form__remove-btn"
                title="Remove URI"
                onClick={() => update(removeUri(draft, idx))}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <div className="mn-bibitem-form__contributor-add">
          <button
            type="button"
            className="mn-bibitem-form__add-btn"
            onClick={() => update(addUri(draft))}
          >
            + Add URI
          </button>
        </div>
      </div>

      {/* ---- Copyright (repeating list) ---- */}
      <div className="mn-bibitem-form__contributors">
        <div className="mn-bibitem-form__section-header">Copyright</div>
        {draft.copyright.map((c, idx) => {
          const ownerHead = c.owner[0] ?? null;
          const ownerIsPerson = ownerHead !== null && isPersonEntity(ownerHead);
          const ownerIsOrg = ownerHead !== null && isOrgEntity(ownerHead);
          const ownerEntity = ownerIsPerson
            ? (ownerHead as Person)
            : ownerIsOrg
              ? (ownerHead as Organization)
              : null;
          const ownerType: "org" | "person" = ownerIsPerson ? "person" : "org";
          return (
          <div key={idx} className="mn-bibitem-form__contributor">
            <div className="mn-bibitem-form__contributor-row">
              <input
                type="text"
                className="mn-bibitem-form__input"
                value={c.from ?? ''}
                placeholder="From year" title="From year"
                onChange={(e) => update(setCopyrightFrom(draft, idx, e.target.value))}
              />
              <input
                type="text"
                className="mn-bibitem-form__input"
                value={c.to ?? ''}
                placeholder="To year (opt.)" title="To year (opt.)"
                onChange={(e) => update(setCopyrightTo(draft, idx, e.target.value))}
              />
              <select
                className="mn-bibitem-form__select mn-bibitem-form__contributor-type"
                value={ownerType}
                onChange={(e) => update(setCopyrightOwnerType(draft, idx, e.target.value as "org" | "person"))}
              >
                <option value="org">Organization</option>
                <option value="person">Person</option>
              </select>
              <button
                type="button"
                className="mn-bibitem-form__remove-btn"
                title="Remove copyright"
                onClick={() => update(removeCopyright(draft, idx))}
              >
                ✕
              </button>
            </div>
            {ownerType === "person" ? (
              <input
                type="text"
                className="mn-bibitem-form__input"
                value={(ownerEntity as Person | null)?.name.completename ?? ''}
                placeholder="Owner full name" title="Owner full name"
                onChange={(e) => update(setCopyrightOwnerPersonName(draft, idx, e.target.value))}
              />
            ) : (
              <input
                type="text"
                className="mn-bibitem-form__input"
                value={(ownerEntity as Organization | null)?.name ?? ''}
                placeholder="Owner organization name" title="Owner organization name"
                onChange={(e) => update(setCopyrightOwnerOrgName(draft, idx, e.target.value))}
              />
            )}
          </div>
          );
        })}
        <div className="mn-bibitem-form__contributor-add">
          <button
            type="button"
            className="mn-bibitem-form__add-btn"
            onClick={() => update(addCopyright(draft))}
          >
            + Add copyright
          </button>
        </div>
      </div>

      {/* ---- Classification (repeating list, collapsible) ---- */}
      <details className="mn-bibitem-form__details" open={draft.classification.length > 0 || undefined}>
        <summary>Classification</summary>
        <div className="mn-bibitem-form__contributors">
          {draft.classification.map((cl, idx) => (
            <div key={idx} className="mn-bibitem-form__contributor">
              <div className="mn-bibitem-form__contributor-row">
                <input
                  type="text"
                  className="mn-bibitem-form__input mn-bibitem-form__contributor-role"
                  value={cl.type}
                  placeholder="Scheme name (e.g. ICS, type, topic)" title="Scheme name (e.g. ICS, type, topic)"
                  onChange={(e) => update(updateClassification(draft, idx, { ...cl, type: e.target.value }))}
                />
                <input
                  type="text"
                  className="mn-bibitem-form__input"
                  value={cl.value}
                  placeholder="Code within the scheme" title="Code within the scheme"
                  onChange={(e) => update(updateClassification(draft, idx, { ...cl, value: e.target.value }))}
                />
                <button
                  type="button"
                  className="mn-bibitem-form__remove-btn"
                  title="Remove classification"
                  onClick={() => update(removeClassification(draft, idx))}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          <div className="mn-bibitem-form__contributor-add">
            <button
              type="button"
              className="mn-bibitem-form__add-btn"
              onClick={() => update(addClassification(draft))}
            >
              + Add classification
            </button>
          </div>
        </div>
      </details>

      {/* ---- License (repeating list, collapsible) ---- */}
      <details className="mn-bibitem-form__details" open={draft.license.length > 0 || undefined}>
        <summary>License</summary>
        <div className="mn-bibitem-form__contributors">
          {draft.license.map((lic, idx) => (
            <div key={idx} className="mn-bibitem-form__contributor">
              <div className="mn-bibitem-form__contributor-row">
                <input
                  type="url"
                  className="mn-bibitem-form__input"
                  value={lic}
                  placeholder="License URI" title="License URI"
                  onChange={(e) => update(setLicenseAt(draft, idx, e.target.value))}
                />
                <button
                  type="button"
                  className="mn-bibitem-form__remove-btn"
                  title="Remove license"
                  onClick={() => update(removeLicense(draft, idx))}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          <div className="mn-bibitem-form__contributor-add">
            <button
              type="button"
              className="mn-bibitem-form__add-btn"
              onClick={() => update(addLicense(draft))}
            >
              + Add license
            </button>
          </div>
        </div>
      </details>

      {/* ---- Validity (collapsible) ---- */}
      <details className="mn-bibitem-form__details" open={draft.validity !== null || undefined}>
        <summary>Validity</summary>
        <div className="mn-bibitem-form__row">
          <label className="mn-bibitem-form__field mn-bibitem-form__field--id-value">
            <span className="mn-bibitem-form__label">Valid from</span>
            <input
              type="text"
              className="mn-bibitem-form__input"
              value={draft.validity?.begins ?? ''}
              placeholder="YYYY-MM-DD" title="YYYY-MM-DD"
              onChange={(e) => update(setValidityBegins(draft, e.target.value))}
            />
          </label>
          <label className="mn-bibitem-form__field mn-bibitem-form__field--id-value">
            <span className="mn-bibitem-form__label">Valid until</span>
            <input
              type="text"
              className="mn-bibitem-form__input"
              value={draft.validity?.ends ?? ''}
              placeholder="YYYY-MM-DD" title="YYYY-MM-DD"
              onChange={(e) => update(setValidityEnds(draft, e.target.value))}
            />
          </label>
        </div>
        <label className="mn-bibitem-form__field">
          <span className="mn-bibitem-form__label">Revision date</span>
          <input
            type="text"
            className="mn-bibitem-form__input"
            value={draft.validity?.revision ?? ''}
            placeholder="YYYY-MM-DD" title="YYYY-MM-DD"
            onChange={(e) => update(setValidityRevision(draft, e.target.value))}
          />
        </label>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContributorRow — a single contributor in the repeating list
// ---------------------------------------------------------------------------

function ContributorRow({
  contributor,
  onRoleChange,
  onRoleDescriptionChange,
  onRoleAbbrevChange,
  onTypeChange,
  onOrgNameChange,
  onOrgSubdivisionsChange,
  onOrgIdentifierChange,
  onOrgContactChange,
  onOrgLogoChange,
  onPersonNameChange,
  onPersonSurnameChange,
  onPersonGivenChange,
  onPersonPrefixChange,
  onPersonInitialsChange,
  onPersonCredentialsChange,
  onPersonIdentifierChange,
  onPersonContactChange,
  onRemove,
}: {
  readonly contributor: Contributor;
  readonly onRoleChange: (role: string) => void;
  readonly onRoleDescriptionChange: (description: string) => void;
  readonly onRoleAbbrevChange: (abbreviation: string) => void;
  readonly onTypeChange: (kind: "person" | "org") => void;
  readonly onOrgNameChange: (name: string) => void;
  readonly onOrgSubdivisionsChange: (subdivisions: string) => void;
  readonly onOrgIdentifierChange: (identifiers: string) => void;
  readonly onOrgContactChange: (field: keyof ContactInfo, value: string) => void;
  readonly onOrgLogoChange: (logo: string) => void;
  readonly onPersonNameChange: (name: string) => void;
  readonly onPersonSurnameChange: (name: string) => void;
  readonly onPersonGivenChange: (name: string) => void;
  readonly onPersonPrefixChange: (name: string) => void;
  readonly onPersonInitialsChange: (name: string) => void;
  readonly onPersonCredentialsChange: (credentials: string) => void;
  readonly onPersonIdentifierChange: (identifiers: string) => void;
  readonly onPersonContactChange: (field: keyof ContactInfo, value: string) => void;
  readonly onRemove: () => void;
}): React.JSX.Element {
  const person = isPerson(contributor);
  const org = isOrg(contributor);

  const personEntity = person ? (contributor.entity as Person) : null;
  const orgEntity = org ? (contributor.entity as Organization) : null;
  const personName = personEntity?.name ?? null;
  const orgName = orgEntity?.name ?? '';
  const entityType = person ? "person" : "org";
  const role = contributor.role[0] ?? { type: "author", description: null, abbreviation: null };
  const roleType = role.type;

  return (
    <div className="mn-bibitem-form__contributor">
      <div className="mn-bibitem-form__contributor-row">
        <select
          className="mn-bibitem-form__select mn-bibitem-form__contributor-role"
          value={roleType}
          onChange={(e) => onRoleChange(e.target.value)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select
          className="mn-bibitem-form__select mn-bibitem-form__contributor-type"
          value={entityType}
          onChange={(e) => onTypeChange(e.target.value as "person" | "org")}
        >
          <option value="org">Organization</option>
          <option value="person">Person</option>
        </select>
        <button
          type="button"
          className="mn-bibitem-form__remove-btn"
          title="Remove contributor"
          onClick={onRemove}
        >
          ✕
        </button>
      </div>

      {/* ---- Role details (collapsible) ---- */}
      <details className="mn-bibitem-form__details mn-bibitem-form__details--inline" open={(role.description !== null && role.description !== '') || (role.abbreviation !== null && role.abbreviation !== '') || undefined}>
        <summary>Role details</summary>
        <div className="mn-bibitem-form__row mn-bibitem-form__row--compact">
          <input
            type="text"
            className="mn-bibitem-form__input"
            value={role.description ?? ''}
            placeholder="Description" title="Description"
            onChange={(e) => onRoleDescriptionChange(e.target.value)}
          />
          <input
            type="text"
            className="mn-bibitem-form__input"
            value={role.abbreviation ?? ''}
            placeholder="Abbreviation" title="Abbreviation"
            onChange={(e) => onRoleAbbrevChange(e.target.value)}
          />
        </div>
      </details>

      {entityType === "person" && personEntity !== null ? (
        <>
          <div className="mn-bibitem-form__contributor-row">
            <input
              type="text"
              className="mn-bibitem-form__input mn-bibitem-form__contributor-prefix"
              value={personName?.prefix ?? ''}
              placeholder="Prefix (Dr, Prof…)" title="Prefix (Dr, Prof…)"
              onChange={(e) => onPersonPrefixChange(e.target.value)}
            />
            <input
              type="text"
              className="mn-bibitem-form__input mn-bibitem-form__contributor-surname"
              value={personName?.surname ?? ''}
              placeholder="Surname" title="Surname"
              onChange={(e) => onPersonSurnameChange(e.target.value)}
            />
            <input
              type="text"
              className="mn-bibitem-form__input mn-bibitem-form__contributor-given"
              value={personName?.given ?? ''}
              placeholder="Given" title="Given"
              onChange={(e) => onPersonGivenChange(e.target.value)}
            />
          </div>
          <div className="mn-bibitem-form__contributor-row">
            <input
              type="text"
              className="mn-bibitem-form__input mn-bibitem-form__contributor-initials"
              value={personName?.formattedInitials ?? ''}
              placeholder="Initials (J. R.)" title="Initials (J. R.)"
              onChange={(e) => onPersonInitialsChange(e.target.value)}
            />
            <input
              type="text"
              className="mn-bibitem-form__input"
              value={personName?.completename ?? ''}
              placeholder="…or full name" title="…or full name"
              onChange={(e) => onPersonNameChange(e.target.value)}
            />
          </div>
          <details className="mn-bibitem-form__details mn-bibitem-form__details--inline" open={personEntity.credential.length > 0 || personEntity.identifier.length > 0 || personEntity.contact !== null || undefined}>
            <summary>More person fields</summary>
            <label className="mn-bibitem-form__field">
              <span className="mn-bibitem-form__label">Credentials</span>
              <input
                type="text"
                className="mn-bibitem-form__input"
                value={joinCommas(personEntity.credential)}
                placeholder="Comma-separated (e.g. PhD, P.Eng.)" title="Comma-separated (e.g. PhD, P.Eng.)"
                onChange={(e) => onPersonCredentialsChange(e.target.value)}
              />
            </label>
            <label className="mn-bibitem-form__field">
              <span className="mn-bibitem-form__label">Identifiers (ORCID, ISNI…)</span>
              <input
                type="text"
                className="mn-bibitem-form__input"
                value={joinCommas(personEntity.identifier)}
                placeholder="Comma-separated (e.g. ORCID: 0000-0001-2345-6789)" title="Comma-separated (e.g. ORCID: 0000-0001-2345-6789)"
                onChange={(e) => onPersonIdentifierChange(e.target.value)}
              />
            </label>
            <details className="mn-bibitem-form__details mn-bibitem-form__details--inline" open={personEntity.contact !== null || undefined}>
              <summary>Contact</summary>
              <ContactFields
                contact={personEntity.contact}
                onChange={(field, v) => onPersonContactChange(field, v)}
              />
            </details>
          </details>
        </>
      ) : null}

      {entityType === "org" && orgEntity !== null ? (
        <>
          <input
            type="text"
            className="mn-bibitem-form__input"
            value={orgName}
            placeholder="Organization name" title="Organization name"
            onChange={(e) => onOrgNameChange(e.target.value)}
          />
          <details className="mn-bibitem-form__details mn-bibitem-form__details--inline" open={orgEntity.subdivision.length > 0 || orgEntity.identifier.length > 0 || (orgEntity.logo !== null && orgEntity.logo !== '') || orgEntity.contact !== null || undefined}>
            <summary>More organization fields</summary>
            <label className="mn-bibitem-form__field">
              <span className="mn-bibitem-form__label">Subdivisions</span>
              <input
                type="text"
                className="mn-bibitem-form__input"
                value={joinCommas(orgEntity.subdivision.map((s) => s.name))}
                placeholder="Comma-separated subdivision names" title="Comma-separated subdivision names"
                onChange={(e) => onOrgSubdivisionsChange(e.target.value)}
              />
            </label>
            <label className="mn-bibitem-form__field">
              <span className="mn-bibitem-form__label">Identifiers (GRID, LEI…)</span>
              <input
                type="text"
                className="mn-bibitem-form__input"
                value={joinCommas(orgEntity.identifier)}
                placeholder="Comma-separated (e.g. GRID: grid.419635.c)" title="Comma-separated (e.g. GRID: grid.419635.c)"
                onChange={(e) => onOrgIdentifierChange(e.target.value)}
              />
            </label>
            <label className="mn-bibitem-form__field">
              <span className="mn-bibitem-form__label">Logo URL</span>
              <input
                type="url"
                className="mn-bibitem-form__input"
                value={orgEntity.logo ?? ''}
                placeholder="https://…" title="https://…"
                onChange={(e) => onOrgLogoChange(e.target.value)}
              />
            </label>
            <details className="mn-bibitem-form__details mn-bibitem-form__details--inline" open={orgEntity.contact !== null || undefined}>
              <summary>Contact</summary>
              <ContactFields
                contact={orgEntity.contact}
                onChange={(field, v) => onOrgContactChange(field, v)}
              />
            </details>
          </details>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContactFields — the four contact inputs (uri, address, phone, email)
// ---------------------------------------------------------------------------

function ContactFields({
  contact,
  onChange,
}: {
  readonly contact: ContactInfo | null;
  readonly onChange: (field: keyof ContactInfo, value: string) => void;
}): React.JSX.Element {
  const c = contact ?? { uri: null, address: null, phone: null, email: null };
  return (
    <div className="mn-bibitem-form__contact">
      <input
        type="url"
        className="mn-bibitem-form__input"
        value={c.uri ?? ''}
        placeholder="URI" title="URI"
        onChange={(e) => onChange("uri", e.target.value)}
      />
      <input
        type="text"
        className="mn-bibitem-form__input"
        value={c.address ?? ''}
        placeholder="Address" title="Address"
        onChange={(e) => onChange("address", e.target.value)}
      />
      <div className="mn-bibitem-form__row mn-bibitem-form__row--compact">
        <input
          type="text"
          className="mn-bibitem-form__input"
          value={c.phone ?? ''}
          placeholder="Phone" title="Phone"
          onChange={(e) => onChange("phone", e.target.value)}
        />
        <input
          type="email"
          className="mn-bibitem-form__input"
          value={c.email ?? ''}
          placeholder="Email" title="Email"
          onChange={(e) => onChange("email", e.target.value)}
        />
      </div>
    </div>
  );
}
