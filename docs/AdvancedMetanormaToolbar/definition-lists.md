# Definition lists

## 1. Purpose

This document is the detailed implementation proposal for **definition-list**
support in the `AdvancedMetanormaToolbar`. It addresses the item flagged as
"out of scope" in `docs/MetanormaToolbar.spec.md` §5.5:

> **Definition lists** (`dl`/`dt`/`dd`) — multi-part structure that needs
> dedicated insertion logic.

Definition lists are fundamentally different from the single-node operations
(marks, `wrapIn` block wraps, `toggleList`) covered by the base toolbar. A
definition list is a **multi-part, paired structure**: one `dl` must contain
one or more `(dt, dd)` pairs — a **term** (`dt`) immediately followed by its
**description** (`dd`). The schema content expression for `dl` is the strict
`(dt dd)+`, which means:

- A `dt` must always be followed by a `dd` (never another `dt`, never end of
  list).
- A `dd` must always be preceded by a `dt` (a lone `dd` is invalid).
- At least one `(dt, dd)` pair must always exist — an empty `dl` is invalid.

Because of this invariant, definition lists cannot be inserted by `wrapIn`
(which wraps existing content in a single node) and cannot be toggled like
`bullet_list`/`ordered_list`. They require a dedicated command that
**builds a valid subtree** (term + description) in one transaction, plus
custom editing behaviour (Enter, Backspace) to keep the `(dt dd)+` invariant
intact as the user types. This document specifies both.

It does **not** re-specify the base toolbar's marks, block wraps, or list
toggle commands — see `docs/MetanormaToolbar.spec.md` for those.

## 2. Schema recap

From `pkg/prosemirror-schema/src/nodes.ts` (the `listNodes` group), the three
node specs are:

| Node | `content` | `group` | `attrs` | `toDOM` | `parseDOM` | Role |
|---|---|---|---|---|---|---|
| `dl` | `(dt dd)+` | `block` | `DATA_ATTR` (`{ data: { default: {} } }`) | `["dl", 0]` | `[{ tag: "dl" }]` | definition list container |
| `dt` | `inline*` | — (no group) | `DATA_ATTR` | `["dt", 0]` | `[{ tag: "dt" }]` | term — **inline content only** |
| `dd` | `block+` | — (no group) | `DATA_ATTR` | `["dd", 0]` | `[{ tag: "dd" }]` | description — **block content** |

Group constants: `BLOCK_GROUP = "block"`, `INLINE_GROUP = "inline"`.
`DATA_ATTR` provides the `{ data: { default: {} } }` attribute carried by all
three nodes.

Key consequences for the implementation:

1. **Pairing constraint.** The `dl` content expression `(dt dd)+` is enforced
   by ProseMirror. Any transaction that would produce two consecutive `dt`s,
   a `dd` without a preceding `dt`, or an empty `dl` is **rejected** by the
   schema (`Node.create` / `replaceWith` throws or `tr.doc` validation fails).
   All commands and keybindings below must preserve this invariant.

2. **`dt` is inline-only.** `dt` content is `inline*`, so the term holds text
   and inline marks **directly** — it is **not** wrapped in a `paragraph`.
   Inserting a `paragraph` inside a `dt` is invalid.

3. **`dd` is block-only.** `dd` content is `block+`, so the description
   requires at least one block child. The minimal valid `dd` contains a single
   empty `paragraph`.

4. **These are not `prosemirror-listlist` nodes.** `dl`/`dt`/`dd` are plain
   nesting with a custom content expression. ProseMirror ships no built-in
   definition-list behaviour — Enter, Tab, Backspace, and dt/dd navigation
   all need custom handling (§6).

## 3. Integration model

Definition-list support plugs into the same context the base toolbar uses.
The toolbar renders inside the `<ProseMirror>` context as a child of
`MetanormaProseMirror`; it reads state with `useEditorStateSelector` and
dispatches commands with `useEditorEventCallback` from
`@handlewithcare/react-prosemirror`. **No state props are passed to buttons.**

Each control is a `ToolbarButton` descriptor (identical interface to the base
toolbar):

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

CSS classes reuse the `mn-toolbar` prefix; definition-list-specific modifiers
are documented in §8.

