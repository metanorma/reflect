# Images & figures

## 1. Purpose

This document is the detailed implementation proposal for **image / figure
insertion** in the `AdvancedMetanormaToolbar`. It addresses the single item
deferred by `MetanormaToolbar.spec.md` §5.5:

> **Images / figures** — require file upload or URL resolution and
> `assertValidImageAttrs`.

Inserting an image is unlike toggling a mark: it requires the user to supply a
**source** — either a remote URL or a local file that must be turned into a
URL — before any node can be created. The schema then forbids a bare `image`
from living on its own: `image` carries no group and is reachable **only** as a
child of `figure`. So the feature is necessarily a two-part operation: **resolve
a `src`** (URL or upload), then **build a `figure` wrapping an `image`** and
insert it. The runtime guard `assertValidImageAttrs` gates the first part.

This document therefore specifies three coupled deliverables — an **"Insert
image" button** that opens a source-resolution dialog, the **`ImageInsertDialog`**
itself (URL field + file picker + alt text), and an **`insertImage` command**
that validates the resolved `src`, materialises the `figure > image` subtree, and
selects it.

It deliberately does **not** re-specify anything from the base toolbar (marks,
blocks, lists, links, the `ToolbarButton` descriptor, the `mn-toolbar` styling
conventions, or the integration model). Those are assumed. Only image/figure-
specific additions are defined here.

## 2. Scope and schema recap

Both media nodes come from `@metanorma/prosemirror-schema` (`metanormaSchema`,
defined in `pkg/prosemirror-schema/src/nodes.ts` §8.6). The relevant fragment:

| Node | Content | Group | Atom | Draggable | Attrs |
|---|---|---|---|---|---|
| `figure` | `(image \| block)*` | `block` | no | — | `id`, `number`, `title`, `src`, `alt` (all default `null`), plus `data` (default `{}`) |
| `image` | *(empty)* | **none** | yes | yes | `src` (default `""`), `alt` (default `null`), plus `data` (default `{}`) |

Three consequences drive the entire design:

1. **`image` is ungrouped.** It appears in no group and is mentioned by exactly
   one content expression — `figure`'s `(image | block)*`. An `image` node is
   therefore reachable **only** as a child of a `figure`. The toolbar cannot
   insert a bare `image` into a paragraph or clause; it must always emit a
   `figure` containing the `image`. This is why there is a single button, not two
   (see §4).
2. **`image.src` defaults to `""` but must be non-empty.** ProseMirror requires
   every attribute to declare a default; because the TypeScript `ImageAttrs`
   marks `src` as required, the schema uses `""` as the placeholder default and
   pushes the real requirement to a **runtime guard**, `assertValidImageAttrs`,
   which throws when `src` is missing or empty. The command (§6) must call this
   guard before creating the node, exactly as the base spec's §5.5 anticipated.
3. **`figure` itself also declares `src` and `alt`.** Both default `null` and are
   **not** rendered by `figure`'s `toDOM` (which emits only `class="figure"` and
   `data-id`). The rendered image attributes live on the `image` child. This
   duplication is noted as an open question (§10); the command sets
   `image.src`/`image.alt` and leaves `figure.src`/`figure.alt` at their `null`
   defaults.

The guard, exported from both `@metanorma/prosemirror-schema` and
`@metanorma/prosemirror-editor`:

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
when `src === ""`) and `FigureNodeView` (renders `<figure class="figure">` with
`contentDOMRef`) — already render these nodes once they exist in the document.
This feature only **creates** them; it does not change the node views (see §10
for whether to reuse them for attribute editing).

## 3. Package and files

| Aspect | Value |
|---|---|
| Editor package | `@metanorma/prosemirror-editor` |
| Command module | `pkg/prosemirror-editor/src/commands/insertImage.ts` |
| Dialog component | `pkg/prosemirror-editor/src/ImageInsertDialog.tsx` |
| Dialog styles | `pkg/prosemirror-editor/src/image-dialog.css` (imported side-effect) |
| Public barrel | `pkg/prosemirror-editor/src/index.ts` (add exports — §11) |
| Schema source | `@metanorma/prosemirror-schema` (`metanormaSchema`, `assertValidImageAttrs`) |

