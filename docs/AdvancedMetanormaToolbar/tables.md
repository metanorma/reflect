# Tables

## 1. Purpose

This document is the detailed implementation proposal for **table insertion** in
the `AdvancedMetanormaToolbar`. It addresses the single item deferred by
`MetanormaToolbar.spec.md` §5.5:

> **Tables** — insertion requires row/column dimension selection UI.

Inserting a table is structurally unlike toggling a mark or wrapping a block: it
requires the user to choose a row and column count up front, and it must build a
deeply nested, schema-valid subtree (`table > table_body > table_row+ >
table_cell+`, each cell holding block content). This document therefore
specifies two coupled deliverables — a **dimension-selection popover** (the "row
/column dimension selection UI" the base spec called out) and an **`insertTable`
command** that materialises the chosen grid as ProseMirror nodes and places the
cursor in the first cell.

It deliberately does **not** re-specify anything from the base toolbar (marks,
blocks, lists, links, the `ToolbarButton` descriptor, the `mn-toolbar` styling
conventions, or the integration model). Those are assumed. Only table-specific
additions are defined here.

## 2. Scope and schema recap

All table nodes come from `@metanorma/prosemirror-schema`
(`metanormaSchema`, defined in `pkg/prosemirror-schema/src/nodes.ts` §8.5). The
relevant fragment:

| Node | Content | Group | Attrs |
|---|---|---|---|
| `table` | `(table_head \| table_body \| table_foot)+` | `block` | `id`, `number`, `title` (all default `null`), plus `data` (default `{}`) |
| `table_head` | `table_row+` | — | `data` (default `{}`) |
| `table_body` | `table_row+` | — | `data` (default `{}`) |
| `table_foot` | `table_row+` | — | `data` (default `{}`) |
| `table_row` | `table_cell+` | — | `data` (default `{}`) |
| `table_cell` | `block+` | — | `colspan` (default `1`), `rowspan` (default `1`), plus `data` (default `{}`) |

Two consequences drive the design:

1. **A `table` must contain at least one of** `table_head` / `table_body` /
   `table_foot`. This proposal inserts a single **`table_body`** by default (see
   §7 open questions for whether the picker should also offer head/foot).
2. **`table_cell` holds `block+`**, so every cell must be seeded with a valid
   block — an empty `paragraph`. A cell may never be empty in the document model.

The attribute helper `DATA_ATTR` (`{ data: { default: {} } }`) backs the open
`data` index on every table node. The `table` node inlines its attrs
(`{ id, number, title, ...DATA_ATTR }`) rather than using `baseAttrs()`, because
it carries a `title`; the other five table nodes carry only `...DATA_ATTR`.

## 3. Package and files

| Aspect | Value |
|---|---|
| Commands package | `@metanorma/editor-commands` (command logic, DOM-free) |
| Editor package | `@metanorma/prosemirror-editor` (React mount + toolbar adapter) |
| Command module | `pkg/editor-commands/src/commands/insertTable.ts` |
| Popover / adapter component | `pkg/prosemirror-editor/src/TableSizePicker.tsx` (`InsertTableButton` + grid picker) |
| Picker styles | `pkg/prosemirror-editor/src/table-picker.css` (imported side-effect) |
| Commands barrel | `pkg/editor-commands/src/index.ts` (export `insertTable`, `canInsertTable`, `MAX_ROWS`, `MAX_COLS` — §10) |
| Editor barrel | `pkg/prosemirror-editor/src/index.ts` (re-export the command; export `InsertTableButton` — §10) |
| Schema source | `@metanorma/prosemirror-schema` (`metanormaSchema`, `DATA_ATTR`) |

The pure `insertTable` command lives in the `@metanorma/editor-commands` package,
where every command obeys the `Command` contract
(`docs/EditorCommands.spec.md` §1.5). The grid-picker popover and its
`InsertTableButton` component live in `@metanorma/prosemirror-editor`; they are
the **toolbar adapter** — the only layer that holds an `EditorView`, restores
focus, and calls the pure command. The command itself never touches the DOM or
an `EditorView` (§8).

The picker is rendered as a descendent of the toolbar (and therefore a
descendent of `<ProseMirror>`), so it may use
`useEditorStateSelector` / `useEditorEventCallback` directly when it needs to
inspect or dispatch against the editor — though in practice it only needs the
event callback to run the insert command from the adapter.

## 4. The "Insert table" button

| Field | Value |
|---|---|
| `key` | `"table"` |
| `label` | `"▦"` (grid glyph) |
| `title` | `"Insert table"` |
| `isActive` | `false` — table insertion is not a toggle; see §6. |
| `isEnabled` | §6 enabled rule (selection parent in `block` group and not inside an existing `table_cell`). |
| `run` | Does **not** dispatch immediately. It toggles the picker popover open/closed against local React state (see §5). The actual dispatch happens in the picker's commit handler via `insertTable`. |

Because `run` needs to coordinate local popover state rather than fire a
transaction, the "Insert table" button is **not** a plain
`ToolbarButton.run`-on-click control. It is rendered by a dedicated React
component that owns the picker's open state and renders the `ToolbarButton`
visuals (`.mn-toolbar-btn` and modifiers) plus the popover. Concretely:

```tsx
// pkg/prosemirror-editor/src/TableSizePicker.tsx (excerpt)
import { insertTable } from "@metanorma/editor-commands";
import { canInsertTable } from "@metanorma/editor-commands";

export function InsertTableButton() {
  const [open, setOpen] = useState(false);
  const enabled = useEditorStateSelector(canInsertTable);
  const insert = useEditorEventCallback((view) => {
    // Adapter layer: this is the ONLY place an EditorView is used.
    // The pure command takes (state, dispatch, r, c); focus is restored here.
    insertTable(view.state, view.dispatch, rows, cols); // rows/cols chosen inside the picker
    view.focus();
  });

  return (
    <div className="mn-toolbar-table">
      <button
        type="button"
        className="mn-toolbar-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!enabled}
        title="Insert table"
        onClick={() => setOpen((v) => !v)}
      >
        ▦
      </button>
      {open ? (
        <TableSizePicker
          onCommit={(r, c) => { setOpen(false); /* bind r,c to `insert` */ }}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
```

> **Note on `ToolbarButton`.** The base descriptor's `run(view)` signature
> cannot express "open a popover". This proposal therefore treats the table
> button as a first-class React element rendered in its own toolbar slot,
> reusing the same `.mn-toolbar-btn` classes for visual consistency but not the
> literal `ToolbarButton` object. This is the minimal, non-invasive deviation
> from the base toolbar contract; all other buttons remain `ToolbarButton`s.

## 5. Row/column dimension selection UI — the grid picker

This is the core feature deferred by the base spec. The proposal is an
**m × n grid-picker popover** anchored to the Insert-table button — the same
interaction model used by Google Docs / Notion table insertion.

### 5.1 Layout

A square cell grid of fixed maximum size `MAX_ROWS × MAX_COLS`
(proposed default **10 × 10**; see §7). Each picker cell is a clickable tile.
Below the grid, a live readout shows the highlighted dimensions, e.g.
`3 × 4`.

```
 ┌─────────────────────┐
 │ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ │
 │ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ │
 │ ■ ■ ■ ■ ▢ ▢ ▢ ▢ ▢ ▢ │   ← rows 1..3, cols 1..4 highlighted
 │ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ │
 │   ... (10×10)        │
 └─────────────────────┘
        3 × 4
```

### 5.2 Interaction model

| Event | Behaviour |
|---|---|
| Click "Insert table" button | Toggle popover open/closed. |
| Pointer move over a cell at `(r, c)` | Highlight the rectangle rows `1..r`, cols `1..c` (top-left anchored). Update the readout to `r × c`. |
| Pointer leave the grid | Clear the highlight (revert to a `1 × 1` default preview, or the last-committed preview). |
| Click a cell at `(r, c)` | Commit: close the popover and call `insertTable(view.state, view.dispatch, r, c)` (then `view.focus()`) from the adapter. |
| `Escape` (focus within popover) | Cancel: close the popover without inserting. |
| Click outside the popover | Cancel (same as `Escape`). |

Highlight state is purely presentational React state (`{ rows, cols }`),
reset to `{1, 1}` whenever the popover opens.

### 5.3 Keyboard operability

The grid must be fully operable without a pointer (see §6 accessibility):

| Key | Action |
|---|---|
| `ArrowRight` / `ArrowLeft` | Move the column cursor `±1`, clamped to `[1, MAX_COLS]`. Update highlight + readout. |
| `ArrowDown` / `ArrowUp` | Move the row cursor `±1`, clamped to `[1, MAX_ROWS]`. Update highlight + readout. |
| `Home` / `End` | Column cursor to `1` / `MAX_COLS`. |
| `PageDown` / `PageUp` | Row cursor to `MAX_ROWS` / `1`. |
| `Enter` / `Space` | Commit the current highlight and insert. |
| `Escape` | Cancel. |
| `Tab` | Move focus to the next toolbar control (close the popover). |

The highlight position is driven by a single `{ row, col }` state value shared
by pointer and keyboard handlers, so both inputs are always consistent.

### 5.4 CSS classes

The picker introduces feature-specific classes under the existing `mn-toolbar`
prefix:

```
.mn-toolbar-table              /* wrapper: button + popover */
  .mn-toolbar-btn              /* the trigger (reuses base class) */
.mn-toolbar-popover            /* absolutely-positioned grid container */
  .mn-toolbar-grid             /* the m×n grid (CSS grid) */
    .mn-toolbar-gridcell       /* one tile */
    .mn-toolbar-gridcell--on   /* modifier: inside the highlighted rectangle */
  .mn-toolbar-grid-readout     /* the "3 × 4" label */
```

Minimum required styling:

| Selector | Purpose |
|---|---|
| `.mn-toolbar-popover` | `position: absolute; z-index: 10; background: var(--mn-surface, #fff); border: 1px solid var(--mn-border, #ccc); border-radius: 4px; padding: 0.4em; box-shadow: 0 2px 8px rgba(0,0,0,.15);` |
| `.mn-toolbar-grid` | `display: grid; grid-template-columns: repeat(var(--cols), 1.2em); grid-template-rows: repeat(var(--rows), 1.2em); gap: 2px;` (`--cols`/`--rows` set inline to `MAX_COLS`/`MAX_ROWS`). |
| `.mn-toolbar-gridcell` | `width: 1.2em; height: 1.2em; border: 1px solid var(--mn-border, #ccc); background: transparent; cursor: pointer;` |
| `.mn-toolbar-gridcell--on` | `background: var(--mn-active, #e0e0e0); border-color: var(--mn-active, #e0e0e0);` |
| `.mn-toolbar-grid-readout` | `text-align: center; font-variant-numeric: tabular-nums; margin-top: 0.3em;` |
| Dark mode | `.mn-toolbar-popover` / `.mn-toolbar-gridcell` adapt via `@media (prefers-color-scheme: dark)` as in the base toolbar. |

The stylesheet is plain CSS imported as a side-effect in `TableSizePicker.tsx`,
matching the base toolbar's `toolbar.css` convention.

## 6. Accessibility

The grid picker follows the WAI-ARIA **`grid`** pattern so it is operable by
screen-reader and keyboard-only users.

### 6.1 Roles and labels

| Element | Role / attributes |
|---|---|
| Popover root | `role="dialog"`, `aria-label="Table size"`, `aria-modal="false"` (it is non-modal — `Escape`/outside-click dismiss it without trapping focus globally). |
| Grid container | `role="grid"`, `aria-readonly="true"`, `aria-rowcount={MAX_ROWS}`, `aria-colcount={MAX_COLS}`. |
| Each tile | `role="gridcell"`, `aria-rowindex={r}`, `aria-colindex={c}`, `aria-selected={r <= row && c <= col}` (reflects the highlight rectangle), `tabIndex` of the focused cell is `0` and all others `-1` (roving tabindex). |
| Readout | `aria-live="polite"` so the spoken dimension (`"3 by 4"`) is announced as the highlight changes. |
| Trigger button | `aria-haspopup="dialog"`, `aria-expanded={open}`, `aria-controls={popoverId}` when open. |

### 6.2 Focus management

- When the popover opens, focus moves to the grid's focused cell
  (the roving-tabindex cell with `tabIndex={0}`), defaulting to `(1, 1)`.
- Arrow keys move the roving `tabIndex={0}` cell (the model in §5.3) and update
  `aria-selected` on the affected cells.
- On commit or cancel, focus returns to the trigger button.
- `aria-label` on each `gridcell` communicates its coordinates, e.g.
  `aria-label="row 3 column 4"`; the live readout communicates the *selected*
  size so the user need not count cells.

## 7. Active / enabled detection

The base `ToolbarButton` separates `isActive` (command applies now) from
`isEnabled` (command can run now). For table insertion:

### 7.1 Active

```typescript
isActive: () => false;
```

Table insertion is **not a toggle** — there is no "active" state. The button is
never rendered with `.mn-toolbar-btn--active`. (Editing an *existing* table —
adding/removing rows — is out of scope; this feature only inserts.)

### 7.2 Enabled

The button is enabled when the selection is a legal insertion site for a
`block`-group node **and** is not already inside a table cell (we do not support
nesting tables in this schema). The predicate lives in
`pkg/editor-commands/src/commands/insertTable.ts` (alongside `insertTable`) and
is the single legality check shared by the query and dispatch paths (see §8.1).

```typescript
// pkg/editor-commands/src/commands/insertTable.ts
import type { EditorState } from "prosemirror-state";

/** True when a table may be inserted at the current selection. */
export function canInsertTable(state: EditorState): boolean {
  const { $from } = state.selection;

  // 1. Refuse to nest tables: bail if any ancestor is a table_cell.
  for (let d = $from.depth; d > 0; d--) {
    const ancestor = $from.node(d);
    if (ancestor.type === state.schema.nodes["table_cell"]) return false;
    if (ancestor.type === state.schema.nodes["table"]) return false;
  }

  // 2. The immediate parent must accept block content (group "block").
  //    replaceWith needs a valid slot for the `table` node.
  const parent = $from.parent;
  if (!parent.type.contentMatch.matchType(state.schema.nodes["table"])) {
    return false;
  }

  // 3. A range selection spanning multiple block siblings would be deleted by
  //    a plain insert; for v1 require a cursor or a single-block selection.
  if (!state.selection.empty) {
    const $to = state.selection.$to;
    if ($from.parent !== $to.parent) return false;
  }

  return true;
}
```

Notes on the strict-tsconfig constraints in play:

- `state.schema.nodes["table_cell"]` returns `NodeType | undefined` under
  `noUncheckedIndexedAccess`; compare with `===` after the lookup, or assert.
  The snippet above relies on the schema always containing the table nodes, so a
  local `const cellType = state.schema.nodes["table_cell"]!;` guard is
  acceptable — but prefer an explicit early `if (!cellType) return false;` to
  keep the type system honest.
- `isActive`/`isEnabled` are pure functions of `EditorState`, so they plug
  directly into `useEditorStateSelector` (one selector per concern).
- `canInsertTable` is the no-dispatch **query path** of the command. Calling
  `insertTable(state)` (no `dispatch`) returns the **same** boolean — both
  delegate to one shared legality check, so the enable/disable test and the
  command's own applicability test can never disagree (query/dispatch parity,
  `docs/EditorCommands.spec.md` §1.5(1)/§1.12(3)).

