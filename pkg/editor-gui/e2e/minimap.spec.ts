/**
 * Consumer-owned minimap integration tests.
 *
 * The minimap PACKAGE's contracts (renderer, geometry, drag, tiers,
 * glyphs, scroll-container variants) are covered by the package's own
 * e2e suite against its harness (pkg/prosemirror-minimap/e2e — spec
 * §15.3). This file keeps only what the CONSUMER owns:
 *
 *  1. placement — the pane sits between the sidebar and the editor
 *     (MinimapPane.tsx's docking);
 *  2. integration smoke — the minimap renders and drag scrolls in the
 *     real app (Metanorma theme at the consumer zoom);
 *  3. state-swap wiring — loading a fresh document (docEpoch re-key of
 *     MinimapPane) and typing after it does not break the editor.
 */
import { expect, test } from '@playwright/test';
import { openEditor, clickEditor } from './helpers.js';

/** Build a tall document JSON: bibdata + sections with many clauses. */
function tallDoc(clauseCount: number): Record<string, unknown> {
  const clauses = Array.from({ length: clauseCount }, (_, i) => ({
    type: 'clause',
    attrs: { id: `clause-${i + 1}`, unnumbered: null },
    content: [
      {
        type: 'section_title',
        content: [{ type: 'text', text: `Clause ${i + 1}` }],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `Body text of clause ${i + 1}. `.repeat(4),
          },
        ],
      },
    ],
  }));
  return {
    type: 'doc',
    attrs: { id: 'doc_tall' },
    content: [
      { type: 'bibdata', attrs: { item: null } },
      {
        type: 'sections',
        attrs: { id: 'sections_tall' },
        content: clauses,
      },
    ],
  };
}

test.describe('minimap (consumer integration)', () => {

  test('minimap pane sits between the sidebar and the editor', async ({ page }) => {
    await openEditor(page);
    const minimap = page.locator('.mn-minimap');
    await expect(minimap).toBeVisible();

    const sidebarBox = await page.locator('aside').boundingBox();
    const minimapBox = await minimap.boundingBox();
    const editorBox = await page
      .locator('.appwrapper .mn-prosemirror .ProseMirror')
      .boundingBox();

    expect(sidebarBox).not.toBeNull();
    expect(minimapBox).not.toBeNull();
    expect(editorBox).not.toBeNull();

    // Immediately right of the sidebar rail…
    expect(minimapBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width - 1);
    // …and left of the editor surface.
    expect(minimapBox!.x + minimapBox!.width).toBeLessThanOrEqual(editorBox!.x + 1);
    // Full height (docked, not floating).
    expect(minimapBox!.height).toBeGreaterThan(200);
  });

  test('minimap renders and drag scrolls the editor (integration smoke)', async ({ page }) => {
    await openEditor(page);

    // Load a tall document (state-swap path — the minimap rebuilds its
    // model without a transaction).
    const ok = await page.evaluate((json) => {
      const w = window as { __mnLoadDoc?: (json: unknown) => boolean };
      return w.__mnLoadDoc?.(json) ?? false;
    }, tallDoc(60));
    expect(ok).toBe(true);
    // Let the sliced build + stride sampling converge on the layout.
    await page.waitForTimeout(500);

    const overlay = page.locator('.mn-minimap-viewport');
    await expect(overlay).toBeVisible();
    const canvas = page.locator('.mn-minimap canvas');
    await expect(canvas).toBeVisible();
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox!.width).toBeGreaterThan(10);
    expect(canvasBox!.height).toBeGreaterThan(10);

    const scrollTopBefore = await page.evaluate(
      () => document.querySelector('.ProseMirror')?.scrollTop ?? 0,
    );

    // Drag the viewport strip toward the bottom of the pane. The drag
    // end is pane-RELATIVE (40px above the pane's bottom edge), not an
    // absolute y, so it survives pane height/position changes.
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    const paneBox = await page.locator('.mn-minimap').boundingBox();
    expect(paneBox).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 10);
    await page.mouse.down();
    await page.mouse.move(
      box!.x + box!.width / 2,
      paneBox!.y + paneBox!.height - 40,
      { steps: 8 },
    );
    await page.mouse.up();

    const scrollTopAfter = await page.evaluate(
      () => document.querySelector('.ProseMirror')?.scrollTop ?? 0,
    );
    expect(scrollTopAfter).toBeGreaterThan(scrollTopBefore);
  });

  test('typing after a document load still works (state-swap regression)', async ({ page }) => {
    await openEditor(page);

    const ok = await page.evaluate((json) => {
      const w = window as { __mnLoadDoc?: (json: unknown) => boolean };
      return w.__mnLoadDoc?.(json) ?? false;
    }, tallDoc(5));
    expect(ok).toBe(true);

    // Type in the editor; the doc must contain the text afterwards (no
    // exception thrown by the minimap plugin's transaction handling).
    await clickEditor(page);
    await page.keyboard.type('still editable');
    const doc = await page.evaluate(() => {
      const w = window as { __mnGetDoc?: () => unknown };
      return JSON.stringify(w.__mnGetDoc?.());
    });
    expect(doc).toContain('still editable');
  });
});
