import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ProseMirror,
  createInitialEditorState,
  DEFAULT_HISTORY_OPTIONS,
  nodeViewComponents,
  tableColumnResizePlugin,
  imageNaturalSizePlugin,
} from '@metanorma/prosemirror-editor';
import type { EditorState, MetanormaDocument } from '@metanorma/prosemirror-editor';
import { PanelLayout } from '@metanorma/panel-layout';
import type {
  PanelLayoutApi,
  PanelLayoutFallbackEvent,
  PanelLayoutReadyEvent,
} from '@metanorma/panel-layout';
import { createMinimap } from '@metanorma/prosemirror-minimap';
import type { MinimapClassifier, RowSpec } from '@metanorma/prosemirror-minimap';
import type { BibliographicItem } from '@metanorma/relaton';
import { mainTitle } from '@metanorma/relaton';
import { keymap } from 'prosemirror-keymap';
import { chainCommands } from 'prosemirror-commands';
import type { Node } from 'prosemirror-model';
import {
  newlineInCode,
  enterDefinitionList,
  splitListItem,
  insertSectionAbove,
  exitSectionTitle,
  exitName,
  exitFloatingTitle,
  exitContainerBlock,
  createParagraphNear,
  splitBlockKeepMarks,
  insertSoftBreak,
  emptyTextblockBackspace,
  joinBackward,
  deleteSelection,
  metanormaSchema,
} from '@metanorma/editor-commands';
import { useMnFileIo } from './fileIo.js';
import classNames from './style.module.css';
import { ChromeBar } from './ChromeBar.jsx';
import { panelRegistry } from './panels.jsx';
import { presetLayout } from './presetLayout.js';
import { layoutPersistence } from './panelPersistence.js';
import { DocEpochContext } from './panelContexts.js';

/**
 * Metanorma minimap classifier (ProseMirrorMinimap.spec.md §5.3 — consumer
 * refinement over the shape-keyed `defaultClassifier`):
 *
 * - `section_title` / `floating_title` → `heading` (indent by depth);
 * - textblocks (`paragraph`, `dt`) → `text`; `dd` is a transparent container
 *   (`content: block+`) — its child paragraphs render as `text` rows one
 *   depth deeper;
 * - `sourcecode` → `code`; `table` → `table` (height estimated from row
 *   count, no recursion); `figure` → `figure` (fixed height, no recursion);
 *   `formula` → `formula` (fixed height, no recursion);
 * - `bibdata` / `bibitem` / `footnote_entry` (atoms with DOM chrome) →
 *   `text`;
 * - everything else falls through to the default: containers transparent,
 *   recursion on.
 *
 * The `theme` (which owns the `heading`/`figure`/… colors and adds
 * `formula`) is deliberately NOT set here — the plugin-wins rule (§7.1)
 * would lock it; `<MinimapPane>` owns it through the component `options`
 * prop instead.
 */
const metanormaClassifier: MinimapClassifier = {
  row(node): RowSpec | null {
    switch (node.type.name) {
      case 'section_title':
      case 'floating_title':
        return { classId: 'heading' };
      case 'sourcecode':
        return { classId: 'code' };
      case 'table':
        return {
          classId: 'table',
          height: { kind: 'estimate', px: () => 40 + rowCount(node) * 28 },
        };
      case 'figure':
        return { classId: 'figure', height: { kind: 'fixed', px: 220 } };
      case 'formula':
        return { classId: 'formula', height: { kind: 'fixed', px: 64 } };
      default:
        // Atoms with node-view chrome render as a strip, not a textblock.
        if (node.isTextblock || node.isAtom) {
          return { classId: 'text' };
        }
        return null;
    }
  },
  recurse(node) {
    // Rows with per-node height strategies are opaque: the strategy already
    // accounts for the whole subtree (table rows/figure body/formula stem).
    if (
      node.type.name === 'table' ||
      node.type.name === 'figure' ||
      node.type.name === 'formula'
    ) {
      return false;
    }
    return !node.isTextblock && !node.isLeaf;
  },
};

/** Count a table's rows across its section layers (head/body/foot). */
function rowCount(table: Node): number {
  let n = 0;
  table.forEach((section) => {
    section.forEach((row) => {
      void row;
      n += 1;
    });
  });
  return n;
}

