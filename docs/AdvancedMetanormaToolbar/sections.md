# Section & clause nesting

## 1. Purpose

This document is the detailed implementation proposal for **section / clause
nesting** operations in `AdvancedMetanormaToolbar`. It directly addresses the
item listed as "out of scope (future work)" in §5.5 of
`docs/MetanormaToolbar.spec.md`:

**Section / clause nesting** — structural operations that affect the
document tree at the `sections` / `clause` level.

The base `MetanormaToolbar` handles inline marks, block wraps (`quote`,
`note`, `example`), lists, and links. It deliberately does not touch the
document's structural skeleton. This document specifies the buttons, commands,
state detection, and accessibility for structural editing:
inserting clauses, promoting / demoting clauses through nesting levels, and
changing the type of a section node — all against the content model defined in
`@metanorma/prosemirror-schema`.

This document does **not** rehash the base toolbar's mark / block / list / link
behaviour. It assumes the integration model, `ToolbarButton` descriptor, CSS
prefix (`mn-toolbar`), and TypeScript constraints defined in
`MetanormaToolbar.spec.md` §3–§8, §12 and reuses them unchanged.

## 2. Schema recap

All node references below are from `schema.spec.md` §8.2 (Section nodes —
implementation `pkg/prosemirror-schema/nodes.ts`). The group constants
(`BLOCK_GROUP = "block"`, `SECTION_FRONT_GROUP = "section_front"`,
`SECTION_BODY_GROUP = "section_body"`, `SECTION_ANNEX_GROUP = "section_annex"`,
`SECTION_BACK_GROUP = "section_back"`)
are from `schema.spec.md` §4 (implementation `pkg/prosemirror-schema/groups.ts`).
The cohort metadata that maps each section type to its cohort is from
`schema.spec.md` §8.0a (implementation `pkg/prosemirror-schema/cohorts.ts`).

### 2.1 Structural containers

The document skeleton is built from five non-section container/structural nodes:

| Node | Content expression | attrs | toDOM |
|---|---|---|---|
| `doc` | `(bibdata preface? sections? annex* bibliography? footnotes?)` | `data` | `<div class="mn-doc">` |
| `bibdata` | *(empty atom)* | `item` | `<div class="mn-bibdata">` |
| `preface` | `section_front+` | `baseAttrs` (id, number, data) | `<section class="mn-preface">` |
| `sections` | `section_body+` | `baseAttrs` | `<section class="mn-sections">` |
| `bibliography` | `references+` | `baseAttrs` | `<section class="mn-bibliography">` |

**Cohort boundaries are enforced at the schema level.** Each container admits
only its own cohort's section types (`preface` → `section_front`, `sections` →
`section_body`, `bibliography` → `section_back`). The toolbar and commands need
not re-check these constraints — ProseMirror's content validation rejects any
violation. The cohort metadata (`SECTION_COHORT`, `COHORT_CONTAINER`,
`DOC_CHILD_ORDER` — schema §8.0a) drives command-level routing.

**doc ordering constraint.** `doc.content` is strictly ordered:
`(bibdata preface? sections? annex* bibliography? footnotes?)`. **Annexes are
doc-level siblings** — the one section family that is a direct child of `doc`,
placed after `sections` and before `bibliography` (Isodoc root child order).
Every other section node appears inside `preface`, `sections`, or
`bibliography`, and those three containers must appear in that fixed order.
The `ensureContainer` helper
([EditorCommands.spec.md](./../EditorCommands.spec.md) §5.4) computes the
correct insertion position from `DOC_CHILD_ORDER` when a container must be
created; the annex cohort has no container (`COHORT_CONTAINER` carries no
`"annex"` key), so `insertSection` inserts annexes at the doc level directly.

### 2.2 Section nodes — cohort groups

All ten section nodes carry `attrs: sectionAttrs()` = `{ id, number, data }`
(`id` and `number` default `null`, `data` defaults to `{}`). Each is assigned to
exactly one cohort group (schema §8.2):

| Section node | Cohort | Content expression | Can nest section children? |
|---|---|---|---|
| `clause` | body (`section_body`) | `section_title? (block+ \| (clause \| terms \| definitions \| floating_title)+)` | ✅ yes (`clause`, `terms`, `definitions`, `floating_title`) — **strict XOR**: blocks *or* subclauses, never both |
| `terms` | body (`section_body`) | `section_title? block* (terms \| definitions)*` | ✅ yes (`terms`, `definitions`) |
| `definitions` | body (`section_body`) | `section_title? (block \| definitions)+` | ✅ yes (`definitions`) |
| `annex` | annex (`section_annex`) | `section_title? block* (clause \| terms \| definitions \| references \| floating_title)*` | ✅ yes (`clause`, `terms`, `definitions`, `references`, `floating_title`) — **doc-level** node, no self-nesting |
| `references` | back (`section_back`) | `section_title? block* bibitem* references*` | ✅ yes (`references`); entries via `bibitem` |
| `abstract` | front (`section_front`) | `section_title? block* content_section*` | ✅ yes (`content_section`) |
| `foreword` | front (`section_front`) | `section_title? block* content_section*` | ✅ yes (`content_section`) |
| `introduction` | front (`section_front`) | `section_title? block* content_section*` | ✅ yes (`content_section`) |
| `acknowledgements` | front (`section_front`) | `section_title? block* content_section*` | ✅ yes (`content_section`) |
| `content_section` | front (`section_front`) | `section_title? block* content_section*` | ✅ yes (`content_section`) |

