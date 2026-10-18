/**
 * Two-stage figure authoring e2e (images-figures.md).
 *
 * Verifies the Figure → Image flow end to end: the Figure button creates
 * `figure > [figure_name]` with the cursor in the caption and the
 * empty-figure placeholder visible; the Image dialog (single-mode) fills the
 * figure; deleting the image atom returns the figure to its recoverable
 * caption-only state (the Image button re-enables — the original
 * half-finished-figure bug); and the enabled predicates gate both buttons
 * (Image disabled outside figures; Figure disabled inside them — nesting
 * refusal).
 */
import { expect, test } from '@playwright/test';
import { openEditor, toolbarButton, getDoc, clickBodyParagraph } from './helpers.js';

/** The data-URL src the tests commit through the dialog. */
const SRC = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';

/**
 * The empty-figure placeholder selector (images-figures.md §12): matches a
 * figure whose children are at most the caption — NOT one with body content
 * (image, paragraphs, subfigures). A deliberate text-figure never matches.
 */
const EMPTY_FIG_SELECTOR = 'figure.mn-figure:not(:has(> :not(.mn-figure-name)))';

/** Find the first figure node in the doc JSON (or null). */
function findFigure(doc: any): any {
  let figure: any = null;
  const find = (node: any) => {
    if (figure !== null) return;
    if (node.type === 'figure') { figure = node; return; }
    for (const c of node.content ?? []) find(c);
  };
  find(doc);
  return figure;
}

/** Open the Image dialog and commit SRC + optional alt. */
async function commitImageDialog(page: import('@playwright/test').Page, alt = ''): Promise<void> {
  await toolbarButton(page, 'Image').click();
  const dialog = page.locator('.mn-image-dialog[popover]');
  await dialog.locator('#mn-img-src').fill(SRC);
  if (alt !== '') await dialog.locator('#mn-img-alt').fill(alt);
  await dialog.getByRole('button', { name: 'Insert' }).click();
  await expect(dialog).toBeHidden();
}

