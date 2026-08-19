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
document — and ships a default classifier keyed off node type groups, with an
ancestor stack in the classifier contract — the seam a group-structured schema
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
virtual minimap surface is drawn) and programmable — it can
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
| `blockModel.ts` | Flattening walk, block list, paired incremental diff (§4.1, §7.2). |
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
| `typescript`, `@types/react`, the three prosemirror packages | dev | Compilation and the headless test suite. |

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
| `pos` | `number` | Document position of the node (updated as positions shift; identity does not). |
| `node` | `Node` | Reference to the document node (main thread only; not part of the renderer-facing payload — see §8.1). |
| `classId` | `string` | Visual class assigned by the classifier (§5.1). |
| `depth` | `number` | Block-tree depth (drives indentation when the class opts in). |
| `textLength` | `number` | `node.content.size` for textblocks; `0` otherwise. |
| `heightRows` | `number` | Estimated height in rows (§4.4). |
| `text` | `string \| null` | Cached plain text (`node.textContent`), populated lazily for visible rows (§6.3, §8.1). |

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
  render request has been issued, for at most `sampleBudget` blocks per
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

### 5.2 Default classifier (group-keyed)

The default classifier derives visual classes from **node type groups** — the
schema's own cohort mechanism — rather than from type names. Group membership
is queried only through the public `NodeType.isInGroup(name)` API, evaluated
against `groupOrder` — an ordered list of group names in `MinimapOptions`
(default `[]`), first match wins:

| Node shape | Row? | `classId` |
|---|---|---|
| Textblock (`node.isTextblock`) | yes | first `groupOrder` match, else `"text"` |
| Atom or leaf block | yes | first `groupOrder` match, else the type's name |
| Other block node | no (recurse) | — |
| Inline node | skipped | — |

A `classId` with no `theme.classes` entry renders with the `"text"` entry's
color. Group-keyed classification is the growth seam: a schema that adds node
types within existing groups inherits minimap treatment automatically; only a
new *group* warrants a `groupOrder` or theme update.

**What `groupOrder` does not do.** It keys rows by *their own* groups, so it
only pays off when the row nodes themselves carry the group — an atom block in
a cohort, or a textblock whose group differs from `"text"`. It cannot color a
row by an *ancestor's* group: groupless row nodes (e.g. `section_title`,
[schema.spec.md](./schema.spec.md) §4) never match any `groupOrder` entry.
Ancestor-derived classification is what the classifier's `ancestors` argument
is for (§5.1, §5.3); `groupOrder` alone cannot express it.

### 5.3 Consumer example (structured-document schema)

For the Metanorma host, the classifier the GUI supplies maps classes to the
schema's groups and cohorts — section containers remain transparent (their
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
        height: { kind: "estimate", rows: (n) => Math.max(2, n.textContent.split("\n").length) } };
      if (node.type.name === "figure") return { classId: "figure", height: { kind: "calibrated", defaultRows: 4 } };
      if (node.type.name === "table") return { classId: "table",
        // childCount counts head/body/foot sections — descend to rows for size
        height: { kind: "estimate", rows: (n) => countDescendants(n, "table_row") + 1 } };
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
  rowHeight: number;          // px per row (default 3)
  charsPerLine: number;       // text-strategy calibration (default 80)
  indentUnit: number;         // px per depth step (default 2)
  font?: string;              // tier-1 glyph font (default: theme mono token)
  classes: Record<string, { color: string; indent?: boolean }>;
  selection: { color: string; alpha: number };
  background: string;
}
```

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
`theme`; a React host re-reads on theme-change events the same way. The one
exception is the viewport indicator overlay (§9.1) — a DOM element, styled by
CSS like any other (§12).

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
`clientHeight` of the scroll container resolved in §7.1 — see §7.4 for when
these are read):

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
| `precise` | Resolve the row's `pos` through `view.coordsAtPos(pos)` (or `view.nodeDOM`) and scroll the scroll container (§7.1) so that DOM rect lands at the equivalent container-relative offset. | Click commit and drag release — one layout-accurate snap per gesture. |

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
block payload (§8.1) but is rare (structural growth, not keystrokes).

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

`MinimapOptions` (all optional): `classifier`, `groupOrder` (§5.2), `theme`,
`display`, `layers` (§8.4), `scrollContainer` (§7.1),
`overscanRows`, `sampleBudget`, `sliceBudgetMs`, tier thresholds,
`onBlockHover` (§10.2).

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
   indices outward; the renderer receives a sparse `blocks` update (§8.1).

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
read per scroll event. Refresh points: `ResizeObserver` on the scroll container
(§7.1) and the content DOM; the post-paint tick after any `docChanged`
transaction; `visibilitychange`. The scroll handler itself reads only
`scrollTop` (§10.1).

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
  setViewport(windowTop: number, windowHeight: number): void;
  setText(entries: Array<[row: number, text: string]>): void;
  setLayer(layerId: string, spans: LayerSpans): void;
  requestText(from: number, to: number): void;
  render(): void;
  destroy(): void;
}
```

