/**
 * `blocks` group — block wrapping (§5.2).
 *
 * Extracted from the former `buildButtons()` monolith. Each block button uses
 * `prosemirror-commands`'s `wrapIn`, which wraps when the target is absent and
 * lifts when the selection is already inside the target node type.
 */

import { wrapIn } from "prosemirror-commands";

import type { ToolbarGroupDef } from "../types.js";
import { isBlockContext, isBlockWrapActive, requireNode } from "../predicates.js";

// [nodeName, label, title, key]
const blockSpecs: ReadonlyArray<readonly [string, string, string, string]> = [
  ["quote", "❝", "Quote", "quote"],
  ["note", "📝", "Note", "note"],
  ["example", "💡", "Example", "example"],
];

/** The `blocks` group definition (static — no external props). */
export const blocksGroup: ToolbarGroupDef = {
  id: "blocks",
  label: "Block wrapping",
  entries: blockSpecs.map(([nodeName, label, title, key]) => {
    const node = requireNode(nodeName);
    return {
      kind: "button",
      descriptor: {
        key,
        label,
        title,
        isActive: (state) => isBlockWrapActive(state, node),
        isEnabled: isBlockContext,
        run: (view) => {
          wrapIn(node)(view.state, view.dispatch);
        },
      },
    };
  }),
};
