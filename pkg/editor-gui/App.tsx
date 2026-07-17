import React, { useEffect, useState } from 'react';
import {
  MetanormaProseMirror,
  MetanormaToolbar,
  createInitialEditorState,
} from '@metanorma/prosemirror-editor';
import type { EditorState } from '@metanorma/prosemirror-editor';
import classNames from './style.module.css';


export const App: React.FC<{ onDoneLoading: () => void }> =
function ({ onDoneLoading }) {
  const [editorState, setEditorState] = useState<EditorState>(
    () => createInitialEditorState({}),
  );

  useEffect(() => {
    onDoneLoading();
  }, [onDoneLoading]);

  return <div className={classNames.app}>
    <MetanormaProseMirror
        state={editorState}
        onStateChange={setEditorState}>
      <MetanormaToolbar />
    </MetanormaProseMirror>
  </div>;
};
