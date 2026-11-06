/**
 * Load hook for the headless test run (`tests/*.test.mjs`).
 *
 * Why: `tokens.ts` imports `./mock/design-tokens.json`, and tsc emits that
 * import WITHOUT Node's mandatory `with { type: "json" }` import attribute
 * (TS emits bare specifiers only), so `compiled/tokens.js` fails to load
 * under plain Node with ERR_IMPORT_ATTRIBUTE_MISSING. This hook supplies
 * the `json` module format for `.json` URLs, making the compiled output
 * loadable as-is. Nothing else is rewritten at load time: the
 * runtime-import rule (api.spec.md §1) guarantees compiled output has
 * zero engine imports — dockview/dockview-core are type-only and erase at
 * emit.
 *
 * Resolve hook (added at D51): the compiled DEMO output runtime-imports
 * the package by its consumer specifier ('@metanorma/panel-layout' — the
 * firewall-pinned form; the only compiled files that do), and under PnP
 * that self-reference resolves to TS source, which Node cannot load. The
 * hook maps the specifier to the compiled mirror — the same mapping the
 * reference mock's importmap (→ /dist/mock/panel-layout.js) and
 * build-panel-layout.mjs's twin alias (→ index.ts) make in their
 * contexts. Nothing else is re-resolved.
 *
 * Registered by `test-register.mjs`; used only by the test script — never
 * at runtime, never by bundlers (esbuild handles JSON natively).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const PKG = "@metanorma/panel-layout";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === PKG || specifier.startsWith(PKG + "/")) {
    const sub = specifier === PKG ? "/index.js" : specifier.slice(PKG.length);
    return {
      url: new URL("./compiled" + sub, import.meta.url).href,
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