## 8. The `insertTable` command

Lives in `pkg/editor-commands/src/commands/insertTable.ts` and conforms to the
`@metanorma/editor-commands` `Command` contract
(`docs/EditorCommands.spec.md` §1.5). It is **pure**: it reads `EditorState`,
writes only through the supplied `dispatch`, and never imports `prosemirror-view`
or touches the DOM. The `EditorView` / `view.focus()` concerns live exclusively
in the toolbar adapter in `@metanorma/prosemirror-editor` (§4, §5.2).

> **Command vs. trigger.** Per the naming rule
> (`docs/EditorCommands.spec.md` §1.10.2) the command is named for the action it
> performs (`insertTable`), not for its UI trigger. There is no `Command` suffix.

### 8.1 Signature

```typescript
// pkg/editor-commands/src/commands/insertTable.ts
import type { EditorState, Transaction } from "prosemirror-state";
import type { Node } from "prosemirror-model";

/**
 * Insert a `rows × cols` table at the current selection.
 *
 * Pure ProseMirror command (Command contract, EditorCommands.spec.md §1.5):
 * operates on `state`/`dispatch` only; never takes an EditorView or touches the
 * DOM. The toolbar adapter in @metanorma/prosemirror-editor supplies the view
 * and restores focus (§4).
 *
 * Query path — `insertTable(state)` (no `dispatch`): returns the same boolean
 * as `canInsertTable(state)` and mutates nothing (query/dispatch parity).
 *
 * Dispatch path — `insertTable(state, dispatch, r, c)`: when applicable, builds
 * exactly one transaction, dispatches it once, and returns `true`. Returns
 * `false` (and dispatches nothing) when insertion is not legal, regardless of
 * whether `dispatch` is supplied.
 *
 * @returns `true` if insertion applies / was applied, else `false`.
 */
export function insertTable(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  rows?: number,
  cols?: number,
): boolean;
```

