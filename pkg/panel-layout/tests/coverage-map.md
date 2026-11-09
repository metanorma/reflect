# Coverage map — behavior.spec rows → test layers

Living audit artifact. Status as of **module 1 (PanelLayout, the
convergence task) landed** — every inventory module is promoted and the
reference mock is REWIRED onto the built artifact
(`/dist/mock/panel-layout.js`): parity runs against unchanged goldens
through the public composition, and the synthetic project (own browser
context) drives the seeded-storage/page-level rows. Follow-up loops (D2):
twin assembly + first twin parity run; the synthetic-suite audit beyond the
convergence rows.

Vocabulary: **Node** = `tests/*.test.mjs` · **parity** = characterized by
`tests/parity/mock.spec.ts` + goldens (direct flow) · **parity-indirect** =
exercised by a parity flow but not asserted on its own terms ·
**synthetic** = driven by the `synthetic` parity project (own browser
context, seeded storage / harness page) · **synthetic follow-up** = a
synthetic row that needs infrastructure this loop did not build (e.g. an
emulated reduced-motion context, a quota-exhausted storage) ·
**demo-frame** = demo-owned row, verified by the state frames
(`capture:states --check-only`), not this suite · **documented-gap** =
knowingly uncovered (spec'd "min:" candidate or hypothetical) · **N/A**.

## §2 Happy-path flows

| Row | Coverage |
|---|---|
| HP1 preset renders | parity ✔ (test 1, `state-hp1`) + Node §4 pins + Node §2.3 settled composition (`settled-signal.test.mjs`: ready-time load stand-in unobservable through the signal — it attaches at onReady) + Node wiring timing (`persistence-wiring.test.mjs`: HP1 init write once, heights key absent until the first pass, pass re-saves suppressed — two-key `wiring-Node` per D9) |
| HP2 unwrap | parity ✔ (tests 1, `state-hp2`, `trace-geometry-hp2`, `trace-zones`) + Node claim-composition (declined claim falls through to the veto backstop — mock two-listener semantics; foreign-viewId untouched) + Node `panelEdgeDropVeto` grid-target exemption (mock :1400). `elementFromPoint` hit-test + `unwrapAtPointer` sizing stay parity/synthetic |
| HP3 merge | parity ✔ (test 1, `state-hp3`) + Node veto tables (merge stays; float-target left/right vetoed) |
| HP4 group stack | parity ✔ (test 2, `state-hp4`) + Node `groupGridDropVeto`/`panelEdgeDropVeto` tables + Node fallback guards (`maybeUnwrapGroupAtPointer`: latch cleared at entry, relocated/docked/autoWrap-off declines) |
| HP5 window drag / park | parity ✔ (test 2, `state-hp5`) + Node `clampDragBox` table (incl. tall-window flip-guard cap) + Node gate retire-order sequence + Node §2.3 release net (mid-drag suppression → one `'layout'/'user'` at the flush, `settled-signal.test.mjs`) |
| HP6 resize | parity ✔ (test 2, `state-hp6`) + Node `pinGroup` guards + Node `commitHeights` (heights-only persist, §2.3 `'heights'` emit) + Node §2.3 composed-signal seam (`settled-signal.test.mjs`: `'heights'/'user'` delivered through the multicast emitter, no scheduled pass) + Node `dragTakeover` (target selection sash-above/bottom-last, frame math + 36/150/120 floors, §2.5 registry floors) — capture-phase DOM routing stays parity/synthetic (`wiring-Node` per D9) |
| HP7 auto-wrap OFF | parity ✔ (test 4, `state-hp7`) + Node veto tables (OFF branch values, `handleWillDrop` OFF path preventDefaults) |
| HP8 reload round-trip | parity ✔ (test 3, `state-hp8`) + Node persistence round-trip (envelope + two-key) + Node wiring composition (`persistence-wiring.test.mjs`: envelope dual-net interleave — change + heights-only commit keep both halves fresh, reload decodes both; two-key sync-write-before-pass timing) |
| HP9 reset | parity ✔ (test 5, `state-hp9`) + Node `clear()` (both formats) + the sync layout-save net the reset's layout-key rewrite re-emerges through is Node-pinned at the wiring seam (`persistence-wiring.test.mjs`, `wiring-Node` per D9) |
| HP10 empty | parity ✔ (test 5, `state-hp10`) |

## §3 State matrix (library rows)

| Row | Coverage |
|---|---|
| A4 first hydration settle | parity-indirect (HP1); grip timing via A4 row → Node ✔ (`titlebar.test.mjs`: safety-net structure — immediate paint + injected MutationObserver root `{childList,subtree}` + interval net, disposer, root/500ms defaults — `wiring-Node` per D9) + parity ✔ (`gotoLoaded` grip wait, `trace-chrome`); real late-window DOM timing is synthetic ✔ (`synthetic-panel.spec.ts` A4: an unwrap-minted window gains its grip within the interval-net bound) |
| A5 reload restore | parity ✔ (HP8) + Node load round-trip + Node wiring seeding (`loadHeights()` seed, preset walk) + Node facade seeding (`persistence-wiring.test.mjs`: HP1 init write pairs the restored layout with stored heights) |
| A6 corrupt layout | Node ✔ (`A6:` 4 tests incl. falsy-grid + signal event) + synthetic ✔ (`synthetic-storage.spec.ts`: seeded key → preset renders, storage healed; falsy-grid payload variant) |
| A7 corrupt heights | Node ✔ (`A7:` 4 tests, incl. array-payload + non-number rejection + signal event) + synthetic ✔ (array payload + non-number values → preset heights, session survives) |
| A8 stale group ids | Node ✔ (wiring rebuild: map rebuilt from live members on every pass) + synthetic ✔ (real closed windows: stale ids drop from the persisted map) + parity-indirect via HP8 |
| A9 fromJSON throws | Node ✔ (persistence fallback semantics) + component ✔ (`restoreLayout` net: catch → `layout-restore-threw` relay → `fromJSON(default)`; panelLayout.tsx — the page-level throw needs a structurally-bad engine payload, synthetic follow-up) |
| B1 empty editor | parity ✔ (HP10) + state frame `empty-editor.html` |
| B2 last window closes | parity-indirect (HP10) |
| B3 tabset before disposal | parity-indirect (HP4/HP10 sequences) |
| B4 tabset floor 36 | Node ✔ (`pinGroup` clamp + §2.5 registry floor) + parity-indirect (HP6) |
| B5 window floor 150 | parity-indirect (HP6 corner clamps) + Node ✔ (`resizeFrame` MIN_WIN_H clamp in dragTakeover tests) |
| B6 degenerate sash | documented-gap (only reachable via poisoned persisted heights; the sample guard prevents persisting such a frame — synthetic follow-up if a seedable path emerges) |
| C2 storage throws | Node ✔ (throwing storage, all ops + once-per-session `storage-unavailable` signal; the wiring facade relays the synchronous layout net's write failures through the same once-per-session signal — `persistence-wiring.test.mjs`); page session survival → synthetic follow-up (needs a quota-exhausted context) |
| C3 panel render throw | Node ✔ (`panelErrorBoundary.test.mjs`: derived-state→classless "Panel failed: <id>" fallback element, `componentDidCatch` console.error diagnostic, `wrapPanelComponent` registry-application seam — api.id→panelId, consumer as child — no-reset prop-change semantics, .tsx load smoke) — `wiring-Node` per D9; the live-dockview throw is synthetic ✔ (`synthetic-panel.spec.ts` C3: a throwing registry panel renders "Panel failed: <id>" inline through `wrapPanelComponent`, siblings + windows survive) |
| C4 toJSON fails | Node ✔ (stale-kept assertion + no storage signal) |
| D1/D2 container contract | parity-indirect (panels render at pinned heights); overflow assertion → synthetic follow-up |
| E1 long titles | documented-gap (spec "min: ellipsis") |
| E2 missing title | engine-stock (dockview's native `title ?? id` fallback is the last precedence rung; the layout→registry rungs are data plumbing) — parity-indirect |
| E3 narrow-width chrome | documented-gap (cosmetic) |
| F1 auto-wrap OFF | parity ✔ (HP7) |
| F2 titlebar move-only | parity ✔ (`trace-transitions` cursor states) + Node ✔ (`titlebar.test.mjs`: grip structure — append/aria-hidden/idempotence/barless skip — `suppressTitlebarGroupDrag` marker `__mnMoveOnly` + both-source disable + durability + feature-detection, `wiring-Node` per D9); cursor states + real engine reach-in stay parity/synthetic |
| F3 float-excluded drag | Node ✔ (`floatExclusionVeto` 4 tests + wiring: set/getter seams, registry re-derivation) + Node ✔ (`panelLayout.test.mjs`: `floatExcludedPanels` derivation, the demo's panel-id keying); affordance (cursor) → synthetic follow-up |
| F4 drag-live gating | Node ✔ (`clampDragBox` + wiring gate: live → no pass/no save, release reschedules + gate lifecycle: arm/cancel/dispose/wire, retire sequence order via injected seams — `wiring-Node` per D9) + parity ✔ (HP5); `normalizeTops` + zone-sweep DOM halves are parity-driven through the rewired mock (HP5 release assertions) |
| F5 zone suppression | parity ✔ (HP2 mid-drag, `trace-zones`) + Node ✔ wiring (`useDropRules` registration pattern, `.mn-unwrap-hover` toggle plumbing, null-area guard — `wiring-Node` per D9; retire sequence runs the sweep probe after the unwrap fallback — mock order) — the zone-element DOM sweep itself is parity-driven (HP2/HP7 zone states) |
| G1 roving tabindex | engine-stock (dockview 7.0.4 `tabs.js` roving tabindex + arrow/Home/End/Enter/Space/Delete/Backspace; never asserted absent in the mock) — the library surface for it is the G3 ring | 
| G2 keyboardNavigation | Node ✔ (`focus.test.mjs`: §2.1 owned-vs-passthrough split — owned four pinned to the mock's engine options (`transformFloatingGroupDrag` = `clampDragBox` by reference), `keyboardNavigation` passes verbatim in boolean + keymap forms, non-owned options by reference, undefined/empty inputs) — module 1 spreads `owned`+`passed` at the engine (LANDED: panelLayout.tsx assembles the engine props with owned last); ON-state key behavior is the engine's |
| G3 focus rings | Node ✔ (`focus.test.mjs`: file-content pins on the hand-authored `focus.css` — tab + group `:focus-visible` accent rules, NO sash rule (engine renders sashes unfocusable), no outline-removal anywhere (additive to dockview.css's suppression)) — rendered ring + stylesheet linking: the rewired mock links focus.css (verified by the parity pixel layer); the ring's :focus-visible keying is engine-behavior, synthetic follow-up |
| G5 close refocus | Node ✔ (`focus.test.mjs`: subscribe/dispose, restore on null AND on `document.body` (the G5 gap state), no steal when focus is placed (keyboard-close path), no active group → no-throw, one decision per scheduled close — `wiring-Node` per D9 via injected `activeElement`/`schedule` seams) — real DOM focus + engine close sequencing are synthetic ✔ (`synthetic-panel.spec.ts` G5: ✕ close restores focus into the layout) |
| G6 unwrap focus | synthetic ✔ (`synthetic-panel.spec.ts` G6: panel unwrap moves focus to the minted window's group) — implemented at module 4's claim seam per the convergence amendment (component observes the will-drop group change; no public engine event isolates an unwrap) |
| G7 keyboard undock | documented-gap (engine renders the titlebar unfocusable + grip decorative → no keyboard window-move; the G2 `keyboardNavigation` passthrough DOES surface the engine's ctrl+M keyboard docking when a consumer opts in) |
| G8 Esc cancel | documented-gap (engine wires `pointercancel` to commit; nothing free at the option-wiring level) |
| H1 RTL | documented-gap (spec: not supported, hypothetical) |
| I3 touch | N/A (spec: out of scope) |
| J1 drag ghost | parity-indirect (HP2 mid-drag screen) |
| J2 window move | parity-indirect (HP5) |
| J3 sash resize | parity ✔ (HP6) |
| J4 zone transitions | parity ✔ (`trace-transitions`/`trace-zones` timings) + Node ✔ (`tokens.test.mjs`: panel-layout.css carries the suppression rule pair — hide-all four zone kinds under `.mn-unwrap-hover`, re-show the four inside `.dv-resize-container` — the J4 "suppression is instant `display:none`" half; the 70ms/300ms stock timings are the engine's) |
| J5 sash hover accent | parity ✔ (`trace-transitions` 0.1s/0.5s) + Node ✔ (`tokens.test.mjs`: panel-layout.css carries both accent surfaces — stock grid sashes (`dv-enabled:hover`/`dv-active-sash`) and float-window takeover sashes (`cursor:ns-resize` + accent) — the transition vars themselves are the engine's theme vars) |
| J6 maximize | N/A (unused) |
| J7 reduced motion | Landed (convergence): the `@media (prefers-reduced-motion: reduce)` var-zeroing block (J4 zone fades + J5 sash accent) lives in `panel-layout.css` (hand-owned since the D45 decommission; the mock's inline copy was deleted with the pipeline, parity-pinned). The rendered-motion assertion under an emulated reduced-motion context is synthetic follow-up. Note: engine 7.0.4 `dockview.css` ships its own reduced-motion block, but it covers `.dv-tab`/`.dv-tab-group-chip` transitions only, not J4 zone overlays or J5 sash hovers |

## Demo-owned rows (demo.spec.md — verified by frames, not this suite)

A1/A2 boot pending/slow (mock inline) · A3/C1 CDN failure (`cdn-failure.html`)
· I1/I2 narrow viewport (`narrow-viewport.html`) · G4 toolbar focus (demo
chrome).

Landed with the demo surface (D38/D39): the demo material lives in
`@metanorma/panel-layout/demo` (`demo/`, mounted by the thinned mock as
`DemoApp`). **F1n** toggle a11y — `aria-pressed` now rendered on the
auto-wrap toggle (attribute-only; feeds F1/HP7 above): Node ✔
(`demo.test.mjs` renders `DemoToolbar` and pins the attribute + unchanged
label/class). **C2 demo half** — the statusbar `.live` save claim swaps
to "layout NOT saved — storage unavailable" when `onDidFallback` signals
`storage-unavailable` (never in the parity environment, so goldens pin
the default string): Node ✔ (same file, byte-exact default + tail-only
swap). demo.spec.md §2's F1n and C2n rows are folded to current state.

## §4 Defaults

Node ✔ — `tokens.test.mjs` pins every spec-cited value; byte-consistency
between `design-tokens.json` and `panel-layout.css` is owned by the
in-suite cross-checks (the `tokens:check` pipeline retired at the D45
decommission — both artifacts are hand-owned). Module 10 added:
promotion-surface pins (budgeted
`CONSTANTS`/`TOKENS`/`DV_TOKENS` public, engine-option/storage-key/
provenance views internal), token cardinals (18 `:root` / 20 dv-theme),
and the both-directions pins — `:root`/dv-theme declarations parsed out of
`panel-layout.css` deep-equal `TOKENS`/`DV_TOKENS` — plus the scope guard
(no demo selectors, no HTML/importmap fragments in the artifact; the
retroactive catcher for the D29 gripHover overrun).

## Audit procedure (at convergence)

1. Re-walk each row against the landed layers (Node, synthetic, parity);
   update statuses; delete the "planned" vocabulary entries that landed.
2. Remaining `documented-gap` rows are either scheduled (issue) or accepted
   (note here) — no silent gaps.
3. Check test names still start with row IDs (mechanical:
   `grep -E "it\(|test\(" tests/*.test.mjs tests/parity/*.spec.ts`).
