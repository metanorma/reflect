# Section & clause nesting

## 1. Purpose

This document is the detailed implementation proposal for **section / clause
nesting** operations in `AdvancedMetanormaToolbar`. It directly addresses the
item listed as "out of scope (future work)" in §5.5 of
`docs/MetanormaToolbar.spec.md`:

> **Section / clause nesting** — structural operations that affect the
> document tree at the `sections` / `clause` level.

The base `MetanormaToolbar` handles inline marks, block wraps (`quote`,
`note`, `example`), lists, and links. It deliberately does not touch the
document's structural skeleton. This document specifies the buttons, commands,
state detection, accessibility, and open questions for structural editing:
inserting clauses, promoting / demoting clauses through nesting levels, and
changing the type of a section node — all against the content model defined in
`@metanorma/prosemirror-schema`.

This document does **not** rehash the base toolbar's mark / block / list / link
behaviour. It assumes the integration model, `ToolbarButton` descriptor, CSS
prefix (`mn-toolbar`), and TypeScript constraints defined in
`MetanormaToolbar.spec.md` §3–§8, §12 and reuses them unchanged.

## 2. Schema recap

All node references below are from `pkg/prosemirror-schema/nodes.ts`. The
group constants (`BLOCK_GROUP = "block"`, `SECTION_GROUP = "section"`) are from
`pkg/prosemirror-schema/groups.ts`.

### 2.1 Structural containers

The document skeleton is built from four non-section container nodes:

| Node | Content expression | attrs | toDOM |
|---|---|---|---|
| `doc` | `(preface? sections? bibliography? footnotes?)` | `data` | `<div class="mn-doc">` |
| `preface` | `(section \| block)*` | `baseAttrs` (id, number, data) | `<section class="mn-preface">` |
| `sections` | `(section \| block)*` | `baseAttrs` | `<section class="mn-sections">` |
| `bibliography` | `(section \| block)*` | `baseAttrs` | `<section class="mn-bibliography">` |

> **doc ordering constraint.** `doc.content` is strictly ordered:
> `(preface? sections? bibliography? footnotes?)`. A section node may **never**
> be a direct child of `doc`; it can only appear inside `preface`, `sections`,
> or `bibliography`, and those three containers must appear in that fixed
> order. Top-level placement of a new clause is therefore always "insert as a
> child of `sections` (or `preface` / `bibliography`)", never "insert as a
> child of `doc`".

### 2.2 Section nodes — group `"section"`

All ten section nodes carry `group: SECTION_GROUP` and
`attrs: sectionAttrs()` = `{ id, number, title, data }` (all four default
`null` except `data` which defaults to `{}`).

| Section node | Content expression | Can nest section children? |
|---|---|---|
| `clause` | `(clause \| block)*` | ✅ yes (`clause`) |
| `annex` | `(annex \| clause \| block)*` | ✅ yes (`annex`, `clause`) |
| `content_section` | `(section \| block)*` | ✅ yes (any `section`) |
| `terms` | `(clause \| block)*` | ✅ yes (`clause`) |
| `definitions` | `(clause \| block)*` | ✅ yes (`clause`) |
| `references` | `(clause \| block)*` | ✅ yes (`clause`) |
| `abstract` | `block+` | ❌ leaf only |
| `foreword` | `block+` | ❌ leaf only |
| `introduction` | `block+` | ❌ leaf only |
| `acknowledgements` | `block+` | ❌ leaf only |

**Key distinction.** Six section types (`clause`, `annex`,
`content_section`, `terms`, `definitions`, `references`) may contain nested
section nodes per their content expression. Four (`abstract`, `foreword`,
`introduction`, `acknowledgements`) are **leaf sections** (`block+`): they hold
block content but no child sections. Any "insert clause" / "demote" operation
must be disabled when the insertion or demotion target is a leaf section or a
`block`-only context.