/**
 * Enter-key dispatch chain (EditorCommands.spec.md §2.3), composed at the call
 * site per §2.8: most-specific context first, generic split last. Bound to the
 * primary `Enter` key; `Shift-Enter` is bound separately to `insertSoftBreak`
 * (spec §2.8).
 *
 * Backspace-key dispatch chain (spec §4.3): structural unwind of empty
 * textblocks first (§4.7), then stock `joinBackward` for joinable siblings,
 * then `deleteSelection` for ranged/node selections.
 *
 * Built once at module scope for a stable plugin reference.
 */
const editorPlugins = [
  keymap({
    Enter: chainCommands(
      newlineInCode,
      enterDefinitionList(metanormaSchema),
      splitListItem(metanormaSchema),
      insertSectionAbove,
      exitSectionTitle,
      exitName,
      exitFloatingTitle,
      exitContainerBlock,
      createParagraphNear,
      splitBlockKeepMarks,
    ),
    'Shift-Enter': insertSoftBreak,
      Backspace: chainCommands(
        emptyTextblockBackspace,
        joinBackward,
        deleteSelection,
      ),
    }),
    // Minimap (ProseMirrorMinimap.spec.md §7.1): a view plugin — appended
    // after the keymap so it observes every transaction on its way into
    // state; renders via <MinimapPane> below.
    createMinimap({ classifier: metanormaClassifier }),
    // Table column resizing (tables.md §8.6): renders the colgroup widget
    // for fixed-width tables, mounts the column-edge handles, and supplies
    // the clipboard serializer carrying `data-colwidths`. Appended after the
    // keymap/minimap so it only observes transactions.
    tableColumnResizePlugin(),
    // Image natural-size backfill (MetanormaProseMirror.spec.md §6.3):
    // idle-scheduled, data-URI-only re-derivation of `x-natural-*` for
    // pasted (clipboard-dropped) or failed-capture images; history-invisible.
    imageNaturalSizePlugin(),
  ];


