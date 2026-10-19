#!/usr/bin/env node
// ============================================================================
// capture.mjs — regenerate the three static state frames (+ PNG siblings)
// referenced by ../behavior.spec.md §3 (rows A3, B1, I2).
//
//   node docs/panel-layout-proposal/states/capture.mjs              # capture + verify
//   node docs/panel-layout-proposal/states/capture.mjs --check-only # verify only
//
// Frames are BUILD OUTPUTS — do not edit them by hand; edit the mock and rerun.
//
// How each state is reached (through the real UI / network layer, never by
// editing the DOM into shape):
//   cdn-failure     — the page loads from a local HTTP server while every
//                     esm.sh/* and unpkg.com/* request is aborted via request
//                     interception; the mock's own catch block writes the
//                     #boot failure copy; captured verbatim.
//   empty-editor    — CDN allowed, fresh browser context (fresh storage so the
//                     preset renders); all 11 panels closed by clicking each
//                     active tab's close button in the real UI; waits for the
//                     float windows to dispose and the watermark to settle.
//   narrow-viewport — CDN allowed, fresh context, fixed 720x900 viewport;
//                     captured degraded reality as-is.
//
// Post-processing into a frame: every script element removed (zero JS at
// frame time), the dockview.css link replaced by that stylesheet inlined
// VERBATIM into a style[data-src=...] block (skipped for cdn-failure, where
// dockview never rendered — the link is simply removed there), the mock's own
// style block kept verbatim (design tokens stay greppable). Content that is
// NOT in the mock (B1 hint, I2 FUTURE variant) is delimited both by HTML
// comments "PROPOSED (not in mock; pending designer sign-off)" … "END
// PROPOSED" and by data-proposed attributes / .mn-proposed classes.
//
// Verification (always runs after capture; --check-only runs it alone):
// loads each frame from file:// with request logging and asserts zero
// non-file:// requests, zero script elements (DOM and source), required
// tokens/text, and that every states/*.html|png path mentioned in
// ../behavior.spec.md exists on disk.
//
// Playwright resolution order: importable 'playwright' module, then
// $MN_CAPTURE_PLAYWRIGHT (path to a playwright module dir), then
// /root/mn-capture-deps/node_modules/playwright, then ~/.npm/_npx caches.
// If the matching browser build is missing: npx playwright install chromium
// ============================================================================

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROP_DIR = resolve(SCRIPT_DIR, '..');                 // docs/panel-layout-proposal
const REPO_ROOT = resolve(PROP_DIR, '..', '..');
const MOCK_REL = 'docs/panel-layout-proposal/editor-dockview7-floats.html';
const MOCK_ABS = join(REPO_ROOT, MOCK_REL);
const SPEC_ABS = join(PROP_DIR, 'behavior.spec.md');
const DOCKVIEW_CSS_URL = 'https://unpkg.com/dockview-core@7.0.4/dist/styles/dockview.css';
const DOCKVIEW_CSS_SRC = 'dockview-core@7.0.4/dist/styles/dockview.css';
const REGEN_CMD = 'node docs/panel-layout-proposal/states/capture.mjs';

// --------------------------------------------------------------------------
// Playwright resolution
// --------------------------------------------------------------------------
async function loadPlaywright() {
  const require_ = createRequire(import.meta.url);
  const candidates = [];
  if (process.env.MN_CAPTURE_PLAYWRIGHT) candidates.push(process.env.MN_CAPTURE_PLAYWRIGHT);
  candidates.push('/root/mn-capture-deps/node_modules/playwright');
  try {
    const npxDir = join(homedir(), '.npm', '_npx');
    for (const d of readdirSync(npxDir)) candidates.push(join(npxDir, d, 'node_modules', 'playwright'));
  } catch { /* no npx cache */ }
  candidates.push('playwright'); // repo-local install, if one ever appears
  for (const cand of candidates) {
    try {
      const mod = cand === 'playwright' ? require_('playwright') : require_(cand);
      if (mod && mod.chromium) return { pw: mod, origin: cand };
    } catch { /* try next */ }
  }
  throw new Error(
    'playwright not found. Install it somewhere outside this yarn-PnP repo and point at it, e.g.:\n' +
    '  mkdir -p /root/mn-capture-deps && cd /root/mn-capture-deps && npm install playwright\n' +
    '  npx playwright install chromium\n' +
    'then rerun (the /root/mn-capture-deps location is probed automatically),\n' +
    'or set MN_CAPTURE_PLAYWRIGHT=/path/to/node_modules/playwright.'
  );
}

