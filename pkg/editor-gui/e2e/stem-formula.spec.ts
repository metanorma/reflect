import { expect, test } from '@playwright/test';
import { openEditor, toolbarButton, typeInEditor, getDoc, editor } from './helpers.js';

test.describe('stem-formula', () => {
  test('Formula button inserts a stem node with visible AsciiMath source', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'before ');

    // Click Formula, enter AsciiMath, confirm.
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('prompt');
      await dialog.accept('x = y');
    });
    await toolbarButton(page, 'Formula').click();

    // The stem node should be in the document model.
    const docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"stem"');
    expect(docStr).toContain('"asciimath"');
    expect(docStr).toContain('x = y');

    // The formula source should be VISIBLE in the DOM (not just a data attr).
    const stemEl = page.locator('.mn-stem');
    await expect(stemEl).toBeVisible();
    await expect(stemEl).toContainText('x = y');
  });

  test('Formula stem node carries the data-type attribute', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'math ');

    page.once('dialog', async (dialog) => {
      await dialog.accept('a^2 + b^2');
    });
    await toolbarButton(page, 'Formula').click();

    const stemEl = page.locator('.mn-stem');
    await expect(stemEl).toHaveAttribute('data-type', 'asciimath');
    await expect(stemEl).toContainText('a^2 + b^2');
  });
});
