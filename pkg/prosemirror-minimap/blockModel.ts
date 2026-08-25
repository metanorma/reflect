/**
 * The flattening walk and the paired incremental diff (§4.1, §4.3, §7.2).
 *
 * The document is flattened into an ordered row list: inline nodes skipped,
 * the classifier deciding rows, transparent containers recursed. Identity is
 * reference-based (§4.3): wherever `newNode === oldNode`, a subtree's rows
 * carry over (keys, heights, cached text) without visiting children — the
 * walk cost is proportional to the changed subtree, not the document.
 *
 * Both walks are generators so the controller can time-slice them (§7.3):
 * the driver stops pulling after the per-frame budget and resumes later.
 * `flattenAll` and `diffRows` are the run-to-completion forms.
 *
 * Alignment at each level: identical (`===`) children at the head and tail
 * carry wholesale; the middle is paired by identity (a surviving child is
 * found and carried even when siblings around it were inserted or deleted),
 * with non-matching pairs treated as replace (old subtree dropped, new
 * subtree flattened fresh).
 *
 * The per-class strategy table (§4.4) is maintained by the walk: a
 * classifier's `RowSpec.height` override both applies to that row and
 * registers as the class-level strategy for later rows of the class. A
 * fresh flatten re-registers every class as its rows are reached; the
 * paired diff re-registers only changed classes — carried subtrees keep
 * the strategies they were estimated under, and each row remembers its own
 * override (§4.2 `strategy`) so epoch re-estimation (§4.6) reproduces it.
 */

import type { Node } from 'prosemirror-model';

import { keyOf } from './identity.js';
import { estimateHeight } from './heights.js';
import type {
  BlockRow,
  HeightStrategy,
  MinimapClassifier,
  MinimapTheme,
  RowSpec,
} from './types.js';


/** Walk context: policy + estimation inputs shared by flatten and diff. */
export interface WalkContext {
  classifier: MinimapClassifier;
  theme: MinimapTheme;
  /**
   * Per-class height strategies (§4.4) — mutated by the walk as classifiers
   * assign row-level `height` overrides; later rows of the class inherit
   * the most recently registered strategy (§5.1 override semantics).
   */
  strategies: Map<string, HeightStrategy>;
  /** Per-class calibrated heights (§4.5). */
  calibrated: ReadonlyMap<string, number>;
  /**
   * Diff-only (§7.2): measured heights of rows dropped by this diff,
   * keyed by node — a MOVE preserves node instances while position-based
   * pairing drops and re-emits them, and the fresh rows re-enter with the
   * real strides instead of formula estimates (the reflow-on-demotion
   * bug). Undefined during a plain flatten.
   */
  inherit?: WeakMap<Node, number>;
}

/**
 * Shape-keyed default classifier (§5.2): textblocks and atom/leaf blocks
 * are rows, all other block nodes are transparent containers. No knobs —
 * schema-derived refinement is consumer classifier code (§5.3).
 */
export const defaultClassifier: MinimapClassifier = {
  row(node) {
    if (node.isTextblock) {
      return { classId: 'text' };
    }
    if (node.isAtom || node.isLeaf) {
      return { classId: node.type.name };
    }
    return null;
  },
};

/** Recurse-or-stop per §4.1: the classifier's `recurse()` when given. */
function recurses(classifier: MinimapClassifier, node: Node): boolean {
  return classifier.recurse !== undefined
    ? classifier.recurse(node)
    : !node.isTextblock && !node.isLeaf;
}

/**
 * Flatten `doc` into rows in document order (§4.1), one row per yield, so
 * an initial build can be time-sliced (§7.3). `ancestors` handed to the
 * classifier is the block-ancestor chain, outermost first (root excluded,
 * self excluded).
 *
 * `row.pos` is the node's TRUE ProseMirror position (the position of its
 * open token, as `view.nodeDOM(pos)` expects — pos+1 would resolve the
 * DOM *inside* the node, a text node or null). The doc has no position of
 * its own and its content starts at 0, so the walk seeds with `-1`
 * (`walkChildren` adds 1 for the content start).
 */
