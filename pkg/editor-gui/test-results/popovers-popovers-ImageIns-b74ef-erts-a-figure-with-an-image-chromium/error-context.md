# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: popovers.spec.ts >> popovers >> ImageInsertDialog >> URL + alt text flow inserts a figure with an image
- Location: e2e/popovers.spec.ts:93:5

# Error details

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for getByRole('dialog', { name: 'Insert image' }).getByRole('button', { name: 'Insert' })
    - locator resolved to <button type="button">Insert</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div translate="no" class="ProseMirror" contenteditable="true">…</div> intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div translate="no" class="ProseMirror" contenteditable="true">…</div> intercepts pointer events
    - retrying click action
      - waiting 100ms
    19 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div translate="no" class="ProseMirror" contenteditable="true">…</div> intercepts pointer events
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e6]:
    - textbox "Section heading" [ref=e8]
    - paragraph [ref=e10]: intro
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
      - button "Table" [ref=e58] [cursor=pointer]
    - generic "Images" [ref=e60]:
      - generic [ref=e61]:
        - button "Image" [expanded] [ref=e62] [cursor=pointer]
        - dialog "Insert image" [ref=e63]:
          - generic [ref=e64]:
            - generic [ref=e65]: Image URL
            - textbox "Image URL" [ref=e66]: data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>
          - generic [ref=e67]:
            - generic [ref=e68]: Image file
            - button "Image file" [ref=e69]
          - generic [ref=e70]:
            - generic [ref=e71]: Alternative text
            - textbox "Alternative text" [active] [ref=e72]: test alt
          - generic [ref=e73]:
            - button "Cancel" [ref=e74]
            - button "Insert" [ref=e75]
    - generic "Undo / redo" [ref=e77]:
      - button "Undo" [ref=e78] [cursor=pointer]
      - button "Redo" [disabled] [ref=e79]
```

# Test source

```ts
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
> 109 |       await dialog.getByRole('button', { name: 'Insert' }).click();
      |                                                            ^ TimeoutError: locator.click: Timeout 10000ms exceeded.
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