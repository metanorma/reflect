/**
 * Headless tests for @metanorma/panel-layout — window-drag containment math
 * (docs/behavior.spec.md rows HP5/F4: top/left containment, free bottom).
 *
 * Run: yarn workspace @metanorma/panel-layout test
 *
 * clampDragBox is pure math over injected boxes — no DOM. The DOM-side of
 * window drag (transform tracking, overlay writes, normalizeTops) is
 * covered by parity (GREEN 1).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampDragBox } from "../compiled/windowDrag.js";

describe("windowDrag: clampDragBox (HP5/F4 containment)", () => {
  it("HP5: negative top/left clamp to 0 (stay inside top/left edges)", () => {
    const r = clampDragBox({
      proposed: { top: -30, left: -50, width: 200, height: 100 },
      container: { width: 1000, height: 800 },
    });
    assert.deepEqual(r, { top: 0, left: 0 });
  });

  it("HP5: left respects width (right edge contained)", () => {
    const r = clampDragBox({
      proposed: { top: 10, left: 950, width: 200, height: 100 },
      container: { width: 1000, height: 800 },
    });
    assert.deepEqual(r, { top: 10, left: 800 });
  });

  it("F4: top clamps to [0, container.height] — window may start AT the bottom edge and hang below (drawer park, bottom stays free)", () => {
    const r = clampDragBox({
      proposed: { top: 5000, left: 10, width: 200, height: 100 },
      container: { width: 1000, height: 800 },
    });
    assert.deepEqual(r, { top: 800, left: 10 });
    // At-edge start: not pushed back inside.
    const atEdge = clampDragBox({
      proposed: { top: 800, left: 10, width: 200, height: 100 },
      container: { width: 1000, height: 800 },
    });
    assert.deepEqual(atEdge, { top: 800, left: 10 });
  });

  it("HP5: in-bounds proposal passes through unchanged", () => {
    const r = clampDragBox({
      proposed: { top: 12, left: 18, width: 252, height: 450 },
      container: { width: 1440, height: 900 },
    });
    assert.deepEqual(r, { top: 12, left: 18 });
  });

  it("HP5: degenerate zero-size container → clamps to 0 without NaN", () => {
    const r = clampDragBox({
      proposed: { top: 100, left: 100, width: 200, height: 100 },
      container: { width: 0, height: 0 },
    });
    assert.deepEqual(r, { top: 0, left: 0 });
  });
});
