# Outdent

## 1. Purpose

This document specifies the **outdent** toolbar control — a general-purpose
"decrease nesting level" button.

The base `MetanormaToolbar` handles inline marks, block wraps (`quote`,
`note`, `example`), and list insertion — all of which *increase* nesting.
There is no base control for the inverse operation: **decreasing** the
nesting level of the block at the selection. This gap is most visible with
nested `quote` (the block-wrap buttons wrap, they do not unwrap), but the
same need arises for any wrappable block.

Outdent is intentionally **not** a synonym for "convert to paragraph". A
separate "paragraph" button would conflate several distinct operations
(`setBlockType` for code blocks, `lift` for wraps, `toggleList`-unwrap for
lists, `exitDefinitionList` for `dl`), overlap existing controls, and be
disabled or destructive for atom/structural nodes. Outdent instead exposes
the single ProseMirror primitive that underlies every "decrease level"
operation — stock `lift` — as one unambiguous action that complements the
existing wrap and list buttons.

This document does **not** rehash base-spec material: the integration model,
the `ToolbarButton` descriptor shape, the plumbing, CSS conventions, and the
accessibility baseline are all defined in `MetanormaToolbar.spec.md`
(§3, §5, §7, §8, §9) and the directory `README.md`, and are assumed here.
What follows is specific to outdent and the new `outdent` toolbar group it
introduces into `AdvancedMetanormaToolbar`.

## 2. Package and export

| Aspect | Value |
|---|---|
| Command module | `pkg/editor-commands/commands/outdent.ts` (`@metanorma/editor-commands`) |
| Toolbar component | `pkg/toolbar/AdvancedMetanormaToolbar.tsx` |
| Button adapter | `pkg/toolbar/groups/outdentGroup.tsx` (the `outdent` toolbar group) |
| Command re-exported from | `@metanorma/editor-commands` (package barrel `pkg/editor-commands/index.ts`) |
| New toolbar group | `'outdent'` |
| New runtime deps | *(none — `prosemirror-commands` is already a dep)* |

Rationale, as in the base spec and sibling documents: the **pure command
logic** lives in the framework-agnostic `@metanorma/editor-commands` package
(it consumes only `EditorState`/`Transaction`, never React or the DOM — see
`EditorCommands.spec.md` §1.5/§1.8). The **toolbar-bound** concerns — the
button adapter that touches `EditorView`/`view.focus()` — live in
`@metanorma/toolbar`. This split matches the sibling feature docs and keeps
the command seam DOM-free and headless-testable.

## 3. Technical background

Outdent is provided by the **`prosemirror-commands`** package, not by the
schema or any custom command logic. The relevant export is:

| Export | Kind | Purpose |
|---|---|---|
| `lift` | command | `(state, dispatch?) => boolean` — when the selected textblock is nested inside a wrappable context, lift it out one level (decreasing nesting). Returns `false` (no-op) when there is nowhere to lift to. |

Two facts drive the whole design:

1. **No custom command logic is needed.** `prosemirror-commands`'s `lift`
   is already a plain ProseMirror command of the canonical
   `(state, dispatch?) => boolean` shape. Per
   `EditorCommands.spec.md` §1.10.3, an upstream command reused **unchanged**
   is re-exported under its standard name rather than wrapped. The
   `outdent.ts` module therefore simply re-exports `lift`.

2. **Query/dispatch parity gives `isEnabled` for free.** Calling `lift`
   without a dispatch argument performs the query (returns whether a lift is
   possible) without applying any transaction. The toolbar button's
   `isEnabled` is therefore `lift(state) === true`, and the disabled state
   reflects exactly the cases where outdent would be a no-op (§5.2).

## 4. The `outdent` toolbar group

| Button | Label | Title | Command |
|---|---|---|---|
| Outdent | Outdent | Outdent (decrease level) | `lift` (from `@metanorma/editor-commands`) |

```typescript
// pkg/toolbar/groups/outdentGroup.tsx
import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";
import { lift } from "@metanorma/editor-commands";
import type { ToolbarGroupDef } from "../types.js";

export const outdentGroup: ToolbarGroupDef = {
  id: "outdent",
  label: "Outdent",
  entries: [
    {
      kind: "button",
      descriptor: {
        key: "outdent",
        label: "Outdent",
        title: "Outdent (decrease level)",
        isActive: (_state: EditorState) => false,
        isEnabled: (state: EditorState) => lift(state) === true,
        run: (view: EditorView) => {
          lift(view.state, view.dispatch);
          view.focus();
        },
      },
    },
  ],
};
```

