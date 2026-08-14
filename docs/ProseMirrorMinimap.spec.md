# ProseMirror Minimap — Block-Level Canvas Overview Specification

This spec defines `@metanorma/prosemirror-minimap` (`pkg/prosemirror-minimap/`), a
schema-agnostic, block-level, canvas-rendered document minimap for ProseMirror
editors. The minimap presents a scaled structural overview of the document
alongside the editor (as popularized by Sublime Text), supports
click/drag-to-scroll navigation, and scales to multi-megabyte documents.

**Scope.** The package owns the *pipeline*: document-model-derived block
geometry, stable block identity, incremental transaction diffing, prefix-sum
scroll mapping, adaptive rendering tiers, a layered `OffscreenCanvas` worker
renderer, and a draggable viewport overlay. The consumer owns the *policy*: the
ProseMirror schema, the node classification, the visual theme, and the DOM
placement. The package has no dependency on
[`schema.spec.md`](./schema.spec.md) — it walks any `prosemirror-model`
document — and ships a default classifier that keys off node type groups, which
is the seam a group-structured schema (e.g. the Metanorma cohorts,
[schema.spec.md](./schema.spec.md) §4) plugs into.

---

## 1. Purpose and scope

### 1.1 What this package is

A minimap component that renders one row per document *block* (paragraph,
heading, figure, table, …) rather than per visual line. Block-level resolution
is chosen over line-level because:

- ProseMirror's document model is a block tree, not a line array; there is no
  document-model notion of a wrapped line, so line geometry would have to come
  from DOM measurement, coupling the minimap to view layout.
- Block count is stable under editor-width changes (line count is not), so the
  minimap's geometry survives resizes without recomputation.
- For large documents, block count is one to two orders of magnitude below
  visual-line count, bounding the model's size and paint work.

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
virtual minimap surface is drawn), transferable to a worker via
`OffscreenCanvas` (all painting off the main thread), and programmable — it can
draw structural information (nesting indent, per-class color) that a scaled DOM
clone cannot express. A DOM-clone minimap (`transform: scale()` over a cloned
subtree) is pixel-faithful but pays O(document DOM) per clone and per sync,
which is disqualifying at the multi-megabyte scale this package targets. The
clone technique remains attractive for a *hover-to-magnify detail view* of a
single block — bounded to one node's DOM, hence O(1) — and §10.2 reserves the
event surface such a view needs.

**Why document-model geometry.** Height and position estimates are computed
from the node tree (`node.type`, depth, text length, attrs), not from rendered
DOM. This makes the minimap correct before first layout, independent of node
views, and incrementally updatable from transaction change ranges. The DOM is
consulted only *advisorily* — opportunistic height calibration (§4.5) and
precise scroll snapping (§6.4) — never as a synchronous dependency of the paint
path.

### 1.4 Relationship to the host editor

The package integrates at exactly one point: an `EditorView`. `createMinimap()`
returns a ProseMirror plugin that observes transactions and the scroll
container; the rendering component (`Minimap`, §11) mounts into any DOM
container the consumer provides and reads the controller through the plugin.
The host editor component ([`MetanormaProseMirror.spec.md`](./MetanormaProseMirror.spec.md) §5)
treats the minimap like any other child rendered alongside `ProseMirrorDoc`.

---

## 2. Module layout

Flat layout at the package root (consistent with the other `pkg/` packages);
TypeScript source at `pkg/prosemirror-minimap/`:

