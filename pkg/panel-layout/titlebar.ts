/**
 * Float titlebar chrome — T6 decoration (ridged drag-grip) + move-only
 * enforcement. QUARANTINED: move-only enforcement reaches into dockview
 * internals (the titlebar's drag sources have no public disable API; the
 * documented onWillDragGroup + preventDefault route cannot preempt the
 * pointer backend's unconditional commit). All private hops are marked and
 * feature-detected; if a hop is missing, decoration still works and only
 * the move-only guarantee degrades (shift-drags may redock).
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * @ 94d4b8307e5f0db2a1b32e14ceb8754207a51f27
 */

import type { DockviewApi } from 'dockview';

import { floatingGroups } from './pinHeights.js';



const GRIP_CLASS = 'mn-drag-grip';

/**
 * Decorate each float titlebar with the text-free drag-grip span. Idempotent
 * (skips bars that already carry a grip); the grip is decorative
 * (aria-hidden, pointer-events:none — the bar itself is the handle).
 *
 * The bar lookup uses the mock's plain truthiness guard (mock :687), not an
 * instanceof check: `querySelector` on a titlebar-class element is always an
 * `Element`, and every member touched below lives on `Element` itself.
 */
export function decorateTitlebars(api: DockviewApi): void {
  for (const fp of floatingGroups(api)) {
    const bar = fp.overlay.element.querySelector('.dv-floating-titlebar');
    if (!bar || bar.querySelector('.' + GRIP_CLASS)) {
      continue;
    }
    const grip = document.createElement('span');
    grip.className = GRIP_CLASS;
    grip.setAttribute('aria-hidden', 'true');
    bar.appendChild(grip);
  }
}

interface DragSourceLike {
  html5DragSource?: { setDisabled?(v: boolean): void };
  pointerDragSource?: { setDisabled?(v: boolean): void };
}

interface TitleBarLike {
  dragSource?: DragSourceLike;
}

interface FloatingGroupWithTitleBar {
  readonly _titleBar?: TitleBarLike;
}

const MARKER = '__mnMoveOnly';

/**
 * Make float titlebars move-ONLY (kill the redock race): disables the
 * titlebar's html5 + pointer drag sources outright. Durable per group
 * (flagged); the engine only re-enables sources when the dnd options
 * change, which this library never does. Void containers (empty tab-strip
 * space) keep their own group-drag source — the stack-move flow must
 * survive.
 *
 * Private hops (both documented against dockview 7.0.4): `_titleBar` on the
 * floating-group object; `setDisabled` on the two drag sources. Missing
 * hops are skipped silently — see the file header for the degradation path.
 */
export function suppressTitlebarGroupDrag(api: DockviewApi): void {
  for (const fp of floatingGroups(api) as unknown as
    (ReturnType<typeof floatingGroups>[number] & FloatingGroupWithTitleBar)[]) {
    const ds = fp._titleBar?.dragSource;
    if (!ds || (ds as Record<string, unknown>)[MARKER]) {
      continue;
    }
    ds.html5DragSource?.setDisabled?.(true);
    ds.pointerDragSource?.setDisabled?.(true);
    (ds as Record<string, unknown>)[MARKER] = true;
  }
}

/** Options for `watchTitlebars` (the mock's hard-wired values, injectable). */
export interface WatchTitlebarsOptions {
  /**
   * Observation root for the MutationObserver net. The mock watches its
   * app-owned `#root` (:1495); the library default is `document.body`, and
   * module 1 passes the layout container.
   */
  readonly root?: HTMLElement;
  /**
   * Interval net period in ms. Default 500 — the A4 "grips ≤500ms late"
   * bound (mock :1496).
   */
  readonly intervalMs?: number;
}

/**
 * Decoration safety net: run now + on DOM mutations + on an interval, so
 * windows created later (auto-wrap unwrap, restore) get chrome ≤1 tick late
 * (behavior.spec.md A4 note). Returns a disposer.
 */
export function watchTitlebars(
  api: DockviewApi,
  options: WatchTitlebarsOptions = {},
): () => void {
  const paint = (): void => {
    decorateTitlebars(api);
    suppressTitlebarGroupDrag(api);
  };
  paint();
  const mo = new MutationObserver(paint);
  mo.observe(options.root ?? document.body, {
    childList: true,
    subtree: true,
  });
  const t = setInterval(paint, options.intervalMs ?? 500);
  return () => {
    mo.disconnect();
    clearInterval(t);
  };
}