The `Command` shape is `EditorState` + optional `dispatch` (per §1.5); the
extra `rows`/`cols` parameters are trailing optionals so the command still
satisfies query/dispatch parity — omitting `dispatch` always yields the pure
applicability test. When `rows`/`cols` are omitted on the dispatch path they
default to `1`.

`rows` and `cols` are clamped to `[1, MAX_ROWS]` / `[1, MAX_COLS]` inside the
command so the picker's highlight cannot produce an out-of-range request. The
defaults `colspan: 1`, `rowspan: 1` are taken from the schema; the command does
not pass them explicitly (it relies on `NodeType.create` applying attribute
defaults), but they are documented here as the deliberate initial state.

#### 8.1.1 Schema coupling (factory vs. singleton)

`insertTable` reads node types **off `state.schema` at call time**
(`state.schema.nodes.table`, etc.), so it is already schema-parameterised: the
schema instance is whatever the caller's `EditorState` carries, never a captured
singleton. This satisfies `docs/EditorCommands.spec.md` §1.6.1 (resolve types by
name through the schema instance) and is the simplest form that remains
schema-agnostic.

> **Decision: operate on `state.schema` directly, not a `(schema) => Command`
> factory.** Table insertion is generic — it builds `table > table_body >
> table_row > table_cell` and seeds an empty `paragraph` — and contains no
> Metanorma-vocabulary-specific branching that would only ever apply to the
> exact `metanormaSchema`. Because the command resolves node types from
> `state.schema`, it is automatically reusable on any composed schema that
> keeps those node names, without binding the `metanormaSchema` singleton. A
> `createInsertTable(schema): Command` factory (§1.6.2) would add an indirection
> with no benefit here, since there is no construction-time schema validation to
> perform. (Should a future variant need to *override* node names, it can be
> added as an explicit factory without changing this command.)

