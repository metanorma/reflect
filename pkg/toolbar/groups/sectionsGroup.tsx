/**
 * `sections` group — clause nesting structural operations (sections.md §4).
 *
 * Four buttons: Insert clause, Promote, Demote, Change section type. The
 * `run(view)` adapters delegate to the pure commands and re-focuses. The
 * heading `title` is collected via `window.prompt` (§7 option 2 baseline); a
 * host may upgrade via `onHeadingPrompt`.
 */

import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";
import type { NodeType } from "prosemirror-model";

import {
  wrapInClause,
  promoteClause,
  demoteClause,
  setSectionType,
  canWrapInClause,
  nearestSectionAncestor,
  findNearestSectionOfType,
  metanormaSchema,
} from "@metanorma/editor-commands";

import type { ToolbarGroupDef } from "../types.js";

/** The ten section node names in fixed menu order (sections.md §4.2). */
const SECTION_TYPE_NAMES: readonly string[] = [
  "clause", "annex", "terms", "definitions", "references",
  "content_section", "abstract", "foreword", "introduction", "acknowledgements",
];

/** Default heading prompt: `window.prompt` (sections.md §7 option 2). */
function defaultHeadingPrompt(): Promise<string | null> {
  return Promise.resolve(
    typeof window !== "undefined" && typeof window.prompt === "function"
      ? window.prompt("Clause heading:")
      : null,
  );
}

/** Whether promote is enabled: nearest clause's parent is itself a section. */
function canPromote(state: EditorState): boolean {
  const { $from } = state.selection;
  const clauseType = metanormaSchema.nodes["clause"];
  if (clauseType === undefined) return false;
  const hit = findNearestSectionOfType($from, clauseType);
  if (hit === null) return false;
  const parentDepth = hit.depth - 1;
  if (parentDepth < 1) return false;
  return nearestSectionAncestor($from)?.depth === parentDepth;
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

/** Whether at least one legal alternative section type exists. */
function canChangeType(state: EditorState): boolean {
  const { $from } = state.selection;
  const hit = nearestSectionAncestor($from);
  if (hit === null) return false;
  for (const name of SECTION_TYPE_NAMES) {
    const t = metanormaSchema.nodes[name];
    if (t === undefined) continue;
    if (t === hit.node.type) continue;
    if (t.validContent(hit.node.content)) return true;
  }
  return false;
}

/** Resolve the list of legal target types for the "Change type" menu. */
function legalTargetTypes(state: EditorState): readonly NodeType[] {
  const { $from } = state.selection;
  const hit = nearestSectionAncestor($from);
  if (hit === null) return [];
  const result: NodeType[] = [];
  for (const name of SECTION_TYPE_NAMES) {
    const t = metanormaSchema.nodes[name];
    if (t === undefined) continue;
    if (t === hit.node.type) continue;
    if (t.validContent(hit.node.content)) result.push(t);
  }
  return result;
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
      {
        kind: "button",
        descriptor: {
          key: "sections-set-type",
          label: "Type",
          title: "Change section type…",
          isActive: (_state: EditorState) => false,
          isEnabled: canChangeType,
          run: (view: EditorView) => {
            const targets = legalTargetTypes(view.state);
            if (targets.length === 0) return;
            // Minimal-v1: cycle to the first legal alternative. A host can
            // upgrade to a listbox menu; this keeps the baseline functional.
            const target = targets[0];
            if (target !== undefined) {
              setSectionType(view.state, target, view.dispatch);
              view.focus();
            }
          },
        },
      },
    ],
  };
}
