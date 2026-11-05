# panel-layout tests

Two enforcement layers, one deferred layer, all keyed to
[`../docs/behavior.spec.md`](../docs/behavior.spec.md) row IDs (test names
start with their row — `A6: …`, `HP4: …` — so task-package RETURN item 3
stays mechanically traceable).

## Layer model

| Layer | Where | Runs | Covers |
|---|---|---|---|
| **Node** | `tests/*.test.mjs` | `yarn workspace @metanorma/panel-layout test` (via root `yarn test`) | Pure seams: injected storage, decision tables, math, token pins |
| **Parity** | `tests/parity/mock.spec.ts` | `yarn workspace @metanorma/panel-layout parity` | The DOM-coupled behavior of the whole surface, characterized against `mock/goldens/` |
| **Synthetic** | `tests/parity/synthetic-storage.spec.ts` + `synthetic-panel.spec.ts` | same `parity` run, `synthetic` project | Seeded-storage states (A6/A7/A8, HP9-from-dirty), the live error boundary (C3), late-window grip timing (A4), focus restoration (G5/G6) — driven against the rewired mock + the harness page (`tests/parity/harness.html`, tracked) that instantiates the built artifact with a test registry |

Rule: **DOM rows are never faked in Node.** A faked `getBoundingClientRect`
tests the fake. Until the synthetic layer lands, DOM-coupled rows are covered
by parity (GREEN 1) and their task packages say so explicitly.

## Node harness mechanics

- `node:test` + `node:assert/strict`, `.mjs` files importing
  **`../compiled/*.js`** — never source TS. `pretest` (`yarn compile`)
  refreshes `compiled/` so tests never run stale output.
- `test-register.mjs` → `test-loader.mjs`: a `load` hook giving `.json`
  URLs the `json` module format. Required because tsc emits the
  `design-tokens.json` import without Node's mandatory
  `with { type: "json" }` attribute; nothing else is rewritten (the
  runtime-import rule guarantees zero engine imports in compiled output).
- Shared fakes live in `helpers.mjs`, each sized to the exact seams the
  module under test touches (see headers there for the boundary policy).
- Glob form `"tests/*.test.mjs"` requires Node ≥ 21 test-runner globbing
  (verified on this container). Older CI Node: switch to explicit
  enumeration, the `editor-commands` precedent.

## Per-module riders (appended to each implementation task package)

Standard clauses for every rider: (a) new tests go in the file named below,
named `ROWID: assertion`; (b) rows marked **[parity]** are covered by GREEN 1
until the synthetic layer lands — do not fake DOM in Node, and needing a
browser harness to prove green is an ESCALATE, not a side-harness; (c) the
existing 48 tests may not be weakened — a pin that must change is an
ESCALATE with the spec row it contradicts.

| Module | Node additions (in-task) | [parity] until synthetic |
|---|---|---|
| 1 `panelLayout.tsx` | `floatExcludedPanels(registry)` derivation (F3); title precedence layout→registry→id (E2) if extracted pure | HP1/F1/G2/HP7 wiring |
| 2 `persistence.ts` | already pinned (`persistence.test.mjs`); extend only if its surface grows | — |
| 3 `pinHeights.ts` | `pinGroup` pinned; only pure helpers if any emerge | measurement/reconcile/pin pass (HP4/HP6, A4/A5/A8, B5/B6) |
| 4 `unwrap.ts` | veto tables pinned; any new pure predicate gets table tests | grid-surface claims (HP2/HP7, F5), unwrap sizing |
| 5 `windowDrag.ts` | `clampDragBox` pinned | normalizeTops, drag gate (HP5/F4 DOM side) |
| 6 `dragTakeover.ts` | `pickResizeTarget`/`resizeFrame` pinned (target selection + frame math + floors, extracted pure from the mock block) | capture-phase listener wiring, overlay positioning, reconcile+commit sequencing (HP6 DOM side) |
| 7 `titlebar.ts` | structure + wiring pinned (`titlebar.test.mjs`: grip append/aria-hidden/idempotence/barless skip; `__mnMoveOnly` marker, both-source disable, durability, feature-detection; safety-net paint/observer/interval/dispose/defaults) | F2 cursor states, real engine reach-in, late-window DOM timing |
| 8 error boundary | fallback model pinned (`panelErrorBoundary.test.mjs`, driving the class lifecycle directly — react-dom/server rethrows rather than exercising boundaries): throw → classless "Panel failed: <id>" div, `componentDidCatch` diagnostic, `wrapPanelComponent` seam, no-reset semantics, .tsx smoke | C3 → `synthetic-error-boundary.spec.ts` on landing |
| 9 focus/keyboard | option split + CSS pins + refocus wiring pinned (`focus.test.mjs`: G2 owned-vs-passthrough table incl. `keyboardNavigation` verbatim forms; G3 file-content pins on hand-authored `focus.css` — tab/group accent `:focus-visible`, no sash rule, additivity; G5 injected-seam wiring — restore/null/body/no-steal/no-group) | G1–G3, G5–G8 rendered/DOM halves → `synthetic-focus.spec.ts` on landing |
| 10 theming/tokens | pinned in `tokens.test.mjs`; JSON↔CSS consistency cross-checked in-suite (the `tokens:check` pipeline retired at D45 — `panel-layout.css` and `design-tokens.json` are hand-owned) | J4/J5 visuals |

Synthetic-layer specs (landed with the convergence task):
`synthetic-storage.spec.ts` (A6/A7/A8/HP9-from-dirty seeding via
`addInitScript`) and `synthetic-panel.spec.ts` (C3 live throw, A4 grip
timing, G5/G6 focus — through `tests/parity/harness.html`, a tracked harness
page that instantiates `/dist/mock/panel-layout.js` with a test registry;
the demo preset loads from `mock/design-tokens.json` so the geometry
matches the parity pages). Deferred rows (pin-pass measurement precedence,
`overGridSurface` branches, quota-exhausted C2, emulated reduced-motion J7)
are recorded as synthetic follow-up in coverage-map.md. Each Playwright
project keeps its **own browser context** — `addInitScript` seeding runs on
every page load of its context, and a shared context would re-seed storage
under the plain parity pages.
