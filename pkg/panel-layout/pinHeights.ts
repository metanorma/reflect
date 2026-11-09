/**
 * Per-tabset pinned heights — the T7 "pin model": every tabset in a float
 * window OWNS its height (min==max constraints); the window's height is the
 * sum of its tabsets plus chrome, never adjusted directly, never
 * redistributed (behavior.spec.md HP4/HP6, B4–B6, A5/A8).
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * @ 94d4b8307e5f0db2a1b32e14ceb8754207a51f27
 */

import type { DockviewApi, DockviewGroupPanel, SerializedDockview } from 'dockview';

import { CONSTANTS } from './tokens.js';
import type {
  HeightsMap,
  Persistence,
} from './persistence.js';
import type { WindowDragGate } from './windowDrag.js';



/**
 * The floating-group objects exposed by the component. Runtime-public but
 * TS-private in dockview (`api.component`); reached through one narrow,
 * documented hop per CONTRIBUTING.rst integration-surface rules.
 */
export interface FloatingGroupLike {
  readonly gridview: { readonly element: HTMLElement };
  readonly overlay: { readonly element: HTMLElement };
  /**
   * Panel-level bounds setter — the engine-true surface
   * (DockviewFloatingGroupPanel.position → overlay.setBounds; the mock
   * calls fp.position at every site). D15.
   */
  position(bounds: {
    height?: number; width?: number; top?: number;
  }): void;
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

/** A per-group height floor, derived from current members (§2.5). */
export type GroupFloor = (group: DockviewGroupPanel) => number;

/**
 * Pin a tabset to an exact height (floor: MIN_TS_H, ±1px no-op guard).
 * `floor` is the §2.5 registry-derived effective floor — it only ever
 * RAISES the global MIN_TS_H floor, never lowers it.
 */
export function pinGroup(g: DockviewGroupPanel, h: number, floor?: number): number {
  const target = Math.max(
    CONSTANTS.MIN_TS_H,
    Math.round(h),
    Math.max(0, Math.round(floor ?? 0)),
  );
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
    fp.position({ height: settled });
    fp.position({ height: settled });
  }
}

/** Pin-then-fit: position to target sum → pin members → nudge. */
export function applyWindowHeights(
  api: DockviewApi,
  fp: FloatingGroupLike,
  heights: number[],
  floorOf?: GroupFloor,
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
    fp.position({ height: target });
  }
  members.forEach((g, i) => pinGroup(
    g,
    heights[i] ?? CONSTANTS.MIN_TS_H,
    floorOf?.(g),
  ));
  if (target === cur) {
    fp.position({ height: target + 1 }); // force gridview re-fit
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
  /** §2.5 per-group floor (registry minHeight via current members). */
  readonly floorOf?: GroupFloor | undefined;
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
  const floorOf = options.floorOf;
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
      applyWindowHeights(api, fp, heights, floorOf);
    } else {
      members.forEach((g, i) => pinGroup(
        g,
        heights[i] ?? CONSTANTS.MIN_TS_H,
        floorOf?.(g),
      ));
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
        applyWindowHeights(api, fp2, heights, floorOf);
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


/* ---- registry floors (api.spec.md §2.5) ------------------------------- */

/** §2.5 `PanelRegistration.minHeight`, keyed by contentComponent. */
export type MinHeights = Readonly<Record<string, number>>;

/**
 * §2.5 effective tabset floor: `max(MIN_TS_H, max over current members)`
 * — registry `minHeight` only ever RAISES the global floor. Behavioral
 * policy is registry-authoritative and re-derived from live membership on
 * every pin, so user storage can never breach a floor (A5) and a group
 * whose members change inherits the new floor on the next pass.
 */
export function effectiveFloor(
  minHeights: MinHeights,
  contentComponents: readonly string[],
): number {
  let floor = CONSTANTS.MIN_TS_H;
  for (const key of contentComponents) {
    const h = minHeights[key];
    if (typeof h === 'number' && Number.isFinite(h) && h > floor) {
      floor = h;
    }
  }
  return floor;
}


/* ---- preset seeding (mock :763–771 `seedPresetHeights`) --------------- */

interface SerializedLeafNodeLike {
  readonly type?: unknown;
  readonly data?: unknown;
  readonly size?: unknown;
}

interface SerializedFloatingGroupLike {
  readonly grid?: { readonly root?: unknown } | null;
  readonly data?: unknown;
}

/**
 * Group id → intended first-load height, walked off a serialized layout's
 * `floatingGroups[].grid.root` leaves (the mock's `seedPresetHeights`:
 * the leaf `size` is the designed per-tabset height; membersOf rects are
 * post-distribution and would oversubscribe the chrome). Windows in the
 * legacy single-group `data` form contribute nothing — their group id is
 * not a stable key there (mock: the legacy branch never populates
 * PRESET_H). Absent `floatingGroups` → `{}`.
 */
export function collectPresetHeights(
  layout: SerializedDockview | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  const groups = layout?.floatingGroups;
  if (!Array.isArray(groups)) {
    return out;
  }
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) {
      return;
    }
    const leaf = node as SerializedLeafNodeLike;
    if (leaf.type !== 'leaf') {
      if (Array.isArray(leaf.data)) {
        leaf.data.forEach(walk);
      }
      return;
    }
    const data = leaf.data;
    const id = typeof data === 'object' && data !== null
      ? (data as { id?: unknown }).id
      : undefined;
    if (typeof id !== 'string') {
      return;
    }
    const size = leaf.size;
    if (typeof size === 'number' && Number.isFinite(size)) {
      out[id] = size;
    }
  };
  for (const fg of groups) {
    if (typeof fg !== 'object' || fg === null) {
      continue;
    }
    const root = (fg as SerializedFloatingGroupLike).grid?.root;
    walk(root);
  }
  return out;
}