The dialog is rendered as a descendant of the toolbar (and therefore of
`<ProseMirror>`), so it dispatches via `useEditorEventCallback` like every other
toolbar control. Because the dispatch is **asynchronous** (the source may need
to be uploaded), the dialog's commit handler does not call the command
synchronously from `run`; see §7 for the async dispatch pattern.

## 4. The "Insert image" button

| Field | Value |
|---|---|
| `key` | `"image"` |
| `label` | `"🖼"` (image glyph) |
| `title` | `"Insert image"` |
| `isActive` | `false` — image insertion is not a toggle; see §8. |
| `isEnabled` | §8 enabled rule (`canInsertFigure(state)`). |
| `run` | Does **not** dispatch immediately. It toggles the `ImageInsertDialog` open/closed against local React state (see §5). The actual dispatch happens in the dialog's commit handler, after the source is resolved. |

Because `run` needs to open a dialog (and gather a source asynchronously) rather
than fire a transaction, the "Insert image" button — like the table button in
`tables.md` §4 — is **not** a plain `ToolbarButton.run`-on-click control. It is
rendered by a dedicated React component that owns the dialog's open state and
renders the `ToolbarButton` visuals (`.mn-toolbar-btn` and modifiers) plus the
dialog. The base `ToolbarButton` descriptor's `run(view)` signature cannot by
itself express "open a dialog and later, asynchronously, dispatch"; this is the
minimal, non-invasive deviation, reusing the same `.mn-toolbar-btn` classes for
visual consistency.

```tsx
// pkg/prosemirror-editor/src/ImageInsertDialog.tsx (excerpt)
export function InsertImageButton({
  onImageUpload,
}: {
  readonly onImageUpload?: OnImageUpload;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const enabled = useEditorStateSelector(canInsertFigure);

  return (
    <div className="mn-toolbar-image">
      <button
        type="button"
        className="mn-toolbar-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!enabled}
        title="Insert image"
        onClick={() => setOpen((v) => !v)}
      >
        🖼
      </button>
      {open ? (
        <ImageInsertDialog
          onImageUpload={onImageUpload}
          onCommit={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
```

### 4.1 Why a single button (no separate "Insert figure")

A second "Insert figure" button that created a figure with **no** `image` child
would be legal (`figure` content is `(image | block)*`, so an empty figure
satisfies the `*`), but it would produce a figure with nothing to display and no
way to add an image except by re-opening this very dialog. Since the toolbar is
the only image-entry surface, the single "Insert image" button always emits a
complete `figure > image`. If bare-figure insertion (e.g. for a figure that will
hold only caption blocks) becomes a real need, it can be added later as a second
button; it is deferred to §10.

## 5. Source resolution — the `ImageInsertDialog`

This is the core feature deferred by the base spec. The dialog collects three
pieces of input and resolves them to a single `src` URL plus an optional `alt`:

| Field | Control | Required | Purpose |
|---|---|---|---|
| Source URL | `<input type="url" name="src">` | one of URL/file | **URL path** (§5.1) — a remote or absolute image URL typed or pasted. |
| Image file | `<input type="file" accept="image/*">` | one of URL/file | **Upload path** (§5.2) — a local file turned into a URL. |
| Alt text | `<input type="text" name="alt">` | no | Accessibility text, stored on the `image` node. |

Exactly one source is required: a non-empty URL **or** a chosen file. Alt text is
optional (the `image.alt` attr defaults to `null`). The dialog does not itself
validate the URL beyond non-emptiness; the `insertImage` command runs
`assertValidImageAttrs` as the authoritative check.

### 5.1 URL path

When the user types or pastes a URL into the Source URL field and commits:

1. The dialog reads the trimmed `src` value and the (optional) `alt`.
2. It calls the commit handler, which dispatches `insertImage(view, { src, alt })`
   via `useEditorEventCallback` (§7).
