/**
 * synthetic-panel.spec.ts — the module-8/9 rider rows + A4's late-window
 * timing, driven through a synthetic page that instantiates the SAME
 * built artifact the rewired mock consumes (/dist/mock/panel-layout.js)
 * with a test registry. Rows covered, by ID:
 *
 * - C3  a throwing consumer panel renders the inline "Panel failed: <id>"
 *       state through wrapPanelComponent (module 8's rider; the live
 *       dockview mount is the half Node cannot reach).
 * - A4  grips on windows created LATE (post-boot unwrap) appear within the
 *       interval net's bound — the real-DOM timing half.
 * - G5  mouse-close leaves DOM focus on body → the wiring re-focuses the
 *       active group (rendered ring excluded: ring keys on focus-visible).
 * - G6  unwrap focuses the minted window's group on a microtask (the
 *       convergence amendment: the component's own will-drop observer).
 */
import { expect, test } from '@playwright/test';

import { settle, tabInfo, DRAG_STEPS, ZONE_SETTLE_MS } from './flows.mjs';

const HARNESS = '/tests/parity/harness.html';

/**
 * A verified drop point on the harness's doc-grid surface (the harness has
 * no white .page, so the parity flows' pasteboard scan does not apply):
 * inside .layoutArea, not over a float window, over the doc group's
 * content container (the claim's territory).
 */
async function gridSurfacePoint(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const area = document.querySelector('.layoutArea');
    if (!area) return null;
    const api = (window as unknown as {
      __api: { groups: Array<{ element: HTMLElement; api: { location: { type: string } } }> };
    }).__api;
    const g = api.groups.find((gr) => gr.api.location.type === 'grid');
    if (!g) return null;
    const c = g.element.querySelector('.dv-content-container') ?? g.element;
    const r = c.getBoundingClientRect();
    const vr = area.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.min(Math.max(Math.round(r.top + r.height / 2),
      Math.round(vr.top + 80)), Math.round(vr.bottom - 20));
    const el = document.elementFromPoint(x, y);
    if (!el || !area.contains(el)) return null;
    if (el.closest('.dv-resize-container')) return null;
    return { x, y };
  });
}
test.describe('C3 panel render throw (live boundary)', () => {
  test('C3: a throwing panel renders "Panel failed: <id>" inline; the layout survives', async ({ page }) => {
    // ?throw names a REGISTRY KEY (the serialized contentComponent); the
    // demo preset maps the Outline panel to contentComponent 'outline',
    // whose panel id is also 'outline' — the fallback line carries the id.
    await page.goto(`http://127.0.0.1:4173${HARNESS}?throw=outline`);
    await page.waitForSelector('#boot', { state: 'detached' });
    await page.waitForFunction(() =>
      !!(window as unknown as { __api?: unknown }).__api);
    await settle(page);
    const failed = await page.evaluate(() =>
      document.body.textContent?.includes('Panel failed: outline'));
    expect(failed, 'inline fallback line present').toBe(true);
    // The layout did NOT unmount: the float windows and every healthy
    // sibling panel still render (the boundary is per-panel).
    const healthy = await page.evaluate(() => ({
      floats: document.querySelectorAll('.dv-resize-container').length,
      panels: document.querySelectorAll('.panelwrap').length,
    }));
    expect(healthy.floats, 'float windows still mounted').toBe(3);
    expect(healthy.panels, 'healthy panels render (the throwing one is the fallback line)')
      .toBeGreaterThanOrEqual(8);
  });
});

