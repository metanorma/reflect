/**
 * Playwright config for the editor-gui e2e suite.
 *
 * The webServer builds the GUI (yarn build-gui → pkg/editor-gui/dist/) and
 * serves it via the zero-dep e2e/serve.mjs. Both commands run from the repo
 * root (where the yarn scripts and build-gui.mjs live).
 */
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// e2e/ → editor-gui/ → pkg/ → repo root (three levels up).
const repoRoot = path.resolve(here, '..', '..', '..');

export default defineConfig({
  testDir: here,
  testMatch: '*.spec.ts',
  fullyParallel: true,
  // Cap concurrent workers to avoid OOM kills in memory-constrained
  // containers. Each worker spawns its own Node process + Chromium instance
  // (~300–500 MB), so Playwright's default (cores/2) can exhaust memory with
  // no swap.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : 'list',
  trace: 'on-first-retry',
  use: {
    baseURL: 'http://localhost:3333',
    actionTimeout: 10_000,
  },
  webServer: {
    command: 'yarn build-gui && node pkg/editor-gui/e2e/serve.mjs',
    cwd: repoRoot,
    port: 3333,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
