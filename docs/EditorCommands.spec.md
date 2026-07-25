# Metanorma Editor Commands — Specification

This spec defines the package providing schema-aware ProseMirror editor commands
for the Metanorma Mirror document model. It is the command-logic companion to
[`@metanorma/prosemirror-schema`](./schema.spec.md); its commands are wired into
the `MetanormaProseMirror` editor mount via the consumer's `plugins` prop.

**Spec version:** 2
**Spec dependencies:** [`schema.spec.md`](./schema.spec.md) v3

> **Scope of this document.** This revision specifies only the **general,
> cross-cutting aspects** of command implementation — the contract every command
> obeys, how commands couple to the schema, transaction discipline, testability,
> and the public-API conventions. The definitions of **individual commands** and
> **keymap / input-rule wiring** are deferred to later sections.

---

## 1. The editor-commands module

### 1.1 Purpose

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

### 1.2 Relationship to other packages

| Package | Relationship |
|---|---|
| `@metanorma/prosemirror-schema` | **Source of truth.** Commands consume `metanormaSchema`, `NODE_NAMES`, and `MARK_NAMES`. They never redefine nodes, marks, attributes, or `toDOM`/`parseDOM`. |
| `@metanorma/prosemirror-editor` | **Consumer.** The React editor mount provides the `plugins` prop and `children` hook surface (`MetanormaProseMirror.spec.md` §5, §10) into which keymaps built from these commands are wired. This package does not import React. |
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

### 1.3 Module layout

A new workspace package, sibling to the schema and editor packages:

```
pkg/editor-commands/
├── package.json          ← name: "@metanorma/editor-commands"
├── tsconfig.json         ← extends ../../tsconfig.json
├── index.ts              ← public exports (defined in later sections)
├── schema.ts             ← schema-coupling helpers: name resolution, shared context (defined in later sections)
├── util.ts               ← shared command utilities: chain, predicates (defined in later sections)
└── commands/             ← individual command modules (reserved for later sections)
```

> The package path and name are **decisions, not constraints.** The recommended
> name `@metanorma/editor-commands` is chosen over `@metanorma/prosemirror-commands`
> to avoid confusion with the upstream `prosemirror-commands` dependency (which
> this package itself consumes). The implementer may rename, provided the public
> exports and contract are honoured.

The package must be registered as a Yarn workspace by adding `"pkg/editor-commands"`
to the `workspaces` array in the root `package.json`.

---

### 1.4 Dependencies

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

### 1.5 Command contract

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

### 1.6 Schema coupling

Commands are bound to the Metanorma schema. The following principles govern
**every** command:

#### 1.6.1 Resolve types by name, through the schema instance

Commands must not hard-code node/mark lookups with unverified string literals.
Node and mark types are resolved from a `Schema` instance using names drawn from
the exported `NODE_NAMES` / `MARK_NAMES` constants, e.g.
`state.schema.nodes.list_item`. For reference equality and clarity, the package
keeps a shared, lazily-captured schema context in `schema.ts` (§1.3) defaulting
to `metanormaSchema`.

#### 1.6.2 Schema-parameterized where reuse matters

Because the schema package exposes the raw spec maps (`metanormaNodes` /
`metanormaMarks`) precisely so consumers may compose a **modified** schema
(see the schema specification), commands that are likely to be reused on a composed schema should
be exposed as **factories** `(schema: Schema) => Command` rather than closures
over the `metanormaSchema` singleton. Commands that are intrinsically specific to
the Metanorma vocabulary may bind `metanormaSchema` directly. The per-command
sections decide which form applies; the general rule is: *prefer the factory form
unless the command only makes sense for the exact Metanorma schema.*

#### 1.6.3 Schema facts that motivate custom logic

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
| A defined set of **atom** nodes (`image`, `formula`, `floating_title`, `footnote_marker`, `soft_break`, `stem`) has `content: ""` | The cursor can never be *inside* these; commands must handle node-selections on and adjacency to atoms via `createParagraphNear`-style logic rather than attempting to split them. |
| Optional attrs default to `null`; the catch-all `data` attr exists on every node/mark | Commands that create nodes should rely on schema defaults (omit unset attrs) rather than constructing explicit `null`/`{}` attr maps, so `data` and defaults are preserved consistently. |

Individual commands' detailed behaviour with respect to these facts is specified
in the later, per-command sections.

---

### 1.7 Transaction discipline

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

### 1.8 Purity, side-effects, and testability

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

### 1.9 Composition and chaining

1. **Reuse over reimplementation.** Where an upstream command is correct for the
   Metanorma schema, the package re-exports or thin-wraps it rather than
   reimplementing. Custom logic is added **only** where §1.6 requires.
2. **Chaining.** Multi-step key bindings (e.g. "try A, else B, else C") are
   expressed with a chaining combinator. The package provides/re-exports a
   `chainCommands`-style helper in `util.ts` that runs commands in order and
   returns at the first one that applies. Callers compose command sequences with
   it; commands themselves stay single-purpose.
3. **No hidden ordering.** A command does not internally invoke sibling commands
   as an implementation shortcut unless that is its documented purpose (e.g. an
   explicit composite command). Composition is explicit at the call site.

---

### 1.10 Public API conventions (`index.ts`)

1. **Every exported symbol is a `Command`** (or a `(schema) => Command` factory,
   per §1.6.2). No non-command helpers are part of the public API unless explicitly
   documented.
2. **Naming.** Commands are named for the **action** they perform
   (`splitParagraph`, `insertSoftBreak`, …), not for the key that triggers them
   (never `enterKey`, `onEnter`). Key binding is a separate concern (defined in later sections).
3. **Re-exports.** Upstream commands that are re-used unchanged are re-exported
   under their standard names so consumers can import all commands from one
   package. Adapted/custom commands use Metanorma-specific names where they
   differ in behaviour from the upstream namesake.
4. **Schema helpers.** `schema.ts` may export small internal helpers (e.g.
   `nodeAt`, `isInside`) but these are not part of the documented public API
   unless listed here.

The concrete export list is populated by the per-command sections; this section
fixes only the conventions.

---

### 1.11 TypeScript constraints

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

### 1.12 Acceptance criteria

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
   dependency; importing either from the package fails the compile.
10. **Valid selection after dispatch.** For every dispatching fixture, the
    resulting transaction's selection resolves without error on `tr.doc`.

---

### 1.13 Specified elsewhere

- **Definitions of individual commands** (e.g. paragraph split, list split/lift,
  code newline, definition-list flow, line-break insertion, atom-adjacent
  paragraph creation). This document fixes only the contract and conventions they
  share.
- **Keymap bindings** (mapping physical keys such as `Enter`, `Shift-Enter`,
  `Mod-Enter` to commands). Keymap wiring lives in the editor mount's `plugins`
  prop or a dedicated keymap package; it is intentionally separate from command
  logic (§1.1, §1.10.2).
- **Input rules**, menu/toolbar UI, and collaborative-editing bindings.
- **Command serialization / undo grouping policy** beyond ProseMirror's default
  transaction history.
- Any DOM- or view-level concern (selection rectangles, scroll behaviour beyond
  `scrollIntoView`, focus management).

---

## 2. The Enter key

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
`@metanorma/editor-commands`, composed into a single dispatch chain (§2.3) and
bound to the Enter key by a keymap plugin wired into the editor mount (see
the MetanormaProseMirror spec). This section specifies the per-context
behaviour, the composition, and the binding.

### 2.1 Scope

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

### 2.2 What determines Enter's behaviour

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
   split — see §1.7).

The decision tables below key off these inputs.

### 2.3 The Enter dispatch chain

The Enter behaviour is an ordered composition of the individual commands
introduced in §2.7, assembled with the `chainCommands`-style combinator (§1.9.2).
The first command in the chain that is *applicable* in the current state runs
and the rest are skipped; if none is applicable, Enter does nothing (returns
`false`, dispatches nothing).

Per §1.10.2 (commands are named for the action, not the key that triggers them),
the package does **not** export a composite `enterKey`/`onEnter` symbol. The
chain is assembled at the call site — specifically, in the keymap plugin
specified in §2.8 — so that composition is explicit (§1.9.3) and keymap wiring
stays outside the command package (§1.13).

