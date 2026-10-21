/**
 * Table column-resize tests (tables.md §8.6 — column sizing).
 *
 * Verifies the two-mode model end-to-end: autowidth by default, first-drag
 * materialization in one transaction, colgroup rendering after the caption,
 * toolbar commands (Distribute evenly / Auto widths), min-width stall,
 * legacy colgroup ingest, spanning-header grid counting + drag-seeding, the
 * clipboard round-trip via the `data-colwidths` serializer (synthetic
 * ClipboardEvent + DataTransfer — the true serialize/parse pipeline), and
 * drag hygiene (caret stability under handle pointer events).
 */
import { expect, test } from '@playwright/test';
import {
  openEditor,
  toolbarButton,
  getDoc,
  clickBodyParagraph,
  dispatchCopy,
  dispatchPasteHtml,
  selectAllInEditor,
} from './helpers.js';

/** Insert an r×c table via the grid picker; cursor lands in the caption. */
async function insertTable(page: import('@playwright/test').Page, rows: number, cols: number): Promise<void> {
  await toolbarButton(page, 'Table').click();
  const cell = page.locator(`[role="gridcell"][aria-rowindex="${rows}"][aria-colindex="${cols}"]`);
  await cell.click();
}

/** The first table's colgroup widget (present only in fixed-width mode). */
function colgroup(page: import('@playwright/test').Page) {
  return page.locator('table colgroup.mn-col-resize-colgroup');
}

/** The first table's handles widget children. */
function handles(page: import('@playwright/test').Page) {
  return page.locator('table .mn-col-resize-handle');
}

/** Read the first table's colwidths attr via the doc JSON hook. */
async function tableWidths(page: import('@playwright/test').Page): Promise<string[] | null> {
  const doc = (await getDoc(page)) as any;
  let widths: string[] | null = null;
  const walk = (node: any): void => {
    if (node.type === 'table' && widths === null) {
      widths = node.attrs?.colwidths ?? null;
    }
    for (const c of node.content ?? []) walk(c);
  };
  walk(doc);
  return widths;
}

/** Sum a percentage-string list. */
const sum = (ws: readonly string[]): number =>
  ws.reduce((a, s) => a + parseFloat(s), 0);

/**
 * Drag the k-th interior column edge by `dx` px using real mouse events.
 * The handles are positioned from laid-out geometry, so the drag targets
 * the actual on-screen edge.
 */
async function dragEdge(
  page: import('@playwright/test').Page,
  edgeIndex: number,
  dx: number,
): Promise<void> {
  const h = handles(page).nth(edgeIndex);
  // Wait until the handle is positioned by the plugin (a fresh widget mounts
  // unpositioned at the table's left edge; the plugin positions it after the
  // next frame) — dragging an unpositioned handle lands the wrong edge.
  await expect
    .poll(async () => {
      const box = await h.boundingBox();
      if (box === null) return null;
      const table = page.locator('table').first();
      const tbox = await table.boundingBox();
      // Positioned once its left is clearly inside the table box (> 10px in).
      return box !== null && tbox !== null && box.x - tbox.x > 10 ? box : null;
    }, { timeout: 5_000 })
    .toBeTruthy();
  const box = (await h.boundingBox()) as { x: number; y: number; width: number; height: number };
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 8 });
  await page.mouse.up();
}

// ---------------------------------------------------------------------------
// Mode model + drag materialization
// ---------------------------------------------------------------------------

