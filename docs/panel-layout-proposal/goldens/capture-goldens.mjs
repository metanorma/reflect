#!/usr/bin/env node
// ============================================================================
// capture-goldens.mjs — one-off golden-capture harness against the LIVE mock
// (../editor-dockview7-floats.html, dockview v7.0.4 floating tabset groups).
//
//   node docs/panel-layout-proposal/goldens/capture-goldens.mjs              # capture all goldens
//   node docs/panel-layout-proposal/goldens/capture-goldens.mjs --check-only # re-capture + diff vs baselines
//
// Produces three artifact families in THIS directory (see README.md):
//   hp*.png        key screens of the spec §2 happy paths, reached ONLY through
//                  real input events (mouse down/move/up at computed coords —
//                  never DOM mutation). Viewport 1440x900 @1x.
//   state-hpN.json serialized state after each flow: window.__api.toJSON()
//                  (layout), both localStorage keys (storage), per-float rects +
//                  member group ids + per-member heights (floats). Raw copy +
//                  _normalized copy (runtime-minted group ids → g1,g2,… in
//                  first-seen order; preset ids kept verbatim).
//   trace-*.json   interaction traces: chrome geometry, theme tokens, computed
//                  transitions, HP2 drag geometry, drop-zone inventory mid-drag.
//
// Session shape: ONE page session, flows chained in spec order
// HP1→HP2→HP3→HP4→HP5→HP6→[reload]→HP8→HP9→HP10, so each state JSON reflects
// the cumulative session and HP8's reload round-trips the HP6 arrangement.
//
// Playwright resolution + local-HTTP-server pattern copied from
// ../states/capture.mjs (yarn-PnP repo: playwright is required from outside).
// Network is needed at page load (esm.sh/unpkg CDN imports in the mock).
//
// --check-only re-runs the identical session into memory and diffs:
//   state-*.json  STRICT on _meta + _normalized (numbers ±1px tolerance)
//   trace-*.json  chrome/tokens/transitions strict-tolerant; zones/geometry-hp2 advisory
//   *.png         ADVISORY pixel diff (built-in PNG decoder + per-channel
//                 threshold; never fails the run — reviewed baselines)
// Sanity gates (a)–(e) from the task brief are evaluated in BOTH modes and
// gate the exit code.
// ============================================================================

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROP_DIR = resolve(SCRIPT_DIR, '..');                  // docs/panel-layout-proposal
const GOLDENS_DIR = SCRIPT_DIR;
const LS_LAYOUT_KEY = 'mn-dockview7-floats-v1';
const LS_HEIGHTS_KEY = 'mn-dockview7-heights-v1';
const REGEN_CMD = 'node docs/panel-layout-proposal/goldens/capture-goldens.mjs';

// ---------------------------------------------------------------------------
// Scripted-input constants (determinism: fixed coordinates, fixed step counts)
// ---------------------------------------------------------------------------
const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE = 1;
const DRAG_STEPS = 12;          // intermediate mousemove count for every drag
const HP6_RESIZE_DELTA = 40;    // px dragged DOWN on the bottom-edge handle
const HP5_PARK = 0.5;           // fraction of window height parked below area bottom
const ZONE_SETTLE_MS = 350;     // hover dwell after a zone latches (stock 70ms show delay)
const OVERLAY_WARM_MS = 250;    // dwell while warming a float-window overlay
const SETTLE_TIMEOUT_MS = 9000; // stability poll budget after each structural change
// Pasteboard scan (area-relative px, tried in this exact order; each candidate
// is hit-tested in-page: must resolve inside .layoutArea, NOT inside a float
// window, NOT inside the white .page → gray pasteboard only).
const PASTEBOARD_SCAN = {
  xs: [280, 300, 260, 1400, 1420, 1380, 200, 240, 680, 620, 740, 900, 980, 380, 560],
  ys: [500, 560, 440, 620, 700, 300, 380],
};

// Group ids the preset mints deterministically (kept verbatim under _normalized)
const PRESET_GROUP_IDS = new Set([
  'group-doc', 'group-nav-1', 'group-nav-2', 'group-nav-3',
  'group-pinned', 'group-insp-1', 'group-insp-2', 'group-insp-3', 'group-insp-4',
]);
const PRESET_HEIGHTS = { // gate (a) expectations
  'group-nav-1': 244, 'group-nav-2': 132, 'group-nav-3': 74,
  'group-pinned': 142,
  'group-insp-1': 200, 'group-insp-2': 180, 'group-insp-3': 116, 'group-insp-4': 100,
};

const PNG_FILES = [
  'hp1-default.png', 'hp2-mid-drag.png', 'hp2-post-unwrap.png', 'hp3-merged.png',
  'hp5-bottom-parked.png', 'hp6-resized.png', 'hp9-reset.png', 'hp10-empty.png',
];
const STATE_FILES = ['hp1', 'hp2', 'hp3', 'hp4', 'hp5', 'hp6', 'hp8', 'hp9', 'hp10']
  .map((f) => `state-${f}.json`);
const TRACE_FILES = ['trace-chrome.json', 'trace-tokens.json', 'trace-transitions.json',
  'trace-geometry-hp2.json', 'trace-zones.json'];

const log = (s) => process.stdout.write(s + '\n');
const logn = (s) => process.stdout.write(s);

// ---------------------------------------------------------------------------
// Playwright resolution (same order as ../states/capture.mjs)
// ---------------------------------------------------------------------------
async function loadPlaywright() {
  const require_ = createRequire(import.meta.url);
  const candidates = [];
  if (process.env.MN_CAPTURE_PLAYWRIGHT) candidates.push(process.env.MN_CAPTURE_PLAYWRIGHT);
  candidates.push('/root/mn-capture-deps/node_modules/playwright');
  try {
    const npxDir = join(homedir(), '.npm', '_npx');
    for (const d of readdirSync(npxDir)) candidates.push(join(npxDir, d, 'node_modules', 'playwright'));
  } catch { /* no npx cache */ }
  candidates.push('playwright');
  for (const cand of candidates) {
    try {
      const mod = cand === 'playwright' ? require_('playwright') : require_(cand);
      if (mod && mod.chromium) return { pw: mod, origin: cand };
    } catch { /* try next */ }
  }
  throw new Error('playwright not found (see ../states/capture.mjs header for install hints)');
}

// ---------------------------------------------------------------------------
// Local HTTP server for the mock (http origin semantics for CDN modules)
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
};
function startServer() {
  return new Promise((res, rej) => {
    const srv = createServer(async (req, resp) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const file = resolve(PROP_DIR, '.' + urlPath);
        if (!file.startsWith(PROP_DIR)) { resp.writeHead(403); resp.end(); return; }
        const body = await readFile(file);
        resp.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
        resp.end(body);
      } catch {
        resp.writeHead(404); resp.end('not found');
      }
    });
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

// ---------------------------------------------------------------------------
// In-page geometry helpers (all lookups driven by window.__api / real DOM)
// ---------------------------------------------------------------------------
async function gotoLoaded(page, url, { expectedFloats = 3 } = {}) {
  await page.goto(url, { waitUntil: 'load', timeout: 90_000 });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 90_000 });
  await page.waitForFunction(() => !!window.__api, undefined, { timeout: 30_000 });
  await page.waitForFunction(
    (n) => document.querySelectorAll('.dv-resize-container').length === n,
    expectedFloats, { timeout: 30_000 });
  await page.waitForFunction(
    (n) => document.querySelectorAll('.mn-drag-grip').length === n,
    expectedFloats, { timeout: 10_000 });
  await page.waitForTimeout(600); // decorate interval net + pin-pass rAF settle
}

