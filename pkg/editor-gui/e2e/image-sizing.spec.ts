/**
 * Image sizing e2e (schema.spec.md §17.8; images-figures.md §8;
 * MetanormaProseMirror.spec.md §6.3).
 *
 * Covers: live parseDOM normalization via paste (foreign HTML sizes, role
 * keywords, `data` banking), node-view paint (inline size style, role
 * class), the Size popover flows (`updateImageAttrs` — the role⇔size
 * exclusion), the backfill plugin (data-URI-only scope, history-invisible
 * dispatch, failure memo), and the dialog's commit-time mimetype +
 * natural-size capture (§17.4's two inference populations).
 */
import { expect, test } from '@playwright/test';
import {
  openParkedEditor,
  toolbarButton,
  getDoc,
  clickBodyParagraph,
  dispatchPasteHtml,
} from './helpers.js';

/** A 1×1 transparent PNG (real decodable bytes). */
const PNG_1x1_DATAURL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG_1x1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Find the first node of `type` in the doc JSON (or null). */
function findNode(doc: unknown, type: string): any {
  let found: any = null;
  const walk = (node: any) => {
    if (found !== null) return;
    if (node.type === type) {
      found = node;
      return;
    }
    for (const c of node.content ?? []) walk(c);
  };
  walk(doc);
  return found;
}

const findImage = (doc: unknown): any => findNode(doc, 'image');
const figureAttrs = (doc: unknown): any | null => findNode(doc, 'figure')?.attrs ?? null;

const UNDO = process.platform === 'darwin' ? 'Meta+z' : 'Control+z';

/** Paste `<figure><figcaption/><img …></figure>` HTML into the body. */
async function pasteFigure(
  page: import('@playwright/test').Page,
  figureAttrsHtml: string,
  imgAttrsHtml: string,
  src: string,
): Promise<void> {
  await dispatchPasteHtml(
    page,
    `<figure${figureAttrsHtml}><figcaption class="mn-figure-name"></figcaption>` +
      `<img src="${src}"${imgAttrsHtml}></figure>`,
  );
}

test.describe('image sizing — live parseDOM normalization (paste)', () => {
  test('intra-editor data-* round to typed attrs; keyword figure width maps to the role', async ({ page }) => {
    await openParkedEditor(page);
    await clickBodyParagraph(page);
    await pasteFigure(page, ' data-width="text-width"', ' data-width="150px" data-height="50%" data-mimetype="image/png"', PNG_1x1_DATAURL);
    const doc = await getDoc(page);
    const image = findImage(doc);
    expect(image).not.toBeNull();
    expect(image.attrs.width).toBe(150); // "150px" → 150 (§17.8 import table)
    expect(image.attrs.height).toBe('50%');
    expect(image.attrs.mimetype).toBe('image/png');
    // (The DOM clipboard cannot carry x-natural-* — §6 rule 5 — but the
    // backfill plugin's idle pass may already have re-derived them by the
    // time getDoc polls, so their value here is racy and deliberately not
    // asserted; the drop is unit-covered and the re-derivation e2e-covered
    // in the backfill suite below.)
    expect(figureAttrs(doc).width).toBe('text-width');
  });

  test('foreign HTML sizes: raw attrs normalize, garbage banks verbatim, style percent accepted', async ({ page }) => {
    await openParkedEditor(page);
    await clickBodyParagraph(page);
    await pasteFigure(page, ' width="full-page-width"', ' width="10cm" style="height:33%"', 'x.png');
    const doc = await getDoc(page);
    const image = findImage(doc);
    expect(image.attrs.width).toBeNull();        // "10cm" foreign → null typed…
    expect(image.attrs.data.width).toBe('10cm'); // …banked verbatim (§17.8)
    expect(image.attrs.height).toBe('33%');      // percent-only inline style
    expect(figureAttrs(doc).width).toBe('full-page-width'); // raw width attr → role
  });

  test('foreign non-keyword figure width banks into figure data (free-text slot)', async ({ page }) => {
    await openParkedEditor(page);
    await clickBodyParagraph(page);
    await pasteFigure(page, ' data-width="60%"', '', 'x.png');
    const doc = await getDoc(page);
    const attrs = figureAttrs(doc);
    expect(attrs.width).toBeNull();       // not a keyword → role null
    expect(attrs.data.width).toBe('60%'); // banked verbatim (grammar text)
  });
});

