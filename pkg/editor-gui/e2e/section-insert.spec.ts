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

  test('Selecting "Clause" inserts a clause sibling after the current section', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'first clause');

    // Insert a second clause via the Section popover.
    await toolbarButton(page, 'Section').click();
    await page.locator('.mn-section-popover[popover]').getByRole('button', { name: 'Clause', exact: true }).click();

    const doc = await getDoc(page) as { content: Array<{ type: string; content?: unknown[] }> };

    // Under the strict clause model, inserting a clause into a text-bearing
    // clause wraps the original blocks into a subclause first, so the top-level
    // count is 2 clauses inside sections (the original + the new one).
    const sections = doc.content.find((c) => c.type === 'sections');
    const sectionsChildren = (sections?.content ?? []) as Array<{ type: string }>;
    const topLevelClauses = sectionsChildren.filter((c) => c.type === 'clause');
    expect(topLevelClauses.length).toBe(2);
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

  test('Inserting a clause inside a text-bearing clause auto-wraps its blocks (strict model)', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'intro text');

    // Insert a clause while the cursor is inside the text-bearing clause.
    await toolbarButton(page, 'Section').click();
    await page.locator('.mn-section-popover[popover]').getByRole('button', { name: 'Clause', exact: true }).click();

    const doc = await getDoc(page) as {
      content: Array<{ type: string; content?: unknown[] }>;
    };

    // Find the top-level clause inside sections.
    const sections = doc.content.find((c) => c.type === 'sections');
    const outer = (sections?.content ?? []).find((c: { type: string }) => c.type === 'clause') as
      { type: string; content: Array<{ type: string }> } | undefined;
    expect(outer).toBeDefined();

    const childTypes = (outer?.content ?? []).map((c) => c.type);
    // Strict model: title + subclause(wrapped original blocks) + new clause.
    // No hanging paragraph remains a direct child of the outer clause.
    expect(childTypes[0]).toBe('section_title');
    expect(childTypes).toContain('clause');
    expect(childTypes).not.toContain('paragraph');
    expect(childTypes).not.toContain('table');
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

  test('Floating title lands in the subclause run after a clause insert', async ({ page }) => {
    await openEditor(page);
    await typeInEditor(page, 'body text');

    // Insert a Clause — the auto-wrap puts the original blocks into a
    // subclause, so the outer clause is now in the subclause branch.
    await toolbarButton(page, 'Section').click();
    await page.locator('.mn-section-popover[popover]').getByRole('button', { name: 'Clause', exact: true }).click();

    // Now insert a floating title — it goes inside the outer clause, after
    // the new clause.
    await toolbarButton(page, 'Floating title').click();

    const doc = await getDoc(page) as {
      content: Array<{ type: string; content?: unknown[] }>;
    };
    const sections = doc.content.find((c) => c.type === 'sections');
    const outer = (sections?.content ?? []).find((c: { type: string }) => c.type === 'clause') as
      { type: string; content: Array<{ type: string }> } | undefined;
    const kids = (outer?.content ?? []).map((c) => c.type);
    // [section_title, clause(wrapped blocks), clause(new), floating_title]
    expect(kids[0]).toBe('section_title');
    expect(kids.filter((t) => t === 'clause').length).toBe(2);
    expect(kids[kids.length - 1]).toBe('floating_title');
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
