import React from 'react';
import classNames from './style.module.css';


export const App: React.FC<{ onDoneLoading: () => void }> =
function ({ onDoneLoading }) {
  return <div className={classNames.app}>
    Metanorma ProseMirror editor goes here
  </div>;
};