The recommended order is **most-specific context first, most-generic last**:

```
chainCommands(
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

### 2.4 Behaviour by context

The tables below give the observable effect of Enter for each context, plus the
schema invariant the branch must preserve. "Node" rows for non-atom blocks are
covered once under §2.4.7 and referenced from the per-context tables.

#### 2.4.1 Plain paragraphs

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
| Node | — | See §2.4.7 (a `paragraph` is a non-atom block). | — |

Marks are carried across a split via ProseMirror's `splitBlock`-with-`storedMarks`
mechanism so that, for example, pressing Enter inside a bold paragraph continues
bold in the new paragraph.

#### 2.4.2 Source code (`sourcecode`)

`sourcecode` has content `text*` and `code: true`; it is the only code context
in the schema.

| Selection | Zone | Effect | Invariant preserved |
|---|---|---|---|
| Collapsed | any | Insert a newline character (`\n`) into the sourcecode text at the cursor. Do **not** split the block, do **not** insert a `soft_break` node, do **not** exit. | Stays a single `text*` block; valid. |
| Ranged | any | Replace the range with a newline. | `text*`; valid. |
| Node | — | See §2.4.7 (`sourcecode` is a non-atom block). | — |

The newline is plain text, matching round-tripping expectations: the
`sourcecode` records `\n`, never a node.

#### 2.4.3 Lists (`bullet_list`, `ordered_list`, `list_item`)

`list_item` content is `block+` — generalised, not paragraph-only (see §1.6). The cursor's innermost textblock is typically a
`paragraph` directly inside a `list_item`.

| Selection | Zone | Context | Effect | Invariant |
|---|---|---|---|---|
| Collapsed | middle | non-empty paragraph in a list_item | Split the paragraph; the tail becomes the first block of a **new list_item** after the current one (list continues). | `list_item+`; ≥1 item. |
| Collapsed | end | non-empty last block of a list_item | New **list_item** with an empty first paragraph; cursor in it (list continues). | `list_item+`. |
| Collapsed | start | non-empty paragraph in a list_item | Split the paragraph; the (empty) head stays in the current item and the tail becomes the first block of a **new list_item** after it (list continues — see the always-continues rule below). | `list_item+`; ≥1 item. |
| Collapsed | empty | the empty paragraph is in a **top-level** list_item | **Exit the list**: replace the empty paragraph + its item with an empty paragraph *after* the list; if the list would become empty, remove the list entirely. | No empty `bullet_list`/`ordered_list` left behind. |
| Collapsed | empty | the empty paragraph is in a **nested** list_item | **Exit one level**: lift the empty paragraph into the parent list_item as a trailing block; remove the nested list if it becomes empty. | Parent item keeps `block+`; no empty nested list. |
| Ranged | within one item | any | Delete the range, then apply the collapsed rule at the resulting position. | `list_item+`. |
| Ranged | spanning items | — | Delete the range (which may merge items), then apply the collapsed rule at the join. | Resulting list still `list_item+`. |
| Node | — | — | See §2.4.7. | — |

Because list items are generalised, the split operates on whichever block type
the cursor is in (a paragraph, a nested list's paragraph, …), not on an assumed
`paragraph` parent. Enter **always continues the list** when the item has
content; it never adds a sibling block *within* the same item (that is a
deliberate match to universal list-editing expectation).

#### 2.4.4 Definition lists (`dl`, `dt`, `dd`)

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
| Node | — | — | See §2.4.7. | — |

A new entry is always created as a complete `(dt dd)` pair, so the dl is valid
at every intermediate state. Enter **never splits a `dt`** (terms are
single-line); the way to "finish" a term is Enter, which moves to its `dd`.

#### 2.4.5 Container blocks (`note`, `example`, `quote`, `review`, `admonition`, `figure`)

These nodes share content `block+` (for `figure`, `(image | block)*`). They are
"wrapper" blocks the user enters and later wants to leave.

| Selection | Zone | Context | Effect | Invariant |
|---|---|---|---|---|
| Collapsed | start / middle | non-empty block in the container | Split the inner block in place; container unaffected. | Container keeps `block+`. |
| Collapsed | end | last block, non-empty | Split the inner block; the tail stays inside the container. | `block+`. |
| Collapsed | empty | the container's **last** block is an empty paragraph | **Exit the container**: lift an empty paragraph out to sit *after* the container (sibling in the container's parent); if the container would become empty, remove it. | No empty container left; parent content model honoured. |
| Collapsed | empty | an empty paragraph that is NOT the container's last block | Split in place (add another paragraph inside). Exiting mid-container would reorder siblings unexpectedly. | `block+`. |
| Ranged | any | within the container | Delete the range, then apply the collapsed rule. | `block+`. |
| Node | — | — | See §2.4.7. | — |

The exit rule is what lets the user "press Enter on the last empty line to leave
the note/quote/figure." For `figure`, exiting leaves the figure (with its image
and caption blocks) intact and creates a paragraph after it.

> `footnote_entry` also has content `block+` but is **excluded** from the exit
> rule: its parent `footnotes` requires `footnote_entry+` and does not accept a
> stray paragraph, so there is no valid place to lift to. Enter inside a
> `footnote_entry` therefore only ever splits the inner block (or adds a
> paragraph); exiting a footnote is left to dedicated commands / arrow keys.

#### 2.4.6 Tables (`table`, `table_cell`)

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

#### 2.4.7 Atoms and node selections (`image`, `formula`, `floating_title`)

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

#### 2.4.8 Structural and section nodes

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

### 2.5 Schema-preservation guarantees

Every branch of the Enter chain upholds the following invariants. They are testable
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
   `footnote_marker`, `soft_break`, `stem` are never given content; Enter beside one
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

### 2.6 User-expectation guarantees

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

### 2.7 Command inventory

The Enter feature introduces the following commands in
`@metanorma/editor-commands`. Each is an exported `Command` (or a
`(schema) => Command` factory where reuse on a composed schema matters — see
§1.6) and conforms to the Command contract.

| Command | Form | Source | Responsibility |
|---|---|---|---|
| `newlineInCode` | `Command` | adapted from `prosemirror-commands` | Insert a `\n` when the cursor is inside a `code: true` block (only `sourcecode`). Preempts all other branches. |
| `enterDefinitionList` | `Command` | custom | Manage the `(dt dd)+` flow: commit a term to its `dd`, start a new `(dt dd)` entry, or exit the `dl`. Preempts the generic split. |
| `splitListItem` | `(schema) => Command` | adapted from `prosemirror-schema-list` | Continue a `bullet_list`/`ordered_list` by splitting the item's inner block into a new item, or exit the list (one level) on an empty trailing item. Generalised for `list_item` content `block+`. |
| `exitContainerBlock` | `Command` | custom | Lift an empty trailing paragraph out of a `block+` container (`note`, `example`, `quote`, `review`, `admonition`, `figure`), removing the container if it would become empty. |
| `createParagraphNear` | `Command` | re-exported from `prosemirror-commands` | Create an empty paragraph adjacent to a node-selected atom or at a gap cursor beside one. |
| `splitBlockKeepMarks` | `Command` | adapted from `prosemirror-commands` | Default fallback: split the innermost textblock (typically a `paragraph`) carrying active marks, after deleting any ranged selection. |

The package also re-exports the `chainCommands` combinator (§1.9.2) so consumers
can assemble the chain. No composite "enter" symbol is exported: per §1.10.2 the
chain is composed at the call site (the keymap plugin of §2.8), which also keeps
the composition explicit (§1.9.3) and keymap wiring outside the package (§1.13).
Consumers may reorder or substitute commands to build alternative Enter
behaviours.

### 2.8 Keymap binding

The Enter feature is wired into the editor through a keymap plugin supplied to
`MetanormaProseMirror` via its `plugins` prop (the mount itself remains
keymap-agnostic — see the MetanormaProseMirror spec). The binding contract:

- **Key:** `"Enter"` (the numeric keypad's Enter is delivered as the same key by
  `prosemirror-keymap`; no separate binding is required).
- **Bound command:** the `chainCommands(...)` composition specified in §2.3,
  assembled inline (the package exports the individual commands and the
  `chainCommands` helper, not a pre-built "enter" command).
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
import { chainCommands } from "prosemirror-commands";
import {
  newlineInCode,
  enterDefinitionList,
  splitListItem,
  exitContainerBlock,
  createParagraphNear,
  splitBlockKeepMarks,
  insertSoftBreak,
  metanormaSchema,
} from "@metanorma/editor-commands";

// The Enter binding is the chain from §2.3, composed at the call site.
const enterBinding = chainCommands(
  newlineInCode,
  enterDefinitionList,
  splitListItem(metanormaSchema),
  exitContainerBlock,
  createParagraphNear,
  splitBlockKeepMarks,
);

export function metanormaEnterKeymap() {
  return keymap({
    Enter: enterBinding,
    "Shift-Enter": insertSoftBreak,
  });
}
```

