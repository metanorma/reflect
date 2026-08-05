# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: popovers.spec.ts >> popovers >> TableSizePicker >> grid hover updates the readout; clicking a cell inserts a table
- Location: e2e/popovers.spec.ts:24:5

# Error details

```
TimeoutError: locator.hover: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('[role="gridcell"][aria-rowindex="2"][aria-colindex="3"]')
    - locator resolved to <div tabindex="-1" role="gridcell" aria-rowindex="2" aria-colindex="3" aria-selected="false" class="mn-toolbar-gridcell" aria-label="row 2 column 3"></div>
  - attempting hover action
    2 × waiting for element to be visible and stable
      - element is visible and stable
      - scrolling into view if needed
      - done scrolling
      - element is outside of the viewport
    - retrying hover action
    - waiting 20ms
    2 × waiting for element to be visible and stable
      - element is visible and stable
      - scrolling into view if needed
      - done scrolling
      - element is outside of the viewport
    - retrying hover action
      - waiting 100ms
    19 × waiting for element to be visible and stable
       - element is visible and stable
       - scrolling into view if needed
       - done scrolling
       - element is outside of the viewport
     - retrying hover action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e6]:
    - textbox "Section heading" [ref=e8]
    - paragraph [ref=e10]: before
  - toolbar "Formatting" [ref=e11]:
    - generic "Inline formatting" [ref=e12]:
      - button "Bold" [ref=e13] [cursor=pointer]
      - button "Italic" [ref=e14] [cursor=pointer]
      - button "Underline" [ref=e15] [cursor=pointer]
      - button "Strikethrough" [ref=e16] [cursor=pointer]
      - button "Sub" [ref=e17] [cursor=pointer]
      - button "Super" [ref=e18] [cursor=pointer]
      - button "Code" [ref=e19] [cursor=pointer]
      - button "Smallcaps" [ref=e20] [cursor=pointer]
    - generic "Block wrapping" [ref=e22]:
      - button "Quote" [ref=e23] [cursor=pointer]
      - button "Note" [ref=e24] [cursor=pointer]
      - button "Example" [ref=e25] [cursor=pointer]
    - generic "Lists" [ref=e27]:
      - button "Bullets" [ref=e28] [cursor=pointer]
      - button "Numbers" [ref=e29] [cursor=pointer]
    - generic "Hyperlink" [ref=e31]:
      - button "Link" [disabled] [ref=e32]
    - generic "Outdent" [ref=e34]:
      - button "Outdent" [ref=e35] [cursor=pointer]
    - generic "References" [ref=e37]:
      - button "Xref" [ref=e38] [cursor=pointer]
      - button "Eref" [ref=e39] [cursor=pointer]
      - button "Concept" [ref=e40] [cursor=pointer]
      - button "Bcp14" [ref=e41] [cursor=pointer]
      - button "Footnote" [ref=e43] [cursor=pointer]
      - button "Formula" [ref=e44] [cursor=pointer]
    - generic "Section structure" [ref=e46]:
      - button "Clause" [ref=e47] [cursor=pointer]
      - button "Promote" [disabled] [ref=e48]
      - button "Demote" [disabled] [ref=e49]
      - button "Type" [ref=e50] [cursor=pointer]
    - generic "Definition lists" [ref=e52]:
      - button "Def list" [disabled] [ref=e53]
      - button "+ Term" [disabled] [ref=e54]
    - generic "Tables" [ref=e56]:
      - generic [ref=e57]:
        - button "Table" [expanded] [active] [ref=e58] [cursor=pointer]
        - dialog "Table size" [ref=e59]:
          - grid [ref=e60]:
            - gridcell "row 1 column 1" [selected] [ref=e61] [cursor=pointer]
            - gridcell "row 1 column 2" [ref=e62] [cursor=pointer]
            - gridcell "row 1 column 3" [ref=e63] [cursor=pointer]
            - gridcell "row 1 column 4" [ref=e64] [cursor=pointer]
            - gridcell "row 1 column 5" [ref=e65] [cursor=pointer]
            - gridcell "row 1 column 6" [ref=e66] [cursor=pointer]
            - gridcell "row 1 column 7" [ref=e67] [cursor=pointer]
            - gridcell "row 1 column 8" [ref=e68] [cursor=pointer]
            - gridcell "row 1 column 9" [ref=e69] [cursor=pointer]
            - gridcell "row 1 column 10" [ref=e70] [cursor=pointer]
            - gridcell "row 2 column 1" [ref=e71] [cursor=pointer]
            - gridcell "row 2 column 2" [ref=e72] [cursor=pointer]
            - gridcell "row 2 column 3" [ref=e73] [cursor=pointer]
            - gridcell "row 2 column 4" [ref=e74] [cursor=pointer]
            - gridcell "row 2 column 5" [ref=e75] [cursor=pointer]
            - gridcell "row 2 column 6" [ref=e76] [cursor=pointer]
            - gridcell "row 2 column 7" [ref=e77] [cursor=pointer]
            - gridcell "row 2 column 8" [ref=e78] [cursor=pointer]
            - gridcell "row 2 column 9" [ref=e79] [cursor=pointer]
            - gridcell "row 2 column 10" [ref=e80] [cursor=pointer]
            - gridcell "row 3 column 1" [ref=e81] [cursor=pointer]
            - gridcell "row 3 column 2" [ref=e82] [cursor=pointer]
            - gridcell "row 3 column 3" [ref=e83] [cursor=pointer]
            - gridcell "row 3 column 4" [ref=e84] [cursor=pointer]
            - gridcell "row 3 column 5" [ref=e85] [cursor=pointer]
            - gridcell "row 3 column 6" [ref=e86] [cursor=pointer]
            - gridcell "row 3 column 7" [ref=e87] [cursor=pointer]
            - gridcell "row 3 column 8" [ref=e88] [cursor=pointer]
            - gridcell "row 3 column 9" [ref=e89] [cursor=pointer]
            - gridcell "row 3 column 10" [ref=e90] [cursor=pointer]
            - gridcell "row 4 column 1" [ref=e91] [cursor=pointer]
            - gridcell "row 4 column 2" [ref=e92] [cursor=pointer]
            - gridcell "row 4 column 3" [ref=e93] [cursor=pointer]
            - gridcell "row 4 column 4" [ref=e94] [cursor=pointer]
            - gridcell "row 4 column 5" [ref=e95] [cursor=pointer]
            - gridcell "row 4 column 6" [ref=e96] [cursor=pointer]
            - gridcell "row 4 column 7" [ref=e97] [cursor=pointer]
            - gridcell "row 4 column 8" [ref=e98] [cursor=pointer]
            - gridcell "row 4 column 9" [ref=e99] [cursor=pointer]
            - gridcell "row 4 column 10" [ref=e100] [cursor=pointer]
            - gridcell "row 5 column 1" [ref=e101] [cursor=pointer]
            - gridcell "row 5 column 2" [ref=e102] [cursor=pointer]
            - gridcell "row 5 column 3" [ref=e103] [cursor=pointer]
            - gridcell "row 5 column 4" [ref=e104] [cursor=pointer]
            - gridcell "row 5 column 5" [ref=e105] [cursor=pointer]
            - gridcell "row 5 column 6" [ref=e106] [cursor=pointer]
            - gridcell "row 5 column 7" [ref=e107] [cursor=pointer]
            - gridcell "row 5 column 8" [ref=e108] [cursor=pointer]
            - gridcell "row 5 column 9" [ref=e109] [cursor=pointer]
            - gridcell "row 5 column 10" [ref=e110] [cursor=pointer]
            - gridcell "row 6 column 1" [ref=e111] [cursor=pointer]
            - gridcell "row 6 column 2" [ref=e112] [cursor=pointer]
            - gridcell "row 6 column 3" [ref=e113] [cursor=pointer]
            - gridcell "row 6 column 4" [ref=e114] [cursor=pointer]
            - gridcell "row 6 column 5" [ref=e115] [cursor=pointer]
            - gridcell "row 6 column 6" [ref=e116] [cursor=pointer]
            - gridcell "row 6 column 7" [ref=e117] [cursor=pointer]
            - gridcell "row 6 column 8" [ref=e118] [cursor=pointer]
            - gridcell "row 6 column 9" [ref=e119] [cursor=pointer]
            - gridcell "row 6 column 10" [ref=e120] [cursor=pointer]
            - gridcell "row 7 column 1" [ref=e121] [cursor=pointer]
            - gridcell "row 7 column 2" [ref=e122] [cursor=pointer]
            - gridcell "row 7 column 3" [ref=e123] [cursor=pointer]
            - gridcell "row 7 column 4" [ref=e124] [cursor=pointer]
            - gridcell "row 7 column 5" [ref=e125] [cursor=pointer]
            - gridcell "row 7 column 6" [ref=e126] [cursor=pointer]
            - gridcell "row 7 column 7" [ref=e127] [cursor=pointer]
            - gridcell "row 7 column 8" [ref=e128] [cursor=pointer]
            - gridcell "row 7 column 9" [ref=e129] [cursor=pointer]
            - gridcell "row 7 column 10" [ref=e130] [cursor=pointer]
            - gridcell "row 8 column 1" [ref=e131] [cursor=pointer]
            - gridcell "row 8 column 2" [ref=e132] [cursor=pointer]
            - gridcell "row 8 column 3" [ref=e133] [cursor=pointer]
            - gridcell "row 8 column 4" [ref=e134] [cursor=pointer]
            - gridcell "row 8 column 5" [ref=e135] [cursor=pointer]
            - gridcell "row 8 column 6" [ref=e136] [cursor=pointer]
            - gridcell "row 8 column 7" [ref=e137] [cursor=pointer]
            - gridcell "row 8 column 8" [ref=e138] [cursor=pointer]
            - gridcell "row 8 column 9" [ref=e139] [cursor=pointer]
            - gridcell "row 8 column 10" [ref=e140] [cursor=pointer]
            - gridcell "row 9 column 1" [ref=e141] [cursor=pointer]
            - gridcell "row 9 column 2" [ref=e142] [cursor=pointer]
            - gridcell "row 9 column 3" [ref=e143] [cursor=pointer]
            - gridcell "row 9 column 4" [ref=e144] [cursor=pointer]
            - gridcell "row 9 column 5" [ref=e145] [cursor=pointer]
            - gridcell "row 9 column 6" [ref=e146] [cursor=pointer]
            - gridcell "row 9 column 7" [ref=e147] [cursor=pointer]
            - gridcell "row 9 column 8" [ref=e148] [cursor=pointer]
            - gridcell "row 9 column 9" [ref=e149] [cursor=pointer]
            - gridcell "row 9 column 10" [ref=e150] [cursor=pointer]
            - gridcell "row 10 column 1" [ref=e151] [cursor=pointer]
            - gridcell "row 10 column 2" [ref=e152] [cursor=pointer]
            - gridcell "row 10 column 3" [ref=e153] [cursor=pointer]
            - gridcell "row 10 column 4" [ref=e154] [cursor=pointer]
            - gridcell "row 10 column 5" [ref=e155] [cursor=pointer]
            - gridcell "row 10 column 6" [ref=e156] [cursor=pointer]
            - gridcell "row 10 column 7" [ref=e157] [cursor=pointer]
            - gridcell "row 10 column 8" [ref=e158] [cursor=pointer]
            - gridcell "row 10 column 9" [ref=e159] [cursor=pointer]
            - gridcell "row 10 column 10" [ref=e160] [cursor=pointer]
          - generic [ref=e161]: 1 × 1
    - generic "Images" [ref=e163]:
      - button "Image" [ref=e165] [cursor=pointer]
    - generic "Undo / redo" [ref=e167]:
      - button "Undo" [ref=e168] [cursor=pointer]
      - button "Redo" [disabled] [ref=e169]
```

