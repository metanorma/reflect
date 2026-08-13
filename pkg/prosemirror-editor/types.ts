/**
 * Editor-local document types (§6.1).
 *
 * `MetanormaDocument` is the JSON-serializable document tree shape accepted by
 * `prosemirror-model`'s `Schema.nodeFromJSON(...)`. It matches the open
 * attribute model of the Metanorma schema: every node carries an optional
 * `attrs` record, and unknown keys round-trip through the schema's catch-all
 * `data` attribute (schema §6).
 *
 * This type is intentionally loose so callers can supply partial or
 * hand-authored documents without satisfying a per-node-type attribute type.
 * It is structurally compatible with the JSON that `Node.toJSON()` emits.
 */

/**
 * A JSON-serializable Metanorma mark.
 */
export interface MetanormaMark {
  readonly type: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
}

/**
 * A JSON-serializable Metanorma document tree: the input shape for
 * `metanormaSchema.nodeFromJSON(...)`.
 */
export interface MetanormaDocument {
  readonly type: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly content?: readonly MetanormaDocument[];
  readonly marks?: readonly MetanormaMark[];
  readonly text?: string;
}
