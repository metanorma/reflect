# INV coverage report (generated)

Generated from `coverage.json` by `lib/gen-coverage-report.mjs` — do not
edit by hand. Source of truth for the invariant list: `pkg/prosemirror-minimap/docs/parity.md`
Part B (Phase-1 handoff).

- **22 of 22** live invariants carry standing asserts in this
  suite (run on every execution, record and verify alike).
- **0** are deferred to the port's unit suite: .
- **4** re-verify against the package adapter through this suite's masters
  (INV-2, INV-9, INV-13, INV-17) — parity.md Part B `golden-master` tags — crossing
  `fixtures/substitution.json` (README "Fixture bridge").
- **2** carry a pending-gate marker on port-side semantics:
  - INV-17 — Q8
  - INV-20 — D6

| INV | Parity method | Mockup-side coverage | Scenarios | Port verification |
|---|---|---|---|---|
| INV-1 | unit | standing-assert | default-sweep | deferred-unit |
| INV-2 | golden-master | standing-assert | default-sweep, zoom-mid, lane-toggles | golden-master |
| INV-3 | unit | standing-assert (partial: gap floors) | default-sweep, zoom-mid, lane-toggles | deferred-unit |
| INV-4 | unit | standing-assert (partial: containment) | default-sweep, zoom-mid, lane-toggles | deferred-unit |
| INV-5 | unit | standing-assert | default-sweep, zoom-mid, lane-toggles | deferred-unit |
| INV-6 | unit | standing-assert (partial: exercised denominators) | default-sweep, zoom-mid, lane-toggles | deferred-unit |
| INV-7 | unit | standing-assert (partial: exercised denominators) | default-sweep, zoom-mid | deferred-unit |
| INV-8 | unit | standing-assert (partial: identity + monotonicity + clamp bounds) | default-sweep, zoom-mid | deferred-unit |
| INV-9 | golden-master | standing-assert (partial: always-shown + identity) | default-sweep, zoom-mid, lane-toggles | golden-master |
| INV-10 | unit | standing-assert (partial: strip tiling) | default-sweep, zoom-mid, lane-toggles | deferred-unit |
| INV-11 | unit | standing-assert | default-sweep | deferred-unit |
| INV-12 | unit | standing-assert (partial: resize stability + rebuild observability) | zoom-mid | deferred-unit |
| INV-13 | golden-master | standing-assert | zoom-mid, fit-all, themes | golden-master |
| INV-14 | unit | standing-assert | default-sweep | deferred-unit |
| INV-15 | unit | standing-assert | default-sweep, zoom-mid, lane-toggles | deferred-unit |
| INV-16 | unit | standing-assert (partial: exact 8px floor; share model banded) | default-sweep, zoom-mid, lane-toggles | deferred-unit |
| INV-17 | golden-master — pending gate: Q8 | standing-assert | keyboard-walk | golden-master |
| INV-18 | unit | standing-assert | default-sweep | deferred-unit |
| INV-19 | unit | standing-assert (partial: bounds) | default-sweep, zoom-mid, lane-toggles | deferred-unit |
| INV-20 | unit — pending gate: D6 | standing-assert | default-sweep | deferred-unit |
| INV-21 | unit | standing-assert | wear-dwell | deferred-unit |
| INV-22 | unit | standing-assert (partial: period + determinism) | wear-dwell | deferred-unit |

