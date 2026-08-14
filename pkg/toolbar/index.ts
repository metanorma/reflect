/**
 * Public API for `@metanorma/toolbar` (§12).
 *
 * Implements [`docs/MetanormaToolbar.spec.md`](../../docs/MetanormaToolbar.spec.md) v2:
 * the schema-bound `MetanormaToolbar` thin assembler and the `toggleList`
 * command re-exported from `@metanorma/editor-commands`.
 *
 * Implements [`docs/AdvancedMetanormaToolbar/README.md`](../../docs/AdvancedMetanormaToolbar/README.md):
 * the `AdvancedMetanormaToolbar` thin assembler, the stateful UI components,
 * and the re-exported pure commands for one-stop toolbar imports.
 *
 * The shared primitives (`Toolbar.tsx`, `ToolbarButtonView.tsx`, `types.ts`,
 * `predicates.ts`, `groups/*`) are intentionally internal — not exported here.
 */

// Base toolbar
export { MetanormaToolbar } from "./MetanormaToolbar.js";
export type { MetanormaToolbarProps, ToolbarGroup } from "./MetanormaToolbar.js";

// Advanced toolbar
export { AdvancedMetanormaToolbar } from "./AdvancedMetanormaToolbar.js";
export type {
  AdvancedMetanormaToolbarProps,
  AdvancedToolbarGroup,
  AdvancedToolbarGroupId,
  AdvancedFeatureOptions,
  BaseToolbarGroup,
  RefPromptContext,
  StemPromptContext,
  StemResult,
  OnImageUpload,
  OnImagePrompt,
} from "./AdvancedMetanormaToolbar.js";

// Stateful UI components (view adapters + popovers/dialogs)
export { TableSizePicker, InsertTableButton } from "./TableSizePicker.js";
export { ImageInsertDialog, InsertImageButton } from "./ImageInsertDialog.js";
export { FootnoteButton, FootnoteEntryPicker } from "./FootnotePicker.js";
export { SectionPopover } from "./SectionPopover.js";

// Definition-list keymap plugin (undo-redo.md §4.1 / definition-lists.md §6.5)
export { definitionListKeymap } from "./plugins/definitionListKeymap.js";

// Re-export pure commands for one-stop imports (sourced from editor-commands)
export {
  toggleList,
  insertTable,
  canInsertTable,
  insertImage,
  canInsertFigure,
  wrapInClause,
  promoteClause,
  demoteClause,
  insertSection,
  insertFloatingTitle,
  applyReferenceMark,
  toggleXref,
  toggleEref,
  toggleConcept,
  toggleBcp14,
  insertFootnoteMarker,
  removeFootnoteMarker,
  insertStem,
  insertDefinitionList,
  addDefinitionPair,
  undo,
  redo,
} from "@metanorma/editor-commands";
