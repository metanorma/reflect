/**
 * Package-owned e2e for `@metanorma/prosemirror-minimap` (§15.3).
 *
 * Migrated from `pkg/editor-gui/e2e/minimap.spec.ts`, where they tested
 * package contracts through consumer wiring (and broke on every consumer
 * restyle or schema refactor). Here they run against the harness
 * (`../harness/`) on the synthetic schema, each pinning its own
 * configuration — the tests own the knobs they assert about.
 *
 * Pixel assertions assume the harness geometry: 96×600 pane, headless dpr 1
 * (device px ≈ CSS px). Consumer-owned coverage (placement, state-swap
 * wiring, integration smoke) stays in editor-gui.
 */
import { expect, test } from '@playwright/test';
import type { HarnessOptions } from './fixtures.js';
import {
  mount,
  loadDoc,
  minimap,
  canvas,
  overlay,
  tallDoc,
  docWith,
  heading,
  para,
  paintedRows,
  inkBands,
  scrollGeom,
  TRANSPARENT_THEME,
} from './fixtures.js';

/** Classify a painted row as a solid bar vs glyph strokes. Solidity alone
 * is not enough: a stray 1–3px glyph-stroke fragment (a descender pixel,
 * an antialiased stem) is trivially "solid" over its own tiny span and
 * vacuously passes, then pollutes bar selection and fails width
 * assertions meant for real bars. A bar must also be bar-SIZED — at
 * least MIN_BAR_SPAN px wide, comfortably under the narrowest genuine
 * bar (the empty-textblock bar, 0.08 × 96 ≈ 7–8px) and above the largest
 * observed fragment (3px). */
const MIN_BAR_SPAN = 5;
function isBar(r: { n: number; left: number; right: number }): boolean {
  const span = r.right - r.left + 1;
  return span >= MIN_BAR_SPAN && r.n >= span * 0.95;
}

/** Glyph-path theme + classifier NAME (the harness maps the name to the
 * real factory — classifiers are functions and can't cross
 * `page.evaluate`): headings route to the glyph-enabled class, other
 * textblocks to `text` (§5.1/§5.4). Transparent background AND selection
 * (the fresh editor's doc-start selection paints a full-width tint that
 * pollutes ink analysis). `display: 'sliding'` pins the effective scale
 * to `zoomPxPerEditorPx` — in `auto`/fit a short doc resolves to a large
 * fit scale, and the pixel bounds below assume the 0.25 baseline. */
const GLYPH_OPTIONS: HarnessOptions = {
  display: 'sliding',
  zoomPxPerEditorPx: 0.25,
  theme: {
    background: 'transparent',
    selection: { color: '#77aaff', alpha: 0 },
    classes: {
      text: { color: '#8888a0', indent: true },
      heading: { color: '#c8c8dc', indent: true, glyphs: true },
    },
  },
  classifier: 'glyphs',
};


