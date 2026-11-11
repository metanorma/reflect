/**
 * Standing invariant tests that need INTERACTIVE driving beyond what the
 * master scenarios capture:
 *
 *  - INV-1  thumb-drag ↔ scroll round-trip identity (a full top→bottom
 *           drag sweeps the document start→end, and the captured thumb
 *           geometry inverts back to the actual scroll position).
 *  - INV-2  label-population census stability across scroll stops and
 *           jumps (scrolling never rebuilds or re-samples the label set).
 *  - INV-17 keyboard landmark walking operates only on SHOWN labels from
 *           the active one, clamped at both ends (mockup:2384-2392).
 *
 * All asserts run against the mockup oracle now; Phase 4 re-points the
 * same scenario driving at the package adapter.
 */
import { test, expect } from '@playwright/test';
import { mockupAdapter } from './lib/mockupAdapter.js';
import type { Census, Frame, ScenarioStep } from './lib/types.js';

const r2 = (v: number) => Math.round(v * 100) / 100;

test('INV-1: thumb drag ↔ scroll round-trip identity', async ({ page }) => {
  const adapter = mockupAdapter();
  await adapter.load(page);
  const run = async (step: ScenarioStep, i: number): Promise<Frame> => {
    await adapter.applyStep(page, step, i);
    return adapter.captureFrame(page, i, step);
  };

  const f0 = await run({ type: 'drag-thumb', f: 0 }, 0);
  const range = f0.geom.scrollHeight - f0.geom.clientHeight;
  // Dragging to the track top lands on the document top (doc-frame 0 ⇒
  // container scrollTop = docTop0).
  expect(Math.abs(f0.scrollTop - f0.geom.docTop0), 'drag to top ⇒ scrollTop = docTop0')
    .toBeLessThanOrEqual(1);
  expect(f0.thumb.top, 'thumb pinned at track top').toBeLessThanOrEqual(1);

  const f1 = await run({ type: 'drag-thumb', f: 1 }, 1);
  // A full top→bottom drag sweeps the document start→end: exact range.
  expect(Math.abs(f1.scrollTop - range), `drag to bottom ⇒ scrollTop = maxScroll (${range})`)
    .toBeLessThanOrEqual(2);
  expect(
    Math.abs(f1.thumb.top - (f1.geom.paneH - f1.thumb.height)),
    'thumb pinned at track bottom',
  ).toBeLessThanOrEqual(1.51);

  // Mid-track: thumb placement and scroll invert into each other through
  // the SHARED mapping (mmThumbToScroll is the inverse of the placement).
  // The captured thumb.top is pixel-ROUNDED (Math.round in mmPan), so the
  // inverse resolution carries 0.5px of thumb = 0.5/track of the document
  // — the tolerance below is exactly that quantization, not slack.
  for (const f of [0.37, 0.62]) {
    const fm = await run({ type: 'drag-thumb', f }, 2);
    const track = fm.geom.paneH - fm.thumb.height;
    const docRange = fm.geom.scrollHeight - fm.geom.clientHeight - fm.geom.docTop0;
    const quant = (0.51 / track) * docRange + 2;
    const frac = (fm.scrollTop - fm.geom.docTop0) / docRange;
    expect(Math.abs(fm.thumb.top / track - f), `drag f=${f}: thumb lands at f of the track`)
      .toBeLessThanOrEqual(0.01);
    expect(Math.abs(frac - f), `drag f=${f}: scroll fraction matches`).toBeLessThanOrEqual(0.01);
    // The inverse mapping applied to the CAPTURED thumb top reproduces the
    // actual scrollTop (mmThumbToScroll, mockup:2233-2241), within the
    // thumb's pixel quantization.
    const predicted = (fm.thumb.top / track) * docRange + fm.geom.docTop0;
    expect(Math.abs(predicted - fm.scrollTop),
      `drag f=${f}: mmThumbToScroll(thumb.top) reproduces scrollTop (±${quant.toFixed(0)}px thumb quantization)`)
      .toBeLessThanOrEqual(quant);
  }
});

test('INV-2: label census is viewport-independent', async ({ page }) => {
  const adapter = mockupAdapter();
  await adapter.load(page);
  await adapter.applyStep(page, { type: 'reset' }, 0);
  const stops: Array<[ScenarioStep, string]> = [
    [{ type: 'scroll-fraction', f: 0 }, 'top'],
    [{ type: 'scroll-fraction', f: 0.5 }, 'middle'],
    [{ type: 'scroll-fraction', f: 1 }, 'bottom'],
    [{ type: 'jump', anchor: 'cl-c' }, 'annex C'],
  ];
  let reference: Census | null = null;
  let refName = '';
  let i = 1;
  for (const [step, name] of stops) {
    await adapter.applyStep(page, step, i++);
    const census = await adapter.captureCensus(page);
    if (!reference) {
      reference = census;
      refName = name;
    } else {
      expect(census.labels, `label population at ${name} identical to ${refName} (INV-2)`)
        .toEqual(reference.labels);
      expect(census.blocks, `block population at ${name} identical to ${refName}`)
        .toEqual(reference.blocks);
    }
  }
  expect(reference!.labels.length, 'the census is non-trivial').toBeGreaterThan(50);
});

