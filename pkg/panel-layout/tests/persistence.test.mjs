/**
 * Headless tests for @metanorma/panel-layout — persistence module
 * (docs/behavior.spec.md rows A6/A7/C2/C4/HP8/HP9; api.spec.md §2.6).
 *
 * Run: yarn workspace @metanorma/panel-layout test
 *
 * Storage is injected (LayoutStorage seam), so these run under plain Node.
 * DOM/browser rows of the same module are covered by parity (GREEN 1).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createPersistence,
  DEFAULT_ENVELOPE_KEY,
  diagnoseLayout,
  ENVELOPE_VERSION,
  ENVELOPE_VERSION_REGISTRY,
  SHIPPED_ENVELOPE_VERSIONS,
} from "../compiled/persistence.js";
import { MapStorage } from "./helpers.mjs";
import { STORAGE_KEYS } from "../compiled/tokens.js";

const DEFAULT_LAYOUT = {
  grid: { root: { type: "leaf" }, width: 1200, height: 800, orientation: "HORIZONTAL" },
  panels: { doc: { id: "doc", contentComponent: "document" } },
  activeGroup: "group-doc",
};
const KEYS = { layout: "L", heights: "H" };
const TWO_KEY = { kind: "two-key", keys: KEYS };

/** Collects fallback events (the §2.2 signal seam). */
function events() {
  const log = [];
  return { log, onFallback: (e) => log.push(e) };
}

function make(seed = new Map(), opts = {}) {
  const storage = new MapStorage(seed);
  const persistence = createPersistence({
    defaultLayout: DEFAULT_LAYOUT,
    storage,
    format: TWO_KEY,
    ...opts,
  });
  return { persistence, storage };
}

/** Envelope-mode factory (format omitted → the §2.6 default). */
function envelope(seed = new Map(), opts = {}) {
  const storage = new MapStorage(seed);
  const persistence = createPersistence({
    defaultLayout: DEFAULT_LAYOUT,
    storage,
    ...opts,
  });
  return { persistence, storage };
}

describe("persistence: corrupted storage fallback (two-key)", () => {
  it("A6: unparseable layout JSON → loadLayout() null (caller falls back to default)", () => {
    const { persistence } = make(new Map([[KEYS.layout, "not json"]]));
    assert.equal(persistence.loadLayout(), null);
  });
  it("A6: layout JSON missing `grid` → null (falsy-grid guard)", () => {
    const { persistence } = make(new Map([[KEYS.layout, JSON.stringify({ panels: {} })]]));
    assert.equal(persistence.loadLayout(), null);
  });
  it("A6: layout JSON with falsy `grid` (null/0/\"\") → null (truthiness, not presence)", () => {
    for (const grid of [null, 0, ""]) {
      const { persistence } = make(new Map([
        [KEYS.layout, JSON.stringify({ grid })],
      ]));
      assert.equal(persistence.loadLayout(), null, `grid: ${JSON.stringify(grid)}`);
    }
  });
  it("A7: unparseable heights JSON → loadHeights() {}", () => {
    const { persistence } = make(new Map([[KEYS.heights, "]]nope"]]));
    assert.deepEqual(persistence.loadHeights(), {});
  });
  it("A7: heights JSON that parses to a non-object → {}", () => {
    const { persistence } = make(new Map([[KEYS.heights, "[1,2,3]"]]));
    assert.deepEqual(persistence.loadHeights(), {});
  });
  it("A7: heights JSON with non-number values → {} (per-entry number guard)", () => {
    const { persistence } = make(new Map([
      [KEYS.heights, JSON.stringify({ g1: 100, g2: "132" })],
    ]));
    assert.deepEqual(persistence.loadHeights(), {});
  });
});