> **`floating_title` is a distinct concept, not a section.** The schema also
> defines a `floating_title` block node (`group: "block"`, `atom: true`,
> `content: ""`, `sectionAttrs()` — i.e. it carries `id`/`number`/`title`/`data`
> but has no children). It renders as a non-`<section>` `<div class="floating-title">`
> and is deliberately placed **outside the numbered section hierarchy** — per
> [Metanorma's documentation](https://www.metanorma.org/author/topics/sections/),
> "a floating title is a title that is placed outside the numbered hierarchy of
> clauses … not uniquely referable like normal clauses." It is therefore **not**
> an alternative to a clause `title` (which is the heading *of* a numbered
> section node that participates in nesting and cross-referencing) but a
> free-standing, unnumbered heading block.
>
> **Consequence for this toolbar:** the "Insert clause" split menu (§4.2) lists
> only the ten `section`-group node types; it does **not** offer
> `floating_title`, and the structural commands never produce one. Inserting a
> `floating_title` is a *block-element* operation (it is in the `block` group,
> like `paragraph`/`note`/`example`), not a structural-section operation. It is
> **deferred to a future "block elements" toolbar group**; the sections feature
> does not insert it.

### 2.3 Attributes

- `title` — the clause **heading text**, user-facing. The toolbar may prompt for
  or default this on insert (§6).
- `id` — stable identifier. **Tooling-assigned** (§8), never typed by the user.
- `number` — display number ("3.2.1"). **Tooling-assigned**; the user does not
  edit it. The editor does **not** implement auto-numbering; all section
  commands leave `number` `null` (§7). Clause numbering is a presentation
  concern handled by the Metanorma pipeline at Semantic→Presentation XML
  conversion time, not by the editor (see "Numbering" note in §7).

## 3. Integration model

Unchanged from `MetanormaToolbar.spec.md` §3: the advanced toolbar renders as a
child of `MetanormaProseMirror`, inside the `<ProseMirror>` context. State is
read with `useEditorStateSelector`; commands are dispatched via
`useEditorEventCallback`, which yields the `EditorView`. No state props.

The structural group is additive — it coexists with the base toolbar's `marks`,
`blocks`, `lists`, and `link` groups and follows the same `ToolbarButton`
descriptor (`MetanormaToolbar.spec.md` §5):

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

A new group is introduced for visibility toggling (mirrors the base
`ToolbarGroup` pattern):

```typescript
export type ToolbarGroup =
  | 'marks'
  | 'blocks'
  | 'lists'
  | 'link'
  | 'sections'; // ← this document
```

## 4. Buttons — group `sections`

### 4.1 Chosen button set and rationale

The minimal set is **Insert clause**. The structural operations that follow
naturally from the nesting model are **Promote** (decrease nesting depth) and
**Demote** (increase nesting depth), plus **Change section type** (convert
between section node types where the content model permits). The proposed set:

| # | Button | Label | Purpose |
|---|---|---|---|
| 1 | Insert clause | `clause` | Wrap the selected block(s) in a new `clause` node containing a leading child paragraph; place the cursor in that paragraph. The primary structural "add a subsection here" action. |
| 2 | Promote clause | `▲` | Lift the nearest enclosing clause out one nesting level (move it to be a sibling of its parent clause). Disabled at the top structural level. |
| 3 | Demote clause | `▼` | Nest the nearest enclosing clause as the last child of its preceding sibling clause (one level deeper). Disabled when no legal deeper target exists. |
| 4 | Change section type | `§ type` | Convert the nearest enclosing section node into another section type whose content expression is satisfied by the node's current children (e.g. `clause` → `terms`). Disabled for leaf-only or unsatisfiable conversions. |

**Why this set, and not more.** "Insert clause" is the single most-requested
structural action and the baseline deliverable (it is the only one the base
spec explicitly named). Promote / demote are the natural complements — they are
the only operations that change nesting *depth* without changing node identity,
and they round-trip each other. "Change section type" covers the remaining
structural transformation (identity change at a fixed location) and lets the
user migrate a `clause` into a `terms` / `references` block without retyping
content. The ten raw section types are **not** each given a dedicated insert
button — that would balloon the toolbar; instead type conversion is centralised
in button 4 (see §8 open question on scope). Wrap/unwrap of arbitrary section
types beyond `clause` is deliberately left to "Change section type" + "Insert
clause" composition.

### 4.2 Button: Insert clause (+ section-type split menu)

The **Insert clause** control is a **split button**: the primary click inserts
the most common type, `clause`, in one action; a dropdown caret opens a menu of
**all ten section types** for direct insertion of any other type.

**Primary action (`clause`):**

| Field | Value |
|---|---|
| `key` | `"sections-insert-clause"` |
| `label` | `clause` |
| `title` | `"Insert clause (wrap selection in a new clause)"` |
| `isActive` | `false` — insertion is not a toggle. (See note below.) |
| `isEnabled` | `canWrapInClause(state)` (§5.1): the resolved selection's ancestor chain contains a container that permits a `clause` child (or the doc-top-level fallback applies). |
| `run` | Toolbar adapter calls `wrapInClause(view.state, view.dispatch, { title })` (§5.2), then `view.focus()`. Prompts for the heading `title` per §7, wraps the selection in a new `clause` (with a child paragraph), and places the cursor in that paragraph. |

**Dropdown menu (other section types):**

The dropdown caret opens a menu (`role="listbox"`, class
`.mn-toolbar-section-menu`) listing **all ten section types** in a fixed order.
The list contents never change — every type is always shown, so the menu is
spatially predictable. Each entry is independently enabled or disabled based on
legality at the current cursor position:

- An entry is **enabled** when `parentAccepts(parent, type, index)` (§5.1) is
  true for that section type — i.e. the current parent (or the auto-created
  `sections` container, §5.1 doc-top-level fallback) can legally receive a
  child of that type. The entry's `run` inserts a node of that type (same shape
  as `wrapInClause`, parameterised by the chosen `NodeType`).
- An entry is **disabled** (`disabled`, `aria-disabled="true"`) when that type
  is not legal at the current position — greyed out but visible.

> `isActive` is `false` because insertion is a one-shot command, not a state
> toggle. (Conceivably one could mark it active when the immediate parent is
> already a `clause` to hint "you are inside a clause", but that conflates
> location with toggle state; the dedicated Promote/Demote/Change-type buttons
> convey context instead.)

> **Relationship to "Change section type" (§4.5).** The split-menu dropdown
> *inserts a new* section node of the chosen type (in place, splitting the
> current block). "Change section type" *converts the enclosing* section node
> to the chosen type, preserving its children. They are complementary: insert
> when you need a new section, convert when the section exists but has the
> wrong type.

### 4.3 Button: Promote clause

| Field | Value |
|---|---|
| `key` | `"sections-promote"` |
| `label` | `▲` |
| `title` | `"Promote clause (move out one level)"` |
| `isActive` | `false` |
| `isEnabled` | The nearest enclosing section node is a `clause` **and** its parent is itself a section node (or a container that can legally receive the clause as a child at the post-lift position). Disabled when the clause is already a top-level child of `sections`/`preface`/`bibliography` (nothing to lift into without violating the doc ordering). |
| `run` | Toolbar adapter calls `promoteClause(view.state, view.dispatch)` (§5.3), then `view.focus()`. |

