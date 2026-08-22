# ProseMirror Minimap — Block-Level Canvas Overview Specification

This spec defines `@metanorma/prosemirror-minimap` (`pkg/prosemirror-minimap/`), a
schema-agnostic, block-level, canvas-rendered document minimap for ProseMirror
editors. The minimap presents a scaled structural overview of the document
alongside the editor (as popularized by Sublime Text), supports
click/drag-to-scroll navigation, and scales to multi-megabyte documents.

**Scope.** The package owns the *pipeline*: document-model-derived block
geometry, stable block identity, incremental transaction diffing, prefix-sum
scroll mapping, adaptive rendering tiers, a layered canvas renderer, and a
draggable viewport overlay. The consumer owns the *policy*: the
ProseMirror schema, the node classification, the visual theme, and the DOM
placement. The package has no dependency on
[`schema.spec.md`](./schema.spec.md) — it walks any `prosemirror-model`
document — and ships a default classifier keyed off node shape (textblock /
atom / container), with an ancestor stack in the classifier contract — the
seam a structured schema
(e.g. the Metanorma cohorts,
[schema.spec.md](./schema.spec.md) §4) plugs into (§5.1, §5.3).

---

## 1. Purpose and scope

### 1.1 What this package is

A minimap component that renders one row per document *block* (paragraph,
heading, figure, table, …) rather than per visual line. Block-level resolution
is chosen over line-level because:

- ProseMirror's document model is a block tree, not a line array; there is no
  document-model notion of a wrapped line, so line geometry would have to come
  from DOM measurement, coupling the minimap to view layout.
- Block count is one to two orders of magnitude below visual-line count,
  bounding the model's size and paint work.
- Heights are editor-space pixels (§4.4). The minimap is a fixed scale over
  the *predicted editor layout*: `minimapY = scaleY × editorY`, so the
  slider, markers, and click targets agree with the real editor (and its
  native scrollbar) at every point, without per-region correction. The
  price is a **geometry epoch** — doc identity plus the inputs that
  determine layout (content width, font metrics; §4.6). A width or font
  change invalidates estimates (O(n) re-estimation, time-sliced per
  §7.3); a doc edit invalidates only the edited range. Row *count* is
  stable under width changes; row *heights* are not — the model re-prices
  heights, never re-derives rows.

### 1.2 The agnosticism contract

| Axis | Owned by | Mechanism |
|---|---|---|
| ProseMirror schema | Consumer | The package imports only `prosemirror-model` / `prosemirror-state` / `prosemirror-view` types; no schema constant is referenced. |
| Document model | Consumer | Geometry is derived from `doc.descendants()` walks; which nodes become rows is classifier policy (§5). |
| Internal appearance | Consumer | Visual classes are assigned by the classifier; colors, fonts, row height, and indentation come from the theme (§5.4). |
| External placement | Consumer | The package renders into a consumer-supplied container and ships no positioning rules beyond structural class hooks (§12). |

Anything the package assumes about the host editor is expressed as a constructor
option, not an import.

### 1.3 Why canvas, and why document-model geometry

**Why canvas.** A canvas minimap's cost is O(visible rows) per paint and
O(changed blocks) per edit; it is virtualizable (only the visible window of the
virtual minimap surface is drawn) and programmable — it can
draw structural information (nesting indent, per-class color) that a scaled DOM
clone cannot express. A DOM-clone minimap (`transform: scale()` over a cloned
subtree) is pixel-faithful but pays O(document DOM) per clone and per sync,
which is disqualifying at the multi-megabyte scale this package targets.
The clone technique remains attractive for a *hover-to-magnify detail view* of a
single block — bounded to one node's DOM, hence O(1) — and §10.2 reserves the
event surface such a view needs.

#### Prior art, and why this design sits where it does

- **TipTap declined a minimap in 2021** and no ProseMirror/TipTap package has
  appeared since; the niche the package fills is genuinely empty, so
  greenfield was the only option.
