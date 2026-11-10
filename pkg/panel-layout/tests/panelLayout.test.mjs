/**
 * Headless tests for @metanorma/panel-layout — the PanelLayout component's
 * pure seams (docs/behavior.spec.md F3, api.spec.md §2.5): the
 * `floatExcludedPanels(registry)` derivation and the `registryMinHeights`
 * view. The composition itself (DockviewReact + the nine wirings) is
 * browser territory: parity (GREEN 1) drives it through the rewired mock,
 * and the synthetic project drives the page-level rows (A4/A6/A7/A8/C3/
 * G5/G6) — nothing here fakes a DOM. The §2.5 LIVE-seam factory
 * (`registrySeams`) is exercised with a mutating registry ref (the
 * component's latest-ref mechanics) and per-event through the
 * `useDropRules` wiring seam (captured subscriptions, inert area —
 * registration/dispatch only, no DOM hit-testing).
 *
 * Run: yarn workspace @metanorma/panel-layout test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  floatExcludedPanels,
  registryMinHeights,
} from "../compiled/panelLayout.js";
import "../compiled/panelErrorBoundary.js"; // .tsx load smoke via the chain
import { registrySeams } from "../compiled/internal.js";
import { useDropRules } from "../compiled/unwrap.js";
import { CONSTANTS } from "../compiled/tokens.js";
import { fakeDropEvent } from "./helpers.mjs";

const panel = (name = "p") => () => ({ tag: name });

describe("PanelLayout registry seams (F3/§2.5)", () => {
  it("F3: floatable defaults to true — an empty registry excludes nothing", () => {
    assert.equal(floatExcludedPanels({}).size, 0);
    assert.equal(
      floatExcludedPanels({ outline: { component: panel() } }).size,
      0,
    );
  });

  it("F3: floatable:false entries are excluded, keyed exactly as registered", () => {
    const out = floatExcludedPanels({
      outline: { component: panel() },
      doc: { component: panel(), floatable: false },
      document: { component: panel(), floatable: false },
    });
    assert.deepEqual([...out].sort(), ["doc", "document"]);
  });

  it("F3: floatable:false is the ONLY exclusion trigger — undefined/title/minHeight do not", () => {
    const out = floatExcludedPanels({
      a: { component: panel(), floatable: undefined },
      b: { component: panel(), title: "B" },
      c: { component: panel(), minHeight: 200 },
      d: { component: panel(), floatable: true },
    });
    assert.equal(out.size, 0);
  });

  it("F3: the demo shape — the doc panel's exclusion rides its PANEL-ID key (veto contract), the render key stays floatable", () => {
    // The registry the rewired mock passes (mock: registry notes): the
    // 'document' key renders (contentComponent), the 'doc' key carries the
    // exclusion by panel id (floatExclusionVeto compares d.panelId).
    const registry = {
      document: { component: panel() },
      doc: { component: panel(), floatable: false },
    };
    const excluded = floatExcludedPanels(registry);
    assert.ok(excluded.has("doc"), "panel id 'doc' excluded");
    assert.equal(excluded.has("document"), false, "render key floatable");
  });

  it("§2.5: registryMinHeights keeps finite numbers only, keyed by contentComponent", () => {
    const out = registryMinHeights({
      a: { component: panel(), minHeight: 200 },
      b: { component: panel(), minHeight: 132.5 },
      c: { component: panel(), minHeight: "tall" },
      d: { component: panel(), minHeight: Number.NaN },
      e: { component: panel(), minHeight: Number.POSITIVE_INFINITY },
      f: { component: panel() },
    });
    assert.deepEqual(out, { a: 200, b: 132.5 });
  });

  it("§2.5: an empty minHeight view yields an empty map (no floors → global MIN_TS_H only)", () => {
    assert.deepEqual(registryMinHeights({}), {});
    assert.deepEqual(
      registryMinHeights({ a: { component: panel() } }),
      {},
    );
  });
});

/**
 * Subscription-capturing api fake for useDropRules (the unwrap-wiring
 * pattern, sized to this file's single seam): onWillDrop handlers are
 * captured and fired by hand; the other two registrations are inert
 * stubs; no accessor beyond what the drop-rules registration touches.
 */
