import React, { useCallback, useEffect, useState } from 'react';
import {
  MetanormaProseMirror,
  createInitialEditorState,
  DEFAULT_HISTORY_OPTIONS,
} from '@metanorma/prosemirror-editor';
import type { EditorState, MirrorDocument } from '@metanorma/prosemirror-editor';
import { AdvancedMetanormaToolbar } from '@metanorma/toolbar';
import { keymap } from 'prosemirror-keymap';
import { chainCommands } from 'prosemirror-commands';
import {
  newlineInCode,
  enterDefinitionList,
  splitListItem,
  exitSectionTitle,
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
      exitSectionTitle,
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
      doc: doc as MirrorDocument,
      history: DEFAULT_HISTORY_OPTIONS,
      plugins: editorPlugins,
    });
    setEditorState(newState);
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

  return <div className={classNames.app}>
    <Sidebar onSave={handleSave} onLoad={handleLoad} />
    {status && <div className={classNames.status} role="alert">{status}</div>}
    <MetanormaProseMirror
        state={editorState}
        onStateChange={setEditorState}>
      <AdvancedMetanormaToolbar className="mn-toolbar mn-toolbar--vertical" />
    </MetanormaProseMirror>
  </div>;
};
