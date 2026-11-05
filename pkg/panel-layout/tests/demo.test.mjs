/**
 * Headless tests for the demo surface (`demo/`, D38/D39) — the extracted
 * demo consumer of '@metanorma/panel-layout/demo'. Node-only seams:
 * registry shape (§2.5 keying, D33), preset structural pins (behavior.spec
 * §4 — the values the parity goldens pin), the two-key storage config
 * (§2.6), the consumer firewall (demo/ imports only the public API), and
 * the anchor drift-guard (the mock's dead-data TITLES/presetLayout
 * extraction anchors must stay byte-equal to the demo's live copies — the
 * mitigation for the D35 duplication). Browser behavior (DemoApp mounting,
 * chrome interaction, pixels) is parity territory.
 *
 * Run: yarn workspace @metanorma/panel-layout test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { floatExcludedPanels } from "../compiled/index.js";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { PANELS } from "../compiled/demo/panels.js";
import { registry } from "../compiled/demo/registry.js";
import { presetLayout } from "../compiled/demo/preset.js";
import {
  DEMO_HEIGHTS_KEY,
  DEMO_LAYOUT_KEY,
  demoStorageFormat,
} from "../compiled/demo/storage.js";
import {
  DemoStatusbar,
  DemoToolbar,
  LIVE_HINT_SAVED,
  LIVE_HINT_STORAGE_UNAVAILABLE,
} from "../compiled/demo/chrome.js";

const here = dirname(fileURLToPath(import.meta.url));
const MOCK = join(here, "..", "mock", "editor-dockview7-floats.html");
const DEMO_DIR = join(here, "..", "demo");

describe("DEMO registry (§2.5/D33)", () => {
  it("DEMO-registry: 12 keys — the 11 render keys plus the doc policy key; every component is a function", () => {
    assert.deepEqual(Object.keys(registry).sort(), [
      "attributes", "bibliography", "derived", "doc", "document", "identity",
      "outline", "overlays", "pinned", "review", "structure", "validation",
    ]);
    for (const key of Object.keys(registry)) {
      assert.equal(typeof registry[key].component, "function",
        `${key}: component must be a function`);
    }
  });

  it("DEMO-registry: the doc policy entry shares the document render component (mock translation, D33)", () => {
    assert.strictEqual(registry.doc.component, registry.document.component);
    assert.equal(registry.doc.floatable, false);
    assert.equal(registry.document.floatable, undefined);
    // every render key resolves to a PANELS body
    for (const key of Object.keys(PANELS)) {
      assert.ok(typeof registry[key]?.component === "function",
        `render key ${key} registered`);
    }
  });

  it("DEMO-registry/F3: floatExcludedPanels(demoRegistry) via the PUBLIC API yields exactly {'doc'}", () => {
    const excluded = floatExcludedPanels(registry);
    assert.equal(excluded.size, 1);
    assert.ok(excluded.has("doc"), "panel id 'doc' excluded");
  });
});

describe("DEMO preset (behavior.spec §4)", () => {
  it("DEMO-preset/HP1: grid, activeGroup, float windows, sizes and positions pinned", () => {
    const p = presetLayout();
    assert.equal(p.grid.orientation, "HORIZONTAL");
    assert.equal(p.grid.width, 1200);
    assert.equal(p.grid.height, 800);
    assert.deepEqual(p.grid.root, {
      type: "branch",
      size: 800,
      data: [{ type: "leaf", size: 1200, data: { id: "group-doc", views: ["doc"], activeView: "doc" } }],
    });
    assert.equal(p.activeGroup, "group-doc");
    assert.equal(p.floatingGroups.length, 3);
    // Navigation {18,12} 252x450 — tabsets 244/132/74
    assert.deepEqual(p.floatingGroups[0].position,
      { left: 18, top: 12, width: 252, height: 450 });
    assert.deepEqual(leafSizes(p.floatingGroups[0]), [244, 132, 74]);
    // Pinned {292,12} 300x168 — 142
    assert.deepEqual(p.floatingGroups[1].position,
      { left: 292, top: 12, width: 300, height: 168 });
    assert.deepEqual(leafSizes(p.floatingGroups[1]), [142]);
    // Inspector {1050,12} 320x602 — 200/180/116/100
    assert.deepEqual(p.floatingGroups[2].position,
      { left: 1050, top: 12, width: 320, height: 602 });
    assert.deepEqual(leafSizes(p.floatingGroups[2]), [200, 180, 116, 100]);
  });

  it("DEMO-preset/HP1: 11 panels — titles per panelTitles, doc renders the 'document' component, params {}", () => {
    const p = presetLayout();
    const titles = {
      doc: "24817-1.adoc", outline: "Outline", bibliography: "Bibliography",
      validation: "Validation", review: "Review",
      pinned: "Pinned · #fig-ion-beam", identity: "Identity & References",
      attributes: "Attributes", structure: "Structure",
      derived: "Derived · read-only", overlays: "Overlays",
    };
    assert.deepEqual(Object.keys(p.panels).sort(), Object.keys(titles).sort());
    for (const id of Object.keys(titles)) {
      assert.equal(p.panels[id].title, titles[id], `title of ${id}`);
      assert.equal(p.panels[id].contentComponent, id === "doc" ? "document" : id,
        `contentComponent of ${id}`);
      assert.deepEqual(p.panels[id].params, {});
      assert.equal(p.panels[id].id, id);
    }
  });

  it("DEMO-preset: fresh object per call (deep-equal, distinct identity)", () => {
    const a = presetLayout();
    const b = presetLayout();
    assert.notEqual(a, b);
    assert.deepEqual(a, b);
  });
});

describe("DEMO storage (§2.6)", () => {
  it("DEMO-storage: two-key format carrying the mock's legacy key strings exactly", () => {
    assert.deepEqual(demoStorageFormat, {
      kind: "two-key",
      keys: { layout: "mn-dockview7-floats-v1", heights: "mn-dockview7-heights-v1" },
    });
    assert.equal(DEMO_LAYOUT_KEY, "mn-dockview7-floats-v1");
    assert.equal(DEMO_HEIGHTS_KEY, "mn-dockview7-heights-v1");
  });
});

describe("DEMO extraction-anchor drift-guard (D35)", () => {
  it("DEMO-anchor-parity: the mock's dead-data TITLES/presetLayout anchors equal the demo's live preset", () => {
    // Replicates extract-design-tokens.mjs exactly: brace-matched slices of
    // the mock, evaluated in a bare VM with the same G/leaf/branch prelude.
    const src = readFileSync(MOCK, "utf8");
    const sliceBalanced = (from) => {
      const start = src.indexOf(from);
      assert.ok(start >= 0, `anchor present: ${from}`);
      const b0 = src.indexOf("{", start);
      let depth = 0, i = b0;
      for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") { depth--; if (depth === 0) break; }
      }
      return src.slice(start, i + 1);
    };
    const prelude = `
      const G = (id, views, activeView) => ({ id, views, activeView });
      const leaf = (data, size) => ({ type: 'leaf', data, size });
      const branch = (data, size) => ({ type: 'branch', data, size });
      ${sliceBalanced("const TITLES =")}
      ${sliceBalanced("function presetLayout()")}
      ({ titles: TITLES, presetLayout: presetLayout() });
    `;
    const { presetLayout: mockPreset } = vm.runInNewContext(prelude, {},
      { timeout: 1000 });
    // JSON comparison: the VM produces cross-realm objects whose prototype
    // differs from the host's (deepStrictEqual fails on that, not content).
    assert.equal(JSON.stringify(mockPreset), JSON.stringify(presetLayout()),
      "mock anchor and demo preset drifted — regenerate design-tokens.json "
      + "expectations and reconcile (the mock is the extraction source)");
  });
});

describe("DEMO consumer firewall (D38)", () => {
  it("DEMO-firewall: demo/ imports only react, the public package, or intra-demo relatives", () => {
    const allowed = new Set(["react", "@metanorma/panel-layout"]);
    const files = readdirSync(DEMO_DIR).filter((f) => /\.(ts|tsx)$/.test(f));
    assert.ok(files.length >= 5, "demo sources present");
    for (const file of files) {
      const text = readFileSync(join(DEMO_DIR, file), "utf8");
      const specs = [...text.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const spec of specs) {
        const bare = !spec.startsWith(".");
        if (bare) {
          assert.ok(allowed.has(spec),
            `${file}: demo may import only ${[...allowed]} — found '${spec}'`);
        } else {
          assert.ok(!spec.startsWith(".."),
            `${file}: demo must not reach outside demo/ — found '${spec}'`);
        }
      }
    }
  });
});

describe("DEMO panel content (D39 byte-parity sentinels)", () => {
  it("DEMO-content: the 11 bodies carry their golden-pinned markup sentinels", () => {
    assert.equal(Object.keys(PANELS).length, 11);
    assert.ok(PANELS.outline.includes('class="o-node sub sel">5.2&nbsp;&nbsp;Determination'));
    assert.ok(PANELS.outline.includes("Experimental notes"));
    assert.ok(PANELS.bibliography.includes("ISO 80000-1:2022*"));
    assert.ok(PANELS.validation.includes("<b>Unresolved xref</b>"));
    assert.ok(PANELS.document.includes("ISO/CD 24817-1"));
    assert.ok(PANELS.document.includes("Determination of magnesium and zinc"));
    assert.ok(PANELS.document.includes("duplicate docid ↗ [1]"));
    // pixel parity (mock.spec.ts snapshots) carries the full byte-parity layer
  });
});

/** Vertical-branch leaf sizes of a floating window's nested grid. */
function leafSizes(floatGroup) {
  const sizes = [];
  const walk = (node) => {
    if (node.type === "leaf") sizes.push(node.size);
    else node.data.forEach(walk);
  };
  walk(floatGroup.grid.root);
  return sizes;
}

