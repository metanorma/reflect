/**
 * The viewport indicator overlay and drag interaction (§9).
 *
 * The viewport indicator is a **separate DOM element**, not canvas paint:
 * updated exclusively through `transform: translateY(px)` and `height`
 * (written only when the editor viewport size changes) — compositor-
 * friendly, no layout, no repaint of the canvas beneath. It carries the
 * `scrollbar` ARIA role and its keyboard contract (§9.3).
 *
 * Drag discipline (§9.2): the overlay's rect is read once at pointerdown
 * and cached for the gesture — pointermove applies deltas, zero layout
 * reads (§15.2).
 */

/** Overlay element classes (§9.1, §12). */
export const OVERLAY_CLASS = 'mn-minimap-viewport';
export const CONTAINER_CLASS = 'mn-minimap';
export const CANVAS_CLASS = 'mn-minimap-canvas';

/** Keys handled by the `scrollbar` role contract (§9.3). */
const SCROLLBAR_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown',
  'Space', ' ', 'Home', 'End',
]);

/** One drag/click gesture state. */
interface DragState {
  pointerId: number;
  /** Overlay rect top cached at pointerdown — zero layout reads per move. */
  rectTop: number;
  /** Minimap-container client top cached at pointerdown (moves read nothing). */
  containerTop: number;
  /** Minimap-container height (track length) cached at pointerdown. */
  containerHeight: number;
  /** Thumb height cached at pointerdown (track clamp bound). */
  thumbHeight: number;
  /** Pointer y (overlay-relative) at pointerdown — click detect (§9.2). */
  startY: number;
  /**
   * Grab offset within the thumb at pointerdown: pointer y minus the
   * thumb's top. Moves keep this offset — grabbing the thumb's middle and
   * moving 1px slides the document 1px, instead of teleporting to put the
   * thumb's TOP under the pointer (the scrollbar grab invariant).
   */
  grabOffset: number;
  moved: boolean;
}

export interface OverlayHandlers {
  /**
   * Continuous drag — every pointermove (§6.4/§9.2). Receives the thumb
   * TOP's container-relative y (grab offset already subtracted, clamped
   * to the track). The controller maps it through the scrollbar
   * fraction: `scrollTop = (y / trackLength) × maxScroll`.
   */
  onDragMove(thumbTopY: number): void;
  /**
   * One precise commit at release/click (§6.4, §9.2) — same coordinate
   * as the moves; with no movement it is the thumb's own position (a
   * no-op scroll, the scrollbar invariant).
   */
  onCommit(minimapY: number): void;
  /**
   * Keyboard scroll (§9.3): `dy` editor px for arrows (one row's
   * `lineHeight`); `page` for PageUp/PageDown/Space (one viewport, sign in
   * `dy`); `home`/`end` for Home/End (document extremes).
   */
  onKeyboardScroll(
    dy: number,
    page: boolean,
    home: boolean,
    end: boolean,
  ): void;
  onHover(minimapY: number, clientY: number): void;
  onHoverEnd(): void;
}

/**
 * Wires the viewport overlay element: pointer drag (§9.2), keyboard
 * (§9.3), hover events (§10.2). Returns a disposer.
 *
 * `yToEditorOffset` converts a minimap-surface y (px) to the editor-space
 * offset under it — the inverse of the controller's scale (the controller
 * also holds the sliding-window origin, §6.2, so it owns this closure).
 *
 * The drag/hover coordinate frame is the overlay's PARENT — the minimap
 * container (`.mn-minimap`, §9.1), the element that owns the track the
 * thumb slides in. It is stationary during hover (unlike the moving
 * overlay strip), so its client top is cached once per pointerenter and
 * reused for every move (§10.2 O(log n) with zero layout reads on the
 * move path). Never the editor's scroll container (§7.1): that element
 * owns scroll geometry, not the pane's screen position.
 */