test.describe('table column resizing', () => {
  test('new table is autowidth: no colgroup, auto layout, handles present', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);
    await insertTable(page, 3, 3);

    await expect(colgroup(page)).toHaveCount(0);
    await expect(handles(page)).toHaveCount(2); // interior edges of a 3-col grid
    const layout = await page.evaluate(() =>
      getComputedStyle(document.querySelector('table')!).tableLayout);
    expect(layout).toBe('auto');
    expect(await tableWidths(page)).toBeNull();
  });

  test('drag materializes fixed widths in one transaction; undo restores autowidth', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);
    await insertTable(page, 3, 3);

    // Land in a body cell first (caption → Enter).
    await page.locator('table > caption').click({ force: true });
    await page.keyboard.press('Enter');

    const before = await tableWidths(page);
    expect(before).toBeNull();

    await dragEdge(page, 0, 60);

    const after = await tableWidths(page);
    expect(after).not.toBeNull();
    expect(sum(after as string[])).toBeCloseTo(100, 2);
    // Neighbor-trades-1:1 — only columns 1 and 2 changed; column 3 untouched
    // (equal thirds before the drag: 33.33/33.33/33.34).
    expect(parseFloat((after as string[])[2])).toBeCloseTo(33.34, 1);

    // Colgroup rendered after the caption, style form, every column.
    await expect(colgroup(page)).toHaveCount(1);
    const cols = await colgroup(page).locator('col').evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).style.width));
    expect(cols).toHaveLength(3);
    expect(cols[0]).toContain('%');

    // ONE undo step restores autowidth (single-transaction commit).
    await page.keyboard.press('Control+z');
    expect(await tableWidths(page)).toBeNull();
    await expect(colgroup(page)).toHaveCount(0);
  });

  test('drag below the 3px threshold commits nothing', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);
    await insertTable(page, 2, 2);

    await dragEdge(page, 0, 1); // below DRAG_THRESHOLD_PX
    expect(await tableWidths(page)).toBeNull();
    await expect(colgroup(page)).toHaveCount(0);
  });

  test('toolbar: Distribute evenly materializes; Auto widths removes', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);
    await insertTable(page, 3, 3);
    await page.locator('table > caption').click({ force: true });
    await page.keyboard.press('Enter');

    // Distribute evenly on an autowidth table materializes equal widths.
    await toolbarButton(page, 'Distribute evenly').click();
    let w = await tableWidths(page);
    expect(w).toEqual(['33.33%', '33.33%', '33.34%']);
    await expect(colgroup(page)).toHaveCount(1);

    // Auto widths returns to autowidth; handles remain.
    await toolbarButton(page, 'Auto widths').click();
    expect(await tableWidths(page)).toBeNull();
    await expect(colgroup(page)).toHaveCount(0);
    await expect(handles(page)).toHaveCount(2);
  });

  test('min-width stall: a far drag never shrinks a column below ~40px', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);
    await insertTable(page, 3, 3);
    await page.locator('table > caption').click({ force: true });
    await page.keyboard.press('Enter');
    await toolbarButton(page, 'Distribute evenly').click();

    // Drag the first edge far left — the first column stalls at its floor.
    await dragEdge(page, 0, -400);

    const w = await tableWidths(page);
    expect(w).not.toBeNull();
    const tableBox = await page.locator('table').boundingBox();
    const minShare = tableBox ? (40 / tableBox.width) * 100 : 1;
    expect(parseFloat((w as string[])[0])).toBeGreaterThanOrEqual(minShare - 0.5);
    expect(parseFloat((w as string[])[1])).toBeGreaterThan(
      parseFloat((w as string[])[0]),
    );
    expect(sum(w as string[])).toBeCloseTo(100, 2);
  });
});

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

test.describe('colgroup ingest', () => {
  test('legacy <col width> HTML paste parses to the attr and re-renders in style form', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);

    const html =
      '<table><colgroup>' +
      '<col width="16.67%"><col width="16.67%"><col width="16.67%">' +
      '<col width="16.67%"><col width="16.67%"><col width="16.67%">' +
      '</colgroup><tbody><tr><td>a</td><td>b</td><td>c</td><td>d</td><td>e</td><td>f</td></tr></tbody></table>';
    await dispatchPasteHtml(page, html);

    const w = await tableWidths(page);
    expect(w).not.toBeNull();
    expect((w as string[])).toHaveLength(6);
    expect(sum(w as string[])).toBeCloseTo(100.02, 2); // tolerance keeps verbatim

    // Re-rendered colgroup uses the style form.
    await expect(colgroup(page).locator('col').first()).toHaveAttribute(
      'style', /width:\s*16\.67%/,
    );
  });
});

// ---------------------------------------------------------------------------
// Spanning headers
// ---------------------------------------------------------------------------

test.describe('spanning headers', () => {
  /** Load a table: head row [span2], body rows [1,1] ×2. */
  async function loadSpanningDoc(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate(() => {
      const mkCell = (colspan: number, text: string) => ({
        type: 'table_cell',
        attrs: { colspan, rowspan: 1, data: {} },
        content: [{ type: 'paragraph', attrs: { data: {} }, content: [{ type: 'text', text }] }],
      });
      (window).__mnLoadDoc?.({
        type: 'doc',
        content: [
          { type: 'bibdata', attrs: { item: null, data: {} } },
          { type: 'sections', content: [
            { type: 'clause', attrs: { id: '_c' }, content: [
              { type: 'section_title', content: [{ type: 'text', text: 'C' }] },
              { type: 'table', attrs: { id: '_t', number: null, data: {} }, content: [
                { type: 'table_name' },
                { type: 'table_head', content: [
                  { type: 'table_row', content: [mkCell(2, 'span')] },
                ] },
                { type: 'table_body', content: [
                  { type: 'table_row', content: [mkCell(1, 'a'), mkCell(1, 'b')] },
                  { type: 'table_row', content: [mkCell(1, 'c'), mkCell(1, 'd')] },
                ] },
              ] },
            ] },
          ] },
        ],
      });
    });
  }

  test('grid counted as 2 (not the head row cell count); drag-seeding measures body rows', async ({ page }) => {
    await openEditor(page);
    await loadSpanningDoc(page);

    // Handles: interior edges of a 2-col grid → exactly 1.
    await expect(handles(page)).toHaveCount(1);

    // Drag the interior edge — geometry must come from the BODY rows (the
    // spanning cell hides the edge).
    await dragEdge(page, 0, 40);

    const w = await tableWidths(page);
    expect(w).not.toBeNull();
    expect((w as string[])).toHaveLength(2);
    expect(sum(w as string[])).toBeCloseTo(100, 2);
    expect(parseFloat((w as string[])[0])).toBeGreaterThan(50);
    await expect(colgroup(page).locator('col')).toHaveCount(2);
  });
});

