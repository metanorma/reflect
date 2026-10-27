/**
 * Registers {@link ./test-loader.mjs} for the headless test run.
 *
 * Invoked via `node --import ./test-register.mjs` in the package's `test`
 * script — same idiom as `pkg/editor-commands/test-register.mjs`.
 */
import { register } from "node:module";

register("./test-loader.mjs", import.meta.url);
