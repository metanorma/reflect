/**
 * Headless tests for @metanorma/panel-layout — the §2.3 settled signal
 * composition (`wireSettledPinPass`, panelLayout.tsx): the public
 * `onDidLayoutSettled` surface is the pin-pass wiring's `onDidSettled` net
 * forwarded through a multicast emitter whose lifetime is the wiring's
 * (created at ready, disposed on unmount — subscriptions made during OR
 * after the consumer's `onReady` receive every later net).
 *
 * Run: yarn workspace @metanorma/panel-layout test
 *
 * BOUNDARY (explicit decision): the composition is tested at its DOM-free
 * seam. The full `wirePanelLayout` cannot run headless — its sibling
 * modules touch browser-only globals at wiring time (`watchTitlebars`
 * constructs a MutationObserver; `wireTabsetEdges` queries the document),
 * and mounting the real component needs a layouting DOM (parity
 * territory). `wireSettledPinPass` is exactly module 1's §2.3 composition
 * extracted for this purpose; it is driven here with the same fakes as
 * `pinHeights-wiring.test.mjs` (emitter-capturing api, manual rAF
 * scheduler, gate seam, real `Persistence` over `MapStorage`). The
 * component's `Object.defineProperty(api, 'onDidLayoutSettled', …)`
 * attachment is browser-side; every behavior it hands the consumer is the
 * `settledEvent` driven here.
 *
 * Subscription-timing caveat (the wiring's documented semantics): the init
 * `'layout'/'api'` stand-in emission fires INSIDE the wiring — before the
 * signal could be attached to an api or handed to a consumer — so it is
 * unobservable through `settledEvent`; that is the contract the
 * component's onReady ordering delivers and is asserted below.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { wireSettledPinPass } from "../compiled/panelLayout.js";
import { createPersistence } from "../compiled/persistence.js";
import { MapStorage } from "./helpers.mjs";

const KEYS = { layout: "L", heights: "H" };
const TWO_KEY = { kind: "two-key", keys: KEYS };
const DEFAULT_LAYOUT = {
  grid: { root: { type: "branch", data: [] }, width: 1200, height: 800, orientation: "HORIZONTAL" },
  panels: {},
  activeGroup: "group-doc",
};

/** Emitter-backed api fake: subscriptions are captured and fired by hand. */
function fakeApi() {
  const subs = { layoutChange: [], mutate: [] };
  return {
    groups: [],
    onDidLayoutChange(fn) {
      subs.layoutChange.push(fn);
      return () => {
        subs.layoutChange = subs.layoutChange.filter((f) => f !== fn);
      };
    },
    onDidMutateLayout(fn) {
      subs.mutate.push(fn);
      return () => {
        subs.mutate = subs.mutate.filter((f) => f !== fn);
      };
    },
    toJSON: () => DEFAULT_LAYOUT,
    fireLayoutChange() {
      subs.layoutChange.forEach((f) => f());
    },
    fireMutate(origin = "user") {
      subs.mutate.forEach((f) => f({ kind: "move", origin }));
    },
  };
}