// poll until float rects + member heights + storage stop changing (pin pass
// runs on rAF after layout change; the mock also re-reconciles next frame)
async function settle(page, timeoutMs = SETTLE_TIMEOUT_MS) {
  const sig = () => page.evaluate(() => {
    const api = window.__api;
    if (!api) return 'no-api';
    const comp = api.component ?? api;
    const parts = [];
    for (const fp of comp.floatingGroups ?? []) {
      const r = fp.overlay.element.getBoundingClientRect();
      const members = api.groups
        .filter((g) => fp.gridview.element.contains(g.element))
        .sort((a, b) => a.element.getBoundingClientRect().top - b.element.getBoundingClientRect().top);
      parts.push([Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',') +
        '|' + members.map((g) => g.id + ':' + Math.round(g.element.getBoundingClientRect().height)).join(';'));
    }
    parts.push(String(localStorage.getItem('mn-dockview7-heights-v1')));
    parts.push(String(localStorage.getItem('mn-dockview7-floats-v1')).length);
    return parts.sort().join('||');
  });
  let last = '', stable = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await sig();
    if (s === last) {
      stable++;
      if (stable >= 3) return true;
    } else stable = 0;
    last = s;
    await page.waitForTimeout(150);
  }
  return false; // caller warns
}

async function dumpState(page, flow, extraMeta = {}) {
  const raw = await page.evaluate(([lk, hk]) => {
    const api = window.__api;
    const R = (r) => ({ left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) });
    let layout = null;
    try { layout = api.toJSON(); } catch (e) { layout = { error: String(e) }; }
    const floats = [];
    try {
      const comp = api.component ?? api;
      for (const fp of comp.floatingGroups ?? []) {
        const members = api.groups
          .filter((g) => fp.gridview.element.contains(g.element))
          .sort((a, b) => {
            const ra = a.element.getBoundingClientRect(), rb = b.element.getBoundingClientRect();
            return ra.top - rb.top || ra.left - rb.left;
          });
        floats.push({
          rect: R(fp.overlay.element.getBoundingClientRect()),
          groupIds: members.map((g) => g.id),
          memberHeights: Object.fromEntries(members.map((g) =>
            [g.id, Math.round(g.element.getBoundingClientRect().height)])),
          views: members.map((g) => g.panels.map((p) => p.id)),
          activeViews: members.map((g) => (g.api.activePanel ? g.api.activePanel.id : null)),
          tabs: [...fp.overlay.element.querySelectorAll('.dv-tab')].map((t) => t.textContent.trim()),
        });
      }
      floats.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
    } catch (e) { floats.push({ error: String(e) }); }
    const storage = {};
    for (const k of [lk, hk]) {
      const s = localStorage.getItem(k);
      try { storage[k] = s == null ? null : JSON.parse(s); } catch { storage[k] = s; }
    }
    return {
      layout, storage, floats,
      counts: {
        tabs: document.querySelectorAll('.dv-tab').length,
        floatWindows: document.querySelectorAll('.dv-resize-container').length,
        watermarks: document.querySelectorAll('.dv-watermark, .dv-watermark-container').length,
      },
    };
  }, [LS_LAYOUT_KEY, LS_HEIGHTS_KEY]);
  return {
    _meta: {
      flow, viewport: [VIEWPORT.width, VIEWPORT.height], deviceScaleFactor: DEVICE_SCALE,
      floatCount: raw.counts.floatWindows, tabCount: raw.counts.tabs,
      watermark: raw.counts.watermarks > 0,
      notes: [
        'heightsMap is module-scoped in the mock (not on window) — unreachable from the page;',
        'the persisted ' + LS_HEIGHTS_KEY + ' is its saved copy and is captured under storage.',
      ],
      ...extraMeta,
    },
    layout: raw.layout,
    storage: raw.storage,
    floats: raw.floats,
    _normalized: null, // filled below
  };
}

// ---- id normalization: runtime-minted group ids → g1,g2,… (first-seen order)
function collectRuntimeIds(snapshot) {
  const ids = []; const seen = new Set();
  const add = (id) => {
    if (typeof id === 'string' && id && !PRESET_GROUP_IDS.has(id) && !seen.has(id)) { seen.add(id); ids.push(id); }
  };
  const walkLeaves = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'leaf' && node.data && typeof node.data.id === 'string') add(node.data.id);
    if (Array.isArray(node.data)) node.data.forEach(walkLeaves);
  };
  const walkTree = (src) => {
    if (!src || typeof src !== 'object') return;
    walkLeaves(src.grid && src.grid.root);
    if (typeof src.activeGroup === 'string') add(src.activeGroup);
    for (const fg of src.floatingGroups ?? []) {
      walkLeaves(fg.grid && fg.grid.root);
      if (typeof fg.id === 'string') add(fg.id);
    }
  };
  walkTree(snapshot.layout);
  walkTree(snapshot.storage && snapshot.storage[LS_LAYOUT_KEY]);
  for (const f of snapshot.floats ?? []) {
    if (Array.isArray(f.groupIds)) f.groupIds.forEach(add);
    if (f.memberHeights) Object.keys(f.memberHeights).forEach(add);
  }
  return ids;
}
function normalizeValue(v, map) {
  if (typeof v === 'string') return map.has(v) ? map.get(v) : v;
  if (Array.isArray(v)) return v.map((x) => normalizeValue(x, map));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[map.has(k) ? map.get(k) : k] = normalizeValue(val, map);
    return o;
  }
  return v;
}
function attachNormalized(snapshot) {
  const ids = collectRuntimeIds(snapshot);
  const map = new Map(ids.map((id, i) => [id, 'g' + (i + 1)]));
  snapshot._normalized = {
    runtimeIdCount: ids.length, // raw id map omitted (run-varying); raw ids stay in the fields above
    layout: normalizeValue(snapshot.layout, map),
    storage: normalizeValue(snapshot.storage, map),
    floats: normalizeValue(snapshot.floats, map),
  };
  return snapshot;
}

// ---- locate interaction points via the real DOM / api ----------------------
async function findPasteboardPoint(page) {
  return page.evaluate((scan) => {
    const area = document.querySelector('.layoutArea');
    if (!area) return null;
    const ar = area.getBoundingClientRect();
    for (const dx of scan.xs) {
      for (const dy of scan.ys) {
        const x = Math.round(ar.left + dx), y = Math.round(ar.top + dy);
        if (x < ar.left || y < ar.top || x >= ar.right || y >= ar.bottom) continue;
        const el = document.elementFromPoint(x, y);
        if (!el) continue;
        if (!el.closest('.layoutArea')) continue;
        if (el.closest('.dv-resize-container')) continue;   // a float window
        if (el.closest('.page')) continue;                  // the white document page
        return { x, y, resolved: (el.className && String(el.className).slice(0, 60)) || el.tagName };
      }
    }
    return null;
  }, PASTEBOARD_SCAN);
}