describe("persistence: §2.6 two-key independence", () => {
  it("§2.6: valid layout + corrupt heights → layout kept, heights default", () => {
    const { persistence } = make(new Map([
      [KEYS.layout, JSON.stringify(DEFAULT_LAYOUT)],
      [KEYS.heights, "corrupt"],
    ]));
    assert.deepEqual(persistence.loadLayout(), DEFAULT_LAYOUT);
    assert.deepEqual(persistence.loadHeights(), {});
  });
  it("§2.6: corrupt layout + valid heights → layout default, heights kept", () => {
    const { persistence } = make(new Map([
      [KEYS.layout, "corrupt"],
      [KEYS.heights, JSON.stringify({ "group-nav-1": 244 })],
    ]));
    assert.equal(persistence.loadLayout(), null);
    assert.deepEqual(persistence.loadHeights(), { "group-nav-1": 244 });
  });
});

describe("persistence: fallback signal (§2.2, two-key loads)", () => {
  it("A6: corrupt layout → onFallback {reason:'layout-corrupt'}", () => {
    const ev = events();
    const { persistence } = make(new Map([[KEYS.layout, "not json"]]), ev);
    persistence.loadLayout();
    assert.equal(ev.log.length, 1);
    assert.equal(ev.log[0].reason, "layout-corrupt");
    assert.ok(typeof ev.log[0].message === "string");
  });
  it("A7: corrupt heights → onFallback {reason:'heights-corrupt'}", () => {
    const ev = events();
    const { persistence } = make(new Map([[KEYS.heights, "]]nope"]]), ev);
    persistence.loadHeights();
    assert.equal(ev.log.length, 1);
    assert.equal(ev.log[0].reason, "heights-corrupt");
  });
  it("A6/A7: absent storage keys → NO fallback events (HP1 first-load silence)", () => {
    const ev = events();
    const { persistence } = make(new Map(), ev);
    persistence.loadLayout();
    persistence.loadHeights();
    assert.deepEqual(ev.log, []);
  });
  it("§2.2: consumer callback throw is swallowed — persistence keeps working", () => {
    const { persistence, storage } = make(new Map([[KEYS.layout, "bad"]]), {
      onFallback: () => { throw new Error("consumer bug"); },
    });
    assert.equal(persistence.loadLayout(), null);
    persistence.saveLayout({ toJSON: () => DEFAULT_LAYOUT });
    assert.ok(storage.getItem(KEYS.layout).includes('"grid"'));
  });
});