# Test source

```ts
  1   | /**
  2   |  * Popover / dialog occlusion regression tests.
  3   |  *
  4   |  * This is the spec class that catches the "appears behind the editor" bug.
  5   |  * For each dialog the test performs a REAL interaction inside it (click a
  6   |  * button, fill a field). Playwright's click actionability hit-testing fails
  7   |  * loudly ("other element would receive the click") if the editor intercepts
  8   |  * the click because the dialog is obscured.
  9   |  *
  10  |  * Do NOT rely on `toBeVisible()` alone for occlusion — it checks the element's
  11  |  * own geometry, not whether it's covered, and passes when the editor is on
  12  |  * top. The `click()` on an inner control IS the occlusion assertion.
  13  |  */
  14  | import { expect, test } from '@playwright/test';
  15  | import { getDoc, openEditor, toolbarButton, typeInEditor, editor } from './helpers.js';
  16  | 
  17  | test.describe('popovers', () => {
  18  | 
  19  |   // -------------------------------------------------------------------------
  20  |   // TableSizePicker — plain `role="dialog"` div (NOT top-layer). Vulnerable
  21  |   // to occlusion by CSS positioning/stacking.
  22  |   // -------------------------------------------------------------------------
  23  |   test.describe('TableSizePicker', () => {
  24  |     test('grid hover updates the readout; clicking a cell inserts a table', async ({ page }) => {
  25  |       await openEditor(page);
  26  |       await typeInEditor(page, 'before ');
  27  | 
  28  |       // Open the picker.
  29  |       await toolbarButton(page, 'Table').click();
  30  |       const dialog = page.getByRole('dialog', { name: 'Table size' });
  31  |       await expect(dialog).toBeVisible();
  32  | 
  33  |       // Hover a grid cell at row 2, col 3 — the readout should update.
  34  |       const cell = page.locator('[role="gridcell"][aria-rowindex="2"][aria-colindex="3"]');
> 35  |       await cell.hover();
      |                  ^ TimeoutError: locator.hover: Timeout 10000ms exceeded.
  36  |       await expect(dialog).toContainText('2 × 3');
  37  | 
  38  |       // Click the cell — this is the occlusion assertion. If the editor
  39  |       // intercepts the click (dialog behind it), Playwright throws.
  40  |       await cell.click();
  41  |       await expect(dialog).toHaveCount(0);
  42  | 
  43  |       // The doc JSON should now contain a table with 2 rows × 3 cols.
  44  |       const doc = await getDoc(page);
  45  |       const docStr = JSON.stringify(doc);
  46  |       expect(docStr).toContain('"table"');
  47  |       const rowCount = (docStr.match(/"table_row"/g) ?? []).length;
  48  |       expect(rowCount).toBe(2);
  49  |     });
  50  |   });
  51  | 
  52  |   // -------------------------------------------------------------------------
  53  |   // FootnotePicker — `popover="manual"` (HTML Popover API, top-layer). Lower
  54  |   // occlusion risk, but tested for completeness: the top-layer guarantee only
  55  |   // holds in browsers that implement the Popover API.
  56  |   // -------------------------------------------------------------------------
  57  |   test.describe('FootnotePicker', () => {
  58  |     test('first click creates a marker; second click opens picker; "Create new" inserts another', async ({ page }) => {
  59  |       await openEditor(page);
  60  |       await typeInEditor(page, 'footnoted');
  61  | 
  62  |       // First click: no entries exist → creates immediately without a dialog.
  63  |       await toolbarButton(page, 'Footnote').click();
  64  |       let doc = await getDoc(page);
  65  |       expect(JSON.stringify(doc)).toContain('"footnote_marker"');
  66  | 
  67  |       // Move cursor to end and type more text for the second marker.
  68  |       await editor(page).click();
  69  |       await page.keyboard.type(' more');
  70  | 
  71  |       // Second click: entry now exists → picker opens.
  72  |       await toolbarButton(page, 'Footnote').click();
  73  |       const picker = page.locator('.mn-footnote-picker[popover]');
  74  |       await expect(picker).toBeVisible();
  75  | 
  76  |       // Click "+ Create new" inside the picker — occlusion assertion.
  77  |       await picker.getByRole('button', { name: /Create new/ }).click();
  78  |       await expect(picker).toHaveCount(0);
  79  | 
  80  |       // Two markers now in the doc.
  81  |       doc = await getDoc(page);
  82  |       const docStr = JSON.stringify(doc);
  83  |       const markerCount = (docStr.match(/"footnote_marker"/g) ?? []).length;
  84  |       expect(markerCount).toBe(2);
  85  |     });
  86  |   });
  87  | 
  88  |   // -------------------------------------------------------------------------
  89  |   // ImageInsertDialog — plain `role="dialog"` div (NOT top-layer). Vulnerable
  90  |   // to occlusion.
  91  |   // -------------------------------------------------------------------------
  92  |   test.describe('ImageInsertDialog', () => {
  93  |     test('URL + alt text flow inserts a figure with an image', async ({ page }) => {
  94  |       await openEditor(page);
  95  |       await typeInEditor(page, 'intro ');
  96  | 
  97  |       // Open the dialog.
  98  |       await toolbarButton(page, 'Image').click();
  99  |       const dialog = page.getByRole('dialog', { name: 'Insert image' });
  100 |       await expect(dialog).toBeVisible();
  101 | 
  102 |       // Fill the URL and alt fields — these clicks/types are occlusion
  103 |       // assertions: if the editor is on top, the inputs won't receive them.
  104 |       const src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
  105 |       await dialog.locator('#mn-img-src').fill(src);
  106 |       await dialog.locator('#mn-img-alt').fill('test alt');
  107 | 
  108 |       // Click Insert — final occlusion assertion.
  109 |       await dialog.getByRole('button', { name: 'Insert' }).click();
  110 |       await expect(dialog).toHaveCount(0);
  111 | 
  112 |       // The doc JSON should contain a figure > image with the src and alt.
  113 |       const doc = await getDoc(page);
  114 |       const docStr = JSON.stringify(doc);
  115 |       expect(docStr).toContain('"figure"');
  116 |       expect(docStr).toContain('"image"');
  117 |       expect(docStr).toContain('test alt');
  118 |     });
  119 |   });
  120 | });
  121 | 
```