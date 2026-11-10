/**
 * Demo preset layout — the 11-panel serialized layout (behavior.spec.md
 * §4 "Floats"/"Grid"; demo data, never library contract). Translated
 * VERBATIM from the reference mock's `TITLES` + `presetLayout()`
 *: same group ids, sizes, positions, titles — the parity
 * goldens pin these (PRESET_GROUP_IDS / PRESET_HEIGHTS in
 * tests/parity/flows.mjs).
 *
 * grid.root: main grid = Document only (branch > leaf).
 * floatingGroups[]: each panel group is a floating window with a NESTED
 * grid (v7 SerializedFloatingGroup.grid). Root branch orientation
 * VERTICAL => the window's groups stack top-to-bottom sharing its width;
 * leaf `size` = height in px (for a VERTICAL branch, size is the height
 * dimension). `views` reference panel ids in `panels`.
 *
 * NOTE: the extraction anchors this module superseded were removed with
 * the extraction pipeline ; this module is the single source.
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * @ 94d4b8307e5f0db2a1b32e14ceb8754207a51f27
 */
import type { SerializedDockview } from '@metanorma/panel-layout';

const TITLES = {
  doc: '24817-1.adoc',
  outline: 'Outline',
  bibliography: 'Bibliography',
  validation: 'Validation',
  review: 'Review',
  pinned: 'Pinned · #fig-ion-beam',
  identity: 'Identity & References',
  attributes: 'Attributes',
  structure: 'Structure',
  derived: 'Derived · read-only',
  overlays: 'Overlays',
};

/** A tabset's serialized state (engine `GroupPanelViewState` shape). */
interface GroupData {
  readonly id: string;
  readonly views: string[];
  readonly activeView?: string;
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

export function presetLayout(): SerializedDockview {
  const panels: Record<string, { id: string; contentComponent: string;
    title: string; params: Record<string, never> }> = {};
  for (const id of Object.keys(TITLES) as Array<keyof typeof TITLES>) {
    // component key: panel id, except 'doc' which renders the 'document' component
    const component = id === 'doc' ? 'document' : id;
    panels[id] = { id, contentComponent: component, title: TITLES[id], params: {} };
  }
  return {
    grid: {
      root: branch([leaf(G('group-doc', ['doc'], 'doc'), 1200)], 800),
      height: 800, width: 1200, orientation: HORIZONTAL,
    },
    panels,
    activeGroup: 'group-doc',
    floatingGroups: [
      { // Navigation: Outline / Bibliography+Validation / Review
        grid: {
          root: branch([
            leaf(G('group-nav-1', ['outline'], 'outline'), 244),
            leaf(G('group-nav-2', ['bibliography', 'validation'], 'bibliography'), 132),
            leaf(G('group-nav-3', ['review'], 'review'), 74),
          ], 252),
          width: 252, height: 474, orientation: VERTICAL,
        },
        position: { left: 18, top: 12, width: 252, height: 450 },
      },
      { // Pinned
        grid: {
          root: branch([leaf(G('group-pinned', ['pinned'], 'pinned'), 142)], 300),
          width: 300, height: 168, orientation: VERTICAL,
        },
        position: { left: 292, top: 12, width: 300, height: 168 },
      },
      { // Inspector: Identity / Attributes / Structure / Derived+Overlays
        grid: {
          root: branch([
            leaf(G('group-insp-1', ['identity'], 'identity'), 200),
            leaf(G('group-insp-2', ['attributes'], 'attributes'), 180),
            leaf(G('group-insp-3', ['structure'], 'structure'), 116),
            leaf(G('group-insp-4', ['derived', 'overlays'], 'derived'), 100),
          ], 320),
          width: 320, height: 628, orientation: VERTICAL,
        },
        position: { left: 1050, top: 12, width: 320, height: 602 },
      },
    ],
  };
}