**Key distinction.** Three body section types (`clause`, `terms`,
`definitions`) nest inside the numbered body hierarchy. `clause` is **strict**
(Isodoc `Clause-Section`): it holds either a block run or a subclause run,
never both — there are no hanging paragraphs in the numbered body. The four
named front-matter types plus `content_section` follow the `Content-Section`
shape (prefatory blocks, then `content_section` subclauses); `content_section`
is Isodoc's `content` — the generic unnumbered preface clause, front-matter
only, serializing as `<clause>` on export (schema §17.6). `annex` is a
doc-level sibling whose subclause vocabulary admits `references`. `references`
(back) holds an ordered sequence of prefatory blocks, `bibitem` entries, then
nested `references`. Any "insert section" / "demote" operation must be
disabled when the insertion or demotion target cannot legally receive the
node under these expressions.

**Strict-XOR accommodation.** Because `clause` is strict, inserting a
subclause into a block-bearing clause requires the blocks to be folded into a
subclause first. The `ensureSubclauseCapacity` helper
([EditorCommands.spec.md](./../EditorCommands.spec.md) §5.5) performs that
wrap inside the same transaction (one undo step); `insertSection`,
`wrapInClause`, and `demoteClause` all invoke it.

#### floating_title is a distinct concept, not a section

The schema also defines a `floating_title` node — a **groupless textblock**
(no PM group membership, `content: "inline*"`, attrs `{ id, depth, data }` —
it carries `id`/`depth`/`data` but its heading text is inline content, not an
attribute). It renders as a non-`<section>` `<div class="mn-floating-title">`
and is deliberately placed **outside the numbered section hierarchy** — per
[Metanorma's documentation](https://www.metanorma.org/author/topics/sections/),
"a floating title is a title that is placed outside the numbered hierarchy of
clauses … not uniquely referable like normal clauses." It is therefore **not**
an alternative to a `section_title` (which is the heading *of* a numbered
section node that participates in nesting and cross-referencing) but a
free-standing, unnumbered heading.

Because it is groupless, `floating_title` can appear only where a content
expression names it explicitly — at the top level of `sections`, and in the
subclause branches of `clause` and `annex` (schema §8.3). These positions match
Isodoc's `floating-title` exactly (it is never a `BasicBlock`), so a converter
needs no positional coercion.

**Consequence for this toolbar:** the Section popover (§4.2) lists only the
ten section node types — it does **not** offer `floating_title`, because an
unnumbered heading is not a section type and does not belong in a
cohort-grouped section menu. Insertion is provided by the dedicated
**Floating title** button (§4.5), whose tooltip states the distinction
explicitly: *"Insert floating title (an unnumbered heading — not a
section)"*. The structural commands (`promoteClause`, `demoteClause`) never
produce a `floating_title` either; it is inserted only by
`insertFloatingTitle` ([EditorCommands.spec.md](./../EditorCommands.spec.md)
§5.8).

### 2.3 Attributes

- `section_title` child node — the clause **heading textblock** (`content:
  "inline*"`), the optional leading child of every section node. The user types
  the heading directly into it after clause insertion (§7); no prompt dialog is
  used. It supports full inline markup (emphasis, links, etc.).
- `id` — stable identifier. **Tooling-assigned** (§7), never typed by the user.
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

The minimal set is a **Section insertion control** (a popover listing all ten
section types). The structural operations that follow naturally from the
nesting model are **Promote** (decrease nesting depth) and **Demote** (increase
nesting depth). Because a `floating_title` is legal in the same zones the
section commands navigate and is not reachable through the popover, a fourth
button — **Floating title** — completes the set. The set:

| # | Button | Label | Purpose |
|---|---|---|---|
| 1 | Section (popover) | `Section` | Opens a popover listing all ten section types grouped by cohort (Front matter / Body / Annexes / Back matter). Selecting a type calls the pure `insertSection` command, which routes the new section to the correct location — container for front/body/back cohorts, doc level for annexes — creating the container if needed. The new section gets an empty `section_title` heading and a `paragraph` body; the cursor lands in the `section_title`. |
| 2 | Promote clause | `Promote` | Lift the nearest enclosing clause out one nesting level (move it to be a sibling of its parent clause). Disabled at the top structural level, and when the clause is its parent's only child (promoting it would empty the parent). |
| 3 | Demote clause | `Demote` | Nest the nearest enclosing clause as the last child of its preceding sibling clause (one level deeper). Disabled when no legal deeper target exists. |
| 4 | Floating title | `Floating title` | Insert an empty `floating_title` textblock at the cursor's legal position via the pure `insertFloatingTitle` command — an unnumbered free-standing heading, deliberately **not** a section node and not in the popover. The tooltip carries that clarification explicitly: "Insert floating title (an unnumbered heading — not a section)". Disabled where no ancestor admits a `floating_title` (§4.5). |

