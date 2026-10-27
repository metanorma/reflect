/**
 * Headless tests for @metanorma/panel-layout — pinGroup floor/round/guard
 * semantics (docs/behavior.spec.md rows B4/B5; the pin model of HP4/HP6).
 *
 * Run: yarn workspace @metanorma/panel-layout test
 *
 * BOUNDARY (explicit decision): pinGroup touches exactly three seams on its
 * group argument — .minimumHeight, .maximumHeight, .api.setConstraints.
 * Asserting through a spy + getters is the function's real contract, not
 * fake state. If pinning work ever needs a FOURTH accessor, these tests
 * move to the synthetic layer; that discovery is an escalation, not an
 * extension of the fake. All other pinHeights surface (membersOf,
 * chromeOf, reconcileWindow, pinAllWindows, collectStableHeights) is
 * DOM-coupled (getBoundingClientRect/requestAnimationFrame) and covered by
 * parity (GREEN 1) until the synthetic layer lands.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pinGroup } from "../compiled/pinHeights.js";
import { fakeGroup } from "./helpers.mjs";

describe("pinHeights: pinGroup (B4 floor, HP6 re-pin)", () => {
  it("B4: heights below MIN_TS_H clamp to the 36px floor", () => {
    const g = fakeGroup({ minimumHeight: 0, maximumHeight: 0 });
    const h = pinGroup(g, 10);
    assert.equal(h, 36);
    assert.equal(g.minimumHeight, 36);
    assert.equal(g.maximumHeight, 36);
  });

  it("HP6: fractional heights round to integers", () => {
    const g = fakeGroup({ minimumHeight: 0, maximumHeight: 0 });
    const h = pinGroup(g, 143.6);
    assert.equal(h, 144);
    assert.deepEqual([g.minimumHeight, g.maximumHeight], [144, 144]);
  });

  it("HP4: pin travels as min==max (height owns the slot, window follows)", () => {
    const g = fakeGroup({ minimumHeight: 0, maximumHeight: 9999 });
    pinGroup(g, 244);
    assert.deepEqual([g.minimumHeight, g.maximumHeight], [244, 244]);
  });

  it("HP6: ±1px no-op guard — already-pinned group does not re-call setConstraints", () => {
    const calls = [];
    const g = fakeGroup({ minimumHeight: 244, maximumHeight: 244, setConstraintsSpy: (c) => calls.push(c) });
    const h = pinGroup(g, 244.4); // |244.4 − 244| rounds within guard
    assert.equal(h, 244);
    assert.equal(calls.length, 0);
  });

  it("HP6: beyond-guard drift re-pins (setConstraints called once)", () => {
    const calls = [];
    const g = fakeGroup({ minimumHeight: 244, maximumHeight: 244, setConstraintsSpy: (c) => calls.push(c) });
    pinGroup(g, 300);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { minimumHeight: 300, maximumHeight: 300 });
  });
});
