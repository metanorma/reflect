# AdvancedMetanormaToolbar — Feature Specifications

This directory contains the feature specifications for **`AdvancedMetanormaToolbar`**,
an extended version of the `MetanormaToolbar` component specified in
[`../MetanormaToolbar.spec.md`](../MetanormaToolbar.spec.md).

## 1. Relationship to `MetanormaToolbar`

`MetanormaToolbar` covers the core inline-marks, block-wrapping, list, and
hyperlink operations. Its §5.5 ("Out of scope") enumerates six feature areas
that are intentionally deferred. `AdvancedMetanormaToolbar` is the component
that picks up exactly those six areas — it does **not** rehash the contents of
`MetanormaToolbar.spec.md`.

Each document in this directory specifies one of the deferred feature areas
with a concrete implementation proposal and a list of open questions.

## 2. Conventions

The following conventions carry over from `MetanormaToolbar.spec.md` and apply
to every document in this directory unless a document states otherwise.

### 2.1 Package and source location

| Aspect | Value |
|---|---|
| Package | `@metanorma/prosemirror-editor` (toolbar, UI, view adapters); commands in `@metanorma/editor-commands` |
| Schema package | `@metanorma/prosemirror-schema` |
| Source root | `pkg/prosemirror-editor/src/` (UI); `pkg/editor-commands/src/` (pure commands) |
| Toolbar stylesheet | `toolbar.css` (class prefix `mn-toolbar`) |
| Commands package | `@metanorma/editor-commands` — see §6 |

### 2.2 Integration model

`AdvancedMetanormaToolbar` renders **inside** the `<ProseMirror>` context (as a
child of `MetanormaProseMirror`), exactly like `MetanormaToolbar`. It reads
editor state and dispatches transactions through
`useEditorStateSelector` / `useEditorEventCallback` from
`@handlewithcare/react-prosemirror` — no state props required.

### 2.3 Button descriptor

Every toolbar button follows the `ToolbarButton` descriptor from
`MetanormaToolbar.spec.md` §5:

```typescript
interface ToolbarButton {
  readonly key: string;
  readonly label: string;
  readonly title: string;
  readonly isActive: (state: EditorState) => boolean;
  readonly isEnabled: (state: EditorState) => boolean;
  readonly run: (view: EditorView) => void;
}
```

Active/enabled state is subscribed via per-button `useEditorStateSelector`
calls; commands are dispatched via `useEditorEventCallback`.

### 2.4 CSS class structure

Reuses the `mn-toolbar` prefix from `MetanormaToolbar.spec.md` §8:

```
.mn-toolbar                    /* root */
  .mn-toolbar-group            /* group container */
    .mn-toolbar-btn            /* button */
    .mn-toolbar-btn--active    /* active modifier */
    .mn-toolbar-btn--disabled  /* disabled modifier */
  .mn-toolbar-divider          /* group separator */
```

Feature-specific documents may introduce additional classes (e.g. grid picker,
popover) — these are documented in each file.

### 2.5 Accessibility baseline

Each interactive control is a native `<button>` (or focusable element) with a
descriptive `title` / `aria-label`, `aria-pressed` for toggles, and a
`disabled` attribute when not applicable. Popovers and pickers are
`role="dialog"`/`role="grid"` with keyboard operability (Enter/Space/Escape).

### 2.6 TypeScript constraints