- **A production team running million-word novels over ProseMirror** built a
  highlight minimap by walking highlight **DOM elements** on every update
  ([forum thread 8096](https://discuss.prosemirror.net/t/how-to-handle-thousands-of-editor-instances-on-screen/8096)).
  That is the cautionary tale for the exact choice this spec makes: a minimap
  derived from the rendered DOM dies the day the editor virtualizes its
  content, because the DOM it walks no longer exists. This package's model
  is derived from the document model with measured DOM heights as *correction*
  (§4.4), so it survives an editor that culls unrendered blocks — the
  estimate still answers for blocks whose DOM is gone (§6.4).
- **Why not inline decorations for search/diagnostics?** ProseMirror places
  no cap on plugin-generated display changes, and the maintainers' guidance
  is that plugins "take responsibility for the amount of display changes
  they generate" ([forum thread
  8834](https://discuss.prosemirror.net/t/responsivness-improvements-for-rendering-of-a-large-set-of-decorations/8834));
  browsers degrade around a thousand *visible* inline decorations. At
  multi-megabyte scale, search matches and validation findings must live in
  a minimap layer (§8.4), not as thousands of editor inline decorations —
  viewport-scope what the editor does show, mirror the full set into a layer.

**Why document-model geometry.** Height and position estimates are computed
from the node tree (`node.type`, depth, text length, attrs), not from rendered
DOM. This makes the minimap correct before first layout, independent of node
views, and incrementally updatable from transaction change ranges. The DOM is
consulted only *advisoryly* — opportunistic height calibration (§4.5) and
precise scroll snapping (§6.4) — never as a synchronous dependency of the paint
path. An editor-space height model strengthens, not weakens, this property:
a measurement-driven model that had to read the DOM to answer "how tall is
block 4,000?" would break under any future editor-side culling; an
estimate-first model with measured correction (§4.4) answers for blocks whose
DOM is gone and is corrected when the DOM returns.

### 1.4 Relationship to the host editor

The package integrates at exactly one point: an `EditorView`. `createMinimap()`
returns a ProseMirror plugin that observes transactions and the scroll
container; the rendering component (`Minimap`, §11) mounts into any DOM
container the consumer provides and reads the controller through the
view-keyed registry (`getMinimapController(view)`, §7.1).
The host editor component ([`MetanormaProseMirror.spec.md`](./MetanormaProseMirror.spec.md) §5)
treats the minimap like any other child rendered alongside `ProseMirrorDoc`.

---

## 2. Module layout

Flat layout at the package root (consistent with the other `pkg/` packages);
TypeScript source at `pkg/prosemirror-minimap/`:

| File | Responsibility |
|---|---|
| `index.ts` | Public API re-exports (§13). |
| `types.ts` | All public types: `MinimapOptions`, `MinimapClassifier`, `MinimapTheme`, `LayerDeclaration`, payload types (§8.1). |
| `plugin.ts` | `createMinimap(options)` — the ProseMirror plugin; the view-keyed controller registry (`getMinimapController`, §7.1). |
| `controller.ts` | `MinimapController` — the view plugin owning the block model, geometry, tiers, and scheduling (§7). |
| `blockModel.ts` | Flattening walk, block list, paired incremental diff, `countRows` (§4.1, §7.2, §6.5). |
| `identity.ts` | Stable block identity via `WeakMap<Node, number>` (§4.3). |
| `heights.ts` | Height strategies and the calibration store (§4.4, §4.5). |
| `geometry.ts` | Prefix-sum offsets, window mapping, row lookup (§6.1–§6.4). |
| `tiers.ts` | Tier selection, hysteresis, aggregation (§6.5). |
| `renderer.ts` | The `Renderer` interface, `InlineRenderer`, `RecordingRenderer` (test double) (§8.1, §8.3). |
| `layers.ts` | Built-in layers: `text`, `selection`; span types (§8.4). |
| `overlay.ts` | Viewport indicator overlay element and drag handling (§9). |
| `scroll.ts` | Scroll-mapping strategies: `proportional`, `precise` (§6.4, §10.1). |
| `react.tsx` | The `Minimap` React component (§11). |
| `minimap.css` | Structural styles and DOM-overlay tokens (§12). |
| `test.mjs` | Headless `node:test` suite (§15). |

---

## 3. Dependencies

| Dependency | Kind | Purpose |
|---|---|---|
| `prosemirror-model` | peer | `Node`, `Schema` types; `doc.descendants`. |
| `prosemirror-state` | peer | `Plugin`, `PluginKey`, `Transaction`. |
| `prosemirror-view` | peer | `EditorView` (controller reads `view.dom`, `view.coordsAtPos`, `view.nodeDOM`; the scroll container is resolved from the view, §7.1). |
| `react` | peer (optional) | Only `react.tsx` imports it; core packages stay framework-free. Consumers not using React import `"./core"`, which excludes `react.tsx` from the module graph entirely (§3.1). |
| `typescript`, `@types/react`, the three prosemirror packages, `prosemirror-transform` (test-only: `Mapping`/`StepMap` fixtures) | dev | Compilation and the headless test suite. |

No dependency on `@metanorma/prosemirror-schema`, `@metanorma/prosemirror-editor`,
or `@handlewithcare/react-prosemirror`. Zero runtime dependencies.

`package.json` follows the sibling pattern (`type: "module"`, `main:
"index.ts"`, `scripts.compile = "tsc --outdir compiled"`, `scripts.test =
"node --test test.mjs"`), with an export map exposing `"."` (core + React) and
`"./core"` (core only — the React-free entry; a bundler following it never
resolves `react`).

### 3.1 Export map

| Subpath | Contents | Resolves `react`? |
|---|---|---|
| `"."` | Public API (`index.ts`): everything in `"./core"` plus `react.tsx`'s `Minimap` component (§13). | yes (optional peer) |
| `"./core"` | `plugin.ts`, `controller.ts`, the model/geometry/tier modules, renderers, `scroll.ts`, types — everything except `react.tsx`. | no |

The `"./core"` entry exists so a framework-free consumer never resolves the
optional React peer: `index.ts` re-exports from `react.tsx`, so the top-level
entry always pulls it in, while `./core` never mentions it.

---

## 4. The block model

### 4.1 Block selection (the flattening walk)

The document is flattened into an ordered row list by a walk:

```ts
flatten(doc, classifier): BlockRow[]
```

For each node visited (pre-order, via `node.descendants` semantics):

1. Inline nodes (`node.isInline`) are skipped — rows are block-level.
2. The classifier's `row(node, depth, ancestors)` decides whether the node
   contributes a row (§5.1). `ancestors` is the node's block-ancestor chain,
   outermost first (document root excluded, the node itself excluded), letting
   a row's class be derived from an ancestor — e.g. a heading colored by its
   section's cohort (§5.3). A node that contributes a row may still be
   recursed into when `classifier.recurse(node)` returns `true` (default:
   recurse into any node that is neither a textblock nor a leaf/atom —
   container sections behave this way: they are transparent as rows, their
   children are rows).
3. Row order is document order; the row list is the single source of minimap
   geometry.

The default classifier makes **textblocks and atom/leaf blocks** the rows and
treats all other block nodes as transparent containers. Under this default a
sectioning schema needs no special handling: a clause's `section_title`
textblock child is the row, and nesting is conveyed by indentation (§5.2).

### 4.2 `BlockRow`

| Field | Type | Description |
|---|---|---|
| `key` | `number` | Stable identity (§4.3). Monotonic; never reused within a session. |
 | `pos` | `number` | The node's own ProseMirror position (doc content coordinates — the position `view.nodeDOM(pos)` resolves; updated as positions shift; identity does not). |
| `node` | `Node` | Reference to the document node (main thread only; not part of the renderer-facing payload — see §8.1). |
| `classId` | `string` | Visual class assigned by the classifier (§5.1). |
| `depth` | `number` | Block-tree depth (drives indentation when the class opts in). |
| `textLength` | `number` | `node.content.size` for textblocks; `0` otherwise. |
| `heightPx` | `number` | **Measured** editor-space height in px, when a sample exists (§4.5); `null` while unsampled. |
| `estHeightPx` | `number` | **Estimated** editor-space height in px (§4.4). Authoritative when `heightPx` is `null`; a measured row prefers `heightPx`. |
| `strategy` | `HeightStrategy \| null` | The row-level strategy the classifier assigned (§5.1 `RowSpec.height`), `null` for the class-level one. Retained so epoch re-estimation (§4.6) reproduces the row's own estimate — the mechanism behind §15.1.16's "row's own retained strategy". |
| `sampledAtEpoch` | `number` | Internal bookkeeping: the geometry epoch (§4.6) `heightPx` was measured in; `0` = never. A measured row is skipped by the sampler only within its own epoch, so an epoch change re-arms it for lazy re-sampling while it keeps its measurement. |
| `text` | `string \| null` | Cached plain text (`node.textContent`), populated lazily for visible rows (§6.3, §8.1). |

The effective height of a row is `heightPx ?? estHeightPx`. All offsets
(§6.1) and window math (§6.3) are computed over effective heights and live in
**editor-space pixels**; the minimap is a uniform scale over editor space
(§6.2). Rows have no minimap-native height unit.

### 4.3 Stable block identity

ProseMirror's immutable documents use structural sharing: applying a
transaction leaves every untouched subtree's `Node` instance **referentially
identical** (`===`) in the new document. The block model exploits this:

- Identity is a monotonic counter stored in a module-level
  `WeakMap<Node, number>` (`identity.ts`). A row's `key` is assigned the first
  time its node is walked and is looked up by reference thereafter.
- Editing one paragraph changes that paragraph's node identity (new key) and
  nothing else — every other row keeps its key, its cached height, and its
  cached text regardless of how positions shifted.
- The incremental diff (§7.2) is a paired walk of the old and new documents:
  wherever `newNode === oldNode`, the entire subtree's rows are carried over
  without visiting children. The walk cost is proportional to the changed
  subtree, not the document.

This is deliberately schema-agnostic: no reliance on `id` attrs, no plugin
dependency, no position arithmetic. A consumer schema whose nodes carry stable
`id` attributes may expose them through the classifier for display purposes,
but identity itself needs nothing from the schema.

### 4.4 Height estimation strategies

Heights are **editor-space pixels** — estimates of the block's rendered height
in the editor's own coordinate system. Estimation is per visual class, not a
single formula. The classifier assigns one of:

| Strategy | Height computed as | Appropriate for |
|---|---|---|
| `text` | `max(1, ceil(textLength / charsPerLine)) × lineHeight + spacing` — `charsPerLine` calibrated from the editor's content width and font (§5.4); `lineHeight` and `spacing` are theme parameters. | Textblocks. |
| `fixed` | constant px supplied per class | Blocks with a stable aspect (footnote markers are sub-row; dividers are one row). |
| `estimate` | `f(node) => px` supplied per class | Blocks whose attrs predict size — e.g. a table's row count × rowHeight, a sourcecode block's line count × lineHeight. |
| `calibrated` | per-class running median of DOM samples (px), seeded with a per-class default | Atom/complex blocks whose rendered height is unrelated to text length (figures, formulae, requirement blocks). |

Every strategy produces a positive px value; a row never *paints* below the
`rowHeight` floor (§5.4, §6.2) however small its estimated editor height. A
`calibrated` class whose samples are absent uses its default. Images are
estimated from their `width`/`height` attrs (aspect-preserving against the
content width) — never decoded for the minimap. Estimated heights never gate
correctness of navigation: §6.4 defines how a click lands precisely despite
estimate error, and measured correction (§4.5) drives the estimate toward the
real layout over time.

### 4.5 DOM calibration (advisory sampling)

For `calibrated` classes — and opportunistically for any class whose sampled
heights diverge from its estimate — real rendered heights are sampled:

- Sampling happens only inside the already-scheduled repaint frame, after
  the render request has been issued, for at most `sampleBudget` blocks per
  frame (default 4). A frame that sampled rows schedules the next frame —
  correction is self-driving and stops when no row makes progress (all
  rows measured this epoch, or their DOM unavailable), so the model
  converges on the real layout instead of stalling after the build.
- A sample is taken via `view.nodeDOM(row.pos)` → the distance from the
  row's rect top to the NEXT row's rect top (the row's **layout stride**),
  falling back to the rect height for the final row. The stride, not the
  rect height, is the vertical space a row occupies: rect heights exclude
  the inter-block margins (a 24px-tall paragraph occupying a 40px stride),
  and a model built from rect heights under-predicts the document by the
  total margin budget, fighting the §6.3 drift corrector. Strides sum to
  ≈ the editor's `scrollHeight` — the quantity the model predicts. The
  sample populates the row's `heightPx` directly and updates the per-class
  **running median** (used for class defaults and for seeding new rows of
  that class). Sampling never triggers new layout work in the scroll path
  (§10.1) and never blocks a paint: height changes from calibration are
  applied on the next frame.
- **Unrendered blocks sample as null.** A row whose `nodeDOM(pos)` returns
  `null` — a virtualized-away editor, a culled subtree — keeps its estimate
  untouched; no correction is attempted or needed (§6.4).
- The document model remains authoritative for structure; the DOM is sampled,
  never synchronously depended upon.

### 4.6 Geometry epochs

Editor-space estimates are functions of the editor's layout inputs, not the
document alone. The model tags its derived geometry with a **geometry epoch**:
the tuple `(doc, epochInputs)` where `epochInputs` = (content width, font
metrics/size, line height, spacing constants). The rules:

- A **transaction** invalidates only the edited range's rows (§7.2) — epoch
  unchanged.
- An **epoch change** (window resize, sidebar toggle, font load, consumer
  zoom) invalidates every row's `estHeightPx` (measured `heightPx` values are
  kept — a block whose rendered height was measured keeps that measurement
  until a new sample says otherwise) and re-runs estimation, time-sliced
  (§7.3). Measured rows surviving an epoch change are re-sampled lazily as
  they re-enter the window.
- Epoch changes are detected through the same refresh points as geometry
  cache refresh (§7.4): the `ResizeObserver` on the scroll container and
  content DOM, plus `document.fonts.ready` / `fontchange`-equivalent events
  when the theme font changes.

---

## 5. The classifier contract

### 5.1 `MinimapClassifier`

```ts
interface MinimapClassifier {
  /** Visual class for a node as a row; null → not a row (descend per recurse()). */
  row(node: Node, depth: number, ancestors: readonly Node[]): RowSpec | null;
  /** Whether to visit children of a node that is itself a row. Default: !isTextblock && !isLeaf. */
  recurse?(node: Node): boolean;
}

interface RowSpec {
  classId: string;          // key into theme.classes and height strategies
  height?: HeightStrategy;  // overrides the class-level strategy for this node
}
```

The classifier receives the live `Node`, so `row()` may branch on attrs
(instance-specific heights), marks (via `node.marks`), or depth. `ancestors` is
the node's block-ancestor chain, outermost first (the document root excluded,
the node itself excluded) — the context a group-keyed classification needs
when the row node itself is groupless (§5.2, §5.3).

### 5.2 Default classifier (shape-keyed)

The default classifier derives visual classes from **node shape**, with no
configuration surface:

| Node shape | Row? | `classId` |
|---|---|---|
| Textblock (`node.isTextblock`) | yes | `"text"` |
| Atom or leaf block | yes | the type's name |
| Other block node | no (recurse) | — |
| Inline node | skipped | — |

A `classId` with no `theme.classes` entry renders with the `"text"` entry's
color. The shape trichotomy covers every schema: textblocks and atom/leaf
blocks are rows, other block nodes are transparent containers. Any
schema-derived refinement — cohort coloring, per-type heights, indentation
policy — is consumer classifier code over `node.type`, attrs, marks, depth,
and `ancestors` (§5.3). The default deliberately ships **no knobs**: an
earlier draft exposed an ordered node-group list (`groupOrder`) to let the
default classify by schema groups, but the one host that exercised it
(§5.3) keys off type names, attrs, and ancestors instead — the exact inputs
a custom classifier branches on — so the option bought nothing and was cut.
Group queries remain available *inside* consumer classifiers through the
public `NodeType.isInGroup(name)` API.

### 5.3 Consumer example (structured-document schema)

For the Metanorma host, the classifier the GUI supplies maps classes to the
schema's types and cohorts — section containers remain transparent (their
`section_title` children are the rows, colored by the section's cohort via
`ancestors`), and complex blocks get explicit strategies:

