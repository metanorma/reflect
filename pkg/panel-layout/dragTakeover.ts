/**
 * Sash + window-edge gesture takeover — capture-phase routing that resizes
 * the tabset ABOVE a dragged sash, or the LAST tabset via the window's
 * bottom edge / corners (behavior.spec.md HP6). Stock bubble-phase
 * listeners are killed; our drag re-pins the target per frame and grows
 * the window with it. Corner handles also apply the horizontal delta as
 * width (mirroring stock corner behaviour; width is shared by all members).
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * @ 94d4b8307e5f0db2a1b32e14ceb8754207a51f27
 */

import type { DockviewApi, DockviewGroupPanel } from 'dockview';

import { CONSTANTS } from './tokens.js';
import {
  collectStableHeights,
  floatingGroups,
  membersOf,
  pinGroup,
  reconcileWindow,
} from './pinHeights.js';
import type { HeightsMap } from './persistence.js';



const SASH = '.dv-sash';
const BOTTOM_HANDLES = [
  '.dv-resize-handle-bottom',
  '.dv-resize-handle-bottomleft',
  '.dv-resize-handle-bottomright',
].join(', ');
const CORNER_HANDLES = [
  '.dv-resize-handle-bottomleft, .dv-resize-handle-bottomright',
].join(', ');

interface PositionableOverlay {
  position(bounds: {
    height?: number; width?: number;
  }): void;
}

/**
 * Wire the takeover on the floating overlay host (capture phase).
 * `onCommit` fires on pointerup with the settled heights — takeover drags
 * fire no layout-change event, so persistence must be triggered there.
 */
export function wireTabsetEdges(
  api: DockviewApi,
  onCommit?: (heights: HeightsMap) => void,
): () => void {
  const host = document.querySelector('.dv-floating-overlay-host');
  if (!host) {
    return () => {};
  }

  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0) {
      return;
    }
    const target0 = e.target as Element | null;
    const sash = target0?.closest?.(SASH);
    const bottom = target0?.closest?.(BOTTOM_HANDLES);
    if (!sash && !bottom) {
      return;
    }
    const winEl = target0?.closest?.('.dv-resize-container');
    if (!winEl) {
      return;
    }
    const fp = floatingGroups(api)
      .find((f: { overlay: { readonly element: HTMLElement } }) =>
        f.overlay.element === winEl);
    if (!fp) {
      return;
    }
    const members = membersOf(api, fp);
    if (!members.length) {
      return;
    }

    let target: DockviewGroupPanel;
    if (sash) {
      const sashTop = sash.getBoundingClientRect().top;
      target = members[0] as DockviewGroupPanel;
      for (const m of members) {
        if (m.element.getBoundingClientRect().bottom <= sashTop + 2) {
          target = m;
        }
      }
    } else {
      target = members[members.length - 1] as DockviewGroupPanel;
    }

    const startH = target.element.getBoundingClientRect().height;
    const startW = fp.overlay.element.getBoundingClientRect().width;
    const startWin = fp.overlay.element.getBoundingClientRect().height;
    const startX = e.clientX;
    const startY = e.clientY;
    const isCorner = !!target0?.closest?.(CORNER_HANDLES);
    // Kill the stock gesture (its listeners are bubble-phase).
    e.stopPropagation();
    e.preventDefault();

    const overlay = fp.overlay as unknown as PositionableOverlay;

    const move = (ev: PointerEvent): void => {
      const h = Math.max(
        CONSTANTS.MIN_TS_H,
        Math.round(startH + (ev.clientY - startY)),
      );
      pinGroup(target, h);
      const winH = Math.max(
        CONSTANTS.MIN_WIN_H,
        Math.round(startWin + (h - startH)),
      );
      const bounds: { height: number; width?: number } = { height: winH };
      if (isCorner) {
        bounds.width = Math.max(
          CONSTANTS.windowMinWidth,
          Math.round(startW + (ev.clientX - startX)),
        );
      }
      overlay.position(bounds);
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      reconcileWindow(api, fp);
      // Persist here or the next structural pass reverts to saved heights.
      onCommit?.(collectStableHeights(api));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  host.addEventListener('pointerdown', onDown as EventListener, true);
  return () => host.removeEventListener(
    'pointerdown', onDown as EventListener, true);
}
