/**
 * `tables` group — table insertion (tables.md §4) + column-width commands
 * (tables.md §8.6).
 *
 * The insertion control (`InsertTableButton`) is stateful and owns the
 * grid-picker popover. The two width commands are plain buttons bound to the
 * pure `autoTableWidths` / `distributeColumnsEvenly` commands via
 * `useEditorEventCallback`. `setColumnWidths` (the drag plugin's write
 * primitive) is deliberately NOT exposed here — its signature carries a doc
 * position and is not toolbar-bindable.
 */

import React from "react";
import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";

import type { ToolbarGroupDef } from "../types.js";
import { InsertTableButton } from "../TableSizePicker.js";
import { autoTableWidths, distributeColumnsEvenly } from "@metanorma/editor-commands";

/** The `tables` group definition (static — the control owns its own state). */
export const tablesGroup: ToolbarGroupDef = {
  id: "tables",
  label: "Tables",
  entries: [
    {
      kind: "control",
      render: () => <InsertTableButton />,
    },
    // ── Auto widths: return the table to auto sizing (mode → autowidth) ──
    {
      kind: "button",
      descriptor: {
        key: "tables-auto-widths",
        label: "Auto widths",
        title: "Remove fixed column widths (table returns to auto sizing)",
        isActive: (_state: EditorState) => false,
        isEnabled: (state: EditorState) => autoTableWidths(state) === true,
        run: (view: EditorView) => {
          autoTableWidths(view.state, view.dispatch);
          view.focus();
        },
      },
    },
    // ── Distribute evenly: equal widths for every grid column ──
    {
      kind: "button",
      descriptor: {
        key: "tables-distribute-evenly",
        label: "Distribute evenly",
        title: "Set all columns to equal widths",
        isActive: (_state: EditorState) => false,
        isEnabled: (state: EditorState) => distributeColumnsEvenly(state) === true,
        run: (view: EditorView) => {
          distributeColumnsEvenly(view.state, view.dispatch);
          view.focus();
        },
      },
    },
  ],
};
