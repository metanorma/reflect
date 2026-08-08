import { expect, test } from '@playwright/test';
import { openEditor, toolbarButton, typeInEditor, getDoc, editor } from './helpers.js';

test.describe('clause insertion', () => {

  // -------------------------------------------------------------------------+
  // Context-sensitive primary: non-empty paragraph → nested clause (wrap)   |
  // -------------------------------------------------------------------------+
  test('Primary click on non-empty paragraph creates a nested clause', async ({ page }) => {
    await openEditor(page);
    // Navigate past the section_title into the paragraph.
    await editor(page).click();
    await page.keyboard.press('Enter'); // exit section_title → body paragraph
    await page.keyboard.type('some content');

    await toolbarButton(page, 'Clause').click();

    // Clause is created immediately — cursor lands in section_title.
    // Type the heading directly into the editor.
    await page.keyboard.type('Sub heading');

    const docStr = JSON.stringify(await getDoc(page));
    // The original clause should now contain a nested clause
    const clauses = (docStr.match(/"clause"/g) ?? []).length;
    expect(clauses).toBe(2); // outer + nested
    expect(docStr).toContain('Sub heading');
    expect(docStr).toContain('some content');
  });

  // -------------------------------------------------------------------------+
  // Context-sensitive primary: empty trailing paragraph → sibling clause    |
  // -------------------------------------------------------------------------+
  test('Primary click on empty trailing paragraph creates a sibling clause', async ({ page }) => {
    await openEditor(page);
    // Navigate past the section_title into the paragraph, then type.
    await editor(page).click();
    await page.keyboard.press('Enter'); // exit section_title → body paragraph
    await page.keyboard.type('first clause');
    await page.keyboard.press('Enter');

    await toolbarButton(page, 'Clause').click();

    // Cursor lands in the new clause's section_title — type heading.
    await page.keyboard.type('Second');

    const docStr = JSON.stringify(await getDoc(page));
    // Should have two top-level clauses in sections (sibling, not nested)
    const clauses = (docStr.match(/"clause"/g) ?? []).length;
    expect(clauses).toBe(2);
    expect(docStr).toContain('Second');
    // The new clause should be a sibling, not nested inside the first
    expect(docStr).toContain('first clause');
  });

  // -------------------------------------------------------------------------+
  // Dropdown: explicit "Sibling clause"                                     |
  // -------------------------------------------------------------------------+
  test('Dropdown "Sibling clause" inserts a sibling even from non-empty paragraph', async ({ page }) => {
    await openEditor(page);
    // Navigate past the section_title into the paragraph.
    await editor(page).click();
    await page.keyboard.press('Enter'); // exit section_title → body paragraph
    await page.keyboard.type('content here');

    // Open the dropdown
    await page.locator('button[aria-label="Clause options"]').click();
    const menu = page.locator('.mn-clause-menu[popover]');
    await expect(menu).toBeVisible();

    // Click "Sibling clause" — creates clause immediately, cursor in title.
    await menu.getByRole('menuitem', { name: 'Sibling clause' }).click();
    await expect(menu).toBeHidden();

    // Type heading directly.
    await page.keyboard.type('Sibling');

    const docStr = JSON.stringify(await getDoc(page));
    const clauses = (docStr.match(/"clause"/g) ?? []).length;
    expect(clauses).toBe(2);
    expect(docStr).toContain('Sibling');
  });

  // -------------------------------------------------------------------------+
  // Dropdown: "Nested clause" (forces nesting)                               |
  // -------------------------------------------------------------------------+
  test('Dropdown "Nested clause" forces nesting even from empty trailing paragraph', async ({ page }) => {
    await openEditor(page);
    // Navigate past the section_title into the paragraph.
    await editor(page).click();
    await page.keyboard.press('Enter'); // exit section_title → body paragraph
    await page.keyboard.type('content');
    await page.keyboard.press('Enter'); // empty trailing paragraph

    // Open dropdown and select "Nested clause" explicitly
    await page.locator('button[aria-label="Clause options"]').click();
    const menu = page.locator('.mn-clause-menu[popover]');
    await expect(menu).toBeVisible();

    await menu.getByRole('menuitem', { name: 'Nested clause' }).click();
    await expect(menu).toBeHidden();

    // Type heading directly into the new section_title.
    await page.keyboard.type('Nested');

    const docStr = JSON.stringify(await getDoc(page));
    const clauses = (docStr.match(/"clause"/g) ?? []).length;
    expect(clauses).toBe(2);
    expect(docStr).toContain('Nested');
  });
});
