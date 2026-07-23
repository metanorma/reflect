/**
 * React node view for the `figure` node (§7.3).
 *
 * Wraps its `image` child + caption blocks. Forwards `ref` and
 * `nodeProps.contentDOMRef` to the same `<figure>` element via `useMergedDOMRefs`.
 */

import React from "react";
import { useMergedDOMRefs, type NodeViewComponentProps } from "@handlewithcare/react-prosemirror";

export function FigureNodeView({ nodeProps, children, ref, ...props }: NodeViewComponentProps) {
  const mergedRef = useMergedDOMRefs(ref, nodeProps.contentDOMRef);
  const { node } = nodeProps;
  const id = node.attrs["id"] as string | null;

  return (
    <figure
      ref={mergedRef}
      className="figure"
      {...(id != null ? { "data-id": id } : {})}
      {...props}
    >
      {children}
    </figure>
  );
}
