/**
 * Headless tests for @metanorma/panel-layout — the persistence wiring
 * (api.spec.md §2.3 "Persistence timing"): the facade both nets write
 * through, composed exactly as `wirePanelLayout` composes it.
 *
 * Run: yarn workspace @metanorma/panel-layout test
 *
 * THE DEFECT THIS FILE PINS (recorded here; the decisions registry is
 * decommissioned): the wiring once built a SECOND `createPersistence`
 * instance for its synchronous layout net. Two-key writes never read
 * cross-half memory, so parity stayed byte-green — but in ENVELOPE mode
 * (the default format) the two instances interleaved over one key: the
 * sync instance (whose heights memory was never populated) blanked the
 * heights half to `{}` on every layout save, and the pin pass's instance
 * (whose layout memory froze at the HP1 init write) regressed the layout
 * half on every heights save. Fixed by routing both nets through the
 * facade's ONE instance (`createWiringPersistence`): `saveLayout` keeps
 * the init-pass-through-once / pass-re-saves-suppressed contract module 3
 * sees; the synchronous net writes via `saveLayoutNow`, sharing the same
 * last-known-good halves.
 *
 * BOUNDARY: the composition is mirrored through the real seams only —
 * `createWiringPersistence` + `wireSettledPinPass` (the component's
 * exact call) over a capture-and-fire fake api, a manual rAF scheduler,
 * and MapStorage. The fake api has ZERO floating groups, so the pin
 * pass's measurement walk is a no-op and its A8 rebuild yields `{}` —
 * asserted as the correct rebuild, distinct from corruption. Geometry
 * rows stay parity/synthetic (wiring-Node per the coverage map).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createWiringPersistence,
  wireSettledPinPass,
} from "../compiled/panelLayout.js";
import { createPersistence, DEFAULT_ENVELOPE_KEY } from "../compiled/persistence.js";
import { MapStorage } from "./helpers.mjs";

const KEYS = { layout: "L", heights: "H" };
const TWO_KEY = { kind: "two-key", keys: KEYS };

const layout = (v) => ({
  grid: { root: { type: "leaf" }, width: 1200, height: 800, orientation: "HORIZONTAL" },
  panels: { v },
  activeGroup: "g",
});
const V0 = layout(0);
const V1 = layout(1);
const V2 = layout(2);
const V3 = layout(3);

/**
 * Capture-and-fire api fake (pinHeights-wiring pattern) with a swappable
 * serialized layout and a toJSON call counter — the counter is how the
 * tests observe save-suppression without any geometry.
 */