describe("persistence: §2.6 envelope format (default)", () => {
  it("§2.6: default format is the envelope under 'mn-panel-layout-v1' — single key, single write", () => {
    const { persistence, storage } = envelope();
    const json = persistence.saveLayout({ toJSON: () => DEFAULT_LAYOUT });
    assert.equal(storage.map.size, 1);
    assert.ok(storage.map.has(DEFAULT_ENVELOPE_KEY));
    const state = JSON.parse(storage.getItem(DEFAULT_ENVELOPE_KEY));
    assert.equal(state.version, ENVELOPE_VERSION);
    assert.deepEqual(state.layout, DEFAULT_LAYOUT);
    assert.deepEqual(state.heights, {});
    assert.deepEqual(json, DEFAULT_LAYOUT); // write landed → layout returned
  });
  it("§2.6/HP8: saveLayout+saveHeights → one PersistedState; loads restore both halves", () => {
    const { persistence, storage } = envelope();
    persistence.saveLayout({ toJSON: () => DEFAULT_LAYOUT });
    persistence.saveHeights({ "group-nav-1": 244 });
    assert.equal(storage.map.size, 1);
    const state = JSON.parse(storage.getItem(DEFAULT_ENVELOPE_KEY));
    assert.deepEqual(state, {
      version: 1, layout: DEFAULT_LAYOUT, heights: { "group-nav-1": 244 },
    });
    assert.deepEqual(persistence.loadLayout(), DEFAULT_LAYOUT);
    assert.deepEqual(persistence.loadHeights(), { "group-nav-1": 244 });
  });
  it("§2.6: saveHeights before any save/write pairs heights with defaultLayout half", () => {
    const { persistence, storage } = envelope();
    persistence.saveHeights({ g1: 100 });
    const state = JSON.parse(storage.getItem(DEFAULT_ENVELOPE_KEY));
    assert.deepEqual(state, {
      version: 1, layout: DEFAULT_LAYOUT, heights: { g1: 100 },
    });
  });
  it("§2.6: version mismatch → whole-envelope fallback (null layout, {} heights, both signals)", () => {
    const ev = events();
    const { persistence } = envelope(new Map([
      [DEFAULT_ENVELOPE_KEY, JSON.stringify({
        version: 2, layout: DEFAULT_LAYOUT, heights: { g1: 100 },
      })],
    ]), ev);
    assert.equal(persistence.loadLayout(), null);
    assert.deepEqual(persistence.loadHeights(), {});
    assert.deepEqual(ev.log.map((e) => e.reason),
      ["layout-corrupt", "heights-corrupt"]);
  });
  it("§2.6: unparseable envelope → both halves fall back, both signals", () => {
    const ev = events();
    const { persistence } = envelope(new Map([
      [DEFAULT_ENVELOPE_KEY, "not json"],
    ]), ev);
    assert.equal(persistence.loadLayout(), null);
    assert.deepEqual(persistence.loadHeights(), {});
    assert.deepEqual(ev.log.map((e) => e.reason),
      ["layout-corrupt", "heights-corrupt"]);
  });
  it("§2.6: corrupt layout half only → layout null (+signal), heights half still loads", () => {
    const ev = events();
    const { persistence } = envelope(new Map([
      [DEFAULT_ENVELOPE_KEY, JSON.stringify({
        version: 1, layout: { panels: {} }, heights: { g1: 100 },
      })],
    ]), ev);
    assert.equal(persistence.loadLayout(), null);
    assert.deepEqual(persistence.loadHeights(), { g1: 100 });
    assert.deepEqual(ev.log.map((e) => e.reason), ["layout-corrupt"]);
  });
  it("§2.6: corrupt heights half only → layout kept, heights {} (+signal)", () => {
    const ev = events();
    const { persistence } = envelope(new Map([
      [DEFAULT_ENVELOPE_KEY, JSON.stringify({
        version: 1, layout: DEFAULT_LAYOUT, heights: [1, 2, 3],
      })],
    ]), ev);
    assert.deepEqual(persistence.loadLayout(), DEFAULT_LAYOUT);
    assert.deepEqual(persistence.loadHeights(), {});
    assert.deepEqual(ev.log.map((e) => e.reason), ["heights-corrupt"]);
  });
  it("§2.6/HP1: absent envelope key → null/{} with zero fallback events", () => {
    const ev = events();
    const { persistence } = envelope(new Map(), ev);
    assert.equal(persistence.loadLayout(), null);
    assert.deepEqual(persistence.loadHeights(), {});
    assert.deepEqual(ev.log, []);
  });
  it("HP9: envelope clear() removes the single key and resets heights memory", () => {
    const { persistence, storage } = envelope();
    persistence.saveLayout({ toJSON: () => DEFAULT_LAYOUT });
    persistence.saveHeights({ g1: 100 });
    persistence.clear();
    assert.equal(storage.map.size, 0);
  });
});