export const App: React.FC<{ onDoneLoading: () => void }> =
function ({ onDoneLoading }) {
  const [editorState, setEditorState] = useState<EditorState>(
    () => createInitialEditorState({
      history: DEFAULT_HISTORY_OPTIONS,
      plugins: editorPlugins,
    }),
  );

  const [status, setStatus] = useState<string | null>(null);

  // The layout engine api, captured at `<PanelLayout>`'s onReady and
  // passed to the ChromeBar (Panels control). Null until the layout is up.
  const [layoutApi, setLayoutApi] = useState<PanelLayoutApi | null>(null);

  // Increments on every document LOAD (`loadDocFromJson`): a fresh
  // `EditorState` carries a fresh plugins array, so ProseMirror destroys and
  // re-creates every plugin view — including the minimap controller the
  // `<Minimap>` component holds. The epoch re-keys `MinimapPane`, remounting
  // it so it re-attaches to the new controller (the view object itself is
  // unchanged, so the `[view]` effect deps alone would never re-fire).
  const [docEpoch, setDocEpoch] = useState(0);

  // Keep a ref to the latest editor state so handleSave can read it without
  // depending on editorState in its useCallback deps — this keeps the
  // ChromeBar (memoized on the stable callback) out of per-keystroke
  // re-renders.
  const editorStateRef = React.useRef(editorState);
  editorStateRef.current = editorState;

  useEffect(() => {
    onDoneLoading();
  }, [onDoneLoading]);

  /**
   * Rehydrate an `EditorState` from a parsed document JSON object — the bare
   * tree (schema.spec.md §12) — replacing the current editor state. Used by
   * the file-I/O hook's load path (`fileIo.ts`, after envelope decode,
   * FileFormat.spec.md §5) and the e2e test hook (`window.__mnLoadDoc`), so
   * the rehydration logic stays identical for both callers. A fresh
   * `EditorState` is built (not an incremental transaction) so loading a new
   * document starts with a clean undo history.
   *
   * Returns `true` on success. A structurally invalid document throws
   * (`metanormaSchema.nodeFromJSON`'s `RangeError`); the caller catches the
   * error and surfaces the message.
   */
  const loadDocFromJson = useCallback((doc: unknown): boolean => {
    // nodeFromJSON validates structure; a bad doc throws RangeError.
      const newState = createInitialEditorState({
        doc: doc as MetanormaDocument,
        history: DEFAULT_HISTORY_OPTIONS,
        plugins: editorPlugins,
      });
      setEditorState(newState);
      setDocEpoch((n) => n + 1);
      return true;
  }, []);

  /**
   * Save/Open document I/O (`fileIo.ts`, FileFormat.spec.md §5–§6): Save
   * wraps the current tree in a versioned envelope, Open decodes a file
   * (envelope or legacy bare tree) and rehydrates. Stable identities — safe
   * for ChromeBar's memoization.
   */
  const { handleSave, handleLoad } = useMnFileIo({
    editorStateRef,
    loadDocFromJson,
    setStatus,
  });

  // Test-only hook: when the page is loaded with ?e2e=1, expose the current
  // document as JSON on window so Playwright specs can assert structural state
  // (node types, attributes, marks) without scraping the DOM. Re-attaches on
  // every state change so callers always see the latest doc. Read-only.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('e2e')) return;
    const w = window as unknown as {
      __mnGetDoc?: () => unknown;
      __mnLoadDoc?: (json: unknown) => boolean;
    };
    w.__mnGetDoc = () => editorState.doc.toJSON();
    return () => {
      delete w.__mnGetDoc;
    };
  }, [editorState]);

  // Test-only hook (companion to __mnGetDoc): expose a load-from-JSON function
  // so e2e can exercise the rehydration path without driving the native file
  // picker, which Playwright cannot do reliably. `loadDocFromJson` is stable
  // (useCallback), so the effect binds once.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('e2e')) return;
    const w = window as unknown as {
      __mnLoadDoc?: (json: unknown) => boolean;
    };
    w.__mnLoadDoc = (json: unknown) => loadDocFromJson(json);
    return () => {
      delete w.__mnLoadDoc;
    };
  }, [loadDocFromJson]);

  // Derive the document title from bibdata for the chrome bar's label.
  // This is a cheap property access on doc.firstChild, not a doc walk.
  const bibdataItem = editorState.doc.firstChild?.type.name === 'bibdata'
    ? (editorState.doc.firstChild.attrs['item'] as BibliographicItem | null)
    : null;
  const docTitle = bibdataItem ? (mainTitle(bibdataItem)?.content ?? null) : null;

  // ---- <PanelLayout> props (STABLE identities — the engine re-renders on
  // prop churn, so nothing here may be re-created per keystroke) ---------

  const defaultLayout = useMemo(() => presetLayout(), []);
  const handleLayoutFallback = useCallback(
    (event: PanelLayoutFallbackEvent) => {
      setStatus(event.reason === 'storage-unavailable'
        ? 'Layout changes cannot be saved (storage unavailable).'
        : 'Saved layout could not be restored; the default layout was used.');
    },
    [],
  );
  const persistence = useMemo(
    () => layoutPersistence(handleLayoutFallback),
    [handleLayoutFallback],
  );
  const dockviewOptions = useMemo(() => ({
    // The library sheet themes `.dockview-theme-light` (panel-layout.css);
    // every other engine option stays at its default for this consumer.
    theme: { name: 'light', className: 'dockview-theme-light',
      colorScheme: 'light' } as const,
  }), []);
  const handleLayoutReady = useCallback((event: PanelLayoutReadyEvent) => {
    setLayoutApi(event.api);
  }, []);

  return (
    // Provider-lift composition (integration ruling): `<ProseMirror>` (the
    // re-exported context provider + view owner) is the ANCESTOR of the
    // whole shell, and the doc surface lives INSIDE the doc panel
    // (`panels.tsx` renders `<ProseMirrorDoc/>` there). Dockview renders
    // panels through React portals, and context resolves through portals,
    // so the minimap pane (`useEditorEffect`) and the toolbar's internal
    // selector hooks see the editor context from inside their panels.
    <ProseMirror
      state={editorState}
      dispatchTransaction={(tr) => setEditorState((prev) => prev.apply(tr))}
      nodeViewComponents={nodeViewComponents}
      editable={() => true}
    >
      <DocEpochContext.Provider value={docEpoch}>
        <div className={classNames.app}>
          <ChromeBar
            docTitle={docTitle}
            onSave={handleSave}
            onLoad={handleLoad}
            layoutApi={layoutApi}
          />
          {status && <div className={classNames.status} role="alert">{status}</div>}
          <PanelLayout
            registry={panelRegistry}
            defaultLayout={defaultLayout}
            persistence={persistence}
            dockviewOptions={dockviewOptions}
            onReady={handleLayoutReady}
            onDidFallback={handleLayoutFallback}
          />
        </div>
      </DocEpochContext.Provider>
    </ProseMirror>
  );
};
