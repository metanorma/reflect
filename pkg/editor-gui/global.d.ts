// `import.meta.env.DEV` — substituted by build-gui.mjs's esbuild define
// (true in the dev flavor, false in prod); typed here for the built-in
// preset validation guard in App.tsx.
interface ImportMeta {
  readonly env: { readonly DEV: boolean };
}

declare module '*.css';
declare module 'import-mapper' {
  const ImportMapper: any;
}
declare module 'lunr-languages/lunr.fr';
declare module 'lunr-languages/lunr.ja';
declare module 'lunr-languages/lunr.stemmer.support';
declare module 'lunr-languages/tinyseg';
declare module 'lunr-languages/lunr.multi';
