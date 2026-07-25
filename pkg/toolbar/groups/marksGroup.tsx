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
  ["strong", "Bold", "Bold", "strong"],
  ["emphasis", "Italic", "Italic", "emphasis"],
  ["underline", "Underline", "Underline", "underline"],
  ["strike", "Strikethrough", "Strikethrough", "strike"],
  ["subscript", "Sub", "Subscript", "subscript"],
  ["superscript", "Super", "Superscript", "superscript"],
  ["code", "Code", "Code", "code"],
  ["smallcap", "Smallcaps", "Small caps", "smallcap"],
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
