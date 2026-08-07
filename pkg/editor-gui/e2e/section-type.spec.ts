import { expect, test } from '@playwright/test';
import { openEditor, toolbarButton, typeInEditor, getDoc } from './helpers.js';

test.describe('section-type-picker', () => {
  test('Type button opens picker; selecting a type converts the section', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'hello');

    // Open the picker.
    await toolbarButton(page, 'Type').click();
    const picker = page.locator('.mn-section-type-picker[popover]');
    await expect(picker).toBeVisible();

    // The current type (clause) should be marked active.
    const clauseItem = picker.getByRole('option', { name: 'Clause', exact: true });
    await expect(clauseItem).toBeDisabled();

    // Select "Terms" — should convert clause → terms.
    await picker.getByRole('option', { name: 'Terms', exact: true }).click();
    await expect(picker).toBeHidden();

    const docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"terms"');
    expect(docStr).not.toContain('"clause"');
  });

  test('Type button opens and closes the picker', async ({ page }) => {
    await openEditor(page);
    // The default doc has a clause, so the button should be enabled.
    const typeBtn = toolbarButton(page, 'Type');
    await expect(typeBtn).toBeEnabled();

    // Open.
    await typeBtn.click();
    const picker = page.locator('.mn-section-type-picker[popover]');
    await expect(picker).toBeVisible();

    // Close by clicking the trigger again (toggle).
    await typeBtn.click();
    await expect(picker).toBeHidden();
  });

  test('Multiple conversions: clause → annex → terms → clause', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'content');

    // clause → annex
    await toolbarButton(page, 'Type').click();
    await page.locator('.mn-section-type-picker[popover]').getByRole('option', { name: 'Annex', exact: true }).click();
    let docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"annex"');

    // annex → terms
    await toolbarButton(page, 'Type').click();
    await page.locator('.mn-section-type-picker[popover]').getByRole('option', { name: 'Terms', exact: true }).click();
    docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"terms"');

    // terms → clause
    await toolbarButton(page, 'Type').click();
    await page.locator('.mn-section-type-picker[popover]').getByRole('option', { name: 'Clause', exact: true }).click();
    docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"clause"');
  });
});
