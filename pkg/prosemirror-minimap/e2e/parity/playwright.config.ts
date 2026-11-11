/**
 * Playwright config for the mockup-parity suite (Phase 2 oracle
 * construction; docs/parity.md is the Phase-1 handoff this implements).
 *
 * Separate config from ../playwright.config.ts so the package's own e2e
 * suite is untouched. Spec files here are named `*.parity.ts` — the parent
 * config matches only `*.spec.ts`, so no suite picks up the other's tests.
 *
 * Chromium-only, matching the package suite's convention (§15.3): the
 * assertions are geometry/ink analysis, per-engine non-portable.
 *
 * Determinism context (see lib/mockupAdapter.ts):
 *   - `reducedMotion: 'reduce'` — #canvas has scroll-behavior:smooth under
 *     prefers-reduced-motion: no-preference (mockup:171); reduce makes every
 *     scroll (including scrollIntoView) instant and capture-safe.
 *   - fixed viewport 1600×900 — the minimap pane height is layout input.
 *
 * Running (from the repo root):
 *   verify:  yarn workspace @metanorma/prosemirror-minimap exec playwright \
 *              test --config=e2e/parity/playwright.config.ts
 *   record:  PW_PARITY_RECORD=1 (same command) — regenerates masters/
 */
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// e2e/parity/ → e2e/ → prosemirror-minimap/ → pkg/ → repo root (four levels
// up; the parent config needs only three because it lives in e2e/).
const repoRoot = path.resolve(here, '..', '..', '..', '..');

export default defineConfig({
  testDir: here,
  testMatch: '*.parity.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  trace: 'retain-on-failure',
  use: {
    baseURL: 'http://localhost:3334',
    actionTimeout: 10_000,
    ...devices['Desktop Chrome'],
    viewport: { width: 1600, height: 900 },
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'yarn build-minimap-demo && node pkg/prosemirror-minimap/harness/serve.mjs',
    cwd: repoRoot,
    port: 3334,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'parity-chromium' }],
});