The project `tsconfig` enforces `strict`, `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `module: node16`. All code
proposed in these documents must:

- Use `import type` for type-only imports.
- Use `.js` extensions in relative imports.
- Avoid `undefined` for optional props (use `?` syntax).
- Handle `null` / `undefined` from `noUncheckedIndexedAccess`.

## 3. Document map

| File | Feature area | Corresponds to `MetanormaToolbar.spec.md` §5.5 |
|---|---|---|
| [`tables.md`](./tables.md) | Table insertion with row/column dimension selection UI | "Tables" |
| [`images-figures.md`](./images-figures.md) | Image/figure insertion, URL/upload, `assertValidImageAttrs` | "Images / figures" |
| [`sections.md`](./sections.md) | Section/clause nesting structural operations | "Section / clause nesting" |
| [`reference-marks.md`](./reference-marks.md) | `xref`, `eref`, `concept`, `bcp14`, `footnote`, `stem` marks | "Reference marks" |
| [`definition-lists.md`](./definition-lists.md) | `dl`/`dt`/`dd` insertion logic | "Definition lists" |
| [`undo-redo.md`](./undo-redo.md) | Undo/redo via `prosemirror-history` | "Undo / redo" |

## 4. Schema reference (shared)

All features target the single `metanormaSchema` exported from
`@metanorma/prosemirror-schema`. Key node and mark definitions relevant across
features are summarized below; consult `pkg/prosemirror-schema/src/nodes.ts`
and `marks.ts` for full specs.

### 4.1 Groups

| Group constant | Value | Members (excerpt) |
|---|---|---|
| `INLINE_GROUP` | `"inline"` | `text`, `footnote_marker` |
| `BLOCK_GROUP` | `"block"` | `paragraph`, `note`, `example`, `sourcecode`, `formula`, `quote`, `review`, `floating_title`, lists, `dl`, table nodes, `figure` |
| `SECTION_GROUP` | `"section"` | `clause`, `annex`, `content_section`, `abstract`, `foreword`, `introduction`, `acknowledgements`, `terms`, `definitions`, `references` |

### 4.2 Attribute helpers

- `DATA_ATTR` — `{ data: { default: {} } }`, universal catch-all.
- `baseAttrs()` — `{ id, number, data }`, all defaulting `null`/`{}`.
- `sectionAttrs()` — `{ id, number, title, data }`, all defaulting `null`/`{}`.

### 4.3 Runtime guards

`assertValidImageAttrs(attrs)` — asserts `src` is a non-empty string; used by
image insertion paths (see `images-figures.md`).

## 5. Composition with `MetanormaToolbar`

`AdvancedMetanormaToolbar` is a **superset** of `MetanormaToolbar`: it must
render every group the base toolbar renders (§5.1–5.4 of
`MetanormaToolbar.spec.md`: `marks`, `blocks`, `lists`, `link`) **plus** the
six advanced groups specified in this directory. This section defines the
target architecture for sharing the base functionality **without duplicating
it**, and the refactor of the existing `MetanormaToolbar` needed to get there.

### 5.1 Current state of `MetanormaToolbar`

`MetanormaToolbar` **is implemented** at
`pkg/prosemirror-editor/src/MetanormaToolbar.tsx`. It is a self-contained
monolith with no `toolbar/` directory, no group registry, and no extension
seam. Concretely, the current implementation contains:

| Current location (in `MetanormaToolbar.tsx`) | What it is | Visibility |
|---|---|---|
| `ToolbarButton` interface (`:61`) | The button descriptor (`key/label/title/isActive/isEnabled/run`) | **private** — not exported |
| `ToolbarButtonView` function component (`:283`) | Renders one button; subscribes to state; dispatches via `useEditorEventCallback` | **private** — not exported |
| `buildButtons()` factory (`:163`) | Builds all four groups' descriptors in one function, returns `Record<ToolbarGroup, readonly ToolbarButton[]>` | private |
| `GROUP_ORDER` constant (`:311`) | Hardcoded `["marks","blocks","lists","link"]` ordering | private |
| Predicates (`:97`–`152`) | `activeMarkTypes`, `isInlineContext`, `isBlockContext`, `isMarkActive`, `isListActive`, `isBlockWrapActive` | private |
| `requireMark` / `requireNode` (`:74`) | Schema name-resolution guards | private |
| `defaultLinkPrompt` (`:285`) | `window.prompt` fallback for the link group | private |
| Render body (`:343`) | Inlined group iteration, divider insertion, `visibleGroups` filtering | private |

The `commands/` directory contains only `toggleList.ts`, whose signature is
`toggleList(view: EditorView, listType): boolean` — it takes an `EditorView`
and dispatches (see §5.12).

**Consequence:** the sharing architecture in §5.2–5.4 below describes the
*target* shape, not the current shape. Achieving it requires refactoring the
existing monolith — the subject of the refactor plan in §5.5.

### 5.2 Target architecture: shared shell + group registry

The refactor moves `MetanormaToolbar` toward a three-layer structure so that
`AdvancedMetanormaToolbar` can reuse the base groups without duplication:

1. **Rendering primitives** (shared by both toolbars) — a generic `<Toolbar>`
   shell that renders an ordered list of *groups*, and a `<ToolbarButtonView>`
   that renders a single `ToolbarButton` descriptor with its
   active/enabled/dispatch wiring.
2. **Group definitions** (data + stateful controls) — one module per group.
   Base groups live alongside advanced groups; each exports a `ToolbarGroupDef`.
3. **Thin assembler components** — `MetanormaToolbar` and
   `AdvancedMetanormaToolbar` each just select *which* groups to pass to the
   shared `<Toolbar>` shell.

```
┌─────────────────────────────────────────────────────────────┐
│  <Toolbar groups={[…]} visibleGroups={…} className={…} />   │  ← shared shell
│   renders each group (divider between), delegates entries   │
└─────────────────────────────────────────────────────────────┘
              ▲                                    ▲
              │ groups = baseGroups                │ groups = [...baseGroups, ...advanced]
              │                                    │
   ┌──────────┴──────────┐              ┌──────────┴──────────────┐
   │  MetanormaToolbar   │              │ AdvancedMetanormaToolbar│
   │  (thin assembler)   │              │  (thin assembler)       │
   └─────────────────────┘              └─────────────────────────┘
```

The base groups array is **literally the same object** passed to both, so the
base functionality is shared by construction.

### 5.3 Shared primitives (target)

#### 5.3.1 Entry model

Most toolbar controls are plain data (`ToolbarButton`, currently a private
interface in `MetanormaToolbar.tsx:61` — the refactor promotes it to an
exported type in `toolbar/types.ts`). A few advanced controls are inherently
**stateful** — the table grid-picker popover (`tables.md`), the image insert
dialog (`images-figures.md`), and the reference-mark popovers
(`reference-marks.md`) — and cannot be expressed by a single `run(view)`
callback. The entry model accommodates both:

```typescript
import type { ComponentType, ReactNode } from "react";
import type { ToolbarButton } from "./types.js";

/** A plain data-driven button (marks, lists, link, undo/redo, sections, …). */
export interface ToolbarButtonEntry {
  readonly kind: "button";
  readonly descriptor: ToolbarButton;
}

