# Reference marks

## 1. Purpose

This document is the detailed implementation proposal for the **six reference
and semantic marks** that `MetanormaToolbar.spec.md` §5.5 defers as "out of
scope":

**Reference marks** (`xref`, `eref`, `concept`, `bcp14`) plus the
`footnote_marker` and `stem` inline nodes — require target/ID resolution
beyond simple toggle.

The base `MetanormaToolbar` covers inline **formatting** marks (§5.1) and the
`link` mark (§5.4), both of which are either attribute-free toggles or require
a single URL. The six buttons in scope here are different: four are
`inclusive: false` semantic marks whose meaningfulness depends on a
**resolved attribute** — a cross-reference target, a citation key, a concept
ref, or a BCP14 keyword (free text) — plus two inline atom nodes
(`footnote_marker`, requiring an entry id; and `stem`, requiring formula
source). In some
`toggleMark(type)` with no attributes produces a semantically empty span, so
each button must **collect an attribute before applying**, modelled on the
base spec's `onLinkPrompt` upgrade hook.

This document does **not** rehash base-spec material: integration model,
`ToolbarButton` descriptor shape, the `marks`/`blocks`/`lists`/`link` groups,
CSS conventions, or the `useEditorStateSelector` /
`useEditorEventCallback` plumbing are all defined in
`MetanormaToolbar.spec.md` and are assumed here. What follows is specific to
the six reference marks and the new `refs` toolbar group they introduce into
`AdvancedMetanormaToolbar`.

## 2. Package and export

| Aspect | Value |
|---|---|
| Command logic | `@metanorma/editor-commands` — `pkg/editor-commands/commands/referenceMarks.ts` |
| Toolbar component | `pkg/prosemirror-editor/AdvancedMetanormaToolbar.tsx` |
| Popover/menu UI | `pkg/prosemirror-editor/reference-marks.css` (imported side-effect) |
| Commands re-exported from | `@metanorma/prosemirror-editor` (`pkg/prosemirror-editor/index.ts`) |
| Popover/prompt hooks (UI) | `pkg/prosemirror-editor/AdvancedMetanormaToolbar.tsx` |
| New toolbar group | `'refs'` |

**Layering.** The pure command logic lives in `@metanorma/editor-commands`,
the framework-agnostic, DOM-free command package defined in
[`EditorCommands.spec.md`](../EditorCommands.spec.md). Everything that touches
the `EditorView`, the DOM, async prompt hooks, or React — the toolbar
component, the attribute-collection popovers/menus, and the `on*Prompt`
upgrade hooks — stays in `@metanorma/prosemirror-editor`. The editor package
**re-exports** the commands for toolbar consumption; it does not define them.

Rationale, as in the base spec and `EditorCommands.spec.md` §1.8: the
**command logic** is schema-bound (it resolves `MarkType`s through
`state.schema`) but must remain **pure** — no `EditorView`, no DOM, no async —
so it composes with keymaps and is headless-testable. It therefore belongs in
`@metanorma/editor-commands`, not in `prosemirror-editor`. The
`@handlewithcare/react-prosemirror` context, the prompt hooks, and the popover
UI *are* editor-bound and stay in `prosemirror-editor`.

These commands conform to the Command contract (README §6.2;
`EditorCommands.spec.md` §1.5).

## 3. Schema recap

All six are **marks**, all `inclusive: false`, all carrying `...DATA_ATTR`
(`{ data: { default: {} } }`) in addition to the key attribute listed below.
`baseAttrs()` (the `{ id, number, data }` shape) applies to the **node**
forms (e.g. `footnote_entry`), not to these marks.

| Mark | Key attr (default) | `toDOM` element | Semantic purpose |
|---|---|---|---|
| `xref` | `target: null` | `<a class="xref" data-target>` | Cross-reference to an anchor / element id elsewhere in the document. |
| `eref` | `cite: null` | `<cite class="eref" data-cite>` | Bibliographic reference — cites a `bibliography` entry by key. |
| `concept` | `ref: null` | `<span class="concept" data-ref>` | Reference to a concept / designation in a concept store. |
| `bcp14` | `type: null` | `<span class="bcp14" data-type>` | A BCP14 [BCP14] keyword (`MUST`, `SHOULD`, …). `type` is an open free-text string (any keyword, any language). |