export function* flatten(
  doc: Node,
  ctx: WalkContext,
): Generator<BlockRow, void, void> {
  yield* walkChildren(doc, -1, 0, [], ctx);
}

/** Run `flatten` to completion and return the row list. */
export function flattenAll(doc: Node, ctx: WalkContext): BlockRow[] {
  const rows: BlockRow[] = [];
  for (const row of flatten(doc, ctx)) {
    rows.push(row);
  }
  return rows;
}

/**
 * Count the rows `flatten` would produce, without allocating them — the
 * hidden rung's lean doc tracking (§6.5): the model is released, but the
 * count must still follow edits so the rung releases when the document
 * shrinks back under `hideRows`.
 */
export function countRows(
  doc: Node,
  classifier: MinimapClassifier,
): number {
  let count = 0;
  const walk = (
    node: Node, depth: number, ancestors: readonly Node[],
  ): void => {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child === undefined || child.isInline) {
        continue;
      }
      const spec = classifier.row(child, depth, ancestors);
      if (spec !== null) {
        count++;
      }
      if (spec !== null && !recurses(classifier, child)) {
        continue;
      }
      if (recurses(classifier, child)) {
        walk(child, depth + 1, [...ancestors, child]);
      }
    }
  };
  walk(doc, 0, []);
  return count;
}

/**
 * Walk one node's children, emitting fresh rows (all block children, inline
 * skipped). `pos` is the node's own position; `childDepth` the depth its
 * children live at.
 */
function* walkChildren(
  node: Node,
  pos: number,
  childDepth: number,
  ancestors: readonly Node[],
  ctx: WalkContext,
): Generator<BlockRow, void, void> {
  let off = 0;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child === undefined || child.isInline) {
      continue; // rows are block-level (§4.1)
    }
    yield* emitNode(
      child, pos + off + 1, childDepth, ancestors, ctx,
    );
    off += child.nodeSize;
  }
}

/** Emit `node`'s own row (if any), then walk its children when recursed. */
function* emitNode(
  node: Node,
  pos: number,
  depth: number,
  ancestors: readonly Node[],
  ctx: WalkContext,
): Generator<BlockRow, void, void> {
  const spec = ctx.classifier.row(node, depth, ancestors);
  if (spec !== null) {
    if (spec.height !== undefined) {
      ctx.strategies.set(spec.classId, spec.height);
    }
    yield makeRow(node, pos, spec, depth, ctx);
  }
  if (recurses(ctx.classifier, node)) {
    yield* walkChildren(node, pos, depth + 1, [...ancestors, node], ctx);
  }
}

/** Build one row from a classifier spec. */
function makeRow(
  node: Node,
  pos: number,
  spec: RowSpec,
  depth: number,
  ctx: WalkContext,
  inherit?: { heightPx: number } | null,
): BlockRow {
  // Identity inheritance first (a moved node re-emits with its real
  // stride), the explicit pairNode inheritance second (a one-for-one
  // replaced node takes over its predecessor's row measurement — the
  // typing case). Both mark the row un-measured so the sampler still
  // owns it (see the sampledAtEpoch note below).
  const inherited = inherit?.heightPx ?? ctx.inherit?.get(node) ?? null;
  return {
    key: keyOf(node),
    pos,
    node,
    classId: spec.classId,
    depth,
    textLength: node.isTextblock ? node.content.size : 0,
    // Shape-derived (§4.2): the walk still has the node here, so the
    // textblock distinction — dropped by classId for aliased atoms — is
    // retained as data and survives the serializable boundary (§8.1).
    textBlock: spec.textBlock ?? node.isTextblock,
      heightPx: inherited,
      estHeightPx: estimateHeight(
        node, spec.classId, spec.height,
        ctx.strategies, ctx.theme, ctx.calibrated,
      ),
      strategy: spec.height ?? null,
      // −1 = an INHERITED measurement (§7.2): taken over from a dropped
      // row (moved or replaced node), not measured for THIS row instance.
      // The sampler's skip guard (`sampledAtEpoch === epochSeq`) never
      // matches it, so the value is re-armed for immediate re-sampling —
      // a stale inheritance corrects within a frame, while the row's
      // height never passes through the formula estimate that oscillates
      // against the sampler (the reflow-on-demotion bug, §4.5).
      sampledAtEpoch: inherited !== null ? -1 : 0,
      text: null,
  };
}


