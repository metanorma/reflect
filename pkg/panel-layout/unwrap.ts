/**
 * Auto-wrap claim + drop vetoes — the T1–T4 interaction rules
 * (behavior.spec.md HP2–HP4, HP7, F3, F5): a panel or whole tabset dropped
 * on the grid surface (pasteboard or page) unwraps into a new floating
 * window; non-center panel drops on float windows are vetoed (merge as tabs
 * or stack vertically only); float-excluded panels never enter floats;
 * zone overlays over the grid are suppressed while a claim is live.
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * @ 94d4b8307e5f0db2a1b32e14ceb8754207a51f27
 */

import type {
  DockviewApi,
  DockviewGroupPanel,
  GroupDragEvent,
} from 'dockview';

import { floatingGroups } from './pinHeights.js';
import type { RetirePointerEvent } from './windowDrag.js';
import { CONSTANTS } from './tokens.js';



/**
 * Structural shape of dockview's will-drop / will-show-overlay events
 * (`DockviewWillDropEvent` and `DockviewWillShowOverlayLocationEvent` at
 * 7.0.4). `group` is `DockviewGroupPanel | undefined` — NOT optional —
 * because the engine's getters return `undefined` for absent targets and
 * `exactOptionalPropertyTypes` makes the optional form unassignable; the
 * handler parameters stay contravariant over both event classes.
 */
export interface DropEventLike {
  readonly kind: 'content' | 'edge' | 'tab' | 'header_space';
  readonly position:
    | 'center' | 'top' | 'bottom' | 'left' | 'right'
    | 'tab' | 'header_space';
  readonly group: DockviewGroupPanel | undefined;
  readonly nativeEvent?: {
    readonly clientX: number;
    readonly clientY: number;
  };
  getData(): unknown;
  preventDefault(): void;
}

export interface DragDataLike {
  readonly viewId?: string;
  readonly groupId?: string;
  readonly panelId?: string | null;
}

export interface UnwrapConfig {
  /** Auto-wrap on (demo default: on; toolbar toggle is demo chrome — F1). */
  readonly autoWrap: () => boolean;
  /**
   * Panel ids that must never enter a floating window (the mock's `doc`
   * isolation, generalized: an app designates its main-grid panels).
   */
  readonly floatExcludedPanelIds?: () => ReadonlySet<string>;
  /** The engine's component id (drag data viewId check). */
  readonly viewId: () => string;
  /** Container of the layout surface, for hit-testing the grid. */
  readonly layoutArea: () => HTMLElement | null;
}

function dataOf(ev: DropEventLike): DragDataLike | null {
  const d = ev.getData() as DragDataLike | null;
  return d ?? null;
}

/** Pointer over a float window's box (including protruding chrome)? */
function overFloatWindow(x: number, y: number): boolean {
  const el = document.elementFromPoint(x, y);
  return !!el?.closest('.dv-resize-container');
}

/** Pointer inside the layout area, not over a float window = grid surface. */
export function overGridSurface(
  ne: { readonly clientX: number; readonly clientY: number },
  area: HTMLElement | null,
): boolean {
  const el = document.elementFromPoint(ne.clientX, ne.clientY);
  if (!el) {
    return false;
  }
  if (!area || !area.contains(el)) {
    return false;
  }
  if (el.closest('.dv-resize-container')) {
    return false;
  }
  return true; // gray pasteboard or main-grid page — "empty space"
}

/** Like overGridSurface but excludes the main grid's page content. */
export function overPasteboard(
  ne: { readonly clientX: number; readonly clientY: number },
  area: HTMLElement | null,
): boolean {
  const el = document.elementFromPoint(ne.clientX, ne.clientY);
  if (!el || !overGridSurface(ne, area)) {
    return false;
  }
  const page = el.closest('.page');
  return !(page && area?.contains(page));
}

/**
 * Unwrap a panel/group into a new floating window at the drop point,
 * sized to the SOURCE tabset's rect (width + content height; the +chrome
 * constant makes the content match the source). The new group is pinned to
 * the source height so the height travels with the panel (T7/HP2).
 */