/**
 * A stateful control rendered in place of a button
 * (table grid picker, image dialog, reference-mark popover).
 * The component owns its own hooks and popover/dialog state.
 */
export interface ToolbarControlEntry {
  readonly kind: "control";
  readonly render: () => ReactNode;
}

export type ToolbarEntry = ToolbarButtonEntry | ToolbarControlEntry;
```

`<ToolbarButtonView>` (currently private in `MetanormaToolbar.tsx:283` — the
refactor extracts it to `toolbar/ToolbarButtonView.tsx`) subscribes to
`useEditorStateSelector` for active/enabled state and dispatches via
`useEditorEventCallback` — exactly the wiring it has today. A `control` entry
renders its own React node (which internally uses the same hooks).

#### 5.3.2 Group definition

```typescript
/** One visually grouped cluster of entries, separated by dividers. */
export interface ToolbarGroupDef {
  /** Stable id used for `visibleGroups` toggling and React keys. */
  readonly id: string;
  /** Accessible label for the group container (`aria-label`). */
  readonly label: string;
  readonly entries: readonly ToolbarEntry[];
}
```

#### 5.3.3 The shared `<Toolbar>` shell

```typescript
export interface ToolbarProps {
  /** Ordered group definitions to render, left-to-right. */
  readonly groups: readonly ToolbarGroupDef[];
  /** Hide entire groups by id. Omitted ids default to visible. */
  readonly visibleGroups?: Readonly<Record<string, boolean>>;
  /** Root class. Defaults to "mn-toolbar". */
  readonly className?: string;
}
```

The shell iterates `groups`, skips any whose `visibleGroups[id] === false`,
and inserts a `.mn-toolbar-divider` between visible groups — the logic
currently inlined in `MetanormaToolbar`'s render body (`:343`). For each entry
it renders `<ToolbarButtonView>` (for `kind: "button"`) or the control's node
(for `kind: "control"`). It reuses the `mn-toolbar*` CSS classes from
`MetanormaToolbar.spec.md` §8 unchanged.

### 5.4 Group registry (target)

Each group is defined in its own module under `toolbar/groups/`:

| Module | Group id | Layer | Spec source |
|---|---|---|---|
| `marksGroup.tsx` | `marks` | base | `MetanormaToolbar.spec.md` §5.1 |
| `blocksGroup.tsx` | `blocks` | base | §5.2 |
| `listsGroup.tsx` | `lists` | base | §5.3 |
| `linkGroup.tsx` | `link` | base | §5.4 |
| `tablesGroup.tsx` | `tables` | advanced | `tables.md` |
| `imagesGroup.tsx` | `images` | advanced | `images-figures.md` |
| `sectionsGroup.tsx` | `sections` | advanced | `sections.md` |
| `refsGroup.tsx` | `refs` | advanced | `reference-marks.md` |
| `definitionListGroup.tsx` | `dl` | advanced | `definition-lists.md` |
| `historyGroup.tsx` | `history` | advanced | `undo-redo.md` |

A barrel (`toolbar/groups/index.ts`) exports two assemblers:

```typescript
/** The four base groups — identical for both toolbars. */
export const baseGroups: readonly ToolbarGroupDef[] = [
  marksGroup, blocksGroup, listsGroup, linkGroup,
];