export function attachOverlay(
  overlay: HTMLElement,
  handlers: OverlayHandlers,
  yToEditorOffset: (minimapY: number) => number,
  lineHeight: number,
): () => void {
  let drag: DragState | null = null;
  /** Cached pane client top for the hover path (per pointer entry). */
  let hoverTop: number | null = null;
  /**
   * The drag coordinate frame: the minimap container that owns the track
   * the thumb slides in — the overlay's parent. Falls back to the overlay
   * itself only in a detached DOM (parentElement null).
   */
  const dragFrame: {
    getBoundingClientRect(): { top: number; height: number };
  } = (overlay.parentElement as {
    getBoundingClientRect(): { top: number; height: number };
  } | null) ?? overlay;

  const onPointerEnter = () => {
    hoverTop = dragFrame.getBoundingClientRect().top;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) {
      return;
    }
    e.stopPropagation();
    // One layout read pair per gesture (pointerdown); moves read nothing.
    const rect = overlay.getBoundingClientRect();
    const cRect = dragFrame.getBoundingClientRect();
    const startY = e.clientY - rect.top;
    drag = {
      pointerId: e.pointerId,
      rectTop: rect.top,
      containerTop: cRect.top,
      containerHeight: cRect.height,
      thumbHeight: rect.height,
      startY,
      grabOffset: startY,
      moved: false,
    };
    overlay.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
      if (drag === null) {
        if (hoverTop === null) {
          // No pointerenter yet: read once and cache.
          hoverTop = dragFrame.getBoundingClientRect().top;
        }
        const y = e.clientY - hoverTop;
        handlers.onHover(y, e.clientY);
        return;
      }
    if (e.pointerId !== drag.pointerId) {
      return;
    }
    e.stopPropagation();
    // Thumb-follows-grab (§9.2): the grab point tracks the pointer, so
    // the thumb's top is the pointer's container-relative y minus the grab
    // offset — clamped to the track (scrollbar semantics: the thumb never
    // leaves the track, however far outside the pointer goes; some
    // engines also report garbage clientY for captured out-of-window
    // pointers, and the clamp bounds that too). The y is THUMB-TOP
    // container-relative; the controller maps it through the scrollbar
    // fraction (`y / track × maxScroll`).
    const y = clampNum(
      e.clientY - drag.containerTop - drag.grabOffset,
      0, Math.max(0, drag.containerHeight - drag.thumbHeight),
    );
    if (Math.abs(e.clientY - drag.rectTop - drag.startY) > 3) {
      drag.moved = true;
    }
    handlers.onDragMove(y);
  };

  const endDrag = (e: PointerEvent) => {
    if (drag === null || e.pointerId !== drag.pointerId) {
      return;
    }
    e.stopPropagation();
    // Commit maps the THUMB TOP's container-relative y — the same
    // clamped coordinate the moves emitted. With no movement this is the
    // thumb's pointerdown position: a click on the thumb is a no-op
    // scroll (the scrollbar invariant), not a jump to the pointer's y.
    handlers.onCommit(clampNum(
      e.clientY - drag.containerTop - drag.grabOffset,
      0, Math.max(0, drag.containerHeight - drag.thumbHeight),
    ));
    overlay.releasePointerCapture(e.pointerId);
    drag = null;
  };

  const onWheel = (e: WheelEvent) => {
    // The overlay consumes its own events (§9.2) where the consumer's
    // layout would otherwise forward them to the editor surface.
    e.stopPropagation();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!SCROLLBAR_KEYS.has(e.key)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    switch (e.key) {
      case 'ArrowUp':
        handlers.onKeyboardScroll(-lineHeight, false, false, false);
        break;
      case 'ArrowDown':
        handlers.onKeyboardScroll(lineHeight, false, false, false);
        break;
      case 'PageUp':
        handlers.onKeyboardScroll(-1, true, false, false);
        break;
      case 'PageDown':
      case ' ':
        handlers.onKeyboardScroll(
          e.shiftKey ? -1 : 1, true, false, false,
        );
        break;
      case 'Home':
        handlers.onKeyboardScroll(0, false, true, false);
        break;
      case 'End':
        handlers.onKeyboardScroll(0, false, false, true);
        break;
      default:
        break;
    }
  };

    const onLeave = () => {
      hoverTop = null;
      handlers.onHoverEnd();
    };

    overlay.addEventListener('pointerdown', onPointerDown);
    overlay.addEventListener('pointermove', onPointerMove);
    overlay.addEventListener('pointerup', endDrag);
    overlay.addEventListener('pointercancel', endDrag);
    overlay.addEventListener('wheel', onWheel, { passive: true });
    overlay.addEventListener('keydown', onKeyDown);
    overlay.addEventListener('pointerenter', onPointerEnter);
    overlay.addEventListener('pointerleave', onLeave);

    return () => {
      overlay.removeEventListener('pointerdown', onPointerDown);
      overlay.removeEventListener('pointermove', onPointerMove);
      overlay.removeEventListener('pointerup', endDrag);
      overlay.removeEventListener('pointercancel', endDrag);
      overlay.removeEventListener('wheel', onWheel);
      overlay.removeEventListener('keydown', onKeyDown);
      overlay.removeEventListener('pointerenter', onPointerEnter);
      overlay.removeEventListener('pointerleave', onLeave);
    };
  }

/**
 * Write the thumb's transform and height (§9.1) — transform only, never
 * layout. `y` and `h` are pane-relative px computed by the controller's
 * scrollbar-fraction model (§9.1/§9.2): the thumb is a scrollbar slider
 * over the pane; `h` is written only when it changes.
 */
export function updateOverlay(
  overlay: HTMLElement,
  y: number,
  h: number,
): void {
  overlay.style.transform = `translateY(${y}px)`;
  if (overlay.dataset.h !== String(h)) {
    overlay.style.height = `${h}px`;
    overlay.dataset.h = String(h);
  }
}

function clampNum(v: number, min: number, max: number): number {
  return v < min
    ? min
    : v > max
      ? max
      : v;
}

/** Write the ARIA value (§9.1) — `aria-valuenow` 0–100. */
export function setOverlayAria(
  overlay: HTMLElement,
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): void {
  const denom = Math.max(1, scrollHeight - clientHeight);
  const pct = Math.round((scrollTop / denom) * 100);
  overlay.setAttribute('aria-valuenow', String(pct));
}
