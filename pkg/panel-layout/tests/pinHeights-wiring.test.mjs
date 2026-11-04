/**
 * Headless tests for @metanorma/panel-layout — the usePinnedHeights wiring
 * (api.spec.md §3 module 3; §2.3 settled signals; §2.5 floors) and the pure
 * preset/floor helpers.
 *
 * Run: yarn workspace @metanorma/panel-layout test
 *
 * BOUNDARY (explicit decision): the wiring is tested through injected
 * seams only — the api's onDidLayoutChange/onDidMutateLayout subscriptions
 * (captured, then fired by the test), the WindowDragGate seam
 * (isLive/wire), the rAF scheduler, and a real Persistence instance over
 * MapStorage. NO DOM is faked: the pin pass itself (pinAllWindows/
 * collectStableHeights over getBoundingClientRect) is not exercised here —
 * an api with zero floating groups keeps the pass a no-op walk, so these
 * tests assert gating/debounce/persist/emit discipline, never measurement.
 * Measurement rows stay parity-covered (GREEN 1) until the synthetic layer.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { usePinnedHeights } from "../compiled/pinHeights.js";
import { collectPresetHeights, effectiveFloor } from "../compiled/pinHeights.js";
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
  const api = {
    groups: [],
    onDidLayoutChange: (fn) => {
      subs.layoutChange.push(fn);
      return () => {
        subs.layoutChange = subs.layoutChange.filter((f) => f !== fn);
      };
    },
    onDidMutateLayout: (fn) => {
      subs.mutate.push(fn);
      return () => {
        subs.mutate = subs.mutate.filter((f) => f !== fn);
      };
    },
    // Persistence.saveLayout's seam (C4: a throwing toJSON returns null).
    toJSON: () => DEFAULT_LAYOUT,
    fireLayoutChange() {
      subs.layoutChange.forEach((f) => f());
    },
    fireMutate(origin = "user") {
      subs.mutate.forEach((f) => f({ kind: "move", origin }));
    },
    subscriberCounts() {
      return { layoutChange: subs.layoutChange.length, mutate: subs.mutate.length };
    },
  };
  return api;
}

/** Manual scheduler: nothing runs until flush() — the rAF seam in tests. */
function manualScheduler() {
  let counter = 0;
  const queue = [];
  return {
    schedule(cb) {
      const entry = { cb, cancelled: false };
      queue.push(entry);
      counter += 1;
      void counter;
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
  const unwired = [];
  return {
    isLive: () => live,
    wire(h) {
      Object.assign(handlers, h);
      const off = () => {
        unwired.push(true);
      };
      unwired.splice(0, unwired.length);
      return off;
    },
    pointerdown() {
      live = true;
      handlers.onDragStart?.();
    },
    pointerup() {
      live = false;
      handlers.onDragEnd?.();
    },
    unwireCount: () => unwired.length,
  };
}

/** Real Persistence over MapStorage, with a call log on all four ops. */
function makePersistence(seed = new Map()) {
  const storage = new MapStorage(seed);
  const log = [];
  const wrap = (name, fn) => (...args) => {
    log.push(name);
    return fn(...args);
  };
  const persistence = createPersistence({
    defaultLayout: DEFAULT_LAYOUT,
    storage,
    format: TWO_KEY,
  });
  return {
    storage,
    log,
    persistence: {
      saveLayout: wrap("saveLayout", persistence.saveLayout.bind(persistence)),
      loadLayout: wrap("loadLayout", persistence.loadLayout.bind(persistence)),
      saveHeights: wrap("saveHeights", persistence.saveHeights.bind(persistence)),
      loadHeights: wrap("loadHeights", persistence.loadHeights.bind(persistence)),
      clear: wrap("clear", persistence.clear.bind(persistence)),
    },
  };
}

function wire(opts = {}) {
  const {
    seed = new Map(),
    defaultLayout = DEFAULT_LAYOUT,
    ...rest
  } = opts;
  const api = fakeApi();
  const scheduler = manualScheduler();
  const gate = fakeGate();
  const { persistence, storage, log } = makePersistence(seed);
  const settled = [];
  const handle = usePinnedHeights({
    api,
    defaultLayout,
    persistence,
    gate,
    scheduler,
    onDidSettled: (e) => settled.push(e),
    ...rest,
  });
  return { api, scheduler, gate, persistence, storage, log, settled, handle };
}

describe("pinHeights wiring: init + seeding", () => {
  it("HP1: init writes the layout key once and leaves the heights key absent", () => {
    const { storage } = wire();
    assert.ok(storage.getItem(KEYS.layout), "layout key written at init");
    assert.equal(storage.getItem(KEYS.heights), null, "heights key stays absent on first load");
  });

  it("A5: init seeds the in-memory map from persistence.loadHeights()", () => {
    const stored = JSON.stringify({ "group-nav-1": 244, "group-insp-2": 180 });
    const { handle } = wire({ seed: new Map([[KEYS.heights, stored]]) });
    assert.deepEqual(handle.heights(), { "group-nav-1": 244, "group-insp-2": 180 });
  });

  it("HP1: the init layout write emits one settled layout/api event (the 'load' net stand-in)", () => {
    const { settled } = wire();
    assert.deepEqual(settled, [{ source: "layout", origin: "api" }]);
  });
});

describe("pinHeights wiring: takeover commit (net 2)", () => {
  it("HP6: commitHeights persists exactly the committed map, saves no layout, emits heights/user", () => {
    const { persistence, storage, settled, handle, log } = wire();
    const before = log.filter((n) => n === "saveLayout").length;
    handle.commitHeights({ g1: 182, g2: 116 });
    assert.equal(
      storage.getItem(KEYS.heights),
      JSON.stringify({ g1: 182, g2: 116 }),
      "heights key carries the committed map",
    );
    assert.equal(
      log.filter((n) => n === "saveLayout").length,
      before,
      "no layout save on a heights-only commit",
    );
    assert.deepEqual(settled.slice(-1), [{ source: "heights", origin: "user" }]);
    assert.deepEqual(handle.heights(), { g1: 182, g2: 116 });
  });

  it("HP6: a committed map seeds the next maintenance pass", () => {
    const { api, scheduler, handle } = wire();
    handle.commitHeights({ g1: 200 });
    api.fireMutate("user");
    api.fireLayoutChange();
    scheduler.flush();
    assert.deepEqual(handle.heights(), {});
    // ^ zero floating groups on the fake api: the pass rebuilds the map
    //   from live members only — the committed entry had none to keep.
  });
});

describe("pinHeights wiring: gate + debounce (F4, §2.3)", () => {
  it("F4: gate live → layout change → no pass, zero storage writes", () => {
    const { api, gate, scheduler, storage, log, settled } = wire();
    const savesAtInit = log.filter((n) => n.startsWith("save")).length;
    gate.pointerdown();
    api.fireMutate("user");
    api.fireLayoutChange();
    assert.equal(scheduler.pending, 0, "nothing scheduled mid-drag");
    scheduler.flush();
    assert.equal(
      log.filter((n) => n.startsWith("save")).length,
      savesAtInit,
      "no saves beyond init, mid-drag",
    );
    assert.deepEqual(settled, [{ source: "layout", origin: "api" }], "no new settled event");
    assert.ok(storage.getItem(KEYS.heights) === null, "heights key still absent");
  });

  it("F4: after release, the next layout change runs the pass again", () => {
    const { api, gate, scheduler, log } = wire();
    gate.pointerdown();
    api.fireMutate("user");
    api.fireLayoutChange();
    gate.pointerup();
    scheduler.flush(); // the release's defensive schedule
    api.fireMutate("user");
    api.fireLayoutChange();
    scheduler.flush();
    assert.ok(log.includes("saveHeights"), "pass persisted after release");
  });

  it("F4/A4: gate onDragEnd alone schedules a pass (order-independence of net 3)", () => {
    const { api, gate, scheduler, settled } = wire();
    gate.pointerdown();
    gate.pointerup(); // release BEFORE the engine's own change event fires
    assert.ok(scheduler.pending >= 1, "release alone scheduled a pass");
    scheduler.flush();
    assert.deepEqual(settled.slice(-1), [{ source: "layout", origin: "user" }]);
    void api;
  });

  it("§2.3: N changes before the frame collapse into one pass and one save", () => {
    const { api, scheduler, log } = wire();
    api.fireMutate("user");
    for (let i = 0; i < 5; i += 1) api.fireLayoutChange();
    assert.equal(scheduler.pending, 1, "one scheduled pass");
    const before = log.filter((n) => n === "saveHeights").length;
    scheduler.flush();
    assert.equal(
      log.filter((n) => n === "saveHeights").length - before,
      1,
      "exactly one heights save",
    );
  });

  it("§2.3: a new change cancels the pending schedule before re-scheduling", () => {
    const { api, scheduler } = wire();
    api.fireLayoutChange();
    const first = scheduler.pending;
    api.fireLayoutChange();
    assert.equal(scheduler.pending, 1);
    assert.notEqual(scheduler.pending, first + 1, "no accumulation");
    let ran = 0;
    scheduler.schedule(() => { ran += 1; });
    scheduler.flush();
    assert.equal(ran, 1, "cancelled entries never run");
  });

  it("§2.3: mutate origin propagates — user vs api", () => {
    const { api, scheduler, settled } = wire();
    api.fireMutate("user");
    api.fireLayoutChange();
    scheduler.flush();
    api.fireMutate("api");
    api.fireLayoutChange();
    scheduler.flush();
    assert.deepEqual(settled.slice(-2), [
      { source: "layout", origin: "user" },
      { source: "layout", origin: "api" },
    ]);
  });

  it("§2.3: a layout change with no net since the last flush persists but emits nothing", () => {
    const { api, scheduler, settled, log } = wire();
    api.fireLayoutChange(); // no fireMutate — e.g. a constraint-driven re-fit
    const before = log.filter((n) => n === "saveHeights").length;
    scheduler.flush();
    assert.equal(
      log.filter((n) => n === "saveHeights").length - before,
      1,
      "pass persisted",
    );
    assert.deepEqual(settled, [{ source: "layout", origin: "api" }], "still only the init event");
  });
});

describe("pinHeights wiring: A8 rebuild + dispose", () => {
  it("A8: the pass rebuilds the map from live members — stale ids drop out", () => {
    const stored = JSON.stringify({ "gone-1": 244, "gone-2": 132 });
    const { api, scheduler, storage, handle } = wire({
      seed: new Map([[KEYS.heights, stored]]),
    });
    api.fireMutate("user");
    api.fireLayoutChange();
    scheduler.flush();
    assert.deepEqual(handle.heights(), {}, "ids with no live member are dropped");
    assert.equal(storage.getItem(KEYS.heights), "{}");
  });

  it("HP6: dispose cancels the pending pass and stops all saves/emissions", () => {
    const { api, scheduler, log, settled, handle } = wire();
    api.fireMutate("user");
    api.fireLayoutChange();
    handle.dispose();
    assert.equal(scheduler.pending, 0, "pending pass cancelled");
    const savesBefore = log.filter((n) => n.startsWith("save")).length;
    const settledBefore = settled.length;
    scheduler.flush();
    api.fireMutate("user");
    api.fireLayoutChange();
    scheduler.flush();
    handle.commitHeights({ g1: 100 });
    assert.equal(log.filter((n) => n.startsWith("save")).length, savesBefore, "no post-dispose saves");
    assert.equal(settled.length, settledBefore, "no post-dispose emissions");
  });
});

describe("pinHeights: pure preset/floor helpers", () => {
  it("HP1/A5: collectPresetHeights seeds id→size from floatingGroups[].grid.root leaves", () => {
    const layout = {
      ...DEFAULT_LAYOUT,
      floatingGroups: [
        {
          grid: {
            root: {
              type: "branch",
              data: [
                { type: "leaf", data: { id: "group-nav-1", views: ["outline"] }, size: 244 },
                {
                  type: "branch",
                  data: [
                    { type: "leaf", data: { id: "group-nav-2", views: [] }, size: 132 },
                    { type: "leaf", data: { id: "group-nav-3", views: [] }, size: 74 },
                  ],
                  size: 206,
                },
              ],
            },
            width: 252, height: 474, orientation: "VERTICAL",
          },
          position: { left: 18, top: 12, width: 252, height: 450 },
        },
      ],
    };
    assert.deepEqual(collectPresetHeights(layout), {
      "group-nav-1": 244, "group-nav-2": 132, "group-nav-3": 74,
    });
  });

  it("HP1/A5: legacy data-form windows and absent floatingGroups contribute nothing", () => {
    const legacy = { ...DEFAULT_LAYOUT, floatingGroups: [{ data: { id: "solo", views: [] }, position: {} }] };
    assert.deepEqual(collectPresetHeights(legacy), {});
    assert.deepEqual(collectPresetHeights(DEFAULT_LAYOUT), {});
    assert.deepEqual(collectPresetHeights(undefined), {});
  });

  it("§2.5: effectiveFloor — no registry → 36; sub-floor entries → 36; max wins; junk ignored", () => {
    assert.equal(effectiveFloor({}, ["outline", "review"]), 36);
    assert.equal(effectiveFloor({ outline: 10, review: -5 }, ["outline", "review"]), 36);
    assert.equal(effectiveFloor({ outline: 200, review: 120 }, ["outline", "review"]), 200);
    assert.equal(effectiveFloor({ outline: Number.NaN }, ["outline"]), 36);
    assert.equal(effectiveFloor({ outline: 300 }, ["not-registered"]), 36);
  });
});
