# Images & figures

## 1. Purpose

This document is the detailed implementation spec for **image / figure
authoring** in the `AdvancedMetanormaToolbar`. It addresses the item deferred
by `MetanormaToolbar.spec.md` §5.5:

**Images / figures** — require file upload or URL resolution and
`assertValidImageAttrs`.

Authoring an image-backed figure is a **two-stage** operation because the
schema makes it one: `image` carries no group and is reachable **only** as a
child of `figure` (`schema.spec.md` §8.6), while a figure's `src` can only be
resolved through the **UI** (a remote URL or a local file that must be turned
into a URL). The toolbar therefore exposes two controls with cleanly split
responsibilities:

1. The **Figure button** (`insertFigure`, §6) — creates a `figure` with a
   seeded empty `figure_name` caption and an empty body rendered with a
   placeholder (§12). The author types the caption inline (full inline
   markup applies).
2. The **Image button** (`ImageInsertDialog` + `insertImageIntoFigure`,
   §4–§7) — single-mode: it adds an `image` atom to the figure the caret is
   in. It is enabled exactly when the selection sits inside a figure with no
   `image` child (`canInsertImageIntoFigure`, §6.3), which serves both
   first-fill after `insertFigure` and recovery after the image is deleted.

Stage-splitting is what makes the figure robust: deleting the `image` leaves
`figure > [figure_name]`, a document state from which the Image button can
re-add the image (§8.3), instead of a captioned shell with no path back to an
image.

It deliberately does **not** re-specify anything from the base toolbar (marks,
blocks, lists, links, the `ToolbarButton` descriptor, the `mn-toolbar` styling
conventions, or the integration model). Those are assumed. Only image/figure-
specific additions are defined here.

## 2. Scope and schema recap

Both media nodes come from `@metanorma/prosemirror-schema` (`metanormaSchema`,
defined in `schema.spec.md` §8.6 — implementation
`pkg/prosemirror-schema/nodes.ts`). The relevant fragment:

| Node | Content | Group | Atom | Draggable | Attrs |
|---|---|---|---|---|---|
| `figure` | `figure_name? (image \| block)*` | `block` | no | — | `id`, `number` (default `null`), plus `data` (default `{}`); the caption is the `figure_name` child node |
| `figure_name` | `inline*` | **none** | no | — | `data` (default `{}`) — the caption textblock |
| `image` | *(empty)* | **none** | yes | yes | `src` (default `""`), `alt` (default `null`), plus `data` (default `{}`) |

Three consequences drive the entire design:

1. **`image` is ungrouped.** It appears in no group and is mentioned by exactly
   one content expression — `figure`'s `(image | block)*`. An `image` node is
   therefore reachable **only** as a child of a `figure`. The toolbar cannot
   insert a bare `image` into a paragraph or clause; adding an image
   presupposes a figure to hold it. This is why there are two controls, not
   one (see §4).
2. **`image.src` defaults to `""` but must be non-empty.** ProseMirror requires
   every attribute to declare a default; the image source is semantically
   required, so the schema uses `""` as the placeholder default and
   pushes the real requirement to a **runtime guard**, `assertValidImageAttrs`,
   which throws when `src` is missing or empty. `insertImageIntoFigure`
   (§6.4) enforces this requirement before creating the node by validating
   `src` and returning `false` if invalid (§6.4 step 3).
3. **`figure` and `image` split attribute responsibility.** `figure` owns
   `id`/`number` and its caption lives in a `figure_name` child textblock
   (schema §8.6); it has **no `alt`** and **no `src`** (`src` lives only
   on the `image` child — see schema §17.1). `image` owns `alt` (the a11y text)
   and `src`; it has **no caption**. There is therefore **no duplicated `alt`**
   to mirror or ignore — the two nodes carry disjoint caption/a11y/source
   attributes by design. The rendered image attributes (`src`, `alt`) live on
   the `image` child; `figure` renders only `class="mn-figure"` and `data-id`.

### 2.1 Relation to Standoc `FigureBody`

The Standoc grammar (`basicdoc.rnc`) defines a positionally ordered figure
body:

```
FigureBody = tname?, (image | video | audio | pre | paragraph-with-footnote+ | figure*), fn*, dl?, note*, source?
```

Two structural facts follow:

- The choice group is **single-occurrence**: an XML figure carries `image`
  XOR a `paragraph-with-footnote+` run XOR nested figures — never both an
  image and sibling paragraphs.
- Everything after the choice group (`fn*`, `dl?`, `note*`, `source?`) is
  trailing content that follows the primary content.

The ProseMirror schema's `figure_name? (image | block)*` is intentionally
looser (schema.spec.md §17.6): the editor admits a figure holding an image
alongside blocks, because the Enter/`exitName` flow legitimately leaves an
empty paragraph after the image. The export coercion for that divergence is
governed by the §17.6 ledger (`schema.spec.md` §17.6), not by this feature.
For `insertImageIntoFigure` the constraint is positional: **given the XOR, the
slot immediately after `figure_name` is the only position valid in both
models** — `[figure_name, image]` is the canonical XML figure, while
`[figure_name, paragraph, image]` is invalid XML under any ordering of the
trailing content. The command therefore always inserts immediately after the
caption (§6.4 step 5).

### 2.2 Nested figures (subfigures)

Nested figures are **legal in both models**. In the PM schema, `figure` is in
the `block` group and its content expression admits blocks, so a figure may
contain a figure. In Standoc, `figure*` is one of the `FigureBody` choice
branches — subfigures are a first-class Metanorma feature.