3. The command calls `assertValidImageAttrs({ src })`; if `src` is empty or not a
   string, it returns `false` without dispatching, and the dialog surfaces an
   inline error (`aria-live`, §9).

> **Minimal-v1 alternative.** If a full dialog is deferred, the URL path can be
> collected with `window.prompt('Image URL:')` (and a second prompt for alt),
> mirroring the base toolbar's link-URL prompt. The dialog proposed here is the
> recommended shape because alt text materially affects accessibility and a
> single `window.prompt` cannot collect both fields cleanly.

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

When `onImagePrompt` resolves to a non-null object, the toolbar dispatches
`insertImage` with that `src`/`alt`; when it resolves to `null`, the operation is
cancelled. When `onImagePrompt` is absent, the built-in `ImageInsertDialog` is
used.

### 5.2 Upload path

When the user selects a local file via the hidden `<input type="file">`, the file
must be turned into a URL before it can become `image.src`. Two resolution
strategies, selected by whether the host app supplies an upload callback:

```typescript
/**
 * Optional upload handler. Given a selected File, upload it (e.g. to object
 * storage) and resolve to its resulting URL. When omitted, the dialog falls
 * back to an object URL (local-only — see caveat below).
 */
export type OnImageUpload = (file: File) => Promise<string>;
```

| Strategy | When used | Produces | Survives serialization? |
|---|---|---|---|
| **`onImageUpload(file)`** | Host app supplies the callback | a real URL (`https://…`) returned by the host | **Yes** — the URL is durable. |
| **Object URL** (`URL.createObjectURL(file)`) | No `onImageUpload` supplied (default) | a `blob:` URL valid for the page lifetime | **No** — see caveat. |
| **Data URL** (`FileReader.readAsDataURL`) | not used by default; noted as an option | a `data:` URL embedding the file bytes | Yes, but bloats the document; subject to size limits. |

The dialog's default behaviour, when `onImageUpload` is absent, is
`URL.createObjectURL(file)`. This makes local-only editing work with zero host
integration, but with an important caveat:

> **Object-URL caveat.** A `blob:` URL is tied to the document/session that
> created it. It renders fine in the live editor, but it does **not** survive
> serialization: `node.toJSON()` stores the `blob:` string verbatim, and a
> reloaded or server-rendered document cannot resolve it. Object URLs are
> therefore appropriate only for ephemeral/local editing. Production deployments
> should supply `onImageUpload` to persist images. Revoking the object URL when
> the node is removed is tracked as an open question (§10).

The upload flow is asynchronous, so the dialog's commit handler must `await` the
URL resolution before dispatching; see §7.

## 6. The `insertImage` command

Lives in `pkg/prosemirror-editor/src/commands/insertImage.ts`.

### 6.1 Signature

```typescript
import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";

/** Attributes gathered from the dialog / prompt. `src` must be non-empty. */
export interface InsertImageAttrs {
  readonly src: string;
  readonly alt?: string | null;
}

/**
 * Validate that a figure may be inserted at the current selection.
 * Pure function of EditorState — plugs straight into useEditorStateSelector.
 */
export function canInsertFigure(state: EditorState): boolean;

/**
 * Insert a `figure > image` at the current selection and select the figure.
 *
 * Validates `src` via `assertValidImageAttrs`; builds the figure wrapping the
 * image; inserts it; sets a NodeSelection on the inserted figure.
 *
 * @returns `true` if a transaction was dispatched, `false` if `src` was invalid
 *          or insertion was not legal at the current selection.
 */
export function insertImage(
  view: EditorView,
  attrs: InsertImageAttrs,
): boolean;
```

### 6.2 Algorithm

1. **Validate `src`.** Wrap `assertValidImageAttrs({ src: attrs.src })` in a
   `try`/`catch`. On throw, return `false` without dispatching. (The assert
   also narrows `src` to `string` for the type system.)
2. **Re-check legality.** Run `canInsertFigure(view.state)` (§8.2). Because the
   source may have been resolved asynchronously, the selection may have moved
   since the button was clicked — this check must run against the **current**
   `view.state`, not a captured one. If it returns `false`, return `false`.