/** Factory: builds the advanced groups, threading feature-specific props. */
export function buildAdvancedGroups(
  opts: AdvancedFeatureOptions,
): readonly ToolbarGroupDef[] {
  return [
    refsGroup(opts),        // after 'link' — cross-references
    sectionsGroup(opts),
    definitionListGroup(),
    tablesGroup(),
    imagesGroup(opts),      // needs onImageUpload / onImagePrompt
    historyGroup(opts),     // rightmost, per undo-redo.md
  ];
}
```

The **base groups carry no external props** (they are static descriptors over
`metanormaSchema`), so they are shared as a single constant. The **advanced
groups are produced by a factory** because several need feature-specific
callbacks (see §5.7).

### 5.5 `MetanormaToolbar` refactor plan

The refactor transforms the existing monolith (`MetanormaToolbar.tsx`) into
the target architecture of §5.2–5.4. It is organised as a sequence of
extraction steps. Each step moves code that **already exists** today into its
target module, preserving behaviour.

#### 5.5.1 Design goals of the refactor

- **No duplication.** The mark/block/list/link button definitions and the
  rendering machinery must exist in exactly one place, used by both toolbars.
- **No behavioural divergence.** Clicking *Bold* in `AdvancedMetanormaToolbar`
  must dispatch the identical `toggleMark(schema.marks.strong)` command, with
  the identical active/enabled detection, as in `MetanormaToolbar`. The
  refactor must not change any user-visible behaviour of the base toolbar.
- **Additive only.** Advanced features are *new groups* appended after the base
  groups; they must not alter base-group behaviour.
- **Public API preserved.** `MetanormaToolbar`, `MetanormaToolbarProps`, and
  `ToolbarGroup` keep their names and shapes; only *new* symbols are exported.

#### 5.5.2 Step 1 — Extract shared types to `toolbar/types.ts`

Create `pkg/prosemirror-editor/src/toolbar/types.ts`. Move into it:

| Symbol | Current location | Target |
|---|---|---|
| `ToolbarButton` interface | `MetanormaToolbar.tsx:61` (private) | `toolbar/types.ts` (**exported**) |
| `ToolbarEntry`, `ToolbarButtonEntry`, `ToolbarControlEntry` | new | `toolbar/types.ts` (§5.3.1) |
| `ToolbarGroupDef` | new | `toolbar/types.ts` (§5.3.2) |
| `ToolbarProps` | new | `toolbar/types.ts` (§5.3.3) |

`MetanormaToolbar.tsx` then imports `ToolbarButton` from `./toolbar/types.js`.
No behaviour change.

#### 5.5.3 Step 2 — Extract `ToolbarButtonView` to `toolbar/ToolbarButtonView.tsx`

Move the `ToolbarButtonView` function component (`MetanormaToolbar.tsx:283`)
verbatim into `pkg/prosemirror-editor/src/toolbar/ToolbarButtonView.tsx`, make
it an **exported** module, and import it back into `MetanormaToolbar.tsx`. Its
`useEditorStateSelector` / `useEditorEventCallback` wiring and CSS class logic
move with it unchanged.

#### 5.5.4 Step 3 — Extract the `<Toolbar>` shell to `toolbar/Toolbar.tsx`

Move the render-body logic currently inlined in `MetanormaToolbar` (`:343`:
the group iteration, the `GROUP_ORDER`-driven loop, the divider insertion, and
the `visibleGroups` filtering) into a new generic `<Toolbar>` component
(`pkg/prosemirror-editor/src/toolbar/Toolbar.tsx`) with the `ToolbarProps`
signature from §5.3.3. The shell renders `<ToolbarButtonView>` for each
`ToolbarButtonEntry`. After this step, `MetanormaToolbar`'s render body is a
single `<Toolbar …/>` call.

> The `GROUP_ORDER` constant (`:311`) is **retired** — ordering now comes from
> the `groups` array passed to `<Toolbar>`, so a hardcoded order is no longer
> needed.

#### 5.5.5 Step 4 — Split `buildButtons()` into four group modules

The current `buildButtons()` factory (`:163`) builds all four groups in one
function. Split it into one module per group under `toolbar/groups/`:

| Target module | Extracted from `buildButtons()` | Predicates it absorbs |
|---|---|---|
| `marksGroup.tsx` | the `markSpecs` array + mark-button loop (`:167`) | `activeMarkTypes`, `isMarkActive`, `isInlineContext` |
| `blocksGroup.tsx` | the `blockSpecs` array + block-button loop (`:184`) | `isBlockWrapActive`, `isBlockContext` |
| `listsGroup.tsx` | the `listSpecs` array + list-button loop (`:200`) | `isListActive` |
| `linkGroup.tsx` | the `link` button (`:216`) + `defaultLinkPrompt` (`:285`) | (uses `isMarkActive`, `isInlineContext`) |

Each module exports a `ToolbarGroupDef`. Shared predicates used by more than
one group (`isInlineContext`, `isBlockContext`, `isMarkActive`,
`activeMarkTypes`) move to a small `toolbar/predicates.ts` (or
`toolbar/types.ts`) and are imported by the group modules. The
`requireMark`/`requireNode` schema guards (`:74`) move alongside them.

The link group is parameterised by the prompt callback: `linkGroup` becomes a
factory `(onLinkPrompt) => ToolbarGroupDef` so it can read the latest prop —
the current code achieves this via a ref + lazy getter (`:345`); the extracted
module preserves that pattern.

#### 5.5.6 Step 5 — Create `baseGroups` and reduce `MetanormaToolbar` to an assembler

Create `toolbar/groups/index.ts` exporting the `baseGroups` constant (§5.4).
Then reduce `MetanormaToolbar.tsx` to the thin assembler:

```typescript
// MetanormaToolbar.tsx — refactored (public API unchanged)
export function MetanormaToolbar({
  visibleGroups, className, onLinkPrompt,
}: MetanormaToolbarProps): React.JSX.Element {
  const linkGroup = useMemo(
    () => makeLinkGroup(onLinkPrompt ?? defaultLinkPrompt),
    [onLinkPrompt],
  );
  const groups = useMemo(
    () => [marksGroup, blocksGroup, listsGroup, linkGroup],
    [linkGroup],
  );
  return (
    <Toolbar
      groups={groups}
      visibleGroups={visibleGroups}
      className={className}
    />
  );
}
```

After this step the public surface (`MetanormaToolbar`, `MetanormaToolbarProps`,
`ToolbarGroup`) is unchanged, but the internals are shared primitives.

#### 5.5.7 Step 6 — Refactor `toggleList` to the command contract

The existing `toggleList(view: EditorView, listType): boolean`
(`commands/toggleList.ts:51`) takes an `EditorView` and dispatches up to two
transactions (the cross-list-type case lifts then wraps in separate
dispatches). This violates the command contract of §6 and
`EditorCommands.spec.md` §1.5/§1.7. The refactor rewrites it to:

```typescript
export function toggleList(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  listType?: NodeType,
): boolean;
```

— pure `(state, dispatch?)`, single transaction (compose the lift+wrap into one
`state.tr`), no `EditorView`. The lists group's `run(view)` adapter then calls
`toggleList(view.state, view.dispatch, listType)` and `view.focus()`. (Per §6,
the pure command ultimately lives in `@metanorma/editor-commands`; the toolbar
adapter stays in `prosemirror-editor`.)

#### 5.5.8 Behavioural invariants the refactor must preserve

These are testable properties that must hold before and after the refactor:

1. **Same buttons.** The base toolbar renders the identical set of buttons
   (same labels, titles, keys, order) as today.
2. **Same active/enabled logic.** Each button's `isActive`/`isEnabled` returns
   the same boolean for the same `EditorState`.
3. **Same dispatch.** Each button's `run` dispatches the same command against
   the same state.
4. **Same DOM/CSS.** The rendered HTML and class names (`mn-toolbar*`) are
   unchanged.
5. **Same public API.** `MetanormaToolbar`, `MetanormaToolbarProps`,
   `ToolbarGroup`, and `toggleList` remain exported under those names.

### 5.6 The two assembler components (target)

With the primitives and registry in place after the refactor, both components
become thin:

```typescript
// MetanormaToolbar.tsx — refactored; public API unchanged
export function MetanormaToolbar({
  visibleGroups, className, onLinkPrompt,
}: MetanormaToolbarProps): React.JSX.Element {
  const groups = useMemo(
    () => baseGroups(onLinkPrompt ?? defaultLinkPrompt),
    [onLinkPrompt],
  );
  return (
    <Toolbar
      groups={groups}
      visibleGroups={visibleGroups}
      className={className}
    />
  );
}
```

```typescript
// AdvancedMetanormaToolbar.tsx — new
export function AdvancedMetanormaToolbar({
  visibleGroups, className, onLinkPrompt, ...featureOpts,
}: AdvancedMetanormaToolbarProps): React.JSX.Element {
  const base = useMemo(() => baseGroups(onLinkPrompt), [onLinkPrompt]);
  const advanced = useMemo(
    () => buildAdvancedGroups(featureOpts),
    [featureOpts],
  );
  const groups = useMemo(() => [...base, ...advanced], [base, advanced]);
  return (
    <Toolbar
      groups={groups}
      visibleGroups={visibleGroups}
      className={className ?? "mn-toolbar mn-toolbar--advanced"}
    />
  );
}
```

The base functionality is shared — `baseGroups` and `<Toolbar>` are the very
same modules used by `MetanormaToolbar`. There is no second copy of the
mark/block/list/link logic.

### 5.7 `AdvancedMetanormaToolbarProps`

The advanced component accepts everything the base does, plus the
feature-specific hooks called out across this directory. Each hook threads to
exactly one advanced group factory:

```typescript
export interface AdvancedMetanormaToolbarProps {
  /** Show/hide any group (base ids + advanced ids). Omitted ⇒ shown. */
  readonly visibleGroups?: Readonly<Partial<Record<AdvancedToolbarGroup, boolean>>>;
  readonly className?: string;

