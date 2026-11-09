/**
 * Headless tests for @metanorma/panel-layout — focus/keyboard layer
 * (docs/behavior.spec.md rows G2, G3, G5; api.spec.md §3 module 9).
 *
 * Run: yarn workspace @metanorma/panel-layout test
 *
 * BOUNDARY (explicit decision, `wiring-Node` per D9):
 * - G2 (option split) is PURE — the whole contract is Node-assertable.
 * - G3 (focus rings) is asserted as FILE-CONTENT pins on the hand-authored
 *   `focus.css`: rule presence, accent-token use, the deliberate absence
 *   of a sash rule (engine-verified unfocusable), and additivity (no
 *   `outline:none` anywhere — the engine's suppression is never edited).
 *   The RENDERED ring (a browser focusing a tab) stays synthetic-planned
 *   (`synthetic-focus.spec.ts`); nothing here fakes a focus event.
 * - G5 (close-refocus wiring) drives the injected seams only
 *   (`activeElement`/`schedule`), with a scoped `globalThis.document` stub
 *   for the `document.body` comparison — the titlebar.test.mjs pattern.
 *   Real DOM focus behavior stays parity/synthetic.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  LIBRARY_DOCKVIEW_OPTIONS,
  OWNED_DOCKVIEW_OPTION_KEYS,
  splitDockviewOptions,
  wireFocusRestoration,
} from "../compiled/focus.js";
import { clampDragBox } from "../compiled/windowDrag.js";

const focusCss = readFileSync(
  fileURLToPath(new URL("../focus.css", import.meta.url)),
  "utf8",
);

// ---------------------------------------------------------------------------
// G2 — the §2.1 owned-vs-passthrough option contract
// ---------------------------------------------------------------------------

describe("focus: splitDockviewOptions (G2, api.spec §2.1)", () => {
  it("G2: consumer values for the OWNED keys are ignored — owned half is always the library's", () => {
    const { owned, passed } = splitDockviewOptions({
      dndStrategy: "html5", // must NOT pass through
      floatingGroupBounds: "boundedWithinViewport", // must NOT pass through
      floatingGroupDragHandle: "tabbar", // must NOT pass through
      transformFloatingGroupDrag: () => ({ top: 0, left: 0 }), // must NOT pass through
      keyboardNavigation: true,
    });
    assert.equal(owned.dndStrategy, "pointer");
    assert.equal(owned.floatingGroupDragHandle, "titlebar");
    assert.deepEqual(owned.floatingGroupBounds, {
      minimumHeightWithinViewport: 0,
      minimumWidthWithinViewport: 0,
    });
    assert.equal("transformFloatingGroupDrag" in passed, false);
  });

  it("G2: owned values are pinned to the mock's engine options (extraction @ 94d4b8307e5f0db2a1b32e14ceb8754207a51f27) and FLOATING_GROUP_BOUNDS", () => {
    assert.deepEqual(
      [...OWNED_DOCKVIEW_OPTION_KEYS],
      [
        "dndStrategy",
        "floatingGroupBounds",
        "floatingGroupDragHandle",
        "transformFloatingGroupDrag",
      ],
    );
    assert.equal(LIBRARY_DOCKVIEW_OPTIONS.dndStrategy, "pointer");
    assert.equal(LIBRARY_DOCKVIEW_OPTIONS.floatingGroupDragHandle, "titlebar");
    assert.deepEqual(LIBRARY_DOCKVIEW_OPTIONS.floatingGroupBounds, {
      minimumHeightWithinViewport: 0,
      minimumWidthWithinViewport: 0,
    });
    // reference identity — module 1 spreads this exact clamp into the engine
    assert.strictEqual(
      LIBRARY_DOCKVIEW_OPTIONS.transformFloatingGroupDrag,
      clampDragBox,
    );
  });

  it("G2: keyboardNavigation rides the passthrough VERBATIM, boolean and keymap-object forms", () => {
    const boolForm = splitDockviewOptions({ keyboardNavigation: true });
    assert.equal(boolForm.passed.keyboardNavigation, true);
    const keymapForm = splitDockviewOptions({
      keyboardNavigation: { keymap: { nextTab: "ctrl+arrowright" } },
    });
    assert.deepEqual(keymapForm.passed.keyboardNavigation, {
      keymap: { nextTab: "ctrl+arrowright" },
    });
  });

  it("G2: every non-owned option passes through verbatim (same reference, no cloning)", () => {
    const dndEdges = { size: { value: 160, type: "pixels" } };
    const themeLight = { name: "light" };
    // a react-layer prop smuggled into dockviewOptions RIDES passed verbatim
    // (the split is core-options-scoped); the engineProps force that
    // overrides it lives in the component render — Node-unreachable, parity
    // covers the default path
    const myTab = () => null;
    const { passed } = splitDockviewOptions({
      dndEdges,
      theme: themeLight,
      disableDnd: false,
      locked: true,
      defaultTabComponent: myTab,
    });
    assert.equal(passed.dndEdges, dndEdges);
    assert.equal(passed.theme, themeLight);
    assert.equal(passed.disableDnd, false);
    assert.equal(passed.locked, true);
    assert.strictEqual(passed.defaultTabComponent, myTab);
    assert.equal("dndStrategy" in passed, false);
    assert.equal("floatingGroupBounds" in passed, false);
    assert.equal("floatingGroupDragHandle" in passed, false);
    assert.equal("transformFloatingGroupDrag" in passed, false);
  });

  it("G2: undefined and empty consumer input → owned defaults, empty passed half", () => {
    assert.deepEqual(splitDockviewOptions(undefined).passed, {});
    assert.deepEqual(splitDockviewOptions({}).passed, {});
    assert.equal(
      splitDockviewOptions(undefined).owned.dndStrategy,
      "pointer",
    );
    // undefined-valued keys are dropped, not re-emitted (exactOptionalPropertyTypes)
    const { passed } = splitDockviewOptions({ keyboardNavigation: undefined });
    assert.equal("keyboardNavigation" in passed, false);
  });
});

// ---------------------------------------------------------------------------
// G3 — the focus ring stylesheet (file-content pins on focus.css)
// ---------------------------------------------------------------------------

describe("focus: focus.css ring rules (G3)", () => {
  it("G3: tabs get a :focus-visible accent outline (the G1 roving-tabindex surface)", () => {
    assert.match(focusCss, /\.layoutArea \.dv-tab:focus-visible\s*\{/);
    assert.match(focusCss, /outline:\s*2px solid var\(--accent\)/);
    assert.match(focusCss, /outline-offset:\s*-2px/);
  });

  it("G3: the group container gets a :focus-visible companion (G5 restore + F6 navigation focus target)", () => {
    assert.match(focusCss, /\.layoutArea \.dv-groupview:focus-visible\s*\{/);
  });

  it("G3: NO sash focus rule — the engine renders sashes unfocusable (dockview-core 7.0.4 splitview.js)", () => {
    assert.equal(/\.dv-sash[^}]*:focus-visible/.test(focusCss), false);
    assert.equal(focusCss.includes(".dv-sash:focus-visible"), false);
  });

  it("G3: additive to the engine's suppression — focus.css never writes outline:none", () => {
    // dockview.css:2503 owns `.dv-groupview:focus{outline:none}`; the ring
    // must WIN by :focus-visible + source order, never by editing it.
    assert.equal(/outline:\s*none|outline-none/.test(focusCss), false);
  });
});

// ---------------------------------------------------------------------------
// G5 — focus restoration after a panel close (injected-seam wiring)
// ---------------------------------------------------------------------------

describe("focus: wireFocusRestoration (G5)", () => {
  /**
   * api fake exposing exactly the seams the wiring touches:
   * onDidRemovePanel (subscription + dispose) and activeGroup.focus().
   * A fake ELEMENT graph answers the focus probe.
   */
  function fakeApi() {
    const subs = [];
    const focusCalls = [];
    let activeGroup = null;
    return {
      subs,
      focusCalls,
      setActiveGroup(g) { activeGroup = g; },
      onDidRemovePanel(cb) {
        subs.push(cb);
        return {
          dispose() { subs.splice(subs.indexOf(cb), 1); },
        };
      },
      get activeGroup() { return activeGroup; },
    };
  }

  /** Scheduled task recorder — the injectable `schedule` seam. */
  function manualSchedule() {
    const tasks = [];
    return {
      tasks,
      schedule(fn) { tasks.push(fn); },
      run() { for (const t of tasks.splice(0)) t(); },
    };
  }

  function withBodyStub(fn) {
    const saved = globalThis.document;
    globalThis.document = { body: { tag: "body-fake" } };
    try {
      fn(globalThis.document.body);
    } finally {
      globalThis.document = saved;
    }
  }

  it("G5: subscribes on api.onDidRemovePanel and dispose() unsubscribes", () => {
    const api = fakeApi();
    const r = wireFocusRestoration(api, {
      activeElement: () => null,
      schedule: manualSchedule().schedule,
    });
    assert.equal(api.subs.length, 1);
    r.dispose();
    assert.equal(api.subs.length, 0);
  });

  it("G5: focus nowhere (null) after close → activeGroup.focus() restores it", () => {
    const api = fakeApi();
    const group = { focus() { api.focusCalls.push("g1"); } };
    api.setActiveGroup(group);
    const sched = manualSchedule();
    wireFocusRestoration(api, {
      activeElement: () => null,
      schedule: sched.schedule,
    });
    api.subs[0]({ id: "p1" }); // close event
    assert.equal(api.focusCalls.length, 0, "restore is deferred, not sync");
    sched.run();
    assert.deepEqual(api.focusCalls, ["g1"]);
  });

  it("G5: focus on document.body after a mouse-close ✕ → restored (the G5 gap state)", () => {
    withBodyStub((body) => {
      const api = fakeApi();
      const group = { focus() { api.focusCalls.push("g1"); } };
      api.setActiveGroup(group);
      const sched = manualSchedule();
      wireFocusRestoration(api, {
        activeElement: () => body,
        schedule: sched.schedule,
      });
      api.subs[0]({ id: "p1" });
      sched.run();
      assert.deepEqual(api.focusCalls, ["g1"]);
    });
  });

  it("G5: focus already placed (keyboard-close neighbor refocus) → no focus steal", () => {
    withBodyStub(() => {
      const api = fakeApi();
      const group = { focus() { api.focusCalls.push("g1"); } };
      api.setActiveGroup(group);
      const sched = manualSchedule();
      const tabEl = { tag: "dv-tab" };
      wireFocusRestoration(api, {
        activeElement: () => tabEl,
        schedule: sched.schedule,
      });
      api.subs[0]({ id: "p1" });
      sched.run();
      assert.deepEqual(api.focusCalls, [], "focus inside the layout is left alone");
    });
  });

  it("G5: no active group (everything closed → B1 watermark) → no-throw, no focus", () => {
    withBodyStub(() => {
      const api = fakeApi();
      api.setActiveGroup(undefined);
      const sched = manualSchedule();
      wireFocusRestoration(api, {
        activeElement: () => null,
        schedule: sched.schedule,
      });
      api.subs[0]({ id: "last" });
      sched.run(); // must not throw
      assert.deepEqual(api.focusCalls, []);
    });
  });

  it("G5: only the scheduled task runs the decision — a second close with focus placed stays silent", () => {
    withBodyStub(() => {
      const api = fakeApi();
      const group = { focus() { api.focusCalls.push("g1"); } };
      api.setActiveGroup(group);
      const sched = manualSchedule();
      let active = null;
      wireFocusRestoration(api, {
        activeElement: () => active,
        schedule: sched.schedule,
      });
      api.subs[0]({ id: "p1" });
      sched.run();
      assert.equal(api.focusCalls.length, 1);
      active = { tag: "somewhere-else" }; // consumer moved focus meanwhile
      api.subs[0]({ id: "p2" });
      sched.run();
      assert.equal(api.focusCalls.length, 1, "second close left focus alone");
    });
  });
});
