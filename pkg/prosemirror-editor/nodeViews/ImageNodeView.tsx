/**
 * React node view for the `image` node (§7.3).
 *
 * Atom leaf — no `children`, no `contentDOMRef`. Displays `src`/`alt`; on empty
 * `src` renders a placeholder div. Runtime validation via `assertValidImageAttrs`
 * happens at insertion time, not render time, so this view must not throw.
 *
 * Authored size (§17.8) paints as inline style: a numeric `width`/`height`
 * attr becomes `Npx`, a percent string passes through verbatim; `null` leaves
 * the dimension to the browser (intrinsic sizing). `toDOM` does not paint —
 * this node view is where the editor canvas sees authored size.
 */

import React from "react";
import type { CSSProperties } from "react";
import type { NodeViewComponentProps } from "@handlewithcare/react-prosemirror";
import { mergeNodeViewProps } from "./mergeNodeViewProps.js";

/** One canonical size value (§17.8) → an inline-style length (px or %). */
function sizeStyleValue(v: number | `${number}%`): string {
  return typeof v === "number" ? `${v}px` : v;
}

function imageSizeStyle(
  width: number | `${number}%` | null,
  height: number | `${number}%` | null,
): CSSProperties | undefined {
  const style: CSSProperties = {};
  if (width !== null) {
    style.width = sizeStyleValue(width);
  }
  if (height !== null) {
    style.height = sizeStyleValue(height);
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

export function ImageNodeView({ nodeProps, ref, ...props }: NodeViewComponentProps) {
  const { node } = nodeProps;
  const src = node.attrs["src"] as string;
  const alt = node.attrs["alt"] as string | null;
  const width = node.attrs["width"] as number | `${number}%` | null;
  const height = node.attrs["height"] as number | `${number}%` | null;

  // Atom: a plain click node-selects it — merge the selection class in.
  const { className, rest } = mergeNodeViewProps(props, "");

  if (src === "") {
    return (
      <div ref={ref} className={className === "" ? "mn-image-placeholder" : `mn-image-placeholder ${className}`} {...rest} />
    );
  }

  return (
    <img
      ref={ref}
      src={src}
      alt={alt ?? ""}
      draggable
      style={imageSizeStyle(width, height)}
      {...rest}
    />
  );
}
