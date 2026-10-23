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

import type { DockviewApi, DockviewGroupPanel } from 'dockview';

import { CONSTANTS } from './tokens.js';



/** Structural shape of dockview's will-drop / will-show-overlay events. */
export interface DropEventLike {
  readonly kind: 'content' | 'edge' | 'tab' | 'header_space';
  readonly position:
    | 'center' | 'top' | 'bottom' | 'left' | 'right'
    | 'tab' | 'header_space';
  readonly group?: DockviewGroupPanel;
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
 * The onWillDrop handler: claims grid-surface drops (auto-wrap unwrap),
 * applies the T2/T4 veto set, enforces float exclusion. Returns true when
 * the event was fully handled (preventDefault already called).
 */
export function handleWillDrop(
  api: DockviewApi,
  ev: DropEventLike,
  cfg: UnwrapConfig,
): boolean {
  const area = cfg.layoutArea();

  // --- claim: grid-surface drop unwraps (T1) -----------------------------
  if (cfg.autoWrap()) {
    const kindClaimed = ev.kind === 'content' || ev.kind === 'edge'
      || ev.kind === 'tab' || ev.kind === 'header_space';
    if (!kindClaimed) {
      return false;
    }
    if (ev.kind !== 'edge'
      && (!ev.group || ev.group.api.location.type !== 'grid')) {
      return false;
    }
    if (!ev.nativeEvent || !overGridSurface(ev.nativeEvent, area)) {
      return false;
    }
    const data = dataOf(ev);
    if (!data) {
      return false;
    }
    const srcGroup = api.getGroup(data.groupId ?? '');
    if (!srcGroup || srcGroup.api.location.type !== 'floating') {
      return false;
    }
    ev.preventDefault(); // skip the stock merge/dock into the main grid
    unwrapAtPointer(api, ev, srcGroup as DockviewGroupPanel, area);
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
    // grid-target content drop with pointer on the grid surface is the
    // auto-wrap claim's territory — vetoing would clear the latched state.
    if (ev.kind === 'content' && ev.group
      && ev.group.api.location.type === 'grid') {
      return !(ev.nativeEvent
        && overGridSurface(ev.nativeEvent, area));
    }
    return true; // root edge band / float-window edge zone → veto
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
 * Group-drag pointerup fallback: the stock drop pipeline resolves targets
 * by what sits under the pointer; over dead zones (toolbar, statusbar,
 * outside the layout area) nothing fires. While a group drag is live, a
 * release that is NOT over a float window unwraps the group — but only if
 * the stock pipeline didn't already relocate it (owner-gridview check).
 */
export function maybeUnwrapGroupAtPointer(
  api: DockviewApi,
  ev: PointerEvent,
  state: {
    readonly group: DockviewGroupPanel | null;
    readonly ownerGridviewEl: HTMLElement | null;
  },
  cfg: UnwrapConfig,
): boolean {
  const g = state.group;
  const ownerEl = state.ownerGridviewEl;
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
