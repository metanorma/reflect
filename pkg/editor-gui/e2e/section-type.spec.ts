import { expect, test } from '@playwright/test';
import { openEditor, toolbarButton, typeInEditor, getDoc, clickEditor } from './helpers.js';

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

  test('Type button is enabled inside a section; picker shows current type', async ({ page }) => {
    await openEditor(page);
    // Click into the clause paragraph so the cursor is inside a section.
    await clickEditor(page);
    const typeBtn = toolbarButton(page, 'Type');
    await expect(typeBtn).toBeEnabled();

    // Open.
    await typeBtn.click();
    const picker = page.locator('.mn-section-type-picker[popover]');
    await expect(picker).toBeVisible();

    // The current type (clause) is highlighted and disabled (can't convert to self).
    const clauseItem = picker.getByRole('option', { name: 'Clause', exact: true });
    await expect(clauseItem).toBeDisabled();
    await expect(clauseItem).toHaveAttribute('aria-selected', 'true');
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

  test('References is not offered as a section type', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'content');

    await toolbarButton(page, 'Type').click();
    const picker = page.locator('.mn-section-type-picker[popover]');
    await expect(picker).toBeVisible();

    // "References" should not be in the list
    await expect(picker.getByRole('option', { name: 'References', exact: true })).toHaveCount(0);
  });

  test('References button inserts a references section inside bibliography', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'content');

    await toolbarButton(page, 'References').click();

    const docStr = JSON.stringify(await getDoc(page));
    // bibliography container should exist
    expect(docStr).toContain('"bibliography"');
    // references node should exist inside bibliography
    expect(docStr).toContain('"references"');
  });
});
