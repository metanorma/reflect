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

/** Load a two-clause doc: first clause titled "Foo" with body "Bar", second
 * clause titled "Tail". Returns nothing; the caret is placed separately. */
async function loadFooTailDoc(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    (window).__mnLoadDoc?.({
      type: 'doc',
      content: [
        { type: 'bibdata', attrs: { item: null, data: {} } },
        { type: 'sections', content: [
          { type: 'clause', attrs: { id: '_foo' }, content: [
            { type: 'section_title', content: [{ type: 'text', text: 'Foo' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Bar' }] },
          ] },
          { type: 'clause', attrs: { id: '_tail' }, content: [
            { type: 'section_title', content: [{ type: 'text', text: 'Tail' }] },
            { type: 'paragraph' },
          ] },
        ] },
      ],
    });
  });
}

/**
 * Place the caret in the "Foo" clause's title, then settle.
 *
 * The 300ms settle is required: ProseMirror observes caret moves (click,
 * ArrowUp, Home, …) via the async `selectionchange` event, so rapid synthetic
 * keys race `view.state.selection` — an immediately-following Enter acts on
 * the stale caret. A human cannot hit this window; synthetic tests can.
 * Returns nothing; callers add their own offset nudges (ArrowRight,
 * Backspace) and re-settle before pressing Enter.
 */
async function caretIntoFooTitle(page: import('@playwright/test').Page): Promise<void> {
  const p = page.locator('.ProseMirror p').first();
  await p.click({ force: true });
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Home');
  await page.waitForTimeout(300);
}

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

  test('Enter at start of a non-empty title inserts an empty clause ABOVE (caret stays)', async ({ page }) => {
    await openEditor(page);
    await loadFooTailDoc(page);

    // Caret into "Foo"'s title at offset 0 (helper settles after navigation).
    await caretIntoFooTitle(page);

    await page.keyboard.press('Enter');

    // Structure: three top-level clauses now — the new empty one is FIRST
    // (above Foo), Foo's id and text untouched, Tail last.
    const doc = (await getDoc(page)) as any;
    const sections = doc.content.find((n: any) => n.type === 'sections');
    const clauses = sections.content;
    expect(clauses).toHaveLength(3);
    expect(clauses[0].attrs.id).not.toBe('_foo');
    expect(clauses[0].attrs.id).not.toBe('_tail');
    // The new sibling is [empty section_title, empty paragraph].
    expect(clauses[0].content.map((c: any) => c.type)).toEqual(['section_title', 'paragraph']);
    expect(clauses[0].content[0].content ?? []).toEqual([]);
    // The original clause keeps its id, its title text, and its body.
    expect(clauses[1].attrs.id).toBe('_foo');
    expect((clauses[1].content[0].content ?? []).map((t: any) => t.text).join('')).toBe('Foo');
    expect((clauses[1].content[1].content ?? []).map((t: any) => t.text).join('')).toBe('Bar');
    expect(clauses[2].attrs.id).toBe('_tail');

    // The caret is STILL at offset 0 of the ORIGINAL title: typing a probe
    // prepends to "Foo", not to the new empty title above.
    await page.keyboard.type('X');
    const doc2 = (await getDoc(page)) as any;
    const sections2 = doc2.content.find((n: any) => n.type === 'sections');
    const titles = sections2.content.map((c: any) =>
      (c.content.find((k: any) => k.type === 'section_title')?.content ?? [])
        .map((t: any) => t.text).join(''));
    expect(titles).toEqual(['', 'XFoo', 'Tail']);
  });

  test('Enter in an EMPTY title still exits to the body (staged-caret regression)', async ({ page }) => {
    await openEditor(page);
    // Load the Foo clause with an ALREADY-EMPTY title (deterministic — no
    // in-test deletion needed). ArrowUp from the body lands at the empty
    // title's only caret position, which is offset 0 by definition.
    await page.evaluate(() => {
      (window).__mnLoadDoc?.({
        type: 'doc',
        content: [
          { type: 'bibdata', attrs: { item: null, data: {} } },
          { type: 'sections', content: [
            { type: 'clause', attrs: { id: '_foo' }, content: [
              { type: 'section_title' },
              { type: 'paragraph', content: [{ type: 'text', text: 'Bar' }] },
            ] },
            { type: 'clause', attrs: { id: '_tail' }, content: [
              { type: 'section_title', content: [{ type: 'text', text: 'Tail' }] },
              { type: 'paragraph' },
            ] },
          ] },
        ],
      });
    });

    const p = page.locator('.ProseMirror p').first();
    await p.click({ force: true });
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);

    await page.keyboard.press('Enter');

    // The caret must be in the body paragraph ("Bar"), and NO sibling clause
    // was created — the sections container still holds exactly 2 clauses.
    await page.keyboard.type('Z');
    const doc = (await getDoc(page)) as any;
    const sections = doc.content.find((n: any) => n.type === 'sections');
    expect(sections.content).toHaveLength(2);
    const foo = sections.content[0];
    expect((foo.content[1].content ?? []).map((t: any) => t.text).join('')).toBe('ZBar');
  });

  test('Enter mid-title still exits to the body (non-zero offset regression)', async ({ page }) => {
    await openEditor(page);
    await loadFooTailDoc(page);

    // Caret into "Foo"'s title at offset 1 (after "F").
    await caretIntoFooTitle(page);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);

    await page.keyboard.press('Enter');

    // Mid-title Enter exits to the body; no sibling clause is created.
    await page.keyboard.type('Y');
    const doc = (await getDoc(page)) as any;
    const sections = doc.content.find((n: any) => n.type === 'sections');
    expect(sections.content).toHaveLength(2);
    const foo = sections.content[0];
    // Title unchanged (Enter did not split or modify it).
    expect((foo.content[0].content ?? []).map((t: any) => t.text).join('')).toBe('Foo');
    expect((foo.content[1].content ?? []).map((t: any) => t.text).join('')).toBe('YBar');
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
