# Reference marks

## 1. Purpose

This document is the detailed implementation proposal for the **six reference
and semantic marks** that `MetanormaToolbar.spec.md` §5.5 defers as "out of
scope":

> **Reference marks** (`xref`, `eref`, `concept`, `bcp14`, `footnote`,
> `stem`) — require target/ID resolution beyond simple toggle.

The base `MetanormaToolbar` covers inline **formatting** marks (§5.1) and the
`link` mark (§5.4), both of which are either attribute-free toggles or require
a single URL. The six marks in scope here are different: they are all
`inclusive: false` semantic marks whose meaningfulness depends on a
**resolved attribute** — a cross-reference target, a citation key, a concept
ref, a BCP14 keyword from a fixed enum, a footnote id, or a formula type —
plus, in some cases, inline **content** (formula text). A bare
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
| Command logic | `@metanorma/editor-commands` — `pkg/editor-commands/src/commands/referenceMarks.ts` |
| Toolbar component | `pkg/prosemirror-editor/src/AdvancedMetanormaToolbar.tsx` |
| Popover/menu UI | `pkg/prosemirror-editor/src/reference-marks.css` (imported side-effect) |
| Commands re-exported from | `@metanorma/prosemirror-editor` (`pkg/prosemirror-editor/src/index.ts`) |
| Popover/prompt hooks (UI) | `pkg/prosemirror-editor/src/AdvancedMetanormaToolbar.tsx` |
| New toolbar group | `'refs'` |

> **Layering.** The pure command logic lives in `@metanorma/editor-commands`,
> the framework-agnostic, DOM-free command package defined in
> [`EditorCommands.spec.md`](../EditorCommands.spec.md). Everything that touches
> the `EditorView`, the DOM, async prompt hooks, or React — the toolbar
> component, the attribute-collection popovers/menus, and the `on*Prompt`
> upgrade hooks — stays in `@metanorma/prosemirror-editor`. The editor package
> **re-exports** the commands for toolbar consumption; it does not define them.

Rationale, as in the base spec and `EditorCommands.spec.md` §1.8: the
**command logic** is schema-bound (it resolves `MarkType`s through
`state.schema`) but must remain **pure** — no `EditorView`, no DOM, no async —
so it composes with keymaps and is headless-testable. It therefore belongs in
`@metanorma/editor-commands`, not in `prosemirror-editor`. The
`@handlewithcare/react-prosemirror` context, the prompt hooks, and the popover
UI *are* editor-bound and stay in `prosemirror-editor`.

> **Conformance note.** `applyReferenceMark` and the six `toggle*` wrappers
> conform to the Command contract (`EditorCommands.spec.md` §1.5): they are
> `Command`-typed `(state, dispatch?, …) => boolean` functions; calling
> without `dispatch` is a pure applicability probe that mutates nothing;
> calling with `dispatch` builds and dispatches exactly one transaction and
> returns `true`; they return `false` when inapplicable; and they never throw
> on well-formed state. They never take an `EditorView`, never call
> `view.focus()` / `view.dispatch`, and never touch the DOM. The
> `EditorView`/async/prompt concerns live in the toolbar adapter in
> `prosemirror-editor` (§6.3).

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
| `bcp14` | `type: null` | `<span class="bcp14" data-type>` | A BCP14 [BCP14] keywords keyword (`MUST`, `SHOULD`, …). `type` is constrained to a fixed, configurable enum. |
| `footnote` | `id: null` | `<sup class="footnote" data-id>` | Inline footnote-reference marker; `id` points at a `footnote_entry`. |
| `stem` | `type: null` | `<span class="stem" data-type>` | Inline formula. `type` is the source notation, e.g. `"asciimath"` or `"mathml"`. |

> **Mark vs. node — context, not duplication.** The schema also defines:
> - `footnote_marker` — an inline **node** (`content: ""`, `group: "inline"`,
>   `atom: true`, attrs `{ id, target, data }`), and container nodes
>   `footnotes` / `footnote_entry`. The mark-based `footnote` mark and the
>   node-based `footnote_marker` are **two representations** of a footnote
>   reference; §4.5 / §10 discuss which the toolbar targets.
> - `formula` — a **block-level** node for display equations. The `stem`
>   **mark** is the *inline* counterpart; this document covers only the mark
>   form. Block formulas are out of scope here and would belong in a future
>   blocks/insert group.

## 4. Button-group overview

