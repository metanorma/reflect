/**
 * Popover / dialog occlusion regression tests.
 *
 * This is the spec class that catches the "appears behind the editor" bug.
 * For each dialog the test performs a REAL interaction inside it (click a
 * button, fill a field). Playwright's click actionability hit-testing fails
 * loudly ("other element would receive the click") if the editor intercepts
 * the click because the dialog is obscured.
 *
 * The pickers are `react-aria-components` shells (MetanormaToolbar.spec.md
 * §10.10): RAC renders each popover in a portal at `<body>`, mounted only
 * while open. Tests locate them by CSS class and assert visibility with
 * `toBeVisible()` / `toBeHidden()` — class-only locators, never
 * popover-attribute selectors.
 */
import { expect, test } from '@playwright/test';
import { getDoc, openParkedEditor, toolbarButton, typeInEditor, clickEditor, clickBodyParagraph } from './helpers.js';

test.describe('popovers', () => {

  // -------------------------------------------------------------------------
  // TableSizePicker — RAC Popover/Dialog shell (base §10.10).
  // -------------------------------------------------------------------------
  test.describe('TableSizePicker', () => {
    test('grid hover updates the readout; clicking a cell inserts a table', async ({ page }) => {
      await openParkedEditor(page);
      // Caret in the body paragraph (Table is disabled in a heading).
      await clickBodyParagraph(page);
      await page.keyboard.type('before ');

      // Open the picker.
      const tableBtn = toolbarButton(page, 'Table');
      await tableBtn.click();
      const dialog = page.locator('.mn-table-picker');
      await expect(dialog).toBeVisible();

      // Trigger wiring (tables.md §6.1): aria-expanded reflects the open
      // state; aria-controls points at the dialog.
      await expect(tableBtn).toHaveAttribute('aria-expanded', 'true');
      await expect(tableBtn).toHaveAttribute('aria-controls');

      // Open-focus lands on the (1, 1) roving gridcell (tables.md §6.2).
      await expect(
        page.locator('[role="gridcell"][aria-rowindex="1"][aria-colindex="1"]'),
      ).toBeFocused();

      // Escape closes without inserting; focus returns to the trigger (§6.2).
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(tableBtn).toBeFocused();
      await expect(tableBtn).toHaveAttribute('aria-expanded', 'false');

      // Reopen for the hover/commit flow.
      await tableBtn.click();
      await expect(dialog).toBeVisible();

      // Hover a grid cell at row 2, col 3 — the readout should update.
      const cell = page.locator('[role="gridcell"][aria-rowindex="2"][aria-colindex="3"]');
      await cell.hover();
      await expect(dialog).toContainText('2 × 3');

      // Click the cell — this is the occlusion assertion. If the editor
      // intercepts the click (dialog behind it), Playwright throws.
      await cell.click();
      await expect(dialog).toBeHidden();

      // The doc JSON should now contain a table with 2 rows × 3 cols.
      const doc = await getDoc(page);
      const docStr = JSON.stringify(doc);
      expect(docStr).toContain('"table"');
      const rowCount = (docStr.match(/"table_row"/g) ?? []).length;
      expect(rowCount).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // FootnotePicker — RAC Popover/Dialog shell (base §10.10).
  // -------------------------------------------------------------------------
  test.describe('FootnotePicker', () => {
    test('first click creates a marker; second click opens picker; "Create new" inserts another', async ({ page }) => {
      await openParkedEditor(page);
      await typeInEditor(page, 'footnoted');

      // First click: no entries exist → creates immediately without a dialog.
      await toolbarButton(page, 'Footnote').click();
      let doc = await getDoc(page);
      expect(JSON.stringify(doc)).toContain('"footnote_marker"');

      // Move cursor to end and type more text for the second marker.
      await clickEditor(page);
      await page.keyboard.type(' more');

      // Second click: entry now exists → picker opens.
      await toolbarButton(page, 'Footnote').click();
      const picker = page.locator('.mn-footnote-picker');
      await expect(picker).toBeVisible();

      // Click "+ Create new" inside the picker — occlusion assertion.
      await picker.getByRole('button', { name: /Create new/ }).click();
      await expect(picker).toBeHidden();

      // Two markers now in the doc.
      doc = await getDoc(page);
      const docStr = JSON.stringify(doc);
      const markerCount = (docStr.match(/"footnote_marker"/g) ?? []).length;
      expect(markerCount).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // ImageInsertDialog — RAC Popover/Dialog shell (base §10.10).
  // -------------------------------------------------------------------------
  test.describe('ImageInsertDialog', () => {
    test('URL + alt text flow adds an image to the figure under the caret', async ({ page }) => {
      await openParkedEditor(page);
      // Caret in the body paragraph (needed for the Figure button).
      await clickBodyParagraph(page);
      await page.keyboard.type('intro ');

      // Seed the figure first — the single-mode Image button is disabled in a
      // plain paragraph; Figure lands the caret in the seeded caption, where
      // the dialog can fire.
      await toolbarButton(page, 'Figure').click();

      // Open the dialog.
      await toolbarButton(page, 'Image').click();
      const dialog = page.locator('.mn-image-dialog');
      await expect(dialog).toBeVisible();

      // Fill the URL and alt fields — these clicks/types are occlusion
      // assertions: if the editor is on top, the inputs won't receive them.
      const src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
      await dialog.locator('#mn-img-src').fill(src);
      await dialog.locator('#mn-img-alt').fill('test alt');

      // Click Insert — final occlusion assertion.
      await dialog.getByRole('button', { name: 'Insert' }).click();
      await expect(dialog).toBeHidden();

      // The doc JSON should contain a figure > image with the src and alt.
      const doc = await getDoc(page);
      const docStr = JSON.stringify(doc);
      expect(docStr).toContain('"figure"');
      expect(docStr).toContain('"image"');
      expect(docStr).toContain('test alt');
    });
  });

  // -------------------------------------------------------------------------
  // TargetPicker (Xref) — doc-anchored target picker popover.
  // -------------------------------------------------------------------------
  test.describe('XrefPicker', () => {
    test('pick a doc target applies the xref mark', async ({ page }) => {
      await openParkedEditor(page);
      await typeInEditor(page, 'see ');
      // Select the typed text so the mark applies to it.
      await page.keyboard.press('Shift+Home');

      // Open the picker.
      await toolbarButton(page, 'Xref').click();
      const picker = page.locator('.mn-target-picker--xref');
      await expect(picker).toBeVisible();

      // The default doc's clause (id "_document_container") should appear.
      const item = picker.locator('.mn-toolbar-popover__item', { hasText: '_document_container' });
      await expect(item).toBeVisible();

      // Click the item — occlusion assertion. If the editor intercepts the
      // click (picker behind it), Playwright throws.
      await item.click();
      await expect(picker).toBeHidden();

      const docStr = JSON.stringify(await getDoc(page));
      expect(docStr).toContain('"xref"');
      expect(docStr).toContain('_document_container');
    });

    test('free-text entry commits a typed id', async ({ page }) => {
      await openParkedEditor(page);
      await typeInEditor(page, 'forward ');
      await page.keyboard.press('Shift+Home');

      await toolbarButton(page, 'Xref').click();
      const picker = page.locator('.mn-target-picker--xref');
      await expect(picker).toBeVisible();

      // Type a custom id not present in the doc and press Enter — the free-text
      // fallback path (Tier-2 forward reference). This typing is an occlusion
      // assertion: if the editor is on top, the input won't receive keys.
      const search = picker.locator('.mn-target-picker__search');
      await search.fill('future-anchor');
      await search.press('Enter');

      await expect(picker).toBeHidden();
      const docStr = JSON.stringify(await getDoc(page));
      expect(docStr).toContain('"xref"');
      expect(docStr).toContain('future-anchor');
    });
  });

  // -------------------------------------------------------------------------
  // TargetPicker (Concept) — doc-anchored target picker popover.
  // -------------------------------------------------------------------------
  test.describe('ConceptPicker', () => {
    test('pick a doc target applies the concept mark with kind "xref"', async ({ page }) => {
      await openParkedEditor(page);
      await typeInEditor(page, 'term ');
      await page.keyboard.press('Shift+Home');

      await toolbarButton(page, 'Concept').click();
      const picker = page.locator('.mn-target-picker--concept');
      await expect(picker).toBeVisible();

      const item = picker.locator('.mn-toolbar-popover__item', { hasText: '_document_container' });
      await expect(item).toBeVisible();

      await item.click();
      await expect(picker).toBeHidden();

      const docStr = JSON.stringify(await getDoc(page));
      expect(docStr).toContain('"concept"');
      expect(docStr).toContain('_document_container');
      expect(docStr).toContain('"xref"'); // default kind discriminator
    });
  });
});
