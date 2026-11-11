/**
 * The mockup adapter — drives the FROZEN design mockup (committed at
 * pkg/prosemirror-minimap/docs/metanorma-editor-mockup.html, served
 * same-origin at /mockups/metanorma-editor-mockup.html) through the
 * engine-agnostic scenario vocabulary and captures geometry frames from
 * its DOM.
 *
 * Rules of engagement (docs/parity.md §Baseline; brief):
 *
 * - The mockup is the parity baseline and is NEVER modified.
 * - We probe the DOM only. Closure internals (`mmS`, `mmZoom`, …) are not
 *   reachable and never reached for; every observable the mockup reflects
 *   into the DOM is read from exactly the selectors the mockup owns
 *   (#canvas, #mmBody, #mmCanvas, #mmLabels, #mmStrip, #mmVpBox, .lane).
 * - Steps use the same code paths a user's pointer would: zoom = real grip
 *   mouse drag, lane toggles = real legend clicks, jumps = the exact
 *   `scrollIntoView({block:'center'})` call `revealEl` performs.
 *
 * Determinism traps neutralized here (each documented in parity README):
 *   1. localStorage profile — seeded before load via addInitScript
 *      (about-seen=1 kills the first-visit #about overlay; measure/vis/theme
 *      pinned to defaults; mmzoom='' = default ~1:8 zoom).
 *   2. auto-jump to cl-5 at load+350ms — non-clock loads wait past it, and
 *      every scenario's first step is an explicit `reset`.
 *   3. #canvas `scroll-behavior:smooth` — the project context emulates
 *      `prefers-reduced-motion: reduce`, so all scrolls are instant.
 *   4. read-wear interval (250ms opacity mutations) — geometry frames
 *      exclude wear opacity (the wear lane is captured structurally); the
 *      clock-driven wear spec in `wear.parity.ts` owns opacity determinism.
 *   5. Under `clock: true` (wear spec) virtual time is frozen during load
 *      (install + pauseAt BEFORE goto) and advanced only in `dwell` steps,
 *      so the wear ticker fires an exact, reproducible number of times.
 */
import type { Locator, Page } from '@playwright/test';
import { MOCKUP_URL } from './env.js';
import type { Census, Frame, FrameLabel, MinimapAdapter, ScenarioStep } from './types.js';

/** Deterministic float rounding for byte-stable masters. */
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const LANE_BY_TITLE: Record<string, string> = {
  'diagnostics lane': 'diag',
  'editor notes lane': 'com',
  'search hits lane': 'search',
  'read-wear lane': 'wear',
};

/** Legend chip label text per lane key (buildMMLegend, mockup:2123). */
const LANE_CHIP_TEXT: Record<string, string> = {
  diag: 'diag',
  com: 'notes',
  search: 'search',
  wear: 'wear',
};

/** localStorage profile seeded before any mockup script runs. */
const SEED_PROFILE = `(() => {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('mnmock-'))
      .forEach((k) => localStorage.removeItem(k));
    localStorage.setItem('mnmock-about-seen', '1');
    localStorage.setItem('mnmock-measure', 'm');
    localStorage.setItem('mnmock-vis', 'annotated');
    localStorage.setItem('mnmock-theme', 'light');
    localStorage.setItem('mnmock-mmzoom', '');
  } catch (e) { /* storage unavailable — defaults apply */ }
})()`;

/** Wait until the scroll→rAF→updateViewport chain has quiesced (3 rAFs). */
async function rafSettle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((res) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => requestAnimationFrame(() => res())),
        );
      }),
  );
}

// ── In-page capture bodies (self-contained; no adapter closures) ───────

const GEOM_BODY = `(() => {
  const canvas = document.querySelector('#canvas');
  const doc = document.querySelector('#doc');
  const mmCanvas = document.querySelector('#mmCanvas');
  const mmBody = document.querySelector('#mmBody');
  return {
    scrollHeight: canvas.scrollHeight,
    clientHeight: canvas.clientHeight,
    docTop0: doc.offsetTop,
    docHeight: doc.offsetHeight,
    canvasH: parseFloat(mmCanvas.style.height) || 0,
    paneH: mmBody.clientHeight,
  };
})()`;

