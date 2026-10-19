/**
 * Plugin rendering smoke tests — what the editor's DOM-rendering plugins
 * draw, independent of interaction.
 *
 * Scope contract: this spec asserts plugin *rendering* only (widgets,
 * decorations, node views appear where and how the plugin intends).
 * Feature specs own interaction semantics — e.g. `table-resize.spec.ts`
 * owns drag gestures and clipboard round-trips. The overlap is deliberate:
 * the smoke re-covers rendering at the plugin level so that a plugin
 * WITHOUT a feature spec is still render-verified.
 *
 * Process rule (CONTRIBUTING.rst, Verification): a change that adds or
 * modifies a DOM-rendering plugin wires it into the GUI app and extends
 * this spec in the same change — rendering verification is not deferred to
 * interaction-level e2e. The table-resize work shipped three
 * renderer-integration bugs that all would have been caught here.
 *
 * ## Load-bearing integration facts (each verified against installed
 * ## source at the time of the table-resize work — re-verify on renderer
 * ## upgrades):
 *
 * 1. `@handlewithcare/react-prosemirror` draws plugin decorations ONLY
 *    through a `props.decorations` hook (verified: `viewDecorations.js` —
 *    `view.someProp("decorations", ...)`). A `DecorationSet` held in
 *    plugin state alone renders NOTHING; the plugin must expose a prop
 *    reading its own key state (the prosemirror-tables pattern).
 *
 * 2. The renderer wraps every native widget decoration in a `<span>`
 *    (verified: `NativeWidgetView.js` — `createElement("span",
 *    {ref: rootDomRef})`). A widget is therefore NEVER a direct child of
 *    its parent element: `table > colgroup` CSS/DOM queries match nothing.
 *    Use descendant selectors; the wrapper is made layout-transparent by
 *    CSS `display: contents` (document.css).
 *
 * 3. React commits widget DOM asynchronously relative to ProseMirror
 *    plugin-view `update()` hooks. A widget whose factory re-runs (e.g. a
 *    mode flip rebuilding the colgroup) lands in the DOM only after the
 *    next frame — positioning passes must also run post-frame, and tests
 *    must poll for geometry rather than assert immediately after the
 *    transaction.
 */
import { expect, test } from '@playwright/test';
import { openEditor } from './helpers.js';

/** Load a doc with a single table of the given shape into the editor. */
async function loadTableDoc(
  page: import('@playwright/test').Page,
  opts: {
    colwidths?: string[] | null;
    head?: { colspan: number }[];
    body: { colspan: number }[][];
  },
): Promise<void> {
  await page.evaluate((o) => {
    const mkRow = (cells: { colspan: number }[]) => ({
      type: 'table_row',
      content: cells.map((c) => ({
        type: 'table_cell',
        attrs: { colspan: c.colspan, rowspan: 1, data: {} },
        content: [{ type: 'paragraph', attrs: { data: {} }, content: [{ type: 'text', text: 'c' }] }],
      })),
    });
    const content: any[] = [];
    if (o.head) {
      content.push({ type: 'table_head', content: [mkRow(o.head)] });
    }
    content.push({ type: 'table_body', content: o.body.map((r: any) => mkRow(r)) });
    (window).__mnLoadDoc?.({
      type: 'doc',
      content: [
        { type: 'bibdata', attrs: { item: null, data: {} } },
        { type: 'sections', content: [
          { type: 'clause', attrs: { id: '_c' }, content: [
            { type: 'section_title', content: [{ type: 'text', text: 'C' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'p' }] },
            { type: 'table', attrs: { id: '_t', number: null, colwidths: o.colwidths ?? null, data: {} }, content: [
              { type: 'table_name' },
              ...content,
            ] },
          ] },
        ] },
      ],
    });
  }, opts);
}

test.describe('tableColumnResizePlugin rendering', () => {
  test('fixed-width table: colgroup after caption, one col per grid column, fixed layout', async ({ page }) => {
    await openEditor(page);
    await loadTableDoc(page, {
      colwidths: ['30.00%', '70.00%'],
      body: [[{ colspan: 1 }, { colspan: 1 }]],
    });

    // Fact 1: the widget renders at all only because the plugin exposes
    // props.decorations. Fact 2: descendant selector — the widget lives
    // inside the renderer's layout-transparent wrapper span.
    const colgroup = page.locator('table colgroup.mn-col-resize-colgroup');
    await expect(colgroup).toHaveCount(1);
    await expect(colgroup.locator('col')).toHaveCount(2);

    // Content-model order: caption before colgroup. The colgroup is not a
    // DOM sibling of the caption (wrapper span), so compare the widget's
    // effective position via the wrapper spans' order.
    const order = await page.evaluate(() => {
      const table = document.querySelector('table');
      const kids = table ? Array.from(table.children) : [];
      const spanOf = (sel: string): number =>
        kids.findIndex((k) => k.querySelector?.(sel) != null);
      return {
        captionIdx: kids.findIndex((k) => k.tagName === 'CAPTION'),
        colgroupSpanIdx: spanOf('colgroup.mn-col-resize-colgroup'),
      };
    });
    expect(order.colgroupSpanIdx).toBeGreaterThan(order.captionIdx);

    // Style form + fixed layout.
    await expect(colgroup.locator('col').first()).toHaveAttribute('style', /width:\s*30%/);
    const layout = await page.evaluate(() =>
      getComputedStyle(document.querySelector('table') as HTMLElement).tableLayout);
    expect(layout).toBe('fixed');
  });

  test('autowidth table: no colgroup, auto layout, handles present', async ({ page }) => {
    await openEditor(page);
    await loadTableDoc(page, {
      body: [[{ colspan: 1 }, { colspan: 1 }, { colspan: 1 }]],
    });

    await expect(page.locator('table colgroup.mn-col-resize-colgroup')).toHaveCount(0);
    await expect(page.locator('table .mn-col-resize-handle')).toHaveCount(2); // interior edges
    const layout = await page.evaluate(() =>
      getComputedStyle(document.querySelector('table') as HTMLElement).tableLayout);
    expect(layout).toBe('auto');
  });

  test('spanning-header table: grid from body rows, handle positioned from laid-out geometry', async ({ page }) => {
    await openEditor(page);
    await loadTableDoc(page, {
      head: [{ colspan: 2 }],
      body: [
        [{ colspan: 1 }, { colspan: 1 }],
        [{ colspan: 1 }, { colspan: 1 }],
      ],
    });

    // Grid = 2 (body rows), so exactly one interior handle.
    await expect(page.locator('table .mn-col-resize-handle')).toHaveCount(1);

    // Fact 3: geometry lands post-frame; poll until the handle sits inside
    // the table box (a fresh widget mounts unpositioned at left: 0).
    await expect
      .poll(async () => {
        const h = await page.locator('table .mn-col-resize-handle').first().boundingBox();
        const t = await page.locator('table').first().boundingBox();
        return h !== null && t !== null && h.x - t.x > 10;
      }, { timeout: 5_000 })
      .toBeTruthy();
  });
});