A new toolbar group `'refs'` is rendered after `'link'`. It contains one
button per mark. Unlike the marks group, several of these buttons open a
**popover or menu** to collect their attribute rather than firing an
immediate toggle.

| Button | Label | Title (ARIA) | Key attr to collect | Input UI |
|---|---|---|---|---|
| Cross-reference | `↗` | "Insert cross-reference" | `target` (anchor/id) | target picker or free-text input |
| Bibliographic ref | `📕` | "Insert bibliographic reference" | `cite` (citation key) | bibliography picker or free-text input |
| Concept | `💡` | "Insert concept reference" | `ref` (concept id) | concept picker or free-text input |
| BCP14 keyword | `MUST` | "Insert BCP14 keyword" | `type` (enum) | dropdown / menu of keywords |
| Footnote | `⁺` | "Insert footnote" | `id` (footnote id) | generated; optional edit |
| Inline formula | `∑` | "Insert inline formula" | `type` + content | formula-edit popover |

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

> **UI/command boundary.** Attribute resolution — the xref target picker, the
> eref cite picker, the concept picker, the bcp14 keyword menu, footnote id
> generation, the stem formula popover, and all the `on*Prompt` hooks — is a
> **UI concern** and lives in `@metanorma/prosemirror-editor`
> (the toolbar component). The pure commands in
> `@metanorma/editor-commands` (§6) receive **already-resolved** attribute
> values and never prompt, await, or touch the DOM. The toolbar's `run(view)`
> adapter is the seam: it resolves the attribute through the hook, then calls
> the command as `toggleXref(view.state, view.dispatch, target)` (and
> `view.focus()` afterwards), as shown in §6.3.

### 5.1 `xref` — target resolution

Needs a `target`: the anchor/id of another element in the document. Three
tiers of resolution, best available wins:

1. **Doc-anchored picker (preferred).** A popover listing candidate targets.
   The simplest source is the set of ids already present in the document,
   harvested by scanning `state.doc` for nodes/attrs carrying an `id` (the
   `baseAttrs()` `id` field is present on most block nodes). Each entry shows
   a readable label (node text or heading) and its id.
2. **Free-text input (fallback).** A `window.prompt('Cross-reference target
   id:')` when no picker is available or the host declines to supply one.
3. **Upgrade hook.**

```typescript
/** Resolve an xref target id. Default: window.prompt. Return null to cancel. */
readonly onXrefPrompt?: (context: RefPromptContext) => Promise<string | null>;
```

### 5.2 `eref` — citation-key resolution

Needs a `cite`: the bibliographic key of a `bibliography` entry. The schema
places `bibliography` as an optional top-level child
(`content: "(preface? sections? bibliography? footnotes?)"`), so the picker
walks `state.doc` for the `bibliography` node and enumerates its entries,
offering `(key, title)` pairs. Fallback is free-text entry of the raw key.

```typescript
/** Resolve an eref citation key. Default: window.prompt. Return null to cancel. */
readonly onErefPrompt?: (context: RefPromptContext) => Promise<string | null>;
```

### 5.3 `concept` — concept-ref resolution

Needs a `ref`: a concept id in a concept store. Unlike `xref`/`eref`, the
target is usually **external** to the document (a terminology/concept
database), so a doc scan is not useful. Default is free-text; hosts supply a
concept-store picker via the hook.

```typescript
/** Resolve a concept ref. Default: window.prompt. Return null to cancel. */
readonly onConceptPrompt?: (context: RefPromptContext) => Promise<string | null>;
```

### 5.4 `bcp14` — fixed enum keyword

Needs a `type` drawn from a **fixed enum** of BCP14 keywords. There is no
free-text path: the value must be one of the allowed keywords. The button
opens a dropdown/menu listing them; selecting one applies the mark with that
`type`, typically **wrapping the currently-selected text** in the keyword
(e.g. selecting `MUST` from the menu marks the selection as a `bcp14`
`type="MUST"` span). With an empty selection, the menu may optionally insert
the keyword text and then mark it (see §10 open question).

Proposed default enum (must be **configurable** — see §10):

```typescript
export const BCP14_KEYWORDS = [
  "MUST",
  "MUST NOT",
  "SHALL",
  "SHALL NOT",
  "SHOULD",
  "SHOULD NOT",
  "RECOMMENDED",
  "NOT RECOMMENDED",
  "MAY",
  "OPTIONAL",
] as const;
export type Bcp14Keyword = (typeof BCP14_KEYWORDS)[number];
```

