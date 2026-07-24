# MetanormaToolbar — Functional Specification

**Spec version:** 2
**Spec dependencies:** [`EditorCommands.spec.md`](./EditorCommands.spec.md) v1

## 1. Purpose

`MetanormaToolbar` is a schema-bound React toolbar component that gives the
user one-click access to the most common document-manipulation operations
(toggling inline marks, wrapping blocks, inserting lists, creating links)
against the Metanorma ProseMirror schema defined in `@metanorma/prosemirror-schema`.

The toolbar is designed to be passed as a **child** of `MetanormaProseMirror`,
placing it inside the `@handlewithcare/react-prosemirror` context. Through
that context it reads the current editor state and dispatches transactions —
**no props are required for state wiring**. The controlled-mode plumbing in
`MetanormaProseMirror` transparently propagates transactions back to the
host application's `onStateChange` handler.

As of spec version 2, `MetanormaToolbar` is a **thin assembler** over a set
of shared toolbar primitives (§10): it selects the four base groups
(`marks`, `blocks`, `lists`, `link`) and passes them to a generic `<Toolbar>`
shell. The same primitives are reused, without duplication, by
`AdvancedMetanormaToolbar` ([`AdvancedMetanormaToolbar/README.md`](./AdvancedMetanormaToolbar/README.md)),
which appends further groups after the base four. §11 describes the refactor
that brings an existing monolithic implementation into compliance with this
shape.

> **What changed in version 2.** The component was reshaped from a
> self-contained monolith into a thin assembler over shared primitives
> (§10); the button/predicate/render logic was extracted into a `toolbar/`
> module tree; and `toggleList` was rewritten as a pure
> `(state, dispatch?) => boolean` command and relocated to
> `@metanorma/editor-commands` (§5.3, §12). The public component API
> (`MetanormaToolbar`, `MetanormaToolbarProps`, `ToolbarGroup`) is unchanged.

## 2. Package and export

| Aspect | Value |
|---|---|
| Defined in | `@metanorma/prosemirror-editor` |
| Assembler source | `pkg/prosemirror-editor/MetanormaToolbar.tsx` |
| Shared primitives | `pkg/prosemirror-editor/toolbar/` (§10, §13) |
| Stylesheet | `pkg/prosemirror-editor/toolbar.css` (imported side-effect) |
| Exported from | `pkg/prosemirror-editor/index.ts` |
| Import name | `MetanormaToolbar` |

Rationale: the toolbar is schema-bound (it references specific `MarkType`
and `NodeType` objects from `metanormaSchema`) and editor-bound (it uses
`useEditorStateSelector` / `useEditorEventCallback` from
`@handlewithcare/react-prosemirror`). Both dependencies are already owned
by the `prosemirror-editor` package. The schema package (`prosemirror-schema`)
must remain a pure, framework-agnostic data layer.

## 3. Integration model

```tsx
import { MetanormaProseMirror, MetanormaToolbar } from '@metanorma/prosemirror-editor';

<MetanormaProseMirror state={editorState} onStateChange={setEditorState}>
  <MetanormaToolbar />
</MetanormaProseMirror>
```

The toolbar is rendered **inside** the `<ProseMirror>` context provider (as a
child of `MetanormaProseMirror`). This is critical: `useEditorStateSelector`
and `useEditorEventCallback` only work for descendants of `<ProseMirror>`.

When the toolbar dispatches a transaction (e.g. toggling bold), the flow is:

```
Toolbar button click
  → useEditorEventCallback callback fires with EditorView
  → view.dispatch(tr)
  → MetanormaProseMirror's dispatch_transaction handler
  → onStateChange(newState)
  → host app's setState
  → re-render with new state
```

## 4. Component API

### 4.1 Props

```typescript
export interface MetanormaToolbarProps {
  /**
   * Optionally show/hide entire groups. When omitted, all groups are shown.
   * Keys not present in the object default to `true`.
   */
  readonly visibleGroups?: Readonly<Partial<Record<ToolbarGroup, boolean>>>;

  /**
   * Class applied to the toolbar root <div>. Defaults to "mn-toolbar".
   */
  readonly className?: string;

  /** Optional custom link-URL prompt. Default: window.prompt (§6). */
  readonly onLinkPrompt?: () => Promise<string | null>;
}
```

