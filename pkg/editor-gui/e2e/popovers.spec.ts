/**
 * Popover / dialog occlusion regression tests.
 *
 * This is the spec class that catches the "appears behind the editor" bug.
 * For each dialog the test performs a REAL interaction inside it (click a
 * button, fill a field). Playwright's click actionability hit-testing fails
 * loudly ("other element would receive the click") if the editor intercepts
 * the click because the dialog is obscured.
 *
 * All three popovers now use the HTML Popover API (`popover="manual"`,
 * top-layer rendering) with CSS Anchor Positioning. The popover elements are
 * always present in the DOM; when hidden they have `display: none` from the
 * user-agent stylesheet. Tests locate them by CSS class + `[popover]` attribute
 * (which always matches) and assert visibility with `toBeVisible()` /
 * `toBeHidden()` — not `toHaveCount(0)`.
 */
import { expect, test } from '@playwright/test';
import { getDoc, openEditor, toolbarButton, typeInEditor, editor } from './helpers.js';

test.describe('popovers', () => {

  // -------------------------------------------------------------------------
  // TableSizePicker — `popover="manual"` (HTML Popover API, top-layer).
  // -------------------------------------------------------------------------
  test.describe('TableSizePicker', () => {
    test('grid hover updates the readout; clicking a cell inserts a table', async ({ page }) => {
      await openEditor(page);
      await typeInEditor(page, 'before ');

      // Open the picker.
      await toolbarButton(page, 'Table').click();
      const dialog = page.locator('.mn-table-picker[popover]');
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
  // FootnotePicker — `popover="manual"` (HTML Popover API, top-layer).
  // -------------------------------------------------------------------------
  test.describe('FootnotePicker', () => {
    test('first click creates a marker; second click opens picker; "Create new" inserts another', async ({ page }) => {
      await openEditor(page);
      await typeInEditor(page, 'footnoted');

      // First click: no entries exist → creates immediately without a dialog.
      await toolbarButton(page, 'Footnote').click();
      let doc = await getDoc(page);
      expect(JSON.stringify(doc)).toContain('"footnote_marker"');

      // Move cursor to end and type more text for the second marker.
      await editor(page).click();
      await page.keyboard.type(' more');

      // Second click: entry now exists → picker opens.
      await toolbarButton(page, 'Footnote').click();
      const picker = page.locator('.mn-footnote-picker[popover]');
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
  // ImageInsertDialog — `popover="manual"` (HTML Popover API, top-layer).
  // -------------------------------------------------------------------------
  test.describe('ImageInsertDialog', () => {
    test('URL + alt text flow inserts a figure with an image', async ({ page }) => {
      await openEditor(page);
      await typeInEditor(page, 'intro ');

      // Open the dialog.
      await toolbarButton(page, 'Image').click();
      const dialog = page.locator('.mn-image-dialog[popover]');
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
});
