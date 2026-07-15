/**
 * React node view for the `image` node (§7.3).
 *
 * Atom leaf — no `children`, no `contentDOMRef`. Displays `src`/`alt`; on empty
 * `src` renders a placeholder div. Runtime validation via `assertValidImageAttrs`
 * happens at insertion time, not render time, so this view must not throw.
 */

import React from "react";
import type { NodeViewComponentProps } from "@handlewithcare/react-prosemirror";

export function ImageNodeView({ nodeProps, ref, ...props }: NodeViewComponentProps) {
  const { node } = nodeProps;
  const src = node.attrs["src"] as string;
  const alt = node.attrs["alt"] as string | null;

  if (src === "") {
    return (
      <div ref={ref} className="mn-image-placeholder" {...props} />
    );
  }

  return (
    <img ref={ref} src={src} alt={alt ?? ""} draggable {...props} />
  );
}
