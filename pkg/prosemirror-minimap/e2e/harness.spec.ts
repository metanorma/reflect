/**
 * Harness smoke spec (§15.3): proves the page, mount API, and Playwright
 * wiring work before the migrated tests land. The real suites live in
 * `minimap.spec.ts` (renderer/geometry regressions) — this file stays as
 * the harness's own canary.
 */
import { expect, test } from '@playwright/test';
import { mount, minimap, canvas, overlay, tallDoc, scrollGeom } from './fixtures.js';

test.describe('harness', () => {
  test('mounts a minimap that paints and reports geometry', async ({ page }) => {
    await page.goto('/');
    await mount(page, { doc: tallDoc(20) });

    await expect(minimap(page)).toBeVisible();
    await expect(canvas(page)).toBeVisible();
    await expect(overlay(page)).toHaveCount(1);

    const box = await canvas(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(10);
    expect(box!.height).toBeGreaterThan(10);

    const geo = await scrollGeom(page);
    expect(geo.maxScroll).toBeGreaterThan(0);
  });
});
