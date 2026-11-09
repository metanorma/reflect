/**
 * `<PanelLayout>` — the front door (api.spec.md §2.1, §3 module 1): renders
 * `DockviewReact` with every behavior module wired, translating the mock's
 * `onReady` (:1321–1503) into the composition of the nine sibling modules.
 *
 * The component itself is deliberately thin: every piece of behavior lives
 * in its owning module (see the composition map below); this file owns only
 * the wiring ORDER, the option split (D26), and the two §2.2 callbacks.
 * Composition seams and their decisions:
 *
 * - persistence (module 2) — `two-key` format pins the mock's storage shape;
 *   `onFallback` relays as `onDidFallback` (D5).
 * - pin pass (module 3) — `usePinnedHeights` called from onReady (D6), with
 *   the window-drag gate shared with module 5 (F4) and registry floors
 *   derived per call from the live registry (§2.5).
 * - window-drag gate (module 5) — created with `retireFirst` from module 4's
 *   drop rules (D11 gate order: retire → unwrap fallback → sweep →
 *   normalize → subscribers), and the pin pass subscribes via `wire()`
 *   (D14: onDragEnd notifications land AFTER the retire sequence, so net-3
 *   scheduling always postdates the unwrap).
 * - drag takeover (module 6) — `wireTabsetEdges({onCommit})` where commit is
 *   `PinnedHeightsHandle.commitHeights` (D16: pointerup reconciles, then
 *   persists heights only — takeover drags fire no layout-change event).
 * - drop rules (module 4) — `useDropRules` self-subscribes (D6 pattern) and
 *   returns `retireFirst` for the gate.
 * - titlebar chrome (module 7) — `watchTitlebars` with the layout container
 *   as root (D21), shipping the grip decoration and move-only enforcement.
 * - error boundary (module 8) — every registry component passes through
 *   `wrapPanelComponent` (D23: reads props.api.id, renders consumer as the
 *   boundary child).
 * - focus (module 9) — `splitDockviewOptions` owns dndStrategy/
 *   floatingGroupBounds/floatingGroupDragHandle/
 *   transformFloatingGroupDrag (D26); `wireFocusRestoration`
 *   closes G5; the G6 convergence amendment queues a focus call at module
 *   4's claim seam (a follow-up panel unwrap focuses the minted window).
 * - theming (module 10) — the container carries `layoutArea` so
 *   panel-layout.css applies (D30); focus.css is linked by the consumer
 *   (the mock links both).
 *
 * NOT ported from the mock (demo-consumer territory, §3): the toolbar, the
 * statusbar, the boot overlay, the 11 demo panels, `presetLayout`, the
 * Reset button (restore-to-default is a library capability the demo calls:
 * persistence.clear() + api.clear() + fromJSON(default) + pinAllWindows).
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * @ 94d4b8307e5f0db2a1b32e14ceb8754207a51f27
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FC } from 'react';
import {
  DockviewReact,
  DockviewDefaultTab,
} from 'dockview-react';
import type { IDockviewReactProps } from 'dockview-react';
import type {
  DockviewApi,
  DockviewEvent,
  DockviewOptions,
  DockviewReadyEvent,
  IDockviewPanelProps,
  SerializedDockview,
} from 'dockview';

import {
  DEFAULT_ENVELOPE_KEY,
  createPersistence,
} from './persistence.js';
import type {
  Persistence,
  PersistenceOptions,
} from './persistence.js';
import {
  collectPresetHeights,
  effectiveFloor,
  pinAllWindows,
  usePinnedHeights,
} from './pinHeights.js';
import type {
  GroupFloor,
  MinHeights,
  PinnedHeightsHandle,
  PinnedHeightsOptions,
} from './pinHeights.js';
import { wireTabsetEdges } from './dragTakeover.js';
import { createWindowDragGate } from './windowDrag.js';
import type { WindowDragGate } from './windowDrag.js';
import { useDropRules } from './unwrap.js';
import { watchTitlebars } from './titlebar.js';
import { wrapPanelComponent } from './panelErrorBoundary.js';
import { splitDockviewOptions, wireFocusRestoration } from './focus.js';
import type { FocusRestoration } from './focus.js';


/* ---- §2.5 registry ----------------------------------------------------- */

