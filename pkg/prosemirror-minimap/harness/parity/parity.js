/**
 * Side-by-side parity harness page — the control bar and adapters.
 *
 * Left pane: the frozen mockup (baseline), same-origin, driven through the
 * SAME scenario vocabulary as the Playwright parity suite
 * (e2e/parity/lib/mockupAdapter.ts — this file is its in-page twin, minus
 * the Playwright affordances):
 *   - the localStorage profile is seeded before the iframe navigates;
 *   - steps use the mockup's own code paths (scrollIntoView center for
 *     jumps, the real grip with pointer events for zoom, legend chips for
 *     lane toggles);
 *   - frames capture geometry as JSON (same fields as the suite's Frame).
 *
 * Dev-page-only affordance: the suite emulates prefers-reduced-motion
 * (reduce); a page cannot emulate that cross-frame, so after load the
 * driver pins #canvas's scroll-behavior to auto explicitly (the value the
 * reduced-motion media query would select) and passes behavior:'instant'
 * to scrollIntoView — same landings, no animation fights.
 *
 * Right pane: placeholder. Phase 4 registers a package adapter:
 *
 *   window.parity.registerAdapter({
 *     id: 'package',
 *     async mount(container) {},        // build the harness mount there
 *     async applyStep(step) {},         // same step vocabulary
 *     captureFrame(i, step) {},         // same Frame shape
 *   });
 *
 * When more than one adapter is present, Run executes the scenario against
 * each and reports a strict leaf-diff count between the frame streams
 * (the deviation-aware differ stays in the Playwright suite; this page's
 * diff is a quick visual signal only).
 */

const LANE_BY_TITLE = {
  'diagnostics lane': 'diag',
  'editor notes lane': 'com',
  'search hits lane': 'search',
  'read-wear lane': 'wear',
};
const LANE_CHIP_TEXT = { diag: 'diag', com: 'notes', search: 'search', wear: 'wear' };

const r3 = (v) => Math.round(v * 1000) / 1000;

/* ── mockup adapter (in-page twin of e2e/parity/lib/mockupAdapter.ts) ── */

