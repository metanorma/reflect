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
that validates the resolved `src` **non-throwingly**, materialises the
`figure > image` subtree, and selects it. Per the `@metanorma/editor-commands`
Command contract (`EditorCommands.spec.md` §1.5), the command is split cleanly
from the UI: the **pure command** (no `EditorView`/DOM, non-throwing, synchronous)
lives in `@metanorma/editor-commands`; the **button + dialog adapter**
(`EditorView`, async upload/URL resolution, focus) live in
`@metanorma/prosemirror-editor`.

It deliberately does **not** re-specify anything from the base toolbar (marks,
blocks, lists, links, the `ToolbarButton` descriptor, the `mn-toolbar` styling
conventions, or the integration model). Those are assumed. Only image/figure-
specific additions are defined here.

## 2. Scope and schema recap

Both media nodes come from `@metanorma/prosemirror-schema` (`metanormaSchema`,
defined in `pkg/prosemirror-schema/src/nodes.ts` §8.6). The relevant fragment:

| Node | Content | Group | Atom | Draggable | Attrs |
|---|---|---|---|---|---|
| `figure` | `(image \| block)*` | `block` | no | — | `id`, `number`, `title`, `src` (all default `null`), plus `data` (default `{}`) |
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
   which throws when `src` is missing or empty. The pure `insertImage` command
   (§6) must enforce this requirement before creating the node — but it must do
   so **non-throwingly**: it validates `src` and returns `false` if invalid
   (EditorCommands §1.5(4)), never throwing out of the command. The throwing
   `assertValidImageAttrs` guard may be used internally, wrapped in a
   `try`/`catch` that converts the throw into a `false` return. This is exactly
   the concern the base spec's §5.5 anticipated.
3. **`figure` and `image` split attribute responsibility.** `figure` owns
   `title` (the caption) and retains `src`; it has **no `alt`**. `image` owns
   `alt` (the a11y text) and its own `src`; it has **no `title`**. There is
   therefore **no duplicated `alt`** to mirror or ignore — the two nodes carry
   disjoint caption/a11y attributes by design (§10 resolved decision). The
   rendered image attributes (`src`, `alt`) live on the `image` child; `figure`
   renders only `class="figure"` and `data-id`.

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
| Command-logic package | `@metanorma/editor-commands` |
| Command module | `pkg/editor-commands/src/commands/insertImage.ts` (pure command logic) |
| Editor package (consumer) | `@metanorma/prosemirror-editor` — re-exports `insertImage`/`canInsertFigure` (§11) |
| Dialog / adapter component | `pkg/prosemirror-editor/src/ImageInsertDialog.tsx` (`InsertImageButton` + dialog; owns `EditorView`, async, DOM) |
| Dialog styles | `pkg/prosemirror-editor/src/image-dialog.css` (imported side-effect) |
| Public barrel (editor) | `pkg/prosemirror-editor/src/index.ts` (re-exports — §11) |
| Public barrel (commands) | `pkg/editor-commands/src/index.ts` (command exports — §11) |
| Schema source | `@metanorma/prosemirror-schema` (`metanormaSchema`, `assertValidImageAttrs`) |

The split follows the `@metanorma/editor-commands` Command contract
(`EditorCommands.spec.md` §1.5): **pure command logic** — schema-coupled,
non-throwing, no `EditorView`, no DOM — lives in `@metanorma/editor-commands`.
The **toolbar adapter** (`InsertImageButton` + `ImageInsertDialog`) lives in
`@metanorma/prosemirror-editor`; it owns the React state, the `EditorView`,
and the async URL/upload resolution. The adapter resolves a `src` first, then
calls the synchronous pure command with the resolved `{ src, alt }`. Because
the source may need to be uploaded, the dialog's commit handler does not call
the command synchronously from `run`; see §7 for the async dispatch pattern.

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
complete `figure > image`. An image-less (caption-only) figure is **not needed**
for v1 and will not be added: the schema mandates `figure > image`, and the
single button always produces that.

> **The `title` (caption) attribute is not collected at insertion time.** The
> dialog collects only `src` and `alt`; `figure.title` is left `null` and can
> be edited later (e.g. via a node view or a future properties panel). Adding a
> caption field to the insert dialog was considered and deferred to keep the
> dialog lightweight.

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
validate the URL beyond non-emptiness; the pure `insertImage` command performs
the authoritative, **non-throwing** `src` validation (returns `false` if invalid
— §6.1, EditorCommands §1.5(4)).

