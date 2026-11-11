/**
 * Headless tests for @metanorma/panel-layout — titlebar chrome
 * (docs/behavior.spec.md rows F2/A4-grip-timing): the drag-grip
 * decoration, the quarantined move-only reach-in, and the decoration
 * safety net (paint + MutationObserver + interval).
 *
 * Run: yarn workspace @metanorma/panel-layout test
 *
 * BOUNDARY (explicit decision, `wiring-Node`): only STRUCTURE and
 * WIRING are asserted — element-graph fakes (className/setAttribute/
 * appendChild/class-matching querySelector), a document stub exposing
 * exactly createElement + body, a recording MutationObserver stand-in
 * (Node has none), and scoped-and-restored setInterval/clearInterval
 * recorders whose callbacks are fired by hand. ZERO geometry is faked:
 * no getBoundingClientRect, no layout, no cursor states — the DOM halves
 * of F2 (grab/grabbing cursors, grip hover) stay parity (GREEN 1,
 * `trace-chrome`/`trace-transitions`); the real ≤500ms late-window
 * timing is synthetic-covered (`synthetic-panel.spec.ts` A4).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  decorateTitlebars,
  suppressTitlebarGroupDrag,
  watchTitlebars,
} from "../compiled/titlebar.js";

// ---------------------------------------------------------------------------
// Element-graph fakes — the exact seams titlebar.ts touches, nothing more.
// ---------------------------------------------------------------------------

/** Class-matching element fake; children/attrs drive the touched members. */
function el(classes = [], { children = [], attrs = {} } = {}) {
  const list = Array.isArray(classes) ? classes : String(classes).split(/\s+/).filter(Boolean);
  return {
    className: list.join(" "),
    children,
    attrs,
    setAttribute(name, value) {
      attrs[name] = value;
    },
    appendChild(child) {
      children.push(child);
      return child;
    },
    /** Class-only descendant lookup (the `.mn-drag-grip` probe). */
    querySelector(sel) {
      const cls = sel.replace(/^\./, "");
      const walk = (n) => {
        for (const c of n.children) {
          if (String(c.className).split(/\s+/).includes(cls)) return c;
          const hit = walk(c);
          if (hit) return hit;
        }
        return null;
      };
      return walk(this);
    },
  };
}

/** A floating group fake: overlay {element} hosting a `.dv-floating-titlebar`. */
function fakeFloat({ bar } = {}) {
  const element = el();
  if (bar) element.appendChild(bar);
  return { overlay: { element } };
}

/** api fake for the floatingGroups hop (api.component.floatingGroups). */
function fakeApi(floats) {
  return { component: { floatingGroups: floats } };
}

/** Fresh titlebar with no grip. */
function freshBar() {
  return el("dv-floating-titlebar");
}

/** Drag-source fake recording setDisabled calls (the reach-in's seam). */
function fakeDragSource({ html5 = true, pointer = true } = {}) {
  const calls = [];
  return {
    __calls: calls,
    html5DragSource: html5 ? { setDisabled: (v) => calls.push(["html5", v]) } : undefined,
    pointerDragSource: pointer ? { setDisabled: (v) => calls.push(["pointer", v]) } : undefined,
  };
}

/**
 * Scoped document stub (approved ruling 4): Node has no `document`; the
 * tests install exactly the `createElement` the decoration touches and
 * restore the real global afterwards in `finally`.
 */
function stubDocument() {
  const saved = globalThis.document;
  const body = el("body");
  globalThis.document = { createElement: () => el(), body };
  return {
    body,
    restore() { globalThis.document = saved; },
  };
}

// ---------------------------------------------------------------------------
// F2 — grip decoration
// ---------------------------------------------------------------------------

