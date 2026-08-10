/**
 * Left hover-expand sidebar — a consumer-local editor-gui affordance.
 *
 * NOT part of `@metanorma/toolbar` (which has a governing spec and is purely
 * content-editing). This sidebar hosts document-level actions (Save/Open) that
 * are the consumer's responsibility — the editor mount treats the document as a
 * controlled value.
 *
 * Layout: a fixed-width rail (`aside.mn-sidebar`) whose inner panel
 * (`.mn-sidebar__panel`) is absolutely positioned so it can overlay the editor
 * when it widens on hover without reflowing the editor layout. Collapsed
 * (48px) shows icons only, centered; expanded (168px) shows full-width buttons
 * with both icon and text label.
 *
 * The top region shows the document title rotated vertically (counter-
 * clockwise), truncated with ellipsis if it doesn't fit. The Save/Open button
 * group sits at the bottom.
 */

import React from 'react';
import classNames from './style.module.css';

export interface SidebarProps {
  /** Invoked when the Save button is clicked. */
  readonly onSave: () => void;
  /** Invoked when the Open button is clicked. */
  readonly onLoad: () => void;
  /** Document title for the vertical label, or null if empty. */
  readonly docTitle: string | null;
}

/**
 * Download / "save" icon (24×24, `currentColor`).
 */
const SaveIcon: React.FC = () => (
  <svg className={classNames.sidebarButtonIcon} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

/**
 * Folder-open / "open" icon (24×24 viewBox, rendered at 18px via CSS).
 */
const OpenIcon: React.FC = () => (
  <svg className={classNames.sidebarButtonIcon} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

/**
 * A single sidebar button: icon always visible, label revealed on hover-expand.
 */
const SidebarButton: React.FC<{
  readonly label: string;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}> = function ({ label, onClick, children }) {
  return (
    <button type="button" className={classNames.sidebarButton}
      onClick={onClick}
      aria-label={label}>
      {children}
      <span className={classNames.sidebarButtonLabel}>{label}</span>
    </button>
  );
};

/**
 * The sidebar rail. The top region shows the document title rotated vertically
 * (counter-clockwise). The bottom group has Save, Open.
 *
 * `React.memo` prevents re-render when the parent App re-renders on every
 * keystroke — the callbacks are stable (useCallback with no deps).
 */
export const Sidebar = React.memo<SidebarProps>(function Sidebar({ onSave, onLoad, docTitle }) {
  const title = docTitle ?? 'Untitled document';
  return (
    <aside className={classNames.sidebar}>
      <div className={classNames.sidebarPanel}>
        {/* Vertical title fills the top region. */}
        <div className={classNames.sidebarTitleContainer}>
          <span className={classNames.sidebarTitle}>{title}</span>
        </div>

        {/* Button group anchored to the bottom: Save, Open. */}
        <div className={classNames.sidebarButtonGroup}>
          <SidebarButton label="Save…" onClick={onSave}>
            <SaveIcon />
          </SidebarButton>
          <SidebarButton label="Open…" onClick={onLoad}>
            <OpenIcon />
          </SidebarButton>
        </div>
      </div>
    </aside>
  );
});
