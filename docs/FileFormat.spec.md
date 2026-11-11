# Reflect — Document File Format Specification

**Source of truth for the saved document file.** A Reflect document on disk is
a `.mn.json` file: a JSON **envelope** carrying two version numbers and a bare
ProseMirror tree. The tree itself — node/mark vocabulary, open attribute
model, `nodeFromJSON`/`toJSON` behavior — is owned by
[schema.spec.md](./schema.spec.md) §12. This spec owns everything around the
tree: the envelope, the two version axes, the migration registry, and the
read/write obligations of every tool that opens or writes these files.

---

## 1. Purpose and scope

Define the on-disk `.mn.json` file format so that an old file always loads
correctly into a new reader, and a file's interpretation is knowable from the
file itself. In scope: the envelope structure, version axes, legacy-file
detection, the migration registry contract, and failure semantics — for every
consumer (editor GUI, the future Semantic-XML converter, validators). Out of
scope: the tree contract ([schema.spec.md](./schema.spec.md) §12), the editor
component API, and asset storage (§9).

The format exists because tree reshapes recur: editor coverage of the
Metanorma document model grows mostly additively, but occasional reshapes are
breaking, and files outlive the builds that wrote them. Without in-file
versioning, every reshape forces either a hand migration of stored files (the
failure mode this format eliminates) or silent attrition of old documents.

---

## 2. Version axes

Four version-like axes govern a Reflect document; exactly two live in the
file. They are never conflated:

| Axis | What it counts | Where it is recorded | Authority |
|---|---|---|---|
| **Envelope version** (`format.envelope`) | File layout: envelope structure, encoding, where image data lives | In the file | This spec |
| **Tree version** (`format.tree`) | ProseMirror tree: node/mark types, attrs, content expressions | In the file | This spec (vocabulary itself: [schema.spec.md](./schema.spec.md) §3) |
| Editor build provenance | Which Reflect build produced a file | Git ([CONVENTIONS.md](./CONVENTIONS.md) §2); echoed non-normatively in `meta.generator` (§3) | The repository |
| Upstream grammar pins | Which Standoc grammar snapshot the document model was verified against | The verification ledger, [metanorma-model.md](./metanorma-model.md) §1 | The reference document |

The two in-file axes are plain integers, monotonically increasing, starting
at 1. Neither is the Metanorma model version: the upstream grammar is versioned
by its own ledger and never appears inside a file — `format.tree` counts the
editor's tree vocabulary, not the Standoc RNG.

**Why in-file numbers despite §2 of CONVENTIONS.** Specs carry no version
headers because Git is their provenance; a hand-maintained version cache in
prose only drifts. Files are the opposite case: machine-interchange artifacts
that must survive across builds, machines, and repositories, where no Git
history travels with them. A number embedded in the artifact is the only
provenance the artifact always carries.

---

## 3. Envelope

```jsonc
{
  "format": { "envelope": 1, "tree": 1 },
  "meta": { "generator": "Reflect 0.1.3" },
  "doc": { "type": "doc", "content": [ /* bare tree, schema.spec.md §12 */ ] }
}
```

Members:

- `format` — required. An object whose members `envelope` and `tree` are
  required integers ≥ 1. These two numbers are the axes of §2.
- `doc` — required. The bare tree: exactly the JSON a ProseMirror
  `doc.toJSON()` emits ([schema.spec.md](./schema.spec.md) §12).
- `meta` — optional for readers; writers SHOULD emit it. Members are
  free-form and non-normative: readers preserve them verbatim and MUST NOT
  branch on any `meta` content. `meta.generator` is a `<product> <version>`
  string naming the writing build — provenance for humans debugging files,
  never an input to load behavior.
- `assets` — **reserved, absent.** No envelope-version-1 file carries an
  `assets` member, and no reader synthesizes one. A future envelope version
  defines it (an asset manifest for extracted image blobs and their storage
  references); readers of earlier versions never see it.

**Unknown top-level members.** The top level of the envelope is defined by
this spec. A reader preserves any foreign top-level member verbatim and
re-emits it on save; it never interprets one. This mirrors the tree's
nothing-silently-dropped rule ([schema.spec.md](./schema.spec.md) §12) at the
file layer, and lets informational members be added without a version bump.
Any member that changes how an existing reader must interpret the file is by
definition a new envelope version, not a foreign member.

**Writer key order.** `format`, `meta`, `assets?` (future), `doc` —
recommended for writers so files diff cleanly; readers are order-insensitive.

**Disjointness.** The envelope top level never carries `type: "doc"`: the
envelope and legacy shapes (§4) remain trivially distinguishable, which is
what keeps detection cheap and lazy migration safe.