> **Packaging note.** The schema lives in `@metanorma/prosemirror-schema`. The
> commands and keymap belong in `@metanorma/prosemirror-editor` (they import
> `metanormaSchema` node types and editor APIs), consistent with the base
> toolbar's packaging split.

## 4. Buttons

Two controls are proposed. The primary one inserts a fresh definition list;
the secondary one extends the list at the cursor with another term/description
pair.

### 4.1 Button: Insert definition list

Inserts a new `dl` containing exactly one `(dt, dd)` pair at the current
selection, and places the cursor in the `dt` so the user can type the term.

| Field | Value |
|---|---|
| `key` | `"insert-definition-list"` |
| `label` | `"Def list"` (rendered as `≡` or "DL" — see §8 icon note) |
| `title` | `"Insert definition list"` |
| `isActive` | `true` when selection is inside a `dl` (see §5) |
| `isEnabled` | `true` when the selection's parent accepts `block` content and `dl` is not already an ancestor at the immediate block level (see §5) |
| `run` | `insertDefinitionList(view)` — see §5 |

**Active detection.** A definition list is active when the selection is inside
a `dl` node, found by walking the resolution from `$from` up the depth stack
looking for `schema.nodes.dl`:

```typescript
function inDefinitionList($pos: ResolvedPos): boolean {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type === $pos.node(d).type.schema.nodes.dl) return true;
  }
  return false;
}
```

**Enabled detection.** `dl` is in the `block` group, so it is legal wherever
a block is accepted — top-level sections, clauses, table cells, list items,
`dd` (nested), etc. The button is enabled when the parent's content
expression includes the `block` group. ProseMirror exposes this via
`selection.$from.parent.contentMatchAt(parent.childCount).matchType(...)`; a
practical check is:

```typescript
function canInsertBlock(state: EditorState): boolean {
  const { $from } = state.selection;
  // dl is a block node; legal iff parent accepts a block at the cursor
  return $from.parent.contentMatchAt($from.index()).matchType(
    state.schema.nodes.dl,
  ) !== null;
}
```

Inside atom/inline-only nodes (`formula`, `floating_title`, `image`,
`sourcecode`, a `dt`) the parent does not accept `block`, so the check
correctly returns `false`.

> **Note on nesting:** `dd` has content `block+`, so a `dl` is legal *inside*
> a `dd` (nested definition lists). `dt` has content `inline*`, so a `dl` is
> **not** legal inside a `dt`. The `canInsertBlock` check reflects this
> naturally and needs no special-casing.

### 4.2 Button: Add term + description

Active only inside a `dl`. Appends (or, if the cursor is mid-list, inserts
at the cursor position) a new `(dt, dd)` pair and moves the cursor into the
new `dt`.

| Field | Value |
|---|---|
| `key` | `"add-definition-pair"` |
| `label` | `"+ term"` |
| `title` | `"Add term and description"` |
| `isActive` | `false` (this is an insert action, not a toggle) |
| `isEnabled` | `true` when selection is inside a `dl` (see §5) |
| `run` | `addDefinitionPair(view)` — see §5 |

### 4.3 Justification of the button set

- **`insertDefinitionList`** is mandatory: it is the only way to create the
  first valid `(dt dd)+` pair, because `wrapIn` cannot synthesize the
  term/description children.
- **`addDefinitionPair`** is provided because extending a list with a second
  term is the single most common follow-up edit, and doing it by hand (create
  `dt`, create `dd`, fight the content expression) is error-prone. Enter from
  a `dd` also adds a pair (§6), but a button gives a discoverable, always-on
  affordance.
- **No separate "Insert term only" / "Insert description only" buttons.**
  These would be dangerous: inserting a lone `dt` (without a following `dd`)
  or a lone `dd` (without a preceding `dt`) violates `(dt dd)+`. The pair is
  the atomic unit of definition-list editing, so both controls operate on
  whole pairs. A future "split description" affordance (for multi-paragraph
  `dd`) is listed as an open question (§9).

## 5. Commands

Defined in `pkg/prosemirror-editor/src/commands/definitionList.ts`.

### 5.1 `insertDefinitionList`

