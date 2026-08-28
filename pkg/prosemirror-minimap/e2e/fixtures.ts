/**
 * Shared fixtures for the minimap e2e specs (§15.3).
 *
 * Two groups:
 *
 * 1. Mount plumbing — `mount()` wraps the harness page's
 *    `window.__mnMount` + `__mnReady`; `loadDoc()` re-mounts with a new
 *    doc under the same config.
 * 2. Probes — the canvas-ink / DOM-geometry reads the pixel tests need.
 *    These were copy-pasted evaluate blocks across the consumer suite's
 *    minimap tests; they live here once now.
 *
 * Doc fixtures are synthetic-schema JSON (harness/schema.ts), NOT the
 * Metanorma schema — the package is schema-agnostic (§1.2) and its tests
 * must not break on consumer schema refactors.
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { MinimapOptions } from '../types.js';
import type { MountSpec, ScrollShape } from '../harness/page.js';

export type { MountSpec, ScrollShape };

// ── Mount plumbing ─────────────────────────────────────────────────────

/** Mount options as tests pass them: the real `MinimapOptions` except
 * `classifier`, which is a NAME the harness maps to a factory
 * (functions can't cross `page.evaluate`). */
export type HarnessOptions = Omit<MinimapOptions, 'classifier'> & {
  classifier?: string;
};

/** Mount a harness instance and wait for the first paint. */
export async function mount(
  page: Page,
  spec: { doc: unknown; options?: HarnessOptions; scrollShape?: ScrollShape },
): Promise<void> {
  await page.evaluate((s) => {
    const w = window as unknown as {
      __mnMount(spec: MountSpec): void;
    };
    w.__mnMount(s);
  }, spec as MountSpec);
  await ready(page);
}

/** Wait for the harness's first-paint promise. */
export async function ready(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __mnReady(): Promise<void> };
    return w.__mnReady();
  });
}

/** Re-mount with a new doc under the current config (remount path). */
export async function loadDoc(page: Page, json: unknown): Promise<void> {
  await page.evaluate((doc) => {
    const w = window as unknown as { __mnLoadDoc(json: unknown): void };
    w.__mnLoadDoc(doc);
  }, json);
  await ready(page);
}

// ── Locators ───────────────────────────────────────────────────────────

/** The minimap container (`.mn-minimap`). */
export function minimap(page: Page): Locator {
  return page.locator('.mn-minimap');
}

/** The scroll container for the current scroll shape:
 * `.ProseMirror` (editor-scrolls) or `.mn-harness-scrollwrapper`
 * (wrapper shapes). */
export function scrollContainer(page: Page): Locator {
  return page.locator('.mn-harness-scrollwrapper, .mn-harness-editor-scrolls .ProseMirror').first();
}

/** The viewport overlay (`.mn-minimap-viewport`). */
export function overlay(page: Page): Locator {
  return page.locator('.mn-minimap-viewport');
}

/** The canvas (`.mn-minimap canvas`). */
export function canvas(page: Page): Locator {
  return page.locator('.mn-minimap canvas');
}

// ── Doc builders (synthetic schema; §15.1.1 node set) ──────────────────

/** A tall doc: `n` sections, each `heading + long paragraph`. */
export function tallDoc(n: number): Record<string, unknown> {
  return {
    type: 'doc',
    content: Array.from({ length: n }, (_, i) => ({
      type: 'section',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: `Section ${i + 1}` }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: `Body text of section ${i + 1}. `.repeat(4) }],
        },
      ],
    })),
  };
}

/** A doc from explicit top-level blocks. */
export function docWith(...blocks: Record<string, unknown>[]): Record<string, unknown> {
  return { type: 'doc', content: blocks };
}

/**
 * Base options for every ink-analysis test: transparent background (the
 * default theme's opaque `#f4f4f6` makes every pixel "painted" and drowns
 * per-row ink analysis) AND a transparent selection (a fresh editor
 * carries a doc-start selection whose full-width tint pollutes left-edge
 * and width measurements). The ink IS the content.
 */
export const TRANSPARENT_THEME: HarnessOptions = {
  display: 'sliding',
  zoomPxPerEditorPx: 0.25,
  theme: {
    background: 'transparent',
    selection: { color: '#77aaff', alpha: 0 },
  },
};

export function heading(text: string, level = 1): Record<string, unknown> {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}

export function para(text: string): Record<string, unknown> {
  return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] };
}

// ── Probes (page.evaluate bodies, kept here once) ──────────────────────

/** Per-canvas-row ink extents: every row with ink reports its painted
 * left/right/count. The basis of bar-width and band-height assertions. */
export async function paintedRows(page: Page): Promise<
  Array<{ y: number; n: number; left: number; right: number }>
> {
  return page.evaluate(() => {
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
}

/** Contiguous ink bands (top/bottom per band) — the heading-glyph vs
 * bar-band shape analysis. */
export async function inkBands(page: Page): Promise<Array<{ top: number; bottom: number }>> {
  return page.evaluate(() => {
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
    return out;
  });
}

/** Scroll geometry of the active scroll container. */
export async function scrollGeom(page: Page): Promise<{
  scrollTop: number; scrollHeight: number; clientHeight: number; maxScroll: number;
}> {
  return page.evaluate(() => {
    const el =
      (document.querySelector('.mn-harness-scrollwrapper') as HTMLElement | null) ??
      (document.querySelector('.ProseMirror') as HTMLElement);
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      maxScroll: el.scrollHeight - el.clientHeight,
    };
  });
}

/** Thumb (viewport overlay) geometry. */
export async function thumbGeom(page: Page): Promise<{
  top: number; bottom: number; height: number;
}> {
  return page.evaluate(() => {
    const thumb = document.querySelector('.mn-minimap-viewport') as HTMLElement;
    const r = thumb.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height };
  });
}

// Re-export for the drag tests' bounding-box assertions.
export { expect };
