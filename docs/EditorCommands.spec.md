# Metanorma Editor Commands — Specification

**Status:** Greenfield. This spec defines a **new** package providing
schema-aware ProseMirror editor commands for the Metanorma Mirror document
model. It is the command-logic companion to
[`@metanorma/prosemirror-schema`](./schema.spec.md) and a consumer of the
`MetanormaProseMirror` editor mount ([`MetanormaProseMirror.spec.md`](./MetanormaProseMirror.spec.md)).

> **Scope of this document.** This revision specifies only the **general,
> cross-cutting aspects** of command implementation — the contract every command
> obeys, how commands couple to the schema, transaction discipline, testability,
> and the public-API conventions. The definitions of **individual commands** and
> **keymap / input-rule wiring** are deferred to later sections.

---

## The editor-commands module

### 1. Purpose

Provide a library of document-modification commands — ProseMirror `Command`
functions — tailored to the node/mark vocabulary and content model of
`metanormaSchema`. The package:

1. Exposes commands as plain `(state, dispatch?) => boolean` functions so they
   can be invoked from keymaps, toolbars, menus, input rules, or tests.
2. Is **schema-aware**: it resolves node and mark types through the Metanorma
   schema and adapts ProseMirror's stock behaviour where the Metanorma content
   model diverges from upstream defaults (defined in later sections).
3. Is **framework-agnostic and DOM-free**: it operates on `EditorState` /
   `Transaction` only, with no React and no DOM access, so every command is
   unit-testable headless.
4. Ships **command logic only**. It does **not** bind keys, ship a keymap plugin,
   or render UI (defined in later sections).

---

### 2. Relationship to other packages

| Package | Relationship |
|---|---|
| `@metanorma/prosemirror-schema` | **Source of truth.** Commands consume `metanormaSchema`, `NODE_NAMES`, and `MARK_NAMES`. They never redefine nodes, marks, attributes, or `toDOM`/`parseDOM`. |
| `@metanorma/prosemirror-editor` (planned) | **Consumer.** The React editor mount provides the `plugins` prop and `children` hook surface (`MetanormaProseMirror.spec.md` §5, §10) into which keymaps built from these commands are wired. This package does not import React. |
| `prosemirror-commands`, `prosemirror-schema-list` (upstream) | **Composition bases.** Where a stock upstream command works unchanged, it is reused; where the Metanorma schema diverges, this package provides an adapted/custom replacement (defined in later sections). |
| `prosemirror-state`, `prosemirror-model` | **Runtime types.** `EditorState`, `Transaction`, `Command`, `Node`, `Schema`. |

This package sits below the editor mount in the dependency graph:

```
@metanorma/prosemirror-schema
        ▲
        │
@metanorma/editor-commands          ← this package (no React, no DOM)
        ▲
        │ (commands are passed into keymaps/plugins)
@metanorma/prosemirror-editor       ← React mount (consumer)
```

---

### 3. Module layout

A new workspace package, sibling to the schema and editor packages:

```
pkg/editor-commands/
├── package.json          ← name: "@metanorma/editor-commands"
├── tsconfig.json         ← extends ../../tsconfig.json
└── src/
    ├── index.ts          ← public exports (defined in later sections)
    ├── schema.ts         ← schema-coupling helpers: name resolution, shared context (defined in later sections)
    ├── util.ts           ← shared command utilities: chain, predicates (defined in later sections)
    └── commands/         ← individual command modules (reserved for later sections)
```

> The package path and name are **decisions, not constraints.** The recommended
> name `@metanorma/editor-commands` is chosen over `@metanorma/prosemirror-commands`
> to avoid confusion with the upstream `prosemirror-commands` dependency (which
> this package itself consumes). The implementer may rename, provided the public
> exports and contract are honoured.

The package must be registered as a Yarn workspace by adding `"pkg/editor-commands"`
to the `workspaces` array in the root `package.json`.

---

### 4. Dependencies

| Package | Version | Purpose / constraint |
|---|---|---|
| `@metanorma/prosemirror-schema` | `workspace:^` | `metanormaSchema`, `NODE_NAMES`, `MARK_NAMES`. |
| `prosemirror-state` | `^1.4.4` | `EditorState`, `Transaction`, the `Command` type. Matches the editor package. |
| `prosemirror-model` | `^1.22.0` | `Node`, `Schema`, `NodeType`, `MarkType` types. Matches the schema package. |
| `prosemirror-commands` | `^1.7.1` | Stock commands to reuse/adapt (e.g. base splitting, code-newline, paragraph-near). |
| `prosemirror-schema-list` | `^1.4.0` | Stock list commands to adapt to the Metanorma `list_item` model. |

`devDependencies`: `typescript@~6.0.3` (matching the root).

No React. No DOM libraries. No `prosemirror-view` — commands never touch an
`EditorView` or the DOM (defined in later sections).

---

### 5. Command contract

Every exported command conforms to ProseMirror's `Command` type from
`prosemirror-state`:

```ts
import type { Command } from "prosemirror-state";
// Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean
```

All commands obey these invariants:

1. **Predicate when queried.** When `dispatch` is **not** supplied, a command
   acts as a pure applicability test: it returns `true` if it *would* apply in
   the given state and `false` otherwise, and it **must not** mutate any state or
   produce side effects. This makes commands usable in keymap dispatch chains
   ("first applicable command wins") and in UI enable/disable checks.
