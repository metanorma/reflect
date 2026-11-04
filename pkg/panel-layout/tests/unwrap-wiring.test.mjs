/**
 * Headless tests for @metanorma/panel-layout — the useDropRules wiring
 * (api.spec.md §3 module 4): the registration pattern the mock's onReady
 * establishes (claim + veto backstop on onWillDrop, suppression toggle +
 * veto preventDefaults on onWillShowOverlay, the groupDragLive latch on
 * onWillDragGroup) and the retireFirst seam module 5's gate calls.
 *
 * Run: yarn workspace @metanorma/panel-layout test
 *
 * BOUNDARY (explicit decision, `wiring-Node` per D9): the wiring is
 * tested through injected seams only — the api's three subscriptions
 * (captured, then fired by hand) and a classList-recording area stand-in.
 * NO DOM hit-testing is faked: events fire with nativeEvent null so the
 * claim path and overlayClaimActive decline by their own guards, which is
 * exactly what these tests assert (registration, dispatch, veto wiring,
 * toggle plumbing, latch discipline, dispose). The elementFromPoint half
 * of the claim (overGridSurface) and unwrap sizing stay parity (GREEN 1)
 * until the synthetic layer.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { useDropRules } from "../compiled/unwrap.js";

/**
 * Emitter-backed api fake: the three subscriptions useDropRules makes are
 * captured and fired by hand; onWillDrop/onWillShowOverlay relay their
 * argument untouched. `id` is the viewId seam (DockviewApi.id →
 * component.id — the mock's comp.id).
 */
function fakeApi({ id = "v-test", getGroup, getPanel } = {}) {
  const subs = { willDrop: [], willShowOverlay: [], willDragGroup: [] };
  const reg = (key) => (fn) => {
    subs[key].push(fn);
    return {
      dispose: () => {
        subs[key] = subs[key].filter((f) => f !== fn);
      },
    };
  };
  return {
    id,
    groups: [],
    getGroup: getGroup ?? (() => undefined),
    getPanel: getPanel ?? (() => undefined),
    addFloatingGroup: () => {},
    onWillDrop: reg("willDrop"),
    onWillShowOverlay: reg("willShowOverlay"),
    onWillDragGroup: reg("willDragGroup"),
    fireWillDrop: (ev) => [...subs.willDrop].forEach((f) => f(ev)),
    fireWillShowOverlay: (ev) => [...subs.willShowOverlay].forEach((f) => f(ev)),
    fireWillDragGroup: (ev) => [...subs.willDragGroup].forEach((f) => f(ev)),
    subscriberCounts: () => ({
      willDrop: subs.willDrop.length,
      willShowOverlay: subs.willShowOverlay.length,
      willDragGroup: subs.willDragGroup.length,
    }),
  };
}

/** classList-recording area stand-in — the ONLY DOM-ish seam touched. */
function fakeArea() {
  const toggles = [];
  return {
    toggles,
    classList: {
      toggle(cls, on) {
        toggles.push([cls, on]);
      },
    },
  };
}

/** Drop-event fake (DropEventLike seam — see helpers.mjs for the shape). */
function ev(over = {}) {
  const data = { panelId: over.panelId ?? null, groupId: over.groupId, viewId: over.viewId ?? "v-test" };
  const e = {
    kind: over.kind ?? "content",
    position: over.position ?? "center",
    nativeEvent: null,
    defaultPrevented: false,
    group: over.group !== undefined ? over.group : {
      api: { location: { type: over.groupLocation ?? "floating" } },
    },
    getData: () => data,
    preventDefault() {
      e.defaultPrevented = true;
    },
  };
  return e;
}

function wire(opts = {}) {
  const api = fakeApi(opts.api);
  const area = fakeArea();
  const rules = useDropRules({
    api,
    layoutArea: () => area,
    ...opts.options,
  });
  return { api, area, rules };
}

describe("unwrap wiring: registration pattern (HP2 — mock :1343/:1460/:1026)", () => {
  it("HP2: registers exactly one handler on each engine emitter; dispose unwires all three", () => {
    const { api, rules } = wire();
    assert.deepEqual(api.subscriberCounts(), {
      willDrop: 1,
      willShowOverlay: 1,
      willDragGroup: 1,
    });
    rules.dispose();
    assert.deepEqual(api.subscriberCounts(), {
      willDrop: 0,
      willShowOverlay: 0,
      willDragGroup: 0,
    });
    // dispose is idempotent — the unsubscriber array was consumed
    rules.dispose();
    assert.deepEqual(api.subscriberCounts(), {
      willDrop: 0,
      willShowOverlay: 0,
      willDragGroup: 0,
    });
  });

  it("HP2: the registered onWillDrop applies the veto backstop (declined claim falls through)", () => {
    const { api } = wire();
    const e = ev({ position: "left", panelId: "outline", groupLocation: "floating" });
    api.fireWillDrop(e);
    assert.equal(e.defaultPrevented, true, "panel edge drop on a float window preventDefaulted");
  });

  it("HP2: after dispose, a veto event is no longer prevented", () => {
    const { api, rules } = wire();
    rules.dispose();
    const e = ev({ position: "left", panelId: "outline", groupLocation: "floating" });
    api.fireWillDrop(e);
    assert.equal(e.defaultPrevented, false);
  });
});

