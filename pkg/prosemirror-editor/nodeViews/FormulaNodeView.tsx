/**
 * React node view for the `formula` node (§7.3).
 *
 * Atom leaf; renders `<div class="mn-formula" data-type={type} data-number={number}>`
 * with the math text from the `type`-selected attribute (`asciimath` when
 * `type === "asciimath"`, `mathml` when `type === "mathml"`) as visible
 * placeholder content. The non-selected attribute, if populated, is ignored.
 * Math rendering is out of scope (schema §16); this view only surfaces the
 * stored attributes (schema v2 §17.2).
 */

import React from "react";
import type { NodeViewComponentProps } from "@handlewithcare/react-prosemirror";
import { CLASS } from "@metanorma/prosemirror-schema";

export function FormulaNodeView({ nodeProps, ref, ...props }: NodeViewComponentProps) {
  const { node } = nodeProps;
  const number = node.attrs["number"] as string | null;
  const type = (node.attrs["type"] as string | undefined) ?? "asciimath";
  const asciimath = node.attrs["asciimath"] as string | null;
  const mathml = node.attrs["mathml"] as string | null;

  const placeholder = type === "mathml" ? (mathml ?? "") : (asciimath ?? "");

  return (
    <div
      ref={ref}
      className={CLASS.formula}
      {...(number != null ? { "data-number": number } : {})}
      data-type={type}
      {...props}
    >
      {placeholder}
    </div>
  );
}