### 8.2 Algorithm

1. **Validate (and, if no `dispatch`, report).** Run the shared legality check
   behind `canInsertTable` (§7.2) against `state`. If it returns `false`, return
   `false` without dispatching — whether or not `dispatch` was supplied
   (`docs/EditorCommands.spec.md` §1.5(3)). If `dispatch` was **not** supplied,
   return the predicate's boolean now: this is the query path, which must not
   mutate anything (§1.5(1)).
2. **Clamp dimensions.** `rows = clamp(rows ?? 1, 1, MAX_ROWS)`,
   `cols = clamp(cols ?? 1, 1, MAX_COLS)`.
3. **Build the node tree** bottom-up using the schema node types resolved from
   `state.schema` and `NodeType.create` / `node.create`. Every leaf cell contains
   a single empty `paragraph` (a `block`, satisfying `table_cell`'s `block+`
   content).
4. **Insert.** Replace the (possibly empty) selection with the `table` node via
   `tr.replaceSelectionWith(table)`. When the selection is empty and inside a
   paragraph, ProseMirror splits appropriately; when the parent is a block that
   only allows one child, use `replaceWith` against the grandparent if needed
   (the legality check already guarantees a valid slot).
5. **Place the cursor.** Compute a `TextSelection` at the start of the first
   cell's paragraph (position of the empty paragraph's content start) and set it
   via `tr.setSelection` using `TextSelection.near(...)`. This puts the caret
   inside cell `(1,1)` ready to type and guarantees a content-model-valid
   selection (§1.7.2).