The enum is passed as a prop so localisations / subsets can override it:

```typescript
/** Override the default BCP14 keyword list. */
readonly bcp14Keywords?: readonly Bcp14Keyword[];
```

Because the value set is closed, `bcp14` has **no `onBcp14Prompt` hook** —
the menu *is* the prompt.

### 5.5 `footnote` — id generation

Needs an `id` identifying a `footnote_entry` in the document's `footnotes`
container. Two concerns:

1. **Id generation.** The toolbar generates a fresh, unique id using the
  shared `generateId()` helper from `@metanorma/editor-commands` (`util.ts`),
  a `crypto.randomUUID()`-based string. The id is both stored on the mark
  (`data-id`) and used to address the entry. This is consistent with the
  `generateId()` policy used by all node-insertion commands (tables, figures,
  sections).

  > **Alternative (not adopted):** a counter-based id (`"fn"` + monotonic
  > integer) would be more human-readable but risks collisions and requires
  > renumbering on serialize; rejected in favour of UUID-based ids for
  > collision-freedom and immutability.
2. **Footnote-content maintenance.** A meaningful footnote needs a
  `footnote_entry` body. The mark alone is a dangling reference. Proposed
  default behaviour: when the mark is applied, the toolbar also ensures a
  matching `footnote_entry` exists in the `footnotes` container (creating one
  with placeholder text if absent). The hook lets a host take over content
  authoring.

```typescript
/** Resolve a footnote id and (optionally) create its entry. Default: generate. */
readonly onFootnotePrompt?: (context: RefPromptContext) => Promise<string | null>;
```

### 5.6 `stem` — type + inline formula content

Needs a `type` (the source notation, e.g. `"asciimath"` / `"mathml"`) **and**
the formula **content** itself (the mark wraps the formula text). This is the
only reference mark where both an attribute *and* user-typed content matter,
so the default UI is a small **formula-edit popover**: a notation selector
(`asciimath` / `mathml`) plus a text area, with an optional live preview.
Applying it inserts/types the formula text and wraps it in a `stem` mark
carrying the chosen `type`.

```typescript
/** Resolve a stem formula (type + source). Default: minimal popover. Return null to cancel. */
readonly onStemPrompt?: (context: StemPromptContext) => Promise<StemResult | null>;
```

```typescript
export interface StemResult {
  readonly type: "asciimath" | "mathml";
  readonly source: string;
}
```

> **Block formulas** use the separate `formula` **node** and are not covered
> by this mark-based button.

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
`pkg/editor-commands/src/commands/referenceMarks.ts`, and **re-exported** by
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
- **Schema coupling.** These are mark-toggling commands operating on
  `state.schema`. They resolve mark types by name through the schema instance
  at call time (`state.schema.marks.xref`, `…marks.eref`, …), so **no
  separate `(schema) => Command` factory is needed** — the mark type is read
  from the state passed in at invocation, not captured over a schema
  singleton. This is the §1.6.2 exception ("the command only makes sense for
  the exact Metanorma schema"); the decision is to use the plain-`Command`
  form.
- **Naming.** Named for the action (`toggleXref`, `applyReferenceMark`), not
  the trigger; no `Command` suffix (`EditorCommands.spec.md` §1.10.2).

> The attribute-collection arguments below (`target`, `cite`, `ref`, `type`,
> `id`, `source`) are **already-resolved** values — the toolbar obtains them
> via the §5 prompt hooks before calling. The commands never prompt or
> `await`.

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
 * Marks that require content to attach to (bcp14, stem, footnote) should be
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
  type: Bcp14Keyword | null,
): boolean;

export function toggleFootnote(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  id: string | null,
): boolean;

