/**
 * Load/resolve hooks for the headless test run (`tests/*.test.mjs`) —
 * the sibling mirror of `pkg/panel-layout/test-loader.mjs`.
 *
 * Why: compiled editor-gui modules import `@metanorma/panel-layout`,
 * whose PnP-resolved main is TypeScript source Node cannot load; the
 * resolve hook remaps that specifier (and its subpaths) to the sibling
 * package's compiled mirror (`../panel-layout/compiled/*`, resolved
 * from THIS file's location — one level up to `pkg/`, then into the
 * sibling). The load hook gives `.json` URLs the json format for the
 * same reason as panel-layout's: tsc emits the design-tokens import in
 * the compiled mirror without Node's mandatory import attribute.
 *
 * Nothing else is re-resolved. Registered by `test-register.mjs`; used
 * only by the `test` script — never at runtime, never by bundlers.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const PKG = "@metanorma/panel-layout";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === PKG || specifier.startsWith(PKG + "/")) {
    const sub = specifier === PKG ? "/index.js" : specifier.slice(PKG.length);
    return {
      url: new URL("../panel-layout/compiled" + sub, import.meta.url).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    return {
      format: "json",
      shortCircuit: true,
      source: await readFile(fileURLToPath(url), "utf8"),
    };
  }
  return nextLoad(url, context);
}
