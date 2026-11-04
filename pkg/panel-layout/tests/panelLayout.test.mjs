/**
 * Headless tests for @metanorma/panel-layout — the PanelLayout component's
 * pure seams (docs/behavior.spec.md F3, api.spec.md §2.5): the
 * `floatExcludedPanels(registry)` derivation and the `registryMinHeights`
 * view. The composition itself (DockviewReact + the nine wirings) is
 * browser territory: parity (GREEN 1) drives it through the rewired mock,
 * and the synthetic project drives the page-level rows (A4/A6/A7/A8/C3/
 * G5/G6) — nothing here fakes a DOM.
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