2. **Effect when dispatched.** When `dispatch` **is** supplied and the command is
   applicable, it builds exactly **one** transaction (defined in later sections), calls `dispatch(tr)`
   **exactly once**, and returns `true`.
3. **No-when-inapplicable.** When not applicable, a command returns `false`
   whether or not `dispatch` is supplied, and dispatches **nothing**.
4. **Total / non-throwing.** Commands must never throw on a well-formed
   `EditorState` that uses `metanormaSchema`. Unexpected internal conditions are
   reported by returning `false`, not by throwing. (Truly impossible states —
   e.g. a schema mismatch in a schema-parameterized factory — may throw at
   construction time, never during command execution.)
5. **Selection-aware.** Behaviour is determined by `state.selection` (collapsed
   vs. ranged, text vs. node selection) and by the resolved position's
   `$from`/`$to` context. A command documents, at minimum, which selection kinds
   it handles.

> A corollary of (1) and (2): a command may safely be called twice in quick
> succession — once without `dispatch` to test, then once with `dispatch` to
> act — and both calls are deterministic.

---

### 6. Schema coupling

Commands are bound to the Metanorma schema. The following principles govern
**every** command:

#### 6.1 Resolve types by name, through the schema instance

Commands must not hard-code node/mark lookups with unverified string literals.
Node and mark types are resolved from a `Schema` instance using names drawn from
the exported `NODE_NAMES` / `MARK_NAMES` constants, e.g.
`state.schema.nodes.list_item`. For reference equality and clarity, the package
keeps a shared, lazily-captured schema context in `src/schema.ts` (module layout section) defaulting
to `metanormaSchema`.

#### 6.2 Schema-parameterized where reuse matters

Because the schema package exposes the raw spec maps (`metanormaNodes` /
`metanormaMarks`) precisely so consumers may compose a **modified** schema
(see the schema specification), commands that are likely to be reused on a composed schema should
be exposed as **factories** `(schema: Schema) => Command` rather than closures
over the `metanormaSchema` singleton. Commands that are intrinsically specific to
the Metanorma vocabulary may bind `metanormaSchema` directly. The per-command
sections decide which form applies; the general rule is: *prefer the factory form
unless the command only makes sense for the exact Metanorma schema.*

#### 6.3 Schema facts that motivate custom logic

The Metanorma content model diverges from ProseMirror's defaults in several
places. These divergences are the reason a dedicated commands package exists
rather than a bare re-export of upstream commands. Every command author must
account for them:

| Schema fact | Implication for commands (general) |
|---|---|
| `list_item` has content `block+` (not a bare `paragraph`) | Stock list-split/lift commands that assume `paragraph`-only list items must be **adapted**; list Enter/lift logic must treat the list item's block children generically. |
| The inline line-break node is named `soft_break` (not `hardBreak`) | Any line-break command must insert `schema.nodes.soft_break`, not reference a `hardBreak` type. |
| Definition lists use `dl` = `(dt dd)+` with `dt` (`inline*`) / `dd` (`block+`) | There is **no** upstream command for this model; definition-list flow is fully custom and must preserve the `(dt dd)+` pairing invariant. |
| `sourcecode` has `code: true` | Code-newline behaviour applies inside `sourcecode`; stock code-newline detection works because `code: true` is honoured by `EditorState`. |
| A defined set of **atom** nodes (`image`, `formula`, `floating_title`, `footnote_marker`, `soft_break`) has `content: ""` | The cursor can never be *inside* these; commands must handle node-selections on and adjacency to atoms via `createParagraphNear`-style logic rather than attempting to split them. |
| Optional attrs default to `null`; the catch-all `data` attr exists on every node/mark | Commands that create nodes should rely on schema defaults (omit unset attrs) rather than constructing explicit `null`/`{}` attr maps, so `data` and defaults are preserved consistently. |

Individual commands' detailed behaviour with respect to these facts is specified
in the later, per-command sections.

---

### 7. Transaction discipline

When a command dispatches, the transaction it produces obeys:

1. **One transaction per invocation.** A single `state.tr` is built and
   dispatched once. Multi-step edits are composed *within* that transaction
   (chained steps), never by dispatching repeatedly. Multi-command sequences are
   the **caller's** responsibility, composed via chaining helpers (defined in later sections).
2. **Valid resulting selection.** After any structural change (split, insert,
   lift), the transaction must set a valid selection — typically
   `TextSelection.near(tr.doc.resolve(pos))`, or a `NodeSelection` where a node
   is the natural result. A command must never leave the selection on a position
   the content model forbids.
3. **`scrollIntoView`.** User-initiated commands (those intended for keymap /
   toolbar invocation) call `tr.scrollIntoView()` so the viewport follows the
   cursor. Pure programmatic helpers may omit it; this is noted per command.
4. **Mark preservation.** When splitting or creating textblocks, active
   formatting marks are carried to the new position using ProseMirror's standard
   mechanism (`storedMarks` / `ensureMarks`), so e.g. splitting a bold paragraph
   continues bold in the new paragraph. Per-command sections state any
   exceptions (e.g. code contexts where marks do not apply).
