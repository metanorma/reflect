# Definition lists

## 1. Purpose

This document is the detailed implementation proposal for **definition-list**
support in the `AdvancedMetanormaToolbar`. It addresses the item flagged as
"out of scope" in `docs/MetanormaToolbar.spec.md` §5.5:

**Definition lists** (`dl`/`dt`/`dd`) — multi-part structure that needs
dedicated insertion logic.

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

From `pkg/prosemirror-schema/nodes.ts` (the `listNodes` group), the three
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
   All commands and keybindings below must preserve this invariant. This is
   faithful to the upstream Metanorma model: the canonical StanDoc RelaxNG
   content model for `dl` (`DlBody` in `lib/metanorma/validate/basicdoc.rng`)
   is `<oneOrMore><group><ref name="dt"/><ref name="dd"/></group></oneOrMore>`
   — the `<group>` makes the `(dt, dd)` pair the atomic repeating unit, with
   neither element carrying a cardinality modifier, so multiple `dt` or
   multiple `dd` per block are **upstream-forbidden**, not merely deferred.
   (Plain HTML's `<dl>` does permit `(dt|dd)+`, but Metanorma deliberately
   diverges.) A user wanting multiple paragraphs of description places several
   blocks inside the single `dd` (which is `block+`).

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

**Packaging note.** The schema lives in `@metanorma/prosemirror-schema`. Per
the command contract (`docs/EditorCommands.spec.md` §1.1–§1.5), the **pure
command logic** lives in `@metanorma/editor-commands`
(`pkg/editor-commands/commands/definitionList.ts`): framework-agnostic,
DOM-free, operating on `EditorState`/`Transaction` only. The **keymap
plugin**, the `EditorView`-taking toolbar `run` adapter, and `view.focus()`
belong in `@metanorma/prosemirror-editor` (consistent with the base toolbar's
packaging split and §1.13 — keymap wiring lives outside the commands package).
`@metanorma/prosemirror-editor` re-exports the commands for toolbar/UI reuse.

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
| `isActive` | `true` when selection is inside a `dl` (see §7) |
| `isEnabled` | `true` when the selection's parent accepts `block` content and `dl` is not already an ancestor at the immediate block level (see §7) |
| `run` | `run(view)` adapter: calls `insertDefinitionList(view.state, view.dispatch)` then `view.focus()` — see §5 |

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

**Note on nesting:** `dd` has content `block+`, so a `dl` is legal *inside*
a `dd` (nested definition lists). `dt` has content `inline*`, so a `dl` is
**not** legal inside a `dt`. The `canInsertBlock` check reflects this
naturally and needs no special-casing. The single entry path for a nested
`dl` is the existing `insertDefinitionList` command invoked with the cursor
inside a `dd`: the `dd`'s paragraph text promotes to the inner `dt` (per
§5.1's text-promotion behaviour), yielding a valid nested `dl`. No dedicated
`Tab`/`Shift-Tab` indent/outdent gesture is added (§6.3); nesting depth is
unconstrained by the editor in v1.

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
| `isEnabled` | `true` when selection is inside a `dl` (see §7) |
| `run` | `run(view)` adapter: calls `addDefinitionPair(view.state, view.dispatch)` then `view.focus()` — see §5 |

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
  `dd`) is listed as an open question (§10).

## 5. Commands

The two commands are pure ProseMirror `Command` functions defined in
`pkg/editor-commands/commands/definitionList.ts` (package
`@metanorma/editor-commands`).

These commands conform to the Command contract (README §6.2;
`EditorCommands.spec.md` §1.5). **Feature-specific addition:** every dispatched
transaction preserves the `(dt dd)+` invariant.

Commands resolve node types through `state.schema` per README §6.4; no
`(schema) => Command` factory is required.

### 5.1 `insertDefinitionList`

```typescript
import type { Command } from "prosemirror-state";
// Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean

/**
 * Insert a new definition list (one dt + dd pair) at the current selection,
 * replacing any selected block content with the pair. Leaves the cursor in
 * the (empty) term so the user can type the term immediately.
 * Preserves `(dt dd)+`.
 */
export function insertDefinitionList(state: EditorState, dispatch?: (tr: Transaction) => void): boolean;
```

**Algorithm.**

1. Read `schema = state.schema`, `$from = state.selection.$from` (the command receives `state`, not a `view`).
2. Guard: if `!canInsertBlock(state)` return `false`. A multi-block selection
   also returns `false` (the command does not attempt to fold several blocks
   into a single inline `dt`; the button is disabled for such selections).
