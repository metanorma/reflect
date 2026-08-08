/**
 * React node view for the `stem` inline atom node (§7.3).
 *
 * Mirrors the block `FormulaNodeView`: reads the `type`-selected attribute
 * (`asciimath` when `type === "asciimath"`, `mathml` when `type === "mathml"`)
 * and renders it as visible text inside the `<span>`. Without this node view,
 * the schema's `toDOM` emits only `data-*` attributes with no text content,
 * so the formula source is invisible to the user.
 *
 * Math rendering (MathML / KaTeX / MathJax) is out of scope (schema §16); this
 * view only surfaces the stored source as readable text, matching the block
 * `formula` node's treatment.
 */

import React from "react";
import type { NodeViewComponentProps } from "@handlewithcare/react-prosemirror";
import { CLASS } from "@metanorma/prosemirror-schema";

export function StemNodeView({ nodeProps, ref, ...props }: NodeViewComponentProps) {
  const { node } = nodeProps;
  const type = (node.attrs["type"] as string | undefined) ?? "asciimath";
  const asciimath = node.attrs["asciimath"] as string | null;
  const mathml = node.attrs["mathml"] as string | null;

  const source = type === "mathml" ? (mathml ?? "") : (asciimath ?? "");

  return (
    <span
      ref={ref}
      className={CLASS.stem}
      data-type={type}
      {...props}
    >
      {source}
    </span>
  );
}
