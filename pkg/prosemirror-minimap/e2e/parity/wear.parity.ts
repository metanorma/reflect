/**
 * Read-wear oracle (clock-controlled) — INV-21 (boundedness/decay) and
 * INV-22 (cadence), plus a deterministic wear master.
 *
 * Why a separate spec: the wear ticker mutates tick OPACITY every 250ms
 * (mockup:2306-2314). Geometry masters exclude opacity by design; here the
 * page clock is frozen during load (install + pauseAt before goto) and
 * advanced ONLY in exact 250ms multiples, so the interval fires an exact,
 * reproducible number of times — verified empirically: runFor(249) fires
 * nothing, runFor(1) fires exactly one tick.
 *
 * Determinism notes:
 *  - adapter.load({clock:true}) advances past the 350ms auto-jump and
 *    verifies scrollTop control before returning (a scroll animation left
 *    over from the jump would otherwise fight manual assignments).
 *  - Heat math is closed-form deterministic floats on deterministic
 *    segment geometry; opacities are rounded to 4 decimals in the frame.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { MASTERS_DIR, RECORD } from './lib/env.js';
import { canonical, canonicalFile, sha256 } from './lib/canonical.js';
import { diffMaster, loadRegister } from './lib/deviations.js';
import { mockupAdapter } from './lib/mockupAdapter.js';

const r4 = (v: number) => Math.round(v * 10000) / 10000;

interface WearFrame {
  i: number;
  step: string;
  scrollTop: number;
  /** Cumulative virtual ms advanced by dwell steps (tick count = this/250
   *  plus the 2 pre-control ticks from adapter load). */
  advancedMs: number;
  /** Non-zero wear tick opacities, sorted by tick top. */
  opacities: Array<{ top: number; op: number }>;
  tickCount: number;
}

const readWear = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const lane = document.querySelector('#mmCanvas .lane[title="read-wear lane"]');
    const ticks = lane ? Array.from(lane.querySelectorAll('.tick')) : [];
    const c = document.querySelector('#canvas');
    const d = document.querySelector('#doc');
    const mm = document.querySelector('#mmCanvas');
    return {
      scrollTop: c.scrollTop,
      tickCount: ticks.length,
      geom: {
        clientHeight: c.clientHeight,
        docTop0: d.offsetTop,
        docHeight: d.offsetHeight,
        canvasH: parseFloat(mm.style.height) || 0,
      },
      opacities: ticks
        .map((t) => ({ top: parseFloat(t.style.top), op: parseFloat(t.style.opacity || '0') }))
        .filter((t) => t.op > 0)
        .sort((a, b) => a.top - b.top),
    };
  });

/** Map-space window of the doc-frame viewport [m0, m1] (linear model —
 *  enough resolution to tell "under the viewport" from "far away"). */
function viewportWindow(raw: Awaited<ReturnType<typeof readWear>>): [number, number] {
  const { canvasH, docHeight, docTop0, clientHeight } = raw.geom;
  const s0 = raw.scrollTop - docTop0;
  return [(canvasH * s0) / docHeight, (canvasH * (s0 + clientHeight)) / docHeight];
}

