/**
 * Shared locators and fixtures for the editor-gui e2e specs.
 *
 * Importing these from every spec keeps selector drift in one place — if the
 * bootstrap mount quirk or a class name changes, update it here once.
 *
 * ## Interaction rules (learned the hard way — see the table-resize work)
 *
 * 1. **Real (non-`force`) clicks wherever ProseMirror selection state must
 *    sync.** Forced clicks bypass PM's mouse pipeline: the DOM selection
 *    moves, PM's own selection state does not — and PM commands (copy
 *    serialization, keymaps, paste placement) read PM state, not the DOM
 *    selection. Symptom: a copy serializes an empty slice, a paste lands
 *    nowhere, despite a healthy-looking DOM selection.
 *
 * 2. **After any toolbar interaction, click back into the editor before
 *    driving the keyboard.** Toolbar buttons keep focus; a subsequent
 *    `Ctrl+A`/`Enter` goes to the button, not the editor keymap.
 *
 * 3. **Keyboard select-all is unreliable for PM-state selection.** A
 *    keyboard `Ctrl+A` can be consumed by the browser's native select-all
 *    without updating PM state. Use {@link selectAllInEditor}, which drives
 *    the DOM selection PM observes (execCommand) and polls for the sync.
 */
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * The ProseMirror contenteditable.
 *
 * `bootstrap.tsx` removes the original `#app` after mount and renders into a
 * `.appwrapper` div, so the editor surface lives under `.appwrapper` — not
 * `#app`. The contenteditable itself is the `.ProseMirror` inside the
 * layout's doc panel (`.mn-doc-panel`, a deliberate GLOBAL class on the
 * panel's scroll container — `panels.tsx`).
 *
 * ## Selector discipline (verified the hard way)
 *
 * NEVER select on CSS-module classes (`style.module.css` exports like
 * `minimapPane`): production minification renames them to bare hashes
 * (esbuild local-css emitted `minimapPane` as `"s"` — the name does not
 * survive), so class/substring selectors silently match nothing. Stable
 * selectors: GLOBAL classes (`.mn-doc-panel`, `.mn-minimap`, engine
 * `.dv-*`), the engine's `.ProseMirror`, and ARIA roles.
 */
export function editor(page: Page): Locator {
  return page.locator('.appwrapper .mn-doc-panel .ProseMirror');
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
  const p = page.locator('.appwrapper .mn-doc-panel .ProseMirror p').first();
  await p.click({ force: true });
}

/**
 * Place the caret in the body PARAGRAPH (not the `section_title` heading).
 *
 * The default document's clause is `section_title + paragraph`; the plain
 * {@link clickEditor} click can resolve into the heading, where
 * block-insertion buttons (Def list, Table, Image, …) are disabled by design —
 * a heading is not body content.
 *
 * Self-verifying: types a probe character, asks the app whether the caret's
 * parent textblock is a paragraph (via the e2e hook's DOM state), removes the
 * probe, and retries the click if it landed in the heading.
 */
export async function clickBodyParagraph(page: Page): Promise<void> {
  const pm = editor(page);
  await pm.focus();
  const p = page.locator('.appwrapper .mn-doc-panel .ProseMirror p').first();

  for (let attempt = 0; attempt < 5; attempt++) {
    const box = await p.boundingBox();
    if (box === null) throw new Error('clickBodyParagraph: no paragraph found');
    await page.mouse.click(box.x + Math.min(10, box.width / 2), box.y + box.height / 2);
    // Probe: type, check the caret's textblock DOM parent, undo.
    await page.keyboard.type('x');
    const inParagraph = await page.evaluate(() => {
      const sel = document.getSelection();
      const node = sel?.focusNode;
      const el = node instanceof Element ? node : node?.parentElement;
      return el?.closest('p') !== null && el?.closest('.mn-section-title') === null;
    });
    await page.keyboard.press('Backspace');
    if (inParagraph) return;
  }
  throw new Error('clickBodyParagraph: caret would not land in the body paragraph');
}

/** The toolbar container (`role="toolbar"`). */
export function toolbar(page: Page): Locator {
  return page.getByRole('toolbar');
}