### 4.1 Active detection

`isActive` is always `false`. Outdent is an action, not a toggle — there is
no "outdented" state to highlight.

### 4.2 Enabled detection

`isEnabled = (state) => lift(state) === true`. Because `lift` conforms to
query/dispatch parity (§3), the dispatch-less call returns whether a lift is
possible without applying it. The button is therefore enabled exactly when
outdent would do something, and disabled exactly when it would be a no-op
(§5.2).

The button imports `lift` from `@metanorma/editor-commands` (NOT directly
from `prosemirror-commands`), per the command-layering rule (§6.2 of the
directory `README.md`, aligning with `EditorCommands.spec.md` §1.2–1.3): the
toolbar consumes commands through the editor-commands package barrel so the
schema-aware package is the single seam for pure command logic.

### 4.3 The `run` adapter

```typescript
run: (view) => {
  lift(view.state, view.dispatch);
  view.focus();
},
```

A thin toolbar adapter: delegate to the pure command, passing the editor's
real `state` and `dispatch`, then re-focus the editor (base spec §5.1.3).
No DOM, no selection rewriting, no transaction construction — all of that
lives inside `lift`.

## 5. Applicability

### 5.1 Where outdent applies

`lift` operates on the **selected textblock** (the paragraph at the
selection). When that textblock is nested inside a wrappable context, outdent
decreases its nesting level by one. Concretely:

| Context | Effect of outdent |
|---|---|
| Paragraph inside a `quote` | Lifts the paragraph out of the quote (becomes a sibling paragraph after it) |
| Paragraph inside a `note`, `example`, `review`, or `admonition` | Lifts the paragraph out of the container |
| Paragraph inside a `list_item` (nested or top-level list) | Lifts the paragraph, exiting the list item (matches the list-exit behaviour of the Enter chain) |
| Paragraph inside a `dd` (definition description) | Lifts the paragraph out of the `dd` |
| Paragraph inside a `clause`/`section` | Lifts to the parent section level |

For a nested wrap (e.g. a paragraph inside `quote > quote`), one outdent
peels off one level — press repeatedly to fully unwrap.

### 5.2 Where outdent is a no-op (button disabled)

`lift` returns `false` when the selected textblock has nowhere to lift to.
The button's `isEnabled` mirrors this exactly, so outdent is disabled in:

- A paragraph at the **top level** of a `section` / `sections` / `preface`
  (no wrappable ancestor to lift out of).
- A paragraph that is the **direct** child of a `doc` section container when
  that container cannot accept the lifted paragraph.
- Inside atom nodes (`formula`, `floating_title`, `image`) and `sourcecode`
  (these are not wrappable textblock contexts for `lift`).

When in doubt: the `lift(state) === true` query is the source of truth, not
a hand-maintained allow-list. This means `isEnabled` automatically tracks
future schema changes to wrappability.

## 6. Layering note

Outdent follows the same command-layering rule as every other
`AdvancedMetanormaToolbar` feature (directory `README.md` §6.2):

| Layer | Location | Contents |
|---|---|---|
| Pure command | `pkg/editor-commands/commands/outdent.ts` | Re-export of stock `lift` (no `EditorView`, no DOM, no `view.focus()`) |
| Toolbar button | `pkg/toolbar/groups/outdentGroup.tsx` | Group definition, `isEnabled`/`isActive`/`run` adapter, `view.focus()` |

Because the command is an unchanged upstream re-export, there is no
factory, no schema parameter, and no custom transaction logic — the
outdent feature is the thinnest possible layering of a toolbar button over
an existing ProseMirror primitive.

## 7. Relationship to existing controls

Outdent complements — does not duplicate — the existing wrap and list
controls:

| Existing control | Effect | Outdent's counterpart |
|---|---|---|
| `blocks` group (quote/note/example wrap) | Increases wrapping | Decreases wrapping (lift) |
| `lists` group (toggle bullet/ordered) | Wraps in a list | Lifts out of a list item |
| Enter key (`exitContainerBlock`) | Exits an *empty trailing* paragraph from a container | Lifts *any* selected paragraph out of its container, empty or not |

The `exitContainerBlock` command (in the Enter chain) and outdent overlap
only in the narrow case of an empty trailing paragraph; for all other
cases they are distinct (Enter exits by creating a new sibling, outdent
lifts the existing block). They can be used together without conflict.