3. **Promote the current paragraph's text into the `dt` (term)** rather than
   discarding it. Because `dt` is `inline*` (text directly, no paragraph) and
   `dd` is `block+` (needs a paragraph child), derive the term's inline content
   from the selection slice, then build the pair via the shared helper
   (`makePair`, §5.3). Behaviour by selection shape:
   - **Collapsed cursor / selection within a single non-empty paragraph** — the
     paragraph's text becomes the `dt` content; an empty `dd` (with an empty
     paragraph placeholder, since `dd` is `block+`) is created below it; the
     cursor lands at the start of the `dt`. This mirrors how ProseMirror's
     `wrapIn` for bullet/ordered lists turns a paragraph into the first list
     item instead of discarding its text.
   - **Empty paragraph** — no text to carry; insert an empty pair; cursor in
     the empty `dt`.
   - **Multi-block selection** — handled in step 2 (`false`); not reached.

   ```typescript
   import type { Node } from "prosemirror-model";
   import { TextSelection } from "prosemirror-state";

   const { dl, paragraph } = state.schema.nodes;

   // Derive the term's inline content from the current paragraph's text.
   // (An empty paragraph yields an empty fragment.)
   const termContent = inlineContentFromSelection(state); // Node[] of text/inline
   const [termNode, descNode] = makePair(state.schema, termContent);
   const dlNode = dl.create({}, [termNode, descNode]);
   ```

   `inlineContentFromSelection` extracts the inline nodes (text + inline
   marks) of the selection's slice, dropping any block wrappers so the
   content is legal as `dt`'s `inline*` content. For an empty paragraph it
   returns `[]`.

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

   Implementation detail: `replaceRangeWith` is preferred over
   `replaceSelectionWith` here because it correctly handles replacing the
   enclosing block when the cursor sits in an empty paragraph (the common
   "cursor on a blank line" case). Validate the chosen primitive against the
   `(dt dd)+` constraint with an assertion before dispatch.

5. Place the cursor inside the new `dt`. After insertion, resolve a position
   inside the `dt` and set a `TextSelection`:

   ```typescript
   // dl is at `start`; dt is its first child, offset 0.
   const dlPos = start;          // position of the inserted <dl>
   // dt starts at dlPos + 1 (inside dl); text position is dlPos + 2
   const termTextPos = dlPos + 2;
   tr.setSelection(TextSelection.near(tr.doc.resolve(termTextPos)));
   tr.scrollIntoView();
   dispatch?.(tr);
   return true;
   ```

   The exact offset arithmetic must be verified against the produced
   `tr.doc` (resolve and assert `resolvedPos.parent.type === dt`); offsets
   are fragile and should be derived from `tr.doc.resolve(...).parent`, not
   hard-coded.

#### Cursor-management directive

All `dt`/`dd` cursor arithmetic in
`insertDefinitionList`, `addDefinitionPair`, and the Enter/Backspace keymap
handlers **must** be derived from `tr.doc.resolve(pos)` assertions —
`parent`, `index()`, `childCount`, `after()` / `before()`, `nodeAt()` —
never from hardcoded numeric offsets. This is correct ProseMirror practice.
The specific positions the implementation derives from `ResolvedPos`:

- **"Am I in a `dt`/`dd`?"** — walk `$from` depths, compare
  `node.type === schema.nodes.dl` (the `dl` ancestor) and inspect the
  immediate child via `$from.index(depth)`. (This is how the keymap helpers
  `ancestorDepth`, `isLastChild`, `pairTermIsEmpty` in §6 are described.)
- **"Position after the current pair"** (for `addDefinitionPair`) —
  `ResolvedPos.after(depth)` at the `dl`-relative depth, not
  `parentOffset + N`.
- **"Is this the last `dd`?"** — `$from.index(ddDepth) ===
  $from.parent.childCount - 1`.
- **"Is the sibling `dt` empty?"** — resolve the pair, read
  `dtNode.content.size === 0`.

This is **enforced by a test matrix** covering: insert at start/middle/end
of a `dl`; add-pair in the last `dd`; Enter exit on an empty term;
Backspace at a `dt` start; and a nested `dl`.

### 5.2 `addDefinitionPair`

```typescript
/**
 * Insert a new (dt, dd) pair into the definition list containing the
 * selection. The pair is inserted immediately after the pair whose dd
 * currently contains the selection (or appended at the end of the dl if the
 * cursor is in the final dd). Cursor is moved into the new dt.
 * Returns false if the selection is not inside a dl. Preserves `(dt dd)+`.
 */
export function addDefinitionPair(state: EditorState, dispatch?: (tr: Transaction) => void): boolean;
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
4. Build an empty pair via the shared helper (`makePair`, §5.3) —
   `addDefinitionPair` always inserts an empty term:

   ```typescript
   const pairFragment = makePair(state.schema); // an empty (dt dd) unit
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
   dispatch?.(tr);
   ```

   Derive/verify offsets from `tr.doc.resolve(...)` rather than trusting the
   arithmetic.

### 5.3 Shared pair builder

To avoid duplicating the subtree construction (and the inline-vs-block
distinction) between the two commands, extract a private, pure helper that
resolves types through the passed schema instance. The builder accepts an
optional `termContent` inline fragment so that `insertDefinitionList` can
**promote the current paragraph's text into the `dt`** rather than discarding
it (§5.1 step 3):

```typescript
import type { Node, Schema } from "prosemirror-model";

