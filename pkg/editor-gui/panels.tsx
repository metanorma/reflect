/**
 * editor-gui's panel registry + the three panel components for
 * `<PanelLayout>` (api.spec.md §2.5: registry key = the serialized
 * `contentComponent` name; the component renders inside the library's
 * fixed-height, internally scrolling box).
 *
 * Composition (integration rulings): the registry is a MODULE-LEVEL
 * constant — identity-stable by construction, so the wrapped components
 * map `<PanelLayout>` derives from it is stable too and panels never
 * remount because App re-rendered. Live values reach the panels through
 * React context (`panelContexts.ts`), never through the registry and
 * never through dockview `params` (params serialize into the layout
 * JSON — no live state belongs there).
 *
 * - `doc` — `floatable: false` (float exclusion keyed by PANEL ID; here
 *   id = contentComponent = 'doc', single-entry form) + the preset's
 *   `hideHeader`/`locked` group policy: the full-bleed, non-closable
 *   ProseMirror surface. Renders `<ProseMirrorDoc/>` — the doc surface
 *   component re-exported from `@metanorma/prosemirror-editor` (the
 *   single-instance re-export; editor-gui must not depend on
 *   `@handlewithcare/react-prosemirror` directly).
 * - `minimap` — `<MinimapPane>`, unchanged; captures the `EditorView`
 *   through `useEditorEffect` (editor context flows through the dockview
 *   portal) and re-keys on the doc-load epoch.
 * - `toolbar` — `<AdvancedMetanormaToolbar>` in the vertical consumer
 *   variant; it reads editor state through its own react-prosemirror
 *   context hooks, so this component is a thin placement wrapper.
 */

import React, { useContext } from 'react';
import type { FC } from 'react';
import type { IDockviewPanelProps, PanelRegistry } from '@metanorma/panel-layout';
import { ProseMirrorDoc } from '@metanorma/prosemirror-editor';
import { AdvancedMetanormaToolbar } from '@metanorma/toolbar';
import { MinimapPane } from './MinimapPane.jsx';
import { DocEpochContext } from './panelContexts.js';

/**
 * The document surface: the doc-surface component inside the scroll
 * container. The inner `mn-prosemirror` wrapper is REQUIRED — the editor
 * package's document stylesheet scopes its content styles to it
 * (`@layer document { .mn-prosemirror table:has(colgroup…) … }` in
 * document.css: table-layout/fixed colgroups, figure/formula/title/
 * sourcecode styling). Dropping it (as a Phase-4 iteration briefly did)
 * silently disables every `.mn-prosemirror`-scoped rule — plugin-smoke's
 * computed-style assertions catch it; text-level smokes cannot. The base
 * rule is benign (`min-height` + `outline:none`), so the wrapper adds no
 * layout constraints of its own. All editor wiring (state, plugins, e2e
 * hooks) lives in App around `<ProseMirror>`; this panel only places the
 * surface.
 */
const DocumentPanel: FC<IDockviewPanelProps> = () => (
  <div className="mn-doc-panel">
    <div className="mn-prosemirror">
      <ProseMirrorDoc />
    </div>
  </div>
);

/** The minimap: `<MinimapPane>` re-keyed per doc-load epoch. */
const MinimapPanel: FC<IDockviewPanelProps> = () => {
  const epoch = useContext(DocEpochContext);
  return <MinimapPane key={epoch} />;
};

/**
 * The document-manipulation toolbar (integration ruling: floating panel,
 * vertical orientation — it fills the window's content box; the window is
 * user-resizable with the library's 150px floor).
 */
const ToolbarPanel: FC<IDockviewPanelProps> = () => (
  <AdvancedMetanormaToolbar className="mn-toolbar mn-toolbar--vertical" />
);

/**
 * The registry. Module-level constant — identity-stable (see header).
 * Titles live in the preset (layout-first precedence, api.spec.md §2.5);
 * no registry `minHeight` overrides — the global floors suffice.
 */
export const panelRegistry: PanelRegistry = {
  doc: { component: DocumentPanel, floatable: false },
  minimap: { component: MinimapPanel },
  toolbar: { component: ToolbarPanel },
};
