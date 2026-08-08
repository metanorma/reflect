/**
 * Sidebar tests — the left hover-expand rail with Save/Open document buttons.
 *
 * The sidebar is a consumer-local component whose classes are CSS-Module-scoped
 * (hashed at build time), so tests select elements structurally (by tag name,
 * role, and accessible name) rather than by class name.
 *
 * Three concerns:
 *  1. smoke — the sidebar and both buttons render and are visible;
 *  2. hover-expand — the panel widens on hover (labels appear);
 *  3. load-via-hook — the `window.__mnLoadDoc` rehydration hook replaces the
 *     editor content (the native file picker can't be driven by Playwright, so
 *     the hook exercises the same `loadDocFromJson` path the Open button uses).
 */
import { expect, test } from '@playwright/test';
import { getDoc, openEditor, typeInEditor } from './helpers.js';

test.describe('sidebar', () => {

  test('sidebar and both Save/Open buttons are visible', async ({ page }) => {
    await openEditor(page);
    // The sidebar is the sole <aside> on the page.
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save…', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open…', exact: true })).toBeVisible();
  });

  // TEMPORARILY DISABLED — sidebar is fixed in collapsed state until
  // functionality above the buttons is added. Re-enable by un-commenting.
  // test('hovering the sidebar expands the panel', async ({ page }) => {
  //   await openEditor(page);
  //
  //   // The panel is the first <div> child of the <aside>.
  //   const panel = page.locator('aside > div').first();
  //
  //   // Capture the collapsed width, then hover the sidebar and assert the panel
  //   // widens (the CSS :hover rule grows it from 48px to 168px).
  //   const widthBefore = await panel.evaluate(
  //     (el) => parseFloat(getComputedStyle(el).width),
  //   );
  //
  //   await page.locator('aside').hover();
  //
  //   const widthAfter = await panel.evaluate(
  //     (el) => parseFloat(getComputedStyle(el).width),
  //   );
  //
  //   // The panel should have grown significantly on hover.
  //   expect(widthAfter).toBeGreaterThan(widthBefore);
  // });

  test('load-via-hook replaces editor content', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'original content');

    // Capture the baseline doc and confirm it has the typed text.
    const baseline = await getDoc(page) as Record<string, unknown>;
    expect(JSON.stringify(baseline)).toContain('original content');

    // Mutate the baseline: inject different text into the paragraph's text node.
    const mutated = JSON.parse(JSON.stringify(baseline)) as {
      content: Array<{
        content: Array<{
          content: Array<{
            content: Array<{ text?: string; type: string }>;
            type: string;
          }>;
          type: string;
        }>;
        type: string;
      }>;
    };
    // Walk to the first text node and replace its text.
    const para = mutated.content[0].content[0].content[0];
    if (para.type === 'paragraph' && Array.isArray(para.content) && para.content[0]) {
      para.content[0].text = 'loaded replacement text';
    }

    // Drive the rehydration hook (same path the Open button uses).
    const ok = await page.evaluate((json) => {
      const w = window as { __mnLoadDoc?: (json: unknown) => boolean };
      return w.__mnLoadDoc?.(json) ?? false;
    }, mutated);
    expect(ok).toBe(true);

    // Wait for the React state update to propagate to the __mnGetDoc hook (the
    // effect re-binds on editorState change), then assert the editor reflects
    // the loaded doc.
    await expect.poll(
      async () => JSON.stringify(await getDoc(page)),
      { message: 'editor doc to reflect loaded content' },
    ).toContain('loaded replacement text');

    const afterStr = JSON.stringify(await getDoc(page));
    expect(afterStr).not.toContain('original content');
  });
});