export function unwrapAtPointer(
  api: DockviewApi,
  ev: DropEventLike,
  srcGroup: DockviewGroupPanel,
  area: HTMLElement | null,
): boolean {
  const ne = ev.nativeEvent;
  if (!ne || !area) {
    return false;
  }
  const r = area.getBoundingClientRect();
  const srcRect = srcGroup.element.getBoundingClientRect();
  const size = (srcRect.width > 0 && srcRect.height > 0)
    ? { w: Math.round(srcRect.width), h: Math.round(srcRect.height) }
    : { w: CONSTANTS.WRAP_W, h: CONSTANTS.WRAP_H };
  const x = Math.min(
    Math.max(ne.clientX - r.left - size.w / 2, 4),
    Math.max(r.width - size.w - 4, 4),
  );
  const y = Math.min(
    Math.max(ne.clientY - r.top - 16, 4),
    Math.max(r.height - size.h - 4, 4),
  );

  const data = dataOf(ev);
  const isGroup = data?.panelId == null;
  if (isGroup) {
    api.addFloatingGroup(srcGroup, {
      x, y, width: size.w, height: size.h,
    });
    return true;
  }
  const panel = api.getPanel(data?.panelId ?? '');
  if (!panel) {
    return false; // stale drag payload — nothing sensible to float
  }
  api.addFloatingGroup(panel, {
    x, y,
    width: size.w,
    height: size.h + CONSTANTS.undockChrome,
  });
  // Pin the minted group to the source height once it exists; the pin pass
  // reconciles anyway, this prevents the observed height-reset flicker.
  try {
    const newGroup = panel.api.group;
    if (newGroup && newGroup !== srcGroup) {
      newGroup.api.setConstraints({
        minimumHeight: size.h,
        maximumHeight: size.h,
      });
    }
  } catch {
    // best-effort: the pin pass will reconcile
  }
  return true;
}

/**
 * The auto-wrap CLAIM (T1, mock :1233–1314's autoWrap-ON body): a drop of
 * a floating-sourced panel or whole tabset on the grid surface (pasteboard
 * or page, any zone). Returns the source group when claimed — with
 * `preventDefault()` already called — or null when declined.
 */
export function claimGridSurfaceDrop(
  api: DockviewApi,
  ev: DropEventLike,
  cfg: UnwrapConfig,
): DockviewGroupPanel | null {
  if (!cfg.autoWrap()) {
    return null;
  }
  // kinds: 'content' (doc grid surface), 'edge' (root band), 'tab' /
  // 'header_space' (document tab strip / its void — still the grid
  // surface; a group drop there must UNDOCK, never merge as tabs)
  if (ev.kind !== 'content' && ev.kind !== 'edge'
    && ev.kind !== 'tab' && ev.kind !== 'header_space') {
    return null;
  }
  if (ev.kind !== 'edge'
    && (!ev.group || ev.group.api.location.type !== 'grid')) {
    return null;
  }
  // claim ANY position over the grid surface (center + all edge zones) —
  // the whole doc grid is "empty space" for panel AND group drops
  // (see overGridSurface)
  if (!ev.nativeEvent || !overGridSurface(ev.nativeEvent, cfg.layoutArea())) {
    return null;
  }
  const data = dataOf(ev);
  if (!data) {
    return null;
  }
  const srcGroup = api.getGroup(data.groupId ?? '');
  if (!srcGroup || srcGroup.api.location.type !== 'floating') {
    return null;
  }
  ev.preventDefault(); // skip the stock merge/dock into the main grid
  return srcGroup as DockviewGroupPanel;
}

/**
 * The onWillDrop handler: claims grid-surface drops (auto-wrap unwrap),
 * applies the T2/T4 veto set, enforces float exclusion. Returns true when
 * the event was fully handled (preventDefault already called).
 *
 * The mock registers TWO onWillDrop listeners (emitters are multicast):
 * the claim at mock :1343 and the veto trio at :1479–1483 as the
 * "belt-and-braces backstop". This handler reproduces both in one body:
 * a successful claim short-circuits (the mock's second listener's
 * preventDefault after a claim is an idempotent no-op — observably
 * identical), and a DECLINED claim falls through to the vetoes exactly
 * like the mock's always-running second listener.
 */
export function handleWillDrop(
  api: DockviewApi,
  ev: DropEventLike,
  cfg: UnwrapConfig,
): boolean {
  const area = cfg.layoutArea();

  // --- claim: grid-surface drop unwraps (T1) -----------------------------
  const claimed = claimGridSurfaceDrop(api, ev, cfg);
  if (claimed) {
    unwrapAtPointer(api, ev, claimed, area);
    return true;
  }

  // --- vetoes (also the auto-wrap-off path — HP7/F1) ----------------------
  if (panelEdgeDropVeto(api, ev, cfg, area)) {
    ev.preventDefault();
    return true;
  }
  if (groupGridDropVeto(api, ev, cfg, area)) {
    ev.preventDefault();
    return true;
  }
  if (floatExclusionVeto(api, ev, cfg)) {
    ev.preventDefault();
    return true;
  }
  return false;
}

