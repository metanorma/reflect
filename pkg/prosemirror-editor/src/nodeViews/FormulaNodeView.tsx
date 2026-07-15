/**
 * React node view for the `formula` node (§7.3).
 *
 * Atom leaf; renders `<div class="formula" data-number={number}>` with the
 * `asciimath`/`mathml`/`math_text` attrs as visible placeholder content. Math
 * rendering is out of scope (schema §16); this view only surfaces the stored
 * attributes.
 */

import React from "react";
import type { NodeViewComponentProps } from "@handlewithcare/react-prosemirror";

export function FormulaNodeView({ nodeProps, ref, ...props }: NodeViewComponentProps) {
  const { node } = nodeProps;
  const number = node.attrs["number"] as string | null;
  const asciimath = node.attrs["asciimath"] as string | null;
  const mathml = node.attrs["mathml"] as string | null;
  const mathText = node.attrs["math_text"] as string | null;

  const placeholder = asciimath ?? mathml ?? mathText ?? "";

  return (
    <div
      ref={ref}
      className="formula"
      {...(number != null ? { "data-number": number } : {})}
      {...props}
    >
      {placeholder}
    </div>
  );
}
