/**
 * Headless tests for @metanorma/panel-layout — gesture takeover
 * (docs/behavior.spec.md row HP6): target selection (sash resizes the
 * tabset ABOVE; window bottom edge / corners resize the LAST tabset) and
 * the per-move frame math (height floor 36, window floor 150, corner
 * width floor 120, §2.5 registry floors).
 *
 * Run: yarn workspace @metanorma/panel-layout test
 *
 * BOUNDARY (explicit decision, tests/README.md "DOM rows are never faked
 * in Node"; module-6 rider "— (capture-phase DOM routing)"): the pure
 * target-selection and frame helpers are Node-tested here; the
 * capture-phase listener wiring (querySelector of the overlay host,
 * closest() hit-testing, getBoundingClientRect sampling, overlay
 * positioning, reconcile+commit sequencing) is DOM-coupled and stays
 * parity/synthetic-covered — no faked DOM here. The helpers were
 * extracted from the mock's block (:924–993) verbatim so the Node layer
 * pins exactly the math the DOM layer executes.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  pickResizeTarget,
  resizeFrame,
} from "../compiled/dragTakeover.js";
import { CONSTANTS } from "../compiled/tokens.js";

describe("dragTakeover: pickResizeTarget (HP6)", () => {
  it("HP6: sash picks the LAST member whose bottom sits at/above the sash (bottom <= sashTop + 2)", () => {
    // Navigation window, tabsets 244/132/74, chrome/sash geometry: member
    // bottoms at 244, 380, 458 (mock preset, sashSize 4).
    const bottoms = [244, 380, 458];
    // sash between member 0 and 1 → sashTop ~244: member 0 qualifies,
    // member 1 (380) does not.
    assert.equal(pickResizeTarget(bottoms, 244), 0);
    // sash between member 1 and 2 → sashTop ~380: members 0 and 1 qualify.
    assert.equal(pickResizeTarget(bottoms, 380), 1);
    // sash below every member → the last member qualifies.
    assert.equal(pickResizeTarget(bottoms, 460), 2);
  });

  it("HP6: the 2px tolerance admits a bottom just ABOVE the sash top (bottom <= sashTop + 2)", () => {
    const bottoms = [244, 380, 458];
    // sashTop 381: member 1's bottom 380 <= 381 + 2 → member 1 is the target.
    assert.equal(pickResizeTarget(bottoms, 381), 1);
    // the boundary itself qualifies: sashTop 378 → 378 + 2 = 380, and
    // member 1's bottom 380 <= 380 → still member 1.
    assert.equal(pickResizeTarget(bottoms, 378), 1);
    // one further pixel up: sashTop 377 → 377 + 2 = 379 < 380 → member 0.
    assert.equal(pickResizeTarget(bottoms, 377), 0);
  });

  it("HP6: sash above every member (first sash) → member 0", () => {
    assert.equal(pickResizeTarget([244, 380, 458], 10), 0);
    assert.equal(pickResizeTarget([244], 10), 0);
  });

  it("HP6: window bottom edge / corner (sashTop null) → the LAST member", () => {
    assert.equal(pickResizeTarget([244, 380, 458], null), 2);
    assert.equal(pickResizeTarget([142], null), 0);
  });
});

describe("dragTakeover: resizeFrame (HP6)", () => {
  /** The mock's arithmetic on a real preset member: start 74, dy +40. */
  const START = { height: 74, width: 300, winHeight: 168 };

  it("HP6: height = max(MIN_TS_H, round(startH + dy)) — the mock's exact arithmetic", () => {
    const f = resizeFrame({ start: START, pointer: { dx: 0, dy: 40 }, isCorner: false });
    assert.equal(f.height, 114);
    assert.equal(f.winHeight, 208);
    assert.equal(f.width, undefined, "edge drags carry no width");
  });

  it("HP6/B4: height clamps to the 36px tabset floor on upward drags", () => {
    const f = resizeFrame({ start: START, pointer: { dx: 0, dy: -200 }, isCorner: false });
    assert.equal(f.height, CONSTANTS.MIN_TS_H);
    assert.equal(f.height, 36);
  });

  it("HP6/B5: window height clamps to the 150px window floor", () => {
    // start 74 in a 168 window; dragging to 36 → winHeight would be 130
    // without the floor; the floor holds it at 150.
    const f = resizeFrame({ start: START, pointer: { dx: 0, dy: -200 }, isCorner: false });
    assert.equal(f.winHeight, CONSTANTS.MIN_WIN_H);
    assert.equal(f.winHeight, 150);
  });

  it("HP6: fractional dy rounds before the floors apply (Math.round, not trunc)", () => {
    // start 74, dy 40.6 → round(114.6) = 115; winHeight 168 + 41 = 209.
    const f = resizeFrame({ start: START, pointer: { dx: 0, dy: 40.6 }, isCorner: false });
    assert.equal(f.height, 115);
    assert.equal(f.winHeight, 209);
    // dy 40.4 → round(114.4) = 114.
    const g = resizeFrame({ start: START, pointer: { dx: 0, dy: 40.4 }, isCorner: false });
    assert.equal(g.height, 114);
  });

  it("HP6: negative start heights (corrupt sample) cannot drag below MIN_TS_H", () => {
    const f = resizeFrame({
      start: { height: -5, width: 300, winHeight: 150 },
      pointer: { dx: 0, dy: 0 },
      isCorner: false,
    });
    assert.equal(f.height, CONSTANTS.MIN_TS_H);
    // the window tracks the delta FROM THE SAMPLED START (mock formula:
    // round(startWin + (h − startH))): 150 + (36 − (−5)) = 191.
    assert.equal(f.winHeight, 191);
  });

  it("HP6/B5: corner drags clamp width to windowMinWidth (120px)", () => {
    const f = resizeFrame({
      start: { height: 74, width: 300, winHeight: 168 },
      pointer: { dx: -400, dy: 40 },
      isCorner: true,
    });
    assert.equal(f.width, CONSTANTS.windowMinWidth);
    assert.equal(f.width, 120);
    // the vertical axis is unaffected by the corner's horizontal collapse
    assert.equal(f.height, 114);
    assert.equal(f.winHeight, 208);
  });

  it("HP6: corner drag with positive dx widens; edge drag never emits width", () => {
    const corner = resizeFrame({
      start: { height: 74, width: 300, winHeight: 168 },
      pointer: { dx: 52, dy: 40 },
      isCorner: true,
    });
    assert.equal(corner.width, 352);
    const edge = resizeFrame({
      start: { height: 74, width: 300, winHeight: 168 },
      pointer: { dx: 52, dy: 40 },
      isCorner: false,
    });
    assert.equal(edge.width, undefined);
  });

  it("HP6: corner width rounds fractional dx", () => {
    const f = resizeFrame({
      start: { height: 74, width: 300, winHeight: 168 },
      pointer: { dx: 51.6, dy: 0 },
      isCorner: true,
    });
    assert.equal(f.width, Math.round(300 + 51.6));
    assert.equal(f.width, 352);
  });

  it("HP6/§2.5: a registry floor raises the pinned height above the drag's request", () => {
    // Registry floor 200 (e.g. an outline panel with minHeight: 200): the
    // drag asks for 74 + 40 = 114, the floor wins, and the window tracks
    // the height ACTUALLY pinned (168 + (200 − 74) = 294).
    const f = resizeFrame({
      start: START,
      pointer: { dx: 0, dy: 40 },
      floor: 200,
      isCorner: false,
    });
    assert.equal(f.height, 200);
    assert.equal(f.winHeight, 294);
  });

  it("HP6/§2.5: a sub-MIN_TS_H registry floor never lowers the global floor", () => {
    const f = resizeFrame({
      start: START,
      pointer: { dx: 0, dy: -200 },
      floor: 10,
      isCorner: false,
    });
    assert.equal(f.height, CONSTANTS.MIN_TS_H);
  });

  it("HP6/§2.5: an above-drag registry floor also lifts the window floor result coherently", () => {
    // Floor 400 vs start 74: height 400, winHeight 168 + 326 = 494 — the
    // MIN_WIN_H floor is inert above it.
    const f = resizeFrame({
      start: START,
      pointer: { dx: 0, dy: 10 },
      floor: 400,
      isCorner: false,
    });
    assert.equal(f.height, 400);
    assert.equal(f.winHeight, 494);
  });

  it("HP6/§2.5: no floor (undefined) is the mock's exact arithmetic (regression pin)", () => {
    const noFloor = resizeFrame({
      start: START,
      pointer: { dx: 0, dy: 40 },
      floor: undefined,
      isCorner: false,
    });
    const absent = resizeFrame({
      start: START,
      pointer: { dx: 0, dy: 40 },
      isCorner: false,
    });
    assert.deepEqual(noFloor, absent);
    assert.deepEqual(absent, { height: 114, winHeight: 208, width: undefined });
  });
});
