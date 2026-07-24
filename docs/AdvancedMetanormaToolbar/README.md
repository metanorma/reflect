# AdvancedMetanormaToolbar — Feature Specifications

**Spec version:** 1
**Spec dependencies:** [`../MetanormaToolbar.spec.md`](../MetanormaToolbar.spec.md) v2, [`../EditorCommands.spec.md`](../EditorCommands.spec.md) v1

This directory contains the feature specifications for **`AdvancedMetanormaToolbar`**,
an extended version of the `MetanormaToolbar` component specified in
[`../MetanormaToolbar.spec.md`](../MetanormaToolbar.spec.md).

## 1. Relationship to `MetanormaToolbar`

`MetanormaToolbar` covers the core inline-marks, block-wrapping, list, and
hyperlink operations. Its §5.5 ("Out of scope") enumerates six feature areas
that are intentionally deferred. `AdvancedMetanormaToolbar` is the component
that picks up exactly those six areas — it does **not** rehash the contents of
`MetanormaToolbar.spec.md`.

As of `MetanormaToolbar.spec.md` v2, the base component is a **thin assembler**
over a set of shared toolbar primitives — a generic `<Toolbar>` shell, a
`<ToolbarButtonView>` renderer, a `baseGroups` registry, and supporting types
(base spec §10). `AdvancedMetanormaToolbar` composes with that architecture by
appending its own groups after the four base groups, reusing the shell and
rendering primitives without duplication. The base spec also owns the
migration narrative for bringing a legacy monolith into that shape (base spec
§11); this spec does not reiterate that material.

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
| Source root | `pkg/prosemirror-editor/` (UI); `pkg/editor-commands/` (pure commands) |
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
| [`reference-marks.md`](./reference-marks.md) | `xref`, `eref`, `concept`, `bcp14` marks + `footnote_marker`, `stem` inline nodes | "Reference marks" |
| [`definition-lists.md`](./definition-lists.md) | `dl`/`dt`/`dd` insertion logic | "Definition lists" |
| [`undo-redo.md`](./undo-redo.md) | Undo/redo via `prosemirror-history` | "Undo / redo" |

## 4. Schema reference (shared)

All features target the single `metanormaSchema` exported from
`@metanorma/prosemirror-schema`. Key node and mark definitions relevant across
features are summarized below; consult `pkg/prosemirror-schema/nodes.ts`
and `marks.ts` for full specs.

### 4.1 Groups

| Group constant | Value | Members (excerpt) |
|---|---|---|
| `INLINE_GROUP` | `"inline"` | `text`, `footnote_marker`, `stem` |
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

`AdvancedMetanormaToolbar` is a **superset** of `MetanormaToolbar`: it renders
every group the base toolbar renders (the `marks`, `blocks`, `lists`, and
`link` groups from `MetanormaToolbar.spec.md` §5.1–5.4) **plus** the six
advanced groups specified in this directory.

`MetanormaToolbar.spec.md` v2 already specifies the shared architecture that
makes this possible — the `<Toolbar>` shell, `<ToolbarButtonView>`, the
`ToolbarButton` / `ToolbarEntry` / `ToolbarGroupDef` types, and the
`baseGroups` registry live in `pkg/prosemirror-editor/toolbar/` (base spec §10).
This section defines only how `AdvancedMetanormaToolbar` **extends** that
architecture: which advanced groups it adds, the props it accepts, the
widened group-id type, and the file / export surface for the advanced
additions. It does not re-specify the shared primitives — consult base spec §10
for those.

### 5.1 Composition model

The advanced component is a thin assembler over the same `<Toolbar>` shell the
base component uses (base spec §10.4). It spreads the four base groups
(produced by the shared `baseGroups` factory, base spec §10.6) followed by the
six advanced groups (produced by `buildAdvancedGroups`, §5.1.2 below), and
passes the combined array to `<Toolbar>`:

