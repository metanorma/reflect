/**
 * `lists` group — list insertion (§5.3).
 *
 * Extracted from the former `buildButtons()` monolith. Each list button uses
 * the pure `toggleList` command from `@metanorma/editor-commands`. The
 * `run(view)` adapter delegates to the command and re-focuses the editor.
 */

import { toggleList } from "@metanorma/editor-commands";

import type { ToolbarGroupDef } from "../types.js";
import { isListActive, requireNode } from "../predicates.js";

// [nodeName, label, title, key]
const listSpecs: ReadonlyArray<readonly [string, string, string, string]> = [
  ["bullet_list", "Bullets", "Bullet list", "bullet-list"],
  ["ordered_list", "Numbers", "Ordered list", "ordered-list"],
];

/** The `lists` group definition (static — no external props). */
export const listsGroup: ToolbarGroupDef = {
  id: "lists",
  label: "Lists",
  entries: listSpecs.map(([nodeName, label, title, key]) => {
    const node = requireNode(nodeName);
    return {
      kind: "button",
      descriptor: {
        key,
        label,
        title,
        isActive: (state) => isListActive(state, node),
        // Mirror the command's applicability (incl. the dl guard —
        // EditorCommands §3.5 / MetanormaToolbar §5.3).
        isEnabled: (state) => toggleList(state, undefined, node),
        run: (view) => {
          toggleList(view.state, view.dispatch, node);
          view.focus();
        },
      },
    };
  }),
};