5. **Minimal replacement.** Ranged selections are replaced via
   `tr.replaceSelectionWith` / `tr.deleteSelection` before the structural step, so
   "type/Enter over a selection" behaves consistently across commands.

---

### 8. Purity, side-effects, and testability

1. **No DOM, no `EditorView`.** Commands read only from `EditorState` and write
   only through the supplied `dispatch` callback. They never call
   `document`, `window`, `view.dom`, or any rendering API. This guarantees
   headless executability under Node.
2. **Deterministic.** Given the same `state` and `selection`, a command produces
   the same result; it does not read clocks, randomness, or global mutable state.
3. **Fixture-driven tests.** Every command is testable by constructing an
   `EditorState` from `metanormaSchema.nodeFromJSON(...)` over a fixture document
   (a `MirrorDocument`-shaped JSON tree), invoking the command with a capturing
   `dispatch`, and asserting against the resulting `tr.doc.toJSON()` and the
   selection. No testing-library / DOM rendering is required for command logic.

---

### 9. Composition and chaining

1. **Reuse over reimplementation.** Where an upstream command is correct for the
   Metanorma schema, the package re-exports or thin-wraps it rather than
   reimplementing. Custom logic is added **only** where the Schema coupling section requires.
2. **Chaining.** Multi-step key bindings (e.g. "try A, else B, else C") are
   expressed with a chaining combinator. The package provides/re-exports a
   `chainCommands`-style helper in `src/util.ts` that runs commands in order and
   returns at the first one that applies. Callers compose command sequences with
   it; commands themselves stay single-purpose.
3. **No hidden ordering.** A command does not internally invoke sibling commands
   as an implementation shortcut unless that is its documented purpose (e.g. an
   explicit composite command). Composition is explicit at the call site.

---

### 10. Public API conventions (`src/index.ts`)

1. **Every exported symbol is a `Command`** (or a `(schema) => Command` factory,
   per the Schema coupling section). No non-command helpers are part of the public API unless explicitly
   documented.
2. **Naming.** Commands are named for the **action** they perform
   (`splitParagraph`, `insertSoftBreak`, …), not for the key that triggers them
   (never `enterKey`, `onEnter`). Key binding is a separate concern (defined in later sections).
3. **Re-exports.** Upstream commands that are re-used unchanged are re-exported
   under their standard names so consumers can import all commands from one
   package. Adapted/custom commands use Metanorma-specific names where they
   differ in behaviour from the upstream namesake.
4. **Schema helpers.** `src/schema.ts` may export small internal helpers (e.g.
   `nodeAt`, `isInside`) but these are not part of the documented public API
   unless listed here.

The concrete export list is populated by the per-command sections; this section
fixes only the conventions.

---

### 11. TypeScript constraints

Inherits the root `tsconfig.json` (`strict`, `noImplicitAny`,
`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`,
`isolatedModules`, `module: node16`):

1. **`import type`** for all type-only imports from `prosemirror-state`,
   `prosemirror-model`, `prosemirror-commands`, `prosemirror-schema-list`, and
   `@metanorma/prosemirror-schema`.
2. **The `Command` type** is imported from `prosemirror-state`; exported commands
   are annotated `: Command`.
3. **No `undefined`-valued optionals.** When constructing attr objects or
   selection options, use conditional spreads rather than assigning `undefined`
   (`exactOptionalPropertyTypes`).
4. **`$from`/`$to` indexing** under `noUncheckedIndexedAccess`: results of
   `selection.$from.parent` etc. are non-optional, but any indexed access into
   arrays (e.g. `node.child(0)`) must be null-checked where the API permits
   `undefined`.

---

### 12. Acceptance criteria

These are the **general** criteria every command and the package as a whole must
satisfy; per-command criteria are added in later sections.

1. **Compile.** `yarn workspace @metanorma/editor-commands compile` succeeds with
   **zero** TypeScript errors under the repo tsconfig.
2. **Command-shape conformance.** Every exported command is assignable to
   `Command` (`(state: EditorState, dispatch?: (tr: Transaction) => void) => boolean`).
3. **Query/dispatch parity.** For a representative set of states, calling a
   command without `dispatch` returns the same boolean as calling it with a
   no-op `dispatch` would dispatch (i.e. the predicate matches the effect).
4. **No mutation on query.** Calling any command without `dispatch` leaves
   `state.doc` and `state.selection` reference-equal and unchanged.
5. **Single dispatch.** When applicable, a command invokes the supplied
   `dispatch` **exactly once** with **exactly one** transaction.
6. **No throw.** No command throws on any well-formed `EditorState` over
   `metanormaSchema` (asserted by a fuzz over fixture positions).
7. **Schema-bound.** Commands resolve every node/mark through a `Schema` instance
   using `NODE_NAMES`/`MARK_NAMES`-derived names; there are no bare, unchecked
   `schema.nodes.<literal>` references that could silently return `undefined`.
8. **Headless.** The package's test suite runs under Node with no DOM
   (`jsdom`/`@testing-library` are **not** required for command tests).
9. **No React / no `prosemirror-view`.** The package declares neither as a
   dependency; importing either from `src/` fails the compile.