```typescript
// AdvancedMetanormaToolbar.tsx
export function AdvancedMetanormaToolbar({
  visibleGroups, className, onLinkPrompt, ...featureOpts,
}: AdvancedMetanormaToolbarProps): React.JSX.Element {
  const base = useMemo(() => baseGroups(onLinkPrompt ?? defaultLinkPrompt), [onLinkPrompt]);
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

#### 5.1.1 Advanced group modules

Each advanced group is defined in its own module under `toolbar/groups/`,
alongside the four base group modules:

| Module | Group id | Spec source |
|---|---|---|
| `tablesGroup.tsx` | `tables` | [`tables.md`](./tables.md) |
| `imagesGroup.tsx` | `images` | [`images-figures.md`](./images-figures.md) |
| `sectionsGroup.tsx` | `sections` | [`sections.md`](./sections.md) |
| `refsGroup.tsx` | `refs` | [`reference-marks.md`](./reference-marks.md) |
| `definitionListGroup.tsx` | `dl` | [`definition-lists.md`](./definition-lists.md) |
| `historyGroup.tsx` | `history` | [`undo-redo.md`](./undo-redo.md) |

The four base group modules (`marksGroup`, `blocksGroup`, `listsGroup`,
`linkGroup`) are specified by `MetanormaToolbar.spec.md` §10.6 and are not
repeated here.

#### 5.1.2 The `buildAdvancedGroups` factory

A barrel (`toolbar/groups/index.ts`) exports the shared `baseGroups` factory
(base spec §10.6) alongside a `buildAdvancedGroups` factory that produces the
six advanced groups:

```typescript
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

The advanced groups are produced by a factory (unlike the static base groups)
because several need feature-specific callbacks (see §5.2). Three of the six
advanced groups contain **stateful** controls (`tables`, `images`, `refs`) that
use the `ToolbarControlEntry` variant of `ToolbarEntry` (base spec §10.2); the
other three (`sections`, `dl`, `history`) contain only plain
`ToolbarButtonEntry` buttons.

### 5.2 `AdvancedMetanormaToolbarProps`

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
  /** Resolve a BCP14 keyword (free text). Default: window.prompt. */
  readonly onBcp14Prompt?: () => Promise<string | null>;
  /** Resolve a footnote entry id (optionally create). Default: generate. */
  readonly onFootnotePrompt?: () => Promise<string | null>;
  /** Resolve a stem formula (notation + source). Default: minimal popover. */
  readonly onStemPrompt?: () => Promise<{ type: "asciimath" | "mathml"; source: string } | null>;

  // — history group (undo-redo.md) —
  readonly history?: HistoryOptions | false;
}
```

Prop coverage map:

| Prop | Consumed by | Default |
|---|---|---|
| `onLinkPrompt` | `linkGroup` (upgrades `window.prompt`) | `window.prompt` |
| `onImageUpload` | `imagesGroup` | none (absent ⇒ `FileReader.readAsDataURL` data: URL) |
| `onImagePrompt` | `imagesGroup` | built-in `ImageInsertDialog` |
| `onXrefPrompt` / `onErefPrompt` / `onConceptPrompt` | `refsGroup` | `window.prompt` / doc-id picker |
| `onBcp14Prompt` | `refsGroup` (BCP14 keyword) | `window.prompt` (free text) |
| `onFootnotePrompt` | `refsGroup` (footnote id) | generate id |
| `onStemPrompt` | `refsGroup` (formula) | built-in stem popover |
| `history` | `historyGroup` + editor state | enabled, `newGroupDelay: 500` |

### 5.3 Group-id types

`MetanormaToolbar.spec.md` §10.7 defines `BaseToolbarGroup` (the four base
ids) and notes that the `<Toolbar>` shell is generic over `string` ids. The
advanced component widens that union with its own six ids:

```typescript
/** Base group ids (from MetanormaToolbar.spec.md §10.7). */
export type BaseToolbarGroup = "marks" | "blocks" | "lists" | "link";

/** Advanced group ids (one per document in this directory). */
export type AdvancedToolbarGroupId =
  | "tables" | "images" | "sections" | "refs" | "dl" | "history";