```ts
const metanormaClassifier: MinimapClassifier = {
  row(node, depth, ancestors) {
    if (node.type.name === "section_title") {
      // Groupless node (§4, schema.spec.md): its own groups never match —
      // the section cohort comes from the nearest ancestor section.
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const type = ancestors[i]!.type;
        for (const cohort of ["section_front", "section_body", "section_annex", "section_back"] as const) {
          if (type.isInGroup(cohort)) return { classId: `heading-${cohort}` };
        }
      }
      return { classId: "heading" };
    }
    if (node.type.name === "floating_title") return { classId: "heading-floating" };
    if (node.type.isInGroup("block")) {
      if (node.type.name === "sourcecode") return { classId: "code",
        // The code text is the node's text* content, not an attr (§6.1, schema.spec.md).
        height: { kind: "estimate", px: (n) => Math.max(2, n.textContent.split("\n").length) * 20 } };
      if (node.type.name === "figure") return { classId: "figure", height: { kind: "calibrated", defaultPx: 240 } };
      if (node.type.name === "table") return { classId: "table",
        // childCount counts head/body/foot sections — descend to rows for size
        height: { kind: "estimate", px: (n) => (countDescendants(n, "table_row") + 1) * 32 } };
      return { classId: "text" };
    }
    if (node.isAtom) return { classId: node.type.name }; // default fallback (§5.2)
    return null; // containers descend
  },
  // figure/table are rows AND composites: without this override the walk would
  // also descend into them and add a row per caption paragraph / cell (§4.1).
  recurse(node) {
    return node.type.name !== "figure" && node.type.name !== "table";
  },
};
```

This example is illustrative; nothing in the package references these names.

### 5.4 Theme (appearance)

```ts
interface MinimapTheme {
  rowHeight: number;          // minimum row footprint in minimap px
                              // (default 3) — a row never paints smaller than
                              // this regardless of scale (§6.2); also the
                              // tier/sampling floor
  charsPerLine: number;       // text-strategy calibration (default 80)
  lineHeight: number;         // editor line height in px (default 24) — the
                              // text height strategy's unit (§4.4)
  spacing: number;            // per-block vertical spacing in px (default 0) —
                              // added by the text strategy (§4.4)
  indentUnit: number;         // px per depth step (default 2)
  font?: string;              // tier-1 glyph font (default: theme mono token)
  classes: Record<string, {
    color: string;            // the class's row/marker color
    indent?: boolean;         // indent by depth × indentUnit
    glyphs?: boolean;         // tier-1 per-character glyphs — default
                              // **false** (rectangles); `true` is
                              // experimental (see below)
  }>;
  selection: { color: string; alpha: number };
  background: string;
}
```

**`glyphs: true` is experimental.** The glyph path carries known defects
(the rectangle default exists to route around them):

- The atlas cell is a fixed 4×10 px with a 3 px advance; full-width CJK
  glyphs need ~1 em (9 px at the default font), so they clip and overlap —
  the reported illegibility.
- Per-character blitting performs no bidi reordering: RTL runs paint in
  logical order.

Enable it per class only where those defects do not apply (short, LTR,
Latin-only content — e.g. section titles). The knob is also
downgrade-only: it never upgrades a tier-2/3 row to glyphs (§6.5).

**Fallback inheritance.** A `classId` with no `classes` entry resolves
through `classes['text']` (§5.2) — it inherits that entry's `glyphs` value
exactly as it inherits its color. Disabling glyphs on `text` therefore
disables them for every un-themed class; theme every class explicitly when
mixing.

A neutral `defaultTheme` ships in `types.ts`; the consumer overrides any
subset via `MinimapOptions.theme`. The theme is the **single source of every
canvas-painted value**: painting consumes only the declarative inputs passed
through the `Renderer` interface (§8.1), never live DOM or computed styles.
This keeps the renderer deterministic and fully observable by the headless
`RecordingRenderer` (§8.3), and leaves the door open for a worker-backed
renderer behind the same interface without changing any caller (§8.2). A host
that keeps its palette in CSS custom properties (e.g. the `--mn-*` layer,
[`MetanormaProseMirror.spec.md`](./MetanormaProseMirror.spec.md) §9.2) reads
them once in TypeScript (`getComputedStyle`) and passes the results in
`theme`; a React host re-reads on theme-change events the same way — a theme
change whose font metrics differ is also a geometry-epoch change (§4.6). The
one exception is the viewport indicator overlay (§9.1) — a DOM element,
styled by CSS like any other (§12).

---

## 6. Geometry and virtualization

### 6.1 Prefix-sum offsets

Row geometry is a prefix-sum over effective heights (`heightPx ?? estHeightPx`,
§4.2) — **in editor-space pixels**:

- `offsets: Float64Array` of length `rows + 1`; `offsets[i]` is the top of row
  `i` in editor-space px; `total = offsets[rows]` is the model's predicted
  document height.
- Maintained incrementally: a diff that changes `k` rows re-sums only from the
  first changed index; every offset after it shifts by the cumulative delta —
  a single subtraction pass, O(n) worst case but a tight loop over a
  `Float64Array` (~0.1 ms at 100k rows), so no tree structure is warranted.
  Edits early in the document shift all later offsets — the pass is cheap;
  the point of incremental maintenance is skipping re-*estimation* and
  re-identity work, not the re-sum.
