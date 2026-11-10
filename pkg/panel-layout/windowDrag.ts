/**
 * Window-drag containment — everything but the bottom edge (behavior.spec.md
 * HP5/F4): windows stay fully inside the layout area on top/left/right and
 * may extend below the bottom edge (drawer park; the titlebar stays
 * reachable via the top clamp cap).
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * @ 94d4b8307e5f0db2a1b32e14ceb8754207a51f27
 */

import type { DockviewApi } from 'dockview';

import { floatingGroups } from './pinHeights.js';



/**
 * Container box shape used by dockview's `transformFloatingGroupDrag`.
 * Kept structural so consumers can pass the engine's context directly.
 */
export interface DragBox {
  readonly top: number;
  readonly left: number;
  readonly width?: number;
  readonly height?: number;
}

export interface DragContainerBox {
  readonly width: number;
  readonly height: number;
}

/**
 * Containment transform for `transformFloatingGroupDrag`: top/left clamped,
 * bottom axis left to the pointer.
 *
 * The top cap at `container.height` (NOT `container.height − window height`)
 * is load-bearing — the bottom-anchor-flip guard. With the mock's
 * `floatingGroupBounds` 0-minimums the engine's own clamp is a no-op
 * (`maxTop = containerH`), and per drag frame it anchors BOTTOM when
 * `top > bottom`, where `bottom` is computed for the fully-overhung
 * position. A transform that returns `top > containerH` therefore flips the
 * window to a bottom-anchored form at the far extreme — pointer-follow
 * breaks. Capping at `containerH` keeps `top ≤ bottom` for every window
 * size (a window TALLER than the container included), so the top-anchored
 * form always holds; the overhang itself is bounded by the window height,
 * which also keeps the titlebar reachable. Partial overhangs between
 * `containerH − h` and `containerH` render fine as top-anchored styles.
 *
 * Both axes are returned on every call: a partial return assigns undefined
 * to the missing axis and corrupts the engine's clamp (the retired magnet's
 * bug, mock git history).
 */
export function clampDragBox(ctx: {
  readonly proposed: DragBox;
  readonly container: DragContainerBox;
}): { top: number; left: number } {
  const p = ctx.proposed;
  const c = ctx.container;
  return {
    top: Math.min(Math.max(0, p.top), Math.max(0, c.height)),
    left: Math.min(
      Math.max(0, p.left),
      Math.max(0, c.width - (p.width ?? 0)),
    ),
  };
}

/**
 * Re-anchor bottom-aligned float windows to their top form, so
 * serialization always stores `{top}` (bottom-anchored windows serialize as
 * `{bottom: -N}` and collapse to zero overhang on reload — A5).
 *
 * The container rect is taken from the overlay element's `parentElement`,
 * which IS the engine's `overlay.options.container`: the Overlay
 * constructor appends its element to that container (dockview-core 7.0.4,
 * `overlay.js`). Equivalent to the mock's
 * `fp.overlay.options.container.getBoundingClientRect()` without reaching
 * into the engine's private `options`.
 */
export function normalizeTops(api: DockviewApi): void {
  for (const fp of floatingGroups(api)) {
    const el = fp.overlay.element;
    if (getComputedStyle(el).bottom !== 'auto') {
      const r = el.getBoundingClientRect();
      const container = (el.parentElement ?? document.body)
        .getBoundingClientRect();
      fp.position({ top: r.top - container.top });
    }
  }
}

/** The drop-zone/overlay selectors swept on drag retire (F5 → HP5). */
const ZONE_OVERLAY_SELECTORS = [
  '.dv-drop-target-selection',
  '.dv-drop-target-dropzone',
  '.dv-drop-target-anchor',
  '.dv-drop-target-container',
].join(', ');

/**
 * Sweep stale drop-zone overlays left in the main grid after a gesture and
 * drop the `.mn-unwrap-hover` suppression class (a following drag can start
 * before the engine re-runs willShow, so the class alone wouldn't re-hide
 * them) — zone elements INSIDE float windows (real stacking/merge targets)
 * are kept.
 */
export function sweepZoneOverlays(area: HTMLElement | null): void {
  if (!area) {
    return;
  }
  area.classList.remove('mn-unwrap-hover');
  area.querySelectorAll(ZONE_OVERLAY_SELECTORS)
    .forEach((el) => {
      if (!el.closest('.dv-resize-container')) {
        el.remove();
      }
    });
}

/**
 * Structural pointer-event shape the retire sequence consumes (the unwrap
 * fallback's pointer hit-test). Kept structural — like `DropEventLike` in
 * unwrap.ts — so the seam is engine- and DOM-free and the retire ORDER is
 * Node-testable without faking a DOM.
 */
export interface RetirePointerEvent {
  readonly button: number;
  readonly clientX: number;
  readonly clientY: number;
}

/**
 * Listener-registration seam (the mock wires on the DOM `window`). Injected
 * in the Node tests; same category as pinHeights' `PassScheduler`. `window`
 * itself satisfies it structurally.
 */
export interface WindowDragEventTarget {
  addEventListener(
    type: string,
    listener: (ev: RetirePointerEvent) => void,
  ): void;
  removeEventListener(
    type: string,
    listener: (ev: RetirePointerEvent) => void,
  ): void;
}

