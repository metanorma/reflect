/**
 * `sections` group — clause nesting structural operations (sections.md §4).
 *
 * Four buttons: Insert clause, Promote, Demote, Change section type. The
 * `run(view)` adapters delegate to the pure commands and re-focuses. The
 * heading `title` is collected via `window.prompt` (§7 option 2 baseline); a
 * host may upgrade via `onHeadingPrompt`. The "Type" button is a stateful
 * control that opens a `SectionTypePicker` popover.
 */

import React from "react";
import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";

import {
  wrapInClause,
  promoteClause,
  demoteClause,
  canWrapInClause,
  findNearestSectionOfType,
  metanormaSchema,
} from "@metanorma/editor-commands";

import type { ToolbarGroupDef } from "../types.js";
import { SectionTypeButton } from "../SectionTypePicker.js";

/** Default heading prompt: `window.prompt` (sections.md §7 option 2). */
function defaultHeadingPrompt(): Promise<string | null> {
  return Promise.resolve(
    typeof window !== "undefined" && typeof window.prompt === "function"
      ? window.prompt("Clause heading:")
      : null,
  );
}

/** Whether promote is enabled: mirrors `promoteClause`'s applicability. */
function canPromote(state: EditorState): boolean {
  // Query the command without a dispatch: it returns true iff a promotion is
  // legal at the current selection (nearest clause's parent is itself a
  // section). This keeps the button's `isEnabled` exactly in sync with the
  // command — the contract per MetanormaToolbar.spec.md §5.4. The previous
  // hand-rolled check (`nearestSectionAncestor($from)?.depth === parentDepth`)
  // compared the cursor's nearest section (always the clause itself, at
  // hit.depth) against the clause's parent depth (hit.depth - 1), which is
  // never equal, so the button was permanently disabled.
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
 * Build the `sections` group, parameterised by the heading prompt.
 */
export function sectionsGroup(
  getHeadingPrompt: () => () => Promise<string | null> = () => defaultHeadingPrompt,
): ToolbarGroupDef {
  return {
    id: "sections",
    label: "Section structure",
    entries: [
      {
        kind: "button",
        descriptor: {
          key: "sections-insert-clause",
          label: "Clause",
          title: "Insert clause (wrap selection in a new clause)",
          isActive: (_state: EditorState) => false,
          isEnabled: canWrapInClause,
          run: (view: EditorView) => {
            // Capture state/dispatch synchronously, BEFORE the awaited prompt.
            // Reading `view.state` inside the `.then()` (after `window.prompt`
            // closes) races against controlled-mode React state invalidation:
            // `useEditor`'s `dispatchTransaction` callback closes over the
            // `stateValue` from the render that built it, and `ReactEditorView`
            // eagerly swaps `view.state`. Capturing the references on the
            // synchronous event tick keeps the dispatch coherent.
            const { state, dispatch } = view;
            void getHeadingPrompt()().then((title) => {
              const opts =
                title === null
                  ? { title: null }
                  : { title: title === "" ? null : title };
              wrapInClause(state, dispatch, opts);
              view.focus();
            });
          },
        },
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
