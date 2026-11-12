/**
 * The envelope codec (FileFormat.spec.md §3, §5, §6).
 *
 * `detectDocumentFile` implements §5 step 1; `encodeEnvelope` carries the
 * §6 write obligations; `decodeEnvelope` walks the §5 read chain —
 * validation, version comparison, migration composition, and the legacy
 * shortcut. Migration chains (§5 steps 4–5) are composed by decode over
 * the registries in use; the baseline registries are empty, so at envelope
 * version 1 / tree version 1 both chain stages are identity.
 */
import type {
  DecodedDocument,
  EncodeOptions,
  Envelope,
  FileKind,
  TreeNode,
} from './types.js';
import {
  NotADocument,
  MalformedEnvelope,
  FutureEnvelope,
  FutureTree,
} from './errors.js';
import { CURRENT_ENVELOPE_VERSION, CURRENT_TREE_VERSION } from './versions.js';
import {
  ENVELOPE_MIGRATIONS,
  TREE_MIGRATIONS,
  checkRegistryContiguous,
  runEnvelopeChain,
  runTreeChain,
} from './registry.js';
import type { EnvelopeMigrationStep, TreeMigrationStep } from './registry.js';

// ---------------------------------------------------------------------------
// Shape helpers
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** An in-file version: integer ≥ 1 (§3). */
function isVersionInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1;
}

/** Minimal tree-shape check: a plain object. Structural validation is the
 * schema's job at §5 step 6 (`nodeFromJSON`, contracts unchanged). */
function isTreeObject(v: unknown): v is TreeNode {
  return isPlainObject(v);
}

function describeValue(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'an array';
  return `a ${typeof v}`;
}

// ---------------------------------------------------------------------------
// Detection (§5 step 1)
// ---------------------------------------------------------------------------

/**
 * Classify a parsed file. `format` present ⇒ envelope — whatever else the
 * object carries, `format` takes precedence; else `type: "doc"` ⇒ legacy
 * bare tree; anything else throws `NotADocument` (§8). The two shapes are
 * disjoint by construction (§3): an envelope never carries `type: "doc"`
 * at its top level, and a bare tree's top level can only be
 * `type`/`attrs`/`content`.
 */
export function detectDocumentFile(parsed: unknown): FileKind {
  if (isPlainObject(parsed)) {
    if ('format' in parsed) return 'envelope';
    if (parsed['type'] === 'doc') return 'legacy';
    throw new NotADocument(
      `the parsed value is ${describeValue(parsed)} with neither a "format" member nor type "doc"`,
    );
  }
  throw new NotADocument(`the parsed value is ${describeValue(parsed)}`);
}

// ---------------------------------------------------------------------------
// Write obligations (§6)
// ---------------------------------------------------------------------------

/**
 * Wrap a bare tree in an envelope at the current versions (§6): versions
 * are stamped here from `versions.ts` — never in editor state, never in
 * the tree. Writer key order is `format`, `meta`?, `doc`, then preserved
 * foreign members (§3). The fresh `generator` merges into preserved `meta`
 * rather than replacing it, so non-normative members survive re-save (§3).
 * The tree is deep-copied into the output; the input object is left
 * untouched.
 */
