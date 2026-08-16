import { expect, test } from '@playwright/test';
import { openEditor, toolbarButton, typeInEditor, getDoc } from './helpers.js';

/** Locator for the RAC prompt popover. */
function promptPopover(page: import('@playwright/test').Page) {
  return page.locator('.mn-prompt-popover');
}

test.describe('bcp14', () => {
  test('empty selection: dialog inserts the keyword text with the mark', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'hello ');

    await toolbarButton(page, 'Bcp14').click();
    const dialog = promptPopover(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').fill('MUST');
    await dialog.getByRole('button', { name: 'OK' }).click();

    const docStr = JSON.stringify(await getDoc(page));
    // The keyword text must appear in the document
    expect(docStr).toContain('"text":"MUST"');
    // The bcp14 mark must be applied to it
    expect(docStr).toContain('"bcp14"');
    expect(docStr).toContain('"type":"MUST"');
  });

  test('non-empty selection: dialog wraps the selection with the mark', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'this MUST be done');
    // Select "MUST" by double-clicking the word (real user behaviour, and
    // deterministic: a keyboard Home/ArrowRight dance races ProseMirror's
    // async selectionchange observation under synthetic input).
    await page.locator('.ProseMirror p', { hasText: 'MUST' }).first()
      .dblclick({ position: { x: 60, y: 10 } });

    await toolbarButton(page, 'Bcp14').click();
    const dialog = promptPopover(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').fill('MUST');
    await dialog.getByRole('button', { name: 'OK' }).click();

    const docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"bcp14"');
    expect(docStr).toContain('"type":"MUST"');
  });

  test('cancel: dismissed dialog leaves the document unchanged', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'plain text');

    const before = JSON.stringify(await getDoc(page));

    await toolbarButton(page, 'Bcp14').click();
    const dialog = promptPopover(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    const after = JSON.stringify(await getDoc(page));
    expect(after).toBe(before);
  });
});
