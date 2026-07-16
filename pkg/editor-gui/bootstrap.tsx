import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { App } from './App.jsx';


hydrateApp();


function hydrateApp() {

  const appRoot = document.getElementById('app');
  if (!appRoot) {
    console.error("Can’t initialize the app: missing root");
    return;
  }

  //const parent = appRoot.parentElement!;

  const tempRoot = document.createElement('div');
  tempRoot.classList.add('appwrapper');
  tempRoot.style.opacity = '0.1';
  appRoot.insertAdjacentElement('afterend', tempRoot);

  let loaded = false;
  function handleDone() {
    if (loaded) { return; }
    loaded = true;
    appRoot!.remove();
    tempRoot.style.opacity = '1';
  }

  //const originalHTML = appRoot.innerHTML;

  const app = <App onDoneLoading={handleDone} />

  //holdBodyHeightUntilHydrationIsComplete(appRoot.clientHeight);

  const useStrictMode =
    document.documentElement.dataset.useReactStrict === 'true';

  hydrateRoot(
    tempRoot,
    useStrictMode
      ? <StrictMode>{app}</StrictMode>
      : app,
  );

};
