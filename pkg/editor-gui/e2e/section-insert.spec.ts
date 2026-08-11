import { expect, test } from '@playwright/test';
import { openEditor, toolbarButton, typeInEditor, getDoc, clickEditor } from './helpers.js';

test.describe('section-insert', () => {
  test('Section button opens popover; menu shows all section types in three groups', async ({ page }) => {
    await openEditor(page);
    await clickEditor(page);

    // Click the "Section" toolbar button.
    await toolbarButton(page, 'Section').click();

    // The popover should be visible.
    const popover = page.locator('.mn-section-popover[popover]');
    await expect(popover).toBeVisible();

    // Three cohort group headings should be present.
    await expect(popover.locator('.mn-section-popover__heading', { hasText: 'Front matter' })).toBeVisible();
    await expect(popover.locator('.mn-section-popover__heading', { hasText: 'Body' })).toBeVisible();
    await expect(popover.locator('.mn-section-popover__heading', { hasText: 'Back matter' })).toBeVisible();

    // All 10 section types should be offered as buttons.
    for (const label of [
      'Abstract', 'Foreword', 'Introduction', 'Acknowledgements',
      'Clause', 'Annex', 'Content section', 'Terms', 'Definitions',
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

    const docStr = JSON.stringify(await getDoc(page));
    // The doc should have two clauses inside sections.
    const clauseCount = (docStr.match(/"clause"/g) || []).length;
    expect(clauseCount).toBe(2);
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
