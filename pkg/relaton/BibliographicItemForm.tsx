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
  Person,
  Organization,
  BibDate,
  DocStatus,
  Uri,
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

/** Ensure the item has a published date entry. */
function ensurePublishedDate(item: BibliographicItem): BibDate {
  const pub = item.date.find((d) => d.type === "published");
  if (pub !== undefined) return pub;
  return { type: 'published', on: '', from: null, to: null };
}

/** Update the published date's `on` value. */
function setPublishedDateOn(item: BibliographicItem, on: string): BibliographicItem {
  const rest = item.date.filter((d) => d.type !== "published");
  return patch(item, { date: [{ type: "published", on, from: null, to: null }, ...rest] });
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
function emptyOrgContributor(role: string = "publisher"): Contributor {
  return { role, entity: { name: '', abbreviation: null } };
}

/** Create a default empty person contributor. */
function emptyPersonContributor(role: string = "author"): Contributor {
  return { role, entity: { name: { completename: '', surname: null, given: null } } };
}

/** Type guard: is this contributor's entity a Person? */
function isPerson(c: Contributor): boolean {
  return "name" in c.entity && typeof c.entity.name === "object";
}

/** Type guard: is this contributor's entity an Organization? */
function isOrg(c: Contributor): boolean {
  return "name" in c.entity && typeof c.entity.name === "string";
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

/** Change a contributor's role. */
function setContributorRole(item: BibliographicItem, idx: number, role: string): BibliographicItem {
  return updateContributor(item, idx, { ...item.contributor[idx]!, role });
}

/** Change a contributor's entity type (person ↔ organization). */
function setContributorEntityType(item: BibliographicItem, idx: number, kind: "person" | "org"): BibliographicItem {
  const current = item.contributor[idx];
  if (current === undefined) return item;
  const role = current.role;
  return updateContributor(item, idx,
    kind === "person" ? emptyPersonContributor(role) : emptyOrgContributor(role),
  );
}

/** Set an organization contributor's name. */
function setOrgName(item: BibliographicItem, idx: number, name: string): BibliographicItem {
  const c = item.contributor[idx];
  if (c === undefined || !isOrg(c)) return item;
  const org = c.entity as Organization;
  return updateContributor(item, idx, {
    role: c.role,
    entity: { name, abbreviation: org.abbreviation },
  });
}

/** Set a person contributor's completename. */
function setPersonCompleteness(item: BibliographicItem, idx: number, completename: string): BibliographicItem {
  const c = item.contributor[idx];
  if (c === undefined || !isPerson(c)) return item;
  const person = c.entity as Person;
  return updateContributor(item, idx, {
    role: c.role,
    entity: { name: { ...person.name, completename } },
  });
}

/** Update the status stage. */
function setStatusStage(item: BibliographicItem, stage: string): BibliographicItem {
  const current: DocStatus = item.status ?? { stage: null, substage: null, iteration: null };
  return patch(item, { status: { ...current, stage: stage || null } });
}

/** Update the language array (single-value for v1). */
function setLanguage(item: BibliographicItem, lang: string): BibliographicItem {
  return patch(item, { language: lang ? [lang] : [] });
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
// Component
// ---------------------------------------------------------------------------

export function BibliographicItemForm({
  value,
  onChange,
}: BibliographicItemFormProps): React.JSX.Element {
  const [draft, setDraft] = useState<BibliographicItem>(value ?? emptyBibliographicItem());

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
  const publishedOn = ensurePublishedDate(draft).on ?? '';
  const statusStage = draft.status?.stage ?? '';
  const language = draft.language[0] ?? '';

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
            placeholder="e.g. ISO 17301-1:2021"
            onChange={(e) => update(setDocIdValue(draft, e.target.value))}
          />
        </label>
      </div>

      {/* ---- Contributors (repeating list) ---- */}
      <div className="mn-bibitem-form__contributors">
        <div className="mn-bibitem-form__section-header">Contributors</div>
        {draft.contributor.map((c, idx) => (
          <ContributorRow
            key={idx}
            contributor={c}
            onChange={(next) => update(updateContributor(draft, idx, next))}
            onRoleChange={(role) => update(setContributorRole(draft, idx, role))}
            onTypeChange={(kind) => update(setContributorEntityType(draft, idx, kind))}
            onOrgNameChange={(name) => update(setOrgName(draft, idx, name))}
            onPersonNameChange={(name) => update(setPersonCompleteness(draft, idx, name))}
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
        <label className="mn-bibitem-form__field mn-bibitem-form__field--date">
          <span className="mn-bibitem-form__label">Published</span>
          <input
            type="text"
            className="mn-bibitem-form__input"
            value={publishedOn}
            placeholder="YYYY or YYYY-MM-DD"
            onChange={(e) => update(setPublishedDateOn(draft, e.target.value))}
          />
        </label>
        <label className="mn-bibitem-form__field mn-bibitem-form__field--status">
          <span className="mn-bibitem-form__label">Stage</span>
          <input
            type="text"
            className="mn-bibitem-form__input"
            value={statusStage}
            placeholder="e.g. 60"
            onChange={(e) => update(setStatusStage(draft, e.target.value))}
          />
        </label>
      </div>

      {/* ---- Language + Title-language row ---- */}
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
                placeholder="https://…"
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContributorRow — a single contributor in the repeating list
// ---------------------------------------------------------------------------

function ContributorRow({
  contributor,
  onRoleChange,
  onTypeChange,
  onOrgNameChange,
  onPersonNameChange,
  onRemove,
}: {
  readonly contributor: Contributor;
  readonly onChange: (next: Contributor) => void;
  readonly onRoleChange: (role: string) => void;
  readonly onTypeChange: (kind: "person" | "org") => void;
  readonly onOrgNameChange: (name: string) => void;
  readonly onPersonNameChange: (name: string) => void;
  readonly onRemove: () => void;
}): React.JSX.Element {
  const person = isPerson(contributor);
  const org = isOrg(contributor);

  const nameValue = org
    ? (contributor.entity as Organization).name
    : person
      ? (contributor.entity as Person).name.completename ?? ''
      : '';
  const entityType = person ? "person" : "org";

  return (
    <div className="mn-bibitem-form__contributor">
      <div className="mn-bibitem-form__contributor-row">
        <select
          className="mn-bibitem-form__select mn-bibitem-form__contributor-role"
          value={contributor.role}
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
      <input
        type="text"
        className="mn-bibitem-form__input"
        value={nameValue}
        placeholder={entityType === "person" ? "Full name" : "Organization name"}
        onChange={(e) => {
          if (entityType === "person") onPersonNameChange(e.target.value);
          else onOrgNameChange(e.target.value);
        }}
      />
    </div>
  );
}
