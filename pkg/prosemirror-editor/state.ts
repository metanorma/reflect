/**
 * EditorState bootstrap (§6.2).
 *
 * Owns the default document (schema.spec.md §15, reproduced verbatim) and the
 * `createInitialEditorState` factory that builds an `EditorState` bound to
 * `metanormaSchema` with `reactKeys()` always present as the first plugin.
 */

import { EditorState, type Plugin } from "prosemirror-state";
import { reactKeys } from "@handlewithcare/react-prosemirror";
import { metanormaSchema } from "@metanorma/prosemirror-schema";
import type { MirrorDocument } from "./types.js";

/**
 * The default document (schema.spec.md §15), inlined here. The schema package
 * does not export a default document; this module owns it.
 */
export const DEFAULT_MIRROR_DOC: MirrorDocument = {
  type: "doc",
  content: [
    {
      type: "sections",
      content: [
        {
          type: "clause",
          attrs: { id: "_document_container", title: null },
          content: [{ type: "paragraph" }],
        },
      ],
    },
  ],
};

/**
 * Build an `EditorState` bound to `metanormaSchema`.
 *
 * `reactKeys()` is always present as the first plugin (required by
 * `@handlewithcare/react-prosemirror` to give node-view components stable keys
 * across transactions). Consumer plugins are appended **after** `reactKeys()`
 * so they cannot accidentally displace it.
 *
 * The initial document is built with `metanormaSchema.nodeFromJSON(...)`,
 * falling back to {@link DEFAULT_MIRROR_DOC} when no `doc` is supplied.
 */
export function createInitialEditorState(opts: {
  doc?: MirrorDocument;
  plugins?: readonly Plugin[];
  editable?: boolean;
}): EditorState {
  return EditorState.create({
    schema: metanormaSchema,
    doc: metanormaSchema.nodeFromJSON(opts.doc ?? DEFAULT_MIRROR_DOC),
    plugins: [reactKeys(), ...(opts.plugins ?? [])],
  });
}
