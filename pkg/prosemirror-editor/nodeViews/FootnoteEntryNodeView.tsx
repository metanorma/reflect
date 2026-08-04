/**
 * React node view for the `footnote_entry` block node (§7.3).
 *
 * Renders `<div class="mn-footnote-entry">` with a non-editable number label
 * (`<span class="mn-footnote-entry-label" contentEditable={false}>`) computed
 * from the first `footnote_marker` in document order whose `target` matches
 * this entry's `id`. The `{children}` (editable block content) go inside a
 * separate `<div>` via `contentDOMRef`.
 *
 * If no marker references this entry (orphaned entry), the label shows "•".
 */

import React from "react";
import {
  useEditorStateSelector,
  type NodeViewComponentProps,
} from "@handlewithcare/react-prosemirror";
import type { EditorState } from "prosemirror-state";

import { CLASS } from "@metanorma/prosemirror-schema";

/**
 * Compute the ordinal (1-based) of the `footnote_entry` identified by
 * `entryId`, by counting **unique** footnote targets in document order up to
 * and including the first marker whose `target` matches `entryId`. Duplicate
 * references to an earlier entry do not inflate the count for later entries.
 *
 * Returns `null` if no marker references this entry.
 */
function entryOrdinal(state: EditorState, entryId: string): number | null {
  const seen = new Set<string>();
  let found: number | null = null;
  state.doc.descendants((node) => {
    if (node.type.name === "footnote_marker") {
      const target = node.attrs["target"] as string | null;
      if (target !== null && !seen.has(target)) {
        seen.add(target);
        if (target === entryId && found === null) {
          found = seen.size;
        }
      }
    }
    return true;
  });
  return found;
}

export function FootnoteEntryNodeView({
  nodeProps,
  children,
  ref,
  ...props
}: NodeViewComponentProps): React.JSX.Element {
  const { node, contentDOMRef } = nodeProps;
  const id = node.attrs["id"] as string | null;
  const number = node.attrs["number"] as string | null;

  // Compute the ordinal from the first referencing marker.
  const computedNumber = useEditorStateSelector((state) =>
    id !== null ? entryOrdinal(state, id) : null,
  );

  // Prefer an explicit `number` attr, fall back to the computed ordinal.
  const label = number ?? (computedNumber !== null ? String(computedNumber) : "•");

  return (
    <div
      ref={ref}
      className={CLASS.footnoteEntry}
      {...(id != null ? { "data-id": id } : {})}
      {...(number != null ? { "data-number": number } : {})}
      {...props}
    >
      <span
        className="mn-footnote-entry-label"
        contentEditable={false}
        suppressContentEditableWarning
      >
        [{label}]
      </span>
      <div ref={contentDOMRef}>{children}</div>
    </div>
  );
}
