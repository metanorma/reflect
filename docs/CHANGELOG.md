# Spec changelog

Curated records of significant spec transitions. Not every spec edit appears
here — routine changes are in `git log`. Entry bar: the change spans
multiple commits or specs, or its narrative isn't recoverable from commit
messages. See [CONVENTIONS.md](./CONVENTIONS.md) §4.

---

## 2026-11-13 — commands: Backspace on empty section titles; body-empty walk; single-step typed re-seeds

`docs/EditorCommands.spec.md` §1.6.3/§4.4.8/§4.4.9/§4.7.2/§4.7.3/§4.10 +
`@metanorma/editor-commands`; **Commits: *(pending)***.

- **Change** — §4.4.9 now codifies the implemented two-case guard: an empty
  `section_title` over a **meaningful body** deletes the title only; an
  **effectively empty** section (no body children, or only empty paragraphs)
  is deleted whole, with the §4.7.3 landing rules. §4.4.8's central rule
  gains the **body-empty** definition (no children, or only the
  `section_title`), implemented by the container-stack walk: a section whose
  last body block is deleted no longer no-ops at the document start.
  Re-seeds of emptied non-deletable containers are now **single-step typed
  replacements** — `clause` in `sections`, `content_section` in `preface`,
  `references` in `bibliography`, each `(section_title, empty paragraph)`
  with a fresh `id` — fixing three defects: the default-attrs remnant clause
  a delete-then-insert re-seed left behind (id lost to the transform's
  structure-preserving refill), the dropped `clause` re-seed in `preface`
  (schema-inadmissible there, leaving an invalid caret at doc position 0),
  and the stale refuse-at-non-deletable-container narrative in §4.4.8/§4.7
  (the walk re-seeds, it does not refuse). Covered by the new
  `backspace.test.mjs` suite (BST1–BST4, BST2a–BST2c, BS4, BP3, BS3).

---

## 2026-11-12 — document format: versioned `.mn.json` envelope, two version axes

`docs/FileFormat.spec.md` (new corpus spec) + `@metanorma/file-format` (new
package) + `pkg/editor-gui/fileIo.ts`; `docs/schema.spec.md` §3/§12,
`docs/CONVENTIONS.md` §1.1/§5, `docs/README.md`, editor-gui e2e; the ISO
sample pair relocated to `pkg/file-format/fixtures/legacy/`; **Commits:
*(pending)***.

- **Change** — a saved `.mn.json` file is now an **envelope**: two in-file
  integer version axes — `format.envelope` (file layout: envelope
  structure, encoding, where image data lives) and `format.tree` (the
  ProseMirror tree vocabulary) — a non-normative `meta` block
  (`meta.generator`, a free-form `<product> <version>` provenance string
  readers never branch on), and the bare tree as the `doc` member. Open
  decodes through the FileFormat.spec.md §5 read chain; Save encodes at
  current versions only (§6) — versions are stamped on the envelope at save
  time, never in the tree, never as a ProseMirror transaction.
- **Legacy rule** — unversioned bare trees remain loadable indefinitely and
  re-encode lazily on next save; mis-era loads degrade to `data`-banked
  attributes (schema.spec.md §12), never silent drops. Era inference is a
  non-goal: a legacy tree is the current tree version, full stop.
- **Why an envelope, not a `doc` attribute** — four rejections recorded in
  FileFormat.spec.md §6 ("Why not a doc attribute"): storage layout is
  inexpressible in the PM schema; tree migrations must stay pure while
  storage migration needs I/O; a per-save attribute is a transaction
  polluting undo history; tree-only consumers read `doc` and ignore
  envelope concerns.
- **Migration machinery, empty baseline** — the registry ships with zero
  steps on both axes: tree steps are sync and pure (the signature is the
  guarantee), envelope steps async with adapter-only I/O; chains must be
  contiguous, and decode self-checks the registries in use on every load.
  The mechanism, not any migration, is the deliverable — the first real
  reshape ships with its bump.
- **Bump discipline** — schema.spec.md §3 binds vocabulary reshapes to a
  `format.tree` bump + migration step in the same change; bump rules are
  reader-harm tests (bump when an older document would load **wrong**, not
  merely incomplete — additive coverage bumps nothing).
- **Consumer + coverage** — editor-gui extracts `fileIo.ts`
  (`useMnFileIo`): Open's single catch funnels parse errors, the §8
  taxonomy, and post-decode structural errors to one status-line message;
  preserved meta/foreign members ride the session and re-emit on save —
  assigned only after rehydration returns, so a failed load's meta never
  leaks into the next save. The package suite covers FileFormat.spec.md
  §10's criteria (detection, malformed/future refusal, stamp round-trip,
  registry contiguity, real-schema loads of both goldens); the editor-gui
  `file-io` e2e pins save shape, session carry, and the ordering guard
  end-to-end through forced `browser-fs-access` fallbacks.

---

## 2026-11-11 — GUI build: PnP bridge deleted, esbuild native resolution

`build-gui.mjs` + `pkg/editor-gui/README.md` + `docs/ProseMirrorMinimap.spec.md`
(harness table); build-infra change, no app-source changes. **Commits: *(pending)***.

