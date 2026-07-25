import React, { useEffect, useState } from 'react';
import {
  MetanormaProseMirror,
  createInitialEditorState,
  DEFAULT_HISTORY_OPTIONS,
} from '@metanorma/prosemirror-editor';
import type { EditorState } from '@metanorma/prosemirror-editor';
import { AdvancedMetanormaToolbar } from '@metanorma/toolbar';
import classNames from './style.module.css';


export const App: React.FC<{ onDoneLoading: () => void }> =
function ({ onDoneLoading }) {
  const [editorState, setEditorState] = useState<EditorState>(
    () => createInitialEditorState({ history: DEFAULT_HISTORY_OPTIONS }),
  );

  useEffect(() => {
    onDoneLoading();
  }, [onDoneLoading]);

  return <div className={classNames.app}>
    <MetanormaProseMirror
        state={editorState}
        onStateChange={setEditorState}>
      <AdvancedMetanormaToolbar />
    </MetanormaProseMirror>
  </div>;
};