### 5.1 URL path

When the user types or pastes a URL into the Source URL field and commits:

1. The dialog reads the trimmed `src` value and the (optional) `alt`.
2. It calls the commit handler, which resolves the source (synchronous here),
   then dispatches `insertImage(view.state, view.dispatch, { src, alt })` via
   `useEditorEventCallback` (§7). The `EditorView`/`dispatch` are held in the
   adapter, never in the pure command.
3. The pure command validates `src` non-throwingly (returns `false` without
   dispatching if `src` is empty/invalid — §6.1); on a `false` return the dialog
   surfaces an inline error (`aria-live`, §9).

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

When `onImagePrompt` resolves to a non-null object, the toolbar adapter
dispatches `insertImage(view.state, view.dispatch, { src, alt })` with that
`src`/`alt`; when it resolves to `null`, the operation is cancelled. When
`onImagePrompt` is absent, the built-in `ImageInsertDialog` is used. The
`Promise`/async concerns stay in the adapter; the pure command is synchronous.

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
> should supply `onImageUpload` to persist images.
>
> **Object-URL leak.** `createObjectURL` should ideally be paired with
> `revokeObjectURL` when the `image` node is removed, but ProseMirror gives no
> "node removed" hook. v1 **accepts the leak**: object URLs live until page
> unload. Note this can accumulate memory in a long-lived tab (e.g. a document
> kept open for hours with many inserted then deleted images). A future cleanup
> plugin — watching transactions for deleted `image` nodes whose `src` is a
> `blob:` URL and revoking them — could bound the leak; deferred.

The upload flow is asynchronous, so the dialog's commit handler must `await` the
URL resolution before dispatching; see §7.

## 6. The `insertImage` command

Lives in `pkg/editor-commands/src/commands/insertImage.ts` — the
`@metanorma/editor-commands` package. It conforms to the Command contract
(`EditorCommands.spec.md` §1.5): it is a pure `(state, dispatch?) => boolean`
function — **no `EditorView`, no DOM, non-throwing**. The `EditorView`, async
URL/upload resolution, and focus management concerns live only in the toolbar
adapter in `@metanorma/prosemirror-editor` (§4, §7). The command takes
**already-resolved** `{ src, alt }` and is synchronous.

### 6.1 Signature

```typescript
import type { EditorState, Transaction } from "prosemirror-state";
import type { Node } from "prosemirror-model";
// NOTE: NO import of EditorView — the pure command never touches a view or DOM.

/** Attributes gathered by the adapter (dialog / prompt). `src` must be non-empty. */
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
 * Conforms to the @metanorma/editor-commands Command contract
 * (EditorCommands.spec.md §1.5):
 *  - Query form: `insertImage(state)` (no `dispatch`) returns the SAME boolean
 *    as `canInsertFigure(state)` and mutates nothing.
 *  - Dispatch form: `insertImage(state, dispatch, attrs)` validates `src`
 *    NON-THROWINGLY (returns `false` if missing/empty — §1.5(4)), builds a
 *    `figure > image`, sets a valid NodeSelection, scrollIntoView(), dispatches
 *    exactly ONE transaction, returns `true`.
 *  - Returns `false` when not applicable, regardless of dispatch.
 *
 * @returns `true` iff a transaction was dispatched; `false` if `src` was
 *          invalid or insertion was not legal at the current selection.
 */
export function insertImage(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  attrs?: InsertImageAttrs,
): boolean;
```

> **Query/dispatch parity (EditorCommands §1.5(1)/(3)).** With `dispatch`
> omitted, `insertImage(state)` returns `true` exactly when
> `canInsertFigure(state)` returns `true`, and mutates nothing. The button's
> `isEnabled` rule (§8.2) is therefore `canInsertFigure(state)`, and
> `insertImage(state)` is its command-parity equivalent.

> **Factory form (EditorCommands §1.6.2).** Because the command resolves node
> types through `state.schema` (the `Schema` instance on the passed
> `EditorState`), it is already schema-parameterised: it works unchanged on a
> composed schema as long as that schema has `figure` and `image` node types.
> **Decision: no separate `(schema) => Command` factory is required** — the
> command binds nothing to the `metanormaSchema` singleton at module load. (If a
> future consumer needed to validate the schema shape at construction time, a
> factory could be added; it is not needed for the Metanorma schema.)

### 6.2 Algorithm