async function tabInfo(page, text) {
  return page.evaluate((txt) => {
    const api = window.__api;
    const tab = [...document.querySelectorAll('.dv-tab')]
      .find((t) => t.textContent.trim().startsWith(txt));
    if (!tab) return { error: 'tab not found: ' + txt };
    const r = tab.getBoundingClientRect();
    const g = api.groups.find((gr) => gr.element.contains(tab));
    const gr = g ? g.element.getBoundingClientRect() : null;
    const R = (q) => ({ left: Math.round(q.left), top: Math.round(q.top), width: Math.round(q.width), height: Math.round(q.height) });
    return {
      title: tab.textContent.trim(), rect: R(r),
      x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
      groupId: g ? g.id : null,
      groupRect: gr ? R(gr) : null,
    };
  }, text);
}

// window = float window containing a tab with `txt`; where: center | bottomBand | topBand
async function groupDropPoint(page, txt, where) {
  return page.evaluate(({ txt, where }) => {
    const api = window.__api;
    const comp = api.component ?? api;
    const R = (q) => ({ left: Math.round(q.left), top: Math.round(q.top), width: Math.round(q.width), height: Math.round(q.height) });
    for (const fp of comp.floatingGroups ?? []) {
      const winEl = fp.overlay.element;
      const tabs = [...winEl.querySelectorAll('.dv-tab')].map((t) => t.textContent.trim());
      if (!tabs.some((t) => t.includes(txt))) continue;
      const members = api.groups
        .filter((g) => fp.gridview.element.contains(g.element))
        .sort((a, b) => a.element.getBoundingClientRect().top - b.element.getBoundingClientRect().top);
      const g = where === 'bottomBand' ? members[members.length - 1] : members[0];
      const strip = g.element.querySelector('.dv-tabs-and-actions-container');
      const gr = g.element.getBoundingClientRect();
      const sr = strip.getBoundingClientRect();
      const contentTop = sr.bottom, contentBottom = gr.bottom;
      const x = Math.round(gr.left + gr.width / 2);
      const y = where === 'bottomBand' ? Math.round(contentBottom - 10)
        : where === 'topBand' ? Math.round(contentTop + 10)
        : Math.round((contentTop + contentBottom) / 2);
      return { x, y, windowTabs: tabs, groupId: g.id, content: { top: Math.round(contentTop), bottom: Math.round(contentBottom), width: Math.round(gr.width) } };
    }
    return { error: 'no float window with tab containing ' + txt };
  }, { txt, where });
}

// a verified point on a group's void container (empty tab-strip space)
async function voidPointForGroupWithTab(page, txt) {
  return page.evaluate((txt) => {
    const api = window.__api;
    const tab = [...document.querySelectorAll('.dv-tab')].find((t) => t.textContent.trim().startsWith(txt));
    if (!tab) return { error: 'tab not found: ' + txt };
    const g = api.groups.find((gr) => gr.element.contains(tab));
    if (!g) return { error: 'group not found for tab ' + txt };
    const vc = g.element.querySelector('.dv-void-container');
    if (!vc) return { error: 'void container not found' };
    const r = vc.getBoundingClientRect();
    if (r.width < 14 || r.height < 4) {
      return { error: 'void container too small', rect: { width: r.width, height: r.height } };
    }
    const tries = [];
    for (const dx of [7, 12, 18, 26, 34, 42, 3]) {
      for (const fy of [0.5, 0.3, 0.7]) {
        tries.push({ x: Math.round(r.right - dx), y: Math.round(r.top + r.height * fy) });
      }
    }
    for (const p of tries) {
      const el = document.elementFromPoint(p.x, p.y);
      if (el && g.element.contains(el) && el.closest('.dv-void-container')) {
        return { x: p.x, y: p.y, groupId: g.id, rect: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) } };
      }
    }
    return { error: 'no verified void-container point' };
  }, txt);
}

async function titlebarPointForWindowWithTab(page, txt) {
  return page.evaluate((txt) => {
    const api = window.__api;
    const comp = api.component ?? api;
    for (const fp of comp.floatingGroups ?? []) {
      const winEl = fp.overlay.element;
      const tabs = [...winEl.querySelectorAll('.dv-tab')].map((t) => t.textContent.trim());
      if (!tabs.some((t) => t.includes(txt))) continue;
      const bar = winEl.querySelector('.dv-floating-titlebar');
      if (!bar) return { error: 'titlebar not found' };
      const br = bar.getBoundingClientRect();
      const wr = winEl.getBoundingClientRect();
      return {
        x: Math.round(br.left + br.width / 2), y: Math.round(br.top + br.height / 2),
        titlebarRect: { left: Math.round(br.left), top: Math.round(br.top), width: Math.round(br.width), height: Math.round(br.height) },
        winRect: { left: Math.round(wr.left), top: Math.round(wr.top), width: Math.round(wr.width), height: Math.round(wr.height) },
      };
    }
    return { error: 'no float window with tab containing ' + txt };
  }, txt);
}

async function resizeHandlePoint(page, txt, handleSel) {
  return page.evaluate(({ txt, handleSel }) => {
    const wins = [...document.querySelectorAll('.dv-resize-container')];
    for (const winEl of wins) {
      const tabs = [...winEl.querySelectorAll('.dv-tab')].map((t) => t.textContent.trim());
      if (!tabs.some((t) => t.includes(txt))) continue;
      const h = winEl.querySelector(handleSel);
      if (!h) return { error: 'handle not found: ' + handleSel };
      const r = h.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), rect: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }, className: h.className };
    }
    return { error: 'no float window with tab containing ' + txt };
  }, { txt, handleSel });
}

async function waitZone(page, txt, zone, timeout = 6000) {
  try {
    await page.waitForFunction(({ txt, z }) => {
      const w = [...document.querySelectorAll('.dv-resize-container')]
        .find((win) => [...win.querySelectorAll('.dv-tab')].some((t) => t.textContent.includes(txt)));
      if (!w) return false;
      const sel = w.querySelector('.dv-drop-target-selection');
      return !!sel && sel.classList.contains('dv-drop-target-' + z);
    }, { txt, z: zone }, { timeout });
    return true;
  } catch { return false; }
}

async function closeAllPanels(page) {
  // floats first (at preset geometry they overlay the doc tab strip), then doc
  const deadline = Date.now() + 90_000;
  let clicks = 0;
  for (const scope of ['.dv-resize-container', '']) {
    while (Date.now() < deadline) {
      const tabsLeft = await page.locator(scope + ' .dv-tab').count();
      if (tabsLeft === 0) break;
      let btn = page.locator(scope + ' .dv-tab.dv-active-tab .dv-default-tab-action').first();
      if ((await btn.count()) === 0) {
        const tab = page.locator(scope + ' .dv-tab').first();
        await tab.hover();
        btn = tab.locator('.dv-default-tab-action');
      }
      await btn.click({ timeout: 5_000 });
      clicks++;
      await page.waitForTimeout(70);
    }
  }
  const tabs = await page.locator('.dv-tab').count();
  const floats = await page.locator('.dv-resize-container').count();
  const watermark = await page.locator('.dv-watermark, .dv-watermark-container').count();
  if (tabs !== 0 || floats !== 0 || watermark === 0) {
    throw new Error(`hp10 empty state not reached: tabs=${tabs} floats=${floats} watermark=${watermark} (clicks=${clicks})`);
  }
  await page.waitForTimeout(500);
  return clicks;
}