3. **Build the node tree.**
   - `image = schema.nodes.image.create({ src: attrs.src, alt: attrs.alt ?? null })`
     — the atom leaf carrying the rendered `src`/`alt`.
   - `figure = schema.nodes.figure.create(null, [image])` — the block wrapper;
     `null` applies the schema defaults for `id`/`number`/`title`/`src`/`alt`/
     `data` (figure-level `src`/`alt` are deliberately left `null`, §2.3).
4. **Insert.** `tr.replaceSelectionWith(figure)`. Like `insertTable`
   (`tables.md` §8.2), this places the block as a sibling, splitting the
   paragraph at the cursor when necessary; `canInsertFigure` already guarantees
   a valid slot in an ancestor.
5. **Select the figure.** Compute the figure's start position and set a
   `NodeSelection` on it, so the inserted image is visibly selected and the user
   can immediately delete or replace it. Position arithmetic and the robust
   fallback are documented in §6.3.
6. **Dispatch + focus.** `view.dispatch(tr); view.focus();`

### 6.3 Example implementation

```typescript
// pkg/prosemirror-editor/src/commands/insertImage.ts
import { NodeSelection, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  metanormaSchema,
  assertValidImageAttrs,
} from "@metanorma/prosemirror-schema";

export interface InsertImageAttrs {
  readonly src: string;
  readonly alt?: string | null;
}

/** True when a `figure` (a `block`) may be inserted at the current selection. */
export function canInsertFigure(state: EditorState): boolean {
  const figureType = state.schema.nodes["figure"];
  if (!figureType) return false;
  const { $from, $to } = state.selection;
  // For a block node, validity depends on the ancestor that holds blocks, not on
  // $from.parent (which is usually a paragraph allowing only inline content).
  // Walk up the resolution and ask each ancestor whether the figure can occupy a
  // child slot at the cursor index.
  if (!$from.sameParent($to)) return false; // v1: cursor / single-block only
  for (let d = $from.depth; d >= 0; d--) {
    const ancestor = $from.node(d);
    const index = $from.indexAfter(d);
    if (ancestor.canReplaceWith(index, index, figureType)) return true;
  }
  return false;
}

export function insertImage(
  view: EditorView,
  attrs: InsertImageAttrs,
): boolean {
  // 1. Validate src (asserts + narrows to string).
  try {
    assertValidImageAttrs({ src: attrs.src });
  } catch {
    return false;
  }

  const { state } = view;
  // 2. Re-check legality against the CURRENT state (selection may have moved).
  if (!canInsertFigure(state)) return false;

  // 3. Build figure > image.
  const schema = metanormaSchema;
  const imageType = schema.nodes["image"];
  const figureType = schema.nodes["figure"];
  if (!imageType || !figureType) return false;
  const image = imageType.create({ src: attrs.src, alt: attrs.alt ?? null });
  const figure = figureType.create(null, [image]);

  // 4. Insert.
  const tr = state.tr.replaceSelectionWith(figure);

  // 5. Select the inserted figure. replaceSelectionWith on a content-bearing
  //    block leaves the selection just past it; the figure starts at
  //    (selection.from - nodeSize).
  const figPos = tr.selection.from - figure.nodeSize;
  tr.setSelection(NodeSelection.create(tr.doc, figPos));

  // 6. Dispatch + focus.
  view.dispatch(tr);
  view.focus();
  return true;
}
```

> **Position arithmetic.** `figPos = tr.selection.from - figure.nodeSize` assumes
> `replaceSelectionWith` leaves the selection immediately after the inserted
> block, which holds for the common cursor-in-paragraph case. If the node lands
> adjacent to rather than replacing a block, recompute `figPos` by resolving
> `tr.doc.resolve(tr.selection.from)` and searching backward for the first node
> whose `type.name === "figure"`, then `NodeSelection.create(tr.doc, pos)`. As
> with `insertTable` (`tables.md` §8.3), prefer resolving over hard-coded offsets
> in production.

### 6.4 Why a `figure` wrapping the `image`

