# Spec changelog

Curated records of significant spec transitions. Not every spec edit appears
here — routine changes are in `git log`. Entry bar: the change spans
multiple commits or specs, or its narrative isn't recoverable from commit
messages. See [CONVENTIONS.md](./CONVENTIONS.md) §4.

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
