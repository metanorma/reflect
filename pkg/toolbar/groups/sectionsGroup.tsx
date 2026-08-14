/**
 * `sections` group — section insertion + clause nesting operations
 * (sections.md §4).
 *
 * Four entries: Section insertion (popover control), Promote, Demote, and
 * Floating title. The Section popover lists all ten section types grouped by
 * cohort; selecting one calls the pure `insertSection` command, which routes
 * the section to the correct container. Promote/Demote operate on
 * body-section nesting. Floating title inserts the groupless unnumbered
 * heading (not technically a section — the button tooltip says so).
 */

import React from "react";
import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";

import {
  promoteClause,
  demoteClause,
  insertFloatingTitle,
} from "@metanorma/editor-commands";

import type { ToolbarGroupDef } from "../types.js";
import { SectionPopover } from "../SectionPopover.js";

/** Whether promote is enabled: mirrors `promoteClause`'s applicability. */
function canPromote(state: EditorState): boolean {
  return promoteClause(state) === true;
}

/** Whether demote is enabled: mirrors `demoteClause`'s applicability. */
function canDemote(state: EditorState): boolean {
  return demoteClause(state) === true;
}

/** Whether floating-title insertion is enabled at the cursor. */
function canInsertFloatingTitle(state: EditorState): boolean {
  return insertFloatingTitle(state) === true;
}

/**
 * Build the `sections` group.
 */
export function sectionsGroup(): ToolbarGroupDef {
  return {
    id: "sections",
    label: "Section structure",
    entries: [
      // ── Section insertion — popover with all section types ──
      {
        kind: "control",
        render: () => <SectionPopover />,
      },
      // ── Promote clause (move out one level) ──
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
      // ── Demote clause (nest one level deeper) ──
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
      // ── Floating title (unnumbered heading — not a section) ──
      {
        kind: "button",
        descriptor: {
          key: "sections-floating-title",
          label: "Floating title",
          title: "Insert floating title (an unnumbered heading — not a section)",
          isActive: (_state: EditorState) => false,
          isEnabled: canInsertFloatingTitle,
          run: (view: EditorView) => {
            insertFloatingTitle(view.state, view.dispatch);
            view.focus();
          },
        },
      },
    ],
  };
}