describe("titlebar: decorateTitlebars (F2)", () => {
  it("F2: appends one span.mn-drag-grip with aria-hidden=true to each float titlebar", () => {
    const doc = stubDocument();
    try {
      const bars = [freshBar(), freshBar()];
      decorateTitlebars(fakeApi([fakeFloat({ bar: bars[0] }), fakeFloat({ bar: bars[1] })]));
      for (const bar of bars) {
        assert.equal(bar.children.length, 1);
        const grip = bar.children[0];
        assert.equal(grip.className, "mn-drag-grip");
        assert.equal(grip.attrs["aria-hidden"], "true");
      }
    } finally {
      doc.restore();
    }
  });

  it("F2: idempotent — a bar already carrying a grip is skipped (same object, no second child)", () => {
    const doc = stubDocument();
    try {
      const bar = freshBar();
      decorateTitlebars(fakeApi([fakeFloat({ bar })]));
      const first = bar.children[0];
      decorateTitlebars(fakeApi([fakeFloat({ bar })]));
      assert.equal(bar.children.length, 1);
      assert.equal(bar.children[0], first);
    } finally {
      doc.restore();
    }
  });

  it("F2: a float whose overlay has no .dv-floating-titlebar descendant is skipped silently", () => {
    const doc = stubDocument();
    try {
      const barless = fakeFloat({}); // overlay with no titlebar child
      const withBar = fakeFloat({ bar: freshBar() });
      decorateTitlebars(fakeApi([barless, withBar])); // must not throw
      assert.equal(barless.overlay.element.children.length, 0, "nothing invented for the barless float");
      assert.equal(withBar.overlay.element.children[0].children.length, 1, "the barful float was decorated");
    } finally {
      doc.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// F2 — move-only enforcement, the quarantined reach-in
// ---------------------------------------------------------------------------

describe("titlebar: suppressTitlebarGroupDrag (F2)", () => {
  const withSource = (src) => ({
    ...fakeFloat({ bar: freshBar() }),
    _titleBar: { dragSource: src },
  });

  it("F2: disables html5 AND pointer drag sources and sets the __mnMoveOnly marker", () => {
    const src = fakeDragSource();
    suppressTitlebarGroupDrag(fakeApi([withSource(src)]));
    assert.deepEqual(src.__calls, [["html5", true], ["pointer", true]]);
    assert.equal(src.__mnMoveOnly, true);
  });

  it("F2: durable — a marked drag source is never re-disabled on later paints", () => {
    const src = fakeDragSource();
    const fp = withSource(src);
    suppressTitlebarGroupDrag(fakeApi([fp]));
    src.__calls.length = 0;
    suppressTitlebarGroupDrag(fakeApi([fp])); // safety-net re-paint
    assert.deepEqual(src.__calls, []);
    assert.equal(src.__mnMoveOnly, true);
  });

  it("F2: feature-detection — missing hops and absent backends are skipped silently (degrade = shift-drag redock)", () => {
    const html5Calls = [];
    const floats = [
      { ...fakeFloat({}), /* no _titleBar at all */ },
      { ...fakeFloat({}), _titleBar: {} }, // titlebar without a dragSource
      { ...fakeFloat({}), _titleBar: { dragSource: {} } }, // neither backend
      { // pointer backend absent: only html5 disabled, still marked
        ...fakeFloat({}),
        _titleBar: {
          dragSource: {
            html5DragSource: { setDisabled: (v) => html5Calls.push(v) },
          },
        },
      },
    ];
    suppressTitlebarGroupDrag(fakeApi(floats)); // must not throw
    assert.deepEqual(html5Calls, [true], "html5-only source: exactly one disable");
    assert.equal(floats[3]._titleBar.dragSource.__mnMoveOnly, true);
    // Empty dragSource objects carry no backends — the mock's `!ds` branch
    // (:724) only requires no-throw for them; marking is for real sources.
  });
});

// ---------------------------------------------------------------------------
// A4 — the decoration safety net
// ---------------------------------------------------------------------------

describe("titlebar: watchTitlebars safety net (A4)", () => {
  /**
   * Scoped-and-restored global stubs (approved ruling 4), installed
   * TOGETHER: the net paints through decorateTitlebars, so the document
   * stub must be live for every watchTitlebars call. Node has no
   * MutationObserver; setInterval/clearInterval are recorded, not run —
   * callbacks fire by hand.
   */
  function stubEnv() {
    const doc = stubDocument();
    const saved = {
      MutationObserver: globalThis.MutationObserver,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    };
    const observers = [];
    const intervals = [];
    const FakeMO = class {
      constructor(cb) { this.cb = cb; observers.push(this); }
      observe(target, init) { this.target = target; this.init = init; }
      disconnect() { this.disconnected = true; }
    };
    globalThis.MutationObserver = FakeMO;
    globalThis.setInterval = (cb, ms) => { intervals.push({ cb, ms }); return intervals.length; };
    globalThis.clearInterval = (id) => { intervals[id - 1].cleared = true; };
    return {
      observers,
      intervals,
      body: doc.body,
      restore() {
        Object.assign(globalThis, saved);
        doc.restore();
      },
    };
  }

  it("A4: paints immediately and observes the INJECTED root with {childList, subtree}", () => {
    const env = stubEnv();
    try {
      const bar = freshBar();
      const root = el("layout-area");
      watchTitlebars(fakeApi([fakeFloat({ bar })]), { root });
      assert.equal(bar.children.length, 1, "paint() ran before any net could fire");
      const mo = env.observers[0];
      assert.equal(mo.target, root);
      assert.deepEqual(mo.init, { childList: true, subtree: true });
    } finally {
      env.restore();
    }
  });

  it("A4: mutation net and interval net both re-paint; dispose() disconnects the observer and clears the interval", () => {
    const env = stubEnv();
    try {
      const api = fakeApi([fakeFloat({ bar: freshBar() })]);
      const dispose = watchTitlebars(api, { root: env.body });
      // A second window appears after startup — its bar gets chrome only
      // when a net re-paints (the late-window case A4 speaks to).
      const lateBar = freshBar();
      api.component.floatingGroups.push(fakeFloat({ bar: lateBar }));
      assert.equal(lateBar.children.length, 0, "no net fired yet");
      env.observers[0].cb(); // MutationObserver record
      assert.equal(lateBar.children.length, 1, "mutation net painted");
      const late2 = freshBar();
      api.component.floatingGroups.push(fakeFloat({ bar: late2 }));
      env.intervals[0].cb(); // interval net
      assert.equal(late2.children.length, 1, "interval net painted");
      dispose();
      assert.equal(env.observers[0].disconnected, true);
      assert.equal(env.intervals[0].cleared, true);
    } finally {
      env.restore();
    }
  });

  it("A4: defaults — root falls back to document.body and the interval period is the mock's 500ms", () => {
    const env = stubEnv();
    try {
      const dispose = watchTitlebars(fakeApi([]));
      assert.equal(env.observers[0].target, env.body);
      assert.equal(env.intervals[0].ms, 500);
      dispose();
    } finally {
      env.restore();
    }
  });
});