**Why this set, and not more.** Section insertion is the single most-requested
structural action. The Section popover unifies all ten types into one control
(grouped by cohort so the user sees front matter / body / annexes / back matter
at a glance), rather than dedicating a button per type. Promote / demote are the
natural complements — they are the only operations that change nesting *depth*
without changing node identity, and they round-trip each other. The cohort
routing (`insertSection` calls `ensureContainer` to create the right container,
or inserts annexes directly at the doc level) means the user never has to
manually create a `preface` or `bibliography` container before inserting a
front/back section — the command does it. Floating title earns its own button
because it is the one structural heading the popover must never offer: putting
it in a cohort-grouped section menu would misrepresent it as a section type,
so it lives beside the popover as a plain button instead.

### 4.2 Button: Section (popover)

The **Section** control is a trigger button that opens a `popover="auto"`
popover (the HTML Popover API, same pattern as the other toolbar pickers;
light-dismiss closes it on outside click / Escape). The popover lists **all ten
section types** in four cohort groups. Each type is a button; clicking it
inserts a section of that type via the pure `insertSection` command and closes
the popover.

**Trigger button:**

| Field | Value |
|---|---|
| `label` | `Section` |
| `title` | `"Insert a section"` |
| `isEnabled` | Always enabled — there is always a valid insertion target (`insertSection` creates the container if missing, and annexes always have a doc-level target). |
| `run` | Opens the popover (`popoverRef.showPopover()`). Selecting a type calls `insertSection(view.state, typeName, view.dispatch)` then `view.focus()`. |

**Popover content.** The menu groups the ten section types by cohort, in
document-appearance order:

| Group | Heading | Types |
|---|---|---|
| Front matter | "Front matter" | `abstract`, `foreword`, `introduction`, `acknowledgements`, `content_section` |
| Body | "Body" | `clause`, `terms`, `definitions` |
| Annexes | "Annexes" | `annex` |
| Back matter | "Back matter" | `references` |

The type lists come from the schema's `FRONT_TYPES`, `BODY_TYPES`,
`ANNEX_TYPES`, and `BACK_TYPES` constants (schema §8.0a), so the popover always
reflects the authoritative cohort membership. Each type has a human-readable
label ("Abstract", "Foreword", "Clause", "Annex", "References", etc.).

**`isActive`.** The trigger button is not a toggle — `isActive` is always
`false`.

### 4.3 Button: Promote clause

| Field | Value |
|---|---|
| `key` | `"sections-promote"` |
| `label` | `Promote` |
| `title` | `"Promote clause (move out one level)"` |
| `isActive` | `false` |
| `isEnabled` | `promoteClause(state) === true` — mirrors the command's applicability: the nearest enclosing clause's parent is itself a body section (`section_body` group) **and** the clause has at least one sibling (promoting an only child would empty the parent, violating its `(...)+` branch). Disabled when the clause is already a top-level child of `sections` (or `preface`/`bibliography`), when no enclosing clause exists, or when the clause is its parent's only child. |
| `run` | Toolbar adapter calls `promoteClause(view.state, view.dispatch)` (§5.3), then `view.focus()`. |

### 4.4 Button: Demote clause

| Field | Value |
|---|---|
| `key` | `"sections-demote"` |
| `label` | `Demote` |
| `title` | `"Demote clause (nest one level deeper)"` |
| `isActive` | `false` |
| `isEnabled` | `demoteClause(state) === true` — mirrors the command's applicability: the nearest enclosing clause has a preceding sibling in the `section_body` group that can legally contain a clause **after** the strict-XOR accommodation (a block-bearing sibling clause gets its blocks wrapped into a subclause first), so it can be reparented as that sibling's last child. Disabled at the top of a container with no preceding-section sibling, or when the only candidate parent cannot legally hold the clause even post-accommodation. |
| `run` | Toolbar adapter calls `demoteClause(view.state, view.dispatch)` (§5.3), then `view.focus()`. |

### 4.5 Button: Floating title

