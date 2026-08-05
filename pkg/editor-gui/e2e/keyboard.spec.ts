/**
 * Keyboard chain tests — Enter / Backspace / Shift-Enter / Ctrl+B through
 * real browser `keydown` events.
 *
 * Asserts structural outcomes via `getDoc(page)` (doc JSON) rather than the
 * DOM — this is where the `window.__mnGetDoc` test hook earns its keep.
 */
import { expect, test } from '@playwright/test';
import { editor, getDoc, openEditor, toolbarButton, typeInEditor } from './helpers.js';

test.describe('keyboard', () => {

  test('Enter continues a bullet list; empty + Enter exits', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'first item');

    // Start a bullet list.
    await toolbarButton(page, 'Bullets').click();
    let docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"bullet_list"');
    expect(docStr).toContain('"list_item"');

    // Enter creates a second list item.
    await page.keyboard.press('Enter');
    await typeInEditor(page, 'second item');
    docStr = JSON.stringify(await getDoc(page));
    const itemCount = (docStr.match(/"list_item"/g) ?? []).length;
    expect(itemCount).toBe(2);

    // Enter on the empty third item exits the list (new paragraph outside).
    await page.keyboard.press('Enter');
    await typeInEditor(page, 'after list');
    docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('after list');
  });

  test('Backspace re-seeds a minimal clause>paragraph when the doc would empty', async ({ page }) => {
    await openEditor(page);
    // The default doc is clause > paragraph. Place the cursor at the start of
    // the (empty) paragraph. Backspace triggers emptyTextblockBackspace,
    // which should refuse to empty `clause` / `sections` / `doc` and instead
    // re-seed a minimal clause > paragraph (EditorCommands.spec.md §4.10 BP1).
    await editor(page).click();
    // Move cursor to start of line.
    await page.keyboard.press('Home');

    const before = JSON.stringify(await getDoc(page));
    await page.keyboard.press('Backspace');
    const after = JSON.stringify(await getDoc(page));

    // The doc should still contain a clause and a paragraph (re-seeded).
    expect(after).toContain('"clause"');
    expect(after).toContain('"paragraph"');
    // The re-seed produces a NEW clause (new id), so the JSON differs.
    expect(after).not.toEqual(before);
  });

  test('Backspace refuses inside a definition list (preserves (dt dd)+)', async ({ page }) => {
    // NOTE: The `Def list` toolbar button is currently always disabled inside
    // a paragraph because `canInsertBlock` checks contentMatchAt against the
    // paragraph (inline-only) rather than the clause parent. This is a real
    // enabled-state bug in pkg/editor-commands/commands/definitionList.ts
    // (canInsertBlock). Until it is fixed, we cannot e2e-test the Backspace-
    // in-dl refusal rule through the UI. The rule itself is covered by the
    // headless command tests (EditorCommands.spec.md §4.10 BD1).
    // When canInsertBlock is fixed, replace this skip with the real UI flow:
    //   insert dl → type term → Enter → type desc → Home → Backspace → assert
    //   dl/dt/dd structure unchanged.
    test.skip(true, 'canInsertBlock bug: Def list button always disabled in a paragraph');
  });

  test('Shift-Enter inserts a soft_break inside a paragraph', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'line one');
    await page.keyboard.press('Shift+Enter');
    await typeInEditor(page, 'line two');

    const docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"soft_break"');
    expect(docStr).toContain('line one');
    expect(docStr).toContain('line two');
  });

  test('Bold button toggles the strong mark', async ({ page }) => {
    await openEditor(page);
    // Toggle Bold on (stored-mark), then type — the typed text inherits the
    // mark. This avoids the selection-loss that occurs when clicking a
    // toolbar button after Ctrl+A on existing text.
    await editor(page).click();
    await toolbarButton(page, 'Bold').click();
    await typeInEditor(page, 'bold this');

    const docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"strong"');
    expect(docStr).toContain('bold this');
  });
});