/** Manual scheduler: nothing runs until flush() — the rAF seam in tests. */
function manualScheduler() {
  const queue = [];
  return {
    schedule(cb) {
      const entry = { cb, cancelled: false };
      queue.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    get pending() {
      return queue.filter((e) => !e.cancelled).length;
    },
    flush() {
      const run = queue.splice(0, queue.length);
      for (const e of run) {
        if (!e.cancelled) e.cb();
      }
    },
  };
}

/** Gate fake over the WindowDragGate seam (isLive/wire — windowDrag.ts). */
function fakeGate() {
  const handlers = {};
  let live = false;
  return {
    isLive: () => live,
    wire(h) {
      Object.assign(handlers, h);
      return () => {};
    },
    pointerdown() {
      live = true;
      handlers.onDragStart?.();
    },
    pointerup() {
      live = false;
      handlers.onDragEnd?.();
    },
  };
}

/** Real Persistence over MapStorage — the composition the component wires. */
function makePersistence(seed = new Map()) {
  const storage = new MapStorage(seed);
  const persistence = createPersistence({
    defaultLayout: DEFAULT_LAYOUT,
    storage,
    format: TWO_KEY,
  });
  return { persistence, storage };
}

/**
 * Wire the composed seam with every fake in place and a listener attached
 * immediately after construction — EARLIER than any component consumer
 * could attach (the api property is defined after the wiring returns).
 */
function wire(opts = {}) {
  const api = fakeApi();
  const scheduler = manualScheduler();
  const gate = fakeGate();
  const { persistence, storage } = makePersistence();
  const events = [];
  const handle = wireSettledPinPass({
    api,
    defaultLayout: DEFAULT_LAYOUT,
    persistence,
    gate,
    scheduler,
    ...opts,
  });
  const sub = handle.settledEvent((e) => events.push(e));
  return { api, scheduler, gate, persistence, storage, handle, events, sub };
}

describe("settled signal: net 1 — the mutate bracket", () => {
  it("§2.3: user transaction → exactly one {layout, user} at the pass flush", () => {
    const { api, scheduler, events } = wire();
    api.fireMutate("user");
    api.fireLayoutChange();
    assert.equal(scheduler.pending, 1, "pass scheduled");
    scheduler.flush();
    assert.deepEqual(events, [{ source: "layout", origin: "user" }]);
  });

  it("§2.3: api transaction → {layout, api} (programmatic mutation)", () => {
    const { api, scheduler, events } = wire();
    api.fireMutate("api");
    api.fireLayoutChange();
    scheduler.flush();
    assert.deepEqual(events, [{ source: "layout", origin: "api" }]);
  });

  it("§2.3: one emit per net — compound mutations collapse; a flush with no pending net emits nothing", () => {
    const { api, scheduler, events } = wire();
    api.fireMutate("user");
    api.fireMutate("user");
    api.fireLayoutChange();
    api.fireLayoutChange(); // change re-fire: same pending net, one pass
    scheduler.flush();
    assert.deepEqual(events, [{ source: "layout", origin: "user" }]);

    api.fireLayoutChange(); // no new transaction
    scheduler.flush();
    assert.equal(events.length, 1, "re-fire without a net emits nothing");
  });
});

describe("settled signal: net 2 — takeover commit", () => {
  it("§2.3/HP6: commitHeights emits {heights, user} with no scheduled pass", () => {
    const { scheduler, events, handle } = wire();
    handle.commitHeights({ g1: 182 });
    assert.equal(scheduler.pending, 0, "takeover drags fire no layout event");
    assert.deepEqual(events, [{ source: "heights", origin: "user" }]);
    assert.deepEqual(handle.heights(), { g1: 182 });
  });
});

describe("settled signal: net 3 — window-drag release", () => {
  it("§2.3/F4: mid-drag changes are suppressed; the release marks one {layout, user} at the flush", () => {
    const { api, scheduler, gate, events } = wire();
    gate.pointerdown();
    api.fireMutate("user");
    api.fireLayoutChange();
    assert.equal(scheduler.pending, 0, "nothing scheduled mid-drag");
    scheduler.flush();
    assert.equal(events.length, 0, "no emission mid-drag");

    gate.pointerup();
    api.fireLayoutChange(); // the overlay's own pointerup change event
    assert.equal(scheduler.pending, 1, "release schedules the pass");
    scheduler.flush();
    assert.deepEqual(events, [{ source: "layout", origin: "user" }]);
  });
});

describe("settled signal: lifetime and subscription windows (the originally-dead surface)", () => {
  it("a subscription made AFTER wiring (post-onReady analog) receives nets — the signal is not dead after ready", () => {
    const { api, scheduler, handle } = wire();
    const late = [];
    const lateSub = handle.settledEvent((e) => late.push(e));
    api.fireMutate("user");
    api.fireLayoutChange();
    scheduler.flush();
    assert.deepEqual(late, [{ source: "layout", origin: "user" }]);
    lateSub.dispose();
  });

  it("multicast: two subscribers receive the same emission", () => {
    const { api, scheduler, handle } = wire();
    const a = [];
    const b = [];
    handle.settledEvent((e) => a.push(e));
    handle.settledEvent((e) => b.push(e));
    api.fireMutate("user");
    api.fireLayoutChange();
    scheduler.flush();
    assert.deepEqual(a, [{ source: "layout", origin: "user" }]);
    assert.deepEqual(b, [{ source: "layout", origin: "user" }]);
  });

  it("dispose(): the pending net is cancelled and later activity is silent", () => {
    const { api, scheduler, events, handle } = wire();
    api.fireMutate("user");
    api.fireLayoutChange();
    assert.equal(scheduler.pending, 1, "net pending");
    handle.dispose();
    scheduler.flush();
    assert.equal(events.length, 0, "pending net cancelled by dispose");
    assert.doesNotThrow(() => handle.commitHeights({ g1: 100 }));
    assert.equal(events.length, 0, "nothing after dispose");
  });

  it("a throwing listener is isolated — other subscribers still receive the net", () => {
    const { api, scheduler, handle } = wire();
    let threw = 0;
    handle.settledEvent(() => {
      threw += 1;
      throw new Error("consumer callback throws");
    });
    const sane = [];
    handle.settledEvent((e) => sane.push(e));
    api.fireMutate("user");
    api.fireLayoutChange();
    scheduler.flush();
    assert.equal(threw, 1, "throwing listener was invoked and swallowed");
    assert.deepEqual(sane, [{ source: "layout", origin: "user" }]);

    // the wiring survives the throwing listener
    api.fireMutate("api");
    api.fireLayoutChange();
    scheduler.flush();
    assert.deepEqual(sane.slice(-1), [{ source: "layout", origin: "api" }]);
  });

  it("subscription disposable stops delivery", () => {
    const { api, scheduler, handle } = wire();
    const got = [];
    const sub = handle.settledEvent((e) => got.push(e));
    sub.dispose();
    api.fireMutate("user");
    api.fireLayoutChange();
    scheduler.flush();
    assert.equal(got.length, 0, "disposed subscription receives nothing");
  });
});

describe("settled signal: attachment semantics", () => {
  it("the ready-time load stand-in predates the signal — unobservable through settledEvent", () => {
    // The listener in wire() attached immediately after construction —
    // strictly earlier than any component consumer (the api property is
    // defined after the wiring returns) — saw no init emission.
    const { events } = wire();
    assert.deepEqual(events, [], "init {layout, api} stand-in not observable");
  });

  it("handle surface: heights()/commitHeights() delegate to the pin wiring intact", () => {
    const { handle, storage } = wire();
    assert.deepEqual(handle.heights(), {});
    handle.commitHeights({ g2: 210 });
    assert.deepEqual(handle.heights(), { g2: 210 });
    assert.equal(
      storage.getItem(KEYS.heights),
      JSON.stringify({ g2: 210 }),
      "commit persisted through the real Persistence — the delegation is live",
    );
  });
});
