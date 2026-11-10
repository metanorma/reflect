/**
 * Playwright config for the @metanorma/panel-layout parity suite.
 *
 * One command, staged targets: `yarn parity` boots the server and runs the
 * characterization specs under tests/parity/ against every configured
 * project. The 'mock' project drives the reference mock; the 'twin'
 * project (tests/parity/twin.html — the library + demo from the
 * /dist/twin/ bundles, mounted through the demo surface's mountDemoApp
 * seam) drives the SAME flows through the SAME drivers and
 * asserts against the SAME baselines — a green run means the twin
 * reproduces the mock's captured reality (semantic-first: state-hp*.json
 * `_normalized` diffs with ±1px tolerance; pixels second:
 * toHaveScreenshot). Pixel baselines are per-project siblings
 * (…-mock-linux.png / …-twin-linux.png); the twin set was minted once
 * with --update-snapshots (NEW files, never a regeneration).
 *
 * Environment caveats:
 * - The mock target needs network at RUNTIME: its importmap points at
 *   pinned esm.sh/unpkg URLs (deterministic, but not offline). The twin
 *   bundles the engine + react from the yarn pins and needs the network
 *   only for its dockview.css stylesheet link.
 * - Near-term redundancy with `capture-goldens.mjs --check-only` is
 *   intentional: the generator owns artifact production; this suite is the
 *   enforcer that survives.
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
    // the config lives one level deeper. `yarn build` runs the workspace
    // build (imports:check + both esbuild targets) first — the parity run
    // can never hit a stale dist/. Same pattern as the minimap e2e
    // (yarn build-minimap-demo && node …/harness/serve.mjs).
    command: 'yarn build && node tests/parity/serve.mjs',
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
      // Seeded-state specs (synthetic-storage/pin/vetoes + the module 8/9
      // riders — see ../README.md) land with the convergence task, when
      // the mock consumes dist/mock/panel-layout.js; before that, a page
      // harness would characterize the mock's inline code, not the
      // library. Placeholder now (same pattern as 'twin') so `yarn parity`
      // and CI never need a flag day when it lands.
      //
      // This project MUST keep its own browser context (Playwright's
      // default per-test isolation): synthetic specs seed localStorage via
      // addInitScript, which runs on EVERY page load of its context — a
      // context shared with the 'mock' project would re-seed storage under
      // the plain parity pages and corrupt them.
      name: 'synthetic',
      testMatch: 'synthetic*.spec.ts',
    },
    {
      // The twin target (the twin loop and its mount seam): twin.spec.ts drives tests/parity/
      // twin.html — DemoApp mounted from /dist/twin/panel-layout-demo.js
      // (engine + react bundled from the yarn pins: version truth) via
      // the demo surface's mountDemoApp seam — through the same flows.mjs
      // drivers, against the same state-hp*.json goldens and the same
      // shared snapshot names (per-project pixel files). This project
      // keeps its OWN browser context, like 'synthetic' (isolation is
      // Playwright's default; the twin writes the same storage keys as
      // the mock).
      name: 'twin',
      testMatch: 'twin.spec.ts',
    },
  ],
});
