# Spec governance conventions

This document is the authority for how the specs under `docs/` are governed:
cross-referencing, change tracking, and the tooling that enforces
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
Relaton.spec.md                ← bibliographic model (consumed by schema)
```

When two specs appear to disagree, the lower (more specific) one wins for its
own scope; the schema spec is the root authority for the document model.


## 2. Provenance model: Git, not version numbers

Spec change history lives in Git, not in version numbers or dependency
manifests. Use these commands for provenance:

| Question | Command |
|---|---|
| What changed in this spec? | `git log --oneline -- docs/<spec>.md` |
| When did a line last change? | `git blame docs/<spec>.md` |
| What did the spec look like at a past commit? | `git show <sha>:docs/<spec>.md` |
| What changed in the last edit? | `git diff HEAD~1 -- docs/<spec>.md` |

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


## 4. Change summaries ("What changed" blocks)

When a spec undergoes a substantive change, a prose summary block is encouraged
but not required. Use neutral framing with a **bold lead-in** (not a Markdown
blockquote — blockquotes are for actual quotations):

**Recent change.** The heading model switched from a `title` attribute to a
`section_title` child textblock node.

Do **not** anchor these to version numbers ("What changed in version 3") —
there are no version numbers. The summary is a human-readable note; the
authoritative change history is `git log`.


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
hardcoded spec lists).

### `scripts/check-specs.mjs` — CI gate

Run via `yarn check-specs` (or `node scripts/check-specs.mjs`). Wired into CI
on every PR and push. Validates:

1. **Link integrity** — every relative markdown link in every `docs/**/*.md`
   resolves to an existing file. Catches renames, moves, and deletes.
2. **Header hygiene** — no spec carries the removed `**Spec version:**` or
   `**Spec dependencies:**` lines (regression guard).
3. **Stale-version-reference guard** — flags body-text references that look
   like spec-version cross-claims (e.g. `schema.spec.md v5`, `schema v3`).
   Conservative: avoids false positives on legitimate product-scope markers
   like "out of scope for v1".

### `scripts/spec-impact.mjs` — reverse-dependency report (on demand)

Run via `yarn spec-impact docs/<spec>.md`. Prints every doc that links to the
given spec. Use it to find what to review when changing a spec:

```
$ node scripts/spec-impact.mjs docs/schema.spec.md
Referenced by:
  docs/CONVENTIONS.md
  docs/MetanormaProseMirror.spec.md
  docs/EditorCommands.spec.md
  docs/Relaton.spec.md
  docs/AdvancedMetanormaToolbar/README.md
  docs/README.md
```

This recovers the coordination value the old dependency-manifest system provided
— without any bookkeeping, because it's computed from the link graph on demand.
