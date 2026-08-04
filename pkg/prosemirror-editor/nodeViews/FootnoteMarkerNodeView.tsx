/**
 * React node view for the `footnote_marker` inline atom node (§7.3).
 *
 * Renders `<sup class="mn-footnote-marker">{n}</sup>` where `{n}` is the
 * ordinal of the footnote *entry* this marker references (by its `target`
 * attr). The ordinal is the position (1-based, in document order) of the
 * *first* `footnote_marker` whose `target` matches this marker's `target` — so
 * all markers pointing at the same entry share the same number. The `id` and
 * `target` attributes are preserved as `data-id` / `data-target`. Atom inline
 * node — no `contentDOMRef`.
 */

import React from "react";
import {
  useEditorStateSelector,
  type NodeViewComponentProps,
} from "@handlewithcare/react-prosemirror";
import type { EditorState } from "prosemirror-state";
import type { Node } from "prosemirror-model";

import { CLASS } from "@metanorma/prosemirror-schema";

/**
 * Compute the 1-based ordinal of the footnote entry identified by `target`,
 * by counting **unique** footnote targets in document order up to and including
 * the first occurrence of `target`. Markers sharing a `target` get the same
 * ordinal, and duplicate references to an earlier entry do not inflate the
 * count for later entries.
 *
 * Returns `null` if `target` is null or no matching marker is found.
 */
function targetOrdinal(state: EditorState, target: string | null): number | null {
  if (target === null) return null;
  const seen = new Set<string>();
  let found: number | null = null;
  state.doc.descendants((node: Node) => {
    if (node.type.name === "footnote_marker") {
      const t = node.attrs["target"] as string | null;
      if (t !== null && !seen.has(t)) {
        seen.add(t);
        if (t === target && found === null) {
          found = seen.size;
        }
      }
    }
    return true;
  });
  return found;
}

export function FootnoteMarkerNodeView({
  nodeProps,
  ref,
  ...props
}: NodeViewComponentProps): React.JSX.Element {
  const { node } = nodeProps;
  const id = node.attrs["id"] as string | null;
  const target = node.attrs["target"] as string | null;

  const number = useEditorStateSelector((state) =>
    targetOrdinal(state, target),
  );

  return (
    <sup
      ref={ref}
      className={CLASS.footnoteMarker}
      {...(target != null ? { "data-target": target } : {})}
      {...(id != null ? { "data-id": id } : {})}
      {...props}
    >
      {number ?? "•"}
    </sup>
  );
}
