/**
 * `dl` group — definition-list insertion (definition-lists.md §4).
 *
 * Two plain buttons: `insertDefinitionList` and `addDefinitionPair`. The
 * `run(view)` adapter delegates to the pure commands and re-focuses.
 */

import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";

import {
  insertDefinitionList,
  addDefinitionPair,
  inDefinitionList,
  canInsertBlock,
} from "@metanorma/editor-commands";

import type { ToolbarGroupDef } from "../types.js";

/** The `dl` group definition (static — no external props). */
export const definitionListGroup: ToolbarGroupDef = {
  id: "dl",
  label: "Definition lists",
  entries: [
    {
      kind: "button",
      descriptor: {
        key: "insert-definition-list",
        label: "≡",
        title: "Insert definition list",
        isActive: (state: EditorState) => inDefinitionList(state),
        isEnabled: (state: EditorState) => canInsertBlock(state),
        run: (view: EditorView) => {
          insertDefinitionList(view.state, view.dispatch);
          view.focus();
        },
      },
    },
    {
      kind: "button",
      descriptor: {
        key: "add-definition-pair",
        label: "+ term",
        title: "Add term and description",
        isActive: (_state: EditorState) => false,
        isEnabled: (state: EditorState) => inDefinitionList(state),
        run: (view: EditorView) => {
          addDefinitionPair(view.state, view.dispatch);
          view.focus();
        },
      },
    },
  ],
};
