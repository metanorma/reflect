/**
 * SectionNodeView title-input event isolation tests.
 *
 * Guards the capture-phase `stopPropagation` fix in SectionNodeView that
 * prevents ProseMirror's contenteditable handlers from swallowing keystrokes
 * meant for the section title `<input>`. This behaviour only manifests with
 * real browser event flow through a contenteditable — a strong e2e candidate
 * that jsdom cannot reproduce.
 */
import { expect, test } from '@playwright/test';
import { editor, getDoc, openEditor, typeInEditor } from './helpers.js';

/** The title input inside the first section node view. */
function firstTitleInput(page: import('@playwright/test').Page): import('@playwright/test').Locator {
  return page.locator('section.mn-clause .mn-section-title-input').first();
}

test.describe('section-title isolation', () => {

  test('title input is editable: typing updates its value', async ({ page }) => {
    await openEditor(page);
    const input = firstTitleInput(page);
    await expect(input).toBeVisible();

    await input.click();
    await input.fill('Introduction');
    await expect(input).toHaveValue('Introduction');
  });

  test('keystrokes in the title input do not leak into the editor body', async ({ page }) => {
    await openEditor(page);
    const bodyBefore = (await editor(page).textContent()) ?? '';

    const input = firstTitleInput(page);
    await input.click();
    await input.fill('Heading text');

    // The editor body text should NOT contain what was typed into the title.
    const bodyAfter = (await editor(page).textContent()) ?? '';
    expect(bodyAfter).not.toContain('Heading text');
    // And the body content is unchanged (no stray characters leaked in).
    expect(bodyAfter.trim()).toBe(bodyBefore.trim());
  });

  test('focus is retained on the title input across several characters', async ({ page }) => {
    await openEditor(page);
    const input = firstTitleInput(page);
    await input.click();

    // Type 10 characters one at a time. If a per-keystroke setNodeMarkup
    // transaction stole focus, the input would lose it partway through.
    for (let i = 0; i < 10; i++) {
      await page.keyboard.type('x');
    }
    // Focus should still be on the input.
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    const focusedClass = await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.className,
    );
    expect(focusedTag).toBe('INPUT');
    expect(focusedClass).toContain('mn-section-title-input');
  });

  test('title commits on blur: clause title attr reflects the typed value', async ({ page }) => {
    await openEditor(page);
    const input = firstTitleInput(page);
    await input.click();
    await input.fill('Persisted Title');

    // Blur by clicking elsewhere in the editor body.
    await editor(page).click();
    // Allow the onBlur commit dispatch to settle.
    await page.waitForTimeout(100);

    const docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('Persisted Title');
  });
});
