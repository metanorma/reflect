/**
 * editor-gui-local React contexts crossing the panel boundary.
 *
 * `<PanelLayout>` renders dockview panels through React portals — context
 * resolves through portals (verified: dockview-react's `ReactPart` uses
 * `ReactDOM.createPortal` from within `DockviewReact`'s element tree), so
 * any provider that is an ANCESTOR of `<PanelLayout>` is visible to the
 * registered panel components. App provides these; the panel components
 * in `panels.tsx` consume them.
 *
 * (The editor context itself — the `@handlewithcare/react-prosemirror`
 * provider — is provided by `<ProseMirror>` in App and needs no
 * editor-gui-local twin: `MinimapPane`'s `useEditorEffect` and the
 * toolbar's internal selector hooks both resolve it through the same
 * portal mechanism.)
 */

import { createContext } from 'react';

/**
 * Doc-load epoch: increments on every document LOAD (`loadDocFromJson`).
 * A fresh `EditorState` re-creates every plugin view, so the minimap
 * controller the `<Minimap>` component holds must be re-attached by
 * REMOUNTING the pane — the epoch re-keys `<MinimapPane>` inside the
 * minimap panel (App.tsx's `docEpoch`, unchanged semantics from the
 * pre-panel-layout composition).
 */
export const DocEpochContext = createContext<number>(0);