// ---------------------------------------------------------------------------
// Traces
// ---------------------------------------------------------------------------
async function chromeTrace(page) {
  return page.evaluate(() => {
    const R = (r) => ({ left: +r.left.toFixed(1), top: +r.top.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) });
    const api = window.__api; const comp = api.component ?? api;
    const windows = (comp.floatingGroups ?? []).map((fp, i) => {
      const el = fp.overlay.element;
      const bar = el.querySelector('.dv-floating-titlebar');
      const grip = el.querySelector('.mn-drag-grip');
      const members = api.groups
        .filter((g) => fp.gridview.element.contains(g.element))
        .sort((a, b) => a.element.getBoundingClientRect().top - b.element.getBoundingClientRect().top);
      const strips = members.map((g) => {
        const t = g.element.querySelector('.dv-tabs-and-actions-container');
        return t ? R(t.getBoundingClientRect()) : null;
      });
      return {
        index: i,
        window: R(el.getBoundingClientRect()),
        titlebar: bar ? R(bar.getBoundingClientRect()) : null,
        titlebarHeightPx: bar ? Math.round(bar.getBoundingClientRect().height) : null,
        titlebarCursor: bar ? getComputedStyle(bar).cursor : null,
        grip: grip ? {
          rect: R(grip.getBoundingClientRect()),
          width: getComputedStyle(grip).width, height: getComputedStyle(grip).height,
          pointerEvents: getComputedStyle(grip).pointerEvents, opacity: getComputedStyle(grip).opacity,
          ariaHidden: grip.getAttribute('aria-hidden'),
        } : null,
        sashes: [...el.querySelectorAll('.dv-sash')].map((s) => ({ rect: R(s.getBoundingClientRect()), className: String(s.className) })),
        resizeHandles: [...el.querySelectorAll('[class*="dv-resize-handle-"]')]
          .map((h) => ({ className: String(h.className), rect: R(h.getBoundingClientRect()) })),
        memberTabStrips: strips,
        tabStripHeightPx: strips.length ? Math.round(strips[0].height) : null,
        memberCount: members.length,
        tabs: [...el.querySelectorAll('.dv-tab')].map((t) => t.textContent.trim()),
      };
    });
    let gridTabStrip = null;
    const area = document.querySelector('.layoutArea');
    if (area) {
      const t = [...area.querySelectorAll('.dv-tabs-and-actions-container')]
        .find((el) => !el.closest('.dv-resize-container'));
      if (t) {
        gridTabStrip = {
          rect: R(t.getBoundingClientRect()),
          heightPx: Math.round(t.getBoundingClientRect().height),
          tabs: [...t.querySelectorAll('.dv-tab')].map((x) => x.textContent.trim()),
        };
      }
    }
    return { topic: 'chrome', windows, gridTabStrip };
  });
}

async function tokensTrace(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.layoutArea .dockview-theme-light');
    const cs = root ? getComputedStyle(root) : null;
    const dvTokens = {};
    for (const t of [
      '--dv-active-sash-transition-duration', '--dv-active-sash-transition-delay',
      '--dv-floating-titlebar-height', '--dv-tabs-and-actions-container-height',
      '--dv-border-radius', '--dv-floating-box-shadow',
    ]) dvTokens[t] = cs ? cs.getPropertyValue(t).trim() : null;
    const rootCs = getComputedStyle(document.documentElement);
    const mockTokens = {};
    for (const t of ['--accent', '--chrome', '--ink']) mockTokens[t] = rootCs.getPropertyValue(t).trim();
    return {
      topic: 'tokens',
      element: '.layoutArea .dockview-theme-light',
      resolved: !!root,
      dockviewTokens: dvTokens,
      mockTokensFromDocumentRoot: mockTokens,
    };
  });
}

async function sashTransitionSample(page, kind) {
  return page.evaluate((kind) => {
    const area = document.querySelector('.layoutArea');
    const sash = area && [...area.querySelectorAll('.dv-resize-container .dv-sash')][0];
    if (!sash) return { error: 'no sash found' };
    const cs = getComputedStyle(sash);
    return {
      state: kind,
      className: String(sash.className),
      transition: cs.transition,
      transitionProperty: cs.transitionProperty,
      transitionDuration: cs.transitionDuration,
      transitionDelay: cs.transitionDelay,
      backgroundColor: cs.backgroundColor,
      cursor: cs.cursor,
    };
  }, kind);
}

async function titlebarCursorSample(page, txt) {
  return page.evaluate((txt) => {
    const wins = [...document.querySelectorAll('.dv-resize-container')];
    for (const winEl of wins) {
      const tabs = [...winEl.querySelectorAll('.dv-tab')].map((t) => t.textContent.trim());
      if (!tabs.some((t) => t.includes(txt))) continue;
      const bar = winEl.querySelector('.dv-floating-titlebar');
      if (!bar) return { error: 'no titlebar' };
      const cs = getComputedStyle(bar);
      return { cursor: cs.cursor, className: String(bar.className) };
    }
    return { error: 'window not found' };
  }, txt);
}

async function ghostInfo(page) {
  return page.evaluate(() => {
    const g = document.querySelector('.dv-tab-ghost-drag');
    if (!g) return null;
    const r = g.getBoundingClientRect();
    const cs = getComputedStyle(g);
    return {
      selector: '.dv-tab-ghost-drag',
      rect: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
      text: (g.textContent || '').trim(),
      opacity: cs.opacity, pointerEvents: cs.pointerEvents, position: cs.position,
      zIndex: cs.zIndex, transform: cs.transform,
    };
  });
}

