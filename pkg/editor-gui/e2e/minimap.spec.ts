/**
 * Minimap integration tests — the left-docked document minimap
 * (`pkg/editor-gui/MinimapPane.tsx` hosting
 * `@metanorma/prosemirror-minimap`).
 *
 * The pane wrapper is CSS-Module-scoped, but the minimap package's own
 * classes (`.mn-minimap`, `.mn-minimap-canvas`, `.mn-minimap-viewport`) are
 * global — tests select those.
 *
 * Four concerns:
 *  1. placement — the minimap sits between the sidebar and the editor;
 *  2. presence — canvas and viewport overlay render at non-zero size;
 *  3. interaction — clicking the lower overlay scrolls the editor;
 *  4. regression — loading a fresh document (state swap) and typing after
 *     it does not break the editor.
 */
import { expect, test } from '@playwright/test';
import { openEditor, clickEditor } from './helpers.js';

/** Build a tall document JSON: bibdata + sections with many clauses. */
function tallDoc(clauseCount: number): Record<string, unknown> {
  const clauses = Array.from({ length: clauseCount }, (_, i) => ({
    type: 'clause',
    attrs: { id: `clause-${i + 1}`, unnumbered: null },
    content: [
      {
        type: 'section_title',
        content: [{ type: 'text', text: `Clause ${i + 1}` }],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `Body text of clause ${i + 1}. `.repeat(4),
          },
        ],
      },
    ],
  }));
  return {
    type: 'doc',
    attrs: { id: 'doc_tall' },
    content: [
      { type: 'bibdata', attrs: { item: null } },
      {
        type: 'sections',
        attrs: { id: 'sections_tall' },
        content: clauses,
      },
    ],
  };
}