- `rowAt(offset)` is a binary search over `offsets` — O(log n) (~17 steps at
  100k rows).

### 6.2 Display modes and scale

The minimap is a **uniform scale over editor space**: every minimap x/y is
`scale × editor-coordinate`. Because row heights are editor px, the minimap's
proportions match the real editor — the viewport indicator, markers, and
click targets are linearly accurate wherever they sit, agreeing with the
editor's native scrollbar rather than approximating it.

| Mode | `scale` | Use |
|---|---|---|
| `fit` | `containerHeight / max(model total, real scrollHeight)` — the whole document in view. The surface spans the container's REAL scrollable extent, so the thumb maps exactly onto `[0, maxScroll]` however much the model under-predicts (container paddings own no rows; unsampled rows estimate low). A non-scrolling container (`scrollHeight ≤ clientHeight`) contributes no extent and fit follows the model alone. Clamped by the §6.2 row floor. | Small documents; classic "entire doc visible" behavior. |
| `sliding` (default) | a consumer/theme zoom (`zoomPxPerEditorPx`, default `0.25`); the minimap is a virtual surface of height `scale × total`, and the container shows a **window** into it that slides as the editor scrolls. When the surface exceeds the pane the window slides PROPORTIONALLY with the scroll fraction — `origin = frac × (surface − pane)`; when the surface fits inside the pane (a zoomed-out document) the surface paints at the pane's top (origin 0) and the pane's remainder stays empty. Proportional (not content-centered) keeps the thumb monotonic across the whole scroll range: a content-centered window pins the thumb mid-pane for the document's entire central region (a drag dead zone). The paint window in editor px is the pane's surface span (`containerHeight / scale`). The THUMB is content-aligned in every mode (§9.1). | Large documents; preserves row legibility. |

Mode is a `MinimapOptions.display` value; `auto` (default) selects `fit` when
`zoomPxPerEditorPx × total ≤ containerHeight` and `sliding` otherwise. In
`fit` mode the derived scale is clamped so no row paints below the theme's
`rowHeight` floor (default 3 minimap px; §5.4) — and never below 1 device px
— mirroring the production minimaps that survive unbounded documents by
never rendering less than a pixel per row. In `sliding` mode the zoom is
fixed and short rows simply paint at the floor.

### 6.3 Window mapping (scroll → row range)

With cached editor geometry (`scrollTop`, `scrollHeight`, `clientHeight` of
the scroll container resolved in §7.1 — see §7.4 for when these are read):

```ts
windowTop    = scrollTop                      // editor px — identical units
windowBottom = scrollTop + clientHeight
[first, last] = rows intersecting [windowTop, windowBottom]   // binary search
```

No proportional normalization is needed: the model's coordinate system *is*
the editor's (§6.1), so the visible editor range maps directly onto rows.
`scrollHeight` still participates as a **calibration check** —
`total` should track `scrollHeight`; a sustained divergence beyond
`maxScrollDrift` (a `MinimapOptions` value, default 5%) re-calibrates so
estimates do not systematically over- or under-predict: unsampled
estimates are scaled by the observed ratio (`scrollHeight / total`) and
the offsets re-summed; measured `heightPx` values are left alone
(measurement outranks drift correction). The check never runs while a
sliced build is open (§7.3) — a partial model's `total` against the full
document's `scrollHeight` is a meaningless ratio that would permanently
inflate the built prefix.

Only rows `[first, last]` (plus a margin of `overscanRows`, default 8) are
sent text for and painted. This is the viewport virtualization borrowed from
`@replit/codemirror-minimap`: paint cost is O(window), independent of document
size. In `fit` mode `windowTop = 0` and the range is all rows.

### 6.4 Click/drag mapping (row → scroll)

Row offsets are estimates of the editor's real layout; measured correction
(§4.5) and the editor-space model keep the error small, and two mapping
strategies resolve a target row to an editor scroll position:

| Strategy | Computation | Used for |
|---|---|---|
| `proportional` | For the drag: the scrollbar fraction — `scrollTop = (thumbTop / (pane − thumbHeight)) × maxScroll` over the real scroll geometry (§9.2; the inverse of the thumb placement, §9.1). For row-keyed lookups: `targetScrollTop = rowCenterOffset` in editor px, a unit-preserving lookup. | Continuous drag (every pointermove) and keyboard scrolls; row-keyed when the caller holds an editor-space offset. |
| `precise` | Resolve the row's `pos` through `view.coordsAtPos(pos)` (or `view.nodeDOM`) to its real content-space top `realTop`, re-based into the model's origin frame by the measured top of row 0 (`contentOrigin` — a padded scroll container places row 0 `k` px below scrollTop 0, and `realTop` carries that constant while the model's origin is 0); scroll to `(realTop − contentOrigin) − (rowTopModel − proportionalResult)` — i.e. keep the viewport-relative offset the `proportional` result gave the row, but realize it with the row's REAL top. With an accurate model the result equals the `proportional` result exactly; with model error `e` at the row the result differs by exactly `e`. **Null path:** when `nodeDOM(pos)` returns `null` (a virtualized/culled editor, §4.5), `precise` degrades to the `proportional` result — the estimate lands close, and a correction fires when the block re-renders. | Keyboard settle (§9.3) — one layout-accurate snap per gesture; NOT drag release (§9.2). |

The hybrid keeps the drag path free of forced layout: drags run purely
`proportional` from pointerdown through release (release is continuity,
§9.2), and the one `precise` snap per gesture — the keyboard settle (§9.3)
— is user-initiated, so its layout cost is acceptable.

### 6.5 Adaptive tiers

The renderer's per-row fidelity degrades with row count so that the model's
row count — and the paint work — stays bounded at any document size:

| Tier | Condition (row count) | Row rendering |
|---|---|---|
| 1 — `text` | ≤ `tier1Rows` (default 5,000) | Per-class: atlas glyphs for classes with `glyphs: true` (**experimental**, §5.4) — real glyphs blitted from a **pre-rasterized atlas** (one per theme font), per-class color; **filled bars** (the tier-2 rectangle shape, minus a proportional inter-row gap — 15% of the slot, so consecutive rows read as separate lines at any scale instead of merging into one solid block) for every other class, which is the default. The tier-1 fidelity *budget* is unchanged — only the default paint shape flips. |
| 2 — `blocks` | ≤ `tier2Rows` (default 50,000) | Filled rectangles: width by text length (clamped), color by class, indent by depth. |
| 3 — `aggregate` | > `tier2Rows` | Tier-2 rendering over **aggregated** rows: runs of ≥ `aggregateMin` (default 4) consecutive rows with the same `classId` and depth merge into one row whose height is the summed px (capped at `aggregateMax`, default 16 × median row px). |

**Why an atlas, not `fillText`.** Both production references converge on this:
`@replit/codemirror-minimap` carries an unresolved in-source TODO — *"`fillText`
takes up the majority of profiling time"* — and VS Code prebakes a 96-glyph
atlas precisely to keep text shaping off the paint path. Tier 1 rasterizes the
theme font's glyph set once (lazily, on first tier-1 paint), caches it per
(font, scale), and blits — per-row cost returns to rect territory. Iteration
is by Unicode code point (`Array.from`), so an astral-plane character is one
cell and one cache key, never two lone surrogates. Blits bypass the CSS-px
paint transform: per row, the renderer neutralizes it and lands each glyph
1:1 at integer device px (y rounded once per row, so the
whole row shares one band; x per glyph) — a baked cell is never resampled,
so glyphs stay crisp at any DPR, fractional included.

**Marker survival under aggregation.** Aggregating a run must not swallow a
row that carries layer spans (§8.4): the aggregator splits the run around any
marked row. Landmarks survive aggregation structurally (a heading's class
differs from its siblings'), markers survive by rule — a document can compress
without hiding the one diagnostic the user is looking for.

Aggregation collapses paragraph runs — the bulk of any prose document — so the
effective row count stays below the tier-2 bound; structure-bearing rows
(headings, figures, section titles) survive because their classes differ or
their runs are short. Tier selection is **hysteresis-guarded**: promotion
happens at the threshold, demotion only at `0.9 ×` threshold, preventing tier
flapping while editing near a boundary. A tier change re-publishes the full
block payload (§8.1) but is rare (structural growth, not keystrokes).

**Terminal rungs.** Beyond tier 3, fidelity stops and the affordances remain —
the ladder production minimaps climb on pathological inputs (CodeGlance Pro
documents its own: shrink px-per-line, skip syntax, *Empty Minimap*, hide):

| Rung | Condition | Behavior |
|---|---|---|
| `marks-only` | Model-build slices (§7.3) cannot keep up with edits, or the document is image-dominated (row content carries no navigational signal) | The `text` layer is disabled; slider, layers (§8.4), and interaction continue — navigation and diagnostics survive without content paint. |
| `hidden` | Row count > `hideRows` (a `MinimapOptions` value, **no default** — the consumer opts in) | The minimap renders nothing and releases its model; `createMinimap`'s plugin stays mounted so crossing back under the threshold restores it without remount. |

Both rungs are automatic: `marks-only` engages when the time-sliced build
misses two consecutive deadlines (§7.3) and **releases** when a full slice
completes under budget (a consumer-set `marksOnly: true` forces the rung
and pins it); `hidden` is a policy threshold. The
1-device-px row floor (§6.2) bounds `fit`-mode scale so paint cost stays
constant even before aggregation engages.

While hidden, the model is released but the controller keeps a lean
row-count (a counting walk over the changed doc, no row objects) so an
edit that drops the document back under `hideRows` restores the minimap
without remount — the plugin stays mounted throughout (§7.1).

---

## 7. The ProseMirror plugin

### 7.1 `createMinimap()`

```ts
createMinimap(options?: MinimapOptions): Plugin
```

Returns a plugin with two halves:

- A **view plugin** (`MinimapController`) constructed with the `EditorView`,
  owning the mutable block model, geometry, tier state, calibration store, and
  the scheduler. The controller is not stored in editor state: derived caches
  of this size belong to the view, keyed by document reference
  (`model.doc === view.state.doc` is the fast-path skip). It is reachable from
  the rendering component through a module-level view-keyed registry,
  `getMinimapController(view)`, exported alongside the plugin (§13) —
  a `WeakMap<EditorView, MinimapController>` populated by the view plugin's
  constructor and cleared on `destroy`. One live controller per view: a
  second `Minimap` component bound to the same view shares it; a view
  re-created under React StrictMode's double-invoked effects registers a
  fresh controller, and the old one is collected with its view.
- A **scroll-container contract.** ProseMirror's `EditorView` has no
  scroll-container accessor — which element scrolls is a consumer layout
  decision. The controller resolves it once, at construction: the nearest
  ancestor-or-self of `view.dom` whose computed `overflow-y` is not `visible`,
  falling back to `view.dom` itself when none scrolls (§10.1 then reads
  `scrollTop` from it; §6.3/§6.4's cached `scrollHeight`/`clientHeight`
  likewise). A consumer whose scrolling element is known statically may pass
  `scrollContainer: (view) => HTMLElement` in `MinimapOptions` to skip the
  walk. Resolution result is cached; §7.4's refresh points cover the rare
  re-resolution cases (the `ResizeObserver` fires when the resolved element
  changes size).

`MinimapOptions` (all optional): `classifier` (§5.1), `theme` (§5.4),
`display` (§6.2), `layers` (§8.4), `scrollContainer` (§7.1),
`overscanRows`, `sampleBudget`, `sliceBudgetMs`, tier thresholds and
`hideRows` (§6.5), `maxScrollDrift` (§6.3), `zoomPxPerEditorPx` (§6.2),
`marksOnly` (§6.5, forced rung — e.g. image-dominated documents),
`onBlockHover` (§10.2).

**Transaction capture (§7.2).** A ProseMirror view plugin's
`update(view, prevState)` does not receive the transaction, and
`state.tr` is a factory — every read constructs a fresh, empty
`Transaction`, never the one that produced the state. `createMinimap()`
therefore carries a **state-slot plugin** (`apply` records the incoming
transaction) whose captured transaction the view-plugin half reads once
per `update`. A `null` capture means "no new transaction" (selection-only
state swaps still surface through the doc-reference check).

### 7.2 Incremental transaction diffing

On each transaction:

1. `!tr.docChanged` → only selection/viewport updates run (§8.4); the block
   model is untouched.
2. `tr.doc === previous doc reference` → nothing at all.
3. Otherwise, a **paired walk** of the previous and current documents from the
   root: where child nodes are `===`, carry over the subtree's rows (keys,
   heights, cached text) without visiting; where they differ, recurse. The
   result is a patched row list plus a set of changed indices. Cost is
   proportional to the edited subtree(s). `tr.mapping` is used only to update
   `pos` fields of carried rows whose positions shifted — a mapped-position
   update, not a re-walk.
4. Heights, offsets (§6.1), and tier (§6.5) are recomputed from the changed
   indices outward; the renderer receives a sparse `blocks` update (§8.1)
   covering only the changed chunks — an insertion/deletion (any index
   shift) extends the push to the end, a pure replacement stops after the
   last changed row. The diff reports `[firstChanged, lastChanged)` plus a
   `structural` flag; the re-sum starts at `firstChanged`.
5. Layer producers (§8.4) map through the same diff: a layer whose spans
   anchor to positions or node ids re-anchors through `tr.mapping` and
   `rowAtPos(pos)` — it never re-walks the document.

**Controller mapping surface.** The controller exposes the position↔row
arithmetic layers need — this is the package's half of the layer contract:

- `rowAtPos(pos: number): number | null` — the row containing a document
  position, by binary search over row `pos` ranges (O(log n)); `null` when
  the position falls between rows (the next row's start is the caller's
  fallback).
- `mapPos(pos: number, tr: Transaction): number | null` — `tr.mapping.map`
  plus a deleted check, so producers can anchor to a position once and
   follow the document without holding a controller-side mirror of it.

Producers that prefer node ids (e.g. an async validation run reporting
against ids generated at insertion time) call `rowAtNodeId(id: string):
number | null`, which resolves the id to a live row through the row's `node`
reference. Ids that no longer resolve (deleted nodes, mid-rewrite) return
`null` and the producer's span is dropped until the next report — a stale
report degrades by disappearing, never by misplacing.

### 7.3 Time-sliced recomputation

Initial builds and large structural edits (paste, find-replace, undo of a big
deletion) are O(document) and must not block. The controller schedules work
through a `requestAnimationFrame` loop with a per-frame budget
(`sliceBudgetMs`, default 5):

- Each slice flattens/diffs at most `N` blocks (N chosen to fit the budget;
  measured per frame), then yields. `requestIdleCallback` is not used: it is
  absent in Safari and can starve under sustained main-thread load.
- Slices process the **visible range first**, then expand outward from it, so
  the user's viewport renders immediately and the rest fills in top-to-bottom.
- Completed slices publish progressively: the renderer paints whatever rows it
  holds and leaves the not-yet-built region as background. A `Building…`
  affordance is the consumer's choice (structural class hook, §12).
- **Deadline misses escalate.** Two consecutive slices overrunning
  `sliceBudgetMs` (measured, not assumed) engage the `marks-only` rung
  (§6.5) — the model build itself is de-prioritized to keep interaction
  responsive; the build continues in the background and the rung releases
  when a full slice completes under budget.

### 7.4 Geometry cache refresh points

Editor scroll geometry (`scrollHeight`, `clientHeight`) is **cached**, never
read per scroll event. Refresh points: `ResizeObserver` on the scroll container
(§7.1) and the content DOM; the post-paint tick after any `docChanged`
transaction — the one refresh point whose absence is user-visible, since
content typed or pasted after mount grows the extent while the container's
box (and thus the RO) never changes; `visibilitychange`; `document.fonts.ready`
(§4.6). All refreshes are coalesced into the frame batch (§7.3): one
`readGeometry` per frame, never a synchronous layout read in a transaction or
event handler. The scroll handler itself reads only `scrollTop` (§10.1).

---

## 8. Rendering architecture

### 8.1 The `Renderer` interface

All painting goes through one interface, so the inline renderer and the test
double are interchangeable:

```ts
interface Renderer {
  init(size: { width: number; height: number; dpr: number }): void;
  resize(size: { width: number; height: number; dpr: number }): void;
  setConfig(theme: MinimapTheme, layers: LayerDeclaration[]): void;
  setBlocks(chunk: BlocksPayload): void;      // structural arrays, chunked
  setScale(scale: number): void;              // editor-px → minimap-px (§6.2)
  setWindowOrigin(originY: number): void;     // sliding-window origin (§6.2)
  setWindow(firstRow: number, rowCount: number, texts: TextsPayload): void;
  setLayer(layerId: string, spans: LayerSpans): void;
  render(): void;
  destroy(): void;
}
```

Chunk addressing: a `BlocksPayload` is addressed by **absolute row index**
(`firstRow` + relative arrays); the renderer stores the merged absolute
arrays, so a chunk landing at any offset overwrites exactly its own
slice — a sparse push never mis-addresses. `setWindowOrigin` carries the
sliding window's offset on the virtual minimap surface (§6.2); the paint
path subtracts it once per row, keeping row geometry in surface
coordinates.

The interface methods speak only serializable data — typed arrays, strings,
plain numbers — never a live ProseMirror `Node` or DOM reference. The window
is **pushed, not pulled**: the controller knows the visible row range
(§6.3) and hands the renderer the rows, their class/depth/height arrays, and
their text (`texts` carries the plain strings for window rows; the renderer
never requests). The earlier draft's `requestText`/`setText` pull protocol —
designed for a message boundary the package no longer has (§8.2) — was
simplified into this push for exactly that reason; the payload *shapes*
(`setBlocks` chunked at `chunkRows` rows, default 2,000; `texts` covering
window rows + overscan) remain deliberately transfer-ready, preserving the
worker seam's data discipline without its protocol machinery.

### 8.2 Inline rendering only

The package ships exactly one production renderer: `InlineRenderer`, painting
on the main thread inside the rAF batch coalesced by the controller (§10.1).
No worker, no `OffscreenCanvas` transfer, no message protocol.

### Why inline-only

- **Per-frame paint is window-bounded, not document-bounded.** Virtualization
  (§6.3) caps painting at the visible window plus overscan — a few hundred
  rows regardless of document size — and the tiers (§6.5) drive per-row cost
  *down* as documents grow (tier 3 aggregates runs into ~tens of rectangles).
  A repaint costs on the order of 0.05–0.5 ms in tiers 2/3 and up to ~1 ms in
  tier 1; nothing here is worth a thread.
- **The expensive stages cannot leave the main thread anyway.** The
  `descendants()` walk, paired diff, height estimation, and prefix sums
  operate on the PM document, whose nodes are main-thread-only (§4.2). The
  model side — where the real cost lives — is already handled by time-slicing
  (§7.3), not threading.
- **The fidelity threshold where a worker pays is out of scope.** Offloading
  a sub-millisecond paint only matters when per-row fidelity (per-token
  coloring, sub-row shaping) or continuous animation pushes a repaint past
  ~1 ms sustained on target hardware — and §16 disclaims per-visual-line
  resolution, treating tier 1 as a legibility affordance, not a layout
  promise.

**Reversal condition.** Enable a worker-backed renderer when a *measured,
sustained* minimap repaint exceeds ~1 ms on target hardware, or when a
continuously animating or higher-fidelity paint feature enters scope. It
slots behind the unchanged `Renderer` interface (§8.1); nothing else in the
contract moves. Worker-rAF/`OffscreenCanvas` support is no longer the
obstacle it once was (all current engines ship it), so the decision is
purely about measured need.

### 8.3 Inline renderer and test double

`InlineRenderer` (main thread) and `RecordingRenderer` (records draw calls,
paints nothing — used by the headless suite to assert virtualization, layer
order, and draw behavior without a canvas implementation) both live in
`renderer.ts`.

### 8.4 Layer registry and draw order

Painting is layered — later layers draw over earlier ones. Layers *may* paint
on separate stacked canvases (an implementation allowance borrowed from
atom-minimap's back/tokens/front three-canvas stack): the `Renderer`
interface (§8.1) hides canvas count, and a layer whose update cadence differs
from the content layer's (search spans per keystroke vs. text per edit)
should not force a content repaint. `InlineRenderer` v1 uses one canvas;
splitting is a licensed optimization, not a contract. Layers are declared,
ordered, and extensible:

```ts
interface LayerDeclaration {
  id: string;                        // "text" | "selection" | consumer-defined
  z: number;                         // draw order, ascending
  kind: "background" | "content" | "overlay";
}
```

Built-in layers ship with the package:

| Layer | z | kind | Content |
|---|---|---|---|
| `text` | 10 | content | Rows: tier-1 glyphs or tier-2/3 rectangles, per-class color, indent by depth. |
| `selection` | 20 | overlay | Rows (or partial rows, tier 1) intersecting the editor selection. |

Consumer-declared layers extend the same mechanism — the pathway the package
reserves without implementing their sources:

| Future layer | Spans supplied by | Shape |
|---|---|---|
| Diagnostics (Metanorma validation / preflight) | consumer's lint pipeline | error/warning/info tone per row or row-range |
| Reviewer annotations | annotation store | marker strips beside rows |
| Search matches | search plugin | matched-row highlights, current-match accent |

#### The layer data contract

**Anchors, not row indices.** A layer's data flows as `setLayer(id, spans)`,
but spans are declared in *anchor space*, never in row indices — a row index
shifts under every edit above it, so an index-anchored span misplaces silently:

```ts
type LayerSpan =
  | { kind: "pos"; from: number; to?: number }    // document positions
  | { kind: "id"; id: string };                   // node id (schema-generated)
interface LayerSpans {
  anchor: "pos" | "id";
  spans: LayerSpan[];
  tone?: (anchor: LayerSpan) => string;           // tone per span, optional
  lane?: number;                                  // 0 = inline tint (default);
                                                  // 1+ = nth marker lane at the
                                                  // minimap's right edge
}
```

The **controller** resolves anchors to rows — `rowAtPos` / `rowAtNodeId`
(§7.2) — and re-anchors through `tr.mapping` on every transaction. The
producer's only job is to emit anchors in its own natural space; it never
sees rows. This is the deliberate division drawn from production minimaps'
overlay APIs (atom-minimap's service surface carried a dozen third-party
overlay plugins; VS Code's decorations carry `MinimapPosition` +
`overviewRuler` lanes): the extension contract is *typed anchors + lane
placement*, and the mapping machinery belongs to the one component that has
it.

**Anchor kinds and their lifetimes.** `pos` anchors are for producers that
live inside the transaction stream (a search plugin's `DecorationSet` maps
through `DecorationSet.map` for free and re-anchors per transaction). `id`
anchors are for async producers — a preflight validation run reports against
node ids it captured when it started; edits during the run re-anchor the
surviving ids, and ids that no longer resolve are dropped (§7.2) — a stale
report degrades by disappearing, never by misplacing.

**Rendering rules (the merge floor).** Layer paint cost is bounded by rule,
not by count:

- Marker-lane spans draw at a **minimum height of 6 device px** and any spans
  of the same tone within that floor **merge into one rect** — the geometric
  merge *is* the cap (this is VS Code's overview-ruler discipline: no
  numeric decoration limit exists, because density collapses into runs).
  Worst case per lane is `canvasHeight / 6` rects, regardless of whether the
  document carries 50 findings or 50,000.
- Lane assignment is producer policy: severity-distinct lanes (error /
  warning / info) so a warning-dense clause cannot occlude a single error.
- Inline-tint spans (lane 0) multiply with the row's class color at the
  span's tone alpha; they are clamped to whole rows.
- All spans are clipped to the visible window (§6.3); paint is O(visible
  spans + merge), never O(spans).
- Under tier-3 aggregation (§6.5), an aggregated run that contains any marked
  row is split so the mark retains its own row.

Selection spans are computed by the controller from `state.selection`
anchored to positions — the built-in `selection` layer is simply the
reference producer for the contract above.

### 8.5 Resizing and DPR changes

A `ResizeObserver` on the minimap container drives `resize` calls. The
overlay (§9) is repositioned from cached geometry in the same tick. Canvas
resize is itself a costly operation (atom-minimap documents this against its
own history), so the discipline is:

- **Coalesce**: one `resize` per frame, in the shared rAF batch (§10.1) —
  RO callbacks never resize synchronously.
- **Floor device pixels**: the backing store is
  `floor(cssSize × dpr)`; a change that does not move the floored
  device-pixel size is a no-op (sub-pixel container flutter never reallocs
  the backing store).
- **Detect DPR changes belt-and-suspenders**: a re-armed
  `matchMedia('(resolution: …dppx)')` listener plus a `devicePixelRatio`
  comparison inside the RO callback — WebKit does not
  re-evaluate the `resolution` media feature on page zoom (WebKit bug
  317839), so the MDN matchMedia pattern alone misses Safari zoom changes.

---

## 9. The viewport overlay

### 9.1 Structure and updates

The viewport indicator — the rectangle showing which part of the document the
editor currently shows — is a **separate DOM element**, not canvas paint
(borrowed from `@replit/codemirror-minimap`):

```html
<div class="mn-minimap">
  <canvas class="mn-minimap-canvas" aria-hidden="true"></canvas>
  <div class="mn-minimap-viewport" role="scrollbar"
       aria-orientation="vertical" aria-controls="<editor viewport id>"
       aria-valuemin="0" aria-valuemax="100" aria-valuenow="…"
       aria-label="Document position"></div>
</div>
```

The canvas is presentational (`aria-hidden`): the accessible content is the
document itself. The overlay *is* the accessible surface — it carries the
[`scrollbar`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/scrollbar_role)
role and its required semantics (§9.3), including `aria-controls`, whose
value the `<Minimap editorViewportId>` prop supplies (§11) — a consumer
that cannot identify the viewport element may omit it.

It is updated exclusively through `transform: translateY(px)` and `height`
(written only when the size changes) — compositor-friendly, no layout, no
repaint of the canvas beneath.

**The thumb is content-aligned in both display modes**: its height is the
viewport's share of the SURFACE — `clientHeight × scale`, floored at 2px and
capped at the pane — so it covers exactly the surface px the editor's
viewport shows. In fit mode (`scale = pane / extent`) this equals the
scrollbar proportion `clientHeight / extent × pane`; in sliding mode the
pane shows a window of the surface, and the pane's own extent must not enter
the thumb's size (a pane-fraction thumb on a zoomed-out document — surface
shorter than the pane — renders taller than the entire painted content and
slides over the empty region below it). The thumb's TOP position is
`frac × travel`, where `travel = min(surface, pane) − thumb`: with the
proportional window origin (§6.2) this is identically
`scrollTop × scale − origin`, so the thumb sits ON its content at every
scroll position. Dragging is the exact inverse (§9.2). `aria-valuenow`
tracks `scrollTop / max(1, scrollHeight − clientHeight)` (0–100).

### 9.2 Drag interaction

The overlay handles `pointerdown` → `setPointerCapture` → `pointermove` →
`pointerup`:

- Pointerdown reads the overlay rect and the minimap container rect once
  and caches both for the gesture, plus the **grab offset** (pointer y
  relative to the thumb top).
- Each move: the thumb top follows the pointer minus the grab offset,
  **clamped to the track** (the thumb never leaves the track, however far
  outside the pointer goes), and the editor `scrollTop` is set by the
  scrollbar fraction — `scrollTop = (thumbTop / (pane − thumbHeight)) ×
  maxScroll`. Real geometry only: no model-space mapping on the drag path,
  no sliding-origin basis to freeze (an origin-free mapping cannot feed
  back into itself), and it is exact by the same §9.1 formula that places
  the thumb — dragging IS the inverse of the thumb placement.
- Release: **continuity, not snap.** The commit applies the last move's
  own value — byte-identical position, zero delta. A `precise` snap at
  release (§6.4) would re-target by the model's local error and by the
  constant content-origin bias of padded containers — a few-px downward
  jump after every drag, perceived as jank even when the position is
  otherwise right. Clicks on the thumb (down-up without movement) are
  no-ops by the same math.
- The overlay consumes its own events (`stopPropagation` on pointer and wheel
  where the consumer's layout would otherwise forward them to the editor
  surface).

### 9.3 Keyboard operation

The overlay is focusable (`tabindex="0"`) and implements the `scrollbar` role's
keyboard contract, following the MDN `scrollbar` role reference:

| Key | Action |
|---|---|
| `ArrowUp` / `ArrowDown` | Scroll by one row's worth of editor height (the `text` height strategy's `lineHeight`, §4.4). |
| `PageUp` / `PageDown` / `Space` / `Shift+Space` | Scroll by one editor viewport height. |
| `Home` / `End` | Jump to document start / end. |

