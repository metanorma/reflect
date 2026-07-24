# Undo & redo

## 1. Purpose

This document is the detailed implementation proposal for **undo and redo
toolbar controls** — the last of the six feature areas that
`MetanormaToolbar.spec.md` §5.5 defers as "out of scope":

**Undo / redo** — handled by ProseMirror history plugin, not the schema.

The other five deferred areas (tables, images/figures, sections, reference
marks, definition lists) are all **schema-bound** operations: they insert or
toggle specific `NodeType` / `MarkType` objects from `metanormaSchema`.
Undo/redo is fundamentally different. It touches no schema construct at all —
it is a **plugin-wiring and keymap** concern. The base spec correctly excluded
it because there was nothing in the schema to specify. This document picks it
up by specifying how the `prosemirror-history` plugin is enabled, how the
keyboard shortcuts are bound, and how the two resulting buttons expose
themselves in `AdvancedMetanormaToolbar`.

This document does **not** rehash base-spec material: the integration model
(toolbar renders inside the `<ProseMirror>` context, no state props), the
`ToolbarButton` descriptor shape, the `useEditorStateSelector` /
`useEditorEventCallback` plumbing, CSS conventions, and the accessibility
baseline are all defined in `MetanormaToolbar.spec.md` (§3, §5, §7, §8, §9) and
the directory `README.md`, and are assumed here. What follows is specific to
undo/redo and the new `history` toolbar group it introduces into
`AdvancedMetanormaToolbar`.

## 2. Package and export

| Aspect | Value |
|---|---|
| Command module | `pkg/editor-commands/commands/history.ts` (`@metanorma/editor-commands`) |
| Toolbar component | `pkg/prosemirror-editor/AdvancedMetanormaToolbar.tsx` |
| Plugin wiring | `pkg/prosemirror-editor/state.ts` (`createInitialEditorState`) |
| Button adapters / keymap | `pkg/prosemirror-editor/` |
| Commands re-exported from | `@metanorma/editor-commands` (package barrel `pkg/editor-commands/index.ts`) |
| Editor re-exports | `pkg/prosemirror-editor/index.ts` |
| New toolbar group | `'history'` |
| New runtime deps | `prosemirror-history`, `prosemirror-keymap` |

Rationale, as in the base spec and sibling documents: the **pure command logic**
lives in the framework-agnostic `@metanorma/editor-commands` package (it consumes
only `EditorState`/`Transaction`, never React or the DOM — see
`EditorCommands.spec.md` §1.5/§1.8). The **editor-bound** concerns — the
`history()` plugin, the `buildUndoRedoKeymap()` keymap, and the toolbar button
adapters that touch `EditorView`/`view.focus()` — live in
`@metanorma/prosemirror-editor`, per §1.13 (plugins and keymaps are intentionally
separate from command logic). This split matches the sibling feature docs and
keeps the command seam DOM-free and headless-testable.

## 3. Technical background

Undo and redo in ProseMirror are provided by the **`prosemirror-history`**
package, not by the schema or the core state module. The relevant exports are:

| Export | Kind | Purpose |
|---|---|---|
| `history` | plugin factory | `history(opts?: HistoryOptions): Plugin` — the plugin that records applied transactions so they can be reversed/reapplied. Must be added to the editor's plugin list; it is **not** implied by the schema. |
| `undo` | command | `(state, dispatch?) => boolean` — reverts the most recent history group. |
| `redo` | command | `(state, dispatch?) => boolean` — re-applies the most recently undone group. |
| `undoDepth` | selector | `(state) => number` — how many groups are available to undo. `0` means nothing to undo. |
| `redoDepth` | selector | `(state) => number` — how many groups are available to redo. `0` means nothing to redo. |
| `HistoryOptions` | type | `{ newGroupDelay?: number; preserveItems?: boolean }` — configures group boundaries and whether unreachable branches are kept. |

Two facts drive the whole design:

1. **The history plugin must be explicitly added.** Today
   `createInitialEditorState` (in `pkg/prosemirror-editor/state.ts`) builds
   the plugin list as `[reactKeys(), ...(opts.plugins ?? [])]`. History is not
   present, so `undo`/`redo` are no-ops and `undoDepth`/`redoDepth` are always
   `0`. Enabling undo/redo is therefore primarily a change to that plugin list.

2. **`prosemirror-history` does not bind keyboard shortcuts.** The `undo` /
   `redo` commands are just functions; nothing wires them to keys. A separate
   **`prosemirror-keymap`** plugin must be added to translate `Mod-z` /
   `Shift-Mod-z` / `Mod-y` into `undo` / `redo` calls. Without the keymap,
   only the toolbar buttons (added by this document) would trigger undo/redo.

`undoDepth` and `redoDepth` are the canonical way to know whether undo/redo
*can* fire, and are the basis for the buttons' `isEnabled` state (§5).

## 4. Plugin wiring

### 4.1 Enable `history()` as an opt-in

History is **not** added to the default plugin list. The existing
`createInitialEditorState` (in `pkg/prosemirror-editor/state.ts`) builds
the plugin list as `[reactKeys(), ...(opts.plugins ?? [])]` and remains
unchanged by default. This avoids a surprising behaviour change for existing
consumers (who would silently gain an undo stack and new keyboard bindings).

Consumers who want undo/redo opt in by passing the history plugin and keymap
through the existing `plugins` option, or by setting the new `history` option
on `createInitialEditorState`:

```typescript
import { EditorState, type Plugin } from "prosemirror-state";
import { reactKeys } from "@handlewithcare/react-prosemirror";
import { keymap } from "prosemirror-keymap";
import {
  history,
  undo,
  redo,
  type HistoryOptions,
} from "@metanorma/editor-commands";
import { metanormaSchema } from "@metanorma/prosemirror-schema";
import type { MirrorDocument } from "./types.js";

/**
 * Default history configuration. `newGroupDelay` of 500ms — the conventional
 * ProseMirror default (`prosemirror-example-setup`), retained because it is
 * well-tested and familiar. It primarily affects character-level typing
 * (rapid keystrokes collapse into one undo step); structural commands (section
 * promote/demote, insert, change-type) are each a single transaction and
 * therefore already one undo step regardless of the delay. `preserveItems`
 * left at its default (`false`) — no feature currently depends on unreachable
 * branches.
 *
 * Host apps may override the value by passing a custom `HistoryOptions` to
 * `createInitialEditorState({ history: { newGroupDelay: … } })`.
 */
export const DEFAULT_HISTORY_OPTIONS: Readonly<HistoryOptions> = {
  newGroupDelay: 500,
};
```

/**
 * Build the undo/redo keymap plugin. `Mod` resolves to Cmd on macOS and Ctrl
 * elsewhere. Both `Shift-Mod-z` (macOS convention) and `Mod-y`
 * (Windows/Linux convention) map to redo so the binding is cross-platform.
 *
 * This keymap lives in `prosemirror-editor` (per EditorCommands §1.13), not in
 * the commands package: it imports the `undo`/`redo` commands from
 * `@metanorma/editor-commands` and binds them to physical keys.
 */
export function buildUndoRedoKeymap(): Plugin {
  return keymap({
    "Mod-z": undo,
    "Shift-Mod-z": redo,
    "Mod-y": redo,
  });
}