#### footnote and stem are inline atom nodes, not marks

The schema defines `footnote_marker` and `stem` as inline atom nodes (`content: ""`,
`group: "inline"`, `atom: true`). The toolbar inserts them as **nodes**
(node-insertion commands), not mark toggles:

- `footnote_marker` (attrs `{ id, target, data }`) mirrors Metanorma
  Presentation XML's `<fn>` element — an inline element at the reference site
  (not a text-wrapping mark). The `footnote` mark exists in the schema but is
  unused by the toolbar. See §5.5.
- `stem` (attrs `{ asciimath, mathml, data }`) is an inline formula atom —
  the math source lives in attrs, not as wrapped text. This makes host-
  provided live math preview possible via node-view override (like block
  `formula`). The former `stem` mark has been **removed** from the schema;
  `stem` is now solely a node. See §5.6.

- `formula` — a **block-level** atom node for display equations (separate
  from the inline `stem` node). Block formula insertion/editing is out of
  scope for this document; it would belong in a future blocks/insert group.
  A host can override `FormulaNodeView` for rendering or popover editing.

## 4. Button-group overview

A new toolbar group `'refs'` is rendered after `'link''. It contains one
button per reference mark (four marks: `xref`, `eref`, `concept`, `bcp14`)
plus two node-insertion buttons (`footnote_marker` §5.5, `stem` §5.6). Unlike
the marks group, several of these buttons open a **popover** to collect their
attribute rather than firing an immediate toggle.

| Button | Label | Title (ARIA) | Key attr to collect | Input UI |
|---|---|---|---|---|
| Cross-reference | `↗` | "Insert cross-reference" | `target` (anchor/id) | target picker or free-text input |
| Bibliographic ref | `📕` | "Insert bibliographic reference" | `cite` (citation key) | bibliography picker or free-text input |
| Concept | `💡` | "Insert concept reference" | `ref` (concept id) | concept picker or free-text input |
| BCP14 keyword | `MUST` | "Insert BCP14 keyword" | `type` (free text) | free-text input (keyword prompt) |
| Footnote | `⁺` | "Insert footnote" | `target` (footnote entry id) | dialog: create new entry or pick existing (§5.5) |
| Inline formula | `∑` | "Insert inline formula" | `asciimath`/`mathml` (node attrs) | formula-edit popover (§5.6) |

All buttons follow the `ToolbarButton` descriptor from base §5 (reproduced in
the context for this document). Active detection, enabled detection, and the
`run(view)` dispatch are specified per-mark below.

## 5. Attribute resolution

This is the heart of the feature. Each mark needs more than a toggle, so each
defines **how its required attribute is gathered**, plus an **upgrade hook**
(analogous to base §6's `onLinkPrompt?: () => Promise<string | null>`) so a
host application can replace the default minimal UI with a rich picker. When
a hook resolves to `null` the operation is cancelled and no transaction is
dispatched.

The default (no hook) implementations are deliberately minimal —
`window.prompt`, a generated id, or a small inline menu — and are meant to be
replaced. The hooks make the toolbar usable out of the box while leaving the
real UX to the host.

**UI/command boundary.** Attribute resolution — the xref target picker, the
eref cite picker, the concept picker, the bcp14 keyword prompt, footnote id
generation, the stem formula popover, and all the `on*Prompt` hooks — is a
**UI concern** and lives in `@metanorma/prosemirror-editor`
(the toolbar component). The pure commands in
`@metanorma/editor-commands` (§6) receive **already-resolved** attribute
values and never prompt, await, or touch the DOM. The toolbar's `run(view)`
adapter is the seam: it resolves the attribute through the hook, then calls
the command as `toggleXref(view.state, view.dispatch, target)` (and
`view.focus()` afterwards), as shown in §6.3.

### 5.1 `xref` — target resolution

Needs a `target`: the anchor/id of another element in the document. Three
tiers of resolution, best available wins:

1. **Doc-anchored picker (preferred).** A popover listing candidate targets.
   The source is the set of ids already present in the document, harvested by
   scanning `state.doc` for id-bearing nodes. The `id` attribute is present on
   all section types (`clause`, `annex`, `foreword`, `introduction`,
   `acknowledgements`, `terms`, `definitions`, `references` — via
   `sectionAttrs()`), the containers (`preface`, `sections`, `bibliography` —
   via `baseAttrs()`), `floating_title`, `figure`, `table`, `formula`,
   `footnote_entry`, and `footnote_marker`. Since IDs are **generated at
   insertion time** by all node-insertion commands (the established convention),
   these `id` values are reliably populated in any document created by this
   editor — there is no separate "anchor" construct. Each entry shows a
   readable label (the `title` attr for sections/floating_title, or node text)
   and its id.
2. **Free-text input (fallback).** A `window.prompt('Cross-reference target
   id:')` when no picker is available or the host declines to supply one.
3. **Upgrade hook.**

```typescript
/** Resolve an xref target id. Default: window.prompt. Return null to cancel. */
readonly onXrefPrompt?: (context: RefPromptContext) => Promise<string | null>;
```

### 5.2 `eref` — citation-key resolution

Needs a `cite`: the bibliographic key of a `bibliography` entry. The schema's
`bibliography` node has content `(section | block)*` — it is a generic
container, **not** a structured list of typed bibliography entries carrying a
citation-key attribute. The editor therefore cannot enumerate `(key, title)`
pairs from the document alone. Resolution is:

1. **Host-supplied hook (preferred).** `onErefPrompt` returns a citation key
   (free-text `string`) — hosts use it to integrate with a bibliographic data
   source (e.g. Relaton) and present a rich `(key, title)` picker. The hook
   owns all data-source concerns; the editor only stores the resolved key.
2. **Free-text input (fallback).** A `window.prompt('Citation key:')` when no
   hook is supplied.

```typescript
/** Resolve an eref citation key. Default: window.prompt. Return null to cancel. */
readonly onErefPrompt?: (context: RefPromptContext) => Promise<string | null>;
```

### 5.3 `concept` — concept-ref resolution

Needs a `ref`: the id of a node that defines the concept (typically a clause or
block within a `definitions` or `terms` section). Unlike `eref`, `concept.ref`
is a **document-internal** target — it maps to the `target` of the inner
`<xref>` inside Metanorma Presentation XML's `<concept>` element. Resolution is
therefore the same shape as `xref` (§5.1):

1. **Doc-anchored picker (preferred).** Scan `state.doc` for id-bearing nodes,
   emphasising those inside `definitions`/`terms` sections (where term-definition
   clauses live). Because the schema has no dedicated "term entry" node, the
   picker lists id-bearing clauses/blocks — coarse but functional.
2. **Free-text input (fallback).** A `window.prompt('Concept id:')` when no
   picker is available.
3. **Upgrade hook.** `onConceptPrompt` lets the host supply a curated picker
   (e.g. only term-definition entries, with proper labels).

```typescript
/** Resolve a concept ref. Default: window.prompt. Return null to cancel. */
readonly onConceptPrompt?: (context: RefPromptContext) => Promise<string | null>;
```

### 5.4 `bcp14` — free-text keyword

Needs a `type`: a BCP14 keyword (e.g. `MUST`, `SHOULD NOT`). The `type`
attribute is an **open free-text string** — the editor imposes no enum; the
author types any keyword, in any language. The button opens a free-text prompt
(`window.prompt('BCP14 keyword:')` by default), mirroring `xref`/`eref`/
`concept`; on commit it applies the mark with the typed `type`, typically
**wrapping the currently-selected text** (e.g. typing `MUST` marks the
selection as a `bcp14 type="MUST"` span).

```typescript
/** Resolve a bcp14 keyword. Default: window.prompt. Return null to cancel. */
readonly onBcp14Prompt?: (context: RefPromptContext) => Promise<string | null>;
```

**No enum, by design.** The schema's `type` attr is an open string; the
editor does not constrain it. BCP 14 (RFC 2119 / RFC 8174) defines a
canonical English keyword set, but the editor treats that as an authoring
convention, not a hard constraint — allowing keywords in any language and
deferring stricter validation (or a host-supplied curated menu) to future
work without a schema change.

### 5.5 `footnote` — `footnote_marker` node insertion

Unlike the other reference marks, footnote insertion uses the
**`footnote_marker` inline atom node** (not the `footnote` mark), because it
mirrors Metanorma Presentation XML's inline `<fn>` element (§3). The command
inserts a `footnote_marker` node at the cursor; its `target` attr points at a
`footnote_entry`'s `id`, and its own `id` enables backlinks.

1. **Id generation.** The toolbar generates a fresh, unique id using the
   shared `generateId()` helper from `@metanorma/editor-commands` (`util.ts`),
   a `crypto.randomUUID()`-based string. This id is used for both the
   `footnote_entry` (its `id` attr) and the `footnote_marker`'s `target` attr.
   Ids are immutable once generated — they are not renumbered on serialize.

2. **Footnote-entry maintenance (hybrid).** A meaningful footnote needs a
   `footnote_entry` body. Creation uses a **hybrid** model in the footnote
   dialog:
   - **Primary — create new.** Generate a fresh `id` (above), and in the *same
     transaction* as inserting the `footnote_marker` node, create a placeholder
     `footnote_entry` (empty content) in the `footnotes` container — creating
     the container too if it does not yet exist. The user authors the entry
     content afterward. This is the common case (write prose → insert
     footnote → fill in content).
   - **Secondary — pick existing.** When `footnote_entry`s already exist, the
     dialog offers a picker to select one, so the same footnote can be
     referenced from multiple `footnote_marker`s (reuse) without duplicating
     entries.
   - **Removal is independent.** Deleting a `footnote_marker` node **never**
     deletes its entry (the entry may hold authored content and/or be
     referenced by other markers). This avoids lossy undo and multi-reference
     hazards.

```typescript
/** Resolve a footnote entry id and (optionally) create its entry. Default: generate. */
readonly onFootnotePrompt?: (context: RefPromptContext) => Promise<string | null>;
```

**Orphan / dangling-reference highlighting (future work).** Because removal
is independent, a `footnote_entry` can become an orphan (no
`footnote_marker` references it) and a `footnote_marker` can dangle (its
`target` has no entry). Highlighting these — via a generic reference-integrity
decoration plugin (a `Plugin` with a `decorations` state field that walks the
doc once per transaction) — is **deferred to a separate feature** spanning
`footnote_marker`, `xref`, and `concept` (all share the dangling-reference
shape). The editor already accepts arbitrary plugins via
`MetanormaProseMirror`'s `plugins` prop; the plugin is strictly additive and
non-blocking.

### 5.6 `stem` — inline formula node insertion

`stem` is an **inline atom node** (not a mark), with attrs `asciimath` and
`mathml` storing the formula source. The math source lives in the node's attrs,
not as wrapped text — this makes host-provided live math preview possible via
node-view override (the same mechanism as block `formula`). The default UI is a
small **formula-edit popover**: a notation selector (`asciimath` / `mathml`)
plus a text area for the source, with an optional live preview (if the host
supplies a renderer). On commit, a `stem` node is inserted at the cursor with
the chosen notation attr set.

```typescript
/** Resolve a stem formula (notation + source). Default: minimal popover. Return null to cancel. */
readonly onStemPrompt?: (context: StemPromptContext) => Promise<StemResult | null>;
```

```typescript
export interface StemResult {
  readonly type: "asciimath" | "mathml";
  readonly source: string;
}
```

**No renderer is bundled.** v1 ships source-only (the popover collects
AsciiMath/MathML source; no live preview). A host can add rendering by
overriding the `stem` node view (and the block `FormulaNodeView`) with a
component that uses a math library (MathJax, KaTeX, MathLive, etc.). Future
work: embedding an interactive math field (e.g. MathLive's `<math-field>`)
directly in the editor for WYSIWYG inline editing.

**Block formulas** use the separate block-level `formula` node and are out of
scope for this button. Block formula editing can be provided by the host via
a popover on node selection (the same source/preview pattern), or
future WYSIWYG via an embedded interactive math field.

### 5.7 Shared prompt context

All attribute hooks receive a context object so host pickers can be smart
without a second state channel:

```typescript
export interface RefPromptContext {
  /** Current EditorState (read-only; do not dispatch from a hook). */
  readonly state: EditorState;
  /** Current value of the mark's key attr at the selection, or null. */
  readonly currentValue: string | null;
  /** Selected text, if any, for wrapping/preview. */
  readonly selectedText: string | null;
}

export interface StemPromptContext extends RefPromptContext {
  readonly currentType: "asciimath" | "mathml" | null;
}
```

## 6. Command helpers

Pure command logic, defined in `@metanorma/editor-commands` at
`pkg/editor-commands/commands/referenceMarks.ts`, and **re-exported** by
`@metanorma/prosemirror-editor` (§11). A generic core command plus per-mark
wrappers, all conforming to the ProseMirror `Command` contract
(`EditorCommands.spec.md` §1.5): each is `(state, dispatch?, …) => boolean`.

- **Query/dispatch parity.** Called without `dispatch`, a command returns
  `true` iff the mark would apply at the current selection and mutates
  nothing (no transaction, no `state.tr`). Called with `dispatch` and
  applicable, it builds exactly one transaction, calls `dispatch(tr)` once,
  and returns `true`. It returns `false` when inapplicable, regardless of
  `dispatch`.
- **Non-throwing.** No command throws on a well-formed `EditorState`; on
  failure it returns `false`.
- **Schema coupling.** Commands resolve node types through `state.schema` per
  README §6.4; no `(schema) => Command` factory is required.
- **Naming.** Named for the action (`toggleXref`, `applyReferenceMark`), not
  the trigger; no `Command` suffix (`EditorCommands.spec.md` §1.10.2).

The attribute-collection arguments below (`target`, `cite`, `ref`, `type`,
`id`, `source`) are **already-resolved** values — the toolbar obtains them
via the §5 prompt hooks before calling. The commands never prompt or
`await`.

### 6.1 Generic core

```typescript
import type { Attrs, Command, EditorState, MarkType, Transaction } from "prosemirror-state";

/**
 * Apply or remove a reference mark with attributes over the current selection.
 *
 * - Removes the mark (all attrs) when it is already active and `attrs` is null
 *   or the caller signals removal.
 * - Otherwise adds the mark with `attrs` over the selection range, first
 *   removing any existing mark of the same type so the new attrs replace it.
 *
 * Marks that require content to attach to (bcp14) should be
 * gated on a non-empty selection by the caller (or by the wrapper).
 *
 * Conforms to the Command contract (EditorCommands.spec.md §1.5):
 * without `dispatch` it is a pure applicability probe; with `dispatch` it
 * dispatches exactly one transaction. Never throws; returns false when
 * inapplicable. `markType` is a schema-resolved MarkType passed by the caller
 * (the wrappers resolve it from `state.schema`).
 */
export function applyReferenceMark(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  markType: MarkType,
  attrs: Attrs | null,
): boolean;
```

**Algorithm.**

1. Resolve the selection range `{ from, to }`.
2. Detect existing mark: `markType.isInSet(state.selection.$from.marks())`
   (or the stored-marks path for empty selections).
3. If `attrs === null` **or** the mark is already active and the caller is
   toggling off → `tr.removeMark(from, to, markType)`; dispatch; return `true`.
4. Else → `tr.removeMark(from, to, markType)` (clear stale attrs), then
   `tr.addMark(from, to, markType.create(attrs))`; dispatch; return `true`.
5. If `dispatch` is undefined, perform **no** mutation: return whether the
   operation *would* apply (query/dispatch parity, for `isEnabled` probing).
   `state.doc` and `state.selection` stay reference-equal and unchanged.

For **empty selections** where content is required (see §7), the command
returns `false`; the toolbar layer may instead choose to insert placeholder
text first (open question, §10).

### 6.2 Mark-specific wrappers

Each wrapper is a **thin** command that resolves its mark type from
`state.schema` by name at call time (e.g. `state.schema.marks.xref`), then
delegates to `applyReferenceMark`. They take the already-resolved attribute
value (the toolbar obtains it via the prompt hook before calling). The
wrappers inherit the Command contract from the core: pure when queried
without `dispatch`, single-dispatch when applied, non-throwing.

```typescript
export function toggleXref(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  target: string | null,
): boolean;

export function toggleEref(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  cite: string | null,
): boolean;

export function toggleConcept(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  ref: string | null,
): boolean;

export function toggleBcp14(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  type: string | null,
): boolean;

/**
 * Insert a `footnote_marker` inline node at the selection, optionally creating
 * a `footnote_entry` (and `footnotes` container) in the same transaction.
 * This is a node-insertion command, NOT a mark toggle (§5.5).
 */
export function insertFootnoteMarker(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  target: string,
): boolean;

/**
 * Insert a `stem` inline atom node at the selection with the given formula
 * source. This is a node-insertion command, NOT a mark toggle (§5.6).
 */
export function insertStem(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  type: "asciimath" | "mathml",
  source: string,
): boolean;
```

`toggleXref`/`toggleEref`/`toggleConcept`/`toggleBcp14` delegate to
`applyReferenceMark` with their key attr (a free-text string for `bcp14`).
`insertStem` inserts a `stem` inline atom node with the formula source stored
in the `asciimath` or `mathml` attr (§5.6). `insertFootnoteMarker` inserts the
`footnote_marker` inline node and, in the same transaction, ensures a
`footnote_entry` exists for `target` (§5.5) — creating the `footnotes`
container and a placeholder entry if absent.

### 6.3 Toolbar-side dispatch

The toolbar adapter is the **only** place that touches the `EditorView`, the
DOM, or async. It lives in `@metanorma/prosemirror-editor`
(`AdvancedMetanormaToolbar.tsx`), not in the commands package. The buttons
resolve the attribute through the prompt hook, then call the **pure** command
with `view.state` / `view.dispatch` and restore focus — exactly the seam the
Command contract is designed for:

```typescript
const handleXref = useEditorEventCallback(async (view) => {
  // UI concern: resolve the attribute (async, DOM, host hook).
  const target = await (onXrefPrompt ?? defaultXrefPrompt)(ctxFromView(view));
  if (target === null) return;            // cancelled — no transaction

  // Pure command: operates on state/dispatch only, no view/DOM inside.
  toggleXref(view.state, view.dispatch, target);

  // EditorView concern: restore focus after the edit.
  view.focus();
});
```

Note the boundary is honoured inside the command as well: `toggleXref`
receives `view.state` and `view.dispatch` as plain arguments and never
references `view` itself — so it remains headless-testable
(`EditorCommands.spec.md` §1.8). The `await` and `view.focus()` calls live
**only** in this adapter.

## 7. Active and enabled detection

Active/enabled detection reuses the base-spec pattern (base §5.1, §7):

```typescript
function refMarkActive(state: EditorState, name: string): boolean {
  const mark = state.schema.marks[name];
  if (!mark) return false;
  const marks = state.selection.empty
    ? state.storedMarks ?? state.$from.marks()
    : state.selection.$to.marks();
  return mark.isInSet(marks) !== undefined;
}
```

| Mark | Active | Enabled |
|---|---|---|
| `xref`, `eref`, `concept`, `bcp14` | `refMarkActive(state, name)` | selection inside an `inline`-content node (base §5.1). Empty selection allowed: the mark can be set as a stored mark for upcoming typing. The dangling-mark risk is negligible — ProseMirror clears stored marks on cursor movement, so they are transient, not persistent artifacts. |
| `footnote_marker` (node) | selection is a `NodeSelection` on a `footnote_marker` node | inside inline content. Empty selection allowed (the node is inserted at the cursor). |
| `stem` (node) | selection is a `NodeSelection` on a `stem` node | inside inline content. Empty selection allowed (the node is inserted at the cursor). |

**Toggle semantics (click while active removes).** For the four marks
(`xref`/`eref`/`concept`/`bcp14`), clicking the button when the mark is already
active at the selection calls the wrapper with a `null` value
(`toggleXref(state, dispatch, null)`, etc.), which routes through
`applyReferenceMark`'s removal branch (§6.1 step 3) — mirroring the base `link`
button's removal behaviour.

**Node toggle (`footnote_marker`, `stem`).** For inline atom nodes, clicking
while the node is selected (active) **deletes the node** from the document.
Deleting a `footnote_marker` never deletes its `footnote_entry` (§5.5).

**Implementation note:** `refMarkActive` for `bcp14` may optionally surface
the stored mark's `type` (the active keyword) for display; the minimum
requirement is presence.

## 8. Styling

Follows base §8 conventions: plain CSS side-effect import, `mn-toolbar`
prefix. The attribute-collection UI (a `prosemirror-editor` concern, §5)
introduces new classes in `pkg/prosemirror-editor/reference-marks.css`:

```
.mn-toolbar-popover             /* floating container for xref/eref/concept/stem/bcp14 input */
  .mn-toolbar-popover__input    /* text <input>/<textarea> */
  .mn-toolbar-popover__list     /* picker <ul> (targets, bib entries, concepts) */
  .mn-toolbar-popover__item     /* picker <li>/button */
```

Minimum behaviour: popovers/menus anchor below their triggering button,
respect `prefers-color-scheme`, and reuse the `--mn-border` / `--mn-active`
custom properties from the base stylesheet.

## 9. Accessibility

Feature-specific accessibility additions beyond the baseline
(README §2.5 / `MetanormaToolbar.spec.md` §9):

- **Popovers** (`xref`, `eref`, `concept`, `stem`, `bcp14`) use `role="dialog"`,
  `aria-modal="false"`, and `aria-labelledby` pointing at the trigger's
  `title`. They trap focus into the input on open and restore focus to the
  trigger on close.
- **Escape** cancels any open popover and dispatches no transaction
  (consistent with a `null` hook result).
- Each picker list item exposes its label as accessible name and its id/key
  via `data-*` for host styling without relying on `title`.
- `aria-haspopup="dialog"` is set on trigger buttons that open a popover.

## 10. Open questions / unknowns

Genuine unknowns to resolve before/while implementing:

(none remain — all questions resolved.)

## 11. Export changes

Pure commands are exported from `@metanorma/editor-commands` and re-exported
through `@metanorma/prosemirror-editor`; see the consolidated export listing in
README §5.11. The feature-specific export notes below are not covered by that
listing.

`@metanorma/prosemirror-editor` also exports the **UI-only types** that describe
the attribute-resolution UI (they carry `EditorState` for host pickers and are
consumed only by the `on*Prompt` hooks), so they stay in `prosemirror-editor`
alongside the toolbar component, not in the commands package:

```typescript
// UI-only types: the prompt/picker context objects live with the toolbar UI
// in prosemirror-editor, not in the commands package.
export type {
  RefPromptContext,
  StemPromptContext,
  StemResult,
} from "./AdvancedMetanormaToolbar.js";
```

**Split rationale.** Commands are pure and schema-derived, so they originate
in `@metanorma/editor-commands`. The
`RefPromptContext` / `StemPromptContext` / `StemResult` types describe the
**attribute-resolution UI** (they carry `EditorState` for host pickers and
are consumed only by the `on*Prompt` hooks), so they stay in
`prosemirror-editor` alongside the toolbar component.

`ToolbarGroup` is extended in `AdvancedMetanormaToolbar.tsx` to add
`'refs'`:

```typescript
export type ToolbarGroup =
  | "marks"
  | "blocks"
  | "lists"
  | "link"
  | "refs"; // ← reference / semantic marks (this document)
```

## 12. File structure summary

See the consolidated file-structure summary in README §5.10. This feature adds
no feature-specific structure notes.

## 13. TypeScript constraints

All new code follows the project tsconfig (`strict`,
`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`,
`module: node16`):

- `import type` for type-only imports (`Attrs`, `EditorState`, `MarkType`,
  `Transaction`, `Command`, etc.).
- **`Command` type** is imported from `prosemirror-state`; the commands are
  annotated to conform to it (`EditorCommands.spec.md` §1.5, §1.11.2).
- `.js` extensions on all relative imports
  (`./commands/referenceMarks.js` within `editor-commands`; `@metanorma/editor-commands`
  is a workspace package specifier, no extension).
- Optional hook props use `?` syntax, never an explicit `undefined`.
- Handle `null`/`undefined` from `noUncheckedIndexedAccess`: e.g.
  `mark.attrs[key]` lookups must be null-checked.
- Mark-type resolution goes through `state.schema.marks.X` (returns
  `MarkType | undefined` under `noUncheckedIndexedAccess`); the wrappers
  null-check and return `false` if the mark is absent from the schema.
- All exported types (`RefPromptContext`,
  `StemPromptContext`, `StemResult`) are exported alongside their values.
