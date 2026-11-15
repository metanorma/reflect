/**
 * editor-gui built-in preset pinning — the consumer side of panel-layout
 * api.spec.md §2.6: the preset must certify through the library's own
 * `diagnoseLayout` (the SAME schema the load path enforces — single
 * source of truth) and satisfy the semantic contract TS cannot check:
 * panel-id membership, `activeGroup` resolution, floating height floors.
 *
 * Registry-side membership is compile-time (panels.tsx's `satisfies`
 * tie — all PANEL_IDS keys present, none extra; enforced by
 * `yarn workspace editor-gui compile`). Importing compiled `panels.js`
 * here was REJECTED: it drags `@metanorma/prosemirror-editor` and
 * `@metanorma/toolbar` TS mains into Node (ERR_UNKNOWN_FILE_EXTENSION).
 *
 * No width floor is asserted: `windowMinWidth` (120) is the corner-drag
 * resize clamp (dragTakeover.ts), not a seed invariant — the shipped
 * seeds (116/104) sit below it by design.
 *
 * Run: yarn workspace editor-gui test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { presetLayout } from "../compiled/presetLayout.js";
import { PANEL_IDS } from "../compiled/panelIds.js";
import { CONSTANTS, diagnoseLayout } from "@metanorma/panel-layout";

/** Collect every leaf group id under a serialized grid root. */
function leafIds(node) {
  if (node.type === "leaf") return [node.data.id];
  return node.data.flatMap(leafIds);
}

describe("editor-gui: built-in preset (§2.6 preset pinning)", () => {
  const preset = presetLayout();

  it("§2.6: certifies through the library's own diagnoseLayout", () => {
    const d = diagnoseLayout(preset);
    assert.equal(d.ok, true);
  });

  it("preset: panels ids are exactly PANEL_IDS (no phantom panels)", () => {
    assert.deepEqual([...Object.keys(preset.panels)].sort(), [...PANEL_IDS].sort());
  });

  it("preset: activeGroup resolves to a group in the main grid", () => {
    assert.ok(leafIds(preset.grid.root).includes(preset.activeGroup),
      `activeGroup ${preset.activeGroup} not found in grid.root`);
  });

  it("preset: floating group ids unique, disjoint from the main grid", () => {
    const mainIds = leafIds(preset.grid.root);
    const floatingIds = preset.floatingGroups.flatMap((fg) => leafIds(fg.grid.root));
    assert.equal(new Set(floatingIds).size, floatingIds.length, "duplicate floating group ids");
    for (const id of floatingIds) {
      assert.ok(!mainIds.includes(id), `floating id ${id} collides with the main grid`);
    }
  });

  it("preset: floating window heights respect the floors; tabset size = height − undockChrome", () => {
    for (const [i, fg] of preset.floatingGroups.entries()) {
      assert.ok(fg.position.height >= CONSTANTS.MIN_WIN_H,
        `floating[${i}] window height ${fg.position.height} below MIN_WIN_H`);
      const leaf = (function findLeaf(node) {
        return node.type === "leaf" ? node : findLeaf(node.data[0]);
      })(fg.grid.root);
      assert.equal(leaf.size, fg.position.height - CONSTANTS.undockChrome,
        `floating[${i}] leaf size !== height − undockChrome`);
      assert.ok(leaf.size >= CONSTANTS.MIN_TS_H,
        `floating[${i}] tabset ${leaf.size} below MIN_TS_H`);
    }
  });
});
