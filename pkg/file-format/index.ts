/**
 * Public API for `@metanorma/file-format`.
 *
 * Implements docs/FileFormat.spec.md — the .mn.json file format: the
 * envelope (`format.envelope` / `format.tree` version axes, `meta`, the
 * `doc` tree member), legacy bare-tree detection (§4), the read chain (§5),
 * write obligations (§6), and the migration registry contract (§7).
 *
 * Zero runtime dependencies by design: the tree types are local structural
 * mirrors of MetanormaDocument/MetanormaMark (schema.spec.md §12) so
 * consumers read and migrate files without pulling in prosemirror-model.
 *
 * Section references (e.g. §5, §7) throughout this package refer to
 * docs/FileFormat.spec.md, unless otherwise specified.
 */

export * from './types.js';
export * from './versions.js';
export * from './errors.js';
export * from './registry.js';
export * from './envelope.js';
