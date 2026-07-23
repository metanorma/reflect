/**
 * Public API for `@metanorma/editor-commands` (spec §1.10).
 *
 * Exports the Enter-feature commands (spec §2.7), the `chainCommands`
 * combinator (spec §1.9.2), and the `metanormaSchema` re-export for consumer
 * convenience.
 *
 * Per spec §2.3, there is deliberately **no** composite `enterKey` symbol:
 * commands are named for the action they perform, not the key that triggers
 * them (§1.10.2), and the Enter chain is composed at the call site (the
 * keymap plugin of §2.8) so composition stays explicit (§1.9.3) and keymap
 * wiring stays outside the package (§1.13).
 */

export { chainCommands } from "prosemirror-commands";
export type { Command } from "prosemirror-state";

export { metanormaSchema, NODE_NAMES, MARK_NAMES } from "@metanorma/prosemirror-schema";

// Enter-feature commands (spec §2.7).
export { newlineInCode } from "./commands/newlineInCode.js";
export { splitBlockKeepMarks } from "./commands/splitBlockKeepMarks.js";
export { splitListItem } from "./commands/splitListItem.js";
export { enterDefinitionList } from "./commands/enterDefinitionList.js";
export { exitContainerBlock } from "./commands/exitContainerBlock.js";
export { createParagraphNear } from "./commands/createParagraphNear.js";
export { insertSoftBreak } from "./commands/insertSoftBreak.js";
