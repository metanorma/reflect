/**
 * React node view for the `sourcecode` node (§7.3).
 *
 * Renders `<pre class="language-${language}"><code>` and places `{children}`
 * inside the `<code>`. The content host (`<code>`) differs from the top-level
 * element (`<pre>`), so `ref` and `nodeProps.contentDOMRef` are forwarded to
 * separate elements. Syntax highlighting is out of scope (schema §16); the view
 * only applies the language class.
 */

import React from "react";
import type { RefObject } from "react";
import type { NodeViewComponentProps } from "@handlewithcare/react-prosemirror";

export function SourcecodeNodeView({ nodeProps, children, ref, ...props }: NodeViewComponentProps) {
  const { node, contentDOMRef } = nodeProps;
  const language = node.attrs["language"] as string | null;
  const className = language != null ? `language-${language}` : undefined;

  return (
    <pre ref={ref} {...(className != null ? { className } : {})} {...props}>
      <code ref={contentDOMRef as RefObject<HTMLElement>}>{children}</code>
    </pre>
  );
}