6. **Scroll into view.** `tr.scrollIntoView()` — this is a user-initiated
   command, so the viewport follows the cursor (§1.7.3).
7. **Dispatch once.** `dispatch(tr)` exactly once, return `true`. The command
   does **not** call `view.focus()` — that is the adapter's responsibility
   (§1.8.1, §4). If `dispatch` was not supplied, step 1 already returned the
   applicability boolean; this step is only reached on the dispatch path.

### 8.3 Example implementation

```typescript
// pkg/editor-commands/src/commands/insertTable.ts
import type { EditorState, Transaction } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import type { Node, Schema } from "prosemirror-model";
// NOTE: no `prosemirror-view` import — this command never touches EditorView/DOM.

export const MAX_ROWS = 10;
export const MAX_COLS = 10;

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

// Node types are resolved off the schema argument, not a captured singleton,
// so the command works on any schema that keeps the table node names (§8.1.1).
function buildTable(schema: Schema, rows: number, cols: number): Node {
  const cellType = schema.nodes["table_cell"]!; // resolved by name from state.schema
  const rowType = schema.nodes["table_row"]!;
  const bodyType = schema.nodes["table_body"]!;
  const tableType = schema.nodes["table"]!;

  const emptyParagraph = schema.nodes["paragraph"]!.create();

  const rowNodes = Array.from({ length: rows }, () => {
    const cells = Array.from({ length: cols }, () =>
      // colspan/rowspan default to 1 via the schema; we do not set them.
      cellType.create(null, [emptyParagraph]),
    );
    return rowType.create(null, cells);
  });

  const body = bodyType.create(null, rowNodes);
  // table attrs { id, number, title, data } all default null/{};
  // create() applies the defaults when `null` is passed.
  return tableType.create(null, [body]);
}

export function insertTable(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  rows?: number,
  cols?: number,
): boolean {
  // Single shared legality check for query and dispatch paths (§7.2, §8.2.1).
  if (!canInsertTable(state)) return false;

  // Query path: no dispatch → act as a pure applicability predicate, mutate
  // nothing. (docs/EditorCommands.spec.md §1.5(1).)
  if (!dispatch) return true;

  const r = clamp(rows ?? 1, 1, MAX_ROWS);
  const c = clamp(cols ?? 1, 1, MAX_COLS);
  const table = buildTable(state.schema, r, c);

  const tr = state.tr;
  tr.replaceSelectionWith(table);

  // Move the cursor into the first cell's empty paragraph.
  // Position math: doc pos of table +1 (in table) +1 (in body)
  //   +1 (in row) +1 (in cell) = start of the first cell's content.
  const startPos = tr.selection.from;
  const firstCellPos = startPos + 4; // table→body→row→cell = 4 open tags
  tr.setSelection(TextSelection.near(tr.doc.resolve(firstCellPos), 1));

  tr.scrollIntoView(); // user-initiated command (§1.7.3)
  dispatch(tr);        // exactly one transaction, dispatched once (§1.7.1)
  return true;
}
```