export interface WindowDragGateOptions {
  /**
   * The live engine api, polled at retire — `normalizeTops`'s window
   * enumeration (the mock's `window.__api` hop). Returns undefined → the
   * normalize step is skipped (exactly the mock's `if (window.__api)`).
   */
  readonly api?: () => DockviewApi | undefined;
  /**
   * The layout-area root for the zone-overlay sweep; defaults to the mock's
   * `.layoutArea` query. Returns null → sweep skipped (mock's `if (area)`).
   */
  readonly layoutArea?: () => HTMLElement | null;
  /**
   * The group-unwrap fallback slot — retire runs it FIRST, before the
   * suppression state clears, because the mock's `maybeUnwrapGroupAtPointer`
   * must observe the drag-live group state that the sweep and the
   * subscriber notifications would retire. The mock's
   * guard travels with the hook: the provider checks its own live-group
   * state (module 4's `groupDragLive`) and calls `maybeUnwrapGroupAtPointer`
   * itself; the gate imposes only the ORDER.
   */
  readonly onRetireFirst?: (ev: RetirePointerEvent) => void;
  /** Listener sink; defaults to the DOM `window` (the mock's wiring). */
  readonly target?: WindowDragEventTarget;
}

/**
 * Drag-session gate: while a window drag is live, the pin maintenance pass
 * must not run (a foreign/corrupted bounds write mid-drag would be re-pinned
 * as permanent tabset heights). The gate owns the pointer listeners AND the
 * full pointerup retire sequence in the mock's exact order:
 *
 *   1. `live = false`
 *   2. `onRetireFirst(ev)` — the group-unwrap fallback (before any state
 *      clears)
 *   3. zone-overlay sweep (`.mn-unwrap-hover` off + stale non-float zone
 *      elements removed)
 *   4. `normalizeTops(api)` — re-anchor bottoms so toJSON writes `{top}`
 *   5. `onDragEnd` subscriber notifications
 *
 * Listeners attach at CREATION (one tracker per layout, like the mock's
 * mount-time `wireWindowDragTracking`); `dispose()` removes them. `wire()`
 * only registers a subscriber — `pinHeights.ts`'s `gate.wire({onDragEnd})`
 * contract is unchanged.
 */
export interface WindowDragGate {
  readonly isLive: () => boolean;
  /**
   * Subscribe to the drag session: `onDragStart` on pointerdown (arm),
   * `onDragEnd` after the retire sequence. Returns an unsubscriber.
   */
  wire(handlers: {
    onDragStart?: (() => void) | undefined;
    onDragEnd?: (() => void) | undefined;
  }): () => void;
  /** Remove the gate's pointer listeners and drop every subscriber. */
  dispose(): void;
}

/** A `wire()` registration (kept as one object so unwiring is identity-based). */
type GateSubscriber = {
  onDragStart?: (() => void) | undefined;
  onDragEnd?: (() => void) | undefined;
};

export function createWindowDragGate(
  options: WindowDragGateOptions = {},
): WindowDragGate {
  const api = options.api;
  const onRetireFirst = options.onRetireFirst;
  const layoutArea = options.layoutArea;
  const target: WindowDragEventTarget = options.target ?? window;

  let live = false;
  let disposed = false;
  let subscribers: GateSubscriber[] = [];

  /** The retire sequence (mock `retire`, :1075–1093) — order is contract. */
  const retire = (ev: RetirePointerEvent): void => {
    // 1. gate off first — the pin pass's next schedule must not be mid-drag
    live = false;
    // 2. group-unwrap fallback FIRST (before the suppression state clears)
    if (onRetireFirst) {
      try {
        onRetireFirst(ev);
      } catch {
        // a provider hook must not break the retire sweep
      }
    }
    // 3. drop-zone suppression off + stale zone-overlay sweep
    sweepZoneOverlays(
      layoutArea ? layoutArea()
        : document.querySelector('.layoutArea'),
    );
    // 4. re-anchor bottom-aligned windows to top form so toJSON stores {top}
    //    — after every pointer gesture, drag or not
    const a = api?.();
    if (a) {
      normalizeTops(a);
    }
    // 5. notify subscribers last (the mock's change event fires after this
    //    listener; the rAF-debounced pass runs after all sync retire work)
    for (const s of subscribers) {
      s.onDragEnd?.();
    }
  };

  const arm = (): void => {
    if (disposed) {
      return;
    }
    live = true;
    for (const s of subscribers) {
      s.onDragStart?.();
    }
  };

  target.addEventListener('pointerdown', arm);
  target.addEventListener('pointerup', retire);
  target.addEventListener('pointercancel', retire);

  return {
    isLive: () => live,
    wire(handlers) {
      const entry: GateSubscriber = {
        onDragStart: handlers.onDragStart,
        onDragEnd: handlers.onDragEnd,
      };
      subscribers.push(entry);
      return () => {
        subscribers = subscribers.filter((s) => s !== entry);
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      live = false;
      subscribers = [];
      target.removeEventListener('pointerdown', arm);
      target.removeEventListener('pointerup', retire);
      target.removeEventListener('pointercancel', retire);
    },
  };
}

/**
 * Sweep + re-anchor — the tail of the retire sequence (steps 3–4), exported
 * for callers that tear down drag state outside a pointer gesture (HP5
 * release semantics, F5 cleanup).
 */
export function retireDragState(api: DockviewApi | undefined): void {
  sweepZoneOverlays(document.querySelector('.layoutArea'));
  if (api) {
    normalizeTops(api);
  }
}