```typescript
import type { Command, EditorView } from "@handlewithcare/prosemirror-types";
// (or the project's canonical Command/EditorView import path)

/**
 * Insert a new definition list (one dt + dd pair) at the current selection,
 * replacing any selected block content with the pair. Leaves the cursor in
 * the (empty) term so the user can type the term immediately.
 *
 * Returns `true` if a transaction was dispatched.
 */
export function insertDefinitionList(view: EditorView): boolean;
```

Also exported in the idiomatic ProseMirror `Command` form for reuse outside
the toolbar (e.g. from a menu or keyboard handler):

```typescript
export const insertDefinitionListCommand: Command;
```

**Algorithm.**

1. Read `state = view.state`, `schema = state.schema`, `$from = state.selection.$from`.
2. Guard: if `!canInsertBlock(state)` return `false`.
3. Build a valid subtree. Because `dt` is `inline*` (text directly, no
   paragraph) and `dd` is `block+` (needs a paragraph child):

   ```typescript
   import { metanormaSchema } from "@metanorma/prosemirror-schema";
   import type { Node, ResolvedPos } from "prosemirror-model";
   import { TextSelection } from "prosemirror-state";
   import { Selection } from "prosemirror-state";

   const { dl, dt, dd, paragraph } = metanormaSchema.nodes;

   // dt holds inline content directly (no paragraph wrapper)
   const termNode = dt.create({}, []);
   // dd requires at least one block child — an empty paragraph
   const descNode = dd.create({}, paragraph.create());
   const dlNode = dl.create({}, [termNode, descNode]);
   ```

4. Replace the selection. If the selection covers block content (e.g. the user
   selected a paragraph), use `tr.replaceSelectionWith(dlNode)` when the
   selection is a leaf/cursor, or a `replaceWith` against the parent range
   when the selection spans whole blocks. The simplest correct primitive is:

   ```typescript
   const tr = state.tr;
   // Replace the whole current block(s) with the dl, then drop the cursor
   // into the term.
   const start = $from.before($from.depth);
   const end = $from.end($from.depth) + 1; // +1 to include the block boundary
   tr.replaceRangeWith(start, end, dlNode);
   ```

   > Implementation detail: `replaceRangeWith` is preferred over
   > `replaceSelectionWith` here because it correctly handles replacing the
   > enclosing block when the cursor sits in an empty paragraph (the common
   > "cursor on a blank line" case). Validate the chosen primitive against the
   > `(dt dd)+` constraint with an assertion before dispatch.

5. Place the cursor inside the new `dt`. After insertion, resolve a position
   inside the `dt` and set a `TextSelection`:

   ```typescript
   // dl is at `start`; dt is its first child, offset 0.
   const dlPos = start;          // position of the inserted <dl>
   // dt starts at dlPos + 1 (inside dl); text position is dlPos + 2
   const termTextPos = dlPos + 2;
   tr.setSelection(TextSelection.near(tr.doc.resolve(termTextPos)));
   tr.scrollIntoView();
   view.dispatch(tr);
   return true;
   ```

   The exact offset arithmetic must be verified against the produced
   `tr.doc` (resolve and assert `resolvedPos.parent.type === dt`); offsets
   are fragile and should be derived from `tr.doc.resolve(...).parent`, not
   hard-coded.

### 5.2 `addDefinitionPair`

```typescript
/**
 * Insert a new (dt, dd) pair into the definition list containing the
 * selection. The pair is inserted immediately after the pair whose dd
 * currently contains the selection (or appended at the end of the dl if the
 * cursor is in the final dd). Cursor is moved into the new dt.
 *
 * No-op (returns false) if the selection is not inside a dl.
 */
export function addDefinitionPair(view: EditorView): boolean;
export const addDefinitionPairCommand: Command;
```

**Algorithm.**

1. Guard: find the enclosing `dl` and its depth (`dlDepth`); return `false`
   if none.
2. Find the `dd` that contains the selection (walk up from `$from` to the
   first `dd` ancestor, `ddDepth`).
3. Compute the insertion position **immediately after** that `dd` (i.e.
   `posAfter = $from.end(ddDepth) + 1`). This is the position *inside the dl*
   but after the current dd — exactly where a new `(dt, dd)` pair is legal,
   because the preceding `dd` satisfies the trailing-dd requirement of the
   previous pair and the new `dt` begins a new pair.