export interface PanelRegistration {
  /** Consumer panel; rendered inside the fixed-height D1/D2 box. */
  readonly component: FC<IDockviewPanelProps>;
  /** Default tab title (precedence: layout → registry → panel id, E2). */
  readonly title?: string;
  /** false → this panel never enters a float window (F3). Default true. */
  readonly floatable?: boolean;
  /**
   * Content-height floor for tabsets hosting this panel; effective floor is
   * max(MIN_TS_H, max over current members) — it only ever raises the
   * global floor. Default MIN_TS_H.
   */
  readonly minHeight?: number;
}

/** Key = dockview `contentComponent` name (the serialized field). */
export type PanelRegistry = Record<string, PanelRegistration>;

/**
 * §2.5 — panel ids that must never enter a float window, re-derived from
 * the CURRENT registry on every read so it cannot drift from the registry
 * (F3). Never serialized.
 */
export function floatExcludedPanels(
  registry: PanelRegistry,
): ReadonlySet<string> {
  const out = new Set<string>();
  for (const key of Object.keys(registry)) {
    if (registry[key]?.floatable === false) {
      out.add(key);
    }
  }
  return out;
}

/**
 * §2.5 registry `minHeight` view, keyed by contentComponent (the registry
 * key). Only finite numbers participate; the pin pass and the takeover drag
 * derive the same `GroupFloor` from it, re-read per call (`registrySeams`).
 */
export function registryMinHeights(
  registry: PanelRegistry,
): MinHeights {
  const out: Record<string, number> = {};
  for (const key of Object.keys(registry)) {
    const h = registry[key]?.minHeight;
    if (typeof h === 'number' && Number.isFinite(h)) {
      out[key] = h;
    }
  }
  return out;
}

/** Registry → engine `components` map, each consumer wrapped (D23, C3). */
function registryComponents(registry: PanelRegistry): Record<
  string,
  FC<IDockviewPanelProps>
> {
  const out: Record<string, FC<IDockviewPanelProps>> = {};
  for (const key of Object.keys(registry)) {
    const registration = registry[key];
    if (registration) {
      out[key] = wrapPanelComponent(registration.component);
    }
  }
  return out;
}

/**
 * §2.5 live seams over a registry getter: the float-exclusion id set and
 * the per-group height floor, both re-read from the CURRENT registry on
 * every call. `wirePanelLayout` feeds them the component's registry ref
 * (the registry sibling of the autoWrap ref), so a registry prop change
 * re-derives policy without re-wiring — the seams cannot drift from the
 * registry the way a wiring-time snapshot could. The floor is always
 * built: an empty `minHeight` view yields `effectiveFloor({})` =
 * MIN_TS_H, the same floor an omitted seam produces, so the always-on
 * closure changes nothing for floor-less registries.
 */
export function registrySeams(
  getRegistry: () => PanelRegistry,
): {
  /** The `useDropRules` getter — panel ids excluded from float windows. */
  readonly floatExcludedPanelIds: () => ReadonlySet<string>;
  /** The `GroupFloor` the pin pass, the HP9 net, and the takeover share. */
  readonly floorOf: GroupFloor;
} {
  return {
    floatExcludedPanelIds: () => floatExcludedPanels(getRegistry()),
    floorOf: (group) => effectiveFloor(
      registryMinHeights(getRegistry()),
      group.panels.map((p) => p.view.contentComponent),
    ),
  };
}


/* ---- §2.2 event surface ------------------------------------------------ */

export type PanelLayoutFallbackReason =
  | 'layout-corrupt'        // A6
  | 'heights-corrupt'       // A7
  | 'layout-restore-threw'  // A9
  | 'storage-unavailable';  // C2 (once, on first write failure)

export interface PanelLayoutFallbackEvent {
  readonly reason: PanelLayoutFallbackReason;
  readonly message?: string;
}

/** §2.3 settled emission — one per net, composed by the pin-pass wiring. */
export interface PanelLayoutSettledEvent {
  /**
   * 'layout'  — the serialized layout changed (structure/positions; heights
   *             may have changed too).
   * 'heights' — only pinned heights changed (takeover drags fire no
   *             layout-change event).
   */
  readonly source: 'layout' | 'heights';
  /** 'user' = direct manipulation; 'api' = programmatic. */
  readonly origin: 'user' | 'api';
}

export interface PanelLayoutReadyEvent {
  /** The engine api extended with the library-composed settled signal. */
  readonly api: PanelLayoutApi;
}