### 4.2 Toolbar groups

```typescript
export type ToolbarGroup =
  | 'marks'      // inline formatting marks
  | 'blocks'     // block wrapping (quote, note, example)
  | 'lists'      // bullet & ordered lists
  | 'link';      // hyperlink insert/edit
```

Groups are rendered left-to-right in declaration order, separated by a
visual divider (§8 styling). `ToolbarGroup` is the public name preserved
for backwards compatibility; it is identical to the `BaseToolbarGroup` type
defined in §10.7.

### 4.3 No required props

All props are optional. `<MetanormaToolbar />` with no props renders the
full toolbar.

## 5. Button specification

Each control is defined by a descriptor. The descriptor lives in
`pkg/prosemirror-editor/toolbar/types.ts` (§10.2) and is shared by both the
base and advanced toolbars:

```typescript
interface ToolbarButton {
  /** Unique key for React list rendering. */
  readonly key: string;
  /** Human-readable label shown as button text. */
  readonly label: string;
  /** ARIA title for the <button> element. */
  readonly title: string;
  /** Whether this button applies to the current selection. */
  readonly isActive: (state: EditorState) => boolean;
  /** Whether this button can execute against the current selection. */
  readonly isEnabled: (state: EditorState) => boolean;
  /** Dispatch the command via the EditorView. */
  readonly run: (view: EditorView) => void;
}
```

The four base groups below are each a `ToolbarGroupDef` (§10.3) assembled in
`toolbar/groups/`. Active/enabled detection and dispatch wiring are
unchanged from version 1; only the physical location of the code has moved
(see §11). The shared state predicates (`isInlineContext`, `isBlockContext`,
`isMarkActive`, `isListActive`, `isBlockWrapActive`, `activeMarkTypes`) live
in `toolbar/predicates.ts` (§7, §13).

### 5.1 Group: `marks` — inline formatting toggles

Each mark button uses `prosemirror-commands`'s `toggleMark`. Active state is
detected by checking whether the mark is present in `$from` stored marks or
the current selection range.

| Button | Label | Mark | Icon/text | Command |
|---|---|---|---|---|
| Bold | **B** | `strong` | "B" (bold) | `toggleMark(schema.marks.strong)` |
| Italic | *I* | `emphasis` | "I" (italic) | `toggleMark(schema.marks.emphasis)` |
| Underline | U̲ | `underline` | "U" (underlined) | `toggleMark(schema.marks.underline)` |
| Strikethrough | S̶ | `strike` | "S" (strikethrough) | `toggleMark(schema.marks.strike)` |
| Subscript | X₂ | `subscript` | "x₂" | `toggleMark(schema.marks.subscript)` |
| Superscript | X² | `superscript` | "x²" | `toggleMark(schema.marks.superscript)` |
| Code | `<>` | `code` | "code" | `toggleMark(schema.marks.code)` |
| Small caps | ᴀᴀ | `smallcap` | "AA" (small caps) | `toggleMark(schema.marks.smallcap)` |

**Active detection:** a mark is active when
`state.selection.empty ? schema.marks.X.isInSet(state.storedMarks ?? state.$from.marks()) : schema.marks.X.isInSet(state.selection.$to.marks())`.

**Enabled detection:** `true` when the selection is within a node whose
content group includes `inline` (i.e. inside a `paragraph`, `dt`, or other
inline-content node). Returns `false` when the cursor is inside an atom node
(`formula`, `floating_title`, `image`) or a `sourcecode` node (which has
`content: "text*"` but is code-only).

### 5.2 Group: `blocks` — block wrapping

| Button | Label | Node type | Command |
|---|---|---|---|
| Quote | ❝ | `quote` | `wrapIn(schema.nodes.quote)` |
| Note | 📝 | `note` | `wrapIn(schema.nodes.note)` |
| Example | 💡 | `example` | `wrapIn(schema.nodes.example)` |

Uses `prosemirror-commands`'s `wrapIn`.

**Active detection:** a block wrap is active when the parent block node at
the selection start is of the target type — checked via
`state.selection.$from.node(type.depth)` walking up the resolution.

**Enabled detection:** `true` when the selection's parent is in the `block`
group, so that `wrapIn` can legally apply.