describe("persistence: storage failures (C2/C4)", () => {
  it("C2: throwing getItem (quota/private mode) → null/{} reads, session continues", () => {
    const throwing = {
      getItem: () => { throw new Error("quota"); },
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("quota"); },
    };
    const persistence = createPersistence({
      defaultLayout: DEFAULT_LAYOUT, storage: throwing, format: TWO_KEY,
    });
    assert.equal(persistence.loadLayout(), null);
    assert.deepEqual(persistence.loadHeights(), {});
    // Writes are swallowed too — no throw escapes the persistence seam.
    persistence.saveLayout({ toJSON: () => DEFAULT_LAYOUT });
    persistence.saveHeights({ g1: 100 });
    persistence.clear();
  });
  it("C2: first write failure → 'storage-unavailable' exactly once; second failure silent", () => {
    const ev = events();
    let fail = true;
    const flaky = {
      getItem: () => null,
      setItem: () => { if (fail) throw new Error("quota exceeded"); },
      removeItem: () => { if (fail) throw new Error("quota exceeded"); },
    };
    const persistence = createPersistence({
      defaultLayout: DEFAULT_LAYOUT, storage: flaky, format: TWO_KEY,
      onFallback: ev.onFallback,
    });
    persistence.saveLayout({ toJSON: () => DEFAULT_LAYOUT });
    persistence.saveHeights({ g1: 100 });
    persistence.clear();
    assert.equal(ev.log.length, 1);
    assert.equal(ev.log[0].reason, "storage-unavailable");
    assert.match(ev.log[0].message, /quota exceeded/);

    fail = false; // storage recovers — no second signal, writes land
    assert.ok(persistence.saveLayout({ toJSON: () => DEFAULT_LAYOUT }));
    persistence.saveHeights({ g2: 50 });
    assert.equal(ev.log.length, 1);
  });
  it("C2: throwing reads alone emit nothing — the signal is write-triggered", () => {
    const ev = events();
    const throwing = {
      getItem: () => { throw new Error("quota"); },
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("quota"); },
    };
    const persistence = createPersistence({
      defaultLayout: DEFAULT_LAYOUT, storage: throwing, format: TWO_KEY,
      onFallback: ev.onFallback,
    });
    persistence.loadLayout();
    persistence.loadHeights();
    assert.deepEqual(ev.log, []);
  });
  it("C4: toJSON failure → saveLayout() null, stale layout stays in storage", () => {
    const { persistence, storage } = make(new Map([[KEYS.layout, JSON.stringify(DEFAULT_LAYOUT)]]));
    const brokenApi = { toJSON: () => { throw new Error("structure"); } };
    assert.equal(persistence.saveLayout(brokenApi), null);
    assert.equal(storage.getItem(KEYS.layout), JSON.stringify(DEFAULT_LAYOUT));
  });
  it("C4: toJSON failure emits NO storage-unavailable (serialization ≠ storage)", () => {
    const ev = events();
    const { persistence } = make(new Map(), ev);
    const brokenApi = { toJSON: () => { throw new Error("structure"); } };
    assert.equal(persistence.saveLayout(brokenApi), null);
    assert.deepEqual(ev.log, []);
  });
  it("C2: two-key saveLayout write failure → null return + once-signal", () => {
    const ev = events();
    const storage = new MapStorage();
    storage.setItem = () => { throw new Error("private mode"); };
    const persistence = createPersistence({
      defaultLayout: DEFAULT_LAYOUT, storage, format: TWO_KEY,
      onFallback: ev.onFallback,
    });
    assert.equal(persistence.saveLayout({ toJSON: () => DEFAULT_LAYOUT }), null);
    assert.equal(ev.log.length, 1);
    assert.equal(ev.log[0].reason, "storage-unavailable");
  });
});

describe("persistence: round-trip and restore (two-key)", () => {
  it("HP8: save → load round-trips the serialized layout and heights", () => {
    const { persistence } = make();
    persistence.saveLayout({ toJSON: () => DEFAULT_LAYOUT });
    persistence.saveHeights({ "group-nav-1": 244, "group-nav-2": 132 });
    assert.deepEqual(persistence.loadLayout(), DEFAULT_LAYOUT);
    assert.deepEqual(persistence.loadHeights(), { "group-nav-1": 244, "group-nav-2": 132 });
  });
  it("HP8: absent keys → null layout / {} heights (first-load state)", () => {
    const { persistence } = make();
    assert.equal(persistence.loadLayout(), null);
    assert.deepEqual(persistence.loadHeights(), {});
  });
  it("HP9: clear() removes both keys atomically", () => {
    const { persistence, storage } = make();
    persistence.saveLayout({ toJSON: () => DEFAULT_LAYOUT });
    persistence.saveHeights({ g1: 100 });
    persistence.clear();
    assert.equal(storage.getItem(KEYS.layout), null);
    assert.equal(storage.getItem(KEYS.heights), null);
    assert.equal(storage.map.size, 0);
  });
  it("HP9/§4: two-key with STORAGE_KEYS pins the mock's exact key strings (both directions)", () => {
    const storage = new MapStorage();
    const persistence = createPersistence({
      defaultLayout: DEFAULT_LAYOUT,
      storage,
      format: { kind: "two-key", keys: STORAGE_KEYS },
    });
    // Write direction: the mock's key strings carry each half.
    persistence.saveLayout({ toJSON: () => DEFAULT_LAYOUT });
    persistence.saveHeights({ "group-nav-1": 244 });
    assert.deepEqual([...storage.map.keys()].sort(),
      ["mn-dockview7-floats-v1", "mn-dockview7-heights-v1"]);

    // Read direction: a mock-written {"grid": …} payload under the
    // mock's layout key loads as-is (loadLayout returns the parsed
    // object — mock parity :670).
    const mockLike = new Map([
      ["mn-dockview7-floats-v1", JSON.stringify(DEFAULT_LAYOUT)],
      ["mn-dockview7-heights-v1", JSON.stringify({ "group-nav-1": 244 })],
    ]);
    const reader = createPersistence({
      defaultLayout: DEFAULT_LAYOUT,
      storage: new MapStorage(mockLike),
      format: { kind: "two-key", keys: STORAGE_KEYS },
    });
    assert.deepEqual(reader.loadLayout(), DEFAULT_LAYOUT);
    assert.deepEqual(reader.loadHeights(), { "group-nav-1": 244 });
  });
});

