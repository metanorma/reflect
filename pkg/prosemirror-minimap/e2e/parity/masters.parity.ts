/**
 * Golden-master record/verify for mockup parity.
 *
 * One test per scenario fixture (scenarios/*.json). Each test:
 *
 *   1. loads the mockup through the adapter (seeded profile, past the
 *      auto-jump),
 *   2. executes every step, capturing a geometry frame after each,
 *   3. captures the default-build census once (after the first step),
 *   4. runs the STANDING INVARIANT ASSERTS (lib/invariantAsserts.ts) — in
 *      both modes; the oracle must prove itself every run,
 *   5. record mode (PW_PARITY_RECORD=1) writes masters/<scenario>.json;
 *      verify mode diffs the run against the recorded master through the
 *      deviation-aware differ (lib/deviations.ts) and logs a content hash:
 *      two consecutive verify runs logging identical sha256 values are the
 *      byte-stability proof.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { MASTERS_DIR, RECORD, SCENARIOS_DIR } from './lib/env.js';
import { canonical, canonicalFile, sha256 } from './lib/canonical.js';
import { diffMaster, loadRegister } from './lib/deviations.js';
import { assertFrames } from './lib/invariantAsserts.js';
import { mockupAdapter } from './lib/mockupAdapter.js';
import type { Census, MasterFile, Scenario } from './lib/types.js';

function loadScenarios(): Scenario[] {
  return fs
    .readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(SCENARIOS_DIR, f), 'utf8')) as Scenario);
}

const masterPath = (name: string) => path.join(MASTERS_DIR, `${name}.json`);

test.describe('parity golden masters', () => {
  for (const scenario of loadScenarios()) {
    test(`master: ${scenario.name}`, async ({ page }) => {
      const adapter = mockupAdapter();
      await adapter.load(page);

      let census: Census | null = null;
      const frames: MasterFile['frames'] = [];
      for (let i = 0; i < scenario.steps.length; i++) {
        const step = scenario.steps[i];
        await adapter.applyStep(page, step, i);
        // Census = the default-build population, captured once right after
        // the deterministic reset (before any zoom rebuild changes H).
        if (i === 0) census = await adapter.captureCensus(page);
        frames.push(await adapter.captureFrame(page, i, step));
      }
      if (!census) throw new Error('scenario has no steps to census after');

      const master: MasterFile = {
        format: 1,
        scenario: scenario.name,
        adapter: adapter.id,
        env: {
          viewport: [1600, 900],
          reducedMotion: 'reduce',
          note:
            'seeded localStorage (mnmock-*: about-seen=1, measure=m, vis=annotated, theme=light, mmzoom=""), reduced-motion emulation, fixed viewport. No timestamps — byte-stable by construction.',
        },
        census,
        frames,
      };

      // Standing invariant asserts — the oracle proves itself every run.
      const violations = assertFrames(census, frames);
      expect(
        violations.map((v) => `[${v.inv}] ${v.where}: ${v.detail}`),
        `${violations.length} invariant violation(s) against the mockup oracle`,
      ).toEqual([]);

      if (RECORD) {
        fs.mkdirSync(MASTERS_DIR, { recursive: true });
        fs.writeFileSync(masterPath(scenario.name), canonicalFile(master));
        console.log(
          `parity-master ${scenario.name} RECORDED frames=${frames.length} censusLabels=${census.labels.length}`,
        );
        return;
      }

      // Verify mode.
      if (!fs.existsSync(masterPath(scenario.name))) {
        throw new Error(
          `no recorded master for "${scenario.name}" — run with PW_PARITY_RECORD=1 first`,
        );
      }
      const recorded = JSON.parse(fs.readFileSync(masterPath(scenario.name), 'utf8'));
      const register = loadRegister();
      const result = diffMaster(
        recorded,
        master,
        { adapter: adapter.id, scenario: scenario.name, step: '*' },
        register,
      );
      const hash = await sha256(canonical(master));
      console.log(
        `parity-master ${scenario.name} frames=${frames.length} sha256=${hash} byteStable=${result.byteStable} toleratedLeaves=${result.tolerated}`,
      );
      expect(
        result.diffs.map((d) => `${d.path}: expected ${JSON.stringify(d.expected)} ≠ actual ${JSON.stringify(d.actual)}${d.deviation ? ` (deviation ${d.deviation} registered but exceeded)` : ''}`),
        `${result.diffs.length} master divergence(s) vs recorded baseline`,
      ).toEqual([]);
    });
  }
});
