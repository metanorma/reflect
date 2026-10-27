/**
 * Load hook for the headless test run (`tests/*.test.mjs`).
 *
 * Why: `tokens.ts` imports `./mock/design-tokens.json`, and tsc emits that
 * import WITHOUT Node's mandatory `with { type: "json" }` import attribute
 * (TS emits bare specifiers only), so `compiled/tokens.js` fails to load
 * under plain Node with ERR_IMPORT_ATTRIBUTE_MISSING. This hook supplies
 * the `json` module format for `.json` URLs, making the compiled output
 * loadable as-is. Nothing else is rewritten: the runtime-import rule
 * (api.spec.md §1) guarantees compiled output has zero engine imports —
 * dockview/dockview-core are type-only and erase at emit.
 *
 * Registered by `test-register.mjs`; used only by the test script — never
 * at runtime, never by bundlers (esbuild handles JSON natively).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

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
