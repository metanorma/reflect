# Mockup-parity oracle (Phase 2)

Test infrastructure ONLY — no minimap feature code. This directory builds the
oracle that later phases verify the `@metanorma/prosemirror-minimap` port
against: the frozen design mockup (committed at
[`docs/metanorma-editor-mockup.html`](../../docs/metanorma-editor-mockup.html),
served same-origin at `/mockups/metanorma-editor-mockup.html`)
captured as deterministic JSON golden masters, plus standing asserts that
prove the mockup's own invariants every run.

Phase-1 handoff: [`docs/parity.md`](../../docs/parity.md) (traceability,
invariants INV-1..22 + VAC-1..8, open questions Q1..Q15). Design decisions
are **not** made here; tooling-only choices are marked and listed at the
bottom for the Phase-3 gate to ratify.

## Running

From the repo root (server + browsers provisioned by the workspace's
`e2e:install` / `e2e:install-deps` scripts):

```sh
# verify (default): diff live runs against the recorded masters
yarn workspace @metanorma/prosemirror-minimap exec playwright \
  test --config=e2e/parity/playwright.config.ts

# record: regenerate masters/ (PW_PARITY_RECORD=1)
PW_PARITY_RECORD=1 yarn workspace @metanorma/prosemirror-minimap exec playwright \
  test --config=e2e/parity/playwright.config.ts

# side-by-side page (control bar + mockup iframe + package placeholder)
open http://localhost:3334/parity.html     # after starting harness/serve.mjs

# regenerate the coverage report after editing coverage.json
node pkg/prosemirror-minimap/e2e/parity/lib/gen-coverage-report.mjs
```

Spec files are `*.parity.ts` — the package's own e2e config matches only
`*.spec.ts`, so the two suites never pick up each other's tests. Both share
the same webServer (harness build + `harness/serve.mjs` on :3334, which also
serves `/mockups/…`, `/parity.html`, `/parity/*`, `/parity-data/*`).

## Layout

| Path | What |
|---|---|
| `playwright.config.ts` | chromium-only parity project; fixed 1600×900 viewport; reduced-motion emulation. |
| `scenarios/*.json` | Engine-agnostic fixture scripts (see "Scenario vocabulary"). |
| `lib/types.ts` | The shared contract: steps, `Frame`, `Census`, `MasterFile`, and the `MinimapAdapter` interface a Phase-4 package adapter implements. |
| `lib/mockupAdapter.ts` | The one adapter that exists today: drives the mockup through the step vocabulary and captures frames — DOM probes only, never closures. |
| `lib/invariantAsserts.ts` | Standing asserts over frames+census (INV-1..22 coverage; see `coverage.json`). Run in BOTH record and verify mode. |
| `lib/deviations.ts` + `deviations.json` + `DEVIATIONS.md` | Deviation-aware differ and its (empty) register. |
| `masters.parity.ts` | Record/verify per scenario; logs a sha256 per master — identical hashes across consecutive runs are the byte-stability proof. |
| `wear.parity.ts` | Clock-controlled wear spec: INV-21/22 standing asserts + the `wear-dwell` master (opacities). |
| `invariants.parity.ts` | Interactive standing tests: INV-1 drag round-trip, INV-2 census stability, INV-17 keyboard walk. |
| `coverage.json` / `coverage.md` | Machine-readable INV mapping + generated report (`coverage.parity.ts` validates consistency). |
| `masters/*.json` | Recorded masters — committed to the working tree. |
| `../../../harness/parity/` | The side-by-side page (`/parity.html`); smoke-tested by `parity-page.parity.ts`. |

## Scenario vocabulary (engine-agnostic)

```jsonc
{ "type": "reset" }                                  // scrollTop = 0, settle
{ "type": "scroll-fraction", "f": 0.5 }              // f of the exact doc-frame range
{ "type": "jump", "anchor": "cl-6-1-1-1-1-1-1" }     // revealEl's scrollIntoView center
{ "type": "zoom", "px": 9000 }                       // real grip drag to canvas height px
{ "type": "zoom-reset" }                             // grip double-click
{ "type": "dwell", "ms": 600 }                       // wait (clock-advanced in the wear spec)
{ "type": "lane-toggle", "lane": "diag" }            // legend chip click
{ "type": "drag-thumb", "f": 1 }                     // real thumb drag to f of the track
```

A later phase drives the PACKAGE harness (`/index.html`,
`window.__mnMount`) with the same JSON by implementing `MinimapAdapter`
(`lib/types.ts`). No fixture changes needed.

## Frame format (JSON, never pixels)

Per step: `scrollTop`, `geom` (scrollHeight/clientHeight/docTop0/docHeight/
canvasH/paneH), `thumb {top,height}`, `panY` (mmCanvas translateY),
`labels [{text,top,lv,active}]` (shown, sorted), `labelCount`,
`activeBlock {title,type,top,height}`, `activeCount`/`coPieceCount`/
`coPieceTitles`, `blockCount`, `lanes {<key>:{off,tickCount,ticks?}}` —
diag/com/search carry per-frame tick geometry; the wear lane carries count
only (its 210-tick geometry lives in the once-per-scenario `census`).
Floats are rounded at capture (3 decimals; 4 for wear opacities). Masters
carry no timestamps — byte-stable by construction.

