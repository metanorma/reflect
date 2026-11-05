/**
 * Focus/keyboard layer — api.spec.md §3 module 9 (behavior.spec.md §5,
 * rows G1–G3, G5–G8).
 *
 * Two responsibilities:
 *
 * 1. The §2.1 `dockviewOptions` contract as DATA: which engine options the
 *    library OWNS (because a behavior module depends on their exact values)
 *    versus which are consumer PASSTHROUGH. `splitDockviewOptions` is the
 *    one-call application of that contract — module 1 spreads `owned` and
 *    `passed` into its `DockviewReact` props (owned last, so ownership
 *    always wins), and consumers see the same split if they assemble the
 *    engine themselves.
 *
 * 2. G5 focus restoration after a panel close: `wireFocusRestoration`
 *    re-focuses the layout when a close leaves DOM focus on `body`.
 *
 * GREENFIELD MODULE (module-8 boundary precedent): the mock implements
 * NONE of this — G2 (`keyboardNavigation` unset at mock :1533–1552), G3
 * (no `:focus-visible` rules anywhere in the mock or dockview.css) and
 * G5/G6 (focus left on `body` after close/unwrap) are the documented gaps
 * this module closes. The G3 ring CSS ships as the sibling hand-authored
 * `focus.css`, hand-authored like `panel-layout.css` (both D45:
 * hand-owned sources of truth, no pipeline).
 *
 * Engine facts this module is built on (verified against the pinned
 * dockview-core 7.0.4, `.yarn/cache/dockview-core-npm-7.0.4-*.zip`):
 *
 * - `.dv-tab` carries the roving tabindex (`tabIndex` 0/−1, `role=tab`;
 *   `components/tab/tab.js`, `titlebar/tabs.js` `_focusTab`) — G1 is
 *   engine-stock, and the ring styles it via `:focus-visible`.
 * - `.dv-sash` is a plain unfocusable `div` (no `tabIndex`, no `role`, no
 *   key handling; `splitview/splitview.js` `createElement`) — there is no
 *   sash focus state to style, and the takeover drag (module 6) is
 *   pointer-only by design.
 * - `dockview.css:2503` `.dv-groupview:focus{outline:none}` suppresses
 *   the group ring on ALL focus kinds — `focus.css` re-adds it for
 *   `:focus-visible` ONLY (equal specificity, later source order), so
 *   mouse-driven activation stays ring-less.
 * - `api.onDidRemovePanel` fires for genuine closes only: every
 *   move/unwrap path wraps its mutations in `movingLock`, which suppresses
 *   the re-broadcast (`dockviewComponent.js` `_registerGroup` listeners:
 *   `if (this._moving) return;`). Closing via the tab ✕ does NOT hold the
 *   lock — the event is the close signal.
 * - `group.focus()` is public API (`api.activeGroup.focus()`): activates
 *   the group when needed and focuses its element (`tabIndex=-1`, program
 *   focus only — `basePanelView.js`).
 *
 * DOCUMENTED GAPS (not this module's to close; see coverage-map + the
 * amendment proposals in the task report):
 *
 * - G6 focus-after-unwrap: no public event isolates an unwrap (the
 *   panel-case fires `onDidAddGroup` — also fired by ordinary group
 *   creation — and the group-case fires neither add nor remove). The
 *   claim seam in module 4 is the only place that KNOWS an unwrap
 *   happened; module 1 (convergence) calls the public-API one-liner
 *   `queueMicrotask(() => panel.api.group?.focus())` there.
 * - G7 keyboard window-move: the titlebar is engine-rendered unfocusable
 *   and the grip is decorative (module 7). Note the nuance: once a
 *   consumer passes `keyboardNavigation` (G2 passthrough), the engine's
 *   `ctrl+M` keyboard DOCKING becomes available — window MOVE stays
 *   pointer-only.
 * - G8 Esc-cancel during drag: the engine wires `pointercancel` to COMMIT;
 *   nothing at the option-wiring level changes that.
 */

import type { DockviewApi, DockviewOptions } from 'dockview';

import { FLOATING_GROUP_BOUNDS } from './tokens.js';



/* ---- §2.1 owned vs passed dockview options (G2 surfacing) -------------- */

/**
 * The engine option keys the library OWNS (api.spec.md §2.1): consumer
 * values for exactly these three are ignored. Each backs a behavior
 * module, so the ownership is load-bearing:
 *
 * - `dndStrategy: 'pointer'` — the drag-takeover claim paths (module 4)
 *   and the sash/window-bottom gesture takeover (module 6) are built on
 *   pointer-event routing (mock :1538).
 * - `floatingGroupDragHandle: 'titlebar'` — the titlebar chrome module (7)
 *   decorates and enforces move-only on the TITLEBAR handle (mock :1537).
 * - `floatingGroupBounds: FLOATING_GROUP_BOUNDS` (0/0 minimums) — the
 *   containment model: the engine's stock clamp is a no-op and module 5's
 *   `clampDragBox` re-imposes top/left bounds per frame, leaving the
 *   bottom edge free (mock :1543–1546).
 *
 * Frozen: a behavior module taking ownership of another option extends
 * this tuple and `LIBRARY_DOCKVIEW_OPTIONS` together.
 */