| File | Responsibility |
|---|---|
| `index.ts` | Public API re-exports (§13). |
| `types.ts` | All public types: `MinimapOptions`, `MinimapClassifier`, `MinimapTheme`, `LayerDeclaration`, message payloads. |
| `plugin.ts` | `createMinimap(options)` — the ProseMirror plugin (§7.1). |
| `controller.ts` | `MinimapController` — the view plugin owning the block model, geometry, tiers, and scheduling (§7). |
| `blockModel.ts` | Flattening walk, block list, paired incremental diff (§4.1, §7.2). |
| `identity.ts` | Stable block identity via `WeakMap<Node, number>` (§4.3). |
| `heights.ts` | Height strategies and the calibration store (§4.4, §4.5). |
| `geometry.ts` | Prefix-sum offsets, window mapping, row lookup (§6.1–§6.4). |
| `tiers.ts` | Tier selection, hysteresis, aggregation (§6.5). |
| `renderer.ts` | The `Renderer` interface, `InlineRenderer`, `RecordingRenderer` (test double) (§8.1, §8.3). |
| `workerRenderer.ts` | `WorkerRenderer` — main-thread half of the worker protocol (§8.2). |
| `workerCore.ts` | Worker-side render loop and layer registry (§8.2, §8.4). |
| `worker.ts` | Worker entry point: `new Worker(new URL(...))` target (§8.2). |
| `layers.ts` | Built-in layers: `text`, `selection`; span types (§8.4). |
| `overlay.ts` | Viewport indicator overlay element and drag handling (§9). |
| `scroll.ts` | Scroll-mapping strategies: `proportional`, `precise` (§6.4, §10.1). |
| `react.tsx` | The `Minimap` React component (§11). |
| `minimap.css` | Structural styles and default theme tokens (§12). |
| `test.mjs` | Headless `node:test` suite (§15). |

---

## 3. Dependencies

| Dependency | Kind | Purpose |
|---|---|---|
| `prosemirror-model` | peer | `Node`, `Schema` types; `doc.descendants`. |
| `prosemirror-state` | peer | `Plugin`, `PluginKey`, `Transaction`. |
| `prosemirror-view` | peer | `EditorView` (controller reads `view.scrollDOM`, `view.coordsAtPos`). |
| `react` | peer (optional) | Only `react.tsx` imports it; core packages stay framework-free. Consumers not using React import nothing from `react.tsx` via the package's export map. |
| `typescript`, `@types/react`, the three prosemirror packages | dev | Compilation and the headless test suite. |

No dependency on `@metanorma/prosemirror-schema`, `@metanorma/prosemirror-editor`,
or `@handlewithcare/react-prosemirror`. Zero runtime dependencies.

`package.json` follows the sibling pattern (`type: "module"`, `main:
"index.ts"`, `scripts.compile = "tsc --outdir compiled"`, `scripts.test =
"node --test test.mjs"`), with an export map exposing `"."` (core + React) and
`"./worker"` (the worker entry, for bundlers that need an explicit second
entry point).

---

## 4. The block model

### 4.1 Block selection (the flattening walk)

The document is flattened into an ordered row list by a walk:

```ts
flatten(doc, classifier): BlockRow[]
```

For each node visited (pre-order, via `node.descendants` semantics):

1. Inline nodes (`node.isInline`) are skipped — rows are block-level.
2. The classifier's `row(node, depth)` decides whether the node contributes a
   row (§5.1). A node that contributes a row may still be recursed into when
   `classifier.recurse(node)` returns `true` (default: recurse into any node
   that is neither a textblock nor a leaf/atom — container sections behave this
   way: they are transparent as rows, their children are rows).
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
| `pos` | `number` | Document position of the node (updated as positions shift; identity does not). |
| `node` | `Node` | Reference to the document node (kept only on the main thread; never serialized to the worker). |
| `classId` | `string` | Visual class assigned by the classifier (§5.1). |
| `depth` | `number` | Block-tree depth (drives indentation when the class opts in). |
| `textLength` | `number` | `node.content.size` for textblocks; `0` otherwise. |
| `heightRows` | `number` | Estimated height in rows (§4.4). |
| `text` | `string \| null` | Cached plain text (`node.textContent`), populated lazily per worker request (§8.5). |

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

Height estimation is per visual class, not a single formula. The classifier
assigns one of:

| Strategy | Rows computed as | Appropriate for |
|---|---|---|
| `text` | `max(1, ceil(textLength / charsPerLine))` | Textblocks. `charsPerLine` is a theme parameter, calibrated from the editor's content width and font (§5.4). |
| `fixed` | constant supplied per class | Blocks with a stable aspect (footnote markers are sub-row; dividers are one row). |
| `estimate` | `f(node)` supplied per class | Blocks whose attrs predict size — e.g. a table's row count attr, a sourcecode block's line count. |
| `calibrated` | per-class running median of DOM samples, seeded with a per-class default | Atom/complex blocks whose rendered height is unrelated to text length (figures, formulae, requirement blocks). |

Every strategy produces a whole number of rows ≥ 1 (a `calibrated` class whose
samples are absent uses its default). Estimated heights never gate correctness
of navigation: §6.4 defines how a click lands precisely despite estimate error.

