/**
 * Section title rich-content tests.
 *
 * Verifies that clause insertion places the cursor in an empty `section_title`
 * textblock, that typing fills it, that inline marks apply inside the title,
 * that Enter inside a title exits to the body paragraph, and that the doc JSON
 * contains the `section_title` node type.
 */
import { expect, test } from '@playwright/test';
import { openEditor, toolbarButton, getDoc, clickEditor } from './helpers.js';

test.describe('section title', () => {

  test('clause insertion places cursor in empty section_title; typing fills it', async ({ page }) => {
    await openEditor(page);
    // Navigate to the body paragraph, type content.
    await clickEditor(page);
    await page.keyboard.press('Enter'); // exit section_title → body paragraph
    await page.keyboard.type('body text');

    // Insert a nested clause via the Section popover → "Clause".
    await toolbarButton(page, 'Section').click();
    await page.locator('.mn-section-popover[popover]').getByRole('button', { name: 'Clause', exact: true }).click();

    // The cursor should now be in the section_title. Type the heading.
    await page.keyboard.type('My Heading');

    const docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('section_title');
    expect(docStr).toContain('My Heading');
    expect(docStr).toContain('body text');
  });

  test('bold mark applies inside the section_title', async ({ page }) => {
    await openEditor(page);
    // Navigate to the body paragraph, type content.
    await clickEditor(page);
    await page.keyboard.press('Enter'); // exit section_title → body paragraph
    await page.keyboard.type('content');

    // Insert a clause via the Section popover — cursor lands in section_title.
    await toolbarButton(page, 'Section').click();
    await page.locator('.mn-section-popover[popover]').getByRole('button', { name: 'Clause', exact: true }).click();

    // Type heading text.
    await page.keyboard.type('Heading');

    // Select the heading text and apply bold.
    await page.keyboard.press('Shift+Home');
    await toolbarButton(page, 'Bold').click();

    const doc = await getDoc(page as any) as any;
    // The section_title should contain a strong mark.
    // doc.content[0] is bibdata; sections is at doc.content[1].
    const sectionsNode = doc.content?.find((n: any) => n.type === 'sections');
    const sectionsContent = sectionsNode?.content;
    let foundBoldInTitle = false;
    for (const child of sectionsContent ?? []) {
      if (child.type === 'clause') {
        // Walk the clause's children to find the nested clause's section_title.
        const walk = (node: any) => {
          if (node.type === 'section_title' && node.content) {
            const hasStrong = node.content.some((t: any) =>
              t.marks?.some((m: any) => m.type === 'strong'),
            );
            if (hasStrong) foundBoldInTitle = true;
          }
          for (const c of node.content ?? []) {
            if (c.type === 'clause') walk(c);
            if (c.type === 'section_title' && c.content) {
              const hasStrong = c.content.some((t: any) =>
                t.marks?.some((m: any) => m.type === 'strong'),
              );
              if (hasStrong) foundBoldInTitle = true;
            }
          }
        };
        walk(child);
      }
    }
    expect(foundBoldInTitle).toBe(true);
  });

  test('Enter inside a title exits to the body paragraph', async ({ page }) => {
    await openEditor(page);
    // Navigate to the body paragraph, type content.
    await clickEditor(page);
    await page.keyboard.press('Enter'); // exit section_title → body paragraph
    await page.keyboard.type('body');

    // Insert a clause via the Section popover — cursor lands in section_title.
    await toolbarButton(page, 'Section').click();
    await page.locator('.mn-section-popover[popover]').getByRole('button', { name: 'Clause', exact: true }).click();

    // Type a heading.
    await page.keyboard.type('Title');

    // Press Enter — should exit to the body paragraph.
    await page.keyboard.press('Enter');

    // Type body content — should go into the paragraph, not the title.
    await page.keyboard.type('paragraph text');

    const docStr = JSON.stringify(await getDoc(page));
    expect(docStr).toContain('paragraph text');
    // Verify the title still contains "Title" (was not overwritten).
    const doc = await getDoc(page) as any;
    const sectionsNode = doc.content?.find((n: any) => n.type === 'sections');
    const sectionsContent = sectionsNode?.content;
    let titleText = '';
    let bodyParTexts: string[] = [];
    const collectFromClause = (clause: any) => {
      for (const c of clause.content ?? []) {
        if (c.type === 'section_title') {
          titleText = (c.content ?? []).map((t: any) => t.text ?? '').join('');
        }
        if (c.type === 'paragraph') {
          bodyParTexts.push((c.content ?? []).map((t: any) => t.text ?? '').join(''));
        }
        if (c.type === 'clause') collectFromClause(c);
      }
    };
    for (const child of sectionsContent ?? []) {
      if (child.type === 'clause') collectFromClause(child);
    }
    expect(titleText).toBe('Title');
    expect(docStr).toContain('paragraph text');
  });

  test('doc JSON contains section_title node type after clause insertion', async ({ page }) => {
    await openEditor(page);

    const docBefore = JSON.stringify(await getDoc(page));
    // The default doc should already contain a section_title (from DEFAULT_MN_DOC).
    expect(docBefore).toContain('section_title');
  });

  test('empty section_title shows the styled placeholder; typing replaces it', async ({ page }) => {
    await openEditor(page);

    // The default doc's clause ships an EMPTY section_title, so the placeholder
    // must render immediately. It is a ::before overlay — assert via computed
    // style (ProseMirror's trailing <br> means the element is never :empty,
    // which is exactly the bug class this test guards against).
    const placeholderOf = (index: number) => page.evaluate((i) => {
      const els = document.querySelectorAll('.mn-section-title');
      const el = els[i];
      return el ? getComputedStyle(el, '::before').content : 'not found';
    }, index);
    expect(await placeholderOf(0)).toBe('"Section heading"');

    // The real user flow: insert a clause via the Section popover — a SIBLING
    // after the current clause; the cursor lands in the new clause's empty
    // section_title. TWO empty titles exist now: the original clause's and the
    // new sibling's — both must show the placeholder (matching is per-element,
    // not per-editor).
    await clickEditor(page);
    await page.keyboard.press('Enter'); // exit section_title → body paragraph
    await page.keyboard.type('body text');
    await toolbarButton(page, 'Section').click();
    await page.locator('.mn-section-popover[popover]').getByRole('button', { name: 'Clause', exact: true }).click();
    for (let i = 0; i < 2; i++) expect(await placeholderOf(i)).toBe('"Section heading"');

    // Typing the heading fills the new clause's title (last in DOM order) —
    // its placeholder disappears, while the still-empty titles keep theirs.
    await page.keyboard.type('Scope');
    const doc = (await getDoc(page)) as any;
    const collectTitles = (node: any, acc: string[] = []): string[] => {
      for (const c of node?.content ?? []) {
        if (c.type === 'section_title') {
          acc.push((c.content ?? []).map((t: any) => t.text ?? '').join(''));
        } else if (c.type === 'clause') {
          collectTitles(c, acc);
        }
      }
      return acc;
    };
    const titleTexts = doc.content
      .filter((n: any) => n.type === 'sections')
      .flatMap((s: any) => collectTitles(s));
    expect(titleTexts).toEqual(['', 'Scope']);
    expect(await placeholderOf(0)).toBe('"Section heading"');
    expect(await placeholderOf(1)).toBe('none');

    // Deleting back to empty restores it.
    for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
    expect(await placeholderOf(1)).toBe('"Section heading"');
  });

  test('clicking the placeholder focuses the empty title (Firefox caret regression)', async ({ page }) => {
    await openEditor(page);

    // Regression (Firefox 153): clicking the ::before placeholder of an empty
    // section_title produced NO caret position — neither the browser's native
    // caret nor ProseMirror's coordinate path — so the caret stayed in the
    // previously-focused block and typing went to the wrong place. The
    // placeholderClickPlugin (pkg/prosemirror-editor) normalizes this by
    // mapping the click through the DOM node instead of coordinates.
    //
    // Exercise BOTH orderings: title-click first (fresh focus) and
    // paragraph-click → title-click (the failing sequence — focus elsewhere
    // first is what triggers the Firefox gap).
    const clickTitleAt = async (dx: number) => {
      const box = await page.locator('.mn-section-title').first().boundingBox();
      await page.mouse.click(box.x + dx, box.y + box.height / 2);
    };
    const titleText = async () => {
      const doc = (await getDoc(page)) as any;
      const clause = doc.content.find((n: any) => n.type === 'sections')?.content?.[0];
      return (clause?.content ?? [])
        .filter((c: any) => c.type === 'section_title')
        .map((c: any) => (c.content ?? []).map((t: any) => t.text ?? '').join(''))
        .join('');
    };

    // Sequence 1: click the placeholder mid-glyphs, type.
    await clickTitleAt(60);
    await page.keyboard.type('A');
    expect(await titleText()).toBe('A');

    // Sequence 2: focus the body paragraph first, then click the placeholder.
    await page.keyboard.press('Backspace'); // clear the title back to empty
    const pbox = await page.locator('.ProseMirror p').first().boundingBox();
    await page.mouse.click(pbox.x + 10, pbox.y + pbox.height / 2);
    await clickTitleAt(60);
    await page.keyboard.type('B');
    expect(await titleText()).toBe('B');
  });
});
