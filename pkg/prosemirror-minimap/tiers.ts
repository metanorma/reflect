/**
 * Adaptive tiers and aggregation (§6.5).
 *
 * The renderer's per-row fidelity degrades with row count so the model's
 * row count — and the paint work — stays bounded at any document size.
 */

import type { BlockRow } from './types.js';


/** Renderer fidelity tier. */
export type Tier = 1 | 2 | 3;

export interface TierThresholds {
  tier1Rows: number;
  tier2Rows: number;
}

/**
 * Tier selection with hysteresis (§6.5): promotion at the threshold,
 * demotion only at `0.9 ×` the threshold.
 */
export function selectTier(
  rowCount: number,
  prev: Tier,
  thresholds: TierThresholds,
): Tier {
  if (rowCount > thresholds.tier2Rows * (prev === 3 ? 0.9 : 1)) {
    return 3;
  }
  if (rowCount > thresholds.tier1Rows * (prev === 1 ? 1 : 0.9)) {
    return 2;
  }
  return 1;
}

/**
 * One aggregated row (§6.5): a run of `count` consecutive same-class,
 * same-depth rows rendered as one rectangle of summed px.
 */
export interface AggregatedRow {
  classId: string;
  depth: number;
  /** Editor-space top of the run. */
  offset: number;
  /** Summed effective px of the run. */
  heightPx: number;
  /** Number of source rows merged into this aggregate. */
  count: number;
}

/**
 * Median effective height (px) of `rows` — the aggregate-height cap unit
 * (§6.5: `aggregateMax` × median row px).
 */
export function medianRowPx(rows: readonly BlockRow[]): number {
  if (rows.length === 0) {
    return 0;
  }
  const list = rows
    .map((r) => r.heightPx ?? r.estHeightPx)
    .sort((a, b) => a - b);
  const mid = list.length >> 1;
  return list.length % 2 === 1
    ? (list[mid] ?? 0)
    : ((list[mid - 1] ?? 0) + (list[mid] ?? 0)) / 2;
}

/**
 * Aggregation (§6.5, tier 3): runs of ≥ `aggregateMin` consecutive rows
 * with the same `classId` and depth merge into one row whose height is the
 * summed px (capped at `aggregateMax` × median row px).
 *
 * **Marker survival:** a run must not swallow a row that carries layer
 * spans — `isMarked(row)` splits the run around any marked row. The
 * aggregator is pure: marking and offsets come in as data.
 */
export function aggregate(
  rows: readonly BlockRow[],
  offsets: Float64Array,
  opts: {
    aggregateMin: number;
    aggregateMax: number;
    medianPx: number;
    isMarked: (row: BlockRow) => boolean;
  },
): AggregatedRow[] {
  const out: AggregatedRow[] = [];
  let i = 0;
  while (i < rows.length) {
    // A marked row never joins a run (it keeps its own row, §6.5).
    if (opts.isMarked(rows[i] as BlockRow)) {
      const row = rows[i] as BlockRow;
      out.push({
        classId: row.classId,
        depth: row.depth,
        offset: offsets[i] ?? 0,
        heightPx: row.heightPx ?? row.estHeightPx,
        count: 1,
      });
      i++;
      continue;
    }
    const first = rows[i] as BlockRow;
    let j = i + 1;
    while (j < rows.length) {
      const cand = rows[j] as BlockRow;
      if (cand.classId !== first.classId || cand.depth !== first.depth) {
        break;
      }
      if (opts.isMarked(cand)) {
        break;
      }
      j++;
    }
    const runLen = j - i;
    if (runLen >= opts.aggregateMin) {
      let runH = 0;
      for (let k = i; k < j; k++) {
        const row = rows[k] as BlockRow;
        runH += row.heightPx ?? row.estHeightPx;
      }
      out.push({
        classId: first.classId,
        depth: first.depth,
        offset: offsets[i] ?? 0,
        heightPx: Math.min(runH, opts.aggregateMax * opts.medianPx),
        count: runLen,
      });
    } else {
      // Emit the run members individually (unmerged).
      for (let k = i; k < j; k++) {
        const row = rows[k] as BlockRow;
        out.push({
          classId: row.classId,
          depth: row.depth,
          offset: offsets[k] ?? 0,
          heightPx: row.heightPx ?? row.estHeightPx,
          count: 1,
        });
      }
    }
    i = j;
  }
  return out;
}