4. Build the same pair used by `insertDefinitionList`:

   ```typescript
   const termNode = dt.create({}, []);
   const descNode = dd.create({}, paragraph.create());
   const pairFragment = [termNode, descNode]; // a valid (dt dd) unit
   ```

5. Insert with `tr.insert(posAfter, pairFragment)`. Because we insert a
   complete `(dt dd)` pair adjacent to an existing `dd`, the resulting dl
   still matches `(dt dd)+`. Inserting a lone `dt` or lone `dd` here would
   break the invariant and must be avoided.
6. Move the cursor into the new `dt`:

   ```typescript
   const newTermPos = posAfter + 1; // inside the dl, at start of new dt
   tr.setSelection(TextSelection.near(tr.doc.resolve(newTermPos)));
   tr.scrollIntoView();
   view.dispatch(tr);
   ```

   Derive/verify offsets from `tr.doc.resolve(...)` rather than trusting the
   arithmetic.

### 5.3 Shared pair builder

To avoid duplicating the subtree construction (and the inline-vs-block
distinction) between the two commands, extract a private helper:

```typescript
/** Build a fresh, valid (dt, dd) pair node array. */
function makePair(): readonly [Node, Node] {
  const { dt, dd, paragraph } = metanormaSchema.nodes;
  return [dt.create({}, []), dd.create({}, paragraph.create())] as const;
}
```

Both commands call `makePair()` for their `[termNode, descNode]`.

## 6. Editing behaviour (keymap)

This is the trickiest and most usability-critical part. ProseMirror's default
Enter handler knows nothing about `(dt dd)+`; left untouched it would happily
split a `dt` into two `dt`s (invalid) or insert a paragraph inside a `dt`
(invalid — `dt` is `inline*`). A dedicated keymap plugin is required.

Proposed file: `pkg/prosemirror-editor/src/plugins/definitionListKeymap.ts`,
exporting a `Plugin` (or `InputRule[]`/keybinding object) to be registered by
`MetanormaProseMirror`.

### 6.1 Enter key

`Enter` is context-sensitive based on which node contains the cursor:

| Cursor location | Enter behaviour | Result |
|---|---|---|
| In a `dt` (term) | Move cursor to the start of **its** `dd` (do not insert anything) | User types the description |
| In a `dd` (description) that is **not** the last node of the `dl` | Default behaviour (split block within dd, or move to next pair) | Normal block editing |
| In the **last** `dd` of the `dl` | **Add a new `(dt, dd)` pair** (via `addDefinitionPair`) and move cursor to the new `dt` | Grow the list |
| In the last `dd` when the term of its pair is **empty** | **Exit the dl**: insert a new paragraph after the dl, move cursor there, and remove the now-empty trailing pair if needed to keep `(dt dd)+` valid | Escape hatch out of the list |

The last two rows are the key UX decisions and are flagged as open questions
in §9. The recommended default: **Enter in the last dd adds a pair**, and
**Enter in the last dd whose dt is empty exits the dl** (mirroring how most
editors let you "press Enter on an empty line to leave the list").

```typescript
const handleEnter: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const ddDepth = ancestorDepth($from, state.schema.nodes.dd);
  if (ddDepth === null) return false;          // not in a dd
  const dtDepth = ancestorDepth($from, state.schema.nodes.dt);
  if (dtDepth !== null) {
    // In a term: jump to this pair's dd (the next sibling).
    return jumpToSiblingDescription(state, dispatch, dtDepth);
  }
  // In a dd: is it the last child of the dl? is its term empty?
  if (isLastChild($from, ddDepth) && pairTermIsEmpty(state, ddDepth)) {
    return exitDefinitionList(state, dispatch);
  }
  if (isLastChild($from, ddDepth)) {
    return addDefinitionPairCommand(state, dispatch);
  }
  return false; // let default Enter handle intra-dd block splitting
};
```

`ancestorDepth`, `isLastChild`, `pairTermIsEmpty`, `jumpToSiblingDescription`,
and `exitDefinitionList` are private helpers in the same module.

### 6.2 Backspace at start

`Backspace` pressed at the **start** of a node should perform structural
merging rather than default deletion, to avoid producing an invalid tree:

