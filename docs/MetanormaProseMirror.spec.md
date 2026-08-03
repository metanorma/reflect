# Metanorma ProseMirror — React Component Specification

This spec defines the React component package that wraps the
[`@handlewithcare/react-prosemirror`](https://github.com/handlewithcarecollective/react-prosemirror)
library and binds it to the Metanorma Mirror schema defined in
[`schema.spec.md`](./schema.spec.md).

**Spec version:** 4
**Spec dependencies:** [`schema.spec.md`](./schema.spec.md) v4

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
   **exactly** the 43 node types and 14 mark types of `schema.spec.md` §3.
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
├── style.css             ← entry point: `@layer` order + three `@import`s (§9)
├── tokens.css            ← `--mn-*` design tokens; themes (§9)
├── editor-chrome.css     ← editor affordances (§9)
└── document.css          ← document presentation (§9)
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
| `@metanorma/prosemirror-schema` | `workspace:^` | Provides `metanormaSchema`, `NODE_NAMES`, `MARK_NAMES`, `CLASS`, `assertValidImageAttrs` (`schema.spec.md` §11). |
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
   paste or any future input rule (out of scope for v1; the guard is exported
   from `@metanorma/prosemirror-schema` and re-exported from the editor package's
   public API for convenience).
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
| `formula` | `FormulaNodeView` | Atom leaf; renders math placeholder from the `asciimath`/`mathml` attr selected by the `type` attr. |
| `floating_title` | `FloatingTitleNodeView` | Atom block leaf; renders `title` attr text. |
| `sourcecode` | `SourcecodeNodeView` | `text*` container; renders `<pre><code>` with `language-${language}` class; forwards `contentDOMRef`. |
| `clause`, `annex`, `content_section`, `abstract`, `foreword`, `introduction`, `acknowledgements`, `terms`, `definitions`, `references` | `SectionNodeView` | Content-bearing section containers; render the `title` attr as an editable heading above the content; forward `contentDOMRef`. (See §7.3.) |

Consumer-supplied `nodeViewComponents` (prop, §5) are **merged over** this default
map (consumer wins on key collision).

### 7.2 Nodes that use default `toDOM` rendering

All nodes **not** listed in §7.1 are rendered by ProseMirror's default mechanism
using the schema's `toDOM` (schema §8). This includes, but is not limited to:
`doc`, `preface`, `sections`, `bibliography`, `paragraph`, `note`, `admonition`,
`example`, `quote`, `review`, all list nodes, all table nodes, `footnotes`,
`footnote_entry`, `footnote_marker`, `soft_break`, and `text`. The component
must not register node views for these by default. (The ten content-bearing
section node types — `clause`, `annex`, `content_section`, `abstract`,
`foreword`, `introduction`, `acknowledgements`, `terms`, `definitions`,
`references` — *were* in this list prior to v3; they are now rendered by
`SectionNodeView`, §7.1/§7.3. `floating_title` has had its own view since v1.)

### 7.3 Node-view component contracts

#### `ImageNodeView`
- Atom leaf (`node.isAtom`); **no** `children`, **no** `contentDOMRef`.
- Renders `<img src={node.attrs.src} alt={node.attrs.alt ?? ""} draggable />`.
- Spreads props onto the `<img>`; forwards `ref` to the `<img>`.
- On empty `src`, renders a placeholder `<div class="mn-image-placeholder">`
  (it must not throw; runtime validation via `assertValidImageAttrs` happens at
  insertion time, not render time).

#### `FigureNodeView`
- Renders `<figure class={CLASS.figure} data-id={node.attrs.id}>` containing
  `{children}` (the `image` child plus any caption blocks). `CLASS.figure` is
  `"mn-figure"` (schema §8.0, v4 namespace unification).
- Forwards `ref` to `<figure>`; forwards `nodeProps.contentDOMRef` to the same
  element (use `useMergedDOMRefs`).

#### `FormulaNodeView`
- Atom leaf; renders `<div class={CLASS.formula} data-type={type} data-number={number}>`
  with the math text from the **`type`-selected** attribute (`asciimath` when
  `type === "asciimath"`, `mathml` when `type === "mathml"`) as visible
  placeholder content. The non-selected attribute, if populated, is ignored by
  this view. Math **rendering** is out of scope (schema §16); this view only
  surfaces the stored attributes (schema v3 §17.2). `CLASS.formula` is
  `"mn-formula"` (schema §8.0).

#### `FloatingTitleNodeView`
- Atom block leaf; renders `<div class={CLASS.floatingTitle} data-id={id}>{title}</div>`
  where `title` comes from `node.attrs.title`. No `contentDOMRef` (leaf).
  `CLASS.floatingTitle` is `"mn-floating-title"` (schema §8.0).

#### `SourcecodeNodeView`
- Renders `<pre class={language-${language}}><code>` and places `{children}`
  inside the `<code>`.
- Forwards `ref` to `<pre>`; forwards `nodeProps.contentDOMRef` to the `<code>`
  (content host differs from top-level element — register them separately, per
  the library's guidance).
- Syntax highlighting is out of scope (schema §16); the view only applies the
  language class.

#### `SectionNodeView`
- Registered for the ten content-bearing section node types (`clause`, `annex`,
  `content_section`, `abstract`, `foreword`, `introduction`,
  `acknowledgements`, `terms`, `definitions`, `references`); NOT for
  `floating_title` (which keeps `FloatingTitleNodeView`).
- Renders `<section class="mn-<type>" data-id={id}>` containing:
  1. an editable title strip `<div class="mn-section-title" contentEditable={false}>`
     holding a controlled `<input class="mn-section-title-input">` bound to
     `node.attrs.title`; and
  2. the section's editable content (`{children}`) inside a content-host element
     (`<div class="mn-section-content">`) that receives `nodeProps.contentDOMRef`.
- Forwards `ref` to the outer `<section>`; forwards `nodeProps.contentDOMRef`
  to the content-host element via `useMergedDOMRefs`. The title strip and the
  content host are **separate elements** (the title sits between the section's
  opening token and its first child); `ref` and `contentDOMRef` are NOT merged
  onto the same element.
- **Editing the title:** the `<input>` is `contentEditable={false}` and has
  capture-phase `stopPropagation` listeners (attached via a ref callback) for
  every editor-relevant DOM event type (`beforeinput`, `keydown`, `mousedown`,
  composition, paste, cut, drop, dragover, dragenter) so that prosemirror-view
  and `@handlewithcare/react-prosemirror`'s `beforeInputPlugin` do not
  intercept input destined for the field. The `input` event is deliberately
  NOT stopped — React's controlled-`<input>` `onChange` relies on it bubbling
  to the React root. The title is committed on **blur**, not on every change:
  dispatching a `setNodeMarkup` transaction per keystroke would trigger a
  controlled-mode re-render → `selectionToDOM`, stealing focus from the field
  after each character. On blur (and only when the edited value differs from
  the committed title), dispatches
  `tr.setNodeMarkup(getPos(), undefined, { ...node.attrs, title })` via
  `useEditorEventCallback` (the view's `state`/`dispatch` seam). An empty input
  commits `title: null`. The `<input>` carries a placeholder
  (`"Section heading"`) when `title` is null/empty. Undo walks back one title
  edit per blur (not per character).
- **Schema relationship:** `sectionToDOM` (schema §8.2) is the headless / export
  serialization path and deliberately does NOT render `title` (Metanorma
  Presentation XML models a section heading as a `<title>`/`<name>` *child
  element*, not an attribute — schema §17). This node view is an editor-only
  rendering override that surfaces the typed `title` attribute as editable
  text; the attribute remains the source of truth, and `sectionToDOM` remains
  the path used for non-editor serialization (clipboard, `Node.toJSON`,
  headless conversion). Registering this view does **not** change the schema,
  the `toDOM`/`parseDOM` rules, or the `SectionAttrs` shape.

---

## 8. Mark views

No mark-view components are registered by default. All 14 marks render via the
schema's `toDOM` (schema §9). Consumers may pass `markViewComponents` through
`editorProps` if needed; this is not part of the default contract.

---

## 9. Styling

Styling is split across four CSS files, all loaded as side-effects of importing
`MetanormaProseMirror.tsx`. The component **must not** ship or depend on a
CSS-in-JS runtime. All styles are plain CSS, consistent with
`pkg/editor-gui/style.module.css`.

### 9.1 File layout and cascade order

`style.css` is a small entry point that declares the cascade order with
`@layer` and pulls in the three implementation files:

```css
/* style.css */
@layer tokens, chrome, document, layout;

@import "./tokens.css";
@import "./editor-chrome.css";
@import "./document.css";
```

The `@layer` declaration is authoritative for specificity: a rule in a later
layer beats an equal-specificity rule in an earlier layer, regardless of
source order. This means:

- `tokens` (lowest) — only `:root` custom properties; never competes on
  selector specificity.
- `chrome` — editor affordances.
- `document` — document presentation.
- `layout` (reserved) — consumer-side layout (e.g. the toolbar dock in
  `pkg/editor-gui/style.module.css`). The host wins on equal specificity, so
  overrides never need `!important`.

### 9.2 `tokens.css` — design tokens (`--mn-*`)

The single source of truth for every colour, spacing value, radius and font
used by the editor surface, the document contents, and the toolbar. Every
other stylesheet consumes these via `var(--mn-*)` and contains NO colour
literals.

Token inventory: `--mn-surface`, `--mn-surface-muted`, `--mn-border`,
`--mn-text`, `--mn-text-muted`, `--mn-text-placeholder`, `--mn-empty-marker`,
`--mn-accent`, `--mn-focus` (= accent), `--mn-active`, `--mn-danger`,
`--mn-shadow`, `--mn-on-dark`; spacing scale `--mn-space-1` … `--mn-space-6`
(`0.25em` … `2em`); `--mn-radius-sm`/`md` (`2px`/`4px`);
`--mn-font-body`/`mono`.

**Themes.** Light values are declared on `:root`. OS dark mode is centralised
in a single `@media (prefers-color-scheme: dark)` block. A host may force a
theme by setting `data-mn-theme="light"` or `"dark"` on `.mn-prosemirror` (or
any ancestor); these selectors are declared after the media query so they win
on equal specificity. *(A `theme` prop on `MetanormaProseMirror` that renders
this attribute is a candidate for a future version; not part of v4.)*

### 9.3 `editor-chrome.css` — editor affordances

Rules that exist because the editor has UI the source document does not.
Change cadence: editor UX changes. Consumers:

- `.mn-prosemirror` — editor surface wrapper (focus outline, min-height).
- `.mn-prosemirror .ProseMirror` — the `contenteditable` element (padding,
  typography baseline, placeholder colour for the empty default clause).
- `.mn-image-placeholder` — empty-src placeholder rendered by
  `ImageNodeView` (§7.3).
- `.mn-section-title`, `.mn-section-title-input`, `.mn-section-content` —
  `SectionNodeView` affordances (§7.3): the editable heading strip above each
  section's content, the `<input>` inside it, and the content host wrapping the
  section's editable children.

### 9.4 `document.css` — document presentation

Rules that mirror the rendered Metanorma Presentation XML. Change cadence:
design re-skin. A designer editing this file touches nothing the editor logic
depends on. Consumes `var(--mn-*)` throughout.

- `figure.mn-figure` — figure spacing and centring.
- `.mn-formula` — formula panel (mono font, muted background).
- `.mn-floating-title` — floating-title typography.
- `pre.language-*` — sourcecode panel (highlighter-interop class, not in the
  `CLASS` contract — schema §8.0).

The class names referenced here (`mn-figure`, `mn-formula`,
`mn-floating-title`) are emitted by the schema's `toDOM` and centralised in
`CLASS` (schema §8.0). Node views source their `className` from the same
`CLASS` const (§7.3), so the schema, the node views, and this stylesheet stay
in sync via one symbol per class.

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
   `metanormaSchema`, and `state.schema.spec.nodes` contains exactly the 43 names
   from `NODE_NAMES` and `state.schema.spec.marks` the 14 from `MARK_NAMES`.
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
