/**
 * Public API for `@metanorma/editor-commands` (spec §1.10).
 *
 * Implements [`docs/EditorCommands.spec.md`](../../docs/EditorCommands.spec.md)
 * — schema-aware ProseMirror editor commands for the Metanorma document model
 * (Command contract, transaction discipline, inventory: §2 Enter-key commands,
 * §3 `toggleList`, and §4 Backspace-key handling).
 *
 * Section references (e.g. §1.10, §2.7) throughout this package refer to
 * `docs/EditorCommands.spec.md`, unless otherwise specified; references to
 * feature docs (`tables.md`, `sections.md`, …) refer to the corresponding
 * member of `docs/AdvancedMetanormaToolbar/`.
 *
 * Exports the Enter-feature commands (spec §2.7), the Backspace-feature
 * command (spec §4.7), the `chainCommands` combinator (spec §1.9.2), and
 * the `metanormaSchema` re-export for consumer convenience.
 *
 * Per spec §2.3 and §4.3, there is deliberately **no** composite
 * `enterKey` or `backspaceKey` symbol: commands are named for the action
 * they perform, not the key that triggers them (§1.10.2), and the chains
 * are composed at the call site (the keymap plugin of §2.8/§4.8) so
 * composition stays explicit (§1.9.3) and keymap wiring stays outside
 * the package (§1.13).
 */

export {
  chainCommands,
  joinBackward,
  deleteSelection,
} from 'prosemirror-commands';
export type { Command } from 'prosemirror-state';

export {
  metanormaSchema,
  NODE_NAMES,
  MARK_NAMES,
} from '@metanorma/prosemirror-schema';

// Enter-feature commands (spec §2.7).
export { newlineInCode } from './commands/newlineInCode.js';
export { splitBlockKeepMarks } from './commands/splitBlockKeepMarks.js';
export { splitListItem } from './commands/splitListItem.js';
export { enterDefinitionList } from './commands/enterDefinitionList.js';
export { exitContainerBlock } from './commands/exitContainerBlock.js';
export { insertSectionAbove } from './commands/insertSectionAbove.js';
export { exitSectionTitle } from './commands/exitSectionTitle.js';
export { exitFloatingTitle } from './commands/exitFloatingTitle.js';
export { createParagraphNear } from './commands/createParagraphNear.js';
export { insertSoftBreak } from './commands/insertSoftBreak.js';

// Backspace-feature command (spec §4.7).
export { emptyTextblockBackspace } from './commands/emptyTextblockBackspace.js';

// List toggling (spec §3).
export { toggleList } from './commands/toggleList.js';

// AdvancedMetanormaToolbar pure commands.

// Tables (tables.md).
export {
  insertTable,
  canInsertTable,
  MAX_ROWS,
  MAX_COLS,
} from './commands/insertTable.js';

// Images / figures (images-figures.md).
export { insertImage, canInsertFigure } from './commands/insertImage.js';
export type { InsertImageAttrs } from './commands/insertImage.js';

// Bibliography entries (Relaton integration).
export { insertBibitem } from './commands/insertBibitem.js';

// Sections / clause nesting (sections.md). Of the pure legality helpers in
// the module, only `wrapInClause` is part of the public API (toolbar button);
// the rest are internal per sections.md §5.5.
export {
  wrapInClause,
  promoteClause,
  demoteClause,
  insertSection,
  insertFloatingTitle,
} from './commands/sections.js';

// Reference marks (reference-marks.md).
export {
  applyReferenceMark,
  toggleXref,
  toggleEref,
  toggleConcept,
  toggleBcp14,
  insertFootnoteMarker,
  removeFootnoteMarker,
  insertStem,
} from './commands/referenceMarks.js';

// Definition lists (definition-lists.md).
export {
  insertDefinitionList,
  addDefinitionPair,
  jumpToSiblingDescription,
  exitDefinitionList,
  inDefinitionList,
  canInsertBlock,
} from './commands/definitionList.js';

// Undo / redo (undo-redo.md §7).
export {
  undo,
  redo,
  undoDepth,
  redoDepth,
  history,
} from './commands/history.js';
export type { HistoryOptions } from './commands/history.js';

// Outdent (outdent.md §3) — stock `lift` re-exported under its
// standard name.
export { lift } from './commands/outdent.js';

// Shared utilities.
export { generateId } from './util.js';