Because `image` is ungrouped and appears in no content expression except
`figure`'s, it cannot be placed directly into any block container. The command
therefore always emits the two-node `figure > image` subtree. The `image`
carries the rendered `src`/`alt`; the `figure` is the block the document model
(and the `FigureNodeView`) expects. This matches §2.1 and is the sole reason no
bare-`image` insertion path is offered.

## 7. The async dispatch pattern

URL entry is synchronous, but **upload is asynchronous**, and even URL entry via
the `onImagePrompt` hook returns a `Promise`. The dispatch must therefore happen
**after** the source resolves, against an editor state that may have changed
during the wait. Three rules make this safe:

1. **Capture no state; use the live `view`.** `useEditorEventCallback` always
   invokes its callback with the **current** `EditorView`. The callback must read
   `view.state` (not a state captured at click time) when it finally dispatches.
2. **Validate at dispatch time.** `insertImage` re-runs `canInsertFigure(view.state)`
   internally (§6.2 step 2). If the user moved the cursor during an upload,
   insertion either proceeds at the new site (if still legal) or silently no-ops
   (returning `false`). The dialog should treat a `false` return as a soft
   failure (close without inserting, or show a transient message).
3. **Handle a detached view.** The callback's `view` argument is
   `EditorView | null`; if the editor unmounted mid-upload (e.g. the dialog was
   dismissed and the component torn down), the callback must bail on `null`.

```tsx
// pkg/prosemirror-editor/src/ImageInsertDialog.tsx (commit handler)
const dispatchInsert = useEditorEventCallback(
  async (view: EditorView | null, src: string, alt: string | null) => {
    if (!view) return;                 // editor unmounted
    const ok = insertImage(view, { src, alt });
    // soft failure: selection moved to an illegal site, or src invalid
    if (!ok) return;
  },
);

async function onCommit(file: File | null, url: string, alt: string): Promise<void> {
  let src: string | null = null;
  if (file !== null) {
    src = onImageUpload ? await onImageUpload(file) : URL.createObjectURL(file);
  } else if (url.trim() !== "") {
    src = url.trim();
  }
  if (src === null) return;            // nothing to insert
  await dispatchInsert(src, alt.trim() === "" ? null : alt);
}
```

The stale-view concern is thus addressed by construction: the `EditorView`
reference is always current, and the transaction is built and dispatched from
`view.state` inside `insertImage` at the moment the resolved `src` is available.

## 8. Active / enabled detection

### 8.1 Active

```typescript
isActive: () => false;
```

Image insertion is **not a toggle** — there is no "active" state, and the button
is never rendered with `.mn-toolbar-btn--active`. (Selecting an existing figure
to **edit** its `src`/`alt` via the same dialog is a plausible future enhancement,
tracked in §10; v1 is insert-only.)

### 8.2 Enabled

The button is enabled when a `figure` may legally be inserted at the selection
(§6.3 `canInsertFigure`). Because `figure` is a `block`, this is true whenever an
ancestor of the cursor accepts block children — i.e. inside a `paragraph`,
`note`, `example`, `quote`, list item, or `table_cell`, but **not** inside an
atom node (`formula`, `floating_title`, `image`) or inside `sourcecode`
(`text*`-only).

`canInsertFigure` is a pure function of `EditorState`, so it plugs directly into
`useEditorStateSelector`, exactly like `canInsertTable` in `tables.md` §7.2.

Notes on the strict-tsconfig constraints in play:

- `state.schema.nodes["figure"]` returns `NodeType | undefined` under
  `noUncheckedIndexedAccess`; `canInsertFigure` guards with an explicit early
  `if (!figureType) return false;` before use, keeping the type system honest.
- `imageType.create({ src, alt })` passes `alt` as `string | null`; the schema
  default for `alt` is `null`, so omitting it would also be valid, but the
  command passes `alt ?? null` explicitly to avoid an `undefined` value
  (forbidden for object literals under `exactOptionalPropertyTypes`).

## 9. Accessibility

The `ImageInsertDialog` follows the WAI-ARIA **dialog** pattern.

