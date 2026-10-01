/**
 * Adaptive tiers and aggregation inputs (§6.5).
 *
 * The renderer's per-row fidelity degrades with row count so the model's
 * row count — and the paint work — stays bounded at any document size.
 *
 * Tier-3 run planning itself lives in `renderer.ts` (`planPaint`'s
 * aggregated-rows pass): it aggregates over the renderer's mirror arrays
 * on the paint path, which is what keeps tier-3 paint allocation-free.
 * This module supplies the selection/hysteresis policy and the
 * aggregate-height cap input (`medianRowPx`).
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
