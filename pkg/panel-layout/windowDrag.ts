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
 * bottom axis left to the pointer. The top cap at `container.height` (not
 * `container.height − window height`) is load-bearing — beyond it dockview
 * silently flips the window to a bottom-anchored form and pointer-follow
 * breaks (partial overhangs between the two bounds render fine).
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
 */
export function normalizeTops(api: DockviewApi): void {
  for (const fp of floatingGroups(api)) {
    const el = fp.overlay.element;
    if (getComputedStyle(el).bottom !== 'auto') {
      const r = el.getBoundingClientRect();
      const container = (el.parentElement ?? document.body)
        .getBoundingClientRect();
      fp.overlay.position({ top: r.top - container.top });
    }
  }
}

/**
 * Drag-session gate: while a window drag is live, the pin maintenance pass
 * must not run (a foreign/corrupted bounds write mid-drag would be re-pinned
 * as permanent tabset heights). The gate also owns the pointerup retire
 * sweep: unwrap fallback first, zone-overlay cleanup, then normalizeTops.
 */
export interface WindowDragGate {
  readonly isLive: () => boolean;
  /** Wire pointerdown/up/cancel; returns a disposer. */
  wire(handlers: {
    onDragStart?: () => void;
    onDragEnd?: () => void;
  }): () => void;
}

export function createWindowDragGate(): WindowDragGate {
  let live = false;
  return {
    isLive: () => live,
    wire(handlers) {
      const arm = () => {
        live = true;
        handlers.onDragStart?.();
      };
      const retire = () => {
        if (!live) {
          handlers.onDragEnd?.();
          return;
        }
        live = false;
        handlers.onDragEnd?.();
      };
      window.addEventListener('pointerdown', arm);
      window.addEventListener('pointerup', retire);
      window.addEventListener('pointercancel', retire);
      return () => {
        window.removeEventListener('pointerdown', arm);
        window.removeEventListener('pointerup', retire);
        window.removeEventListener('pointercancel', retire);
      };
    },
  };
}

/**
 * Sweep stale drop-zone overlays left in the main grid after a gesture and
 * drop the `.mn-unwrap-hover` suppression class (a following drag can start
 * before the engine re-runs willShow, so the class alone wouldn't re-hide
 * them) — then re-anchor bottoms (F5/HP5 release semantics).
 */
export function retireDragState(api: DockviewApi | undefined): void {
  const area = document.querySelector('.layoutArea');
  if (area) {
    area.classList.remove('mn-unwrap-hover');
    area.querySelectorAll(
      '.dv-drop-target-selection, .dv-drop-target-dropzone, '
      + '.dv-drop-target-anchor, .dv-drop-target-container',
    ).forEach((el) => {
      if (!el.closest('.dv-resize-container')) {
        el.remove();
      }
    });
  }
  if (api) {
    normalizeTops(api);
  }
}
