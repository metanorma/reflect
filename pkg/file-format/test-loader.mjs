/**
 * Resolve hook for the headless test run (`test.mjs`).
 *
 * Why: Yarn PnP maps the workspace package `@metanorma/prosemirror-schema`
 * to its `main` entry, `index.ts`, which plain Node cannot load — so the
 * bare specifier cannot be used by Node-only consumers. The test suite
 * imports it for the real-schema round trip (FileFormat.spec.md §10.8);
 * this hook rewrites that one specifier to the package's compiled JS
 * output, which is plain ESM and loads directly.
 *
 * Registered by `test-register.mjs`; used only by the test script — never
 * at runtime, and never by bundlers.
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
