/**
 * EditorState bootstrap (§6.2).
 *
 * Owns the default document (schema.spec.md §15, reproduced verbatim) and the
 * `createInitialEditorState` factory that builds an `EditorState` bound to
 * `metanormaSchema` with `reactKeys()` always present as the first plugin.
 *
 * As of undo-redo.md, the factory also gains an opt-in `history` option that
 * adds the `prosemirror-history` plugin and the undo/redo keymap when enabled.
 */

import { EditorState, Plugin, PluginKey } from "prosemirror-state";
import { GapCursor } from "prosemirror-gapcursor";
import { reactKeys } from "@handlewithcare/react-prosemirror";
import { keymap } from "prosemirror-keymap";
import { gapCursor } from "prosemirror-gapcursor";
import { metanormaSchema } from "@metanorma/prosemirror-schema";
import { history, undo, redo, type HistoryOptions } from "@metanorma/editor-commands";
import type { MetanormaDocument } from "./types.js";

/**
 * The default document (schema.spec.md §15), inlined here. The schema package
 * does not export a default document; this module owns it.
 *
 * As of schema v5, `doc.content` requires a `bibdata` first child. The default
 * bibdata carries an empty `item` attr (`null`) — the user fills it via the
 * Sidebar metadata button or by clicking the bibdata strip.
 */
export const DEFAULT_MN_DOC: MetanormaDocument = {
  type: "doc",
  content: [
    {
      type: "bibdata",
      attrs: { item: null },
    },
    {
      type: "sections",
      content: [
        {
          type: "clause",
          attrs: { id: "_document_container" },
          content: [
            { type: "section_title" },
            { type: "paragraph" },
          ],
        },
      ],
    },
  ],
};

/**
 * Default history configuration (undo-redo.md §4.1). `newGroupDelay` of 500ms —
 * the conventional ProseMirror default (`prosemirror-example-setup`), retained
 * because it is well-tested and familiar. It primarily affects character-level
 * typing (rapid keystrokes collapse into one undo step); structural commands
 * are each a single transaction and therefore already one undo step regardless
 * of the delay.
 *
 * Host apps may override by passing a custom `HistoryOptions` to
 * `createInitialEditorState({ history: { newGroupDelay: … } })`.
 */
export const DEFAULT_HISTORY_OPTIONS: Readonly<HistoryOptions> = {
  newGroupDelay: 500,
};

/**
 * Build the undo/redo keymap plugin (undo-redo.md §4.1). `Mod` resolves to Cmd
 * on macOS and Ctrl elsewhere. Both `Shift-Mod-z` (macOS convention) and
 * `Mod-y` (Windows/Linux convention) map to redo so the binding is
 * cross-platform.
 *
 * This keymap lives in `@metanorma/prosemirror-editor` (per EditorCommands
 * §1.13), not in the commands package: it imports the `undo`/`redo` commands
 * from `@metanorma/editor-commands` and binds them to physical keys.
 */
export function buildUndoRedoKeymap(): Plugin {
  return keymap({
    "Mod-z": undo,
    "Shift-Mod-z": redo,
    "Mod-y": redo,
  });
}

/**
 * Build an `EditorState` bound to `metanormaSchema`.
 *
 * `reactKeys()` is always present as the first plugin (required by
 * `@handlewithcare/react-prosemirror` to give node-view components stable keys
 * across transactions). Consumer plugins are appended **after** `reactKeys()`
 * so they cannot accidentally displace it.
 *
 * The initial document is built with `metanormaSchema.nodeFromJSON(...)`,
 * falling back to {@link DEFAULT_MN_DOC} when no `doc` is supplied.
 *
 * History is **opt-in** (undo-redo.md §4.1): when `opts.history` is a
 * `HistoryOptions` value, the `history()` plugin and the undo/redo keymap are
 * added before consumer plugins; when omitted / `false`, no history is added.
 */
export function createInitialEditorState(opts: {
  doc?: MetanormaDocument;
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
  const basePlugins: Plugin[] = [reactKeys(), gapCursor()];

  // When the selection is a GapCursor, typing should not create content via
  // findWrapping (which would insert an unwanted section > paragraph). Block
  // text input and keypress at gap cursor positions — the user must use a
  // command (e.g. the Section popover) to insert content there.
  basePlugins.push(new Plugin({
    key: new PluginKey("gapCursorTextInputGuard"),
    props: {
      handleTextInput: (_view) => _view.state.selection instanceof GapCursor,
      handleKeyPress: (_view) => _view.state.selection instanceof GapCursor,
    },
  }));

  if (opts.history) {
    basePlugins.push(history(opts.history));
    basePlugins.push(buildUndoRedoKeymap());
  }

  return EditorState.create({
    schema: metanormaSchema,
    doc: metanormaSchema.nodeFromJSON(opts.doc ?? DEFAULT_MN_DOC),
    plugins: [...basePlugins, ...(opts.plugins ?? [])],
  });
}
