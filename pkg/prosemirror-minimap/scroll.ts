/**
 * Scroll-mapping strategies (§6.4) and scroll-event discipline (§10.1).
 *
 * `proportional` is a pure unit-preserving lookup (or the container-trusted
 * ratio during drag); `precise` resolves the row's DOM rect and scrolls the
 * container so it lands at the equivalent offset, degrading to
 * `proportional` when the DOM is gone (null `nodeDOM`, §4.5).
 */


import type { BlockRow, MinimapView } from './types.js';
import { clamp } from './geometry.js';


/** Scroll geometry cached by the controller (§7.4 — read only at refresh). */
export interface ScrollGeometry {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** Reads live `scrollTop` — the only per-event read (§10.1). */
export function readScrollTop(container: HTMLElement): number {
  return container.scrollTop;
}

/** Full geometry read — refresh points only (§7.4). */
export function readGeometry(container: HTMLElement): ScrollGeometry {
  return {
    scrollTop: container.scrollTop,
    scrollHeight: container.scrollHeight,
    clientHeight: container.clientHeight,
  };
}

/**
 * `proportional` target scroll (§6.4): `targetScrollTop = rowCenterOffset`
 * in editor px — a pure unit-preserving lookup, no layout reads.
 */
export function proportionalScrollTop(rowCenter: number): number {
  return rowCenter;
}

/**
 * Container-trusted variant (§6.4), for drag: normalize through the real
 * scroll container when its height is trusted over the model's.
 */
export function proportionalScrollTopTrusted(
  rowCenter: number,
  total: number,
  geom: ScrollGeometry,
): number {
  const maxScroll = geom.scrollHeight - geom.clientHeight;
  const frac = total > 0
    ? clamp(rowCenter / total, 0, 1)
    : 0;
  return frac * maxScroll;
}

/** Structural DOM-rect host (testable headlessly; satisfied by HTMLElement). */
interface RectHost {
  getBoundingClientRect(): { top: number };
}

/**
 * Apply a `precise` snap (§6.4): resolve `row.pos` through `view.nodeDOM`
 * and scroll `container` so the row's real DOM top lands exactly where the
 * `proportional` result placed it in the window.
 *
 * Both sides of the subtraction share the same content origin: the row's
 * REAL content-space top (`container.scrollTop + rectTop − clientTop`,
 * which includes the container's content padding) minus the MODEL
 * viewport-relative offset (`rowTopEditorPx − fallback`, whose space starts
 * at row 0's top). When the model is accurate relative to that shared
 * origin the result equals `fallback` — the snap is a no-op — and with
 * model error `e` at the row the result differs by exactly `e`. (Note the
 * model's origin is row 0's top, not the container's border: a container
 * whose first row sits under `k` px of padding has realTop carrying +k vs.
 * the model's 0. `contentOriginPx` — the measured top of row 0 — removes
 * exactly that constant; callers without a measurement pass 0.)
 *
 * Degrades to `fallback` (the proportional result) when the DOM is gone.
 * Returns the scrollTop to apply (the caller clamps).
 */
export function preciseScrollTop(
  view: Pick<MinimapView, 'nodeDOM'>,
  container: { scrollTop: number } & RectHost,
  row: BlockRow,
  rowTopEditorPx: number,
  fallback: number,
  contentOriginPx = 0,
): number {
  const dom = view.nodeDOM(row.pos) as RectHost | null;
  if (dom !== null && typeof dom.getBoundingClientRect === 'function') {
    const rect = dom.getBoundingClientRect();
    const clientTop
      = container.getBoundingClientRect().top;
    // Real content-space top of the row, in the model's origin frame
    // (row 0's top = 0): the live offset minus the content origin.
    const realTop
      = container.scrollTop + (rect.top - clientTop) - contentOriginPx;
    // Viewport-relative offset the proportional result gave the row.
    const modelViewportOffset = rowTopEditorPx - fallback;
    const target = realTop - modelViewportOffset;
    if (Number.isFinite(target)) {
      return target;
    }
  }
  return fallback;
}

/** Clamp a scrollTop into the container's scrollable range. */
export function clampScrollTop(top: number, geom: ScrollGeometry): number {
  return clamp(top, 0, Math.max(0, geom.scrollHeight - geom.clientHeight));
}