// --------------------------------------------------------------------------
// Git provenance for the mock
// --------------------------------------------------------------------------
function gitInfo() {
  const out = { sha: 'unavailable', dirty: false };
  try {
    out.sha = execFileSync('git', ['log', '-1', '--format=%H', '--', MOCK_REL],
      { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    out.dirty = execFileSync('git', ['status', '--porcelain', '--', MOCK_REL],
      { cwd: REPO_ROOT, encoding: 'utf8' }).trim().length > 0;
  } catch { /* not a git repo — record as unavailable */ }
  return out;
}

// --------------------------------------------------------------------------
// Tiny local HTTP server for the mock (http origin semantics for modules)
// --------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
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

// --------------------------------------------------------------------------
// Frame definitions
// --------------------------------------------------------------------------
const FRAMES = [
  {
    name: 'cdn-failure', specRow: '§3 A3 (C1) — CDN failure', viewport: [1440, 900],
    title: 'Metanorma editor — state frame A3: CDN failure',
    mechanism: 'Page served from a local HTTP server; every esm.sh/* and unpkg.com/* request aborted via request interception; the mock catch block set the #boot failure copy; captured verbatim.',
    cssNote: 'the dockview.css link was REMOVED (dockview never fetched or rendered it — CDN routes were aborted); the mock own style block is kept verbatim. Inlining dockview.css here was judged unnecessary dead weight.',
  },
  {
    name: 'empty-editor', specRow: '§3 B1 — all panels closed incl. doc', viewport: [1440, 900],
    title: 'Metanorma editor — state frame B1: empty editor',
    mechanism: 'Loaded normally (CDN allowed) in a fresh browser context (fresh storage → preset rendered); all 11 panels closed by clicking each active tab close button in the real UI; waited for float windows to dispose and the empty watermark to settle.',
    cssNote: 'the dockview.css link replaced by that stylesheet inlined VERBATIM into a style[data-src] block; the mock own style block is kept verbatim.',
  },
  {
    name: 'narrow-viewport', specRow: '§3 I2 — narrow viewport (≤720px)', viewport: [720, 900],
    title: 'Metanorma editor — state frame I2: narrow viewport (captured @720px + PROPOSED FUTURE variant)',
    mechanism: 'Loaded normally (CDN allowed) in a fresh browser context at a fixed 720x900 viewport; waited for settle; captured the degraded reality as-is (floats crowd/hang off the pasteboard, toolbar clips, statusbar hint wraps).',
    cssNote: 'the dockview.css link replaced by that stylesheet inlined VERBATIM into a style[data-src] block; the mock own style block is kept verbatim.',
  },
];

// --------------------------------------------------------------------------
// PROPOSED content (built from the captured mock's own design tokens)
// --------------------------------------------------------------------------
const B1_HINT_BLOCK_CSS = `
  /* faint hint over the empty watermark — PROPOSED for spec §3 B1 */
  .mn-empty-hint{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);
    font:12px var(--sans);color:var(--faint);letter-spacing:.012em;white-space:nowrap;
    border:1px dashed var(--line-soft);border-radius:8px;padding:10px 16px;
    background:rgba(255,255,255,.55);pointer-events:none}
`;

const I2_SCAFFOLDING_CSS = `
  /* frame scaffolding (not part of the captured mock, not proposed design):
     stacks the two labeled sections of this frame and pins each to the exact
     capture viewport so the file renders identically at any browser size */
  html.mn-frame-doc, body.mn-frame-body{height:auto;margin:0}
  body.mn-frame-body{overflow:visible;background:#dfe4e9;padding:26px 14px 60px;
    display:flex;flex-direction:column;align-items:center;gap:28px}
  .mn-frame-note{max-width:720px;margin:0 0 2px;text-align:center;
    font:11px/1.65 var(--mono);color:#5b6672}
  .mn-frame-section{display:flex;flex-direction:column;gap:7px;max-width:720px}
  .mn-frame-label{font:700 12px/1.5 var(--sans);letter-spacing:.05em;text-transform:uppercase;
    color:#33404d;margin:0}
  .mn-frame-label .mn-frame-tag{font:600 10px/1 var(--sans);letter-spacing:.04em;
    color:var(--accent-ink);background:var(--accent-bg);border:1px solid #c4d7f7;
    border-radius:4px;padding:3px 6px;margin-left:8px;vertical-align:1px}
  .mn-frame-cap{font:11.5px/1.55 var(--sans);color:var(--muted);margin:0}
  .mn-frame-viewport{width:720px;height:900px;position:relative;overflow:hidden;flex:none;
    border:1px solid #c3cbd3;border-radius:8px;box-shadow:0 10px 30px rgba(15,25,40,.16);
    background:#e3e7eb}
  .mn-frame-viewport .window{width:100%;height:100%;max-width:100%}
`;

const I2_PROPOSED_HTML = `
<section class="mn-frame-section mn-proposed" data-proposed="narrow-viewport-future-variant" aria-label="Proposed FUTURE narrow-viewport variant (not in mock)">
<style data-proposed="narrow-viewport-future-variant">
  /* PROPOSED FUTURE variant — built only from the captured mock's own tokens
     (var(--chrome/--line/--accent/--accent-bg/--accent-ink/--muted/--faint),
     .toolbar/.tb-btn/.statusbar/.page/.req/... classes from the mock's style
     block). Nothing here is implemented in the mock. */
  .mn-narrow .toolbar{padding:6px 10px;gap:3px}
  .mn-narrow .toolbar .tb-btn{min-width:34px;padding:4px 0;text-align:center;font-size:13px}
  .mn-narrow .toolbar .tb-btn b{font-weight:700}
  .mn-narrow .toolbar .tb-btn i{font-style:italic}
  .mn-narrow .layoutArea{display:flex;align-items:stretch}
  .mn-narrow-stack{flex:1;display:flex;flex-direction:column;min-width:0;background:#fff;
    border-left:1px solid var(--line);border-right:1px solid var(--line)}
  .mn-narrow-tabs{display:flex;align-items:flex-end;gap:2px;padding:6px 8px 0;
    background:var(--chrome);border-bottom:1px solid var(--line);overflow-x:auto}
  .mn-ntab{font:11.5px var(--sans);color:var(--muted);background:#f4f6f8;
    border:1px solid var(--line);border-bottom:none;border-radius:6px 6px 0 0;
    padding:5px 10px;white-space:nowrap;flex:none}
  .mn-ntab.on{background:#fff;color:var(--ink);font-weight:600}
  .mn-ntab-drawer{margin-left:auto;font:10px var(--mono);color:var(--faint);padding:6px 4px 5px 10px;flex:none}
  .mn-narrow-doc{flex:1;min-height:0;overflow:auto;background:#e3e7eb;padding:12px 10px 30px}
  .mn-narrow-doc .page{width:auto;max-width:640px;margin:0 auto;padding:22px 24px 36px 16px;font-size:12.5px}
  .mn-narrow .statusbar .live{display:none} /* hint hidden per spec I2 */
</style>
<h2 class="mn-frame-label">Proposed — future (not in mock; pending designer sign-off) <span class="mn-frame-tag">≤720px collapsed variant</span></h2>
<p class="mn-frame-cap">Single window replaces the floating mini-windows: panels collapse into one tabbed drawer (Document stays the default tab), toolbar becomes icon-only, statusbar drops the <code>.live</code> hint (spec §3 I2). Zero JS, system fonts, same tokens as the captured mock above.</p>
<div class="mn-frame-viewport" data-viewport="720x900-proposed">
  <div class="window mn-narrow">
    <div class="toolbar" role="toolbar" aria-label="Formatting (icon-only at ≤720px)">
      <button type="button" class="tb-btn" title="Bold" aria-label="Bold"><b>B</b></button>
      <button type="button" class="tb-btn" title="Italic" aria-label="Italic"><i>I</i></button>
      <span class="tb-sep"></span>
      <button type="button" class="tb-btn" title="Quote" aria-label="Quote">”</button>
      <button type="button" class="tb-btn" title="Note" aria-label="Note">N</button>
      <span class="tb-sep"></span>
      <button type="button" class="tb-btn" title="Xref" aria-label="Xref">X↗</button>
      <button type="button" class="tb-btn" title="Eref" aria-label="Eref">E↗</button>
      <span class="tb-spacer"></span>
      <button type="button" class="tb-btn" title="Reset layout" aria-label="Reset layout">↻</button>
    </div>
    <div class="layoutArea">
      <div class="mn-narrow-stack">
        <div class="mn-narrow-tabs" role="tablist" aria-label="Panels — single tabbed drawer replaces the floating windows">
          <span class="mn-ntab on" role="tab" aria-selected="true">Document</span>
          <span class="mn-ntab" role="tab">Outline</span>
          <span class="mn-ntab" role="tab">Pinned</span>
          <span class="mn-ntab" role="tab">Inspector</span>
          <span class="mn-ntab" role="tab">Validation</span>
          <span class="mn-ntab" role="tab">Review</span>
          <span class="mn-ntab-drawer">▾ drawer</span>
        </div>
        <div class="mn-narrow-doc">
          <div class="page">
            <div class="bibdata-strip">
              <span class="tag">bibdata</span>
              <span class="id">ISO 24817-1</span>
              <span class="sub">Petroleum, petrochemical and natural gas industries — Corrosion-resistant alloy clad steel pipe</span>
              <span class="grow"></span>
              <span class="sub">rev 4 · committee draft</span>
            </div>
            <div class="tds-row"><span class="tag">termdocsource</span> ISO 1087-1:2000 · 2 terms derived · <span class="linklike">edit…</span></div>
            <div class="row">
              <div class="rail"><span class="mk"><b>5.2</b> req</span></div>
              <div class="cell">
                <div class="req">
                  <div class="req-head"><span class="req-kind">Requirement</span>
                    <span class="req-id">R-5.2-1</span></div>
                  <p>The acid volume V shall be determined at temperature T per Table 2
                    <span class="badge b-shall">shall</span>.</p>
                  <div class="req-meta-row"><span class="k">subject</span> test · verification
                    <span class="k">inherits</span> ISO 24817-1:2016 · Req 5.2-1</div>
                </div>
              </div>
            </div>
            <div class="row">
              <div class="rail"><span class="mk hot"><b>5.2.1</b> note</span></div>
              <div class="cell"><div class="note">Volumes are reported in millilitres (mL) to one decimal place.</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="statusbar">
      <span><span class="dot"></span>Semantic XML valid · 1 unresolved reference · 1 duplicate docid</span>
      <span class="grow"></span>
      <span class="live" data-proposed-note="hidden by the ≤720px rule above">dockview v7 · layout saved</span>
      <span>1 412 words · saved 12:04</span>
    </div>
  </div>
</div>
</section>`;

const I2_PROPOSED_OPEN_COMMENT =
  ' PROPOSED (not in mock; pending designer sign-off): FUTURE \u2264720px collapsed ' +
  'single-window/tabbed variant for spec \u00a73 I2 \u2014 icon-only toolbar, panels as one ' +
  'tabbed drawer instead of floating mini-windows, statusbar live-hint hidden. ' +
  'Built only from the captured mock\u2019s own design tokens; nothing of it is ' +
  'implemented in the mock. ';

// --------------------------------------------------------------------------
// DOM post-processing (runs in the live page after the state was reached and
// screenshotted; returns the serialized frame body)
// --------------------------------------------------------------------------
async function postprocess(page, { dockviewCss, frame }) {
  return page.evaluate((args) => {
    const { dockviewCss, title, hintBlock, restructure } = args;

    // 1. strip EVERY script element (incl. the importmap) — zero JS at frame time
    document.querySelectorAll('script').forEach((s) => s.remove());

    // 2. replace the dockview.css link with the stylesheet inlined verbatim
    //    (hint case: dockview never rendered → just remove the link)
    const link = document.querySelector('link[rel="stylesheet"][href*="dockview"]');
    if (link) {
      if (dockviewCss != null) {
        const st = document.createElement('style');
        st.setAttribute('data-src', 'dockview-core@7.0.4/dist/styles/dockview.css');
        st.textContent = dockviewCss; // verbatim, unmodified
        link.replaceWith(st);
      } else {
        link.remove();
      }
    }

    // 3. B1: insert the PROPOSED faint hint (comment-delimited + data-proposed)
    if (hintBlock) {
      const area = document.querySelector('.layoutArea');
      const open = document.createComment(
        ' PROPOSED (not in mock; pending designer sign-off): spec \u00a73 B1 faint hint ' +
        'over the empty watermark \u2014 the captured mock renders a bare dv-watermark with ' +
        'zero text (see B1 row: "hint itself not implemented"). ');
      const st = document.createElement('style');
      st.setAttribute('data-proposed', 'empty-editor-reset-hint');
      st.textContent = hintBlock.css;
      const hint = document.createElement('div');
      hint.className = 'mn-proposed mn-empty-hint';
      hint.setAttribute('data-proposed', 'empty-editor-reset-hint');
      hint.textContent = hintBlock.text;
      const close = document.createComment(' END PROPOSED (b1 reset hint) ');
      area.append(open, st, hint, close);
    }

    // 4. I2: restructure into CAPTURED + PROPOSED labeled sections
    if (restructure) {
      document.documentElement.classList.add('mn-frame-doc');
      document.body.classList.add('mn-frame-body');
      const scaff = document.createElement('style');
      scaff.setAttribute('data-role', 'mn-frame-scaffolding');
      scaff.textContent = restructure.scaffoldingCss;
      document.head.appendChild(scaff);

      const win = document.querySelector('.window'); // the captured app
      const note = document.createElement('p');
      note.className = 'mn-frame-note';
      note.textContent = restructure.noteText;
      document.body.prepend(note);

      const cap = document.createElement('section');
      cap.className = 'mn-frame-section';
      cap.setAttribute('data-frame', 'captured-720x900');
      cap.innerHTML =
        '<h2 class="mn-frame-label">Captured — editor-dockview7-floats.html at 720\u00d7900 ' +
        '<span class="mn-frame-tag">spec \u00a73 I2 \u00b7 degraded reality</span></h2>' +
        '<p class="mn-frame-cap">Exactly what the live mock renders at 720\u00d7900 with fresh ' +
        'storage, unretouched: Navigation (left:18) and Pinned (left:292) crowd the pasteboard, ' +
        'Inspector (left:1050, w:320) hangs entirely off-canvas, statusbar <code>.live</code> hint ' +
        'wraps three lines tall (49px bar). The no-wrap toolbar just fits at 720px \u2014 its buttons ' +
        'measure 718px of the 718px available, so clipping onsets just below this width.</p>';
      const capVp = document.createElement('div');
      capVp.className = 'mn-frame-viewport';
      capVp.setAttribute('data-viewport', '720x900');
      capVp.appendChild(win);
      cap.appendChild(capVp);
      document.body.appendChild(cap);

      document.body.appendChild(document.createComment(restructure.propOpen));
      const tpl = document.createElement('template');
      tpl.innerHTML = restructure.proposedHtml;
      document.body.appendChild(tpl.content);
      document.body.appendChild(document.createComment(' END PROPOSED (narrow-viewport FUTURE variant) '));
    }

    document.title = title;
    return '<!doctype html>\n' + document.documentElement.outerHTML + '\n';
  }, {
    dockviewCss: frame.name === 'cdn-failure' ? null : dockviewCss,
    title: frame.title,
    hintBlock: frame.name === 'empty-editor' ? {
      css: B1_HINT_BLOCK_CSS, text: 'All panels closed — Reset restores the preset',
    } : null,
    restructure: frame.name === 'narrow-viewport' ? {
      scaffoldingCss: I2_SCAFFOLDING_CSS,
      noteText: 'State frame I2 \u2014 captured at 720\u00d7900 (PNG sibling: narrow-viewport.png). ' +
        'Fixed-viewport frame: the two boxes below pin that exact size. Best viewed \u2265750px wide. ' +
        'Generated file \u2014 regenerate with: ' + 'node docs/panel-layout-proposal/states/capture.mjs',
      propOpen: I2_PROPOSED_OPEN_COMMENT,
      proposedHtml: I2_PROPOSED_HTML,
    } : null,
  });
}

// --------------------------------------------------------------------------
// State drivers
// --------------------------------------------------------------------------
async function reachCdnFailure(pw, browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await ctx.route(/(esm\.sh|unpkg\.com)/, (route) => route.abort());
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(
    () => document.getElementById('boot') &&
      document.getElementById('boot').textContent.includes('Failed to load from CDN'),
    null, { timeout: 30_000 });
  await page.waitForTimeout(300);
  return { ctx, page };
}

async function reachLoaded(pw, browser, url, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } }); // fresh storage
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 90_000 });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 90_000 });
  await page.waitForFunction(() =>
    document.querySelectorAll('.dv-resize-container').length === 3, null, { timeout: 30_000 });
  await page.waitForFunction(() =>
    document.querySelectorAll('.mn-drag-grip').length === 3, null, { timeout: 10_000 });
  await page.waitForTimeout(700); // pin pass + grip decoration settle
  return { ctx, page };
}

