/**
 * editor-gui's preset layout — the consumer-side serialized layout handed
 * to `<PanelLayout>` as `defaultLayout` (used when storage is empty or
 * corrupt) and to persistence as the fallback.
 *
 * Shape cribbed from the panel-layout demo's preset (`@metanorma/panel-layout`
 * demo/preset.ts — the reference consumer): a `grid.root` main grid holding
 * ONLY the document panel, plus `floatingGroups` — each a floating window
 * with a nested vertical grid whose leaf `size` is the tabset's height.
 *
 * Phase-0 rulings baked in:
 *
 * - The doc group carries `hideHeader: true` + `locked: 'no-drop-target'`
 *   (serialized `CoreGroupOptions` fields, round-tripped by the engine):
 *   no tab strip → no close button and no drag handle; no drop zones → no
 *   dock-into-doc. The ProseMirror surface can therefore never be
 *   accidentally closed or dragged out — the "effectively non-closable
 *   editor surface" requirement — using ONLY the public API (the titled
 *   variant would need a per-panel hideClose the library does not expose).
 * - The registry's `doc` entry pairs with this as `floatable: false`
 *   (float exclusion is keyed by PANEL ID; here id = contentComponent =
 *   'doc', so the single-entry form suffices — decisions.txt D33's
 *   id≠component split does not arise).
 * - Floating windows are clamped to ≥ MIN_WIN_H (150px) by the library's
 *   pin pass — the toolbar window is seeded tall (a vertical toolbar fills
 *   its content box); both are user-resizable from there.
 */

import type { SerializedDockview } from '@metanorma/panel-layout';
import { CONSTANTS } from '@metanorma/panel-layout';

/** Panel titles (serialized on the panel — layout-first precedence). */
const TITLES = {
  doc: 'Document',
  minimap: 'Minimap',
  toolbar: 'Toolbar',
} as const;

/**
 * A tabset's serialized state (engine `GroupPanelViewState` shape), with
 * the group-policy fields the doc group uses (`CoreGroupOptions`).
 */
interface GroupData {
  readonly id: string;
  readonly views: string[];
  readonly activeView?: string;
  /** Drop-interaction lock; `'no-drop-target'` disables all drop zones. */
  readonly locked?: boolean | 'no-drop-target';
  /** Hide the tab strip entirely (no close button, no drag handle). */
  readonly hideHeader?: boolean;
}

type PresetNode =
  | { readonly type: 'leaf'; readonly data: GroupData; readonly size: number }
  | { readonly type: 'branch'; readonly data: PresetNode[]; readonly size: number };

/** The engine's grid orientation, reached through the PUBLIC type only. */
type GridOrientation = SerializedDockview['grid']['orientation'];
// String-enum assertion (comparable literal): the serialized form carries
// the member's value; the public API re-exports types only, not values.
const HORIZONTAL = 'HORIZONTAL' as GridOrientation;
const VERTICAL = 'VERTICAL' as GridOrientation;

const G = (id: string, views: string[], activeView: string): GroupData =>
  ({ id, views, activeView });
const leaf = (data: GroupData, size: number): PresetNode =>
  ({ type: 'leaf', data, size });
const branch = (data: PresetNode[], size: number): PresetNode =>
  ({ type: 'branch', data, size });

/**
 * Floating-window geometry (top-left area, clear of the document's
 * editing center on narrow viewports). `position` carries the WINDOW
 * rect; the nested leaf size is the TABSET height = window height minus
 * the titlebar chrome constant (`undockChrome`).
 */
const TOOLBAR_WINDOW = { x: 18, y: 12, width: 116, height: 480 };
const MINIMAP_WINDOW = { x: 146, y: 12, width: 104, height: 420 };

export function presetLayout(): SerializedDockview {
  const panels: Record<string, { id: string; contentComponent: string;
    title: string; params: Record<string, never> }> = {};
  for (const id of Object.keys(TITLES) as Array<keyof typeof TITLES>) {
    // Panel id doubles as the contentComponent name (registry key).
    panels[id] = { id, contentComponent: id, title: TITLES[id], params: {} };
  }

  const toolbarTabsetH = TOOLBAR_WINDOW.height - CONSTANTS.undockChrome;
  const minimapTabsetH = MINIMAP_WINDOW.height - CONSTANTS.undockChrome;

  return {
    grid: {
      // Main grid = the document alone, full-bleed (see header).
      root: branch([{
        type: 'leaf',
        data: {
          ...G('group-doc', ['doc'], 'doc'),
          hideHeader: true,
          locked: 'no-drop-target',
        },
        size: 1200,
      }], 800),
      height: 800, width: 1200, orientation: HORIZONTAL,
    },
    panels,
    activeGroup: 'group-doc',
    floatingGroups: [
      { // Vertical document toolbar (fills the window's content box).
        grid: {
          root: branch([
            leaf(G('group-toolbar', ['toolbar'], 'toolbar'), toolbarTabsetH),
          ], toolbarTabsetH),
          width: TOOLBAR_WINDOW.width, height: TOOLBAR_WINDOW.height,
          orientation: VERTICAL,
        },
        position: {
          left: TOOLBAR_WINDOW.x, top: TOOLBAR_WINDOW.y,
          width: TOOLBAR_WINDOW.width, height: TOOLBAR_WINDOW.height,
        },
      },
      { // Document minimap.
        grid: {
          root: branch([
            leaf(G('group-minimap', ['minimap'], 'minimap'), minimapTabsetH),
          ], minimapTabsetH),
          width: MINIMAP_WINDOW.width, height: MINIMAP_WINDOW.height,
          orientation: VERTICAL,
        },
        position: {
          left: MINIMAP_WINDOW.x, top: MINIMAP_WINDOW.y,
          width: MINIMAP_WINDOW.width, height: MINIMAP_WINDOW.height,
        },
      },
    ],
  };
}
