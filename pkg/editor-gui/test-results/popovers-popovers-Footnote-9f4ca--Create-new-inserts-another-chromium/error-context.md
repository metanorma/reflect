# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: popovers.spec.ts >> popovers >> FootnotePicker >> first click creates a marker; second click opens picker; "Create new" inserts another
- Location: e2e/popovers.spec.ts:58:5

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('.mn-footnote-picker[popover]')
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for locator('.mn-footnote-picker[popover]')
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [active] [ref=e4]:
    - generic [ref=e6]:
      - textbox "Section heading" [ref=e8]
      - paragraph [ref=e10]:
        - text: footnoted
        - superscript [ref=e11] [cursor=pointer]: "1"
    - generic [ref=e12]:
      - generic [ref=e13]:
        - generic [ref=e14]: "[1]"
        - paragraph [ref=e16]:
          - text: more
          - superscript [ref=e17] [cursor=pointer]: "2"
      - generic [ref=e18]:
        - generic [ref=e19]: "[2]"
        - paragraph [ref=e21]: Footnote text.
  - toolbar "Formatting" [ref=e22]:
    - generic "Inline formatting" [ref=e23]:
      - button "Bold" [ref=e24] [cursor=pointer]
      - button "Italic" [ref=e25] [cursor=pointer]
      - button "Underline" [ref=e26] [cursor=pointer]
      - button "Strikethrough" [ref=e27] [cursor=pointer]
      - button "Sub" [ref=e28] [cursor=pointer]
      - button "Super" [ref=e29] [cursor=pointer]
      - button "Code" [ref=e30] [cursor=pointer]
      - button "Smallcaps" [ref=e31] [cursor=pointer]
    - generic "Block wrapping" [ref=e33]:
      - button "Quote" [ref=e34] [cursor=pointer]
      - button "Note" [ref=e35] [cursor=pointer]
      - button "Example" [ref=e36] [cursor=pointer]
    - generic "Lists" [ref=e38]:
      - button "Bullets" [ref=e39] [cursor=pointer]
      - button "Numbers" [ref=e40] [cursor=pointer]
    - generic "Hyperlink" [ref=e42]:
      - button "Link" [ref=e43] [cursor=pointer]
    - generic "Outdent" [ref=e45]:
      - button "Outdent" [disabled] [ref=e46]
    - generic "References" [ref=e48]:
      - button "Xref" [ref=e49] [cursor=pointer]
      - button "Eref" [ref=e50] [cursor=pointer]
      - button "Concept" [ref=e51] [cursor=pointer]
      - button "Bcp14" [ref=e52] [cursor=pointer]
      - button "Footnote" [ref=e54] [cursor=pointer]
      - button "Formula" [ref=e55] [cursor=pointer]
    - generic "Section structure" [ref=e57]:
      - button "Clause" [disabled] [ref=e58]
      - button "Promote" [disabled] [ref=e59]
      - button "Demote" [disabled] [ref=e60]
      - button "Type" [disabled] [ref=e61]
    - generic "Definition lists" [ref=e63]:
      - button "Def list" [disabled] [ref=e64]
      - button "+ Term" [disabled] [ref=e65]
    - generic "Tables" [ref=e67]:
      - button "Table" [ref=e69] [cursor=pointer]
    - generic "Images" [ref=e71]:
      - button "Image" [ref=e73] [cursor=pointer]
    - generic "Undo / redo" [ref=e75]:
      - button "Undo" [ref=e76] [cursor=pointer]
      - button "Redo" [disabled] [ref=e77]
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
  35  |       await cell.hover();
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
> 78  |       await expect(picker).toHaveCount(0);
      |                            ^ Error: expect(locator).toHaveCount(expected) failed
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