Wiring: `<MetanormaProseMirror plugins={[metanormaEnterKeymap(), …]} />`.

### 2.9 Relationship to Shift-Enter

To prevent the two line-break keys from being conflated:

| Key | Command | Effect | When |
|---|---|---|---|
| `Enter` | the §2.3 `chainCommands(...)` (composed in the keymap, not a named export) | Structural: split block / continue-or-exit list / commit term / start entry / code newline / paragraph-near atom. | Always (the subject of this section). |
| `Shift-Enter` | `insertSoftBreak` | Insert an inline `soft_break` node at the cursor (a line break *within* the current block). No structural change. | Only inside textblocks that allow inline content (`paragraph`, `dt`, a `dd`'s paragraph, a list item's paragraph). Inside `sourcecode`, `Shift-Enter` also inserts a `\n` (same as Enter, since there is no `soft_break` in code). |

The distinction mirrors every major word-processor: **Enter ends the paragraph;
Shift-Enter breaks the line.**

### 2.10 Test matrix

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

---

## 3. List toggling (`toggleList`)

This section specifies the **list-toggle command**: the operation that wraps
the selected block(s) in a `bullet_list`/`ordered_list` when no list is
active, switches list type when a different list is active, and lifts the
block(s) out when the same list is active. It is the command backing the
`lists` group of `MetanormaToolbar` (see `MetanormaToolbar.spec.md` §5.3)
and any keymap that toggles list formatting.

### 3.1 Why a custom command

ProseMirror's stock `wrapIn` (from `prosemirror-commands`) can wrap selected
blocks in a list, but it **cannot unwrap** an existing list, so it has no
toggle-off semantics. A dedicated command is therefore required to provide
the wrap / switch / unwrap behaviour a toolbar bullet-list button needs.

### 3.2 Signature and form

```ts
import type { NodeType } from "prosemirror-model";

/**
 * Toggle a list type on/off around the current selection.
 *
 * `listType` selects the target list: `bullet_list` or `ordered_list`. When
 * omitted, the command resolves the target from the active list (for the
 * switch and unwrap branches); when there is no active list and no target is
 * given, the command is not applicable.
 *
 * Conforms to the Command contract (§1.5): pure predicate when queried,
 * single transaction when dispatched.
 */
export function toggleList(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  listType?: NodeType,
): boolean;
```

`toggleList` binds `metanormaSchema` directly (the `bullet_list` /
`ordered_list` / `list_item` / `dl` names are Metanorma-specific — §1.6.2),
so it is exported as a plain `Command`, not a `(schema) => Command` factory.

### 3.3 Algorithm

The current list context is resolved by walking up from `$from`: the list
wraps `list_item` wraps block content, so the active list (if any) sits two
levels above the selection's immediate parent (`$from.node($from.depth - 2)`).
Only `bullet_list` and `ordered_list` at that depth count; a `dl` is not a
toggle-list context (see §3.5).

Given the target `listType` and the current list context, the command
selects one branch. The three branches are mutually exclusive and dispatch
**exactly one transaction** (composed via chained steps within that single
`state.tr` — §1.7):

| Current context | Branch | Effect |
|---|---|---|
| inside the **same** list type | **unwrap** | `lift` the selected block(s) out of the list. |
| inside a **different** list type | **switch** | `lift` out of the current list, then `wrapIn(listType)` — both steps composed into one transaction. |
| not in a list | **wrap** | `wrapIn(listType)` via ProseMirror's `findWrapping`, producing the full `list > list_item > <selected block>` chain in one step. |

> The lift+wrap sequence of the **switch** branch is composed *within one
> transaction*, not as two separate dispatches (§1.7.1). This differs from a
> naïve implementation that calls `lift` then `wrapIn` as independent
> commands, which would dispatch twice; the single-transaction composition is
> the reason the query form (no `dispatch`) must recompute the post-lift
> position before testing `wrapIn` applicability.

### 3.4 Selection handling and schema safety

- **Collapsed and ranged selections.** `toggleList` delegates the block
  range to ProseMirror's `lift` / `wrapIn`, which operate on the selection's
  `$from`/`$to` range. The resulting transaction sets a valid selection via
  the standard `lift`/`wrapIn` mapping (§1.7.2).
- **Node selections** on whole blocks are handled by the same range logic
  (they reduce to a single-block range); node selections on atoms or
  structural nodes are not applicable (`false`).
- **`scrollIntoView`** is called so the viewport follows the toggle
  (user-initiated command — §1.7.3).

### 3.5 Definition-list exclusion (`dl`)

A definition list (`dl`) is **never** a valid toggle-list context, even
though `dl` is itself a `block` and could in principle be wrapped in a
`bullet_list`/`ordered_list`:

- Metanorma's `list_item` has content `block+` (§1.6), so the schema would
  *permit* wrapping a `dl` in a list.
- **Upstream Metanorma forbids it.** `basicdoc.rng`'s `LiBody` is
  `<oneOrMore><ref name="paragraph-with-footnote" /></oneOrMore>` —
  paragraphs only. A `dl` (or table, figure, etc.) inside a `ul`/`ol` would
  produce **invalid StanDoc XML**.

`toggleList` therefore returns `false` (not applicable, dispatches nothing)
whenever the selection is inside — or spans into — a `dl`. This makes the
command's applicability predicate agree with the toolbar button's
`isEnabled` state (the toolbar's list buttons read the command's query form,
per `MetanormaToolbar.spec.md` §5.3): the bullet/ordered-list toggle cannot
wrap a definition list. Pre-existing documents containing such nesting still
render — this is an authoring constraint, not a render-time rejection.

> This is the single behavioural exception the Metanorma schema imposes on an
> otherwise stock list-toggle. It is recorded here, at the command, so that
> every consumer (toolbar, keymap, menu) sees the same applicability rather
> than each consumer re-implementing a `dl` guard.

### 3.6 Command-contract conformance

`toggleList` satisfies the global invariants of §1.5/§1.7:

1. **Predicate when queried** — without `dispatch`, returns `true` exactly
   for the wrap/switch/unwrap branches above (and `false` inside a `dl`),
   mutating nothing.
