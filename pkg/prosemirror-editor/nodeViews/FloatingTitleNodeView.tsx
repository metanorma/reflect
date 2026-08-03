/**
 * React node view for the `floating_title` node (§7.3).
 *
 * Atom block leaf; renders `<div class="mn-floating-title" data-id={id}>{title}</div>`
 * where `title` comes from `node.attrs.title`. No `contentDOMRef` (leaf).
 */

import React from "react";
import type { NodeViewComponentProps } from "@handlewithcare/react-prosemirror";
import { CLASS } from "@metanorma/prosemirror-schema";

export function FloatingTitleNodeView({ nodeProps, ref, ...props }: NodeViewComponentProps) {
  const { node } = nodeProps;
  const id = node.attrs["id"] as string | null;
  const title = node.attrs["title"] as string | null;

  return (
    <div
      ref={ref}
      className={CLASS.floatingTitle}
      {...(id != null ? { "data-id": id } : {})}
      {...props}
    >
      {title ?? ""}
    </div>
  );
}
