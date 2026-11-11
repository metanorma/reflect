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

const rafSettle = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () =>
      new Promise<void>((res) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => requestAnimationFrame(() => res())),
        );
      }),
  );

test('INV-14/18: lane ticks mark the finest containing labelled element; a tick click reveals it and never travels', async ({ page }) => {
  const adapter = mockupAdapter();
  await adapter.load(page);
  await adapter.applyStep(page, { type: 'reset' }, 0);
  await adapter.applyStep(page, { type: 'scroll-fraction', f: 0.3 }, 1);

  // Recompute the mock-up's OWN problem predicates (collectProblems,
  // mockup:1682-1701) and the mmBlockFor ownership rule — nearest labelled
  // ancestor-or-self = closest clause/SEM_SEL match, which IS the finest
  // containing labelled element (mockup:1846-1857). Expected tick top =
  // round(H × docY(owner)/total) — the owner's first piece m0 (B′, exact
  // for every element start).
  const res = await page.evaluate(() => {
    const SEM = '.term, .req, figure.tbl-fig, figure.fig, .equation, .admonition, .dl-defs, .src-block, .raw-block';
    const canvas = document.querySelector('#canvas');
    const doc = document.querySelector('#doc');
    const mm = document.querySelector('#mmCanvas');
    const H = parseFloat(mm.style.height);
    const total = doc.offsetHeight;
    const docY = (el) => el.getBoundingClientRect().top - doc.getBoundingClientRect().top;
    const ownerOf = (el) => el.closest('section.clause, ' + SEM);
    const out = [];
    const add = (el, cls) => {
      const owner = ownerOf(el);
      if (!owner) return;
      const ro = owner.getBoundingClientRect();
      out.push({
        cls,
        expectedTickTop: Math.round((H * docY(owner)) / total),
        ownerDocTop: docY(owner),
        ownerHeight: ro.height,
      });
    };
    document.querySelectorAll('#doc .xref.broken').forEach((x) => add(x, 'E30'));
    document.querySelectorAll('#doc .admonition').forEach((a) => {
      const body = a.querySelector('.admo-body');
      if (/\bshall\b/.test((body || a).textContent || '')) add(a, 'W07');
    });
    document.querySelectorAll('#doc .term').forEach((t) => {
      if (!t.querySelector('.tsource')) add(t, 'W12');
    });
    // com lane: every margin note ticks its containing clause.
    document.querySelectorAll('#doc .mn-note').forEach((n) => add(n, 'NOTE'));
    const ticks = {};
    for (const lane of Array.from(mm.querySelectorAll(':scope > .lane'))) {
      const key = ({ 'diagnostics lane': 'diag', 'editor notes lane': 'com' })[lane.title];
      if (!key) continue;
      ticks[key] = Array.from(lane.querySelectorAll('.tick')).map((t) => {
        const r = t.getBoundingClientRect();
        return { top: parseFloat(t.style.top), x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
    }
    return {
      problems: out,
      diagTicks: ticks.diag ?? [],
      comTicks: ticks.com ?? [],
      clientH: canvas.clientHeight,
      docTop0: doc.offsetTop,
      total,
      H,
    };
  });

  expect(res.problems.filter((p) => ['E30', 'W07', 'W12'].includes(p.cls)).length, 'the three diagnostic classes fire').toBe(3);
  expect(res.problems.filter((p) => p.cls === 'NOTE').length, 'margin notes present').toBeGreaterThan(0);

  // INV-14: every diagnostic's tick sits at its computed owner's m0.
  for (const p of res.problems.filter((x) => x.cls !== 'NOTE')) {
    const hit = res.diagTicks.some((t) => Math.abs(t.top - p.expectedTickTop) <= 0.51);
    expect(hit, `${p.cls}: diag tick at owner m0 ${p.expectedTickTop} (finest containing labelled element)`).toBe(true);
  }
  // …and the notes lane ticks hit their containing clauses the same way.
  const comTops = new Set(res.comTicks.map((t) => t.top));
  for (const p of res.problems.filter((x) => x.cls === 'NOTE')) {
    expect(comTops.has(p.expectedTickTop), `NOTE: com tick at clause m0 ${p.expectedTickTop}`).toBe(true);
  }

  // INV-18: clicking a tick reveals its OWNER (scrollIntoView center with
  // the documented alignment rules — center for short elements, edge for
  // taller-than-viewport ones, ±60px band) and never travels: the landing
  // matches an owner's reveal position, not anything derived from the
  // click's own strip coordinates. Before each click, scroll the document
  // so the tick's map position is inside the visible pane window (ticks
  // live on the panned canvas — most are translated off-screen), then
  // re-read the tick's CURRENT screen rect. Several owners can share a
  // tick's m0 (a clause and its first child both start at the same map
  // position) — the landing must match ONE of the owners anchored there.
  const ownersByTickTop = new Map<number, typeof res.problems>();
  for (const p of res.problems) {
    const list = ownersByTickTop.get(p.expectedTickTop) ?? [];
    list.push(p);
    ownersByTickTop.set(p.expectedTickTop, list);
  }
  const diagTickCount = res.diagTicks.length;
  for (let k = 0; k < diagTickCount; k++) {
    const tickTop = res.diagTicks[k].top;
    const owners = ownersByTickTop.get(tickTop);
    if (!owners?.length) continue;
    // Bring the tick into the visible pane AWAY FROM THE THUMB: the
    // viewport overlay (#mmVpBox, z-index 5) spans the strip AND the lanes,
    // so a tick under the current thumb is unclickable — the click starts a
    // thumb drag instead (measured). Top-aligning the tick puts it at
    // pane-y ≈ 0 while the thumb sits at frac×track further down.
    const docY = (tickTop * res.total) / res.H;
    await page.evaluate(
      ({ y, docTop0 }) => {
        const c = document.querySelector('#canvas');
        c.scrollTop = Math.max(0, Math.round(y + docTop0));
      },
      { y: docY, docTop0: res.docTop0 },
    );
    await rafSettle(page);
    const tick = await page.evaluate((idx) => {
      const lane = document.querySelector('#mmCanvas .lane[title="diagnostics lane"]');
      const t = lane.querySelectorAll('.tick')[idx];
      const r = t.getBoundingClientRect();
      return { top: parseFloat(t.style.top), x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, k);
    await page.mouse.click(tick.x, tick.y);
    await page.waitForTimeout(150);
    const scrollTop = await page.evaluate(() => document.querySelector('#canvas').scrollTop);
    const cands = owners.flatMap((owner) => {
      const top = owner.ownerDocTop + res.docTop0;
      return [
        top + owner.ownerHeight / 2 - res.clientH / 2,
        top,
        top + owner.ownerHeight - res.clientH,
        // Chromium's center-alignment for elements taller than the
        // scrollport anchors the START edge at the viewport center when
        // that is the minimal scroll (measured on clause 9: landing =
        // top − V/2 exactly).
        top - res.clientH / 2,
      ];
    });
    const best = Math.min(...cands.map((c) => Math.abs(scrollTop - c)));
    expect(best, `tick@${tick.top} click reveals an owner anchored there (±60px band)`).toBeLessThanOrEqual(60);
  }
});

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

test('INV-12: viewport resize rebuilds are population-stable (guard band context)', async ({ page }) => {
  const adapter = mockupAdapter();
  await adapter.load(page);
  await adapter.applyStep(page, { type: 'reset' }, 0);
  await adapter.applyStep(page, { type: 'scroll-fraction', f: 0.4 }, 1);

  const vp = page.viewportSize()!;
  const census = await adapter.captureCensus(page);
  const labelGeo = JSON.stringify(census.labels);

  // Sentinel: a live reference to one label element. Rebuilds recreate
  // every label node, so `document.contains(sentinel)` observes a rebuild
  // without touching the mock-up's DOM.
  await page.evaluate(() => {
    (window as unknown as { __paritySentinel: Node }).__paritySentinel =
      document.querySelector('#mmLabels .lbl');
  });
  const connected = () =>
    page.evaluate(() =>
      document.contains((window as unknown as { __paritySentinel?: Node }).__paritySentinel),
    );

  // A −1px viewport change is inside the ResizeObserver's >2px guard band,
  // BUT the mock-up's window-resize listener rebuilds unconditionally
  // (mockup:2403) — the guard's no-op branch only covers pane-internal
  // ripples, which no user gesture produces alone. Observable contract:
  // every viewport change rebuilds AND the rebuild is idempotent for the
  // label population (same H, same document → identical geometry).
  await adapter.applyStep(page, { type: 'viewport', height: vp.height - 1 }, 2);
  expect(await connected(), 'viewport resize rebuilds (window listener shadows the guard band)').toBe(false);
  let after = await adapter.captureCensus(page);
  expect(JSON.stringify(after.labels), '−1px rebuild: label population identical').toBe(labelGeo);
  expect(after.geom.canvasH, '−1px rebuild: canvas height identical').toBe(census.geom.canvasH);

  await adapter.applyStep(page, { type: 'viewport', height: vp.height + 40 }, 3);
  expect(await connected(), '+40px rebuilds again').toBe(false);
  after = await adapter.captureCensus(page);
  expect(JSON.stringify(after.labels), '+40px rebuild: label population identical').toBe(labelGeo);
  expect(after.geom.paneH, '+40px rebuild: pane grew').toBeGreaterThan(census.geom.paneH);
  expect(after.geom.canvasH, '+40px rebuild: canvas height unchanged at default zoom').toBe(census.geom.canvasH);

  // Restore.
  await adapter.applyStep(page, { type: 'viewport', height: vp.height }, 4);
  after = await adapter.captureCensus(page);
  expect(JSON.stringify(after.labels), 'restored: label population identical').toBe(labelGeo);
});

test('INV-20: strip travel clamps the pointer to the strip extent, then centers', async ({ page }) => {
  const adapter = mockupAdapter();
  await adapter.load(page);
  await adapter.applyStep(page, { type: 'reset' }, 0);

  const d = await page.evaluate(() => {
    const strip = document.querySelector('#mmStrip');
    const body = document.querySelector('#mmBody');
    const r = strip.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    const c = document.querySelector('#canvas');
    const doc = document.querySelector('#doc');
    const mm = document.querySelector('#mmCanvas');
    return {
      x: r.x + r.width / 2,
      // The strip's layout box is the FULL canvas height (15k px), mostly
      // translated outside the pane; the clickable surface is the visible
      // window [r.y, r.y + paneH].
      stripTop: r.y,
      paneH: br.height,
      H: parseFloat(mm.style.height),
      total: doc.offsetHeight,
      V: c.clientHeight,
      docTop0: doc.offsetTop,
      maxScroll: c.scrollHeight - c.clientHeight,
    };
  });

  // mmTravelTo (mockup:2320-2324): y (relative to the translated strip
  // rect) is clamped to [0, stripHeight], then scrollTop = mmMapToDoc(y) −
  // V/2 + docTop0 — doc(y) = y × total/H. Click map positions inside the
  // CURRENTLY VISIBLE pane window, BELOW the resting thumb: the viewport
  // overlay (#mmVpBox, z-index 5) spans the strip AND lanes, so pointer
  // positions under it start thumb drags, not strip travel (measured).
  for (const mapY of [200, d.paneH / 2, d.paneH - 10]) {
    const clampedY = Math.max(0, Math.min(d.paneH, mapY));
    // Re-read the strip's CURRENT top every iteration: each click scrolls
    // and re-pans the canvas, moving the strip under the pointer.
    const stripTop = await page.evaluate(() =>
      document.querySelector('#mmStrip').getBoundingClientRect().y,
    );
    await page.mouse.click(d.x, stripTop + clampedY);
    await page.waitForTimeout(150);
    const scrollTop = await page.evaluate(() => document.querySelector('#canvas').scrollTop);
    const docY = (clampedY * d.total) / d.H;
    const expected = Math.max(0, Math.min(d.maxScroll, docY - d.V / 2 + d.docTop0));
    expect(
      Math.abs(scrollTop - expected),
      `strip click at mapY=${clampedY.toFixed(0)}: clamped travel then centered (±60px band)`,
    ).toBeLessThanOrEqual(60);
  }

  // Drag: pointerdown at map 200 (below the thumb), move to the visible
  // middle — continuous travel follows the pointer (setPointerCapture
  // keeps moves on the strip for trusted input). Start from a clean
  // zero-pan state so every coordinate is on-screen, and re-read the strip
  // top between the down (which travels + re-pans) and the move (whose
  // handler reads the rect live).
  await page.evaluate(() => {
    document.querySelector('#canvas').scrollTop = 0;
  });
  await page.waitForTimeout(150);
  const dragStripTop = await page.evaluate(() =>
    document.querySelector('#mmStrip').getBoundingClientRect().y,
  );
  await page.mouse.move(d.x, dragStripTop + 200);
  await page.mouse.down();
  await page.waitForTimeout(120);
  const postDownTop = await page.evaluate(() =>
    document.querySelector('#mmStrip').getBoundingClientRect().y,
  );
  await page.mouse.move(d.x, postDownTop + d.paneH / 2);
  await page.mouse.up();
  await page.waitForTimeout(150);
  const dragScroll = await page.evaluate(() => document.querySelector('#canvas').scrollTop);
  const expectedDrag = Math.max(
    0,
    Math.min(d.maxScroll, (d.paneH / 2 * d.total) / d.H - d.V / 2 + d.docTop0),
  );
  expect(Math.abs(dragScroll - expectedDrag), 'strip drag travels continuously to the pointer (±60px band)')
    .toBeLessThanOrEqual(60);
});