10. **Valid selection after dispatch.** For every dispatching fixture, the
    resulting transaction's selection resolves without error on `tr.doc`.

---

### 13. Specified elsewhere

- **Definitions of individual commands** (e.g. paragraph split, list split/lift,
  code newline, definition-list flow, line-break insertion, atom-adjacent
  paragraph creation). This document fixes only the contract and conventions they
  share.
- **Keymap bindings** (mapping physical keys such as `Enter`, `Shift-Enter`,
  `Mod-Enter` to commands). Keymap wiring lives in the editor mount's `plugins`
  prop or a dedicated keymap package; it is intentionally separate from command
  logic (Purpose section, Public API conventions section).
- **Input rules**, menu/toolbar UI, and collaborative-editing bindings.
- **Command serialization / undo grouping policy** beyond ProseMirror's default
  transaction history.
- Any DOM- or view-level concern (selection rectangles, scroll behaviour beyond
  `scrollIntoView`, focus management).

---

## The Enter key

This section specifies the **Enter-key-handling feature** of the
`MetanormaProseMirror` editor: the complete, context-dependent behaviour of the
primary **Enter** key across every editing context the Metanorma schema permits,
including deeply nested documents. It is the first of the command-specific
sections deferred from "The editor-commands module".

Enter is the single most context-sensitive key in a structured editor. In the
Metanorma model the same keypress must, depending on where the cursor is, split
a paragraph, continue or exit a list, commit a definition term, start a new
definition entry, insert a newline inside source code, create a paragraph next
to an atom, or lift the cursor out of a container. The governing rule is:

> **Enter never produces a transaction the schema would reject, and never does
> something the user does not expect for the context.** When the two could
> conflict, schema safety wins; when several behaviours are schema-legal, the
> least surprising one for a word-processor user wins.

The feature is delivered as a set of commands in
`@metanorma/editor-commands`, composed into a single `enterKey` dispatch chain
and bound to the Enter key by a keymap plugin wired into the editor mount (see
the MetanormaProseMirror spec). This section specifies the per-context
behaviour, the composition, and the binding.

### Scope

In scope:

- Behaviour of the **primary Enter key** for every editing context reachable in
  a `metanormaSchema` document.
- The command inventory the feature introduces, and the dispatch order that
  selects among them.
- The schema-preservation and user-expectation invariants each branch honours.
- The keymap binding contract (which key, which platforms, how it is wired into
  the mount).

Out of scope (handled by other keys or elsewhere):

- **Shift-Enter** inserts an inline `soft_break` node and is a *different*
  command; it is contrasted here only to prevent the two being conflated (see
  "Relationship to Shift-Enter").