1. **Applicability check (always).** Run `canInsertFigure(state)`. If it returns
   `false`, return `false` — whether or not `dispatch` is supplied. This is the
   query form: `insertImage(state)` is equivalent to `canInsertFigure(state)`.
2. **No dispatch ⇒ pure predicate.** If `dispatch` is **not** supplied, return
   `true` here (applicability confirmed, nothing mutated). Steps 3–8 only run
   when `dispatch` **is** supplied.
3. **Validate `src` (non-throwing).** The throwing guard
   `assertValidImageAttrs({ src: attrs?.src })` is wrapped in a `try`/`catch`;
   on throw (or if `attrs`/`src` is missing/empty), return `false` without
   dispatching. This satisfies EditorCommands §1.5(4) (non-throwing): the
   command itself never throws on well-formed state. (An equivalent non-throwing
   inline check — `typeof src === "string" && src !== ""` — may be used instead;
   either way the command is non-throwing.) The assert also narrows `src` to
   `string` for the type system.
4. **Re-check legality against `state`.** Because the adapter may have resolved
   the source asynchronously, the selection may have moved since the button was
   clicked — this check runs against the **current** `state` passed in (the
   adapter passes the live `view.state`, §7). `canInsertFigure(state)` was
   already run in step 1; re-running is cheap and keeps the validation local.
   If `false`, return `false`.
5. **Build the node tree.** Resolve types through `state.schema` (NOT a captured
   schema singleton):
     - `image = state.schema.nodes.image.create({ src, alt: attrs.alt ?? null })`
       — the atom leaf carrying the rendered `src`/`alt`.
     - `figure = state.schema.nodes.figure.create({ id: generateId() }, [image])`
       — the block wrapper; the `figure` carries a **generated `id`** for
       cross-referencing. `number`/`title`/`src`/`data` default to their
       schema values (`figure` has no `alt` attribute — §2.3).
       `generateId()` is the shared helper from `@metanorma/editor-commands`
       (`util.ts`).
6. **Insert.** `tr = state.tr.replaceSelectionWith(figure)`.
7. **Select the figure.** Compute the figure's start position and set a valid
   `NodeSelection` on it, so the inserted image is visibly selected and the user
   can immediately delete or replace it. Position arithmetic and the robust
   fallback are documented in §6.3.
