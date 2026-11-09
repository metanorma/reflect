/**
 * Chrome bar tests — the top application chrome (ChromeBar.tsx): Save/Open
 * document actions and the Panels control (reopen affordance for closed
 * floating panels).
 *
 * Replaces `sidebar.spec.ts` (the Sidebar rail was removed by the
 * panel-layout integration: app actions moved into the chrome bar; the
 * `load-via-hook` test carries over unchanged — it drives the
 * `window.__mnLoadDoc` rehydration hook, never the removed Sidebar DOM).
 *
 * Selectors are structural (roles, accessible names, engine classes) —
 * see the selector-discipline note in helpers.ts.
 */
import { expect, test } from '@playwright/test';
import { getDoc, openEditor, typeInEditor, clickEditor } from './helpers.js';

test.describe('chrome', () => {

  test('Save and Open buttons are visible in the chrome bar', async ({ page }) => {
    await openEditor(page);
    await expect(page.getByRole('button', { name: 'Save…', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open…', exact: true })).toBeVisible();
  });

  test('Panels control lists Minimap and Toolbar, disabled while open', async ({ page }) => {
    await openEditor(page);
    // Both panels ship open (preset) → both reopen buttons disabled, with
    // the "is open" accessible labels.
    const minimap = page.getByRole('button', { name: 'Minimap panel is open' });
    const toolbar = page.getByRole('button', { name: 'Toolbar panel is open' });
    await expect(minimap).toBeVisible();
    await expect(toolbar).toBeVisible();
    await expect(minimap).toBeDisabled();
    await expect(toolbar).toBeDisabled();

    // Close the toolbar window via its tab close action; the control
    // re-enables and reopens the panel.
    await page.locator('.dv-groupview:has([role="toolbar"])')
      .locator('.dv-default-tab-action').first().click();
    const reopen = page.getByRole('button', { name: 'Reopen the Toolbar panel' });
    await expect(reopen).toBeEnabled();
    await reopen.click();
    await expect(page.getByRole('toolbar')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Toolbar panel is open' })).toBeDisabled();
  });

  test('load-via-hook replaces editor content', async ({ page }) => {
    await openEditor(page);
    // Navigate past the section_title into the paragraph, then type.
    await clickEditor(page);
    await page.keyboard.press('Enter'); // exit section_title → body paragraph
    await page.keyboard.type('original content');

    // Capture the baseline doc and confirm it has the typed text.
    const baseline = await getDoc(page as any) as Record<string, unknown>;
    expect(JSON.stringify(baseline)).toContain('original content');

    // Deep-walk the baseline JSON to find the first text node and replace its
    // text. The structure is doc > sections > clause > [section_title,
    // paragraph > text], so we recurse instead of hard-coding the path.
    const mutated = JSON.parse(JSON.stringify(baseline));
    const replaceText = (node: any): boolean => {
      if (node?.type === 'text' && typeof node.text === 'string') {
        node.text = 'loaded replacement text';
        return true;
      }
      for (const child of node?.content ?? []) {
        if (replaceText(child)) return true;
      }
      return false;
    };
    replaceText(mutated);

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