2. **Effect when dispatched** — builds exactly one transaction (composing
   the switch branch's lift+wrap) and calls `dispatch` once.
3. **No-when-inapplicable** — `false` and no dispatch when the selection is
   inside a `dl`, on a structural/atom node selection, or at a position no
   branch covers.
4. **Non-throwing** — resolves all node types through the schema (§1.6.1);
   reports failure by returning `false`.
5. **Selection-aware** — behaviour follows `$from`/`$to`, per §3.4.

### 3.7 Test matrix

Each row is a fixture (an `EditorState` over `metanormaSchema`), a
`toggleList(state, …)` invocation, and an assertion on applicability and, when
dispatched, on `tr.doc.toJSON()` and the selection. Representative rows:

- **W1** cursor in a top-level paragraph, `listType = bullet_list` →
  applicable; dispatched, the paragraph is wrapped in
  `bullet_list > list_item > paragraph`; selection maps into the item.
- **W2** ranged selection over two sibling paragraphs, `bullet_list` → both
  wrapped as two items of one `bullet_list`.
- **U1** cursor in a `bullet_list > list_item > paragraph`, `listType =
  bullet_list` → applicable; dispatched, the item's block is lifted to a
  sibling of the list; the list is removed if it becomes empty.
- **S1** cursor in a `bullet_list > list_item > paragraph`, `listType =
  ordered_list` → applicable; dispatched, the block is lifted out of the
  bullet list and re-wrapped in `ordered_list > list_item`, in **one**
  transaction.
- **X1** cursor inside a `dt`/`dd` of a `dl`, any `listType` → **not
  applicable** (`false`); without `dispatch` mutates nothing; with
  `dispatch` dispatches nothing.
- **X2** ranged selection spanning from a paragraph into a `dd`, any
  `listType` → **not applicable** (`false`) — the span touches a `dl`.
- **X3** node selection on an `image`/`formula`/`floating_title` atom →
  `false`.

Every row must also satisfy the global Acceptance criteria: single dispatch,
no throw, valid resulting selection, query/dispatch parity, and headless
executability.

---

## 4. The Backspace key

This section specifies the **Backspace-key-handling feature** of the
`MetanormaProseMirror` editor: the complete, context-dependent behaviour of
Backspace at the **start of a textblock** (in particular an empty paragraph)
across every editing context the Metanorma schema permits, including deeply
nested documents. It is the third of the command-specific sections deferred from
"The editor-commands module".

Backspace is structurally dual to Enter: where Enter at the end of a block
continues or exits a structure, Backspace at the start of a block undoes it.
But the Metanorma schema has a structural property that defeats stock
ProseMirror handling: a paragraph is typically the *only child* of a deeply
nested `clause` (`clause = (clause | block)*`), so stock `joinBackward` (from
`prosemirror-commands`) finds no joinable sibling at the paragraph's depth and
**does nothing** — the editor appears unresponsive. The feature's central job is
therefore to walk the container stack upward, deleting empty textblocks and any
parent that would be left empty by the deletion, until it reaches a node that
either should not be deleted (a list item, a table cell, the document root) or
has a non-deletable predecessor.

The governing rule is the dual of §2's:

> **Backspace at the start of an empty textblock deletes the textblock and, when
> that would empty its parent, deletes the parent too — walking up the container
> stack until a node is reached that the schema or this spec refuses to
> remove.** When the cursor is not at the start of an empty textblock, Backspace
> performs ordinary character deletion (delegated to the editor view's default
> handler). Schema safety always wins.

The feature is delivered as a single command in `@metanorma/editor-commands`
(`emptyTextblockBackspace`, §4.7), placed at the front of the Backspace dispatch
chain (§4.3) and bound to the Backspace key by a keymap plugin wired into the
editor mount (§4.8, per §1.13).

### 4.1 Scope

In scope:

- Behaviour of **Backspace at the start of a textblock** for every editing
  context reachable in a `metanormaSchema` document, with particular attention to
  the empty-paragraph case.
- The command the feature introduces (`emptyTextblockBackspace`), and the
  dispatch order that selects between it and stock deletion.
- The schema-preservation and user-expectation invariants each branch honours.
- The keymap binding contract (which key, which platforms, how it is wired into
  the mount).

Out of scope (handled by other keys or elsewhere):

- **Mid-textblock Backspace** (cursor strictly inside text, or a ranged
  selection): ordinary character/range deletion, performed by the editor view's
  default handler. This feature returns `false` for those cases (§4.3).
- **Forward deletion** (`Delete` key): not bound by this feature. It is a
  separate key with its own context rules and is not the structural dual of
  Backspace at the start; it is left unbound in v2.
- **`Mod-Backspace`** / **`Alt-Backspace`** / word-boundary variants
  (`Mod-Delete` on macOS deletes the previous word): not bound by this feature.
- Table row/column deletion via Backspace (`prosemirror-tables` is not
  integrated — see §4.4.6).
- Input rules, paste handling, drag-and-drop, and collaborative bindings.

### 4.2 What determines Backspace-at-start's behaviour

The effect is a pure function of the editor state at the moment of the keypress.
The relevant inputs are:

1. **Selection kind.**
   - *Collapsed* (a blinking cursor) — the case all structural logic below keys
     off.
   - *Ranged* (a non-collapsed text selection spanning inline content and/or
     whole blocks) — handled by stock deletion (this feature returns `false`,
     letting the editor view's default `deleteSelection` run).
   - *Node* (a whole node selected via gap cursor or keyboard node-selection) —
     see §4.4.7.
2. **Innermost textblock** — the nearest ancestor of the selection whose content
   is inline (`paragraph`, `sourcecode`, `dt`).
3. **Container stack** — the chain of ancestors from the textblock up to the
   document root (`list_item`, `bullet_list`/`ordered_list`, `dl`, `dd`,
   `note`/`example`/`quote`/`review`/`admonition`, `figure`, `table_cell`, and
   the section/structural nodes).
4. **Cursor zone within the textblock.** Only two zones matter for this feature:
   - *start-of-empty* — collapsed at position 0 of a textblock with no content
     (`content.size === 0`); the structural branch applies.
   - *any-other* — collapsed at the start of a non-empty textblock, or strictly
     inside, or at the end; this feature returns `false` and default deletion
     runs.

   The "start of a non-empty textblock" case is deliberately left to default
   handling (a no-op at the boundary), matching what every word-processor does:
   pressing Backspace at the very first position of a populated block does
   nothing until the user presses it again or arrows left. The structural branch
   fires only when there is nothing left in the block to delete.
5. **Predecessor of the textblock (and, recursively, of each ancestor that would
   be emptied).** The structural branch must decide where the cursor lands once
   it has deleted nodes — at the end of the previous sibling, at the end of the
   previous sibling of a deleted ancestor, or at the start of the document when
   there is no predecessor (§4.4.8).

The decision tables below key off these inputs.

### 4.3 The Backspace dispatch chain

The Backspace behaviour is an ordered composition of the command introduced in
§4.7 with stock ProseMirror deletion, assembled with the `chainCommands`-style
combinator (§1.9.2). The first command that is *applicable* runs; the rest are
skipped; if none is applicable, the editor view's built-in input handler runs
(character deletion / `deleteSelection`).

Per §1.10.2 (commands are named for the action, not the key), the package does
**not** export a composite `backspaceKey`/`onBackspace` symbol. The chain is
assembled at the call site — the keymap plugin specified in §4.8 — so that
composition is explicit (§1.9.3) and keymap wiring stays outside the command
package (§1.13).

The recommended order is **most-specific context first, default deletion last**:

```
chainCommands(
  emptyTextblockBackspace, // 1. collapsed cursor at the start of an empty textblock
  joinBackward,            // 2. stock ProseMirror join-backward (handles joinable siblings)
  deleteSelection,         // 3. ranged/node selections (default ProseMirror deletion)
)
```

Rationale for the order: `emptyTextblockBackspace` must run first because the
empty-paragraph-in-a-section case is exactly the one stock `joinBackward`
refuses (no joinable sibling at the paragraph's depth); if `joinBackward` ran
first it would return `false` and ProseMirror's input handler would fall through
to a plain `deleteSelection` that also no-ops on an empty paragraph, leaving the
user stranded. `joinBackward` is retained second so that the ordinary
join-with-previous-block behaviour still fires when the previous sibling *is*
joinable (two consecutive paragraphs at the end of a `block+` container, etc.)
and the cursor is at the start of a non-empty textblock where the structural
branch declined. `deleteSelection` is the ranged/node fallback.

**The chain is exhaustive over Backspace-at-start positions in the schema.**
Nesting is resolved by `emptyTextblockBackspace`'s container-stack walk
(§4.7.3): it does not delegate to per-context sub-commands, and no global
recursion is required.

Every branch obeys the global Command contract and Transaction discipline. In
particular, the structural branch first verifies that the cursor is at the start
of an empty textblock; if not, it returns `false` so that the ranged/character
branches run.

> **Interaction with `definitionListKeymap` (definition-lists.md §6.2).** That
> keymap binds Backspace-at-start inside `dt`/`dd` to a uniform **no-op** to
> preserve `(dt dd)+`. When `definitionListKeymap()` is registered with higher
> precedence than the §4.8 chain (as its spec requires), it claims the event
> first and `emptyTextblockBackspace` never runs inside a `dt`/`dd`. When it is
> *not* registered, `emptyTextblockBackspace` itself refuses inside a `dl`
> (§4.4.4) so the invariant holds regardless. The two are therefore composable
> in either order; the dl invariant is never violated.

### 4.4 Behaviour by context

The tables below give the observable effect of Backspace at the start of an
empty textblock for each context, plus the schema invariant the branch must
preserve. "Node" rows are covered once under §4.4.7 and referenced from the
per-context tables.

#### 4.4.1 Plain paragraphs

The innermost textblock is an empty `paragraph`, and no list / container / dl /
table context alters the behaviour (the nearest "interesting" ancestor is a
section, a list item, a container block, or the document body — the latter two
covered in their own subsections).

| Selection | Zone | Effect | Invariant preserved |
|---|---|---|---|
| Collapsed | start-of-empty | Delete the empty paragraph. If its parent (e.g. a `clause`) would become empty as a result, delete the parent too, recursing upward per §4.7.3. Land the cursor at the end of the predecessor (the previous sibling block, or the previous sibling of the nearest deleted ancestor that has one); if there is no predecessor anywhere up the stack, land at the start of the document. | No parent left with fewer children than its content expression requires. |
| Collapsed | start (non-empty) | No-op (`false`). Default deletion runs and itself no-ops at the boundary. | Unchanged. |
| Collapsed | middle / end | No-op (`false`). Default character deletion runs. | Unchanged. |
| Ranged | any | No-op (`false`). `deleteSelection` runs. | `inline*` reflows; valid. |
| Node | — | See §4.4.7. | — |

The "delete the parent too" recursion is what makes Backspace work in deeply
nested documents: an empty paragraph that is the sole child of its `clause`
cannot be deleted on its own (the clause would then be empty, violating
`clause = (clause | block)*` only at `*`'s lower bound of zero — schema-legal,
but see §4.4.8 for why the spec nonetheless removes the now-empty clause). The
recursion stops at the first ancestor that has a non-deletable role: a list item
(§4.4.3), a table cell (§4.4.6), or the document root.

#### 4.4.2 Source code (`sourcecode`)

`sourcecode` has content `text*` and `code: true`.

| Selection | Zone | Effect | Invariant preserved |
|---|---|---|---|
| Collapsed | start-of-empty (an empty `sourcecode` block) | Same as plain paragraph §4.4.1 (delete the block, recurse upward if the parent would empty). | `block+` / section content models honoured. |
| Collapsed | start (non-empty) | No-op (`false`). Default deletion runs. | `text*` intact. |
| Collapsed | middle / end | No-op (`false`). Default character deletion runs. | `text*` intact. |
| Ranged | any | No-op (`false`). `deleteSelection` runs. | `text*`. |
| Node | — | See §4.4.7. | — |

Backspace never inserts anything into a `sourcecode`; it only deletes the block
when empty, mirroring the Enter feature's refusal to split it (§2.4.2).

#### 4.4.3 Lists (`bullet_list`, `ordered_list`, `list_item`)

`list_item` content is `block+` — generalised, not paragraph-only. **The list
item's content model determines whether deleting its last block also deletes the
item.**

| Selection | Zone | Context | Effect | Invariant |
|---|---|---|---|---|
| Collapsed | start-of-empty | `list_item` allows free text / a block other than `paragraph` directly (i.e. its content is `block+` and the deleted paragraph is *not* the item's only child) | Delete the empty paragraph; cursor at the end of the previous block in the same item. | `list_item = block+` honoured (≥1 block remains). |
| Collapsed | start-of-empty | the empty paragraph is the **only** remaining block in a `list_item` whose content model does **not** allow free text unwrapped in a paragraph or another block — i.e. **the Metanorma `list_item`**, whose `block+` is the upstream StanDoc `LiBody` of paragraphs-only-allowing form (§1.6.3, §3.5) — **delete the `list_item`**. Then: if the parent list has other items remaining, the cursor jumps to the end of the **previous item**'s content; if no items remain, **delete the list** and continue the §4.7.3 walk from the list's former position. | No empty list; no `list_item` left with zero blocks; parent content model honoured. |
| Collapsed | start-of-empty | the empty paragraph is the only remaining block in a `list_item` whose content *does* allow free text unwrapped in a block (no such node exists in `metanormaSchema` today; the row exists for forward-compatibility of a composed schema) | Delete the empty paragraph only; leave a zero-block `list_item` is **forbidden** — instead fall back to the row above (delete the item). The intent is: a list item may never be left with fewer children than its content expression requires. | `list_item` content model honoured. |
| Collapsed | start-of-empty | inside a nested `list_item` | Same: delete the item; remove the nested list if it becomes empty; if the parent item then becomes empty, continue the walk one level up. | Parent `list_item = block+`. |
| Collapsed | any other | — | No-op (`false`). Default deletion. | `list_item+`. |
| Ranged | any | — | No-op (`false`). `deleteSelection` runs. | `list_item+`. |
| Node | — | — | See §4.4.7. | — |

**Where the cursor lands.** When the item is deleted and the list survives, the
cursor goes to the **end of the previous item's last textblock** (so a second
Backspace continues to delete backward inside that item). When the whole list is
deleted, the walk continues from the list's former position (the cursor lands at
the end of whatever predecessor the walk finds next).

> The "delete the item" rule applies specifically when deleting the empty
> paragraph would leave the item with no valid content. The Metanorma
> `list_item` (`block+`) permits multiple blocks, so an item with a note *and* a
> trailing empty paragraph only loses the paragraph (first row); an item whose
> only child is the empty paragraph loses the item (second row). This mirrors
> the Enter feature's list-exit rule (§2.4.3) and shares its rationale: a list
> item is never left empty.

#### 4.4.4 Definition lists (`dl`, `dt`, `dd`)

`emptyTextblockBackspace` **refuses inside a `dl`** (returns `false`), so the
`(dt dd)+` alternation invariant is preserved regardless of whether
`definitionListKeymap()` is registered:

| Selection | Zone | Context | Effect | Invariant |
|---|---|---|---|---|
| Collapsed | start-of-empty | inside a `dt` or inside a `dd` (an empty paragraph that is the only block of a `dd`) | **No-op** (`false`). Default handling also refuses because the result would violate `(dt dd)+` (a lone `dt`, or a `dd` removed from a pair). | `(dt dd)+` intact. |
| Collapsed | any other | inside `dt` / `dd` | No-op (`false`). Default character deletion runs. | `(dt dd)+`. |
| Ranged | any | within `dt` or `dd` | No-op (`false`). `deleteSelection` runs. | `(dt dd)+`. |
| Node | — | — | See §4.4.7. | — |

This is the structural dual of the Enter feature's dl rules (§2.4.4): just as
Enter commits a term or starts a new pair rather than splitting structural
boundaries, Backspace refuses to break a pair. Removing a whole pair is done by
selecting it and deleting (the ranged case). The rationale is identical to
definition-lists.md §6.2: `dt` (`inline*`) and `dd` (`block+`) are different
content kinds, so any cross-boundary merge is categorically lossy.

#### 4.4.5 Container blocks (`note`, `example`, `quote`, `review`, `admonition`, `figure`)

These nodes share content `block+` (for `figure`, `(image | block)*`). The
container is removed when deleting its last block would empty it — the dual of
Enter's `exitContainerBlock` (§2.4.5).

| Selection | Zone | Context | Effect | Invariant |
|---|---|---|---|---|
| Collapsed | start-of-empty | the empty paragraph is **not** the container's only block | Delete the empty paragraph; cursor at the end of the previous block in the container. | `block+` honoured (≥1 remains). |
| Collapsed | start-of-empty | the empty paragraph **is** the container's only block | **Delete the container**; continue the §4.7.3 walk from the container's former position. | No empty container left behind. |
| Collapsed | any other | — | No-op (`false`). Default deletion. | `block+`. |
| Ranged | any | within the container | No-op (`false`). `deleteSelection` runs. | `block+`. |
| Node | — | — | See §4.4.7. | — |

> `footnote_entry` (content `block+`, parent `footnotes` requires
> `footnote_entry+`) is handled by the §4.7.3 walk, not specially: deleting its
> last block deletes the entry, and if that empties `footnotes`, the
> `footnotes` container is deleted too. The cursor lands at the end of the
> previous `footnote_entry`, or — if the `footnotes` was the only child of the
> document root's tail — the walk stops at the document body (§4.4.8).

#### 4.4.6 Tables (`table`, `table_cell`)

`prosemirror-tables` is not integrated. Backspace performs **no row or cell
management**.

| Selection | Zone | Context | Effect | Invariant |
|---|---|---|---|---|
| Collapsed | start-of-empty | the empty paragraph is the **only** block in a `table_cell` | **No-op** (refuse). A cell must retain at least one block; deleting the paragraph would empty the cell, and deleting the cell would violate `table_row = table_cell+`. The cursor stays where it is. | `table_cell = block+`; `table_row = table_cell+` never violated. |
| Collapsed | start-of-empty | the empty paragraph is one of several blocks in a `table_cell` | Delete the empty paragraph; cursor at the end of the previous block in the cell. | `block+` honoured. |
| Collapsed | start-of-empty | the empty paragraph is the only block in the **last cell** of a row, the last row of a section — still no-op | Refuse for the same reason as the row above; do not propagate upward. The cell (and the row, the table) are preserved. | Tables never lose their last cell/row on Backspace. |
| Collapsed | any other | inside a cell | No-op (`false`). Default deletion. | `block+`. |
| Ranged | any | within a cell | No-op (`false`). `deleteSelection` runs. | `block+`. |
| Node | — | on table parts | `false` (no table restructuring on Backspace). | — |

The deliberate choice, mirroring Enter §2.4.6, is predictability: Backspace
inside a table deletes characters or an empty paragraph (when the cell has
more content), never a cell, row, or the table. The cursor cannot escape the
cell by deletion; arrow keys or a dedicated toolbar are the way out.

#### 4.4.7 Atoms and node selections (`image`, `formula`, `floating_title`)

`image`, `formula`, and `floating_title` are block-level atoms (empty content,
`atom: true`); the cursor cannot rest *inside* them. (`footnote_marker` and
`soft_break` are inline atoms; Backspace at the cursor immediately after one
deletes it via default character handling, not this feature.)

| Selection | Context | Effect | Invariant |
|---|---|---|---|
| Node selection on a block atom | `image` / `formula` / `floating_title` | **No-op** (`false`) for this feature; the chain's `deleteSelection` step (§4.3) then deletes the atom. Cursor lands at the merge of the surrounding textblocks, or at the start/end of the surrounding container if the atom was its only child. | Atom removed in one transaction by the chain; surrounding content model honoured. |
| Node selection on a **non-atom** block (`paragraph`, `sourcecode`, `note`, `clause`, …) | — | `false`. Default handling may delete the node (per ProseMirror's stock node-deletion behaviour). Restructuring sections on Backspace is left to dedicated commands. | — |
| Gap cursor immediately before/after an atom | — | `false` for this feature; chain's `deleteSelection` may delete the adjacent atom. | As above. |

This feature's only job for atoms is to **decline** so the chain's deletion step
can run. It never dispatches a transaction for an atom or node selection itself.

#### 4.4.8 Structural and section nodes

The cursor is always inside some textblock; it is never "inside" a `clause`,
`sections`, `doc`, etc. in a way that Backspace would split. The structural
behaviour is therefore expressed in terms of **what happens when deleting a
textblock empties a section**:

- **A section node (`clause`, `annex`, `content_section`, `abstract`,
  `foreword`, `introduction`, `acknowledgements`, `terms`, `definitions`,
  `references`) is deleted when deleting its last child block would leave it
  empty.** This is the §4.7.3 walk's central rule, and the fix for the
  nested-empty-paragraph no-op described at the top of §4. Deleting an empty
  `clause` recurses upward: if the clause was its parent clause's only child,
  the parent is deleted too, and so on up to the `sections`/`preface`/
  `bibliography`/`doc` level.
- **The walk stops at the document root and at the structural containers
  (`preface`, `sections`, `bibliography`).** These are never deleted on
  Backspace: they are the fixed top-level skeleton of a Metanorma document. If
  the walk would empty one, the command instead **refuses** and leaves the
  cursor where it is. The document must always have an editable position.
- **Where the cursor lands when a section is deleted.** When the deleted section
  has a previous sibling (a previous `clause`, a previous block, …), the cursor
  goes to the **end of the previous sibling's last descendant textblock** — i.e.
  the deepest editable position inside the predecessor. When the deleted section
  has no previous sibling, the cursor goes to the **end of the last descendant
  textblock of the previous sibling of the nearest non-deleted ancestor**, and
  so on; if no predecessor exists anywhere (the cursor was at the very start of
  the document's editable region), the cursor stays at the start of the document
  (no-op-adjacent: the deletion is refused or, if a paragraph was removed,
  lands at position 0 of the first remaining textblock).
- **Backspace never creates, merges, or reorders sections.** Deletion is the
  only structural change Backspace makes to the section hierarchy; new sections
  come from dedicated commands (the toolbar's Clause button, §3 of the
  AdvancedMetanormaToolbar spec), never from Backspace.
- **For leaf sections whose content is `block+`** (`abstract`, `foreword`,
  `introduction`, `acknowledgements`), the same rule applies as for clauses:
  delete the last block → section deleted → walk upward. The schema-safety rule
  below still applies: the document is never left with no editable position.

> **Doc-start anchor.** The default document (schema.spec.md §15) is
> `doc > sections > clause > paragraph`. Pressing Backspace at the start of that
> paragraph deletes the paragraph, which empties the `clause`, which is deleted;
> the walk then reaches `sections`, a structural container that the rule above
> refuses to delete. To keep the document editable, the command **re-creates a
> minimal valid content** for the emptied container: an empty `paragraph` inside
> the `clause` (or, if the `clause` was also deleted, a fresh `clause` with an
> empty paragraph inside the `sections`). The user observes a no-op at the
> document start — the cursor stays in an empty paragraph at the same screen
> position — but no invariant is violated. This is the one case where
> `emptyTextblockBackspace` dispatches a transaction that *adds* a node rather
> than only deleting; it is the dual of the Enter feature's §2.4.7
> `createParagraphNear` rule ("Enter near an atom makes a place to type").

### 4.5 Schema-preservation guarantees

Every branch of the Backspace chain upholds invariants dual to §2.5's:

1. **No empty required-`+` container is ever left behind.** If a branch would
   leave a parent whose content expression requires one-or-more (`list_item+`,
   `table_row+`, `table_cell+`, `block+` in a container, `(dt dd)+` in a dl,
   `footnote_entry+` in footnotes, `block+` in a leaf section) with zero
   children, the branch instead removes that parent (and recurses upward per
   §4.7.3) so the document stays valid.
2. **The `(dt dd)+` alternation of `dl` is never broken.** No transaction
   produced by Backspace deletes a `dt` or `dd` such that the remaining dl has
   two adjacent `dt` or two adjacent `dd`, or a trailing `dt` without a `dd`.
   Inside a `dt`/`dd`, Backspace at start is a no-op (§4.4.4).
3. **Atoms are never entered or split.** Block atoms (`image`, `formula`,
   `floating_title`) are removed only by the chain's `deleteSelection` step
   under a node selection; the structural branch never enters them.
4. **No transaction leaves the selection on a forbidden position.** After any
   structural step the selection resolves to a valid cursor (typically via
   `Selection.near` / `TextSelection.near` at the computed predecessor end),
   never inside an atom or between two structural nodes where inline content is
   disallowed.
5. **Section boundaries are respected.** Backspace deletes empty sections but
   never merges content across a section boundary. Two adjacent `clause`s are
   never joined into one; the second's content is not appended to the first.
   (Joining sections is a separate operation, not bound to Backspace in v2.)
6. **The document always has an editable position.** When the structural walk
   would empty a non-deletable container (`sections`, `preface`, `bibliography`,
   `doc`), the command re-creates a minimal valid child (§4.4.8 doc-start
   anchor) rather than leaving an uneditable document.

### 4.6 User-expectation guarantees

Where several schema-legal behaviours exist, Backspace picks the one a
word-processor user expects — duals of §2.6's:

1. **Backspace at start-of-empty unwinds one structure at a time** — it deletes
   the paragraph, then the empty list item, then the empty list, …, one level
   per keypress when the user holds the key, because each keypress is a single
   command invocation. A single keypress may delete multiple *nested* nodes only
   when they are emptied together in one transaction (an empty paragraph that is
   the sole child of an empty clause is deleted in one keypress along with its
   clause); the user sees the innermost block disappear and the cursor land at
   the predecessor, never a surprising distant jump.
2. **Backspace over a selection deletes first** — handled by the chain's
   `deleteSelection`, not by the structural branch.
3. **Backspace inside a table is inert at the cell's last block** (no surprise
   cell/row/table deletion).
4. **Backspace never silently reorders or merges the document hierarchy** (no
   section joins, no clause content appended to a sibling).
5. **Backspace at the very start of the document is a no-op** (the cursor stays
   in a valid editable paragraph; nothing the user typed is lost).

When in doubt, Backspace's effect matches the platform's dominant word-processor
(Word / Google Docs) for the analogous construct.

### 4.7 Command inventory

The Backspace feature introduces a single command in `@metanorma/editor-commands`.
It is an exported `Command` conforming to the Command contract.

| Command | Form | Source | Responsibility |
|---|---|---|---|
| `emptyTextblockBackspace` | `Command` | custom | When the cursor is collapsed at the start of an **empty** textblock, walk the container stack (§4.7.3) deleting the textblock and any parent that would be emptied, refusing inside a `dl`, a `table_cell`'s last block, or when the walk reaches a non-deletable container. Returns `false` (so the chain's deletion steps run) for any other input: a non-empty textblock, a cursor not at the start, a ranged or node selection. |

The package re-exports the stock `joinBackward` and `deleteSelection` commands
from `prosemirror-commands` so consumers can assemble the full Backspace chain
without a direct dependency (§1.9.2). No composite "backspace" symbol is
exported: per §1.10.2 the chain is composed at the call site (the keymap plugin
of §4.8), which also keeps composition explicit (§1.9.3) and keymap wiring
outside the package (§1.13). Consumers may reorder or substitute commands.

> **Why a single command, not a per-context family like Enter (§2.7)?** Enter's
> branches are *constructive* — each creates different nodes (a newline, a list
> item, a dl pair, an adjacent paragraph) — so they are naturally separate
> commands composed by `chainCommands`. Backspace's structural branch is
> *destructive* and uniform: regardless of context, it deletes the empty
> textblock and recurses upward while the parent would be emptied. The
> per-context variation (lists vs. containers vs. sections) is captured in the
> walk's *stopping conditions* (§4.7.3), not in separate commands. The few
> contexts that genuinely differ in kind — `dl` (refuse) and `table_cell`'s
> last block (refuse) — are handled as early-return guards inside the single
> command, not as separate commands in the chain.

#### 4.7.1 Signature

```ts
import type { Command } from "prosemirror-state";

/**
 * Delete an empty textblock at the cursor and unwind the container stack.
 *
 * Applicable (returns true / dispatches) exactly when:
 * - the selection is a collapsed `TextSelection`,
 * - its `$from` is at the start (offset 0) of its parent textblock, and
 * - that textblock is empty (`node.content.size === 0`).
 *
 * Refuses (returns false, dispatches nothing) when the cursor is inside a `dl`
 * (`dt` or `dd`), inside the last block of a `table_cell`, or when the
 * container-stack walk (§4.7.3) reaches a non-deletable container without a
 * predecessor. In all other positions — non-empty textblock, cursor not at
 * start, ranged or node selection — returns false so the chain's stock
 * deletion steps run.
 *
 * Conforms to the Command contract (§1.5): pure predicate when queried
 * (without `dispatch`), single transaction when dispatched.
 */
export const emptyTextblockBackspace: Command;
```

`emptyTextblockBackspace` binds `metanormaSchema` directly (the `clause` /
`sections` / `list_item` / `table_cell` / `dl` names are Metanorma-specific —
§1.6.2), so it is exported as a plain `Command`, not a `(schema) => Command`
factory — the same form as `exitContainerBlock` (§2.7) and `toggleList` (§3.2).

#### 4.7.2 Applicability predicate

The query form (no `dispatch`) returns `true` exactly when the structural branch
would dispatch, i.e. when **all** of:

1. the selection is a collapsed `TextSelection` (not `NodeSelection`, not
   ranged);
2. `$from.parent === $to.parent` and `$from.parentOffset === 0`;
3. `$from.parent` (the innermost textblock) is empty (`content.size === 0`);
4. the textblock is not inside a `dl` (i.e. no ancestor up to root is a `dt` or
   `dd` whose parent is a `dl`);
5. the textblock is not the last block of a `table_cell` (the parent
   `table_cell`'s `childCount === 1` and that child is the textblock);
6. simulating the §4.7.3 walk from this position reaches a deletion set that
   either terminates with a predecessor (some non-deleted ancestor has a
   previous sibling) **or** terminates at a non-deletable container that would
   be re-seeded per §4.4.8 (the doc-start anchor case).

In every other state, the query form returns `false` and dispatches nothing,
so the chain's `joinBackward` / `deleteSelection` steps run.

#### 4.7.3 Container-stack walk (algorithm)

When the applicability predicate holds and `dispatch` is provided, the command
builds a single transaction (§1.7) that performs the walk:

1. **Initialise the deletion set** to the empty textblock's range (its start and
   end positions in the document).
2. **Walk up:** for the textblock's parent, ask:
   - *If the parent is a `list_item` whose remaining children (after subtracting
     the deletion set's nodes inside it) would be zero* → add the `list_item`'s
     range to the deletion set. Then consider the `list_item`'s parent (the
     list): if its remaining `list_item` children would be zero, add the list's
     range too. Continue from the list's parent.
   - *If the parent is a section node (`clause`, `annex`, …) or a container
     block (`note`, `example`, …) whose remaining children would be zero* → add
     the parent's range to the deletion set. Continue from the parent's parent.
   - *If the parent is a `table_cell`* → **abort and refuse** (return `false`,
     dispatch nothing): §4.4.6 forbids emptying a cell. This guard is also
     reached up-front by applicability clause 5, but is re-checked here for
     safety.
   - *If the parent is a `dl`, `dt`, or `dd`* → **abort and refuse** (§4.4.4).
     Reached up-front by applicability clause 4, re-checked here for safety.
   - *If the parent is a non-deletable container* (`doc`, `sections`, `preface`,
     `bibliography`) → **stop the walk.** Do not add this parent to the deletion
     set.
   - *Otherwise* (the parent still has other children not in the deletion set)
     → **stop the walk.** The parent is not emptied; no further recursion.
3. **Resolve the cursor.** After the deletion, choose the new selection:
   - If the deletion set removed a node that had a **previous sibling** (in the
     parent the walk stopped at, or at the level where the walk stopped) → the
     cursor goes to the **end of the last descendant textblock** of that
     previous sibling. Compute it by descending the sibling's last child
     repeatedly until a textblock is reached, then taking its end position
     (mapped through the deletion transaction).
   - If the walk stopped at a non-deletable container (step 2's bullet 5) and
     the container now has **no children** (the doc-start anchor case) →
     **re-seed** the container with a minimal valid child: for `sections`/
     `preface`/`bibliography`, insert a fresh `clause` containing an empty
     `paragraph`; for `doc`, insert the default skeleton. Place the cursor at
     the start of that re-seeded paragraph. This is the only transaction the
     command dispatches that *adds* nodes (§4.4.8 doc-start anchor).
   - If the walk stopped because the parent still has other children (step 2's
     last bullet) but the deleted textblock was that parent's **first** child
     (so there is no previous sibling at this level) → the cursor lands at the
     **start** of the parent's new first child (the next sibling). (This occurs
     when the user Backspaces the first of several paragraphs in a clause: the
     first paragraph is deleted and the cursor lands at the start of the second.
     It is the dual of Enter's "insert an empty paragraph before" rule, §2.4.1.)
4. **Dispatch** the single composed transaction with `scrollIntoView` set
   (user-initiated command — §1.7.3).

The walk composes all deletions and (in the re-seed case) insertions into
**one transaction** (§1.7.1), never multiple dispatches. The query form
re-simulates the walk to decide applicability without dispatching.

> The "end of the last descendant textblock" cursor rule is what gives
> Backspace its natural feel: deleting an empty paragraph that was the sole
> child of a `clause` places the cursor at the end of the *previous clause's*
> last paragraph, exactly where the user's eye already is. It is the same
> "deepest editable position of the predecessor" idea used by the Enter
> feature's exit branches (§2.4.3, §2.4.5).

### 4.8 Keymap binding

The Backspace feature is wired into the editor through a keymap plugin supplied
to `MetanormaProseMirror` via its `plugins` prop (the mount itself remains
keymap-agnostic — see the MetanormaProseMirror spec). The binding contract:

- **Key:** `"Backspace"`.
- **Bound command:** the `chainCommands(...)` composition specified in §4.3,
  assembled inline (the package exports the new command plus the re-exported
  stock `joinBackward`/`deleteSelection`, not a pre-built "backspace" command).
- **Platform notes:**
  - `"Mod-Backspace"` (macOS previous-word deletion), `"Alt-Backspace"`, and
    `"Ctrl-Backspace"` are **not** bound by this feature.
  - `"Delete"` (forward delete) is **not** bound by this feature (see §4.1).
- **Precedence:** the Backspace keymap is appended via the mount's `plugins`
  prop and therefore runs alongside, and may be overridden by, consumer-supplied
  plugins (notably `definitionListKeymap()`, which must run with higher
  precedence inside `dt`/`dd` — definition-lists.md §6.5; the chain is safe
  either way per the §4.3 interaction note). The `reactKeys` plugin always
  remains first and does not handle Backspace.

A reference keymap plugin (lives outside this package — in the editor mount or a
dedicated `@metanorma/editor-keymap` package), extending the Enter keymap of
§2.8:

```ts
import { keymap } from "prosemirror-keymap";
import { chainCommands, joinBackward, deleteSelection } from "prosemirror-commands";
import {
  newlineInCode,
  enterDefinitionList,
  splitListItem,
  exitContainerBlock,
  createParagraphNear,
  splitBlockKeepMarks,
  insertSoftBreak,
  emptyTextblockBackspace,
  metanormaSchema,
} from "@metanorma/editor-commands";

// The Enter binding is the chain from §2.3; Backspace is the chain from §4.3.
const backspaceBinding = chainCommands(
  emptyTextblockBackspace,
  joinBackward,
  deleteSelection,
);

export function metanormaKeymap() {
  return keymap({
    Enter: chainCommands(
      newlineInCode,
      enterDefinitionList,
      splitListItem(metanormaSchema),
      exitContainerBlock,
      createParagraphNear,
      splitBlockKeepMarks,
    ),
    "Shift-Enter": insertSoftBreak,
    Backspace: backspaceBinding,
  });
}
```

Wiring: `<MetanormaProseMirror plugins={[metanormaKeymap(), …]} />`.

### 4.9 Relationship to Delete and Mod-Backspace

To prevent the deletion keys from being conflated:

| Key | Command | Effect | When |
|---|---|---|---|
| `Backspace` | the §4.3 `chainCommands(...)` (composed in the keymap) | At start-of-empty: structural unwind (§4.4). Else: default character/range deletion. | Always (the subject of this section). |
| `Delete` | *not bound by this feature* | Stock forward character deletion. No structural-unwind behaviour is defined for forward deletion in v2. | Always. |
| `Mod-Backspace` / `Alt-Backspace` | *not bound by this feature* | Stock previous-word deletion. | Always. |

The asymmetry — Backspace is structural at start-of-empty, Delete is never — is
deliberate. Forward structural deletion (delete the *next* block when the cursor
is at the end of the current one) has subtler interaction with selection
direction and is deferred to a later spec version. Users who want to delete the
following block can node-select it and press Backspace or Delete.

### 4.10 Test matrix

Each row is a fixture (an `EditorState` built from a `MirrorDocument`), a
Backspace keypress, and an assertion on the resulting `tr.doc.toJSON()` and
selection. The matrix is exhaustive over the contexts above; representative
rows:

- **BP1** empty paragraph, cursor at start, paragraph is one of several blocks
  in a `clause` → paragraph deleted; cursor at the end of the previous block.
- **BP2** empty paragraph, cursor at start, paragraph is the sole child of its
  `clause`, and the `clause` has a previous sibling `clause` → paragraph and
  `clause` both deleted in one transaction; cursor at the end of the previous
  clause's last descendant paragraph.
- **BP3** empty paragraph at the default document start
  (`doc > sections > clause > paragraph`) → paragraph deleted, clause deleted,
  walk stops at `sections`; `sections` re-seeded with a fresh `clause > empty
  paragraph`; cursor at the start of that paragraph (observed no-op).
- **BP4** non-empty paragraph, cursor at start → no-op for this feature
  (`false`); default handling runs and itself no-ops at the boundary.
- **BP5** paragraph, cursor mid-text → no-op for this feature (`false`);
  default character deletion runs.
- **BR1** ranged selection within a paragraph → no-op for this feature
  (`false`); `deleteSelection` runs.
- **BC1** empty `sourcecode` block, cursor at start → block deleted; recursion
  per §4.4.2.
- **BL1** empty paragraph that is one of several blocks in a `list_item` →
  paragraph deleted; cursor at end of previous block in the same item; item and
  list survive.
- **BL2** empty paragraph that is the **only** remaining block in a top-level
  `list_item`, list has other items → **item deleted**; cursor at end of
  previous item's last textblock; list survives.
- **BL3** empty paragraph that is the only block in the **only** `list_item` of
  a `bullet_list` → item and list both deleted in one transaction; cursor lands
  per the §4.7.3 walk (end of the previous sibling of the list, or re-seed at
  doc start).
- **BL4** empty paragraph in a nested `list_item` (only block, only item of the
  nested list) → nested item and nested list deleted; cursor in the parent item
  (at the end of its last block); parent list survives.
- **BD1** empty paragraph as the only block of a `dd`, cursor at start → no-op
  (`false`); `(dt dd)+` intact.
- **BD2** cursor at start of a `dt` (any content) → no-op (`false`); `(dt dd)+`
  intact.
- **BN1** empty paragraph that is one of several blocks in a `note` → paragraph
  deleted; note survives.
- **BN2** empty paragraph that is the **only** block of a `note` → note
  deleted; walk continues from the note's former position.
- **BT1** empty paragraph that is one of several blocks in a `table_cell` →
  paragraph deleted; cell/row/table unchanged.
- **BT2** empty paragraph that is the **only** block in a `table_cell` → no-op
  (`false`); cell/row/table unchanged (§4.4.6).
- **BT3** empty paragraph that is the only block in the only cell of the only
  row of a `table` → no-op (`false`); table never deleted by Backspace.
- **BA1** node selection on an `image` → `false` for this feature; chain's
  `deleteSelection` deletes the atom.
- **BA2** node selection on a non-atom block (`paragraph`) → `false` for this
  feature; default handling.
- **BS1** empty paragraph, sole child of a `clause`, sole child of an outer
  `clause` (two-level nesting) → both clauses and the paragraph deleted in one
  transaction; cursor at end of the previous sibling of the outer clause (or
  re-seed).
- **BS2** empty paragraph, sole child of a leaf section (`abstract`), the
  `abstract` is one of several siblings in `preface` → paragraph and `abstract`
  deleted; cursor at end of the previous sibling's last descendant textblock.
- **BS3** empty paragraph whose deletion chain would empty a non-deletable
  container other than at doc start (e.g. an empty `bibliography` reached by
  deleting its only `clause`) → re-seed per §4.4.8; cursor in the re-seeded
  paragraph; document remains editable.
- **S1** every applicable row: assert no `bullet_list` / `ordered_list` / `dl` /
  container / table part / leaf section is left with fewer children than its
  content expression requires.
- **S2** every dl-affecting row (BD1, BD2): assert `(dt dd)+` intact.
- **S3** every applicable row: assert the resulting selection resolves to a
  valid `TextSelection` inside a textblock (never an atom, never a forbidden
  position between structural nodes).
- **S4** BP3, BS3: assert the document still contains at least one editable
  paragraph after the re-seed (the doc-start anchor).

Every row must also satisfy the global Acceptance criteria: single dispatch, no
throw, valid resulting selection, query/dispatch parity, and headless
executability.