Keyboard scrolls use the `proportional` mapping (§6.4) — no layout reads —
and end with one `precise` snap when the gesture is discrete (key-up for
`Home`/`End`; arrow-repeat settles on the first quiet frame — a short
debounce after the last arrow key). All keyboard
interaction honors `prefers-reduced-motion` in the one place it can apply:
no animated/smooth scrolling is dispatched when the consumer requests
reduced motion and the platform `scrollIntoView({ behavior })` default would
animate.

---

## 10. Scroll and interaction discipline

### 10.1 Scroll event rules

The controller subscribes to the resolved scroll container's `'scroll'` event
(passive; container resolution is §7.1's contract). Per event it reads
**only `scrollTop`**, then schedules a single rAF that: computes the window
(§6.3, from cached geometry), updates the overlay transform (§9.1), and
issues one coalesced `setWindow`/`render` call on the renderer (§8.1). No
`getBoundingClientRect`, no `offsetHeight`, no style writes that would dirty
layout occur in this path. Multiple scroll events within a frame collapse to
one repaint.

### 10.2 Hover pathway (future magnify hook)

To keep a future hover-to-magnify DOM detail view possible without later API
breakage, the package contracts the following surface now:

- The container fires `minimapblockhover` DOM events (composed, bubbling)
  carrying `{ row, key, pos, classId, depth, clientY }` for the row under the
  pointer. `rowAt()` (§6.1) makes this O(log n). The event fires once per
  hovered row (not per pointermove pixel); hovering the viewport strip is
  the trigger surface.
- `MinimapOptions.onBlockHover?: (info) => void` receives the same payload.
- The row's `node` reference is reachable from the controller
  (`getMinimapController(view).rowNode(row)`, §7.1), giving a magnify view
  everything it needs to clone one block's DOM subtree — bounded to a single
  node, hence O(1) regardless of document size.

The magnify view itself is out of scope (§16).

---

## 11. React integration

`react.tsx` exports:

```tsx
<Minimap
  view={EditorView}          // required
  options?: MinimapOptions    // merged with the plugin's, plugin wins
  className?: string          // applied to the container (default "mn-minimap")
  style?: CSSProperties       // consumer placement
  editorViewportId?: string   // the editor viewport's id — aria-controls (§9.1)
/>
```

- Renders the container + canvas + overlay, wires the `ResizeObserver`, and
  resolves the controller from `view` via `getMinimapController(view)` (§7.1;
  the plugin must be installed in the view — a `null` return is a
  development-mode warning, not a crash).
- The `options` prop is re-applied on change through the controller's
  `reconfigure`: every key the plugin's own options **did not set** takes
  the component's value; a key the plugin set keeps the plugin's — the
  plugin wins (§7.1). Theme changes reaching the controller this way are
  geometry-epoch changes when their metrics differ (§4.6).
- Placement is fully external: the component has no opinion about flex order,
  side, or size beyond filling its container.
- Consumers hosting inside a React ProseMirror provider render `<Minimap>` as
  a sibling of the editor surface, in the host editor's `children` slot
  ([`MetanormaProseMirror.spec.md`](./MetanormaProseMirror.spec.md) §5 — the
  natural mount point). There is no context hook that hands the `EditorView`
  to a rendering component: the host's React ProseMirror library exposes
  `useEditorEffect((view) => …)` as the one hook whose callback receives the
  view; the component captures the view from it into local state on mount
  (a layout effect fires after the view is created, and re-fires with the
  same view reference thereafter, so a single assignment suffices).

  A consumer that already holds the view by other means passes it directly —
  the `view` prop is the only integration point the package defines.

---

## 12. Styling and placement contract

`minimap.css` declares only:

- Structural classes: `.mn-minimap` (container: `position: relative;
  overflow: hidden`), `.mn-minimap-canvas`, `.mn-minimap-viewport`
  (`position: absolute; left: 0; right: 0; pointer-events: auto`), and
  `.mn-minimap-building` (progress affordance hook).
- DOM-overlay theme values as CSS custom properties
  (`--mn-minimap-viewport-color`, `--mn-minimap-viewport-border-color`,
  `--mn-minimap-viewport-focus-color`,
  `--mn-minimap-building-color`), each declared **with a fallback** in the
  rule that consumes it and never in a package-level `:root` block — a
  host's cascade layers (unlayered or `@layer`) always win, so the tokens
  are overridable by the consumer and by the host's existing token layer
  ([`MetanormaProseMirror.spec.md`](./MetanormaProseMirror.spec.md) §9.2)
  without specificity fights.

**Canvas-painted appearance is deliberately absent from this stylesheet.**
Every painted value (color, row height, indent, font) flows only through
`MinimapTheme` (§5.4) — painting consumes only declarative inputs, never
computed styles (§8.1); the custom properties above style only the DOM
overlay (§9.1) and the building affordance — elements the main thread lays
out.

The package ships **no** positioning rules — no `position: fixed`, no flex
membership, no margins. Where the minimap sits (right rail, left rail, overlay
peek) is entirely the consumer's layout. The editor-gui consumer would dock it
as a flex sibling of the editor surface in its own style module, exactly as it
docks the toolbar and sidebar today.

---

## 13. Public API (`index.ts`)

| Export | Kind | Section |
|---|---|---|
| `createMinimap` | function | §7.1 |
| `getMinimapController` | function (`(view) => MinimapController \| null`) | §7.1 |
| `Minimap` | React component | §11 |
| `MinimapOptions`, `MinimapClassifier`, `RowSpec`, `HeightStrategy`, `MinimapTheme`, `LayerDeclaration`, `LayerSpans`, `BlockRow`, `DisplayMode`, `Renderer`, `MinimapView`, `MinimapTr`, `EpochInputs`, `BlockHoverInfo` | types | §5, §6, §8, §7 |
| `defaultClassifier`, `defaultTheme` | constants | §5.2, §5.4 |
| `flatten`, `flattenAll`, `countRows`, `diffRows`, `rowAt` | pure functions (testing/introspection) | §4.1, §6.1, §7.2 |
| `InlineRenderer`, `RecordingRenderer`, `planPaint` | classes/function (test surface) | §8.3 |
| `@metanorma/prosemirror-minimap/core` | subpath export (React-free) | §3.1 |

The `MinimapController` type is exported for typing
`getMinimapController(view)`'s return; its mutating methods are internal-use
and documented as such. There is no `PluginKey` export: the plugin keeps no
state (§7.1), so a key would expose nothing meaningful.

---

## 14. TypeScript constraints

Same constraints as the sibling packages (root `tsconfig.json`): `strict`,
`noImplicitAny`, `exactOptionalPropertyTypes` (optional fields use explicit
`?:` and are never assigned `undefined`), `noUncheckedIndexedAccess` (typed
array reads are non-null asserted only where the invariant is locally proven,
e.g. prefix-sum bounds), `verbatimModuleSyntax` (`import type` for types),
`isolatedModules`, `module: node16` — internal relative imports carry `.js`
extensions.

---

## 15. Acceptance criteria

### 15.1 Correctness (headless, `test.mjs`, `node:test`)

1. **Flatten**: on a synthetic schema (a plain `prosemirror-model` test
   schema, not the Metanorma one), `flatten` yields rows in document order,
   inline nodes excluded, classifier overrides respected.
2. **Identity stability**: editing block A leaves every other row's `key`
   unchanged, including rows at shifted positions; deleting and retyping
   identical content produces new keys (identity is reference-based, not
   content-based).
3. **Incremental parity**: for a randomized edit sequence (insert, replace,
   delete, wrap, unwrap, undo), the incrementally-patched row list is
   deep-equal to a fresh full flatten of the same document.
4. **Prefix-sum invariants**: `offsets` is non-decreasing,
   `offsets[0] === 0`, `rowAt(offsets[i]) === i`, and `rowAt` is consistent
   with binary search over the same array.
5. **Tiers**: row counts above thresholds select the expected tier;
   aggregation merges only same-class/depth runs; hysteresis holds across a
   threshold-crossing edit pair (up at `t`, not down until `0.9t`).
6. **Virtualization** (via `RecordingRenderer`): given a window covering rows
   `[f, l]`, draw calls exist only for `[f − overscan, l + overscan]`.
7. **Layer order**: with layers `text (z=10)`, a consumer layer `(z=15)`,
   `selection (z=20)`, recorded draw order is ascending `z`.
8. **Window text push**: the renderer's `setWindow` receives `texts` only for
   rows inside the visible window plus overscan, and consecutive window
   updates within a frame coalesce to one. Asserted via `RecordingRenderer`.
9. **Scroll mapping**: `proportional` maps window tops/ends to row ranges
   matching the binary-search reference; `precise` snap lands on the resolved
   row (mocked `coordsAtPos`); `precise` with a `null` `nodeDOM` degrades to
   the `proportional` result.
10. **Layer anchoring**: a `pos`-anchored layer survives an edit above its
    span (span re-anchors via `tr.mapping`, same tone, correct row); an
    `id`-anchored span whose node is deleted disappears (never misplaces); a
    marked row splits an aggregating run (§6.5/§8.4).
11. **Merge floor**: marker-lane spans closer than the 6-device-px floor merge
    into one rect per tone; worst-case rect count per lane ≤
    `canvasHeight / 6`.
12. **Epochs**: a content-width change re-estimates all `estHeightPx` (mocked
    epoch inputs) while preserving measured `heightPx` values and every
    `key`; a plain transaction preserves the epoch.
13. **Terminal rungs**: two over-budget build slices engage `marks-only`
    (no `text`-layer paint calls; `setLayer` calls continue), and an
    under-budget slice releases it; row count over a consumer `hideRows`
    releases the model while the plugin stays mounted, and crossing back
    under rebuilds it.
14. **Controller integration**: a doc-changing transaction reaches the
    renderer as a chunk-granular sparse push over the changed rows (full
    push at attach, changed-chunk push after the edit); carried rows keep
    their keys and re-position through `tr.mapping`.
15. **Transaction capture**: the plugin's state slot holds the real
    `Transaction` that produced the state (`apply`-visible), never a
    factory `state.tr` read; selection-only transactions surface with
    `docChanged === false`.
16. **Epochs (mechanism)**: `reevaluateEpoch` re-derives every
    `estHeightPx` from the row's own retained strategy, keeps measured
    `heightPx` values and every `key`; a plain transaction preserves the
    epoch.
17. **Performance (headless-measurable)**: at ~10k blocks, a single-block
    incremental update stays within budget and `rowAtPos` lookups remain
    logarithmic (thousands of lookups well under frame budget).

### 15.2 Performance budgets

Measured on a synthetic ~5 MB document (~80,000 blocks) on commodity hardware:

| Metric | Budget |
|---|---|
| First paint (visible-region-first slicing) | ≤ 32 ms from mount |
| Full model build (wall, sliced at 5 ms/frame) | ≤ 250 ms |
| Epoch re-estimation (width change, 80k blocks, sliced) | ≤ 400 ms wall, ≤ 5 ms/frame |
| Per-keystroke incremental update (single-block edit) | ≤ 1 ms main thread |
| Scroll repaint (inline, incl. paint) | ≤ 1 ms per frame |
| Main-thread work per scroll frame outside paint | ≤ 0.2 ms (window computation + overlay transform) |
| Click/drag mapping | O(log n); zero layout reads during drag |
| `total` vs `scrollHeight` drift after calibration settles | ≤ `maxScrollDrift` (default 5%) |
| Block-model memory | ≤ 40 MB |

Budgets are asserted in `test.mjs` where measurable headlessly (build,
patch, mapping, memory — §15.1.17) and verified in the browser via renderer
cost telemetry (recorded per repaint by `InlineRenderer`); the browser
verification is a manual check-list item for the consumer's e2e suite, not
a package test.

---

## 16. Out of scope (v1)

- **Hover-to-magnify DOM detail view** — the event surface (§10.2) is
  contractual; the view itself is a future consumer-side component.
- **Diagnostics, annotations, and search layers** — the layer contract
  (anchors, lanes, merge floor; §8.4) and the controller's mapping surface
  (§7.2) are the package's half; the data sources belong to the consumers
  that own those features.
- **Per-visual-line resolution** — block-level rows are the contract; tier-1
  text rendering is a legibility affordance, not a layout promise. Intra-row
  glyph *placement* is aligned to integer device px (§6.5), but one block row
  still paints as a single text run — no word wrapping, no intra-row shaping.
- **Folding / collapsing** of document regions in the minimap.
- **Inline editing or drag-to-reorder** on the minimap surface (structural
  drag remains a future layer/interaction on top of `onBlockHover`).
- **RTL and horizontal overscroll indication** — vertical-only mapping.
- **Serving as the editor's virtualization oracle.** The editor-space height
  model (§4.4) is *shaped* so it could later predict scroll geometry for an
  editor that culls unrendered blocks (the model answers for blocks whose
  DOM is gone, §4.5/§6.4) — but correctness as an oracle (scrollbar
  fidelity, divergence bail-outs) is a different burden than proportional
  accuracy in a visualization, and no such consumer exists. Entry
  condition, mirroring §8.2's reversal clause: when editor-side
  virtualization enters scope, this model becomes its height oracle, and
  the predicted-vs-actual budget above becomes a correctness gate rather
  than a drift metric.