describe("persistence: schema decode seam (§2.6 valibot)", () => {
  it("A7: heights 1e999 (parses to Infinity) → {} — finite() is load-bearing", () => {
    const ev = events();
    const { persistence } = make(new Map([[KEYS.heights, '{"g1":1e999}']]), ev);
    assert.deepEqual(persistence.loadHeights(), {});
    assert.equal(ev.log[0].reason, "heights-corrupt");
  });
  // The three proto-family divergences: valibot object schemas skip own
  // __proto__/prototype/constructor keys during VALIDATION (a non-number
  // value under such a key no longer fails the half) while leaving the
  // key in the decoded data. Seeded as RAW JSON strings — JSON.parse
  // creates the own property via DefineOwnProperty; never deepEqual a
  // literal carrying such keys. One test per key: a future filter change
  // in any ONE key trips exactly its own test.
  it("§2.6 divergence: own __proto__ key (non-number value) decodes, no signal", () => {
    const ev = events();
    const { persistence } = make(new Map([[KEYS.heights, '{"g1":5,"__proto__":{}}']]), ev);
    assert.equal(persistence.loadHeights().g1, 5);
    assert.deepEqual(ev.log, []);
  });
  it("§2.6 divergence: own prototype key (non-number value) decodes, no signal", () => {
    const ev = events();
    const { persistence } = make(new Map([[KEYS.heights, '{"g1":5,"prototype":{}}']]), ev);
    assert.equal(persistence.loadHeights().g1, 5);
    assert.deepEqual(ev.log, []);
  });
  it("§2.6 divergence: own constructor key (non-number value) decodes, no signal", () => {
    const ev = events();
    const { persistence } = make(new Map([[KEYS.heights, '{"g1":5,"constructor":"x"}']]), ev);
    assert.equal(persistence.loadHeights().g1, 5);
    assert.deepEqual(ev.log, []);
  });
  it("§2.6: corrupt layout half names its first failing entry — 'corrupted layout JSON (grid)'", () => {
    const ev = events();
    const { persistence } = make(new Map([[KEYS.layout, JSON.stringify({ panels: {} })]]), ev);
    persistence.loadLayout();
    assert.equal(ev.log[0].reason, "layout-corrupt");
    assert.equal(ev.log[0].message, "corrupted layout JSON (grid)");
  });
  it("§2.6: corrupt heights half names its first offending key — 'corrupted heights JSON (g2)'", () => {
    const ev = events();
    const { persistence } = make(
      new Map([[KEYS.heights, JSON.stringify({ g1: 100, g2: "132" })]]), ev);
    persistence.loadHeights();
    assert.equal(ev.log[0].reason, "heights-corrupt");
    assert.equal(ev.log[0].message, "corrupted heights JSON (g2)");
  });
  it("§2.6: unparseable half carries no dot path — plain message form", () => {
    const ev = events();
    const { persistence } = make(new Map([[KEYS.heights, "]]nope"]]), ev);
    persistence.loadHeights();
    assert.equal(ev.log[0].message, "corrupted heights JSON");
  });
});