The interface methods speak only serializable data — typed arrays, strings,
plain numbers — never a live ProseMirror `Node` or DOM reference. `InlineRenderer`
reads the plain text lazily out of the row model (§4.2's cached `text`) when
`requestText` fires, so no data source is lost by the absence of a message
boundary. This discipline is what makes the rendering seam a seam: the payload
shapes (`setBlocks` chunked at `chunkRows` rows, default 2,000; `setText`
pushed for visible rows) are deliberately transfer-ready — a future
worker-backed renderer slots behind this interface as a new module with no
caller-visible change (§8.2).

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
  resolution and intra-row glyph alignment, treating tier 1 as a legibility
  affordance, not a layout promise.

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

### 8.5 Resizing

A `ResizeObserver` on the minimap container drives `resize` calls. The
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

The controller subscribes to the resolved scroll container's `'scroll'` event
(passive; container resolution is §7.1's contract). Per event it reads
**only `scrollTop`**, then schedules a single rAF that: computes the window
(§6.3, from cached geometry), updates the overlay transform (§9.1), and
issues one coalesced `setViewport`/`render` call on the renderer (§8.1). No
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
/>
```

- Renders the container + canvas + overlay, wires the `ResizeObserver`, and
  resolves the controller from `view` via `getMinimapController(view)` (§7.1;
  the plugin must be installed in the view — a `null` return is a
  development-mode warning, not a crash).
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
  (`--mn-minimap-viewport-color`, `--mn-minimap-viewport-alpha`,
  `--mn-minimap-building-color`), overridable by the consumer and by the
  host's existing token layer
  ([`MetanormaProseMirror.spec.md`](./MetanormaProseMirror.spec.md) §9.2).

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
| `MinimapOptions`, `MinimapClassifier`, `RowSpec`, `HeightStrategy`, `MinimapTheme`, `LayerDeclaration`, `LayerSpans`, `BlockRow`, `DisplayMode`, `Renderer` | types | §5, §6, §8 |
| `defaultClassifier`, `defaultTheme` | constants | §5.2, §5.4 |
| `flatten`, `rowAt` | pure functions (testing/introspection) | §4.1, §6.1 |
| `InlineRenderer`, `RecordingRenderer` | classes | §8.3 |
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
8. **Virtualized text push**: the renderer receives `setText` entries only
   for rows inside the visible window plus overscan, and `requestText` ranges
   are coalesced across consecutive calls within a frame. Asserted via
   `RecordingRenderer`.
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
| Scroll repaint (inline, incl. paint) | ≤ 1 ms per frame |
| Main-thread work per scroll frame outside paint | ≤ 0.2 ms (window computation + overlay transform) |
| Click/drag mapping | O(log n); zero layout reads during drag |
| Block-model memory | ≤ 40 MB |

Budgets are asserted in `test.mjs` where measurable headlessly (build, patch,
mapping, memory) and verified in the browser via renderer cost telemetry
(recorded per repaint by `InlineRenderer`); the browser verification is a
manual check-list item for the consumer's e2e suite, not a package test.

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
