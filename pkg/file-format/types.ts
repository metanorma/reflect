/**
 * Structural types for the bare tree and the envelope (FileFormat.spec.md
 * §3, §5).
 *
 * These mirror MetanormaDocument / MetanormaMark (pinned to
 * pkg/prosemirror-editor/types.ts by schema.spec.md §12) structurally and
 * on purpose: this package has zero runtime dependencies, so consumers
 * read and migrate .mn.json files without prosemirror-model. Shape drift
 * is caught by the real-schema round-trip test (FileFormat.spec.md §10.8),
 * which loads decoded trees through metanormaSchema.nodeFromJSON.
 */

/** A mark as serialized by `Mark.toJSON()` (schema.spec.md §12). */
export type TreeMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

/** A node as serialized by `Node.toJSON()` (schema.spec.md §12). */
export type TreeNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TreeNode[];
  marks?: TreeMark[];
  text?: string;
};

/** The `format` member: the two in-file version axes (§2, §3). */
export type EnvelopeFormat = {
  envelope: number;
  tree: number;
};

/** The known members of an enveloped file (§3); foreign members ride separately. */
export type Envelope = {
  format: EnvelopeFormat;
  meta?: Record<string, unknown>;
  doc: TreeNode;
};

/** What `detectDocumentFile` reports (§5 step 1). */
export type FileKind = 'envelope' | 'legacy';

/** `decodeEnvelope`'s result: the extracted tree plus everything preserved (§3, §5). */
export type DecodedDocument = {
  tree: TreeNode;
  /** Preserved `meta` members, or null when the file carried none (§3). */
  meta: Record<string, unknown> | null;
  /** Foreign top-level members, preserved verbatim for re-emission on save (§3). */
  foreign: Record<string, unknown>;
};

/** `encodeEnvelope`'s options (§6). */
export type EncodeOptions = {
  /** `<product> <version>` string stamped into `meta.generator` (§3, §6). */
  generator?: string;
  /** Preserved meta members from a prior decode; the fresh generator merges in (§3). */
  meta?: Record<string, unknown>;
  /** Foreign top-level members from a prior decode, re-emitted after the known members (§3). */
  foreign?: Record<string, unknown>;
};