| Cursor location | Backspace-at-start behaviour |
|---|---|
| Start of a `dt` (pair is not the first) | Merge this pair's dt text into the end of the previous pair's dd content (across the dd→dt boundary) — or, if that is undesirable, lift the pair out / refuse. Open question (§9). |
| Start of the **first** `dt` | No-op (or lift the whole dl → convert to paragraph; open question) |
| Start of a `dd` | Merge with the preceding dt? — `dd` is block, `dt` is inline, so merging is lossy. Recommended: **no-op** to protect the invariant; user must use Enter navigation. |

The guiding rule: **never delete a `dt` or `dd` such that the remaining dl
fails `(dt dd)+`.** If an operation would leave a lone `dt` or lone `dd`, the
keymap either refuses (returns `false`, falling through to default) or removes
the entire `dl`.

### 6.3 Tab / Shift-Tab

Optional (open question). Possible semantics: Tab moves focus from `dt` → its
`dd`; Shift-Tab moves `dd` → its `dt`. Indentation (nesting a `dl` inside a
`dd`) is a separate concern and left open.

### 6.4 Arrow-key navigation

Recommended: `ArrowDown` at the end of a `dt` moves to the start of its `dd`;
`ArrowUp` at the start of a `dd` moves to the end of its `dt`. These are
quality-of-life niceties; the default ProseMirror vertical motion usually
handles them acceptably because `dt`/`dd` are block-level, so this is a
polish item, not a correctness requirement.

### 6.5 Registration

The keymap is a `Plugin` appended to the editor's plugin list (alongside
history, the base keymap, etc.):

```typescript
export function definitionListKeymap(): Plugin;
```

It should bind `Enter` and `Backspace` with **higher precedence** than the
base keymap (use a higher-priority `keymap` plugin or return `true` to claim
the event). Commands that don't apply return `false` so the default handler
runs.

## 7. Active / enabled detection (consolidated)

| Predicate | Implementation | Used by |
|---|---|---|
| inside a `dl` | walk `$from` depths, compare `node.type === schema.nodes.dl` | `insertDefinitionList` active; `addDefinitionPair` enabled |
| parent accepts `block` | `$from.parent.contentMatchAt($from.index()).matchType(schema.nodes.dl) !== null` | `insertDefinitionList` enabled |
| inside a `dd` | walk `$from` for `schema.nodes.dd` | Enter handler |
| inside a `dt` | walk `$from` for `schema.nodes.dt` | Enter handler |

`canInsertBlock` and `inDefinitionList` are shared between the buttons and the
keymap; export them (or a small `definitionListUtils.ts`) to avoid duplication.

## 8. Styling

Reuse the base `mn-toolbar` classes (`mn-toolbar-btn`, `--active`, `--disabled`).
Definition-list-specific classes are added only where the rendering needs to
differ — primarily the **editor content** side, not the toolbar chrome:

| Selector | Purpose |
|---|---|
| `.mn-toolbar-btn[data-key="insert-definition-list"]` | optional icon/text variant for the dl button |
| `dl` / `dt` / `dd` (in editor CSS, e.g. `style.css`) | native elements render with implicit semantics; add `dl { display: block; } dt { font-weight: 600; } dd { margin: 0 0 0 1.5em; }` as a sensible default |
| `.mn-deflist--nested` (open) | visual indent for nested dl inside dd, if nesting is supported |

The `dl`/`dt`/`dd` render as native HTML elements via the schema `toDOM`
(`["dl", 0]`, `["dt", 0]`, `["dd", 0]`), so no custom class is required for
correctness — only optional visual polish.

**Icon note:** the base spec uses emoji/unicode glyphs. For the definition
list, `≡` (identical-to) or the text label `DL` is recommended; final icon is
a design decision left to the implementer.

## 9. Accessibility

- The toolbar buttons expose `aria-pressed` (for the insert button, reflecting
  "inside a dl") and `aria-label` / `title` per §4. The "add pair" button is
  an action (not a toggle) so it carries `aria-label` only.
- `disabled` is set when `isEnabled` is `false`.
- `dl`/`dt`/`dd` serialize to native HTML elements, which carry **implicit
  ARIA semantics** (description list / term / description). No additional
  `role` attributes are needed; do not override them.
- Keyboard users reach the term/description via normal cursor movement and the
  Enter navigation defined in §6. Ensure the Enter keymap does not trap focus
  inside the list — the "exit dl" rule (§6.1 last row) is the escape route and
  must be testable with keyboard-only navigation.