test('INV-17: keyboard walks SHOWN labels from the active one, clamped', async ({ page }) => {
  const adapter = mockupAdapter();
  await adapter.load(page);
  await adapter.applyStep(page, { type: 'reset' }, 0);
  await adapter.applyStep(page, { type: 'scroll-fraction', f: 0.35 }, 1);

  const shown = async () => {
    const f = await adapter.captureFrame(page, 99, { type: 'reset' });
    return { labels: f.labels, scrollTop: f.scrollTop, clientHeight: f.geom.clientHeight };
  };
  /** Doc rect of the clause a label text names (labels are `num + '  ' +
   *  title`; anonymous floats/notes return null and are skipped). */
  const clauseRect = (text: string) =>
    page.evaluate((t) => {
      for (const s of Array.from(document.querySelectorAll('section.clause'))) {
        const num = s.querySelector('.clnum');
        const title = s.querySelector('.cltitle');
        if (!title) continue;
        const label = (num && num.textContent ? num.textContent.trim() + '  ' : '') + title.textContent;
        if (label === t) {
          const r = s.getBoundingClientRect();
          return { top: r.top, height: r.height };
        }
      }
      return null;
    }, text);

  const focus = page.locator('#minimapWrap');
  // Focus the host WITHOUT clicking — labels and strip blocks are
  // click-to-reveal; a click would scroll the document before the walk.
  await page.evaluate(() => document.querySelector('#minimapWrap')!.focus());

  const pressAndCheck = async (key: 'ArrowDown' | 'ArrowUp', n: number, last: boolean) => {
    const before = await shown();
    const activeIdx = before.labels.findIndex((l) => l.active);
    const targetIdx = key === 'ArrowDown'
      ? Math.min(before.labels.length - 1, Math.max(0, activeIdx) + 1)
      : Math.max(0, (activeIdx < 0 ? 0 : activeIdx) - 1);
    const target = before.labels[targetIdx].text;
    // Measure the target's rect BEFORE the press (viewport-relative at the
    // current scroll — rebase with the same frame's scrollTop, mockup
    // fix #3 discipline).
    const rect = await clauseRect(target);
    await focus.press(key);
    await page.waitForTimeout(120);
    const after = await shown();

    // The walk REVEALS the target: scrollIntoView centers it (revealEl,
    // mockup:2483-2487). Chromium's `block:'center'` carries a measured,
    // deterministic ~52px bias on this page (source unidentified — open
    // item for the decision gate; the masters pin the exact landing
    // byte-for-byte), so the band is ±60px rather than ±2px. A walk to the
    // WRONG label is thousands of px away and still fails.
    if (rect) {
      const top = before.scrollTop + rect.top;
      const cands = [
        top + rect.height / 2 - before.clientHeight / 2,
        top,
        top + rect.height - before.clientHeight,
      ];
      const best = Math.min(...cands.map((c) => Math.abs(after.scrollTop - c)));
      expect(best,
        `${key} #${n} reveals the walked-to clause "${target}" (±60px band)`)
        .toBeLessThanOrEqual(60);
    }
    // The active label is shown (INV-9 reservation) and sits at-or-inside
    // the target in document order (a tall clause centers into a
    // descendant — the mockup's own active semantics, INV-4).
    const active = after.labels.find((l) => l.active);
    expect(active, `${key} #${n} produced an active label`).toBeDefined();
    const activeIdxAfter = after.labels.indexOf(active!);
    const targetIdxAfter = after.labels.findIndex((l) => l.text === target);
    if (targetIdxAfter >= 0) {
      expect(activeIdxAfter,
        `${key} #${n}: active is the target or a descendant of it`)
        .toBeGreaterThanOrEqual(targetIdxAfter);
      expect(activeIdxAfter,
        `${key} #${n}: active did not run past the target's neighborhood`)
        .toBeLessThanOrEqual(targetIdxAfter + 3);
    }
    if (!last) return;
    // Clamped at the end: walk past the list end (25 presses reach it from
    // anywhere), then further presses stop moving the document.
    for (let k = 0; k < 25; k++) {
      await focus.press(key);
      await page.waitForTimeout(60);
    }
    const atEnd = (await shown()).scrollTop;
    for (let k = 0; k < 5; k++) {
      await focus.press(key);
      await page.waitForTimeout(60);
    }
    const clamped = await shown();
    expect(Math.abs(clamped.scrollTop - atEnd),
      `${key} clamps at the shown-list ${key === 'ArrowDown' ? 'end' : 'start'}`)
      .toBeLessThanOrEqual(2.01);
  };

  await pressAndCheck('ArrowDown', 1, false);
  await pressAndCheck('ArrowDown', 2, false);
  await pressAndCheck('ArrowDown', 3, false);
  await pressAndCheck('ArrowUp', 1, false);
  await pressAndCheck('ArrowUp', 2, false);
  await pressAndCheck('ArrowDown', 4, true);
  await pressAndCheck('ArrowUp', 3, true);
});
