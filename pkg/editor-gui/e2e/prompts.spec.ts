/**
 * `window.prompt` flow tests (link, eref, clause heading).
 *
 * Uses `page.on('dialog', ...)` for deterministic native-prompt interception.
 * Also guards the async stale-view fix: the clause button captures
 * `{ state, dispatch }` synchronously before the `.then()` that fires after the
 * prompt closes. (These flows are unaffected by the popover occlusion bug
 * because `window.prompt` is a native OS dialog, not a DOM popover.)
 *
 * Note: `xref` and `concept` no longer use `window.prompt` by default — they
 * open a doc-anchored target picker popover instead (see popovers.spec.ts,
 * 'XrefPicker' / 'ConceptPicker'). Only the host-hook path (`onXrefPrompt` /
 * `onConceptPrompt`) would trigger a prompt, and the e2e mount does not supply
 * those hooks.
 */
import { expect, test } from '@playwright/test';
import { editor, getDoc, openEditor, toolbarButton, typeInEditor } from './helpers.js';

/** Install a one-shot dialog acceptor that returns `value` for the next prompt. */
function acceptNextPrompt(page: import('@playwright/test').Page, value: string): void {
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('prompt');
    await dialog.accept(value);
  });
}

/** Install a one-shot dialog dismisser (Cancel). */
function dismissNextPrompt(page: import('@playwright/test').Page): void {
  page.once('dialog', async (dialog) => {
    await dialog.dismiss();
  });
}

test.describe('prompts', () => {

  test('Link: prompt accepts a URL and applies the link mark', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'click here');
    // Select the typed text so the mark applies to it.
    await page.keyboard.press('Shift+Home');

    acceptNextPrompt(page, 'https://example.com');
    await toolbarButton(page, 'Link').click();

    const docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"link"');
    expect(docStr).toContain('https://example.com');
  });

  test('Eref: prompt accepts a citation key and applies the eref mark', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'cite ');
    await page.keyboard.press('Shift+Home');

    acceptNextPrompt(page, 'iso1234');
    await toolbarButton(page, 'Eref').click();

    const docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"eref"');
    expect(docStr).toContain('iso1234');
  });

  test('Clause: prompt accepts a heading and wraps selection in a titled clause', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'body content');

    acceptNextPrompt(page, 'My Heading');
    await toolbarButton(page, 'Clause').click();

    const docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"clause"');
    expect(docStr).toContain('My Heading');
    expect(docStr).toContain('body content');
  });

  test('Cancel path: dismissed prompt leaves the document unchanged', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'plain text');
    // Select the text so the inline-context enabled predicate is satisfied
    // (same setup as the positive Link test).
    await page.keyboard.press('Shift+Home');

    const before = JSON.stringify(await getDoc(page));

    dismissNextPrompt(page);
    await toolbarButton(page, 'Link').click();

    const after = JSON.stringify(await getDoc(page));
    expect(after).toBe(before);
  });
});
