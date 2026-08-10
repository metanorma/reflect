/**
 * Shared locators and fixtures for the editor-gui e2e specs.
 *
 * Importing these from every spec keeps selector drift in one place — if the
 * bootstrap mount quirk or a class name changes, update it here once.
 */
import type { Locator, Page } from '@playwright/test';

/**
 * The ProseMirror contenteditable.
 *
 * `bootstrap.tsx` removes the original `#app` after mount and renders into a
 * `.appwrapper` div, so the editor surface lives under `.appwrapper` — not
 * `#app`. The contenteditable itself is the `.ProseMirror` inside
 * `.mn-prosemirror`.
 */
export function editor(page: Page): Locator {
  return page.locator('.appwrapper .mn-prosemirror .ProseMirror');
}

/**
 * Click into the editor's editable body (the first paragraph), skipping past
 * the non-editable `bibdata` strip at the top of the document. Uses coordinate-
 * based clicking because the bibdata atom node's `contenteditable=false`
 * wrapper can intercept Playwright's element-level `.click()` on the paragraph.
 */
export async function clickEditor(page: Page): Promise<void> {
  // The editor now starts with a non-editable bibdata atom node at the top.
  // Clicking .ProseMirror directly lands on it. Instead, scroll past it and
  // click on the paragraph area. We use Playwright's .click() on the paragraph
  // element (which generates proper DOM events that ProseMirror can handle),
  // but first dispatch a focus on the editor to ensure ProseMirror is ready.
  const pm = editor(page);
  // Focus the editor surface first.
  await pm.focus();
  // Then click on the first paragraph to place the selection in editable text.
  const p = page.locator('.appwrapper .mn-prosemirror .ProseMirror p').first();
  await p.click({ force: true });
}

/** The toolbar container (`role="toolbar"`). */
export function toolbar(page: Page): Locator {
  return page.getByRole('toolbar');
}

/**
 * A toolbar button by its visible label (e.g. "Bold", "Clause", "Table").
 *
 * Uses exact name matching so that always-rendered (but hidden) popover
 * controls whose accessible names happen to contain a button label (e.g.
 * `<input type="file" name="Image file">` vs the "Image" button) don't
 * produce ambiguous matches.
 */
export function toolbarButton(page: Page, name: string): Locator {
  return page.getByRole('button', { name, exact: true });
}

/**
 * Open the editor with the e2e flag set (enables the `window.__mnGetDoc` test
 * hook in App.tsx), then wait for the surface to be ready.
 */
export async function openEditor(page: Page): Promise<void> {
  await page.goto('/?e2e=1');
  await editor(page).waitFor({ state: 'visible' });
}

/** Click into the editor body (targeting a paragraph, not the bibdata strip)
 * and type text via real keyboard events. */
export async function typeInEditor(page: Page, text: string): Promise<void> {
  await clickEditor(page);
  await page.keyboard.type(text);
}

/**
 * Read the current document as JSON via the test hook (requires `?e2e=1`).
 * Returns a plain object mirroring `state.doc.toJSON()`.
 */
export async function getDoc(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const w = window as { __mnGetDoc?: () => unknown };
    return w.__mnGetDoc?.();
  });
}

/**
 * Select all text in the editor body (Ctrl+A), so subsequent mark toggles or
 * prompt actions apply to the full paragraph.
 */
export async function selectAllInEditor(page: Page): Promise<void> {
  await clickEditor(page);
  await page.keyboard.press('Control+A');
}