/* ---- wiring (api.spec.md §3 module 3, §2.3 settled signals) ----------- */

/**
 * §2.3 settled emission — the library-composed signal shape the built-in
 * persistence subscribes to. The wiring hook produces exactly the two
 * sources its nets can see: `'layout'` (a mutate transaction / window-drag
 * release) and `'heights'` (a takeover-drag commit, which fires no
 * layout-change event at all).
 */
export interface PinnedHeightsSettledEvent {
  readonly source: 'layout' | 'heights';
  readonly origin: 'user' | 'api';
}

/**
 * The rAF seam, injected for the Node tests (the mock's
 * `window.__mnPinRaf` cancel-then-schedule discipline, mock :1336–1341).
 * A handle is returned per schedule so pending work stays cancellable.
 */
export interface PassScheduler {
  schedule(cb: () => void): () => void;
}

const rafScheduler = (): PassScheduler => ({
  schedule(cb) {
    const id = requestAnimationFrame(cb);
    return () => cancelAnimationFrame(id);
  },
});

/** api.spec.md §2.5 `minHeight` keyed by `contentComponent` (the registry key). */
export interface PinnedHeightsOptions {
  /** The live engine api (call from `onReady`, after the layout is loaded). */
  readonly api: DockviewApi;
  /**
   * Default layout — source of the first-load preset seed
   * (`collectPresetHeights`); omit when the consumer has no preset.
   */
  readonly defaultLayout?: SerializedDockview;
  /**
   * Persistence facade (task 2). Omit → no persistence; the wiring still
   * maintains pins and emits settled signals. Seeding reads
   * `loadHeights()`; passes write `saveLayout` + `saveHeights`; takeover
   * commits write `saveHeights` only (HP6 — no layout event fires).
   */
  readonly persistence?: Persistence;
  /**
   * Window-drag gate (module 5's `WindowDragGate`); share one instance
   * with the containment wiring. Omit → the pass runs ungated (not the
   * mock's wiring — provided for tests and non-drag consumers).
   */
  readonly gate?: WindowDragGate;
  /**
   * §2.5 per-group floor — the caller-provided alternative to `minHeights`:
   * a closure (module 1 passes `registrySeams(...).floorOf`, re-derived
   * from the live registry per call). Provided `floorOf` wins; otherwise
   * the wiring derives the same closure from the `minHeights` snapshot.
   */
  readonly floorOf?: GroupFloor | undefined;
  /** §2.5 registry `minHeight` floors, keyed by contentComponent. */
  readonly minHeights?: MinHeights;
  /** §2.3 settled signal (one emit per net). */
  readonly onDidSettled?: (event: PinnedHeightsSettledEvent) => void;
  /** rAF seam; default the DOM's requestAnimationFrame. */
  readonly scheduler?: PassScheduler;
}

export interface PinnedHeightsHandle {
  /** Stop the wiring: cancels pending passes, unwires every subscription. */
  dispose(): void;
  /**
   * Takeover-drag commit (§2.3 net 2, mock :977–985): adopt stable heights
   * measured after `reconcileWindow`, persist them, emit `'heights'`.
   * This is the `onCommit` callback `wireTabsetEdges` expects.
   */
  commitHeights(heights: HeightsMap): void;
  /** The current in-memory heights map (the pin pass's seed). */
  heights(): HeightsMap;
}

/**
 * Wire the pin pass into an api: seed preset/persisted heights, run the
 * maintenance pass on layout change (rAF-debounced, like the mock), gated
 * off during live window drags (F4), and persist via a `Persistence`
 * instance on §2.3 settled signals.
 *
 * Named `usePinnedHeights` per the api.spec.md §3 inventory, but it is a
 * framework-AGNOSTIC wiring function, not a React hook — module 1
 * (`PanelLayout`) calls it inside `onReady` and disposes on unmount.
 */