- **Mod-Enter** / **Ctrl-Enter** / **Keypad-Enter**: not bound by default.
- Table row/column insert/delete via Enter (`prosemirror-tables` is not
  integrated — Enter inside a cell splits the cell's textblock only).
- Input rules, paste handling, drag-and-drop, and collaborative bindings.

### What determines Enter's behaviour

Enter's effect is a pure function of the editor state at the moment of the
keypress. The relevant inputs are:

1. **Selection kind.**
   - *Collapsed* (a blinking cursor) — the common case; all positional logic
     below applies.
   - *Ranged* (a non-collapsed text selection spanning inline content and/or
     whole blocks).
   - *Node* (a whole node selected via gap cursor or keyboard node-selection).
2. **Innermost textblock** — the nearest ancestor of the selection whose content
   is inline (`paragraph`, `sourcecode`, `dt`).
3. **Container stack** — the chain of ancestors from the textblock up to the
   document root (`list_item`, `bullet_list`/`ordered_list`, `dl`, `dd`,
   `note`/`example`/`quote`/`review`/`admonition`, `figure`, `table_cell`, and
   the section/structural nodes).
4. **Cursor zone within the textblock:**
   - *start* — collapsed at the leading boundary;
   - *middle* — collapsed strictly inside the content;
   - *end* — collapsed at the trailing boundary;
   - *empty* — the textblock has no content (start = end = empty).
5. **Marks** active at the cursor (relevant only for carrying formatting across a
   split — see the Transaction discipline section).

The decision tables below key off these inputs.

### The Enter dispatch chain

Enter is one exported command, `enterKey`, defined as an ordered composition (a
`chainCommands`-style combinator — see the Composition and chaining section).
The first command in the chain that is *applicable* in the current state runs
and the rest are skipped; if none is applicable, Enter does nothing (returns
`false`, dispatches nothing).

The chain is ordered **most-specific context first, most-generic last**:

```
enterKey = chainCommands(
  newlineInCode,          // 1. inside sourcecode
  enterDefinitionList,    // 2. inside dl / dt / dd
  splitListItem,          // 3. inside a list_item
  exitContainerBlock,     // 4. empty para at the end of a container block
  createParagraphNear,    // 5. node-selection on / gap-cursor beside an atom
  splitBlockKeepMarks,    // 6. default: split the innermost textblock
)
```

Rationale for the order: code-newline and definition-list flow must preempt the
generic split because their textblocks (`sourcecode`, `dt`, the boundary cases
of `dd`) are not plain splittable paragraphs; list and container exit must
preempt the default split so that pressing Enter on an empty list item or empty
trailing paragraph exits the construct rather than adding yet another empty
paragraph inside it; `createParagraphNear` must preempt the split for node
selections on atoms (which have no inline content to split). The generic split
is the fallback.

**Nesting is resolved by each command's nearest-ancestor check, not by global
recursion.** When the cursor sits in, say, a paragraph inside a `note` inside a
`list_item`, `splitListItem` sees that the cursor is *not* in the list item's
direct textblock and returns `false`; control falls through to
`exitContainerBlock` (the note) or, failing that, to `splitBlockKeepMarks`.
This gives correct precedence for arbitrary nesting depths without any command
needing to know the full stack.

Every branch obeys the global Command contract and Transaction discipline. In
particular, each branch that applies to a *ranged* selection first performs a
minimal replacement (`deleteSelection` / `replaceSelectionWith`) so that "Enter
over a selection" behaves identically across all branches.

### Behaviour by context

The tables below give the observable effect of Enter for each context, plus the
schema invariant the branch must preserve. "Node" rows for non-atom blocks are
covered once under "Atoms and node selections" and referenced from the
per-context tables.

#### Plain paragraphs

The innermost textblock is a `paragraph`, and no list / container / dl / table
context alters the behaviour (the nearest "interesting" ancestor is a section or
the document body).

| Selection | Zone | Effect | Invariant preserved |
|---|---|---|---|
| Collapsed | start (non-empty) | Insert an empty paragraph **before**; cursor lands at the start of that new (upper) empty paragraph. *(Deliberate adaptation of upstream `splitBlock`, which leaves the cursor with the original content; the word-processor convention places it in the new line above.)* | Parent gains a sibling block; still valid. |
| Collapsed | middle | Split into two paragraphs at the cursor; active marks carried to the new paragraph. | Two `inline*` blocks; valid. |
| Collapsed | end | Insert an empty paragraph after; cursor in it. | New trailing block; valid. |
| Collapsed | empty | Insert another empty paragraph after; cursor in it. (Container/list exit is handled upstream in the chain.) | New block; valid. |
| Ranged | any | Delete the selected range, then split at the resulting position per the collapsed rules. | `inline*` reflows; valid. |
| Node | — | See "Atoms and node selections" (a `paragraph` is a non-atom block). | — |

Marks are carried across a split via ProseMirror's `splitBlock`-with-`storedMarks`
mechanism so that, for example, pressing Enter inside a bold paragraph continues
bold in the new paragraph.

#### Source code (`sourcecode`)

`sourcecode` has content `text*` and `code: true`; it is the only code context
in the schema.

| Selection | Zone | Effect | Invariant preserved |
|---|---|---|---|
| Collapsed | any | Insert a newline character (`\n`) into the sourcecode text at the cursor. Do **not** split the block, do **not** insert a `soft_break` node, do **not** exit. | Stays a single `text*` block; valid. |
| Ranged | any | Replace the range with a newline. | `text*`; valid. |
| Node | — | See "Atoms and node selections" (`sourcecode` is a non-atom block). | — |

The newline is plain text, matching round-tripping expectations: the
`sourcecode` records `\n`, never a node.

#### Lists (`bullet_list`, `ordered_list`, `list_item`)

`list_item` content is `block+` — generalised, not paragraph-only (see the
Schema coupling section). The cursor's innermost textblock is typically a
`paragraph` directly inside a `list_item`.

| Selection | Zone | Context | Effect | Invariant |
|---|---|---|---|---|
| Collapsed | middle | non-empty paragraph in a list_item | Split the paragraph; the tail becomes the first block of a **new list_item** after the current one (list continues). | `list_item+`; ≥1 item. |
| Collapsed | end | non-empty last block of a list_item | New **list_item** with an empty first paragraph; cursor in it (list continues). | `list_item+`. |
| Collapsed | start | non-empty paragraph in a list_item | Split the paragraph in place (per the plain-paragraph rule); list structure unaffected. | `list_item+`. |
| Collapsed | empty | the empty paragraph is in a **top-level** list_item | **Exit the list**: replace the empty paragraph + its item with an empty paragraph *after* the list; if the list would become empty, remove the list entirely. | No empty `bullet_list`/`ordered_list` left behind. |
| Collapsed | empty | the empty paragraph is in a **nested** list_item | **Exit one level**: lift the empty paragraph into the parent list_item as a trailing block; remove the nested list if it becomes empty. | Parent item keeps `block+`; no empty nested list. |
| Ranged | within one item | any | Delete the range, then apply the collapsed rule at the resulting position. | `list_item+`. |
| Ranged | spanning items | — | Delete the range (which may merge items), then apply the collapsed rule at the join. | Resulting list still `list_item+`. |
| Node | — | — | See "Atoms and node selections". | — |

Because list items are generalised, the split operates on whichever block type
the cursor is in (a paragraph, a nested list's paragraph, …), not on an assumed
`paragraph` parent. Enter **always continues the list** when the item has
content; it never adds a sibling block *within* the same item (that is a
deliberate match to universal list-editing expectation).

#### Definition lists (`dl`, `dt`, `dd`)

`dl` content is `(dt dd)+`; the **alternation invariant** is the dominant
constraint. The dl is therefore never left with two adjacent `dt` or two
adjacent `dd` nodes, and never with a trailing `dt` lacking a `dd`.

| Selection | Zone | Context | Effect | Invariant |
|---|---|---|---|---|
| Collapsed | any | inside a `dt` that has a following `dd` | **Commit the term**: move the cursor to the start of that `dd`'s first block. No new node. | `(dt dd)+` intact. |
| Collapsed | any | inside a `dt` with no following `dd` *(defensive; should not occur in a valid doc)* | Insert a `dd` (empty paragraph) after the `dt`; cursor in it. | Restores `(dt dd)+`. |
| Collapsed | middle, or end of a non-last block | inside a `dd` | Split the inner block in place, within the `dd` (fallback `splitBlockKeepMarks`). | `dd` `block+`; alternation intact. |
| Collapsed | end of the LAST block | the `dd` is the LAST child of the `dl`, block non-empty | **Start a new entry**: insert a `(dt empty, dd empty-paragraph)` pair after the `dd`; cursor in the new `dt`. | New complete pair; `(dt dd)+`. |
| Collapsed | empty | the LAST `dd`'s only block is an empty paragraph | **Exit the dl**: remove the trailing `(dt dd)` pair; if it was the only pair, remove the `dl`; insert an empty paragraph after; cursor in it. | No dangling `dt`; no empty `dl`. |
| Collapsed | empty | empty paragraph in a `dd` that is NOT last | Split in place (another paragraph in the `dd`); never exit mid-dl. | `(dt dd)+`. |
| Ranged | any | within `dt` or `dd` | Delete the range, then apply the collapsed rule. | Alternation preserved. |
| Node | — | — | See "Atoms and node selections". | — |

A new entry is always created as a complete `(dt dd)` pair, so the dl is valid
at every intermediate state. Enter **never splits a `dt`** (terms are
single-line); the way to "finish" a term is Enter, which moves to its `dd`.

#### Container blocks (`note`, `example`, `quote`, `review`, `admonition`, `figure`)

These nodes share content `block+` (for `figure`, `(image | block)*`). They are
"wrapper" blocks the user enters and later wants to leave.

| Selection | Zone | Context | Effect | Invariant |
|---|---|---|---|---|
| Collapsed | start / middle | non-empty block in the container | Split the inner block in place; container unaffected. | Container keeps `block+`. |
| Collapsed | end | last block, non-empty | Split the inner block; the tail stays inside the container. | `block+`. |
| Collapsed | empty | the container's **last** block is an empty paragraph | **Exit the container**: lift an empty paragraph out to sit *after* the container (sibling in the container's parent); if the container would become empty, remove it. | No empty container left; parent content model honoured. |
| Collapsed | empty | an empty paragraph that is NOT the container's last block | Split in place (add another paragraph inside). Exiting mid-container would reorder siblings unexpectedly. | `block+`. |
| Ranged | any | within the container | Delete the range, then apply the collapsed rule. | `block+`. |
| Node | — | — | See "Atoms and node selections". | — |

The exit rule is what lets the user "press Enter on the last empty line to leave
the note/quote/figure." For `figure`, exiting leaves the figure (with its image
and caption blocks) intact and creates a paragraph after it.