export type PanelLayoutApi = DockviewApi & {
  /** Library-composed settled signal (§2.3). */
  readonly onDidLayoutSettled: DockviewEvent<PanelLayoutSettledEvent>;
};

export interface PanelLayoutProps {
  /** Panel registry; key = dockview `contentComponent` name (§2.5). */
  readonly registry: PanelRegistry;
  /** Default layout used when storage is empty or corrupt (A6/A7). */
  readonly defaultLayout: SerializedDockview;
  /** Omit → no persistence. */
  readonly persistence?: PersistenceOptions;
  /** Auto-wrap undock on empty-space drops; default true (HP2/HP7). */
  readonly autoWrap?: boolean;
  /**
   * Engine option passthrough. The library owns `dndStrategy`,
   * `floatingGroupBounds`, `floatingGroupDragHandle`,
   * `transformFloatingGroupDrag` — consumer values for those four are
   * ignored (§2.1/D26). The component also always renders the stock
   * dockview-react tab (`defaultTabComponent: DockviewDefaultTab`): a
   * react-layer prop, outside this passthrough contract, forced because
   * G1/G3/HP10 target the stock tab.
   */
  readonly dockviewOptions?: Partial<DockviewOptions>;
  readonly onReady: (event: PanelLayoutReadyEvent) => void;
  readonly onDidFallback?: (event: PanelLayoutFallbackEvent) => void;
}


/* ---- §2.3 settled emitter (one per net) -------------------------------- */

/**
 * Minimal multicast emitter for `onDidLayoutSettled`. The engine's `Emitter`
 * is core-only (the runtime-import rule keeps `dockview-core` type-only),
 * so the library composes its own; the surface matches `DockviewEvent<T>`
 * (a callable returning `DockviewIDisposable`).
 */