/**
 * A toolbar button by its visible label (e.g. "Bold", "Section", "Table").
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
 * Delete the File System Access pickers for every subsequent navigation of
 * this page, so `browser-fs-access` deterministically takes its fallbacks:
 * Save downloads via `<a download>` (capturable as a Playwright `download`
 * event, see {@link chromeSave}), Open uses a programmatic file input
 * (drivable via the `filechooser` event, see {@link chromeOpen}).
 *
 * Must run BEFORE navigation — `addInitScript` only affects future loads —
 * which is why it is exposed only as the `forcePickerFallback` option of
 * the open* helpers, never as a standalone post-navigation call.
 */
function forcePickerFallback(page: Page): void {
  void page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  });
}

/**
 * Open the editor with the e2e flag set (enables the `window.__mnGetDoc` test
 * hook in App.tsx), then wait for the surface to be ready. With
 * `forcePickerFallback`, the Save/Open buttons take browser-fs-access's
 * fallback paths (see {@link forcePickerFallback}) — required by
 * {@link chromeSave}/{@link chromeOpen}.
 */
export async function openEditor(
  page: Page,
  opts: { forcePickerFallback?: boolean } = {},
): Promise<void> {
  if (opts.forcePickerFallback) forcePickerFallback(page);
  await page.goto('/?e2e=1');
  await editor(page).waitFor({ state: 'visible' });
}

/**
 * Drag the toolbar floating window to the RIGHT edge of the layout area,
 * via its titlebar drag-grip (the library's drag affordance — a product
 * gesture, not an engine back door).
 *
 * Why: the preset seeds the floats at the TOP-LEFT, directly over the
 * document's opening content, and `clickBodyParagraph` deliberately
 * clicks near the paragraph's LEFT edge (x+10) — squarely under the
 * toolbar window. Specs that BOTH click early document content AND use
 * toolbar buttons cannot dismiss the toolbar (its buttons are their
 * subject) — they park it right instead. The drag's release runs the
 * library's settle sequence; each Playwright test gets a fresh context
 * (fresh localStorage → preset floats), so parking never leaks across
 * tests.
 */
export async function parkToolbarRight(page: Page): Promise<void> {
  const win = page.locator('.dv-resize-container:has([role="toolbar"])').first();
  const winBox = await win.boundingBox();
  const gripBox = await win.locator('.mn-drag-grip').boundingBox();
  if (winBox === null || gripBox === null) return;
  const dx = Math.round(1148 - winBox.x);
  if (Math.abs(dx) < 4) return;
  const cx = gripBox.x + gripBox.width / 2;
  const cy = gripBox.y + gripBox.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy, { steps: 10 });
  await page.mouse.up();
  // Let the library's drag-retire + pin pass + persist settle.
  await page.waitForTimeout(150);
}

/**
 * Close a floating window via its tab close action (product gesture).
 * No-op if no visible close button exists (already closed).
 */
export async function closeFloatWindow(
  page: Page,
  within: string,
): Promise<void> {
  const btn = page
    .locator(`.dv-groupview:has(${within})`)
    .locator('.dv-default-tab-action:visible')
    .first();
  if (await btn.count() === 0) return;
  await btn.click();
  await page.waitForTimeout(150);
}

/**
 * Open the editor with the toolbar parked at the right edge and the
 * minimap window CLOSED — the standard setup for specs that interact
 * with early document content and toolbar buttons.
 *
 * The minimap must ALSO go (not just move): a right-parked minimap
 * covers wide tables' right-edge cells and column handles
 * (table-resize), and any left position covers the left-edge paragraph
 * clicks. No parked spec reads the minimap — only minimap.spec does, and
 * it uses plain openEditor (the floats are its subject).
 */
export async function openParkedEditor(
  page: Page,
  opts: { forcePickerFallback?: boolean } = {},
): Promise<void> {
  await openEditor(page, opts);
  await closeFloatWindow(page, '.mn-minimap');
  await parkToolbarRight(page);
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
 * Click the chrome bar's Save button and return the saved file as a parsed
 * envelope object. Arm-before-click: the `download` event waiter must exist
 * before the click — arming after it is the lost-event flake. Requires
 * `forcePickerFallback` on the open* helper; otherwise the click opens a
 * native save picker and no download ever fires.
 */
export async function chromeSave(page: Page): Promise<Record<string, unknown>> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save…', exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (downloadPath === null) throw new Error('chromeSave: download has no path');
  return JSON.parse(readFileSync(downloadPath, 'utf8')) as Record<string, unknown>;
}