export function createInitialEditorState(opts: {
  doc?: MirrorDocument;
  plugins?: readonly Plugin[];
  editable?: boolean;
  /**
   * History plugin configuration. Opt-in — history is NOT added by default.
   * - `undefined` / `false` (default): history is NOT added.
   * - `HistoryOptions`: history enabled with the supplied config, plus the
   *   undo/redo keymap.
   */
  history?: HistoryOptions | false;
}): EditorState {
  const basePlugins: Plugin[] = [reactKeys()];

  if (opts.history) {
    basePlugins.push(history(opts.history));
    basePlugins.push(buildUndoRedoKeymap());
  }

  return EditorState.create({
    schema: metanormaSchema,
    doc: metanormaSchema.nodeFromJSON(opts.doc ?? DEFAULT_MIRROR_DOC),
    plugins: [...basePlugins, ...(opts.plugins ?? [])],
  });
}
```

When enabled, `history()` always precedes consumer-supplied `plugins`, so a
consumer can still append its own keymap (e.g. higher-priority bindings) or a
second history-aware plugin. `reactKeys()` remains first, unchanged, preserving
the existing ordering invariant.

**How consumers enable undo/redo:** pass `history: DEFAULT_HISTORY_OPTIONS`
(or a custom `HistoryOptions`) to `createInitialEditorState`. For
controlled-mode consumers that build their own `EditorState`, import
`history`, `undo`, `redo`, and `buildUndoRedoKeymap` from
`@metanorma/editor-commands` / `@metanorma/prosemirror-editor` and add them
to the plugin list manually.

**Collaborative editing: do NOT enable plain `history`.** Plain
`prosemirror-history` tracks undo branches by local transaction sequence and
does not account for remote transactions arriving between local ones, so Undo
can produce surprising results in a collaborative editing context. Consumers
using a collaboration framework (e.g. `prosemirror-collab`, y-prosemirror)
should leave `history` `false` (or omit it) and use the collaboration
framework's own undo mechanism (e.g. y-prosemirror's `UndoManager`) instead.
The toolbar buttons would then dispatch to that mechanism rather than the
`undo`/`redo` re-exported here. No collab-specific code is shipped with this
feature; the `history: false` opt-out (the default) is the intended collab
path.

**Ordering note:** the keymap is appended immediately after `history()` and
before consumer plugins. If a consumer needs to override `Mod-z`, they can
prepend a higher-priority keymap via the `plugins` option, since
`prosemirror-keymap` evaluates plugins in reverse order.

### 4.2 Keyboard shortcut coverage

The keymap in §4.1 binds:

| Shortcut | Command | Platforms |
|---|---|---|
| `Mod-z` (Ctrl+Z / Cmd+Z) | `undo` | All |
| `Shift-Mod-z` (Ctrl+Shift+Z / Cmd+Shift+Z) | `redo` | All (macOS primary) |
| `Mod-y` (Ctrl+Y) | `redo` | Windows/Linux primary |

Binding both `Shift-Mod-z` and `Mod-y` to `redo` makes the editor feel native
on every platform without runtime platform detection. This mirrors what
`prosemirror-example-setup`'s `buildKeymap` does and is the conventional
ProseMirror setup. `Mod-y` is the standard redo shortcut on Windows/Linux and a
harmless redundant binding on macOS (recognised as redo by many apps); keeping
it on all platforms avoids the need for platform detection. The keymap is
scoped to the editor's focused `contenteditable`, so it does not interfere with
host-level `Mod-y` bindings outside the editor (e.g. terminal "replay" or media
shortcuts).

### 4.3 Exposing history opt-out on `MetanormaProseMirror`

`MetanormaProseMirror` (in `pkg/prosemirror-editor/MetanormaProseMirror.tsx`)
threads its `plugins` / `defaultDoc` options into `createInitialEditorState`
only in the **uncontrolled** branch. To make the new `history` option
reachable from the component surface, add a corresponding prop and forward it
(also uncontrolled-only — in controlled mode the host owns the state, so the
plugin list is the host's responsibility):

```typescript
export interface MetanormaProseMirrorProps {
  // ...existing props...

