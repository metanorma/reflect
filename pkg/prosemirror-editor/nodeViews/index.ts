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
import { SectionNodeView } from "./SectionNodeView.js";
import { FootnoteMarkerNodeView } from "./FootnoteMarkerNodeView.js";
import { FootnoteEntryNodeView } from "./FootnoteEntryNodeView.js";
import { StemNodeView } from "./StemNodeView.js";

export { ImageNodeView } from "./ImageNodeView.js";
export { FigureNodeView } from "./FigureNodeView.js";
export { FormulaNodeView } from "./FormulaNodeView.js";
export { FloatingTitleNodeView } from "./FloatingTitleNodeView.js";
export { SourcecodeNodeView } from "./SourcecodeNodeView.js";
export { SectionNodeView } from "./SectionNodeView.js";
export { FootnoteMarkerNodeView } from "./FootnoteMarkerNodeView.js";
export { FootnoteEntryNodeView } from "./FootnoteEntryNodeView.js";
export { StemNodeView } from "./StemNodeView.js";

/**
 * The default node-view component map. Node types not present here fall back to
 * the schema's default `toDOM` rendering (§7.2).
 *
 * `SectionNodeView` is registered for all ten content-bearing section node
 * types (`clause`, `annex`, `content_section`, `abstract`, `foreword`,
 * `introduction`, `acknowledgements`, `terms`, `definitions`, `references`) so
 * the `title` attribute is rendered as editable text above the content and
 * survives `setSectionType` conversions. `floating_title` keeps its own view.
 */
export const nodeViewComponents: Readonly<
  Record<string, ComponentType<NodeViewComponentProps>>
> = {
  image: ImageNodeView,
  figure: FigureNodeView,
  formula: FormulaNodeView,
  floating_title: FloatingTitleNodeView,
  sourcecode: SourcecodeNodeView,
  footnote_marker: FootnoteMarkerNodeView,
  footnote_entry: FootnoteEntryNodeView,
  stem: StemNodeView,
  clause: SectionNodeView,
  annex: SectionNodeView,
  content_section: SectionNodeView,
  abstract: SectionNodeView,
  foreword: SectionNodeView,
  introduction: SectionNodeView,
  acknowledgements: SectionNodeView,
  terms: SectionNodeView,
  definitions: SectionNodeView,
  references: SectionNodeView,
};