// ---------------------------------------------------------------------------
// The paired incremental diff (§7.2)
// ---------------------------------------------------------------------------

/** Diff outcome (§7.2): changed-range bounds for re-sum and sparse push. */
export interface DiffBounds {
  /**
   * Smallest output index at or after any change (fresh row, replaced row,
   * or deletion); `-1` when the row list is unchanged. Everything before it
   * is carried verbatim — the re-sum and the sparse push start here.
   */
  firstChanged: number;
  /**
   * Exclusive end of the changed output range (index after the last fresh
   * row). When `structural` is true this is the row count: an
   * insertion/deletion shifted every trailing index, so the sparse push
   * extends to the end.
   */
  lastChanged: number;
  /** Whether any insertion/deletion shifted trailing row indices. */
  structural: boolean;
}

/** Fresh diff-bounds (unchanged sentinel). */
export function diffBounds(): DiffBounds {
  return { firstChanged: -1, lastChanged: -1, structural: false };
}

/** Shared driver state threaded through the diff generator. */
interface DiffState {
  /** Consumption pointer into `oldRows`, shared across the whole walk. */
  oldIdx: number;
  /** Rows emitted so far (carry + fresh alike). */
  emitted: number;
  /** The bounds being filled. */
  bounds: DiffBounds;
  /** Emitted count after the most recent fresh row. */
  lastFresh: number;
  /**
   * MEASUREMENT INHERITANCE (§7.2): measured heights of rows dropped by
   * the diff, keyed by their NODE. A structural move (demote/promote —
   * the clause becomes a child of another node) preserves every node
   * instance (`===`) while changing the tree around them, so
   * position-based pairing drops and re-emits the whole moved subtree.
   * Recording each dropped row's measured height here lets the fresh
   * rows for the SAME nodes re-enter with real strides instead of formula
   * estimates (which omit inter-block margins and briefly collapse the
   * model — a visible reflow of everything below the edit, and a rescale
   * of the whole minimap while `total` recovers). Cleared implicitly with
   * the diff: a WeakMap, so it never retains nodes.
   */
  inherit: WeakMap<Node, number>;
}

/**
 * Diff the old and new documents' rows (§7.2) — a generator so a large
 * structural edit can be time-sliced like an initial build (§7.3).
 * `mapPos` is `tr.mapping.map` — a mapped-position update for carried
 * rows, not a re-walk. Old rows are consumed in document order; a subtree
 * owns exactly the rows positioned inside its range.
 */