### 9.1 Roles and labels

| Element | Role / attributes |
|---|---|
| Dialog root | `role="dialog"`, `aria-label="Insert image"`, `aria-modal="false"` (non-modal — `Escape`/outside-click dismiss it without trapping global focus). |
| Source URL input | `<label>` (or `aria-label="Image URL"`) associated via `htmlFor`/`id`; `type="url"`, `autocomplete="off"`. |
| File input | Visually hidden `<input type="file" accept="image/*">` with an associated `<label>`/button labelled "Choose file"; the chosen filename is announced. |
| Alt text input | `<label>` (or `aria-label="Alternative text"`) associated via `htmlFor`/`id`; `type="text"`. |
| Inline error region | `aria-live="polite"` so an "Image URL is required" / "Insertion point is no longer valid" message is announced. |
| Trigger button | `aria-haspopup="dialog"`, `aria-expanded={open}`, `aria-controls={dialogId}` when open. |

### 9.2 Keyboard operability

| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Move focus between the dialog controls (URL → file → alt → commit → cancel). |
| `Enter` | On the commit control: submit the dialog (resolve source, dispatch `insertImage`). Inside a text field: submit only when the field has a value, otherwise default form behaviour. |
| `Escape` | Cancel: close the dialog without inserting; discard any in-flight object URL. |
| Click outside the dialog | Cancel (same as `Escape`). |

### 9.3 Focus management

- When the dialog opens, focus moves to the Source URL input.
- On commit or cancel, focus returns to the "Insert image" trigger button.
- The dialog must not insert a full focus trap (it is `aria-modal="false"`); it
  relies on `Escape`/outside-click for dismissal.

## 10. Open questions / unknowns

Genuine design decisions left for the implementer / product owner:

1. **Bare `image` vs. always-wrapped `figure`.** The schema forces `image` to live
   inside a `figure`. This proposal always emits `figure > image`. Is there ever
   a need to insert an empty `figure` (no image) — e.g. a figure that holds only
   caption blocks? If so, add a second button (deferred, §4.1).
2. **`figure.src` / `figure.alt` duplication.** `figure` declares its own `src`
   `alt` (both default `null`, both unrendered by `figure.toDOM`). Should
   insertion also mirror `image.src`/`image.alt` onto the figure for consumers
   that read figure-level attrs, or is that a legacy artefact to ignore? Current
   proposal leaves them `null`.
3. **Object-URL lifecycle.** `URL.createObjectURL` should be paired with
   `URL.revokeObjectURL` when the node is removed, but ProseMirror gives no
   direct "node removed" hook. Options: a plugin watching transactions for
   deleted `image` nodes and revoking their `blob:` URLs; or accepting the leak
   for local-only sessions. Unresolved.
4. **`data:` URLs and size limits.** Embedding a file as a `data:` URL survives
   serialization but can produce very large documents (and some browsers cap
   `data:` URL length). Should the dialog offer data-URL embedding as a third,
   explicit strategy, or always prefer `onImageUpload`? Deferred.
5. **Drag-and-drop / paste of images onto the editor.** Dropping a file or
   pasting an image directly into the document (bypassing the dialog) is out of
   scope here but is the natural complement. It would reuse `insertImage` plus
   the same `onImageUpload`/object-URL resolution, wired through a
   `prosemirror-view` `handlePaste` / `handleDrop` editor prop. Tracked as
   future work.
6. **Alt-text requirements.** Should the dialog **require** alt text for a11y
   (with an explicit "decorative" checkbox that sets `alt=""`)? Current proposal
   makes alt optional. Needs an a11y policy decision.
7. **Reusing `ImageNodeView` / `FigureNodeView` for attribute editing.** The
   existing node views are display-only. Selecting an inserted figure and
   reopening the dialog to edit `src`/`alt` would dispatch an
   `attrs`-update transaction rather than a fresh insert. Should the same
   command module export an `updateImageAttrs` helper for this? v1 is insert-
   only; editing is deferred.
