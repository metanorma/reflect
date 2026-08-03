/**
 * Public API for `@metanorma/prosemirror-editor` (§11).
 *
 * Implements [`docs/MetanormaProseMirror.spec.md`](../../docs/MetanormaProseMirror.spec.md)
 * v3 — the `MetanormaProseMirror` React editor component (§5), editor-state
 * factory, and React node-view components.
 *
 * The `MetanormaToolbar` lives in its own package, `@metanorma/toolbar`
 * (`pkg/toolbar/`) — see [`docs/MetanormaToolbar.spec.md`](../../docs/MetanormaToolbar.spec.md).
 *
 * Exports the main editor component, the editor-local document type, the
 * editor-state factory, re-exports from the schema package, and the individual
 * node-view components for consumers composing a custom map.
 */

import type { EditorState, Plugin } from "prosemirror-state";
import type { ComponentType } from "react";
import type { NodeViewComponentProps } from "@handlewithcare/react-prosemirror";

export { MetanormaProseMirror } from "./MetanormaProseMirror.js";
export type { MetanormaProseMirrorProps } from "./MetanormaProseMirror.js";

export type { MirrorDocument, MirrorMark } from "./types.js";

export {
  createInitialEditorState,
  DEFAULT_MIRROR_DOC,
  DEFAULT_HISTORY_OPTIONS,
  buildUndoRedoKeymap,
} from "./state.js";

export {
  ImageNodeView,
  FigureNodeView,
  FormulaNodeView,
  FloatingTitleNodeView,
  SourcecodeNodeView,
  nodeViewComponents,
} from "./nodeViews/index.js";

// ---------------------------------------------------------------------------
// Re-exports from the schema package (§4.3, §11) — for consumer convenience.
// ---------------------------------------------------------------------------

export {
  metanormaSchema,
  NODE_NAMES,
  MARK_NAMES,
  assertValidImageAttrs,
} from "@metanorma/prosemirror-schema";

// ---------------------------------------------------------------------------
// Type re-exports
// ---------------------------------------------------------------------------

export type { NodeViewComponentProps } from "@handlewithcare/react-prosemirror";

/** Re-exported so hosts can type the `history` option without a direct dep. */
export type { HistoryOptions } from "@metanorma/editor-commands";

/**
 * Build an EditorState bound to metanormaSchema (always includes reactKeys).
 *
 * Re-declared here as a type anchor for the public API surface (§11).
 */
export type CreateInitialEditorStateOptions = {
  doc?: import("./types.js").MirrorDocument;
  plugins?: readonly Plugin[];
  editable?: boolean;
  /** History plugin configuration — opt-in (undo-redo.md §4.1). */
  history?: import("@metanorma/editor-commands").HistoryOptions | false;
};

/** Type-only alias for {@link EditorState}. */
export type { EditorState, Plugin };

/** Type alias for a node-view component (§12.4). */
export type NodeViewComponent = ComponentType<NodeViewComponentProps>;
