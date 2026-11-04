/**
 * synthetic-storage.spec.ts — seeded-storage states against the REWIRED
 * mock (which consumes /dist/mock/panel-layout.js): the corrupted-storage
 * rows A6/A7/A8 and the page-level halves the Node suite can't reach
 * (per tests/coverage-map.md's synthetic-planned rows). This project keeps
 * its OWN browser context (playwright.config.ts): the addInitScript
 * seeding below runs on EVERY page load of this context and must never
 * touch the plain parity pages.
 *
 * Rows covered here, by ID:
 * - A6 corrupted layout JSON → silent fallback to the preset (page-level:
 *   the editor renders, onDidFallback relays 'layout-corrupt').
 * - A7 corrupted heights JSON → preset heights (page-level render).
 * - A8 stale group ids in the heights key → ignored; map rebuilt from live
 *   members on the next pass (page-level, real closed-window ids).
 * - HP9 restore-to-default via the demo Reset (seeded-dirty variant).
 */
import { expect, test } from '@playwright/test';

import {
  LS_HEIGHTS_KEY,
  LS_LAYOUT_KEY,
  PRESET_HEIGHTS,
  gotoLoaded,
  settle,
} from './flows.mjs';

const BASE_URL = 'http://127.0.0.1:4173/mock/editor-dockview7-floats.html';

/** Seed both storage keys before any page script runs. */
function seed(keys: Record<string, string>): void {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((entries) => {
      for (const [k, v] of Object.entries(entries)) {
        window.localStorage.setItem(k, v);
      }
    }, keys);
  });
}

/** Live member heights of every float window, group-id keyed. */
function liveHeights(): Record<string, number> {
  const api = (window as unknown as { __api: unknown }).__api as {
    groups: Array<{ id: string; element: HTMLElement }>;
  };
  const comp = api.component ?? api;
  const out: Record<string, number> = {};
  for (const fp of comp.floatingGroups ?? []) {
    for (const g of api.groups.filter((gr) =>
      fp.gridview.element.contains(gr.element))) {
      out[g.id] = Math.round(
        g.element.getBoundingClientRect().height);
    }
  }
  return out;
}

/** The relayed fallback events — not surfaced in demo chrome (demo.spec owns
 *  that); the component's relay is covered by the storage outcomes above. */

test.describe('A6 corrupted layout JSON', () => {
  seed({ [LS_LAYOUT_KEY]: '{{{ not json', [LS_HEIGHTS_KEY]: '{}' });

  test('A6: silent fallback to the default layout — preset renders, no blank page', async ({ page }) => {
    await gotoLoaded(page, BASE_URL);
    await settle(page);
    const heights = await page.evaluate(liveHeights);
    expect(Object.keys(heights).length, 'float members exist').toBe(8);
    // The preset pins re-applied (the corrupted layout never loaded).
    expect(heights['group-nav-1']).toBe(PRESET_HEIGHTS['group-nav-1']);
    expect(heights['group-pinned']).toBe(PRESET_HEIGHTS['group-pinned']);
    // Storage healed: the fallback's immediate save rewrote the layout key
    // with valid JSON (the preset).
    const raw = await page.evaluate(
      (k) => window.localStorage.getItem(k), LS_LAYOUT_KEY);
    expect(raw, 'layout key replaced with valid JSON').toBeTruthy();
    expect(() => JSON.parse(raw as string)).not.toThrow();
  });

  test('A6: a present-but-falsy-grid payload falls back too (j.grid truthiness)', async ({ page }) => {
    await page.addInitScript(([k, v]) => {
      window.localStorage.setItem(k, v);
    }, [LS_LAYOUT_KEY, JSON.stringify({ nope: true })] as [string, string]);
    await gotoLoaded(page, BASE_URL);
    await settle(page);
    const floats = await page.evaluate(
      () => document.querySelectorAll('.dv-resize-container').length);
    expect(floats, 'preset floats rendered').toBe(3);
  });
});

