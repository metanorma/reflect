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
import { SourcecodeNodeView } from "./SourcecodeNodeView.js";
import { FootnoteMarkerNodeView } from "./FootnoteMarkerNodeView.js";
import { FootnoteEntryNodeView } from "./FootnoteEntryNodeView.js";
import { StemNodeView } from "./StemNodeView.js";
import { BibdataNodeView, BibitemNodeView } from "./BibNodeView.js";

export { ImageNodeView } from "./ImageNodeView.js";
export { FigureNodeView } from "./FigureNodeView.js";
export { FormulaNodeView } from "./FormulaNodeView.js";
export { SourcecodeNodeView } from "./SourcecodeNodeView.js";
export { FootnoteMarkerNodeView } from "./FootnoteMarkerNodeView.js";
export { FootnoteEntryNodeView } from "./FootnoteEntryNodeView.js";
export { StemNodeView } from "./StemNodeView.js";
export { BibdataNodeView, BibitemNodeView } from "./BibNodeView.js";

/**
 * The default node-view component map. Node types not present here fall back to
 * the schema's default `toDOM` rendering (§7.2).
 *
 * Section nodes (`clause`, `annex`, etc.) and `floating_title` are NOT
 * registered here — they render natively via their `toDOM` rules. The
 * `section_title` child node is a plain textblock and also renders natively.
 */
export const nodeViewComponents: Readonly<
  Record<string, ComponentType<NodeViewComponentProps>>
> = {
  image: ImageNodeView,
  figure: FigureNodeView,
  formula: FormulaNodeView,
  sourcecode: SourcecodeNodeView,
  footnote_marker: FootnoteMarkerNodeView,
  footnote_entry: FootnoteEntryNodeView,
  stem: StemNodeView,
  bibdata: BibdataNodeView,
  bibitem: BibitemNodeView,
};
