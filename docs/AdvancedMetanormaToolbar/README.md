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
| Package | `@metanorma/prosemirror-editor` |
| Schema package | `@metanorma/prosemirror-schema` |
| Source root | `pkg/prosemirror-editor/src/` |
| Toolbar stylesheet | `toolbar.css` (class prefix `mn-toolbar`) |
| Commands subdirectory | `pkg/prosemirror-editor/src/commands/` |

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
six advanced groups specified in this directory. This section defines how the
two components share the base functionality **without duplicating it**.

### 5.1 Design goal and constraint

- **No duplication.** The mark/block/list/link button definitions and the
  rendering machinery must exist in exactly one place, used by both toolbars.
- **No behavioural divergence.** Clicking *Bold* in `AdvancedMetanormaToolbar`
  must dispatch the identical `toggleMark(schema.marks.strong)` command, with
  the identical active/enabled detection, as in `MetanormaToolbar`.
- **Additive only.** Advanced features are *new groups* appended after the base
  groups; they must not alter base-group behaviour.

Because `MetanormaToolbar` is specified but **not yet implemented**, we are free
to choose an implementation shape that makes sharing trivial from the start
(rather than refactoring an existing component).

### 5.2 Recommended approach: shared shell + group registry

Split the toolbar into three layers:

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

### 5.3 Shared primitives

#### 5.3.1 Entry model

Most toolbar controls are plain data (`ToolbarButton` from §2.3). A few
advanced controls are inherently **stateful** — the table grid-picker popover
(`tables.md`), the image insert dialog (`images-figures.md`), and the
reference-mark popovers (`reference-marks.md`) — and cannot be expressed by a
single `run(view)` callback. The entry model accommodates both:

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

`<ToolbarButtonView>` subscribes to `useEditorStateSelector` for active/enabled
state and dispatches via `useEditorEventCallback` — exactly the wiring described
in `MetanormaToolbar.spec.md` §7. A `control` entry renders its own React node
(which internally uses the same hooks).

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
and inserts a `.mn-toolbar-divider` between visible groups. For each entry it
renders `<ToolbarButtonView>` (for `kind: "button"`) or the control's node (for
`kind: "control"`). It reuses the `mn-toolbar*` CSS classes from
`MetanormaToolbar.spec.md` §8 unchanged.

### 5.4 Group registry

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
callbacks (see §5.6).

### 5.5 The two assembler components

With the primitives and registry in place, both components become thin:

```typescript
// MetanormaToolbar.tsx — unchanged public API from MetanormaToolbar.spec.md
export function MetanormaToolbar({
  visibleGroups, className,
}: MetanormaToolbarProps): React.JSX.Element {
  return (
    <Toolbar
      groups={baseGroups}
      visibleGroups={visibleGroups}
      className={className}
    />
  );
}
```

```typescript
// AdvancedMetanormaToolbar.tsx
export function AdvancedMetanormaToolbar({
  visibleGroups, className, ...featureOpts,
}: AdvancedMetanormaToolbarProps): React.JSX.Element {
  const groups = useMemo(
    () => [...baseGroups, ...buildAdvancedGroups(featureOpts)],
    [featureOpts],
  );
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

### 5.6 `AdvancedMetanormaToolbarProps`

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

### 5.7 Unified group-id type

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

### 5.8 Render order

Left-to-right (dividers between groups):

```
marks · blocks · lists · link · refs · sections · dl · tables · images · history
└──── base (MetanormaToolbar) ────┘   └──────── advanced (this spec) ────────┘
```

- `refs` immediately follows `link` (both are inline-attachment operations).
- `history` is rightmost, per `undo-redo.md` §8.
- The order is just the default `groups` array; hosts can reorder by passing a
  custom `groups` prop directly to `<Toolbar>` if a lower-level API is exposed.

### 5.9 File structure (consolidated)

```
pkg/prosemirror-editor/src/
  toolbar/
    Toolbar.tsx                   ← shared shell (renders groups + dividers)
    ToolbarButtonView.tsx         ← renders one ToolbarButton descriptor
    types.ts                      ← ToolbarButton, ToolbarEntry, ToolbarGroupDef,
                                    BaseToolbarGroup, AdvancedToolbarGroup
    groups/
      marksGroup.tsx              ┐
      blocksGroup.tsx             │ base groups (shared)
      listsGroup.tsx              │
      linkGroup.tsx               ┘
      tablesGroup.tsx             ┐
      imagesGroup.tsx             │
      sectionsGroup.tsx           │ advanced groups
      refsGroup.tsx               │
      definitionListGroup.tsx     │
      historyGroup.tsx            ┘
      index.ts                    ← baseGroups, buildAdvancedGroups
  commands/                       ← command helpers (per feature docs)
    toggleList.ts  insertTable.ts  insertImage.ts  sections.ts
    referenceMarks.ts  definitionList.ts  history.ts
  MetanormaToolbar.tsx            ← thin: <Toolbar groups={baseGroups} …/>
  AdvancedMetanormaToolbar.tsx    ← thin: <Toolbar groups={base+advanced} …/>
  toolbar.css                     ← shared styles (mn-toolbar*)
  index.ts                        ← add exports (§5.10)