  // — link group (base), upgraded prompt hook (MetanormaToolbar.spec.md §6) —
  readonly onLinkPrompt?: () => Promise<string | null>;

  // — images group (images-figures.md) —
  readonly onImageUpload?: (file: File) => Promise<string>;
  readonly onImagePrompt?: () => Promise<{ src: string; alt: string | null } | null>;

  // — refs group (reference-marks.md) —
  readonly onXrefPrompt?: () => Promise<string | null>;
  readonly onErefPrompt?: () => Promise<string | null>;
  readonly onConceptPrompt?: () => Promise<string | null>;
  /** Allowed BCP14 keywords; defaults to a standard RFC 2119 list. */
  readonly bcp14Keywords?: readonly string[];

  // — history group (undo-redo.md) —
  readonly history?: HistoryOptions | false;
}
```

Prop coverage map:

| Prop | Consumed by | Default |
|---|---|---|
| `onLinkPrompt` | `linkGroup` (upgrades `window.prompt`) | `window.prompt` |
| `onImageUpload` | `imagesGroup` | `URL.createObjectURL` (local-only caveat) |
| `onImagePrompt` | `imagesGroup` | built-in `ImageInsertDialog` |
| `onXrefPrompt` / `onErefPrompt` / `onConceptPrompt` | `refsGroup` | `window.prompt` / doc-id picker |
| `bcp14Keywords` | `refsGroup` (BCP14 menu) | `["MUST", …]` (RFC 2119) |
| `history` | `historyGroup` + editor state | enabled, `newGroupDelay: 500` |

### 5.8 Unified group-id type

The base spec defines a closed `ToolbarGroup` union (`'marks' | 'blocks' |
'lists' | 'link'`). Several feature docs each independently *extended* that
union with only their own addition. This section **supersedes** those
per-document extensions with a single authoritative type:

```typescript
/** Base group ids (from MetanormaToolbar.spec.md). */
export type BaseToolbarGroup = "marks" | "blocks" | "lists" | "link";

/** Advanced group ids (one per document in this directory). */
export type AdvancedToolbarGroupId =
  | "tables" | "images" | "sections" | "refs" | "dl" | "history";