### 4.5 DOM calibration (advisory sampling)

For `calibrated` classes, real rendered heights are sampled opportunistically:

- Sampling happens only inside the already-scheduled repaint frame, after the
  worker render request has been issued, for at most `sampleBudget` blocks per
  frame (default 4).
- A sample is taken via `view.nodeDOM(row.pos)` → `getBoundingClientRect()`
  once per `row.key`; the per-class **running median** updates the class's
  default for subsequent height computations. Sampling never triggers new
  layout work in the scroll path (§10.1) and never blocks a paint: height
  changes from calibration are applied on the next transaction or refresh
  tick.
- The document model remains authoritative for structure; the DOM is sampled,
  never synchronously depended upon.

---

## 5. The classifier contract

### 5.1 `MinimapClassifier`

```ts
interface MinimapClassifier {
  /** Visual class for a node as a row; null → not a row (descend per recurse()). */
  row(node: Node, depth: number): RowSpec | null;
  /** Whether to visit children of a node that is itself a row. Default: !isTextblock && !isLeaf. */
  recurse?(node: Node): boolean;
}

interface RowSpec {
  classId: string;          // key into theme.classes and height strategies
  height?: HeightStrategy;  // overrides the class-level strategy for this node
}
```

The classifier receives the live `Node`, so `row()` may branch on attrs
(instance-specific heights), marks (via `node.marks`), or depth.

### 5.2 Default classifier (group-keyed)

The default classifier derives visual classes from **node type groups** — the
schema's own cohort mechanism — rather than from type names:

| Node shape | Row? | `classId` |
|---|---|---|
| Textblock (`node.isTextblock`) | yes | `"text"` (overridden to `"heading"` when the type belongs to a section-title group, if the consumer's groups express it) |
| Atom or leaf block | yes | the node type's **first matching group name**, else `"atom"` |
| Other block node | no (recurse) | — |
| Inline node | skipped | — |

Group-keyed classification is the growth seam: a schema that adds node types
within existing groups inherits minimap treatment automatically; only a new
*group* warrants a classifier or theme update. A consumer with cohort groups
(e.g. `section_front` / `section_body` / `section_back` as defined in
[schema.spec.md](./schema.spec.md) §4) gets cohort-colored rows with zero
per-type code.

### 5.3 Consumer example (structured-document schema)

For the Metanorma host, the classifier the GUI supplies maps classes to the
schema's groups and cohorts — section containers remain transparent (their
`section_title` children are the rows), and complex blocks get explicit
strategies:

```ts
const metanormaClassifier: MinimapClassifier = {
  row(node, depth) {
    if (node.type.name === "section_title") return { classId: "heading" };
    if (node.type.groups.includes("block")) {
      if (node.type.name === "sourcecode") return { classId: "code",
        height: { kind: "estimate", rows: (n) => Math.max(2, n.attrs.text.split("\n").length) } };
      if (node.type.name === "figure") return { classId: "figure", height: { kind: "calibrated", defaultRows: 4 } };
      if (node.type.name === "table") return { classId: "table",
        height: { kind: "estimate", rows: (n) => n.childCount + 1 } };
      return { classId: "text" };
    }
    if (node.isAtom) return { classId: node.type.groups[0] ?? "atom" };
    return null; // containers descend
  },
};
```

This example is illustrative; nothing in the package references these names.

### 5.4 Theme (appearance)

```ts
interface MinimapTheme {
  rowHeight: number;          // px per row (default 3)
  charsPerLine: number;       // text-strategy calibration (default 80)
  indentUnit: number;         // px per depth step (default 2)
  font?: string;              // tier-1 glyph font (default: theme mono token)
  classes: Record<string, { color: string; indent?: boolean }>;
  selection: { color: string; alpha: number };
  background: string;
}
```

A neutral default theme ships in `minimap.css` and `types.ts`; the consumer
overrides any subset via `MinimapOptions.theme`. Colors resolve through CSS
custom properties where the host provides them (e.g. `--mn-*` tokens), keeping
dark/light theming in the consumer's token layer.

---

## 6. Geometry and virtualization

### 6.1 Prefix-sum offsets

Row geometry is a prefix-sum over `heightRows`:

- `offsets: Float32Array` of length `rows + 1`; `offsets[i]` is the top of row
  `i` in minimap pixels; `total = offsets[rows]`.