| Field | Value |
|---|---|
| `key` | `"sections-floating-title"` |
| `label` | `Floating title` |
| `title` | `"Insert floating title (an unnumbered heading — not a section)"` — the tooltip carries the clarification that a floating title is **not technically a section**: it is a free-standing heading outside the numbered hierarchy, which is why it is a separate button rather than an entry in the Section popover (§4.2). |
| `isActive` | `false` — insertion is not a toggle; the button is never shown active. |
| `isEnabled` | `insertFloatingTitle(state) === true` — the command query, mirroring the Promote / Demote pattern (§4.3, §4.4) so `isEnabled` stays exactly in sync with the command's applicability. Enabled exactly where some ancestor admits a `floating_title` child at the cursor index: `sections` top level, a `clause` subclause branch, or an `annex` subclause branch. **Not** disabled in a blocks-only clause — the clause itself rejects the FT, but `sections` further out admits it, and the deepest admitting ancestor wins, so the FT is inserted at `sections` top level (`EditorCommands.spec.md` §5.8.4). Disabled in `preface` and the other doc-level containers, and inside container blocks (`note`, `example`, `quote`, `dd`, table cells) — see the summary table in §6. |
| `run` | Toolbar adapter calls `insertFloatingTitle(view.state, view.dispatch)` (§5.6), then `view.focus()`. The cursor lands inside the new empty `floating_title` textblock for immediate typing — no prompt, no dialog, no `window.prompt`. |

## 5. Commands

The structural command logic lives in the **`@metanorma/editor-commands`**
package, at `pkg/editor-commands/commands/sections.ts` — **not** in
`pkg/toolbar`. The toolbar package (`@metanorma/toolbar`)
re-exports them; the toolbar component and its view-holding adapters stay in
`@metanorma/toolbar`. See §10 (exports) and §11 (file structure).

#### Command contract conformance

These commands conform to the Command contract (README §6.2;
`EditorCommands.spec.md` §1.5). Commands resolve node types through
`state.schema` per README §6.4; no `(schema) => Command` factory is required.

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
   ordering constraint `(bibdata preface? sections? annex* bibliography? footnotes?)`. Return
   `false` only when a `sections` container already exists but the cursor is
   not inside a section-bearing ancestor (e.g. inside `preface`/`bibliography`
   at a position where a clause is not legal). Sections that cannot hold a
   `clause` child (`abstract` etc.) have `content: "block* content_section*"`, so
   `matchType(clause)` is `null` there → disabled.

A more general form, used by Promote/Demote, resolves the match at a specific
parent + index:

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

**Why `contentMatch` / `validContent` and not an allow-list.** The content
model already encodes "(clause | block)*" vs "block+". Re-deriving legality
from the schema keeps the toolbar correct if the schema's content expressions
change, and avoids drift between the allow-list and the source of truth.
`NodeType.validContent(content)` answers "could this node legally hold this
exact fragment?" — ideal for Promote/Demote (which move real subtrees).

### 5.2 `wrapInClause`

```typescript
/**
 * Wrap the block(s) covered by the selection in a new `clause` node that
 * contains a leading empty `section_title` (the heading textblock) and an
 * empty `paragraph` body, then place the selection in the `section_title`.
 * The user types the heading inline — no prompt, no title argument. `id` and
 * `number` are left null (tooling-assigned). Conforms to the Command contract
 * (README §6.2; EditorCommands.spec.md §1.5).
 */
export function wrapInClause(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean;
```

**No `wrapInClauseView` overload.** An earlier draft specified a
`wrapInClauseView(view: EditorView, title): void` adapter in this module. That
is a UI concern and is **not** exported from `editor-commands`: the toolbar
button's `run(view)` adapter (which lives in `@metanorma/toolbar`) calls
`wrapInClause(view.state, view.dispatch)` and then `view.focus()`. The pure
command takes no heading argument — the heading is typed into the `section_title`
child after insertion, not passed as a parameter.

**Algorithm (`wrapInClause`):**

1. If `!canWrapInClause(state)` → return `false`.
2. Compute the block range to wrap. For a non-empty selection, use
   `state.selection`'s `$from`/`$to` block boundaries; for a collapsed cursor,
   wrap the single block containing the cursor. Derive a `NodeRange` via
   `$from.blockRange($to)`.
3. Build the new clause:
   `schema.nodes.clause.create({ id: generateId(), number: null, data: {} }, [schema.nodes.section_title.create(), schema.nodes.paragraph.create()])`.
   The leading `section_title` is the heading (where the cursor lands so the
   user can type the heading immediately); the `paragraph` is the body. The
   `id` is **generated at insertion time** via the shared `generateId()` helper
   from `@metanorma/editor-commands` (`util.ts`).
4. **Doc-top-level fallback.** If the block range's parent is the `doc` (i.e.
   no section-bearing ancestor exists), call the shared `ensureContainer`
   helper ([EditorCommands.spec.md](./../EditorCommands.spec.md) §5.4) to find
   or create the `sections` container at the schema-mandated position (computed
   from `DOC_CHILD_ORDER`). Re-resolve the block range inside the (possibly
   newly created) `sections` container. The container creation, the wrap, and
   the selection move are all part of the same transaction.
5. **Strict-XOR accommodation.** When the enclosing body `clause` holds a block
   run, call `ensureSubclauseCapacity`
   ([EditorCommands.spec.md](./../EditorCommands.spec.md) §5.5) to wrap those
   blocks into a subclause first — the same transaction, one undo step — then
   re-derive the block range against the post-wrap document before wrapping.
   Without this step the wrap would produce the forbidden blocks-plus-subclause
   mix inside the enclosing clause.