### 4.4 Button: Demote clause

| Field | Value |
|---|---|
| `key` | `"sections-demote"` |
| `label` | `▼` |
| `title` | `"Demote clause (nest one level deeper)"` |
| `isActive` | `false` |
| `isEnabled` | The nearest enclosing clause has a preceding sibling that is a clause (or `annex`/`terms`/`definitions`/`references`/`content_section` that can legally contain a `clause`), so it can be reparented as that sibling's last child. Disabled at the top of a container with no preceding-section sibling, or when the only candidate parent is a leaf section. |
| `run` | Toolbar adapter calls `demoteClause(view.state, view.dispatch)` (§5.3), then `view.focus()`. |

### 4.5 Button: Change section type

| Field | Value |
|---|---|
| `key` | `"sections-set-type"` |
| `label` | `§ type` |
| `title` | `"Change section type…"` |
| `isActive` | `true` when the nearest enclosing section node's type matches the most recently chosen target — used only to reflect the current type once a sub-menu selection has been made. In the common (no sub-menu) rendering, `false`. |
| `isEnabled` | There exists at least one *other* section node type such that `targetType.validContent(currentNode.content)` and the current parent permits `targetType` (same group `section`, so the parent's content expression is unaffected). Disabled inside `block`-only contexts and when no legal target exists. |
| `run` | Toolbar adapter calls `setSectionType(view.state, view.dispatch, targetType)` (§5.4), then `view.focus()`. Target is chosen via a sub-menu / `<select>` of legal types (§7 interaction). |

## 5. Commands

The structural command logic lives in the **`@metanorma/editor-commands`**
package, at `pkg/editor-commands/commands/sections.ts` — **not** in
`pkg/prosemirror-editor`. The editor package (`@metanorma/prosemirror-editor`)
re-exports them; the toolbar component and its view-holding adapters stay in
`prosemirror-editor`. See §11 (exports) and §12 (file structure).

> **Command contract conformance.** These commands conform to the Command
> contract defined in `docs/EditorCommands.spec.md` §1.5. In particular:
>
> - **Pure / DOM-free.** Every command has the ProseMirror
>   `Command` shape `(state: EditorState, dispatch?: (tr: Transaction) => void) => boolean`
>   (the `Command` type is imported from `prosemirror-state`). They operate on
>   `state` / `dispatch` **only**. They never take an `EditorView` parameter,
>   never call `view.focus()` / `view.dispatch`, and never touch the DOM. This
>   makes them unit-testable headless and composable with `prosemirror-commands`.
> - **Query / dispatch parity.** Called without `dispatch`, a command is a pure
>   applicability test that returns `true` iff it would apply and mutates
>   nothing. Called with `dispatch`, it builds exactly one transaction,
>   dispatches it once, and returns `true`. It returns `false` (no dispatch) when
>   not applicable, regardless of `dispatch`.
> - **Non-throwing.** On well-formed state over `metanormaSchema`, a command
>   never throws; failure is reported by returning `false`.
> - **Transaction discipline.** One `state.tr`, dispatched once; a valid
>   resulting selection; `tr.scrollIntoView()` on these user-initiated commands;
>   active marks preserved across the structural change.
>
> The `EditorView` / `view.focus()` concerns live entirely in the **toolbar
> adapter** (in `prosemirror-editor`): each button's `run(view)` resolves any
> needed argument (e.g. the clause `title` or a `targetType`), calls the pure
> command as `command(view.state, view.dispatch, …)`, and then `view.focus()`.
> No `*View` command overloads are exported from `editor-commands`.

**Schema coupling.** These commands are tightly bound to the Metanorma section
vocabulary, so they resolve node types **by name through `state.schema`** (e.g.
`state.schema.nodes.clause`) rather than binding the `metanormaSchema` singleton.
Operating on `state.schema` is simplest and keeps the commands correct on a
composed schema without a `(schema) => Command` factory. A factory form is
therefore **not** required for these section/clause commands (see
`EditorCommands.spec.md` §1.6.2).

```typescript
import type { Command, EditorState, Transaction } from "prosemirror-state";
import type { Node, NodeType, ResolvedPos } from "prosemirror-model";
```

> No `prosemirror-view` import appears in this module — commands never reference
> `EditorView`.

### 5.1 Legality helper — `canWrapInClause`

The central predicate: *can we legally introduce a `clause` node at/around the
current selection?* It is built directly on the schema content model rather
than a hand-maintained allow-list.

```typescript
/**
 * True when the selection sits inside a node whose content expression
 * permits a `clause` child (i.e. it references the section group or `clause`
 * specifically). Used to enable/disable Insert-clause, Demote, and as a
 * building block for the other structural checks.
 *
 * Walks the ancestor chain of `state.selection.$from` from the immediate
 * parent up to the doc, and for each ancestor asks whether `clause` is a
 * member of that node's content match at the relevant position.
 */
export function canWrapInClause(state: EditorState): boolean;
```

**Algorithm:**

1. Resolve `const $from = state.selection.$from`.
2. Walk depths from `d = $from.depth` down to `1` (skip `0`, the doc, which
   cannot contain a clause directly per the doc ordering constraint). For each
   depth `d`, the ancestor is `const parent = $from.node(d)`.
3. For the innermost such parent, query
   `parent.type.contentMatch.matchType(clauseType)`; if it returns a non-null
   `ContentMatch`, a `clause` is legal here. (For deeper ancestors, use the
   match at the boundary index — see the generalised helper below.)
4. Return `true` if any reachable ancestor admits a clause.
5. **Cross-section selection guard.** If the selection is non-collapsed and
   `$from` and `$to` are in **different section ancestors** (i.e. the selection
   spans a section boundary), return `false`. Wrapping a cross-section range in
   a single clause would uproot content from one section into a new one nested
   elsewhere — almost never the user's intent. The user should use
   promote/demote or cut-and-paste for cross-section reorganisation.
6. **Doc-top-level fallback.** If no ancestor admits a clause (step 4) and the
   selection is not cross-section (step 5), but the `doc` does not yet contain
   a `sections` container (or the cursor sits directly under `doc` between
   containers), return `true` anyway: the wrap command will auto-create a
   `sections` container (§5.2) and insert the clause into it. The insertion
   position of the new container is fully determined by the `doc.content`
   ordering constraint `(preface? sections? bibliography? footnotes?)`. Return
   `false` only when a `sections` container already exists but the cursor is
   not inside a section-bearing ancestor (e.g. inside `preface`/`bibliography`
   at a position where a clause is not legal). Leaf sections (`abstract` etc.)
   have `content: "block+"`, so `matchType(clause)` is `null` there → disabled.

A more general form, used by Promote/Demote/Set-type, resolves the match at a
specific parent + index:

```typescript
/**
 * True when `parent` may contain a child of `childType` inserted at the
 * position currently occupied by `childIndex` (i.e. the content match is
 * non-null after consuming `childIndex` siblings). Built on
 * `NodeType.validContent` / `ContentMatch` — never a hand-coded allow-list.
 */
export function parentAccepts(
  parent: Node,
  childType: NodeType,
  childIndex: number,
): boolean;
```

> **Why `contentMatch` / `validContent` and not an allow-list.** The content
> model already encodes "(clause | block)*" vs "block+". Re-deriving legality
> from the schema keeps the toolbar correct if the schema's content
> expressions change, and avoids drift between the allow-list and the source of
> truth. `NodeType.validContent(content)` answers "could this node legally hold
> this exact fragment?" — ideal for Promote/Demote (which move real subtrees)
> and for Set-type (which re-validates a node's existing children against a new
> type).

### 5.2 `wrapInClause`

```typescript
/**
 * Wrap the block(s) covered by the selection in a new `clause` node that
 * contains a leading empty `paragraph`, then place the selection in that
 * paragraph. The heading `title` attribute is set from `opts.title`
 * (defaulting to null / empty — see §7). `id` and `number` are left null
 * (tooling-assigned).
 *
 * Conforms to the Command contract (EditorCommands.spec.md §1.5):
 * - Without `dispatch`: pure applicability test — returns true iff
 *   `canWrapInClause(state)`, mutates nothing.
 * - With `dispatch`: dispatches exactly one transaction (wrap + leading
 *   paragraph + selection move + `scrollIntoView`) and returns true.
 * - Returns false (no dispatch) when not applicable. Never throws.
 *
 * The `title` is threaded as a plain optional argument — not via a view
 * wrapper. The toolbar adapter (in prosemirror-editor) obtains the title
 * (§7) and calls `wrapInClause(view.state, view.dispatch, { title })`.
 */
export function wrapInClause(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  opts?: { readonly title?: string | null },
): boolean;
```

> **No `wrapInClauseView` overload.** An earlier draft specified a
> `wrapInClauseView(view: EditorView, title): void` adapter in this module. That
> is a UI concern and is **not** exported from `editor-commands`: the toolbar
> button's `run(view)` adapter (which lives in `prosemirror-editor`) resolves the
> heading `title` per §7, calls `wrapInClause(view.state, view.dispatch, { title })`,
> and then `view.focus()`. The pure command takes `title` as an ordinary optional
> argument so no `EditorView` ever enters the command.

**Algorithm (`wrapInClause`):**

1. If `!canWrapInClause(state)` → return `false`.
2. Compute the block range to wrap. For a non-empty selection, use
   `state.selection`'s `$from`/`$to` block boundaries; for a collapsed cursor,
   wrap the single block containing the cursor. Derive a `NodeRange` via
   `$from.blockRange($to)`.
3. Build the new clause:
   `schema.nodes.clause.create({ title: opts?.title ?? null, id: generateId(), number: null, data: {} }, [schema.nodes.paragraph.create()])`.
   The leading empty paragraph is the cursor landing site and ensures the
   clause is never empty (content `(clause | block)*` allows zero children, but
   an empty clause is a poor editing target). The `id` is **generated at
   insertion time** via the shared `generateId()` helper from
   `@metanorma/editor-commands` (`util.ts`).
4. **Doc-top-level fallback.** If the block range's parent is the `doc` (i.e.
   no section-bearing ancestor exists) and no `sections` container is present
   in the document, first insert a `sections` node at the schema-mandated
   position (immediately after `preface` if present, otherwise at the start of
   `doc`; before any `bibliography`/`footnotes`). If a `sections` container
   already exists, target it as the insertion parent. Re-resolve the block
   range inside the (possibly newly created) `sections` container. The
   container creation, the wrap, and the selection move are all part of the
   same transaction.
