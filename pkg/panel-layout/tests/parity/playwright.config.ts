/**
 * Playwright config for the @metanorma/panel-layout parity suite.
 *
 * One command, staged targets: `yarn parity` boots the server and runs the
 * characterization specs under tests/parity/ against every configured
 * project. The 'mock' project drives the reference mock today; the 'twin'
 * project (the library implementation fed the demo registrations) is
 * placeholder-empty until it exists — same snapshot names will be used by
 * both, so a green run means the twin reproduces the mock's captured
 * reality (semantic-first: state-hp*.json `_normalized` diffs with ±1px
 * tolerance; pixels second: toHaveScreenshot).
 *
 * Environment caveats:
 * - The mock target needs network at RUNTIME: its importmap points at
 *   pinned esm.sh/unpkg URLs (deterministic, but not offline).
 * - Near-term redundancy with `capture-goldens.mjs --check-only` is
 *   intentional: the generator owns artifact production; this suite is the
 *   enforcer that survives and gains the second target.
 *
 * Chromium-only, deliberately (assertions are pixel/paint + serialized
 * state, per the prosemirror-minimap e2e precedent); workers capped at 1
 * for the memory-constrained container.
 */
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: here,
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    // Twin-vs-mock pixel parity is advisory-tight, not byte-exact: the twin
    // runs workspace react 19.2.7 against the mock's CDN 19.2.8 build —
    // semantically identical, but subpixel/anti-aliasing can differ. A
    // font-smoothing delta must not fail a semantic-parity run.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
  webServer: {
    // cwd is the workspace root when invoked via yarn workspace scripts;
    // the config lives one level deeper.
    command: 'node tests/parity/serve.mjs',
    cwd: path.resolve(here, '..', '..'),
    url: 'http://127.0.0.1:4173/mock/editor-dockview7-floats.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'mock',
      testMatch: 'mock.spec.ts',
    },
    {
      // Placeholder until the twin target exists; keep `yarn parity`
      // stable so CI never needs a flag day when it lands.
      name: 'twin',
      testIgnore: '**/*',
    },
  ],
});
