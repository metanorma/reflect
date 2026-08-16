import { expect, test } from '@playwright/test';
import { openEditor, toolbarButton, typeInEditor, getDoc, clickEditor } from './helpers.js';

test.describe('section-insert', () => {
  test('Section button opens popover; menu shows all section types in four groups', async ({ page }) => {
    await openEditor(page);
    await clickEditor(page);

    // Click the "Section" toolbar button.
    await toolbarButton(page, 'Section').click();

    // The popover should be visible.
    const popover = page.locator('.mn-section-popover[popover]');
    await expect(popover).toBeVisible();

    // Four cohort group headings should be present.
    await expect(popover.locator('.mn-section-popover__heading', { hasText: 'Front matter' })).toBeVisible();
    await expect(popover.locator('.mn-section-popover__heading', { hasText: 'Body' })).toBeVisible();
    await expect(popover.locator('.mn-section-popover__heading', { hasText: 'Annexes' })).toBeVisible();
    await expect(popover.locator('.mn-section-popover__heading', { hasText: 'Back matter' })).toBeVisible();

    // All 10 section types should be offered as buttons.
    for (const label of [
      'Abstract', 'Foreword', 'Introduction', 'Acknowledgements', 'Content section',
      'Clause', 'Terms', 'Definitions',
      'Annex',
      'References',
    ]) {
      await expect(popover.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
  });

  test('Selecting "Clause" inserts a sibling clause after the current section', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'first clause');

    // Insert a second clause via the Section popover — a SIBLING after the
    // current one (Section-menu choices create sibling sections).
    await toolbarButton(page, 'Section').click();
    await page.locator('.mn-section-popover[popover]').getByRole('button', { name: 'Clause', exact: true }).click();

    const doc = await getDoc(page) as { content: Array<{ type: string; content?: unknown[] }> };

    // The original clause keeps its body; the new clause is a top-level
    // sibling inside sections.
    const sections = doc.content.find((c) => c.type === 'sections');
    const sectionsChildren = (sections?.content ?? []) as Array<{ type: string }>;
    const topLevelClauses = sectionsChildren.filter((c) => c.type === 'clause');
    expect(topLevelClauses.length).toBe(2);
    // ...and the ORIGINAL clause still holds its paragraph as a direct child
    // (no auto-wrap into a subclause).
    const first = topLevelClauses[0] as { content?: Array<{ type: string }> };
    expect((first?.content ?? []).map((c) => c.type)).toContain('paragraph');
  });

  test('Selecting "Abstract" creates a preface container and inserts the abstract inside it', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'body text');

    await toolbarButton(page, 'Section').click();
    await page.locator('.mn-section-popover[popover]').getByRole('button', { name: 'Abstract', exact: true }).click();

    const doc = await getDoc(page) as { content: Array<{ type: string; content?: unknown[] }> };
    const docStr = JSON.stringify(doc);

    // A preface container should exist.
    expect(docStr).toContain('"preface"');
    // An abstract should exist.
    expect(docStr).toContain('"abstract"');

    // The preface should contain the abstract.
    const preface = doc.content.find((c) => c.type === 'preface');
    expect(preface).toBeDefined();
    const prefaceChildren = preface?.content as Array<{ type: string }>;
    expect(prefaceChildren.some((c) => c.type === 'abstract')).toBe(true);
  });

  test('Selecting "References" creates a bibliography container with the references inside', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'body text');

    await toolbarButton(page, 'Section').click();
    await page.locator('.mn-section-popover[popover]').getByRole('button', { name: 'References', exact: true }).click();

    const doc = await getDoc(page) as { content: Array<{ type: string; content?: unknown[] }> };
    const docStr = JSON.stringify(doc);

    // A bibliography container should exist.
    expect(docStr).toContain('"bibliography"');
    // A references node should exist.
    expect(docStr).toContain('"references"');

    // The bibliography should contain the references.
    const bib = doc.content.find((c) => c.type === 'bibliography');
    expect(bib).toBeDefined();
    const bibChildren = bib?.content as Array<{ type: string }>;
    expect(bibChildren.some((c) => c.type === 'references')).toBe(true);
  });

  test('Selecting "Annex" inserts a doc-level annex after sections (not inside sections)', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'body text');

    await toolbarButton(page, 'Section').click();
    await page.locator('.mn-section-popover[popover]').getByRole('button', { name: 'Annex', exact: true }).click();

    const doc = await getDoc(page) as { content: Array<{ type: string; content?: unknown[] }> };
    const docStr = JSON.stringify(doc);

    // An annex should exist.
    expect(docStr).toContain('"annex"');

    // The annex must be a DOC-LEVEL child (sibling of sections), not inside it.
    const docChildTypes = doc.content.map((c) => c.type);
    expect(docChildTypes).toContain('annex');
    expect(docChildTypes).toContain('sections');
    // And the annex must come after sections.
    expect(docChildTypes.indexOf('annex')).toBeGreaterThan(docChildTypes.indexOf('sections'));
    // And sections must NOT contain the annex.
    const sections = doc.content.find((c) => c.type === 'sections');
    const sectionsChildren = (sections?.content ?? []).map((c: { type: string }) => c.type);
    expect(sectionsChildren).not.toContain('annex');
  });

  test('Inserting a clause inside a text-bearing clause creates a sibling (no auto-wrap)', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'intro text');

    // Insert a clause while the cursor is inside the text-bearing clause.
    await toolbarButton(page, 'Section').click();
    await page.locator('.mn-section-popover[popover]').getByRole('button', { name: 'Clause', exact: true }).click();

    const doc = await getDoc(page) as {
      content: Array<{ type: string; content?: unknown[] }>;
    };

    // Sibling semantics: the original clause keeps [section_title, paragraph]
    // as direct children; the new clause is a SIBLING after it.
    const sections = doc.content.find((c) => c.type === 'sections');
    const sectionsChildren = (sections?.content ?? []) as Array<{ type: string; content?: Array<{ type: string }> }>;
    expect(sectionsChildren.map((c) => c.type)).toEqual(['clause', 'clause']);
    const original = sectionsChildren[0];
    const childTypes = (original?.content ?? []).map((c) => c.type);
    expect(childTypes).toEqual(['section_title', 'paragraph']);
    // The typed text survives in the original clause's body.
    expect(JSON.stringify(original)).toContain('intro text');
  });

  test('The auto-wrapped subclause gets a section_title (no headingless wrap) — via Demote', async ({ page }) => {
    await openEditor(page);
    // Two sibling clauses; demoting the second into the first exercises the
    // wrap path that still uses ensureSubclauseCapacity (the Demote command).
    await typeInEditor(page, 'first body');
    await toolbarButton(page, 'Section').click();
    await page.locator('.mn-section-popover[popover]').getByRole('button', { name: 'Clause', exact: true }).click();
    await page.keyboard.type('second heading');

    // Demote the second clause into the first (cursor is in the second).
    await toolbarButton(page, 'Demote').click();

    const doc = await getDoc(page) as {
      content: Array<{ type: string; content?: unknown[] }>;
    };
    const sections = doc.content.find((c) => c.type === 'sections') as
      { content: Array<{ type: string; content: Array<{ type: string; content?: unknown[] }> }> } | undefined;
    const outer = (sections?.content ?? []).find((c) => c.type === 'clause');

    // The demoted structure: [title, wrapClause(original blocks), clause(moved)].
    const kids = (outer?.content ?? []).map((c) => c.type);
    expect(kids[0]).toBe('section_title');
    expect(kids.filter((t) => t === 'clause').length).toBe(2);
    // The wrap clause (the FIRST subclause) must LEAD with a section_title —
    // without it the wrapped text sits in a headingless clause, and
    // `section_title?` being a leading child means no command can add one
    // afterwards.
    const wrapClause = (outer?.content ?? []).find((c) => c.type === 'clause');
    const wrapKids = (wrapClause?.content ?? []).map((c) => c.type);
    expect(wrapKids[0]).toBe('section_title');
    // ...and the wrapped body content is preserved after the title.
    expect(wrapKids).toContain('paragraph');
  });

  test('Demote into an empty-body sibling replaces the placeholder (no phantom clause)', async ({ page }) => {
    await openEditor(page);
    // The reported document shape, loaded verbatim via the test hook: first
    // clause ("fff") has only its empty placeholder paragraph; "sadf" carries
    // body text. Deterministic — no click choreography.
    await page.evaluate(() => {
      (window).__mnLoadDoc?.({
        type: 'doc',
        content: [
          { type: 'bibdata', attrs: { item: null, data: {} } },
          { type: 'sections', content: [
            { type: 'clause', attrs: { id: '_document_container' }, content: [
              { type: 'section_title', content: [{ type: 'text', text: 'fff' }] },
              { type: 'paragraph' },
            ] },
            { type: 'clause', attrs: { id: 'sadf-clause' }, content: [
              { type: 'section_title', content: [{ type: 'text', text: 'sadf' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'testtestasdfsdfasdf' }] },
            ] },
          ] },
        ],
      });
    });

    // Caret into the sadf clause's body via keyboard: click the first <p>
    // (lands in fff's empty paragraph after the placeholderClick fix), then
    // ArrowDown into sadf's body.
    const p = page.locator('.ProseMirror p').first();
    await p.click({ force: true });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');

    await toolbarButton(page, 'Demote').click();

    const doc = await getDoc(page) as {
      content: Array<{ type: string; content?: unknown[] }>;
    };
    const sections = doc.content.find((c) => c.type === 'sections') as
      { content: Array<{ type: string; content: Array<{ type: string; content?: unknown[] }> }> } | undefined;
    const outer = (sections?.content ?? []).find((c) => c.type === 'clause');
    const outerKids = (outer?.content ?? []).map((c) => c.type);

    // The empty placeholder paragraph is REPLACED by the demoted clause —
    // no phantom headingless subclause ahead of it.
    expect(outerKids).toEqual(['section_title', 'clause']);
    // ...and the demoted clause keeps its heading + body.
    const moved = (outer?.content ?? []).find((c) => c.type === 'clause') as
      { content?: Array<{ type: string; content?: unknown[] }> } | undefined;
    const movedJSON = JSON.stringify(moved);
    expect(movedJSON).toContain('sadf');
    expect(movedJSON).toContain('testtestasdfsdfasdf');
  });

  test('Floating title button is enabled in a blocks-only clause (inserts at sections level)', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'body text');

    // The default doc's clause is blocks-only (title+paragraph). The deepest
    // admitting ancestor is `sections` itself, so the button IS enabled and
    // the FT lands at sections top level, after the clause.
    const ftBtn = toolbarButton(page, 'Floating title');
    await expect(ftBtn).toBeEnabled();

    await ftBtn.click();

    const doc = await getDoc(page) as {
      content: Array<{ type: string; content?: Array<{ type: string }> }>;
    };
    const sections = doc.content.find((c) => c.type === 'sections');
    const sectionsChildren = sections?.content ?? [];
    const types = sectionsChildren.map((c) => c.type);
    expect(types).toContain('floating_title');
    expect(types).toContain('clause');
    // FT comes after the clause
    expect(types.indexOf('floating_title')).toBeGreaterThan(types.indexOf('clause'));
    // FT is NOT inside the clause
    const clause = sectionsChildren.find((c) => c.type === 'clause') as
      { type: string; content?: Array<{ type: string }> } | undefined;
    const clauseKids = (clause?.content ?? []).map((c) => c.type);
    expect(clauseKids).not.toContain('floating_title');
    // depth attr
    const docStr = JSON.stringify(doc);
    expect(docStr).toContain('"depth":1');
  });

  test('Floating title lands at sections top level after a sibling clause insert', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'body text');

    // Insert a Clause — a SIBLING after the current one (no auto-wrap: the
    // original clause stays in the blocks branch).
    await toolbarButton(page, 'Section').click();
    await page.locator('.mn-section-popover[popover]').getByRole('button', { name: 'Clause', exact: true }).click();

    // Now insert a floating title. The cursor is in the new sibling clause
    // (blocks-only), so the deepest admitting ancestor is `sections` itself.
    await toolbarButton(page, 'Floating title').click();

    const doc = await getDoc(page) as {
      content: Array<{ type: string; content?: unknown[] }>;
    };
    const sections = doc.content.find((c) => c.type === 'sections');
    const sectionsChildren = (sections?.content ?? []) as Array<{ type: string; content?: Array<{ type: string }> }>;
    const types = sectionsChildren.map((c) => c.type);
    // Two sibling clauses, then the FT at sections top level.
    expect(types).toEqual(['clause', 'clause', 'floating_title']);
    // Neither original clause got restructured.
    const first = sectionsChildren[0];
    expect((first?.content ?? []).map((c) => c.type)).toEqual(['section_title', 'paragraph']);
  });

  test('A second front-matter insert appends to the existing preface (no duplicate container)', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'body text');

    // Insert an abstract (creates preface).
    await toolbarButton(page, 'Section').click();
    await page.locator('.mn-section-popover[popover]').getByRole('button', { name: 'Abstract', exact: true }).click();

    // Click back into the body to re-focus the editor.
    await clickEditor(page);

    // Insert a foreword (should append to existing preface).
    await toolbarButton(page, 'Section').click();
    await page.locator('.mn-section-popover[popover]').getByRole('button', { name: 'Foreword', exact: true }).click();

    const doc = await getDoc(page) as { content: Array<{ type: string; content?: unknown[] }> };
    const docStr = JSON.stringify(doc);

    // Should have exactly one preface container.
    const prefaceCount = (docStr.match(/"preface"/g) || []).length;
    expect(prefaceCount).toBe(1);

    // The preface should contain both abstract and foreword.
    const preface = doc.content.find((c) => c.type === 'preface');
    const prefaceChildren = preface?.content as Array<{ type: string }>;
    const childTypes = prefaceChildren.map((c) => c.type);
    expect(childTypes).toContain('abstract');
    expect(childTypes).toContain('foreword');
  });
});
