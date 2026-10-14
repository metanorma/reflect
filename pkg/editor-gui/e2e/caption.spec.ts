/**
 * Caption rich-content tests (`figure_name` / `table_name`).
 *
 * Verifies that insertion seeds an empty caption and focuses it, that typing
 * fills it, that inline marks apply inside the caption (rich markup), that
 * Enter exits per the landing rules (first cell for tables; paragraph after
 * the image for figures), that Backspace on an empty caption unwinds per the
 * §4.4.9b guard, and — as a browser-locked regression — that both caption
 * serializations survive the HTML parser (§14.11 of schema.spec.md).
 */
import { expect, test } from '@playwright/test';
import { openEditor, toolbarButton, getDoc, clickBodyParagraph } from './helpers.js';

/** Load a doc with one figure ([figure_name, image]) and one 1x1 table
 * ([table_name, body]) in the clause body, for caret-driven tests. */
async function loadCaptionDoc(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    (window).__mnLoadDoc?.({
      type: 'doc',
      content: [
        { type: 'bibdata', attrs: { item: null, data: {} } },
        { type: 'sections', content: [
          { type: 'clause', attrs: { id: '_c' }, content: [
            { type: 'section_title', content: [{ type: 'text', text: 'C' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'body' }] },
          ] },
        ] },
      ],
    });
  });
}

test.describe('table captions', () => {
  test('insertTable seeds a caption; typing fills it; bold applies (rich markup); Enter lands in first cell', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);
    await page.keyboard.type('before ');

    // Insert a 1x1 table via the grid picker.
    await toolbarButton(page, 'Table').click();
    const cell = page.locator('[role="gridcell"][aria-rowindex="1"][aria-colindex="1"]');
    await cell.click();

    // The cursor must be in the seeded table_name — type the caption.
    await page.keyboard.type('Table One');

    // Rich markup proof: select ONLY the caption text and bold it. Clicking
    // into the caption element first (then Home / Shift+End) keeps the
    // selection inside the caption textblock — Shift+Home from the caret
    // would run back across the block boundary into the preceding
    // paragraph's text on the same visual line.
    const cap = page.locator('table > caption.mn-table-name');
    await cap.click({ force: true });
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await toolbarButton(page, 'Bold').click();

    const doc = (await getDoc(page)) as any;
    const walk = (node: any, found: { caption?: any; bold: boolean; cellText?: string }) => {
      if (node.type === 'table_name') {
        found.caption = node;
        found.bold = (node.content ?? []).some((t: any) =>
          t.marks?.some((m: any) => m.type === 'strong'));
      }
      if (node.type === 'table_cell') {
        found.cellText = (node.content ?? []).map((c: any) =>
          (c.content ?? []).map((t: any) => t.text ?? '').join('')).join('');
      }
      for (const c of node.content ?? []) walk(c, found);
      return found;
    };
    const found = walk(doc, { bold: false });
    expect(found.caption).toBeDefined();
    expect(found.bold).toBe(true);
    // Cell content so far: the probe-free seeded paragraph, still empty.
    expect(found.cellText ?? '').toBe('');

    // Enter inside the caption descends into the first cell. The Bold click
    // left focus on the toolbar button — click back into the caption first
    // (keyboard.press targets the focused element; Enter on the button would
    // re-toggle Bold instead).
    await cap.click({ force: true });
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('cell');
    const doc2 = (await getDoc(page)) as any;
    const found2 = walk(doc2, { bold: false });
    expect(found2.cellText).toBe('cell');
    // Still exactly one caption (Enter did not split it).
    const captions = JSON.stringify(doc2).match(/"table_name"/g) ?? [];
    expect(captions).toHaveLength(1);
  });

  test('Backspace on empty table caption deletes the caption, not the table', async ({ page }) => {
    await openEditor(page);
    await loadCaptionDoc(page);
    await clickBodyParagraph(page);

    // Insert a table — cursor lands in the seeded (empty) caption.
    await toolbarButton(page, 'Table').click();
    await page.locator('[role="gridcell"][aria-rowindex="1"][aria-colindex="1"]').click();

    // Backspace on the empty caption → caption deleted, table intact.
    await page.keyboard.press('Backspace');
    const docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"table"');
    expect(docStr).not.toContain('"table_name"');
  });
});

