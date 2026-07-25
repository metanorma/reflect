/**
 * `marks` group — inline formatting toggles (§5.1).
 *
 * Extracted from the former `buildButtons()` monolith. Each mark button uses
 * `prosemirror-commands`'s `toggleMark`.
 */

import { toggleMark } from "prosemirror-commands";

import type { ToolbarGroupDef } from "../types.js";
import { isInlineContext, isMarkActive, requireMark } from "../predicates.js";

// [markName, label, title, key]
const markSpecs: ReadonlyArray<readonly [string, string, string, string]> = [
  ["strong", "B", "Bold", "strong"],
  ["emphasis", "I", "Italic", "emphasis"],
  ["underline", "U", "Underline", "underline"],
  ["strike", "S", "Strikethrough", "strike"],
  ["subscript", "x₂", "Subscript", "subscript"],
  ["superscript", "x²", "Superscript", "superscript"],
  ["code", "code", "Code", "code"],
  ["smallcap", "AA", "Small caps", "smallcap"],
];

/** The `marks` group definition (static — no external props). */
export const marksGroup: ToolbarGroupDef = {
  id: "marks",
  label: "Inline formatting",
  entries: markSpecs.map(([markName, label, title, key]) => {
    const mark = requireMark(markName);
    return {
      kind: "button",
      descriptor: {
        key,
        label,
        title,
        isActive: (state) => isMarkActive(state, mark),
        isEnabled: isInlineContext,
        run: (view) => {
          toggleMark(mark)(view.state, view.dispatch);
        },
      },
    };
  }),
};
