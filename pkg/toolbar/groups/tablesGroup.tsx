/**
 * `tables` group — table insertion (tables.md §4).
 *
 * A single stateful control (`InsertTableButton`) rendered in place of a plain
 * button. It owns the grid-picker popover state and calls the pure
 * `insertTable` command via `useEditorEventCallback`.
 */

import React from "react";

import type { ToolbarGroupDef } from "../types.js";
import { InsertTableButton } from "../TableSizePicker.js";

/** The `tables` group definition (static — the control owns its own state). */
export const tablesGroup: ToolbarGroupDef = {
  id: "tables",
  label: "Tables",
  entries: [
    {
      kind: "control",
      render: () => <InsertTableButton />,
    },
  ],
};
