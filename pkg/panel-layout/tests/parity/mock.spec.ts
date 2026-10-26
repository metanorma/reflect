/**
 * mock.spec.ts — semantic parity of the reference mock against the
 * checked-in goldens (the primary parity signal; pixels are the secondary
 * layer in the screenshot test at the end of each checkpoint).
 *
 * The flow sequence mirrors capture-goldens.mjs via the shared
 * tests/parity/flows.mjs drivers, so this spec asserts the SAME captured
 * reality the generator wrote — semantic-first per goldens/README.md:
 * `_normalized` views (runtime ids → g1,g2…) compared with ±1px tolerance
 * on numbers and exact equality elsewhere (diffNormalized). The twin spec,
 * when it exists, runs the identical flows and asserts against the
 * identical fixtures.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  DRAG_STEPS,
  HP5_PARK,
  HP6_RESIZE_DELTA,
  OVERLAY_WARM_MS,
  ZONE_SETTLE_MS,
  attachNormalized,
  closeAllPanels,
  diffNormalized,
  dumpState,
  findPasteboardPoint,
  gotoLoaded,
  groupDropPoint,
  resizeHandlePoint,
  settle,
  tabInfo,
  titlebarPointForWindowWithTab,
  toggleAutoWrap,
  voidPointForGroupWithTab,
  waitZone,
} from './flows.mjs';



const here = dirname(fileURLToPath(import.meta.url));
const GOLDENS = join(here, '..', '..', 'mock', 'goldens');
const BASE_URL
  = 'http://127.0.0.1:4173/mock/editor-dockview7-floats.html';

/** Compared fields of a state snapshot (meta drift like timing is ignored). */
const COMPARED = ['layout', 'storage', 'floats'] as const;

function loadGolden(flow: string): Record<string, unknown> {
  const file = join(GOLDENS, `state-${flow}.json`);
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`missing golden fixture: ${file}`);
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  // fresh storage per spec run: clear from a blank same-origin document
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.removeItem('mn-dockview7-floats-v1');
    localStorage.removeItem('mn-dockview7-heights-v1');
  });
});