## Determinism traps and their mitigations

| Trap (mockup source) | Mitigation |
|---|---|
| localStorage `mnmock-*` prefs (measure/vis/theme/mmzoom/about-seen) | `addInitScript` clears all `mnmock-*` keys, then seeds the default profile (`about-seen=1` kills the first-visit `#about` overlay; `mmzoom=''` = default 1:8 zoom). Fresh context per test. |
| auto-jump to `cl-5` at load+350ms (mockup:3088) | non-clock loads wait 500ms past it; every scenario's first step is an explicit `reset`. Under the faked clock, the adapter advances past the jump's deadline and verifies scrollTop control before returning (a leftover scroll animation fights assignments — measured). |
| `#canvas` `scroll-behavior:smooth` under `prefers-reduced-motion: no-preference` (mockup:171) | `page.emulateMedia({reducedMotion:'reduce'})` before load. NOTE: the Playwright `reducedMotion` **context option did not reach this Chromium build** (matchMedia still matched no-preference) — the explicit call does. Smooth scrolls fighting manual assignments was the single largest nondeterminism source (crawling auto-jump, reverted assignments, drifting dwell frames). |
| read-wear interval mutates wear-tick opacity every 250ms (mockup:2306-2314) | **Decision**: geometry masters EXCLUDE wear opacity and capture the wear lane structurally (count/geometry set at build); a dedicated clock-controlled spec (`wear.parity.ts`) owns opacity determinism — `page.clock` frozen during load (`install`+`pauseAt` BEFORE `goto`), advanced only in exact 250ms multiples. Verified empirically: `runFor(249)` fires nothing, `+1ms` fires exactly one tick. |
| fractional CSS values (`thumb.height`, etc.) | deterministic float math → rounded at capture to 3-4 decimals; no re-serialization noise. |
| layout/font environment | masters are environment-pinned (system font availability changes document layout). Byte-stability is proven within one environment, not across environments. |

**Byte-stability proof**: run verify twice; every master logs
`sha256=<hash> byteStable=<bool>`; two consecutive runs logging identical
hashes (and `byteStable=true`) constitute the proof. Established for all
four masters (3 geometry + 1 wear) in this environment.

## Deviations & coverage

- `deviations.json` — EMPTY register by design (Phase 2 ships strict).
  Schema + example: `DEVIATIONS.md`. Entries are `appliesTo: "package"`
  only; the mockup is never excused from its own baseline.
- `coverage.json` → `coverage.md` (generated) — INV-1..22 → standing
  asserts / deferred-unit, with scenario + frame-field references.
  18 standing, 4 deferred (INV-12, INV-14, INV-18, INV-20), 4 of the
  standing ones are the port-side `golden-master` tags (INV-2, INV-9,
  INV-13, INV-17).

## Open items for the decision gate

1. **Chromium `scrollIntoView({block:'center'})` bias** — lands with a
   deterministic ~52px offset vs the mathematical center (clause 9,
   measured; 0 drift afterwards; source unidentified). Masters pin the
   landings byte-exactly; the INV-17 assert uses a documented ±60px band.
2. **`reducedMotion` context option no-op** in this Playwright/Chromium
   combination (worked around with the explicit `emulateMedia` call). If a
   future Playwright fixes the context option, the adapter is unaffected.
3. **Frozen clock vs scroll animations** — under `page.clock.pauseAt`, an
   in-flight scroll animation (e.g. the auto-jump's) reverts manual
   `scrollTop` assignments until settled past. The adapter sequences around
   it; Phase-4 clock scenarios must respect the same ordering.
4. **Anonymous float titles collide** — floats without `numberMap` numbers
   (e.g. equations) all title as `block · depth ? · float`, so element
   identity via titles is ambiguous for them (affects INV-5/INV-14
   attribution; asserts are scoped accordingly).
5. **Wear master is clock-based** — a tooling choice; the alternative
   (excluding opacity everywhere, structure-only verification) is half
   implemented (geometry masters) and can be completed by dropping
   `wear.parity.ts` if the gate prefers.
6. **`zoom` step dy quantization** — mouse clientY is integer, so achieved
   canvas heights quantize slightly around the requested `px`; the mockup
   `Math.round`s the target anyway and masters pin the outcome.

## Tooling-only choices made (for gate ratification)

- Spec files named `*.parity.ts` (not `*.spec.ts`) so the pre-existing
  package e2e config — which cannot be edited from this phase's scope —
  does not double-run them.
- One census per scenario, captured after the first (reset) step: it
  documents the DEFAULT-build population; post-zoom rebuild states are
  covered per-frame.
- Lane tick geometry per frame for diag/com/search only; wear geometry in
  the census (master size).
- The wear spec lives in the same Playwright project; its master
  (`wear-dwell.json`) uses a frame format specialized to opacities.
- The side-by-side page pins `#canvas` scroll-behavior to `auto` after load
  (a page cannot emulate reduced-motion cross-frame) — dev-page-only, not
  part of the suite's capture path.
