# Spec governance conventions

This document is the authority for how the specs in this repository are
governed: cross-referencing, change tracking, and the tooling that enforces
consistency. It supersedes any earlier governance conventions that lived in
session memory.

## 1. Source-of-truth hierarchy

The specs describe a layered architecture. Dependency flows downward:

```
schema.spec.md                 ← source of truth for the document model
        ↑ consumed by
MetanormaProseMirror.spec.md   ← React editor component (mounts ProseMirror)
        ↑ hosts (as a child)
MetanormaToolbar.spec.md       ← schema-bound toolbar UI
        ↑ extended by
AdvancedMetanormaToolbar/      ← six advanced feature areas

EditorCommands.spec.md         ← command library (consumes schema)
pkg/relaton/README.spec.md     ← bibliographic model (consumed by schema;
                                  colocated — see §1.1)
```

When two specs appear to disagree, the lower (more specific) one wins for its
own scope; the schema spec is the root authority for the document model.

### 1.1 Spec placement

A spec lives in one of two places, decided by the release intent of the
package it specifies:

- **Corpus specs** live in `docs/` (the default). This is where specs for
  internal workspace packages and cross-package features belong — e.g.
  `EditorCommands.spec.md`, or the `AdvancedMetanormaToolbar/` suite, which
  spans three packages.
- **Colocated specs** live in the package they specify, at
  `pkg/<pkg>/README.spec.md`. This is the placement for a package intended
  for independent publication: npm always packs `README*` files regardless of
  the `files` field, so every released version bundles its own contract
  snapshot, and an installed version's spec describes exactly that version.

Corollaries of colocation:

- A colocated spec is **self-contained**: it does not enumerate its consumers
  or other packages' integration details. Consumer and integration facts live
  in the repository documentation index (`docs/README.md`).
- Links **into** a colocated spec are ordinary relative markdown links (the
  tooling validates them across both locations). Links **out of** a colocated
  spec resolve within the repository but not inside a published tarball — keep
  colocated specs link-free.

Current placements: corpus — `schema.spec.md`*, `MetanormaProseMirror.spec.md`,
`MetanormaToolbar.spec.md`, `EditorCommands.spec.md`, the
`AdvancedMetanormaToolbar/` suite; colocated — `pkg/relaton/README.spec.md`.

*\* `prosemirror-schema` and `prosemirror-minimap` are also slated for
independent publication; their specs migrate at their own release.*

**Reference documents** (`docs/metanorma-model.md`) are a third kind of
prose: verified, commit-pinned facts about *external* systems that corpus
specs derive from. They are non-contractual input — they sit outside the §1
hierarchy, and a spec citing one derives its own authority from itself. The
tooling sweeps them like any other `docs/**/*.md` file. Reference docs carry
a verification ledger (commit pins + dates); provenance for *their* contents
is Git, as for specs (§2).


## 2. Provenance model: Git, not version numbers

Spec change history lives in Git, not in version numbers or dependency
manifests. Use these commands for provenance:

| Question | Command |
|---|---|
| What changed in this spec? | `git log --oneline -- <spec>.md` |
| When did a line last change? | `git blame <spec>.md` |
| What did the spec look like at a past commit? | `git show <sha>:<spec>.md` |
| What changed in the last edit? | `git diff HEAD~1 -- <spec>.md` |

Specs carry **no `**Spec version:**` or `**Spec dependencies:**` header lines.**
These were removed because they were a hand-maintained cache of information
trivially recoverable from Git, and they generated continuous drift (stale
version claims, a permanent "pending rewrite" backlog, ~25% of doc effort spent
on re-synchronization). The version-manifest mechanism can be reintroduced if
the project ever publishes specs externally or needs formal version pinning; it
is intentionally omitted now as prematurely heavyweight.


## 3. Cross-spec references

When a spec depends on or references another, express it as a **relative
markdown link in body text**, pointing at the relevant section:

```markdown
The schema defines 46 node types ([schema.spec.md](./schema.spec.md) §3.1).
```

Rules:

- Links are **unversioned** — no `v5`, no "verified against version N" claim.
  The link says "this is the spec I mean"; Git says what version it is.