function createMockupAdapter(frameEl) {
  const doc = () => frameEl.contentDocument;
  const win = () => frameEl.contentWindow;

  const seedProfile = () => {
    // Same-origin with the mockup: seed BEFORE navigation.
    Object.keys(localStorage)
      .filter((k) => k.startsWith('mnmock-'))
      .forEach((k) => localStorage.removeItem(k));
    localStorage.setItem('mnmock-about-seen', '1');
    localStorage.setItem('mnmock-measure', 'm');
    localStorage.setItem('mnmock-vis', 'annotated');
    localStorage.setItem('mnmock-theme', 'light');
    localStorage.setItem('mnmock-mmzoom', '');
  };

  const settle = () =>
    new Promise((res) =>
      win().requestAnimationFrame(() =>
        win().requestAnimationFrame(() => win().requestAnimationFrame(() => res()))));

  async function load() {
    seedProfile();
    frameEl.src = '/mockups/metanorma-editor-mockup.html';
    await new Promise((res) => {
      frameEl.addEventListener('load', res, { once: true });
    });
    // Wait for the minimap build, then pin instant scrolling (see header
    // comment) and let the 350ms auto-jump pass.
    for (let k = 0; k < 100; k++) {
      if (doc().querySelectorAll('#mmStrip .blk').length > 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const canvas = doc().querySelector('#canvas');
    canvas.style.scrollBehavior = 'auto';
    await new Promise((r) => setTimeout(r, 550));
  }

  function pointer(el, type, x, y) {
    el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true,
      clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true,
    }));
  }

  async function applyStep(step) {
    const d = doc();
    switch (step.type) {
      case 'reset': {
        d.querySelector('#canvas').scrollTop = 0;
        break;
      }
      case 'scroll-fraction': {
        const c = d.querySelector('#canvas');
        const dd = d.querySelector('#doc');
        const range = Math.max(1, c.scrollHeight - c.clientHeight - dd.offsetTop);
        c.scrollTop = Math.round(dd.offsetTop + step.f * range);
        break;
      }
      case 'jump': {
        const el = d.querySelector(`[data-anchor="${step.anchor}"]`);
        if (!el) throw new Error(`jump: no element with data-anchor=${step.anchor}`);
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        break;
      }
      case 'zoom': {
        const c = d.querySelector('#canvas');
        const mm = d.querySelector('#mmCanvas');
        const H = parseFloat(mm.style.height);
        const viewH = c.clientHeight || 1;
        const total = Math.max(1, d.querySelector('#doc').offsetHeight);
        const dy = ((step.px - H) * viewH) / total;
        const grip = d.querySelector('#mmVpBox .rsz');
        const r = grip.getBoundingClientRect();
        const x = r.x + r.width / 2;
        const y = r.y + r.height / 2;
        pointer(grip, 'pointerdown', x, y);
        pointer(d.body, 'pointermove', x, y + dy);
        pointer(d.body, 'pointerup', x, y + dy);
        break;
      }
      case 'zoom-reset': {
        const grip = d.querySelector('#mmVpBox .rsz');
        const r = grip.getBoundingClientRect();
        const x = r.x + r.width / 2;
        const y = r.y + r.height / 2;
        pointer(grip, 'pointerdown', x, y);
        pointer(grip, 'pointerup', x, y);
        pointer(grip, 'pointerdown', x, y);
        pointer(grip, 'pointerup', x, y);
        break;
      }
      case 'dwell': {
        await new Promise((r) => setTimeout(r, step.ms));
        break;
      }
      case 'lane-toggle': {
        const chip = Array.from(d.querySelectorAll('#mmLegend .lg'))
          .find((el) => el.textContent.trim().includes(LANE_CHIP_TEXT[step.lane]));
        if (chip) chip.click();
        break;
      }
      case 'drag-thumb': {
        const vp = d.querySelector('#mmVpBox');
        const body = d.querySelector('#mmBody');
        const box = vp.getBoundingClientRect();
        const bodyBox = body.getBoundingClientRect();
        const vh = box.height;
        const grabOffset = vh / 2;
        const track = Math.max(1, bodyBox.height - vh);
        const x = box.x + box.width / 2;
        const pressY = box.y + box.height / 2;
        const moveY = bodyBox.y + step.f * track + grabOffset;
        pointer(vp, 'pointerdown', x, pressY);
        pointer(d.body, 'pointermove', x, moveY);
        pointer(d.body, 'pointerup', x, moveY);
        break;
      }
      case 'theme': {
        for (let k = 0; k < 3; k++) {
          if (d.documentElement.dataset.theme === step.to) break;
          d.querySelector('#themeBtn').click();
        }
        break;
      }
      case 'search': {
        frameEl.contentWindow.focus();
        d.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'f', metaKey: true, ctrlKey: true, bubbles: true, cancelable: true,
        }));
        // In-page events are untrusted; open + fill the search bar directly
        // through its own handlers' state (the ⌘F listener is on document,
        // so the synthetic keydown above opens it; typing goes to its input).
        const input = d.querySelector('input[placeholder="find in document…"]');
        input.focus();
        input.value = step.query;
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        break;
      }
      case 'search-clear': {
        const input = d.querySelector('input[placeholder="find in document…"]');
        if (input) {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        }
        break;
      }
      case 'key': {
        d.querySelector('#minimapWrap').focus();
        d.querySelector('#minimapWrap').dispatchEvent(
          new KeyboardEvent('keydown', { key: step.key, bubbles: true, cancelable: true }));
        break;
      }
      case 'viewport': {
        // Dev-page note: the page cannot resize its own viewport; the step
        // is honored only in the Playwright suite.
        console.warn('parity page: viewport step is suite-only; ignored here');
        break;
      }
      default:
        throw new Error(`unknown step type ${step.type}`);
    }
    await settle();
  }

  function captureFrame(i, step) {
    const d = doc();
    const mm = d.querySelector('#mmCanvas');
    const vp = d.querySelector('#mmVpBox');
    const m = mm.style.transform.match(/translateY\((-?[\d.]+)px\)/);
    const labels = Array.from(d.querySelectorAll('#mmLabels .lbl.show'))
      .map((l) => {
        const lv = l.className.match(/lv(\d)/);
        return {
          text: l.textContent.trim(),
          top: r3(parseFloat(l.style.top)),
          lv: lv ? +lv[1] : 0,
          active: l.classList.contains('active'),
        };
      })
      .sort((a, b) => a.top - b.top || (a.text < b.text ? -1 : 1));
    const activeBlk = d.querySelector('#mmStrip .blk.active');
    const lanes = {};
    for (const lane of Array.from(mm.querySelectorAll(':scope > .lane'))) {
      const key = LANE_BY_TITLE[lane.title];
      if (!key) continue;
      const ticks = Array.from(lane.querySelectorAll('.tick'))
        .map((t) => ({ top: r3(parseFloat(t.style.top)), height: r3(parseFloat(t.style.height)) }));
      lanes[key] = { off: lane.classList.contains('off'), tickCount: ticks.length };
    }
    const c = d.querySelector('#canvas');
    const dd = d.querySelector('#doc');
    return {
      i,
      step: stepEcho(step),
      scrollTop: c.scrollTop,
      geom: {
        scrollHeight: c.scrollHeight, clientHeight: c.clientHeight,
        docTop0: dd.offsetTop, docHeight: dd.offsetHeight,
        canvasH: r3(parseFloat(mm.style.height) || 0),
        paneH: d.querySelector('#mmBody').clientHeight,
      },
      thumb: { top: r3(parseFloat(vp.style.top) || 0), height: r3(parseFloat(vp.style.height) || 0) },
      panY: r3(m ? -parseFloat(m[1]) : 0),
      labels,
      labelCount: d.querySelectorAll('#mmLabels .lbl').length,
      activeBlock: activeBlk
        ? {
            title: activeBlk.title, type: activeBlk.dataset.type,
            top: r3(parseFloat(activeBlk.style.top)), height: r3(parseFloat(activeBlk.style.height)),
          }
        : null,
      activeCount: d.querySelectorAll('#mmStrip .blk.active').length,
      coPieceCount: d.querySelectorAll('#mmStrip .blk.co-piece').length,
    };
  }

  return { id: 'mockup', load, applyStep, captureFrame };
}

