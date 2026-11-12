/**
 * Save/Open round-trip for the versioned .mn.json envelope
 * (FileFormat.spec.md §5–§6) — the consumer-side pins of the file-format
 * investment.
 *
 * Mechanism: `openEditor({ forcePickerFallback: true })` removes the File
 * System Access pickers before app load, so browser-fs-access takes its
 * deterministic fallbacks — Save via `<a download>` (captured as a download
 * event), Open via a programmatic file input (driven through the
 * filechooser event). Decode-side semantics (detection, malformed/future
 * refusal, migration composition) are @metanorma/file-format's suite's
 * scope, not this spec's.
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openEditor, chromeSave, chromeOpen, getDoc } from './helpers';

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
);
const fixture = (name: string) => path.join(fixtures, name);

const asRecord = (v: unknown): Record<string, unknown> =>
  v as Record<string, unknown>;

/** Poll helper: the current doc as a JSON string (for toContain polling). */
const docJson = (page: Parameters<typeof getDoc>[0]) => getDoc(page).then((d) => JSON.stringify(d));

test('Save wraps the current tree in a versioned envelope', async ({ page }) => {
  await openEditor(page, { forcePickerFallback: true });
  const saved = await chromeSave(page);
  expect(asRecord(saved.format)).toEqual({ envelope: 1, tree: 1 });
  expect(asRecord(saved.doc).type).toBe('doc');
  expect(saved.doc).toEqual(await getDoc(page));
  const generator = asRecord(saved.meta).generator;
  expect(typeof generator).toBe('string');
  expect(String(generator).length).toBeGreaterThan(0);
  expect(Object.keys(saved).join(',')).toBe('format,meta,doc');
});

test('Open carries preserved meta and foreign members into the next Save', async ({ page }) => {
  await openEditor(page, { forcePickerFallback: true });
  await chromeOpen(page, fixture('enveloped-with-meta.mn.json'));
  await expect
    .poll(() => docJson(page), { timeout: 5_000 })
    .toContain('Carried fixture');

  const saved = await chromeSave(page);
  const meta = asRecord(saved.meta);
  expect(meta.note).toBe('keep-me');
  // Freshly stamped, not the fixture's.
  expect(String(meta.generator)).not.toBe('Reflect 0.0.1');
  expect(saved['x-foreign-note']).toEqual({ origin: 'fixture' });
  expect(saved.doc).toEqual(await getDoc(page));
});

test('a failed Open never leaks its meta into the next Save', async ({ page }) => {
  await openEditor(page, { forcePickerFallback: true });
  await chromeOpen(page, fixture('enveloped-with-meta.mn.json'));
  await expect
    .poll(() => docJson(page), { timeout: 5_000 })
    .toContain('Carried fixture');

  // Valid envelope, structurally invalid tree: decode succeeds, rehydration
  // throws, the editor keeps the good document. The status line is scoped by
  // text because the layout engine also renders its own (empty) role="alert"
  // live region.
  await chromeOpen(page, fixture('poisoned-envelope.mn.json'));
  const statusAlert = page
    .locator('[role="alert"]')
    .filter({ hasText: 'Could not load file' });
  await expect(statusAlert).toContainText('Unknown node type');
  await expect
    .poll(() => docJson(page), { timeout: 5_000 })
    .toContain('Carried fixture');

  const saved = await chromeSave(page);
  const meta = asRecord(saved.meta);
  expect(meta.note).toBe('keep-me');
  expect(saved['x-foreign-note']).toEqual({ origin: 'fixture' });
  expect(saved['x-poison-marker']).toBeUndefined();
});