The adapter that drives it (in `@metanorma/prosemirror-editor`) is the **only**
place an `EditorView` appears:

```typescript
// pkg/prosemirror-editor/src/TableSizePicker.tsx (adapter excerpt)
import { insertTable } from "@metanorma/editor-commands";

// inside InsertTableButton's commit handler (useEditorEventCallback):
const onCommit = (view, r, c) => {
  insertTable(view.state, view.dispatch, r, c); // pure command, no view inside it
  view.focus();                                  // DOM concern stays in the adapter
};
```

> **Position arithmetic.** `firstCellPos = startPos + 4` reflects four nested
> "enter node" offsets: `table` (+1), `table_body` (+1), `table_row` (+1),
> `table_cell` (+1). `TextSelection.near(..., 1)` resolves forward onto the
> empty paragraph's content start and is robust to small offsets; prefer it over
> hard-coded positions in production code. If `replaceSelectionWith` lands the
> table adjacent to a block rather than replacing it, recompute `startPos` from
  `tr.doc.resolve` by searching forward for the first `table_cell`.

### 8.4 Why a single `table_body`

The schema requires `table` to contain at least one of
`table_head | table_body | table_foot`. For the v1 dimension picker the user
selects only size, not section role, so the command emits a single
`table_body`. This yields a valid, renderable table (`<table><tbody>…`) with no
header/footer. Adding head/foot is deferred to §9.

## 9. Open questions / unknowns

These are genuine design decisions left for the implementer / product owner:

1. **Head / body / foot selection.** Should the picker (or a follow-up dialog)
   let the user mark the first row as `table_head` and/or the last as
   `table_foot`? The current proposal emits `table_body` only. Metanorma
   documents often require a header row, so this may be a near-term need.
2. **Placement relative to the current block.** When the cursor is mid-
   paragraph, should the table split the paragraph (insert in place), or be
   placed after the current block? `replaceSelectionWith` with an empty
   selection inserts in place; a "insert after block" mode would need
   `tr.insert` at the block boundary.
3. **Selections spanning multiple blocks.** §7.2 currently *disables* the
   button for multi-block selections. Should a range selection instead be
   *replaced* by the table (consuming the selected content), as some editors do?