> `footnote_entry` also has content `block+` but is **excluded** from the exit
> rule: its parent `footnotes` requires `footnote_entry+` and does not accept a
> stray paragraph, so there is no valid place to lift to. Enter inside a
> `footnote_entry` therefore only ever splits the inner block (or adds a
> paragraph); exiting a footnote is left to dedicated commands / arrow keys.

#### Tables (`table`, `table_cell`)

`prosemirror-tables` is not integrated. Enter therefore performs **no row or
cell management**.

| Selection | Zone | Context | Effect | Invariant |
|---|---|---|---|---|
| Collapsed | any | inside a `table_cell`'s textblock | Split the inner block **inside the cell** (the plain-paragraph rule). Never add a row, never leave the cell. | `table_cell` `block+`; `table_row+`, `table_cell+` untouched. |
| Collapsed | empty | the cell's last block is an empty paragraph | **Do not exit the cell destructively.** Either split in place (another paragraph in the cell) or, if that would be unhelpful, do nothing. Tables must not lose their last cell/row. | `table_cell+` / `table_row+` never violated. |
| Ranged | any | within a cell | Delete the range, then split per the collapsed rule. | `block+`. |
| Node | — | on table parts | `false` (no table restructuring on Enter). | — |

The deliberate choice here is predictability over cleverness: Enter inside a
table does what it does in a paragraph, nothing more.

#### Atoms and node selections (`image`, `formula`, `floating_title`)

`image`, `formula`, and `floating_title` are block-level atoms (empty content,
`atom: true`). The cursor cannot rest *inside* them; it can only node-select
them or sit in a gap cursor beside them. (`footnote_marker` and `soft_break`
are *inline* atoms and are never the target of Enter — Enter inside a paragraph
that contains them just splits the paragraph around them.)