const FRAME_BODY = `(() => {
  const mmCanvas = document.querySelector('#mmCanvas');
  const vp = document.querySelector('#mmVpBox');
  const m = mmCanvas.style.transform.match(/translateY\\((-?[\\d.]+)px\\)/);
  const panY = m ? -parseFloat(m[1]) : 0;
  const labels = Array.from(document.querySelectorAll('#mmLabels .lbl.show')).map((l) => {
    const lv = l.className.match(/lv(\\d)/);
    return {
      text: l.textContent.trim(),
      top: parseFloat(l.style.top),
      lv: lv ? parseInt(lv[1], 10) : 0,
      active: l.classList.contains('active'),
    };
  }).sort((a, b) => (a.top - b.top) || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
  const activeBlk = document.querySelector('#mmStrip .blk.active');
  const lanes = {};
  Array.from(mmCanvas.querySelectorAll(':scope > .lane')).forEach((lane) => {
    const key = ({'diagnostics lane':'diag','editor notes lane':'com','search hits lane':'search','read-wear lane':'wear'})[lane.title];
    if (!key) return;
    const ticks = Array.from(lane.querySelectorAll('.tick')).map((t) => ({
      top: parseFloat(t.style.top), height: parseFloat(t.style.height),
    })).sort((a, b) => a.top - b.top);
    const entry = { off: lane.classList.contains('off'), tickCount: ticks.length };
    if (key !== 'wear') entry.ticks = ticks;   // wear geometry lives in the census
    lanes[key] = entry;
  });
  return {
    scrollTop: document.querySelector('#canvas').scrollTop,
    thumb: {
      top: parseFloat(vp.style.top) || 0,
      height: parseFloat(vp.style.height) || 0,
    },
    panY,
    labels,
    labelCount: document.querySelectorAll('#mmLabels .lbl').length,
    activeBlock: activeBlk
      ? {
          title: activeBlk.title,
          type: activeBlk.dataset.type,
          top: parseFloat(activeBlk.style.top),
          height: parseFloat(activeBlk.style.height),
        }
      : null,
    activeCount: document.querySelectorAll('#mmStrip .blk.active').length,
    coPieceCount: document.querySelectorAll('#mmStrip .blk.co-piece').length,
    coPieceTitles: Array.from(document.querySelectorAll('#mmStrip .blk.co-piece'))
      .map((b) => b.title).sort(),
    blockCount: document.querySelectorAll('#mmStrip .blk').length,
    lanes,
  };
})()`;

const CENSUS_BODY = `(() => {
  const labels = Array.from(document.querySelectorAll('#mmLabels .lbl')).map((l) => {
    const lv = l.className.match(/lv(\\d)/);
    return { text: l.textContent.trim(), top: parseFloat(l.style.top), lv: lv ? parseInt(lv[1], 10) : 0 };
  }).sort((a, b) => (a.top - b.top) || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
  const blocks = Array.from(document.querySelectorAll('#mmStrip .blk')).map((b) => ({
    title: b.title,
    type: b.dataset.type,
    top: parseFloat(b.style.top),
    height: parseFloat(b.style.height),
    left: parseFloat(b.style.left),
  })).sort((a, b) => (a.top - b.top) || (a.height - b.height));
  const laneTicks = {};
  Array.from(document.querySelectorAll('#mmCanvas > .lane')).forEach((lane) => {
    const key = ({'diagnostics lane':'diag','editor notes lane':'com','search hits lane':'search','read-wear lane':'wear'})[lane.title];
    if (!key) return;
    laneTicks[key] = Array.from(lane.querySelectorAll('.tick')).map((t) => ({
      top: parseFloat(t.style.top), height: parseFloat(t.style.height),
    })).sort((a, b) => a.top - b.top);
  });
  return { labels, blocks, laneTicks };
})()`;

// ── Adapter ────────────────────────────────────────────────────────────

export interface MockupAdapterOpts {
  /** Freeze virtual time (wear spec): install+pauseAt before load; dwell
   *  steps advance the clock instead of sleeping. */
  clock?: boolean;
}