- Maintained incrementally: a diff that changes `k` rows re-sums only from the
  first changed index (offsets after it shift by the cumulative delta — a
  single subtraction pass, O(n) worst case but a tight loop over a
  `Float32Array`, and typically a no-op beyond a shallow index).
- `rowAt(offset)` is a binary search over `offsets` — O(log n) (~17 steps at
  100k rows).

### 6.2 Display modes

| Mode | Mapping | Use |
|---|---|---|
| `fit` | The whole document scales into the minimap's height: `scale = containerHeight / total`. | Small documents; classic "entire doc visible" behavior. |
| `sliding` (default) | Fixed row height; the minimap is a virtual surface of height `total`, and the container shows a **window** into it that slides as the editor scrolls. | Large documents; preserves row legibility. |

Mode is a `MinimapOptions.display` value; `auto` (default) selects `fit` when
`total ≤ containerHeight` and `sliding` otherwise.

### 6.3 Window mapping (scroll → row range)

In `sliding` mode, with cached editor geometry (`scrollTop`, `scrollHeight`,
`clientHeight` of `view.scrollDOM` — see §7.4 for when these are read):

```ts
scrollPct  = scrollTop / max(1, scrollHeight - clientHeight)   // NaN-safe → 0
windowTop  = scrollPct * max(0, total - windowHeight)
[first, last] = rows intersecting [windowTop, windowTop + windowHeight]   // binary search
```

Only rows `[first, last]` (plus a margin of ` overscanRows`, default 8) are
sent text for and painted. This is the viewport virtualization borrowed from
`@replit/codemirror-minimap`: paint cost is O(window), independent of document
size. In `fit` mode `windowTop = 0` and the range is all rows.

### 6.4 Click/drag mapping (row → scroll)

Minimap offsets are estimates; the editor's real layout is not. Two mapping
strategies resolve a target row to an editor scroll position:

| Strategy | Computation | Used for |
|---|---|---|
| `proportional` | `targetScrollTop = (rowCenterOffset / total) * (scrollHeight - clientHeight)` — pure arithmetic, no layout read. | Continuous drag; every pointermove. |
| `precise` | Resolve the row's `pos` through `view.coordsAtPos(pos)` (or `view.nodeDOM`) and scroll the scrollDOM so that DOM rect lands at the equivalent container-relative offset. | Click commit and drag release — one layout-accurate snap per gesture. |

The hybrid keeps the drag path free of forced layout while ending every gesture
on the exact block. Precise snaps are user-initiated and budgeted one per
gesture, so their layout cost is acceptable.

### 6.5 Adaptive tiers

The renderer's per-row fidelity degrades with row count so that the model's
row count — and the paint work — stays bounded at any document size:

| Tier | Condition (row count) | Row rendering |
|---|---|---|
| 1 — `text` | ≤ `tier1Rows` (default 5,000) | Real glyphs via `fillText` at the theme font, per-class color. |
| 2 — `blocks` | ≤ `tier2Rows` (default 50,000) | Filled rectangles: width by text length (clamped), color by class, indent by depth. |
| 3 — `aggregate` | > `tier2Rows` | Tier-2 rendering over **aggregated** rows: runs of ≥ `aggregateMin` (default 4) consecutive rows with the same `classId` and depth merge into one row whose `heightRows` is the sum (capped at `aggregateMax`, default 16). |

Aggregation collapses paragraph runs — the bulk of any prose document — so the
effective row count stays below the tier-2 bound; structure-bearing rows
(headings, figures, section titles) survive because their classes differ or
their runs are short. Tier selection is **hysteresis-guarded**: promotion
happens at the threshold, demotion only at `0.9 ×` threshold, preventing tier
flapping while editing near a boundary. A tier change re-publishes the full
block payload (§8.5) but is rare (structural growth, not keystrokes).

---

## 7. The ProseMirror plugin

### 7.1 `createMinimap()`

```ts
createMinimap(options?: MinimapOptions): Plugin
```

Returns a plugin with two halves:

- A **plugin key** (`minimapKey`) exposing `getState(view)` → controller
  handle for the rendering component.
