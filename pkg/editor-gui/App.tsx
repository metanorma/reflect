import React, { useCallback, useEffect, useState } from 'react';
import {
  MetanormaProseMirror,
  createInitialEditorState,
  DEFAULT_HISTORY_OPTIONS,
} from '@metanorma/prosemirror-editor';
import type { EditorState, MetanormaDocument } from '@metanorma/prosemirror-editor';
import { AdvancedMetanormaToolbar } from '@metanorma/toolbar';
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
import { fileSave, fileOpen } from 'browser-fs-access';
import classNames from './style.module.css';
import { Sidebar } from './Sidebar.jsx';
import { MinimapPane } from './MinimapPane.jsx';

/**
 * Metanorma minimap classifier (ProseMirrorMinimap.spec.md §5.3 — consumer
 * refinement over the shape-keyed `defaultClassifier`):
 *
 * - `section_title` / `floating_title` → `heading` (indent by depth);
 * - textblocks (`paragraph`, `dt`, `dd`) → `text`;
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

  // Increments on every document LOAD (`loadDocFromJson`): a fresh
  // `EditorState` carries a fresh plugins array, so ProseMirror destroys and
  // re-creates every plugin view — including the minimap controller the
  // `<Minimap>` component holds. The epoch re-keys `MinimapPane`, remounting
  // it so it re-attaches to the new controller (the view object itself is
  // unchanged, so the `[view]` effect deps alone would never re-fire).
  const [docEpoch, setDocEpoch] = useState(0);

  // Keep a ref to the latest editor state so handleSave can read it without
  // depending on editorState in its useCallback deps — this prevents the
  // Sidebar from re-rendering on every keystroke.
  const editorStateRef = React.useRef(editorState);
  editorStateRef.current = editorState;

  useEffect(() => {
    onDoneLoading();
  }, [onDoneLoading]);

  /**
   * Rehydrate an `EditorState` from a parsed document JSON object, replacing
   * the current editor state. Used by both the Open dialog (`handleLoad`) and
   * the e2e test hook (`window.__mnLoadDoc`), so the rehydration logic stays
   * identical. A fresh `EditorState` is built (not an incremental transaction)
   * so loading a new document starts with a clean undo history. Returns `true`
   * on success, `false` (with a thrown error caught by the caller) on failure.
   *
   * `metanormaSchema.nodeFromJSON` throws `RangeError` on structurally invalid
   * documents; the caller surfaces the message.
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
   * Save: serialize the current document to pretty-printed JSON and hand it to
   * `browser-fs-access.fileSave`, which uses the native File System Access API
   * save picker in Chromium and falls back to an `<a download>` download in
   * Firefox/Safari. `AbortError` (user dismissed the picker) is silent; any
   * other error surfaces on the status line.
   */
  const handleSave = useCallback(async () => {
    try {
      setStatus(null);
      const json = JSON.stringify(editorStateRef.current.doc.toJSON(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      await fileSave(blob, {
        fileName: 'document.mn.json',
        extensions: ['.mn.json'],
        mimeTypes: ['application/json'],
        description: 'Metanorma document',
      });
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
      setStatus(`Could not save: ${(err as Error).message}`);
    }
  }, []);

  /**
   * Open: prompt the user for a `.mn.json` / `.json` file via
   * `browser-fs-access.fileOpen` (native open picker in Chromium, `<input
   * type=file>` fallback elsewhere), read it as text, parse, and rehydrate.
   * A structurally invalid file leaves the editor untouched and shows an error.
   * Cancellation (`AbortError`) is silent.
   */
  const handleLoad = useCallback(async () => {
    try {
      setStatus(null);
      const file = await fileOpen({
        extensions: ['.mn.json', '.json'],
        description: 'Metanorma document',
      });
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      loadDocFromJson(parsed);
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
      const msg = (err as Error)?.message ?? String(err);
      setStatus(`Could not load file: ${msg}`);
    }
  }, [loadDocFromJson]);

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

  // Derive the document title from bibdata for the Sidebar's vertical label.
  // This is a cheap property access on doc.firstChild, not a doc walk.
  const bibdataItem = editorState.doc.firstChild?.type.name === 'bibdata'
    ? (editorState.doc.firstChild.attrs['item'] as BibliographicItem | null)
    : null;
  const docTitle = bibdataItem ? (mainTitle(bibdataItem)?.content ?? null) : null;

  return <div className={classNames.app}>
    <Sidebar onSave={handleSave} onLoad={handleLoad} docTitle={docTitle} />
    {status && <div className={classNames.status} role="alert">{status}</div>}
      <MetanormaProseMirror
          state={editorState}
          onStateChange={setEditorState}>
        <MinimapPane key={docEpoch} />
        <AdvancedMetanormaToolbar className="mn-toolbar mn-toolbar--vertical" />
      </MetanormaProseMirror>
  </div>;
};