5. Wrap the range with the clause using `tr.wrap(range, [{ type: clause, attrs }])`,
   **or**, when wrapping a collapsed cursor, insert the clause + paragraph via
   `tr.replaceSelectionWith` / a manual `ReplaceAroundStep` that preserves the
   surrounding block. (The exact step shape is an implementation detail; the
   invariant is: the original block content ends up as a child of the new
   clause, preceded by the empty paragraph.)
6. Map the selection into the new paragraph (`TextSelection.near` on the
   mapped position inside the clause).
7. `dispatch(tr.scrollIntoView())`; return `true`.

> **Selection-shape handling.** Standard `tr.wrap` over the `NodeRange` from
> `$from.blockRange($to)` correctly handles all in-section selection shapes:
> - **Single block / collapsed cursor** — the one block containing the cursor
>   moves inside the new clause.
> - **Multi-block range** — every block covered by the range moves inside the
>   new clause as siblings.
> - **Partial-block (text) selection** — `wrap` operates at the block level, so
>   the **whole** paragraph (including unselected text) moves inside the clause.
>   This is correct: a paragraph cannot be split across a section boundary.
>
> **Cross-section selections are disabled** (§5.1 step 5): `canWrapInClause`
> returns `false` when `$from` and `$to` are in different section ancestors, so
> `wrapInClause` never receives a cross-section range. No clamp or partial-wrap
> fallback is provided.