async function zonesTrace(page) {
  return page.evaluate(() => {
    const area = document.querySelector('.layoutArea');
    const sels = ['.dv-drop-target-container', '.dv-drop-target-dropzone',
      '.dv-drop-target-selection', '.dv-drop-target-anchor'];
    const seen = new Set(); const zoneElements = [];
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        if (seen.has(el)) continue; seen.add(el);
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        const floatWin = el.closest('.dv-resize-container');
        zoneElements.push({
          element: sel.replace('.', ''),
          className: String(el.className),
          inFloatWindow: !!floatWin,
          floatWindowTabs: floatWin ? [...floatWin.querySelectorAll('.dv-tab')].map((t) => t.textContent.trim()) : null,
          display: cs.display, visibility: cs.visibility, pointerEvents: cs.pointerEvents,
          rect: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
        });
      }
    }
    return {
      topic: 'zones',
      moment: 'HP2 panel-tab drag hovering the doc-grid surface (pointer over gray pasteboard)',
      layoutAreaClasses: area ? String(area.className) : null,
      unwrapHoverActive: area ? area.classList.contains('mn-unwrap-hover') : null,
      ghostPresent: !!document.querySelector('.dv-tab-ghost-drag'),
      zoneElements,
      counts: {
        total: zoneElements.length,
        inFloatWindow: zoneElements.filter((z) => z.inFloatWindow).length,
        inDocGrid: zoneElements.filter((z) => !z.inFloatWindow).length,
        displayedInDocGrid: zoneElements.filter((z) => !z.inFloatWindow && z.display !== 'none').length,
        displayedInFloatWindows: zoneElements.filter((z) => z.inFloatWindow && z.display !== 'none').length,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Minimal PNG decode (IHDR + IDAT + unfilter, color types 2/6, depth 8) for
// the ADVISORY pixel diff in --check-only. No external deps.
// ---------------------------------------------------------------------------
function decodePng(buf) {
  if (!buf || buf.length < 16 || buf.toString('ascii', 1, 4) !== 'PNG') throw new Error('not a png');
  let off = 8; let ihdr = null; const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error('no IHDR');
  const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8], colorType = ihdr[9], interlace = ihdr[12];
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`unsupported png (depth=${bitDepth} color=${colorType} interlace=${interlace})`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let rp = 0, wp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++];
    const cur = out.subarray(wp, wp + stride);
    const prev = y > 0 ? out.subarray(wp - stride, wp) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = (prev && x >= bpp) ? prev[x - bpp] : 0;
      let v = raw[rp + x];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c))) & 255;
      }
      cur[x] = v;
    }
    rp += stride; wp += stride;
  }
  return { width: w, height: h, stride, bpp, data: out };
}
function pixelDiff(a, b, channelThreshold = 25) {
  if (a.width !== b.width || a.height !== b.height) {
    return { ok: false, note: `dimensions differ (${a.width}x${a.height} vs ${b.width}x${b.height})` };
  }
  let diff = 0;
  const total = a.width * a.height;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const ia = y * a.stride + x * a.bpp, ib = y * b.stride + x * b.bpp;
      if (Math.abs(a.data[ia] - b.data[ib]) > channelThreshold ||
          Math.abs(a.data[ia + 1] - b.data[ib + 1]) > channelThreshold ||
          Math.abs(a.data[ia + 2] - b.data[ib + 2]) > channelThreshold) diff++;
    }
  }
  return { ok: true, pct: +(100 * diff / total).toFixed(3), diffPixels: diff, totalPixels: total };
}
function jsonDiff(a, b, path = '$', out = []) {
  if (out.length > 40) return out;
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) || Number.isNaN(b) ? a !== b : Math.abs(a - b) > 1.0001) {
      out.push(`${path}: ${a} vs ${b}`);
    }
    return out;
  }
  if (a === null || b === null || typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
    if (a !== b) out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    return out;
  }
  if (Array.isArray(a)) {
    if (a.length !== b.length) { out.push(`${path}: array length ${a.length} vs ${b.length}`); return out; }
    a.forEach((v, i) => jsonDiff(v, b[i], `${path}[${i}]`, out));
    return out;
  }
  if (typeof a === 'object') {
    for (const k of Object.keys(a)) if (!(k in b)) out.push(`${path}.${k}: missing in new capture`);
    for (const k of Object.keys(b)) if (!(k in a)) out.push(`${path}.${k}: extra in new capture`);
    for (const k of Object.keys(a)) if (k in b) jsonDiff(a[k], b[k], `${path}.${k}`, out);
    return out;
  }
  if (a !== b) out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  return out;
}

// ---------------------------------------------------------------------------
// Sanity gates (a)–(e)
// ---------------------------------------------------------------------------
const near = (a, b, tol = 1) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
function gateHp1(st) {
  const details = [];
  const floats = (st.floats || []).filter((f) => Array.isArray(f.groupIds));
  let ok = floats.length === 3;
  details.push(`floatingGroups=${floats.length} (expect 3)`);
  const counts = floats.map((f) => f.groupIds.length).sort((x, y) => y - x).join('/');
  details.push(`member counts (desc)=${counts} (expect 4/3/1)`);
  ok = ok && counts === '4/3/1';
  const hObs = {}; const hExpect = [];
  for (const f of floats) {
    for (const [id, h] of Object.entries(f.memberHeights || {})) {
      hObs[id] = h;
      if (PRESET_HEIGHTS[id] != null) hExpect.push({ id, got: h, want: PRESET_HEIGHTS[id] });
    }
  }
  const bad = hExpect.filter((x) => !near(x.got, x.want));
  details.push(`preset heights ok=${hExpect.length - bad.length}/${hExpect.length}` +
    (bad.length ? '; off: ' + bad.map((x) => `${x.id}:${x.got}≠${x.want}`).join(',') : ''));
  ok = ok && bad.length === 0;
  return { ok, details };
}
function gateHp2(st) {
  const details = [];
  const floats = (st.floats || []).filter((f) => Array.isArray(f.groupIds));
  details.push(`floats=${floats.length} (expect 4)`);
  const fresh = floats.filter((f) => f.groupIds.length >= 1 && f.groupIds.every((id) => !PRESET_GROUP_IDS.has(id)));
  details.push(`runtime-id windows=${fresh.length} (expect ≥1 with exactly 1 member)`);
  const newWin = fresh.find((f) => f.groupIds.length === 1) || null;
  let ok = floats.length === 4 && !!newWin;
  if (newWin) {
    const gid = newWin.groupIds[0];
    const stored = (st.storage && st.storage[LS_HEIGHTS_KEY]) || {};
    const hasH = Object.prototype.hasOwnProperty.call(stored, gid);
    details.push(`new window group=${gid} members=1 height=${newWin.memberHeights[gid]} heightsKeyInStorage=${hasH}`);
    ok = ok && hasH;
  } else ok = false;
  return { ok, details };
}
function gateHp8(pre, post) {
  const details = [];
  const A = (pre.floats || []).filter((f) => Array.isArray(f.groupIds));
  const B = (post.floats || []).filter((f) => Array.isArray(f.groupIds));
  let ok = A.length === B.length && A.length > 0;
  details.push(`floats pre=${A.length} post=${B.length}`);
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const a = A[i], b = B[i];
    const rectOk = ['left', 'top', 'width', 'height'].every((k) => near(a.rect[k], b.rect[k]));
    const idsOk = JSON.stringify(a.groupIds) === JSON.stringify(b.groupIds);
    const hOk = a.groupIds.every((id, j) => near(
      a.memberHeights[id], b.memberHeights[b.groupIds[j]]));
    details.push(`float[${i}] rect±1=${rectOk} ids=${idsOk} heights±1=${hOk}` +
      ` (${JSON.stringify(a.rect)} → ${JSON.stringify(b.rect)})`);
    ok = ok && rectOk && idsOk && hOk;
  }
  return { ok, details };
}