v1 does not surface subfigure authoring. The **Figure button creates
top-level figures only**: `canInsertFigure` (§6.2) returns `false` when any
ancestor of the selection is a `figure`. Imported or pasted nested figures
remain valid documents. For those, `insertImageIntoFigure` targets the
**nearest** enclosing figure that lacks an `image` child (§6.3) — a
documented, well-defined rule, not a silent one.

The guard, exported from both `@metanorma/prosemirror-schema` and
`@metanorma/toolbar`:

```typescript
export function assertValidImageAttrs(
  attrs: { src?: unknown },
): asserts attrs is { src: string } {
  if (typeof attrs.src !== "string" || attrs.src === "") {
    throw new Error("assertValidImageAttrs: 'src' must be a non-empty string.");
  }
}
```

Existing node views — `ImageNodeView` (renders `<img src alt>` or a placeholder
when `src === ""`) and `FigureNodeView` (renders `<figure class="mn-figure">`
with `contentDOMRef`) — already render these nodes once they exist in the
document. This feature only **creates** them; it does not change the node
views. (Reusing the node views for attribute editing of an existing figure is a
plausible future enhancement; an `updateImageAttrs` helper is deferred. v1 is
insert-only.)

### 2.3 Serialization notes

Precise mappings only:

- **Editor DOM** (display and clipboard HTML): `figure_name` renders as
  `<figcaption class="mn-figure-name">` (`pkg/prosemirror-schema/nodes.ts`,
  `figure_name.toDOM`). This is browser-facing only.
- **Export** (editor → Standoc XML): `figure_name` maps to the `tname` /
  `<name>` element per the schema ledger (`schema.spec.md` §17.6), and an
  **empty caption is dropped on export**.
- Consequently the image-less figure this feature seeds (`figure >
  [figure_name]`, caption still empty) exports as `<figure id="…"/>`. A
  contentless figure is **valid** per the RNC — the `FigureBody` choice group
  is optional — so no downstream validation error is expected from the element
  itself; this spec makes no further claim about downstream compile-time
  warnings (unverified).

## 3. Package and files

| Aspect | Value |
|---|---|
| Command-logic package | `@metanorma/editor-commands` |
| Command module | `pkg/editor-commands/commands/insertImage.ts` (pure command logic) |
| Toolbar package (consumer) | `@metanorma/toolbar` — re-exports the commands/predicates (§10) |
| Dialog / adapter component | `pkg/toolbar/ImageInsertDialog.tsx` (`InsertImageButton` + dialog; owns `EditorView`, async, DOM) |
| Dialog styles | `pkg/toolbar/image-dialog.css` (imported side-effect) |
| Public barrel (toolbar) | `pkg/toolbar/index.ts` (re-exports — §10) |
| Public barrel (commands) | `pkg/editor-commands/index.ts` (command exports — §10) |
| Schema source | `@metanorma/prosemirror-schema` (`metanormaSchema`, `assertValidImageAttrs`) |

The split follows the `@metanorma/editor-commands` Command contract
(`EditorCommands.spec.md` §1.5): **pure command logic** — schema-coupled,
no `EditorView`, no DOM — lives in `@metanorma/editor-commands`.
The **toolbar adapter** (`InsertImageButton` + `ImageInsertDialog`) lives in
`@metanorma/toolbar`; it owns the React state, the `EditorView`,
and the async URL/upload resolution. The adapter resolves a `src` first, then
calls the synchronous pure command with the resolved `{ src, alt }`. Because
the source may need to be uploaded, the dialog's commit handler does not call
the command synchronously from `run`; see §7 for the async dispatch pattern.

## 4. The toolbar controls

The `images` group renders two entries, in order:

| Entry | Kind | Label | Title | Enabled when |
|---|---|---|---|---|
| Figure | plain `ToolbarButton` | `"Figure"` | `"Insert figure (caption + empty body)"` | `insertFigure(state) === true` (§6.2) |
| Image | dialog control (`InsertImageButton`) | `"Image"` | `"Add image to figure"` | `canInsertImageIntoFigure(state)` (§6.3) |

### 4.1 The Figure button

A plain data-driven `ToolbarButton` (base spec §5): `isActive` is always
`false` (insertion is not a toggle); `isEnabled` is the query form of the
`insertFigure` command; `run(view)` dispatches
`insertFigure(view.state, view.dispatch)` then calls `view.focus()` — the
standard adapter shape (README §6.2), patterned on the outdent button.

`insertFigure` lands the cursor inside the seeded caption, so immediately
after clicking Figure the Image button is enabled (the caret is inside an
image-less figure) and the Figure button is disabled (nesting refusal, §2.2).

### 4.2 The Image button

Because the Image button needs to open a dialog (and gather a source
asynchronously) rather than fire a transaction, it — like the table button in
`tables.md` §4 — is **not** a plain `ToolbarButton.run`-on-click control. It is
rendered by a dedicated React component that owns the dialog's open state and
renders the `ToolbarButton` visuals (`.mn-toolbar-btn` and modifiers) plus the
dialog. The base `ToolbarButton` descriptor's `run(view)` signature cannot by
itself express "open a dialog and later, asynchronously, dispatch"; this is the
minimal, non-invasive deviation, reusing the same `.mn-toolbar-btn` classes for
visual consistency.

