/**
 * Public API for `@metanorma/relaton`.
 *
 * Implements [`docs/Relaton.spec.md`](../../docs/Relaton.spec.md) **v1** —
 * a deliberate subset of the Relaton bibliographic model, with pure derivation
 * helpers and a PM-doc walker. No ProseMirror dependency, no React dependency,
 * no XML/YAML parsing.
 *
 * Consumed by:
 * - `@metanorma/toolbar` — `<BibliographicItemForm>` + eref picker.
 * - `@metanorma/prosemirror-editor` — `bibdata` / `bibitem` NodeViews.
 * - `editor-gui` — Sidebar metadata button.
 */

// Types (§2)
export type {
  BibliographicItem,
  TypedTitle,
  DocId,
  Contributor,
  ContributorEntity,
  Role,
  Person,
  PersonName,
  Organization,
  Affiliation,
  ContactInfo,
  BibDate,
  DocStatus,
  Stage,
  Copyright,
  Classification,
  Validity,
  Uri,
} from './types.js';

export { emptyBibliographicItem } from './types.js';

// Pure derivation helpers (§3)
export {
  primaryDocid,
  citeas,
  mainTitle,
  formatContributor,
  primaryAuthor,
  label,
} from './helpers.js';

// Document walker (§4)
export { collectBibliographyItems } from './collect.js';

// Form component (React, peer-dep)
export { BibliographicItemForm } from './BibliographicItemForm.js';
export type { BibliographicItemFormProps } from './BibliographicItemForm.js';