// Canonicalize through JSON before comparing: page.evaluate's
// structured-clone retains undefined-valued object keys (dockview's
// toJSON emits constraint keys with undefined values when unset), while
// the golden files — written via JSON.stringify — dropped them.
function jsonCanon(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function expectParity(
  flow: string,
  fresh: { _normalized: Record<string, unknown> | null },
): void {
  const golden = loadGolden(flow);
  const g = golden._normalized as Record<string, unknown>;
  expect(g, `golden state-${flow}.json must carry _normalized`).toBeTruthy();
  const f = jsonCanon(fresh._normalized ?? {}) as Record<string, unknown>;
  for (const key of COMPARED) {
    const diffs = diffNormalized(f[key], g[key], 1);
    expect(
      diffs,
      `state-${flow}.json ${key} drifted vs golden:\n`
      + diffs.join('\n'),
    ).toEqual([]);
  }
}

test('HP1 preset + HP2 unwrap + HP3 merge', async ({ page }) => {
  await gotoLoaded(page, BASE_URL);
  await settle(page);
  const st1 = attachNormalized(await dumpState(page, 'hp1'));
  expectParity('hp1', st1);
  // Pixel layer — shared snapshot name across targets (mock now, twin
  // later); tolerance lives in playwright.config.ts expect settings.
  await expect(page).toHaveScreenshot('panel-layout-hp1.png');

  // HP2: drag Outline tab to verified pasteboard → unwrap
  const pb = await findPasteboardPoint(page);
  expect(pb, 'pasteboard point').toBeTruthy();
  const src = await tabInfo(page, 'Outline');
  await page.mouse.move(src.x, src.y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  const warm = await groupDropPoint(page, 'Pinned', 'center');
  if (!warm.error) {
    await page.mouse.move(warm.x, warm.y, { steps: DRAG_STEPS });
    await waitZone(page, 'Pinned', 'center', 4000);
    await page.waitForTimeout(OVERLAY_WARM_MS);
  }
  await page.mouse.move(pb.x, pb.y, { steps: DRAG_STEPS });
  await page.waitForFunction(() => document
    .querySelector('.layoutArea')
    ?.classList.contains('mn-unwrap-hover'));
  await page.waitForTimeout(ZONE_SETTLE_MS);
  await page.mouse.up();
  await settle(page);
  expectParity('hp2', attachNormalized(await dumpState(page, 'hp2')));

  // HP3: drag Review tab onto Pinned center → merge as sibling tab
  const rev = await tabInfo(page, 'Review');
  const pinned = await groupDropPoint(page, 'Pinned', 'center');
  await page.mouse.move(rev.x, rev.y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.move(pinned.x, pinned.y, { steps: DRAG_STEPS });
  await waitZone(page, 'Pinned', 'center', 6000);
  await page.waitForTimeout(ZONE_SETTLE_MS);
  await page.mouse.up();
  await settle(page);
  expectParity('hp3', attachNormalized(await dumpState(page, 'hp3')));
  await expect(page).toHaveScreenshot('panel-layout-hp3.png');
});

test('HP4 stack + HP5 park + HP6 resize', async ({ page }) => {
  await gotoLoaded(page, BASE_URL);
  await settle(page);

  // Re-establish the HP2 precondition (Outline unwrapped into its own
  // window) — the goldens are a CHAINED session; each isolated test
  // rebuilds the prefix it needs.
  {
    const pb = await findPasteboardPoint(page);
    const src = await tabInfo(page, 'Outline');
    await page.mouse.move(src.x, src.y);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.move(pb.x, pb.y, { steps: DRAG_STEPS });
    await page.waitForFunction(() => document
      .querySelector('.layoutArea')
      ?.classList.contains('mn-unwrap-hover'));
    await page.waitForTimeout(ZONE_SETTLE_MS);
    await page.mouse.up();
    await settle(page);
  }

  // And the HP3 precondition (Review merged as a Pinned tab).
  {
    const rev = await tabInfo(page, 'Review');
    const pinned = await groupDropPoint(page, 'Pinned', 'center');
    await page.mouse.move(rev.x, rev.y);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.move(pinned.x, pinned.y, { steps: DRAG_STEPS });
    await waitZone(page, 'Pinned', 'center', 6000);
    await page.waitForTimeout(ZONE_SETTLE_MS);
    await page.mouse.up();
    await settle(page);
  }

  // HP4: void-container drag of the Bibliography tabset onto the Outline
  // window's bottom band (mirrors the generator's sequence exactly).
  const void0 = await voidPointForGroupWithTab(page, 'Bibliography');
  expect(void0.error, `void point: ${void0.error ?? ''}`).toBeFalsy();
  const outlineBottom = await groupDropPoint(page, 'Outline', 'bottomBand');
  expect(outlineBottom.error,
    `outline target: ${outlineBottom.error ?? ''}`).toBeFalsy();
  await page.mouse.move(void0.x, void0.y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.move(outlineBottom.x, outlineBottom.y,
    { steps: DRAG_STEPS });
  // Latch signal is advisory (the generator warns and continues); the
  // structural outcome is asserted by the state diff below.
  await waitZone(page, 'Outline', 'bottom', 6000);
  await page.waitForTimeout(ZONE_SETTLE_MS);
  await page.mouse.up();
  await settle(page);
  expectParity('hp4', attachNormalized(await dumpState(page, 'hp4')));

  // HP5: titlebar drag → drawer park below the layout area bottom.
  // Mirrors the generator: drag by the computed delta that parks
  // HP5_PARK of the window height below the area's bottom edge.
  {
    const park = await page.evaluate(({ txt, frac }) => {
      const api = window.__api;
      const comp = api.component ?? api;
      const area = document.querySelector('.layoutArea');
      const ar = area.getBoundingClientRect();
      for (const fpRaw of comp.floatingGroups ?? []) {
        const fp = fpRaw;
        const winEl = fp.overlay.element;
        const tabs = [...winEl.querySelectorAll('.dv-tab')]
          .map((t) => (t.textContent || '').trim());
        if (!tabs.some((t) => t.includes(txt))) continue;
        const bar = winEl.querySelector('.dv-floating-titlebar');
        const wr = winEl.getBoundingClientRect();
        const br = bar.getBoundingClientRect();
        const newTop = Math.round(ar.height - wr.height * frac);
        const curTop = Math.round(wr.top - ar.top);
        return {
          grab: {
            x: Math.round(br.left + br.width / 2),
            y: Math.round(br.top + br.height / 2),
          },
          delta: newTop - curTop,
        };
      }
      return { error: 'no window for ' + txt };
    }, { txt: 'Identity', frac: HP5_PARK });
    expect(park.error, `park: ${park.error ?? ''}`).toBeFalsy();
    await page.mouse.move(park.grab.x, park.grab.y);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.move(park.grab.x, park.grab.y + park.delta,
      { steps: DRAG_STEPS + 4 });
    await page.waitForTimeout(350);
    await page.mouse.up();
    await settle(page);
  }
  expectParity('hp5', attachNormalized(await dumpState(page, 'hp5')));

  // HP6: bottom-edge resize of the Pinned window (+40px on last tabset)
  const handle = await resizeHandlePoint(
    page, 'Pinned', '.dv-resize-handle-bottom');
  expect(handle.error, `handle: ${handle.error ?? ''}`).toBeFalsy();
  await page.mouse.move(handle.x, handle.y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.move(
    handle.x, handle.y + HP6_RESIZE_DELTA, { steps: 8 });
  await page.mouse.up();
  await settle(page);
  expectParity('hp6', attachNormalized(await dumpState(page, 'hp6')));
  await expect(page).toHaveScreenshot('panel-layout-hp6.png');
});

test('HP8 reload round-trip', async ({ page }) => {
  await gotoLoaded(page, BASE_URL);
  await settle(page);

  // Rebuild the full chained prefix (HP2→HP6) that the goldens captured,
  // then reload in the same context.
  {
    // HP2: Outline → pasteboard (unwrap)
    const pb = await findPasteboardPoint(page);
    const src = await tabInfo(page, 'Outline');
    await page.mouse.move(src.x, src.y);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.move(pb.x, pb.y, { steps: DRAG_STEPS });
    await page.waitForFunction(() => document
      .querySelector('.layoutArea')
      ?.classList.contains('mn-unwrap-hover'));
    await page.waitForTimeout(ZONE_SETTLE_MS);
    await page.mouse.up();
    await settle(page);
  }
  {
    // HP3: Review → Pinned center (merge)
    const rev = await tabInfo(page, 'Review');
    const pinned = await groupDropPoint(page, 'Pinned', 'center');
    await page.mouse.move(rev.x, rev.y);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.move(pinned.x, pinned.y, { steps: DRAG_STEPS });
    await waitZone(page, 'Pinned', 'center', 6000);
    await page.waitForTimeout(ZONE_SETTLE_MS);
    await page.mouse.up();
    await settle(page);
  }
  {
    // HP4: Bibliography void → Outline window bottom band (stack)
    const void0 = await voidPointForGroupWithTab(page, 'Bibliography');
    const outlineBottom = await groupDropPoint(
      page, 'Outline', 'bottomBand');
    await page.mouse.move(void0.x, void0.y);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.move(outlineBottom.x, outlineBottom.y,
      { steps: DRAG_STEPS });
    await waitZone(page, 'Outline', 'bottom', 6000);
    await page.waitForTimeout(ZONE_SETTLE_MS);
    await page.mouse.up();
    await settle(page);
  }
  {
    // HP5: Identity titlebar → drawer park (HP5_PARK below bottom)
    const park = await page.evaluate(({ txt, frac }) => {
      const api = window.__api;
      const comp = api.component ?? api;
      const area = document.querySelector('.layoutArea');
      const ar = area.getBoundingClientRect();
      for (const fpRaw of comp.floatingGroups ?? []) {
        const fp = fpRaw;
        const winEl = fp.overlay.element;
        const tabs = [...winEl.querySelectorAll('.dv-tab')]
          .map((t) => (t.textContent || '').trim());
        if (!tabs.some((t) => t.includes(txt))) continue;
        const bar = winEl.querySelector('.dv-floating-titlebar');
        const wr = winEl.getBoundingClientRect();
        const br = bar.getBoundingClientRect();
        const newTop = Math.round(ar.height - wr.height * frac);
        const curTop = Math.round(wr.top - ar.top);
        return {
          grab: {
            x: Math.round(br.left + br.width / 2),
            y: Math.round(br.top + br.height / 2),
          },
          delta: newTop - curTop,
        };
      }
      return { error: 'no window for ' + txt };
    }, { txt: 'Identity', frac: HP5_PARK });
    await page.mouse.move(park.grab.x, park.grab.y);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.move(park.grab.x, park.grab.y + park.delta,
      { steps: DRAG_STEPS + 4 });
    await page.waitForTimeout(350);
    await page.mouse.up();
    await settle(page);
  }
  {
    // HP6: Pinned bottom-edge resize (+40px)
    const handle = await resizeHandlePoint(
      page, 'Pinned', '.dv-resize-handle-bottom');
    await page.mouse.move(handle.x, handle.y);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.move(handle.x, handle.y + HP6_RESIZE_DELTA,
      { steps: 8 });
    await page.mouse.up();
    await settle(page);
  }

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#boot', { state: 'detached' });
  await page.waitForFunction(() =>
    !!(window as unknown as { __api?: unknown }).__api);
  await settle(page);
  expectParity('hp8', attachNormalized(await dumpState(page, 'hp8')));
});

test('HP7 auto-wrap OFF → doc sibling merge', async ({ page }) => {
  await gotoLoaded(page, BASE_URL);
  await settle(page);

  // Rebuild the full chained prefix (HP2→HP6, then HP8's reload) — the HP7
  // golden was captured after the reload, when the Pinned window holds
  // [Pinned, Review] at its HP6 size and the toggle has reset to ON.
  {
    const pb = await findPasteboardPoint(page);
    const src = await tabInfo(page, 'Outline');
    await page.mouse.move(src.x, src.y);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.move(pb.x, pb.y, { steps: DRAG_STEPS });
    await page.waitForFunction(() => document
      .querySelector('.layoutArea')
      ?.classList.contains('mn-unwrap-hover'));
    await page.waitForTimeout(ZONE_SETTLE_MS);
    await page.mouse.up();
    await settle(page);
  }
  {
    const rev = await tabInfo(page, 'Review');
    const pinned = await groupDropPoint(page, 'Pinned', 'center');
    await page.mouse.move(rev.x, rev.y);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.move(pinned.x, pinned.y, { steps: DRAG_STEPS });
    await waitZone(page, 'Pinned', 'center', 6000);
    await page.waitForTimeout(ZONE_SETTLE_MS);
    await page.mouse.up();
    await settle(page);
  }
  {
    // HP4: Bibliography void → Outline window bottom band (stack)
    const void0 = await voidPointForGroupWithTab(page, 'Bibliography');
    const outlineBottom = await groupDropPoint(
      page, 'Outline', 'bottomBand');
    await page.mouse.move(void0.x, void0.y);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.move(outlineBottom.x, outlineBottom.y,
      { steps: DRAG_STEPS });
    await waitZone(page, 'Outline', 'bottom', 6000);
    await page.waitForTimeout(ZONE_SETTLE_MS);
    await page.mouse.up();
    await settle(page);
  }
  {
    // HP5: Identity titlebar → drawer park (HP5_PARK below bottom)
    const park = await page.evaluate(({ txt, frac }) => {
      const api = window.__api;
      const comp = api.component ?? api;
      const area = document.querySelector('.layoutArea');
      const ar = area.getBoundingClientRect();
      for (const fpRaw of comp.floatingGroups ?? []) {
        const fp = fpRaw;
        const winEl = fp.overlay.element;
        const tabs = [...winEl.querySelectorAll('.dv-tab')]
          .map((t) => (t.textContent || '').trim());
        if (!tabs.some((t) => t.includes(txt))) continue;
        const bar = winEl.querySelector('.dv-floating-titlebar');
        const wr = winEl.getBoundingClientRect();
        const br = bar.getBoundingClientRect();
        const newTop = Math.round(ar.height - wr.height * frac);
        const curTop = Math.round(wr.top - ar.top);
        return {
          grab: {
            x: Math.round(br.left + br.width / 2),
            y: Math.round(br.top + br.height / 2),
          },
          delta: newTop - curTop,
        };
      }
      return { error: 'no window for ' + txt };
    }, { txt: 'Identity', frac: HP5_PARK });
    await page.mouse.move(park.grab.x, park.grab.y);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.move(park.grab.x, park.grab.y + park.delta,
      { steps: DRAG_STEPS + 4 });
    await page.waitForTimeout(350);
    await page.mouse.up();
    await settle(page);
  }
  {
    // HP6: Pinned bottom-edge resize (+40px)
    const handle = await resizeHandlePoint(
      page, 'Pinned', '.dv-resize-handle-bottom');
    await page.mouse.move(handle.x, handle.y);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.move(handle.x, handle.y + HP6_RESIZE_DELTA,
      { steps: 8 });
    await page.mouse.up();
    await settle(page);
  }

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#boot', { state: 'detached' });
  await page.waitForFunction(() =>
    !!(window as unknown as { __api?: unknown }).__api);
  await settle(page);

  // HP7: auto-wrap OFF → suppression drops, the doc grid's CENTER zone
  // overlay shows (the F1 observable), and a center release merges the
  // panel into the doc group as a sibling tab (stock path unclaimed).
  const off = await toggleAutoWrap(page, false);
  expect(off.error, `toggle: ${off.error ?? ''}`).toBeFalsy();
  expect(off.on, 'auto-wrap must read OFF').toBe(false);

  const src = await tabInfo(page, 'Review');
  const docCenter = await page.evaluate(() => {
    const api = (window as unknown as {
      __api: {
        groups: Array<{
          element: HTMLElement;
          api: { location: { type: string } };
        }>;
      };
    }).__api;
    const g = api.groups
      .find((gr) => gr.api.location.type === 'grid');
    if (!g) return null;
    const c = g.element.querySelector('.dv-content-container')
      ?? g.element;
    const r = c.getBoundingClientRect();
    const vr = document.querySelector('.layoutArea')
      ?.getBoundingClientRect();
    if (!vr) return null;
    const x = Math.round(r.left + r.width / 2);
    const y = Math.min(Math.max(Math.round(r.top + r.height / 2),
      Math.round(vr.top + 80)), Math.round(vr.bottom - 20));
    return { x, y };
  });
  expect(docCenter, 'doc grid content center').toBeTruthy();

  await page.mouse.move(src.x, src.y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.move(docCenter!.x, docCenter!.y, { steps: DRAG_STEPS });
  // F1 observable: with auto-wrap OFF the suppression class is gone and a
  // grid (non-float) zone overlay is visible — specifically the CENTER
  // zone (the merge-as-tab target the golden captured).
  await page.waitForFunction(() => {
    const area = document.querySelector('.layoutArea');
    if (!area || area.classList.contains('mn-unwrap-hover')) return false;
    const sel = [...area.querySelectorAll('.dv-drop-target-selection')]
      .find((el) => !el.closest('.dv-resize-container'));
    return !!sel
      && getComputedStyle(sel).display !== 'none'
      && sel.classList.contains('dv-drop-target-center');
  }, undefined, { timeout: 6000 });
  await page.waitForTimeout(ZONE_SETTLE_MS);
  await page.mouse.up();
  await settle(page);
  expectParity('hp7', attachNormalized(await dumpState(page, 'hp7')));
  await expect(page).toHaveScreenshot('panel-layout-hp7-post-drop.png');
});

test('HP9 reset + HP10 empty', async ({ page }) => {
  await gotoLoaded(page, BASE_URL);
  await settle(page);
  await page.getByRole('button', { name: 'Reset' }).click();
  await settle(page);
  expectParity('hp9', attachNormalized(await dumpState(page, 'hp9')));

  await closeAllPanels(page);
  await settle(page);
  expectParity('hp10', attachNormalized(await dumpState(page, 'hp10')));
  await expect(page).toHaveScreenshot('panel-layout-hp10.png');
});