async function closeAllPanels(page) {
  // Close every panel via the real UI: repeatedly click the ACTIVE tab's close
  // button (dockview hides the ✕ of inactive tabs; closing activates the MRU
  // successor, so this walks each tabset empty). Float windows dispose when
  // their last member leaves. Order matters: at preset geometry the float
  // windows sit ON TOP of the main grid's tab strip (Navigation at left:18,
  // top:12 covers the Document tab's ✕ with its top resize handle), so the
  // float tabs are closed and their windows disposed FIRST; the doc tab's ✕
  // is only reachable afterwards. Phase 2 then empties the grid → watermark.
  const deadline = Date.now() + 90_000;
  let clicks = 0;
  for (const [phase, scope] of [
    ['floats', '.dv-resize-container'],
    ['doc', ''],
  ]) {
    while (Date.now() < deadline) {
      const tabsLeft = await page.locator(scope + ' .dv-tab').count();
      if (tabsLeft === 0) break;
      let btn = page.locator(scope + ' .dv-tab.dv-active-tab .dv-default-tab-action').first();
      if ((await btn.count()) === 0) { // fallback: hover the first tab to reveal its ✕
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
    throw new Error(`empty-editor state not reached: tabs=${tabs} floats=${floats} watermark=${watermark} (clicks=${clicks})`);
  }
  await page.waitForTimeout(500); // layout settle after last dispose
  return clicks;
}

// --------------------------------------------------------------------------
// Capture pipeline
// --------------------------------------------------------------------------
function headerComment(frame, git) {
  return [
    'GENERATED FILE — do not edit by hand; regenerate with:',
    '    ' + REGEN_CMD,
    '',
    'State frame: ' + frame.name + '.html — behavior.spec.md ' + frame.specRow,
    'Source mock: ' + MOCK_REL,
    'Mock git SHA at capture: ' + git.sha + (git.dirty ? '  (working tree DIRTY for this file)' : '  (file clean in working tree)'),
    'Capture date (UTC): ' + new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    'Viewport at capture: ' + frame.viewport[0] + 'x' + frame.viewport[1] + ' (device pixel ratio 1); PNG sibling captured at the same size',
    'Mechanism: ' + frame.mechanism,
    'Post-processing: every script element removed (the frame executes zero JS); ' + frame.cssNote,
    'PROPOSED content (not in the mock; pending designer sign-off) is delimited by',
    'HTML comments "PROPOSED (not in mock; pending designer sign-off)" ... "END PROPOSED"',
    'plus machine-readable data-proposed attributes / .mn-proposed classes.',
    'Offline guarantee: zero external references — loads from file:// with no network.',
  ].join('\n');
}

async function capture({ pw, browser, dockviewCss, git }) {
  const { srv, port } = await startServer();
  const url = `http://127.0.0.1:${port}/editor-dockview7-floats.html`;
  const written = [];
  try {
    for (const frame of FRAMES) {
      process.stdout.write(`— capturing ${frame.name} … `);
      let ctx, page, extra = '';
      if (frame.name === 'cdn-failure') {
        ({ ctx, page } = await reachCdnFailure(pw, browser, url));
      } else {
        ({ ctx, page } = await reachLoaded(pw, browser, url, frame.viewport[0], frame.viewport[1]));
        if (frame.name === 'empty-editor') {
          const clicks = await closeAllPanels(page);
          extra = ` (${clicks} close-clicks)`;
        }
      }
      await page.screenshot({ path: join(SCRIPT_DIR, frame.name + '.png') });
      const html = await postprocess(page, { dockviewCss, frame });
      await page.close(); await ctx.close();
      const out = join(SCRIPT_DIR, frame.name + '.html');
      await writeFile(out, '<!--\n' + headerComment(frame, git) + '\n-->\n' + html, 'utf8');
      written.push(out);
      console.log('ok' + extra);
    }
  } finally {
    srv.close();
  }
  return written;
}

// --------------------------------------------------------------------------
// Verification
// --------------------------------------------------------------------------
const CHECKS = [
  {
    name: 'cdn-failure.html',
    sourceIncludes: ['Failed to load from CDN', '--accent:', 'GENERATED FILE', 'regenerate with', REGEN_CMD, 'id="boot"'],
    sourceExcludes: ['--dv-active-sash-transition-duration', '<script'],
    domText: ['Failed to load from CDN'],
    domQueriesAbsent: ['.dv-resize-container'],
  },
  {
    name: 'empty-editor.html',
    sourceIncludes: [
      'Bold', 'Italic', 'Quote', 'Note', 'Xref', 'Eref', 'Auto-wrap panels: ON', 'Reset',
      'Semantic XML valid', '1 412 words', '--accent:',
      '--dv-active-sash-transition-duration',
      'data-src="' + 'dockview-core@7.0.4/dist/styles/dockview.css' + '"',
      'data-proposed', 'PROPOSED (not in mock; pending designer sign-off)',
      'All panels closed — Reset restores the preset',
    ],
    sourceExcludes: ['<script'],
    domText: ['Bold', 'Auto-wrap panels: ON', 'Reset', 'Semantic XML valid', '1 412 words',
      'All panels closed — Reset restores the preset'],
    domQueriesAbsent: ['.dv-tab', '.dv-resize-container', '.panelwrap'],
    domQueriesPresent: ['.mn-empty-hint', '[data-proposed]'],
  },
  {
    name: 'narrow-viewport.html',
    sourceIncludes: [
      '--accent:', '--dv-active-sash-transition-duration',
      'data-src="' + 'dockview-core@7.0.4/dist/styles/dockview.css' + '"',
      'data-proposed', 'PROPOSED (not in mock; pending designer sign-off)', 'FUTURE',
      'Captured — editor-dockview7-floats.html at 720',
      'Auto-wrap panels: ON', 'data-frame="captured-720x900"',
    ],
    sourceExcludes: ['<script'],
    domText: ['Captured', 'Proposed', 'Future', 'Bold', 'Semantic XML valid'],
    domQueriesPresent: ['.mn-frame-viewport', '[data-frame="captured-720x900"]',
      '[data-proposed="narrow-viewport-future-variant"]', '.mn-proposed'],
    domQueriesAbsent: [],
  },
];

async function checkFrames({ pw, browser }) {
  const results = [];
  const push = (file, check, ok, detail) => results.push({ file, check, ok, detail });

  for (const c of CHECKS) {
    const file = join(SCRIPT_DIR, c.name);
    let src = '';
    try { src = await readFile(file, 'utf8'); } catch { push(c.name, 'read', false, 'missing'); continue; }

    for (const s of c.sourceIncludes || []) {
      push(c.name, 'source includes ' + JSON.stringify(s.slice(0, 46)), src.includes(s), '');
    }
    for (const s of c.sourceExcludes || []) {
      push(c.name, 'source excludes ' + JSON.stringify(s), !src.includes(s), '');
    }
    // structural external references (attributes / css url()) — text nodes like the
    // A3 error copy legitimately mention https://esm.sh/... as data, not as a ref
    const extAttr = src.match(/(?:src|href|action|poster|srcset|data)\s*=\s*["'][^"]*(?:https?:)?\/\//i);
    push(c.name, 'no external attribute refs', !extAttr, extAttr ? extAttr[0] : '');
    push(c.name, 'no css url() refs', !/url\(\s*["']?(?:https?:)?\/\//.test(src), '');

    // load from file:// with request logging
    const frame = FRAMES.find((f) => f.name === c.name.replace('.html', ''));
    const ctx = await browser.newContext({ viewport: { width: frame.viewport[0], height: frame.viewport[1] } });
    const page = await ctx.newPage();
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(300);
    const nonFile = requests.filter((u) => !u.startsWith('file://'));
    push(c.name, 'zero non-file:// requests', nonFile.length === 0, nonFile.slice(0, 3).join(' '));
    push(c.name, 'zero page errors (no JS ran)', errors.length === 0, errors.slice(0, 2).join(' | '));

    const dom = await page.evaluate(() => ({
      scripts: document.querySelectorAll('script').length,
      text: (document.body.innerText || '').replace(/\s+/g, ' '),
      counts: {},
    }));
    dom.counts = {};
    for (const q of c.domQueriesPresent || []) dom.counts[q] = await page.locator(q).count();
    for (const q of c.domQueriesAbsent || []) dom.counts[q] = await page.locator(q).count();
    push(c.name, 'zero script elements in DOM', dom.scripts === 0, 'found ' + dom.scripts);
    for (const q of c.domQueriesPresent || []) {
      push(c.name, 'DOM present ' + q, dom.counts[q] > 0, 'count ' + dom.counts[q]);
    }
    for (const q of c.domQueriesAbsent || []) {
      push(c.name, 'DOM absent ' + q, dom.counts[q] === 0, 'count ' + dom.counts[q]);
    }
    // innerText returns RENDERED text — uppercase-rendered labels (the I2
    // section headings use text-transform:uppercase) come back uppercased;
    // compare case-insensitively
    for (const t of c.domText || []) {
      push(c.name, 'DOM text ' + JSON.stringify(t.slice(0, 40)),
        dom.text.toLowerCase().includes(t.toLowerCase()), '');
    }
    await page.close(); await ctx.close();
  }

  // spec link-check: every states/*.html|png mention in behavior.spec.md exists
  const specSrc = await readFile(SPEC_ABS, 'utf8');
  const mentions = [...new Set(specSrc.match(/states\/[A-Za-z0-9._-]+\.(?:html|png)/g) || [])];
  push('behavior.spec.md', 'mentions states/* paths (' + mentions.length + ')', mentions.length > 0, mentions.join(' '));
  for (const m of mentions) {
    let ok = false;
    try { await access(join(PROP_DIR, m)); ok = true; } catch { ok = false; }
    push('behavior.spec.md', 'exists ' + m, ok, '');
  }
  for (const n of ['cdn-failure', 'empty-editor', 'narrow-viewport']) {
    for (const ext of ['.html', '.png']) {
      let ok = false;
      try { await access(join(SCRIPT_DIR, n + ext)); ok = true; } catch { ok = false; }
      push('canonical', `exists states/${n}${ext}`, ok, '');
    }
  }
  return results;
}

// --------------------------------------------------------------------------
async function main() {
  const checkOnly = process.argv.includes('--check-only');
  const { pw, origin } = await loadPlaywright();
  console.log(`playwright: ${origin}`);
  const browser = await pw.chromium.launch();
  const git = gitInfo();
  try {
    if (!checkOnly) {
      console.log(`mock: ${MOCK_REL} @ ${git.sha}${git.dirty ? ' (dirty)' : ''}`);
      let dockviewCss = null;
      if (!checkOnly) {
        const resp = await fetch(DOCKVIEW_CSS_URL); // capture-time network is fine
        if (!resp.ok) throw new Error('failed to fetch dockview.css: ' + resp.status);
        dockviewCss = await resp.text();
        console.log(`dockview.css: ${dockviewCss.length} bytes (fetched for verbatim inlining)`);
      }
      await mkdir(SCRIPT_DIR, { recursive: true });
      await capture({ pw, browser, dockviewCss, git });
    }
    console.log('\nVerification:');
    const results = await checkFrames({ pw, browser });
    let fail = 0;
    for (const r of results) {
      const mark = r.ok ? 'PASS' : 'FAIL';
      if (!r.ok) fail++;
      console.log(`  [${mark}] ${r.file} — ${r.check}${r.detail ? '  (' + r.detail + ')' : ''}`);
    }
    console.log(`\n${results.length - fail}/${results.length} checks passed.`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