export function usePinnedHeights(
  options: PinnedHeightsOptions,
): PinnedHeightsHandle {
  const { api } = options;
  const scheduler = options.scheduler ?? rafScheduler();
  const presetHeights = collectPresetHeights(options.defaultLayout);
  const minHeights = options.minHeights ?? {};
  // §2.5 floor seam: a caller-provided `floorOf` (live) wins; otherwise
  // the same closure derived from the `minHeights` snapshot (wiring-time).
  const floorOf: GroupFloor | undefined = options.floorOf
    ?? (Object.keys(minHeights).length
      ? (group) => effectiveFloor(
        minHeights,
        group.panels.map((p) => p.view.contentComponent),
      )
      : undefined); // no registry floors → pin at the global MIN_TS_H floor only

  // The pin pass's seed: persisted user heights (A5), else preset sizes.
  // `loadHeights()` returns `{}` for absent/corrupt storage (A7 semantics).
  let heightsMap: HeightsMap = options.persistence
    ? options.persistence.loadHeights()
    : {};

  let disposed = false;
  let cancelPending: (() => void) | null = null;
  // §2.3 "one emit per net": a mutate/release marks the NEXT flush; a
  // flush without a pending net (a layout-change re-fire, or the
  // constraint-driven re-fit inside the pass itself) emits nothing.
  let pendingSettled: PinnedHeightsSettledEvent | null = null;

  const emit = (event: PinnedHeightsSettledEvent): void => {
    if (!options.onDidSettled || disposed) {
      return;
    }
    try {
      options.onDidSettled(event);
    } catch {
      // swallowed — a consumer callback must not break the wiring
    }
  };

  const flushSettled = (): void => {
    if (pendingSettled) {
      const event = pendingSettled;
      pendingSettled = null;
      emit(event);
    }
  };

  /** The debounced maintenance pass (mock :1337–1341 body). */
  const runPass = (): void => {
    cancelPending?.();
    cancelPending = null;
    pinAllWindows(api, heightsMap, { presetHeights, floorOf });
    // A8: rebuild from live members — ids of closed windows drop out.
    heightsMap = collectStableHeights(api);
    options.persistence?.saveLayout(api);
    options.persistence?.saveHeights(heightsMap);
    flushSettled();
  };

  const schedulePass = (): void => {
    if (disposed) {
      return;
    }
    cancelPending?.();
    cancelPending = scheduler.schedule(() => {
      cancelPending = null;
      runPass();
    });
  };

  // §2.3 net 1 — dockview's mutate bracket. onDidLayoutChange is an
  // AsapEvent (microtask-buffered), so the mutate event always lands
  // BEFORE the change-driven pass runs; the pending origin is the last
  // transaction's, and compound mutations collapse into one.
  const onMutate = (event: { readonly origin?: 'user' | 'api' }): void => {
    pendingSettled = {
      source: 'layout',
      origin: event.origin === 'api' ? 'api' : 'user',
    };
  };

  // The maintenance pass (mock :1327–1342): gate first (F4), then the
  // debounced pin + save. Saves live INSIDE the pass — settle-observable
  // storage is identical to the mock's synchronous save (captures read
  // post-settle) and a mid-drag save can no longer race the gate.
  const onLayoutChange = (): void => {
    if (options.gate?.isLive()) {
      return;
    }
    schedulePass();
  };

  // §2.3 net 3 — window-drag release. Order-independent vs. the overlay's
  // own pointerup listener (which fires the change event): whichever runs
  // first, the pending 'layout' net is set and the gate is retired by the
  // time the scheduled pass runs.
  const unwires: Array<() => void> = [
    api.onDidLayoutChange(onLayoutChange),
    api.onDidMutateLayout(onMutate),
    options.gate
      ? options.gate.wire({
        onDragEnd: () => {
          pendingSettled = { source: 'layout', origin: 'user' };
          schedulePass(); // defensive: the change event may already have run
        },
      })
      : null,
  ].filter((unwire): unwire is () => void => unwire !== null);

  // Init (mock :1323–1349): saveLayout once (HP1's immediate first write —
  // heights stay absent until the first change), then the synchronous
  // first pin pass (A4 settle). No saveHeights here: the first pass
  // persists whatever the seed produced, on the next change.
  options.persistence?.saveLayout(api);
  pinAllWindows(api, heightsMap, { presetHeights, floorOf });

  // §2.3 note: `fromJSON` is a single 'load' transaction, but this wiring
  // subscribes AFTER the consumer has loaded the layout (it is called from
  // onReady), so that transaction's mutate event predates the subscription
  // and can never be observed. The flush below stands in for it: one
  // settled 'layout'/'api' emission for the load, matching the emission a
  // subscribed-from-the-start wiring would have produced.
  pendingSettled = { source: 'layout', origin: 'api' };
  flushSettled();

  return {
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      cancelPending?.();
      cancelPending = null;
      pendingSettled = null;
      for (const unwire of unwires) {
        unwire();
      }
    },
    commitHeights(heights) {
      if (disposed) {
        return;
      }
      // Takeover drags fire no layout-change event; adopting the map here
      // (rather than re-collecting) honors the caller's stable read.
      heightsMap = { ...heights };
      options.persistence?.saveHeights(heightsMap);
      emit({ source: 'heights', origin: 'user' });
    },
    heights() {
      return { ...heightsMap };
    },
  };
}