**Cursor placement.** The empty leading paragraph is where the cursor lands so
the user can immediately type the clause body; the heading `title` is captured
separately (§6) and written to the attribute, not into the paragraph.

### 5.3 `promoteClause` / `demoteClause`

```typescript
/** Lift the nearest enclosing clause out one nesting level. */
export function promoteClause(state: EditorState, dispatch?: (tr: Transaction) => void): boolean;

/** Nest the nearest enclosing clause as the last child of its preceding
 *  sibling section that can legally contain it. */
export function demoteClause(state: EditorState, dispatch?: (tr: Transaction) => void): boolean;
```

**`promoteClause` algorithm:**

1. Find the nearest enclosing `clause` via
   `findNearestSectionOfType($from, schema.nodes.clause)` (§5.5). If none,
   return `false`.
2. Determine its parent. If the parent is `doc` directly — impossible by schema
   (clause is never a doc child), but guard anyway. If the parent is a
   top-level container (`sections`/`preface`/`bibliography`), the clause is
   already at the top nesting level → return `false` (disabled in the UI).
3. Otherwise the parent is itself a section node. Compute the `NodeRange`
   spanning the clause and call ProseMirror's `lift` (`prosemirror-commands`
   `lift`, or `tr.lift(range, targetDepth)`). Validate that the lift target
   (the grandparent) can legally receive the clause as a child at that position
   via `parentAccepts`; ProseMirror's `lift` already enforces the content
   model, but the explicit check keeps the `isEnabled` predicate honest.
4. `dispatch(tr.scrollIntoView())`; return `true`.

**`demoteClause` algorithm:**

1. Find the nearest enclosing clause (§5.5). If none, return `false`.
2. Find its **preceding sibling** that is a section node which can legally
   contain a `clause` (`clause`, `annex`, `terms`, `definitions`,
   `references`, or `content_section`). Use `parentAccepts(sibling, clause,
   lastChildIndex)`. If no such sibling, return `false` (disabled).
3. Move the clause to become the last child of that sibling. Implement as a
   `ReplaceStep`/`ReplaceAroundStep` pair: delete the clause from its current
   position, insert it at the end of the sibling's content. Re-validate with
   `siblingType.validContent(newFragment)`.
4. Restore a selection inside the moved clause (map the old selection through
   the step mapping). `dispatch(tr.scrollIntoView())`; return `true`.

> **Numbering.** `promoteClause` / `demoteClause` require **no `number`
> handling**: in editor-produced documents `number` is always `null` (no command
> sets it, no import path exists — §7). The commands simply carry the attr
> through the node replacement untouched. `id` is always preserved on the moved
> node.
>
> **Forward-looking note.** If a future feature (e.g. a Metanorma XML import
> mapping the Semantic XML `number=` override attribute into the ProseMirror
> `number` attr) introduces non-null `number` values, promote/demote should
> **clear `number` to `null`**: a stored number is a level-specific override that
> no longer applies at the new level. See §7 for why numbering is a presentation
> concern handled by the Metanorma pipeline, not the editor.
>
> **Undo granularity.** Every section command (`wrapInClause`,
> `promoteClause`, `demoteClause`, `setSectionType`) is a **single transaction**:
> one command = one transaction = **one undo step**. A promote or demote moves
> the clause (with its entire subtree) as one node replacement, so the user
> presses Undo once to revert. No `addToHistory` meta is needed today. If a
> future enhancement ever splits a structural change across multiple
> transactions, it must coalesce them via
> `tr.setMeta("addToHistory", false)` on all intermediate steps so the
> one-undo-per-action invariant is preserved.

### 5.4 `setSectionType`

```typescript
/**
 * Convert the nearest enclosing section node into `targetType`, preserving
 * its `id`, `title`, `data`, and (optionally) `number`, and keeping its
 * children iff `targetType.validContent(current.content)`. If the children
 * are not legal under `targetType` (e.g. converting a `clause` with nested
 * clauses into an `abstract`, which is block+-only), return false (disabled).
 */
export function setSectionType(
  state: EditorState,
  targetType: NodeType,
  dispatch?: (tr: Transaction) => void,
): boolean;
```

