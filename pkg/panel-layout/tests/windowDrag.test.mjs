/**
 * Headless tests for @metanorma/panel-layout — window-drag containment
 * (docs/behavior.spec.md rows HP5/F4: top/left containment, free bottom)
 * and the drag-session gate that owns the mock's pointerup retire sequence.
 *
 * Run: yarn workspace @metanorma/panel-layout test
 *
 * BOUNDARY (explicit decision): only DOM-free seams are exercised.
 * clampDragBox is pure math; the gate's listeners are attached to an
 * injected target (the WindowDragEventTarget seam) and retire runs with
 * api()/layoutArea() returning undefined/null, which makes the sweep and
 * normalizeTops steps inert by the mock's own guards — the ORDER of the
 * retire sequence is asserted without faking any DOM. The DOM-side of
 * window drag (transform tracking, getComputedStyle/getBoundingClientRect
 * in normalizeTops, the zone-element sweep) is covered by parity (GREEN 1)
 * and stays there.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampDragBox, createWindowDragGate } from "../compiled/windowDrag.js";

describe("windowDrag: clampDragBox (HP5/F4 containment)", () => {
  it("HP5: negative top/left clamp to 0 (stay inside top/left edges)", () => {
    const r = clampDragBox({
      proposed: { top: -30, left: -50, width: 200, height: 100 },
      container: { width: 1000, height: 800 },
    });
    assert.deepEqual(r, { top: 0, left: 0 });
  });

  it("HP5: left respects width (right edge contained)", () => {
    const r = clampDragBox({
      proposed: { top: 10, left: 950, width: 200, height: 100 },
      container: { width: 1000, height: 800 },
    });
    assert.deepEqual(r, { top: 10, left: 800 });
  });

  it("F4: top clamps to [0, container.height] — window may start AT the bottom edge and hang below (drawer park, bottom stays free)", () => {
    const r = clampDragBox({
      proposed: { top: 5000, left: 10, width: 200, height: 100 },
      container: { width: 1000, height: 800 },
    });
    assert.deepEqual(r, { top: 800, left: 10 });
    // At-edge start: not pushed back inside.
    const atEdge = clampDragBox({
      proposed: { top: 800, left: 10, width: 200, height: 100 },
      container: { width: 1000, height: 800 },
    });
    assert.deepEqual(atEdge, { top: 800, left: 10 });
  });

  it("HP5: top cap is container.height even when the window is TALLER than the container (bottom-anchor-flip guard)", () => {
    // proposed.top < container.height stays untouched — the engine's
    // anchor decision (top vs bottom) keeps the top-anchored form. A cap
    // at container.height − window height would drag this window to a
    // negative top and flip the anchor.
    const r = clampDragBox({
      proposed: { top: 700, left: 10, width: 252, height: 1000 },
      container: { width: 1000, height: 800 },
    });
    assert.deepEqual(r, { top: 700, left: 10 });
  });

  it("HP5: absent width clamps left against a zero-width window (left ≤ container.width)", () => {
    // The engine's Box always carries width; the optional-encoding guard
    // must not turn a missing width into a negative left range — an
    // in-range left passes through, an out-of-range one clamps to the
    // container's width.
    const pass = clampDragBox({
      proposed: { top: 10, left: 950 },
      container: { width: 1000, height: 800 },
    });
    assert.deepEqual(pass, { top: 10, left: 950 });
    const clamped = clampDragBox({
      proposed: { top: 10, left: 1200 },
      container: { width: 1000, height: 800 },
    });
    assert.deepEqual(clamped, { top: 10, left: 1000 });
  });

  it("HP5: container narrower than the window → left 0 (fully-clamped range collapses)", () => {
    const r = clampDragBox({
      proposed: { top: 10, left: 400, width: 1200, height: 100 },
      container: { width: 1000, height: 800 },
    });
    assert.deepEqual(r, { top: 10, left: 0 });
  });

  it("HP5: in-bounds proposal passes through unchanged", () => {
    const r = clampDragBox({
      proposed: { top: 12, left: 18, width: 252, height: 450 },
      container: { width: 1440, height: 900 },
    });
    assert.deepEqual(r, { top: 12, left: 18 });
  });

  it("HP5: degenerate zero-size container → clamps to 0 without NaN", () => {
    const r = clampDragBox({
      proposed: { top: 100, left: 100, width: 200, height: 100 },
      container: { width: 0, height: 0 },
    });
    assert.deepEqual(r, { top: 0, left: 0 });
  });
});

/**
 * Capturing event-target fake (the WindowDragEventTarget seam): records
 * registrations and lets the test fire pointerdown/up/cancel by hand. No
 * DOM is involved — the gate treats it structurally.
 */
function fakeTarget() {
  const listeners = new Map();
  const calls = [];
  const key = (type) => listeners.get(type) ?? [];
  return {
    addEventListener(type, listener) {
      listeners.set(type, [...key(type), listener]);
      calls.push(["add", type]);
    },
    removeEventListener(type, listener) {
      listeners.set(type, key(type).filter((l) => l !== listener));
      calls.push(["remove", type]);
    },
    fire(type, ev = { button: 0, clientX: 10, clientY: 20 }) {
      for (const l of [...key(type)]) l(ev);
    },
    count(type) {
      return key(type).length;
    },
    ops() {
      return calls;
    },
  };
}