/** T4: panels merge as tabs (center) or stack (top/bottom) — never split. */
export function panelEdgeDropVeto(
  api: DockviewApi,
  ev: DropEventLike,
  cfg: UnwrapConfig,
  area: HTMLElement | null,
): boolean {
  if (ev.kind !== 'content' && ev.kind !== 'edge') {
    return false; // tab-strip drops stay stock
  }
  if (ev.position === 'center') {
    return false; // merges stay
  }
  const d = dataOf(ev);
  if (!d || d.viewId !== cfg.viewId()) {
    return false;
  }
  if (d.panelId != null) {
    // panel drag on a GRID (doc) target:
    //  - pointer over the grid surface → T1 auto-wrap claims it (no veto;
    //    vetoing would clear the latched state and kill the claim)
    //  - pointer NOT over the grid surface (the drop target resolved to
    //    the doc group while the pointer sits on a float window's outer
    //    band — protruding titlebar/resize-handle/edge shadow, where
    //    overGridSurface is false) → NEITHER the claim nor a useful
    //    stock outcome applies: veto, so the panel can never dock or
    //    become a sibling tab of the document
    if (ev.kind === 'content' && ev.group
      && ev.group.api.location.type === 'grid') {
      return !(ev.nativeEvent
        && overGridSurface(ev.nativeEvent, area));
    }
    return true; // root edge band / float-window edge zone → veto
  }
  // whole-group drag → GROUP AUTO-UNWRAP territory: over the grid
  // surface (empty space, any zone) the unwrap handler claims the drop,
  // so no veto may clear the drop-target state there — kind 'content' on
  // a non-floating (grid) target is the claim's domain (mock :1400). On
  // FLOAT-WINDOW targets: center = merge as tabs (stock), top/bottom =
  // stack (stock, required flow) — only left/right side-splits are
  // vetoed.
  if (ev.kind === 'content' && ev.group
    && ev.group.api.location.type !== 'floating') {
    return false;
  }
  return ev.position === 'left' || ev.position === 'right';
}

/** T2: whole-group drops never dock into the main grid. */
export function groupGridDropVeto(
  api: DockviewApi,
  ev: DropEventLike,
  cfg: UnwrapConfig,
  area: HTMLElement | null,
): boolean {
  const d = dataOf(ev);
  if (!d || d.viewId !== cfg.viewId() || d.panelId !== null) {
    return false; // panel drags → T4/T1
  }
  if (cfg.autoWrap() && ev.nativeEvent
    && overGridSurface(ev.nativeEvent, area)) {
    return false; // unwrap handler claims empty space first
  }
  if (ev.kind === 'edge') {
    return true;
  }
  if (ev.kind === 'content' || ev.kind === 'tab'
    || ev.kind === 'header_space') {
    return !ev.group || ev.group.api.location.type === 'grid';
  }
  return false;
}

/** Float exclusion: designated panels/groups never enter float windows. */
export function floatExclusionVeto(
  api: DockviewApi,
  ev: DropEventLike,
  cfg: UnwrapConfig,
): boolean {
  if (ev.kind !== 'content' && ev.kind !== 'tab'
    && ev.kind !== 'header_space') {
    return false;
  }
  const tgt = ev.group;
  if (!tgt || tgt.api.location.type !== 'floating') {
    return false;
  }
  const d = dataOf(ev);
  if (!d || d.viewId !== cfg.viewId()) {
    return false;
  }
  const excluded = cfg.floatExcludedPanelIds?.() ?? new Set<string>();
  if (d.panelId != null) {
    return excluded.has(d.panelId);
  }
  const srcGroup = api.getGroup(d.groupId ?? '');
  return !!srcGroup && srcGroup.panels.some((p) => excluded.has(p.id));
}

/**
 * Group-drag live state (the mock's `groupDragLive`, :1024): latched by
 * the onWillDragGroup wiring (`wireGroupDragFallback`, :1026–1038) and
 * consumed-and-cleared by the pointerup fallback. Only VOID-CONTAINER
 * drags reach the latch — the titlebar drag source is disabled by
 * suppressTitlebarGroupDrag (T6).
 */
export interface GroupDragLive {
  /** The group whose void-container drag is in flight; null when idle. */
  group: DockviewGroupPanel | null;
  /** The float window's gridview element the group lived in at arm time. */
  ownerGridviewEl: HTMLElement | null;
}

