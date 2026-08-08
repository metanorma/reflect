import { expect, test } from '@playwright/test';
import { openEditor, toolbarButton, typeInEditor, getDoc } from './helpers.js';

/** Locator for the RAC prompt popover. */
function promptPopover(page: import('@playwright/test').Page) {
  return page.locator('.mn-prompt-popover');
}

test.describe('stem-formula', () => {
  test('Formula button inserts a stem node with visible AsciiMath source', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'before ');

    // Click Formula, enter AsciiMath, confirm.
    await toolbarButton(page, 'Formula').click();
    const dialog = promptPopover(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').fill('x = y');
    await dialog.getByRole('button', { name: 'Insert' }).click();

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

    await toolbarButton(page, 'Formula').click();
    const dialog = promptPopover(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').fill('a^2 + b^2');
    await dialog.getByRole('button', { name: 'Insert' }).click();

    const stemEl = page.locator('.mn-stem');
    await expect(stemEl).toHaveAttribute('data-type', 'asciimath');
    await expect(stemEl).toContainText('a^2 + b^2');
  });
});