**Toggle behaviour:** `wrapIn` wraps when the target is absent and **lifts**
when the selection is already inside the target node type. This toggle
semantics is provided by ProseMirror's `wrapIn` return value (returns
`false` when the wrap already exists, which the command implementation uses
to attempt a `lift` instead). The toolbar button should call `wrapIn` and
let ProseMirror handle the toggle logic.

### 5.3 Group: `lists` — list insertion

| Button | Label | Node type | Command |
|---|---|---|---|
| Bullet list | • | `bullet_list` | toggle list (see below) |
| Ordered list | 1. | `ordered_list` | toggle list (see below) |

ProseMirror's `prosemirror-commands` `wrapIn` can wrap selected blocks in a
list, but **cannot unwrap** (toggle off) an existing list. Proper list
toggling requires a custom `toggleList` command that:

1. If the selection is already inside the same list type: calls `lift`
   (from `prosemirror-commands`) or `wrapIn(schema.nodes.list_item)` +
   `lift` to unwrap.
2. If inside a **different** list type: first lifts out of the current list,
   then wraps in the new list type.
3. If not in a list: wraps the selected block(s) in a `list_item` inside
   the target list node.

**Version 2 change — pure command contract.** `toggleList` is now a pure
ProseMirror `Command` (as required by [`EditorCommands.spec.md`](./EditorCommands.spec.md)
§1.5), not a view-taking function. It composes the
lift+wrap cross-list-type case into a **single transaction** and never
touches an `EditorView`:

```typescript
import type { Command } from "prosemirror-state";

/**
 * Toggle a list type on/off around the current selection.
 * Pure: called without `dispatch` it only reports applicability.
 * Returns true iff a transaction was (or would be) dispatched.
 */
export function toggleList(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  listType?: NodeType,
): boolean;
```

Defined in `@metanorma/editor-commands` (`pkg/editor-commands/commands/toggleList.ts`)
and re-exported from `@metanorma/prosemirror-editor` (§12). The lists
group's `run(view)` adapter is a thin wrapper that delegates to the pure
command and re-focuses the editor:

```typescript
run: (view) => {
  toggleList(view.state, view.dispatch, listType);
  view.focus();
}
```