describe("DEMO chrome fixes (F1n, C2 — D39 phase 4)", () => {
  const toolbar = (autoWrap) =>
    renderToString(h(DemoToolbar, {
      autoWrap, onToggleAutoWrap: () => {}, onReset: () => {},
    }));

  it("F1n: the auto-wrap toggle carries aria-pressed matching its state, with unchanged label/class", () => {
    const on = toolbar(true);
    assert.ok(on.includes('aria-pressed="true"'), "aria-pressed=true rendered");
    assert.ok(on.includes('class="tb-btn on"'), "ON keeps the .on class");
    assert.ok(on.includes("Auto-wrap panels: ON"), "ON label suffix unchanged");
    const off = toolbar(false);
    assert.ok(off.includes('aria-pressed="false"'), "aria-pressed=false rendered");
    assert.ok(off.includes('class="tb-btn"'), "OFF keeps the bare .tb-btn class");
    assert.ok(off.includes("Auto-wrap panels: OFF"), "OFF label suffix unchanged");
  });

  it("C2-demo: the statusbar's default .live text is byte-exact; storage-unavailable swaps only the save claim", () => {
    const def = renderToString(h(DemoStatusbar, null));
    assert.ok(def.includes(">" + LIVE_HINT_SAVED + "<"),
      "default .live hint is the golden-pinned string");
    assert.ok(!def.includes("NOT saved"), "no swap without the signal");
    const failed = renderToString(h(DemoStatusbar, { storageUnavailable: true }));
    assert.ok(failed.includes(">" + LIVE_HINT_STORAGE_UNAVAILABLE + "<"),
      "swapped tail on storage-unavailable");
    assert.ok(!failed.includes("· layout saved<"), "false save claim gone");
    // the swap is tail-only: the shared prefix is byte-identical
    assert.ok(LIVE_HINT_STORAGE_UNAVAILABLE.startsWith(
      LIVE_HINT_SAVED.slice(0, LIVE_HINT_SAVED.lastIndexOf("· layout saved"))));
    assert.ok(failed.includes("1 412 words · saved 12:04"),
      "word-count line unchanged (it is not a storage claim)");
  });
});
