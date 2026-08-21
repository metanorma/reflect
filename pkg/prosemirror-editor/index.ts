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

export type { MetanormaDocument, MetanormaMark } from "./types.js";

export {
  createInitialEditorState,
  DEFAULT_MN_DOC,
  DEFAULT_HISTORY_OPTIONS,
  buildUndoRedoKeymap,
} from "./state.js";

export { placeholderClickPlugin } from "./plugins/placeholderClick.js";

export {
  ImageNodeView,
  FigureNodeView,
  FormulaNodeView,
  SourcecodeNodeView,
  FootnoteMarkerNodeView,
  FootnoteEntryNodeView,
  StemNodeView,
  BibdataNodeView,
  BibitemNodeView,
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

/**
 * Re-exported so consumer-side components rendered as editor children can
 * capture the `EditorView` (e.g. a minimap pane) without declaring their own
 * `@handlewithcare/react-prosemirror` dependency — under Yarn PnP a second
 * direct dependency resolves to a *second virtual instance* of the library,
 * whose React context (`EditorContext`) is a different object from the one
 * the editor provides; `useContext` then returns null and the component
 * crashes. Re-exporting keeps a single instance in every consumer bundle.
 */
export { useEditorEffect } from "@handlewithcare/react-prosemirror";

/** Re-exported so hosts can type the `history` option without a direct dep. */
export type { HistoryOptions } from "@metanorma/editor-commands";

/**
 * Build an EditorState bound to metanormaSchema (always includes reactKeys).
 *
 * Re-declared here as a type anchor for the public API surface (§11).
 */
export type CreateInitialEditorStateOptions = {
  doc?: import("./types.js").MetanormaDocument;
  plugins?: readonly Plugin[];
  editable?: boolean;
  /** History plugin configuration — opt-in (undo-redo.md §4.1). */
  history?: import("@metanorma/editor-commands").HistoryOptions | false;
};

/** Type-only alias for {@link EditorState}. */
export type { EditorState, Plugin };

/** Type alias for a node-view component (§12.4). */
export type NodeViewComponent = ComponentType<NodeViewComponentProps>;