function dropRulesApi() {
  const subs = [];
  return {
    id: "v-test",
    groups: [],
    getGroup: () => undefined,
    getPanel: () => undefined,
    addFloatingGroup: () => {},
    onWillDrop: (fn) => {
      subs.push(fn);
      return { dispose: () => {} };
    },
    onWillShowOverlay: () => ({ dispose: () => {} }),
    onWillDragGroup: () => ({ dispose: () => {} }),
    fireWillDrop: (ev) => [...subs].forEach((f) => f(ev)),
  };
}

describe("PanelLayout registry seams — live derivation (§2.5)", () => {
  // The wiring consumes registrySeams(registryGetter) — the component
  // keeps the getter pointing at the current registry prop (the
  // latest-ref pattern, the registry sibling of autoWrapRef). These tests
  // drive the SHIPPED factory with a mutating ref: the exclusion set and
  // the floors must re-derive per read, never frozen at wiring time.

  it("F3: the exclusion getter re-derives per read — a registry change behind the ref is visible without rewiring", () => {
    const registryRef = { current: { doc: { component: panel() } } };
    const seams = registrySeams(() => registryRef.current);
    assert.equal(seams.floatExcludedPanelIds().size, 0, "floatable at first read");
    registryRef.current = { doc: { component: panel(), floatable: false } };
    assert.deepEqual([...seams.floatExcludedPanelIds()], ["doc"], "excluded at second read");
    registryRef.current = { doc: { component: panel(), floatable: true } };
    assert.equal(seams.floatExcludedPanelIds().size, 0, "floatable again at third read");
  });

  it("§2.5: floorOf re-derives per call — minHeight entries added/removed move the floor", () => {
    const registryRef = { current: {} };
    const seams = registrySeams(() => registryRef.current);
    const group = { panels: [{ view: { contentComponent: "x" } }] };
    assert.equal(seams.floorOf(group), CONSTANTS.MIN_TS_H, "no entries → global floor");
    registryRef.current = { x: { component: panel(), minHeight: 300 } };
    assert.equal(seams.floorOf(group), 300, "entry added → registry floor");
    registryRef.current = { x: { component: panel() } };
    assert.equal(seams.floorOf(group), CONSTANTS.MIN_TS_H, "entry removed → global floor");
  });

  it("§2.5: floorOf takes the max over current members; sub-MIN entries never lower the global floor", () => {
    const registryRef = {
      current: {
        x: { component: panel(), minHeight: 300 },
        y: { component: panel(), minHeight: 480 },
      },
    };
    const seams = registrySeams(() => registryRef.current);
    const group = {
      panels: [
        { view: { contentComponent: "x" } },
        { view: { contentComponent: "y" } },
        { view: { contentComponent: "z" } }, // no registry entry — contributes nothing
      ],
    };
    assert.equal(seams.floorOf(group), 480, "max over members wins");
    registryRef.current = { x: { component: panel(), minHeight: 10 } };
    assert.equal(seams.floorOf(group), CONSTANTS.MIN_TS_H, "sub-MIN floor cannot undercut 36");
  });

  it("F3: the wired drop rules veto per EVENT from the live registry — the veto flips as the registry changes, no rewiring", () => {
    const api = dropRulesApi();
    const registryRef = { current: { doc: { component: panel() } } };
    const seams = registrySeams(() => registryRef.current);
    const rules = useDropRules({
      api,
      autoWrap: false,
      floatExcludedPanelIds: seams.floatExcludedPanelIds,
      layoutArea: () => null,
    });
    const ev1 = fakeDropEvent({
      kind: "content", position: "center",
      panelId: "doc", groupLocation: "floating",
    });
    api.fireWillDrop(ev1);
    assert.equal(ev1.defaultPrevented, false, "doc floatable at event 1");
    registryRef.current = { doc: { component: panel(), floatable: false } };
    const ev2 = fakeDropEvent({
      kind: "content", position: "center",
      panelId: "doc", groupLocation: "floating",
    });
    api.fireWillDrop(ev2);
    assert.equal(ev2.defaultPrevented, true, "doc excluded at event 2 — same wiring, re-derived registry");
    rules.dispose();
  });
});