function createSettledEmitter(): {
  readonly event: DockviewEvent<PanelLayoutSettledEvent>;
  fire(event: PanelLayoutSettledEvent): void;
  dispose(): void;
} {
  const listeners = new Set<(e: PanelLayoutSettledEvent) => void>();
  let disposed = false;
  return {
    event(listener: (e: PanelLayoutSettledEvent) => void) {
      listeners.add(listener);
      return {
        dispose() {
          listeners.delete(listener);
        },
      };
    },
    fire(event) {
      if (disposed) {
        return;
      }
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch {
          // a consumer callback must not break the settle net
        }
      }
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}


/**
 * The pin-pass handle with the library-composed settled signal attached:
 * `settledEvent` is the `onDidLayoutSettled` surface (§2.3), and it lives
 * exactly as long as this wiring — `dispose()` tears the emitter and the
 * pin wiring down together, so subscriptions made during OR after the
 * consumer's `onReady` keep receiving nets until the layout unmounts.
 */
export interface SettledPinPass extends PinnedHeightsHandle {
  /** §2.3 signal — multicast, one disposable per subscription. */
  readonly settledEvent: DockviewEvent<PanelLayoutSettledEvent>;
}

/**
 * The pin pass with the §2.3 settled signal composed onto it: every net
 * the wiring observes — the mutate/release bracket and the takeover
 * commit — forwards to `settledEvent`, one emission per net. This is
 * module 1's only DOM-free §2.3 seam, kept separate from
 * `wirePanelLayout` (whose titlebar/takeover/gate modules are
 * browser-only) so the composition is exercisable headless;
 * `wirePanelLayout` is its only caller and attaches `settledEvent` to
 * the api as `onDidLayoutSettled`.
 */
export function wireSettledPinPass(
  options: Omit<PinnedHeightsOptions, 'onDidSettled'>,
): SettledPinPass {
  const settled = createSettledEmitter();
  const pins = usePinnedHeights({
    ...options,
    onDidSettled: (event) => settled.fire(event),
  });
  return {
    commitHeights: (heights) => pins.commitHeights(heights),
    heights: () => pins.heights(),
    settledEvent: settled.event,
    dispose() {
      // Emitter first: nothing reaches consumers mid-teardown.
      settled.dispose();
      pins.dispose();
    },
  };
}


/* ---- persistence facade (§2.3 layout-save timing) ---------------------- */

/**
 * The wiring's persistence facade: the `Persistence` the pin pass sees,
 * plus the synchronous layout net's write seam. ONE `createPersistence`
 * instance backs both nets — envelope-mode writes carry both halves from
 * one shared last-known-good memory, so a heights-only save pairs with
 * the freshest saved layout and a layout save keeps the current heights.
 * (Two instances with independent memory corrupt the envelope: heights
 * saves pair with an init-frozen layout half, layout saves blank the
 * heights half to `{}`.)
 */
export interface WiringPersistence extends Persistence {
  /**
   * The component's synchronous layout net (§2.3): writes through the
   * shared instance, bypassing (and retiring) the init-once
   * pass-through of `saveLayout`.
   */
  saveLayoutNow(api: DockviewApi): SerializedDockview | null;
}

/**
 * Build the facade over ONE `createPersistence` instance. `saveLayout`
 * lets the wiring's INIT write through once (HP1's immediate first save,
 * from the pin pass's init) and is a no-op afterwards — the debounced
 * pass's re-saves are suppressed; layout saves belong to the synchronous
 * change-event net, whose write is `saveLayoutNow`. Exported for the
 * Node wiring tests (`tests/persistence-wiring.test.mjs`); not on the
 * public or dev re-export surfaces.
 */
export function createWiringPersistence(
  persistence: PersistenceOptions,
  onDidFallback: ((event: PanelLayoutFallbackEvent) => void) | undefined,
): WiringPersistence {
  const base = createPersistence({
    ...persistence,
    onFallback: (event) => {
      onDidFallback?.(event);
      persistence.onFallback?.(event);
    },
  });
  let initSaveDone = false;
  return {
    saveLayout: (api) => {
      // Init write passes through (HP1); the debounced pass's re-saves
      // are suppressed — the synchronous net owns layout saves.
      if (initSaveDone) {
        return null;
      }
      initSaveDone = true;
      return base.saveLayout(api);
    },
    saveLayoutNow: (api) => {
      // Always writes through the shared instance; whichever write comes
      // first retires the init pass-through (in wiring order that is
      // always HP1's init write inside the pin pass).
      initSaveDone = true;
      return base.saveLayout(api);
    },
    loadLayout: () => base.loadLayout(),
    saveHeights: (h) => base.saveHeights(h),
    loadHeights: () => base.loadHeights(),
    clear: () => base.clear(),
  };
}

/* ---- A9: fromJSON net -------------------------------------------------- */

/**
 * `fromJSON` with the A9 net: a structurally bad saved layout makes dockview
 * log 'failed to deserialize layout. Reverting changes', clear, and rethrow
 * (behavior.spec.md A9). The component catches, signals
 * `layout-restore-threw`, and restores the default layout — the spec's
 * `min:` recovery (`fromJSON(presetLayout())`).
 */
function restoreLayout(
  api: DockviewApi,
  layout: SerializedDockview | null,
  fallbackLayout: SerializedDockview,
  onFallback: ((event: PanelLayoutFallbackEvent) => void) | undefined,
): void {
  const target = layout ?? fallbackLayout;
  try {
    api.fromJSON(target);
  } catch (e) {
    try {
      onFallback?.({
        reason: 'layout-restore-threw',
        message: e instanceof Error ? e.message : 'fromJSON threw',
      });
    } catch {
      // consumer callback throws are swallowed
    }
    api.fromJSON(fallbackLayout);
  }
}


/* ---- the wiring (the mock's onReady, translated) ------------------------ */

interface Wired {
  /** §2.3 settled signal — lives exactly as long as the wiring. */
  readonly settledEvent: DockviewEvent<PanelLayoutSettledEvent>;
  dispose(): void;
}

/**
 * Everything the mock's `onReady` established (:1321–1503), composed from
 * the sibling modules in the mock's order:
 *
 *  1. persistence (`loadLayout()` — A6/A7 silent fallback)
 *  2. `fromJSON(loadLayout() || defaultLayout)` — through the A9 net; the
 *     pin wiring's init `saveLayout` (HP1's immediate write, D8) and its
 *     synchronous first pin pass (A4 settle) run inside `usePinnedHeights`,
 *     which is created AFTER the restore exactly like the mock's
 *     `fromJSON(...); saveLayout(api); pinAllWindows(api)` sequence
 *  3. the drop rules (claim + vetoes + suppression + the groupDragLive
 *     latch), which also hand `retireFirst` to the gate
 *  4. the window-drag gate (created with `retireFirst`; listeners attach at
 *     creation, like the mock's mount-time `wireWindowDragTracking`)
 *  5. the pin-pass wiring (`usePinnedHeights` — seeds from persistence,
 *     subscribes to the change/mutate events, gates on the drag session,
 *     persists inside the debounced pass)
 *  6. `watchTitlebars` (immediate paint + MutationObserver + interval net)
 *  7. `wireTabsetEdges` (the takeover drag; `onCommit` = commitHeights)
 *  8. `wireFocusRestoration` (G5) + the G6 unwrap-focus observer
 */
function wirePanelLayout(
  api: DockviewApi,
  options: {
    readonly container: HTMLElement | null;
    readonly registry: () => PanelRegistry;
    readonly defaultLayout: SerializedDockview;
    readonly persistence?: PersistenceOptions;
    readonly autoWrap: () => boolean;
    readonly onDidFallback?: (event: PanelLayoutFallbackEvent) => void;
  },
): Wired {
  const disposers: Array<() => void> = [];
  const dispose = (): void => {
    for (const d of disposers.splice(0)) {
      try {
        d();
      } catch {
        // teardown must not throw
      }
    }
  };

  // Layout-area element: the container the component rendered (`.layoutArea`
  // in the mock). Falls back to the document query the modules' defaults
  // use (windowDrag's `.layoutArea` sweep; a null container keeps the
  // toggle/claim guards declining exactly like the mock's `if (area)`).
  const areaEl = options.container;
  const layoutArea = (): HTMLElement | null =>
    (areaEl ?? document.querySelector('.layoutArea'));

  // ---- §2.5 registry seams (live) ----------------------------------------
  // One construction shared by the drop rules (exclusion set), the pin
  // pass, the HP9 reset net, and the takeover drag (floors); every read
  // re-derives from the registry the getter returns — the component keeps
  // it pointing at the current prop, so registry changes post-mount take
  // effect without re-wiring (the engine `components` map re-renders
  // independently; the two can no longer disagree).
  const seams = registrySeams(options.registry);

  // ---- persistence (module 2) ------------------------------------------
  //
  // LAYOUT-SAVE TIMING (the mock's exact discipline, goldens-pinned): the
  // mock saved the layout SYNCHRONOUSLY once after the restore (mock :1326)
  // and then again at every layout-change event (:1327–1328), while heights
  // + pins ride the rAF-debounced pass (:1337–1341). The pin wiring (D8)
  // runs BOTH saves inside its debounced pass — settle-equivalent for
  // heights, but the stored LAYOUT then reflects post-pin window geometry,
  // and the goldens pin the pre-pin values (hp2 stores the source window at
  // its pre-shrink height 484 while the live rect has already re-pinned to
  // 236; hp1 stores the preset's 450/602 while the live rects are 484/634).
  // The mock's timing is what the captured storage IS, so the component
  // restores it without touching module 3: a persistence facade whose
  // `saveLayout` lets the wiring's INIT write through once (HP1's immediate
  // first save) and is a no-op afterwards (its pass-saves are suppressed),
  // plus the component's own synchronous saveLayoutNow on
  // `api.onDidLayoutChange`. Both nets write through the facade's ONE
  // `createPersistence` instance — `saveLayoutNow` delegates to the same
  // last-known-good memory `saveHeights` writes — so envelope-mode halves
  // always persist as a pair (a second instance corrupts them; see
  // createWiringPersistence).
  const persistence: WiringPersistence | undefined = options.persistence
    ? createWiringPersistence(options.persistence, options.onDidFallback)
    : undefined;

  // ---- A6/A7/A9 restore (mock :1323–1325) — BEFORE the wiring subscribes,
  //      exactly like the mock: the load transaction's events predate every
  //      subscription here (D7) and the init saveLayout pins HP1's write.
  const saved = persistence?.loadLayout() ?? null;
  restoreLayout(
    api,
    saved,
    options.defaultLayout,
    options.onDidFallback,
  );

  // ---- drop rules (module 4) — before the gate: retireFirst is a gate
  //      creation option (D11) ---------------------------------------------
  const dropRules = useDropRules({
    api,
    autoWrap: options.autoWrap,
    floatExcludedPanelIds: seams.floatExcludedPanelIds,
    layoutArea,
  });
  disposers.push(() => dropRules.dispose());

  // G6 convergence amendment (D27): module 4's claim seam is the only place
  // that KNOWS an unwrap happened (no public engine event isolates it), so
  // the component observes it here — a panel whose group changed across the
  // handler was unwrapped into a new window; focus that window's group on a
  // microtask (the public-API one-liner focus.ts documents).
  const unwrapFocus = api.onWillDrop((ev) => {
    const before = readPanelGroup(api, ev);
    if (before === undefined) {
      return; // not a panel drag — group unwraps carry no focus contract
    }
    queueMicrotask(() => {
      try {
        const panel = api.getPanel(before.id);
        const group = panel?.api.group as unknown as
          | { focus(): void }
          | undefined;
        if (group && group !== before.group) {
          group.focus();
        }
      } catch {
        // best-effort focus — never break the drop pipeline
      }
    });
  });
  disposers.push(() => unwrapFocus.dispose());

  // ---- window-drag gate (module 5) -------------------------------------
  const gate: WindowDragGate = createWindowDragGate({
    api: () => api,
    layoutArea,
    onRetireFirst: dropRules.retireFirst,
  });
  disposers.push(() => gate.dispose());

  // ---- pin pass (module 3) — after the gate: `wire()` subscribes net 3,
  //      and D14's ordering (onDragEnd after retire) lives in the gate ----
  // §2.5 floors are live: the seam re-derives from the current registry on
  // every pin/pass/commit read (an always-built closure — a floor-less
  // registry pins at the same MIN_TS_H the omitted seam produced).
  const floorOf: GroupFloor = seams.floorOf;

  const pins: SettledPinPass = wireSettledPinPass({
    api,
    defaultLayout: options.defaultLayout,
    ...(persistence ? { persistence } : {}),
    gate,
    floorOf,
  });
  disposers.push(() => pins.dispose());

  // ---- the mock's synchronous layout save (mock :1327) ------------------
  // Fires at every layout-change event (the AsapEvent microtask), BEFORE
  // the rAF pin pass — so the stored layout carries the pre-pin geometry
  // the goldens pin. HP9's restore path re-emerges through this same net:
  // clear()+fromJSON(preset) fires it and the layout key re-writes.
  if (persistence) {
    const unwireSave = api.onDidLayoutChange(() => {
      persistence.saveLayoutNow(api);
    });
    disposers.push(() => unwireSave.dispose());
  }

  // ---- HP9 restore-to-default net ---------------------------------------
  // A consumer-driven `fromJSON` (the demo Reset: clear + fromJSON(preset);
  // also the A9 fallback inside restoreLayout — which runs before this
  // subscription, so it never fires here) reproduces the mock's reset body
  // (mock :1506–1512) through module surfaces: `commitHeights({})` is the
  // `heightsMap = {}` reset (adopt the empty map + persist it — HP9's
  // heights key re-emerges as `{}`), then a SYNCHRONOUS pin pass over the
  // preset seeds (the mock's `pinAllWindows` inside reset) so the windows
  // are already re-pinned when the change event's microtask delivers and
  // the synchronous layout save fires — the golden's stored positions are
  // the POST-pin ones (484/634, not the preset's 450/602).
  const presetHeights = collectPresetHeights(options.defaultLayout);
  const unwireFromJson = api.onDidLayoutFromJSON(() => {
    pins.commitHeights({});
    pinAllWindows(api, pins.heights(), {
      presetHeights,
      floorOf,
    });
  });
  disposers.push(() => unwireFromJson.dispose());

  // ---- titlebar chrome (module 7) --------------------------------------
  const unwatchTitlebars = watchTitlebars(api, {
    root: options.container ?? document.body,
  });
  disposers.push(unwatchTitlebars);

  // ---- gesture takeover (module 6) -------------------------------------
  const unwireTabsetEdges = wireTabsetEdges({
    api,
    onCommit: (heights) => pins.commitHeights(heights),
    floorOf,
  });
  disposers.push(unwireTabsetEdges);

  // ---- focus restoration (module 9, G5) --------------------------------
  const focusRestoration: FocusRestoration = wireFocusRestoration(api);
  disposers.push(() => focusRestoration.dispose());

  return { settledEvent: pins.settledEvent, dispose };
}

/** The panel a will-drop event's payload names, with its live group. */
function readPanelGroup(
  api: DockviewApi,
  ev: { getData(): unknown },
): { id: string; group: unknown } | undefined {
  try {
    const data = ev.getData() as { panelId?: string | null } | null;
    if (!data || data.panelId == null) {
      return undefined;
    }
    const panel = api.getPanel(data.panelId);
    if (!panel) {
      return undefined;
    }
    return { id: panel.id, group: panel.api.group };
  } catch {
    return undefined;
  }
}


/* ---- the component ------------------------------------------------------ */

/**
 * §2.1 — the thin front door. Renders `DockviewReact` with every behavior
 * wired; the container carries `layoutArea` (D30) so panel-layout.css and
 * focus.css apply. No toolbar/statusbar slots (§3): consumers compose their
 * own chrome around the component.
 */
export const PanelLayout: FC<PanelLayoutProps> = (props) => {
  const {
    registry,
    defaultLayout,
    persistence,
    autoWrap = true,
    dockviewOptions,
    onReady,
    onDidFallback,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [autoWrapOn, setAutoWrapOn] = useState(autoWrap);

  // The engine options, split per §2.1/D26: owned keys always the
  // library's (the four, `transformFloatingGroupDrag` among them);
  // everything the consumer passed spreads through verbatim
  // (`keyboardNavigation` among them, G2 — `theme`/`dndEdges` are
  // demo-passed passthrough values, not library-forced).
  const { owned, passed } = useMemo(
    () => splitDockviewOptions(dockviewOptions),
    [dockviewOptions],
  );

  const components = useMemo(
    () => registryComponents(registry),
    [registry],
  );

  // Keep the autoWrap state the drop rules read live (the mock's
  // `autoWrapEnabled = autoWrap` re-render sync, :1319).
  useEffect(() => {
    setAutoWrapOn(autoWrap);
  }, [autoWrap]);
  const autoWrapRef = useRef(autoWrapOn);
  autoWrapRef.current = autoWrapOn;

  // Keep the registry the wiring's §2.5 seams read live: the latest-ref
  // pattern (the registry sibling of autoWrapRef above). A registry prop
  // change re-renders new components through the `components` memo above
  // while the wiring's exclusion-set/floor seams re-derive from this ref
  // on every read — the two can never disagree (D55).
  const registryRef = useRef(registry);
  registryRef.current = registry;

  // The wiring is created exactly once per mounted layout (like the mock's
  // onReady) and disposed on unmount; a re-render with new props keeps the
  // wiring — its seams read the refs above (autoWrap, registry) and the
  // engine's `components` map, so policy follows prop changes without
  // re-wiring.
  const wiringRef = useRef<Wired | null>(null);
  const onReadyDv = useCallback((event: DockviewReadyEvent): void => {
    const wired = wirePanelLayout(event.api, {
      container: containerRef.current,
      registry: () => registryRef.current,
      defaultLayout,
      ...(persistence ? { persistence } : {}),
      autoWrap: () => autoWrapRef.current,
      ...(onDidFallback ? { onDidFallback } : {}),
    });
    wiringRef.current = wired;
    const api = event.api as PanelLayoutApi;
    // The §2.3 emitter is created inside the wiring and disposed with it
    // on unmount — subscriptions made during OR after this callback
    // receive every later net.
    Object.defineProperty(api, 'onDidLayoutSettled', {
      value: wired.settledEvent,
      enumerable: true,
      configurable: true,
      writable: false,
    });
    onReady({ api });
  }, [defaultLayout, persistence, onReady, onDidFallback]);

  useEffect(() => {
    return () => {
      wiringRef.current?.dispose();
      wiringRef.current = null;
    };
  }, []);

  // The component's container IS the layout area (D30): it carries the
  // `layoutArea` class so panel-layout.css/focus.css chrome applies, and the
  // engine's root (height/width 100%) fills it. Consumers size it (the demo
  // drops it into a flex column — .layoutArea's flex:1 in the demo sheet).
  // Rendered via createElement — the repo's import scanner
  // (scripts/check-imports.mjs, untouchable) rejects `/` after `}` (the
  // `/>` of a self-closing JSX tag whose last attribute is a spread); this
  // file must stay scannable.
  const engineProps: IDockviewReactProps = {
    ...(passed as IDockviewReactProps),
    ...owned,
    components,
    // library-forced stock tab (§2.1): a react-layer prop, outside the
    // dockviewOptions passthrough — G1/G3/HP10 target the stock tab
    defaultTabComponent: DockviewDefaultTab,
    onReady: onReadyDv,
  };

  return React.createElement(
    'div',
    { className: 'layoutArea', ref: containerRef },
    React.createElement(DockviewReact, engineProps),
  );
};

/** §2.6 default envelope key (re-export seam for consumer configuration). */
export { DEFAULT_ENVELOPE_KEY };
