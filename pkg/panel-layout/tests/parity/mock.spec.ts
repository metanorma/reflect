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

  // HP5: titlebar drag → drawer park below the layout area bottom
  const bar = await titlebarPointForWindowWithTab(page, 'Identity');
  expect(bar.error, `titlebar: ${bar.error ?? ''}`).toBeFalsy();
  const area = await page.evaluate(() => {
    const r = document.querySelector('.layoutArea')
      ?.getBoundingClientRect();
    return r ? { bottom: r.bottom } : null;
  });
  expect(area, 'layout area').toBeTruthy();
  await page.mouse.move(bar.x, bar.y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.move(
    bar.x, area.bottom - 30 + 200 * HP5_PARK, { steps: DRAG_STEPS });
  await page.mouse.up();
  await settle(page);
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
});

test('HP8 reload round-trip', async ({ page }) => {
  // Rebuild the HP6 end-state, then reload in the same context.
  await gotoLoaded(page, BASE_URL);
  await settle(page);
  const rev = await tabInfo(page, 'Review');
  const pinned = await groupDropPoint(page, 'Pinned', 'center');
  await page.mouse.move(rev.x, rev.y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.move(pinned.x, pinned.y, { steps: DRAG_STEPS });
  await waitZone(page, 'Pinned', 'center', 6000);
  await page.mouse.up();
  await settle(page);
  const handle = await resizeHandlePoint(
    page, 'Pinned', '.dv-resize-handle-bottom');
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x, handle.y + HP6_RESIZE_DELTA, { steps: 8 });
  await page.mouse.up();
  await settle(page);

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#boot', { state: 'detached' });
  await page.waitForFunction(() =>
    !!(window as unknown as { __api?: unknown }).__api);
  await settle(page);
  expectParity('hp8', attachNormalized(await dumpState(page, 'hp8')));
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
});
