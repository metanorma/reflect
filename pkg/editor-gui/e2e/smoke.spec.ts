/**
 * Smoke tests — the thinnest guard. If the build breaks (esbuild bundling,
 * PnP resolver, CSS import order, React mount, bootstrap mount quirk), this
 * spec fails first.
 */
import { expect, test } from '@playwright/test';
import { editor, openEditor, getDoc, toolbar, toolbarButton, typeInEditor } from './helpers.js';

test.describe('smoke', () => {
  test('boots and renders the editor surface', async ({ page }) => {
    await openEditor(page);
    await expect(toolbar(page)).toBeVisible();
    await expect(editor(page)).toBeVisible();
  });

  test('toolbar buttons for core groups are present', async ({ page }) => {
    await openEditor(page);
    for (const label of ['Bold', 'Section', 'Table', 'Image', 'Footnote', 'Undo', 'Redo']) {
      await expect(toolbarButton(page, label)).toBeVisible();
    }
  });

  test('typing in the editor produces visible text', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'Hello world');
    await expect(editor(page)).toContainText('Hello world');
  });

  test('doc JSON reflects typed input via the test hook', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'Smoke text');
    const doc = await getDoc(page);
    expect(JSON.stringify(doc)).toContain('Smoke text');
  });

  test('bootstrap mount quirk: editor lives under .appwrapper, not #app', async ({ page }) => {
    await openEditor(page);
    // bootstrap.tsx removes #app after mount and renders into .appwrapper.
    const appRoot = page.locator('#app');
    await expect(appRoot).toHaveCount(0);
    await expect(page.locator('.appwrapper .ProseMirror')).toHaveCount(1);
  });
});
