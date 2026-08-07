import { expect, test } from '@playwright/test';
import { openEditor, toolbarButton, typeInEditor, getDoc } from './helpers.js';

test.describe('bcp14', () => {
  test('empty selection: prompt inserts the keyword text with the mark', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'hello ');

    page.once('dialog', async (dialog) => {
      await dialog.accept('MUST');
    });
    await toolbarButton(page, 'Bcp14').click();

    const docStr = JSON.stringify(await getDoc(page));
    // The keyword text must appear in the document
    expect(docStr).toContain('"text":"MUST"');
    // The bcp14 mark must be applied to it
    expect(docStr).toContain('"bcp14"');
    expect(docStr).toContain('"type":"MUST"');
  });

  test('non-empty selection: prompt wraps the selection with the mark', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'this MUST be done');
    // Select "MUST"
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');

    page.once('dialog', async (dialog) => {
      await dialog.accept('MUST');
    });
    await toolbarButton(page, 'Bcp14').click();

    const docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"bcp14"');
    expect(docStr).toContain('"type":"MUST"');
  });

  test('cancel: dismissed prompt leaves the document unchanged', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'plain text');

    const before = JSON.stringify(await getDoc(page));

    page.once('dialog', async (dialog) => {
      await dialog.dismiss();
    });
    await toolbarButton(page, 'Bcp14').click();

    const after = JSON.stringify(await getDoc(page));
    expect(after).toBe(before);
  });
});
