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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CONSTANTS, TOKENS, DV_TOKENS, STORAGE_KEYS, PROVENANCE } from "../compiled/tokens.js";
import * as publicIndex from "../compiled/index.js";
import * as tokensModule from "../compiled/tokens.js";

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

/* ---- module 10: promotion surface + panel-layout.css pins ---- */

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "..", "panel-layout.css"), "utf8");
const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));

describe("tokens: public promotion surface (§3 module 10 budget)", () => {
  it("§4: index exports exactly the three budgeted token symbols + LayoutConstants type re-export", () => {
    // Value surface: the three budget names are present…
    for (const name of ["CONSTANTS", "TOKENS", "DV_TOKENS"]) {
      assert.ok(name in publicIndex, `index.ts must export ${name}`);
    }
    // …and every other tokens.ts value export is NOT public.
    const tokenValues = Object.keys(tokensModule);
    for (const name of tokenValues) {
      const budgeted = ["CONSTANTS", "TOKENS", "DV_TOKENS"].includes(name);
      assert.equal(name in publicIndex, budgeted,
        `${name} public=${budgeted} — index must carry only the budgeted token symbols`);
    }
  });
  it("§4: promoted views are the same objects as the module's (pure re-export, one definition)", () => {
    assert.equal(publicIndex.CONSTANTS, tokensModule.CONSTANTS);
    assert.equal(publicIndex.TOKENS, tokensModule.TOKENS);
    assert.equal(publicIndex.DV_TOKENS, tokensModule.DV_TOKENS);
  });
  it("§4: package exports map points at the public entry", () => {
    assert.equal(pkg.exports["."], "./index.ts");
  });
});

describe("tokens: TOKENS/DV_TOKENS cardinals (spec §4 counts)", () => {
  it("§4: mock :root custom properties number 18", () => {
    assert.equal(Object.keys(TOKENS).length, 18);
  });
  it("§4: dockview theme overrides number 20", () => {
    assert.equal(Object.keys(DV_TOKENS).length, 20);
  });
  it("§4: named token pins (accent family + float shadow)", () => {
    assert.equal(TOKENS["--accent"], "#2f6fdb");
    assert.equal(TOKENS["--ink"], "#1c2733");
    assert.equal(DV_TOKENS["--dv-floating-box-shadow"],
      "0 14px 40px rgba(15,25,40,.30),0 2px 8px rgba(15,25,40,.18)");
  });
});

/** Parse `--decl:value;` pairs out of a verbatim CSS custom-property block. */
function declsOf(cssText, blockSelector) {
  const start = cssText.indexOf(blockSelector);
  assert.ok(start >= 0, `panel-layout.css must contain ${blockSelector}`);
  const end = cssText.indexOf("\n  }", start);
  const body = cssText.slice(start, end);
  const decls = {};
  for (const line of body.split("\n")) {
    for (const m of line.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      decls[m[1]] = m[2].trim();
    }
  }
  return decls;
}

describe("tokens: pipeline both directions (CSS ↔ design-tokens.json)", () => {
  it("§4: :root declarations in panel-layout.css equal TOKENS from design-tokens.json", () => {
    assert.deepEqual(declsOf(css, ":root{"), TOKENS);
  });
  it("§4: dv-theme declarations in panel-layout.css equal DV_TOKENS from design-tokens.json", () => {
    assert.deepEqual(declsOf(css, ".layoutArea .dockview-theme-light{"), DV_TOKENS);
  });
});

describe("panel-layout.css: chrome surfaces (rows J4/J5)", () => {
  it("J5: both sash-accent surfaces present — stock grid sashes (dv-enabled:hover) and float-window takeover sashes", () => {
    assert.match(css,
      /\.layoutArea \.dv-sash\.dv-enabled:hover,\.layoutArea \.dv-sash\.dv-enabled\.dv-active-sash\{background:var\(--accent\)\}/);
    assert.match(css,
      /\.dv-sash-container > \.dv-sash\{cursor:ns-resize;background:#ccd3da\}/);
    assert.match(css,
      /\.dv-sash-container > \.dv-sash\.dv-active-sash\{background:var\(--accent\)\}/);
  });
  it("J4: suppression pair present — hide-all under .mn-unwrap-hover, re-show inside .dv-resize-container", () => {
    // Both rules are multi-selector groups: the four zone-element kinds
    // each ride their own selector line into one shared declaration.
    const kinds = ["selection", "dropzone", "anchor", "container"];
    for (const kind of kinds) {
      const sep = kind === "container" ? "\\{" : ",";
      assert.match(css, new RegExp(
        `\\.layoutArea\\.mn-unwrap-hover \\.dv-drop-target-${kind}${sep}`),
        `hide-all group must cover dv-drop-target-${kind}`);
      assert.match(css, new RegExp(
        `\\.layoutArea\\.mn-unwrap-hover \\.dv-resize-container \\.dv-drop-target-${kind}${sep}`),
        `re-show group must cover dv-drop-target-${kind}`);
    }
    assert.match(css, /\.layoutArea\.mn-unwrap-hover \.dv-drop-target-container\{display:none !important\}/);
    assert.match(css, /\.layoutArea\.mn-unwrap-hover \.dv-resize-container \.dv-drop-target-container\{display:block !important\}/);
  });
  it("§4: float chrome rules present — with-titlebar radius, titlebar cursor, drag grip", () => {
    assert.match(css, /\.layoutArea \.dv-resize-container\.dv-resize-container-with-titlebar\{\n    border-radius:8px;\n  \}/);
    assert.match(css, /\.layoutArea \.dv-floating-titlebar:active\{cursor:grabbing\}/);
    assert.match(css, /\.mn-drag-grip\{/);
    assert.match(css, /--dv-floating-titlebar-height:24px/);
  });
  it("§4 scope guard: no demo selectors, no HTML/script/importmap fragments (retroactive catcher for the D29 gripHover overrun)", () => {
    for (const bad of [
      /<\/?(style|script|html|body)\b/i,
      /"imports"\s*:/,
      /\.panelwrap\b|\.o-node\b|\.bib-row\b|\.toolbar\b|\.statusbar\b|#boot\b|\.page\b|\.req\b/,
    ]) {
      assert.doesNotMatch(css, bad, `panel-layout.css must not match ${bad}`);
    }
  });
});