**Algorithm:**

1. Find nearest enclosing section node (any of the ten; §5.5 with a predicate
   matching the `section` group). If none or it is already `targetType`,
   return `false`.
2. `if (!targetType.validContent(current.content)) return false;`
3. `const replacement = targetType.createChecked({ ...current.attrs }, current.content);`
   (`createChecked` re-validates; throws if invalid, so guard with `validContent`
   first to stay in the `(state, dispatch?) => boolean` contract.)
4. `tr.replaceRangeWith` / a `ReplaceStep` that swaps `current` for
   `replacement` in the parent, preserving position. Re-select inside the new
   node. `dispatch(tr.scrollIntoView())`; return `true`.

Because every section node shares `group: "section"`, the parent's content
expression is unaffected by the type change — only the node's own children must
satisfy `targetType`. This is why `abstract`/`foreword`/`introduction`/
`acknowledgements` are legal conversion *targets* only when the source's
content is pure `block+` (no nested clauses).

### 5.5 Ancestor-walking helpers

```typescript
/**
 * Resolve the nearest ancestor of `$pos` whose type is in group "section".
 * Returns the node and its depth, or null at the doc root.
 */
export function nearestSectionAncestor(
  $pos: ResolvedPos,
): { readonly node: Node; readonly depth: number } | null;

/**
 * Resolve the nearest ancestor of `$pos` that is exactly `type`
 * (e.g. schema.nodes.clause). Returns node + depth, or null.
 */
export function findNearestSectionOfType(
  $pos: ResolvedPos,
  type: NodeType,
): { readonly node: Node; readonly depth: number } | null;
```

These walk `$pos.depth → 1` via `$pos.node(d)`, returning the first match.
`$pos.node(0)` (the doc) is never a section and is skipped.

> **Location / visibility.** All four legality helpers (`canWrapInClause`,
> `parentAccepts`, `nearestSectionAncestor`, `findNearestSectionOfType`) are pure
> state-reading functions and live alongside the commands in
> `pkg/editor-commands/commands/sections.ts`. They are **internal helpers**:
> `canWrapInClause` is exposed because the toolbar's `isEnabled` selector calls it
> directly, but the others (`parentAccepts`, `nearestSectionAncestor`,
> `findNearestSectionOfType`) need not be part of the documented public API unless
> a consumer requires them — they may be unexported or exported as utilities. None
> of them take an `EditorView` or touch the DOM.

## 6. Active / enabled detection (UI wiring)

Each button's `isEnabled` is a pure `(state) => boolean` selector evaluated via
`useEditorStateSelector`, exactly as in `MetanormaToolbar.spec.md` §7. The
ancestors are walked from `state.selection.$from`:

```typescript
import { useEditorStateSelector, useEditorEventCallback } from "@handlewithcare/react-prosemirror";

// Insert clause enabled?
const canInsert = useEditorStateSelector((state) => canWrapInClause(state));

// Promote enabled?  nearest clause exists AND its parent is itself a section
// (i.e. the clause is not already a top-level child of a container).
const canPromote = useEditorStateSelector((state) => {
  const { $from } = state.selection;
  const clauseHit = findNearestSectionOfType($from, state.schema.nodes.clause);
  if (!clauseHit) return false;
  const parentDepth = clauseHit.depth - 1;
  if (parentDepth < 1) return false;
  const parent = $from.node(parentDepth);
  // The parent must itself be a section node for a lift "out one level" to be
  // meaningful; a top-level container (sections/preface/bibliography) means
  // the clause is already at the top nesting level.
  return nearestSectionAncestor($from).depth === parentDepth;
});
```

These predicates lean on the exported schema-driven helpers (`canWrapInClause`,
`nearestSectionAncestor`, `findNearestSectionOfType`, `parentAccepts`) rather
than inspecting `spec.group` strings or hand-maintained allow-lists, so they
stay correct if the content expressions change.

Selectors return primitives (`boolean`) so only the button whose state changed
re-renders, matching the base toolbar's performance contract.

**Disabled contexts (summary):**

| Button | Disabled when |
|---|---|
| Insert clause | No ancestor permits a clause child (e.g. inside `abstract`/`foreword`/`introduction`/`acknowledgements`, or a `block`-only node). |
| Promote | Nearest clause is already a top-level child of a container (`sections`/`preface`/`bibliography`); or no enclosing clause at all. |
| Demote | No preceding sibling section that can legally hold a clause; or inside a leaf section. |
| Change section type | No legal alternative type exists for the current section's content; or not inside any section. |

## 7. The `title` attribute (heading text)

`sectionAttrs.title` is the user-facing clause heading. On **Insert clause** the
toolbar must obtain a value for it. Three options are considered; the spec
recommends the popover for the advanced toolbar and keeps `window.prompt` as a
fallback hook, mirroring the base toolbar's `onLinkPrompt` pattern
(MetanormaToolbar.spec.md §6):

1. **Popover input (recommended).** A small absolutely-positioned input
   anchored to the button / selection, with an explicit "Confirm" / "Cancel".
   This is accessible (§9), dismissible, and composes with the existing React
   tree. Recommended for the advanced toolbar.
2. **`window.prompt('Clause heading:')`.** Deliberately simple; the baseline.
   Reuses the same escape-hatch prop pattern as the link prompt:
   ```typescript
   /** Optional custom heading prompt. Default: window.prompt. */
   readonly onHeadingPrompt?: () => Promise<string | null>;
   ```
   When it resolves `null`, the insert is cancelled. When it resolves a string,
   that becomes `title` (empty string → `title: null`).
