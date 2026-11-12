/**
 * The single definition site of the in-file version axes (FileFormat.spec.md
 * §2, §7).
 *
 * §7 pins the current values; these constants are their one code-side
 * expression: `encodeEnvelope` stamps from them, `decodeEnvelope` compares
 * against them, and the registry contiguity check bounds chains by them.
 * No other package carries a copy — a tree-vocabulary bump (schema.spec.md
 * §3) edits exactly one line here and appends its migration step in the
 * same change.
 */

/** Current envelope version — the file-layout axis (`format.envelope`). */
export const CURRENT_ENVELOPE_VERSION = 1;

/** Current tree version — the ProseMirror-tree axis (`format.tree`). */
export const CURRENT_TREE_VERSION = 1;
