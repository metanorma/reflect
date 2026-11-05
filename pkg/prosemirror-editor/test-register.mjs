/**
 * Registers {@link ./test-loader.mjs} for the headless test run
 * (same pattern as `pkg/editor-commands/test-register.mjs`).
 */
import { register } from "node:module";

register("./test-loader.mjs", import.meta.url);
