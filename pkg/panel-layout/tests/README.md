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
| **Synthetic** (later) | `tests/parity/synthetic*.spec.ts` | same `parity` run, `synthetic` project | Seeded-storage states, pin-pass measurement, grid-surface veto branches, error boundary, focus — arrives with the convergence task (mock consuming `dist/mock/panel-layout.js`) |

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
| 6 `dragTakeover.ts` | — (capture-phase DOM routing) | HP6 entirely |
| 7 `titlebar.ts` | — (DOM decoration + reach-in) | F2, A4 grip timing |
| 8 error boundary | pure fallback-model function if one is extracted | C3 → `synthetic-error-boundary.spec.ts` on landing |
| 9 focus/keyboard | — (CSS + option wiring) | G1–G3, G5–G8 → `synthetic-focus.spec.ts` on landing |
| 10 theming/tokens | pinned in `tokens.test.mjs`; drift owned by `tokens:check` | J4/J5 visuals |

Synthetic-layer specs (when the convergence task lands, per the staged plan):
`synthetic-storage.spec.ts` (A6/A7/A8/C2/HP9 seeding via `addInitScript`),
`synthetic-pin.spec.ts` (precedence + sample guards; `chromeOf` with ±1px
tolerance — never pixel-equality), `synthetic-vetoes.spec.ts`
(`overGridSurface` branches, `unwrapAtPointer`), plus the module 8/9 riders
above. Each Playwright project keeps its **own browser context** —
`addInitScript` seeding runs on every page load of its context, and a shared
context would re-seed storage under the plain parity pages.
