/**
 * `createParagraphNear` — create an empty paragraph adjacent to a node-selected
 * atom (spec §2.4.7).
 *
 * Re-exported unchanged from `prosemirror-commands`. The Metanorma schema's
 * block-level atoms (`image`, `formula`) have empty content, so Enter near
 * one creates an adjacent empty paragraph in which to type. (`floating_title`
 * is a textblock, not an atom — it can host the cursor directly.)
 *
 * Section references (e.g. §2.4.1) in this file refer to
 * `docs/EditorCommands.spec.md`.
 */

export { createParagraphNear } from 'prosemirror-commands';