/** Union used by AdvancedMetanormaToolbarProps.visibleGroups. */
export type AdvancedToolbarGroup = BaseToolbarGroup | AdvancedToolbarGroupId;
```

`MetanormaToolbar` keeps its narrower `ToolbarGroup` (= `BaseToolbarGroup`)
so the base component's public type is unaffected; `AdvancedMetanormaToolbar`
uses the widened `AdvancedToolbarGroup`. The `<Toolbar>` shell is generic over
the id type (it only requires `string` ids), so it serves both without change.

> **Reconciliation note:** where an individual feature doc shows its own
> `export type ToolbarGroup = …` extension of the base union, treat those as
> illustrative. The consolidated type above is the one to implement, and the
> advanced group ids are fixed by the table in §5.4.

### 5.9 Render order

Left-to-right (dividers between groups):

```
marks · blocks · lists · link · refs · sections · dl · tables · images · history
└──── base (MetanormaToolbar) ────┘   └──────── advanced (this spec) ────────┘
```

- `refs` immediately follows `link` (both are inline-attachment operations).
- `history` is rightmost, per `undo-redo.md` §8.
- The order is just the default `groups` array; hosts can reorder by passing a
  custom `groups` prop directly to `<Toolbar>` if a lower-level API is exposed.

### 5.10 File structure (consolidated)

Pure command logic lives in `@metanorma/editor-commands`; the React toolbar,
view adapters, popovers, and keymap plugins live in `@metanorma/prosemirror-editor`.
This split mirrors the layering rule in `docs/EditorCommands.spec.md` §1.2–1.3
(see §6 below). Items marked **[exists]** are present in the current
codebase; items marked **[refactor]** are created by the §5.5 refactor; items
marked **[new]** are advanced-feature additions.

```
pkg/editor-commands/src/                  ← pure commands (no React, no DOM, no EditorView)
  commands/
    insertTable.ts                        ← insertTable(state, dispatch?, rows, cols), canInsertTable  [new]
    insertImage.ts                        ← insertImage(state, dispatch?, attrs), canInsertFigure      [new]
    sections.ts                           ← wrapInClause, promoteClause, demoteClause, setSectionType  [new]
    referenceMarks.ts                     ← applyReferenceMark, toggleXref/Eref/Concept/Bcp14/Footnote/Stem  [new]
    definitionList.ts                     ← insertDefinitionList, addDefinitionPair (+ helpers)         [new]
    toggleList.ts                         ← toggleList (pure Command)                                     [refactor: from prosemirror-editor]
    history.ts                            ← undo, redo (re-exports of prosemirror-history)               [new]
  util.ts                                 ← chainCommands, generateId, shared predicates [new]
  schema.ts                               ← name-resolution helpers (NODE_NAMES / MARK_NAMES)             [new]
  index.ts                                ← public command exports                                        [new]

pkg/prosemirror-editor/src/
  toolbar/
    types.ts                              ← ToolbarButton, ToolbarEntry, ToolbarGroupDef,                 [refactor: extracted from MetanormaToolbar.tsx]
                                          ←   BaseToolbarGroup, AdvancedToolbarGroup
    Toolbar.tsx                           ← shared shell (renders groups + dividers)                      [refactor: extracted from MetanormaToolbar.tsx render body]
    ToolbarButtonView.tsx                 ← renders one ToolbarButton descriptor                          [refactor: extracted from MetanormaToolbar.tsx:283]
    predicates.ts                         ← shared state predicates + requireMark/requireNode             [refactor: extracted from MetanormaToolbar.tsx]
    groups/
      marksGroup.tsx                      ← base group                                                    [refactor: extracted from buildButtons()]
      blocksGroup.tsx                     ← base group                                                    [refactor]
      listsGroup.tsx                      ← base group                                                    [refactor]
      linkGroup.tsx                       ← base group (parameterised by onLinkPrompt)                    [refactor]
      tablesGroup.tsx                     ← stateful: TableSizePicker + view adapter                      [new]
      imagesGroup.tsx                     ← stateful: ImageInsertDialog + view adapter                    [new]
      sectionsGroup.tsx                   ← view adapter over editor-commands                             [new]
      refsGroup.tsx                       ← stateful: popovers + view adapter                             [new]
      definitionListGroup.tsx             ← view adapter over editor-commands                             [new]
      historyGroup.tsx                    ← view adapter over editor-commands                             [new]
      index.ts                            ← baseGroups, buildAdvancedGroups                               [refactor + new]
    TableSizePicker.tsx                   ← grid-picker popover UI                                        [new]
    ImageInsertDialog.tsx                 ← URL/upload dialog UI                                          [new]
  plugins/
    definitionListKeymap.ts               ← Enter/Backspace keymap (UI-layer plugin)                      [new]
  MetanormaToolbar.tsx                    ← thin assembler (was monolith)                                 [refactor: §5.5]
  AdvancedMetanormaToolbar.tsx            ← thin assembler                                                [new]
  toolbar.css                             ← shared styles (mn-toolbar*)                                   [exists]
  index.ts                                ← re-exports commands + UI components (§5.11)                    [refactor: add exports]
```

### 5.11 Export changes (consolidated)

Pure commands are exported from `@metanorma/editor-commands` and re-exported
through `@metanorma/prosemirror-editor` for one-stop toolbar imports. This
supersedes the per-document export proposals, which are consolidated here.

```typescript
// ── pkg/editor-commands/src/index.ts ── pure commands (no React, no DOM) ──

