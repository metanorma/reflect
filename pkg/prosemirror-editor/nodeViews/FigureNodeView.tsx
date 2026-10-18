/**
 * React node view for the `figure` node (§7.3).
 *
 * Wraps its `image` child + caption blocks. Forwards `ref` and
 * `nodeProps.contentDOMRef` to the same `<figure>` element via `useMergedDOMRefs`.
 *
 * The library's selection chrome arrives as a `className` prop (e.g.
 * `ProseMirror-selectednode` when the figure is node-selected — a triple-click
 * on the empty-figure placeholder does exactly that). React props replace
 * rather than merge, so the incoming class must be MERGED with the node's own
 * `mn-figure` — spreading `{...props}` after our own `className` would
 * clobber it, which un-styles the figure (all its document.css rules and the
 * `figure.mn-figure:not(:has(img))` placeholder are scoped to `.mn-figure`)
 * for as long as the selection lasts.
 */

import React from "react";
import { useMergedDOMRefs, type NodeViewComponentProps } from "@handlewithcare/react-prosemirror";
import { CLASS } from "@metanorma/prosemirror-schema";
import { mergeNodeViewProps } from "./mergeNodeViewProps.js";

export function FigureNodeView({ nodeProps, children, ref, ...props }: NodeViewComponentProps) {
  const mergedRef = useMergedDOMRefs(ref, nodeProps.contentDOMRef);
  const { node } = nodeProps;
  const id = node.attrs["id"] as string | null;
  // Merge, never replace: the library's `className` (selection chrome) must
  // coexist with the node's own class.
  const { className, rest } = mergeNodeViewProps(props, CLASS.figure);

  return (
    <figure
      ref={mergedRef}
      className={className}
      {...(id != null ? { "data-id": id } : {})}
      {...rest}
    >
      {children}
    </figure>
  );
}