export function* diffRows(
  oldRows: readonly BlockRow[],
  oldDoc: Node,
  newDoc: Node,
  ctx: WalkContext,
  mapPos: (pos: number) => number,
  bounds: DiffBounds,
): Generator<BlockRow, void, void> {
  if (oldDoc === newDoc) {
    return;
  }
  // The inheritance ledger rides on the ctx so every emit site (makeRow)
  // can consult it without a parameter change. PRE-SEEDED with every
  // measured old row: the diff's drop order cannot be relied on — a
  // cross-level move (demote) pairs the moved subtree against a NEW
  // wrapper node, and the old rows can be abandoned mid-walk (unconsumed
  // trailing content) AFTER the fresh rows were already emitted. A
  // pre-seeded WeakMap makes the ledger order-independent: any fresh row
  // for a surviving node instance finds the dropped row's measurement;
  // entries for deleted nodes are simply never read (and the WeakMap
  // holds nothing live).
  const inherit = ctx.inherit ?? new WeakMap();
  for (const r of oldRows) {
    if (r.heightPx !== null) {
      inherit.set(r.node, r.heightPx);
    }
  }
  const st: DiffState = {
    oldIdx: 0,
    emitted: 0,
    bounds,
    lastFresh: -1,
    inherit,
  };
  ctx.inherit = inherit;
  yield* pairChildren(
    oldRows, oldDoc, newDoc, -1, -1, 0, [], ctx, mapPos, st,
  );
  // Anything unconsumed belonged to deleted trailing content.
  if (st.oldIdx < oldRows.length) {
    bounds.structural = true;
  }
  if (bounds.structural) {
    bounds.lastChanged = st.emitted;
  } else if (bounds.lastChanged < 0 && bounds.firstChanged >= 0) {
    bounds.lastChanged = st.lastFresh > 0 ? st.lastFresh : 1;
  }
  if (bounds.firstChanged >= 0 && bounds.lastChanged < bounds.firstChanged) {
    bounds.lastChanged = bounds.firstChanged + 1;
  }
}

interface MiddleChild {
  node: Node;
  pos: number;
}

/** Pair the children of two differing nodes. */
function* pairChildren(
  oldRows: readonly BlockRow[],
  oldNode: Node,
  newNode: Node,
  oldPos: number,
  newPos: number,
  childDepth: number,
  ancestors: readonly Node[],
  ctx: WalkContext,
  mapPos: (pos: number) => number,
  st: DiffState,
): Generator<BlockRow, void, void> {
  const oldCount = oldNode.childCount;
  const newCount = newNode.childCount;

  // --- Common prefix: identical children carry wholesale. ----------------
  let pre = 0;
  let oOff = 0;
  let nOff = 0;
  while (pre < oldCount && pre < newCount
    && oldNode.child(pre) === newNode.child(pre)) {
    yield* carryRange(
      oldRows, st, mapPos,
      oldPos + 1 + oOff,
      oldPos + 1 + oOff + (oldNode.child(pre) as Node).nodeSize,
    );
    oOff += (oldNode.child(pre) as Node).nodeSize;
    nOff += (newNode.child(pre) as Node).nodeSize;
    pre++;
  }

  // --- Common suffix (never overlapping the prefix). ---------------------
  let suf = 0;
  let oEnd = oldNode.content.size;
  let nEnd = newNode.content.size;
  const suffixOld: MiddleChild[] = [];
  const oldLast = (k: number) => oldNode.child(oldCount - 1 - k);
  const newLast = (k: number) => newNode.child(newCount - 1 - k);
  while (suf < oldCount - pre && suf < newCount - pre
    && oldLast(suf) === newLast(suf)) {
    const oc = oldLast(suf) as Node;
    oEnd -= oc.nodeSize;
    nEnd -= (newLast(suf) as Node).nodeSize;
    suffixOld.unshift({ node: oc, pos: oldPos + 1 + oEnd });
    suf++;
  }

  // --- Middle: paired by identity, then as replacements. -----------------
  const oldMid: MiddleChild[] = [];
  for (let i = pre, off = oOff; i < oldCount - suf; i++) {
    const c = oldNode.child(i) as Node;
    oldMid.push({ node: c, pos: oldPos + 1 + off });
    off += c.nodeSize;
  }
  const newMid: MiddleChild[] = [];
  for (let i = pre, off = nOff; i < newCount - suf; i++) {
    const c = newNode.child(i) as Node;
    newMid.push({ node: c, pos: newPos + 1 + off });
    off += c.nodeSize;
  }

  let oi = 0;
  let ni = 0;
  while (oi < oldMid.length || ni < newMid.length) {
    const o = oldMid[oi];
    const n = newMid[ni];
    if (o !== undefined && n !== undefined && o.node === n.node) {
      yield* carryRange(
        oldRows, st, mapPos, o.pos, o.pos + o.node.nodeSize,
      );
      oi++;
      ni++;
      continue;
    }
    if (n !== undefined) {
      // Does the new child survive somewhere later in the old middle?
      const k = oldMid.findIndex((e, idx) => idx >= oi && e.node === n.node);
      if (k !== -1) {
        for (let d = oi; d < k; d++) {
          const e = oldMid[d] as MiddleChild;
          yield* skipRange(oldRows, st, e.pos, e.pos + e.node.nodeSize);
        }
        const carried = oldMid[k] as MiddleChild;
        yield* carryRange(
          oldRows, st, mapPos, carried.pos, carried.pos + carried.node.nodeSize,
        );
        oi = k + 1;
        ni++;
        continue;
      }
    }
    if (o !== undefined) {
      // Does the old child survive somewhere later in the new middle?
      const m = newMid.findIndex((e, idx) => idx >= ni && e.node === o.node);
      if (m !== -1) {
        for (let ins = ni; ins < m; ins++) {
          const e = newMid[ins] as MiddleChild;
          yield* emitFresh(
            e.node, e.pos, childDepth, ancestors, ctx, st,
          );
        }
        yield* carryRange(
          oldRows, st, mapPos, o.pos, o.pos + o.node.nodeSize,
        );
        oi++;
        ni = m + 1;
        continue;
      }
    }
    if (o !== undefined && n !== undefined) {
      yield* pairNode(
        oldRows, o.node, n.node, o.pos, n.pos,
        childDepth, ancestors, ctx, mapPos, st,
      );
      oi++;
      ni++;
      continue;
    }
    if (n !== undefined) {
      yield* emitFresh(
        n.node, n.pos, childDepth, ancestors, ctx, st,
      );
      ni++;
      continue;
    }
    const e = oldMid[oi] as MiddleChild;
    yield* skipRange(oldRows, st, e.pos, e.pos + e.node.nodeSize);
    oi++;
  }

  // --- Carry the suffix. -------------------------------------------------
  for (const e of suffixOld) {
    yield* carryRange(
      oldRows, st, mapPos, e.pos, e.pos + e.node.nodeSize,
    );
  }
}