test('wear master (clock) + INV-21/22', async ({ page }) => {
  const adapter = mockupAdapter({ clock: true });
  await adapter.load(page); // frozen clock, auto-jump settled, scrollTop=0

  const frames: WearFrame[] = [];
  let advanced = 0;
  const capture = async (i: number, step: string) => {
    const raw = await readWear(page);
    frames.push({
      i,
      step,
      scrollTop: raw.scrollTop,
      advancedMs: advanced,
      opacities: raw.opacities.map((t) => ({ top: t.top, op: r4(t.op) })),
      tickCount: raw.tickCount,
    });
    return raw;
  };

  const scrollTo = (f: number) =>
    page.evaluate((frac) => {
      const c = document.querySelector('#canvas');
      const d = document.querySelector('#doc');
      const range = Math.max(1, c.scrollHeight - c.clientHeight - d.offsetTop);
      c.scrollTop = Math.round(d.offsetTop + frac * range);
    }, f);

  // 0. baseline (2 ticks fired during adapter load at scrollTop 0).
  await capture(0, 'baseline');

  // 1. move to f=0.25 — moving changes no heat by itself.
  await scrollTo(0.25);
  await capture(1, 'scroll f=0.25');
  expect(frames[1].opacities, 'scroll alone adds no heat').toEqual(frames[0].opacities);

  // 2-3. dwell: exact tick multiples accumulate at the viewport position.
  await adapter.applyStep(page, { type: 'dwell', ms: 500 }, 2);
  await capture(2, 'dwell 500 @0.25');
  await adapter.applyStep(page, { type: 'dwell', ms: 1000 }, 3);
  const heated = await capture(3, 'dwell 1000 @0.25');

  // INV-21 (boundedness): painted opacity ∈ [0, .8] everywhere, always.
  for (const f of frames) {
    for (const t of f.opacities) {
      expect(t.op, `frame ${f.i} tick@${t.top} opacity bounds (INV-21)`).toBeGreaterThanOrEqual(0);
      expect(t.op, `frame ${f.i} tick@${t.top} opacity bounds (INV-21)`).toBeLessThanOrEqual(0.8);
    }
  }

  // INV-21 (accumulation): a tick's heat input is non-negative whenever
  // its segment overlaps the viewport — including PARTIAL overlap (long
  // segments whose tick top sits hundreds of map-px outside the window
  // still reach into it; measured segment map-extents run ~1000px at this
  // zoom). Non-decreasing is asserted within the window ±1500px; ticks far
  // outside must decay. (Whole-region decay is proven again at step 4,
  // where the viewport moves 85k px away — no segment spans that.)
  const byTop = (list: WearFrame['opacities']) =>
    new Map(list.map((t) => [t.top, t.op] as const));
  const win = viewportWindow(heated);
  const MARGIN = 1500;
  const prevMap = byTop(frames[2].opacities);
  let accumulated = 0;
  for (const t of heated.opacities) {
    const nearVp = t.top >= win[0] - MARGIN && t.top <= win[1] + MARGIN;
    const before = prevMap.get(t.top) ?? 0;
    if (nearVp) {
      expect(t.op, `overlapping tick@${t.top} accumulated over dwell (INV-21)`).toBeGreaterThanOrEqual(before);
      accumulated++;
    } else if (before > 0) {
      expect(t.op, `non-overlapping tick@${t.top} decayed over dwell (INV-21)`).toBeLessThan(before);
    }
  }
  expect(accumulated, 'some ticks demonstrably accumulated (INV-21)').toBeGreaterThan(0);

  // 4. move far away (no overlap with the heated region) and dwell — decay.
  await scrollTo(0.9);
  await adapter.applyStep(page, { type: 'dwell', ms: 1000 }, 4);
  await capture(4, 'dwell 1000 @0.9');
  const decayedMap = byTop(frames[4].opacities);
  let decayed = 0;
  for (const t of heated.opacities) {
    const now = decayedMap.get(t.top) ?? 0;
    // Viewport at f=0.9 does not overlap the f=0.25 region (131k px doc,
    // 848 px viewport) — decay alone applies: strictly decreasing heat.
    if (t.op > 0.01) {
      expect(now, `tick@${t.top} decayed after leaving (INV-21)`).toBeLessThan(t.op);
      decayed++;
    }
  }
  expect(decayed, 'some ticks demonstrably decayed (INV-21)').toBeGreaterThan(0);

  // INV-22 (cadence): align to the next tick boundary (bounded 1ms steps
  // — the load's 700ms settle leaves the phase at +50ms, so a fixed
  // runFor(249) would straddle a deadline), then prove the period: 249ms
  // of virtual time fires NO tick (opacities byte-identical); the 250th
  // ms fires exactly one.
  const preAlign = JSON.stringify(await readWear(page));
  for (let k = 0; k < 260; k++) {
    await page.clock.runFor(1);
    if (JSON.stringify(await readWear(page)) !== preAlign) break;
  }
  const preCadence = JSON.stringify(await readWear(page));
  await page.clock.runFor(249);
  const midCadence = JSON.stringify(await readWear(page));
  expect(midCadence, 'no heat change in 249ms (INV-22 cadence)').toBe(preCadence);
  await page.clock.runFor(1);
  const postCadence = JSON.stringify(await readWear(page));
  expect(postCadence, 'heat changed on the 250th ms (INV-22 cadence)').not.toBe(preCadence);

  // Structural: one wear tick per segment, stable across the whole spec.
  const segCount = frames[0].tickCount;
  expect(segCount, 'wear tick count').toBeGreaterThan(100);
  for (const f of frames) {
    expect(f.tickCount, 'wear ticks never added/removed (geometry-stable wear lane)').toBe(segCount);
  }

  // ── Master record/verify (same contract as the geometry masters) ──────
  const master = {
    format: 1,
    scenario: 'wear-dwell',
    adapter: adapter.id,
    env: {
      viewport: [1600, 900] as [number, number],
      reducedMotion: 'reduce' as const,
      note: 'clock frozen during load (page.clock install+pauseAt pre-goto); dwell steps advance exact 250ms multiples; opacities rounded to 4 decimals.',
    },
    frames,
  };
  const file = path.join(MASTERS_DIR, 'wear-dwell.json');

  if (RECORD) {
    fs.mkdirSync(MASTERS_DIR, { recursive: true });
    fs.writeFileSync(file, canonicalFile(master));
    console.log(`parity-master wear-dwell RECORDED frames=${frames.length}`);
  } else {
    const recorded = JSON.parse(fs.readFileSync(file, 'utf8'));
    const result = diffMaster(
      recorded,
      master,
      { adapter: adapter.id, scenario: 'wear-dwell', step: '*' },
      loadRegister(),
    );
    console.log(
      `parity-master wear-dwell frames=${frames.length} sha256=${await sha256(canonical(master))} byteStable=${result.byteStable} toleratedLeaves=${result.tolerated}`,
    );
    expect(
      result.diffs.map((d) => `${d.path}: ${JSON.stringify(d.expected)} ≠ ${JSON.stringify(d.actual)}`),
      'wear master divergence',
    ).toEqual([]);
  }
});
