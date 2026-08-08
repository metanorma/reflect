/**
 * `sections` group — clause nesting structural operations (sections.md §4).
 *
 * Four entries: Insert clause (split-button control), Promote, Demote, Change
 * section type (stateful control). The "Clause" button is a split-button
 * control (`ClauseSplitButton`) with a context-sensitive primary action (nested
 * vs sibling) plus an explicit dropdown menu. Clause insertion is synchronous —
 * the new clause gets an empty `section_title` and the cursor lands there for
 * direct heading editing.
 */

import React from "react";
import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";

import {
  promoteClause,
  demoteClause,
  findNearestSectionOfType,
  metanormaSchema,
} from "@metanorma/editor-commands";

import type { ToolbarGroupDef } from "../types.js";
import { SectionTypeButton } from "../SectionTypePicker.js";
import { ClauseSplitButton } from "../ClauseSplitButton.js";

/** Whether promote is enabled: mirrors `promoteClause`'s applicability. */
function canPromote(state: EditorState): boolean {
  // Query the command without a dispatch: it returns true iff a promotion is
  // legal at the current selection (nearest clause's parent is itself a
  // section). This keeps the button's `isEnabled` exactly in sync with the
  // command — the contract per MetanormaToolbar.spec.md §5.4.
  return promoteClause(state) === true;
}

/** Whether demote is enabled: nearest clause has a preceding section sibling. */
function canDemote(state: EditorState): boolean {
  const { $from } = state.selection;
  const clauseType = metanormaSchema.nodes["clause"];
  if (clauseType === undefined) return false;
  const hit = findNearestSectionOfType($from, clauseType);
  if (hit === null) return false;
  const parentDepth = hit.depth - 1;
  if (parentDepth < 1) return false;
  const clauseIndex = $from.index(parentDepth);
  if (clauseIndex === 0) return false;
  // Check if any preceding sibling can legally contain a clause.
  const parent = $from.node(parentDepth);
  for (let i = clauseIndex - 1; i >= 0; i--) {
    const sibling = parent.child(i);
    if (sibling.type.contentMatch.matchType(clauseType) !== null) return true;
  }
  return false;
}

/**
 * Build the `sections` group.
 */
export function sectionsGroup(): ToolbarGroupDef {
  return {
    id: "sections",
    label: "Section structure",
    entries: [
      // ── Insert clause — split-button with context-sensitive primary ──
      {
        kind: "control",
        render: () => <ClauseSplitButton />,
      },
      {
        kind: "button",
        descriptor: {
          key: "sections-promote",
          label: "Promote",
          title: "Promote clause (move out one level)",
          isActive: (_state: EditorState) => false,
          isEnabled: canPromote,
          run: (view: EditorView) => {
            promoteClause(view.state, view.dispatch);
            view.focus();
          },
        },
      },
      {
        kind: "button",
        descriptor: {
          key: "sections-demote",
          label: "Demote",
          title: "Demote clause (nest one level deeper)",
          isActive: (_state: EditorState) => false,
          isEnabled: canDemote,
          run: (view: EditorView) => {
            demoteClause(view.state, view.dispatch);
            view.focus();
          },
        },
      },
      // ── Change section type — stateful control with a picker popover ──
      {
        kind: "control",
        render: () => <SectionTypeButton />,
      },
    ],
  };
}