function stepEcho(step) {
  switch (step.type) {
    case 'scroll-fraction': return `scroll-fraction f=${step.f}`;
    case 'jump': return `jump anchor=${step.anchor}`;
    case 'zoom': return `zoom px=${step.px}`;
    case 'zoom-reset': return 'zoom-reset';
    case 'dwell': return `dwell ms=${step.ms}`;
    case 'lane-toggle': return `lane-toggle lane=${step.lane}`;
    case 'drag-thumb': return `drag-thumb f=${step.f}`;
    case 'theme': return `theme to=${step.to}`;
    case 'search': return `search q="${step.query}"`;
    case 'search-clear': return 'search-clear';
    case 'key': return `key ${step.key}`;
    case 'viewport': return `viewport ${step.width ?? ''}x${step.height ?? ''}`;
    default: return step.type;
  }
}

/* ── control bar ─────────────────────────────────────────────────────── */

const adapters = [createMockupAdapter(document.getElementById('mockupFrame'))];
const extraSlots = new Map(); // id → adapter (Phase 4 registers here)

window.parity = {
  registerAdapter(adapter) {
    extraSlots.set(adapter.id, adapter);
    logLine(`adapter registered: ${adapter.id}`, 'step');
  },
  adapters,
};

const $scenario = document.getElementById('scenario');
const $run = document.getElementById('run');
const $status = document.getElementById('status');
const $log = document.getElementById('log');

function logLine(text, cls) {
  const div = document.createElement('div');
  div.className = cls ?? '';
  div.textContent = text;
  $log.appendChild(div);
  $log.scrollTop = $log.scrollHeight;
}

async function init() {
  try {
    const names = await (await fetch('/parity-data/scenarios/index.json')).json();
    for (const n of names) {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      $scenario.appendChild(opt);
    }
  } catch {
    logLine('scenario index unavailable (is the server the extended serve.mjs?)', 'err');
  }
}

/** Strict leaf-diff count between two frame streams (quick visual signal;
 * the deviation-aware differ lives in the Playwright suite). */
function countDiffs(a, b, path = '') {
  if (a === b) return 0;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return 1;
  if (Array.isArray(a) !== Array.isArray(b)) return 1;
  let n = Array.isArray(a) && a.length !== b.length ? 1 : 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) n += countDiffs(a[k], b[k], `${path}.${k}`);
  return n;
}

async function runScenario() {
  const name = $scenario.value;
  if (!name) return;
  $run.disabled = true;
  $log.textContent = '';
  $status.textContent = `loading ${name}…`;
  try {
    const scenario = await (await fetch(`/parity-data/scenarios/${name}.json`)).json();
    const active = [...adapters, ...extraSlots.values()];
    for (const a of active) {
      $status.textContent = `loading ${a.id}…`;
      await a.load();
    }
    const streams = new Map(active.map((a) => [a.id, []]));
    let i = 0;
    for (const step of scenario.steps) {
      $status.textContent = `step ${i}: ${stepEcho(step)}`;
      for (const a of active) {
        await a.applyStep(step);
        streams.get(a.id).push(a.captureFrame(i, step));
      }
      const stepDiv = document.createElement('div');
      stepDiv.className = 'step';
      const mock = streams.get('mockup');
      const sum = mock
        ? `${stepEcho(step)} · scrollTop=${mock[i].scrollTop} thumb=${mock[i].thumb.top}/${mock[i].thumb.height} pan=${mock[i].panY} labels=${mock[i].labels.length}${mock[i].activeBlock ? ' active="' + mock[i].activeBlock.title.split(' · ')[0] + '"' : ''}`
        : stepEcho(step);
      stepDiv.innerHTML = `<span class="sum"></span><div class="frames"></div>`;
      stepDiv.querySelector('.sum').textContent = sum;
      const framesDiv = stepDiv.querySelector('.frames');
      for (const [id, list] of streams) {
        const pre = document.createElement('div');
        pre.textContent = `${id}: ${JSON.stringify(list[i])}`;
        framesDiv.appendChild(pre);
      }
      if (streams.size > 1) {
        const [first, second] = [...streams.values()];
        const n = countDiffs(first[i], second[i]);
        const d = document.createElement('div');
        d.textContent = `diff(mockup ↔ ${second === streams.get('package') ? 'package' : '?'}) = ${n} leaves`;
        if (n > 0) d.className = 'err';
        framesDiv.appendChild(d);
      }
      stepDiv.querySelector('.sum').addEventListener('click', () =>
        stepDiv.classList.toggle('open'));
      $log.appendChild(stepDiv);
      i++;
    }
    $status.textContent = `done — ${scenario.steps.length} steps × ${active.length} adapter(s)`;
  } catch (err) {
    logLine(`FAILED: ${err.message}`, 'err');
    $status.textContent = 'failed';
  } finally {
    $run.disabled = false;
  }
}

$run.addEventListener('click', runScenario);
init();
