/**
 * Per-tabset pinned heights — the T7 "pin model": every tabset in a float
 * window OWNS its height (min==max constraints); the window's height is the
 * sum of its tabsets plus chrome, never adjusted directly, never
 * redistributed (behavior.spec.md HP4/HP6, B4–B6, A5/A8).
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * @ 94d4b8307e5f0db2a1b32e14ceb8754207a51f27
 */

import type { DockviewApi, DockviewGroupPanel } from 'dockview';

import { CONSTANTS } from './tokens.js';
import type { HeightsMap } from './persistence.js';



/**
 * The floating-group objects exposed by the component. Runtime-public but
 * TS-private in dockview (`api.component`); reached through one narrow,
 * documented hop per CONTRIBUTING.rst integration-surface rules.
 */
export interface FloatingGroupLike {
  readonly gridview: { readonly element: HTMLElement };
  readonly overlay: {
    readonly element: HTMLElement;
    position(bounds: {
      height?: number; width?: number; top?: number;
    }): void;
  };
}

interface ComponentWithFloatingGroups {
  readonly floatingGroups: readonly unknown[];
}

/**
 * Extract the component's floating groups from the api. The `component`
 * property is private in dockview's typings but a plain runtime property —
 * the only supported way to enumerate float windows and their overlays.
 */
export function floatingGroups(api: DockviewApi): FloatingGroupLike[] {
  // Narrow hop: DockviewApi.component is TS-private, runtime-public.
  // @ts-expect-error — private in dockview 7.0.4 typings; see header.
  const component: ComponentWithFloatingGroups | undefined = api.component;
  return (component?.floatingGroups ?? []) as FloatingGroupLike[];
}