/**
 * Group-drag pointerup fallback: the stock drop pipeline resolves targets
 * by what sits under the pointer; over dead zones (toolbar, statusbar,
 * outside the layout area) nothing fires. While a group drag is live, a
 * release that is NOT over a float window unwraps the group — but only if
 * the stock pipeline didn't already relocate it (owner-gridview check).
 *
 * The latch is CLEARED at entry (mock :1041–1044) — before every guard —
 * so a fallback that declines still leaves the wiring idle.
 */
export function maybeUnwrapGroupAtPointer(
  api: DockviewApi,
  ev: RetirePointerEvent,
  state: GroupDragLive,
  cfg: UnwrapConfig,
): boolean {
  const g = state.group;
  const ownerEl = state.ownerGridviewEl;
  state.group = null;
  state.ownerGridviewEl = null;
  if (!ev || ev.button !== 0) {
    return false;
  }
  if (!g || !cfg.autoWrap()) {
    return false;
  }
  try {
    if (api.getGroup(g.id) !== g) {
      return false;
    }
    if (g.api.location.type !== 'floating') {
      return false;
    }
    const el = g.element.closest('.dv-grid-view');
    if (!el || el !== ownerEl) {
      return false; // stock drop moved it — leave semantics alone
    }
    if (overFloatWindow(ev.clientX, ev.clientY)) {
      return false; // drop INTO a window's zones — stock territory
    }
    const area = cfg.layoutArea();
    if (!area) {
      return false;
    }
    const r = area.getBoundingClientRect();
    const src = g.element.getBoundingClientRect();
    const w = Math.round(src.width);
    const h = Math.round(src.height);
    const x = Math.min(
      Math.max(ev.clientX - r.left - w / 2, 4),
      Math.max(r.width - w - 4, 4),
    );
    const y = Math.min(
      Math.max(ev.clientY - r.top - 16, 4),
      Math.max(r.height - h - 4, 4),
    );
    api.addFloatingGroup(g, { x, y, width: w, height: h });
    return true;
  } catch {
    return false;
  }
}

/**
 * Zone-overlay suppression state for onWillShowOverlay: while a claim is
 * live (auto-wrap + grid-surface hover), grid zones are hidden via the
 * `.mn-unwrap-hover` class (preventDefault would also kill the drop).
 */
export function overlayClaimActive(
  ev: DropEventLike,
  cfg: UnwrapConfig,
): boolean {
  const d = dataOf(ev);
  return cfg.autoWrap() && !!d && d.viewId === cfg.viewId()
    && !!ev.nativeEvent
    && overGridSurface(ev.nativeEvent, cfg.layoutArea())
    && !(ev.group?.element?.closest('.dv-resize-container'));
}


/* ---- wiring (api.spec.md §3 module 4, mock :1343–1344 + :1460–1483) ---- */

/** Getter-or-value normalization for `useDropRules` options. */
type Resolved<T> = () => T;
function resolveGetter<T>(v: T | (() => T)): Resolved<T> {
  return typeof v === 'function' ? (v as () => T) : () => v;
}

export interface DropRulesOptions {
  /** The live engine api (call from `onReady`, after the layout is loaded). */
  readonly api: DockviewApi;
  /**
   * Auto-wrap undock on empty-space drops; default true (HP2/HP7). Getter
   * form keeps the toggle live without re-wiring (§2.1 option).
   */
  readonly autoWrap?: boolean | (() => boolean);
  /**
   * Panel ids that must never enter a float window (§2.5 registry-derived
   * `floatExcludedPanels(registry)` — F3). Getter form re-derives per
   * event; cannot drift from the registry.
   */
  readonly floatExcludedPanelIds?:
    | ReadonlySet<string>
    | (() => ReadonlySet<string>);
  /**
   * Container of the layout surface, for grid hit-testing and the
   * `.mn-unwrap-hover` suppression toggle. Returns null → the toggle and
   * the claim's hit-test decline (the mock's `if (area)` guards).
   */
  readonly layoutArea: HTMLElement | (() => HTMLElement | null);
}

/** The handlers `useDropRules` registers (mock's exact wiring, bound). */
export interface DropRules {
  /** `api.onWillDrop` — claim path, veto trio as backstop (mock :1343/:1479). */
  readonly onWillDrop: (ev: DropEventLike) => void;
  /**
   * `api.onWillShowOverlay` — `.mn-unwrap-hover` claimed-state toggle +
   * the three veto preventDefaults (mock :1460–1478).
   */
  readonly onWillShowOverlay: (ev: DropEventLike) => void;
  /** `api.onWillDragGroup` — the groupDragLive latch (mock :1026–1038). */
  readonly onWillDragGroup: (ev: GroupDragEvent) => void;
  /**
   * The gate's `onRetireFirst` slot (D11/D14): module 1 passes this to
   * `createWindowDragGate` — dead-zone pointerup fallback, run FIRST in
   * the retire sequence (mock :1079–1081). No-op without a latched group.
   */
  readonly retireFirst: (ev: RetirePointerEvent) => void;
  /** The live group-drag latch (consumed by `retireFirst`). */
  readonly groupDragLive: GroupDragLive;
  /** Unwire every registration. */
  dispose(): void;
}