export function toggleStem(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  type: "asciimath" | "mathml",
  source: string,
): boolean;
```

`toggleXref`/`toggleEref`/`toggleConcept` delegate to `applyReferenceMark`
with their key attr. `toggleBcp14` validates that `type` is a member of the
configured enum before applying. `toggleStem` first ensures the selection
contains the formula `source` text (inserting/replacing as needed), then
applies the mark. `toggleFootnote` additionally ensures a `footnote_entry`
exists for `id` (§5.5) within the same transaction.

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
| `xref`, `eref`, `concept` | `refMarkActive(state, name)` | selection inside an `inline`-content node (base §5.1). Empty selection allowed: the mark can be set as a stored mark for upcoming typing. |
| `bcp14` | `refMarkActive(state, "bcp14")` | inside inline content **and** selection non-empty (a BCP14 keyword must attach to text). |
| `footnote` | `refMarkActive(state, "footnote")` | inside inline content. Empty selection allowed (marker-style insertion). |
| `stem` | `refMarkActive(state, "stem")` | inside inline content **and** selection non-empty, or the popover is about to insert content. |

**Toggle semantics (click while active removes).** For every mark, clicking
the button when the mark is already active at the selection calls the wrapper
with a `null` value (`toggleXref(state, dispatch, null)`, etc.), which routes
through `applyReferenceMark`'s removal branch (§6.1 step 3) — mirroring the
base `link` button's removal behaviour.

> **Implementation note:** `refMarkActive` for `bcp14` may optionally compare
> the stored mark's `type` against the menu's current selection, so a button
> can show *which* keyword is active. The minimum requirement is presence.

## 8. Styling

Follows base §8 conventions: plain CSS side-effect import, `mn-toolbar`
prefix. The attribute-collection UI (a `prosemirror-editor` concern, §5)
introduces new classes in `pkg/prosemirror-editor/src/reference-marks.css`:

```
.mn-toolbar-popover             /* floating container for xref/eref/concept/stem input */
  .mn-toolbar-popover__input    /* text <input>/<textarea> */
  .mn-toolbar-popover__list     /* picker <ul> (targets, bib entries, concepts) */
  .mn-toolbar-popover__item     /* picker <li>/button */
.mn-toolbar-menu                /* inline menu for bcp14 keywords (role="listbox") */
  .mn-toolbar-menu__option      /* keyword <button> */
```

Minimum behaviour: popovers/menus anchor below their triggering button,
respect `prefers-color-scheme`, and reuse the `--mn-border` / `--mn-active`
custom properties from the base stylesheet.

## 9. Accessibility

The attribute-collection UI is the main a11y surface. Requirements beyond
base §9 (native `<button>` semantics for the trigger buttons):

- **Popovers** (`xref`, `eref`, `concept`, `stem`) use `role="dialog"`,
  `aria-modal="false"`, and `aria-labelledby` pointing at the trigger's
  `title`. They trap focus into the input on open and restore focus to the
  trigger on close.
- **The BCP14 menu** uses `role="listbox"` with `role="option"` children and
  `aria-activedescendant` tracking; arrow keys move between keywords, `Enter`
  selects, `Escape` cancels.
- **Escape** cancels any open popover/menu and dispatches no transaction
  (consistent with a `null` hook result).
- Each picker list item exposes its label as accessible name and its id/key
  via `data-*` for host styling without relying on `title`.
- `aria-haspopup` is set on trigger buttons that open a popover/menu
  (`menu` for BCP14, `dialog` for the others).

## 10. Open questions / unknowns

Genuine unknowns to resolve before/while implementing:

1. **Target/anchor picker data source.** Does anything in the doc expose a
   list of valid `target` ids? The proposed approach scans `state.doc` for
   `id` attributes (present via `baseAttrs()` on most blocks) — but this
   assumes ids are authored/populated. Need to confirm which node types
   actually carry a non-null `id`, and whether anchors exist as a distinct
   construct.
2. **Bibliography enumeration for `eref`.** The schema allows a `bibliography`
   node; need to confirm its entry node type and how a citation key is stored
   on each entry, so the picker can list `(key, title)` pairs.
3. **BCP14 enum source & configurability.** The list in §5.4 is a proposed
   default. Confirm the authoritative keyword set, and whether non-English
   localisations need different tokens (i18n). Decide whether `bcp14Keywords`
   is a per-instance prop or a schema-level constant.
4. **`concept` store.** Where do concept refs resolve to? If purely external,
   the default free-text prompt may be the only realistic option and the hook
   is mandatory for a good UX.
5. **Footnote content authoring.** The mark references a `footnote_entry`, but
   who maintains the `footnotes` container? Should applying a footnote mark
   auto-create a placeholder entry (proposed), or is container maintenance a
   separate, explicit operation? Risk of dangling references if entries are
   edited/deleted independently of marks.
6. **Mark vs. `footnote_marker` node.** The schema offers both a `footnote`
   mark and an atom `footnote_marker` inline node. This spec proposes the
   **mark** for inline marking (consistent with the other five marks and
   editable inline), but the node form may be what render/serialize expects.
   Confirm which representation downstream tooling consumes.
7. **`stem` rendering / preview.** A live preview needs a math renderer
   (AsciiMath / MathML). Is one available in the editor bundle, or is preview
   deferred to the host? Without it the popover is source-only.
8. **Empty-selection behaviour.** For `bcp14`/`stem` (which require text),
   should an empty selection (a) disable the button, (b) insert placeholder
   text ("MUST", empty formula) and then mark it? Current proposal: `bcp14`
   inserts the keyword; `stem` inserts the typed source. Confirm.
9. **`xref`/`eref`/`concept` on empty selection.** Allowing these as stored
   marks for upcoming typing is convenient but can produce dangling marks if
   the user moves away without typing. Decide whether to require a non-empty
   selection for these too.

> **Resolved: footnote id generation.** Footnote ids are **generated at
> insertion time** via the shared `generateId()` helper
> (`crypto.randomUUID()`-based), for consistency with all other node-insertion
> commands. Ids are immutable once generated (not renumbered on serialize).

## 11. Export changes

The commands are **defined and exported** from
`@metanorma/editor-commands`. Its `pkg/editor-commands/src/index.ts` adds:

```typescript
// Command helpers (pure logic; Command contract, EditorCommands.spec.md §1.5)
export {
  applyReferenceMark,
  toggleXref,
  toggleEref,
  toggleConcept,
  toggleBcp14,
  toggleFootnote,
  toggleStem,
} from "./commands/referenceMarks.js";

