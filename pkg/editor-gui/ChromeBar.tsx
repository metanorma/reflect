/**
 * `<ChromeBar>` — editor-gui's top application chrome (integration
 * ruling: app actions live in the chrome ABOVE `<PanelLayout>`; document
 * manipulation lives in the floating toolbar panel).
 *
 * Carries, left to right:
 * - the document title (derived from bibdata in App — replaces the old
 *   Sidebar's vertical label);
 * - the **Panels** control: one reopen button per floatable panel
 *   (Minimap, Toolbar). Closed panels are re-created directly in a
 *   floating window at the preset geometry (`addPanel` + `floating` —
 *   engine-verified surface). The doc panel is deliberately absent: it is
 *   non-closable by construction (preset `hideHeader`/`locked`), so it
 *   never needs reopening.
 * - Save / Open (moved verbatim from the old Sidebar; the handlers are
 *   App's `handleSave`/`handleLoad`, stable callbacks).
 *
 * Panel-open state is tracked HERE, not in App: the layout api is stable
 * per mount, and the `onDidLayoutChange` subscription re-renders only
 * this bar (layout changes fire continuously during window drags — App
 * must not re-render for them, or `<PanelLayout>`'s engine props churn).
 * `React.memo` keeps the bar out of App's per-keystroke re-renders.
 */

import React, { useEffect, useState } from 'react';
import type { PanelLayoutApi } from '@metanorma/panel-layout';
import classNames from './style.module.css';
import { FLOAT_PANELS } from './presetLayout.js';

export interface ChromeBarProps {
  /** Document title from bibdata, or null if empty. */
  readonly docTitle: string | null;
  /** Invoked when the Save button is clicked. */
  readonly onSave: () => void;
  /** Invoked when the Open button is clicked. */
  readonly onLoad: () => void;
  /** The layout engine api (null until `<PanelLayout>` fires onReady). */
  readonly layoutApi: PanelLayoutApi | null;
}

/** Download / "save" icon (24×24, `currentColor`). */
const SaveIcon: React.FC = () => (
  <svg className={classNames.chromeButtonIcon} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

/** Folder-open / "open" icon (24×24 viewBox, rendered at 16px via CSS). */
const OpenIcon: React.FC = () => (
  <svg className={classNames.chromeButtonIcon} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

export const ChromeBar = React.memo<ChromeBarProps>(function ChromeBar({
  docTitle, onSave, onLoad, layoutApi,
}) {
  const title = docTitle ?? 'Untitled document';

  // Which reopenable panels currently exist. Refreshed on every layout
  // change (panel close/open/remove all fire it).
  const [open, setOpen] = useState<Record<'minimap' | 'toolbar', boolean>>({
    minimap: false, toolbar: false,
  });

  useEffect(() => {
    if (layoutApi === null) return;
    const refresh = () => setOpen({
      minimap: layoutApi.getPanel('minimap') !== undefined,
      toolbar: layoutApi.getPanel('toolbar') !== undefined,
    });
    refresh();
    const sub = layoutApi.onDidLayoutChange(refresh);
    return () => sub.dispose();
  }, [layoutApi]);

  /** Re-create a closed panel directly in a floating window (preset seed). */
  const reopenPanel = (id: 'minimap' | 'toolbar') => {
    const api = layoutApi;
    if (api === null || api.getPanel(id) !== undefined) return;
    const seed = FLOAT_PANELS[id];
    api.addPanel({
      id,
      component: id,
      title: seed.title,
      floating: { x: seed.x, y: seed.y, width: seed.width, height: seed.height },
    });
  };

  return (
    <header className={classNames.chromeBar}>
      <span className={classNames.chromeTitle} title={title}>{title}</span>

      {/* Panels control: reopen closed floating panels. */}
      <span className={classNames.chromePanelsLabel}>Panels</span>
      <span className={classNames.chromePanels}>
        {(['minimap', 'toolbar'] as const).map((id) => (
          <button
            key={id}
            type="button"
            className={classNames.chromeButton}
            disabled={layoutApi === null || open[id]}
            onClick={() => reopenPanel(id)}
            aria-label={open[id]
              ? `${FLOAT_PANELS[id].title} panel is open`
              : `Reopen the ${FLOAT_PANELS[id].title} panel`}
          >
            {FLOAT_PANELS[id].title}
          </button>
        ))}
      </span>

      <span className={classNames.chromeDivider} aria-hidden="true" />

      <button type="button" className={classNames.chromeButton} onClick={onSave}
        aria-label="Save…">
        <SaveIcon />
        <span className={classNames.chromeButtonLabel}>Save…</span>
      </button>
      <button type="button" className={classNames.chromeButton} onClick={onLoad}
        aria-label="Open…">
        <OpenIcon />
        <span className={classNames.chromeButtonLabel}>Open…</span>
      </button>
    </header>
  );
});
