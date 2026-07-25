/**
 * `history` group — undo / redo buttons (undo-redo.md §5).
 *
 * Two plain buttons (not toggles, not selection-sensitive): `isActive` is
 * always `false`; `isEnabled` depends only on the history depth. The `run`
 * adapter delegates to the pure `undo`/`redo` commands and re-focuses.
 */

import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";

import { undo, redo, undoDepth, redoDepth } from "@metanorma/editor-commands";

import type { ToolbarGroupDef } from "../types.js";

/** The `history` group definition (static — no external props). */
export const historyGroup: ToolbarGroupDef = {
  id: "history",
  label: "Undo / redo",
  entries: [
    {
      kind: "button",
      descriptor: {
        key: "undo",
        label: "↶",
        title: "Undo (Ctrl+Z)",
        isActive: (_state: EditorState) => false,
        isEnabled: (state: EditorState) => undoDepth(state) > 0,
        run: (view: EditorView) => {
          undo(view.state, view.dispatch);
          view.focus();
        },
      },
    },
    {
      kind: "button",
      descriptor: {
        key: "redo",
        label: "↷",
        title: "Redo (Ctrl+Shift+Z)",
        isActive: (_state: EditorState) => false,
        isEnabled: (state: EditorState) => redoDepth(state) > 0,
        run: (view: EditorView) => {
          redo(view.state, view.dispatch);
          view.focus();
        },
      },
    },
  ],
};