  /**
   * History configuration forwarded to createInitialEditorState (uncontrolled
   * mode only). `undefined` / `false` (default): history is NOT added.
   * A `HistoryOptions` value enables history with the supplied config.
   * In controlled mode this is ignored — the host controls the plugin list.
   */
  readonly history?: HistoryOptions | false;
}
```

```typescript
const initialUncontrolledState = useMemo<EditorState>(() => {
  if (defaultState !== undefined) {
    return defaultState;
  }
  const opts: {
    doc?: MirrorDocument;
    plugins?: readonly Plugin[];
    history?: HistoryOptions | false;
  } = {};
  if (defaultDoc !== undefined) opts.doc = defaultDoc;
  if (plugins !== undefined) opts.plugins = plugins;
  if (history !== undefined) opts.history = history; // exactOptionalPropertyTypes-safe
  return createInitialEditorState(opts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

In **controlled** mode the component cannot inject a plugin into the
externally-owned `EditorState`, but the host does not need to depend on
`prosemirror-history` directly: everything required to add history to an
externally-owned state is exported from `@metanorma/prosemirror-editor` — the
`history` plugin factory + `HistoryOptions` type (§7), plus
`DEFAULT_HISTORY_OPTIONS` and `buildUndoRedoKeymap` (§11.2). A controlled
consumer composes its plugin list as e.g.
`[…itsPlugins, history(DEFAULT_HISTORY_OPTIONS), buildUndoRedoKeymap()]`. A
separate `buildDefaultPlugins()` helper is deliberately **not** added: it would
be redundant with `createInitialEditorState`, which already builds the full
default plugin list and accepts `history`. A controlled consumer that wants the
defaults can call `createInitialEditorState({ history: DEFAULT_HISTORY_OPTIONS })`
and read `.plugins` off the result.

## 5. Buttons

Undo and redo are added as a new `history` group in
`AdvancedMetanormaToolbar`. Unlike every other group, these buttons are **not
toggles** and are **not selection-sensitive**: `isActive` is always `false`,
and `isEnabled` depends only on the history depth, not on what is selected.

| Button | Label | Title | Command | `isActive` | `isEnabled` |
|---|---|---|---|---|---|
| Undo | ↶ | "Undo (Ctrl+Z)" | `undo` | always `false` | `undoDepth(state) > 0` |
| Redo | ↷ | "Redo (Ctrl+Shift+Z)" | `redo` | always `false` | `redoDepth(state) > 0` |

The labels use the conventional arrow glyphs (`↶` / `↷`) so the group reads
left-to-right as undo-then-redo, matching desktop editors. The `title`
attribute doubles as the tooltip and includes the primary shortcut for
discoverability (§7).

Because `isActive` is constant, the buttons never receive the
`mn-toolbar-btn--active` modifier. They receive `mn-toolbar-btn--disabled`
exactly when `isEnabled` is `false`, i.e. when the relevant depth is `0`.

### 5.1 `run` dispatch

Both buttons dispatch through the standard command signature
`(state, dispatch)`. The `ToolbarButton.run` receives the `EditorView`, so the
adapters pass `view.state` and `view.dispatch`. The commands themselves are pure
and view-free; the `EditorView` appears **only** in this adapter, which lives in
`prosemirror-editor`:

```typescript
import type { EditorView } from "prosemirror-view";
import { undo, redo, undoDepth, redoDepth } from "@metanorma/editor-commands";

export const undoButton = {
  key: "undo",
  label: "↶",
  title: "Undo (Ctrl+Z)",
  isActive: () => false,
  isEnabled: (state) => undoDepth(state) > 0,
  run: (view) => {
    undo(view.state, view.dispatch);
    view.focus();
  },
} satisfies ToolbarButton;

export const redoButton = {
  key: "redo",
  label: "↷",
  title: "Redo (Ctrl+Shift+Z)",
  isActive: () => false,
  isEnabled: (state) => redoDepth(state) > 0,
  run: (view) => {
    redo(view.state, view.dispatch);
    view.focus();
  },
} satisfies ToolbarButton;
```

`view.focus()` is called after dispatch so that clicking a toolbar button
returns focus to the editor (a click on the button blurs it). This matches the
behaviour expected of every toolbar button and keeps subsequent keystrokes
flowing into the editor.

**Note on `view.dispatch` and `noUncheckedIndexedAccess`:** none of the
prosemirror-history APIs return array-indexed values to the toolbar layer, so
no additional null-checking is required here. `undo`/`redo` return a
`boolean` (whether anything happened) which the button ignores — a disabled
button cannot be clicked, and the keymap ignores the return value.

## 6. Active and enabled detection

Enabled detection is the only state the buttons subscribe to, and it uses
`undoDepth` / `redoDepth` directly. Following the base-spec pattern (base §7),
each button subscribes with its own `useEditorStateSelector` that returns a
primitive `boolean`, so a re-render is triggered only when the depth crosses
the `0` boundary:

```typescript
import { undoDepth, redoDepth } from "@metanorma/editor-commands";
import { useEditorStateSelector } from "@handlewithcare/react-prosemirror";

// Inside the Undo button component:
const canUndo = useEditorStateSelector((state) => undoDepth(state) > 0);

// Inside the Redo button component:
const canRedo = useEditorStateSelector((state) => redoDepth(state) > 0);
```

There is no `isActive` subscription: undo/redo are not toggles, so no
`useEditorStateSelector` call is needed for active state. This makes the
history group the cheapest group in the toolbar to subscribe to.

| Button | Subscribed selector | Re-renders when |
|---|---|---|
| Undo | `(state) => undoDepth(state) > 0` | depth crosses 0 ↔ positive |
| Redo | `(state) => redoDepth(state) > 0` | depth crosses 0 ↔ positive |

Click handling uses `useEditorEventCallback` to obtain the `EditorView`, then
calls the command and restores focus:

```typescript
import { useEditorEventCallback } from "@handlewithcare/react-prosemirror";
import { undo } from "@metanorma/editor-commands";

const handleUndo = useEditorEventCallback((view) => {
  undo(view.state, view.dispatch);
  view.focus();
});
```

## 7. Command re-exports

`prosemirror-history`'s `undo` / `redo` are already plain ProseMirror commands of
the canonical `(state, dispatch?) => boolean` shape. Per `EditorCommands.spec.md`
§1.10.3, an upstream command reused **unchanged** is re-exported under its
**standard name** rather than wrapped in a thin function. The editor-commands
package therefore simply re-exports `undo`/`redo` (and the `undoDepth`/
`redoDepth` selectors and the `history` plugin factory + `HistoryOptions` type
that the rest of this document consumes):

```typescript
// pkg/editor-commands/commands/history.ts
/**
 * Undo/redo are re-exported unchanged from prosemirror-history under their
 * standard names (EditorCommands §1.10.3). They already conform to the Command
 * contract (§1.5): pure, query/dispatch parity, non-throwing, and view-free.
 */
export {
  undo,
  redo,
  undoDepth,
  redoDepth,
  history,
} from "prosemirror-history";
export type { HistoryOptions } from "prosemirror-history";
```

`undo`/`redo` conform to the Command contract (README §6.2;
`EditorCommands.spec.md` §1.5) and are re-exported unchanged under their
standard names (§1.10.3).

The package barrel `pkg/editor-commands/index.ts` re-exports these in turn:

```typescript
// pkg/editor-commands/index.ts
export { undo, redo, undoDepth, redoDepth, history } from "./commands/history.js";
export type { HistoryOptions } from "./commands/history.js";
```

### 7.1 Transaction grouping — keep minimal

`prosemirror-history` groups transactions into undoable units using two
mechanisms: `newGroupDelay` (a time window, configured in §4.1) and explicit
`addToHistory` meta (`tr.setMeta("addToHistory", false)`). The recommendation
for the first implementation is to **rely solely on `newGroupDelay`** and do no
manual grouping. Specifically:

- Do **not** set `addToHistory: false` on any toolbar transaction. Every
  toolbar operation (mark toggle, list insert, table insert, etc.) should be
  undoable as a single step, which is the default.
- Do **not** manually force a new group before/after toolbar commands. The
  `newGroupDelay: 500` window already separates a click (a discrete action)
  from surrounding typing.

The one place grouping *might* matter is multi-step toolbar operations that
dispatch several transactions (e.g. the reference-marks footnote flow, which
inserts a `footnote_entry` and applies a mark). If those are dispatched as
separate transactions within the same `newGroupDelay` window they collapse
into one undo step already — which is the desired behaviour. No special
handling is required unless a feature explicitly wants its sub-steps to be
separately undoable, in which case it should set
`tr.setMeta("addToHistory", false)` on intermediate steps (the actual
prosemirror-history meta key is `"addToHistory"`). That is deferred to the
relevant feature doc; this document takes no position beyond "default grouping
is fine".

**Async-prompted transactions start a new group — and that is correct.** Some
sibling features (e.g. reference marks) collect attributes via an async dialog
before dispatching. Because the dialog takes longer than `newGroupDelay`
(500ms), the resulting transaction naturally starts a **new undo group**.
This is the desired behaviour: a command triggered via a dialog after a pause
is a discrete user action, not a continuation of prior typing. Force-grouping
it with the preceding edit would make Undo revert both the just-inserted node
*and* unrelated earlier text — surprising. No force-grouping is applied; the
default `newGroupDelay` behaviour is accepted.

## 8. Styling

Undo/redo are two plain buttons — there is no popover, picker, or custom
surface, so **no new stylesheet** is introduced. They reuse the base
`mn-toolbar` classes verbatim (base §8, README §2.4):

```
.mn-toolbar
  .mn-toolbar-group            /* the new 'history' group */
    .mn-toolbar-btn            /* undo / redo */
    .mn-toolbar-btn--disabled  /* applied when depth is 0 */
```

The only styling requirement specific to this group is visual: because undo
and redo are arrow glyphs rather than letters, ensure the buttons have a
consistent `min-width` (already provided by base `.mn-toolbar-btn`) so the
arrows centre correctly. No new CSS rules are needed.

The group should render at the **end** of the toolbar (rightmost, after all
schema-bound groups), matching the convention in desktop editors where
undo/redo sit apart from content operations. It is separated from the previous
group by the standard `.mn-toolbar-divider`.

## 9. Accessibility

Feature-specific accessibility additions beyond the baseline (README §2.5 /
`MetanormaToolbar.spec.md` §9):

- **`isActive` is constant.** Undo/redo are momentary actions, not toggles, so
  `aria-pressed` does not apply (unlike the mark/block buttons) and the
  `mn-toolbar-btn--active` modifier is never applied. An explicit `aria-label`
  (`"Undo"` / `"Redo"`) is recommended in addition to `title`, since the glyph
  label is not self-describing.
- **Depth-based disabled state.** `disabled` (and `mn-toolbar-btn--disabled`)
  is set whenever `isEnabled` is `false` (`undoDepth === 0` /
  `redoDepth === 0`), so the buttons are correctly removed from the tab order
  and announced as unavailable when there is nothing to undo/redo.
- **Keyboard access is primarily via the keymap** (§4.2), not the buttons: a
  user never needs to tab to the toolbar to undo. The buttons are nonetheless
  fully operable via `Enter` / `Space` (native `<button>` semantics).

## 10. Open questions / unknowns

Genuine unknowns to resolve before/while implementing:

(none remain — all questions resolved.)

## 11. Export and package changes

The consolidated `index.ts` export listing for both packages lives in
README §5.6; this section records only the **undo-redo-specific** additions
not captured there.

### 11.1 Runtime dependencies

`prosemirror-history` is consumed by `@metanorma/editor-commands` (which
re-exports `undo`/`redo`/`undoDepth`/`redoDepth`/`history`), and
`prosemirror-keymap` is consumed by `@metanorma/prosemirror-editor` (for
`buildUndoRedoKeymap`). Add the dependency where the runtime import lives:

```jsonc
// pkg/editor-commands/package.json — deps
{
  "dependencies": {
    // ...existing...
    "prosemirror-history": "^1.4.1"
  }
}
// pkg/prosemirror-editor/package.json — deps
{
  "dependencies": {
    // ...existing...
    "@metanorma/editor-commands": "workspace:^",
    "prosemirror-keymap": "^1.2.2"
  }
}
```

Exact versions to be pinned to whatever the workspace resolves; the ranges
above are the current `prosemirror-*` 1.x line compatible with the existing
`prosemirror-state@^1.4.4` / `prosemirror-view@1.42.0`.

The editor package no longer needs a direct `prosemirror-history` dependency
for the commands/keymap path — it reaches `undo`/`redo` through
`@metanorma/editor-commands`. It still imports the `history` plugin factory
and `HistoryOptions` in `state.ts`; those are re-exported through
`@metanorma/editor-commands`, so `prosemirror-editor` can import everything
from the one workspace package.

### 11.2 Undo-redo-specific exports

Beyond the re-exported `undo`/`redo`/`undoDepth`/`redoDepth`/`history`/
`HistoryOptions` (README §5.6), the editor package surface gains three
**undo-redo-specific** symbols that have no analogue in the other features:

```typescript
// pkg/prosemirror-editor/index.ts — feature-specific additions only
export { buildUndoRedoKeymap, DEFAULT_HISTORY_OPTIONS } from "./state.js";
export type { HistoryOptions } from "@metanorma/editor-commands";
```

- **`buildUndoRedoKeymap`** and **`DEFAULT_HISTORY_OPTIONS`** originate in
  `pkg/prosemirror-editor/state.ts` (editor-bound, per EditorCommands §1.13)
  and are re-exported from the editor barrel so that controlled-mode consumers
  can compose
  `[…itsPlugins, history(DEFAULT_HISTORY_OPTIONS), buildUndoRedoKeymap()]`
  without a direct `prosemirror-history`/`prosemirror-keymap` dependency.
- **`HistoryOptions`** is re-exported from the editor barrel (sourced from
  `@metanorma/editor-commands`) so hosts can type the `history` option without
  importing `prosemirror-history` directly.

The `createInitialEditorState` signature change (new `history?: HistoryOptions
| false` option) is additive and backwards-compatible; the existing
`CreateInitialEditorStateOptions` type alias exported from `index.ts` should be
extended to mirror it:

```typescript
export type CreateInitialEditorStateOptions = {
  doc?: import("./types.js").MirrorDocument;
  plugins?: readonly Plugin[];
  editable?: boolean;
  history?: import("prosemirror-history").HistoryOptions | false; // ← new
};
```

### 11.3 New toolbar group

`AdvancedMetanormaToolbar.tsx` extends `ToolbarGroup` to add `'history'`:

```typescript
export type ToolbarGroup =
  | "marks"
  | "blocks"
  | "lists"
  | "link"
  | "refs"
  | "history"; // ← undo / redo (this document)
```

## 12. File structure summary

See the consolidated file-structure summary in README §5.5. This feature adds
no feature-specific structure notes.

## 13. TypeScript constraints

All new code follows the project `tsconfig` (`strict`,
`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`,
`module: node16`):

- `.js` extensions on all **relative** imports (`./state.js`,
  `./commands/history.js` within a package). Cross-package imports use the
  bare specifier (`@metanorma/editor-commands`), which Node16 resolves via the
  workspace; the `.js`-extension rule applies only to relative paths.
- `undo`/`redo`/`undoDepth`/`redoDepth`/`history` are runtime values and use
  plain `import`; `HistoryOptions` is a type and uses `import type`. The
  command symbols are imported from `@metanorma/editor-commands` (their
  canonical home), not directly from `prosemirror-history`, in both
  `state.ts` and the toolbar layer.
- The new `history?` option uses `?` syntax with the union
  `HistoryOptions | false`; it is never assigned an explicit `undefined`.
  Where it is threaded through `MetanormaProseMirror`'s `useMemo` builder, the
  `if (history !== undefined) opts.history = history;` guard keeps it
  `exactOptionalPropertyTypes`-clean.
- `HistoryOptions` fields (`newGroupDelay`, `preserveItems`) are themselves
  optional numbers/booleans; `DEFAULT_HISTORY_OPTIONS` is declared
  `Readonly<HistoryOptions>` and constructed without `undefined` keys.
- `undo`/`redo`/`undoDepth`/`redoDepth` have non-array return types
  (`boolean` / `number`), so `noUncheckedIndexedAccess` adds no extra null
  checks at the toolbar layer.
- All exported types (`HistoryOptions`, extended
  `CreateInitialEditorStateOptions`, extended `ToolbarGroup`) are exported
  alongside their values.
