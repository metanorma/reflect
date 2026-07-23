/**
 * Node view component registry (§7.1).
 *
 * The default `nodeViewComponents` map — node type → React component. This map
 * **must be defined at module scope** (a stable reference) per the library's
 * guidance; an unstable reference causes node-view remounts.
 *
 * Consumer-supplied `nodeViewComponents` (via the component prop, §5) are merged
 * **over** this default map (consumer wins on key collision).
 */

import type { ComponentType } from "react";
import type { NodeViewComponentProps } from "@handlewithcare/react-prosemirror";

import { ImageNodeView } from "./ImageNodeView.js";
import { FigureNodeView } from "./FigureNodeView.js";
import { FormulaNodeView } from "./FormulaNodeView.js";
import { FloatingTitleNodeView } from "./FloatingTitleNodeView.js";
import { SourcecodeNodeView } from "./SourcecodeNodeView.js";

export { ImageNodeView } from "./ImageNodeView.js";
export { FigureNodeView } from "./FigureNodeView.js";
export { FormulaNodeView } from "./FormulaNodeView.js";
export { FloatingTitleNodeView } from "./FloatingTitleNodeView.js";
export { SourcecodeNodeView } from "./SourcecodeNodeView.js";

/**
 * The default node-view component map. Node types not present here fall back to
 * the schema's default `toDOM` rendering (§7.2).
 */
export const nodeViewComponents: Readonly<
  Record<string, ComponentType<NodeViewComponentProps>>
> = {
  image: ImageNodeView,
  figure: FigureNodeView,
  formula: FormulaNodeView,
  floating_title: FloatingTitleNodeView,
  sourcecode: SourcecodeNodeView,
};