6. Wrap the range with the clause using `tr.wrap(range, [{ type: clause, attrs }])`,
   **or**, when wrapping a collapsed cursor, insert the clause + children via
   `tr.replaceSelectionWith` / a manual `ReplaceAroundStep` that preserves the
   surrounding block. (The exact step shape is an implementation detail; the
   invariant is: the original block content ends up as a child of the new
   clause, preceded by the `section_title` and `paragraph`.)
7. Map the selection into the new `section_title` (`TextSelection.near` on the
   mapped position `range.start + 2`, inside the section_title).
8. `dispatch(tr.scrollIntoView())`; return `true`.

**Selection-shape handling.** Standard `tr.wrap` over the `NodeRange` from
`$from.blockRange($to)` correctly handles all in-section selection shapes:
- **Single block / collapsed cursor** — the one block containing the cursor
  moves inside the new clause.
- **Multi-block range** — every block covered by the range moves inside the
  new clause as siblings.
- **Partial-block (text) selection** — `wrap` operates at the block level, so
  the **whole** paragraph (including unselected text) moves inside the clause.
  This is correct: a paragraph cannot be split across a section boundary.

**Cross-section selections are disabled** (§5.1 step 5): `canWrapInClause`
returns `false` when `$from` and `$to` are in different section ancestors, so
`wrapInClause` never receives a cross-section range. No clamp or partial-wrap
fallback is provided.

**Cursor placement.** The cursor lands in the `section_title` so the user can
immediately type the clause heading. Pressing Enter inside the `section_title`
exits to the body paragraph (via the `exitSectionTitle` command,
`EditorCommands.spec.md` §2.7), and the user types the body content there. The
heading is typed inline — no separate prompt or dialog.

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
   top-level container (`sections`/`preface`/`bibliography`) or not in the
   `section_body` group, the clause is already at the top nesting level (or
   outside body-section nesting) → return `false` (disabled in the UI).
3. Otherwise the parent is itself a body-section node (`section_body` group).
   Compute the `NodeRange` spanning the clause at the parent's depth and call
   ProseMirror's `lift` (`prosemirror-commands` `lift`, or
   `tr.lift(range, targetDepth)`). Validate that the lift target (the
   grandparent) can legally receive the clause as a child at that position via
   `parentAccepts`; ProseMirror's `lift` already enforces the content model,
   but the explicit check keeps the `isEnabled` predicate honest.
4. **Only-child refusal.** When the parent is a `clause` and the promoted
   clause is its **only child**, return `false`: lifting it would empty the
   parent, violating its `(...)+` branch. The command never auto-deletes the
   emptied parent (that would silently discard its `section_title`);
   `emptyTextblockBackspace` owns deletion flows
   ([EditorCommands.spec.md](./../EditorCommands.spec.md) §4).
5. `dispatch(tr.scrollIntoView())`; return `true`.

**`demoteClause` algorithm:**

1. Find the nearest enclosing clause (§5.5). If none, return `false`.
2. Find its **preceding sibling** that is a body-section node
   (`section_body` group) which can legally contain a `clause` (`clause`,
   `terms`, or `definitions`). If no such sibling, return `false` (disabled).
3. Move the clause to become the last child of that sibling. Implement as a
   `ReplaceStep`/`ReplaceAroundStep` pair: delete the clause from its current
   position, insert it at the end of the sibling's content. Re-validate with
   `siblingType.validContent(newFragment)` — **against the post-accommodation
   content**: when the target sibling is a body `clause` holding a block run,
   the strict-XOR auto-wrap folds those blocks into a subclause first, so the
   fragment validated is `clause(wrapped blocks)` + the moved clause, not the
   sibling's raw content. The post-accommodation classifier counts
   `floating_title` as a **subsection-run member** (like `section_body`
   children), not a block — a sibling clause holding
   `[section_title, floating_title]` is already in the subclause branch and
   is not auto-wrapped ([EditorCommands.spec.md](./../EditorCommands.spec.md)
   §5.5).
4. Dispatch order is **delete the moved clause → wrap the sibling's blocks →
   insert**: the delete runs first because the clause's original positions are
   computed against the pre-wrap document, and the wrap changes sizes before
   them (deleting the later clause does not shift the earlier sibling's
   positions, keeping the arithmetic simple).
5. Restore a selection inside the moved clause (map the old selection through
   the step mapping). `dispatch(tr.scrollIntoView())`; return `true`.

#### Numbering (promote/demote)

`promoteClause` / `demoteClause` require **no `number` handling**: in
editor-produced documents `number` is always `null` (no command sets it, no
import path exists — §7). The commands simply carry the attr through the node
replacement untouched. `id` is always preserved on the moved node.

