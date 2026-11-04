/**
 * Headless tests for @metanorma/panel-layout — per-panel error boundary
 * (docs/behavior.spec.md row C3): a consumer panel component that throws
 * in render shows an inline "Panel failed: <id>" state instead of
 * unmounting the layout tree.
 *
 * Run: yarn workspace @metanorma/panel-layout test
 *
 * BOUNDARY (explicit decision): React's SERVER renderer does not exercise
 * error boundaries — react-dom/server (19.2.7, verified) unwinds the tree
 * and RETHROWS instead of committing a fallback, so a renderToString-based
 * throw test would assert React's failure mode, not the boundary. The
 * throw path is therefore driven through the class-component lifecycle
 * directly (construct → healthy render → getDerivedStateFromError →
 * componentDidCatch → render → fallback element), which is exactly the
 * seam a browser commit exercises. renderToString still covers the healthy
 * render-through case and the module-load smoke (the package's first .tsx
 * artifact). The live-dockview render (a real throwing panel mounted in
 * the layout) stays synthetic-planned: `synthetic-error-boundary.spec.ts`
 * per tests/README.md — it needs the convergence task's page harness.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";

import {
  PanelErrorBoundary,
  wrapPanelComponent,
} from "../compiled/panelErrorBoundary.js";

/** Drive the boundary through the exact lifecycle a browser commit runs. */
function boundaryFor(panelId, children) {
  return new PanelErrorBoundary({ panelId, children });
}

describe("panel error boundary (C3)", () => {
  it("C3: healthy panel renders through the boundary", () => {
    const child = React.createElement("p", null, "panel content");
    const b = boundaryFor("outline", child);
    assert.equal(b.render(), child, "children element returned unchanged");

    const html = renderToString(
      React.createElement(PanelErrorBoundary, { panelId: "outline" }, child),
    );
    assert.equal(html, "<p>panel content</p>");
  });

  it("C3: render throw → inline 'Panel failed: <id>' fallback, not a crash", () => {
    const b = boundaryFor("nav-3", React.createElement("p", null, "never"));
    // healthy first: state initialized, no fallback
    assert.notEqual(b.render().type, "div");

    const err = new Error("kaboom");
    const state = PanelErrorBoundary.getDerivedStateFromError(err);
    b.state = state;

    const fallback = b.render();
    assert.equal(fallback.type, "div");
    assert.equal(fallback.props.className, undefined, "classless fallback (no invented CSS)");
    assert.deepEqual(fallback.props.children, ["Panel failed: ", "nav-3"]);
  });

  it("C3: componentDidCatch logs the panel id and error via console.error", () => {
    const b = boundaryFor("inspector");
    const original = console.error;
    const calls = [];
    console.error = (...args) => calls.push(args);
    try {
      const err = new Error("render threw");
      b.state = PanelErrorBoundary.getDerivedStateFromError(err);
      b.componentDidCatch(err);
    } finally {
      console.error = original;
    }
    assert.equal(calls.length, 1);
    assert.match(String(calls[0][0]), /panel render failed \(inspector\)/);
    assert.equal(calls[0][1].message, "render threw");
  });

  it("C3: wrapPanelComponent wires api.id → panelId and the consumer element as child", () => {
    const Consumer = () => React.createElement("div", null, "consumer panel");
    const wrapped = wrapPanelComponent(Consumer);
    const props = { api: { id: "pinned-2" }, params: { a: 1 } };

    const el = wrapped(props);
    assert.equal(el.type, PanelErrorBoundary, "wrapper renders the boundary");
    assert.equal(el.props.panelId, "pinned-2", "panelId from dockview api.id");
    assert.equal(el.props.children.type, Consumer, "consumer as boundary child");
    // React.createElement copies the config into a fresh props object, so
    // identity cannot hold; faithful passthrough is content equality.
    assert.deepEqual(el.props.children.props, props, "consumer props passed through intact");
  });

  it("C3: failed state persists across a panelId prop change (no reset — React state semantics)", () => {
    const err = new Error("boom");
    const b = boundaryFor("old-id", React.createElement("p", null, "x"));
    b.state = PanelErrorBoundary.getDerivedStateFromError(err);

    // panelId is a prop; React keeps component state across prop changes.
    // The boundary deliberately ships no reset API (C3 minimum).
    const el = b.render();
    assert.deepEqual(el.props.children, ["Panel failed: ", "old-id"]);

    b.props = { panelId: "new-id", children: React.createElement("p", null, "y") };
    const el2 = b.render();
    assert.deepEqual(
      el2.props.children,
      ["Panel failed: ", "new-id"],
      "still failed; the id in the fallback follows the current prop",
    );
  });

  it("C3: compiled .tsx module loads and renders under the Node harness", () => {
    // the package's first .tsx artifact: guards the jsx/tsconfig/loader path
    assert.equal(typeof PanelErrorBoundary, "function");
    const html = renderToString(
      React.createElement(
        PanelErrorBoundary,
        { panelId: "smoke" },
        React.createElement("em", null, "fine"),
      ),
    );
    assert.equal(html, "<em>fine</em>");
  });
});