- **Decision** — `build-gui.mjs` drops its hand-written PnP bridge (the
  `onResolve`/`onLoad` plugin that routed bare specifiers through
  `createRequire` and read inputs from the PnP zip archives, plus the
  `.cjs`→`.mjs` entry redirect) and relies on esbuild's native PnP support.
  Citations, each for what it says: v0.15.0 (2022-08-10 — the PnP resolution
  algorithm, zip reading, `module`/`browser` fields inside zips); v0.15.4
  (#2473 — exports maps honored under PnP, i.e. condition-based entry
  selection); Yarn's `@yarnpkg/esbuild-plugin-pnp` README ("Starting from
  Esbuild 0.15, this plugin isn't needed anymore"); Storybook removed its
  copy in Nov 2025 (PR #33097).
- **Consequence** — bundle contents change, not just plumbing: native
  `import`-condition selection picks ESM builds for dual-layout packages
  that the old same-path `.cjs`→`.mjs` redirect never covered, and
  `bootstrap.js` lands ≈100 KB (≈8%) below the plugin build. The e2e suite
  (its `webServer` builds via the same script) is the behavioral gate.
- **Scope** — `build-panel-layout.mjs` (its bridge is entangled with the
  demo's externals handling) and `build-minimap-demo.mjs` keep their
  bridges; the minimap harness table above no longer claims parity with
  the GUI build (current-state wording: its own plugin), pending the same
  migration there.

---

## 2026-11-09 — Upstream ledger: error-ID registry recorded; drift watch extended

`docs/metanorma-model.md` + `scripts/check-pins.mjs`; docs + job config,
no code changes. **Commits: `caed2835`, `b735513b`**.

- **Ledger** — metanorma-model.md gains §7 (Error IDs): the `PREFIX_NN`
  citation scheme (`STANDOC_NN` content checks; `RELATON_NN`, `METANORMA_NN`,
  `ISODOC_NN`, flavour forms) — an occurrence names a check, not a message.
  A scoped re-verification at the unmoved §1 pins covered the normative
  registry (`lib/metanorma/converter/log.rb`, `STANDOC_LOG_MESSAGES`: code →
  category, message template, severity) and the public validation page
  (unpinned — error-ID scheme, categories, severity scale, filtering).
- **Watch** — the registry path joined the drift job's fail tier
  (cite-driven, per the sensitivity-map contract), completing §7's watch
  coverage under the same-PR rule.

---

## 2026-11-05 — Validity oracle: the models-layer grammar composition, not the vendored runtime chain

`docs/schema.spec.md` + `docs/metanorma-model.md` + `docs/README.md`;
docs-only, no code or schema changes. **Commits: *(pending)***.

- **Decision** — schema.spec.md gains **§1.2 "Validity oracle"**: a document
  is valid Semantic XML iff it satisfies the composed Semantic grammar at the
  grammar-sources layer — the composition rooted at
  `standoc-models → grammars/standoc-compile.rnc` (structural +
  bibliographic/Relaton + requirements + mathematical/MathML layers; include
  graph and pins stated once in metanorma-model.md §1/§3). The vendored
  runtime chain `lib/metanorma/validate/standoc-compile.rng` is demoted to a
  watched compiled snapshot of that composition — a build artifact of the
  model, not its definition (it lags the sources at the basicdoc layer —
  ledger §4 — and its compiled model admits presentation-only constructs —
  ledger §2). The spec header, §1.1, and the §17 intro now defer to §1.2.
- **Why** — the sources are the artifact upstream edits when the model
  changes; the snapshot is a compiled copy on a lagging vendoring cadence, so
  keying the §1.1 guarantee to it would key the spec to upstream packaging
  state (the `isodoc-compile.rng`→`standoc-compile.rng` filename churn being
  the visible symptom). Coverage expansion (requirements, deeper
  bibliography, structured mathematics, a flavour target) now grows inside
  the oracle via §17 coverage rows; §1.2 is not reopened per feature. Four
  structural exclusions are recorded with re-entry triggers (presentation:
  never; flavours: on a declared flavour target; collections: if authored;
  the snapshot: never — watched for convergence by the drift job, not
  adopted).
- **Ledger** — metanorma-model.md §3 gains "The composition root" paragraph
  (the single full enumeration: `standoc-compile.rnc` = `biblio-standoc.rnc`
  + `standoc.rnc`; `basicdoc.rnc` → MathML external; relaton-models;
  metanorma-requirements-models; the `relaton-*-compile.rnc` wrapper
  pattern; flavour/collection/presentation layers); §1 gains a "Compile
  twins" note (`.rnc` composition root vs `.rng` gem snapshot); a scoped
  re-verification paragraph records the MathML finding at the unmoved pins:
  the six gem-side MathML `.rng` were embedded June–July 2026 (#1195 MathML
  3 → #1214 MathML 4, `15ccdb4` 2026-07-16), untouched since — and untouched
  by the 2026-10-01 refresh — while `basicdoc-models → grammars/mathml/` is
  byte-identical across every tracked submodule pin, so **no mathml lag**
  exists; direct compile-provenance is unverified-but-immaterial.
- **Pointers** — the ledger header and `docs/README.md` upstream-reference
  pointers move from "§1.1/§17" to "§1.1–§1.2/§17".

---

## 2026-10-16 — Figure body as a typed slot: schema-enforced XOR, whole-body image fill, placeholder-click selection

Multi-spec, multi-package feature (schema.spec.md, images-figures.md,
EditorCommands.spec.md, MetanormaProseMirror.spec.md; prosemirror-schema,
editor-commands, prosemirror-editor, editor-gui). **Commits: *(pending)***.

- **Schema** — `figure.content` tightened from `(image | block)*` to
  `figure_name? (image | paragraph+ | figure+)?`: Standoc's `FigureBody`
  single-occurrence XOR (image XOR paragraph run XOR subfigure run) is now a
  schema-level invariant rather than an export coercion; the §17.6 figure
  entry is retired (no export coercion for figures remains), generic blocks
  are no longer admitted in figure bodies, and empty-slot figures (the
  seeded/recovery state) are valid. Enforcement boundaries documented from
  probes: `tr.step` validates post-step documents in prosemirror-transform
  ≥1.12 (raw invalid steps throw `TransformError`); fitting helpers repair
  (re-homing displaced content into new sibling figures — "fission") or
  refuse; `nodeFromJSON` is the one lenient surface (invalid stored figures
  load silently, caught only by `doc.check()`).
- **Commands** — `insertImageIntoFigure` rewritten as a whole-slot
  `replaceRangeWith` over the figure's entire body range (the only shape
  that never fissions), with verdicts: `fill` (empty body), `replace`
  (paragraph run — silent, undoable), refuse (image present → one-image
  rule; `figure+` run → subfigure protection). The bespoke `targetFigure`
  ancestor walk is gone; `canInsertImageIntoFigure` is the slot predicate.
  `exitName`'s no-sibling branch splits: empty body → paragraph branch
  inside; image atom next → exit OUTSIDE the figure. `exitContainerBlock`
  lift targets validated via a new shared `paragraphExitAfter()` helper
  (walks past enclosing `figure+` runs to a paragraph-admitting position).
  `createParagraphNear` becomes a stock-first custom wrapper: Enter on a
  node-selected `image` (stock insertion schema-illegal beside it) routes
  through the exit walk; `formula` behavior unchanged (§2.10 A1 → A1a/A1b).
- **Editor** — new `figureSlotClickPlugin`: single click on the empty-figure
  placeholder node-selects the figure (previously triple-click only),
  enabling the Image button with the figure explicitly targeted.
- **Latent bugs found (previously untested paths)** — `exitContainerBlock`'s
  last-block check compared content ends that always differ by the
  textblock's close token (the command could never fire); its lift position
  was used un-mapped after a deletion. Both fixed; first unit coverage.
- **Tests** — schema figure-shape acceptance/rejection matrix (+ leniency
  contract); standing `doc.check()` validity gates after every dispatched
  transaction in editor-commands tests; new `figureSlot.test.mjs` locking
  the whole-body/fission/enforcement-boundary facts; e2e for
  placeholder-click selection, text-branch silent replace, Enter on
  node-selected image, and imported-subfigure documents.

---

## 2026-11-05 — Image sizing axis: model compliance + UX, end to end

Multi-spec, multi-package feature (schema.spec.md, images-figures.md,
MetanormaProseMirror.spec.md, metanorma-model.md, AdvancedMetanormaToolbar
README; prosemirror-schema, editor-commands, prosemirror-editor, toolbar,
editor-gui). **Commits: *(pending)***.

- **Upstream ledger** — scoped re-verification of the figure/image size
  family at the §1 pins (trigger: this work needed the `figure/@width` slot
  recorded): `figure` carries free-text `width` **and** `height` (standoc
  combine); standoc's include-block redefinition of `ImageAttributes` makes
  `MediaAttributes` optional-as-a-whole (altsource delegation); converter
  emits `auto` actively for absent image dims and its own keyword output is
  grammar-invalid at the image slot — `figure/@width` is the conformant
  keyword home. Size-family drift bullet + §1 stamp added; the drift job's
  fail tier gained the three newly cited paths.
- **Schema** — `image` gains `mimetype`/`width`/`height` + the first adopted
  `x-` pair (`x-natural-width`/`-height`, §6 rule 5 five-point declaration);
  `figure` gains the role enum `width`. New §17.8: import-normalization
  table, export contract (explicitly contract-documentation — no converter
  exists in-repo), banked-original rules (image dims conformance-gated;
  figure free-text slots re-emit verbatim), role⇔size exclusion as a
  command-level invariant. New `imageAttrs.ts` (`normalizeImageSize`,
  `isForeignSizeValue`, `normalizeFigureWidth`, total `inferMimetype` +
  `UNKNOWN_MIMETYPE` marker, `formatImageSize` plain-decimal at any
  magnitude, grammar-faithful `isImageSizeConformant`) with a widened
  single-node shape guard. toDOM/parseDOM carry the symmetric `data-*` set
  with `data` banking; CLASS gains the two role modifiers.
- **Editor** — node views paint authored size inline and the role class;
  `document.css` keeps the base cap as default, adds `object-fit: contain`
  and the two role analogues (no page-geometry constants anywhere).
  Insertion captures mimetype + natural size at commit (fail-soft, timeout-
  raced); new idle backfill plugin (data-URI-only scope, per-src failure
  memo, live-state re-find, `addToHistory: false`).
- **Toolbar** — new Size popover (`ImageSizingPopover`) backed by
  `updateImageAttrs` (sizing scope realized; src/alt editing still deferred):
  one transaction, exclusion enforced; popover fields reset on close.
- **Infra** — Yarn-4 fix: inert `pretest` hooks replaced with explicit
  `yarn compile &&` chaining (schema, editor-commands; prosemirror-editor
  gains its first test script, clearing the long-standing check-specs §4.1
  warning). Tests: 87 schema, 86+ editor-commands (images suite added), 5
  prosemirror-editor, and a new editor-gui `image-sizing.spec.ts` (12 e2e:
  parseDOM banking, paint, popover exclusion flows, backfill incl.
  history-invisibility, dialog capture incl. both §17.4 inference
  populations).

---

## 2026-11-03 — Upstream ledger re-pin: one id-generation change; grammars and vendoring unmoved

`docs/metanorma-model.md` re-pin; **Commits: *(pending)***. Trigger: the
ledger's own policy — the metanorma-standoc release run `v3.5.1`–`v3.5.7`
advanced past the release-trigger pin.

- **Pins** — metanorma-standoc `78bb1347` → `ba325b0e` (main), metanorma
  `e9a3bc18` → `de1e757d`, isodoc `9d02f55f` → `cbbdc3b1`. Grammar sources
  unmoved (standoc-models still `7d5d737c`, submodule `3b408b71`) and the
   vendored runtime grammars byte-identical to the 2026-10-27 verification —
  no vendoring pass since the 2026-10-01 flip, so the §4 vendored-runtime
  lag persists; §3/§4 source facts stand as verified.
- **One drift** — standoc `2f3d7e87` (2026-10-31, "Generate internal
  identifiers from the buffered Metanorma::Utils pool"): `id_attr` now
  generates placeholder ids via `Metanorma::Utils.random_uuid` (buffered
  v4-UUID pool in metanorma-utils ≥ 2.0.10) instead of per-call
  `UUIDTools::UUID.random_create` entropy — a performance change; the
  `"_" + UUID` placeholder shape and the whole §5 lifecycle (contenthash
  rewrite, anchor resolution) are unchanged. §5 updated.

---

## 2026-10-27 — Upstream ledger re-pin: vendoring flip landed; grammar sources unmoved

`docs/metanorma-model.md` re-pin (plus one rename in `docs/schema.spec.md`);
**Commits: *(pending)***. Trigger: the ledger's own policy — the
metanorma-standoc October prerelease run (`v3.5.1.pre.alpha.1–3`) advanced
past the release-trigger pin.

- **Pins** — metanorma-standoc `38a50557` → `78bb1347` (main), metanorma
  `a62ca5a8` → `e9a3bc18`, isodoc `92b3d2b0` → `9d02f55f`. Grammar sources
  did not move: standoc-models main is still `7d5d737c` (basicdoc submodule
  `3b408b71`), so §3/§4's source facts stand as verified — no source drift
  this cycle.
- **Vendoring flip landed** — the gem's 2026-10-01 refresh (commit
  `80892abc`) completed the models-side rename through the runtime tree:
  `lib/metanorma/validate/` now ships `standoc-compile.rng` → `standoc.rng`
  → `reqt.rng` + `basicdoc.rng` and `schema_file` returns
  `standoc-compile.rng`; the `isodoc.*` filenames are gone. But the refresh
  was cut from release tag `v2.3.0` (2026-08-17, submodule `50fe9e85` —
  pre-PR #46), so the vendored basicdoc content is byte-identical to the
  pre-flip state and the §4 vendored-runtime lag (no `reg-attribute` /
  `variable-ref` at runtime; source-vs-runtime split on PR #46 basicdoc
  constructs) persists through the flip.
- **Engine swap** — RelaxNG validation moved from ruby-jing to leptris
  (commit `27afe5e1`, 2026-10-14); §2 records the new engine and §5's
  `id_check: false` note is reworded (leptris has no DTD-compatibility ID
  check to disable).
- **Corpus rename** — `docs/schema.spec.md` header and §17 now say
  `standoc-compile.rng` (two references); dated history entries in this
  file stand as written.

---

## 2026-10-16 — governance: acceptance-criteria contract (CONVENTIONS §4.1), dispatch-verification + assertion-discipline rules, check-specs coverage warning

`docs/CONVENTIONS.md`, `CONTRIBUTING.rst`, `scripts/check-specs.mjs`;
**Commits: *(pending)***. Governance follow-ups distilled from the
`MetanormaSchema` integration review.

- **Acceptance-criteria contract** — new CONVENTIONS §4.1: every numbered
  criterion in an `Acceptance criteria` section is covered in the package
  the spec governs, as the criterion itself specifies (a compile criterion
  by a green `yarn workspace <pkg> compile`; a criterion naming a test by
  that test); a spec whose governing package has no test suite is
  incomplete at review. Naming a covering test inside a criterion is
  compliant — prohibited is a per-criterion test-file index in the spec;
  the criterion→test mapping lives in the package's suite. Second rule: no
  untested spec claims in code docstrings; pointers to spec sections are
  plain text (`schema.spec.md §12.1`), not relative markdown links
  (publication-slated packages would ship rotting relative paths).
- **Design-time dispatch verification** — `CONTRIBUTING.rst`
  "Integration surfaces" now scopes the verify-against-installed-zips rule
  to design time: before specifying a subclass, wrapper, hook, or override,
  confirm the dispatch point in the installed dist (prototype method vs.
  constructor-assigned own property) and record the fact in a code comment
  where relied upon.
- **Assertion discipline** — `CONTRIBUTING.rst` "Verification": unit tests
  of library-mediated serialization assert against observed behavior
  (key-order-insensitive deep equality, or verify serialization facts
  first), with the carve-out that when serialization shape is itself the
  contract (`tableWidths.ts` string stability, `roundtrip.test.mjs`
  exact-shape), it is pinned explicitly with stringify equality.
- **Inventory corrected** — the workspace inventory now records five
  unit-tested packages (`editor-commands`, `panel-layout`,
  `prosemirror-minimap`, `relaton`, `prosemirror-schema`); the
  `prosemirror-schema` ("no tests") and `panel-layout` ("e2e only") rows
  were stale.
- **check-specs check 4** (warnings) — an acceptance-criteria section that
  references a workspace package (path or `@metanorma/` name form; map
  computed from `pkg/*/package.json`) lacking a `test` script warns, citing
  §4.1. Section-scoped: file-wide matching would warn on every doc that
  merely mentions an untested package. Never fails CI.
- **Known gap recorded** — `pkg/prosemirror-editor` has no test suite, so
  `MetanormaProseMirror.spec.md` §13 (whose criterion 1 promises a manifest
  test) surfaces as a standing warning until its suite lands.

---

## 2026-10-16 — schema §12.1 implemented: unknown JSON attrs captured into `data` via `MetanormaSchema`

`prosemirror-schema` + `docs/schema.spec.md` errata; no other package touched
(`prosemirror-editor`/`editor-gui` load through `metanormaSchema.nodeFromJSON`
and gain the fix unchanged); **Commits: *(pending)***.

- **Change** — `metanormaSchema` is now a `MetanormaSchema` instance (new
  `loading.ts`) instead of a plain `Schema`. Its `nodeFromJSON` /
  `markFromJSON` partition each node's/mark's attrs before the stock parse:
  unknown top-level keys are captured into the `data` catch-all, so loading a
  `MetanormaDocument` no longer silently drops them (schema §12.1). Nested
  nodes and marks are captured too — not by walking the tree, but
  **emergently**: the stock parse recurses through the schema's
  `nodeFromJSON`/`markFromJSON` at call time, and the class reassigns those
  instance properties in its constructor (they are constructor-assigned own
  arrows upstream — a prototype-method override would never run).
- **Merge rules** — an explicit `data` key wins a collision with an unknown
  key; attrs with no unknown keys pass through **untouched** (byte-identical
  stock behavior, so a non-object `data` round-trips verbatim); unknown keys
  plus a non-object explicit `data` (string/number/boolean/array) throw a
  `RangeError` naming the type, since merging would produce indexed-property
  garbage and dropping them is what §12.1 forbids.
- **Error contracts preserved** — non-object input (`null`, or a `null` entry
  inside `content`/`marks`) and unknown node/mark types still throw the stock
  `RangeError`s, not `TypeError`s; the GUI's `loadDocFromJson`
  invalid-document classification is unaffected.
- **Spec errata** — §12's premise that the round-trip "reduces to stock
  `nodeFromJSON`/`toJSON`" was wrong (it is why the capture was missed);
  §12 now states the load-side partition rules and the untouched output
  contract. §2/§11/§14.4 updated (`loading.ts`, `MetanormaSchema` export,
  extended acceptance criteria).
- **Tests** — new `pkg/prosemirror-schema/roundtrip.test.mjs` (18 tests:
  capture incl. deep nesting and nested marks, merge/passthrough rules,
  stock error contracts, non-object-`data` policy) with `pretest`/`test`
  scripts; the package now runs under root `yarn test` (172 tests green
  across workspaces).

---

## 2026-10-16 — figures become two-stage: Figure button + single-mode Image button

`editor-commands` + `toolbar` + `prosemirror-editor` + `editor-gui` ripples;
`docs/AdvancedMetanormaToolbar/images-figures.md` rewritten around the
two-command split; `docs/schema.spec.md` §17.6 gains the figure-body coercion
bullet; **Commits: *(pending)***.

- **Change** — the combined `insertImage(state, dispatch?, attrs)` command
  (always emitting `figure > [figure_name, image]`) is **removed** from
  `@metanorma/editor-commands` and `@metanorma/toolbar`. Replacing it:
  `insertFigure(state, dispatch?)` (creates `figure > [figure_name]` with a
  generated id, cursor in the seeded caption), `canInsertFigure(state)`
  (extended: refuses when any ancestor is a `figure` — v1 does not author
  subfigures), `canInsertImageIntoFigure(state)` (nearest enclosing image-less
  figure; one image per figure), and `insertImageIntoFigure(state, dispatch?,
  {src, alt})` (inserts the atom **immediately after `figure_name`**).
- **Why** — under the combined command, deleting the `image` atom left
  `figure > [figure_name]` with no toolbar path back to an image (the image is
  reachable only as a figure child). The stage split makes that state
  recoverable: the Image button re-enables inside an image-less figure.
- **Toolbar** — the `images` group renders a plain **Figure** button
  (`insertFigure` query/dispatch) before the dialog control; the Image button
  is single-mode (enabled = `canInsertImageIntoFigure`, static title "Add
  image to figure").
- **Placeholder** — a figure with an **empty body** (no children except at
  most the caption) renders the state label "Empty figure"
  (`figure.mn-figure:not(:has(> :not(.mn-figure-name)))::after`); figures
  with real body content — an image, paragraphs, nested figures — never
  match, so a deliberate text-figure (Standoc `FigureBody` admits
  `paragraph-with-footnote+` in place of `image`) is not nagged with an
  image-missing hint. The label names the document state without prescribing
  content or referencing toolbar chrome; the enabled Image button is the
  add-image affordance.
- **Insertion-point rationale** — Standoc `FigureBody`'s choice group is
  single-occurrence (image XOR `paragraph-with-footnote+` XOR subfigures), so
  the slot immediately after the caption is the only position valid in both
  models; recorded in schema.spec.md §17.6 with the export coercion (drop
  empty trailing paragraphs; non-empty blocks after an image = coverage gap).

---

## 2026-10-16 — table column sizing: two-mode `colwidths`, drag-to-resize, clipboard fidelity

`@metanorma/prosemirror-schema` + `editor-commands` + `prosemirror-editor` +
`toolbar` + `editor-gui` ripples; `docs/schema.spec.md` §8.5 + §14 gap table,
`docs/AdvancedMetanormaToolbar/tables.md` §8.6; **Commits: *(pending)***.

- **Change** — the `table` node gains a `colwidths` attribute (default
  `null` = autowidth; non-null = one percentage string per grid column,
  grid = max Σ colspan over all rows of all row groups), and a complete
  column-sizing feature lands on top of it: the `tableColumnResizePlugin`
  (dual widget decorations — colgroup + per-edge drag handles; DOM-derived
  spanning-aware geometry; neighbor-trades-1:1 drags with a 40px min-width
  stall, 3px threshold, rAF-coalesced preview, single-transaction commit,
  first-drag materialization, Escape cancel), the pure commands
  `setColumnWidths` / `autoTableWidths` / `distributeColumnsEvenly`, the
  **Auto widths** / **Distribute evenly** toolbar buttons, and a
  `clipboardSerializer` override carrying `data-colwidths` so whole-table
  copy/paste round-trips widths exactly.
- **Ingest** — `table.parseDOM.getAttrs` reads `data-colwidths` (priority)
  then `<colgroup>` `<col>` elements in both `style="width:…%"` and legacy
  `width="…%"` forms, repaired against the grid column count with a ±0.5pp
  sum tolerance (verbatim within tolerance — pipeline rounding such as
  6 × 16.67 = 100.02 is legitimate).
- **Why table-level storage** — per-cell width storage (the
  prosemirror-tables model) is the only remedy for partial-copy fidelity
  and is rejected: the Metanorma model is colgroup/table-level, the grid is
  derivable from `colspan` without `TableMap`, and one attribute write per
  gesture keeps undo/collab clean.
- **Known limitation (accepted)** — a partial copy whose selection opens
  inside the table (rows serialize as top-level `tr`/`thead`/`tbody`)
  drops widths; recorded next to the `toDOM` rationale in tables.md §8.6.

---

## 2026-10-14 — captions become rich child nodes (`figure_name`, `table_name`)

`@metanorma/prosemirror-schema` feature + `editor-commands` / `toolbar` /
`editor-gui` ripples; `docs/schema.spec.md` §3.1/§4/§5/§6.1/§8.5–§8.6/§14/§17,
`docs/EditorCommands.spec.md` §2.3/§2.7/§4.4.9b,
`docs/AdvancedMetanormaToolbar/{tables,images-figures,reference-marks}.md`,
`docs/MetanormaProseMirror.spec.md`; **Commits: *(pending)***.

- **Change** — figure/table captions move from a plain-string `title`
  attribute to rich inline child textblocks, mirroring the already-shipped
  `section_title` pattern: `figure.content` becomes
  `figure_name? (image | block)*`, `table.content` becomes
  `table_name? (table_head | table_body | table_foot)+`; the `title` attrs
  are dropped. Node count 46→48 (`CAPTION_TYPES`). Captions accept all 14
  marks and export as Standoc `<name>` child elements (§17).
- **Why two node types** — no single HTML element round-trips through the
  browser's HTML parser as a child of both parents: Chromium destroys
  `<caption>` inside `<figure>` (reduced to a bare text node) and
  foster-parents `<figcaption>`/`<div>` out of `<table>` (they reappear as
  siblings before it). So `figure_name` serializes as
  `<figcaption class="mn-figure-name">` and `table_name` as
  `<caption class="mn-table-name">` — the only pair where each parent's
  serialization survives clipboard re-parsing. Locked in as acceptance
  criterion §14.11 and a browser e2e (`caption.spec.ts`).
- **Editing surface** — `exitName` (Enter in a caption: first cell for
  tables; first textblock-bearing sibling inside the figure, else a
  paragraph inserted after the figure's last child, so
  `[figure_name, image]` + Enter yields `[figure_name, image, paragraph]`);
  `emptyTextblockBackspace` §4.4.9b caption guard (empty caption deletes
  itself; a figure is deleted only when the caption is its sole child; a
  table never); `insertTable`/`insertImage` seed an empty caption and land
  the cursor in it (the figure is no longer node-selected on insert);
  `bodyBlockContext` treats captions as non-body (block-insert buttons stay
  disabled in captions); `TargetPicker` labels read the caption child.
- **Known coercion** — Standoc `tname` is `element name { NestedTextElement+ }`
  (≥1 child) while editor captions are `inline*`; an empty caption is
  dropped on export, and `NestedTextElement` members outside the editor's
  inline vocabulary are dropped on import (§17.6 — coercions, not
  ambiguities). Sourcecode `<name>` captions remain dropped (§17.5): the
  `code: true` textblock cannot host a rich child; a container/body split
  would be a separate change.
- Sample housekeeping — `fixtures/iso-5843-6.mn.json`'s table `attrs.title`
  ("List of equivalent terms") migrated to a leading `table_name` child
  (no e2e loads this file; the migration prevents silent caption loss if
  it is loaded, since `nodeFromJSON` drops unknown attrs).

---

## 2026-09-30 — minimap: rows join the §8.4 z-sorted draw order (background layers)

`@metanorma/prosemirror-minimap` fix, `docs/ProseMirrorMinimap.spec.md`
§8.4/§15.1.21; **Commits: *(pending)***.

- **Symptom** — a consumer layer declared below the `text` layer
  (e.g. `{id:'bg', z:5, kind:'background'}` — the natural background
  use) still painted AFTER the rows, so an opaque tint occluded the
  document instead of sitting under it. Both renderers painted the
  whole row block first, then z-sorted only the spans, violating
  §8.4's "later layers draw over earlier ones".
- **Cause** — `InlineRenderer.render` and `RecordingRenderer.render`
  had no representation of the row block's z: rows were structurally
  "first", not "at the text layer's z".
- **Fix** — rows draw at the merged `text` declaration's z
  (`RendererBackend.rowZ`, computed in `setConfig` from the
  pre-merged declarations; default 10). When no layer draws below
  `rowZ` (the common case), the renderers keep the allocation-free
  row loop — zero cost on the §15.2 repaint path. When a low-z layer
  exists, rows join the same z-sorted paint list as tints/markers
  (`hasBelowRowLayer`), so everything paints in ascending z in both
  backends. A same-id replacement of `text` moves the rows to the
  consumer's z (§8.4 same-id-replacement contract); `kind` stays
  descriptive metadata, never an ordering input.
- **Cost gate** — the slow path allocates one list entry per painted
  row; in fit mode on a tier-1/2 doc this is bounded by the new
  §15.2 row "≤ 1 extra ms per frame vs. fast path" budget and is
  opt-in (only consumers who declared a low-z layer pay it).
- Regression coverage: `§8.4/§15.1.7` additions in test.mjs —
  background-below-rows, replaced-`text`-z ordering, and the
  fast-path guard (no low-z layer → row block still first).

---

## 2026-09-30 — minimap: tall-row bar gap anchored to a line slot (long-table fix)

`@metanorma/prosemirror-minimap` fix, `docs/ProseMirrorMinimap.spec.md`
§6.5/§15.1.20; **Commits: *(pending)***.

- **Symptom** — on a document with a table spanning several viewports
  (sample `fixtures/iso-5843-6.mn.json`: a 257-row table, 26 282 px — 94%
  of the document),
  dragging the minimap scrolled the editor correctly to the end, but the
  block representing the table visibly ended ~3–4 screens early: at max
  scroll, its paint stopped ~709 px (a full pane) above the pane bottom.
- **Cause** — `InlineRenderer.paintRow` carved an inter-row gap of
  15% **of the row's own slot height**. The gap exists to keep
  line-sized rows reading as separate lines; sizing it from the row's
  whole slot was harmless when slot ≈ line, but a single opaque row
  spanning several panes (the classifier makes a table one row) lost
  15% of its entire height to a phantom separator — at the consumer
  zoom, `floor(4731 × 0.15) = 709` minimap px, i.e. ~5½ viewports of
  editor space. The block model, offsets, and scroll mapping were all
  exact; only the paint was short.
- **Fix** — the gap's carrier is now a ONE-LINE slot: `barGapPx(slotH,
  scale, lineHeight)` (a pure exported helper beside
  `rowWidthFraction`/`paintsGlyphs`) = 15% of `lineHeight × scale`,
  floored at 1 px and capped at `slotH − 1`. Sliding zooms keep the 1 px
  separator; large fit scales still grow it so line rows don't merge;
  a row taller than one line keeps its block shape end-to-end.
  Regression coverage: headless `§15.1.33 barGapPx` regimes (test.mjs)
  and a package e2e pixel test (`tall` harness classifier: a 6000 px
  opaque row, tall row last — asserts the block's ink reaches the pane
  bottom at 60% and 100% scroll; verified to fail 225 px short
  pre-fix).

---

## 2026-09-25 — Upstream ledger re-pin: rename merged to main (#46); basicdoc drift recorded

The isodoc→standoc grammar-source rename is now **merged to main** upstream:
`metanorma/standoc-models` PR #46 ("Cutover complete: grammar re-sync,
standoc.\* rename, .lml source migration") merged 2026-08-22 (the hold
observed on 2026-08-20 was lifted). `docs/metanorma-model.md` §1 re-pinned:
standoc-models `4bad3672` → `7d5d737c`, basicdoc-models `d2a94b1a` →
`3b408b71`, metanorma-standoc `601c3761` → `38a50557` (lib restructured to
flat `lib/metanorma/…`), metanorma `08ea913c` → `a62ca5a8`, isodoc
`8d8f3524` → `92b3d2b0`.

- **Grammar verification**: `standoc.rnc` and `standoc-presentation.rnc` are
  **byte-identical** between `4bad3672` and main HEAD — §3's layering test and
  element facts stand as verified. All drift is in `basicdoc.rnc` (submodule
  `50fe9e85` → `3b408b71` in the #46 window), recorded as the new §4 drift
  block: a new attribute-register family (`reg-attribute`/`value`/
  `variable-ref`) admitted as a leading child across body models, pervasive
  `BasicBlock` content-model relaxations (quote/admonition bodies, `li`, `dd`,
  `TdBody` block branch, `ExampleBodyContent`), `thead`/`tfoot` → `tr+`,
  `amend/newcontent` admits `document*`, `review/@reviewer` optional. All
  widenings — no previously-valid document becomes invalid.
- **Correction to the 2026-08-18 verification**: that pass read the basicdoc
  submodule at the ledger's stale pin (`d2a94b1a`) instead of the in-effect
  `50fe9e85`, missing `TdBody`'s fn/note admission and the now-optional
  `index-secondary`/`index-tertiary` (both window-1, 2026-08-17). Both are now
  recorded; the "otherwise byte-identical" claim of that pass is retracted.
- **§2 amendments**: gem lib paths now flat (`lib/metanorma/converter/…`, was
  `lib/metanorma/standoc/converter/…`); isodoc's `PresentationXMLConvert`
  gained a `validate` method — ID/IDREF bookkeeping (`id_validate`), **not**
  RelaxNG, so "Presentation XML is not RNG-validated at runtime" stands.
- **Vendoring state** (ledger §1 vendoring note): models-side `copy.sh` now
  writes `standoc.*` destinations; the gem still ships
  `isodoc.rng`/`isodoc-compile.rng` and `schema_file` still returns the legacy
  name (self-consistent chain). Expect the gem flip on the next vendoring
  pass. **Commits: *(pending)***.

---

## 2026-08-26 — minimap: package-owned browser e2e (harness)

`@metanorma/prosemirror-minimap` now owns its browser tests
(`docs/ProseMirrorMinimap.spec.md` §15.3); **Commits: *(pending)***.

- **Harness** — `pkg/prosemirror-minimap/harness/`: a dev-only page that
  mounts a plain `EditorView` on a synthetic schema plus `<Minimap>` in a
  fixed 96×600 pane, with a page-global mount API (`__mnMount` /
  `__mnUnmount` / `__mnLoadDoc` / `__mnReady`) and three scroll-shape
  skeletons pinning the §7.1 scroll-container contract. Deliberately NOT
  the consumer stack — no `@handlewithcare/*`, no Metanorma packages; the
  harness's runtime surface is exactly the package's own peers. Built and
  served by `build-minimap-demo.mjs` (repo root) + `harness/serve.mjs`
  (:3334), same PnP-resolver bundling as the GUI build.
- **13 tests migrated from the consumer** — the package-contract suite
  (`e2e/minimap.spec.ts`) now lives in the package and pins its own
  configuration per test (zoom, display mode, theme, classifier-by-name)
  instead of reading consumer wiring: drag-scroll, precise-commit,
  model-accuracy, stale-geometry, sliding mode, glyphs-vs-bars, astral
  glyphs, indent lockstep, keystroke stability, shortEmpty bar fractions
  (tightened to exact 0.08/0.20/1.0 fractions at pinned zoom),
  atlas-scale — plus a new `scrollContainer`-variants test the consumer
  could never express. Chromium-only (pixel/paint assertions are
  per-engine non-portable); the harness fix notes from the migration are
  recorded in the spec.
- **Consumer slimmed to consumer-owned coverage** —
  `pkg/editor-gui/e2e/minimap.spec.ts` keeps placement, the state-swap
  (docEpoch re-key) regression, and one integration smoke test; the ~12
  package-contract tests were deleted. The package contracts no longer
  break on consumer restyles or Metanorma schema refactors.
- **Verification** — package e2e 13/13 (chromium, three consecutive
  runs); headless 35/35; consumer minimap spec 3/3 on chromium + firefox;
  full editor-gui chromium suite 54/54; `check-specs` clean.

---

## 2026-08-24 — minimap: proportional empty bars + tier-3 aggregate density

Two renderer-width changes in `@metanorma/prosemirror-minimap`
(`docs/ProseMirrorMinimap.spec.md` §4.2, §5.1, §6.5, §8.1, §15.1.17);
**Commits: *(pending)***.

- **Shape-derived `textBlock` bit — proportional emptiness, no
  configuration** — a zero-length row paints the minimal bar (0.08 of
  usable width) when the row is a TEXTBLOCK, the flat zero-length block
  (0.35) otherwise. Zero length is ambiguous at paint time, but the
  distinction is classification knowledge, knowable at walk time
  (`node.isTextblock`): an empty textblock's zero length is a *state*
  that can fill — emptiness reads as short, and the ordering empty <
  one-word < long becomes monotone (previously empty jumped *above*
  one-word to 0.35) — while an atom's or structure's (figure/table)
  zero length is *permanent*, and the solid block is the landmark. The
  walk retains the bit on `BlockRow` (§4.2, with a `RowSpec.textBlock`
  classifier override, §5.1) and carries it across the serializable
  renderer boundary as a `BlocksPayload.textBlocks` byte array (§8.1) —
  so the distinction survives without any theme/consumer flag. (An
  earlier same-day iteration expressed this as a `ThemeClass.shortEmpty`
  theme knob; it was replaced by the bit before release: the knob
  re-stated walk-time knowledge in consumer config, could leak through
  theme fallback inheritance, and mis-rendered atoms aliased into a
  text-ish class.)
- **Tier-3 aggregates carry mean density** — an aggregated run's width
  signal is the *mean* text length of its members (not a hardcoded 0):
  dense paragraph runs paint wide, sparse runs narrow, all-empty
  textblock runs paint the minimal bar (the run carries its first
  member's `textBlock` bit, like its `classId`/`depth`). The mean is
  computed over the run's FULL extent (the run match continues past the
  paint window, with an unbuilt-slot guard), so sliding the window
  cannot pulse a bar's width by changing which members are visible.
  Together with the bit this fixes the inversion where aggregates
  impersonated empty textblocks (class `text` + zero length) while
  representing the document's bulk — a naive short-empty rule would
  have hairlined huge documents.
- **Verification** — headless §15.1.32 (width regimes; aggregate mean,
  window-stability, non-textblock block; the marked-split test now also
  asserts the mean — its fixture previously passed an all-zero
  `textLengths` array, fixed to carry the rows' real lengths) and a
  canvas-pixel e2e regression (empty 8px < one-word 19px < long 91px at
  the 96px pane; analysis: solid-row filter → painted-extent segmentation,
  since bars are vertically contiguous at scale).

---

## 2026-08-21 — editor-gui integrates the minimap (left-docked pane)

First consumer integration of `@metanorma/prosemirror-minimap`
(`docs/ProseMirrorMinimap.spec.md` §11) in `pkg/editor-gui`;
**Commits: *(pending)***.

- **Plugin + classifier** — `editorPlugins` (App.tsx) appends
  `createMinimap({ classifier: metanormaClassifier })`; the classifier maps
  `section_title`/`floating_title`→heading, `sourcecode`→code,
  `table`→estimated-height table, `figure`/`formula`→fixed-height rows, and
  textblocks/atoms→text, with table/figure/formula opaque to recursion
  (§5.3 consumer refinement). The `theme` is deliberately component-owned
  (plugin-wins rule, §7.1) in `MinimapPane.tsx`, which adds the `formula`
  class.
- **`MinimapPane`** (new consumer component) — captures the `EditorView`
  via `useEditorEffect` into local state (§11's prescribed capture path) and
  renders `<Minimap>` in a fixed 96px pane docked left of the editor —
  immediately right of the 48px sidebar rail — via `order: -1` in the
  `.mn-prosemirror` flex row. `aria-controls` targets `#mn-editor-viewport`
  (the `.ProseMirror` scroll container).
- **`useEditorEffect` re-export** — `@metanorma/prosemirror-editor` now
  re-exports the hook: under Yarn PnP, a *second* direct
  `@handlewithcare/react-prosemirror` dependency resolves to a second
  virtual instance whose React `EditorContext` differs from the one the
  editor provides, crashing child components ("Cannot destructure property
  'view' of null"). Re-exporting keeps one instance in every consumer
  bundle.
- **Package fixes surfaced by the integration** (in
  `pkg/prosemirror-minimap`): `react.tsx` never attached `containerRef` to
  its container div, so the mount effect bailed silently and the renderer
  never attached (no paint, no ResizeObserver); `.mn-minimap-viewport` had
  no `top: 0`, leaving the absolutely-positioned strip below the canvas.
- **Document-load remount** — `loadDocFromJson` builds a fresh
  `EditorState` (new plugins array), so ProseMirror destroys and recreates
  every plugin view; the registry-keyed minimap controller is replaced while
  `<Minimap>`'s `[view]` deps stay satisfied. `App.tsx` now bumps a
  `docEpoch` counter on load and re-keys `MinimapPane` so it re-attaches to
  the new controller.
- **Tests** — new `pkg/editor-gui/e2e/minimap.spec.ts` (placement
  bounding-box ordering, canvas/overlay presence, drag-to-scroll on a tall
  document, typing-after-load regression); full suite 55/55 on both
  chromium and firefox.
- **Deferred** — dark-mode canvas theming (a `prefers-color-scheme`
  listener feeding `reconfigure({theme})` through the component-owned
  `options` prop); scrollbar-track click (jump-to-position on the canvas
  area below the viewport strip — the package's overlay only handles
  drag/keyboard on itself).
- **Lockstep indentation** — section bodies now indent in lockstep with
  their section titles: every row-rendered theme class (`text`, `heading`,
  `figure`, `table`, `code`, `formula`) in `MinimapPane`'s theme carries
  `indent: true`, so a section's body blocks share their title's left edge
  (title and body are same-depth siblings in the block tree — the clause
  container is transparent to the walk; nested containers' content sits one
  depth step deeper by tree structure, and the depth-0 `bibdata` strip
  stays flush). Covered by a canvas-pixel e2e assertion
  (distinct-indent-step counts in `minimap.spec.ts`).
- **Title glyphs** — the `heading` class opts into tier-1 per-character
  glyph blitting (`ThemeClass.glyphs`, default off): section and floating
  titles paint as readable character strokes, while body text and block
  classes keep the filled-rectangle path (better at paragraph scale, and
  dodges the glyph path's known CJK/astral/bidi defects). Covered by a
  painted-pixel-density e2e assertion.

## 2026-08-20 — prosemirror-minimap remediation: live-path repairs, sliced builds, spec alignment

The minimap audit (same day) found the pure-model core conformant but the
live integration path broken in four places and several §7 mechanisms
unimplemented. This entry records the remediation of
`pkg/prosemirror-minimap` against `docs/ProseMirrorMinimap.spec.md`;
**Commits: *(pending)***.

- **Transaction capture (§7.2)** — the plugin's `update` had compared
  `state.tr !== prevState.tr`, but `EditorState.tr` is a factory getter
  (every read constructs a fresh empty `Transaction`), so the incremental
  diff was unreachable and every edit took a full synchronous rebuild.
  `createMinimap()` now carries a state-slot plugin (`apply` records the
  incoming transaction) whose capture the view-plugin half reads once per
  update.
- **Renderer push discipline (§8.1)** — rebuilds never re-sent the model
  (edits were invisible); `setBlocks` payloads were stored relative but
  indexed absolutely (any `firstRow ≠ 0` push mis-addressed). The renderer
  now keeps an absolute-indexed mirror, and pushes are chunk-granular
  (full at build completion; sparse over changed chunks after an edit,
  extended to end on structural shifts).
- **Sliding-window origin (§6.2)** — paint coordinates were virtual-surface
  with no window translate (rows past the first screen painted off-canvas).
  `setWindowOrigin` now carries the origin and the paint path subtracts it.
- **Keyboard contract (§9.3)** — the PageUp/PageDown/Home/End handler had
  boolean arguments shifted one key over (PageDown jumped to document
  start; Home to end; End no-op'd; Shift+Space scrolled down). Fixed, with
  arrow-repeat settling through a short debounce.
- **Mechanisms landed**: time-sliced builds with visible-first ordering and
  progressive publish (§7.3); marks-only rung release on under-budget
  slices plus a forced `marksOnly` option (§6.5); §7.4 refresh points
  (scroll-container/content RO, `document.fonts.ready`, `visibilitychange`)
  with the epoch source corrected to editor width; `maxScrollDrift`
  correction; calibration-sample propagation to offsets and pushes;
  layer z-order paint, window clipping, and multiply-mode inline tints
  (§8.4); `minimapblockhover` DOM event; drag-gesture rect caching;
  component-`options` reconfigure (plugin wins); `aria-controls`;
  per-row height strategies surviving epochs; positive-px estimation floor.
- **Tests** grew 13 → 18: the vacuous §15.1.7 assertion replaced; controller
  and plugin integration (§15.1.14–15), epoch mechanism (§15.1.16), hidden
  rung transitions (§15.1.17), headless performance budgets (§15.1.18).
  A pre-existing diff bug surfaced and was fixed: a wrap of an identical
  child into a new container emitted the child twice (fresh + carried).
- **Spec** updates: transaction-capture note (§7.1), sparse-push bounds
  (§7.2), `setWindowOrigin` + chunk addressing (§8.1), rung lifecycle
  (§6.5), drift correction semantics (§6.3), `marksOnly` option, token
  fallbacks over `:root` (§12), `editorViewportId` (§11), export table and
  acceptance-criteria list (§13, §15.1), dev-dep table (§3).

## 2026-08-19 — minimap: every build slice budget-capped; first-slice coverage accumulator (deep-mount jank fix)

`@metanorma/prosemirror-minimap` fix, `docs/ProseMirrorMinimap.spec.md`
§7.3; **Commits: *(pending)***.

- **Symptom** — mounting the minimap while scrolled deep into a large
  document (window bottom ≈ row 39,950 of 40,000) blocked the first frame
  for ~1.3 s, with ~798 M loop iterations inside one build slice; §7.3's
  `sliceBudgetMs` (5 ms) and §15.2's first-paint budget (≤32 ms) were
  both blown by two orders of magnitude. The deadline-escalation ladder
  (two consecutive misses → marks-only) never engaged: it was exactly one
  blown slice.
- **Cause** — `runBuildSlice`'s loop condition carried an
  `|| firstSlice` exemption from the `BUILD_ROWS_PER_TICK` cap, and the
  only early exit was a window-coverage check that re-summed every
  emitted row per emitted row (`rowAccumHeight`) — O(n²), and O(n) frame
  duration even without the re-scan.
- **Fix** — (a) the coverage check now reads a running accumulator carried
  on the build state (add each row's effective height at the emit site);
  (b) the `firstSlice` exemption is gone — every slice is capped at 2,000
  rows, and only the first slice may stop earlier, at window coverage.
  A near-top mount still fills the viewport in one cheap slice (~34
  rows); a deep mount fills progressively over ⌈windowRows / 2,000⌉
  budget-capped frames (~20 at 40 k rows), with `windowRange` clamping
  the window to the built prefix until the scroll position is reached
  (the thumb remains scrollbar-fraction-accurate). §7.3's earlier
  "visible range first, then expand outward" wording described an
  unimplemented seek; the spec now states the prefix build it ships.
  Regression coverage: §15.1.19 deep-mount test (slice 1 emits exactly
  the cap on a 40 k-row doc mounted at scrollTop 771,200).

## 2026-08-18 — Upstream isodoc→standoc grammar rename; terminology refresh + ledger re-pin

Upstream renamed the grammar sources in `metanorma/standoc-models` (commit
`4bad36724d`, 2026-08-17, *"grammars: rename isodoc.\* sources to standoc.\*
(retire the misnomer)"*): `grammars/isodoc.rnc` → `grammars/standoc.rnc`,
`isodoc-presentation.rnc` → `standoc-presentation.rnc`, and companions. No
redirect was left (`isodoc.rnc` 404s at HEAD). Rationale: "Standoc" is the
shared-layer grammar (the harmonized superset); "Isodoc" properly names the
presentation-rendering gem, and the ISO flavour grammar is `isostandard.rnc`.

- **`docs/metanorma-model.md`** re-pinned `standoc-models` `a3596dc9` →
  `4bad3672` and gained a **naming note** distinguishing the three senses:
  the `metanorma/isodoc` gem (unrenamed), the vendored runtime filename
  `validate/isodoc-compile.rng` (deliberately retained upstream — gem code
  loads that path), and the renamed grammar layer. Grammar-path references
  throughout the ledger now say `standoc.rnc`/`standoc-presentation.rnc`.
- **Verified the rename is content-neutral**: the diff between the old and new
  pins is entirely from an intervening re-sync (`8bb23fd5631e`), recorded as a
  drift block in the ledger: `OlAttributes.@type` widened to an open enum
  (renderer-native format strings), and `ExampleBody` restructured into a
  `ExampleBodyContent` hook (semantic content set unchanged).
- **Terminology sweep** across `schema.spec.md` (~22 refs),
  `EditorCommands.spec.md`, `AdvancedMetanormaToolbar/sections.md`, and pkg
  JSDoc (`nodes.ts`, `sections.ts`): grammar-layer references now say
  **Standoc**. References to the isodoc *gem* (`IsoDoc::Xref` rdoc link) and
  the vendored `isodoc-compile.rng` runtime path are intentionally unchanged.
  `schema.spec.md` §17.5's list-numbering gap row notes the upstream open-enum
  drift.
- The 2026-08-12 "Isodoc alignment" entry is left as written — historical
  record of work done under the grammar's then-name.

**Commits:** `30618c6`.

---

## 2026-08-18 — Definition-list fixes: whole-textblock promotion, pair-atomic Backspace, dl removal policy

Three user-reported dl defects fixed together (they share one root cause: dl
behaviour was specified as refusal, not as schema-valid action):

1. **Def list no longer loses the paragraph's text.**
   `insertDefinitionList` promoted only the *selected* text into the new
   `dt` — with a plain caret (the common case) the entire paragraph's text
   was silently destroyed when the block was replaced. It now promotes the
   **entire textblock's** inline content (`$from.parent.content`), and
   refuses multi-block selections explicitly (`spansMultipleBlocks`).
   (definition-lists.md §5.1 already mandated this; the code had diverged.)

2. **Backspace inside a dl is pair-atomic instead of inert**
   (EditorCommands.spec.md §4.4.4 rewritten). The old rule — Backspace
   anywhere inside a `dl` is a uniform no-op — made empty terms/descriptions
   undeletable and gave no incremental path to remove a list. New behaviour:
   an empty block in a multi-block `dd` deletes normally; an empty `dt` or
   an empty `dd` deletes the **minimal schema-valid child range of the dl**
   (computed by widening toward the semantic partner while
   `dl.contentMatch.matchFragment(remaining)` rejects the remainder — the
   whole `(dt, dd)` pair in this schema, the non-empty partner included,
   Undo-recoverable); a non-empty textblock at a dt/dd boundary is
   **claimed with an empty transaction** so stock `joinBackward`'s barrier
   deletion cannot absorb a term across the boundary (which would leave a
   lone, schema-invalid `dd`).

3. **A dl whose last pair is deleted is now removable.** When the widened
   range is the whole `dl`, it is replaced by the textblock the *parent's
   content expression* admits at that slot (`admittedTextblock`:
   `contentMatchAt(index).defaultType` + `canReplaceWith` pre-flight — an
   empty paragraph in every context of this schema), falling back to
   delete-and-unwind where no textblock is admissible (a restrictive
   `(dl | table)`-style slot). The Enter-exit paths (`enterDefinitionList`
   B1, `exitDefinitionList`) share the same helper; both also had latent
   bugs fixed (stale post-delete positions; the exit paragraph inserting
   *inside* the dl schema-invalidly).

Two design decisions, user-resolved: (a) the firing condition is *always
delete the widened range* — content in the partner half goes with it rather
than a mid-list no-op dead end; (b) dl removal is parent-admitted-block, not
hard-coded "paragraph", precisely because a `dl` is legal in slots where a
paragraph might not be under a composed schema. Both rules are stated
against the schema (`(dt+ dd+)` flavors degrade gracefully via the widening
loop), not against a fixed grammar.

`definitionListKeymap`'s Backspace binding now always declines (the policy
lives in `emptyTextblockBackspace` alone). Verified headlessly
(`verify-dl.mjs`, 51 assertions: widening matrix, nested dl, boundary
claims, Enter-exit, doc.check() at every step) and by e2e in both engines.

**Affected specs:** docs/EditorCommands.spec.md (§2.4.4, §4.3, §4.4.4,
§4.5, §4.7.1, §4.7.3, §4.10), docs/AdvancedMetanormaToolbar/definition-lists.md
(§5.1, §6.1, §6.2).

**Commits:** `7bdd585`.

---

## 2026-08-16 — Enter at start of a non-empty section title inserts a sibling section above

New Enter affordance (`pkg/editor-commands/commands/insertSectionAbove.ts`,
chain position 4 in EditorCommands.spec.md §2.3): with the caret at offset 0
of a **non-empty** `section_title` (collapsed selection), Enter now inserts a
same-type sibling section **before** the current section (empty
`section_title` + empty `paragraph`, fresh generated id) and **keeps the
caret at offset 0 of the current title** — the Word / Google Docs / Apple
Pages "Enter at start of a heading" convention. Previously the only
section-before-this-one routes were the Section popover (inserts after the
nearest body-section ancestor) and gap-cursor placement; this is the first
first-class "insert above".

Design constraints that shaped it (user-reviewed over three evaluation
rounds):

1. **Non-empty guard.** Every section-creation command lands the caret at
   offset 0 of a fresh EMPTY title, where Enter must keep meaning "skip the
   title, go to the body" — so the empty-title case falls through to
   `exitSectionTitle` unchanged.
2. **Schema-derived legality, not a hand-coded allow-list.** The command
   pre-flights `parent.canReplaceWith(sectionIndex, sectionIndex,
   sectionType)`; on refusal it returns `false` and the chain degrades to
   `exitSectionTitle`. Stricter Metanorma flavors (e.g. one capping a
   section type at a single occurrence, as an isodoc-style `abstract?`
   preface would) get today's semantics with no command fork.
3. **Ranged selections never fire it** — a selection sitting at offset 0
   must not mint a section.
4. §2.4.8's "Enter never creates a new section" and §2.6's "never silently
   restructures" bullets were scoped (current-state specs) to name this as
   the one deliberate, precedented exception.

Verified headlessly (verify-sections.mjs STA1–STA6, 48 assertions) and by
e2e in both engines (98 passed). Also fixed in passing: `exitSectionTitle`'s
ranged-selection behaviour and `insertSection`'s missing `canReplaceWith`
pre-flight were identified as follow-ups and deliberately left unchanged.

**Affected specs:** docs/EditorCommands.spec.md (§2.3, §2.4.8, §2.5, §2.6,
§2.7, §2.8, §2.10).

**Commits:** `059a289`.

---

## 2026-08-15 — Empty-section-placeholder fixes: sibling inserts, atomic wraps, caret placement

Three fixes from the same session of placeholder-related section bugs
(`pkg/editor-commands/commands/sections.ts`,
`pkg/prosemirror-editor/plugins/placeholderClick.ts`):

1. **Section-menu inserts are siblings.** `insertSection`'s body cohort no
   longer calls `ensureSubclauseCapacity` — a sibling never modifies the
   enclosing clause's body, so the strict clause XOR is not engaged. (User
   decision: Section-menu choices create sibling sections.)
2. **Strict-XOR wraps are atomic, and all-empty runs are replaced.**
   `ensureSubclauseCapacity` swaps the block run via a single
   `tr.replaceWith` (the old `delete`+`insert` passed through a
   schema-invalid title-only intermediate, which the fitter "repaired" by
   splitting the clause — a phantom duplicate-id sibling). A run that is
   entirely empty placeholders is not wrapped at all: `demoteClause` /
   `wrapInClause` swap it for the incoming clause instead (no phantom
   headingless sub-clause). Content-bearing runs wrap as before.
3. **`placeholderClickPlugin`** (new base plugin in
   `@metanorma/prosemirror-editor`): Firefox 153 left the caret unmoved when
   clicking the `::before` placeholder of an empty textblock (pseudo-element
   region — no text node to hit-test; Chromium had narrower dead zones). On a
   plain left-click into an empty textblock the plugin maps the position via
   `view.posAtDOM` and, at mouseup, places a collapsed `TextSelection` there,
   carrying `storedMarks` over. Native double-click/shift/drag untouched.

**Affected specs:** docs/EditorCommands.spec.md (§5.2, §5.3, §5.5, §5.7),
docs/AdvancedMetanormaToolbar/sections.md (§5.2, §5.3, §5.4),
docs/MetanormaProseMirror.spec.md (§6.2). Firefox project added to
playwright.config.ts.

**Commits:** `dce2260`, `98cf1c6`, `920fc55`.

---


## 2026-08-14 — Colocated-spec policy; Relaton spec moved into pkg/relaton

Adopted a two-tier spec placement policy (CONVENTIONS.md §1.1): corpus specs
stay in `docs/`; a spec whose package is intended for **independent
publication** is colocated at `pkg/<pkg>/README.spec.md`, where the `README*`
name guarantees npm packs it into the tarball — each released version then
bundles the contract it implements (specs remain version-free; the release
tag/tarball is the snapshot identifier). Colocated specs are self-contained:
consumer/integration facts live in the repo index (`docs/README.md`), and
outbound links are avoided (they don't resolve inside a tarball).

`docs/Relaton.spec.md` (git-mv'd, history preserved) moved to
`pkg/relaton/README.spec.md` as the pilot: its preamble now states the
package contract, its former §6 Consumers table was relocated to
`docs/README.md`'s Relaton section, and Test plan renumbered §7→§6.
`prosemirror-schema` and `prosemirror-minimap` are slated for the same
migration at their own releases.

`check-specs.mjs` and `spec-impact.mjs` became multi-root: the spec corpus is
now `docs/**/*.md` + every `pkg/*/README.spec.md` (link integrity, header
hygiene, and transition-prose checks cover both; spec-impact resolves
cross-tree links).

**Affected specs:** CONVENTIONS.md (§1.1 placement, §2/§4 path-neutral
recipes, §7 multi-root tooling), docs/README.md (corpus index + Relaton
consumer table), docs/schema.spec.md (2 inbound links), and
pkg/relaton/README.spec.md (formerly docs/Relaton.spec.md).

**Commits:** `751874e`.

---

## 2026-08-12 — Isodoc alignment: strict clause XOR, doc-level annexes, front-matter content_section

The section content model was aligned with the Isodoc grammar
(`standoc-models/grammars/isodoc.rnc`). `clause` now implements
`Clause-Section` as a **strict XOR** — a clause holds either a block run or a
subclause run, never both (no hanging paragraphs); the editor accommodates the
strictness with an `ensureSubclauseCapacity` auto-wrap (folding a block-bearing
clause's blocks into a subclause, same transaction, one undo step) wired into
`insertSection`, `wrapInClause`, and `demoteClause`. `annex` became a **doc-level
sibling** (`doc.content` = `(bibdata preface? sections? annex* bibliography?
footnotes?)`, new `section_annex` cohort with no container) with Isodoc's
non-strict `Annex-Section-Body`. `content_section` moved from the body cohort to
the front cohort (Isodoc `content`, the unnumbered generic preface clause,
serializing as `<clause>`); the four named front-matter sections gained
`content_section` subclause nesting. `terms`, `definitions`, and `references`
content expressions were tightened to their Isodoc shapes (`references` is the
ordered `block* bibitem* references*`). The Section popover gained a fourth menu
group ("Annexes"). `promoteClause` refuses when the clause is its parent's only
child, and `insertLeadingParagraph` was removed (hanging paragraphs are now
schema-forbidden).

`floating_title` was removed from the `block` group — it is now a **groupless
textblock** (like `section_title`), admissible only where a content expression
names it explicitly. Its legal positions match Isodoc's `floating-title`
exactly: at the top level of `sections` (newly admitted — `sections` content
became `(section_body | floating_title)+`), and in the subclause branches of
`clause` and `annex`. This position parity means the §17.6 floating-title
relocation coercion is deleted (no positional coercion is needed). The
`ensureSubclauseCapacity` and `demoteClause` post-accommodation classifiers
treat `floating_title` as a subsection-run member (not a block), so a clause
holding `[section_title, floating_title, clause]` is recognised as already in
the subclause branch and is not auto-wrapped. `floating_title` moved out of the
`BLOCK_TYPES` (9→8) node-group constant into its own `FLOATING_TITLE_TYPES`
line in `NODE_NAMES`.

A **Floating title** button was added to the Section structure group (fourth
entry, after Demote). Its tooltip — "Insert floating title (an unnumbered
heading — not a section)" — carries the clarification that a floating title is
not technically a section, which is also why it is a standalone button rather
than an entry in the Section popover. The new `insertFloatingTitle` command
derives its applicability from the schema: it walks the ancestor chain asking
each ancestor `parentAccepts(…, floating_title, indexAfter)` and inserts after
the **deepest admitting ancestor**, so the three legal zones (top level of
`sections`, `clause` subclause branch, `annex` subclause branch) emerge from
the content expressions with no hardcoded position list. In a blocks-only
clause the deepest admitting ancestor is `sections`, so the FT lands at
`sections` top level with **no auto-wrap** — a deliberate asymmetry with
`ensureSubclauseCapacity`, since an FT never *needs* a subclause sibling to be
legal. The insertion position is computed as `$from.after(admittingDepth + 1)`;
`after(admittingDepth)` would place the node *after* the admitting ancestor
itself, which is illegal for a container like `sections` and triggers
ProseMirror's silent content-fitting — a phantom `annex` wrapper around the
floating title.

**Affected specs:** schema.spec.md §3.1/§4/§5/§8.0a/§8.1/§8.2/§8.3/§11/§17.5/§17.6,
EditorCommands.spec.md §5, AdvancedMetanormaToolbar/sections.md §2/§4/§5/§6/§8,
plus pkg/prosemirror-schema, pkg/editor-commands, and pkg/toolbar code.

**Commits:** `9fe3757`, `768dd36`.

---

## 2026-08-13 — Document-model source of truth: metanorma-mirror-js → the Metanorma document model

Alignment with the **Metanorma document model** (as expressed in the Semantic
XML the Metanorma pipeline authors and validates — `isodoc-compile.rng` in
metanorma-standoc, source grammars in standoc-models) is now the stated goal
of the schema, replacing derivation from
`metanorma/metanorma-mirror-js`'s `src/types.ts`. The schema spec's conversion
target changed from Presentation XML to **Semantic XML** (§1.1, §17) —
Presentation XML is generated downstream by the pipeline and never authored by
the editor. Code identifiers renamed in `@metanorma/prosemirror-editor`:
`MirrorDocument` → `MetanormaDocument`, `MirrorMark` → `MetanormaMark`,
`DEFAULT_MIRROR_DOC` → `DEFAULT_MN_DOC` (breaking change to the package's
public API). The stack/docs name "Metanorma Mirror" → **Reflect** (docs index
and schema spec titles).

**Affected specs:** schema.spec.md (header, §1, §3, §6, §12, §17),
MetanormaProseMirror.spec.md (§2, §5, §6, §9.4), EditorCommands.spec.md
(header), undo-redo.md (§6.2), README.md (index), plus pkg/prosemirror-editor
and pkg/editor-gui code.

**Commits:** `30d79db`, `7b262099`.

---

## Seeded entries (pre-governance-migration)

The entries below were reconstructed from Git history and decisionmaking prose
dispersed across the specs. Dates and commit SHAs are approximate (some
transitions span multiple days or are buried in multi-purpose commits).

---

### 2026-08-10/11 — Bibliographic model: Relaton package + bibdata/bibitem nodes

New `@metanorma/relaton` workspace package with a deliberate-subset
BibliographicItem type, pure derivation helpers (`citeas`, `label`,
`primaryDocid`, `mainTitle`), and a zero-PM-dependency document walker
(`collectBibliographyItems`). The schema gained `bibdata` (a required
first-child atom storing document metadata) and `bibitem` (a bibliography-entry
atom inside `references` sections). The editor gained `BibNodeView` (popover
editing via a shared `BibliographicItemForm`) and the toolbar gained an
`ErefPicker` that consults `collectBibliographyItems` for known citations.

**Affected specs:** schema.spec.md §3/§8, Relaton.spec.md (new),
MetanormaProseMirror.spec.md §7.

**Commits:** `e34d628`, `ca6ba81`.

---

### 2026-08-09 — Section headings: title attribute → section_title child node

Section nodes gained an optional `section_title` child textblock (content
`inline*`), enabling inline markup (emphasis, links) in headings. The `title`
string attribute was removed from `sectionAttrs()`. `floating_title` was
converted from an atom to a textblock. `SectionNodeView` and
`FloatingTitleNodeView` were deleted in favour of native `toDOM` rendering.
The `exitSectionTitle` command (Enter inside `section_title` exits to the body)
was added.

**Affected specs:** schema.spec.md §8.2/§8.3, EditorCommands.spec.md §2.4.8,
AdvancedMetanormaToolbar/sections.md §7.

**Commits:** `12178f9`.

---

### 2026-07-25/26 — Toolbar labels: glyphs → words

Every toolbar button's visible `label` changed from a glyph/emoji/short token
(e.g. `❝`, `🔗`, `B`, `↩`, `▦`, `↶`) to a short legible word (e.g. `Quote`,
`Link`, `Bold`, `Outdent`, `Table`, `Undo`). The `title` field (tooltip) is
unchanged and remains the sole channel for longer per-button descriptions.
Button tables across all toolbar specs were restructured to carry explicit
Label and Title columns.

**Affected specs:** MetanormaToolbar.spec.md §5,
AdvancedMetanormaToolbar/README.md, all six AMT member pages.

**Commits:** `becbd6d`, `d385f04`.

---

### 2026-07-25 — Outdent button added to AMT

New `outdent` toolbar group wrapping the stock ProseMirror `lift` command.
The button is enabled when the cursor's textblock can be lifted (has a valid
`liftTarget`); it is disabled inside definition lists (`dl`/`dt`/`dd`) to
preserve the `(dt dd)+` invariant. New spec page `outdent.md`.

**Affected specs:** AdvancedMetanormaToolbar/README.md §5.1,
AdvancedMetanormaToolbar/outdent.md (new).

**Commits:** `337dba9`.

---

### 2026-07-25 — Toolbar moved to own package (@metanorma/toolbar)

`MetanormaToolbar` was reshaped from a self-contained monolith into a thin
assembler over shared primitives (`<Toolbar>` shell, `<ToolbarButtonView>`,
`ToolbarButton` / `ToolbarEntry` / `ToolbarGroupDef` types, `baseGroups`
registry). `toggleList` was rewritten as a pure
`(state, dispatch?) => boolean` command and relocated to
`@metanorma/editor-commands`. The whole toolbar — assembler plus shared
primitives — moved into its own workspace package `@metanorma/toolbar`
(`pkg/toolbar/`), with a clean break: `@metanorma/prosemirror-editor` no longer
exports or references the toolbar. The public component API is unchanged.

**Affected specs:** MetanormaToolbar.spec.md §10–§12,
AdvancedMetanormaToolbar/README.md §5.

**Commits:** `49e999d`, `0c3bb10`.

---

### 2026-07-24/25 — Schema parity with Metanorma Presentation XML

Two dual-source-of-truth issues resolved for unambiguous PM→Presentation-XML
conversion: (1) `figure` no longer carries `src` — `src` lives only on the
`image` child; (2) `formula` and `stem` gained a `type` discriminator (enum
`asciimath` | `mathml`, default `asciimath`) selecting the authoritative
encoding; `math_text` was removed from `formula`. New §1.1 (coverage/subset
principle: the schema is a convertible subset, not a lossless round-trip) and
§17 (conversion guide: invent-on-export values, dropped-on-import features,
over-permissive content) added.

**Affected specs:** schema.spec.md §1.1/§6/§8/§9/§17.

**Commits:** `da40009`, `f1b2dd4`.

---

### 2026-07-24 — toggleList moved from Toolbar spec to EditorCommands

The `toggleList` command definition relocated from MetanormaToolbar.spec.md to
EditorCommands.spec.md §3 (three-branch algorithm: unwrap same / switch
different with single-transaction lift+wrap / wrap none; dl-exclusion).
MetanormaToolbar.spec.md §5.3 retains only the button (active/enabled detection
+ run adapter) and references EditorCommands §3 for the command contract.

**Affected specs:** EditorCommands.spec.md §3, MetanormaToolbar.spec.md §5.3,
AdvancedMetanormaToolbar/definition-lists.md.

**Commits:** `5207122`.

---

### 2026-07-20 — AMT refactored to command-layering model

All seven AdvancedMetanormaToolbar member pages were restructured to defer
command logic to `@metanorma/editor-commands`. The toolbar owns only UI
adapters (`run(view)` → `command(view.state, view.dispatch)` + `view.focus()`),
popovers, dialogs, and keymap plugins. The command-layering rule (README §6)
was introduced: pure commands are `(state, dispatch?) => boolean` functions —
no EditorView, no DOM, no `view.focus()`, non-throwing.

**Affected specs:** AdvancedMetanormaToolbar/README.md §6, all six AMT member
pages.

**Commits:** `9a4a8ba`.

---

### 2026-07-16/17/18 — Initial spec set created

Schema, MetanormaProseMirror, MetanormaToolbar, and EditorCommands specs
written from scratch, establishing the layered architecture (schema → editor →
toolbar) and the cross-spec reference graph. The seven-page
AdvancedMetanormaToolbar spec (README + tables, images-figures, sections,
reference-marks, definition-lists, undo-redo) was written in the same burst,
covering the six feature areas the base toolbar defers.

**Affected specs:** schema.spec.md, MetanormaProseMirror.spec.md,
MetanormaToolbar.spec.md, EditorCommands.spec.md,
AdvancedMetanormaToolbar/README.md + 6 member pages.

**Commits:** `fcb7ecb`, `cdfa6a4`, `1c4f27d`.
