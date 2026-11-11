# INV coverage report (generated)

Generated from `coverage.json` by `lib/gen-coverage-report.mjs` — do not
edit by hand. Source of truth for the invariant list: `pkg/prosemirror-minimap/docs/parity.md`
Part B (Phase-1 handoff).

- **18 of 22** live invariants carry standing asserts in this
  suite (run on every execution, record and verify alike).
- **4** are deferred to the port's unit suite: INV-12, INV-14, INV-18, INV-20.
- **4** re-verify against the package adapter through this suite's masters
  (INV-2, INV-9, INV-13, INV-17) — parity.md Part B `golden-master` tags.

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
| INV-12 | unit | deferred-unit — Driving a pane resize deterministically changes every geometry field at once (viewport-level resize), and the scenario vocabulary has no pane-resize step; the mockup's >2px guard is structural to its rebuild-from-resize architecture, which the port does not share (VAC-5). | — | deferred-unit |
| INV-13 | golden-master | standing-assert | zoom-mid | golden-master |
| INV-14 | unit | deferred-unit — Requires attributing a lane tick to its element; the mockup's mmBlockFor ancestor walk lives in closures and leaves no DOM trace on the tick. | — | deferred-unit |
| INV-15 | unit | standing-assert | default-sweep, zoom-mid, lane-toggles | deferred-unit |
| INV-16 | unit | standing-assert (partial: exact 8px floor; share model banded) | default-sweep, zoom-mid, lane-toggles | deferred-unit |
| INV-17 | golden-master | standing-assert | default-sweep | golden-master |
| INV-18 | unit | deferred-unit — Same tick→element attribution gap as INV-14; the never-travels half becomes meaningful with the package's span hit-test, proven in its unit suite. | — | deferred-unit |
| INV-19 | unit | standing-assert (partial: bounds) | default-sweep, zoom-mid, lane-toggles | deferred-unit |
| INV-20 | unit | deferred-unit — No strip-pointer step type in the scenario vocabulary yet (the strip's setPointerCapture also resists synthetic events). | — | deferred-unit |
| INV-21 | unit | standing-assert | wear-dwell | deferred-unit |
| INV-22 | unit | standing-assert (partial: period + determinism) | wear-dwell | deferred-unit |