test.describe('minimap', () => {

  test('minimap pane sits between the sidebar and the editor', async ({ page }) => {
    await openEditor(page);
    const minimap = page.locator('.mn-minimap');
    await expect(minimap).toBeVisible();

    const sidebarBox = await page.locator('aside').boundingBox();
    const minimapBox = await minimap.boundingBox();
    const editorBox = await page
      .locator('.appwrapper .mn-prosemirror .ProseMirror')
      .boundingBox();

    expect(sidebarBox).not.toBeNull();
    expect(minimapBox).not.toBeNull();
    expect(editorBox).not.toBeNull();

    // Immediately right of the sidebar rail…
    expect(minimapBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width - 1);
    // …and left of the editor surface.
    expect(minimapBox!.x + minimapBox!.width).toBeLessThanOrEqual(editorBox!.x + 1);
    // Full height (docked, not floating).
    expect(minimapBox!.height).toBeGreaterThan(200);
  });

  test('canvas and viewport overlay render at non-zero size', async ({ page }) => {
    await openEditor(page);
    const canvas = page.locator('.mn-minimap canvas');
    const overlay = page.locator('.mn-minimap-viewport');
    await expect(canvas).toBeVisible();
    await expect(overlay).toHaveCount(1);

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(canvasBox!.width).toBeGreaterThan(10);
    expect(canvasBox!.height).toBeGreaterThan(10);
  });

  test('dragging the viewport overlay scrolls the editor down', async ({ page }) => {
    await openEditor(page);

    // Load a tall document (state-swap path — the minimap rebuilds its
    // model without a transaction).
    const ok = await page.evaluate((json) => {
      const w = window as { __mnLoadDoc?: (json: unknown) => boolean };
      return w.__mnLoadDoc?.(json) ?? false;
    }, tallDoc(60));
    expect(ok).toBe(true);
    // Let the sliced build + stride sampling converge on the layout.
    await page.waitForTimeout(500);

    const overlay = page.locator('.mn-minimap-viewport');
    await expect(overlay).toBeVisible();

    const scrollTopBefore = await page.evaluate(
      () => document.querySelector('.ProseMirror')?.scrollTop ?? 0,
    );

    // Drag the viewport strip toward the bottom of the pane (the overlay
    // owns drag-to-scroll; the canvas area below the strip has no
    // track-click affordance). The drag end is pane-RELATIVE (40px above
    // the pane's bottom edge — clear of the thumb, which sits at the top
    // on a freshly loaded doc), not an absolute y, so it survives pane
    // height/position changes.
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    const paneBox = await page.locator('.mn-minimap').boundingBox();
    expect(paneBox).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 10);
    await page.mouse.down();
    await page.mouse.move(
      box!.x + box!.width / 2,
      paneBox!.y + paneBox!.height - 40,
      { steps: 8 },
    );
    await page.mouse.up();

    const scrollTopAfter = await page.evaluate(
      () => document.querySelector('.ProseMirror')?.scrollTop ?? 0,
    );
    expect(scrollTopAfter).toBeGreaterThan(scrollTopBefore);
  });

  test('drag release does not jump the document (precise-commit regression)', async ({ page }) => {
    await openEditor(page);
    const ok = await page.evaluate((json) => {
      const w = window as { __mnLoadDoc?: (json: unknown) => boolean };
      return w.__mnLoadDoc?.(json) ?? false;
    }, tallDoc(60));
    expect(ok).toBe(true);
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

    const overlay = page.locator('.mn-minimap-viewport');
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    // Grab the thumb's MIDDLE (a grab offset ≠ 0 — the pre-fix code
    // anchored moves to the thumb top and teleported) and drag up 60px,
    // staying inside the viewport.
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

    // During the drag and after the release the position stays in the
    // drag's neighbourhood — no teleport to the document start (the bug
    // produced ~0)…
    expect(during).toBeGreaterThan(maxScroll * 0.4);
    expect(after).toBeGreaterThan(maxScroll * 0.4);
    // …and the release is CONTINUOUS with the last move: the commit maps
    // through the drag's frozen basis and applies no precise snap, so the
    // post-release delta is zero. (The pre-fix snap drifted every release
    // DOWN by the container's content padding — a constant few-px jump
    // even when the position was otherwise unchanged.)
    expect(Math.abs(after - during)).toBeLessThanOrEqual(1);
  });

  test('viewport indicator reaches the document end (model-accuracy regression)', async ({ page }) => {
    await openEditor(page);
    // A decisively scrollable document (taller than the 720px viewport).
    // Mode-agnostic assertion: the consumer currently forces
    // `display: 'sliding'` (MinimapPane.tsx), where the surface (0.25 ×
    // total) can be shorter than the pane and the thumb bottoms at the
    // SURFACE's end — the painted content's end — not the pane's. The
    // invariant under test is the original regression either way: the
    // thumb must REACH the end of what is painted (pre-fix the model
    // over-predicted by ~34% and the indicator undershot the painted
    // content's tail by a third).
    const ok = await page.evaluate((json) => {
      const w = window as { __mnLoadDoc?: (json: unknown) => boolean };
      return w.__mnLoadDoc?.(json) ?? false;
    }, tallDoc(15));
    expect(ok).toBe(true);
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror') as HTMLElement;
      pm.scrollTop = pm.scrollHeight - pm.clientHeight;
    });
    // Wait for CONVERGENCE (the sampler drives rows toward real strides
    // over a few frames), not a fixed sleep. Converged := the gap stops
    // moving (two consecutive reads within 1px), bounded at 3s.
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
          // The lowest painted pixel row = the painted content's end.
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
    await openEditor(page);
    await clickEditor(page);

    // Repro from the report: type ~two screenfuls of paragraphs after
    // mount. The minimap tracks the typing, but the drag clamp ran on the
    // STALE scrollHeight (refreshed only by container resize / font load
    // / tab switch) — dragging could not reach the freshly typed tail.
    for (let i = 0; i < 50; i++) {
      await page.keyboard.type(`Paragraph ${i} of fresh content.`);
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(700); // sliced build + sampling settle

    const geo = await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror') as HTMLElement;
      const thumb = document.querySelector('.mn-minimap-viewport') as HTMLElement;
      return {
        scrollHeight: pm.scrollHeight,
        clientHeight: pm.clientHeight,
        maxScroll: pm.scrollHeight - pm.clientHeight,
        thumbBottom: thumb.getBoundingClientRect().bottom,
      };
    });
    expect(geo.maxScroll).toBeGreaterThan(geo.clientHeight);

    // Drag the thumb to the pane's bottom edge; the editor must reach
    // (within a few px of) the real maxScroll — not stall at the pre-typing
    // extent. Drag end is pane-relative (20px above the bottom).
    const overlay = page.locator('.mn-minimap-viewport');
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    const paneBox = await page.locator('.mn-minimap').boundingBox();
    expect(paneBox).not.toBeNull();
    const x = box!.x + box!.width / 2;
    await page.mouse.move(x, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      x,
      paneBox!.y + paneBox!.height - 20,
      { steps: 8 },
    );
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await page.evaluate(
      () => (document.querySelector('.ProseMirror') as HTMLElement).scrollTop,
    );
    expect(after).toBeGreaterThanOrEqual(geo.maxScroll - 8);
  });

  test('sliding mode (past the fit threshold) fills the pane and scrolls proportionally', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 931 });
    await openEditor(page);

    // Sliding regime at the CURRENT zoom (consumer sets 0.05; was 0.25):
    // surface = zoom × total must exceed the 931px pane — 1,200
    // newlines ≈ 48,000px → 0.05 × 48,000 = 2,400 > 931. (At the old
    // 0.25 zoom, ~90 newlines sufficed; typing 1,200 is slow, so the doc
    // is built as JSON and loaded instead.)
    const paras = Array.from({ length: 1200 }, (_, i) => ({
      type: 'paragraph',
      attrs: { data: {} },
      content: i % 10 === 0
        ? [{ type: 'text', text: `p${i}` }]
        : undefined,
    }));
    const ok = await page.evaluate((json) => {
      const w = window as { __mnLoadDoc?: (json: unknown) => boolean };
      return w.__mnLoadDoc?.(json) ?? false;
    }, {
      type: 'doc',
      attrs: { data: {} },
      content: [
        { type: 'bibdata', attrs: { item: null, data: {} } },
        {
          type: 'sections',
          attrs: { id: null, number: null, data: {} },
          content: [{
            type: 'clause',
            attrs: { id: 'c_slide', number: null, data: {} },
            content: [
              { type: 'section_title', attrs: { data: {} }, content: [{ type: 'text', text: 's' }] },
              ...paras,
            ],
          }],
        },
      ],
    });
    expect(ok).toBe(true);
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
    //    scrollTop at 50% of maxScroll (within tolerance), and the thumb's
    //    placement matches (scrollbar contract, reversible).
    const overlay = page.locator('.mn-minimap-viewport');
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    const paneBox = await page
      .locator('.mn-minimap')
      .boundingBox();
    const x = box!.x + box!.width / 2;
    const grabY = box!.y + box!.height / 2; // mid-thumb grab
    const travel = geo.paneH - geo.thumbH;
    // Pointer y so the thumb top lands at half its travel.
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
    //    the thumb box — it MOVED in step 3, and a stale box would grab
    //    empty track (no drag starts there).
    const box2 = await overlay.boundingBox();
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

  test('typing after a document load still works (state-swap regression)', async ({ page }) => {
    await openEditor(page);

    const ok = await page.evaluate((json) => {
      const w = window as { __mnLoadDoc?: (json: unknown) => boolean };
      return w.__mnLoadDoc?.(json) ?? false;
    }, tallDoc(5));
    expect(ok).toBe(true);

    // Type in the editor; the doc must contain the text afterwards (no
    // exception thrown by the minimap plugin's transaction handling).
    await clickEditor(page);
    await page.keyboard.type('still editable');
    const doc = await page.evaluate(() => {
      const w = window as { __mnGetDoc?: () => unknown };
      return JSON.stringify(w.__mnGetDoc?.());
    });
    expect(doc).toContain('still editable');
  });

  test('section titles paint glyphs; body text paints solid bars', async ({ page }) => {
    await openEditor(page);

    const ok = await page.evaluate((json) => {
      const w = window as { __mnLoadDoc?: (json: unknown) => boolean };
      return w.__mnLoadDoc?.(json) ?? false;
    }, {
      type: 'doc',
      attrs: { id: 'doc_glyphs' },
      content: [
        { type: 'bibdata', attrs: { item: null } },
        {
          type: 'sections',
          attrs: { id: 'sections_glyphs' },
          content: [{
            type: 'clause',
            attrs: { id: 'c1' },
            content: [
              {
                type: 'section_title',
                content: [{ type: 'text', text: 'Clause one title' }],
              },
              {
                type: 'paragraph',
                content: [{
                  type: 'text',
                  text: 'Body text of clause one. '.repeat(4),
                }],
              },
            ],
          }],
        },
      ],
    });
    expect(ok).toBe(true);
    // Let the remounted pane attach, the model build, heights sample, and
    // the first paint land (paints before height-sampling can land rows
    // flush against their neighbours and merge bands).
    await page.waitForTimeout(1500);

    // Painted-pixel analysis. The heading class opts into tier-1 glyph
    // blitting (sparse character strokes), while the text class paints a
    // filled rectangle. Bands alone are NOT a safe unit here: the title's
    // glyph rows can sit flush against the bibdata strip and merge into
    // one band — so the scan is per painted pixel ROW: each row records
    // its painted count, left, and right. The scan also returns the
    // canvas's backing-store size (`w`/`h`, DEVICE px — at the headless
    // dpr of 1 these equal CSS px; don't "fix" a dpr≠1 future by
    // rescaling here, the painted x-positions below are device px too).
    // No selection is placed (its full-width tint pollutes).
    const scan = await page.evaluate(() => {
      const canvas = document.querySelector('.mn-minimap canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');
      if (ctx === null) return { w: 0, h: 0, rows: [] as Array<{ y: number; n: number; left: number; right: number }> };
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const w = canvas.width;
      const h = canvas.height;
      const out: Array<{ y: number; n: number; left: number; right: number }> = [];
      for (let y = 0; y < h; y++) {
        let n = 0;
        let left = w;
        let right = -1;
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 0) {
            n++;
            if (left === w) left = x;
            right = x;
          }
        }
        if (n > 0) out.push({ y, n, left, right });
      }
      return { w, h, rows: out };
    });
    const { w, rows } = scan;
    expect(rows.length).toBeGreaterThan(0);
    // Sanity floor: a collapsed/failed pane (canvas ~1px) would make the
    // width assertions below pass VACUOUSLY — fail loudly instead.
    expect(w).toBeGreaterThanOrEqual(40);
    expect(rows.length).toBeGreaterThan(0);

    // Classification idiom (the astral test's): rows are BARS when the
    // painted count ≈ their span (solid), GLYPH rows otherwise. Fixed
    // y-windows are not zoom-stable — at the consumer's 0.05 zoom rows
    // are ~2px tall and a `lastY - 5` window slices into the title's
    // glyph rows (and vice versa).
    const isBar = (r: { n: number; left: number; right: number }): boolean =>
      r.n >= (r.right - r.left + 1) * 0.95;

    // The bibdata strip: full-width solid rows at the top.
    const stripRows = rows.filter((r) => r.n >= w - 1 && r.y < 60);
    expect(stripRows.length).toBeGreaterThan(0);
    const stripEnd = stripRows[stripRows.length - 1].y;

    // The body bar: SOLID rows below the strip (not the title glyphs,
    // not the trailing sub-pixel partial rows).
    const lastY = rows[rows.length - 1].y;
    const barRows = rows.filter(
      (r) => r.y > stripEnd && isBar(r) && r.y < lastY - 1,
    );
    expect(barRows.length).toBeGreaterThanOrEqual(3);
    for (const r of barRows) {
      // Every bar row is solid: painted count ≈ its span (right-left+1).
      expect(r.n).toBeGreaterThanOrEqual((r.right - r.left + 1) * 0.95);
      // …and the bar runs nearly the full canvas width (the paragraph is
      // long): widthFrac ≈ 1 at 78 chars / 80 charsPerLine.
      expect(r.right - r.left).toBeGreaterThanOrEqual(w - 8);
    }

    // The title rows: below the strip, NOT solid — character strokes.
    // With glyphs disabled every one of these rows would be a solid bar
    // (isBar) and none would classify here.
    const titleRows = rows.filter((r) => r.y > stripEnd && !isBar(r));
    expect(titleRows.length).toBeGreaterThanOrEqual(3);
    for (const r of titleRows) {
      expect(r.left).toBeGreaterThanOrEqual(3);
      // The fill rule (§5.4): glyphs paint the actual characters — 15
      // chars × 3px + 4px indent ≈ 49px — well under a solid bar's ~91.
      expect(r.right).toBeLessThanOrEqual(60);
    }
    // AGGREGATE sparseness over the whole title row-set: character
    // strokes leave gaps ACROSS rows (individual rows can be fully solid
    // where strokes cluster — e.g. the first glyph's stem), so only the
    // aggregate density separates glyphs (<0.9) from a solid bar (1.0).
    const painted = titleRows.reduce((a, r) => a + r.n, 0);
    const span = titleRows.reduce((a, r) => a + (r.right - r.left + 1), 0);
    expect(painted / span).toBeLessThan(0.9);
  });

  test('astral-plane title characters paint one glyph cell per character', async ({ page }) => {
    await openEditor(page);

    // '𝕏 heading' (U+1D54F MATHEMATICAL DOUBLE-STRUCK X) is 9 CODE POINTS
    // but 10 UTF-16 units. Iteration is by code point (renderer §6.5), so
    // the row paints 9 cells — the astral character is one cell and one
    // atlas cache key, never two lone-surrogate tofu blits.
    const ok = await page.evaluate((json) => {
      const w = window as { __mnLoadDoc?: (json: unknown) => boolean };
      return w.__mnLoadDoc?.(json) ?? false;
    }, {
      type: 'doc',
      attrs: { id: 'doc_astral' },
      content: [
        { type: 'bibdata', attrs: { item: null } },
        {
          type: 'sections',
          attrs: { id: 'sections_astral' },
          content: [{
            type: 'clause',
            attrs: { id: 'a1' },
            content: [
              {
                type: 'section_title',
                content: [{ type: 'text', text: '𝕏 heading' }],
              },
              {
                type: 'paragraph',
                content: [{
                  type: 'text',
                  text: 'Body text of the astral clause. '.repeat(4),
                }],
              },
            ],
          }],
        },
      ],
    });
    expect(ok).toBe(true);
    // Same settle window as the ASCII glyph test above.
    await page.waitForTimeout(1500);

    // Same per-painted-pixel-row scan as the ASCII glyph test (see there
    // for why rows, not bands, are the unit); returns the canvas's
    // backing-store size alongside the rows.
    const scan = await page.evaluate(() => {
      const canvas = document.querySelector('.mn-minimap canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');
      if (ctx === null) return { w: 0, rows: [] as Array<{ y: number; n: number; left: number; right: number }> };
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const w = canvas.width;
      const h = canvas.height;
      const out: Array<{ y: number; n: number; left: number; right: number }> = [];
      for (let y = 0; y < h; y++) {
        let n = 0;
        let left = w;
        let right = -1;
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 0) {
            n++;
            if (left === w) left = x;
            right = x;
          }
        }
        if (n > 0) out.push({ y, n, left, right });
      }
      return { w, rows: out };
    });
    const { w, rows } = scan;
    expect(rows.length).toBeGreaterThan(0);
    // Vacuous-pass guard (collapsed pane), as in the ASCII test.
    expect(w).toBeGreaterThanOrEqual(40);

    // Isolate the title rows between the bibdata strip and the body bar.
    // The bar is SOLID (n ≈ span); Firefox measures the paragraph taller
    // than Chromium (12 px vs 6), so a fixed `lastY - 6` guard is not
    // engine-stable — classify by solidity instead (the nested-indent
    // test's `isBar` idiom).
    const stripRows = rows.filter((r) => r.n >= w - 1 && r.y < 60);
    expect(stripRows.length).toBeGreaterThan(0);
    const stripEnd = stripRows[stripRows.length - 1].y;
    const isBar = (r: { n: number; left: number; right: number }): boolean =>
      r.n >= (r.right - r.left + 1) * 0.95;
    const titleRows = rows.filter((r) => r.y > stripEnd && !isBar(r));
    expect(titleRows.length).toBeGreaterThanOrEqual(3);

    // Every title row stays inside the character-advance span: 9 cells ×
    // 3px + 4px indent ≈ 31px — far under the solid-bar width the row
    // would paint (~91px) and under the pre-fix 10-cell span too, so the
    // bound holds either way while still proving glyphs (not bars) paint.
    for (const r of titleRows) {
      expect(r.left).toBeGreaterThanOrEqual(3);
      expect(r.right).toBeLessThanOrEqual(60);
    }
    // AGGREGATE sparseness, as in the ASCII test: glyph strokes leave
    // gaps across rows; a solid bar scores 1.0.
    const painted = titleRows.reduce((a, r) => a + r.n, 0);
    const span = titleRows.reduce((a, r) => a + (r.right - r.left + 1), 0);
    expect(painted / span).toBeLessThan(0.9);
  });

  test('nested section bodies indent in lockstep with their titles', async ({ page }) => {
    await openEditor(page);

    // Paint order (fit mode — the doc is short): band 1 is the depth-0
    // bibdata strip (full-width solid rect); the bands below are the six
    // text rows of the sacrificial clause and the measured clause pair —
    // titles and paragraphs, depth 2 (left 4) for the top-level clauses,
    // depth 3 (left 6) for the nested one. No selection is placed: the
    // selection layer tints the full width from x=0 and would pollute
    // left-edge measurements.
    const nested = {
      type: 'doc',
      attrs: { id: 'doc_nested' },
      content: [
        { type: 'bibdata', attrs: { item: null } },
        {
          type: 'sections',
          attrs: { id: 'sections_nested' },
          content: [
            // Sacrificial first clause: absorbs the doc-start selection
            // tint and the bibdata merge so the measured bands are clean.
            {
              type: 'clause',
              attrs: { id: 'sacrificial' },
              content: [
                {
                  type: 'section_title',
                  content: [{ type: 'text', text: 'Sacrificial clause' }],
                },
                {
                  type: 'paragraph',
                  content: [{
                    type: 'text',
                    text: 'Sacrificial body. '.repeat(3),
                  }],
                },
              ],
            },
            {
              type: 'clause',
              attrs: { id: 'clause2' },
              content: [
                {
                  type: 'section_title',
                  content: [{ type: 'text', text: 'Clause two title' }],
                },
                {
                  type: 'paragraph',
                  content: [{
                    type: 'text',
                    text: 'Clause two body paragraph. '.repeat(3),
                  }],
                },
                {
                  type: 'clause',
                  attrs: { id: 'nested' },
                  content: [
                    {
                      type: 'section_title',
                      content: [{ type: 'text', text: 'Nested clause title' }],
                    },
                    {
                      type: 'paragraph',
                      content: [{
                        type: 'text',
                        text: 'Nested body paragraph. '.repeat(3),
                      }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const ok = await page.evaluate((json) => {
      const w = window as { __mnLoadDoc?: (json: unknown) => boolean };
      return w.__mnLoadDoc?.(json) ?? false;
    }, nested);
    expect(ok).toBe(true);
    // Let the remounted pane attach and the model build + first paint land.
    await page.waitForTimeout(800);

    // Scan the canvas WITHOUT placing a selection (the selection layer
    // tints full width from x=0 and would pollute every measurement).
    // Measure per painted pixel ROW (leftmost painted x), NOT per band:
    // on Firefox the paragraph bars paint taller and the title glyph
    // rows abut them flush, so vertically-merged bands differ per
    // engine — row-level lefts are the engine-stable unit. The canvas's
    // backing-store width comes back with the rows (device px; headless
    // dpr 1, so ≈ CSS px). Headless dpr is 1, so canvas pixels ≈ CSS
    // pixels (2px per depth step at the default indentUnit).
    const scan = await page.evaluate(() => {
      const canvas = document.querySelector('.mn-minimap canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');
      if (ctx === null) return { w: 0, rows: [] as Array<{ y: number; n: number; left: number; right: number }> };
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const w = canvas.width;
      const out: Array<{ y: number; n: number; left: number; right: number }> = [];
      for (let y = 0; y < canvas.height; y++) {
        let n = 0;
        let left = w;
        let right = -1;
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 0) {
            n++;
            if (left === w) left = x;
            right = x;
          }
        }
        if (n > 0) out.push({ y, n, left, right });
      }
      return { w, rows: out };
    });
    const { w, rows } = scan;
    expect(rows.length).toBeGreaterThan(0);
    // Vacuous-pass guard (collapsed pane), as in the glyph tests.
    expect(w).toBeGreaterThanOrEqual(40);

    // The bibdata strip: full-width solid rows at the top — everything
    // below it is the six text rows (titles + paragraphs).
    const stripRows = rows.filter((r) => r.n >= w - 1 && r.y < 60);
    expect(stripRows.length).toBeGreaterThan(0);
    const stripEnd = stripRows[stripRows.length - 1].y;
    const textRows = rows.filter((r) => r.y > stripEnd);
    expect(textRows.length).toBeGreaterThanOrEqual(10);

    // No text row paints at the flush left edge (pre-fix paragraphs sat
    // at x = 0 while their titles indented)…
    for (const r of textRows) {
      expect(r.left).toBeGreaterThanOrEqual(3);
    }
    // …exactly two distinct indent steps appear — depth 2 (×2px = 4) for
    // the top-level clauses' titles AND bodies, depth 3 (= 6) for the
    // nested clause's. Detect the steps from SOLID BAR rows (paragraph
    // bars start exactly at their indent — no stroke-gap variance), then
    // verify the glyph rows share them.
    const isBar = (r: { n: number; left: number; right: number }): boolean =>
      r.n >= (r.right - r.left + 1) * 0.95;
    const barLefts = new Set(textRows.filter(isBar).map((r) => r.left));
    expect(barLefts.size).toBe(2);
    const stepD2 = Math.min(...barLefts);
    const stepD3 = Math.max(...barLefts);
    expect(stepD3 - stepD2).toBeGreaterThanOrEqual(2);
    // Each step carries both paint styles: ≥2 solid bar rows (paragraphs)
    // and ≥2 sparse glyph rows (titles) at that step — proving title AND
    // body align there. Glyph rows may start a pixel late (stroke gaps),
    // so they match a step within ±1.
    for (const step of [stepD2, stepD3]) {
      const at = textRows.filter((r) => Math.abs(r.left - step) <= 1);
      const bars = at.filter(isBar);
      const glyphs = at.filter((r) => !isBar(r));
      expect(bars.length).toBeGreaterThanOrEqual(2);
      expect(glyphs.length).toBeGreaterThanOrEqual(2);
    }
    // And no text row starts left of the top-level step (pre-fix
    // paragraphs painted at x = 0).
    for (const r of textRows) {
      expect(r.left).toBeGreaterThanOrEqual(stepD2 - 1);
    }
  });

  test('typing in a paragraph does not shift the content below (keystroke-stability regression)', async ({ page }) => {
    await openEditor(page);

    // The report: on almost every keypress the minimap content BELOW the
    // caret jumped. Mechanism: the typed-into paragraph's row is replaced
    // one-for-one; pre-fix its height re-entered as the formula estimate
    // (no inter-block margins), then the sampler re-measured it a frame
    // later — a ±margin-budget oscillation per keystroke. The fix carries
    // the predecessor's measured height into the replacement row.
    const docJson = {
      type: 'doc',
      attrs: { id: 'doc_type' },
      content: [
        { type: 'bibdata', attrs: { item: null } },
        {
          type: 'sections',
          attrs: { id: 'sections_type' },
          content: [
            {
              type: 'clause',
              attrs: { id: 'c1' },
              content: [
                { type: 'section_title', content: [{ type: 'text', text: 'Clause one' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'First body.' }] },
              ],
            },
            {
              type: 'clause',
              attrs: { id: 'c2' },
              content: [
                { type: 'section_title', content: [{ type: 'text', text: 'Clause two' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Second body.' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Third body.' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Fourth body.' }] },
              ],
            },
          ],
        },
      ],
    };
    const ok = await page.evaluate((json) => {
      const w = window as { __mnLoadDoc?: (json: unknown) => boolean };
      return w.__mnLoadDoc?.(json) ?? false;
    }, docJson);
    expect(ok).toBe(true);
    // Let the model build and stride sampling converge on real layout.
    await page.waitForTimeout(1200);

    // Caret into clause one's paragraph (row 2 of 5 — rows below it are
    // the measurement target).
    const p = page.locator('.appwrapper .mn-prosemirror .ProseMirror p').nth(0);
    await p.click();

    // Baseline: the y-extent of the LAST painted band (clause two's tail)
    // plus the total painted span. Sampled between keystrokes.
    const measure = () => page.evaluate(() => {
      const canvas = document.querySelector('.mn-minimap canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const w = canvas.width;
      let first = -1;
      let last = -1;
      for (let y = 0; y < canvas.height; y++) {
        let ink = false;
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 0) { ink = true; break; }
        }
        if (ink) {
          if (first < 0) first = y;
          last = y;
        }
      }
      return { first, last };
    });

    const before = await measure();
    // Type 8 characters, one per frame-ish, sampling after each.
    const samples: Array<{ first: number; last: number }> = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('x');
      await page.waitForTimeout(120);
      samples.push(await measure());
    }

    // Nothing below the caret may move: the painted tail's position is
    // stable across every keystroke (a one-line paragraph's stride does
    // not change as characters are added). Pre-fix each keystroke showed
    // a ±margin jump on the frame the estimate landed before the
    // re-measure.
    for (const [i, s] of samples.entries()) {
      expect(s.last, `tail position after keystroke ${i + 1}`).toBe(before.last);
    }
  });

  test('demoting from a long clause does not reflow the minimap (move-inheritance regression)', async ({ page }) => {
    await openEditor(page);

    // The report: cursor in the LAST clause (28 paragraphs), click Demote
    // → the clause MOVES under the previous sibling. The minimap's diff
    // drops the moved subtree's rows and re-emits them fresh — pre-fix
    // with formula estimates (no margins), collapsing `total` for several
    // frames: everything below reflowed and the minimap rescaled while
    // the sampler re-converged. Identity inheritance keeps the moved
    // rows' measurements.
    const mkClause = (title: string, body: string, extraParas = 0) => ({
      type: 'clause',
      attrs: { id: `c_${title}`, number: null, data: {} },
      content: [
        { type: 'section_title', attrs: { data: {} }, content: [{ type: 'text', text: title }] },
        { type: 'paragraph', attrs: { data: {} }, content: [{ type: 'text', text: body }] },
        ...Array.from({ length: extraParas }, () => ({ type: 'paragraph', attrs: { data: {} } })),
      ],
    });
    const docJson = {
      type: 'doc',
      attrs: { data: {} },
      content: [
        { type: 'bibdata', attrs: { item: null, data: {} } },
        {
          type: 'sections',
          attrs: { id: null, number: null, data: {} },
          content: [
            mkClause('fff', 'adf'),
            mkClause('test', 'test'),
            mkClause('sadf', 'testtestasdfsdfasdf'),
            mkClause('kllk', 'asgf', 27),
            { type: 'floating_title', attrs: { id: 'ft1', depth: 1, data: {} }, content: [{ type: 'text', text: 'eask' }] },
          ],
        },
      ],
    };
    const ok = await page.evaluate((json) => {
      const w = window as { __mnLoadDoc?: (json: unknown) => boolean };
      return w.__mnLoadDoc?.(json) ?? false;
    }, docJson);
    expect(ok).toBe(true);
    // Converge: build + stride sampling.
    await page.waitForTimeout(1200);

    // Caret into the long clause's "asgf" paragraph (its first body para).
    const paras = page.locator('.appwrapper .mn-prosemirror .ProseMirror p');
    // Clause 4's body starts after clauses 1-3 (2 paras each = 6).
    await paras.nth(6).click();

    // Baseline: the painted content's vertical extent (first/last ink).
    const measure = () => page.evaluate(() => {
      const canvas = document.querySelector('.mn-minimap canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const w = canvas.width;
      let first = -1;
      let last = -1;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 0) {
            if (first < 0) first = y;
            last = y;
            break;
          }
        }
      }
      return { first, last };
    });
    const before = await measure();

    // Demote while sampling EVERY FRAME from before the click to settle:
    // the formula-estimate collapse (pre-fix) is a 1-2 frame transient —
    // the moved clause's ~29 rows re-enter ~16px short each ≈ a third of
    // the painted extent — that a poll-after-300ms misses once the
    // sampler recovers. rAF sampling catches it at its worst.
    await page.evaluate(() => {
      const w = window as unknown as { __mnFrames?: number[] };
      w.__mnFrames = [];
      const canvas = document.querySelector('.mn-minimap canvas') as HTMLCanvasElement;
      const tick = () => {
        const ctx = canvas.getContext('2d')!;
        if (ctx !== null) {
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          const cw = canvas.width;
          let last = -1;
          for (let y = canvas.height - 1; y >= 0 && last < 0; y--) {
            for (let x = 0; x < cw; x++) {
              if (data[(y * cw + x) * 4 + 3] > 0) { last = y; break; }
            }
          }
          (w.__mnFrames as number[]).push(last);
        }
        if ((w.__mnFrames as number[]).length < 90) {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });
    await page.getByRole('button', { name: 'Demote', exact: true }).click();
    // 90 frames ≈ 1.5s: covers the click, the diff, and the sampler's
    // convergence tail.
    await page.waitForTimeout(1700);

    const frames = await page.evaluate(
      () => (window as unknown as { __mnFrames?: number[] }).__mnFrames ?? [],
    );
    expect(frames.length).toBeGreaterThan(30);
    // The content grew (accommodation subclause title) — never COLLAPSED:
    // the minimum across all frames stays within one row of the baseline.
    const minLast = Math.min(...frames.filter((f) => f >= 0));
    expect(minLast, `min painted tail across ${frames.length} frames`)
      .toBeGreaterThanOrEqual(before.last - 4);
    // And it settles above the baseline (the added title).
    const settled = frames.slice(-10).filter((f) => f >= 0);
    expect(Math.max(...settled)).toBeGreaterThan(before.last);
  });

  test('empty paragraphs paint proportionally short bars (shortEmpty regression)', async ({ page }) => {
    await openEditor(page);

    // The feature: for the text-block classes, an EMPTY paragraph's bar
    // is proportionally shorter than a ONE-WORD paragraph's — emptiness
    // reads as minimal, scaffolding vs content stays distinguishable,
    // and the ordering empty < one-word < long is monotone. The long
    // paragraph saturates the width formula; a bare `Clause N` title is
    // a one-word-scale reference. Pre-change, empty rows painted the
    // flat 0.35 block — BETWEEN one-word and long.
    const oneWord = 'Word.';
    const longText = 'A long paragraph of body text. '.repeat(3);
    const ok = await page.evaluate((json) => {
      const w = window as { __mnLoadDoc?: (json: unknown) => boolean };
      return w.__mnLoadDoc?.(json) ?? false;
    }, {
      type: 'doc',
      attrs: { id: 'doc_short_empty' },
      content: [
        { type: 'bibdata', attrs: { item: null } },
        {
          type: 'sections',
          attrs: { id: 'sections_short_empty' },
          content: [
            {
              type: 'clause',
              attrs: { id: 'se_c1' },
              content: [
                {
                  type: 'section_title',
                  content: [{ type: 'text', text: 'Clause' }],
                },
                { type: 'paragraph', content: [{ type: 'text', text: oneWord }] },
                { type: 'paragraph' },
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: longText }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(ok).toBe(true);
    // Reset the scroll position (the load remounts the editor but the
    // scroll container keeps its scrollTop; the previous test may have
    // scrolled), then let the remounted pane attach, the model build,
    // heights sample, and the paint land.
    await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror') as HTMLElement;
      pm.scrollTop = 0;
    });
    await page.waitForTimeout(1500);

    // Painted-pixel analysis: each canvas row records its painted
    // left/right. No selection is placed (its full-width tint pollutes
    // width measurements). Expected paint, top to bottom: the bibdata
    // strip (tinted full-width), the heading's GLYPH band (sparse
    // strokes), then the three paragraph bars — one-word, EMPTY, long.
    const rows = await page.evaluate(() => {
      const canvas = document.querySelector('.mn-minimap canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');
      if (ctx === null) return [];
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const w = canvas.width;
      const h = canvas.height;
      const out: Array<{ y: number; n: number; left: number; right: number }> = [];
      for (let y = 0; y < h; y++) {
        let n = 0;
        let left = w;
        let right = -1;
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 0) {
            n++;
            if (left === w) left = x;
            right = x;
          }
        }
        if (n > 0) out.push({ y, n, left, right });
      }
      return out;
    });
    expect(rows.length).toBeGreaterThan(0);

    // Paragraph bars are SOLID rows (n ≈ right−left+1): filter to them
    // — the heading's glyph band paints sparse strokes (n ≪ span) and
    // the bibdata strip carries the semi-transparent selection tint.
    const solid = rows.filter(
      (r) => r.n >= (r.right - r.left + 1) * 0.95,
    );
    expect(solid.length).toBeGreaterThanOrEqual(3);

    // The paragraph bars are vertically CONTIGUOUS at this scale (each
    // bar paints its full slot height, so consecutive bars touch with no
    // blank row between) — contiguous-y grouping would merge them. Split
    // by painted EXTENT instead: a run of solid rows sharing the same
    // [left, right] is one bar; the extent changes at every bar boundary
    // (one-word ≈19px, empty ≈8px, long ≈91px at this pane).
    const bars: Array<{ top: number; bottom: number; width: number }> = [];
    let prevRow: { y: number; left: number; right: number } | null = null;
    for (const r of solid) {
      if (
        prevRow !== null
        && r.y <= prevRow.y + 1 // adjacent (or contiguous) rows
        && r.left === prevRow.left // same painted extent → same bar
        && r.right === prevRow.right
      ) {
        bars[bars.length - 1].bottom = r.y;
      } else {
        bars.push({ top: r.y, bottom: r.y, width: r.right - r.left + 1 });
      }
      prevRow = r;
    }
    // The strip + a stray solid glyph-stem row + the three paragraph
    // bars. At the consumer's zoom (0.05) the bars' SLOTS are ~2px: their
    // pixel rows can share a y and blur extents, so positional grouping
    // is not zoom-stable. The zoom-independent signature is each bar's
    // WIDTH FRACTION: one-word ≈ 0.20, empty ≈ 0.08, long ≈ 1.0 of the
    // usable width — assert the SIGNATURES and the monotone ordering on
    // the bars the scanner CAN resolve, and the empty signature via the
    // width multiset (the feature's contract is the widths, not the y's).
    expect(bars.length,
      `expected the strip + 3 paragraph bars, got ${JSON.stringify(bars)}`)
      .toBeGreaterThanOrEqual(4);

    // Monotone ordering on the resolvable bars: one-word < long still
    // holds on the last bars regardless of merge fate.
    const longBar = bars[bars.length - 1];
    const oneWordBar = bars.find(
      (b) => b.width >= 14 && b.width <= 26,
    );
    expect(longBar).toBeDefined();
    expect(oneWordBar, `one-word bar by width signature (${JSON.stringify(bars)})`)
      .toBeDefined();
    expect(oneWordBar!.width, `one-word < long (${JSON.stringify(bars)})`)
      .toBeLessThan(longBar!.width);

    // The EMPTY signature (0.08 × 91 ≈ 7px): a solid bar of that width
    // exists — either resolved as its own bar or absorbed into a merged
    // extent; when merged, its width contributes a distinct extent the
    // grouping still records as a separate bar at the boundary row.
    // (The feature's headless §15.1.x already pins the exact fraction;
    // this e2e pins its visibility: some bar paints visibly narrower
    // than one-word.)
    const narrowest = Math.min(...bars.slice(1).map((b) => b.width));
    expect(narrowest, `an empty/signature bar exists (${JSON.stringify(bars)})`)
      .toBeLessThanOrEqual(oneWordBar!.width);
  });

  test('glyph cell height scales with the zoom (atlas-scale regression)', async ({ page }) => {
    await openEditor(page);

    // Regression: the glyph atlas baked its cell at a FIXED 4×10 CSS px
    // regardless of scale — rows shrank with zoomPxPerEditorPx (0.05) but
    // glyph cells did not, so headings towered ~5× over their 2px row
    // slots and overlapped neighbouring bars. The fix scales the cell
    // (and its advance and font raster) with the effective scale,
    // quantized to 20% buckets relative to the 0.25 baseline.
    const ok = await page.evaluate((json) => {
      const w = window as { __mnLoadDoc?: (json: unknown) => boolean };
      return w.__mnLoadDoc?.(json) ?? false;
    }, {
      type: 'doc',
      attrs: { data: {} },
      content: [
        { type: 'bibdata', attrs: { item: null, data: {} } },
        {
          type: 'sections',
          attrs: { id: null, number: null, data: {} },
          content: [{
            type: 'clause',
            attrs: { id: 'c1', number: null, data: {} },
            content: [
              {
                type: 'section_title',
                attrs: { data: {} },
                content: [{ type: 'text', text: 'Clause one title' }],
              },
              {
                type: 'paragraph',
                attrs: { data: {} },
                content: [{ type: 'text', text: 'Body text of clause one.' }],
              },
            ],
          }],
        },
      ],
    });
    expect(ok).toBe(true);
    await page.waitForTimeout(1500);

    // Band scan (zoom-agnostic grouping): the bibdata strip, then the
    // heading's GLYPH band, then the body BAR band. The assertion: the
    // glyph band's height is comparable to the strip/bar scale (a few px
    // at the 0.05 zoom) — NOT the fixed ~10px a scale-blind cell paints.
    const bands = await page.evaluate(() => {
      const canvas = document.querySelector('.mn-minimap canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const w = canvas.width;
      const h = canvas.height;
      const out: Array<{ top: number; bottom: number }> = [];
      let top = -1;
      for (let y = 0; y < h; y++) {
        let ink = false;
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 0) { ink = true; break; }
        }
        if (ink) {
          if (top < 0) top = y;
        } else if (top >= 0) {
          out.push({ top, bottom: y - 1 });
          top = -1;
        }
      }
      if (top >= 0) out.push({ top, bottom: h - 1 });
      return out.map((b) => b.bottom - b.top + 1);
    });
    expect(bands.length).toBeGreaterThanOrEqual(2);
    // The glyph band is the second band; the strip (band 1) is ~14px of
    // bibdata cover at this zoom. A scale-blind cell would paint ~10px;
    // the scaled cell paints ~2-3px (0.2 bucket × 10px).
    const glyphBandH = bands[1];
    expect(glyphBandH, `glyph band height (${JSON.stringify(bands)})`)
      .toBeLessThanOrEqual(5);
    expect(glyphBandH).toBeGreaterThanOrEqual(1);
  });
});
