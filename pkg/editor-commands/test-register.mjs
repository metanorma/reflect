/**
 * Registers {@link ./test-loader.mjs} for the headless test run.
 *
 * Invoked via `node --import ./test-register.mjs` in the package's `test`
 * script — the modern replacement for `--experimental-loader`.
 */
import { register } from "node:module";

register("./test-loader.mjs", import.meta.url);