The button is **single-mode**: its enabled state is
`canInsertImageIntoFigure(state)` alone, its title is static ("Add image to
figure"), and its commit handler always dispatches `insertImageIntoFigure`.
There is no context-dependent title, no alternate behavior outside a figure —
outside an image-less figure the button is simply disabled. When the command
returns `false` (e.g. the selection moved during an async upload), the dialog
surfaces the inline error "Insertion point is no longer inside a figure"
(§9.1).

```tsx
// pkg/toolbar/ImageInsertDialog.tsx (excerpt)
export function InsertImageButton({
  onImageUpload,
}: {
  readonly onImageUpload?: OnImageUpload;
}): React.JSX.Element {
  const enabled = useEditorStateSelector(canInsertImageIntoFigure);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  return (
    <div className="mn-toolbar-image">
      <button
        ref={triggerRef}
        type="button"
        className="mn-toolbar-btn"
        aria-haspopup="dialog"
        disabled={!enabled}
        title="Add image to figure"
        onClick={() => dialogRef.current?.togglePopover()}
      >
        Image
      </button>
      <ImageInsertDialog
        ref={dialogRef}
        onImageUpload={onImageUpload}
        onCommit={closeDialog}
        onCancel={closeDialog}
      />
    </div>
  );
}
```

### 4.3 Why two controls (the stage split)

Creating the figure and filling its image are separate user actions because
they have separate preconditions: a figure needs only a legal block slot
(§6.2), while an image needs a `src` that only the dialog can resolve and a
figure to live in (§6.3). Merging them into one always-emit-`figure > image`
action would leave the no-`src` case unhandleable and the post-deletion state
unrecoverable (§1). The stage split keeps each control's enabled predicate a
plain function of state.

**Drag-and-drop / paste is out of scope.** Dropping or pasting an image
directly into the document is not supported in v1; it is future work that
would reuse `insertImageIntoFigure` via `handlePaste`/`handleDrop`. The
toolbar button is the sole image-entry surface for v1.

**The caption is seeded, not prompted.** The dialog collects only `src` and
`alt`; the figure created by `insertFigure` carries an empty `figure_name`
caption (§6.2 step 5), and the cursor lands in it — the author types the
caption inline (full inline markup applies) without a caption field in the
dialog. Enter (`exitName`) moves on to the image; Backspace on the empty
caption deletes just the caption when the figure has other children (the
figure and image survive; `EditorCommands.spec.md` §4.4.9b).

## 5. Source resolution — the `ImageInsertDialog`

This is the core feature deferred by the base spec. The dialog collects three
pieces of input and resolves them to a single `src` URL plus an optional `alt`:

| Field | Control | Required | Purpose |
|---|---|---|---|
| Source URL | `<input type="url" name="src">` | one of URL/file | **URL path** (§5.1) — a remote or absolute image URL typed or pasted. |
| Image file | `<input type="file" accept="image/*">` | one of URL/file | **File path** (§5.2) — a local file embedded as a serializable `data:` URL (default), or uploaded via `onImageUpload`. |
| Alt text | `<input type="text" name="alt">` | no | Accessibility text, stored on the `image` node. |

Exactly one source is required: a non-empty URL **or** a chosen file. Alt text is
optional (the `image.alt` attr defaults to `null`). The dialog does not itself
validate the URL beyond non-emptiness; the pure `insertImageIntoFigure` command
performs the authoritative `src` validation (returns `false` if invalid — §6.4,
EditorCommands §1.5(4)).

### 5.1 URL path

When the user types or pastes a URL into the Source URL field and commits:

1. The dialog reads the trimmed `src` value and the (optional) `alt`.
2. It calls the commit handler, which resolves the source (synchronous here),
   then dispatches `insertImageIntoFigure(view.state, view.dispatch, { src,
   alt })` via `useEditorEventCallback` (§7). The `EditorView`/`dispatch` are
   held in the adapter, never in the pure command.
3. The pure command validates `src` (returns `false` without dispatching if
   `src` is empty/invalid — §6.4); on a `false` return the dialog surfaces an
   inline error (`aria-live`, §9).

**Upgrade hook.** Following the base toolbar's `onLinkPrompt` pattern
(`MetanormaToolbar.spec.md` §6), the toolbar accepts an optional
`onImagePrompt` that, if provided, replaces the built-in dialog with a host-
supplied UI (asset picker, media library, etc.):

```typescript
/** Optional custom image-source prompt. Replaces the built-in dialog. */
export type OnImagePrompt = () => Promise<
  { readonly src: string; readonly alt: string | null } | null
>;
```

When `onImagePrompt` resolves to a non-null object, the toolbar adapter
dispatches `insertImageIntoFigure(view.state, view.dispatch, { src, alt })`
with that `src`/`alt`; when it resolves to `null`, the operation is cancelled.
When `onImagePrompt` is absent, the built-in `ImageInsertDialog` is used. The
`Promise`/async concerns stay in the adapter; the pure command is synchronous.

### 5.2 File path

When the user selects a local file via the hidden `<input type="file">`, the
file must be turned into a `src` value before it can become `image.src`. Two
strategies, selected by whether the host app supplies an upload callback:

```typescript
/**
 * Optional upload handler. Given a selected File, upload it (e.g. to object
 * storage) and resolve to its resulting URL. When omitted, the dialog defaults
 * to a serializable `data:` URL (no server required).
 */
export type OnImageUpload = (file: File) => Promise<string>;
```

| Strategy | When used | Produces | Survives serialization? |
|---|---|---|---|
| **Data URL** (`FileReader.readAsDataURL`) | No `onImageUpload` supplied (**default**) | a `data:` URL embedding the file bytes as base64 | **Yes** — serializes cleanly; no server required. |
| **`onImageUpload(file)`** | Host app supplies the callback (**secondary**) | a real URL (`https://…`) returned by the host | **Yes** — the URL is durable. |

The dialog's default behaviour, when `onImageUpload` is absent, is
`FileReader.readAsDataURL(file)` — a **`data:` URL**. This makes local-only
editing work with zero host integration **and** survives serialization across
reloads, so it is the happy path for the common "no server" case. `onImageUpload`
is the secondary option for host apps that prefer to persist images to storage
and store a short URL instead of embedding bytes.

**Data-URL size handling.** Base64 embedding expands the payload by ~⅓, so
many images can produce a large document. Current versions of popular modern
browsers (Chrome, Safari, Firefox, Edge) do **not** impose a practical
`data:`-URL length cap for `img` rendering at typical document sizes, so this
is not an issue for normal use. If the generated `data:` URL exceeds a
browser-specific cap, `FileReader.readAsDataURL` / image load will fail; the
dialog must catch that failure and surface a **graceful error** (inline,
`aria-live`, §9), e.g. "This image is too large to embed — supply
`onImageUpload` to upload it instead." The dialog should not crash or insert a
broken node.

The file path is asynchronous (both `readAsDataURL` and `onImageUpload` return
promises), so the dialog's commit handler must `await` the resolution before
dispatching; see §7.

**No `blob:` URLs.** Non-serializable `blob:` object URLs
(`URL.createObjectURL`) are **not supported**: they do not survive
serialization, so a reloaded or server-rendered document cannot resolve them.
The default `data:` URL path is the supported no-server strategy instead.

## 6. The pure commands

Lives in `pkg/editor-commands/commands/insertImage.ts` — the
`@metanorma/editor-commands` package. Both commands conform to the Command
contract (`EditorCommands.spec.md` §1.5): they are pure
`(state, dispatch?) => boolean` functions — **no `EditorView`, no DOM**. The
`EditorView`, async URL/upload resolution, and focus management concerns live
only in the toolbar adapter in `@metanorma/toolbar` (§4, §7). The image
command takes **already-resolved** `{ src, alt }` and is synchronous.

### 6.1 Signatures

```typescript
import type { EditorState, Transaction } from "prosemirror-state";
// NOTE: NO import of EditorView — the pure commands never touch a view or DOM.

/** Attributes gathered by the adapter (dialog / prompt). `src` must be non-empty. */
export interface InsertImageAttrs {
  readonly src: string;
  readonly alt?: string | null;
}

/**
 * Validate that a top-level figure may be inserted at the current selection.
 * Pure function of EditorState — plugs straight into useEditorStateSelector.
 */
export function canInsertFigure(state: EditorState): boolean;

/**
 * Insert an empty `figure > [figure_name]` at the current selection and place
 * the cursor in the caption.
 */
export function insertFigure(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean;

/**
 * True when the selection sits inside (or node-selects) a figure with no
 * `image` child — the nearest such ancestor.
 */
export function canInsertImageIntoFigure(state: EditorState): boolean;

/**
 * Insert an `image` atom into the figure at (or enclosing) the current
 * selection, immediately after its `figure_name` child.
 */
export function insertImageIntoFigure(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  attrs?: InsertImageAttrs,
): boolean;
```

**Query/dispatch parity (EditorCommands §1.5(1)/(3)).** With `dispatch`
omitted, `insertFigure(state)` and `insertImageIntoFigure(state)` return
`true` exactly when their `can*` predicates return `true`, and mutate nothing.
The buttons' `isEnabled` rules (§4) are therefore the query forms of their
commands.

**Factory form (EditorCommands §1.6.2).** The commands resolve node types
through `state.schema` per README §6.4; no `(schema) => Command` factory is
required.

### 6.2 `insertFigure` — algorithm

1. **Applicability check (always).** Run `canInsertFigure(state)`. If it
   returns `false`, return `false` — whether or not `dispatch` is supplied.
2. **No dispatch ⇒ pure predicate.** If `dispatch` is **not** supplied, return
   `true` here. Steps 3–8 only run when `dispatch` **is** supplied.
3. **Build the node tree.** Resolve types through `state.schema` (NOT a
   captured schema singleton):
     - `figure_name = state.schema.nodes.figure_name.create()` — the seeded
       empty caption textblock, first (and only) child of the figure.
     - `figure = state.schema.nodes.figure.create({ id: generateId() },
       [figure_name])` — the block wrapper; the `figure` carries a
       **generated `id`** for cross-referencing. `number`/`data` default to
       their schema values.
4. **Insert.** `tr = state.tr.replaceSelectionWith(figure)`.
5. **Place the cursor in the seeded caption.** Locate the inserted figure by
   its **generated `id`** (a `descendants` scan — `replaceSelectionWith` may
   replace an empty textblock wholesale or split a non-empty one at the
   caret, so selection arithmetic is unreliable; same hazard as `insertTable`,
   `tables.md` §8.1.3) and set a `TextSelection` in the caption (`+2`: figure
   open + caption open), so the author types the caption immediately (full
   inline markup applies). The figure is not node-selected on insertion.
6. **Scroll into view + dispatch once.** `tr.scrollIntoView(); dispatch(tr);
   return true;` — exactly one transaction, dispatched exactly once. No
   `view.focus()` (that is the adapter's job, §7); no `EditorView` at all.

`canInsertFigure` asks whether a `figure` may occupy the slot immediately
after the cursor's textblock: `canInsertBlockAdjacent(state, figureType)`
(shared legality machinery, `util.ts`), restricted to a collapsed/single-block
selection (`$from.sameParent($to)`), **and** the cursor's textblock must be
body content (not a `section_title` heading — `bodyBlockContext` already
excludes captions, headings, and non-textblock positions), **and** no ancestor
of the selection is a `figure` (§2.2 nesting refusal — v1 does not author
subfigures from the toolbar).

### 6.3 `canInsertImageIntoFigure` — the target rule

Walk the selection's ancestors from the cursor outward. The **target** is the
nearest enclosing `figure` that contains **no `image` child**. `true` iff such
a figure exists. When the selection is a `NodeSelection` whose selected node
is itself a `figure` without an `image` child, that node is the target.

Rules the walk encodes:

- **One image per figure (v1).** A figure that already has an `image` is not a
  target; the walk continues outward from its context — e.g. inside a
  subfigure-with-image, the enclosing parent figure (if image-less) is a legal
  target for `insertImageIntoFigure`. This guards accidental duplicates and
  serves first-fill (§6.2 leaves the caret in the caption of an image-less
  figure) and post-deletion recovery (§8.3) alike.
- The nearest-ancestor walk is what makes imported/pasted **nested figures**
  well-defined targets (§2.2): an image is added to the innermost image-less
  figure containing the caret.

### 6.4 `insertImageIntoFigure` — algorithm

1. **Applicability check (always).** Run `canInsertImageIntoFigure(state)`. If
   `false`, return `false` — whether or not `dispatch` is supplied.
2. **No dispatch ⇒ pure predicate.** If `dispatch` is **not** supplied, return
   `true` here.
3. **Validate `src` (non-throwing).** The throwing guard
   `assertValidImageAttrs({ src: attrs?.src })` is wrapped in a `try`/`catch`;
   on throw (or if `attrs`/`src` is missing/empty), return `false` without
   dispatching (EditorCommands §1.5(4)). The assert also narrows `src` to
   `string` for the type system.
4. **Resolve the target figure** (same walk as §6.3, re-run against the
   passed `state`): the nearest ancestor `figure` with no `image` child (or
   the node-selected figure itself). Resolve its position (`figStart =
   $target.before(depth)`; for NodeSelection, `selection.from`).
5. **Compute the insertion point: immediately after `figure_name`.** If the
   target figure's first child is a `figure_name`, insert at `figStart + 1 +
   figure_name.nodeSize`; if it has no caption child (a parsed/imported
   figure), insert at `figStart + 1`. Rationale: §2.1 — given the Standoc XOR,
   the slot after the caption is the only position valid in both models, and
   it is immune to whatever trailing content the figure has accumulated
   (paragraphs, notes, …).
6. **Insert.** `tr.insert(pos, imageType.create({ src, alt: attrs.alt ?? null }))`
   — one transaction. The selection is left unchanged (the cursor stays where
   the author had it, e.g. in the caption).
7. **Scroll into view + dispatch once.** `tr.scrollIntoView(); dispatch(tr);
   return true;` — exactly one transaction, dispatched exactly once.

### 6.5 Position arithmetic

Both commands locate nodes through stable anchors instead of selection
arithmetic. `insertFigure` uses the id-based `descendants` scan because
`replaceSelectionWith` has two insertion shapes (empty-textblock replace vs
mid-text split) and the resulting figure's position differs between them.
`insertImageIntoFigure` computes `figStart` from the resolved-position walk
(`$target.before(depth)`), which is exact by construction.

### 6.6 Example implementation

```typescript
// pkg/editor-commands/commands/insertImage.ts
// @metanorma/editor-commands — PURE command logic. No EditorView, no DOM.
import { TextSelection, type EditorState, type Transaction } from "prosemirror-state";
import { assertValidImageAttrs } from "@metanorma/prosemirror-schema";
import { generateId, canInsertBlockAdjacent } from "../util.js";

export interface InsertImageAttrs {
  readonly src: string;
  readonly alt?: string | null;
}

/** True when the cursor is inside a figure (any ancestor is a figure). */
function insideFigure($from: ResolvedPos): boolean {
  for (let d = $from.depth; d >= 1; d--) {
    if ($from.node(d).type.name === "figure") return true;
  }
  return false;
}

/** True when a top-level figure may be inserted at the current selection. */
export function canInsertFigure(state: EditorState): boolean {
  const figureType = state.schema.nodes["figure"];
  if (figureType === undefined) return false;
  const { $from, $to } = state.selection;
  // v1: cursor / single-block only; refuse inside any figure (§2.2).
  if (!$from.sameParent($to) || insideFigure($from)) return false;
  return canInsertBlockAdjacent(state, figureType);
}

export function insertFigure(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  if (!canInsertFigure(state)) return false;
  if (dispatch === undefined) return true;

  const schema = state.schema;
  const figureType = schema.nodes["figure"];
  const nameType = schema.nodes["figure_name"];
  if (figureType === undefined || nameType === undefined) return false;
  const figure = figureType.create({ id: generateId() }, [nameType.create()]);

  const tr = state.tr.replaceSelectionWith(figure);

  // Locate the inserted figure by generated id — the position depends on
  // whether replaceSelectionWith replaced an empty textblock wholesale or
  // split a non-empty one (same hazard as insertTable).
  const figureId = figure.attrs.id;
  let figPos = -1;
  tr.doc.descendants((n, p) => {
    if (figPos === -1 && n.type === figureType && n.attrs.id === figureId) {
      figPos = p;
      return false;
    }
    return true;
  });
  if (figPos !== -1) {
    const captionPos = figPos + 2; // figure open + figure_name open
    tr.setSelection(TextSelection.near(tr.doc.resolve(captionPos), 1));
  }

  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

/** The nearest ancestor figure with no image child, or null. */
function targetFigure($pos: ResolvedPos): { node: Node; depth: number } | null {
  for (let d = $pos.depth; d >= 1; d--) {
    const node = $pos.node(d);
    if (node.type.name !== "figure") continue;
    if (nodeHasImage(node)) continue;
    return { node, depth: d };
  }
  return null;
}

/** True when the selection is inside (or node-selects) an image-less figure. */
export function canInsertImageIntoFigure(state: EditorState): boolean {
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.node.type.name === "figure"
      && !nodeHasImage(sel.node)) {
    return true;
  }
  return targetFigure(sel.$from) !== null;
}

export function insertImageIntoFigure(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  attrs?: InsertImageAttrs,
): boolean {
  if (!canInsertImageIntoFigure(state)) return false;
  if (dispatch === undefined) return true;

  let src: string;
  try {
    assertValidImageAttrs({ src: attrs?.src });
    src = attrs!.src;
  } catch {
    return false;
  }

  const schema = state.schema;
  const imageType = schema.nodes["image"];
  if (imageType === undefined) return false;

  // Resolve the target (§6.4 step 4).
  const sel = state.selection;
  let figStart: number;
  let captionSize: number;
  if (sel instanceof NodeSelection && sel.node.type.name === "figure") {
    figStart = sel.from;
    captionSize = sel.node.firstChild?.type.name === "figure_name"
      ? sel.node.firstChild.nodeSize : 0;
  } else {
    const target = targetFigure(sel.$from);
    if (target === null) return false;
    figStart = sel.$from.before(target.depth);
    captionSize = target.node.firstChild?.type.name === "figure_name"
      ? target.node.firstChild.nodeSize : 0;
  }

  // Insert immediately after figure_name (§6.4 step 5).
  const image = imageType.create({ src, alt: attrs!.alt ?? null });
  const tr = state.tr.insert(figStart + 1 + captionSize, image);
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}
```

**Command contract compliance.** Both commands conform to the Command contract
(README §6.2; `EditorCommands.spec.md` §1.5): query/dispatch parity, single
transaction, non-throwing, selection-aware.

### 6.7 Why an image must be placed inside a figure

Because `image` is ungrouped and appears in no content expression except
`figure`'s, it cannot be placed directly into any block container. The image
command therefore always targets an existing figure. The `figure` is the block
the document model (and the `FigureNodeView`) expects; the `image` atom
carries the rendered `src`/`alt`. This matches §2 and is the sole reason no
bare-`image` insertion path is offered.

## 7. The async dispatch pattern

All async/`Promise`/`File` work is **UI-only** and lives in the toolbar adapter
(`ImageInsertDialog.tsx` in `@metanorma/toolbar`); the pure commands
(§6) are synchronous. URL entry is synchronous, but the **file path is
asynchronous** (both `data:`-URL generation and `onImageUpload`), and even URL
entry via the `onImagePrompt` hook returns a `Promise`. The **adapter** resolves
the source to a `src` string first, then calls the synchronous pure command with
resolved `{ src, alt }`. The dispatch must therefore happen **after** the source
resolves, against an editor state that may have changed during the wait. Three
rules make this safe:

1. **Capture no state; use the live `view`.** `useEditorEventCallback` always
   invokes its callback with the **current** `EditorView`. The callback must read
   `view.state` (not a state captured at click time) when it finally dispatches.
   The adapter passes `view.state` and `view.dispatch` into the pure command.
2. **Validate at dispatch time.** `insertImageIntoFigure` re-runs
   `canInsertImageIntoFigure(state)` internally against the passed `state`
   (§6.4 step 4). If the user moved the cursor during an upload, insertion
   either proceeds into the figure at the new site (if still legal) or
   returns `false`. The dialog treats a `false` return as a soft failure:
   it stays open and shows the inline error "Insertion point is no longer
   inside a figure" (`aria-live`, §9.1).
3. **Handle a detached view + re-focus.** The callback's `view` argument is
   `EditorView | null`; if the editor unmounted mid-upload (e.g. the dialog was
   dismissed and the component torn down), the callback must bail on `null`. On a
   successful insert, the adapter calls `view.focus()` — the pure command never
   touches focus.

```tsx
// pkg/toolbar/ImageInsertDialog.tsx (commit handler)
// The ADAPTER owns EditorView, async, and DOM. The pure command owns none.
import { insertImageIntoFigure } from "@metanorma/editor-commands"; // re-exported through toolbar pkg

const dispatchInsert = useEditorEventCallback(
  async (view: EditorView | null, src: string, alt: string | null) => {
    if (!view) return;                 // editor unmounted
    // Synchronous pure command with resolved attrs; view.state/dispatch stay here.
    const ok = insertImageIntoFigure(view.state, view.dispatch, { src, alt });
    if (!ok) return false;             // soft failure: selection moved out, or src invalid
    view.focus();                      // focus is the ADAPTER's concern, never the command's
    return true;
  },
);

async function onCommit(file: File | null, url: string, alt: string): Promise<void> {
  // Async source resolution happens here in the UI layer, BEFORE the command.
  let src: string | null = null;
  try {
    if (file !== null) {
      src = onImageUpload ? await onImageUpload(file) : await readAsDataURL(file);
    } else if (url.trim() !== "") {
      src = url.trim();
    }
  } catch {
    // data: URL generation or upload failed (e.g. image too large to embed).
    // Surface a graceful inline error; do NOT insert a broken node.
    showError("Could not read this image. Try a smaller image or supply onImageUpload.");
    return;
  }
  if (src === null) return;            // nothing to insert
  await dispatchInsert(src, alt.trim() === "" ? null : alt);
}
```

The boundary is thus: the adapter resolves `src`/`alt` (async, `File`,
`FileReader.readAsDataURL`, `onImageUpload`) and holds the `EditorView`; the pure
command takes already-resolved `{ src, alt }` plus `view.state`/`view.dispatch`
and performs the synchronous, schema-aware insert. The
`EditorView` reference is always current, and the transaction is built and
dispatched from the live `view.state` inside `insertImageIntoFigure` at the
moment the resolved `src` is available.

## 8. Active / enabled detection

### 8.1 Active

```typescript
isActive: () => false;
```

Neither control is a **toggle** — there is no "active" state, and neither
button is ever rendered with `.mn-toolbar-btn--active`. (Selecting an existing
figure or image to **edit** its `src`/`alt` via the same dialog is a plausible
future enhancement; an `updateImageAttrs` helper is deferred. v1 is
insert-only.)

### 8.2 Figure button enabled

`insertFigure(state) === true` — i.e. `canInsertFigure` (§6.2): a collapsed
selection in body content whose parent admits a block after the cursor's
textblock, and no figure ancestor. Because `figure` is a `block`, the
first condition is true inside a `paragraph`, `note`, `example`, `quote`, list
item, or `table_cell`, but **not** inside an atom node (`formula`, `image`) or
inside `sourcecode` (`text*`-only) or `floating_title` (`inline*`-only); and it
is false inside any caption (`figure_name`/`table_name` — `bodyBlockContext`
excludes captions) and inside any figure (nesting refusal, §2.2).

### 8.3 Image button enabled (and the recovery story)

`canInsertImageIntoFigure(state)` (§6.3). The two gating conditions mirror the
two stages:

- **First fill.** After `insertFigure`, the caret is inside the caption of an
  image-less figure → enabled. The author may type the caption first; the
  caret stays inside the figure, the button stays enabled.
- **Recovery.** Deleting the `image` atom (node-select it, Backspace/Delete —
  stock `deleteSelection`) leaves `figure > [figure_name]`. The caret lands
  inside the figure context, the button re-enables, and re-running the dialog
  restores the image. This is the state that motivated the stage split (§1):
  under the stage split it is recoverable, not a dead end.
- **Disabled otherwise.** Outside any figure (a plain paragraph, a clause
  body, a table cell, a heading) → no target → disabled. Inside a figure that
  already has an image (v1 one-image rule) → disabled.

`canInsertImageIntoFigure` is a pure function of `EditorState`, so it plugs
directly into `useEditorStateSelector`.

### 8.4 Strict-tsconfig notes

- `state.schema.nodes["figure"]` / `["image"]` return `NodeType | undefined`
  under `noUncheckedIndexedAccess`; guard with an explicit early return before
  use, keeping the type system honest.
- `imageType.create({ src, alt })` passes `alt` as `string | null`; the schema
  default for `alt` is `null`, so omitting it would also be valid, but the
  command passes `alt ?? null` explicitly to avoid an `undefined` value
  (forbidden for object literals under `exactOptionalPropertyTypes`).

## 9. Accessibility

Feature-specific accessibility additions beyond the baseline
(README §2.5 / `MetanormaToolbar.spec.md` §9). The `ImageInsertDialog` follows
the WAI-ARIA **dialog** pattern:

### 9.1 Roles and labels

| Element | Role / attributes |
|---|---|
| Dialog root | `role="dialog"`, `aria-label="Add image to figure"`, `aria-modal="false"` (non-modal — `Escape`/outside-click dismiss it without trapping global focus). |
| Source URL input | `<label>` (or `aria-label="Image URL"`) associated via `htmlFor`/`id`; `type="url"`, `autocomplete="off"`. |
| File input | Visually hidden `<input type="file" accept="image/*">` with an associated `<label>`/button labelled "Choose file"; the chosen filename is announced. |
| Alt text input | `<label>` (or `aria-label="Alternative text"`) associated via `htmlFor`/`id`; `type="text"`. |
| Inline error region | `aria-live="polite"` so an "Image URL is required" / "Insertion point is no longer inside a figure" message is announced. |
| Figure (trigger) button | Standard `ToolbarButton` markup (base spec §5): `<button>` + `title` + `.mn-toolbar-btn`. |
| Image (trigger) button | `aria-haspopup="dialog"`, `aria-expanded` when open, `aria-controls={dialogId}` when open. |

### 9.2 Keyboard operability

| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Move focus between the dialog controls (URL → file → alt → commit → cancel). |
| `Enter` | On the commit control: submit the dialog (resolve source, dispatch `insertImageIntoFigure`). Inside a text field: submit only when the field has a value, otherwise default form behaviour. |
| `Escape` | Cancel: close the dialog without inserting; discard any in-flight `data:`-URL generation or upload. |
| Click outside the dialog | Cancel (same as `Escape`). |

### 9.3 Focus management

- When the dialog opens, focus moves to the Source URL input.
- On commit or cancel, focus returns to the Image trigger button.
- The dialog must not insert a full focus trap (it is `aria-modal="false"`); it
  relies on `Escape`/outside-click for dismissal.

## 10. Export changes

Pure commands are exported from `@metanorma/editor-commands` and re-exported
through `@metanorma/toolbar`; see the consolidated export listing in
README §5.6. The exports are `insertFigure`, `canInsertFigure`,
`insertImageIntoFigure`, `canInsertImageIntoFigure`, and the
`InsertImageAttrs` type. No combined `insertImage` command exists.

## 11. CSS classes

The group introduces feature-specific classes/uses under the existing
`mn-toolbar` prefix:

```
.mn-toolbar-image              /* wrapper: Image trigger button + dialog */
  .mn-toolbar-btn              /* the trigger (reuses base class) */
.mn-toolbar-dialog             /* absolutely-positioned dialog container */
  .mn-toolbar-dialog-field     /* a label + input row */
  .mn-toolbar-dialog-error     /* inline error text (aria-live) */
  .mn-toolbar-dialog-actions   /* commit / cancel button row */
```

The Figure button is a plain `ToolbarButton` — it uses the base
`.mn-toolbar-btn` classes and adds no feature classes.

## 12. The empty-figure placeholder

A figure with an **empty body** renders a placeholder so the author sees the
empty state. One selector, in the document layer
(`pkg/prosemirror-editor/document.css`, beside the existing figure rules):

```css
.mn-prosemirror figure.mn-figure:not(:has(> :not(.mn-figure-name)))::after {
  content: "Empty figure";
  display: block;
  margin: var(--mn-space-2);
  padding: var(--mn-space-4);
  border: 1px dashed var(--mn-border);
  border-radius: var(--mn-radius-sm);
  background: var(--mn-surface-muted);
  color: var(--mn-text-placeholder);
  font-size: 0.9em;
}
```

The label is a **state, not an instruction** — it names the document state
without prescribing content and without naming toolbar chrome the host may
not render (`visibleGroups: { images: false }`, the base
`MetanormaToolbar`, or an `onImagePrompt`-replaced UI would all leave the
old "Add an image with the Image button" text describing a button that
doesn't exist). Standoc's `FigureBody` choice group admits `image` XOR a
`paragraph-with-footnote+` run XOR nested figures (§2.1): a figure holding
paragraphs is a **complete, valid figure**, so an image-missing message would
misdescribe it. "Empty figure" is true of exactly the figures the selector
matches. The affordance for adding an image is the **enabled Image button**
(§8.3), not placeholder text.

**Match set.** The selector matches a figure whose children are at most the
caption — `[figure_name]` (fresh `insertFigure`, or after the image is
deleted: the recovery state, §8.3) and the caption-less empty figure (a
parsed doc). It does **not** match figures with any body content — an image,
paragraphs (including the Enter/`exitName` residue `[figure_name,
paragraph]`), or nested figures. A deliberate text-figure therefore never
shows the placeholder.

**Why no empty-textblock guard.** The section-title placeholder uses
`:has(> .ProseMirror-trailingBreak:only-child)` because it detects an empty
**textblock** — and `:empty` can never match a ProseMirror textblock, since PM
always keeps a trailing `<br>` inside one. The figure condition is
**structural**, not content-emptiness: "no child element other than the
caption". `:not(:has(> :not(.mn-figure-name)))` expresses that exactly, with
no auxiliary guard.

The pseudo-element is invisible to ProseMirror's DOM reading (PM parses only
its content DOM; pseudo-elements generate no DOM nodes), so there is no
serialization impact. Clicks on the pseudo-element fall through to the
`figure` element, where ProseMirror lands the caret in the nearest textblock
(the caption), which enables the Image button.

## 13. File-structure summary

See the consolidated file-structure summary in README §5.5. This feature adds
no feature-specific structure notes: `insertFigure` /
`insertImageIntoFigure` live in `pkg/editor-commands/commands/insertImage.ts`,
the Figure button in `pkg/toolbar/groups/imagesGroup.tsx`, the dialog adapter
in `pkg/toolbar/ImageInsertDialog.tsx`, and the placeholder CSS in
`pkg/prosemirror-editor/document.css`.

## 14. TypeScript constraints

The project tsconfig enforces `strict`, `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `module: node16`. All new
code must:

- Use `import type` for type-only imports (`EditorState`, `Transaction`,
  `ResolvedPos`, `Node`).
  The **pure commands** must **never** import `EditorView`/`prosemirror-view`;
  only the UI adapter in `@metanorma/toolbar` imports `EditorView`.
- Use `.js` extensions in relative imports (`"./commands/insertImage.js"`).
- Treat `schema.nodes["figure"]` / `schema.nodes["image"]` lookups as
  `NodeType | undefined` under `noUncheckedIndexedAccess` — guard or assert
  before use.
- Pass `null` (not `undefined`) for defaulted attrs in `NodeType.create`; pass
  `alt: attrs.alt ?? null` so no `undefined` reaches the attrs object
  (`exactOptionalPropertyTypes`).
- Export all types alongside their implementations (`InsertImageAttrs`,
  `OnImageUpload`, `OnImagePrompt`).
- **Command contract (EditorCommands §1.5):** the pure commands must be
  assignable to `Command` — `(state, dispatch?) => boolean`; they must never
  throw (wrap `assertValidImageAttrs` in `try`/`catch` → return `false`); and
  their query forms (`dispatch` omitted) must return the same booleans as
  their `can*` predicates.
