/**
 * Prompt dialog flow tests (link, eref).
 *
 * These buttons open a RAC `<PromptPopover>` DOM dialog instead of a native
 * `window.prompt`. The dialog is a `.mn-prompt-popover` popover containing a
 * text field and OK/Cancel buttons.
 *
 * Note: `xref` and `concept` do not use the prompt dialog — they open a
 * doc-anchored target picker popover instead (see popovers.spec.ts,
 * 'XrefPicker' / 'ConceptPicker'). Only the host-hook path
 * (`onXrefPrompt` / `onConceptPrompt`) would trigger a prompt, and the e2e
 * mount does not supply those hooks. The Clause button no longer uses a prompt
 * either — clause insertion is synchronous and the cursor lands in the
 * section_title for direct heading editing (see section-title.spec.ts).
 */
import { expect, test } from '@playwright/test';
import { getDoc, openEditor, toolbarButton, typeInEditor } from './helpers.js';

/** Locator for the RAC prompt popover. */
function promptPopover(page: import('@playwright/test').Page) {
  return page.locator('.mn-prompt-popover');
}

test.describe('prompts', () => {

  test('Link: dialog accepts a URL and applies the link mark', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'click here');
    // Select the typed text so the mark applies to it.
    await page.keyboard.press('Shift+Home');

    await toolbarButton(page, 'Link').click();
    const dialog = promptPopover(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').fill('https://example.com');
    await dialog.getByRole('button', { name: 'OK' }).click();

    const docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"link"');
    expect(docStr).toContain('https://example.com');
  });

  test('Eref: picker accepts a citation key and applies the eref mark', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'cite ');
    await page.keyboard.press('Shift+Home');

    await toolbarButton(page, 'Eref').click();
    // The eref picker has a free-text input for manual citation key entry.
    const picker = page.locator('.mn-eref-picker');
    await expect(picker).toBeVisible();
    await picker.getByRole('textbox').fill('iso1234');
    await picker.getByRole('textbox').press('Enter');
    await page.waitForTimeout(200);

    const docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"eref"');
    expect(docStr).toContain('iso1234');
  });

  test('Cancel path: dismissed dialog leaves the document unchanged (link)', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'plain text');
    // Select the text so the inline-context enabled predicate is satisfied
    // (same setup as the positive Link test).
    await page.keyboard.press('Shift+Home');

    const before = JSON.stringify(await getDoc(page));

    await toolbarButton(page, 'Link').click();
    const dialog = promptPopover(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    const after = JSON.stringify(await getDoc(page));
    expect(after).toBe(before);
  });
});
