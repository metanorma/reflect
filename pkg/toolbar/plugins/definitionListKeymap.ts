/**
 * `definitionListKeymap` — Enter/Backspace keymap for definition lists
 * (definition-lists.md §6).
 *
 * A `prosemirror-keymap` plugin that binds `Enter` and `Backspace` to
 * definition-list-aware handlers. The pure commands/helpers (`addDefinitionPair`,
 * `jumpToSiblingDescription`, `exitDefinitionList`) are imported from
 * `@metanorma/editor-commands`; only the keymap wiring lives here. The
 * `EditorView` never appears inside the commands.
 */

import type { EditorState, Transaction } from "prosemirror-state";
import type { ResolvedPos } from "prosemirror-model";
import { keymap } from "prosemirror-keymap";
import type { Plugin } from "prosemirror-state";
import {
  addDefinitionPair,
  jumpToSiblingDescription,
  exitDefinitionList,
} from "@metanorma/editor-commands";

/** Walk `$pos` ancestors for a node of `name`; return its depth, or -1. */
function ancestorDepth(
  $pos: ResolvedPos,
  name: string,
): number {
  for (let d = $pos.depth; d >= 1; d--) {
    if ($pos.node(d).type.name === name) return d;
  }
  return -1;
}

/** Whether the node at `depth` is the last child of its parent. */
function isLastChildLocal($pos: ResolvedPos, depth: number): boolean {
  const parentDepth = depth - 1;
  if (parentDepth < 0) return false;
  return $pos.index(parentDepth) === $pos.node(parentDepth).childCount - 1;
}

/** Whether the `dt` paired with the `dd` at `theDdDepth` is empty. */
function pairTermIsEmptyLocal($pos: ResolvedPos, theDdDepth: number): boolean {
  const parentDepth = theDdDepth - 1;
  if (parentDepth < 1) return false;
  const parent = $pos.node(parentDepth);
  if (parent.type.name !== "dl") return false;
  const ddIndex = $pos.index(parentDepth);
  if (ddIndex === 0) return false;
  const dt = parent.child(ddIndex - 1);
  if (dt.type.name !== "dt") return false;
  return dt.content.size === 0;
}

/** Enter handler (definition-lists.md §6.1). */
function handleEnter(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const { $from } = state.selection;
  const theDdDepth = ancestorDepth($from, "dd");
  if (theDdDepth < 0) return false; // not in a dd

  const theDtDepth = ancestorDepth($from, "dt");
  if (theDtDepth >= 0) {
    // In a term: jump to this pair's dd (the next sibling).
    return jumpToSiblingDescription(state, dispatch, theDtDepth);
  }

  // In a dd: is it the last child of the dl? is its term empty?
  if (isLastChildLocal($from, theDdDepth) && pairTermIsEmptyLocal($from, theDdDepth)) {
    return exitDefinitionList(state, dispatch);
  }
  if (isLastChildLocal($from, theDdDepth)) {
    return addDefinitionPair(state, dispatch);
  }
  return false; // let default Enter handle intra-dd block splitting
}

/**
 * Backspace handler (definition-lists.md §6.2). Always declines: dl-aware
 * Backspace behaviour is owned by `emptyTextblockBackspace` (EditorCommands
 * spec §4.4.4 pair-atomic deletion), which the consumer's Backspace chain
 * runs first. Returning `false` keeps the chain in charge and avoids binding
 * the same policy in two places.
 */
function handleBackspace(_state: EditorState, _dispatch?: (tr: Transaction) => void): boolean {
  return false;
}

/**
 * Build the definition-list keymap plugin (definition-lists.md §6.5).
 *
 * Returns a `prosemirror-keymap` plugin binding `Enter` and `Backspace`. To
 * claim the event before the base keymap, pass this plugin *before* the base
 * keymap in the plugin list (or use `priorities` in a custom setup).
 */
export function definitionListKeymap(): Plugin {
  return keymap({
    Enter: handleEnter,
    Backspace: handleBackspace,
  });
}