/** Union used by AdvancedMetanormaToolbarProps.visibleGroups. */
export type AdvancedToolbarGroup = BaseToolbarGroup | AdvancedToolbarGroupId;
```

`MetanormaToolbar` keeps its narrower `ToolbarGroup` (= `BaseToolbarGroup`,
base spec §4.2) so the base component's public type is unaffected;
`AdvancedMetanormaToolbar` uses the widened `AdvancedToolbarGroup`. The
advanced group ids are fixed by the table in §5.1.1.

### 5.4 Render order

Left-to-right (dividers between groups):

```
marks · blocks · lists · link · refs · sections · dl · tables · images · history
└──── base (MetanormaToolbar) ────┘   └──────── advanced (this spec) ────────┘
```

- `refs` immediately follows `link` (both are inline-attachment operations).
- `history` is rightmost, per `undo-redo.md` §8.
- The order is just the default `groups` array; hosts can reorder by passing a
  custom `groups` prop directly to `<Toolbar>` if a lower-level API is exposed.

### 5.5 File structure (advanced additions)

Pure command logic lives in `@metanorma/editor-commands`; the React toolbar,
view adapters, popovers, and keymap plugins live in `@metanorma/prosemirror-editor`.
This split mirrors the layering rule in `docs/EditorCommands.spec.md` §1.2–1.3
(see §6 below). The listing below covers **only the advanced additions**; the
shared toolbar primitives (`toolbar/types.ts`, `toolbar/Toolbar.tsx`,
`toolbar/ToolbarButtonView.tsx`, `toolbar/predicates.ts`, the four base group
modules, `MetanormaToolbar.tsx`) are specified by `MetanormaToolbar.spec.md`
§13.

```
pkg/editor-commands/                  ← pure commands (no React, no DOM, no EditorView)
  commands/
    insertTable.ts                        ← insertTable(state, dispatch?, rows, cols), canInsertTable
    insertImage.ts                        ← insertImage(state, dispatch?, attrs), canInsertFigure
    sections.ts                           ← wrapInClause, promoteClause, demoteClause, setSectionType
    referenceMarks.ts                     ← applyReferenceMark, toggleXref/Eref/Concept/Bcp14, insertFootnoteMarker/insertStem
    definitionList.ts                     ← insertDefinitionList, addDefinitionPair (+ helpers)
    history.ts                            ← undo, redo (re-exports of prosemirror-history)
  util.ts                                 ← chainCommands, generateId, shared predicates
  schema.ts                               ← name-resolution helpers (NODE_NAMES / MARK_NAMES)
  index.ts                                ← public command exports

pkg/prosemirror-editor/
  toolbar/
    groups/
      tablesGroup.tsx                     ← stateful: TableSizePicker + view adapter
      imagesGroup.tsx                     ← stateful: ImageInsertDialog + view adapter
      sectionsGroup.tsx                   ← view adapter over editor-commands
      refsGroup.tsx                       ← stateful: popovers + view adapter
      definitionListGroup.tsx             ← view adapter over editor-commands
      historyGroup.tsx                    ← view adapter over editor-commands
      index.ts                            ← buildAdvancedGroups (+ baseGroups re-export from base spec)
    TableSizePicker.tsx                   ← grid-picker popover UI
    ImageInsertDialog.tsx                 ← URL/upload dialog UI
  plugins/
    definitionListKeymap.ts               ← Enter/Backspace keymap (UI-layer plugin)
  AdvancedMetanormaToolbar.tsx            ← thin assembler
  index.ts                                ← re-exports advanced commands + UI components (§5.6)
```

> The `toggleList` command already lives in `@metanorma/editor-commands` per
> base spec §5.3; it is listed in the consolidated export map in §5.6 for
> one-stop-import convenience.

### 5.6 Export changes

Pure commands are exported from `@metanorma/editor-commands` and re-exported
through `@metanorma/prosemirror-editor` for one-stop toolbar imports. The
listing below covers **only the advanced additions**; the base exports
(`MetanormaToolbar`, `MetanormaToolbarProps`, `ToolbarGroup`, `toggleList`)
are specified by `MetanormaToolbar.spec.md` §12.

```typescript
// ── pkg/editor-commands/index.ts ── pure commands (no React, no DOM) ──

// Each command conforms to Command = (state, dispatch?) => boolean
// (or (schema) => Command factory form — see §6).
export { insertTable, canInsertTable } from "./commands/insertTable.js";
export { insertImage, canInsertFigure } from "./commands/insertImage.js";
export {
  wrapInClause, promoteClause, demoteClause, setSectionType,
} from "./commands/sections.js";
export {
  applyReferenceMark,
  toggleXref, toggleEref, toggleConcept, toggleBcp14,
  insertFootnoteMarker, insertStem,
} from "./commands/referenceMarks.js";
export {
  insertDefinitionList, addDefinitionPair,
} from "./commands/definitionList.js";
export { toggleList } from "./commands/toggleList.js";
export { undo, redo } from "./commands/history.js";
export { chainCommands, generateId } from "./util.js";


