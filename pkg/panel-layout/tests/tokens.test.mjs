/**
 * Headless tests for @metanorma/panel-layout — design tokens and constants
 * (docs/behavior.spec.md §4 "Default / initial values", read from
 * mock/design-tokens.json via tokens.ts).
 *
 * Run: yarn workspace @metanorma/panel-layout test
 *
 * These are regression pins, not unit tests: the values below are the
 * spec-cited contract numbers. If one fails, either the mock changed (and
 * spec §4 + this file must be updated together, via tokens:extract) or the
 * typed views drifted from the JSON.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONSTANTS, TOKENS, DV_TOKENS, STORAGE_KEYS, PROVENANCE } from "../compiled/tokens.js";

describe("tokens: constants (spec §4)", () => {
  it("§4: MIN_TS_H floor is 36 (B4)", () => {
    assert.equal(CONSTANTS.MIN_TS_H, 36);
  });
  it("§4: MIN_WIN_H floor is 150 (B5)", () => {
    assert.equal(CONSTANTS.MIN_WIN_H, 150);
  });
  it("§4: windowMinWidth is 120 (corner-drag width clamp)", () => {
    assert.equal(CONSTANTS.windowMinWidth, 120);
  });
  it("§4: sashSize is 4 (B6, HP4 target growth)", () => {
    assert.equal(CONSTANTS.sashSize, 4);
  });
  it("§4: undockChrome is 26 (HP2 new-window sizing)", () => {
    assert.equal(CONSTANTS.undockChrome, 26);
  });
  it("§4: WRAP fallback size is 260×200", () => {
    assert.equal(CONSTANTS.WRAP_W, 260);
    assert.equal(CONSTANTS.WRAP_H, 200);
  });
});

describe("tokens: dockview theme values (spec §4)", () => {
  it("§4: floating titlebar height is 24px", () => {
    assert.equal(DV_TOKENS["--dv-floating-titlebar-height"], "24px");
  });
  it("§4: tab strip height is 30px", () => {
    assert.equal(DV_TOKENS["--dv-tabs-and-actions-container-height"], "30px");
  });
  it("§4: --dv-border-radius is 8px", () => {
    assert.equal(DV_TOKENS["--dv-border-radius"], "8px");
  });
});

describe("tokens: storage keys (spec §4, two-key format)", () => {
  it("§4: layout/heights keys are the demo's legacy keys", () => {
    assert.equal(STORAGE_KEYS.layout, "mn-dockview7-floats-v1");
    assert.equal(STORAGE_KEYS.heights, "mn-dockview7-heights-v1");
  });
});

describe("tokens: provenance drift tripwire", () => {
  it("§4: extracted tokens track the mock's last-touching commit — regeneration that changes contract values must update spec §4 and these pins together", () => {
    // Not pinned as a literal here: the strong pin is the constants above.
    // This asserts the provenance shape stays machine-readable for the
    // build-time drift checks (tokens:check owns byte-exactness).
    assert.match(PROVENANCE.commit, /^[0-9a-f]{40}$/);
    assert.equal(PROVENANCE.source, "pkg/panel-layout/mock/editor-dockview7-floats.html");
  });
});