```

### 5.10 Export changes (consolidated)

`pkg/prosemirror-editor/src/index.ts` adds — superseding the per-document
export proposals, which are consolidated here:

```typescript
// Base toolbar (unchanged surface from MetanormaToolbar.spec.md)
export { MetanormaToolbar } from "./MetanormaToolbar.js";
export type { MetanormaToolbarProps, ToolbarGroup } from "./MetanormaToolbar.js";

// Advanced toolbar
export { AdvancedMetanormaToolbar } from "./AdvancedMetanormaToolbar.js";
export type { AdvancedMetanormaToolbarProps, AdvancedToolbarGroup } from "./AdvancedMetanormaToolbar.js";

// Shared primitives (for consumers composing a custom toolbar)
export { Toolbar } from "./toolbar/Toolbar.js";
export type { ToolbarProps, ToolbarGroupDef, ToolbarEntry, ToolbarButton } from "./toolbar/types.js";
export { baseGroups, buildAdvancedGroups } from "./toolbar/groups/index.js";

// Command helpers (one per feature doc)
export { toggleList } from "./commands/toggleList.js";
export { insertTable } from "./commands/insertTable.js";
export { insertImage } from "./commands/insertImage.js";
export { wrapInClause, promoteClause, demoteClause, setSectionType } from "./commands/sections.js";
export { applyReferenceMark } from "./commands/referenceMarks.js";
export { insertDefinitionList, addDefinitionPair } from "./commands/definitionList.js";
export { undo, redo } from "./commands/history.js";
```

### 5.11 Alternatives considered

| Approach | Verdict |
|---|---|
| **A. `AdvancedMetanormaToolbar` renders `<MetanormaToolbar />` then appends groups** | ✗ Rejected. Produces two `.mn-toolbar` roots (double border/padding), two independent `visibleGroups` props that can't span the whole, and no way to interleave/reorder base and advanced groups. Also can't share a single ordered group list. |
| **B. Copy the base groups into the advanced component** | ✗ Rejected. Violates the no-duplication goal; mark/list/link logic would drift between the two components. |
| **C. Shared shell + group registry (§5.2)** | ✓ **Recommended.** Base groups and the rendering machinery live once; both components are thin assemblers. Since `MetanormaToolbar` is not yet implemented, this is free to adopt now. |

### 5.12 Open questions

- **Should `<Toolbar>` be a public primitive?** Exposing it (§5.10) lets hosts
  build fully custom toolbars from the registry, but expands the public API
  surface. Alternatively keep it internal and expose only the two assembler
  components.
- **Stateful-control ergonomics.** The `kind: "control"` entry renders an
  opaque `ReactNode`. Should controls instead implement a common
  `ToolbarControlComponent` interface (e.g. with a uniform `disabled` contract)
  so the shell can apply `.mn-toolbar-btn--disabled` consistently?
- **Prop threading scale.** As more features gain prompt/upload hooks,
  `AdvancedMetanormaToolbarProps` grows. Consider grouping callbacks under a
  single `features?: { image?: …, refs?: … }` object, or letting hosts pass a
  per-group props map.
- **History default.** `undo-redo.md` proposes enabling the history plugin by
  default in `createInitialEditorState`. That affects *all* editors, not just
  those using the advanced toolbar — needs a decision on opt-in vs default-on
  (see that doc's open questions).
- **`floating_title` overlap.** The `sections` group inserts `clause` headings;
  the schema also has a standalone `floating_title` block node. Decide whether
  heading creation should ever produce a `floating_title` instead of a clause
  `title` attr (see `sections.md` open questions).
