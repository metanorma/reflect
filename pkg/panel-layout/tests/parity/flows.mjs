/**
 * flows.mjs — shared scripted-input drivers for the panel-layout parity
 * targets. Extracted verbatim from mock/goldens/capture-goldens.mjs (the
 * generator); the generator imports from here, and the parity suite
 * (tests/parity/*.spec.ts) drives the SAME fixed-coordinate flows against
 * every target (mock now, twin later) so snapshot names and semantic dumps
 * are directly comparable.
 *
 * Determinism contract: fixed mouse-coordinate constants, fixed step
 * counts, same settle polling as the goldens capture (goldens/README.md).
 */

// ---------------------------------------------------------------------------
// Scripted-input constants (determinism: fixed coordinates, fixed step counts)
// ---------------------------------------------------------------------------
export const LS_LAYOUT_KEY = 'mn-dockview7-floats-v1';
export const LS_HEIGHTS_KEY = 'mn-dockview7-heights-v1';

export const VIEWPORT = { width: 1440, height: 900 };
export const DEVICE_SCALE = 1;
export const DRAG_STEPS = 12;          // intermediate mousemove count for every drag
export const HP6_RESIZE_DELTA = 40;    // px dragged DOWN on the bottom-edge handle
export const HP5_PARK = 0.5;           // fraction of window height parked below area bottom
export const ZONE_SETTLE_MS = 350;     // hover dwell after a zone latches (stock 70ms show delay)
export const OVERLAY_WARM_MS = 250;    // dwell while warming a float-window overlay
export const SETTLE_TIMEOUT_MS = 9000; // stability poll budget after each structural change
// Pasteboard scan (area-relative px, tried in this exact order; each candidate
// is hit-tested in-page: must resolve inside .layoutArea, NOT inside a float
// window, NOT inside the white .page → gray pasteboard only).
export const PASTEBOARD_SCAN = {
  xs: [280, 300, 260, 1400, 1420, 1380, 200, 240, 680, 620, 740, 900, 980, 380, 560],
  ys: [500, 560, 440, 620, 700, 300, 380],
};

// Group ids the preset mints deterministically (kept verbatim under _normalized)
export const PRESET_GROUP_IDS = new Set([
  'group-doc', 'group-nav-1', 'group-nav-2', 'group-nav-3',
  'group-pinned', 'group-insp-1', 'group-insp-2', 'group-insp-3', 'group-insp-4',
]);
export const PRESET_HEIGHTS = { // gate (a) expectations
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
        const file = resolve(SERVE_ROOT, '.' + urlPath);
        if (!file.startsWith(SERVE_ROOT)) { resp.writeHead(403); resp.end(); return; }
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
export async function gotoLoaded(page, url, { expectedFloats = 3 } = {}) {
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
export async function settle(page, timeoutMs = SETTLE_TIMEOUT_MS) {
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

export async function dumpState(page, flow, extraMeta = {}) {
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
export function collectRuntimeIds(snapshot) {
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
export function normalizeValue(v, map) {
  if (typeof v === 'string') return map.has(v) ? map.get(v) : v;
  if (Array.isArray(v)) return v.map((x) => normalizeValue(x, map));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[map.has(k) ? map.get(k) : k] = normalizeValue(val, map);
    return o;
  }
  return v;
}
export function attachNormalized(snapshot) {
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
export async function findPasteboardPoint(page) {
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

export async function tabInfo(page, text) {
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
export async function groupDropPoint(page, txt, where) {
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
export async function voidPointForGroupWithTab(page, txt) {
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

export async function titlebarPointForWindowWithTab(page, txt) {
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

export async function resizeHandlePoint(page, txt, handleSel) {
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

export async function waitZone(page, txt, zone, timeout = 6000) {
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

export async function closeAllPanels(page) {
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
/**
 * Compare a fresh semantic snapshot against a golden's `_normalized` view
 * with ±tolerance on numbers (px) and exact equality elsewhere. Returns a
 * list of diff paths (empty = parity).
 */
export function diffNormalized(actual, golden, tolerance = 1, path = '$', out = []) {
  if (typeof actual === 'number' && typeof golden === 'number') {
    if (Math.abs(actual - golden) > tolerance) {
      out.push(path + ': ' + golden + ' -> ' + actual + ' (d' + Math.abs(actual - golden) + ')');
    }
  } else if (Array.isArray(actual) && Array.isArray(golden)) {
    if (actual.length !== golden.length) {
      out.push(path + '.length: ' + golden.length + ' -> ' + actual.length);
    }
    const n = Math.min(actual.length, golden.length);
    for (let i = 0; i < n; i++) {
      diffNormalized(actual[i], golden[i], tolerance, path + '[' + i + ']', out);
    }
  } else if (actual && golden && typeof actual === 'object' && typeof golden === 'object') {
    const ak = Object.keys(actual);
    const gk = Object.keys(golden);
    for (const k of gk) {
      if (!ak.includes(k)) out.push(path + '.' + k + ': missing in actual');
    }
    for (const k of ak) {
      if (!gk.includes(k)) out.push(path + '.' + k + ': unexpected in actual');
    }
    for (const k of ak.filter((x) => gk.includes(x))) {
      diffNormalized(actual[k], golden[k], tolerance, path + '.' + k, out);
    }
  } else if (actual !== golden) {
    out.push(path + ': ' + JSON.stringify(golden) + ' -> ' + JSON.stringify(actual));
  }
  return out;
}

export async function ghostInfo(page) {
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