// ---------------------------------------------------------------------------
// Clipboard round-trip
// ---------------------------------------------------------------------------

test.describe('clipboard', () => {
  test('whole-table copy/paste round-trips colwidths via data-colwidths', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);
    await insertTable(page, 3, 3);
    await page.locator('table > caption').click({ force: true });
    await page.keyboard.press('Enter');
    await toolbarButton(page, 'Distribute evenly').click();
    // Let the toolbar focus dance and the React commit settle — an immediate
    // editor click can race the button blur/popover teardown.
    await page.waitForTimeout(250);

    // Copy: select the whole doc, dispatch synthetic copy, inspect the HTML.
    // The select+copy pair retries: immediately after the toolbar
    // interaction PM's focus bookkeeping can still be settling, and a first
    // attempt may serialize an empty slice — a fresh select heals it.
    let html = '';
    for (let attempt = 0; attempt < 3 && !html.includes('data-colwidths'); attempt++) {
      await page.locator('tbody td').first().click();
      await selectAllInEditor(page);
      html = await dispatchCopy(page);
    }
    expect(html).toContain('data-colwidths');
    expect(html).toContain('33.33');

    // Paste: place the caret in the body paragraph ABOVE the table (a
    // mid-table caret would paste into/around the table's cells), then
    // dispatch the synthetic paste. Retried for the same settle reason as
    // the copy — a stale PM selection can swallow the paste transaction.
    let tables: any[] = [];
    for (let attempt = 0; attempt < 3 && tables.length < 2; attempt++) {
      await page.locator('.mn-prosemirror .ProseMirror p').first().click({ force: true });
      await page.keyboard.press('End');
      await dispatchPasteHtml(page, html);
      const doc = (await getDoc(page)) as any;
      tables = [];
      const walk = (node: any): void => {
        if (node.type === 'table') tables.push(node);
        for (const c of node.content ?? []) walk(c);
      };
      walk(doc);
    }
    expect(tables.length).toBe(2);
    expect(tables[1].attrs.colwidths).toEqual(tables[0].attrs.colwidths);
  });

  test('row-level copy serializes rows without widths; paste leaves the resized table intact', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);
    await insertTable(page, 2, 2);
    await page.locator('table > caption').click({ force: true });
    await page.keyboard.press('Enter');
    await toolbarButton(page, 'Distribute evenly').click();
    await page.waitForTimeout(250); // toolbar focus dance → PM selection settle

    // Drag across the row's cells → a real row-level (Cell) selection.
    // Triple-click does NOT give one: on an empty cell it collapses to a
    // caret (copy serializes ""), and on a text-bearing cell it selects
    // only the cell's paragraph. This drag is the documented partial-copy
    // case (tables.md §8.6: rows serialize as top-level tr, widths drop).
    const cell1 = page.locator('tbody tr td').first();
    const cell2 = page.locator('tbody tr').first().locator('td').nth(1);
    const b1 = (await cell1.boundingBox()) as { x: number; y: number; width: number; height: number };
    const b2 = (await cell2.boundingBox()) as { x: number; y: number; width: number; height: number };
    await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
    await page.mouse.down();
    await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200); // PM selection observer settle

    // Copy, retried while the selection settles (see round-trip test).
    let html = '';
    for (let attempt = 0; attempt < 3 && !html.includes('<tr'); attempt++) {
      html = await dispatchCopy(page);
    }
    // Positive marker first — a dead "" serialization must fail loudly.
    expect(html).toContain('<tr');
    // The serialized fragment carries no table-level widths (by design).
    expect(html).not.toContain('data-colwidths');

    // Paste at a cell caret. Current product behavior: the row is NOT
    // re-materialized (Chromium swallows the fragment; Firefox drops only
    // the cell text in) — tables.md §8.6 guarantees only "no widths, no
    // crash"; row re-materialization is an open product question. What is
    // asserted is that guarantee: table intact, widths kept, one colgroup.
    await page.locator('tbody tr').last().locator('td').last().click();
    await page.keyboard.press('End');
    await dispatchPasteHtml(page, html);

    await expect(page.locator('table')).toHaveCount(1);
    const w = await tableWidths(page);
    expect(w).toEqual(['50.00%', '50.00%']);
    await expect(page.locator('table colgroup.mn-col-resize-colgroup')).toHaveCount(1);
  });
});

// ---------------------------------------------------------------------------
// Drag hygiene
// ---------------------------------------------------------------------------

test.describe('drag hygiene', () => {
  test('pointer events on a handle do not move the caret', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);
    await page.keyboard.type('caret probe');
    await insertTable(page, 2, 2);

    // Caret before the gesture.
    const before = await page.evaluate(() => {
      const sel = document.getSelection();
      return sel?.isCollapsed === true ? (sel?.anchorOffset ?? -1) : -99;
    });

    const h = handles(page).first();
    const box = await h.boundingBox();
    if (box === null) throw new Error('handle not laid out');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();

    const after = await page.evaluate(() => {
      const sel = document.getSelection();
      return sel?.isCollapsed === true ? (sel?.anchorOffset ?? -1) : -99;
    });
    expect(after).toBe(before);
  });
});
