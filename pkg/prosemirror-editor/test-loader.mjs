/**
 * Resolve hook for the headless test run.
 *
 * Same mechanism as `pkg/editor-commands/test-loader.mjs`: Yarn PnP maps the
 * workspace package `@metanorma/prosemirror-schema` to its `main` entry,
 * `index.ts`, which plain Node cannot load — the hook rewrites the bare
 * specifier to the package's compiled JS output.
 *
 * Registered by `test-register.mjs`; used only by the test script.
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