/** Retire-order probe: each option records when the gate reached it. */
function wireGate(opts = {}) {
  const order = [];
  const events = [];
  const liveAtRetire = [];
  const target = fakeTarget();
  const gate = createWindowDragGate({
    target,
    api: () => {
      order.push("api");
      return undefined; // mock's guard: normalizeTops skipped, no api yet
    },
    layoutArea: () => {
      order.push("layoutArea");
      return null; // mock's guard: sweep skipped, no area
    },
    onRetireFirst: (ev) => {
      order.push("onRetireFirst");
      events.push(ev);
      // isLive() as the GATE UNDER TEST's own hook sees it — retire
      // step 1 has already flipped it, so a healthy retire observes
      // false. Late-bound `gate`: hooks can only fire after construction.
      liveAtRetire.push(gate.isLive());
    },
    ...opts,
  });
  return { gate, target, order, events, liveAtRetire };
}

describe("windowDrag: gate lifecycle (F4)", () => {
  it("F4: arm on pointerdown retires on pointerup — isLive brackets the session", () => {
    const { gate, target } = wireGate();
    assert.equal(gate.isLive(), false);
    target.fire("pointerdown");
    assert.equal(gate.isLive(), true);
    target.fire("pointerup");
    assert.equal(gate.isLive(), false);
  });

  it("F4: pointercancel retires too (the mock wires both to the same retire)", () => {
    const { gate, target } = wireGate();
    target.fire("pointerdown");
    target.fire("pointercancel");
    assert.equal(gate.isLive(), false);
  });

  it("F4: listeners attach at creation; dispose removes all three exactly once", () => {
    const { gate, target } = wireGate();
    assert.deepEqual(
      target.ops().map(([op, type]) => `${op}:${type}`),
      ["add:pointerdown", "add:pointerup", "add:pointercancel"],
    );
    gate.dispose();
    assert.equal(target.count("pointerdown"), 0);
    assert.equal(target.count("pointerup"), 0);
    assert.equal(target.count("pointercancel"), 0);
    // dispose is idempotent — no double-remove
    gate.dispose();
    assert.equal(target.ops().filter(([op]) => op === "remove").length, 3);
  });

  it("F4: wire() subscribers get onDragStart on arm and onDragEnd on retire; unwiring stops only that subscriber", () => {
    const { gate, target } = wireGate();
    const seen = [];
    const unwireA = gate.wire({
      onDragStart: () => seen.push("a:start"),
      onDragEnd: () => seen.push("a:end"),
    });
    gate.wire({
      onDragStart: () => seen.push("b:start"),
      onDragEnd: () => seen.push("b:end"),
    });
    target.fire("pointerdown");
    target.fire("pointerup");
    assert.deepEqual(seen, ["a:start", "b:start", "a:end", "b:end"]);
    unwireA();
    target.fire("pointerdown");
    target.fire("pointerup");
    assert.deepEqual(seen.slice(4), ["b:start", "b:end"]);
  });

  it("F4: a throwing retire hook must not break the retire sequence or the gate", () => {
    const { gate, target, order } = wireGate({
      onRetireFirst: () => {
        order.push("onRetireFirst");
        throw new Error("provider hook threw");
      },
    });
    let ended = 0;
    gate.wire({ onDragEnd: () => { ended += 1; } });
    target.fire("pointerup");
    assert.equal(gate.isLive(), false, "gate retired despite hook throw");
    assert.equal(ended, 1, "subscribers still notified");
    assert.ok(order.includes("layoutArea"), "sweep still ran after the throw");
  });
});

describe("windowDrag: retire sequence order (HP5/F4)", () => {
  it("F4: retire order — live off, then unwrap fallback, then sweep/normalize probes, then onDragEnd", () => {
    const { gate, target, order } = wireGate();
    gate.wire({ onDragEnd: () => order.push("onDragEnd") });
    target.fire("pointerdown");
    target.fire("pointerup", { button: 0, clientX: 111, clientY: 222 });
    // exact sequence, not just membership: the group-unwrap fallback runs
    // FIRST (before the suppression state clears), the sweep and
    // normalizeTops follow, subscribers last.
    assert.deepEqual(order, [
      "onRetireFirst",
      "layoutArea", // sweep probe (mock: querySelector('.layoutArea'))
      "api",        // normalizeTops probe (mock: if (window.__api))
      "onDragEnd",
    ]);
  });

  it("F4: the unwrap-fallback hook observes isLive() === false and receives the pointer event", () => {
    const { gate, target, events, liveAtRetire } = wireGate();
    const ev = { button: 0, clientX: 321, clientY: 654 };
    gate.wire({});
    target.fire("pointerdown");
    target.fire("pointerup", ev);
    assert.equal(events.length, 1);
    assert.equal(events[0].clientX, 321);
    assert.equal(events[0].clientY, 654);
    assert.equal(
      liveAtRetire[0], false,
      "gate already retired when the hook runs (observed on the gate under test)",
    );
  });

  it("HP5: retire runs the full sequence even without a prior arm (after every pointer gesture, drag or not)", () => {
    const { gate, target, order } = wireGate();
    gate.wire({ onDragEnd: () => order.push("onDragEnd") });
    target.fire("pointerup"); // no pointerdown preceded
    assert.deepEqual(order, [
      "onRetireFirst",
      "layoutArea",
      "api",
      "onDragEnd",
    ]);
  });

  it("F4: arm notifies onDragStart subscribers exactly once per arm", () => {
    const { gate, target } = wireGate();
    let starts = 0;
    gate.wire({ onDragStart: () => { starts += 1; } });
    target.fire("pointerdown");
    target.fire("pointerdown");
    assert.equal(starts, 2);
  });
});