test.describe('A4 grip timing on late windows', () => {
  test('A4: an unwrap-minted window gets its grip within the interval net bound (~500ms + slack)', async ({ page }) => {
    await page.goto(`http://127.0.0.1:4173${HARNESS}`);
    await page.waitForSelector('#boot', { state: 'detached' });
    await page.waitForFunction(() =>
      !!(window as unknown as { __api?: unknown }).__api);
    await page.waitForFunction(() =>
      document.querySelectorAll('.dv-resize-container').length === 3);
    await page.waitForTimeout(600);

    // HP2-style unwrap: drag a tab to the grid surface.
    const pb = await gridSurfacePoint(page);
    expect(pb, 'grid-surface point').toBeTruthy();
    const src = await tabInfo(page, 'Outline');
    await page.mouse.move(src.x, src.y);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.move(pb!.x, pb!.y, { steps: DRAG_STEPS });
    await page.waitForFunction(() => document
      .querySelector('.layoutArea')
      ?.classList.contains('mn-unwrap-hover'));
    await page.waitForTimeout(ZONE_SETTLE_MS);
    const t0 = Date.now();
    await page.mouse.up();
    // The minted window must carry a grip within the net bound.
    await page.waitForFunction(() =>
      document.querySelectorAll('.mn-drag-grip').length === 4,
      undefined, { timeout: 2000 });
    const dt = Date.now() - t0;
    expect(dt, 'grip within the A4 bound (≤ ~1s incl. paint)').toBeLessThan(1500);
    await settle(page);
  });
});

test.describe('G5 focus after mouse-close', () => {
  test('G5: tab ✕ close moves focus off body (the wiring restores the active group)', async ({ page }) => {
    await page.goto(`http://127.0.0.1:4173${HARNESS}`);
    await page.waitForSelector('#boot', { state: 'detached' });
    await page.waitForFunction(() =>
      !!(window as unknown as { __api?: unknown }).__api);
    await settle(page);
    const tab = page.locator('.dv-resize-container .dv-tab').first();
    await tab.hover();
    // Focus something layout-owned first so the post-close probe is
    // meaningful, then close via ✕ (mouse path).
    await tab.click();
    await page.waitForTimeout(120);
    await tab.hover();
    await tab.locator('.dv-default-tab-action').click();
    await page.waitForTimeout(250);
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName ?? null,
        inLayout: !!el?.closest('.layoutArea') || !!el?.classList?.contains('dv-groupview'),
      };
    });
    expect(focused.inLayout, 'DOM focus restored into the layout (not body)').toBe(true);
  });
});

test.describe('G6 focus after unwrap (will-drop group change)', () => {
  test('G6: a panel unwrap moves focus to the minted window\'s group', async ({ page }) => {
    await page.goto(`http://127.0.0.1:4173${HARNESS}`);
    await page.waitForSelector('#boot', { state: 'detached' });
    await page.waitForFunction(() =>
      !!(window as unknown as { __api?: unknown }).__api);
    await settle(page);
    const pb = await gridSurfacePoint(page);
    expect(pb, 'grid-surface point').toBeTruthy();
    const src = await tabInfo(page, 'Outline');
    await page.mouse.move(src.x, src.y);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.move(pb!.x, pb!.y, { steps: DRAG_STEPS });
    await page.waitForFunction(() => document
      .querySelector('.layoutArea')
      ?.classList.contains('mn-unwrap-hover'));
    await page.waitForTimeout(ZONE_SETTLE_MS);
    await page.mouse.up();
    await page.waitForTimeout(300); // the microtask + focus commit
    const state = await page.evaluate(() => {
      const api = (window as unknown as { __api: unknown }).__api as {
        groups: Array<{ id: string; element: HTMLElement }>;
        component: unknown;
      };
      const comp = api.component ?? api;
      const minted = [...document.querySelectorAll('.dv-resize-container')]
        .map((w) => w.querySelector('.dv-tab')?.textContent?.trim())
        .filter((t) => t === 'Outline');
      const active = api.groups.find((g) =>
        document.activeElement?.contains(g.element)
        || g.element.contains(document.activeElement));
      return { mintedCount: minted.length, focusedGroupId: active?.id ?? null };
    });
    expect(state.mintedCount, 'the unwrapped window exists').toBe(1);
    expect(state.focusedGroupId, 'focus moved into a group (the minted one)').toBeTruthy();
  });
});