8. **Scroll into view + dispatch once.** `tr.scrollIntoView(); dispatch(tr);
   return true;` — exactly one transaction, dispatched exactly once. No
   `view.focus()` (that is the adapter's job, §7); no `EditorView` at all.

### 6.3 Example implementation

```typescript
// pkg/editor-commands/src/commands/insertImage.ts
// @metanorma/editor-commands — PURE command logic. No EditorView, no DOM.
import { NodeSelection, type EditorState, type Transaction } from "prosemirror-state";
import type { Node } from "prosemirror-model";
import { assertValidImageAttrs } from "@metanorma/prosemirror-schema";
import { generateId } from "../util.js";

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
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  attrs?: InsertImageAttrs,
): boolean {
  // 1. Applicability check (runs in BOTH query and dispatch forms).
  if (!canInsertFigure(state)) return false;

  // 2. Query form: no dispatch ⇒ pure predicate, mutate nothing.
  if (!dispatch) return true;

  // 3. Validate src NON-THROWINGLY (EditorCommands §1.5(4)). The throwing
  //    assertValidImageAttrs is wrapped so the command never throws on
  //    well-formed state; it returns false instead.
  let src: string;
  try {
    assertValidImageAttrs({ src: attrs?.src });
    src = attrs!.src; // narrowed by the assert above
  } catch {
    return false; // src missing / empty / wrong type — non-throwing failure
  }

  // 4. Build figure > image, resolving types through state.schema (not a
  //    captured singleton) — schema-parameterised by construction.
  const schema = state.schema;
  const imageType = schema.nodes["image"];
  const figureType = schema.nodes["figure"];
  if (!imageType || !figureType) return false;
  const image = imageType.create({ src, alt: attrs!.alt ?? null });
  // figure attrs: id is generated for cross-referencing (see §6.2 step 5);
  // number/title/src/data default to their schema values (null/{}).
  const figure = figureType.create({ id: generateId() }, [image]);

  // 5. Insert + select the figure. ONE transaction.
  const tr = state.tr.replaceSelectionWith(figure);

  // replaceSelectionWith on a content-bearing block leaves the selection just
  // past it; the figure starts at (selection.from - nodeSize).
  const figPos = tr.selection.from - figure.nodeSize;
  tr.setSelection(NodeSelection.create(tr.doc, figPos)); // valid NodeSelection

  // 6. scrollIntoView (user-initiated) + dispatch EXACTLY ONCE. No view.focus().
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}
```

> **Command contract compliance.** Note what is *absent*: no `EditorView`, no
> `view.dispatch`, no `view.focus()`, no DOM. The command imports only
> `EditorState`, `Transaction`, `Node` types (and the schema guard); it never
> imports `prosemirror-view`. It returns `false` on every failure path without
> throwing. The query form (`dispatch` omitted) is a pure applicability test
> returning the same boolean as `canInsertFigure`.

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

All async/`Promise`/`File` work is **UI-only** and lives in the toolbar adapter
(`ImageInsertDialog.tsx` in `@metanorma/prosemirror-editor`); the pure command
(§6) is synchronous. URL entry is synchronous, but **upload is asynchronous**,
and even URL entry via the `onImagePrompt` hook returns a `Promise`. The
**adapter** resolves the source to a `src` string first, then calls the
synchronous pure command with resolved `{ src, alt }`. The dispatch must
therefore happen **after** the source resolves, against an editor state that may
have changed during the wait. Three rules make this safe:

1. **Capture no state; use the live `view`.** `useEditorEventCallback` always
   invokes its callback with the **current** `EditorView`. The callback must read
   `view.state` (not a state captured at click time) when it finally dispatches.
   The adapter passes `view.state` and `view.dispatch` into the pure command.
2. **Validate at dispatch time.** `insertImage` re-runs `canInsertFigure(state)`
   internally against the passed `state` (§6.2 step 4). If the user moved the
   cursor during an upload, insertion either proceeds at the new site (if still
   legal) or silently no-ops (returning `false`). The dialog should treat a
   `false` return as a soft failure (close without inserting, or show a transient
   message).
3. **Handle a detached view + re-focus.** The callback's `view` argument is
   `EditorView | null`; if the editor unmounted mid-upload (e.g. the dialog was
   dismissed and the component torn down), the callback must bail on `null`. On a
   successful insert, the adapter calls `view.focus()` — the pure command never
   touches focus.

```tsx
// pkg/prosemirror-editor/src/ImageInsertDialog.tsx (commit handler)
// The ADAPTER owns EditorView, async, and DOM. The pure command owns none.
import { insertImage } from "@metanorma/editor-commands"; // re-exported through editor pkg

const dispatchInsert = useEditorEventCallback(
  async (view: EditorView | null, src: string, alt: string | null) => {
    if (!view) return;                 // editor unmounted
    // Synchronous pure command with resolved attrs; view.state/dispatch stay here.
    const ok = insertImage(view.state, view.dispatch, { src, alt });
    if (!ok) return;                   // soft failure: selection moved, or src invalid
    view.focus();                      // focus is the ADAPTER's concern, never the command's
  },
);

async function onCommit(file: File | null, url: string, alt: string): Promise<void> {
  // Async source resolution happens here in the UI layer, BEFORE the command.
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

The boundary is thus: the adapter resolves `src`/`alt` (async, `File`,
`URL.createObjectURL`, `onImageUpload`) and holds the `EditorView`; the pure
command takes already-resolved `{ src, alt }` plus `view.state`/`view.dispatch`
and performs the synchronous, non-throwing, schema-aware insert. The
`EditorView` reference is always current, and the transaction is built and
dispatched from the live `view.state` inside `insertImage` at the moment the
resolved `src` is available.

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

1. **`data:` URLs and size limits.** Embedding a file as a `data:` URL survives
   serialization but can produce very large documents (and some browsers cap
   `data:` URL length). Should the dialog offer data-URL embedding as a third,
   explicit strategy, or always prefer `onImageUpload`? Deferred.
2. **Alt-text requirements.** Should the dialog **require** alt text for a11y
   (with an explicit "decorative" checkbox that sets `alt=""`)? Current proposal
   makes alt optional. Needs an a11y policy decision.
3. **Placement relative to the current block.** As with tables, when the cursor
   is mid-paragraph `replaceSelectionWith` splits and inserts in place. Should
   there be an "insert after block" mode? Deferred (mirrors `tables.md` §9.2).

> **Resolved decisions.** `id` is **generated at insertion time** via the
> shared `generateId()` helper, for consistency with `insertTable` and section
> commands. (The alternative — leaving `id` `null` for a downstream pipeline —
> was rejected in favour of eager assignment.) The `title` (caption) attribute
> is **not collected at insertion time** — left `null`, editable later. 
> Drag-and-drop / paste of images directly into the document is out of scope
> for this proposal (future work, would reuse `insertImage` via
> `handlePaste`/`handleDrop`). Attribute editing of an existing figure via the
> node views is insert-only for v1; an `updateImageAttrs` helper is deferred.
> **Object-URL leak:** v1 accepts the leak (object URLs live until page unload);
> a cleanup plugin to revoke `blob:` URLs on node removal is deferred.
> **Bare `image` vs. always-wrapped `figure`:** no image-less figure is needed —
> the schema mandates `figure > image`, and v1 always emits exactly that; no
> second button.
> **`figure`/`image` attribute split (no duplication).** Attributes are divided
> by responsibility, with **no mirroring** between the two nodes: `figure` owns
> `title` (the caption) but **no `alt`**; `image` owns `alt` (the a11y text) but
> **no `title`**. `src` is left as-is (on both nodes, as declared in the schema).
> The duplicated `figure.alt` attribute has therefore been **removed from the
> schema** (`figure.src` is retained). Insertion sets `image.alt` and never
> touches a figure-level `alt`; there is no longer a "mirror or ignore?" choice.

## 11. Export changes

The pure command lives in `@metanorma/editor-commands` and is re-exported by the
editor package.

**`pkg/editor-commands/src/index.ts`** must add:

```typescript
export { insertImage, canInsertFigure } from "./commands/insertImage.js";
export type { InsertImageAttrs } from "./commands/insertImage.js";
```

**`pkg/prosemirror-editor/src/index.ts`** must add (re-export the command +
export the UI adapter):

```typescript
export { insertImage, canInsertFigure } from "@metanorma/editor-commands";
export type { InsertImageAttrs } from "@metanorma/editor-commands";
export { InsertImageButton } from "./ImageInsertDialog.js";
export type { OnImageUpload, OnImagePrompt } from "./ImageInsertDialog.js";
```

`assertValidImageAttrs` is **already** re-exported from the editor package (from
`@metanorma/prosemirror-schema`), so no change is needed for the guard itself;
the pure command imports it directly from `@metanorma/prosemirror-schema` as the
source of truth. The editor package (`@metanorma/prosemirror-editor`) must add
`@metanorma/editor-commands` as a `workspace:^` dependency so it can re-export
the command.

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
pkg/editor-commands/src/                 ← PURE command logic (no EditorView/DOM)
  commands/
    insertImage.ts                       ← insertImage command, canInsertFigure, InsertImageAttrs
  index.ts                               ← export insertImage, canInsertFigure, InsertImageAttrs (§11)

pkg/prosemirror-editor/src/              ← UI adapter layer (EditorView/async/DOM live here)
  ImageInsertDialog.tsx                  ← dialog + InsertImageButton component
  image-dialog.css                       ← dialog styles (side-effect import)
  index.ts                               ← re-export command from @metanorma/editor-commands; export UI (§11)
```

## 14. TypeScript constraints

The project tsconfig enforces `strict`, `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `module: node16`. All new
code must:

- Use `import type` for type-only imports (`EditorState`, `Transaction`, `Node`).
  The **pure command** imports `EditorState`/`Transaction`/`Node` but must
  **never** import `EditorView`/`prosemirror-view`; only the UI adapter in
  `prosemirror-editor` imports `EditorView`.
- Use `.js` extensions in relative imports (`"./commands/insertImage.js"`).
- Treat `schema.nodes["figure"]` / `schema.nodes["image"]` lookups as
  `NodeType | undefined` under `noUncheckedIndexedAccess` — guard or assert
  before use (`canInsertFigure` guards explicitly).
- Pass `null` (not `undefined`) for defaulted attrs in `NodeType.create`; pass
  `alt: attrs.alt ?? null` so no `undefined` reaches the attrs object
  (`exactOptionalPropertyTypes`).
- Export all types alongside their implementations (`InsertImageAttrs`,
  `OnImageUpload`, `OnImagePrompt`).
- **Command contract (EditorCommands §1.5):** the pure `insertImage` must be
  assignable to `Command` — `(state, dispatch?) => boolean`; it must never throw
  (wrap `assertValidImageAttrs` in `try`/`catch` → return `false`); and its
  query form (`dispatch` omitted) must return the same boolean as
  `canInsertFigure(state)`.