- A **view plugin** (`MinimapController`) constructed with the `EditorView`,
  owning the mutable block model, geometry, tier state, calibration store, and
  the scheduler. The controller is not stored in editor state: derived caches
  of this size belong to the view, keyed by document reference
  (`model.doc === view.state.doc` is the fast-path skip).

`MinimapOptions` (all optional): `classifier`, `theme`, `display`, `layers`
(§8.4), `worker` (§8.2), `overscanRows`, `sampleBudget`, `sliceBudgetMs`,
tier thresholds, `onBlockHover` (§10.2).

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
   indices outward; the renderer receives a sparse `blocks` update (§8.5).

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

### 7.4 Geometry cache refresh points

Editor scroll geometry (`scrollHeight`, `clientHeight`) is **cached**, never
read per scroll event. Refresh points: `ResizeObserver` on the scroll DOM and
content DOM; the post-paint tick after any `docChanged` transaction;
`visibilitychange`. The scroll handler itself reads only `scrollTop` (§10.1).

---

## 8. Rendering architecture

### 8.1 The `Renderer` interface

All painting goes through one interface, so the worker, the inline fallback,
and the test double are interchangeable:

```ts
interface Renderer {
  init(size: { width: number; height: number; dpr: number }): void;
  resize(size: { width: number; height: number; dpr: number }): void;
  setConfig(theme: MinimapTheme, layers: LayerDeclaration[]): void;
  setBlocks(chunk: BlocksPayload): void;      // structural arrays, chunked
  setViewport(windowTop: number, windowHeight: number): void;
  setText(entries: Array<[row: number, text: string]>): void;
  setLayer(layerId: string, spans: LayerSpans): void;
  requestText(from: number, to: number): void;  // worker → host callback path
  render(): void;
  destroy(): void;
}
```

### 8.2 Worker renderer (`OffscreenCanvas`)

The default renderer transfers the canvas off the main thread:

- The component creates the `<canvas>`, then
  `canvas.transferControlToOffscreen()`, and constructs the worker via the
  `worker` option — a factory `() => Worker`. The default factory uses
  `new Worker(new URL("./worker.js", import.meta.url), { type: "module" })`.
  Consumers whose bundlers need an explicit second entry point import
  `@metanorma/prosemirror-minimap/worker` and pass their own factory.
- `workerCore.ts` (worker side) owns the `OffscreenCanvas`, the block payload
  arrays, the text cache, and the layer registry. It paints on message, inside
  its own `requestAnimationFrame` coalescing — never spinning.
- The main thread never calls a canvas API after transfer. Scroll-driven
  repaints cost the main thread one small `postMessage` per rAF.
- High-DPI: the worker sizes the backing store at `CSS size × dpr` and scales
  the context once (`ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`); `dpr` comes
  from `devicePixelRatio` on `init`/`resize` messages.

**Degradation.** If `OffscreenCanvas` or `Worker` is unavailable (or the
consumer passes `worker: null`), the controller falls back to
`InlineRenderer` — same interface, same layer registry, painting on the main
thread inside the rAF batch. Correctness and layer behavior are identical;
only thread ownership differs.

### 8.3 Inline fallback and test double

`InlineRenderer` (main thread) and `RecordingRenderer` (records draw calls,
paints nothing — used by the headless suite to assert virtualization, layer
order, and protocol behavior without a canvas implementation) both live in
`renderer.ts`.

### 8.4 Layer registry and draw order

Painting is layered on the single canvas — later layers draw over earlier
ones. Layers are declared, ordered, and extensible:

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

A layer's data flows as `setLayer(id, spans)` where `LayerSpans` is an array of
`{ row: number; from?: number; to?: number; tone?: string }` — row-indexed, so
layer cost is O(spans), and spans are recomputed by the consumer's own state,
not by the minimap. Selection spans are computed by the controller from
`state.selection` mapped through the current row list.

### 8.5 Message protocol

Structural block data is transferred as typed arrays (not JSON) with one entry
per row, chunked at `chunkRows` rows (default 2,000) per message:

| Message | Direction | Payload | Notes |
|---|---|---|---|
| `init` | host → worker | offscreen canvas (transferred), size, dpr, theme, layers | Replies `ready`. |
| `resize` | host → worker | size, dpr | |
| `config` | host → worker | theme, layers | Theme switch without rebuild. |
| `blocks` | host → worker | chunk: `Int32Array` row keys, `Int32Array` positions, `Uint16Array` depths, `Uint8Array` class indices, `Float32Array` heights, class-name table | Transferable buffers; a full publish is many chunks, a sparse update is one. |
| `tier` | host → worker | tier id, aggregation map (row → aggregate) | |
| `viewport` | host → worker | `windowTop`, `windowHeight` | Per rAF at most. |
| `text` | host → worker | `[row, text][]` for the visible range | Pushed on viewport change and on `textRequest`. |
| `textRequest` | worker → host | `from`, `to` row indices | Coalesced; host replies `text`. |
| `layer` | host → worker | layer id + spans | |
| `render` | host → worker | — | Coalesced with `viewport`. |
| `rendered` | worker → host | painted row range, cost ms | Telemetry hook for §15 budgets. |
| `error` | worker → host | message | Controller falls back to `InlineRenderer` on first worker error. |

The worker paints only rows it holds text for in tier 1; tier 2/3 need no text
at all, so very large documents in the aggregated tier never transfer text.

### 8.6 Resizing

A `ResizeObserver` on the minimap container drives `resize` messages. The
overlay (§9) is repositioned from cached geometry in the same tick.

---

## 9. The viewport overlay

### 9.1 Structure and updates

The viewport indicator — the rectangle showing which part of the document the
editor currently shows — is a **separate DOM element**, not canvas paint
(borrowed from `@replit/codemirror-minimap`):

```html
<div class="mn-minimap">
  <canvas class="mn-minimap-canvas"></canvas>
  <div class="mn-minimap-viewport" aria-hidden="true"></div>
</div>
```

It is updated exclusively through `transform: translateY(px)` and `height`
(written only when the editor viewport size changes) — compositor-friendly,
no layout, no repaint of the canvas beneath. Its vertical extent is the
editor's `[scrollTop, scrollTop + clientHeight]` mapped into minimap
coordinates (§6.3), clamped to the window.

### 9.2 Drag interaction

The overlay handles `pointerdown` → `setPointerCapture` → `pointermove` →
`pointerup`:

- Each move: `proportional` mapping (§6.4) sets the editor `scrollTop`
  directly — cheap, continuous, no layout reads.
- Release: one `precise` snap resolves the landing row exactly.
- Clicks (down-up without significant movement) run the same precise path,
  centered on the clicked row.
- The overlay consumes its own events (`stopPropagation` on pointer and wheel
  where the consumer's layout would otherwise forward them to the editor
  surface).

---

## 10. Scroll and interaction discipline

### 10.1 Scroll event rules

The controller subscribes to `view.scrollDOM` `'scroll'` (passive). Per event
it reads **only `scrollTop`**, then schedules a single rAF that: computes the
window (§6.3, from cached geometry), updates the overlay transform (§9.1), and
sends one coalesced `viewport`/`render` message (§8.5). No
`getBoundingClientRect`, no `offsetHeight`, no style writes that would dirty
layout occur in this path. Multiple scroll events within a frame collapse to
one repaint.

### 10.2 Hover pathway (future magnify hook)

To keep a future hover-to-magnify DOM detail view possible without later API
breakage, the package contracts the following surface now:

- The container fires `minimapblockhover` DOM events (composed, bubbling)
  carrying `{ row, key, pos, classId, depth, clientY }` for the row under the
  pointer. `rowAt()` (§6.1) makes this O(log n).
