/**
 * Panel-layout integration regressions — the structural contract of the
 * editor-gui × @metanorma/panel-layout composition (App.tsx / panels.tsx /
 * presetLayout.ts):
 *
 *  1. the doc panel is FULL-BLEED and non-closable — its tab strip is
 *     hidden (preset `hideHeader`) and it exposes no close affordance, so
 *     the ProseMirror surface can never be accidentally closed/unmounted;
 *  2. the two floating panels (vertical document toolbar + minimap) are
 *     present as floating windows over the main grid;
 *  3. a closed float reopens through the chrome bar's Panels control at
 *     the preset geometry;
 *  4. the layout envelope persists under editor-gui's own key
 *     (`mn-editor-gui-layout-v1`) and restores both floats across a
 *     reload.
 *
 * These tests deliberately do NOT dismiss the floating windows (no
 * dismissFloats helper) — the floats are their subject. Selectors follow
 * the discipline in helpers.ts: global/engine classes and roles only.
 */
import { expect, test } from '@playwright/test';
import { openEditor } from './helpers.js';

/** editor-gui's layout-envelope localStorage key (panelPersistence.ts). */
const LAYOUT_KEY = 'mn-editor-gui-layout-v1';

test.describe('panel layout integration', () => {

  test('doc panel is full-bleed with no close affordance', async ({ page }) => {
    await openEditor(page);

    // The editor surface lives in the doc panel…
    await expect(
      page.locator('.mn-doc-panel .ProseMirror')).toBeVisible();

    // …whose tab strip exists but is HIDDEN (preset hideHeader)…
    const header = page.locator(
      '.dv-groupview:has(.ProseMirror) .dv-tabs-and-actions-container');
    const hidden = await header.evaluate((el) =>
      getComputedStyle(el).display === 'none'
      || el.getBoundingClientRect().height === 0);
    expect(hidden).toBe(true);

    // …and the ONLY visible close buttons belong to the two floats.
    expect(await page.locator('.dv-default-tab-action:visible').count()).toBe(2);
  });

  test('toolbar and minimap float over the main grid', async ({ page }) => {
    await openEditor(page);
    // Toolbar: the advanced toolbar inside its own group…
    const toolbarGroup = page.locator('.dv-groupview:has([role="toolbar"])');
    await expect(toolbarGroup).toHaveCount(1);
    await expect(page.getByRole('toolbar')).toBeVisible();

    // Minimap: the minimap pane inside its own (different) group…
    const minimapGroup = page.locator('.dv-groupview:has(.mn-minimap)');
    await expect(minimapGroup).toHaveCount(1);
    await expect(page.locator('.mn-minimap')).toBeVisible();

    // Both overlay the editor: the doc panel still spans the grid.
    const editorBox = await page
      .locator('.mn-doc-panel .ProseMirror').boundingBox();
    const layoutBox = await page.locator('.layoutArea').boundingBox();
    expect(editorBox).not.toBeNull();
    expect(layoutBox).not.toBeNull();
    expect(editorBox!.width).toBeGreaterThan(layoutBox!.width * 0.9);
  });

  test('closed toolbar reopens via the Panels control at preset geometry', async ({ page }) => {
    await openEditor(page);

    // Close the toolbar window via its tab close action.
    await page.locator('.dv-groupview:has([role="toolbar"])')
      .locator('.dv-default-tab-action').first().click();
    await expect(page.getByRole('toolbar')).toHaveCount(0);

    // Reopen through the chrome bar; the toolbar returns inside a
    // floating window (not docked into the main grid).
    await page.getByRole('button', { name: 'Reopen the Toolbar panel' }).click();
    await expect(page.getByRole('toolbar')).toBeVisible();
    const group = page.locator('.dv-groupview:has([role="toolbar"])');
    await expect(group).toHaveCount(1);

    // Geometry contract of the reopen path: position and WIDTH follow the
    // preset seed (the overlay settles them a frame after creation — poll
    // rather than measure immediately). HEIGHT is deliberately NOT
    // asserted at the seed value: the reopened group carries a fresh
    // engine id, so the preset's seeded tabset height does not apply and
    // the library's pin pass owns it (content-pinned, with the global
    // 150px window floor) — the user can stretch it from there.
    await expect.poll(async () => {
      const box = await group.boundingBox();
      return box === null ? -1 : Math.round(box.width);
    }).toBeGreaterThanOrEqual(114);
    const box = await group.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.x)).toBeLessThanOrEqual(20);
    expect(box!.height).toBeGreaterThan(120);
  });

  test('layout envelope persists and restores both floats', async ({ page }) => {
    await openEditor(page);

    // The envelope exists under editor-gui's own key and is versioned.
    const stored = await page.evaluate(
      (key) => localStorage.getItem(key), LAYOUT_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string).version).toBe(1);

    // A reload restores the saved layout: the editor and BOTH floats are
    // back, and only the floats expose close buttons.
    await page.reload();
    await page.locator('.mn-doc-panel .ProseMirror')
      .waitFor({ state: 'visible' });
    await expect(page.getByRole('toolbar')).toBeVisible();
    await expect(page.locator('.mn-minimap')).toBeVisible();
    expect(await page.locator('.dv-default-tab-action:visible').count()).toBe(2);
  });
});