/**
 * Wire the drop rules into an api: the auto-wrap claim + veto backstop on
 * `onWillDrop`, the `.mn-unwrap-hover` suppression toggle + veto
 * preventDefaults on `onWillShowOverlay`, and the `groupDragLive` latch on
 * `onWillDragGroup` (the mock's `wireGroupDragFallback`).
 *
 * Named `useDropRules` per the api.spec.md §3 inventory, but it is a
 * framework-AGNOSTIC wiring function, not a React hook — module 1
 * (`PanelLayout`) calls it inside `onReady` and disposes on unmount (D6),
 * passing `retireFirst` to the window-drag gate's `onRetireFirst` seam.
 * Engine emitters are multicast, so consumers may subscribe their own
 * `onWillDrop` handlers without displacing this wiring (§2.2).
 */
export function useDropRules(options: DropRulesOptions): DropRules {
  const { api } = options;
  const autoWrap = resolveGetter(options.autoWrap ?? true);
  const excluded = options.floatExcludedPanelIds !== undefined
    ? resolveGetter(options.floatExcludedPanelIds)
    : undefined;
  const layoutArea = resolveGetter(options.layoutArea);
  const cfg: UnwrapConfig = {
    autoWrap,
    // The engine's component id (drag data viewId check) — the mock's
    // `comp.id`; `DockviewApi.id` delegates to it (dockview 7.0.4).
    viewId: () => api.id,
    ...(excluded ? { floatExcludedPanelIds: excluded } : {}),
    layoutArea,
  };

  const groupDragLive: GroupDragLive = { group: null, ownerGridviewEl: null };

  const onWillDrop = (ev: DropEventLike): void => {
    handleWillDrop(api, ev, cfg);
  };

  const onWillShowOverlay = (ev: DropEventLike): void => {
    // OVERLAY SUPPRESSION for claimed drops: when the auto-unwrap handler
    // will claim this drop (a panel or group drag over the grid surface),
    // the stock zone indicators are inert — every zone there unwraps — so
    // hide them via the layout-area class (preventDefault would ALSO kill
    // the drop, which the claim needs). Float-window overlays (real
    // stacking/merge targets) stay visible (CSS keeps them on).
    const claimed = overlayClaimActive(ev, cfg);
    const area = layoutArea();
    if (area) {
      area.classList.toggle('mn-unwrap-hover', claimed);
    }
    if (panelEdgeDropVeto(api, ev, cfg, layoutArea())) {
      ev.preventDefault();
    }
    if (groupGridDropVeto(api, ev, cfg, layoutArea())) {
      ev.preventDefault(); // don't even show the misleading zone
    }
    if (floatExclusionVeto(api, ev, cfg)) {
      ev.preventDefault(); // excluded panels never enter a mini window
    }
  };

  const onWillDragGroup = (ev: GroupDragEvent): void => {
    // only void-container drags reach here (the titlebar source is
    // disabled by suppressTitlebarGroupDrag — T6)
    const g = ev.group;
    if (!g || g.api.location.type !== 'floating') {
      return;
    }
    groupDragLive.group = g;
    groupDragLive.ownerGridviewEl = null;
    const fp = floatingGroups(api)
      .find((f) => f.gridview.element.contains(g.element));
    if (fp) {
      groupDragLive.ownerGridviewEl = fp.gridview.element;
    }
  };

  const retireFirst = (ev: RetirePointerEvent): void => {
    // The gate imposes only the ORDER (D11); the mock's guard travels with
    // the provider: run the fallback only when a group drag was live
    // (mock :1079–1081).
    if (groupDragLive.group) {
      maybeUnwrapGroupAtPointer(api, ev, groupDragLive, cfg);
    }
  };

  const unwires: Array<() => void> = [
    api.onWillDrop(onWillDrop).dispose,
    api.onWillShowOverlay(onWillShowOverlay).dispose,
    api.onWillDragGroup(onWillDragGroup).dispose,
  ];

  return {
    onWillDrop,
    onWillShowOverlay,
    onWillDragGroup,
    retireFirst,
    groupDragLive,
    dispose() {
      for (const unwire of unwires.splice(0)) {
        unwire();
      }
    },
  };
}