// ── pkg/prosemirror-editor/index.ts ── React editor + toolbar ──

// Advanced toolbar
export { AdvancedMetanormaToolbar } from "./AdvancedMetanormaToolbar.js";
export type { AdvancedMetanormaToolbarProps, AdvancedToolbarGroup } from "./AdvancedMetanormaToolbar.js";

// Stateful UI components (view adapters + popovers/dialogs)
export { TableSizePicker } from "./toolbar/TableSizePicker.js";
export { ImageInsertDialog } from "./toolbar/ImageInsertDialog.js";

// Re-export pure commands for one-stop imports (sourced from editor-commands)
export {
  insertTable, canInsertTable,
  insertImage, canInsertFigure,
  wrapInClause, promoteClause, demoteClause, setSectionType,
  applyReferenceMark,
  toggleXref, toggleEref, toggleConcept, toggleBcp14,
  insertFootnoteMarker, insertStem,
  insertDefinitionList, addDefinitionPair,
  toggleList,
  undo, redo,
} from "@metanorma/editor-commands";
```

The shared toolbar internals — `toolbar/Toolbar.tsx`,
`toolbar/ToolbarButtonView.tsx`, `toolbar/types.ts`, `toolbar/predicates.ts`,
and the group modules — are intentionally internal (not exported from
`index.ts`), consistent with base spec §12. Consumers use the two assembler
components.

### 5.7 Alternatives considered

| Approach | Verdict |
|---|---|
| **A. `AdvancedMetanormaToolbar` renders `<MetanormaToolbar />` then appends groups** | ✗ Rejected. Produces two `.mn-toolbar` roots (double border/padding), two independent `visibleGroups` props that can't span the whole, and no way to interleave/reorder base and advanced groups. Also can't share a single ordered group list. |
| **B. Copy the base groups into the advanced component** | ✗ Rejected. Violates the no-duplication goal; mark/list/link logic would drift between the two components. |
| **C. Shared shell + group registry (§5.1)** | ✓ **Recommended.** Base groups and the rendering machinery live once (base spec §10); both components are thin assemblers over the same `<Toolbar>` shell. |

### 5.8 Potential further developments

- **`floating_title` insertion.** The `sections` group inserts only the ten
  `section`-group node types; the standalone `floating_title` block node (an
  unnumbered heading outside the section hierarchy) is not inserted by any
  current toolbar group. It is deferred to a future "block elements" toolbar
  group (see `sections.md` §2.2).

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
| **Pure command logic** | `@metanorma/editor-commands` (`pkg/editor-commands/commands/`) | `(state, dispatch?) => boolean` functions; schema-coupling helpers; predicates; the `chainCommands` combinator. |
| **View adapters & UI** | `@metanorma/prosemirror-editor` (`pkg/prosemirror-editor/`) | The toolbar `run(view)` callbacks that extract `view.state`/`view.dispatch`, call a pure command, then optionally `view.focus()`; popover/dialog components; keymap plugins. |

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

**Toolbar `run(view)` is an adapter, not a command.** The `ToolbarButton.run`
field receives an `EditorView` (§2.3), but it is *not* itself a command. It
must extract `view.state`/`view.dispatch`, delegate to a pure command, and
then call `view.focus()` if appropriate. The `EditorView` never crosses into
`@metanorma/editor-commands`.

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
  re-exports them for convenience (§5.6).

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
| `reference-marks.md` | `applyReferenceMark`, `toggleXref/Eref/Concept/Bcp14`, `insertFootnoteMarker`, `insertStem` | per-mark popover/prompt UI + toolbar `run` adapter |
| `definition-lists.md` | `insertDefinitionList`, `addDefinitionPair` (pure `Command` only; no `(view)` overload) | `definitionListKeymap.ts` plugin + toolbar `run` adapter |
| `undo-redo.md` | `undo`, `redo` (re-exported from `prosemirror-history`, standard names) | toolbar `run` adapter; history plugin wiring in `state.ts` |