test.describe('minimap (package e2e)', () => {
  test('dragging the viewport overlay scrolls the editor down', async ({ page }) => {
    await page.goto('/');
    // editor-scrolls is the default scroll shape.
    await mount(page, { doc: tallDoc(60) });
    // Let the sliced build + stride sampling converge on the layout.
    await page.waitForTimeout(500);

    const scroller = page.locator('.mn-harness-editor-scrolls .ProseMirror');
    const before = await page.evaluate(
      () => document.querySelector('.ProseMirror')?.scrollTop ?? 0,
    );

    // Drag the viewport strip toward the bottom of the pane (the overlay
    // owns drag-to-scroll). The drag end is pane-RELATIVE (40px above the
    // pane's bottom edge — clear of the thumb), not an absolute y.
    const box = await overlay(page).boundingBox();
    const paneBox = await minimap(page).boundingBox();
    expect(box).not.toBeNull();
    expect(paneBox).not.toBeNull();
    const x = box!.x + box!.width / 2;
    await page.mouse.move(x, box!.y + 10);
    await page.mouse.down();
    await page.mouse.move(x, paneBox!.y + paneBox!.height - 40, { steps: 8 });
    await page.mouse.up();

    const after = await page.evaluate(
      () => document.querySelector('.ProseMirror')?.scrollTop ?? 0,
    );
    expect(after).toBeGreaterThan(before);
    expect(scroller).toBeDefined(); // (shape sanity; scroll asserted above)
  });

  test('drag release does not jump the document (precise-commit regression)', async ({ page }) => {
    await page.goto('/');
    await mount(page, { doc: tallDoc(60) });
    await page.waitForTimeout(500);

    // Scroll to the real bottom, then drag the thumb up a little and
    // release. The pre-fix `precise` commit mixed model-space offsets
    // with real DOM offsets and jumped the document to near the top.
    const maxScroll = await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror') as HTMLElement;
      pm.scrollTop = pm.scrollHeight - pm.clientHeight;
      return pm.scrollTop;
    });
    await page.waitForTimeout(300);

    const box = await overlay(page).boundingBox();
    expect(box).not.toBeNull();
    // Grab the thumb's MIDDLE (a grab offset ≠ 0 — the pre-fix code
    // anchored moves to the thumb top and teleported) and drag up 60px.
    const x = box!.x + box!.width / 2;
    const start = box!.y + box!.height / 2;
    const end = Math.max(start - 60, 20);
    await page.mouse.move(x, start);
    await page.mouse.down();
    await page.mouse.move(x, end, { steps: 6 });
    const during = await page.evaluate(
      () => (document.querySelector('.ProseMirror') as HTMLElement).scrollTop,
    );
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await page.evaluate(
      () => (document.querySelector('.ProseMirror') as HTMLElement).scrollTop,
    );

    // During the drag and after release the position stays in the drag's
    // neighbourhood — no teleport to the document start…
    expect(during).toBeGreaterThan(maxScroll * 0.4);
    expect(after).toBeGreaterThan(maxScroll * 0.4);
    // …and the release is CONTINUOUS with the last move (the pre-fix snap
    // drifted every release DOWN by a constant few-px jump).
    expect(Math.abs(after - during)).toBeLessThanOrEqual(1);
  });

  test('viewport indicator reaches the document end (model-accuracy regression)', async ({ page }) => {
    await page.goto('/');
    // tallDoc(15) in a 600px pane is decisively scrollable; fit mode at
    // zoom 0.25 pins the geometry for the convergence assertion below.
    await mount(page, { doc: tallDoc(15) });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror') as HTMLElement;
      pm.scrollTop = pm.scrollHeight - pm.clientHeight;
    });
    // Wait for CONVERGENCE (the sampler drives rows toward real strides
    // over a few frames), not a fixed sleep: the gap between the thumb's
    // bottom and the last painted pixel row stops moving.
    await expect(async () => {
      let prev = -1;
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(100);
        const gap = await page.evaluate(() => {
          const canvas = document.querySelector('.mn-minimap canvas') as HTMLCanvasElement;
          const ctx = canvas.getContext('2d')!;
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          const w = canvas.width;
          const thumb = document.querySelector('.mn-minimap-viewport') as HTMLElement;
          let lastInk = -1;
          for (let y = canvas.height - 1; y >= 0 && lastInk < 0; y--) {
            for (let x = 0; x < w; x++) {
              if (data[(y * w + x) * 4 + 3] > 0) { lastInk = y; break; }
            }
          }
          const canvasTop = canvas.getBoundingClientRect().top;
          return thumb.getBoundingClientRect().bottom - (canvasTop + lastInk);
        });
        if (Math.abs(gap - prev) <= 1 && Math.abs(gap) < 24) return;
        prev = gap;
      }
      expect(Math.abs(prev)).toBeLessThan(24);
    }).toPass();
  });

  test('typing content after mount extends the drag range (stale-geometry regression)', async ({ page }) => {
    await page.goto('/');
    await mount(page, {
      doc: docWith(heading('Doc'), para('Body paragraph one.'), para('Body paragraph two.')),
    });

    // The caret must land in a paragraph — click the FIRST paragraph's
    // box, not the editable root (a root click lands on the heading).
    const p = page.locator('.ProseMirror p').first();
    await p.click();

    // Type ~two screenfuls of paragraphs after mount. The minimap tracks
    // the typing, but the drag clamp ran on the STALE scrollHeight —
    // dragging could not reach the freshly typed tail.
    for (let i = 0; i < 50; i++) {
      await page.keyboard.type(`Paragraph ${i} of fresh content.`);
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(700); // sliced build + sampling settle

    const geo = await scrollGeom(page);
    expect(geo.maxScroll).toBeGreaterThan(geo.clientHeight);

    // Drag the thumb to the pane's bottom edge; the editor must reach
    // (within a few px of) the real maxScroll — not stall at the
    // pre-typing extent.
    const box = await overlay(page).boundingBox();
    const paneBox = await minimap(page).boundingBox();
    expect(box).not.toBeNull();
    expect(paneBox).not.toBeNull();
    const x = box!.x + box!.width / 2;
    await page.mouse.move(x, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, paneBox!.y + paneBox!.height - 20, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await page.evaluate(
      () => (document.querySelector('.ProseMirror') as HTMLElement).scrollTop,
    );
    expect(after).toBeGreaterThanOrEqual(geo.maxScroll - 8);
  });

  test('sliding mode (past the fit threshold) fills the pane and scrolls proportionally', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 931 });
    await page.goto('/');
    // The sliding regime pinned explicitly: surface = zoom × total must
    // exceed the pane — 1,200 empty-ish paragraphs ≈ 48,000px × 0.05 =
    // 2,400 > 600 (the harness pane is height-capped at 600 regardless of
    // viewport; the viewport only needs to contain the app).
    const paras = Array.from({ length: 1200 }, () => para(''));
    await mount(page, {
      doc: docWith(...paras),
      options: { display: 'sliding', zoomPxPerEditorPx: 0.05 },
    });
    await page.waitForTimeout(1200);

    const geo = await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror') as HTMLElement;
      const pane = document.querySelector('.mn-minimap') as HTMLElement;
      const thumb = document.querySelector('.mn-minimap-viewport') as HTMLElement;
      const tb = thumb.getBoundingClientRect();
      return {
        maxScroll: pm.scrollHeight - pm.clientHeight,
        paneH: pane.clientHeight,
        thumbTop: tb.top,
        thumbH: tb.height,
      };
    });
    expect(geo.maxScroll).toBeGreaterThan(geo.paneH); // sliding regime

    // 1) The thumb spans a sane fraction of the pane (scrollbar
    //    proportion), not the whole pane nor a sliver.
    expect(geo.thumbH).toBeGreaterThan(20);
    expect(geo.thumbH).toBeLessThan(geo.paneH * 0.5);

    // 2) Paint fills the pane: every vertical band of the canvas carries
    //    ink (pre-fix, only the top quarter painted).
    const bands = await page.evaluate(() => {
      const canvas = document.querySelector('.mn-minimap canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const w = canvas.width;
      const h = canvas.height;
      const rowPainted = (y: number) => {
        for (let x = 1; x < w; x += 3) {
          const d = ctx.getImageData(x, y, 1, 1).data;
          if (d[3] > 0 || d[0] + d[1] + d[2] > 20) return true;
        }
        return false;
      };
      const out: Record<string, boolean> = {};
      for (const [name, y] of [
        ['q1', Math.floor(h * 0.15)],
        ['q2', Math.floor(h * 0.35)],
        ['mid', Math.floor(h * 0.5)],
        ['q3', Math.floor(h * 0.7)],
        ['q4', Math.floor(h * 0.9)],
      ] as Array<[string, number]>) {
        out[name] = rowPainted(y) || rowPainted(y + 1) || rowPainted(y + 2);
      }
      return out;
    });
    for (const [band, painted] of Object.entries(bands)) {
      expect(painted, `canvas band ${band} painted`).toBe(true);
    }

    // 3) Proportional mid-track drag: thumb at 50% of its travel →
    //    scrollTop at 50% of maxScroll, and the thumb's placement matches
    //    (scrollbar contract, reversible).
    const box = await overlay(page).boundingBox();
    const paneBox = await minimap(page).boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2;
    const grabY = box!.y + box!.height / 2; // mid-thumb grab
    const travel = geo.paneH - geo.thumbH;
    const pointerY = paneBox!.y + travel / 2 + (grabY - box!.y);
    await page.mouse.move(x, grabY);
    await page.mouse.down();
    await page.mouse.move(x, pointerY, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror') as HTMLElement;
      const thumb = document.querySelector('.mn-minimap-viewport') as HTMLElement;
      const pane = document.querySelector('.mn-minimap') as HTMLElement;
      return {
        scrollTop: pm.scrollTop,
        thumbTopInPane: thumb.getBoundingClientRect().top
          - pane.getBoundingClientRect().top,
      };
    });
    expect(Math.abs(after.scrollTop / geo.maxScroll - 0.5)).toBeLessThan(0.03);
    expect(Math.abs(after.thumbTopInPane / travel - 0.5)).toBeLessThan(0.05);

    // 4) Dragging to the pane bottom reaches the document end. Re-read
    //    the thumb box — it MOVED in step 3; a stale box would grab
    //    empty track.
    const box2 = await overlay(page).boundingBox();
    const grab2 = box2!.y + box2!.height / 2;
    await page.mouse.move(x, grab2);
    await page.mouse.down();
    await page.mouse.move(x, paneBox!.y + geo.paneH - 20, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const endScroll = await page.evaluate(
      () => (document.querySelector('.ProseMirror') as HTMLElement).scrollTop,
    );
    expect(endScroll).toBeGreaterThanOrEqual(geo.maxScroll - 8);
  });

  test('headings paint glyphs; body text paints solid bars', async ({ page }) => {
    await page.goto('/');
    await mount(page, {
      doc: docWith(
        heading('Heading one'),
        para('Body text of section one. '.repeat(4)),
      ),
      options: GLYPH_OPTIONS,
    });
    // Let the pane attach, the model build, heights sample, and the first
    // paint land (paints before height-sampling can land rows flush
    // against their neighbours and merge bands).
    await page.waitForTimeout(1500);

    const rows = await paintedRows(page);
    expect(rows.length).toBeGreaterThan(0);
    const w = await page.evaluate(
      () => (document.querySelector('.mn-minimap canvas') as HTMLCanvasElement).width,
    );
    // Vacuous-pass guard: a collapsed pane would make width assertions
    // pass vacuously.
    expect(w).toBeGreaterThanOrEqual(40);

    // The heading rows: NOT solid bars — character strokes. With glyphs
    // disabled every one of these rows would be a full-width bar.
    const titleRows = rows.filter((r) => !isBar(r));
    expect(titleRows.length).toBeGreaterThanOrEqual(3);
    for (const r of titleRows) {
      // The fill rule (§5.4): glyphs paint the actual characters — 12
      // chars × 3px + 0px indent (top-level heading, depth 0) ≈ 36px —
      // well under a solid bar's ~95.
      expect(r.right).toBeLessThanOrEqual(60);
    }
    // AGGREGATE sparseness over the whole title row-set: character
    // strokes leave gaps ACROSS rows, so only the aggregate density
    // separates glyphs (<0.9) from a solid bar (1.0).
    const painted = titleRows.reduce((a, r) => a + r.n, 0);
    const span = titleRows.reduce((a, r) => a + (r.right - r.left + 1), 0);
    expect(painted / span).toBeLessThan(0.9);

    // The body bar: SOLID rows running nearly the full width (the
    // paragraph is long: widthFrac ≈ 1 at 108 chars / 80 charsPerLine).
    const barRows = rows.filter(isBar);
    expect(barRows.length).toBeGreaterThanOrEqual(3);
    for (const r of barRows) {
      expect(r.right - r.left).toBeGreaterThanOrEqual(w - 8);
    }
  });

  test('astral-plane heading characters paint one glyph cell per character', async ({ page }) => {
    await page.goto('/');
    // '𝕏 heading' (U+1D54F MATHEMATICAL DOUBLE-STRUCK X) is 9 CODE POINTS
    // but 10 UTF-16 units. Iteration is by code point (renderer §6.5), so
    // the row paints 9 cells — the astral character is one cell and one
    // atlas cache key, never two lone-surrogate tofu blits.
    await mount(page, {
      doc: docWith(
        heading('𝕏 heading'),
        para('Body text of the astral section. '.repeat(4)),
      ),
      options: GLYPH_OPTIONS,
    });
    await page.waitForTimeout(1500);

    const rows = await paintedRows(page);
    expect(rows.length).toBeGreaterThan(0);
    const w = await page.evaluate(
      () => (document.querySelector('.mn-minimap canvas') as HTMLCanvasElement).width,
    );
    expect(w).toBeGreaterThanOrEqual(40);

    // Isolate the title rows (non-solid); every one stays inside the
    // character-advance span: 9 cells × 3px + 0px indent (top-level
    // heading, depth 0) ≈ 27px — under the solid-bar width (~95px) and
    // the pre-fix 10-cell span too.
    const titleRows = rows.filter((r) => !isBar(r));
    expect(titleRows.length).toBeGreaterThanOrEqual(3);
    for (const r of titleRows) {
      expect(r.right).toBeLessThanOrEqual(60);
    }
    const painted = titleRows.reduce((a, r) => a + r.n, 0);
    const span = titleRows.reduce((a, r) => a + (r.right - r.left + 1), 0);
    expect(painted / span).toBeLessThan(0.9);
  });

  test('nested section bodies indent in lockstep with their titles', async ({ page }) => {
    await page.goto('/');
    // Paint order (fit mode — the doc is short): the bands are the six
    // text rows of the sacrificial section and the measured pair — titles
    // and paragraphs, depth 1 (left 2) for the top-level sections, depth 2
    // (left 4) for the nested one. No selection is placed: the selection
    // layer tints the full width from x=0 and would pollute left-edge
    // measurements.
    await mount(page, {
      doc: docWith(
        // Sacrificial first section: absorbs the doc-start selection tint
        // and any top-edge merge so the measured bands are clean.
        { type: 'section', content: [
          heading('Sacrificial section'),
          para('Sacrificial body. '.repeat(3)),
        ] },
        { type: 'section', content: [
          heading('Section two'),
          para('Section two body paragraph. '.repeat(3)),
          { type: 'section', content: [
            heading('Nested section'),
            para('Nested body paragraph. '.repeat(3)),
          ] },
        ] },
      ),
      options: GLYPH_OPTIONS,
    });
    await page.waitForTimeout(800);

    const rows = await paintedRows(page);
    expect(rows.length).toBeGreaterThan(0);

    // No text row paints at the flush left edge (pre-fix paragraphs sat
    // at x = 0 while their titles indented)…
    for (const r of rows) {
      expect(r.left).toBeGreaterThanOrEqual(1);
    }
    // …exactly two distinct indent steps appear — depth 1 (×2px = 2) for
    // the top-level sections' titles AND bodies, depth 2 (= 4) for the
    // nested section's. Detect the steps from SOLID BAR rows (paragraph
    // bars start exactly at their indent — no stroke-gap variance), then
    // verify the glyph rows share them.
    const barLefts = new Set(rows.filter(isBar).map((r) => r.left));
    expect(barLefts.size).toBe(2);
    const stepD1 = Math.min(...barLefts);
    const stepD2 = Math.max(...barLefts);
    expect(stepD2 - stepD1).toBeGreaterThanOrEqual(2);
    // Each step carries both paint styles: ≥2 solid bar rows (paragraphs)
    // and ≥2 sparse glyph rows (titles) at that step — proving title AND
    // body align there. Glyph rows may start a pixel late (stroke gaps),
    // so they match a step within ±1.
    for (const step of [stepD1, stepD2]) {
      const at = rows.filter((r) => Math.abs(r.left - step) <= 1);
      const bars = at.filter(isBar);
      const glyphs = at.filter((r) => !isBar(r));
      expect(bars.length).toBeGreaterThanOrEqual(2);
      expect(glyphs.length).toBeGreaterThanOrEqual(2);
    }
    for (const r of rows) {
      expect(r.left).toBeGreaterThanOrEqual(stepD1 - 1);
    }
  });

  test('typing in a paragraph does not shift the content below (keystroke-stability regression)', async ({ page }) => {
    await page.goto('/');
    await mount(page, {
      doc: docWith(
        heading('Section one'),
        para('First body.'),
        heading('Section two'),
        para('Second body.'),
        para('Third body.'),
        para('Fourth body.'),
      ),
    });
    // Let the model build and stride sampling converge on real layout.
    await page.waitForTimeout(1200);

    // Caret into section one's paragraph (row 2 of 6 — rows below it are
    // the measurement target).
    const p = page.locator('.ProseMirror p').first();
    await p.click();

    // Baseline: the y-extent of the LAST painted band, sampled between
    // keystrokes. Pre-fix each keystroke showed a ±margin jump on the
    // frame the estimate landed before the re-measure; the fix carries
    // the predecessor's measured height into the replacement row.
    const measure = () => page.evaluate(() => {
      const canvas = document.querySelector('.mn-minimap canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const w = canvas.width;
      let last = -1;
      for (let y = 0; y < canvas.height; y++) {
        let ink = false;
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 0) { ink = true; break; }
        }
        if (ink) last = y;
      }
      return { last };
    });

    const before = await measure();
    const samples: Array<{ last: number }> = [];
    for (let i =  0; i < 8; i++) {
      await page.keyboard.press('x');
      await page.waitForTimeout(120);
      samples.push(await measure());
    }
    for (const [i, s] of samples.entries()) {
      expect(s.last, `tail position after keystroke ${i + 1}`).toBe(before.last);
    }
  });

  test('scrollContainer variants find the right scroll container', async ({ page }) => {
    // The wrapper-scrolls shapes have no consumer analogue: an outer div
    // scrolls instead of the editable. The default walk-up must find it,
    // and the explicit resolver must too — the package contract (§7.1).
    for (const scrollShape of ['wrapper-scrolls', 'wrapper-scrolls-explicit'] as const) {
      await page.goto('/');
      await mount(page, { doc: tallDoc(40), scrollShape });
      await page.waitForTimeout(500);

      // The wrapper (not the editable) is the scroll container: dragging
      // the thumb scrolls the WRAPPER.
      const before = await page.evaluate(
        () => (document.querySelector('.mn-harness-scrollwrapper') as HTMLElement).scrollTop,
      );
      const box = await overlay(page).boundingBox();
      const paneBox = await minimap(page).boundingBox();
      expect(box).not.toBeNull();
      const x = box!.x + box!.width / 2;
      await page.mouse.move(x, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.mouse.move(x, paneBox!.y + paneBox!.height - 30, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(200);
      const after = await page.evaluate(
        () => (document.querySelector('.mn-harness-scrollwrapper') as HTMLElement).scrollTop,
      );
      expect(after, `${scrollShape}: wrapper scrolled by drag`).toBeGreaterThan(before);
      // And the editable itself is NOT scrolled (height: auto inside the
      // wrapper — no overflow of its own).
      const pmScrollTop = await page.evaluate(
        () => (document.querySelector('.ProseMirror') as HTMLElement).scrollTop,
      );
      expect(pmScrollTop).toBe(0);
    }
  });

  test('empty paragraphs paint bars under the one-word fraction (shortEmpty e2e)', async ({ page }) => {
    // The pixel-level counterpart of headless §15.1.32: on the synthetic
    // schema, with the harness's pinned geometry, empty vs one-word vs
    // long paragraphs paint distinct, monotone bar widths — one-word ≈
    // 0.20, empty = 0.08, long = 1.0 of the usable width.
    await page.goto('/');
    await mount(page, {
      doc: docWith(
        heading('Word.'),
        para('Word.'),
        para(''),
        para('A long paragraph of body text. '.repeat(3)),
      ),
      options: TRANSPARENT_THEME,
    });
    await page.waitForTimeout(1500);

    const rows = await paintedRows(page);
    expect(rows.length).toBeGreaterThan(0);
    const w = await page.evaluate(
      () => (document.querySelector('.mn-minimap canvas') as HTMLCanvasElement).width,
    );
    expect(w).toBeGreaterThanOrEqual(40);

    const solid = rows.filter(isBar);
    expect(solid.length).toBeGreaterThanOrEqual(3);

    // Group solid rows into bars by painted extent runs (consecutive rows
    // sharing [left, right] are one bar; the extent changes at every bar
    // boundary).
    const bars: Array<{ top: number; bottom: number; width: number }> = [];
    let prevRow: { y: number; left: number; right: number } | null = null;
    for (const r of solid) {
      if (
        prevRow !== null
        && r.y <= prevRow.y + 1
        && r.left === prevRow.left
        && r.right === prevRow.right
      ) {
        bars[bars.length - 1].bottom = r.y;
      } else {
        bars.push({ top: r.y, bottom: r.y, width: r.right - r.left + 1 });
      }
      prevRow = r;
    }
    // ≥3 bars: one-word, empty, long (possibly merged extents).
    expect(bars.length, JSON.stringify(bars)).toBeGreaterThanOrEqual(3);

    const usable = w; // indent excluded below via left edges
    const longBar = bars[bars.length - 1];
    expect(longBar).toBeDefined();
    // Long (108 chars > 80 charsPerLine) saturates: full usable width.
    expect(longBar.width).toBeGreaterThanOrEqual(usable - 8);

    // One-word (5 chars): fraction = 0.15 + 0.85 × 5/80 = 0.203 → ≈19px
    // of 96 usable. Find it by width signature.
    const oneWordBar = bars.find((b) => b.width >= 14 && b.width <= 26);
    expect(oneWordBar, JSON.stringify(bars)).toBeDefined();
    // Empty textblock: EXACTLY 0.08 × 96 ≈ 7-8px.
    const emptyBar = bars.find((b) => b.width >= 6 && b.width <= 9);
    expect(emptyBar, JSON.stringify(bars)).toBeDefined();
    // Monotone: empty < one-word < long.
    expect(emptyBar!.width).toBeLessThan(oneWordBar!.width);
    expect(oneWordBar!.width).toBeLessThan(longBar.width);
  });

  test('glyph cell height scales with the zoom (atlas-scale regression)', async ({ page }) => {
    await page.goto('/');
    // Regression: the glyph atlas baked its cell at a FIXED 4×10 CSS px
    // regardless of scale — rows shrank with zoomPxPerEditorPx but glyph
    // cells did not, so headings towered ~5× over their row slots and
    // overlapped neighbouring bars. The fix scales the cell (and its
    // advance and font raster) with the effective scale, quantized to
    // 20% buckets relative to the 0.25 baseline.
    await mount(page, {
      doc: docWith(heading('Clause one title'), para('Body text of clause one.')),
      options: { ...GLYPH_OPTIONS, zoomPxPerEditorPx: 0.05 },
    });
    await page.waitForTimeout(1500);

    // Band scan (zoom-agnostic grouping): the heading's GLYPH band, then
    // the body BAR band. The assertion: the glyph band's height is
    // comparable to the bar scale (a few px at the 0.05 zoom) — NOT the
    // fixed ~10px a scale-blind cell paints.
    const bands = await inkBands(page);
    expect(bands.length).toBeGreaterThanOrEqual(2);
    const glyphBandH = bands[0].bottom - bands[0].top + 1;
    expect(glyphBandH, JSON.stringify(bands)).toBeLessThanOrEqual(5);
    expect(glyphBandH).toBeGreaterThanOrEqual(1);
  });
});
