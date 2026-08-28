/**
 * Playwright config for the @metanorma/prosemirror-minimap e2e suite
 * (§15.3).
 *
 * The webServer builds the harness (yarn build-minimap-demo →
 * pkg/prosemirror-minimap/harness/dist/) and serves it via the zero-dep
 * harness/serve.mjs. Both commands run from the repo root (where the yarn
 * scripts and build-minimap-demo.mjs live).
 *
 * Chromium-only, deliberately: the suite's assertions are pixel/paint
 * analysis (canvas ink extents, band heights) and drag-geometry checks —
 * per-engine non-portable. Cross-engine coverage of the minimap's
 * interaction surface stays in the consumer suite (pkg/editor-gui), which
 * runs chromium + firefox and retains a minimap smoke test.
 */
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// e2e/ → prosemirror-minimap/ → pkg/ → repo root (three levels up).
const repoRoot = path.resolve(here, '..', '..', '..');

export default defineConfig({
  testDir: here,
  testMatch: '*.spec.ts',
  fullyParallel: true,
  // Cap concurrent workers to avoid OOM kills in memory-constrained
  // containers (same rationale as the editor-gui config).
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : 'list',
  trace: 'on-first-retry',
  use: {
    baseURL: 'http://localhost:3334',
    actionTimeout: 10_000,
  },
  webServer: {
    command: 'yarn build-minimap-demo && node pkg/prosemirror-minimap/harness/serve.mjs',
    cwd: repoRoot,
    port: 3334,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