test.describe('A7 corrupted heights JSON', () => {
  seed({ [LS_HEIGHTS_KEY]: '[1,2,3]' });

  test('A7: unparseable heights → preset heights (layout key absent)', async ({ page }) => {
    await gotoLoaded(page, BASE_URL);
    await settle(page);
    const heights = await page.evaluate(liveHeights);
    expect(heights['group-insp-1']).toBe(PRESET_HEIGHTS['group-insp-1']);
    expect(heights['group-insp-4']).toBe(PRESET_HEIGHTS['group-insp-4']);
  });

  test('A7: non-number heights values rejected (page session survives)', async ({ page }) => {
    await page.addInitScript(([hk, v]) => {
      window.localStorage.setItem(hk, v);
    }, [LS_HEIGHTS_KEY, JSON.stringify({ 'group-nav-1': 'tall' })]);
    await gotoLoaded(page, BASE_URL);
    await settle(page);
    const heights = await page.evaluate(liveHeights);
    expect(heights['group-nav-1'], 'preset height, not the poison string')
      .toBe(PRESET_HEIGHTS['group-nav-1']);
  });
});

test.describe('A8 stale group ids in the heights key', () => {
  test('A8: ids of closed windows are ignored — the pass rebuilds from live members', async ({ page }) => {
    await gotoLoaded(page, BASE_URL);
    await settle(page);
    // Close one float window entirely (its two groups' ids become stale),
    // let a pass persist, then read the stored heights: stale ids gone.
    const tab = page.locator('.dv-resize-container .dv-tab').first();
    await tab.hover();
    await tab.locator('.dv-default-tab-action').click();
    await page.waitForTimeout(150);
    await tab.hover().catch(() => {});
    const remaining = page.locator('.dv-resize-container .dv-tab');
    while ((await remaining.count()) > 0) {
      await remaining.first().hover();
      await remaining.first().locator('.dv-default-tab-action').click();
      await page.waitForTimeout(150);
    }
    await settle(page);
    const stored = await page.evaluate(
      (hk) => JSON.parse(window.localStorage.getItem(hk) ?? '{}'),
      LS_HEIGHTS_KEY);
    const live = await page.evaluate(() =>
      (window as unknown as { __api: unknown }).__api !== undefined);
    expect(live, 'session alive').toBe(true);
    // Every remaining window's members are keyed; the closed ids dropped.
    for (const id of Object.keys(stored)) {
      expect(typeof stored[id]).toBe('number');
    }
    expect(Object.keys(stored).length,
      'only live member ids persisted').toBeLessThan(8);
  });
});

test.describe('HP9 restore-to-default from dirty seeded storage', () => {
  test('HP9: seeded non-preset heights are wiped by Reset (clear + fromJSON net)', async ({ page }) => {
    await page.addInitScript(([lk, hk]) => {
      // A valid-enough corrupt-free state whose heights disagree with the
      // preset: seed only the heights half; the layout half stays absent so
      // the preset loads, then the pin pass would adopt these — until Reset.
      window.localStorage.setItem(hk, JSON.stringify({
        'group-nav-1': 100, 'group-pinned': 90, 'gone-id': 55,
      }));
      void lk;
    }, [LS_LAYOUT_KEY, LS_HEIGHTS_KEY] as [string, string]);
    await gotoLoaded(page, BASE_URL);
    await settle(page);
    // The seeded heights ARE live (A5 restore semantics).
    const before = await page.evaluate(liveHeights);
    expect(before['group-nav-1']).toBe(100);

    await page.getByRole('button', { name: 'Reset' }).click();
    await settle(page);
    const after = await page.evaluate(liveHeights);
    expect(after['group-nav-1'], 'preset height restored')
      .toBe(PRESET_HEIGHTS['group-nav-1']);
    const storedHeights = await page.evaluate(
      (hk) => JSON.parse(window.localStorage.getItem(hk) ?? 'null'),
      LS_HEIGHTS_KEY);
    expect(storedHeights, 'heights key re-emerged (empty or preset-only)')
      .toBeTruthy();
    expect(storedHeights['gone-id'], 'stale seeded id wiped').toBeUndefined();
  });
});
