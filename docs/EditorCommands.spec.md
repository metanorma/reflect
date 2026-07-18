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
> **keymap / input-rule wiring** are deferred to later sections (see §13).

---

## 1. Purpose

Provide a library of document-modification commands — ProseMirror `Command`
functions — tailored to the node/mark vocabulary and content model of
`metanormaSchema`. The package:

1. Exposes commands as plain `(state, dispatch?) => boolean` functions so they
   can be invoked from keymaps, toolbars, menus, input rules, or tests.
2. Is **schema-aware**: it resolves node and mark types through the Metanorma
   schema and adapts ProseMirror's stock behaviour where the Metanorma content
   model diverges from upstream defaults (§6).
3. Is **framework-agnostic and DOM-free**: it operates on `EditorState` /
   `Transaction` only, with no React and no DOM access, so every command is
   unit-testable headless.
4. Ships **command logic only**. It does **not** bind keys, ship a keymap plugin,
   or render UI (§13).

---

## 2. Relationship to other packages

| Package | Relationship |
|---|---|
| `@metanorma/prosemirror-schema` | **Source of truth.** Commands consume `metanormaSchema`, `NODE_NAMES`, and `MARK_NAMES`. They never redefine nodes, marks, attributes, or `toDOM`/`parseDOM`. |
| `@metanorma/prosemirror-editor` (planned) | **Consumer.** The React editor mount provides the `plugins` prop and `children` hook surface (`MetanormaProseMirror.spec.md` §5, §10) into which keymaps built from these commands are wired. This package does not import React. |
| `prosemirror-commands`, `prosemirror-schema-list` (upstream) | **Composition bases.** Where a stock upstream command works unchanged, it is reused; where the Metanorma schema diverges, this package provides an adapted/custom replacement (§6, §9). |
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

## 3. Module layout

A new workspace package, sibling to the schema and editor packages:

```
pkg/editor-commands/
├── package.json          ← name: "@metanorma/editor-commands"
├── tsconfig.json         ← extends ../../tsconfig.json
└── src/
    ├── index.ts          ← public exports (§10)
    ├── schema.ts         ← schema-coupling helpers: name resolution, shared context (§6)
    ├── util.ts           ← shared command utilities: chain, predicates (§9)
    └── commands/         ← individual command modules (reserved for later sections)
```

> The package path and name are **decisions, not constraints.** The recommended
> name `@metanorma/editor-commands` is chosen over `@metanorma/prosemirror-commands`
> to avoid confusion with the upstream `prosemirror-commands` dependency (which
> this package itself consumes). The implementer may rename, provided the public
> exports (§10) and contract (§5) are honoured.

The package must be registered as a Yarn workspace by adding `"pkg/editor-commands"`
to the `workspaces` array in the root `package.json`.

---

## 4. Dependencies

| Package | Version | Purpose / constraint |
|---|---|---|
| `@metanorma/prosemirror-schema` | `workspace:^` | `metanormaSchema`, `NODE_NAMES`, `MARK_NAMES`. |
| `prosemirror-state` | `^1.4.4` | `EditorState`, `Transaction`, the `Command` type. Matches the editor package. |
| `prosemirror-model` | `^1.22.0` | `Node`, `Schema`, `NodeType`, `MarkType` types. Matches the schema package. |
| `prosemirror-commands` | `^1.7.1` | Stock commands to reuse/adapt (e.g. base splitting, code-newline, paragraph-near). |
| `prosemirror-schema-list` | `^1.4.0` | Stock list commands to adapt to the Metanorma `list_item` model. |

`devDependencies`: `typescript@~6.0.3` (matching the root).

No React. No DOM libraries. No `prosemirror-view` — commands never touch an
`EditorView` or the DOM (§8).

---

## 5. Command contract

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
   applicable, it builds exactly **one** transaction (§7), calls `dispatch(tr)`
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

## 6. Schema coupling

Commands are bound to the Metanorma schema. The following principles govern
**every** command:

### 6.1 Resolve types by name, through the schema instance

Commands must not hard-code node/mark lookups with unverified string literals.
Node and mark types are resolved from a `Schema` instance using names drawn from
the exported `NODE_NAMES` / `MARK_NAMES` constants, e.g.
`state.schema.nodes.list_item`. For reference equality and clarity, the package
keeps a shared, lazily-captured schema context in `src/schema.ts` (§3) defaulting
to `metanormaSchema`.

### 6.2 Schema-parameterized where reuse matters

Because the schema package exposes the raw spec maps (`metanormaNodes` /
`metanormaMarks`) precisely so consumers may compose a **modified** schema
(schema §11), commands that are likely to be reused on a composed schema should
be exposed as **factories** `(schema: Schema) => Command` rather than closures
over the `metanormaSchema` singleton. Commands that are intrinsically specific to
the Metanorma vocabulary may bind `metanormaSchema` directly. The per-command
sections decide which form applies; the general rule is: *prefer the factory form
unless the command only makes sense for the exact Metanorma schema.*

### 6.3 Schema facts that motivate custom logic

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

## 7. Transaction discipline

When a command dispatches, the transaction it produces obeys:

1. **One transaction per invocation.** A single `state.tr` is built and
   dispatched once. Multi-step edits are composed *within* that transaction
   (chained steps), never by dispatching repeatedly. Multi-command sequences are
   the **caller's** responsibility, composed via chaining helpers (§9).
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

## 8. Purity, side-effects, and testability

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

## 9. Composition and chaining

1. **Reuse over reimplementation.** Where an upstream command is correct for the
   Metanorma schema, the package re-exports or thin-wraps it rather than
   reimplementing. Custom logic is added **only** where §6.3 requires.
2. **Chaining.** Multi-step key bindings (e.g. "try A, else B, else C") are
   expressed with a chaining combinator. The package provides/re-exports a
   `chainCommands`-style helper in `src/util.ts` that runs commands in order and
   returns at the first one that applies. Callers compose command sequences with
   it; commands themselves stay single-purpose.
3. **No hidden ordering.** A command does not internally invoke sibling commands
   as an implementation shortcut unless that is its documented purpose (e.g. an
   explicit composite command). Composition is explicit at the call site.

---

## 10. Public API conventions (`src/index.ts`)

1. **Every exported symbol is a `Command`** (or a `(schema) => Command` factory,
   per §6.2). No non-command helpers are part of the public API unless explicitly
   documented.
2. **Naming.** Commands are named for the **action** they perform
   (`splitParagraph`, `insertSoftBreak`, …), not for the key that triggers them
   (never `enterKey`, `onEnter`). Key binding is a separate concern (§13).
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

## 11. TypeScript constraints

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

## 12. Acceptance criteria

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

## 13. Specified elsewhere

- **Definitions of individual commands** (e.g. paragraph split, list split/lift,
  code newline, definition-list flow, line-break insertion, atom-adjacent
  paragraph creation). This document fixes only the contract and conventions they
  share.
- **Keymap bindings** (mapping physical keys such as `Enter`, `Shift-Enter`,
  `Mod-Enter` to commands). Keymap wiring lives in the editor mount's `plugins`
  prop or a dedicated keymap package; it is intentionally separate from command
  logic (§1, §10.2).
- **Input rules**, menu/toolbar UI, and collaborative-editing bindings.
- **Command serialization / undo grouping policy** beyond ProseMirror's default
  transaction history.
- Any DOM- or view-level concern (selection rectangles, scroll behaviour beyond
  `scrollIntoView`, focus management).
