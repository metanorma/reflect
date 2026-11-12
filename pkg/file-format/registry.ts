/**
 * The migration registry contract (FileFormat.spec.md §7).
 *
 * A code registry, not a data manifest: steps are typechecked, greppable,
 * and unit-testable. Tree steps are sync and pure — the sync signature is
 * the structural purity guarantee (no I/O, no clock, no input mutation);
 * envelope steps are async and touch storage only through the adapter the
 * caller injects. Chains must be contiguous 1 … current on each axis;
 * `decodeEnvelope` self-checks the registries in use on every decode, so
 * a gap is a load-time error (§7). The baseline registries are empty —
 * the mechanism, not any migration, is the deliverable.
 */
import type { Envelope, TreeMark, TreeNode } from './types.js';
import { RegistryGapError } from './errors.js';

/** Ancestry context for tree strategies: parent-scoped reshapes need it (§7). */
export type MigrationContext = {
  /** The parent node's type name; null for the doc root. */
  parentType: string | null;
  /** The node's index among its parent's content; the mark's index in its
   * host node's `marks` array. */
  index: number;
};

/** A sync, pure rewrite: `(node, ctx)` → the replacement node/mark (§7). */
export type TreeStrategy = (node: TreeNode, ctx: MigrationContext) => TreeNode;
export type MarkStrategy = (mark: TreeMark, ctx: MigrationContext) => TreeMark;

/**
 * One tree transition N → N+1 (§7): a map from type name (node types; mark
 * names for marks, sharing the namespace the schema keeps disjoint) to its
 * strategy, plus an optional doc-level hook run once after the walk.
 * Types without a registered strategy pass through unchanged.
 */
export type TreeMigrationStep = {
  fromVersion: number;
  strategies: Record<string, TreeStrategy | MarkStrategy>;
  docHook?: (doc: TreeNode) => TreeNode;
};

/**
 * One envelope transition N → N+1 (§7): whole envelope to whole envelope,
 * async, with storage I/O confined to the injected adapter.
 */
export type EnvelopeMigrationStep = {
  fromVersion: number;
  migrate: (
    envelope: Envelope & Record<string, unknown>,
    adapter: unknown,
  ) => Promise<Envelope & Record<string, unknown>>;
};

/** Baseline: no steps on either axis (FileFormat.spec.md §7). */
export const TREE_MIGRATIONS: readonly TreeMigrationStep[] = [];
export const ENVELOPE_MIGRATIONS: readonly EnvelopeMigrationStep[] = [];

/**
 * Verify a chain is contiguous 1 … currentVersion; a gap throws
 * `RegistryGapError` naming the missing transition (§7, §8). Called by
 * `decodeEnvelope` over the registries in use on every decode.
 */
export function checkRegistryContiguous(
  steps: readonly { fromVersion: number }[],
  currentVersion: number,
  axis: 'envelope' | 'tree',
): void {
  for (let v = 1; v < currentVersion; v++) {
    if (!steps.some((s) => s.fromVersion === v)) {
      throw new RegistryGapError(axis, v);
    }
  }
  // Contiguity is against the current version: a step outside
  // 1 … current−1 means the registry and the version constants disagree —
  // the same registry drift this check exists to catch.
  for (const step of steps) {
    if (step.fromVersion < 1 || step.fromVersion >= currentVersion) {
      throw new RegistryGapError(axis, step.fromVersion);
    }
  }
}

/**
 * Run the tree chain from `fromVersion` up to `toVersion` (§5 step 5):
 * for each transition, walk the tree applying the step's strategies by
 * type name, then the doc hook. The walk never mutates its input —
 * pass-through subtrees keep their references, rewritten branches get
 * fresh objects.
 */
export function runTreeChain(
  doc: TreeNode,
  fromVersion: number,
  toVersion: number,
  steps: readonly TreeMigrationStep[],
): TreeNode {
  let tree = doc;
  for (let v = fromVersion; v < toVersion; v++) {
    const step = steps.find((s) => s.fromVersion === v);
    if (!step) throw new RegistryGapError('tree', v);
    tree = rewriteNode(tree, step, null, 0);
    if (step.docHook) tree = step.docHook(tree);
  }
  return tree;
}

function rewriteNode(
  node: TreeNode,
  step: TreeMigrationStep,
  parentType: string | null,
  index: number,
): TreeNode {
  const nodeStrategy = step.strategies[node.type];
  const rewritten =
    typeof nodeStrategy === 'function'
      ? (nodeStrategy as TreeStrategy)(node, { parentType, index })
      : node;

  const marks = rewriteMarks(rewritten, step);
  const content = rewritten.content
    ? rewritten.content.map((child, i) =>
        rewriteNode(child, step, rewritten.type, i),
      )
    : undefined;

  const marksChanged =
    marks !== undefined && marks.some((m, i) => m !== rewritten.marks?.[i]);
  const contentChanged =
    content !== undefined && content.some((c, i) => c !== rewritten.content?.[i]);

  if (!marksChanged && !contentChanged) return rewritten;
  return {
    ...rewritten,
    ...(marks !== undefined ? { marks } : {}),
    ...(content !== undefined ? { content } : {}),
  };
}

/**
 * Apply mark strategies by mark name, with the host node's type as
 * `parentType` (§7's single strategy namespace covers marks). Text nodes
 * carry the marks array; other node types keep theirs verbatim if present.
 */
function rewriteMarks(
  node: TreeNode,
  step: TreeMigrationStep,
): TreeMark[] | undefined {
  const marks = node.marks;
  if (!marks || marks.length === 0) return marks;
  const out = marks.map((mark, i) => {
    const strategy = step.strategies[mark.type];
    return typeof strategy === 'function'
      ? (strategy as MarkStrategy)(mark, { parentType: node.type, index: i })
      : mark;
  });
  return out.some((m, i) => m !== marks[i]) ? out : marks;
}

/**
 * Run the envelope chain from `fromVersion` up to `toVersion` (§5 step 4):
 * each step rewrites the whole envelope and may perform I/O only through
 * the injected adapter (§7).
 */
export async function runEnvelopeChain(
  envelope: Envelope & Record<string, unknown>,
  fromVersion: number,
  toVersion: number,
  steps: readonly EnvelopeMigrationStep[],
  adapter: unknown,
): Promise<Envelope & Record<string, unknown>> {
  let env = envelope;
  for (let v = fromVersion; v < toVersion; v++) {
    const step = steps.find((s) => s.fromVersion === v);
    if (!step) throw new RegistryGapError('envelope', v);
    env = await step.migrate(env, adapter);
  }
  return env;
}
