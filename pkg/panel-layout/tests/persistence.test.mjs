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
import { createPersistence } from "../compiled/persistence.js";
import { MapStorage } from "./helpers.mjs";

const DEFAULT_LAYOUT = {
  grid: { root: { type: "leaf" }, width: 1200, height: 800, orientation: "HORIZONTAL" },
  panels: { doc: { id: "doc", contentComponent: "document" } },
  activeGroup: "group-doc",
};
const KEYS = { layout: "L", heights: "H" };

function make(seed = new Map()) {
  const storage = new MapStorage(seed);
  const persistence = createPersistence({
    defaultLayout: DEFAULT_LAYOUT,
    storage,
    keys: KEYS,
  });
  return { persistence, storage };
}

describe("persistence: corrupted storage fallback", () => {
  it("A6: unparseable layout JSON → loadLayout() null (caller falls back to default)", () => {
    const { persistence } = make(new Map([[KEYS.layout, "not json"]]));
    assert.equal(persistence.loadLayout(), null);
  });
  it("A6: layout JSON missing `grid` → null (falsy-grid guard)", () => {
    const { persistence } = make(new Map([[KEYS.layout, JSON.stringify({ panels: {} })]]));
    assert.equal(persistence.loadLayout(), null);
  });
  it("A7: unparseable heights JSON → loadHeights() {}", () => {
    const { persistence } = make(new Map([[KEYS.heights, "]]nope"]]));
    assert.deepEqual(persistence.loadHeights(), {});
  });
  it("A7: heights JSON that parses to a non-object → {}", () => {
    const { persistence } = make(new Map([[KEYS.heights, "[1,2,3]"]]));
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

describe("persistence: storage failures", () => {
  it("C2: throwing getItem (quota/private mode) → null/{} reads, session continues", () => {
    const throwing = {
      getItem: () => { throw new Error("quota"); },
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("quota"); },
    };
    const persistence = createPersistence({
      defaultLayout: DEFAULT_LAYOUT, storage: throwing, keys: KEYS,
    });
    assert.equal(persistence.loadLayout(), null);
    assert.deepEqual(persistence.loadHeights(), {});
    // Writes are swallowed too — no throw escapes the persistence seam.
    persistence.saveLayout({ toJSON: () => DEFAULT_LAYOUT });
    persistence.saveHeights({ g1: 100 });
    persistence.clear();
  });
  it("C4: toJSON failure → saveLayout() null, stale layout stays in storage", () => {
    const { persistence, storage } = make(new Map([[KEYS.layout, JSON.stringify(DEFAULT_LAYOUT)]]));
    const brokenApi = { toJSON: () => { throw new Error("structure"); } };
    assert.equal(persistence.saveLayout(brokenApi), null);
    assert.equal(storage.getItem(KEYS.layout), JSON.stringify(DEFAULT_LAYOUT));
  });
});

describe("persistence: round-trip and restore", () => {
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
  });
});