- `MinimapOptions.onBlockHover?: (info) => void` receives the same payload.
- The row's `node` reference is reachable from the controller
  (`minimapKey.getState(view).rowNode(row)`), giving a magnify view everything
  it needs to clone one block's DOM subtree — bounded to a single node, hence
  O(1) regardless of document size.

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
/>
```

- Renders the container + canvas + overlay, wires the `ResizeObserver`, and
  resolves the controller from `view` via `minimapKey` (the plugin must be in
  the view's state; a missing plugin is a development-mode warning, not a
  crash).
- Placement is fully external: the component has no opinion about flex order,
  side, or size beyond filling its container.
- Consumers hosting inside a React ProseMirror provider obtain `view` from
  that provider's context hook and render `<Minimap>` as a sibling of the
  editor surface (the host editor's `children` slot,
  [`MetanormaProseMirror.spec.md`](./MetanormaProseMirror.spec.md) §5, is the
  natural mount point).

---

## 12. Styling and placement contract

`minimap.css` declares only:

- Structural classes: `.mn-minimap` (container: `position: relative;
  overflow: hidden`), `.mn-minimap-canvas`, `.mn-minimap-viewport`
  (`position: absolute; left: 0; right: 0; pointer-events: auto`), and
  `.mn-minimap-building` (progress affordance hook).
- Default theme values as CSS custom properties (`--mn-minimap-row-height`,
  `--mn-minimap-indent`, per-class colors as `--mn-minimap-class-<id>`), all
  overridable by the consumer and by the host's existing token layer
  ([`MetanormaProseMirror.spec.md`](./MetanormaProseMirror.spec.md) §9.2).

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
| `minimapKey` | `PluginKey` | §7.1 |
| `Minimap` | React component | §11 |
| `MinimapOptions`, `MinimapClassifier`, `RowSpec`, `HeightStrategy`, `MinimapTheme`, `LayerDeclaration`, `LayerSpans`, `BlockRow`, `DisplayMode`, `Renderer` | types | §5, §6, §8 |
| `defaultClassifier`, `defaultTheme` | constants | §5.2, §5.4 |
| `flatten`, `rowAt` | pure functions (testing/introspection) | §4.1, §6.1 |
| `InlineRenderer`, `RecordingRenderer` | classes | §8.3 |
| `@metanorma/prosemirror-minimap/worker` | subpath export | §8.2 |

The controller type is exported for typing `minimapKey.getState(view)`; its
mutating methods are internal-use and documented as such.

---

## 14. TypeScript constraints

Same constraints as the sibling packages (root `tsconfig.json`): `strict`,
`noImplicitAny`, `exactOptionalPropertyTypes` (optional fields use explicit
`?:` and are never assigned `undefined`), `noUncheckedIndexedAccess` (typed
array reads are non-null asserted only where the invariant is locally proven,
e.g. prefix-sum bounds), `verbatimModuleSyntax` (`import type` for types),
`isolatedModules`, `module: node16` — internal relative imports carry `.js`
extensions. Worker code compiles under the same config; it must not import
`prosemirror-*` (the worker receives only serializable data — §8.5), which
the compiler enforces by module graph separation: `workerCore.ts` imports
from `types.ts` and `layers.ts` only.

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
8. **Protocol**: a scripted host/`InlineRenderer` round trip exercises
   `blocks` chunking, `textRequest`/`text` coalescing, and sparse updates.
9. **Scroll mapping**: `proportional` maps window tops/ends to row ranges
   matching the binary-search reference; `precise` snap lands on the resolved
   row (mocked `coordsAtPos`).

### 15.2 Performance budgets

Measured on a synthetic ~5 MB document (~80,000 blocks) on commodity hardware:

| Metric | Budget |
|---|---|
| First paint (visible-region-first slicing) | ≤ 32 ms from mount |
| Full model build (wall, sliced at 5 ms/frame) | ≤ 250 ms |
| Per-keystroke incremental update (single-block edit) | ≤ 1 ms main thread |
| Scroll repaint (worker) | ≤ 4 ms per frame |
| Main-thread work per scroll frame | ≤ 0.2 ms (one coalesced postMessage + overlay transform) |
| Click/drag mapping | O(log n); zero layout reads during drag |
| Block-model memory | ≤ 40 MB |
| Worker message size (steady-state scroll) | ≤ 64 bytes + visible-range text |

Budgets are asserted in `test.mjs` where measurable headlessly (build, patch,
mapping, memory) and verified in the browser via the `rendered` telemetry
message; the browser verification is a manual check-list item for the
consumer's e2e suite, not a package test.

---

## 16. Out of scope (v1)

- **Hover-to-magnify DOM detail view** — the event surface (§10.2) is
  contractual; the view itself is a future consumer-side component.
- **Diagnostics, annotations, and search layers** — the layer registry
  supports them (§8.4); their data sources belong to the consumers that own
  those features.
- **Per-visual-line resolution** and intra-row glyph alignment — block-level
  rows are the contract; tier-1 text rendering is a legibility affordance,
  not a layout promise.
- **Folding / collapsing** of document regions in the minimap.
- **Inline editing or drag-to-reorder** on the minimap surface (structural
  drag remains a future layer/interaction on top of `onBlockHover`).
- **RTL and horizontal overscroll indication** — vertical-only mapping.