// Reference-mark constants and types
export { BCP14_KEYWORDS } from "./commands/referenceMarks.js";
export type {
  Bcp14Keyword,
} from "./commands/referenceMarks.js";
```

`@metanorma/prosemirror-editor` **re-exports** them (so toolbar code can
import all editor APIs from one package) via
`pkg/prosemirror-editor/src/index.ts`:

```typescript
// Re-export pure reference-mark commands from @metanorma/editor-commands
export {
  applyReferenceMark,
  toggleXref,
  toggleEref,
  toggleConcept,
  toggleBcp14,
  toggleFootnote,
  toggleStem,
  BCP14_KEYWORDS,
} from "@metanorma/editor-commands";
export type { Bcp14Keyword } from "@metanorma/editor-commands";

// UI-only types: the prompt/picker context objects live with the toolbar UI
// in prosemirror-editor, not in the commands package.
export type {
  RefPromptContext,
  StemPromptContext,
  StemResult,
} from "./AdvancedMetanormaToolbar.js";

// New toolbar group key (extends base ToolbarGroup)
export type { ToolbarGroup } from "./AdvancedMetanormaToolbar.js";
```

> **Split rationale.** Commands and the `BCP14_KEYWORDS` enum are pure and
> schema-derived, so they originate in `@metanorma/editor-commands`. The
> `RefPromptContext` / `StemPromptContext` / `StemResult` types describe the
> **attribute-resolution UI** (they carry `EditorState` for host pickers and
> are consumed only by the `on*Prompt` hooks), so they stay in
> `prosemirror-editor` alongside the toolbar component.

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

```
pkg/editor-commands/src/                         ← PURE command logic (no React, no DOM)
  commands/
    referenceMarks.ts                            ← applyReferenceMark + six toggle wrappers,
                                                 │   BCP14_KEYWORDS, Bcp14Keyword
  index.ts                                       ← exports the commands above

pkg/prosemirror-editor/src/                      ← UI + EditorView concerns
  AdvancedMetanormaToolbar.tsx                   ← extended toolbar; adds 'refs' group,
                                                 │   on*Prompt hooks, popover/menu UI,
                                                 │   RefPromptContext / StemPromptContext / StemResult
  reference-marks.css                            ← popover/menu styles for attribute collection
  index.ts                                       ← re-exports commands from @metanorma/editor-commands;
                                                   exports UI types + ToolbarGroup
```

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
- Handle `null` from `noUncheckedIndexedAccess`: e.g. array access into
  `BCP14_KEYWORDS` and `mark.attrs[key]` lookups must be null-checked.
- Mark-type resolution goes through `state.schema.marks.X` (returns
  `MarkType | undefined` under `noUncheckedIndexedAccess`); the wrappers
  null-check and return `false` if the mark is absent from the schema.
- All exported types (`Bcp14Keyword`, `RefPromptContext`,
  `StemPromptContext`, `StemResult`) are exported alongside their values.