---

## 4. Legacy files

A parsed plain object with `type` equal to `"doc"` and no `format` member is
a **legacy file**: the bare tree, unwrapped — the shape every writer emitted
before the envelope existed. Legacy files remain loadable indefinitely.

A reader treats a legacy tree as the **current** tree version: an identity
migration, no era inference (a non-goal, §9). A legacy file is re-encoded in
the envelope only when it is next saved (lazy migration); readers never
rewrite files.

**Why identity, not era inference.** An unversioned tree cannot be dated —
two bare trees written months apart are indistinguishable — so any
era-specific recovery would be guesswork. None is needed: the tree's open
attribute model ([schema.spec.md](./schema.spec.md) §12) banks every
attribute the current vocabulary no longer declares into the node's `data`,
so a legacy tree loaded under a newer vocabulary degrades to a banked
(recoverable) extra, never a silent drop.

**Why the envelope landed while the legacy population is empty.** Detection
stays unambiguous only while essentially no real documents exist: every
unversioned file written adds one more document whose era must later be
inferred from content. The rule above is cheap precisely because it is
adopted early.

---

## 5. Read obligations

The load chain, for every consumer. This spec's obligations begin at the
parsed value; a JSON parse failure precedes them and stays the caller's
concern.

1. **Detect.** `format` member present ⇒ envelope file (§8 validation
   follows, whatever else the object carries — `format` takes precedence).
   Else `type` equal to `"doc"` ⇒ legacy file. Anything else ⇒ `NotADocument`.
2. **Validate the envelope.** `format` must be an object with integer
   members `envelope` ≥ 1 and `tree` ≥ 1; anything else ⇒ `MalformedEnvelope`.
   A present-but-malformed `format` never falls back to legacy handling.
3. **Compare versions.** `envelope` greater than the reader's current ⇒
   `FutureEnvelope`; `tree` greater ⇒ `FutureTree`. Future files are refused
   outright — their semantics are unknowable, and heuristic loading is the
   silent-corruption failure mode this format exists to prevent.
4. **Envelope migrations.** Run the registered envelope chain from the
   file's `envelope` to the reader's current (§7). Steps are async and may
   perform I/O, only through an adapter the caller injects.
5. **Tree migrations.** Extract `doc` and run the registered tree chain from
   the file's `tree` to the reader's current (§7). Steps are sync and pure.
   The envelope chain runs first because it owns where the tree lives;
   migration composition is always envelope-then-tree.
6. **Load the tree.** Hand the migrated tree to the schema:
   `nodeFromJSON` with the contracts of [schema.spec.md](./schema.spec.md)
   §12, unchanged.

A legacy file skips steps 2–5: its tree is used as-is, at the current tree
version, and goes straight to step 6.

---

## 6. Write obligations

- Writers always write **current** versions on both axes, stamped on the
  envelope at save time from the library's version constants. Version
  stamping happens on the envelope only — never in editor state, never as a
  ProseMirror transaction.
- The `doc` member is exactly the editor's `doc.toJSON()` output
  ([schema.spec.md](./schema.spec.md) §12); a writer never annotates the
  tree with version data.
- Writers SHOULD emit `meta.generator` (§3).
- Foreign top-level members captured at load are re-emitted verbatim.
- No writer emits `assets` at envelope version 1.

### Why not a doc attribute

The tree version could have lived on the `doc` node (e.g.
`doc.attrs.version`), one axis could have counted everything, and the
envelope would be unnecessary. Rejected, deliberately:

1. **Storage layout is inexpressible in the ProseMirror schema.** An
   `image.src` string holds an inline `data:` URI and a future
   `mn-asset://` reference identically; a change the schema cannot
   distinguish is not a tree change and needs its own axis.
2. **Tree migrations must stay pure.** Tree rewrites are plain
   JSON→JSON functions, testable without mocks or I/O fakes (§7); storage
   migration legitimately needs I/O. One axis cannot host both without
   entangling them.
3. **A per-save attribute write is a transaction.** Stamping a version into
   the tree on every save pollutes undo history; envelope stamping touches
   no editor state at all.
4. **Tree-only consumers stay simple.** The converter and validators read
   `doc` and ignore envelope concerns; the tree version they care about sits
   beside the tree, not inside it.

---

## 7. Migration registry

Migrations are a **code registry**, not a data manifest: a JSON manifest of
operations becomes its own DSL with its own parser and tests, while code is
typechecked, unit-testable, and greppable. The registry is an exported
structure of the `@metanorma/file-format` package; this section is its
contract.

