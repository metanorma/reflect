# Metanorma ProseMirror — React Component Specification

This spec defines the React component package that wraps the
[`@handlewithcare/react-prosemirror`](https://github.com/handlewithcarecollective/react-prosemirror)
library and binds it to the Metanorma Mirror schema defined in
[`schema.spec.md`](./schema.spec.md).

**Spec version:** 1

**Pinned integration library:** `@handlewithcare/react-prosemirror` **exactly
`3.2.7`**. No other version is permitted. React ProseMirror releases are tightly
**coupled to a specific `prosemirror-view` release**; `3.2.7` declares
`prosemirror-view` as the pinned peer `1.42.0` (see §3). The component **must
not** resolve a different `prosemirror-view`.

**Source of truth for the document model:** the schema assembled in
`@metanorma/prosemirror-schema` (§4). This component consumes that schema; it
**does not** redefine nodes, marks, attributes, or `toDOM`/`parseDOM` rules. Any
discrepancy is resolved in favour of `schema.spec.md`.

---

## 1. Purpose

Provide a single, reusable React component — `MetanormaProseMirror` — that:

1. Mounts a ProseMirror editor driven by `metanormaSchema`
   (`@metanorma/prosemirror-schema`), so the editable document vocabulary is
   **exactly** the 42 node types and 16 mark types of `schema.spec.md` §3.
2. Renders the editor through React using
   `@handlewithcare/react-prosemirror@3.2.7` (the `ProseMirror` +
   `ProseMirrorDoc` components, the `reactKeys` plugin, and the React node-view
   API).
3. Supplies React node-view components for the schema's atom/leaf and interactive
   nodes (§7), while delegating all remaining nodes to the schema's default
   `toDOM` rendering.
4. Supports both **controlled** (`state` + `onStateChange`) and **uncontrolled**
   (`defaultState` / `defaultDoc`) usage.
5. Bootstraps from the default document in `schema.spec.md` §15 when no initial
   state is supplied.

This is an **editor-mounting** module. It does **not** ship commands, keymaps, or
input rules (see §13).

---

## 2. Module layout

A new workspace package, sibling to `pkg/prosemirror-schema` and `pkg/editor-gui`:

```
pkg/prosemirror-editor/
├── package.json          ← name: "@metanorma/prosemirror-editor"
├── tsconfig.json         ← extends ../../tsconfig.json
├── index.ts              ← public exports (§11)
├── MetanormaProseMirror.tsx   ← main component (§5)
├── nodeViews/
│   ├── index.ts               ← nodeViewComponents map (§7.1)
│   ├── ImageNodeView.tsx
│   ├── FigureNodeView.tsx
│   ├── FormulaNodeView.tsx
│   ├── FloatingTitleNodeView.tsx
│   └── SourcecodeNodeView.tsx
├── types.ts              ← `MirrorDocument` JSON type (§6.1)
├── state.ts              ← `createInitialEditorState` + `DEFAULT_MIRROR_DOC` (§6.2)
└── style.css             ← editor + node-view styling (§9)
```

> The implementer may choose a different package path, but the **public exports**
> (§11) and the component contract must match this spec exactly.

The package must be registered as a Yarn workspace by adding `"pkg/prosemirror-editor"`
to the `workspaces` array in the root `package.json` (which currently lists
`"pkg/editor-gui"`).

---

## 3. Dependencies

| Package | Version | Purpose / constraint |
|---|---|---|
| `@handlewithcare/react-prosemirror` | **`3.2.7`** (exact, no caret) | The React ↔ ProseMirror integration. **Pinned.** |
| `prosemirror-view` | **`1.42.0`** (exact) | The peer release `react-prosemirror@3.2.7` is coupled to. Any other version is unsupported and **must** be deduplicated to this one (see §3.1). |
| `prosemirror-state` | `^1.4.4` | `EditorState`, `Plugin`. Peer of react-prosemirror (`^1.0.0`). |
| `prosemirror-model` | `^1.22.0` | `Schema`, `Node` types (also required by the schema package, `schema.spec.md` §2.1). |
| `@metanorma/prosemirror-schema` | `workspace:^` | Provides `metanormaSchema`, `NODE_NAMES`, `MARK_NAMES`, `assertValidImageAttrs` (`schema.spec.md` §11). |
| `react` | `^19.2.7` | Peer. Matches the repo root. |
| `react-dom` | `^19.2.7` | Peer. Matches the repo root. |
| `react-reconciler` | **`0.32.0`** | React ProseMirror uses `react-reconciler` as a peer; its version **must match** the installed React major. For React 19.x the matching release is `0.32.0` (per the library's compatibility table). |

`devDependencies`: `@types/react@^19`, `@types/react-dom@^19`,
`typescript@~6.0.3` (matching the root).

### 3.1 Version-coupling guarantees

1. **Exact pin of the integration library.** `package.json` **must** declare
   `"@handlewithcare/react-prosemirror": "3.2.7"` (no `^`/`~`). The acceptance
   test (§12.1) asserts this.
2. **Exact pin of `prosemirror-view`.** Because `react-prosemirror@3.2.7`
   declares `prosemirror-view` peer as exactly `1.42.0`, the editor package
   **must** declare `"prosemirror-view": "1.42.0"` and the workspace must resolve
   a single instance. The repo uses Yarn PnP with the
   `prevent-multiple-instances` plugin; `prosemirror-view` is therefore
   implicitly single-instanced.
3. **Reconciler/React parity.** `react-reconciler` `0.32.0` is paired with
   `react`/`react-dom` `^19.2.7`. The component must not be used with React 18
   reconcilers.

---

## 4. Schema integration

The component imports and uses **only** `metanormaSchema` from
`@metanorma/prosemirror-schema`. It must:

1. Create every `EditorState` with `schema: metanormaSchema` (§6).
2. Never register a node-view or mark-view component for a node/mark name not
   present in `NODE_NAMES` / `MARK_NAMES`.
3. Use `assertValidImageAttrs` (schema §6.1) when handling image insertion from
   paste or any future input rule (out of scope for v1, but the guard is
   re-exported from this package's public API so toolbars can call it).
4. Treat the schema's `toDOM`/`parseDOM` as the rendering fallback for any node
   that does not have a React node-view component (§7.2).

---

## 5. Component API — `MetanormaProseMirror`

```tsx
import type { EditorState } from "prosemirror-state";
import type { Node } from "prosemirror-model";
import type { ComponentType, ReactNode } from "react";
import type { NodeViewComponentProps } from "@handlewithcare/react-prosemirror";
import type { MirrorDocument } from "./types"; // §6.1 — editor-local, not from schema

export interface MetanormaProseMirrorProps {
  /** CONTROLLED mode: the authoritative EditorState. */
  readonly state?: EditorState;
  /** Called with the next EditorState after every dispatched transaction (controlled mode). */
  readonly onStateChange?: (state: EditorState) => void;

  /** UNCONTROLLED mode: the initial EditorState (component owns state thereafter). */
  readonly defaultState?: EditorState;
  /** UNCONTROLLED convenience: build the initial state from a MirrorDocument (§6.1 shape). */
  readonly defaultDoc?: MirrorDocument;

  /** Whether the document is editable. Defaults to `true`. Configures the EditorView `editable` prop. */
  readonly editable?: boolean;

  /** Extra ProseMirror plugins to merge into the initial state (in addition to `reactKeys`). */
  readonly plugins?: readonly Plugin[];
  /** Extra direct editor props forwarded to the underlying `ProseMirror` component. */
  readonly editorProps?: DirectEditorProps;

  /** Per-node-name overrides/additions to the default node-view map (§7). */
  readonly nodeViewComponents?: Readonly<Record<string, ComponentType<NodeViewComponentProps>>>;

  /** Children rendered INSIDE the `ProseMirror` context, alongside `ProseMirrorDoc` (toolbars, widgets). */
  readonly children?: ReactNode;

  /** Class applied to the editor root wrapper. */
  readonly className?: string;
}
```

### 5.1 Controlled vs uncontrolled

- **Controlled** — when `state` is provided, the component is fully controlled:
  it passes `state` to `<ProseMirror state={...}>` and wires
  `dispatchTransaction` to call `onStateChange` with
  `state.apply(tr)`. `onStateChange` **must** be provided in this mode.
- **Uncontrolled** — when `state` is omitted, the component builds an initial
  state from `defaultState` (or from `defaultDoc`, or from the schema's default
  document — in that priority order, §6) and passes it as
  `<ProseMirror defaultState={...}>`. It manages state internally thereafter.
- Providing both `state` and `defaultState` is a programming error; the component
  must throw a development-time `Error`.

### 5.2 Rendering shape

```tsx
<ProseMirror
  {...(controlled ? { state, dispatchTransaction } : { defaultState: initial })}
  nodeViewComponents={nodeViewComponents}   // §7.1 — stable module-scope reference
  editable={() => editable}
  {...editorProps}
>
  <div className={className ?? "mn-prosemirror"}>
    <ProseMirrorDoc />
    {children}   {/* toolbars / widgets — inside editor context */}
  </div>
</ProseMirror>
```

`ProseMirrorDoc` **must** be a descendant of `ProseMirror` (required by the
library). `children` are rendered as siblings of `ProseMirrorDoc` so that they
can use `useEditorEventCallback` / `useEditorState` etc.

---

## 6. Types and EditorState setup

The editor package owns two definitions that the schema package does **not**
export: the `MirrorDocument` JSON type and the default document. Both live in
this package; they are **not** imported from
`@metanorma/prosemirror-schema`.

### 6.1 `MirrorDocument` (`types.ts`)

`MirrorDocument` is the JSON-serializable document tree shape accepted by
`prosemirror-model`'s `Schema.nodeFromJSON(...)`. It mirrors the open-attribute
model of the schema: every node carries an optional `attrs` record, and unknown
keys round-trip through the schema's catch-all `data` attribute (schema §6).

```ts
/**
 * A JSON-serializable Mirror document tree: the input shape for
 * `metanormaSchema.nodeFromJSON(...)`.
 */
export interface MirrorDocument {
  readonly type: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly content?: readonly MirrorDocument[];
  readonly marks?: readonly { readonly type: string; readonly attrs?: Readonly<Record<string, unknown>> }[];
  readonly text?: string;
}
```

> `MirrorDocument` is an editor-local convenience type. It is structurally
> compatible with the JSON that `Node.toJSON()` emits, but it is intentionally
> loose (`attrs?: Record<string, unknown>`) so callers can supply partial or
> hand-authored documents without satisfying a per-node-type attribute type.

### 6.2 `createInitialEditorState` and the default document (`state.ts`)

```ts
import { EditorState, type Plugin } from "prosemirror-state";
import { reactKeys } from "@handlewithcare/react-prosemirror";
import { metanormaSchema } from "@metanorma/prosemirror-schema";
import type { MirrorDocument } from "./types";

/**
 * The default document (schema.spec.md §15), inlined here. The schema package
 * does not export a default document; this module owns it.
 */
export const DEFAULT_MIRROR_DOC: MirrorDocument = {
  type: "doc",
  content: [
    {
      type: "sections",
      content: [
        {
          type: "clause",
          attrs: { id: "_document_container", title: null },
          content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
        },
      ],
    },
  ],
};

export function createInitialEditorState(opts: {
  doc?: MirrorDocument;
  plugins?: readonly Plugin[];
  editable?: boolean;
}): EditorState {
  return EditorState.create({
    schema: metanormaSchema,
    doc: metanormaSchema.nodeFromJSON(opts.doc ?? DEFAULT_MIRROR_DOC),
    plugins: [reactKeys(), ...(opts.plugins ?? [])],
  });
}
```

Requirements:

1. **`reactKeys()` is always present** as the first plugin. It is required by
   `@handlewithcare/react-prosemirror` to give node-view components stable keys
   across transactions. Omitting it is an error.
2. The initial document is built with `metanormaSchema.nodeFromJSON(...)`, which
   must accept `DEFAULT_MIRROR_DOC` (§6.2) without throwing. The constant is the
   schema.spec.md §15 default document, reproduced verbatim; schema acceptance
   criterion §14.5 guarantees `nodeFromJSON` accepts that shape.
3. `opts.plugins` are appended **after** `reactKeys()` so consumer plugins cannot
   accidentally displace it.

---

## 7. Node views

React ProseMirror renders node views via React components registered in the
`nodeViewComponents` map passed to `<ProseMirror>`. Every node-view component
**must** follow the library's invariants (`NodeViewComponentProps`):

- **Pass `ref` to the top-level DOM element.**
- If the node renders children, **pass `nodeProps.contentDOMRef`** to the parent
  element of `children` (or merge it with `ref` via `useMergedDOMRefs` when the
  top-level element is also the content host).
- **Spread all received HTML-attribute props** onto the top-level element
  (required for node Decorations that apply attributes rather than wrap).
- Access node data via `nodeProps.node` (a `prosemirror-model` `Node`); use
  `nodeProps.getPos()` only inside callbacks/effects, never in render.

### 7.1 The `nodeViewComponents` map

The map **must be defined at module scope** (a stable reference), never inside
the component body. The library explicitly warns that an unstable
`nodeViewComponents` reference causes remounts.

Default registered node views (node type → component):

| Node type | Component | Why a React node view |
|---|---|---|
| `image` | `ImageNodeView` | Atom leaf, `draggable`; displays `src`/`alt`; leaf (no `contentDOMRef`). |
| `figure` | `FigureNodeView` | Wraps its `image` child + caption blocks; forwards `contentDOMRef`. |
| `formula` | `FormulaNodeView` | Atom leaf; renders math placeholders from `asciimath`/`mathml`/`math_text` attrs. |
| `floating_title` | `FloatingTitleNodeView` | Atom block leaf; renders `title` attr text. |
| `sourcecode` | `SourcecodeNodeView` | `text*` container; renders `<pre><code>` with `language-${language}` class; forwards `contentDOMRef`. |

Consumer-supplied `nodeViewComponents` (prop, §5) are **merged over** this default
map (consumer wins on key collision).

### 7.2 Nodes that use default `toDOM` rendering

All nodes **not** listed in §7.1 are rendered by ProseMirror's default mechanism
using the schema's `toDOM` (schema §8). This includes, but is not limited to:
`doc`, `preface`, `sections`, `bibliography`, every `section`-group node,
`paragraph`, `note`, `admonition`, `example`, `quote`, `review`, all list nodes,
all table nodes, `footnotes`, `footnote_entry`, `footnote_marker`, `soft_break`,
and `text`. The component must not register node views for these by default.

### 7.3 Node-view component contracts

#### `ImageNodeView`
- Atom leaf (`node.isAtom`); **no** `children`, **no** `contentDOMRef`.
- Renders `<img src={node.attrs.src} alt={node.attrs.alt ?? ""} draggable />`.
- Spreads props onto the `<img>`; forwards `ref` to the `<img>`.
- On empty `src`, renders a placeholder `<div class="mn-image-placeholder">`
  (it must not throw; runtime validation via `assertValidImageAttrs` happens at
  insertion time, not render time).

#### `FigureNodeView`
- Renders `<figure class="figure" data-id={node.attrs.id}>` containing
  `{children}` (the `image` child plus any caption blocks).
- Forwards `ref` to `<figure>`; forwards `nodeProps.contentDOMRef` to the same
  element (use `useMergedDOMRefs`).

#### `FormulaNodeView`
- Atom leaf; renders `<div class="formula" data-number={number}>` with the
  `asciimath`/`mathml` text as visible placeholder content. Math **rendering** is
  out of scope (schema §16); this view only surfaces the stored attributes.

#### `FloatingTitleNodeView`
- Atom block leaf; renders `<div class="floating-title" data-id={id}>{title}</div>`
  where `title` comes from `node.attrs.title`. No `contentDOMRef` (leaf).

#### `SourcecodeNodeView`
- Renders `<pre class={language-${language}}><code>` and places `{children}`
  inside the `<code>`.
- Forwards `ref` to `<pre>`; forwards `nodeProps.contentDOMRef` to the `<code>`
  (content host differs from top-level element — register them separately, per
  the library's guidance).
- Syntax highlighting is out of scope (schema §16); the view only applies the
  language class.

---

## 8. Mark views

No mark-view components are registered by default. All 16 marks render via the
schema's `toDOM` (schema §9). Consumers may pass `markViewComponents` through
`editorProps` if needed; this is not part of the default contract.

---

## 9. Styling (`style.css`)

A single CSS module imported by the component provides:

- `.mn-prosemirror` — editor surface wrapper (focus outline, min-height).
- `.mn-prosemirror .ProseMirror` — the `contenteditable` element (padding,
  typography baseline, placeholder colour for the empty default clause).
- `.mn-image-placeholder`, `.figure`, `.formula`, `.floating-title`,
  `pre.language-*` — node-view affordances.

The component **must not** ship or depend on a CSS-in-JS runtime. Styling is
plain CSS, consistent with `pkg/editor-gui/style.module.css`.

---

## 10. Hooks available to children

Because `children` render inside the `ProseMirror` context (§5.2), toolbars and
widgets may use the full `@handlewithcare/react-prosemirror` hook set directly.
The component re-exports nothing for these; consumers import them from
`@handlewithcare/react-prosemirror`:

- `useEditorState()` / `useEditorStateSelector(selector)` — read state.
- `useEditorEventCallback(cb)` — stable callback with the `EditorView`.
- `useEditorEffect(effect, deps?)` — layout effect after view sync.
- `useEditorEventListener(eventType, listener)` — DOM events on the editable node.
- `useMergedDOMRefs(...)` — combine `ref` + `contentDOMRef` in node views.

Example toolbar child (bold toggle) lives in the consumer; the component only
provides the mount point.

---

## 11. Public API (`index.ts`)

```ts
import type { EditorState } from "prosemirror-state";
import type { Plugin } from "prosemirror-state";

/** The main editor component. */
export const MetanormaProseMirror: React.FC<MetanormaProseMirrorProps>;

/** JSON-serializable document tree (§6.1); editor-local, not from the schema package. */
export type { MirrorDocument } from "./types";

/** Build an EditorState bound to metanormaSchema (always includes reactKeys). */
export function createInitialEditorState(opts: {
  doc?: MirrorDocument;
  plugins?: readonly Plugin[];
  editable?: boolean;
}): EditorState;

/** Re-exported from the schema package for consumer convenience. */
export {
  metanormaSchema,
  NODE_NAMES,
  MARK_NAMES,
  assertValidImageAttrs,
} from "@metanorma/prosemirror-schema";

/** Re-exported node-view components, for consumers composing a custom map. */
export {
  ImageNodeView,
  FigureNodeView,
  FormulaNodeView,
  FloatingTitleNodeView,
  SourcecodeNodeView,
} from "./nodeViews/index";
```

Types `MetanormaProseMirrorProps` and `NodeViewComponentProps` are also exported
as types.

---

## 12. TypeScript constraints

Inherits the root `tsconfig.json` (`strict`, `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`, ESM,
`module: node16`, `jsx: react`):

1. **`import type`** for all type-only imports from `prosemirror-model`,
   `prosemirror-state`, `react`, and `@handlewithcare/react-prosemirror`.
2. **No `undefined`-valued optional props.** Because `exactOptionalPropertyTypes`
   forbids assigning `undefined` to optional properties, node-view components and
   the main component must use conditional spreads
   (`{...(id != null ? { "data-id": id } : {})}`) rather than setting keys to
   `undefined`.
3. **`readonly` props.** The `MetanormaProseMirrorProps` interface declares all
   members `readonly`, matching the immutability discipline of the schema
   package.
4. **Node-view map stability** is a runtime/React concern, but the type of
   `nodeViewComponents` is `Readonly<Record<string, ComponentType<NodeViewComponentProps>>>`.

---

## 13. Acceptance criteria

1. **Version pin.** `pkg/prosemirror-editor/package.json` declares
   `"@handlewithcare/react-prosemirror": "3.2.7"` and `"prosemirror-view": "1.42.0"`
   exactly. A test reads the manifest and asserts both (§3.1).
2. **Compile.** `yarn workspace @metanorma/prosemirror-editor compile` succeeds
   with **zero** TypeScript errors under the repo tsconfig.
3. **Schema bound.** The editor state's `schema` is reference-equal to
   `metanormaSchema`, and `state.schema.spec.nodes` contains exactly the 42 names
   from `NODE_NAMES` and `state.schema.spec.marks` the 16 from `MARK_NAMES`.
4. **`reactKeys` present.** The initial state's plugin set includes a
   `reactKeys` plugin (its key is `"reactKeys"`); constructing state via
   `createInitialEditorState({})` does not throw and yields an editable doc from
   the package-local `DEFAULT_MIRROR_DOC` (§6.2, reproducing schema.spec.md §15).
5. **Round-trip through the editor.** Loading `DEFAULT_MIRROR_DOC` (§6.2) into the
   editor and reading back `view.state.doc.toJSON()` reproduces the typed
   attributes with no loss (delegates to schema acceptance §14.3–14.4).
6. **Controlled dispatch.** In controlled mode, typing/dispatching a transaction
   invokes `onStateChange` exactly once per transaction with
   `prevState.apply(tr)`.
7. **Node-view registration.** `nodeViewComponents` contains exactly the five
   entries in §7.1 by default; consumer overrides merge over them without
   dropping defaults not overridden.
8. **Node-view invariants.** Each registered node-view component forwards `ref`
   to its top-level DOM element and, where it renders children, forwards
   `nodeProps.contentDOMRef` (asserted by a render test using
   `@testing-library/react`).
9. **`image` is non-editable leaf.** `ImageNodeView` renders an `<img>` with no
   editable content hole; it does not register `contentDOMRef`.
10. **Editable flag.** With `editable={false}`, the `contenteditable` attribute
    on the rendered `.ProseMirror` element is absent/false.
11. **`ProseMirrorDoc` placement.** `ProseMirrorDoc` is a descendant of the
    `ProseMirror` component; omitting it is a documented error.

---

## 14. Out of scope (v1)

Deferred and **not** required by this spec:

- Commands, keymaps, input rules, or menu/toolbar implementations (the component
  only provides the mount point; toolbars are consumer-authored children, §10).
- Collaborative editing / Yjs bindings.
- Math rendering for `formula` / `stem` (node views surface attributes only).
- Syntax highlighting inside `sourcecode` (language class only).
- `prosemirror-tables` integration / column-resize UI.
- Drag-and-drop reordering via `reorderSiblings` (available from the library, but
  no default wiring).
- Mark-view components (§8).
- Enforcing `footnote_marker.target` ↔ `footnote_entry.id` referential integrity
  (schema §16).
- SSR/hydration wiring beyond what `pkg/editor-gui/bootstrap.tsx` already does;
  the component is client-rendered.