**Active detection:** a list button is active when
`state.selection.$from.node(-2)?.type === listType` (the list wraps
`list_item` wraps block content, so the list is two levels above the
selection's immediate parent).

**Enabled detection:** the selection's parent block is in the `block` group.

### 5.4 Group: `link` — hyperlink

| Button | Label | Mark | Command |
|---|---|---|---|
| Link | 🔗 | `link` | toggle link (see below) |

The `link` mark carries an `href` attribute (default `null`), so a simple
`toggleMark` is insufficient — the user must supply a URL.

**Behaviour:**

1. When the user clicks Link with a non-empty text selection:
   - If no `link` mark is present on the selection: prompt for a URL
     (initially — see §6), then `toggleMark(schema.marks.link, { href })`.
   - If a `link` mark is already present: remove it
     (`toggleMark(schema.marks.link)` with no attrs removes existing links).
2. When the cursor is in a link (empty selection, stored mark present):
   - Clicking removes the link mark.

**Active detection:** `schema.marks.link.isInSet(marksAtCursor)` is truthy.

**Enabled detection:** selection is within inline content (same as marks
group) and the selection is non-empty when adding (links require text to
attach to). Removal is always enabled when active.

### 5.5 Out of scope (future work)

The following are intentionally excluded from this specification and are
taken up by [`AdvancedMetanormaToolbar`](./AdvancedMetanormaToolbar/README.md):

- **Tables** — insertion requires row/column dimension selection UI.
- **Images / figures** — require file upload or URL resolution and
  `assertValidImageAttrs`.
- **Section / clause nesting** — structural operations that affect the
  document tree at the `sections` / `clause` level.
- **Reference marks** (`xref`, `eref`, `concept`, `bcp14`, `footnote`) and the
  `stem` inline atom node — require target/ID resolution beyond simple toggle.
- **Definition lists** (`dl`/`dt`/`dd`) — multi-part structure that needs
  dedicated insertion logic.
- **Undo / redo** — handled by ProseMirror history plugin, not the schema.

## 6. Link URL input

For the initial implementation, the link URL is collected via
`window.prompt('Link URL:')`. This is deliberately simple.

**Future enhancement hook:** the toolbar component accepts an optional
`onLinkPrompt` prop that, if provided, replaces the `window.prompt` call
with a custom UI (modal, popover, etc.):

```typescript
/** Optional custom link-URL prompt. Default: window.prompt. */
readonly onLinkPrompt?: () => Promise<string | null>;
```

When `onLinkPrompt` resolves to a non-null string, the link is applied.
When it resolves to `null`, the operation is cancelled. The `link` group is
parameterised by this callback — it is produced by a factory
`makeLinkGroup(onLinkPrompt)` (§10.6) so it always reads the latest prop.

## 7. State detection implementation

The toolbar uses `useEditorStateSelector` for each button's active/enabled
state. To avoid excessive re-renders, selectors return primitive values
(`boolean`) that only change when the relevant state slice changes:

```typescript
// Example: is "strong" mark active?
const isBoldActive = useEditorStateSelector((state) => {
  const { schema } = state;
  const marks = state.selection.empty
    ? state.storedMarks ?? state.$from.marks()
    : state.selection.$to.marks();
  return schema.marks.strong.isInSet(marks()) !== undefined;
});
```

Each button subscribes via its own `useEditorStateSelector` call, so only
the buttons whose active/enabled state actually changed re-render.

> **Implementation note:** `marks()` on a ResolvedPos returns an array;
> for `$to.marks()` use the `MarkType.isInSet()` method to test membership.

Commands are dispatched through `useEditorEventCallback`, which provides
the `EditorView`:

```typescript
const handleToggle = useEditorEventCallback((view) => {
  toggleMark(view.state.schema.marks.strong)(view.state, view.dispatch);
});
```

As of version 2, the predicate functions used across groups
(`activeMarkTypes`, `isInlineContext`, `isBlockContext`, `isMarkActive`,
`isListActive`, `isBlockWrapActive`) and the schema-name guards
(`requireMark`, `requireNode`) live in `toolbar/predicates.ts` (§13) and
are imported by the group modules.

## 8. Styling

### 8.1 Conventions

- The toolbar is plain CSS (no CSS-in-JS), consistent with `style.css`.
- All classes are prefixed `mn-toolbar` to avoid collisions.
- The stylesheet is imported as a side-effect by the shared `<Toolbar>`
  shell (§10.4), matching the pattern used by `MetanormaProseMirror.tsx` →
  `style.css`.

### 8.2 CSS class structure

```
.mn-toolbar                    /* root <div> */
  .mn-toolbar-group            /* each group container */
    .mn-toolbar-btn            /* individual <button> */
    .mn-toolbar-btn--active    /* modifier: command is active at cursor */
    .mn-toolbar-btn--disabled  /* modifier: command is not applicable */
  .mn-toolbar-divider          /* visual separator between groups */
```

### 8.3 Required styles (minimum)

| Selector | Purpose |
|---|---|
| `.mn-toolbar` | `display: flex; gap: 0.25rem; padding: 0.5em; border-bottom: 1px solid var(--mn-border, #ccc);` |
| `.mn-toolbar-group` | `display: flex; gap: 0.125rem;` |
| `.mn-toolbar-btn` | `min-width: 2em; padding: 0.25em 0.5em; border: 1px solid transparent; border-radius: 3px; background: transparent; cursor: pointer;` |
| `.mn-toolbar-btn--active` | `background: var(--mn-active, #e0e0e0);` |
| `.mn-toolbar-btn--disabled` | `opacity: 0.4; cursor: default;` |
| `.mn-toolbar-divider` | `width: 1px; background: var(--mn-border, #ccc); margin: 0 0.25em;` |
| Dark mode | `.mn-toolbar` adapts via `@media (prefers-color-scheme: dark)` |

## 9. Accessibility

Each `<button>` element:

- Has a descriptive `title` attribute (§5 per-button spec).
- Has `aria-pressed="true"` when active (toggle buttons) or
  `aria-pressed="false"` when inactive.
- Has `disabled` attribute when not enabled.
- Is keyboard-focusable and operable via `Enter` / `Space` (native `<button>`
  semantics).

## 10. Shared toolbar architecture

Version 2 factors the toolbar into a three-layer structure so that the base
functionality can be shared with `AdvancedMetanormaToolbar` **without
duplication**. `MetanormaToolbar` is the thin assembler at the top of this
stack; this section defines the layers beneath it.

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

The base groups array is **literally the same object** passed to both
assemblers, so the base functionality is shared by construction.

### 10.1 Layer overview

1. **Rendering primitives** (shared by both toolbars) — a generic `<Toolbar>`
   shell that renders an ordered list of *groups*, and a
   `<ToolbarButtonView>` that renders a single `ToolbarButton` descriptor
   with its active/enabled/dispatch wiring.
2. **Group definitions** (data + stateful controls) — one module per group.
   Base groups live alongside advanced groups; each exports a
   `ToolbarGroupDef`.
3. **Thin assembler components** — `MetanormaToolbar` and
   `AdvancedMetanormaToolbar` each just select *which* groups to pass to the
   shared `<Toolbar>` shell.

### 10.2 Entry model

Most toolbar controls are plain data (`ToolbarButton`, §5). A few advanced
controls are inherently **stateful** — the table grid-picker popover, the
image insert dialog, and the reference-mark popovers — and cannot be
expressed by a single `run(view)` callback. The entry model accommodates
both:

```typescript
import type { ReactNode } from "react";
import type { ToolbarButton } from "./types.js";

/** A plain data-driven button (marks, lists, link, …). */
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

Every base-group entry is a `ToolbarButtonEntry` (`kind: "button"`); the
`control` variant is used only by advanced groups and is included here so
the shared shell can render both uniformly.

### 10.3 Group definition

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

The four base group ids are `"marks"`, `"blocks"`, `"lists"`, `"link"`.

### 10.4 The shared `<Toolbar>` shell

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
and inserts a `.mn-toolbar-divider` between visible groups. For each entry
it renders `<ToolbarButtonView>` (for `kind: "button"`) or the control's
node (for `kind: "control"`). It reuses the `mn-toolbar*` CSS classes from
§8 unchanged and is generic over the id type (it only requires `string`
ids), so it serves both the base and advanced toolbars without change.

### 10.5 `<ToolbarButtonView>`

`<ToolbarButtonView>` renders one `ToolbarButton` descriptor. It subscribes
to `useEditorStateSelector` for active/enabled state and dispatches via
`useEditorEventCallback` — exactly the wiring the base toolbar has always
had. It emits the `<button>` element with the `mn-toolbar-btn` classes and
the `aria-pressed` / `disabled` attributes specified in §9.

### 10.6 Base group registry

Each base group is defined in its own module under `toolbar/groups/`:

| Module | Group id | Spec source |
|---|---|---|
| `marksGroup.tsx` | `marks` | §5.1 |
| `blocksGroup.tsx` | `blocks` | §5.2 |
| `listsGroup.tsx` | `lists` | §5.3 |
| `linkGroup.tsx` | `link` | §5.4 |

The barrel `toolbar/groups/index.ts` exports a `baseGroups` factory. The
base groups carry no external props except the link group, which is
parameterised by the prompt callback; `baseGroups` is therefore a factory
rather than a bare constant so the latest `onLinkPrompt` is threaded
through:

```typescript
/** Build the four base groups, threading the link prompt. */
export function baseGroups(
  onLinkPrompt: () => Promise<string | null>,
): readonly ToolbarGroupDef[];
```

Advanced group modules (`tablesGroup`, `imagesGroup`, `sectionsGroup`,
`refsGroup`, `definitionListGroup`, `historyGroup`) and the
`buildAdvancedGroups` factory are defined by
[`AdvancedMetanormaToolbar/README.md`](./AdvancedMetanormaToolbar/README.md);
they are consumed by `AdvancedMetanormaToolbar` only.

### 10.7 Group-id types

```typescript
/** Base group ids. */
export type BaseToolbarGroup = "marks" | "blocks" | "lists" | "link";
```

`MetanormaToolbar` keeps its narrower public type `ToolbarGroup`
(§4.2), which is identical to `BaseToolbarGroup`. `AdvancedMetanormaToolbar`
composes a widened `AdvancedToolbarGroup = BaseToolbarGroup | …` (defined in
the advanced spec) for its own `visibleGroups` prop. Because the
`<Toolbar>` shell only requires `string` ids, it serves both without
change.

### 10.8 Render order

Base groups render left-to-right, separated by dividers:

```
marks · blocks · lists · link
└──── MetanormaToolbar (base) ────┘
```

`AdvancedMetanormaToolbar` appends its groups after `link`; see the
advanced spec for the full combined order.

### 10.9 The `MetanormaToolbar` assembler

With the primitives and registry in place, `MetanormaToolbar` itself is
thin. Its public API (§4) is unchanged; only the render body changes:

```typescript
// MetanormaToolbar.tsx — version 2 (public API unchanged)
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

There is exactly one copy of the mark/block/list/link logic — in the shared
group modules — used by both assemblers.

## 11. Migration from the monolith

This section is normative for any existing implementation that predates
version 2. It describes the refactor that brings a self-contained
monolithic `MetanormaToolbar` into compliance with the §10 architecture.
Each step moves code that **already exists** today into its target module,
preserving behaviour (the invariants in §11.10 must hold before and after).

### 11.1 Starting point

An implementation predating version 2 is typically a single self-contained
file (`MetanormaToolbar.tsx`) with no `toolbar/` directory, no group
registry, and no extension seam. It contains, all private and un-exported:

| Current location (in `MetanormaToolbar.tsx`) | What it is |
|---|---|
| `ToolbarButton` interface | The button descriptor (`key/label/title/isActive/isEnabled/run`) |
| `ToolbarButtonView` function component | Renders one button; subscribes to state; dispatches via `useEditorEventCallback` |
| `buildButtons()` factory | Builds all four groups' descriptors in one function, returning `Record<ToolbarGroup, readonly ToolbarButton[]>` |
| `GROUP_ORDER` constant | Hardcoded `["marks","blocks","lists","link"]` ordering |
| Predicates (`activeMarkTypes`, `isInlineContext`, `isBlockContext`, `isMarkActive`, `isListActive`, `isBlockWrapActive`) | State-reading predicate functions |
| `requireMark` / `requireNode` | Schema name-resolution guards |
| `defaultLinkPrompt` | `window.prompt` fallback for the link group |
| Render body | Inlined group iteration, divider insertion, `visibleGroups` filtering |

A `commands/toggleList.ts` alongside it carries a view-taking
`toggleList(view: EditorView, listType): boolean` that dispatches up to two
transactions.

### 11.2 Design goals

- **No duplication.** The mark/block/list/link button definitions and the
  rendering machinery must exist in exactly one place, used by both toolbars.
- **No behavioural divergence.** Clicking *Bold* must dispatch the identical
  `toggleMark(schema.marks.strong)` command, with the identical
  active/enabled detection, as before. The refactor must not change any
  user-visible behaviour of the base toolbar.
- **Additive only.** Advanced features are *new groups* appended after the
  base groups; they must not alter base-group behaviour.
- **Public API preserved.** `MetanormaToolbar`, `MetanormaToolbarProps`, and
  `ToolbarGroup` keep their names and shapes; only *new* symbols are
  exported.

### 11.3 Step 1 — Extract shared types to `toolbar/types.ts`

Create `pkg/prosemirror-editor/toolbar/types.ts`. Move into it:

| Symbol | Current location | Target |
|---|---|---|
| `ToolbarButton` interface | `MetanormaToolbar.tsx` (private) | `toolbar/types.ts` (**exported**) |
| `ToolbarEntry`, `ToolbarButtonEntry`, `ToolbarControlEntry` | new | `toolbar/types.ts` (§10.2) |
| `ToolbarGroupDef` | new | `toolbar/types.ts` (§10.3) |
| `ToolbarProps` | new | `toolbar/types.ts` (§10.4) |
| `BaseToolbarGroup` | new | `toolbar/types.ts` (§10.7) |

`MetanormaToolbar.tsx` then imports `ToolbarButton` from
`./toolbar/types.js`. No behaviour change.

### 11.4 Step 2 — Extract `ToolbarButtonView` to `toolbar/ToolbarButtonView.tsx`

Move the `ToolbarButtonView` function component verbatim into
`pkg/prosemirror-editor/toolbar/ToolbarButtonView.tsx`, make it an
**exported** module, and import it back into `MetanormaToolbar.tsx` (and,
later, into the `<Toolbar>` shell). Its `useEditorStateSelector` /
`useEditorEventCallback` wiring and CSS class logic move with it unchanged.

### 11.5 Step 3 — Extract the `<Toolbar>` shell to `toolbar/Toolbar.tsx`

Move the render-body logic currently inlined in `MetanormaToolbar` (the
group iteration, the `GROUP_ORDER`-driven loop, the divider insertion, and
the `visibleGroups` filtering) into a new generic `<Toolbar>` component
(`pkg/prosemirror-editor/toolbar/Toolbar.tsx`) with the `ToolbarProps`
signature from §10.4. The shell renders `<ToolbarButtonView>` for each
`ToolbarButtonEntry`. After this step, `MetanormaToolbar`'s render body is
a single `<Toolbar …/>` call.

The `GROUP_ORDER` constant is **retired** — ordering now comes from the
`groups` array passed to `<Toolbar>`, so a hardcoded order is no longer
needed.

### 11.6 Step 4 — Split `buildButtons()` into four group modules

The current `buildButtons()` factory builds all four groups in one
function. Split it into one module per group under `toolbar/groups/`:

| Target module | Extracted from `buildButtons()` | Predicates it absorbs |
|---|---|---|
| `marksGroup.tsx` | the `markSpecs` array + mark-button loop | `activeMarkTypes`, `isMarkActive`, `isInlineContext` |
| `blocksGroup.tsx` | the `blockSpecs` array + block-button loop | `isBlockWrapActive`, `isBlockContext` |
| `listsGroup.tsx` | the `listSpecs` array + list-button loop | `isListActive` |
| `linkGroup.tsx` | the `link` button + `defaultLinkPrompt` | (uses `isMarkActive`, `isInlineContext`) |

Each module exports a `ToolbarGroupDef` (or, for `linkGroup`, a factory
`(onLinkPrompt) => ToolbarGroupDef`). Shared predicates used by more than
one group (`isInlineContext`, `isBlockContext`, `isMarkActive`,
`activeMarkTypes`) move to a small `toolbar/predicates.ts` and are imported
by the group modules. The `requireMark`/`requireNode` schema guards move
alongside them.

The link group is parameterised by the prompt callback: `linkGroup` becomes
a factory `(onLinkPrompt) => ToolbarGroupDef` so it can read the latest
prop — the current code achieves this via a ref + lazy getter; the
extracted module preserves that pattern.

### 11.7 Step 5 — Create `baseGroups` and reduce `MetanormaToolbar` to an assembler

Create `toolbar/groups/index.ts` exporting the `baseGroups` factory (§10.6).
Then reduce `MetanormaToolbar.tsx` to the thin assembler shown in §10.9.
After this step the public surface (`MetanormaToolbar`,
`MetanormaToolbarProps`, `ToolbarGroup`) is unchanged, but the internals
are the shared primitives.

### 11.8 Step 6 — Refactor `toggleList` to the command contract

The existing `toggleList(view: EditorView, listType): boolean` takes an
`EditorView` and dispatches up to two transactions (the cross-list-type
case lifts then wraps in separate dispatches). This violates the §5.3
contract. The refactor rewrites it to the pure single-transaction form:

```typescript
export function toggleList(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  listType?: NodeType,
): boolean;
```

— pure `(state, dispatch?)`, single transaction (compose the lift+wrap into
one `state.tr`), no `EditorView`. The lists group's `run(view)` adapter
then calls `toggleList(view.state, view.dispatch, listType)` and
`view.focus()`. The pure command is relocated to
`@metanorma/editor-commands` (`pkg/editor-commands/commands/toggleList.ts`)
and re-exported from `@metanorma/prosemirror-editor` (§12); the toolbar
adapter stays in `prosemirror-editor`.

### 11.9 Step ordering and dependencies

The steps are ordered so that each leaves the tree compiling and the
toolbar behaving identically. Step 1 is a pure move; Steps 2–3 extract
rendering machinery; Step 4 splits data; Step 5 wires the assembler;
Step 6 is the only step that changes a public command signature and may be
done independently of the UI extraction. An implementation may land the
`toggleList` rewrite (Step 6) before or after the UI extraction as long as
the §11.10 invariants hold at every intermediate commit.

### 11.10 Behavioural invariants the refactor must preserve

These are testable properties that must hold before and after the refactor:

1. **Same buttons.** The base toolbar renders the identical set of buttons
   (same labels, titles, keys, order) as before.
2. **Same active/enabled logic.** Each button's `isActive`/`isEnabled`
   returns the same boolean for the same `EditorState`.
3. **Same dispatch.** Each button's `run` dispatches the same command
   against the same state.
4. **Same DOM/CSS.** The rendered HTML and class names (`mn-toolbar*`) are
   unchanged.
5. **Same public API.** `MetanormaToolbar`, `MetanormaToolbarProps`,
   `ToolbarGroup`, and `toggleList` remain exported under those names.

## 12. Export changes

`pkg/prosemirror-editor/index.ts` exports the assembler and its public types
(unchanged names), and re-exports `toggleList` from the command package:

```typescript
// Assembler + public types (unchanged public surface)
export { MetanormaToolbar } from "./MetanormaToolbar.js";
export type { MetanormaToolbarProps, ToolbarGroup } from "./MetanormaToolbar.js";

// toggleList — now a pure command, sourced from editor-commands
export { toggleList } from "@metanorma/editor-commands";
```

The shared primitives — `toolbar/Toolbar.tsx`, `toolbar/ToolbarButtonView.tsx`,
`toolbar/types.ts`, `toolbar/predicates.ts`, and `toolbar/groups/*` — are
**intentionally internal**: they are not exported from `index.ts`.
Consumers use the assembler components; sibling packages within
`prosemirror-editor` import the internals by relative path.

> **Version 1 → 2 export delta.** In version 1, `toggleList` was exported
> from `"./commands/toggleList.js"`. In version 2 it is re-exported from
> `"@metanorma/editor-commands"`. The `toggleList` *name* is unchanged, so
> existing `import { toggleList } from "@metanorma/prosemirror-editor"`
> callers are unaffected; only its signature changes (§5.3).

## 13. File structure summary

```
pkg/prosemirror-editor/
  MetanormaToolbar.tsx              ← thin assembler (was monolith)
  toolbar.css                       ← shared styles (mn-toolbar*)
  toolbar/
    types.ts                        ← ToolbarButton, ToolbarEntry,
    │                                 ToolbarGroupDef, BaseToolbarGroup
    Toolbar.tsx                     ← shared <Toolbar> shell (§10.4)
    ToolbarButtonView.tsx           ← renders one ToolbarButton (§10.5)
    predicates.ts                   ← shared state predicates + requireMark/requireNode
    groups/
      marksGroup.tsx                ← base group (§5.1)
      blocksGroup.tsx               ← base group (§5.2)
      listsGroup.tsx                ← base group (§5.3)
      linkGroup.tsx                 ← base group, parameterised by onLinkPrompt (§5.4)
      index.ts                      ← baseGroups factory (§10.6)
  index.ts                          ← public exports (§12)
```

Relocated / removed relative to version 1:

- `commands/toggleList.ts` — **moved** to `@metanorma/editor-commands`
  (`pkg/editor-commands/commands/toggleList.ts`); the
  `pkg/prosemirror-editor/commands/` directory is removed once the lists
  group's `run` adapter imports the pure command from the command package.
- `GROUP_ORDER` — **removed** (ordering now comes from the `groups` array).

Advanced-feature modules (`AdvancedMetanormaToolbar.tsx`, the advanced
group modules, `TableSizePicker.tsx`, `ImageInsertDialog.tsx`, the
definition-list keymap) are specified by
[`AdvancedMetanormaToolbar/README.md`](./AdvancedMetanormaToolbar/README.md)
and are out of scope for this file.

## 14. TypeScript constraints

The project tsconfig enforces: `strict`, `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `module: node16`. All
new code must:

- Use `import type` for type-only imports.
- Use `.js` extensions in relative imports.
- Avoid `undefined` for optional props (use optional `?` syntax).
- Handle `null` returns from `noUncheckedIndexedAccess` (e.g. array access
  results).
- Export all types alongside their implementations.