test.describe('figure captions', () => {
  test('insertImage seeds a caption; Enter with only the image following inserts a paragraph after it', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);
    await page.keyboard.type('intro ');

    await toolbarButton(page, 'Image').click();
    const dialog = page.locator('.mn-image-dialog[popover]');
    await dialog.locator('#mn-img-src').fill('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>');
    await dialog.locator('#mn-img-alt').fill('alt');
    await dialog.getByRole('button', { name: 'Insert' }).click();
    await expect(dialog).toBeHidden();

    // Cursor in the seeded figure_name — type the caption.
    await page.keyboard.type('Fig caption');

    // Enter: no textblock-bearing sibling inside the figure (image is next) →
    // paragraph inserted after the image, cursor inside it.
    await page.keyboard.press('Enter');
    await page.keyboard.type('in figure');

    const doc = (await getDoc(page)) as any;
    let figure: any = null;
    const find = (node: any) => {
      if (node.type === 'figure') { figure = node; return; }
      for (const c of node.content ?? []) find(c);
    };
    find(doc);
    expect(figure).not.toBeNull();
    expect(figure.content.map((c: any) => c.type)).toEqual(['figure_name', 'image', 'paragraph']);
    const paraText = (figure.content[2].content ?? []).map((t: any) => t.text ?? '').join('');
    expect(paraText).toBe('in figure');
    const capText = (figure.content[0].content ?? []).map((t: any) => t.text ?? '').join('');
    expect(capText).toBe('Fig caption');
  });

  test('Backspace on empty figure caption (image present) deletes only the caption', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);

    await toolbarButton(page, 'Image').click();
    const dialog = page.locator('.mn-image-dialog[popover]');
    await dialog.locator('#mn-img-src').fill('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>');
    await dialog.getByRole('button', { name: 'Insert' }).click();
    await expect(dialog).toBeHidden();

    // Cursor sits in the seeded empty caption; Backspace deletes caption only.
    await page.keyboard.press('Backspace');
    const doc = (await getDoc(page)) as any;
    let figure: any = null;
    const find = (node: any) => {
      if (node.type === 'figure') { figure = node; return; }
      for (const c of node.content ?? []) find(c);
    };
    find(doc);
    expect(figure).not.toBeNull();
    expect(figure.content.map((c: any) => c.type)).toEqual(['image']);
  });
});

test.describe('caption serialization survives the HTML parser (§14.11)', () => {
  test('figcaption survives inside figure; caption stays table first child; nothing foster-parented', async ({ page }) => {
    await openEditor(page);
    // Build the exact serialization the schema emits for both captioned
    // parents and re-parse it through the browser's HTML parser.
    const result = await page.evaluate(() => {
      const html =
        '<div class="mn-doc">' +
        '<figure class="mn-figure"><figcaption class="mn-figure-name">Fig cap</figcaption>' +
        '<img src="x.png"></figure>' +
        '<table><caption class="mn-table-name">Table cap</caption>' +
        '<tbody><tr><td><p>cell</p></td></tr></tbody></table>' +
        '</div>';
      // DOMParser path.
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const figFigcaption = parsed.querySelector('figure > figcaption.mn-figure-name');
      const tableCaption = parsed.querySelector('table > caption.mn-table-name');
      const tableFirst = parsed.querySelector('table')?.firstElementChild;
      const beforeTable = parsed.querySelector('table')?.previousElementSibling;
      // innerHTML path (the clipboard path).
      const host = document.createElement('div');
      host.innerHTML = html;
      const ihFig = host.querySelector('figure > figcaption.mn-figure-name');
      const ihCap = host.querySelector('table > caption.mn-table-name');
      const ihFirst = host.querySelector('table')?.firstElementChild;
      const ihPrev = host.querySelector('table')?.previousElementSibling;
      return {
        domparser: {
          figcaptionInFigure: figFigcaption !== null,
          figcaptionText: figFigcaption?.textContent ?? null,
          captionInTable: tableCaption !== null,
          captionText: tableCaption?.textContent ?? null,
          tableFirstChild: tableFirst?.tagName ?? null,
          elementBeforeTable: beforeTable?.tagName ?? null,
          beforeTableIsCaptionLike: beforeTable !== null
            && (beforeTable.tagName === 'FIGCAPTION' || beforeTable.tagName === 'CAPTION'
              || beforeTable.tagName === 'DIV'),
        },
        innerHTML: {
          figcaptionInFigure: ihFig !== null,
          captionInTable: ihCap !== null,
          tableFirstChild: ihFirst?.tagName ?? null,
          beforeTableIsCaptionLike: ihPrev !== null
            && (ihPrev.tagName === 'FIGCAPTION' || ihPrev.tagName === 'CAPTION'
              || ihPrev.tagName === 'DIV'),
        },
      };
    });

    // DOMParser path: both captions survive in their parents, nothing
    // foster-parented before the table.
    expect(result.domparser.figcaptionInFigure).toBe(true);
    expect(result.domparser.figcaptionText).toBe('Fig cap');
    expect(result.domparser.captionInTable).toBe(true);
    expect(result.domparser.captionText).toBe('Table cap');
    expect(result.domparser.tableFirstChild).toBe('CAPTION');
    expect(result.domparser.beforeTableIsCaptionLike).toBe(false);

    // innerHTML path (clipboard): same facts.
    expect(result.innerHTML.figcaptionInFigure).toBe(true);
    expect(result.innerHTML.captionInTable).toBe(true);
    expect(result.innerHTML.tableFirstChild).toBe('CAPTION');
    expect(result.innerHTML.beforeTableIsCaptionLike).toBe(false);
  });
});
