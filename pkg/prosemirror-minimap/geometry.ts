/**
 * Prefix-sum offsets, window mapping, and row lookup (§6.1–§6.4).
 *
 * All offsets live in **editor-space pixels** (§4.2): the minimap is a
 * uniform scale over editor space (§6.2), so window math is a direct range
 * lookup with no proportional normalization.
 */

import type { BlockRow, DisplayMode } from './types.js';


/** Effective height of a row: `heightPx ?? estHeightPx` (§4.2). */
export function effectiveHeight(row: BlockRow): number {
  return row.heightPx ?? row.estHeightPx;
}

/**
 * Prefix-sum over effective heights (§6.1).
 *
 * `offsets` is a `Float64Array` of length `rows + 1`; `offsets[i]` is the
 * top of row `i` in editor-space px; `total = offsets[rows]` is the model's
 * predicted document height.
 */
export function sumOffsets(rows: readonly BlockRow[]): Float64Array {
  const offsets = new Float64Array(rows.length + 1);
  let acc = 0;
  for (let i = 0; i < rows.length; i++) {
    offsets[i] = acc;
    acc += effectiveHeight(rows[i] as BlockRow);
  }
  offsets[rows.length] = acc;
  return offsets;
}

/**
 * Incremental re-sum (§6.1): re-sum from `firstChanged`; every offset after
 * it shifts by the cumulative delta — a single subtraction pass. Mutates and
 * returns the same array when sizes match, so callers hold one live buffer.
 */
export function reSum(
  offsets: Float64Array,
  rows: readonly BlockRow[],
  firstChanged: number,
): { offsets: Float64Array; total: number } {
  if (offsets.length !== rows.length + 1) {
    const fresh = sumOffsets(rows);
    return { offsets: fresh, total: fresh[rows.length] ?? 0 };
  }
  let acc = offsets[firstChanged] ?? 0;
  for (let i = firstChanged; i < rows.length; i++) {
    offsets[i] = acc;
    acc += effectiveHeight(rows[i] as BlockRow);
  }
  offsets[rows.length] = acc;
  return { offsets, total: acc };
}

/**
 * Binary search: the index of the row whose offset range contains `offset`
 * (§6.1). Returns `-1` for an empty model; `total` maps to the last row.
 */
export function rowAt(offsets: Float64Array, offset: number): number {
  if (offsets.length <= 1) {
    return -1;
  }
  if (offset < 0) {
    return 0;
  }
  // Upper bound over row tops [0, rows): first top > offset, minus one.
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((offsets[mid] ?? 0) <= offset) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo - 1;
}

/**
 * The row range `[first, last]` intersecting the editor window
 * `[windowTop, windowBottom]` (§6.3), widened by `overscan` rows.
 */
export function windowRange(
  offsets: Float64Array,
  windowTop: number,
  windowBottom: number,
  overscan: number,
): { first: number; last: number } {
  const rows = offsets.length - 1;
  if (rows <= 0) {
    return { first: 0, last: -1 };
  }
  const total = offsets[rows] ?? 0;
  const top = clamp(windowTop, 0, total);
  const bottom = clamp(windowBottom, top, total);
  const first = Math.max(0, rowAt(offsets, top) - overscan);
  const last = Math.min(rows - 1, rowAt(offsets, bottom) + overscan);
  return { first, last };
}

/** Clamp `v` into `[min, max]`. */
export function clamp(v: number, min: number, max: number): number {
  return v < min
    ? min
    : v > max
      ? max
      : v;
}

/**
 * Fit-mode scale (§6.2): `containerHeight / extent`, clamped so no row
 * paints below the theme's `rowHeight` floor — and never below 1 device px
 * — mirroring the production minimaps that survive unbounded documents by
 * never rendering less than a pixel per row.
 *
 * The extent is `max(model total, real scrollHeight)`: the surface must
 * span the REAL scrollable extent for the thumb's geometry to be exact —
 * the thumb at the track's bottom maps to `maxScroll` and its height to
 * the viewport's true share — even while the model under-predicts by the
 * container's paddings (no row owns them) or by unsampled estimates. The
 * `max` keeps an over-predicting model from shrinking rows past the
 * track's end.
 */
export function fitScale(
  total: number,
  containerHeight: number,
  minRowPx: number,
  rowHeight: number,
  realExtent = 0,
): number {
  const extent = Math.max(total, realExtent);
  if (extent <= 0 || containerHeight <= 0 || minRowPx <= 0) {
    return 1;
  }
  const raw = containerHeight / extent;
  return Math.max(raw, rowHeight / minRowPx, 1 / minRowPx);
}

/**
 * Scale/mode resolution (§6.2). `auto` selects `fit` when
 * `zoom × total ≤ containerHeight`, `sliding` otherwise.
 */
export function resolveScale(
  display: DisplayMode,
  zoom: number,
  total: number,
  containerHeight: number,
  minRowPx: number,
  rowHeight: number,
  realExtent = 0,
): { scale: number; mode: 'fit' | 'sliding' } {
  if (display === 'fit') {
    return {
      scale: fitScale(total, containerHeight, minRowPx, rowHeight, realExtent),
      mode: 'fit',
    };
  }
  if (display === 'sliding' || zoom * total > containerHeight) {
    return { scale: zoom, mode: 'sliding' };
  }
  return {
    scale: fitScale(total, containerHeight, minRowPx, rowHeight, realExtent),
    mode: 'fit',
  };
}