/** Members of a float window, top-to-bottom (then left-to-right tiebreak). */
export function membersOf(api: DockviewApi, fp: FloatingGroupLike):
  DockviewGroupPanel[] {
  return api.groups
    .filter((g) => fp.gridview.element.contains(g.element))
    .sort((a, b) => {
      const ra = a.element.getBoundingClientRect();
      const rb = b.element.getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
}

/**
 * TRUE chrome = everything in the window that is not member content:
 * titlebar + borders (winH − gridview height) + one sash per inner edge.
 * Member rects can overflow the gridview when pins oversubscribe, so
 * chromeOf must NOT be derived from them (mock's measured-live rule).
 */
export function chromeOf(
  api: DockviewApi,
  fp: FloatingGroupLike,
): number {
  const wr = fp.overlay.element.getBoundingClientRect();
  const gv = fp.gridview.element.getBoundingClientRect();
  const n = membersOf(api, fp).length;
  return (wr.height - gv.height) + Math.max(0, n - 1) * CONSTANTS.sashSize;
}

/** Pin a tabset to an exact height (floor: MIN_TS_H, ±1px no-op guard). */
export function pinGroup(g: DockviewGroupPanel, h: number): number {
  const target = Math.max(CONSTANTS.MIN_TS_H, Math.round(h));
  if (Math.abs((g.minimumHeight ?? 0) - target) <= 1
    && Math.abs((g.maximumHeight ?? 0) - target) <= 1) {
    return target;
  }
  g.api.setConstraints({ minimumHeight: target, maximumHeight: target });
  return target;
}

/** Window := Σ member heights + chrome; position if drifted >1px. */
export function reconcileWindow(
  api: DockviewApi,
  fp: FloatingGroupLike,
  target?: number,
): void {
  const members = membersOf(api, fp);
  if (!members.length) {
    return;
  }
  if (!Number.isFinite(target ?? NaN)) {
    const sum = members.reduce(
      (r, g) => r + g.element.getBoundingClientRect().height, 0);
    target = Math.max(
      CONSTANTS.MIN_WIN_H,
      Math.round(sum + chromeOf(api, fp)),
    );
  }
  const cur = Math.round(fp.overlay.element.getBoundingClientRect().height);
  const settled = target ?? cur;
  if (Math.abs(settled - cur) > 1) {
    // A same-value position() is a no-op, so force a re-fit when only
    // constraints changed (all-pinned splitviews don't redistribute alone).
    fp.overlay.position({ height: settled });
    fp.overlay.position({ height: settled });
  }
}

/** Pin-then-fit: position to target sum → pin members → nudge. */
export function applyWindowHeights(
  api: DockviewApi,
  fp: FloatingGroupLike,
  heights: number[],
): void {
  const members = membersOf(api, fp);
  if (!members.length) {
    return;
  }
  const sum = heights.reduce((a, b) => a + b, 0);
  const target = Math.max(
    CONSTANTS.MIN_WIN_H,
    Math.round(sum + chromeOf(api, fp)),
  );
  const cur = Math.round(fp.overlay.element.getBoundingClientRect().height);
  if (target !== cur) {
    fp.overlay.position({ height: target });
  }
  members.forEach((g, i) => pinGroup(g, heights[i] ?? CONSTANTS.MIN_TS_H));
  if (target === cur) {
    fp.overlay.position({ height: target + 1 }); // force gridview re-fit
  }
}

export interface PinPassOptions {
  /**
   * Group → preset height (first-load seed). Runtime-created groups have no
   * preset and pin to their current rect (or existing constraints).
   */
  readonly presetHeights?: Readonly<Record<string, number>>;
  /** Called when heights are stable (persistence hook-point). */
  readonly onStable?: (heights: HeightsMap) => void;
}

/**
 * Maintenance pass over every float window: seed heights from (1) the
 * persisted map, (2) preset sizes, (3) current rendered rect — with the
 * SAMPLE GUARD: a member rect that disagrees with its own min==max
 * constraints is a transient mid-layout sample and must not be pinned.
 * Re-reconciles next frame to absorb the stock service's async inflation.
 */
export function pinAllWindows(
  api: DockviewApi,
  heightsMap: HeightsMap,
  options: PinPassOptions = {},
): void {
  const preset = options.presetHeights ?? {};
  for (const fp of floatingGroups(api)) {
    const members = membersOf(api, fp);
    if (!members.length) {
      continue;
    }
    const heights = members.map((g): number => {
      const saved: number | undefined = heightsMap[g.id];
      const presetH: number | undefined = preset[g.id];
      const rect = Math.round(g.element.getBoundingClientRect().height);
      if (!Number.isFinite(saved) && !Number.isFinite(presetH)) {
        const min = g.minimumHeight;
        if (Number.isFinite(min) && Math.abs(rect - min) > 1) {
          return min; // transient sample — keep the existing pin value
        }
      }
      if (saved !== undefined && Number.isFinite(saved)) {
        return saved;
      }
      if (presetH !== undefined && Number.isFinite(presetH)) {
        return presetH;
      }
      return rect;
    });
    const sum = heights.reduce((a, b) => a + b, 0);
    const gv = fp.gridview.element.getBoundingClientRect();
    const avail = Math.round(gv.height)
      - Math.max(0, members.length - 1) * CONSTANTS.sashSize;
    if (Math.abs(sum - avail) > 2) {
      applyWindowHeights(api, fp, heights);
    } else {
      members.forEach((g, i) => pinGroup(g, heights[i] ?? CONSTANTS.MIN_TS_H));
    }
    const gvEl = fp.gridview.element;
    requestAnimationFrame(() => {
      const fp2 = floatingGroups(api)
        .find((f) => f.gridview.element === gvEl);
      if (!fp2) {
        return;
      }
      const gv2 = fp2.gridview.element.getBoundingClientRect();
      const avail2 = Math.round(gv2.height)
        - Math.max(0, membersOf(api, fp2).length - 1) * CONSTANTS.sashSize;
      if (Math.abs(sum - avail2) > 2) {
        applyWindowHeights(api, fp2, heights);
      }
    });
  }
}

/**
 * Sample the stable per-group heights (SAMPLE GUARD: skip transient
 * mid-layout rects — a stable read matches the member's own min==max
 * constraints within 1px; persisting an oversubscribed frame would poison
 * the map and every later pass would re-apply the bad values).
 */
export function collectStableHeights(api: DockviewApi): HeightsMap {
  const out: HeightsMap = {};
  for (const fp of floatingGroups(api)) {
    for (const g of membersOf(api, fp)) {
      const rect = Math.round(g.element.getBoundingClientRect().height);
      const min = g.minimumHeight;
      const max = g.maximumHeight;
      if (Number.isFinite(min) && Number.isFinite(max)
        && Math.abs(rect - min) > 1) {
        continue; // transient
      }
      out[g.id] = rect;
    }
  }
  return out;
}