/**
 * Pair two differing subtrees: old rows dropped, new subtree flattened
 * fresh, recursing so deeper `===` children still carry.
 */
function* pairNode(
  oldRows: readonly BlockRow[],
  oldChild: Node,
  newChild: Node,
  oldPos: number,
  newPos: number,
  depth: number,
  ancestors: readonly Node[],
  ctx: WalkContext,
  mapPos: (pos: number) => number,
  st: DiffState,
): Generator<BlockRow, void, void> {
  if (recurses(ctx.classifier, newChild)) {
    // The differing subtree recursed: drop only the old head row.
    const r = oldRows[st.oldIdx];
    if (r !== undefined && r.pos === oldPos) {
      st.oldIdx++;
      markChange(st);
    }
    // The head row only — children pair via the pairChildren below (the
    // new child's `===` descendants carry; emitting them fresh here AND
    // carrying them below would duplicate rows).
    yield* emitHeadFresh(newChild, newPos, depth, ancestors, ctx, st);
    yield* pairChildren(
      oldRows, oldChild, newChild, oldPos, newPos,
      depth + 1, [...ancestors, newChild], ctx, mapPos, st,
    );
  } else {
    // New subtree is opaque (textblock/leaf): drop the old range whole.
    // MEASUREMENT INHERITANCE (§7.2): when the dropped range is exactly
    // this one row (the typing case — the node changed, the row didn't),
    // the fresh row takes over its measured height. Keeps the model
    // stable across keystrokes: the formula estimate (no inter-block
    // margins) and the measured stride differ by the margin budget, and
    // alternating between them per frame is the "everything below jumps
    // on every keypress" bug. `sampledAtEpoch: -1` re-arms the sampler,
    // so an inheritance the edit invalidated (line count changed) still
    // corrects within a frame.
    const inherit = oldRows[st.oldIdx];
    const lone = inherit !== undefined && inherit.pos === oldPos
      && (st.oldIdx + 1 >= oldRows.length
        || (oldRows[st.oldIdx + 1] as BlockRow).pos
          >= oldPos + oldChild.nodeSize);
    yield* skipRange(
      oldRows, st, oldPos, oldPos + oldChild.nodeSize,
    );
    yield* emitFresh(
      newChild, newPos, depth, ancestors, ctx, st,
      lone && inherit !== undefined && inherit.heightPx !== null
        ? { heightPx: inherit.heightPx }
        : null,
    );
  }
}

