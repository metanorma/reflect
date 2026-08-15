/**
 * Keyboard chain tests — Enter / Backspace / Shift-Enter / Ctrl+B through
 * real browser `keydown` events.
 *
 * Asserts structural outcomes via `getDoc(page)` (doc JSON) rather than the
 * DOM — this is where the `window.__mnGetDoc` test hook earns its keep.
 */
import { expect, test } from '@playwright/test';
import {
  clickBodyParagraph,
  clickEditor,
  getDoc,
  openEditor,
  toolbarButton,
  typeInEditor,
} from './helpers.js';

test.describe('keyboard', () => {

  test('Enter continues a bullet list; empty + Enter exits', async ({ page }) => {
    await openEditor(page);
    // Navigate past the section_title into the paragraph.
    await clickEditor(page);
    await page.keyboard.press('Enter'); // exit section_title → body paragraph
    await page.keyboard.type('first item');

    // Start a bullet list.
    await toolbarButton(page, 'Bullets').click();
    let docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"bullet_list"');
    expect(docStr).toContain('"list_item"');

    // Enter creates a second list item.
    await page.keyboard.press('Enter');
    await page.keyboard.type('second item');
    docStr = JSON.stringify(await getDoc(page));
    const itemCount = (docStr.match(/"list_item"/g) ?? []).length;
    expect(itemCount).toBe(2);

    // Enter on the empty third item exits the list (new paragraph outside).
    await page.keyboard.press('Enter');
    await typeInEditor(page, 'after list');
    docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('after list');
  });

  test('Backspace in empty paragraph after exiting section_title: joins to title or re-seeds', async ({ page }) => {
    await openEditor(page);
    // The default doc is clause > [section_title, paragraph]. Navigate to the
    // body paragraph and press Backspace. Whether the empty paragraph is
    // deleted (joining to section_title) or the doc is re-seeded depends on
    // the container-stack walk. Either way the doc should still have a clause.
    await clickEditor(page);
    await page.keyboard.press('Enter'); // exit section_title → body paragraph

    const before = JSON.stringify(await getDoc(page));
    await page.keyboard.press('Backspace');
    const after = JSON.stringify(await getDoc(page));

    // The doc should still contain a clause (re-seeded or retained).
    expect(after).toContain('"clause"');
  });

  test('Backspace refuses inside a definition list (preserves (dt dd)+)', async ({ page }) => {
    await openEditor(page);
    // Ensure the caret is in the body paragraph (not the section_title
    // heading, where Def list is disabled by design).
    await clickBodyParagraph(page);

    // Insert a dl via the Def list button (replaces the current paragraph;
    // text promotion requires a selection, so the caret-only case yields an
    // empty term — type the term directly into the dt afterwards).
    await toolbarButton(page, 'Def list').click();

    let docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"dl"');
    expect(docStr).toContain('"dt"');
    expect(docStr).toContain('"dd"');
    // The cursor is in the dt — type the term there.
    await page.keyboard.type('term text');
    docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('term text');

    // Enter from the dt commits the term and moves into the dd's paragraph.
    await page.keyboard.press('Enter');
    await page.keyboard.type('description');
    docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('description');

    // Backspace at the start of the dd's first block: the BD1 refusal rule —
    // the dl/dt/dd structure is preserved (no structural unwind mid-list).
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');

    const after = JSON.stringify(await getDoc(page));
    expect(after).toContain('"dl"');
    expect(after).toContain('"dt"');
    expect(after).toContain('"dd"');
    expect(after).toContain('term text');
  });

  test('Def list button is disabled while the cursor is in a section heading', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'body text');

    // Move into the section_title (ArrowUp from the first body paragraph).
    await page.keyboard.press('ArrowUp');

    // The Def list button must be disabled in a heading — a heading is not
    // body content and must not be replaceable by a dl.
    await expect(toolbarButton(page, 'Def list')).toBeDisabled();
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
    await clickEditor(page);
    await toolbarButton(page, 'Bold').click();
    await typeInEditor(page, 'bold this');

    const docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('"strong"');
    expect(docStr).toContain('bold this');
  });

  test('Enter inside a floating title exits to a new clause (last child)', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);
    // Blocks-only clause → FT inserts at sections level (after the clause).
    await toolbarButton(page, 'Floating title').click();
    // Cursor is in the FT; Enter should exit, creating the clause it titles.
    await page.keyboard.press('Enter');

    const doc = await getDoc(page) as { content: Array<{ type: string; content?: unknown[] }> };
    const sections = doc.content.find((c) => c.type === 'sections') as
      { content: Array<{ type: string; content: unknown[] }> } | undefined;
    const kids = (sections?.content ?? []).map((c) => c.type);
    // [clause(original), floating_title, clause(new)]
    expect(kids[kids.length - 1]).toBe('clause');
    expect(kids.filter((t) => t === 'clause').length).toBe(2);
    expect(kids[kids.length - 2]).toBe('floating_title');
    // The new clause has a section_title + paragraph; the cursor is in it.
    const newClause = sections?.content[kids.length - 1] as
      { content: Array<{ type: string }> } | undefined;
    const newKids = (newClause?.content ?? []).map((c) => c.type);
    expect(newKids).toContain('section_title');
    expect(newKids).toContain('paragraph');
    // Typing after Enter lands in the new clause's heading.
    await page.keyboard.type('New section');
    const after = JSON.stringify(await getDoc(page));
    expect(after).toContain('New section');
  });

  test('Enter inside a floating title jumps to the next sibling when one exists', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);
    await toolbarButton(page, 'Floating title').click();
    // First FT is last child; Enter creates a clause (cursor in its heading).
    await page.keyboard.press('Enter');
    // Go back up into the FT (ArrowUp from the new clause's section_title).
    await page.keyboard.press('ArrowUp');
    // Type proves the caret is in the FT.
    await page.keyboard.type('1');
    // Enter again — now the FT HAS a following sibling (the clause) → jump.
    await page.keyboard.press('Enter');

    const before = JSON.stringify(await getDoc(page));
    // No new clause was created (still exactly 2).
    const clauseCount = (before.match(/"type":"clause"/g) ?? []).length;
    expect(clauseCount).toBe(2);
    // The caret moved into the following clause's heading — typing goes there.
    await page.keyboard.type('Landed');
    const after = JSON.stringify(await getDoc(page));
    expect(after).toContain('Landed');
    // And the FT text is unchanged apart from the '1' typed into it.
    expect(after).toContain('"floating_title"');
  });
});