// Each command conforms to Command = (state, dispatch?) => boolean
// (or (schema) => Command factory form — see §6).
export { insertTable, canInsertTable } from "./commands/insertTable.js";
export { insertImage, canInsertFigure } from "./commands/insertImage.js";
export {
  wrapInClause, promoteClause, demoteClause, setSectionType,
} from "./commands/sections.js";
export {
  applyReferenceMark,
  toggleXref, toggleEref, toggleConcept, toggleBcp14, toggleFootnote, toggleStem,
} from "./commands/referenceMarks.js";
export {
  insertDefinitionList, addDefinitionPair,
} from "./commands/definitionList.js";
export { toggleList } from "./commands/toggleList.js";
export { undo, redo } from "./commands/history.js";
export { chainCommands, generateId } from "./util.js";


// ── pkg/prosemirror-editor/src/index.ts ── React editor + toolbar ──

// Base toolbar (unchanged public surface from MetanormaToolbar.spec.md)
export { MetanormaToolbar } from "./MetanormaToolbar.js";
export type { MetanormaToolbarProps, ToolbarGroup } from "./MetanormaToolbar.js";

// Advanced toolbar
export { AdvancedMetanormaToolbar } from "./AdvancedMetanormaToolbar.js";
export type { AdvancedMetanormaToolbarProps, AdvancedToolbarGroup } from "./AdvancedMetanormaToolbar.js";

// Shared primitives — internal for now (not exported from index.ts).
// Consumers use the two assembler components below.
// (Internals: toolbar/Toolbar.tsx, toolbar/ToolbarButtonView.tsx,
//  toolbar/types.ts, toolbar/groups/index.ts.)

// Stateful UI components (view adapters + popovers/dialogs)
export { TableSizePicker } from "./toolbar/TableSizePicker.js";
export { ImageInsertDialog } from "./toolbar/ImageInsertDialog.js";

// Re-export pure commands for one-stop imports (sourced from editor-commands)
export {
  insertTable, canInsertTable,
  insertImage, canInsertFigure,
  wrapInClause, promoteClause, demoteClause, setSectionType,
  applyReferenceMark,
  toggleXref, toggleEref, toggleConcept, toggleBcp14, toggleFootnote, toggleStem,
  insertDefinitionList, addDefinitionPair,
  toggleList,
  undo, redo,
} from "@metanorma/editor-commands";
```

### 5.12 Alternatives considered

| Approach | Verdict |
|---|---|
| **A. `AdvancedMetanormaToolbar` renders `<MetanormaToolbar />` then appends groups** | ✗ Rejected. Produces two `.mn-toolbar` roots (double border/padding), two independent `visibleGroups` props that can't span the whole, and no way to interleave/reorder base and advanced groups. Also can't share a single ordered group list. |
| **B. Copy the base groups into the advanced component** | ✗ Rejected. Violates the no-duplication goal; mark/list/link logic would drift between the two components. |
| **C. Shared shell + group registry (§5.2), via the §5.5 refactor** | ✓ **Recommended.** Base groups and the rendering machinery live once; both components are thin assemblers. The existing `MetanormaToolbar` monolith is refactored (§5.5) to extract its primitives into shared modules; its public API is preserved throughout. |

### 5.13 Potential further developments

- **`floating_title` overlap.** The `sections` group inserts `clause` headings;
  the schema also has a standalone `floating_title` block node. Decide whether
  heading creation should ever produce a `floating_title` instead of a clause
  `title` attr (see `sections.md` open questions).

> **Resolved decisions.** `<Toolbar>`, `ToolbarGroupDef`, and the group
> registry are kept **internal** for now (not part of the public API surface
> exported from `index.ts`); only the two assembler components
> (`MetanormaToolbar`, `AdvancedMetanormaToolbar`) and their props/types are
> exported. Stateful `control` entries render an opaque `ReactNode` for now (a
> common `disabled`-contract interface may come later). Feature-callback
> threading is done via direct props on `AdvancedMetanormaToolbarProps` for now
> (a per-group props map may come later). History is **opt-in**, not
> default-on (see `undo-redo.md` §4.1).

## 6. Command layering (alignment with `EditorCommands.spec.md`)

The feature documents in this directory each propose editor commands. Those
proposals must conform to the command contract defined in
[`docs/EditorCommands.spec.md`](../EditorCommands.spec.md), which governs how
*all* Metanorma editor commands are structured. This section states the rules
every feature document's command sections must honour, and is normative for
the per-document command proposals (where they conflict, this section wins).

### 6.1 The layering rule

Command logic is split across two packages by responsibility:

```
@metanorma/prosemirror-schema          ← node/mark vocabulary (source of truth)
        ▲
        │