function fakeApi(initial) {
  const subs = { layoutChange: [], mutate: [] };
  let current = initial;
  let toJSONCalls = 0;
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
    toJSON() {
      toJSONCalls += 1;
      return current;
    },
    setLayout(next) {
      current = next;
    },
    get toJSONCalls() {
      return toJSONCalls;
    },
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

/** Minimal gate fake: never live (passes always run on change). */
function idleGate() {
  return { isLive: () => false, wire: () => () => {} };
}

/**
 * The wirePanelLayout mirror, in the component's order: facade →
 * loadLayout (the restore's read) → the settled pin pass (whose init
 * saveLayout is HP1's pass-through write) → the synchronous net's
 * subscription. `format` omitted → the §2.6 envelope default.
 */
function wire({ seed = new Map(), format, initial = V1, onFallback } = {}) {
  const api = fakeApi(initial);
  const scheduler = manualScheduler();
  const storage = new MapStorage(seed);
  const facade = createWiringPersistence(
    { defaultLayout: V1, storage, ...(format ? { format } : {}) },
    onFallback,
  );
  const saved = facade.loadLayout();
  const pins = wireSettledPinPass({
    api,
    defaultLayout: V1,
    persistence: facade,
    gate: idleGate(),
    scheduler,
  });
  const unwireSync = api.onDidLayoutChange(() => facade.saveLayoutNow(api));
  return {
    api,
    scheduler,
    storage,
    facade,
    pins,
    saved,
    unwire: () => {
      unwireSync();
      pins.dispose();
    },
  };
}

const envelopeIn = (storage) => JSON.parse(storage.getItem(DEFAULT_ENVELOPE_KEY));

describe("persistence wiring: envelope mode (both halves, one memory)", () => {
  it("HP1: the init write pairs the restored layout with previously-stored heights", () => {
    const stored = JSON.stringify({ version: 1, layout: V0, heights: { g1: 244 } });
    const w = wire({
      seed: new Map([[DEFAULT_ENVELOPE_KEY, stored]]),
      initial: V0,
    });
    assert.deepEqual(w.saved, V0, "loadLayout returned the stored half");
    // The pin pass's init saveLayout passed through once, pairing the
    // engine's layout with the heights memory seeded by the load.
    assert.deepEqual(envelopeIn(w.storage), {
      version: 1, layout: V0, heights: { g1: 244 },
    });
    w.unwire();
  });

  it("envelope: layout change + heights-only commit keep BOTH halves fresh (the dual-instance corruption modes)", () => {
    const w = wire();
    assert.deepEqual(envelopeIn(w.storage), {
      version: 1, layout: V1, heights: {},
    }, "HP1: init writes the layout half, heights still empty");

    w.api.setLayout(V2);
    w.api.fireMutate("user");
    w.api.fireLayoutChange();
    assert.deepEqual(envelopeIn(w.storage), {
      version: 1, layout: V2, heights: {},
    }, "sync write carried the fresh layout; heights never saved yet (HP1)");
    w.scheduler.flush();

    w.pins.commitHeights({ g1: 182, g2: 116 });
    // Corruption mode 1 (the old pin-pass instance): a heights-only save
    // regressed the layout half to its init-frozen copy.
    assert.deepEqual(envelopeIn(w.storage), {
      version: 1, layout: V2, heights: { g1: 182, g2: 116 },
    }, "commit paired the fresh heights with the CURRENT layout");

    w.api.setLayout(V3);
    w.api.fireMutate("user");
    w.api.fireLayoutChange();
    // Corruption mode 2 (the old sync instance): a layout save blanked
    // the heights half to {}.
    assert.deepEqual(envelopeIn(w.storage), {
      version: 1, layout: V3, heights: { g1: 182, g2: 116 },
    }, "layout save kept the committed heights");

    w.scheduler.flush();
    // A8 on the zero-group fake: the pass REBUILDS heights from live
    // members ({} here) — the correct rebuild, not a clobber: the layout
    // half is untouched (suppressed) and the heights half reflects the
    // live map.
    assert.deepEqual(envelopeIn(w.storage), {
      version: 1, layout: V3, heights: {},
    }, "A8 rebuild");
    w.unwire();
  });

  it("envelope: the pass's layout re-save stays suppressed (no toJSON during the pass)", () => {
    const w = wire();
    w.api.setLayout(V2);
    const before = w.api.toJSONCalls;
    w.api.fireLayoutChange();
    assert.equal(w.api.toJSONCalls, before + 1, "the sync net serialized once");
    w.scheduler.flush();
    assert.equal(w.api.toJSONCalls, before + 1, "the pass never re-serialized");
    w.unwire();
  });

  it("envelope: a fresh session decodes both halves after the interleave", () => {
    const w = wire();
    w.api.setLayout(V2);
    w.api.fireMutate("user");
    w.api.fireLayoutChange();
    w.scheduler.flush();
    w.pins.commitHeights({ g1: 182, g2: 116 });
    const reader = createPersistence({ defaultLayout: V1, storage: w.storage });
    assert.deepEqual(reader.loadLayout(), V2, "fresh layout survives reload");
    assert.deepEqual(reader.loadHeights(), { g1: 182, g2: 116 },
      "committed heights survive reload");
    w.unwire();
  });
});

describe("persistence wiring: two-key timing (the synchronous layout-save timing)", () => {
  it("two-key: layout key written synchronously on the change event, heights key absent until the pass", () => {
    const w = wire({ format: TWO_KEY });
    w.api.setLayout(V2);
    w.api.fireMutate("user");
    w.api.fireLayoutChange();
    assert.ok(w.scheduler.pending >= 1, "the pass is scheduled, not run");
    assert.equal(w.storage.getItem(KEYS.layout), JSON.stringify(V2),
      "layout key holds the fresh bytes before the frame");
    assert.equal(w.storage.getItem(KEYS.heights), null,
      "heights key still absent (HP1) until the first pass");
    w.scheduler.flush();
    assert.equal(w.storage.getItem(KEYS.heights), "{}",
      "the pass wrote the A8 zero-group rebuild");
    assert.equal(w.storage.getItem(KEYS.layout), JSON.stringify(V2),
      "the pass left the layout key at the sync write's bytes");
    w.unwire();
  });

  it("two-key: init write once; the debounced pass adds no layout write", () => {
    const w = wire({ format: TWO_KEY });
    assert.equal(w.storage.getItem(KEYS.layout), JSON.stringify(V1),
      "HP1 init write");
    w.api.setLayout(V2);
    w.api.fireLayoutChange();
    const before = w.api.toJSONCalls;
    w.scheduler.flush();
    assert.equal(w.api.toJSONCalls, before,
      "the suppressed pass never serialized a layout");
    assert.equal(w.storage.getItem(KEYS.layout), JSON.stringify(V2),
      "only the sync net wrote the layout key");
    w.unwire();
  });

  it("C2: a sync-net write failure reaches onDidFallback exactly once (the deleted second instance swallowed it)", () => {
    const events = [];
    const backing = new Map();
    let fail = true;
    const storage = {
      getItem: (k) => (backing.has(k) ? backing.get(k) : null),
      setItem: (k, v) => {
        if (fail) throw new Error("quota exceeded");
        backing.set(k, v);
      },
      removeItem: (k) => {
        backing.delete(k);
      },
    };
    const facade = createWiringPersistence(
      { defaultLayout: V1, storage, format: TWO_KEY },
      (e) => events.push(e),
    );
    const api = fakeApi(V1);
    const pins = wireSettledPinPass({
      api,
      defaultLayout: V1,
      persistence: facade,
      gate: idleGate(),
      scheduler: manualScheduler(),
    });
    const unwireSync = api.onDidLayoutChange(() => facade.saveLayoutNow(api));
    assert.equal(events.length, 1, "HP1 init write failure signaled");
    assert.equal(events[0].reason, "storage-unavailable");
    assert.match(events[0].message, /quota exceeded/);

    api.setLayout(V2);
    api.fireMutate("user");
    api.fireLayoutChange(); // the sync write fails again — session-once (C2)
    assert.equal(events.length, 1, "no second signal");

    fail = false; // storage recovers
    api.setLayout(V3);
    api.fireMutate("user");
    api.fireLayoutChange();
    assert.equal(events.length, 1);
    assert.deepEqual(JSON.parse(backing.get(KEYS.layout)), V3,
      "the recovered sync write landed");
    unwireSync();
    pins.dispose();
  });
});
