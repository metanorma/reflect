/**
 * Headless tests for @metanorma/panel-layout — drop-veto decision tables
 * (docs/behavior.spec.md rows HP3/HP7/F3: merge-as-tabs, edge vetoes,
 * float exclusion), for the branches reachable without a DOM.
 *
 * Run: yarn workspace @metanorma/panel-layout test
 *
 * DEFERRED TO THE SYNTHETIC LAYER, with reason: every branch whose truth
 * depends on overGridSurface/overPasteboard (auto-wrap grid-surface claims,
 * HP2 unwrap sizing, group-drop fallback) reads
 * document.elementFromPoint BEFORE the null-area check, so it cannot run
 * under plain Node. Those rows are covered by parity (GREEN 1); a
 * synthetic follow-up is recorded in coverage-map.md.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleWillDrop,
  maybeUnwrapGroupAtPointer,
  panelEdgeDropVeto,
  groupGridDropVeto,
  floatExclusionVeto,
} from "../compiled/unwrap.js";
import {
  fakeApi,
  fakeConfig,
  fakeDropEvent,
  fakeGroupDragLive,
} from "./helpers.mjs";

const api = fakeApi({
  // group containing an excluded panel, for floatExclusionVeto's group path
  getGroup: (id) => (id === "g-src"
    ? { id, panels: [{ id: "doc" }, { id: "outline" }] }
    : undefined),
});
const cfg = fakeConfig({ floatExcludedPanelIds: new Set(["doc"]) });

describe("unwrap: panelEdgeDropVeto (HP3/HP7 — merge stays, splits vetoed)", () => {
  it("HP3: tab/header_space kinds stay stock (no veto)", () => {
    assert.equal(panelEdgeDropVeto(api, fakeDropEvent({ kind: "tab", position: "left", panelId: "outline" }), cfg, null), false);
    assert.equal(panelEdgeDropVeto(api, fakeDropEvent({ kind: "header_space", position: "right", panelId: "outline" }), cfg, null), false);
  });
  it("HP3: center-position drops merge (no veto)", () => {
    assert.equal(panelEdgeDropVeto(api, fakeDropEvent({ kind: "content", position: "center", panelId: "outline" }), cfg, null), false);
  });
  it("HP3: foreign viewId drag is ignored (no veto)", () => {
    assert.equal(panelEdgeDropVeto(api, fakeDropEvent({ kind: "content", position: "left", panelId: "outline", viewId: "v-foreign" }), cfg, null), false);
  });
  it("HP3: panel edge drop on a float window (content, non-center) is vetoed", () => {
    assert.equal(panelEdgeDropVeto(api, fakeDropEvent({ kind: "content", position: "left", panelId: "outline", groupLocation: "floating" }), cfg, null), true);
    assert.equal(panelEdgeDropVeto(api, fakeDropEvent({ kind: "edge", position: "top", panelId: "outline" }), cfg, null), true);
  });
  it("HP7: group-drag left/right root-band drops are vetoed", () => {
    assert.equal(panelEdgeDropVeto(api, fakeDropEvent({ kind: "edge", position: "left", groupId: "g-src" }), cfg, null), true);
    assert.equal(panelEdgeDropVeto(api, fakeDropEvent({ kind: "edge", position: "right", groupId: "g-src" }), cfg, null), true);
  });
  it("HP7: group-drag top/bottom root-band drops pass (vertical stacking)", () => {
    assert.equal(panelEdgeDropVeto(api, fakeDropEvent({ kind: "edge", position: "top", groupId: "g-src" }), cfg, null), false);
    assert.equal(panelEdgeDropVeto(api, fakeDropEvent({ kind: "edge", position: "bottom", groupId: "g-src" }), cfg, null), false);
  });
});

describe("unwrap: floatExclusionVeto (F3 — doc never enters a float window)", () => {
  it("F3: excluded panel dropped on a float window is vetoed", () => {
    assert.equal(floatExclusionVeto(api, fakeDropEvent({ kind: "content", position: "center", panelId: "doc", groupLocation: "floating" }), cfg), true);
  });
  it("F3: group containing an excluded panel (via api.getGroup) is vetoed", () => {
    assert.equal(floatExclusionVeto(api, fakeDropEvent({ kind: "content", position: "center", groupId: "g-src", groupLocation: "floating" }), cfg), true);
  });
  it("F3: non-excluded panel on a float window passes", () => {
    assert.equal(floatExclusionVeto(api, fakeDropEvent({ kind: "content", position: "center", panelId: "outline", groupLocation: "floating" }), cfg), false);
  });
  it("F3: grid-target drops are not this veto's business", () => {
    assert.equal(floatExclusionVeto(api, fakeDropEvent({ kind: "content", position: "center", panelId: "doc", groupLocation: "grid" }), cfg), false);
  });
});

describe("unwrap: groupGridDropVeto (whole groups never dock into the grid)", () => {
  it("HP4: group edge-band drop is vetoed", () => {
    assert.equal(groupGridDropVeto(api, fakeDropEvent({ kind: "edge", position: "center", groupId: "g-src" }), cfg, null), true);
  });
  it("HP4: group content drop targeting a grid group is vetoed", () => {
    assert.equal(groupGridDropVeto(api, fakeDropEvent({ kind: "content", position: "center", groupId: "g-src", groupLocation: "grid" }), cfg, null), true);
  });
  it("HP4: group content drop with NO target group resolves as grid → vetoed", () => {
    const ev = fakeDropEvent({ kind: "content", position: "center", groupId: "g-src" });
    ev.group = null;
    assert.equal(groupGridDropVeto(api, ev, cfg, null), true);
  });
  it("HP4: group tab/header_space drop targeting a grid group is vetoed", () => {
    assert.equal(groupGridDropVeto(api, fakeDropEvent({ kind: "tab", position: "center", groupId: "g-src", groupLocation: "grid" }), cfg, null), true);
  });
  it("HP4: panel drags pass through to the panel rules (no group veto)", () => {
    assert.equal(groupGridDropVeto(api, fakeDropEvent({ kind: "edge", position: "left", panelId: "outline" }), cfg, null), false);
  });
  it("HP4: foreign viewId group drag is ignored", () => {
    assert.equal(groupGridDropVeto(api, fakeDropEvent({ kind: "edge", position: "center", groupId: "g-src", viewId: "v-foreign" }), cfg, null), false);
  });
});

describe("unwrap: panelEdgeDropVeto group branch (HP2/HP4 — the grid-target exemption)", () => {
  it("HP2: group content drop on a GRID target is exempt at ANY position — claim territory (left/right not vetoed)", () => {
    // Without the exemption a group drag on the doc grid's outer 20% bands
    // (the bibdata strip etc., which resolve to edge zones) would be vetoed
    // at the onWillShowOverlay stage, killing the latched drop state and
    // with it the HP2 grid-surface unwrap claim.
    assert.equal(panelEdgeDropVeto(api, fakeDropEvent({ kind: "content", position: "left", groupId: "g-src", groupLocation: "grid" }), cfg, null), false);
    assert.equal(panelEdgeDropVeto(api, fakeDropEvent({ kind: "content", position: "right", groupId: "g-src", groupLocation: "grid" }), cfg, null), false);
    assert.equal(panelEdgeDropVeto(api, fakeDropEvent({ kind: "content", position: "top", groupId: "g-src", groupLocation: "grid" }), cfg, null), false);
  });

  it("HP4: group content drop on a FLOAT target — left/right side-splits vetoed, top/bottom stacking stays stock", () => {
    assert.equal(panelEdgeDropVeto(api, fakeDropEvent({ kind: "content", position: "left", groupId: "g-src", groupLocation: "floating" }), cfg, null), true);
    assert.equal(panelEdgeDropVeto(api, fakeDropEvent({ kind: "content", position: "right", groupId: "g-src", groupLocation: "floating" }), cfg, null), true);
    assert.equal(panelEdgeDropVeto(api, fakeDropEvent({ kind: "content", position: "top", groupId: "g-src", groupLocation: "floating" }), cfg, null), false);
    assert.equal(panelEdgeDropVeto(api, fakeDropEvent({ kind: "content", position: "bottom", groupId: "g-src", groupLocation: "floating" }), cfg, null), false);
  });
});

describe("unwrap: handleWillDrop claim/veto composition (HP2/HP7 — the two-listener composition)", () => {
  it("HP7: autoWrap OFF runs the veto backstop — a vetoed drop is preventDefaulted and reported handled", () => {
    const ev = fakeDropEvent({ kind: "content", position: "left", panelId: "outline", groupLocation: "floating" });
    assert.equal(handleWillDrop(api, ev, fakeConfig({ autoWrap: false, floatExcludedPanelIds: new Set(["doc"]) })), true);
    assert.equal(ev.defaultPrevented, true);
  });

  it("HP2: autoWrap ON with a DECLINED claim falls through to the veto backstop (mock's two-listener semantics)", () => {
    // No nativeEvent → the claim's hit-test declines; the mock's second
    // onWillDrop listener still ran its vetoes. Regression pin for D-a:
    // the pre-fix port returned early and never vetoed here.
    const cfgOn = fakeConfig({ floatExcludedPanelIds: new Set(["doc"]) });
    const ev = fakeDropEvent({ kind: "content", position: "left", panelId: "outline", groupLocation: "floating" });
    assert.equal(handleWillDrop(api, ev, cfgOn), true);
    assert.equal(ev.defaultPrevented, true);
  });

  it("HP2: a foreign-viewId drag is untouched — no claim, no veto, no preventDefault", () => {
    const ev = fakeDropEvent({ kind: "content", position: "center", panelId: "outline", viewId: "v-foreign" });
    assert.equal(handleWillDrop(api, ev, cfg), false);
    assert.equal(ev.defaultPrevented, false);
  });
});

describe("unwrap: maybeUnwrapGroupAtPointer guards (HP4 — dead-zone fallback)", () => {
  it("HP4: the latch is CLEARED at entry even when the fallback declines (the mock's clear-at-entry order)", () => {
    const group = { id: "g-src", element: {}, api: { location: { type: "floating" } } };
    const live = fakeGroupDragLive({ group, ownerEl: {} });
    const out = maybeUnwrapGroupAtPointer(api, { button: 1, clientX: 10, clientY: 20 }, live, cfg);
    assert.equal(out, false, "non-primary button declines");
    assert.equal(live.group, null, "latch cleared before the guards ran");
    assert.equal(live.ownerGridviewEl, null);
  });

  it("HP4: autoWrap OFF declines without unwrapping (HP7 — group drops never unwrap with the toggle off)", () => {
    const live = fakeGroupDragLive({ group: { id: "g-src", element: {}, api: { location: { type: "floating" } } } });
    const out = maybeUnwrapGroupAtPointer(api, { button: 0, clientX: 10, clientY: 20 }, live, fakeConfig({ autoWrap: false }));
    assert.equal(out, false);
    assert.equal(live.group, null);
  });

  it("HP4: a relocated group (getGroup mismatch — a stock drop moved it) declines", () => {
    const movedApi = fakeApi({ getGroup: () => ({ id: "other" }) });
    const live = fakeGroupDragLive({ group: { id: "g-src", element: {}, api: { location: { type: "floating" } } } });
    const out = maybeUnwrapGroupAtPointer(movedApi, { button: 0, clientX: 10, clientY: 20 }, live, cfg);
    assert.equal(out, false);
  });

  it("HP4: a group no longer floating (already docked by the stock pipeline) declines", () => {
    const dockedApi = fakeApi({ getGroup: (id) => (id === "g-docked" ? { id } : undefined) });
    const live = fakeGroupDragLive({ group: { id: "g-docked", element: {}, api: { location: { type: "grid" } } } });
    const out = maybeUnwrapGroupAtPointer(dockedApi, { button: 0, clientX: 10, clientY: 20 }, live, cfg);
    assert.equal(out, false);
  });

  it("HP4: an idle latch (no live group drag) declines as a no-op", () => {
    const live = fakeGroupDragLive();
    assert.equal(maybeUnwrapGroupAtPointer(api, { button: 0, clientX: 10, clientY: 20 }, live, cfg), false);
  });
});
