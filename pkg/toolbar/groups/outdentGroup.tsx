/**
 * `outdent` group — single outdent / decrease-level button (outdent.md §4).
 *
 * A plain action button (not a toggle): `isActive` is always `false`;
 * `isEnabled` is the query form of the `lift` command. The `run` adapter
 * delegates to the pure `lift` command (re-exported from editor-commands, per
 * the layering rule) and re-focuses.
 *
 * Complements the base `blocks` (quote/note/example wrap) and `lists` groups:
 * those increase nesting, this decreases it.
 */

import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";

import { lift } from "@metanorma/editor-commands";

import type { ToolbarGroupDef } from "../types.js";

/** The `outdent` group definition (static — no external props). */
export const outdentGroup: ToolbarGroupDef = {
  id: "outdent",
  label: "Outdent",
  entries: [
    {
      kind: "button",
      descriptor: {
        key: "outdent",
        label: "↩",
        title: "Outdent (decrease level)",
        isActive: (_state: EditorState) => false,
        isEnabled: (state: EditorState) => lift(state) === true,
        run: (view: EditorView) => {
          lift(view.state, view.dispatch);
          view.focus();
        },
      },
    },
  ],
};
