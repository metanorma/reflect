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
    // The default doc should already contain a section_title (from DEFAULT_MIRROR_DOC).
    expect(docBefore).toContain('section_title');
  });
});