| Selection | Context | Effect | Invariant |
|---|---|---|---|
| Node selection on an atom | `image` / `formula` / `floating_title` | **`createParagraphNear`**: insert an empty paragraph adjacent to the atom (before it if the selection is at the front, after it otherwise); cursor in the new paragraph. | New paragraph is a legal sibling; atom untouched. |
| Gap cursor immediately before/after an atom | — | Same: create an adjacent empty paragraph on the cursor's side; cursor in it. | New paragraph is a legal child of the atom's parent. |
| Node selection on a **non-atom** block (`paragraph`, `sourcecode`, `note`, `clause`, …) | — | Return `false` (Enter does nothing). Restructuring whole blocks or sections on Enter is surprising; dedicated commands handle those, and the user can arrow into the block to type. | — |

#### Structural and section nodes

The cursor is always inside some textblock; it is never "inside" a `clause`,
`sections`, `doc`, etc. in a way that Enter would split. Therefore:

- Enter **never creates a new section** (`clause`, `annex`, …). New sections are
  introduced by dedicated commands/toolbars, not by Enter, because auto-creating
  sections on Enter would violate user expectation in a hierarchical document.
- Enter **never splits a section node.**
- For leaf sections whose content is `block+` (`abstract`, `foreword`,
  `introduction`, `acknowledgements`), Enter on the last empty paragraph simply
  adds another paragraph inside; it does not exit into the parent. The
  schema-safety rule below still applies: the section is never left with zero
  blocks.

### Schema-preservation guarantees

Every branch of `enterKey` upholds the following invariants. They are testable
properties (see the test matrix) and take precedence over any "nice to have"
behaviour:

1. **No empty required-`+` container is ever left behind.** If a branch would
   leave a parent whose content expression requires one-or-more (`list_item+`,
   `table_row+`, `table_cell+`, `block+` in a container, `(dt dd)+` in a dl,
   `footnote_entry+` in footnotes, `block+` in a leaf section) with zero
   children, the branch instead removes that parent (and recurses upward) so the
   document stays valid.
2. **The `(dt dd)+` alternation of `dl` is never broken.** No transaction
   produced by Enter contains two adjacent `dt` nodes or two adjacent `dd`
   nodes, nor a trailing `dt` without a `dd`.
3. **Atoms are never split or entered.** `image`, `formula`, `floating_title`,
   `footnote_marker`, `soft_break` are never given content; Enter beside one
   creates an adjacent paragraph instead.
4. **No transaction leaves the selection on a forbidden position.** After any
   structural step the selection resolves to a valid cursor (typically via
   `TextSelection.near`), never inside an atom or between two structural nodes
   where inline content is disallowed.
5. **Section boundaries are respected.** Enter never moves content across a
   section boundary in a way the content model forbids.
6. **Marks are preserved or explicitly dropped.** Marks active at the split are
   carried to the new block via `storedMarks`, except where a mark is illegal in
   the destination (none currently exist in the schema, but the rule is stated
   for forward-compatibility).

### User-expectation guarantees

Where several schema-legal behaviours exist, Enter picks the one a
word-processor user expects:

1. **Enter continues structures, then exits them.** Lists and definition lists
   continue while they have content; they exit on the empty trailing item/entry.
2. **Enter on empty exits one nesting level at a time**, not all at once:
   pressing Enter on an empty paragraph in a nested list exits the inner list
   first; a second Enter exits the outer list.
3. **Enter over a selection deletes first**, then acts — identical to typing.
4. **Enter near an atom makes a place to type**, rather than leaving the user
   stranded with nowhere to put the cursor.
5. **Enter inside a table is inert** (no surprise row/cell deletion).
6. **Enter never silently restructures the document hierarchy** (no new
   sections, no moved clauses, no split atoms).

When in doubt, Enter's effect matches the platform's dominant word-processor
(Word / Google Docs) for the analogous construct.

### Command inventory

The Enter feature introduces the following commands in
`@metanorma/editor-commands`. Each is an exported `Command` (or a
`(schema) => Command` factory where reuse on a composed schema matters — see the
Schema coupling section) and conforms to the Command contract.

| Command | Form | Source | Responsibility |
|---|---|---|---|
| `newlineInCode` | `Command` | adapted from `prosemirror-commands` | Insert a `\n` when the cursor is inside a `code: true` block (only `sourcecode`). Preempts all other branches. |
| `enterDefinitionList` | `Command` | custom | Manage the `(dt dd)+` flow: commit a term to its `dd`, start a new `(dt dd)` entry, or exit the `dl`. Preempts the generic split. |
| `splitListItem` | `(schema) => Command` | adapted from `prosemirror-schema-list` | Continue a `bullet_list`/`ordered_list` by splitting the item's inner block into a new item, or exit the list (one level) on an empty trailing item. Generalised for `list_item` content `block+`. |
| `exitContainerBlock` | `Command` | custom | Lift an empty trailing paragraph out of a `block+` container (`note`, `example`, `quote`, `review`, `admonition`, `figure`), removing the container if it would become empty. |
| `createParagraphNear` | `Command` | re-exported from `prosemirror-commands` | Create an empty paragraph adjacent to a node-selected atom or at a gap cursor beside one. |
| `splitBlockKeepMarks` | `Command` | adapted from `prosemirror-commands` | Default fallback: split the innermost textblock (typically a `paragraph`) carrying active marks, after deleting any ranged selection. |
| `enterKey` | `Command` | custom (composition) | The chain of all the above in the documented order; this is what the keymap binds to Enter. |