export const OWNED_DOCKVIEW_OPTION_KEYS = [
  'dndStrategy',
  'floatingGroupBounds',
  'floatingGroupDragHandle',
] as const;

/** The library's values for {@link OWNED_DOCKVIEW_OPTION_KEYS}. */
export const LIBRARY_DOCKVIEW_OPTIONS: Readonly<
  Pick<DockviewOptions, (typeof OWNED_DOCKVIEW_OPTION_KEYS)[number]>
> = Object.freeze({
  dndStrategy: 'pointer',
  floatingGroupBounds: { ...FLOATING_GROUP_BOUNDS },
  floatingGroupDragHandle: 'titlebar',
});

/**
 * Split a consumer's `dockviewOptions` (§2.1 passthrough) against the
 * ownership contract: the returned `owned` half is ALWAYS the library's
 * values (consumer values for owned keys are ignored — the documented
 * §2.1 behavior), and `passed` carries every other option verbatim,
 * `keyboardNavigation` (G2) among them.
 *
 * Pure: no engine import at runtime (`DockviewOptions` is type-only),
 * Node-testable. `undefined` and empty inputs yield the owned defaults
 * with an empty `passed` half.
 */
export function splitDockviewOptions(
  consumer?: Partial<DockviewOptions>,
): {
  /** The library-owned values — spread AFTER `passed` at the engine. */
  readonly owned: Readonly<
    Pick<DockviewOptions, (typeof OWNED_DOCKVIEW_OPTION_KEYS)[number]>
  >;
  /** Every non-owned consumer option, verbatim. */
  readonly passed: Partial<DockviewOptions>;
} {
  const passed: Record<string, unknown> = {};
  if (consumer) {
    for (const key of Object.keys(consumer) as (keyof DockviewOptions)[]) {
      if (!(key as string in LIBRARY_DOCKVIEW_OPTIONS)) {
        // exactOptionalPropertyTypes: skip undefined-valued keys entirely
        // rather than re-emitting an explicit-undefined assignment.
        if (consumer[key] !== undefined) {
          passed[key as string] = consumer[key];
        }
      }
    }
  }
  return { owned: LIBRARY_DOCKVIEW_OPTIONS, passed: passed as Partial<DockviewOptions> };
}


/* ---- G5: focus restoration after a panel close ------------------------- */

/**
 * True when DOM focus is "nowhere useful" — null/undefined (no focusable
 * descendant was focused) or `document.body` (the browser's fallback after
 * the focused element is removed). The G5 gap's exact post-close state.
 */
function focusNowhere(active: Element | null): boolean {
  return active === null || active === undefined || active === document.body;
}

/** Injectable seams for `wireFocusRestoration` (the Node-test surface). */
export interface FocusRestorationOptions {
  /**
   * Focus probe; defaults to `document.activeElement`. Injectable so the
   * Node tests drive the three G5 states (nowhere / body / inside-layout)
   * without a DOM.
   */
  readonly activeElement?: () => Element | null;
  /**
   * Deferral for the restore decision; defaults to `queueMicrotask`. The
   * close transaction (successor activation, possible group disposal) is
   * synchronous, but the engine's keyboard-close path refocuses the
   * neighbor tab synchronously too — deferring to a microtask means the
   * probe sees the post-transaction world either way, and skips when the
   * engine (or the consumer) already placed focus.
   */
  readonly schedule?: (fn: () => void) => void;
}

/** What `wireFocusRestoration` returns. */
export interface FocusRestoration {
  /** Unsubscribe from `api.onDidRemovePanel`. */
  dispose(): void;
}

/**
 * G5: after a panel closes via its tab ✕ (mouse close), dockview activates
 * the MRU successor but leaves DOM focus on `body` (behavior.spec.md G5:
 * "Only keyboard-close path refocuses" — the engine's `_closeTab` moves
 * roving focus; the ✕ click path does not). This wiring closes that gap:
 * on `api.onDidRemovePanel` — the close-only signal; moves/unwraps are
 * `movingLock`-suppressed — check focus once, post-transaction, and when
 * it is nowhere, focus the active group (public `group.focus()`:
 * activate-if-needed + program focus on its `tabIndex=-1` element).
 *
 * Degrades to a no-op whenever focus already went somewhere sensible: the
 * keyboard-close neighbor refocus, a consumer-managed focus move, or a
 * layout with no active group (everything closed → B1 watermark).
 *
 * Framework-agnostic wiring (D6 pattern): module 1 calls it inside
 * `onReady` and disposes on unmount. Pure event subscription — no DOM
 * writes until the restore decision fires.
 */
export function wireFocusRestoration(
  api: DockviewApi,
  options: FocusRestorationOptions = {},
): FocusRestoration {
  const activeElement = options.activeElement
    ?? ((): Element | null => document.activeElement);
  const schedule = options.schedule ?? queueMicrotask;

  const sub = api.onDidRemovePanel(() => {
    schedule(() => {
      if (!focusNowhere(activeElement())) {
        return; // focus already placed (keyboard close / consumer)
      }
      api.activeGroup?.focus();
    });
  });

  return {
    dispose(): void {
      sub.dispose();
    },
  };
}
