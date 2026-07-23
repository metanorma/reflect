/**
 * `createParagraphNear` — create an empty paragraph adjacent to a node-selected
 * atom or beside a gap cursor (spec §2.4.7).
 *
 * Re-exported unchanged from `prosemirror-commands`. The Metanorma schema's
 * block-level atoms (`image`, `formula`, `floating_title`) have empty content;
 * the cursor cannot rest inside them, so Enter near one creates an adjacent
 * empty paragraph in which to type.
 */

export { createParagraphNear } from "prosemirror-commands";