test.describe('image sizing — node-view paint', () => {
  test('authored size paints inline; role class rides the figure', async ({ page }) => {
    await openParkedEditor(page);
    await clickBodyParagraph(page);
    await pasteFigure(page, ' data-width="text-width"', ' data-width="150" data-height="50%"', PNG_1x1_DATAURL);
    const img = page.locator('figure.mn-figure img');
    // Authored size → inline style (numbers as px, percent verbatim).
    await expect(img).toHaveAttribute('style', /width:\s*150px/);
    await expect(img).toHaveAttribute('style', /height:\s*50%/);
    // Role class alongside the base; the cap applies under the class
    // (Chromium reports the percentage max-width as-is).
    const fig = page.locator('figure.mn-figure.mn-figure--text-width');
    await expect(fig).toHaveCount(1);
    await expect(fig.locator('img')).toHaveCSS('max-width', '100%');
  });
});

test.describe('image sizing — Size popover flows (updateImageAttrs)', () => {
  /** Build a filled figure via the two-stage flow, caret ends near it. */
  async function buildFilledFigure(page: import('@playwright/test').Page): Promise<void> {
    await openParkedEditor(page);
    await clickBodyParagraph(page);
    await toolbarButton(page, 'Figure').click();
    await toolbarButton(page, 'Image').click();
    const dialog = page.locator('.mn-image-dialog[popover]');
    await dialog.locator('#mn-img-src').fill(PNG_1x1_DATAURL);
    await dialog.getByRole('button', { name: 'Insert' }).click();
    await expect(dialog).toBeHidden();
  }

  async function openSizePopover(page: import('@playwright/test').Page) {
    await page.locator('figure.mn-figure img').click(); // caret inside figure
    const btn = toolbarButton(page, 'Size');
    await expect(btn).toBeEnabled();
    await btn.click();
    const pop = page.locator('.mn-toolbar-image-sizing .mn-image-sizing-dialog[popover]');
    await expect(pop).toBeVisible();
    return pop;
  }

  test('entering a size clears the role; choosing a role clears size; auto clears size only', async ({ page }) => {
    await buildFilledFigure(page);

    // 1. Enter width 150 → image.width set, role null.
    let pop = await openSizePopover(page);
    await pop.locator('#mn-img-size-w').fill('150');
    await pop.getByRole('button', { name: 'Apply' }).click();
    await expect(pop).toBeHidden();
    let doc = await getDoc(page);
    expect(findImage(doc).attrs.width).toBe(150);
    expect(figureAttrs(doc).width).toBeNull();

    // 2. Choose role text-width → role set, numeric size cleared (both axes).
    pop = await openSizePopover(page);
    await pop.locator('#mn-img-size-role').selectOption('text-width');
    await pop.getByRole('button', { name: 'Apply' }).click();
    await expect(pop).toBeHidden();
    doc = await getDoc(page);
    const image = findImage(doc);
    expect(image.attrs.width).toBeNull();
    expect(image.attrs.height).toBeNull();
    expect(figureAttrs(doc).width).toBe('text-width');

    // 3. auto reset: width "auto" → size cleared, role RETAINED.
    pop = await openSizePopover(page);
    await pop.locator('#mn-img-size-w').fill('auto');
    await pop.getByRole('button', { name: 'Apply' }).click();
    await expect(pop).toBeHidden();
    doc = await getDoc(page);
    expect(findImage(doc).attrs.width).toBeNull();
    expect(figureAttrs(doc).width).toBe('text-width');
  });

  test('invalid input surfaces an inline error and changes nothing', async ({ page }) => {
    await buildFilledFigure(page);
    const pop = await openSizePopover(page);
    await pop.locator('#mn-img-size-w').fill('10cm');
    await pop.getByRole('button', { name: 'Apply' }).click();
    await expect(pop).toBeVisible();
    await expect(pop.locator('.mn-toolbar-dialog-error')).toContainText('Sizes accept');
    expect(findImage(await getDoc(page)).attrs.width).toBeNull();
  });
});