3. **Empty default.** Skip the prompt; insert with `title: null`. The heading
   is then edited elsewhere (e.g. a node-view title field). Lowest friction but
   yields untitled clauses; suitable only if a downstream node view renders an
   editable title.

`id` and `number` are **never** user input: `id` is **generated at insertion
time** via the shared `generateId()` helper (a `crypto.randomUUID()`-based
string), and `number` is left `null` on insert. All section commands leave
`number` `null`.

> **Numbering is not an editor concern.** Clause/section numbering is a
> **presentation** concern, computed by the Metanorma pipeline during the
> Semantic→Presentation XML conversion — specifically by IsoDoc's
> `XrefGen::Sections` module (`lib/isodoc/xref/xref_sect_gen.rb`, mixed into
> `IsoDoc::Xref`; [rdoc](https://www.rubydoc.info/gems/isodoc/2.9.3/IsoDoc/XrefGen/Sections)).
> `clause_order` partitions the document into preface/main/annex/back;
> `section_names`/`section_names1` produce dotted hierarchical body numbers
> (`1`, `1.1`, `A.1`); `annex_names` produces letters (`A`, `B`); prefaces and
> back-matter are unnumbered. The result is stored in an in-memory `@anchors`
> hash keyed by element id — it is **not** written as a `number=` attribute on
> the Semantic XML. A literal `number` attribute on `<clause>` in Semantic XML
> is an override hint only (metanorma-standoc ≥ v1.4.1). See
> [Auto-numbering](https://www.metanorma.org/author/basics/numbering/) and
> [Sections](https://www.metanorma.org/author/topics/sections/).
>
> **Consequence for direct-to-Presentation-XML consumers.** If a consumer
> converts the editor's output directly to Presentation XML **without** running
> the IsoDoc `XrefGen` pass (the numbering computation), clause numbering will
> **not** be applied. The editor does not compensate for this: it emits `number`
> `null` and relies on the downstream pipeline to compute numbers. (The
> [LADL](https://metanorma.github.io/docs/) "Label Auto-assignment Definition
> Language" spec that will eventually formalise this is still a draft, doc #112.)
>
> Accordingly, the editor does not implement auto-numbering: `number` is left
> `null` by every section command (insert, promote, demote, set-type). If a
> future editor feature needs to *display* a number, it should be a read-only
> decoration derived from a tree-walk over the live document, not a value
> persisted on the node — but that is a separate, deferred feature.

> **Alternative (not adopted):** leave `id` as `null` and let a downstream
> document pipeline assign ids. Rejected in favour of assigning at insertion
> time for consistency across all node-insertion commands.

## 8. CSS classes

The structural buttons reuse the base `mn-toolbar-btn`, `--active`, `--disabled`,
and `mn-toolbar-divider` classes. Feature-specific additions for this group:

| Class | Purpose |
|---|---|
| `.mn-toolbar-btn--sections` | Optional modifier marking buttons belonging to the `sections` group (for targeted styling / icon colour). |
| `.mn-toolbar-section-menu` | The `<select>` or sub-menu (`role="listbox"`) listing section node types. Shared by the §4.2 insert split-button dropdown and the §4.5 "Change section type" menu. |
| `.mn-toolbar-heading-popover` | The popover `<div>` containing the heading `<input>` (§7 option 1). Anchored, with `role="dialog"`. |

No new root or group-container classes are required beyond the base
`.mn-toolbar-group`.

## 9. Accessibility

In addition to the base toolbar guarantees (`MetanormaToolbar.spec.md` §9),
the structural buttons add:

- **Insert clause (+ split menu)** — primary button:
  `aria-label="Insert clause"`, `aria-pressed="false"` (not a toggle). The
  dropdown caret has `aria-haspopup="listbox"` / `aria-expanded`; the menu uses
  `role="listbox"` with `role="option"` entries, keyboard-navigable via Arrow
  keys, confirming with Enter and dismissing with Escape. Disabled entries
  carry `aria-disabled="true"`. When the primary button itself is disabled, set
  `disabled` and `aria-disabled="true"`.
- **Promote / Demote** — `aria-label="Promote clause"` /
  `"Demote clause"`. Since they are one-shot actions (not toggles), they do not
  use `aria-pressed`; instead convey current applicability via
  `disabled` / `aria-disabled`. An `aria-describedby` can point at a hidden
  live region announcing the current nesting depth (e.g. "Clause at level 2").
- **Change section type** — the triggering button has
  `aria-haspopup="listbox"` / `aria-expanded`; the menu uses
  `role="listbox"` with `role="option"` entries, keyboard-navigable via
  Arrow keys, confirming with Enter and dismissing with Escape.
- **Heading popover (§7 option 1)** — `role="dialog"`,
  `aria-modal="false"` (non-blocking), `aria-label="Clause heading"`. Focus
  moves to the `<input>` on open and returns to the Insert-clause button on
  close. The `<input>` has an associated `<label>` ("Heading text"). Enter
  confirms, Escape cancels.
- All structural buttons remain native `<button>` elements, so they are
  keyboard-focusable and operable via Enter / Space without extra code.

> **Nesting depth and heading-level representation.** There is **no depth cap**:
  the schema permits unbounded `clause`-within-`clause` nesting, and the toolbar
  never disables Demote based on depth (Metanorma documents legitimately nest
  beyond 6, e.g. annex sub-clauses; capping would reject valid documents).
  Because HTML has only six heading elements (`<h1>`–`<h6>`), heading level is
  conveyed via **`aria-level`** set to the clause's true nesting depth on the
  rendered `<section>` element (computed from the node tree by a node view or
  decoration, never stored on the node). `aria-level` accepts any positive
  integer, so it remains accurate past level 6. A visual `<hN>` may optionally
  be synthesised for display, clamped to `<h6>` past level 6, but `aria-level`
  carries the true depth to assistive tech. Depth is **derived**, not stored:
  it is recomputed whenever the clause's ancestors change (insert/promote/
  demote), so no command needs to maintain it.

## 10. Open questions / unknowns

These are genuine unresolved design questions, listed for review:

(none remain — all questions resolved.)

## 11. Export changes

Per the command contract (`EditorCommands.spec.md` §1.2, §1.10), the structural
commands are defined in and exported from **`@metanorma/editor-commands`**, and
`@metanorma/prosemirror-editor` **re-exports** them for toolbar/keymap
consumers. The toolbar component and its view-holding adapters stay in
`prosemirror-editor`.

**`pkg/editor-commands/index.ts`** adds:

```typescript
// Structural (section/clause nesting) commands — Command contract §1.5.
// Pure: (state, dispatch?, ...) => boolean; no EditorView, no DOM.
export {
  wrapInClause,
  promoteClause,
  demoteClause,
  setSectionType,
  canWrapInClause,        // exposed for toolbar isEnabled selector
} from "./commands/sections.js";

// Internal helpers (exported only as needed; not part of documented public API
// unless a consumer requires them — see §5.5):
//   parentAccepts, nearestSectionAncestor, findNearestSectionOfType
```

> **No `wrapInClauseView` (or any `*View` symbol) is exported from
> `editor-commands`.** View-holding adapters are a UI concern and live in
> `prosemirror-editor`; the pure commands take `title` / `targetType` as ordinary
> arguments so no `EditorView` enters the command layer.

**`pkg/prosemirror-editor/index.ts`** re-exports the commands from the
commands package (so toolbar/keymap code can import everything from one place)
and adds the section-group type. (Note: the base spec's `toggleList` command is
similarly sourced from `@metanorma/editor-commands` and re-exported here.)

```typescript
// Re-export structural commands from @metanorma/editor-commands.
export {
  wrapInClause,
  promoteClause,
  demoteClause,
  setSectionType,
  canWrapInClause,
} from "@metanorma/editor-commands";
```

If the advanced toolbar lives in a separate component (e.g.
`AdvancedMetanormaToolbar.tsx`) rather than extending `MetanormaToolbar.tsx`,
add:

```typescript
export { AdvancedMetanormaToolbar } from "./AdvancedMetanormaToolbar.js";
export type { AdvancedMetanormaToolbarProps } from "./AdvancedMetanormaToolbar.js";
```

## 12. File structure summary

The structural command logic lives in `@metanorma/editor-commands`; the toolbar
component, its view-holding adapters, and the re-exports live in
`@metanorma/prosemirror-editor`.

```
pkg/editor-commands/
  commands/
    sections.ts                   ← structural commands + legality helpers (§5)
  index.ts                        ← exports wrapInClause, promoteClause,
                                    demoteClause, setSectionType, canWrapInClause

pkg/prosemirror-editor/
  MetanormaToolbar.tsx            ← base toolbar (existing spec; gains 'sections' group)
  AdvancedMetanormaToolbar.tsx    ← advanced toolbar (this document), if separated
  toolbar.css                     ← shared styles; add --sections modifiers (§8)
  index.ts                        ← re-export commands from @metanorma/editor-commands;
                                    export AdvancedMetanormaToolbar (§11)

docs/AdvancedMetanormaToolbar/
  sections.md                     ← this document
```

> The `commands/` directory does **not** exist under
> `pkg/prosemirror-editor/` for these commands — section/clause command
> logic lives in `pkg/editor-commands/commands/sections.ts`. Only view-holding
> adapters (the button `run(view)` wrappers that call the pure command and then
> `view.focus()`) belong in `prosemirror-editor`, alongside the toolbar component.

## 13. TypeScript constraints

The project tsconfig enforces `strict`, `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `module: node16` (per
project memory). All new code in `pkg/editor-commands/commands/sections.ts`
(the command logic) and the toolbar component in `prosemirror-editor` must:

- Use `import type` for type-only imports (`Command`, `EditorState`,
  `Transaction`, `Node`, `NodeType`, `ResolvedPos`). **`EditorView` is imported
  only in `prosemirror-editor` (the adapter layer), never in
  `editor-commands`** — commands are DOM-free per the Command contract
  (`EditorCommands.spec.md` §1.8).
- Use `.js` extensions in all relative imports
  (`from "./commands/sections.js"`, `from "../schema.js"`). Imports across
  packages use the package name (`from "@metanorma/editor-commands"`).
- Avoid `undefined` for optional values — use optional `?` syntax and `null`
  for absent attr values (matching `sectionAttrs` defaults).
- Handle `null` / `undefined` from `noUncheckedIndexedAccess`: every
  `$from.node(d)` / array access / `matchType(...)` result must be narrowed
  before use. The helpers in §5.5 return
  `{ node, depth } | null` and callers must guard.
- Export all types alongside implementations; command signatures use the
  standard `(state, dispatch?) => boolean` so they compose with
  `prosemirror-commands` and satisfy the Command contract.
