/**
 * Coverage-artifact validation — keeps coverage.json, coverage.md, the
 * scenario fixtures and the recorded masters consistent with each other.
 *
 * Checks:
 *  - every INV-1..INV-22 appears exactly once;
 *  - every referenced scenario exists (as a fixture or, for wear-dwell, as
 *    a recorded master);
 *  - every referenced spec file exists;
 *  - every scenario fixture has a recorded master;
 *  - the committed coverage.md matches regeneration (byte-for-byte).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { COVERAGE_PATH, MASTERS_DIR, PARITY_DIR, SCENARIOS_DIR } from './lib/env.js';

const coverage = JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8'));

test('coverage.json maps INV-1..INV-22 exactly once each', () => {
  const ids = coverage.invariants.map((i: { id: string }) => i.id);
  expect(ids, 'one entry per live invariant').toEqual(
    Array.from({ length: 22 }, (_, k) => `INV-${k + 1}`),
  );
});

test('coverage references resolve (scenarios, spec files, masters)', () => {
  const scenarioFiles = fs
    .readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
  const masters = fs
    .readdirSync(MASTERS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));

  for (const inv of coverage.invariants) {
    for (const where of inv.coverage.where ?? []) {
      // Entries look like "specfile › suite › detail" or "specfile (detail)".
      const spec = where.split(/[›(]/)[0].trim();
      const p = path.join(PARITY_DIR, spec);
      expect(fs.existsSync(p), `${inv.id} references existing spec "${spec}"`).toBe(true);
    }
    for (const s of inv.coverage.scenarios ?? []) {
      expect(
        scenarioFiles.includes(s) || s === 'wear-dwell',
        `${inv.id} references existing scenario "${s}"`,
      ).toBe(true);
    }
  }
  // Every fixture scenario must have a recorded master (wear-dwell's master
  // is recorded by wear.parity.ts).
  for (const s of scenarioFiles) {
    expect(masters.includes(s), `scenario "${s}" has a recorded master`).toBe(true);
  }
  expect(masters.includes('wear-dwell'), 'wear-dwell master exists').toBe(true);
});

test('coverage.md is up to date with coverage.json', () => {
  const script = path.join(PARITY_DIR, 'lib', 'gen-coverage-report.mjs');
  const before = fs.readFileSync(path.join(PARITY_DIR, 'coverage.md'), 'utf8');
  execFileSync(process.execPath, [script], { stdio: 'pipe' });
  const after = fs.readFileSync(path.join(PARITY_DIR, 'coverage.md'), 'utf8');
  expect(after, 'regenerated report is identical to the committed one').toBe(before);
});