`enterKey` is the only symbol the keymap needs; the individual commands are also
exported so consumers can compose alternative Enter behaviours or reuse them in
other keymaps.

### Keymap binding

The Enter feature is wired into the editor through a keymap plugin supplied to
`MetanormaProseMirror` via its `plugins` prop (the mount itself remains
keymap-agnostic — see the MetanormaProseMirror spec). The binding contract:

- **Key:** `"Enter"` (the numeric keypad's Enter is delivered as the same key by
  `prosemirror-keymap`; no separate binding is required).
- **Bound command:** `enterKey` (the chain above).
- **Platform notes:**
  - `"Mod-Enter"`, `"Shift-Enter"`, and `"Alt-Enter"` are **not** bound by this
    feature.
  - `"Shift-Enter"` is bound separately to the `insertSoftBreak` command (which
    inserts a `soft_break` inline node); see "Relationship to Shift-Enter".
- **Precedence:** the Enter keymap is appended via the mount's `plugins` prop
  and therefore runs alongside, and may be overridden by, consumer-supplied
  plugins. The `reactKeys` plugin always remains first and does not handle
  Enter.

A reference keymap plugin (lives outside this package — e.g. in the editor mount
or a dedicated `@metanorma/editor-keymap` package):

```ts
import { keymap } from "prosemirror-keymap";
import { enterKey, insertSoftBreak } from "@metanorma/editor-commands";

export function metanormaEnterKeymap() {
  return keymap({
    Enter: enterKey,
    "Shift-Enter": insertSoftBreak,
  });
}
```

Wiring: `<MetanormaProseMirror plugins={[metanormaEnterKeymap(), …]} />`.

### Relationship to Shift-Enter

To prevent the two line-break keys from being conflated:

| Key | Command | Effect | When |
|---|---|---|---|
| `Enter` | `enterKey` | Structural: split block / continue-or-exit list / commit term / start entry / code newline / paragraph-near atom. | Always (the subject of this section). |
| `Shift-Enter` | `insertSoftBreak` | Insert an inline `soft_break` node at the cursor (a line break *within* the current block). No structural change. | Only inside textblocks that allow inline content (`paragraph`, `dt`, a `dd`'s paragraph, a list item's paragraph). Inside `sourcecode`, `Shift-Enter` also inserts a `\n` (same as Enter, since there is no `soft_break` in code). |

The distinction mirrors every major word-processor: **Enter ends the paragraph;
Shift-Enter breaks the line.**

### Test matrix

Each row is a fixture (an `EditorState` built from a `MirrorDocument`), an
Enter keypress, and an assertion on the resulting `tr.doc.toJSON()` and
selection. The matrix is exhaustive over the contexts above; representative
rows:

- **P1** paragraph, cursor mid-text → two paragraphs, second starts with the
  tail; marks preserved; cursor at start of the second.
- **P2** non-empty paragraph, cursor at start → empty paragraph inserted before;
  cursor in the new (upper) empty paragraph.
- **P3** paragraph, cursor at end → empty paragraph after; cursor in it.
- **P4** ranged selection within a paragraph → selection deleted, then split.
- **C1** `sourcecode`, cursor anywhere → `\n` inserted into text; block count
  unchanged.
- **L1** non-empty paragraph in a list item, cursor at end → new list item with
  empty paragraph; cursor in it.
- **L2** empty paragraph in a top-level list item → list exited; empty paragraph
  after the list; list removed if it had only that item.
- **L3** empty paragraph in a nested list item → inner list exited one level;
  outer list intact.
- **L4** ranged selection spanning two list items → items merged, then split per
  the collapsed rule.
- **D1** cursor in a `dt` with a following `dd` → cursor moves to the `dd`; no
  new node.
- **D2** cursor in a `dt` with no following `dd` → new `dd` (empty paragraph)
  inserted; cursor in it.
- **D3** non-empty paragraph at the end of the last `dd` → new `(dt dd)` pair
  inserted; cursor in the new `dt`.
- **D4** empty paragraph as the only block of the last `dd` → dl exited; the
  trailing pair (and the dl, if it was the only one) removed; empty paragraph
  after.
- **N1** non-empty paragraph in a `note`, cursor mid-text → split inside the
  note.
- **N2** empty last paragraph in a `note` → note exited; empty paragraph after;
  note removed if it had only that paragraph.
- **T1** paragraph in a `table_cell`, cursor mid-text → split inside the cell;
  row/cell count unchanged.
- **T2** empty paragraph in a `table_cell` → no exit; another paragraph in the
  cell (or no-op); cell/row count unchanged.
- **A1** node-selected `image` / `formula` / `floating_title` → adjacent empty
  paragraph created on the selection's side.
- **A2** gap cursor beside an atom → adjacent empty paragraph on that side.
- **A3** node-selected non-atom block (a `paragraph`, a `clause`, …) → no-op
  (`false`).
- **S1** every exit branch: assert no `bullet_list` / `ordered_list` / `dl` /
  container / table part / leaf section is left with fewer children than its
  content expression requires.
- **S2** every `dl`-affecting branch: assert no two adjacent `dt` or `dd`, and
  no trailing `dt` without a `dd`.

Every row must also satisfy the global Acceptance criteria: single dispatch, no
throw, valid resulting selection, query/dispatch parity, and headless
executability.