describe("unwrap wiring: onWillShowOverlay (F5 — mock :1460–1478)", () => {
  it("F5: the mn-unwrap-hover toggle records the claimed state (unclaimed here → false)", () => {
    const { api, area } = wire();
    // nativeEvent null → overlayClaimActive declines → toggle(false)
    api.fireWillShowOverlay(ev({ position: "left", panelId: "outline" }));
    assert.deepEqual(area.toggles, [["mn-unwrap-hover", false]]);
  });

  it("F5: a null layout area skips the toggle but still applies the veto preventDefaults", () => {
    const api = fakeApi();
    const rules = useDropRules({ api, layoutArea: () => null });
    const e = ev({ position: "left", panelId: "outline", groupLocation: "floating" });
    api.fireWillShowOverlay(e);
    assert.equal(e.defaultPrevented, true, "veto still applied with no area");
  });

  it("F3: the float-exclusion veto fires through the overlay wiring (excluded panel, float target)", () => {
    const { api } = wire({ options: { floatExcludedPanelIds: new Set(["doc"]) } });
    const e = ev({ kind: "content", position: "center", panelId: "doc", groupLocation: "floating" });
    api.fireWillShowOverlay(e);
    assert.equal(e.defaultPrevented, true);
  });
});

describe("unwrap wiring: option seams (HP7/F3/§2.5)", () => {
  it("HP7: autoWrap as a VALUE and as a GETTER produce identical veto outcomes", () => {
    const panelEdge = (rulesApi) => {
      const e = ev({ kind: "content", position: "left", panelId: "outline", groupLocation: "floating" });
      rulesApi.fireWillDrop(e);
      return e.defaultPrevented;
    };
    const byValue = wire({ options: { autoWrap: false } });
    let flag = false;
    const byGetter = wire({ options: { autoWrap: () => flag } });
    // toggle OFF mid-flight — the getter seam stays live without rewiring
    assert.equal(panelEdge(byValue.api), true, "OFF: T4 veto still applies");
    flag = false;
    assert.equal(panelEdge(byGetter.api), true, "OFF via getter: same veto");
    flag = true;
    assert.equal(panelEdge(byGetter.api), true, "ON via getter: same veto (claim declines, backstop vetoes)");
  });

  it("F3: floatExcludedPanelIds accepts a set AND a getter (registry re-derivation seam)", () => {
    let set = new Set(["doc"]);
    const { api } = wire({ options: { floatExcludedPanelIds: () => set } });
    const e1 = ev({ kind: "content", position: "center", panelId: "doc", groupLocation: "floating" });
    api.fireWillDrop(e1);
    assert.equal(e1.defaultPrevented, true, "doc excluded at event time");
    set = new Set(); // registry changes — no rewiring
    const e2 = ev({ kind: "content", position: "center", panelId: "doc", groupLocation: "floating" });
    api.fireWillDrop(e2);
    assert.equal(e2.defaultPrevented, false, "doc allowed after the set changed");
  });

  it("HP2: the viewId seam is the api's own id — foreign-viewId drags are never claimed or vetoed", () => {
    const { api } = wire();
    const e = ev({ kind: "content", position: "left", panelId: "outline", groupLocation: "floating", viewId: "v-foreign" });
    api.fireWillDrop(e);
    assert.equal(e.defaultPrevented, false);
  });
});

describe("unwrap wiring: groupDragLive latch + retireFirst (HP4 — mock :1026–1038/:1079)", () => {
  it("HP4: onWillDragGroup latches only FLOATING groups (T6: titlebar sources are disabled; void-container only)", () => {
    const { api, rules } = wire();
    api.fireWillDragGroup({ group: { id: "g-f", element: {}, api: { location: { type: "floating" } } } });
    assert.equal(rules.groupDragLive.group?.id, "g-f");
    api.fireWillDragGroup({ group: { id: "g-grid", element: {}, api: { location: { type: "grid" } } } });
    assert.equal(rules.groupDragLive.group?.id, "g-grid" === rules.groupDragLive.group?.id ? rules.groupDragLive.group.id : rules.groupDragLive.group?.id);
    // ^ grid groups do NOT latch: the wiring returns early, leaving the
    //   previous latch state untouched is NOT the behavior — assert it:
    assert.notEqual(rules.groupDragLive.group?.id, "g-grid", "grid group never latches");
  });

  it("HP4: retireFirst with an idle latch is a no-op (mock :1079 guard travels with the provider)", () => {
    const { rules } = wire();
    rules.retireFirst({ button: 0, clientX: 1, clientY: 2 });
    assert.equal(rules.groupDragLive.group, null);
  });

  it("HP4: retireFirst consumes a latched drag — the latch is cleared even when the fallback declines", () => {
    const api = fakeApi(); // getGroup → undefined → identity guard declines
    const area = fakeArea();
    const rules = useDropRules({ api, layoutArea: () => area });
    api.fireWillDragGroup({ group: { id: "g-f", element: {}, api: { location: { type: "floating" } } }, nativeEvent: {} });
    assert.ok(rules.groupDragLive.group, "latched at arm");
    rules.retireFirst({ button: 0, clientX: 5, clientY: 6 });
    assert.equal(rules.groupDragLive.group, null, "consumed");
  });

  it("HP4: the bound onWillDrop/onWillShowOverlay/onWillDragGroup on the handle ARE the registered handlers", () => {
    const { api, rules } = wire();
    // The handle exposes the same function objects the emitters hold, so
    // module 1 (and these tests) fire either path interchangeably.
    const e1 = ev({ position: "left", panelId: "outline", groupLocation: "floating" });
    rules.onWillDrop(e1);
    assert.equal(e1.defaultPrevented, true);
    const e2 = ev({ position: "left", panelId: "outline" });
    rules.onWillShowOverlay(e2);
    assert.equal(e2.defaultPrevented, true);
    const group = { id: "g-x", element: {}, api: { location: { type: "floating" } } };
    rules.onWillDragGroup({ group });
    assert.equal(rules.groupDragLive.group, group);
  });
});
