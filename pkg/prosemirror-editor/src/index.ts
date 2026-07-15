/**
 * Public API for `@metanorma/prosemirror-editor` (§11).
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

/**
 * Build an EditorState bound to metanormaSchema (always includes reactKeys).
 *
 * Re-declared here as a type anchor for the public API surface (§11).
 */
export type CreateInitialEditorStateOptions = {
  doc?: import("./types.js").MirrorDocument;
  plugins?: readonly Plugin[];
  editable?: boolean;
};

/** Type-only alias for {@link EditorState}. */
export type { EditorState, Plugin };

/** Type alias for a node-view component (§12.4). */
export type NodeViewComponent = ComponentType<NodeViewComponentProps>;
