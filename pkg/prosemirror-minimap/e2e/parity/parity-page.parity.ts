/**
 * Smoke test for the side-by-side parity page (/parity.html): the control
 * bar loads the scenario fixtures, runs one against the mockup iframe
 * adapter, and produces per-step geometry frames. The package pane stays a
 * documented placeholder until Phase 4 registers its adapter.
 */
import { test, expect } from '@playwright/test';

test('parity page runs a scenario against the mockup pane', async ({ page }) => {
  await page.goto('/parity.html');

  // Scenario picker populated from the fixtures directory.
  await page.waitForFunction(
    () => {
      const sel = document.querySelector('#scenario') as HTMLSelectElement | null;
      return sel !== null && sel.options.length >= 3;
    },
    null,
    { timeout: 15_000 },
  );

  await page.selectOption('#scenario', 'zoom-mid');
  await page.click('#run');
  await page.waitForFunction(
    () => document.querySelector('#status')?.textContent?.startsWith('done') === true,
    null,
    { timeout: 60_000 },
  );

  const steps = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.step .sum')).map((el) => el.textContent),
  );
  expect(steps, 'one summary line per scenario step').toHaveLength(12);
  expect(steps.some((s) => s?.includes('zoom px=9000'))).toBe(true);
  // The zoom steps keep the reading position (INV-13, visible in the live
  // summaries): scrollTop identical across the zoom transitions.
  const scrollTopOf = (s?: string) => Number(s?.match(/scrollTop=(-?\d+)/)?.[1] ?? NaN);
  expect(scrollTopOf(steps[1])).not.toBeNaN();
  expect(scrollTopOf(steps[2]), 'zoom px=9000 preserves scrollTop').toBe(scrollTopOf(steps[1]));
  expect(scrollTopOf(steps[4]), 'zoom px=6000 preserves scrollTop').toBe(scrollTopOf(steps[3]));

  // Expanding a step shows the captured frame JSON.
  await page.evaluate(() =>
    (document.querySelectorAll('.step .sum')[8] as HTMLElement).click(),
  );
  const frameText = await page.evaluate(() =>
    document.querySelectorAll('.step .frames div')[0]?.textContent ?? '',
  );
  expect(frameText).toContain('mockup:');
  expect(frameText).toContain('"thumb"');
  expect(frameText).toContain('"panY"');
  expect(frameText).toContain('"labels"');
});
