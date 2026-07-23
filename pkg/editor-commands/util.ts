/**
 * Shared command utilities (spec §1.9.2).
 *
 * Re-exports the `chainCommands` combinator from `prosemirror-commands` so
 * consumers can compose command sequences (spec §1.9.2): "try A, else B, else
 * C". The Enter keymap (§2.8) uses it to assemble the dispatch chain from the
 * individual Enter commands.
 *
 * Also re-exports the small predicate helpers from {@link ./schema.js} that
 * several commands share, so command modules import from one place.
 */

export { chainCommands } from "prosemirror-commands";
export type { Command } from "prosemirror-state";

export {
  isInCode,
  nearestTextblock,
  isEmptyTextblock,
  nearestAncestorDepth,
  nodeAt,
  isInside,
} from "./schema.js";