/** Drop old rows positioned inside `[p, end)`. */
function* skipRange(
  oldRows: readonly BlockRow[],
  st: DiffState,
  p: number,
  end: number,
): Generator<BlockRow, void, void> {
  let dropped = false;
  while (st.oldIdx < oldRows.length) {
    const r = oldRows[st.oldIdx] as BlockRow;
    if (r.pos < p || r.pos >= end) {
      break;
    }
    // Record the dropped measurement for identity-based inheritance (see
    // DiffState.inherit): a MOVE drops the subtree's rows here and
    // re-emits them fresh for the SAME nodes — the record lets the fresh
    // rows re-enter with the real strides.
    if (r.heightPx !== null) {
      st.inherit.set(r.node, r.heightPx);
    }
    dropped = true;
    st.oldIdx++;
  }
  if (dropped) {
    st.bounds.structural = true;
    markChange(st);
  }
}

/** Carry old rows positioned inside `[p, end)`, positions mapped. */
function* carryRange(
  oldRows: readonly BlockRow[],
  st: DiffState,
  mapPos: (pos: number) => number,
  p: number,
  end: number,
): Generator<BlockRow, void, void> {
  while (st.oldIdx < oldRows.length) {
    const r = oldRows[st.oldIdx] as BlockRow;
    if (r.pos < p || r.pos >= end) {
      break;
    }
    const mapped = mapPos(r.pos);
    st.oldIdx++;
    yield mapped === r.pos ? r : { ...r, pos: mapped };
    st.emitted++;
  }
}

/** Emit the head row only — children are the caller's (pairNode pairs). */
function* emitHeadFresh(
  node: Node,
  pos: number,
  depth: number,
  ancestors: readonly Node[],
  ctx: WalkContext,
  st: DiffState,
  inherit?: { heightPx: number } | null,
): Generator<BlockRow, void, void> {
  const spec = ctx.classifier.row(node, depth, ancestors);
  if (spec !== null) {
    if (spec.height !== undefined) {
      ctx.strategies.set(spec.classId, spec.height);
    }
    markChange(st);
    yield makeRow(node, pos, spec, depth, ctx, inherit);
    st.emitted++;
    st.lastFresh = st.emitted;
  }
}

/** Emit a fresh row (and its subtree when recursed), marking the change. */
function* emitFresh(
  node: Node,
  pos: number,
  depth: number,
  ancestors: readonly Node[],
  ctx: WalkContext,
  st: DiffState,
  inherit?: { heightPx: number } | null,
): Generator<BlockRow, void, void> {
  yield* emitHeadFresh(node, pos, depth, ancestors, ctx, st, inherit);
  if (recurses(ctx.classifier, node)) {
    yield* walkChildrenInto(
      node, pos, depth + 1, [...ancestors, node], ctx, st,
    );
  }
}

/** Walk children that emit fresh rows inside a diff (marks changes). */
function* walkChildrenInto(
  node: Node,
  pos: number,
  childDepth: number,
  ancestors: readonly Node[],
  ctx: WalkContext,
  st: DiffState,
): Generator<BlockRow, void, void> {
  let off = 0;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child === undefined || child.isInline) {
      continue;
    }
    yield* emitFresh(
      child, pos + off + 1, childDepth, ancestors, ctx, st,
    );
    off += child.nodeSize;
  }
}

/** Record the first change index (§7.2). */
function markChange(st: DiffState): void {
  if (st.bounds.firstChanged < 0) {
    st.bounds.firstChanged = st.emitted;
  }
}
