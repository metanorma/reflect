import React, { useEffect, useState } from 'react';
import {
  MetanormaProseMirror,
  createInitialEditorState,
  DEFAULT_HISTORY_OPTIONS,
} from '@metanorma/prosemirror-editor';
import type { EditorState } from '@metanorma/prosemirror-editor';
import { AdvancedMetanormaToolbar } from '@metanorma/toolbar';
import { keymap } from 'prosemirror-keymap';
import { chainCommands } from 'prosemirror-commands';
import {
  newlineInCode,
  enterDefinitionList,
  splitListItem,
  exitContainerBlock,
  createParagraphNear,
  splitBlockKeepMarks,
  insertSoftBreak,
  emptyTextblockBackspace,
  joinBackward,
  deleteSelection,
  metanormaSchema,
} from '@metanorma/editor-commands';
import classNames from './style.module.css';

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

  useEffect(() => {
    onDoneLoading();
  }, [onDoneLoading]);

  // Test-only hook: when the page is loaded with ?e2e=1, expose the current
  // document as JSON on window so Playwright specs can assert structural state
  // (node types, attributes, marks) without scraping the DOM. Re-attaches on
  // every state change so callers always see the latest doc. Read-only.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('e2e')) return;
    const w = window as unknown as { __mnGetDoc?: () => unknown };
    w.__mnGetDoc = () => editorState.doc.toJSON();
    return () => {
      delete w.__mnGetDoc;
    };
  }, [editorState]);

  return <div className={classNames.app}>
    <MetanormaProseMirror
        state={editorState}
        onStateChange={setEditorState}>
      <AdvancedMetanormaToolbar className="mn-toolbar mn-toolbar--vertical" />
    </MetanormaProseMirror>
  </div>;
};