## 10. Open questions / unknowns

These are genuine unresolved points; the recommendations above are defaults,
not final decisions.

1. **Enter in the last `dd`: exit vs. add pair.** The spec recommends
   "add a pair unless the current term is empty, in which case exit." An
   alternative is a hard rule "Enter in the last dd always adds a pair" and a
   separate gesture (e.g. `Shift-Enter`, or `Esc`) to exit. Needs UX sign-off.
2. **Multiple `dd` per `dt`.** The schema forbids it (`(dt dd)+` enforces
   exactly one `dd` per `dt`). Is one description per term the intended
   authoring model, or does the schema need `(dt dd+)+` to allow several
   descriptions? This is a **schema-level** question; if multi-dd is required,
   the spec's pair model and the Enter/Backspace rules must be revisited.
3. **Converting an existing paragraph into a dl.** `insertDefinitionList` as
   specified replaces/replaces-range the current block with an empty pair.
   Should selecting a paragraph and invoking the command instead turn the
   paragraph's text into the `dt` (term) and leave the `dd` empty for the
   description? Not specified — currently the paragraph text is discarded.
4. **Nested definition lists.** A `dl` inside a `dd` is schema-legal
   (`dd` is `block+`). Should the toolbar support creating/recognizing nested
   lists, and how should Tab/Shift-Tab handle nesting depth? Left open.
5. **Interaction with existing list commands.** The base `toggleList` (bullet/
   ordered) operates on `prosemirror-listlist`-style nodes, not `dl`. Confirm
   there is no conflict (e.g. `lift`/`wrapIn` accidentally catching `dt`/`dd`).
   The `dl` group membership (`block`) means a bullet-list `wrapIn` around a
   selected `dl` is technically legal — decide whether to allow wrapping a dl
   in a list item or block it.
6. **Cursor management across dt/dd.** The offset arithmetic in §5 and the
   Enter/Backspace navigation (§6) is delicate. A robust approach derives all
   positions from `tr.doc.resolve(...).parent` assertions rather than
   hard-coded offsets; this needs implementation-time validation and tests.
7. **"Definition list properties" UI.** `dl`/`dt`/`dd` all carry a `data`
   attribute (`DATA_ATTR`). Is there a need for an inspector/properties panel
   to edit `data` (e.g. ids, classes) per definition list? Out of scope for
   this proposal but noted for the future.
8. **Backspace merge semantics across the dd→dt boundary.** `dd` is block,
   `dt` is inline — merging text across them is lossy. Whether to merge, lift,
   or refuse is undecided; the spec recommends refusing to protect the
   invariant.
9. **Empty-pair cleanup.** When exiting a dl by Enter-on-empty-term, the
   trailing empty pair must be removed to keep `(dt dd)+` valid (an empty `dt`
   is schema-legal but undesirable). Confirm the cleanup transaction and its
   undo coalescing with the exit.

## 11. Export changes

`pkg/prosemirror-editor/src/index.ts` must add:

```typescript
export { insertDefinitionList, addDefinitionPair } from "./commands/definitionList.js";
export {
  insertDefinitionListCommand,
  addDefinitionPairCommand,
} from "./commands/definitionList.js";
export { definitionListKeymap } from "./plugins/definitionListKeymap.js";
```

If the detection helpers are surfaced for reuse (recommended):

```typescript
export { inDefinitionList, canInsertBlock } from "./commands/definitionList.js";
```

## 12. File structure summary

```
pkg/prosemirror-editor/src/
  commands/
    definitionList.ts        ← insertDefinitionList, addDefinitionPair,
                                insertDefinitionListCommand,
                                addDefinitionPairCommand, makePair,
                                inDefinitionList, canInsertBlock
  plugins/
    definitionListKeymap.ts  ← Enter/Backspace (and optional Tab/arrows)
                                keymap Plugin
  AdvancedMetanormaToolbar.tsx ← (or within the toolbar group config)
                                registers the two ToolbarButton descriptors
  index.ts                   ← add exports (§11)
```

> The `ToolbarButton` descriptors themselves (the objects satisfying the
> interface in §3) live wherever the advanced toolbar assembles its button
> list; only the commands and keymap are separately exported for reuse.
