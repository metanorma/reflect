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
  metanormaSchema,
} from '@metanorma/editor-commands';
import classNames from './style.module.css';

/**
 * Enter-key dispatch chain (EditorCommands.spec.md §2.3), composed at the call
 * site per §2.8: most-specific context first, generic split last. Bound to the
 * primary `Enter` key; `Shift-Enter` is bound separately to `insertSoftBreak`
 * (spec §2.8). Built once at module scope for a stable plugin reference.
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

  return <div className={classNames.app}>
    <MetanormaProseMirror
        state={editorState}
        onStateChange={setEditorState}>
      <AdvancedMetanormaToolbar className="mn-toolbar mn-toolbar--vertical" />
    </MetanormaProseMirror>
  </div>;
};
