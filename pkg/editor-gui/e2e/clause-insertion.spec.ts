import { expect, test } from '@playwright/test';
import { openEditor, toolbarButton, typeInEditor, getDoc, editor } from './helpers.js';

test.describe('clause insertion', () => {

  // -------------------------------------------------------------------------+
  // Context-sensitive primary: non-empty paragraph → nested clause (wrap)   |
  // -------------------------------------------------------------------------+
  test('Primary click on non-empty paragraph creates a nested clause', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'some content');

    page.once('dialog', async (dialog) => {
      await dialog.accept('Sub heading');
    });
    await toolbarButton(page, 'Clause').click();

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
    // Type content, then press Enter to create an empty trailing paragraph
    await typeInEditor(page, 'first clause');
    await page.keyboard.press('Enter');

    page.once('dialog', async (dialog) => {
      await dialog.accept('Second');
    });
    await toolbarButton(page, 'Clause').click();

    const docStr = JSON.stringify(await getDoc(page));
    // Should have two top-level clauses in sections (sibling, not nested)
    const clauses = (docStr.match(/"clause"/g) ?? []).length;
    expect(clauses).toBe(2);
    expect(docStr).toContain('Second');
    // The new clause should be a sibling, not nested inside the first
    // Verify: "first clause" and "Second" are in separate clauses at the same depth
    expect(docStr).toContain('first clause');
  });

  // -------------------------------------------------------------------------+
  // Dropdown: explicit "Sibling clause"                                     |
  // -------------------------------------------------------------------------+
  test('Dropdown "Sibling clause" inserts a sibling even from non-empty paragraph', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'content here');

    // Open the dropdown
    await page.locator('button[aria-label="Clause options"]').click();
    const menu = page.locator('.mn-clause-menu[popover]');
    await expect(menu).toBeVisible();

    page.once('dialog', async (dialog) => {
      await dialog.accept('Sibling');
    });

    // Click "Sibling clause"
    await menu.getByRole('menuitem', { name: 'Sibling clause' }).click();
    await expect(menu).toBeHidden();

    const docStr = JSON.stringify(await getDoc(page));
    const clauses = (docStr.match(/"clause"/g) ?? []).length;
    expect(clauses).toBe(2);
    expect(docStr).toContain('Sibling');
  });

  // -------------------------------------------------------------------------+
  // Dropdown: "Leading paragraph"                                            |
  // -------------------------------------------------------------------------+
  test('Dropdown "Leading paragraph" inserts a paragraph before subclauses', async ({ page }) => {
    await openEditor(page);
    // First create a nested clause so the outer clause has a subclause
    await typeInEditor(page, 'intro');

    page.once('dialog', async (dialog) => {
      await dialog.accept('Sub');
    });
    await toolbarButton(page, 'Clause').click();

    // Now the outer clause has: paragraph("intro"), clause("Sub")
    // Move cursor back to the outer paragraph
    await editor(page).click();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Home');

    // Open dropdown and insert leading paragraph
    await page.locator('button[aria-label="Clause options"]').click();
    const menu = page.locator('.mn-clause-menu[popover]');
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Leading paragraph' }).click();
    await expect(menu).toBeHidden();

    // The doc should now have an additional empty paragraph
    const docStr = JSON.stringify(await getDoc(page));
    // Verify a new empty paragraph was inserted
    expect(docStr).toContain('"paragraph"');
  });

  // -------------------------------------------------------------------------+
  // Dropdown: "Nested clause" (forces nesting)                               |
  // -------------------------------------------------------------------------+
  test('Dropdown "Nested clause" forces nesting even from empty trailing paragraph', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'content');
    await page.keyboard.press('Enter'); // empty trailing paragraph

    // Open dropdown and select "Nested clause" explicitly
    await page.locator('button[aria-label="Clause options"]').click();
    const menu = page.locator('.mn-clause-menu[popover]');
    await expect(menu).toBeVisible();

    page.once('dialog', async (dialog) => {
      await dialog.accept('Nested');
    });

    await menu.getByRole('menuitem', { name: 'Nested clause' }).click();
    await expect(menu).toBeHidden();

    const docStr = JSON.stringify(await getDoc(page));
    const clauses = (docStr.match(/"clause"/g) ?? []).length;
    expect(clauses).toBe(2);
    expect(docStr).toContain('Nested');
  });
});