test.describe('image sizing — backfill plugin (§6.3)', () => {
  test('pasted data-URI image lacking x-natural-* is backfilled; undo steps onto the PASTE, not the backfill', async ({ page }) => {
    await openParkedEditor(page);
    await clickBodyParagraph(page);
    await pasteFigure(page, '', '', PNG_1x1_DATAURL);
    // The idle pass backfills 1×1 (real decodable bytes).
    await expect
      .poll(async () => findImage(await getDoc(page))?.attrs['x-natural-width'] ?? null)
      .toBe(1);
    await expect
      .poll(async () => findImage(await getDoc(page))?.attrs['x-natural-height'] ?? null)
      .toBe(1);
    // History-invisible: one undo removes the PASTED image entirely — the
    // backfill added no undo step of its own (addToHistory false).
    await page.keyboard.press(UNDO);
    await expect
      .poll(async () => findImage(await getDoc(page)) ?? null)
      .toBeNull();
  });

  test('remote-URL images are never backfilled (no editor-initiated fetches)', async ({ page }) => {
    await openParkedEditor(page);
    await clickBodyParagraph(page);
    await pasteFigure(page, '', '', 'https://example.org/cat.png');
    // Generous idle window; the attrs must stay null.
    await page.waitForTimeout(800);
    const image = findImage(await getDoc(page));
    expect(image.attrs['x-natural-width']).toBeNull();
    expect(image.attrs['x-natural-height']).toBeNull();
  });

  test('undecodable data URI stays null (failure memo — no poison pill)', async ({ page }) => {
    await openParkedEditor(page);
    await clickBodyParagraph(page);
    await pasteFigure(page, '', '', 'data:image/png;base64,!!!not-a-png!!!');
    await page.waitForTimeout(800);
    const image = findImage(await getDoc(page));
    expect(image).not.toBeNull();
    expect(image.attrs['x-natural-width']).toBeNull();
    expect(image.attrs['x-natural-height']).toBeNull();
  });
});

test.describe('image dialog — commit-time mimetype + natural size (§17.4)', () => {
  test('file insert stores the Blob-derived mimetype and captured natural size', async ({ page }) => {
    await openParkedEditor(page);
    await clickBodyParagraph(page);
    await toolbarButton(page, 'Figure').click();
    await toolbarButton(page, 'Image').click();
    const dialog = page.locator('.mn-image-dialog[popover]');
    await dialog.locator('#mn-img-file').setInputFiles({
      name: 'dot.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_1x1_BASE64, 'base64'),
    });
    await dialog.getByRole('button', { name: 'Insert' }).click();
    await expect(dialog).toBeHidden();
    const image = findImage(await getDoc(page));
    expect(image.attrs.mimetype).toBe('image/png');       // Blob type
    expect(image.attrs['x-natural-width']).toBe(1);       // captured (decodable)
    expect(image.attrs['x-natural-height']).toBe(1);
  });

  test('URL insert with a recognized extension stores the map value; capture fails soft', async ({ page }) => {
    await openParkedEditor(page);
    await clickBodyParagraph(page);
    await toolbarButton(page, 'Figure').click();
    await toolbarButton(page, 'Image').click();
    const dialog = page.locator('.mn-image-dialog[popover]');
    await dialog.locator('#mn-img-src').fill('https://example.org/cat.png');
    await dialog.getByRole('button', { name: 'Insert' }).click();
    await expect(dialog).toBeHidden();
    const image = findImage(await getDoc(page));
    expect(image.attrs.mimetype).toBe('image/png');     // extension map (§17.4 b)
    expect(image.attrs['x-natural-width']).toBeNull();  // unreachable host — capture fails soft
  });

  test('URL insert without a recognized extension stores the UNKNOWN_MIMETYPE marker', async ({ page }) => {
    await openParkedEditor(page);
    await clickBodyParagraph(page);
    await toolbarButton(page, 'Figure').click();
    await toolbarButton(page, 'Image').click();
    const dialog = page.locator('.mn-image-dialog[popover]');
    await dialog.locator('#mn-img-src').fill('https://example.org/cat-image');
    await dialog.getByRole('button', { name: 'Insert' }).click();
    await expect(dialog).toBeHidden();
    expect(findImage(await getDoc(page)).attrs.mimetype).toBe('application/octet-stream');
  });
});