**Forward-looking note.** If a future feature (e.g. a Metanorma XML import
mapping the Semantic XML `number=` override attribute into the ProseMirror
`number` attr) introduces non-null `number` values, promote/demote should
**clear `number` to `null`**: a stored number is a level-specific override that
no longer applies at the new level. See §7 for why numbering is a presentation
concern handled by the Metanorma pipeline, not the editor.

**Undo granularity.** Every section command (`wrapInClause`, `promoteClause`,
`demoteClause`) is a **single transaction**: one command = one transaction =
**one undo step**. A promote or demote moves the clause (with its entire
subtree) as one node replacement, so the user presses Undo once to revert. No
`addToHistory` meta is needed today. If a future enhancement ever splits a
structural change across multiple transactions, it must coalesce them via
`tr.setMeta("addToHistory", false)` on all intermediate steps so the
one-undo-per-action invariant is preserved.

### 5.4 Section insertion (`insertSection`)

Section insertion is handled by the pure `insertSection` command, specified in
[`EditorCommands.spec.md`](./../EditorCommands.spec.md) §5. It is re-exported
through `@metanorma/editor-commands` and consumed by the toolbar's
`SectionPopover` (§4.2). The command routes the new section by cohort — three
rules: **body** → sibling after the nearest body section (auto-wrapping a block
run via `ensureSubclauseCapacity` first) or append to a found-or-created
`sections` container; **annex** → doc-level insert after the last annex /
immediately after `sections`; **front/back** → find-or-create container and
insert at the cursor position when it sits directly inside, else append — using
the shared `ensureContainer` helper
([EditorCommands.spec.md](./../EditorCommands.spec.md) §5.4) and
`nearestBodySectionAncestor` ([EditorCommands.spec.md](./../EditorCommands.spec.md)
§5.6).

### 5.5 Ancestor-walking helpers

```typescript
/**
 * Resolve the nearest ancestor of `$pos` that is a section node (any cohort:
 * section_front, section_body, section_annex, or section_back). Returns the
 * node and its depth, or null at the doc root.
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

/**
 * Resolve the nearest ancestor of `$pos` that belongs to the `section_body`
 * cohort group. Used by `insertSection` to find a body-section sibling anchor.
 */
export function nearestBodySectionAncestor(
  $pos: ResolvedPos,
): { readonly node: Node; readonly depth: number } | null;
```

These walk `$pos.depth → 1` via `$pos.node(d)`, returning the first match.
`$pos.node(0)` (the doc) is never a section and is skipped.
`nearestSectionAncestor` checks cohort-group membership
(`section_front`/`section_body`/`section_annex`/`section_back`), so it includes
`annex` and `references` alongside the body and front types.
`nearestBodySectionAncestor` checks only `section_body` membership.

**Location / visibility.** The legality helpers (`canWrapInClause`,
`parentAccepts`, `nearestSectionAncestor`, `findNearestSectionOfType`,
`nearestBodySectionAncestor`) are pure state-reading functions and live
alongside the commands in `pkg/editor-commands/commands/sections.ts`. They are
**internal helpers**: `canWrapInClause` is exposed because the toolbar's
`isEnabled` selector calls it directly, but the others need not be part of the
documented public API unless a consumer requires them — they may be unexported
or exported as utilities. None of them take an `EditorView` or touch the DOM.

`nearestBodySectionAncestor` and `insertSection` are documented in
[`EditorCommands.spec.md`](./../EditorCommands.spec.md) §5.

### 5.6 Floating-title insertion (`insertFloatingTitle`)

Floating-title insertion is handled by the pure `insertFloatingTitle` command,
specified in [`EditorCommands.spec.md`](./../EditorCommands.spec.md) §5.8. It is
exported from `@metanorma/editor-commands`, re-exported through
`@metanorma/toolbar`, and consumed by the Floating title button (§4.5).

The command is schema-derived end to end: it walks the ancestor chain of the
cursor, asks each ancestor `parentAccepts(ancestor, floating_titleType,
$from.indexAfter(d))` (§5.1), and inserts after the **deepest admitting
ancestor** — the three legal zones (top level of `sections`, `clause`
subclause branch, `annex` subclause branch) fall out of the content
expressions with no hardcoded position list, and `preface`, the doc-level
containers, and block contexts (`note`/`example`/`quote`/`dd`/cells) are
refused automatically. On dispatch it creates an empty `floating_title`
(`createAndFill({ id: generateId(), depth: 1 })`), inserts it inside the
admitting ancestor after the cursor's child at that level
(`$from.after(admittingDepth + 1)`), and lands the cursor inside the new
textblock — one transaction, `scrollIntoView`, no prompt.

Two behaviours worth noting when wiring the button:

- **No auto-wrap.** In a blocks-only `clause` the deepest admitting ancestor is
  `sections`, so the FT lands at `sections` top level. The command never
  auto-wraps blocks into a subclause (a deliberate asymmetry with
  `ensureSubclauseCapacity` — an FT never *needs* a subclause sibling to be
  legal), which is why the button stays enabled there.