// ---------------------------------------------------------------------------
// The golden session (one page, flows chained HP1 → HP10)
// ---------------------------------------------------------------------------
async function runSession({ browser, url, out, say }) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console.error: ' + m.text()); });

  const gates = {};
  const pngSizes = {};
  const tr = { transitions: { topic: 'transitions', samples: {} } };
  const warn = (m) => say('  ⚠ ' + m);

  // ---------- HP1: open → preset renders, storage written ----------
  say('HP1 load + preset…');
  await gotoLoaded(page, url);
  if (!(await settle(page))) warn('settle timeout after load (continuing)');
  const st1 = attachNormalized(await dumpState(page, 'hp1'));
  await out.json('state-hp1.json', st1);
  await out.json('trace-chrome.json', await chromeTrace(page));
  const tokens = await tokensTrace(page);
  await out.json('trace-tokens.json', tokens);
  gates.a = gateHp1(st1);
  // gate (e): theme transition tokens
  const dur = tokens.dockviewTokens['--dv-active-sash-transition-duration'];
  const del = tokens.dockviewTokens['--dv-active-sash-transition-delay'];
  gates.e = { ok: dur === '0.1s' && del === '0.5s', details: [`duration=${dur} (expect 0.1s)`, `delay=${del} (expect 0.5s)`] };
  // transitions part 1: sash idle, then real hover; titlebar idle cursor
  tr.transitions.samples.sashIdle = await sashTransitionSample(page, 'idle');
  const navSash = await page.evaluate(() => {
    const area = document.querySelector('.layoutArea');
    const s = area && area.querySelector('.dv-resize-container .dv-sash');
    if (!s) return null;
    const r = s.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  tr.transitions.samples.titlebarCursorIdle = await titlebarCursorSample(page, 'Identity');
  if (navSash) {
    await page.mouse.move(navSash.x, navSash.y);
    await page.waitForTimeout(750); // past the 0.5s hover delay + 0.1s fade
    tr.transitions.samples.sashHover = await sashTransitionSample(page, 'hover');
    await page.mouse.move(10, 10); // leave hover
  }
  const inspBar0 = await titlebarPointForWindowWithTab(page, 'Identity');
  if (!inspBar0.error) {
    await page.mouse.move(inspBar0.x, inspBar0.y);
    await page.waitForTimeout(200);
    tr.transitions.samples.titlebarCursorHover = await titlebarCursorSample(page, 'Identity');
    await page.mouse.move(10, 10);
  }
  pngSizes['hp1-default.png'] = await out.png('hp1-default.png', page);

  // ---------- HP2: drag panel tab → empty space → new floating window ----------
  say('HP2 panel-tab drag → auto-wrap…');
  const pb = await findPasteboardPoint(page);
  if (!pb) throw new Error('no pasteboard point verified — aborting HP2 (scan produced nothing)');
  say(`  pasteboard drop point: (${pb.x},${pb.y}) resolved=${pb.resolved}`);
  const srcTab = await tabInfo(page, 'Outline');
  if (srcTab.error) throw new Error('HP2: ' + srcTab.error);
  const heightsBefore = Object.keys((st1.storage || {})[LS_HEIGHTS_KEY] || {}).sort();

  await page.mouse.move(srcTab.x, srcTab.y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  // sweep over the Pinned window first: warms its drop overlay so float-window
  // zone elements EXIST for trace-zones ("float-window zones visible")
  const pinned0 = await groupDropPoint(page, 'Pinned', 'center');
  if (!pinned0.error) {
    await page.mouse.move(pinned0.x, pinned0.y, { steps: DRAG_STEPS });
    const warm = await waitZone(page, 'Pinned', 'center', 4000);
    say('  float-window overlay warm (Pinned center zone seen): ' + warm);
    await page.waitForTimeout(OVERLAY_WARM_MS);
  } else warn('could not warm Pinned overlay: ' + pinned0.error);
  await page.mouse.move(pb.x, pb.y, { steps: DRAG_STEPS });
  await page.waitForFunction(() => {
    const a = document.querySelector('.layoutArea');
    return !!a && a.classList.contains('mn-unwrap-hover');
  }, undefined, { timeout: 6000 });
  await page.waitForSelector('.dv-tab-ghost-drag', { timeout: 5000 });
  await page.waitForTimeout(ZONE_SETTLE_MS);
  // mid-drag: zones trace + ghost geometry + screenshot BEFORE mouse.up
  const zones = await zonesTrace(page);
  await out.json('trace-zones.json', zones);
  // transitions part 2: drop-target-selection computed transition (live drag)
  tr.transitions.samples.dropTargetSelectionDuringDrag = await page.evaluate(() => {
    const area = document.querySelector('.layoutArea');
    const sel = area && [...area.querySelectorAll('.dv-drop-target-selection')]
      .find((el) => !el.closest('.dv-resize-container'));
    if (!sel) return { error: 'no doc-grid drop-target-selection element' };
    const cs = getComputedStyle(sel);
    return {
      selector: '.layoutArea .dv-drop-target-selection (doc grid, suppressed)',
      className: String(sel.className), display: cs.display,
      transition: cs.transition, transitionProperty: cs.transitionProperty,
      transitionDuration: cs.transitionDuration, transitionDelay: cs.transitionDelay,
    };
  });
  const ghost = await ghostInfo(page);
  if (!ghost) warn('drag ghost not queryable at mid-drag');
  pngSizes['hp2-mid-drag.png'] = await out.png('hp2-mid-drag.png', page);
  await page.mouse.up();
  if (!(await settle(page))) warn('settle timeout after HP2 drop');
  pngSizes['hp2-post-unwrap.png'] = await out.png('hp2-post-unwrap.png', page);
  const st2 = attachNormalized(await dumpState(page, 'hp2', { pasteboardDropPoint: pb }));
  await out.json('state-hp2.json', st2);
  const heightsAfter = Object.keys((st2.storage || {})[LS_HEIGHTS_KEY] || {}).sort();
  await out.json('trace-geometry-hp2.json', {
    topic: 'geometry-hp2',
    sourceTabBeforeDrag: srcTab,
    pasteboardDropPoint: pb,
    midDrag: {
      pointer: { x: pb.x, y: pb.y },
      unwrapHoverActive: zones.unwrapHoverActive,
      layoutAreaClasses: zones.layoutAreaClasses,
      ghost,
    },
    afterUnwrap: {
      floatCount: st2.floats.length,
      newWindow: (st2.floats || []).find((f) => Array.isArray(f.groupIds) &&
        f.groupIds.length === 1 && !PRESET_GROUP_IDS.has(f.groupIds[0])) || null,
      heightsKeysBefore: heightsBefore,
      heightsKeysAfter: heightsAfter,
      heightsKeysAdded: heightsAfter.filter((k) => !heightsBefore.includes(k)),
    },
  });
  gates.b = gateHp2(st2);

  // ---------- HP3: drop panel on float center → sibling tab ----------
  say('HP3 panel tab → float center merge…');
  const review = await tabInfo(page, 'Review');
  const pinned1 = await groupDropPoint(page, 'Pinned', 'center');
  if (review.error) throw new Error('HP3: ' + review.error);
  if (pinned1.error) throw new Error('HP3: ' + pinned1.error);
  await page.mouse.move(review.x, review.y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.move(pinned1.x, pinned1.y, { steps: DRAG_STEPS });
  const zone3 = await waitZone(page, 'Pinned', 'center', 6000);
  say('  Pinned center zone latched: ' + zone3);
  await page.waitForTimeout(ZONE_SETTLE_MS);
  await page.mouse.up();
  if (!(await settle(page))) warn('settle timeout after HP3 drop');
  pngSizes['hp3-merged.png'] = await out.png('hp3-merged.png', page);
  const st3 = attachNormalized(await dumpState(page, 'hp3', { centerZoneLatched: zone3 }));
  await out.json('state-hp3.json', st3);

  // ---------- HP4: whole-tabset void drag → stack into another window ----------
  say('HP4 void-container drag → stack…');
  let hp4how = 'void-container drag (empty tab-strip space) onto target bottom edge zone';
  const voidPt = await voidPointForGroupWithTab(page, 'Bibliography');
  if (voidPt.error) {
    hp4how = 'NOT scripted: ' + voidPt.error;
    warn('HP4 void point failed: ' + voidPt.error);
  } else {
    const tgt4 = await groupDropPoint(page, 'Outline', 'bottomBand');
    if (tgt4.error) { hp4how = 'NOT scripted: ' + tgt4.error; warn('HP4 target: ' + tgt4.error); }
    else {
      await page.mouse.move(voidPt.x, voidPt.y);
      await page.waitForTimeout(120);
      await page.mouse.down();
      await page.mouse.move(tgt4.x, tgt4.y, { steps: DRAG_STEPS });
      const zone4 = await waitZone(page, 'Outline', 'bottom', 6000);
      say(`  void grab (${voidPt.x},${voidPt.y}) → Outline bottom zone latched: ` + zone4);
      await page.waitForTimeout(ZONE_SETTLE_MS);
      await page.mouse.up();
      if (!(await settle(page))) warn('settle timeout after HP4 drop');
      hp4how += ` [void grab (${voidPt.x},${voidPt.y}), release (${tgt4.x},${tgt4.y}), bottom zone latched=${zone4}]`;
    }
  }
  const st4 = attachNormalized(await dumpState(page, 'hp4', { how: hp4how }));
  await out.json('state-hp4.json', st4);

  // ---------- HP5: titlebar move → park half below the area bottom ----------
  say('HP5 titlebar drag → drawer park…');
  const park = await page.evaluate(({ txt, frac }) => {
    const api = window.__api; const comp = api.component ?? api;
    const area = document.querySelector('.layoutArea');
    if (!area) return { error: 'no layoutArea' };
    const ar = area.getBoundingClientRect();
    for (const fp of comp.floatingGroups ?? []) {
      const winEl = fp.overlay.element;
      const tabs = [...winEl.querySelectorAll('.dv-tab')].map((t) => t.textContent.trim());
      if (!tabs.some((t) => t.includes(txt))) continue;
      const bar = winEl.querySelector('.dv-floating-titlebar');
      const wr = winEl.getBoundingClientRect();
      const br = bar.getBoundingClientRect();
      const newTop = Math.round(ar.height - wr.height * frac); // area-relative
      const curTop = Math.round(wr.top - ar.top);
      return {
        grab: { x: Math.round(br.left + br.width / 2), y: Math.round(br.top + br.height / 2) },
        delta: newTop - curTop,
        winRect: { left: Math.round(wr.left), top: Math.round(wr.top), width: Math.round(wr.width), height: Math.round(wr.height) },
        newTop,
      };
    }
    return { error: 'window not found' };
  }, { txt: 'Identity', frac: HP5_PARK });
  if (park.error) throw new Error('HP5: ' + park.error);
  await page.mouse.move(park.grab.x, park.grab.y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.move(park.grab.x, park.grab.y + park.delta, { steps: DRAG_STEPS + 4 });
  await page.waitForTimeout(350);
  // transitions part 3: titlebar cursor while PRESSED (:active → grabbing)
  tr.transitions.samples.titlebarCursorActive = await titlebarCursorSample(page, 'Identity');
  await page.mouse.up();
  if (!(await settle(page))) warn('settle timeout after HP5 drag');
  pngSizes['hp5-bottom-parked.png'] = await out.png('hp5-bottom-parked.png', page);
  const st5 = attachNormalized(await dumpState(page, 'hp5', {
    dragged: 'Inspector window titlebar', parkFractionBelowAreaBottom: HP5_PARK,
    intendedNewTop: park.newTop,
  }));
  await out.json('state-hp5.json', st5);
  await out.json('trace-transitions.json', tr.transitions);

  // ---------- HP6: bottom-edge resize → per-tabset height persisted ----------
  say('HP6 bottom-edge resize…');
  // Target the Pinned window: after HP5 the Outline/Navigation window's bottom
  // edge hangs BELOW the 900px viewport, where pointer events cannot hit the
  // resize handle (observed: drag dispatched, no resize). Pinned's bottom edge
  // (~y=219) is fully in-viewport and deterministic.
  const handle = await resizeHandlePoint(page, 'Pinned', '.dv-resize-handle-bottom');
  if (handle.error) throw new Error('HP6: ' + handle.error);
  const h6probe = () => page.evaluate(() => {
    const api = window.__api;
    const g = api.groups.find((gr) => gr.panels.some((p) => p.id === 'pinned'));
    return g ? { id: g.id, height: Math.round(g.element.getBoundingClientRect().height) } : null;
  });
  const h6before = await h6probe();
  await page.mouse.move(handle.x, handle.y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.move(handle.x, handle.y + HP6_RESIZE_DELTA, { steps: 8 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  if (!(await settle(page))) warn('settle timeout after HP6 resize');
  const h6after = await h6probe();
  say(`  pinned tabset height: ${h6before && h6before.height} → ${h6after && h6after.height} (drag delta +${HP6_RESIZE_DELTA})`);
  if (h6before && h6after && h6after.height === h6before.height) {
    warn('HP6 resize was a no-op — bottom-edge handle not hit (see notes)');
  }
  pngSizes['hp6-resized.png'] = await out.png('hp6-resized.png', page);
  const st6 = attachNormalized(await dumpState(page, 'hp6', {
    resized: 'bottom-edge drag on the Pinned window (last tabset)', delta: HP6_RESIZE_DELTA,
    lastTabsetBefore: h6before, lastTabsetAfter: h6after,
  }));
  await out.json('state-hp6.json', st6);

  // ---------- HP8: reload same context → restore ----------
  say('HP8 reload → restore…');
  await page.reload({ waitUntil: 'load', timeout: 90_000 });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 90_000 });
  await page.waitForFunction(() => !!window.__api, undefined, { timeout: 30_000 });
  await page.waitForFunction(
    (n) => document.querySelectorAll('.dv-resize-container').length === n,
    st6.floats.filter((f) => Array.isArray(f.groupIds)).length, { timeout: 30_000 });
  if (!(await settle(page))) warn('settle timeout after reload');
  const st8 = attachNormalized(await dumpState(page, 'hp8', { reloadedFrom: 'hp6 arrangement' }));
  await out.json('state-hp8.json', st8);
  gates.c = gateHp8(st6, st8);

  // ---------- HP9: Reset → preset restored ----------
  say('HP9 Reset…');
  await page.locator('.toolbar button', { hasText: 'Reset' }).first().click();
  await page.waitForFunction(() => document.querySelectorAll('.dv-resize-container').length === 3,
    undefined, { timeout: 15_000 });
  if (!(await settle(page))) warn('settle timeout after Reset');
  pngSizes['hp9-reset.png'] = await out.png('hp9-reset.png', page);
  const st9 = attachNormalized(await dumpState(page, 'hp9', { clicked: 'toolbar Reset' }));
  await out.json('state-hp9.json', st9);

  // ---------- HP10: close every panel → empty editor ----------
  say('HP10 close all…');
  const clicks = await closeAllPanels(page);
  if (!(await settle(page))) warn('settle timeout after close-all');
  pngSizes['hp10-empty.png'] = await out.png('hp10-empty.png', page);
  const st10 = attachNormalized(await dumpState(page, 'hp10', { closeButtonClicks: clicks }));
  await out.json('state-hp10.json', st10);

  await page.close(); await ctx.close();
  return { gates, pngSizes, pageErrors };
}

// ---------------------------------------------------------------------------
// Output sink + baseline comparison
// ---------------------------------------------------------------------------
function makeOut(checkSink) {
  return {
    png: async (name, page) => {
      const buf = await page.screenshot({ fullPage: false });
      if (checkSink) checkSink.set(name, buf);
      else await writeFile(join(GOLDENS_DIR, name), buf);
      return buf.length;
    },
    json: async (name, obj) => {
      const s = JSON.stringify(obj, null, 2) + '\n';
      if (checkSink) checkSink.set(name, s);
      else await writeFile(join(GOLDENS_DIR, name), s, 'utf8');
    },
  };
}

async function compareAgainstBaselines({ sink, gates, say }) {
  const rows = [];
  let fails = 0;
  const readBaseline = async (name) => {
    try { return await readFile(join(GOLDENS_DIR, name)); } catch { return null; }
  };

  for (const f of STATE_FILES) {
    const base = await readBaseline(f);
    if (!base) { rows.push([f, 'FAIL', 'baseline missing on disk']); fails++; continue; }
    let baseJson, newJson;
    try {
      baseJson = JSON.parse(base.toString('utf8'));
      newJson = JSON.parse(sink.get(f));
    } catch (e) { rows.push([f, 'FAIL', 'unparseable: ' + e.message]); fails++; continue; }
    const diffs = jsonDiff(
      { _meta: baseJson._meta, _normalized: baseJson._normalized },
      { _meta: newJson._meta, _normalized: newJson._normalized });
    if (diffs.length) {
      rows.push([f, 'FAIL', `${diffs.length} diffs; first: ${diffs.slice(0, 3).join(' | ')}`]);
      fails++;
    } else rows.push([f, 'PASS', 'byte-equal after normalization (numbers ±1)']);
  }

  const strictTraces = ['trace-chrome.json', 'trace-tokens.json', 'trace-transitions.json'];
  const advisoryTraces = ['trace-zones.json', 'trace-geometry-hp2.json'];
  for (const f of [...strictTraces, ...advisoryTraces]) {
    const base = await readBaseline(f);
    if (!base) { rows.push([f, 'FAIL', 'baseline missing on disk']); if (strictTraces.includes(f)) fails++; continue; }
    try {
      const diffs = jsonDiff(JSON.parse(base.toString('utf8')), JSON.parse(sink.get(f)));
      if (diffs.length) {
        const strict = strictTraces.includes(f);
        rows.push([f, strict ? 'FAIL' : 'WARN', `${diffs.length} diffs (advisory); first: ${diffs.slice(0, 2).join(' | ')}`]);
        if (strict) fails++;
      } else rows.push([f, 'PASS', 'equal (numbers ±1)']);
    } catch (e) { rows.push([f, 'FAIL', 'unparseable: ' + e.message]); if (strictTraces.includes(f)) fails++; }
  }

  for (const f of PNG_FILES) {
    const base = await readBaseline(f);
    if (!base) { rows.push([f, 'FAIL', 'baseline missing on disk']); fails++; continue; }
    const fresh = sink.get(f);
    if (!fresh) { rows.push([f, 'FAIL', 'not captured this run']); fails++; continue; }
    try {
      const d = pixelDiff(decodePng(base), decodePng(fresh));
      rows.push([f, d.ok && d.pct <= 2 ? 'PASS' : 'WARN',
        d.ok ? `pixel diff ${d.pct}% (${d.diffPixels}/${d.totalPixels} px) — advisory` : 'advisory: ' + d.note]);
    } catch (e) {
      rows.push([f, 'WARN', 'advisory: pixel diff unavailable (' + e.message + ')']);
    }
  }
  return { rows, fails };
}

async function verifyWrittenArtifacts({ pngSizes, say }) {
  const rows = [];
  let fails = 0;
  for (const f of [...PNG_FILES, ...STATE_FILES, ...TRACE_FILES]) {
    const p = join(GOLDENS_DIR, f);
    let size = 0;
    try { size = statSync(p).size; } catch { /* missing */ }
    if (!size) { rows.push([f, 'FAIL', 'missing/empty']); fails++; continue; }
    if (f.endsWith('.png')) {
      const ok = size > 20 * 1024;
      rows.push([f, ok ? 'PASS' : 'FAIL', `${(size / 1024).toFixed(1)} KiB${ok ? '' : ' — BELOW 20KB gate'}`]);
      if (!ok) fails++;
    } else rows.push([f, 'PASS', `${(size / 1024).toFixed(1)} KiB`]);
  }
  return { rows, fails };
}

function printGates(gates, say) {
  say('\nSanity gates:');
  const labels = { a: '(a) HP1 preset: 3 floats, members 3/1/4, preset heights', b: '(b) HP2 post-unwrap: 4 floats / 1-member new window / heights key', c: '(c) HP8 reload round-trip vs HP6', e: '(e) trace-tokens sash transition 0.1s / 0.5s' };
  let fails = 0;
  for (const k of ['a', 'b', 'c', 'e']) {
    const g = gates[k];
    if (!g) { say(`  [FAIL] ${labels[k]} — not evaluated`); fails++; continue; }
    say(`  [${g.ok ? 'PASS' : 'FAIL'}] ${labels[k]}`);
    for (const d of g.details) say(`        ${d}`);
    if (!g.ok) fails++;
  }
  // gate (d) is evaluated by the artifact tables (PNGs exist >20KB)
  return fails;
}

// ---------------------------------------------------------------------------
async function main() {
  const checkOnly = process.argv.includes('--check-only');
  const { pw, origin } = await loadPlaywright();
  log(`playwright: ${origin}`);
  const browser = await pw.chromium.launch();
  try {
    const { srv, port } = await startServer();
    const url = `http://127.0.0.1:${port}/editor-dockview7-floats.html`;
    if (!checkOnly) {
      await mkdir(GOLDENS_DIR, { recursive: true });
      log(`regenerating goldens into ${GOLDENS_DIR} (regen: ${REGEN_CMD})`);
    } else {
      log(`check-only: re-running the session and diffing against baselines in ${GOLDENS_DIR}`);
    }
    const sink = checkOnly ? new Map() : null;
    const out = makeOut(sink);
    const session = await runSession({ browser, url, out, say: log });

    if (session.pageErrors.length) {
      log('\npage errors captured during the session (diagnostics):');
      for (const e of session.pageErrors.slice(0, 10)) log('  ' + e.slice(0, 200));
    }

    let fails = 0;
    if (checkOnly) {
      const { rows, fails: f } = await compareAgainstBaselines({ sink, gates: session.gates, say: log });
      fails += f;
      log('\nBaseline comparison:');
      for (const [name, mark, detail] of rows) log(`  [${mark}] ${name} — ${detail}`);
    } else {
      const { rows, fails: f } = await verifyWrittenArtifacts({ pngSizes: session.pngSizes, say: log });
      fails += f;
      log('\nWritten artifacts (gate d: PNGs non-trivial >20KB):');
      for (const [name, mark, detail] of rows) log(`  [${mark}] ${name} — ${detail}`);
    }
    fails += printGates(session.gates, log);
    log(`\n${checkOnly ? 'check-only' : 'capture'} ${fails === 0 ? 'PASSED' : 'FAILED'} (${fails} failure${fails === 1 ? '' : 's'})`);
    if (fails > 0) process.exitCode = 1;
    srv.close();
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