- Every cross-spec dependency **must** be a markdown link. A spec that
  conceptually depends on another but doesn't link to it is a bug — it will be
  invisible to `scripts/spec-impact.mjs` (the reverse-dependency report) and
  won't be flagged for review when the dependency changes.
- Use section anchors (`§N`) where a specific section is meant; bare file links
  are fine for whole-spec references.


## 4. Specs are current-state only; change history lives elsewhere

Specs describe what the system **is**, not how it got there. Three tiers:

1. **Specs — current state only.** No "Recent change" blocks, no
   "previously/prior to" transition prose, no "this revision" framing, no "in vN"
   scope markers. Design rationale ("why this design, not that one") stays in the
   spec as a dedicated subsection (`### Why X`) — it explains a current choice
   and prevents re-litigation.
2. **[`CHANGELOG.md`](./CHANGELOG.md) — curated change records.** Significant
   transitions only. Entry bar: the change spans multiple commits or specs, or
   its narrative isn't recoverable from commit messages. Each entry is
   reverse-chronological, dated, with affected specs and commit SHAs. The
   CHANGELOG is intentionally incomplete — it is a curated selection, not an
   exhaustive log.
3. **`git log` — raw history.** For everything not meeting the CHANGELOG bar.
   `git log --oneline -- <spec>.md` is the first-stop changelog for any
   spec.


## 5. Commit-message convention (advisory)

Spec changes should use the `docs(<area>): <imperative summary>` format:

```
docs(schema): add bibdata/bibitem nodes
docs(toolbar): rename glyph labels to words
docs(commands): specify emptyTextblockBackspace
docs(governance): add CONVENTIONS.md
```

Areas: `schema`, `editor`, `toolbar`, `amt`, `relaton`, `commands`,
`governance`. These are advisory — reinforced by the PR template and human
review, not automatically enforced. They make `git log --oneline -- docs/`
readable as a changelog.


## 6. Markdown style

**Do not use Markdown blockquotes (`>`) for callouts, notes, or emphasis.**
Blockquotes are for actual quotations only. For callout-like content use:

- A **bold lead-in** on a normal paragraph for notes and summaries:

  **Note.** The `section_title` node carries the heading text.

- A dedicated heading (`### Note`, `### Implementation note`) for longer
  asides that belong in the section structure.

This keeps the semantic meaning of blockquotes intact and avoids visually
heavy `>` prefixes that serve no structural purpose.


## 7. Tooling

Two scripts maintain spec integrity. Both are zero-dependency Node scripts under
`scripts/`; both pick up new specs and subpackage docs automatically (no
hardcoded spec lists). They cover every spec location defined in §1.1: the
`docs/` corpus and the colocated `pkg/<pkg>/README.spec.md` files.

### `scripts/check-specs.mjs` — CI gate

Run via `yarn check-specs` (or `node scripts/check-specs.mjs`). Wired into CI
on every PR and push. Validates:

1. **Link integrity** — every relative markdown link in every spec file
   (`docs/**/*.md` and `pkg/*/README.spec.md`) resolves to an existing file.
   Catches renames, moves, and deletes.
2. **Header hygiene** — no spec carries the removed `**Spec version:**` or
   `**Spec dependencies:**` lines (regression guard).
3. **Transition-prose guard** (warnings) — flags patterns that belong in the
   CHANGELOG, not in specs: "Recent change" blocks, "previously/prior to"
   transition narrative, "this revision" framing, bare spec-version scope
   markers ("in v2"), and stale spec-version cross-claims ("schema v5").
   Conservative: avoids false positives on legitimate product-scope markers
   like "out of scope for v1" and `metanorma-standoc ≥ v1.4.1`. These are
   warnings, not errors — they don't fail CI.

### `scripts/spec-impact.mjs` — reverse-dependency report (on demand)

Run via `yarn spec-impact <spec-path.md>` (e.g.
`yarn spec-impact pkg/relaton/README.spec.md`). Prints every doc that links to
the given spec. Use it to find what to review when changing a spec:

```
$ node scripts/spec-impact.mjs pkg/relaton/README.spec.md
Referenced by:
  docs/README.md
  docs/schema.spec.md
```

This recovers the coordination value the old dependency-manifest system provided
— without any bookkeeping, because it's computed from the link graph on demand.