- **`isEnabled` mirrors the command.** The button queries
  `insertFloatingTitle(state) === true` directly, exactly like Promote/Demote
  (§4.3/§4.4), rather than reimplementing the walk as a separate predicate.

## 6. Active / enabled detection (UI wiring)

Each button's `isEnabled` is a pure `(state) => boolean` selector evaluated via
`useEditorStateSelector`, exactly as in `MetanormaToolbar.spec.md` §7.

The Promote, Demote, and Floating title buttons query their commands directly
(`promoteClause(state) === true` / `demoteClause(state) === true` /
`insertFloatingTitle(state) === true`), mirroring the command's applicability
so that `isEnabled` stays exactly in sync. The Section popover trigger is
always enabled — `insertSection` creates the container if missing and annexes
always have a doc-level target, so there is always a valid insertion target.

```typescript
import { useEditorStateSelector, useEditorEventCallback } from "@handlewithcare/react-prosemirror";

// Promote enabled?  Query the command's applicability.
const canPromote = useEditorStateSelector((state) => promoteClause(state) === true);

// Demote enabled?
const canDemote = useEditorStateSelector((state) => demoteClause(state) === true);

// Floating title enabled?
const canInsertFloatingTitle = useEditorStateSelector(
  (state) => insertFloatingTitle(state) === true,
);
```

These predicates lean on the exported commands (`promoteClause`, `demoteClause`)
which in turn use group-membership checks (`isInGroup("section_body")`) rather
than hand-maintained allow-lists, so they stay correct if the content
expressions change.

Selectors return primitives (`boolean`) so only the button whose state changed
re-renders, matching the base toolbar's performance contract.

**Disabled contexts (summary):**

| Button | Disabled when |
|---|---|
| Section (popover) | Never — there is always a valid insertion target (containers are created if missing; annexes always have a doc-level target). |
| Promote | Nearest clause is already a top-level child of `sections` (or not inside a `section_body` parent); no enclosing clause at all; or the clause is its **parent's only child** (promoting it would empty the parent). |
| Demote | No preceding sibling in the `section_body` group that can legally hold the clause even after the strict-XOR auto-wrap; or the clause is the first child of its parent. |
| Floating title | No ancestor admits a `floating_title` at the cursor — inside `preface` or the other doc-level containers, or inside a container block (`note`, `example`, `quote`, `dd`, a table cell). **Not** disabled in a blocks-only `clause`: the clause rejects the FT but `sections` further out admits it, so the insertion goes to `sections` top level (§4.5). |

## 7. The section heading (`section_title` child node)

