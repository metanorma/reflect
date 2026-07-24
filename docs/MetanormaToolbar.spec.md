# MetanormaToolbar — Functional Specification

**Spec version:** 1

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

## 2. Package and export

| Aspect | Value |
|---|---|
| Defined in | `@metanorma/prosemirror-editor` |
| Source file | `pkg/prosemirror-editor/MetanormaToolbar.tsx` |
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
visual divider (§8 styling).

### 4.3 No required props

All props are optional. `<MetanormaToolbar />` with no props renders the
full toolbar.

## 5. Button specification

Each button is defined by a descriptor:

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

The spec requires a `toggleList` helper exported alongside the toolbar:

```typescript
/**
 * Toggle a list type on/off around the current selection.
 * Returns true if a transaction was dispatched.
 */
export function toggleList(
  view: EditorView,
  listType: NodeType,
): boolean;
```

Defined in `pkg/prosemirror-editor/commands/toggleList.ts`.

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

The following are intentionally excluded from this specification:

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

**Future enhancement hook:** the toolbar component should accept an optional
`onLinkPrompt` prop that, if provided, replaces the `window.prompt` call
with a custom UI (modal, popover, etc.):

```typescript
/** Optional custom link-URL prompt. Default: window.prompt. */
readonly onLinkPrompt?: () => Promise<string | null>;
```

When `onLinkPrompt` resolves to a non-null string, the link is applied.
When it resolves to `null`, the operation is cancelled.

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

## 8. Styling

### 8.1 Conventions

- The toolbar is plain CSS (no CSS-in-JS), consistent with `style.css`.
- All classes are prefixed `mn-toolbar` to avoid collisions.
- The stylesheet is imported as a side-effect in `MetanormaToolbar.tsx`,
  matching the pattern used by `MetanormaProseMirror.tsx` → `style.css`.

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

## 10. Export changes

`pkg/prosemirror-editor/index.ts` must add:

```typescript
export { MetanormaToolbar } from "./MetanormaToolbar.js";
export type { MetanormaToolbarProps, ToolbarGroup } from "./MetanormaToolbar.js";
export { toggleList } from "./commands/toggleList.js";
```

## 11. File structure summary

```
pkg/prosemirror-editor/
  MetanormaToolbar.tsx              ← toolbar component
  toolbar.css                       ← toolbar styles
  commands/
    toggleList.ts                   ← list toggle command
  index.ts                          ← add exports
```

## 12. TypeScript constraints

The project tsconfig enforces: `strict`, `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `module: node16`. All
new code must:

- Use `import type` for type-only imports.
- Use `.js` extensions in relative imports.
- Avoid `undefined` for optional props (use optional `?` syntax).
- Handle `null` returns from `noUncheckedIndexedAccess` (e.g. array access
  results).
- Export all types alongside their implementations.