@metanorma/editor-commands            ← PURE command logic (this section's target)
        ▲                              · (state, dispatch?) => boolean
        │                              · no React, no DOM, no EditorView
        │ (view adapters + UI call the pure commands)
@metanorma/prosemirror-editor          ← React toolbar, popovers, keymaps
```

| Concern | Package | What lives here |
|---|---|---|
| **Pure command logic** | `@metanorma/editor-commands` (`pkg/editor-commands/src/commands/`) | `(state, dispatch?) => boolean` functions; schema-coupling helpers; predicates; the `chainCommands` combinator. |
| **View adapters & UI** | `@metanorma/prosemirror-editor` (`pkg/prosemirror-editor/src/`) | The toolbar `run(view)` callbacks that extract `view.state`/`view.dispatch`, call a pure command, then optionally `view.focus()`; popover/dialog components; keymap plugins. |

**No pure command imports `prosemirror-view`, `React`, or touches the DOM.**
This guarantees every command is headless-testable
(`EditorCommands.spec.md` §1.8) and usable from keymaps, menus, and toolbars
alike.

### 6.2 Command contract

Every command proposed in a feature document must conform to ProseMirror's
`Command` type and the invariants in `EditorCommands.spec.md` §1.5:

```typescript
import type { Command } from "prosemirror-state";
// Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean
```

1. **Predicate when queried.** Called without `dispatch`, a command returns
   `true` iff it *would* apply, and mutates nothing (query/dispatch parity).
2. **Effect when dispatched.** Called with `dispatch` and applicable, it builds
   **exactly one** transaction, calls `dispatch(tr)` **once**, returns `true`.
3. **No-when-inapplicable.** Returns `false` and dispatches nothing when not
   applicable — whether or not `dispatch` is supplied.
4. **Non-throwing.** Never throws on a well-formed `EditorState` over
   `metanormaSchema`; reports failure by returning `false`.
5. **Selection-aware.** Behaviour follows `state.selection`.

> **Toolbar `run(view)` is an adapter, not a command.** The `ToolbarButton.run`
> field receives an `EditorView` (§2.3), but it is *not* itself a command. It
> must extract `view.state`/`view.dispatch`, delegate to a pure command, and
> then call `view.focus()` if appropriate. The `EditorView` never crosses into
> `@metanorma/editor-commands`.

### 6.3 Transaction discipline

When a command dispatches, its single transaction obeys
(`EditorCommands.spec.md` §1.7):

- One `state.tr`, dispatched exactly once.
- Sets a valid resulting selection (`TextSelection.near` / `NodeSelection`).
- Calls `tr.scrollIntoView()` for user-initiated commands.
- Preserves active marks across splits/inserts.
- Replaces ranged selections before structural steps.

### 6.4 Schema coupling

- **Resolve by name.** Node/mark types are resolved through a `Schema` instance
  using names drawn from `NODE_NAMES` / `MARK_NAMES`
  (`EditorCommands.spec.md` §1.6.1) — no bare, unchecked `schema.nodes.<lit>`.
- **Factory form.** Commands likely to be reused on a composed schema are
  exposed as `(schema) => Command` factories; commands intrinsically specific
  to the Metanorma vocabulary may bind `metanormaSchema` directly
  (§1.6.2). Each feature document states which form its commands take.
- **Rely on schema defaults.** When creating nodes, omit unset attrs rather
  than constructing explicit `null`/`{}`, so `data` and defaults are preserved.

### 6.5 Naming and exports

- Commands are named for the **action** (`insertTable`, `wrapInClause`), never
  the trigger (no `onInsertTable`, no `enterKey`) — `EditorCommands.spec.md`
  §1.10.2.
- No redundant `Command` suffix (`undo`, not `undoCommand`).
- Pure commands export from `@metanorma/editor-commands`; the editor package
  re-exports them for convenience (§5.10).

### 6.6 Async and stateful controls

Three feature areas — tables (`tables.md`), images (`images-figures.md`), and
reference-mark popovers (`reference-marks.md`) — need *interaction before
dispatch*: picking grid dimensions, resolving a URL or uploading a file,
collecting a target/type. This interaction is a **UI concern**, not a command
concern. The boundary is:

- The **pure command** takes already-resolved inputs (`rows, cols`; `{src,
  alt}`; `{target}`) and is fully synchronous, pure, and headless-testable.
- The **UI layer** (a React component in `prosemirror-editor`) owns the
  stateful/async flow — opening a popover, resolving a `Promise`, reading a
  `File` — and is the only code that touches `EditorView`, `window`, or async.

Concretely, the "gather inputs → validate → dispatch" flow is split as:

```
React control (UI layer, prosemirror-editor)
  ├─ open popover / await upload / await prompt   ← stateful, async, touches view
  └─ on commit:
       pureCommand(view.state, view.dispatch, resolvedInputs)   ← pure
       view.focus()                                              ← UI concern
```

This satisfies `EditorCommands.spec.md` §1.8 (purity) without losing the UX:
"gathering inputs" is UI; "apply the resolved edit" is a command.

### 6.7 Per-feature summary

| Feature doc | Pure command(s) → `editor-commands` | UI / view adapter → `prosemirror-editor` |
|---|---|---|
| `tables.md` | `insertTable(state, dispatch?, rows, cols)`; `canInsertTable(state)` is the predicate form | `TableSizePicker.tsx` (popover) + toolbar `run` adapter |
| `images-figures.md` | `insertImage(state, dispatch?, attrs)`; `canInsertFigure(state)` predicate | `ImageInsertDialog.tsx` (URL/upload) + toolbar `run` adapter |
| `sections.md` | `wrapInClause`, `promoteClause`, `demoteClause`, `setSectionType` (+ legality helpers) | toolbar `run` adapter (no view-taking overloads) |
| `reference-marks.md` | `applyReferenceMark`, `toggleXref/Eref/Concept/Bcp14/Footnote/Stem` | per-mark popover/prompt UI + toolbar `run` adapter |
| `definition-lists.md` | `insertDefinitionList`, `addDefinitionPair` (pure `Command` only; no `(view)` overload) | `definitionListKeymap.ts` plugin + toolbar `run` adapter |
| `undo-redo.md` | `undo`, `redo` (re-exported from `prosemirror-history`, standard names) | toolbar `run` adapter; history plugin wiring in `state.ts` |