The section heading is a `section_title` child textblock (schema §8.2 — the
optional leading child of every section node's content expression).
On **Section insertion** (§4.2 popover or `wrapInClause`), the toolbar creates
the section synchronously with an empty `section_title` and a `paragraph` body,
and the cursor lands in the `section_title`. The user types the heading
directly into it — **no prompt dialog, no `window.prompt`, no async capture**.
The heading supports full inline markup (emphasis, links, reference marks,
etc.) because it is an ordinary `inline*` textblock. Pressing Enter inside the
`section_title` exits to the body paragraph (via the `exitSectionTitle`
command, `EditorCommands.spec.md` §2.7). There is no way to add an intro
paragraph before a clause's subclauses — the strict `Clause-Section` XOR
forbids hanging paragraphs; the `ensureSubclauseCapacity` accommodation folds
existing blocks into a subclause instead (§2.2).

`id` and `number` are **never** user input: `id` is **generated at insertion
time** via the shared `generateId()` helper (a `crypto.randomUUID()`-based
string), and `number` is left `null` on insert. All section commands leave
`number` `null`.

#### Numbering is not an editor concern

Clause/section numbering is a **presentation** concern, computed by the
Metanorma pipeline during the Semantic→Presentation XML conversion —
specifically by IsoDoc's `XrefGen::Sections` module
(`lib/isodoc/xref/xref_sect_gen.rb`, mixed into `IsoDoc::Xref`;
[rdoc](https://www.rubydoc.info/gems/isodoc/2.9.3/IsoDoc/XrefGen/Sections)).
`clause_order` partitions the document into preface/main/annex/back;
`section_names`/`section_names1` produce dotted hierarchical body numbers
(`1`, `1.1`, `A.1`); `annex_names` produces letters (`A`, `B`); prefaces and
back-matter are unnumbered. The result is stored in an in-memory `@anchors`
hash keyed by element id — it is **not** written as a `number=` attribute on
the Semantic XML. A literal `number` attribute on `<clause>` in Semantic XML
is an override hint only (metanorma-standoc ≥ v1.4.1). See
[Auto-numbering](https://www.metanorma.org/author/basics/numbering/) and
[Sections](https://www.metanorma.org/author/topics/sections/).

**Consequence for direct-to-Presentation-XML consumers.** If a consumer
converts the editor's output directly to Presentation XML **without** running
the IsoDoc `XrefGen` pass (the numbering computation), clause numbering will
**not** be applied. The editor does not compensate for this: it emits `number`
`null` and relies on the downstream pipeline to compute numbers. (The
[LADL](https://metanorma.github.io/docs/) "Label Auto-assignment Definition
Language" spec that will eventually formalise this is still a draft, doc #112.)

Accordingly, the editor does not implement auto-numbering: `number` is left
`null` by every section command (insert, promote, demote). If a future editor
feature needs to *display* a number, it should be a read-only decoration
derived from a tree-walk over the live document, not a value persisted on the
node — but that is a separate, deferred feature.

**Alternative (not adopted):** leave `id` as `null` and let a downstream
document pipeline assign ids. Rejected in favour of assigning at insertion
time for consistency across all node-insertion commands.

## 8. CSS classes

The structural buttons reuse the base `mn-toolbar-btn`, `--active`, `--disabled`,
and `mn-toolbar-divider` classes. Feature-specific additions for this group:

| Class | Purpose |
|---|---|
| `.mn-toolbar-btn--sections` | Optional modifier marking buttons belonging to the `sections` group (for targeted group-specific styling). |
| `.mn-section-popover` | The Section insertion popover (`popover="auto"`, `role="dialog"`). Contains cohort-grouped lists of section types. Self-contained: does NOT use the shared `.mn-toolbar-popover` class (so consumer vertical-toolbar overrides don't target it). |
| `.mn-section-popover__group` | A cohort group within the popover (Front matter / Body / Annexes / Back matter). |
| `.mn-section-popover__heading` | The cohort group heading label. |
| `.mn-section-popover__list` | The `<ul>` of section type buttons within a cohort group. |
| `.mn-section-popover__item` | A section type `<button>` in the popover list. |

The popover uses the HTML Popover API (`popover="auto"`, light-dismiss) with
CSS Anchor Positioning, same as the other toolbar pickers
(`TableSizePicker`, `FootnotePicker`, `TargetPicker`). The trigger button gets
`anchor-name: --mn-section-anchor`; the popover uses
`position-anchor: --mn-section-anchor`. An `@supports not (anchor-name: --x)`
block falls back to `position:absolute` relative to the trigger container.

No new root or group-container classes are required beyond the base
`.mn-toolbar-group`.

## 9. Accessibility

Feature-specific accessibility additions beyond the baseline (README §2.5 /
`MetanormaToolbar.spec.md` §9):

- **Section popover** — the trigger button has `aria-haspopup="dialog"`; the
  popover uses `role="dialog"` with `aria-label="Insert a section"`. Each
  section type is a `<button>` (keyboard-focusable); selecting one inserts the
  section and closes the popover. The popover is keyboard-navigable: the user
  tabs through the type buttons, confirming with Enter (a click) and dismissing
  with Escape (the popover API's light-dismiss or an explicit handler).
- **Promote / Demote** — `aria-describedby` can point at a hidden live region
  announcing the current nesting depth (e.g. "Clause at level 2").
- **Floating title** — a plain `<button>`; its accessible name comes from the
  visible label `Floating title`, and the `title` tooltip supplies the
  longer description ("an unnumbered heading — not a section"). Because the
  node it inserts is a real textblock (not an atom), the cursor lands in it
  and screen readers announce the new editable heading immediately.

**Nesting depth and heading-level representation.** There is **no depth cap**:
the schema permits unbounded `clause`-within-`clause` nesting, and the toolbar
never disables Demote based on depth (Metanorma documents legitimately nest
beyond 6, e.g. annex sub-clauses; capping would reject valid documents).
Because HTML has only six heading elements (`<h1>`–`<h6>`), heading level is
conveyed via **`aria-level`** set to the clause's true nesting depth on the
rendered `<section>` element (computed from the node tree by a decoration,
never stored on the node). `aria-level` accepts any positive
integer, so it remains accurate past level 6. A visual `<hN>` may optionally
be synthesised for display, clamped to `<h6>` past level 6, but `aria-level`
carries the true depth to assistive tech. Depth is **derived**, not stored:
it is recomputed whenever the clause's ancestors change (insert/promote/
demote), so no command needs to maintain it.

## 10. Export changes

Pure commands are exported from `@metanorma/editor-commands` and re-exported
through `@metanorma/toolbar`; see the consolidated export listing
in README §5.6. This feature adds no feature-specific export notes.

## 11. File structure summary

See the consolidated file-structure summary in README §5.5. This feature adds
no feature-specific structure notes.

## 12. TypeScript constraints

The project tsconfig enforces `strict`, `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `module: node16` (per
project memory). All new code in `pkg/editor-commands/commands/sections.ts`
  (the command logic) and the toolbar component in `@metanorma/toolbar` must:

- Use `import type` for type-only imports (`Command`, `EditorState`,
  `Transaction`, `Node`, `NodeType`, `ResolvedPos`). **`EditorView` is imported
  only in `@metanorma/toolbar` (the adapter layer), never in
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