test.describe('two-stage figure authoring', () => {
  test('Figure button seeds caption + placeholder; Image fills the same figure', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);
    await page.keyboard.type('intro ');

    // Stage 1 — Figure: doc gains figure > [figure_name], placeholder shown,
    // caret in the caption, Image button enables.
    await toolbarButton(page, 'Figure').click();
    let figure = findFigure(await getDoc(page));
    expect(figure).not.toBeNull();
    expect(figure.content.map((c: any) => c.type)).toEqual(['figure_name']);
    const placeholder = page.locator(EMPTY_FIG_SELECTOR);
    await expect(placeholder).toHaveCount(1);
    await expect(toolbarButton(page, 'Image')).toBeEnabled();

    // Caret is inside the seeded caption — typing fills it.
    await page.keyboard.type('Fig caption');
    figure = findFigure(await getDoc(page));
    const capText = (figure.content[0].content ?? []).map((t: any) => t.text ?? '').join('');
    expect(capText).toBe('Fig caption');

    // Stage 2 — Image: the SAME figure gains the image (no second figure).
    await commitImageDialog(page, 'alt');
    const doc = (await getDoc(page)) as any;
    expect(JSON.stringify(doc).match(/"figure"/g) ?? []).toHaveLength(1);
    figure = findFigure(doc);
    expect(figure.content.map((c: any) => c.type)).toEqual(['figure_name', 'image']);
    expect(figure.content[1].attrs.src).toBe(SRC);
    expect(figure.content[1].attrs.alt).toBe('alt');
    // Placeholder gone once the figure has body content (the img).
    await expect(page.locator(EMPTY_FIG_SELECTOR)).toHaveCount(0);
  });

  test('deleting the image recovers: caption-only figure can be refilled (regression)', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);

    // Build the complete figure, then delete the image atom.
    await toolbarButton(page, 'Figure').click();
    await commitImageDialog(page);
    let figure = findFigure(await getDoc(page));
    expect(figure.content.map((c: any) => c.type)).toEqual(['figure_name', 'image']);
    await expect(toolbarButton(page, 'Image')).toBeDisabled();

    // Node-select the img (clicking an atom selects the node), delete it via
    // Backspace — the wired chain (…→ deleteSelection) handles NodeSelection.
    await page.locator('figure.mn-figure img').click();
    await page.keyboard.press('Backspace');

    // The original bug scenario: figure > [figure_name], placeholder back,
    // Image button re-enabled — recoverable, not a dead end.
    figure = findFigure(await getDoc(page));
    expect(figure).not.toBeNull();
    expect(figure.content.map((c: any) => c.type)).toEqual(['figure_name']);
    await expect(page.locator(EMPTY_FIG_SELECTOR)).toHaveCount(1);
    await expect(toolbarButton(page, 'Image')).toBeEnabled();

    // Caret back in the caption (click into it deterministically) → refill.
    await page.locator('figure.mn-figure figcaption').click({ force: true });
    await page.keyboard.type('still here');
    await commitImageDialog(page);
    figure = findFigure(await getDoc(page));
    expect(figure.content.map((c: any) => c.type)).toEqual(['figure_name', 'image']);
    const capText = (figure.content[0].content ?? []).map((t: any) => t.text ?? '').join('');
    expect(capText).toBe('still here');
  });

  test('triple-clicking the placeholder node-selects the figure without losing it (class merge)', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);

    await toolbarButton(page, 'Figure').click();
    const fig = page.locator('figure.mn-figure');
    await fig.waitFor();

    // Triple-click the placeholder box (::after area, below the caption).
    // PM node-selects the figure; react-prosemirror re-renders it with the
    // ProseMirror-selectednode className PROP — which must MERGE with (not
    // replace) mn-figure, or every .mn-figure-scoped style and the
    // empty-figure placeholder vanishes for the life of the selection.
    const box = await fig.boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height - 10, { clickCount: 3 });

    const cls = await page.locator('figure').first().getAttribute('class');
    expect(cls).toContain('mn-figure');
    expect(cls).toContain('ProseMirror-selectednode');
    const ph = await page.evaluate(() =>
      getComputedStyle(document.querySelector('figure')!, '::after').content);
    expect(ph).toContain('Empty figure');
    // And the doc is untouched — selection only, no mutation.
    const figure = findFigure(await getDoc(page));
    expect(figure.content.map((c: any) => c.type)).toEqual(['figure_name']);
  });

  test('text-figure (paragraphs, no image) shows no placeholder — the label names empty, not image-less', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);

    // Seed a figure, type a caption, then Enter — exitName inserts a
    // paragraph INSIDE the figure. That figure has body content and is a
    // complete Standoc figure (paragraph-with-footnote+ branch); it must not
    // be nagged with a placeholder.
    await toolbarButton(page, 'Figure').click();
    await page.keyboard.type('A text figure');
    await page.keyboard.press('Enter');
    await page.keyboard.type('prose body');

    let figure = findFigure(await getDoc(page));
    expect(figure.content.map((c: any) => c.type)).toEqual(['figure_name', 'paragraph']);
    await expect(page.locator(EMPTY_FIG_SELECTOR)).toHaveCount(0);
    // ...while the Image button still quietly offers to add an image.
    await expect(toolbarButton(page, 'Image')).toBeEnabled();
  });

  test('Image disabled outside figures; Figure disabled inside them (nesting refusal)', async ({ page }) => {
    await openEditor(page);
    await clickBodyParagraph(page);

    // Outside any figure: Image disabled, Figure enabled. Disabled means BOTH
    // signals (base spec §8/§9): the native attribute and the visual contract
    // (opacity/cursor via the --disabled modifier / :disabled rule).
    await expect(toolbarButton(page, 'Image')).toBeDisabled();
    await expect(toolbarButton(page, 'Image')).toHaveClass(/mn-toolbar-btn--disabled/);
    await expect(toolbarButton(page, 'Image')).toHaveCSS('opacity', '0.4');
    await expect(toolbarButton(page, 'Figure')).toBeEnabled();

    // Create a figure; the caret lands in its caption — inside a figure:
    // Figure (nesting refusal) and Image (target present) swap enabled state.
    await toolbarButton(page, 'Figure').click();
    await expect(toolbarButton(page, 'Figure')).toBeDisabled();
    await expect(toolbarButton(page, 'Image')).toBeEnabled();

    // Fill the image — the figure now has one, so Image disables too.
    await commitImageDialog(page);
    await expect(toolbarButton(page, 'Image')).toBeDisabled();

    // Enter from the caption inserts a paragraph INSIDE the figure; the caret
    // is still inside the figure → Figure stays disabled, and Image (the
    // figure has an image) stays disabled.
    await page.keyboard.press('Enter');
    await expect(toolbarButton(page, 'Figure')).toBeDisabled();
    await expect(toolbarButton(page, 'Image')).toBeDisabled();
  });
});