describe("persistence: §2.6 envelope version registry", () => {
  it("§2.6 registry: every entry's version is shipped; a probe envelope per entry decodes", () => {
    assert.ok(ENVELOPE_VERSION_REGISTRY.length > 0);
    for (const entry of ENVELOPE_VERSION_REGISTRY) {
      assert.ok(SHIPPED_ENVELOPE_VERSIONS.includes(entry.version),
        `registry version ${entry.version} missing from SHIPPED_ENVELOPE_VERSIONS`);
      const { persistence } = envelope(new Map([[DEFAULT_ENVELOPE_KEY, JSON.stringify({
        version: entry.version, layout: DEFAULT_LAYOUT, heights: { g1: 100 },
      })]]));
      assert.deepEqual(persistence.loadLayout(), DEFAULT_LAYOUT);
      assert.deepEqual(persistence.loadHeights(), { g1: 100 });
    }
  });
  it("§2.6 registry: chain identity — a current-shape golden decodes both halves as written", () => {
    const { persistence } = envelope(new Map([[DEFAULT_ENVELOPE_KEY, JSON.stringify({
      version: ENVELOPE_VERSION, layout: DEFAULT_LAYOUT, heights: { g1: 7 },
    })]]));
    assert.deepEqual(persistence.loadLayout(), DEFAULT_LAYOUT);
    assert.deepEqual(persistence.loadHeights(), { g1: 7 });
  });
  it("§2.6: unmatched version (2 > shipped 1) → whole-envelope fallback, both signals in order, newer-version messages", () => {
    const ev = events();
    const { persistence } = envelope(new Map([[DEFAULT_ENVELOPE_KEY, JSON.stringify({
      version: 2, layout: DEFAULT_LAYOUT, heights: { g1: 100 },
    })]]), ev);
    assert.equal(persistence.loadLayout(), null);
    assert.deepEqual(persistence.loadHeights(), {});
    assert.deepEqual(ev.log.map((e) => e.reason),
      ["layout-corrupt", "heights-corrupt"]);
    assert.deepEqual(ev.log.map((e) => e.message),
      ["layout saved by a newer version", "layout saved by a newer version"]);
  });
  it("§2.6 claim-but-fail: version 1 + corrupt layout half only → heights still decodes (registry gate certifies the version ONLY)", () => {
    const ev = events();
    const { persistence } = envelope(new Map([[DEFAULT_ENVELOPE_KEY, JSON.stringify({
      version: 1, layout: { panels: {} }, heights: { g1: 100 },
    })]]), ev);
    assert.equal(persistence.loadLayout(), null);
    assert.deepEqual(persistence.loadHeights(), { g1: 100 });
    assert.deepEqual(ev.log.map((e) => e.reason), ["layout-corrupt"]);
    assert.equal(ev.log[0].message, "corrupted layout JSON (grid)");
  });
});

describe("persistence: diagnoseLayout (§2.6 consumer preset certification)", () => {
  it("§2.6: ok on the golden layout — hands back the SAME object (certified, not cloned)", () => {
    const layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
    const d = diagnoseLayout(layout);
    assert.equal(d.ok, true);
    assert.equal(d.layout, layout);
  });
  it("§2.6: missing grid → ok:false naming the grid entry", () => {
    const d = diagnoseLayout({ panels: {} });
    assert.equal(d.ok, false);
    assert.equal(d.message, "layout failed validation (grid)");
  });
  it("§2.6: falsy grid → ok:false; non-object input → plain form; never throws", () => {
    const falsy = diagnoseLayout({ grid: null });
    assert.equal(falsy.ok, false);
    assert.equal(falsy.message, "layout failed validation (grid)");
    for (const bad of [null, undefined, "x", 42]) {
      const d = diagnoseLayout(bad);
      assert.equal(d.ok, false, `input: ${JSON.stringify(bad)}`);
      assert.equal(d.message, "layout failed validation");
    }
    // An array fails via the missing required `grid` entry (looseObject
    // accepts arrays — the documented mechanism), so it NAMES grid.
    const arr = diagnoseLayout([1, 2]);
    assert.equal(arr.ok, false);
    assert.equal(arr.message, "layout failed validation (grid)");
  });
});