**Tree migrations.** One registered step per version transition N → N+1. A
step is a map from type name (node types, and mark names for marks) to a
**strategy** — a sync function `(node, ctx)` returning the replacement node,
where `ctx` carries ancestry (parent type, index), so parent-scoped reshapes
(a caption moving from attr to child node) have the context they need — plus
an optional doc-level hook. Types without a registered strategy pass through
unchanged. Purity rules: no I/O (the sync signature is the structural
guarantee), no clock or randomness, no mutation of input; a step returns a
fresh tree.

**Envelope migrations.** One registered step per envelope transition N →
N+1. Async, whole-envelope to whole-envelope, and may perform I/O **only
through an adapter object injected by the caller** — tests inject fakes; the
GUI injects its storage adapter. No step exists at envelope version 1; the
contract exists so the first storage-layer change (asset extraction, an
encoding change) lands without touching tree logic.

**Contiguity.** Registered steps on each axis must be contiguous
1 … current. The library self-checks its registry, and a gap is a load-time
error naming the missing transition — migration chains fail loud, never
approximate.

**Baseline.** Both chains are empty; the current versions are `envelope: 1`
and `tree: 1`. The mechanism — not any migration — is the deliverable; the
first real migration ships with the first real reshape.

**Bump rules.** The tree version bumps when a document written by an older
writer, loaded under the current schema without migration, would be
**wrong** — lossy or misinterpreted — not merely incomplete: additive
vocabulary (node types an old document simply lacks) bumps nothing, because
old documents still load correctly. The envelope version bumps when an older
reader would misinterpret the file layout. Every bump ships with its
migration step in the same change.

---

## 8. Failure semantics

Error classes exported by the library; consumers surface their messages
(e.g. on the GUI status line):

| Error | Fires when | Guarantee |
|---|---|---|
| `NotADocument` | The parsed value is neither shape: a number, array, `null`, or an object with no `format` and no `type: "doc"` | Refused before any migration runs |
| `MalformedEnvelope` | `format` present but not an object, or `envelope`/`tree` missing, non-integer, or < 1 | Refused; never falls back to legacy handling |
| `FutureEnvelope` | `format.envelope` greater than the reader's current | Refused; message names file and reader versions |
| `FutureTree` | `format.tree` greater than the reader's current | Refused; message names file and reader versions |
| Registry-gap error | A registered chain is non-contiguous | Refused at load; names the missing transition |

A migration step that throws propagates as the load failure, wrapped with the
step's version transition. Structural failures after migration are the
schema's stock `RangeError` contracts ([schema.spec.md](./schema.spec.md)
§12), unchanged by this spec.

---

## 9. Non-goals

- **Asset/blob storage** (OPFS or otherwise). The `assets` member is
  reserved (§3); implementing it — extraction, manifests, storage
  references — is a future envelope version and out of scope here.
- **Collaborative editing.** Step-based collaboration needs in-tree or
  snapshot versioning of a different kind; the current axes are file-level.
  Revisit when collab lands.
- **Era inference for legacy files.** A legacy tree is the current tree
  version (§4); no content sniffing, ever.
- **Compression and non-JSON encodings.** A future envelope version's
  concern, not this one's.

---

## 10. Acceptance criteria

Covered by the `@metanorma/file-format` suite (`pkg/file-format`,
`node --test test.mjs`):

1. `yarn workspace @metanorma/file-format compile` succeeds with **zero**
   TypeScript errors under the repo tsconfig.
2. **Detection truth table** (§5 step 1): bare tree, valid envelope, number,
   array, `null`, object with neither shape, and an object carrying both
   `type: "doc"` and `format` (envelope path wins) — each classified as
   legacy / envelope / `NotADocument` exactly as §5 specifies.
3. **Envelope validation** (§5 step 2): each `MalformedEnvelope` row of §8
   fires on its trigger — non-object `format`, missing member, non-integer,
   value < 1 — and never falls back to legacy.
4. **Stamp round trip** (§6): encoding writes the current versions and a
   `doc` deep-equal to its input; the input tree object is not mutated.
5. **Decode** (§5): an envelope at current versions yields the `doc` member
   unchanged; a legacy file yields its tree as-is (both chains are empty at
   baseline).
6. **Future versions** (§5 step 3): `FutureEnvelope` and `FutureTree` fire
   on greater-than-current values with both versions named; nothing loads.
7. **Foreign members** (§3): an unknown top-level member survives a
   load→save round trip verbatim.
8. **Real-schema round trip** (§5 step 6): a golden enveloped fixture
   decodes and loads through `metanormaSchema.nodeFromJSON` without
   throwing (the schema package is a dev-only cross-check dependency).
9. **Registry contiguity** (§7): a deliberately gapped chain is rejected by
   the self-check with the missing transition named.