/**
 * Click the chrome bar's Open button and answer the file chooser with
 * `fixturePath`. Arm-before-click (see {@link chromeSave}). Requires
 * `forcePickerFallback` on the open* helper. Returns when the file has been
 * handed to the app — the caller waits for the document (or status line) to
 * reflect it.
 */
export async function chromeOpen(page: Page, fixturePath: string): Promise<void> {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open…', exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(fixturePath);
}

/**
 * Select all editor content with a selection ProseMirror can see.
 *
 * Drives the DOM selection via `execCommand('selectAll')` on the focused PM
 * root (which PM observes and syncs into its own selection state), then
 * polls until the DOM selection is non-empty. Replaces keyboard `Ctrl+A`:
 * after a toolbar click the button holds focus (the keypress never reaches
 * the editor keymap), and even focused, the browser's native select-all can
 * consume the keypress without updating PM state — the copy handler then
 * serializes an empty slice.
 */
export async function selectAllInEditor(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelector('.mn-doc-panel .ProseMirror')?.focus();
    document.execCommand('selectAll');
  });
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString().length ?? 0), {
      timeout: 5_000,
    })
    .toBeGreaterThan(0);
}

/**
 * Dispatch a synthetic `copy` on the ProseMirror root and return the
 * serialized `text/html` payload.
 *
 * Synthetic (ClipboardEvent + DataTransfer) because it needs no clipboard
 * permissions while exercising the true pipeline: PM's copy handler →
 * `serializeForClipboard` → any plugin `clipboardSerializer` prop. Call
 * {@link selectAllInEditor} (or otherwise set a PM-visible selection)
 * first — the handler serializes from PM state, not the DOM selection.
 *
 * ## Engine divergence (read before "simplifying" this)
 *
 * The `clipboardData` member of `ClipboardEventInit` is normative
 * (w3c/clipboard-apis §5.1), but Firefox's constructor ignores it
 * (bugzilla 2027025; w3c/clipboard-apis#64): the event carries its OWN
 * fresh `DataTransfer` instead, and that is what PM's listener writes
 * into. Chromium honors the init dict — the passed `dt` IS the store
 * listeners see. So the payload is read back from whichever store exists
 * (`ev.clipboardData` post-dispatch; identical to `dt` on Chromium).
 */
export async function dispatchCopy(page: Page): Promise<string> {
  return page.evaluate(() => {
    const dt = new DataTransfer();
    const target = document.querySelector('.mn-doc-panel .ProseMirror');
    if (target === null) throw new Error('dispatchCopy: editor root not found');
    const ev = new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
    // Firefox: PM wrote into the event's own store; Chromium: into `dt`
    // (the same object as `ev.clipboardData`).
    return (ev.clipboardData ?? dt).getData('text/html');
  });
}

/**
 * Dispatch a synthetic `paste` carrying `text/html` on the ProseMirror
 * root.
 *
 * Exercises the true paste pipeline: PM's paste handler →
 * `parseFromClipboard` → the schema `DOMParser` (parseDOM rules, including
 * `getAttrs`). No clipboard permissions needed. The caret/selection in PM
 * state determines the paste location — see the interaction rules in the
 * module docblock.
 *
 * ## Engine divergence (see {@link dispatchCopy})
 *
 * Firefox ignores the init-dict `clipboardData` and gives the event its
 * own fresh store — the ONLY one PM's handler can read — so the payload
 * is written into `ev.clipboardData ?? dt` before dispatch (identical to
 * writing `dt` directly on Chromium).
 */
export async function dispatchPasteHtml(page: Page, html: string): Promise<void> {
  await page.evaluate((payload: string) => {
    const dt = new DataTransfer();
    const target = document.querySelector('.mn-doc-panel .ProseMirror');
    if (target === null) throw new Error('dispatchPasteHtml: editor root not found');
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    // Firefox: the event's own store (the init-dict dt is discarded);
    // Chromium: same object as dt.
    (ev.clipboardData ?? dt).setData('text/html', payload);
    target.dispatchEvent(ev);
  }, html);
}