4. **Maximum grid size.** `MAX_ROWS`/`MAX_COLS` are proposed at `10`. Is that
   enough? Larger grids cost picker screen real estate; an alternative is a
   fixed small grid (e.g. 8×8) plus a "More…" option that opens a numeric input
   for arbitrary dimensions.
5. **Reuse of `prosemirror-tables`.** The schema's table nodes are structurally
   compatible with the `prosemirror-tables` extension, which would provide
   row/column add-remove, cell merge/split, column resize, and a robust
   `insertTable` command out of the box. Should the editor adopt
   `prosemirror-tables` (adding the dependency and its keymap/plugins) rather
   than hand-rolling `insertTable.ts` (in `@metanorma/editor-commands`)? This is
   the largest architectural fork: the custom command is schema-light and
   dependency-free, but `prosemirror-tables` gives far richer editing later.
   (Note: `prosemirror-tables` is already referenced as future work in
   `MetanormaProseMirror.spec.md` and `schema.spec.md`; the custom command here
   is an interim that does not preclude a later migration.)
6. **ID assignment.** `table` carries `id` (default `null`). Should insertion
   assign a generated ID (for cross-referencing) or leave it `null` for the
   document pipeline to fill? Current proposal leaves it `null`.
7. **Title attribute.** `table` has a `title` attr. Should insertion prompt for
   a caption/title, analogous to the base toolbar's link-URL prompt? Deferred.

## 10. Export changes

The pure command is **defined** in `@metanorma/editor-commands` and
**re-exported** by `@metanorma/prosemirror-editor`; the popover/adapter component
is defined in `prosemirror-editor`.

`pkg/editor-commands/src/index.ts` must add (command logic — values, not
type-only):

```typescript
export { insertTable, canInsertTable, MAX_ROWS, MAX_COLS } from "./commands/insertTable.js";
```

`pkg/prosemirror-editor/src/index.ts` must add — a **re-export** of the command
from `@metanorma/editor-commands` (so toolbar/keymap consumers can import from
one place), plus the adapter component from this package:

```typescript
export {
  insertTable,
  canInsertTable,
  MAX_ROWS,
  MAX_COLS,
} from "@metanorma/editor-commands";
export { InsertTableButton } from "./TableSizePicker.js";
```

Type-only re-exports are unnecessary: `insertTable` and `canInsertTable` are
value exports, and `InsertTableButton` is a component. If the picker exposes a
props interface, export it as a type alongside:

```typescript
export type { InsertTableButtonProps } from "./TableSizePicker.js";
```

## 11. File-structure summary

```
pkg/editor-commands/src/                  ← pure command logic (no React, no DOM)
  commands/
    insertTable.ts                        ← insertTable command, canInsertTable, buildTable
  index.ts                                ← export insertTable, canInsertTable, MAX_ROWS, MAX_COLS (§10)

pkg/prosemirror-editor/src/               ← React mount + toolbar adapter (the EditorView layer)
  TableSizePicker.tsx                     ← grid popover + InsertTableButton adapter component
  table-picker.css                        ← picker styles (side-effect import)
  index.ts                                ← re-export command from @metanorma/editor-commands;
                                            export InsertTableButton (§10)
```

## 12. TypeScript constraints

The project tsconfig enforces `strict`, `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `module: node16`. All new
code must:

- Use `import type` for type-only imports. In the command module
  (`@metanorma/editor-commands`) these are `EditorState`, `Transaction`, `Node`,
  `Schema` — **never** `EditorView` (the command must not import
  `prosemirror-view`). `EditorView` may appear only in the adapter component in
  `@metanorma/prosemirror-editor`.
- Use `.js` extensions in relative imports (e.g. `"./commands/insertTable.js"`
  inside `editor-commands`; `"./TableSizePicker.js"` inside `prosemirror-editor`).
- Treat `schema.nodes["table"]` lookups as `NodeType | undefined` under
  `noUncheckedIndexedAccess` — guard or assert before use.
- Pass `null` (not `undefined`) for defaulted attrs in `NodeType.create`, and
  omit `colspan`/`rowspan` entirely so the schema defaults (`1`) apply.
- Export all types alongside their implementations.
- The command's `rows`/`cols` parameters are optional (`rows?: number`); under
  `exactOptionalPropertyTypes`, callers must pass either a concrete number or
  omit the argument — never explicitly `undefined`.
