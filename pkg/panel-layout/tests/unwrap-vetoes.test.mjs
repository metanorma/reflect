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
 * under plain Node. Those rows are covered by parity (GREEN 1) until the
 * synthetic Playwright project lands.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  panelEdgeDropVeto,
  groupGridDropVeto,
  floatExclusionVeto,
} from "../compiled/unwrap.js";
import { fakeApi, fakeDropEvent, fakeConfig } from "./helpers.mjs";

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

describe("unwrap: groupGridDropVeto (T2 — whole groups never dock into the grid)", () => {
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
  it("HP4: panel drags pass through to T4/T1 (no group veto)", () => {
    assert.equal(groupGridDropVeto(api, fakeDropEvent({ kind: "edge", position: "left", panelId: "outline" }), cfg, null), false);
  });
  it("HP4: foreign viewId group drag is ignored", () => {
    assert.equal(groupGridDropVeto(api, fakeDropEvent({ kind: "edge", position: "center", groupId: "g-src", viewId: "v-foreign" }), cfg, null), false);
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