export function mockupAdapter(opts: MockupAdapterOpts = {}): MinimapAdapter {
  const clock = opts.clock === true;
  // Under the faked clock a rAF-chain settle would hang (faked rAFs only
  // fire while time advances), and the wear spec reads styles directly —
  // a short real wait is the settle there.
  const settle = clock
    ? async (page: Page) => page.waitForTimeout(50)
    : rafSettle;

  const waitReady = async (page: Page) => {
    await page.waitForSelector('#mmVpBox:not([hidden])');
    await page.waitForFunction(() => {
      const strip = document.querySelector('#mmStrip');
      const labels = document.querySelector('#mmLabels');
      return !!strip && strip.querySelectorAll('.blk').length > 0
        && !!labels && labels.querySelectorAll('.lbl').length > 0;
    });
  };

  return {
    id: 'mockup',

    async load(page) {
      await page.addInitScript(SEED_PROFILE);
      // Neutralize #canvas's `scroll-behavior: smooth` (mockup:171, active
      // under prefers-reduced-motion: no-preference): emulate reduce so
      // every scroll — scrollTop assignments, scrollIntoView — is instant
      // and captures are deterministic. (Empirically the context-level
      // `reducedMotion` option does not reach this Chromium build; the
      // explicit call does — verified by probing matchMedia.)
      await page.emulateMedia({ reducedMotion: 'reduce' });
      if (clock) {
        // Freeze virtual time BEFORE navigation: every timer the mockup
        // registers during load (auto-jump at +350ms, wear ticker at +250ms
        // period) is then ours to advance deterministically.
        const T0 = new Date('2024-06-01T08:00:00Z');
        await page.clock.install({ time: T0 });
        await page.clock.pauseAt(T0);
        await page.goto(MOCKUP_URL);
        await waitReady(page);
        // Let the auto-jump deadline pass under virtual time, then give any
        // real-time scroll machinery a beat to quiesce before we take
        // control of scrollTop.
        await page.clock.runFor(700);
        await page.waitForTimeout(1000);
        await page.evaluate(() => {
          const c = document.querySelector('#canvas');
          c.scrollTop = 0;
        });
        const stuck = await page.evaluate(() => document.querySelector('#canvas').scrollTop);
        if (stuck !== 0) {
          throw new Error(
            `mockupAdapter(clock): scrollTop control lost (${stuck}) — the auto-jump scroll is still fighting the frozen clock`,
          );
        }
        return;
      }
      await page.goto(MOCKUP_URL);
      await waitReady(page);
      // Past the 350ms auto-jump (mockup:3088); every scenario then begins
      // with an explicit reset anyway.
      await page.waitForTimeout(500);
    },

    async applyStep(page, step, _i) {
      switch (step.type) {
        case 'reset': {
          await page.evaluate(() => {
            document.querySelector('#canvas').scrollTop = 0;
          });
          await settle(page);
          return;
        }
        case 'scroll-fraction': {
          await page.evaluate((f) => {
            const c = document.querySelector('#canvas');
            const doc = document.querySelector('#doc');
            const docTop0 = doc.offsetTop;
            const range = Math.max(1, c.scrollHeight - c.clientHeight - docTop0);
            c.scrollTop = Math.round(docTop0 + f * range);
          }, step.f);
          await settle(page);
          return;
        }
        case 'jump': {
          // The exact call revealEl makes (mockup:2485). Reduced-motion
          // emulation makes it instant.
          await page.evaluate((anchor) => {
            const el = document.querySelector(`[data-anchor="${anchor}"]`);
            if (!el) throw new Error(`jump: no element with data-anchor=${anchor}`);
            el.scrollIntoView({ block: 'center' });
          }, step.anchor);
          await settle(page);
          return;
        }
        case 'zoom': {
          // Drive the REAL grip: pointerdown on .rsz, one move by the dy the
          // grip's own inversion formula (mockup:2345-2348) maps to the
          // requested canvas height, pointerup. A single move is deliberate:
          // intermediate moves would trip the 8px/2% rebuild threshold
          // mid-gesture and strand the zoom at an intermediate value.
          const g = await page.evaluate((px) => {
            const canvas = document.querySelector('#canvas');
            const mmCanvas = document.querySelector('#mmCanvas');
            const H = parseFloat(mmCanvas.style.height);
            const viewH = canvas.clientHeight || 1;
            const total = Math.max(1, document.querySelector('#doc').offsetHeight);
            const dy = ((px - H) * viewH) / total;
            const grip = document.querySelector('#mmVpBox .rsz');
            const r = grip.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2, dy, H };
          }, step.px);
          await page.mouse.move(g.x, g.y);
          await page.mouse.down();
          await page.mouse.move(g.x, g.y + g.dy);
          await page.mouse.up();
          await settle(page);
          return;
        }
        case 'zoom-reset': {
          const grip: Locator = page.locator('#mmVpBox .rsz');
          await grip.dblclick();
          await settle(page);
          return;
        }
        case 'dwell': {
          if (clock) {
            // Advance virtual time in exact 250ms multiples so the wear
            // ticker fires an exact number of times (period-locked).
            const ms = Math.round(step.ms / 250) * 250;
            if (ms !== step.ms) {
              throw new Error(`dwell(${step.ms}): clock mode requires 250ms-multiple dwells`);
            }
            await page.clock.runFor(step.ms);
          } else {
            await page.waitForTimeout(step.ms);
          }
          await settle(page);
          return;
        }
        case 'lane-toggle': {
          const chip = LANE_CHIP_TEXT[step.lane];
          if (!chip) throw new Error(`lane-toggle: unknown lane ${step.lane}`);
          await page.locator('#mmLegend .lg', { hasText: chip }).first().click();
          await settle(page);
          return;
        }
        case 'drag-thumb': {
          // Real thumb drag with grab-offset preservation (mockup:2369-2381):
          // press at the thumb's centre, move so the thumb's top lands at
          // fraction f of the track, release.
          const d = await page.evaluate((f) => {
            const vp = document.querySelector('#mmVpBox');
            const body = document.querySelector('#mmBody');
            const box = vp.getBoundingClientRect();
            const bodyBox = body.getBoundingClientRect();
            const vh = box.height;
            const grabOffset = vh / 2;
            const track = Math.max(1, bodyBox.height - vh);
            return {
              pressX: box.x + box.width / 2,
              pressY: box.y + box.height / 2,
              moveY: bodyBox.y + f * track + grabOffset,
            };
          }, step.f);
          await page.mouse.move(d.pressX, d.pressY);
          await page.mouse.down();
          await page.mouse.move(d.pressX, d.moveY);
          await page.mouse.up();
          await settle(page);
          return;
        }
        case 'theme': {
          // Real code path: the theme button cycles light→dark→contrast
          // (cycleTheme, mockup:2993). Click until data-theme matches — the
          // count is deterministic (≤2 clicks).
          for (let k = 0; k < 3; k++) {
            const cur = await page.evaluate(() => document.documentElement.dataset.theme);
            if (cur === step.to) break;
            await page.locator('#themeBtn').click();
            await settle(page);
          }
          const got = await page.evaluate(() => document.documentElement.dataset.theme);
          if (got !== step.to) throw new Error(`theme: ended at ${got}, wanted ${step.to}`);
          return;
        }
        case 'search': {
          // The ⌘F code path: open the bar (focus lands in its input),
          // type, Enter → runSearch wraps hits, populates the search lane,
          // reveals hit 1 (mockup:2406-2478).
          await page.keyboard.press('ControlOrMeta+f');
          await page.keyboard.type(step.query);
          await page.keyboard.press('Enter');
          await settle(page);
          return;
        }
        case 'search-clear': {
          // Escape path: sbInput Escape clears hits + lane (mockup:2476).
          // Focus is still in the search input after Enter; Escape there
          // both hides the bar and clears.
          await page.keyboard.press('Escape');
          await page.waitForTimeout(120);
          await settle(page);
          return;
        }
        case 'key': {
          // Landmark walking on the real focus host (mockup:2384-2392).
          // Focus WITHOUT clicking — labels/blocks are click-to-reveal.
          await page.evaluate(() => document.querySelector('#minimapWrap')!.focus());
          await page.keyboard.press(step.key);
          await settle(page);
          return;
        }
        case 'viewport': {
          const cur = page.viewportSize();
          if (!cur) throw new Error('viewport: no viewport to resize');
          await page.setViewportSize({
            width: step.width ?? cur.width,
            height: step.height ?? cur.height,
          });
          await settle(page);
          return;
        }
        default:
          throw new Error(`mockupAdapter: unhandled step ${(step as ScenarioStep).type}`);
      }
    },

    async captureFrame(page, i, step) {
      const echo =
        step.type === 'scroll-fraction' ? `scroll-fraction f=${step.f}`
        : step.type === 'jump' ? `jump anchor=${step.anchor}`
        : step.type === 'zoom' ? `zoom px=${step.px}`
        : step.type === 'dwell' ? `dwell ms=${step.ms}`
        : step.type === 'lane-toggle' ? `lane-toggle lane=${step.lane}`
        : step.type === 'drag-thumb' ? `drag-thumb f=${step.f}`
        : step.type === 'theme' ? `theme to=${step.to}`
        : step.type === 'search' ? `search q="${step.query}"`
        : step.type === 'key' ? `key ${step.key}`
        : step.type === 'viewport' ? `viewport ${step.width ?? ''}x${step.height ?? ''}`
        : step.type;
      const [geom, raw] = await Promise.all([
        page.evaluate(GEOM_BODY),
        page.evaluate(FRAME_BODY),
      ]);
      const roundTicks = (ts: Array<{ top: number; height: number }>) =>
        ts.map((t) => ({ top: r3(t.top), height: r3(t.height) }));
      const frame: Frame = {
        i,
        step: echo,
        ...(step.label !== undefined ? { label: step.label } : {}),
        scrollTop: raw.scrollTop,
        geom: {
          scrollHeight: geom.scrollHeight,
          clientHeight: geom.clientHeight,
          docTop0: geom.docTop0,
          docHeight: geom.docHeight,
          canvasH: r3(geom.canvasH),
          paneH: geom.paneH,
        },
        thumb: { top: r3(raw.thumb.top), height: r3(raw.thumb.height) },
        panY: r3(raw.panY),
        labels: (raw.labels as FrameLabel[]).map((l) => ({
          text: l.text,
          top: r3(l.top),
          lv: l.lv,
          active: l.active,
        })),
        labelCount: raw.labelCount,
        activeBlock: raw.activeBlock === null ? null : {
          title: raw.activeBlock.title,
          type: raw.activeBlock.type,
          top: r3(raw.activeBlock.top),
          height: r3(raw.activeBlock.height),
        },
        activeCount: raw.activeCount,
        coPieceCount: raw.coPieceCount,
        coPieceTitles: raw.coPieceTitles,
        blockCount: raw.blockCount,
        lanes: Object.fromEntries(
          Object.entries(raw.lanes).map(([k, v]) => [
            k,
            {
              off: v.off,
              tickCount: v.tickCount,
              ...('ticks' in v ? { ticks: roundTicks(v.ticks) } : {}),
            },
          ]),
        ),
      };
      return frame;
    },

    async captureCensus(page) {
      const [geom, census] = await Promise.all([
        page.evaluate(GEOM_BODY),
        page.evaluate(CENSUS_BODY),
      ]);
      return {
        labels: census.labels.map((l) => ({ text: l.text, top: r3(l.top), lv: l.lv })),
        blocks: census.blocks.map((b) => ({
          title: b.title,
          type: b.type,
          top: r3(b.top),
          height: r3(b.height),
          left: r3(b.left),
        })),
        laneTicks: Object.fromEntries(
          Object.entries(census.laneTicks).map(([k, ts]) => [
            k,
            ts.map((t) => ({ top: r3(t.top), height: r3(t.height) })),
          ]),
        ),
        geom: {
          scrollHeight: geom.scrollHeight,
          clientHeight: geom.clientHeight,
          docTop0: geom.docTop0,
          docHeight: geom.docHeight,
          canvasH: r3(geom.canvasH),
          paneH: geom.paneH,
        },
      };
    },
  };
}
