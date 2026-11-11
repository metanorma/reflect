/**
 * Parity suite paths + record-mode flag.
 *
 * Layout (everything lives under pkg/prosemirror-minimap/e2e/parity/):
 *
 *   scenarios/*.json    fixture scripts (engine-agnostic)
 *   masters/*.json      recorded golden masters (committed to the tree)
 *   deviations.json     deviation register consulted by the differ
 *   coverage.json       INV-1..22 → scenario/assert mapping
 *   coverage.md         generated report from coverage.json
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PARITY_DIR = path.resolve(HERE, '..');
export const SCENARIOS_DIR = path.join(PARITY_DIR, 'scenarios');
export const MASTERS_DIR = path.join(PARITY_DIR, 'masters');
export const FIXTURES_DIR = path.join(PARITY_DIR, 'fixtures');
export const DEVIATIONS_PATH = path.join(PARITY_DIR, 'deviations.json');
export const COVERAGE_PATH = path.join(PARITY_DIR, 'coverage.json');
export const COVERAGE_REPORT_PATH = path.join(PARITY_DIR, 'coverage.md');

/** Same-origin URL of the frozen mockup (served by harness/serve.mjs from
 *  the committed copy at pkg/prosemirror-minimap/docs/metanorma-editor-
 *  mockup.html — the /mockups/… URL is stable and virtual). */
export const MOCKUP_URL = '/mockups/metanorma-editor-mockup.html';

/** Record mode: PW_PARITY_RECORD=1 regenerates masters instead of diffing. */
export const RECORD = process.env.PW_PARITY_RECORD === '1';
