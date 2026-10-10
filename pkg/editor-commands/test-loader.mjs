/**
 * Resolve hook for the headless test run (`test.mjs`).
 *
 * Why: Yarn PnP maps the workspace package `@metanorma/prosemirror-schema`
 * to its `main` entry, `index.ts`. Loading that entry under plain Node fails
 * (its internal `./nodes` import has no `.js` file at the package root), so
 * the BARE specifier cannot be used by Node-only consumers — yet the compiled
 * output of `@metanorma/editor-commands` imports it (esbuild builds resolve
 * it fine; Node does not). This hook rewrites the one specifier to the
 * package's compiled JS output, which is plain ESM and loads directly.
 *
 * Registered by `test-register.mjs`; used only by the test script — never at
 * runtime, and never by bundlers.
 */

const SCHEMA_BARE = "@metanorma/prosemirror-schema";
const SCHEMA_COMPILED = new URL(
  "../prosemirror-schema/compiled/index.js",
  import.meta.url,
).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === SCHEMA_BARE) {
    return nextResolve(SCHEMA_COMPILED, context);
  }
  return nextResolve(specifier, context);
}