export function encodeEnvelope(
  tree: TreeNode,
  opts: EncodeOptions = {},
): Envelope & Record<string, unknown> {
  const meta: Record<string, unknown> = { ...opts.meta };
  if (opts.generator !== undefined) meta['generator'] = opts.generator;
  const out: Envelope & Record<string, unknown> = {
    format: { envelope: CURRENT_ENVELOPE_VERSION, tree: CURRENT_TREE_VERSION },
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
    doc: structuredClone(tree) as TreeNode,
  };
  for (const [key, value] of Object.entries(opts.foreign ?? {})) {
    out[key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Read obligations (§5)
// ---------------------------------------------------------------------------

/** Options for `decodeEnvelope` (§5). */
export type DecodeOptions = {
  /** Storage adapter injected into envelope migrations (§7); unused at
   * envelope version 1, where the chain is empty. */
  adapter?: unknown;
  /** Tree registry override (§7) — the module registry by default; the
   * suite injects gapped chains to pin the load-time self-check. */
  treeMigrations?: readonly TreeMigrationStep[];
  /** Envelope registry override (§7). */
  envelopeMigrations?: readonly EnvelopeMigrationStep[];
};

/**
 * Walk the §5 read chain over a parsed file and return the tree at the
 * current tree version, plus everything preserved for re-save (§3): the
 * `meta` members and any foreign top-level members. Legacy files skip
 * validation and both migration chains — the tree is used as-is at the
 * current tree version (§4) and re-encodes on next save.
 *
 * Failure semantics per §8: `NotADocument` before any migration runs;
 * `MalformedEnvelope` on a present-but-malformed `format` (never a legacy
 * fallback) or a missing `doc`; `FutureEnvelope`/`FutureTree` on versions
 * greater than this reader's, with nothing loaded.
 */
export async function decodeEnvelope(
  parsed: unknown,
  opts: DecodeOptions = {},
): Promise<DecodedDocument> {
  if (detectDocumentFile(parsed) === 'legacy') {
    return { tree: parsed as TreeNode, meta: null, foreign: {} };
  }

  const obj = parsed as Record<string, unknown>;
  const fmt = obj['format'];
  if (!isPlainObject(fmt)) {
    throw new MalformedEnvelope('the "format" member must be an object');
  }
  const envelopeVersion = fmt['envelope'];
  if (!isVersionInteger(envelopeVersion)) {
    throw new MalformedEnvelope('"format.envelope" must be an integer ≥ 1');
  }
  const treeVersion = fmt['tree'];
  if (!isVersionInteger(treeVersion)) {
    throw new MalformedEnvelope('"format.tree" must be an integer ≥ 1');
  }
  if (envelopeVersion > CURRENT_ENVELOPE_VERSION) {
    throw new FutureEnvelope(envelopeVersion);
  }
  if (treeVersion > CURRENT_TREE_VERSION) {
    throw new FutureTree(treeVersion);
  }

  // §5 steps 4–5: registry self-check, then the envelope chain (it owns
  // where the tree lives), then extraction, then the tree chain. Both
  // baseline chains are empty, so these stages are identity today.
  const treeSteps = opts.treeMigrations ?? TREE_MIGRATIONS;
  const envelopeSteps = opts.envelopeMigrations ?? ENVELOPE_MIGRATIONS;
  checkRegistryContiguous(envelopeSteps, CURRENT_ENVELOPE_VERSION, 'envelope');
  checkRegistryContiguous(treeSteps, CURRENT_TREE_VERSION, 'tree');

  const envelope =
    envelopeVersion < CURRENT_ENVELOPE_VERSION
      ? await runEnvelopeChain(
          obj as Envelope & Record<string, unknown>,
          envelopeVersion,
          CURRENT_ENVELOPE_VERSION,
          envelopeSteps,
          opts.adapter,
        )
      : obj;

  const decoded = extractDecoded(envelope);
  if (treeVersion < CURRENT_TREE_VERSION) {
    decoded.tree = runTreeChain(
      decoded.tree,
      treeVersion,
      CURRENT_TREE_VERSION,
      treeSteps,
    );
  }
  return decoded;
}

/**
 * Extract the decoded result from an (already migrated) envelope object:
 * the `doc` tree, preserved `meta`, and foreign top-level members (§3).
 * A non-object `meta` is carried in `foreign` — it is non-normative
 * content whose preservation semantics ("verbatim, never interpreted")
 * are identical.
 */
function extractDecoded(envelope: Record<string, unknown>): DecodedDocument {
  const doc = envelope['doc'];
  if (!isTreeObject(doc)) {
    throw new MalformedEnvelope('the "doc" member must be the bare tree object');
  }
  const metaValue = envelope['meta'];
  const meta =
    metaValue !== undefined && isPlainObject(metaValue) ? metaValue : null;
  const foreign: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(envelope)) {
    if (key === 'format' || key === 'meta' || key === 'doc') continue;
    foreign[key] = value;
  }
  if (metaValue !== undefined && meta === null) foreign['meta'] = metaValue;
  return { tree: doc, meta, foreign };
}