8. **`title` (caption) attribute.** `figure` carries a `title` attr (default
   `null`). Should the dialog also collect a caption/title at insertion time,
   analogous to the base toolbar's link prompt? Deferred.
9. **`id` assignment.** `figure` has `id` (default `null`). Should insertion
   assign a generated ID for cross-referencing, or leave it `null` for the
   document pipeline to fill? Current proposal leaves it `null`, matching
   `insertTable`.
10. **Placement relative to the current block.** As with tables, when the cursor
    is mid-paragraph `replaceSelectionWith` splits and inserts in place. Should
    there be an "insert after block" mode? Deferred (mirrors `tables.md` §9.2).

## 11. Export changes

`pkg/prosemirror-editor/src/index.ts` must add:

```typescript
export { insertImage, canInsertFigure } from "./commands/insertImage.js";
export type { InsertImageAttrs } from "./commands/insertImage.js";
export { InsertImageButton } from "./ImageInsertDialog.js";
export type { OnImageUpload, OnImagePrompt } from "./ImageInsertDialog.js";
```

`assertValidImageAttrs` is **already** re-exported from the editor package (from
`@metanorma/prosemirror-schema`), so no change is needed for the guard itself;
the command imports it directly from `@metanorma/prosemirror-schema` as the
source of truth.

## 12. CSS classes

The dialog introduces feature-specific classes under the existing `mn-toolbar`
prefix:

```
.mn-toolbar-image              /* wrapper: trigger button + dialog */
  .mn-toolbar-btn              /* the trigger (reuses base class) */
.mn-toolbar-dialog             /* absolutely-positioned dialog container */
  .mn-toolbar-dialog-field     /* a label + input row */
  .mn-toolbar-dialog-error     /* inline error text (aria-live) */
  .mn-toolbar-dialog-actions   /* commit / cancel button row */
```

Minimum required styling:

| Selector | Purpose |
|---|---|
| `.mn-toolbar-dialog` | `position: absolute; z-index: 10; background: var(--mn-surface, #fff); border: 1px solid var(--mn-border, #ccc); border-radius: 4px; padding: 0.5em; display: grid; gap: 0.4em; box-shadow: 0 2px 8px rgba(0,0,0,.15);` |
| `.mn-toolbar-dialog-field` | `display: grid; gap: 0.15em;` (label above input) |
| `.mn-toolbar-dialog-error` | `color: var(--mn-danger, #b00); font-size: 0.85em;` |
| `.mn-toolbar-dialog-actions` | `display: flex; gap: 0.25em; justify-content: flex-end;` |
| Dark mode | `.mn-toolbar-dialog` adapts via `@media (prefers-color-scheme: dark)` as in the base toolbar. |

The stylesheet is plain CSS imported as a side-effect in `ImageInsertDialog.tsx`,
matching the base toolbar's `toolbar.css` convention and `tables.md`'s
`table-picker.css`.

## 13. File-structure summary

```
pkg/prosemirror-editor/src/
  ImageInsertDialog.tsx        ← dialog + InsertImageButton component
  image-dialog.css             ← dialog styles (side-effect import)
  commands/
    insertImage.ts             ← insertImage command, canInsertFigure, InsertImageAttrs
  index.ts                     ← add exports (§11)
```

## 14. TypeScript constraints

The project tsconfig enforces `strict`, `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `module: node16`. All new
code must:

- Use `import type` for type-only imports (`EditorView`, `EditorState`,
  `Node`).
- Use `.js` extensions in relative imports (`"./commands/insertImage.js"`).
- Treat `schema.nodes["figure"]` / `schema.nodes["image"]` lookups as
  `NodeType | undefined` under `noUncheckedIndexedAccess` — guard or assert
  before use (`canInsertFigure` guards explicitly).
- Pass `null` (not `undefined`) for defaulted attrs in `NodeType.create`; pass
  `alt: attrs.alt ?? null` so no `undefined` reaches the attrs object
  (`exactOptionalPropertyTypes`).
- Export all types alongside their implementations (`InsertImageAttrs`,
  `OnImageUpload`, `OnImagePrompt`).
