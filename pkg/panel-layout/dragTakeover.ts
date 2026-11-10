/**
 * Sash + window-edge gesture takeover — capture-phase routing that resizes
 * the tabset ABOVE a dragged sash, or the LAST tabset via the window's
 * bottom edge / corners (behavior.spec.md HP6). Stock bubble-phase
 * listeners are killed; our drag re-pins the target per frame and grows
 * the window with it. Corner handles also apply the horizontal delta as
 * width (mirroring stock corner behaviour; width is shared by all members).
 *
 * The pointerup commit is §2.3 net 2 (api.spec.md): takeover drags fire no
 * layout-change event, so `onCommit` — module 1 wires
 * `PinnedHeightsHandle.commitHeights` — is the only persistence trigger.
 * Per-move pins honor the §2.5 registry floors via the same `GroupFloor`
 * the pin pass uses, so a takeover can never pin below a registry floor
 * (floors postdate the mock, which pinned at MIN_TS_H only).
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
import type { GroupFloor } from './pinHeights.js';
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

/**
 * The tabset a takeover drag resizes (pure):
 *
 * - sash (`sashTop` a number) — the LAST member whose bottom edge sits at
 *   or above the sash (`bottom <= sashTop + 2`, the mock's 2px tolerance;
 *   members are the window's, sorted top-to-bottom by `membersOf`);
 *   index 0 when no member qualifies.
 * - window bottom edge / corner (`sashTop` null) — the LAST member.
 *
 * The caller guarantees a non-empty window (the wiring guards
 * `members.length` before calling).
 */
export function pickResizeTarget(
  memberBottoms: readonly number[],
  sashTop: number | null,
): number {
  if (sashTop === null) {
    return memberBottoms.length - 1;
  }
  let index = 0;
  for (let i = 0; i < memberBottoms.length; i += 1) {
    const bottom = memberBottoms[i];
    if (bottom !== undefined && bottom <= sashTop + 2) {
      index = i;
    }
  }
  return index;
}

/** Geometry sampled at pointerdown (px; unrounded rects fine). */
export interface ResizeFrameStart {
  /** Target tabset's height. */
  readonly height: number;
  /** Window width (corner drags only). */
  readonly width: number;
  /** Window height. */
  readonly winHeight: number;
}

export interface ResizeFrameInput {
  readonly start: ResizeFrameStart;
  /** Pointer travel since pointerdown. */
  readonly pointer: { readonly dx: number; readonly dy: number };
  /** §2.5 effective floor for the target group; undefined = MIN_TS_H only. */
  readonly floor?: number | undefined;
  /** Corner handles also apply the horizontal delta as width. */
  readonly isCorner: boolean;
}

export interface ResizeFrame {
  /** Height to pin the target tabset to (every floor applied). */
  readonly height: number;
  /** Window height that tracks the pinned height (MIN_WIN_H floor). */
  readonly winHeight: number;
  /** Corner width (windowMinWidth floor); undefined on edge-only drags. */
  readonly width: number | undefined;
}

/**
 * One pointermove frame of a takeover drag (pure):
 * `height = max(MIN_TS_H, floor, round(startH + dy))`, then
 * `winHeight = max(MIN_WIN_H, round(startWin + height − startH))`, and —
 * corner drags only — `width = max(windowMinWidth, round(startW + dx))`.
 *
 * The §2.5 floor participates BEFORE the window-height math so the window
 * tracks the height actually pinned; with no floor (the mock's only case)
 * the arithmetic is the mock's byte-for-byte.
 */
export function resizeFrame(input: ResizeFrameInput): ResizeFrame {
  const { start, pointer, floor, isCorner } = input;
  const height = Math.max(
    CONSTANTS.MIN_TS_H,
    Math.round(floor ?? 0),
    Math.round(start.height + pointer.dy),
  );
  const winHeight = Math.max(
    CONSTANTS.MIN_WIN_H,
    Math.round(start.winHeight + (height - start.height)),
  );
  const width = isCorner
    ? Math.max(
      CONSTANTS.windowMinWidth,
      Math.round(start.width + pointer.dx),
    )
    : undefined;
  return { height, winHeight, width };
}

export interface TabsetEdgesOptions {
  /** The live engine api. */
  readonly api: DockviewApi;
  /**
   * §2.3 net-2 commit: pointerup reconciles the window, then hands the
   * stable heights to `onCommit` — module 1 passes
   * `PinnedHeightsHandle.commitHeights` (adopt + saveHeights-only persist
   * + `'heights'`/`'user'` settle). Takeover drags fire no layout-change
   * event, so this is the only persistence trigger.
   */
  readonly onCommit?: ((heights: HeightsMap) => void) | undefined;
  /**
   * §2.5 per-group floor — the same `GroupFloor` the pin pass derives
   * (registry `minHeight` via `effectiveFloor` over current members), so
   * a takeover can never pin below a registry floor.
   */
  readonly floorOf?: GroupFloor | undefined;
}

/**
 * Wire the takeover on the floating overlay host (CAPTURE phase — the
 * stock sash/resize listeners are bubble-phase, so `stopPropagation` +
 * `preventDefault` on our pointerdown kills the stock gesture before it
 * starts). Returns the unwire disposer; a missing host
 * wires nothing and still returns a disposer.
 */
export function wireTabsetEdges(options: TabsetEdgesOptions): () => void {
  const { api, onCommit, floorOf } = options;
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
      .find((f) => f.overlay.element === winEl);
    if (!fp) {
      return;
    }
    const members = membersOf(api, fp);
    if (!members.length) {
      return;
    }

    const sashTop = sash ? sash.getBoundingClientRect().top : null;
    const target = members[pickResizeTarget(
      members.map((m) => m.element.getBoundingClientRect().bottom),
      sashTop,
    )] as DockviewGroupPanel;

    const startH = target.element.getBoundingClientRect().height;
    const startW = fp.overlay.element.getBoundingClientRect().width;
    const startWin = fp.overlay.element.getBoundingClientRect().height;
    const startX = e.clientX;
    const startY = e.clientY;
    const isCorner = !!target0?.closest?.(CORNER_HANDLES);
    // Kill the stock gesture (its listeners are bubble-phase).
    e.stopPropagation();
    e.preventDefault();

    const move = (ev: PointerEvent): void => {
      const floor = floorOf?.(target);
      const frame = resizeFrame({
        start: { height: startH, width: startW, winHeight: startWin },
        pointer: { dx: ev.clientX - startX, dy: ev.clientY - startY },
        floor,
        isCorner,
      });
      pinGroup(target, frame.height, floor);
      const bounds: { height: number; width?: number } = {
        height: frame.winHeight,
      };
      if (frame.width !== undefined) {
        bounds.width = frame.width;
      }
      fp.position(bounds);
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      reconcileWindow(api, fp);
      // Takeover gestures don't fire onDidLayoutChange (no structural
      // change), so persist the new heights here or the next structural
      // pass reverts them to saved heights.
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