/**
 * Build a valid (dt, dd) pair node array. When `termContent` is supplied, it
 * becomes the dt's inline content (used by insertDefinitionList to carry the
 * current paragraph's text into the term). Omit it for an empty term.
 * Pure; schema-sourced.
 */
function makePair(
  schema: Schema,
  termContent?: readonly Node[] | null,
): readonly [Node, Node] {
  const { dt, dd, paragraph } = schema.nodes;
  return [
    dt.create({}, termContent ?? []),
    dd.create({}, paragraph.create()),
  ] as const;
}
```

`insertDefinitionList` derives `termContent` from the selection's slice (see
§5.1) and calls `makePair(state.schema, termNodes)`; `addDefinitionPair` always
adds an empty pair, so it calls `makePair(state.schema)` (no `termContent`).

## 6. Editing behaviour (keymap)

This is the trickiest and most usability-critical part. ProseMirror's default
Enter handler knows nothing about `(dt dd)+`; left untouched it would happily
split a `dt` into two `dt`s (invalid) or insert a paragraph inside a `dt`
(invalid — `dt` is `inline*`). A dedicated keymap plugin is required.

**Location & boundary (EditorCommands.spec.md §1.13).** The keymap plugin
lives in `@metanorma/prosemirror-editor`, **not** in the commands package:

- File: `pkg/prosemirror-editor/plugins/definitionListKeymap.ts`, exporting
  a `Plugin` (or `InputRule[]`/keybinding object) to be registered by
  `MetanormaProseMirror`.
- It **imports the pure commands** (`insertDefinitionList`, `addDefinitionPair`)
  from `@metanorma/editor-commands` and wires them to `Enter`/`Backspace`/`Tab`.
- **Pure, state-reading helpers** shared by both the keymap and the commands
  (`jumpToSiblingDescription`, `exitDefinitionList`, `inDefinitionList`,
  `canInsertBlock`) live in `@metanorma/editor-commands` and are imported by
  the keymap. Helpers that are genuinely keymap wiring (deciding *which* key
  claims the event) stay in the keymap module. The `EditorView` never appears
  inside any of these; the keymap calls `addDefinitionPair(state, dispatch)`
  (the pure Command form), never `addDefinitionPair(view)`.

### 6.1 Enter key

`Enter` is context-sensitive based on which node contains the cursor:

| Cursor location | Enter behaviour | Result |
|---|---|---|
| In a `dt` (term) | Move cursor to the start of **its** `dd` (do not insert anything) | User types the description |
| In a `dd` (description) that is **not** the last node of the `dl` | Default behaviour (split block within dd, or move to next pair) | Normal block editing |
| In the **last** `dd` of the `dl` | **Add a new `(dt, dd)` pair** (via `addDefinitionPair`) and move cursor to the new `dt` | Grow the list |
| In the last `dd` when the term of its pair is **empty** | **Exit the dl**: insert a new paragraph after the dl, move cursor there, and remove the now-empty trailing pair if needed to keep `(dt dd)+` valid — all as a **single transaction** | Escape hatch out of the list |

The last two rows are the key UX decisions: **Enter in the last dd adds a
pair**, and **Enter in the last dd whose dt is empty exits the dl** (mirroring
how most editors let you "press Enter on an empty line to leave the list").

**Empty-pair cleanup transaction.** The trailing empty `(dt, dd)` pair and the
paragraph insertion happen in one transaction so that pressing Undo once
restores the list to its pre-exit state (cursor back inside the empty pair).
`exitDefinitionList` must therefore issue a single `tr` that both deletes the
trailing pair *and* inserts the exit paragraph, rather than dispatching two
separate transactions or splitting the work across an undo-group boundary.

```typescript
// pkg/prosemirror-editor/plugins/definitionListKeymap.ts
import {
  addDefinitionPair,
  jumpToSiblingDescription,
  exitDefinitionList,
} from "@metanorma/editor-commands";

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
    return addDefinitionPair(state, dispatch); // pure Command from editor-commands
  }
  return false; // let default Enter handle intra-dd block splitting
};
```

`ancestorDepth`, `isLastChild`, and `pairTermIsEmpty` are local keymap helpers;
`jumpToSiblingDescription` and `exitDefinitionList` are the pure commands/helpers
imported from `@metanorma/editor-commands` (they read `state` only, never a
`view`). `addDefinitionPair` is the canonical pure Command (§5.2).

### 6.2 Backspace at start

`Backspace` pressed at the **start** of a node should perform structural
merging rather than default deletion, to avoid producing an invalid tree:

| Cursor location | Backspace-at-start behaviour |
|---|---|
| Start of a `dt` (pair is not the first) | **No-op** (refuse). |
| Start of the **first** `dt` | **No-op** (refuse). |
| Start of a `dd` | **No-op** (refuse). |

The guiding rule: **never delete a `dt` or `dd` such that the remaining dl
fails `(dt dd)+`.** Backspace at the start of any `dt` or `dd` is a uniform
**no-op**: the keymap returns `false` (falls through to default, which
ProseMirror also refuses because the result would violate `(dt dd)+`). No
cross-boundary text merge, no lift-to-paragraph conversion, and no special
case for the first pair. **Rationale:** `dt` is `inline*` and `dd` is `block+`
— they are *different content kinds*, so any merge across the `dd`→`dt` (or
`dt`→`dd`) boundary is categorically lossy. Appending a term's inline text
onto the end of the previous `dd` collapses the term into the description,
destroying the term/description distinction the document model exists to
express; appending a `dd`'s block content onto a `dt`'s inline content is
schema-impossible without flattening blocks into inline. Mid-text deletion
within a `dt`/`dd`'s content is unaffected (normal text deletion); removing a
whole pair is done by selecting it and deleting (the ranged case, handled
separately to keep `(dt dd)+` valid).

### 6.3 Tab / Shift-Tab

**No special handling.** `Tab`/`Shift-Tab` are not bound by the
definition-list keymap. Nesting a `dl` inside a `dd` **is allowed** (it is
schema-permitted — `dd = block+` and `block` includes `dl`), but no dedicated
indent/outdent or `dt`↔`dd` jump gesture is introduced in v1.

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
keymap. Because they are **pure state-reading predicates** (no `EditorView`/
DOM), they live in `@metanorma/editor-commands` (`commands/definitionList.ts`,
or a small sibling `definitionListUtils.ts`) and are imported by both the
`run(view)` toolbar adapter in `@metanorma/prosemirror-editor` and the keymap
plugin — no duplication.

### 7.1 Interaction with existing list commands

Definition-list nodes do not conflict with the existing `wrapIn`/`lift`/
`toggleList` commands:

- **No conflict with `dt`/`dd`.** `dt` and `dd` are **deliberately excluded
  from the `block` group** (see `docs/schema.spec.md` §4 — the `block` row
  states it "Deliberately excludes … `dt`, `dd`"). Because `wrapIn`/`lift`/
  `toggleList` only ever target nodes in the `block` group, they can never
  accidentally operate on a bare `dt` or `dd` — those nodes only ever appear
  inside a `dl`. The `dl` itself is a `block`, so it is a legal (and the only
  relevant) target. No defensive code is needed for the `dt`/`dd` case.
- **`toggleList` is disabled inside a `dl`.** Although the ProseMirror schema's
  `list_item.content = "block+"` makes wrapping a `dl` in a bullet/ordered
  list *technically* legal, **upstream Metanorma forbids it**:
  `basicdoc.rng`'s `LiBody` is
  `<oneOrMore><ref name="paragraph-with-footnote" /></oneOrMore>` — paragraphs
  only. A `dl` (or table, figure, etc.) inside a `ul`/`ol` would produce
  **invalid StanDoc XML**. Therefore the toolbar's `toggleList` button is
  **disabled when the selection is inside (or spans) a `dl`**; the
  bullet/ordered list toggle cannot wrap a definition list. Pre-existing
  documents containing such nesting still render — this is an authoring
  constraint, not a render-time rejection. The implementer adds a guard to
  `toggleList`'s enable predicate (or the button's `disabled` logic):
  selection inside a `dl` → disabled.

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

Feature-specific accessibility additions beyond the baseline (README §2.5 /
`MetanormaToolbar.spec.md` §9):

- `dl`/`dt`/`dd` serialize to native HTML elements, which carry **implicit
  ARIA semantics** (description list / term / description). No additional
  `role` attributes are needed; do not override them.
- The insert button exposes `aria-pressed` reflecting the "inside a dl"
  state.
- Ensure the Enter keymap (§6) does not trap focus inside the list — the
  "exit dl" rule (§6.1 last row) is the escape route and must be testable
  with keyboard-only navigation.

## 10. Open questions / unknowns

These are genuine unresolved points; the recommendations above are defaults,
not final decisions.

(none remain — all questions resolved.)

## 11. Export changes

Pure commands are exported from `@metanorma/editor-commands` and re-exported
through `@metanorma/prosemirror-editor`; see the consolidated export listing
in README §5.11. This feature adds no feature-specific export notes.

## 12. File structure summary

See the consolidated file-structure summary in README §5.10. This feature
adds no feature-specific structure notes.
