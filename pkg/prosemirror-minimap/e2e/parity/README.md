# Mockup-parity oracle (Phase 2)

Test infrastructure ONLY — no minimap feature code. This directory builds the
oracle that later phases verify the `@metanorma/prosemirror-minimap` port
against: the frozen design mockup (committed at
[`docs/metanorma-editor-mockup.html`](../../docs/metanorma-editor-mockup.html),
served same-origin at a stable route pinned in `lib/env.ts` (`MOCKUP_URL`))
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

# record: regenerate masters/ and fixtures/ (PW_PARITY_RECORD=1)
PW_PARITY_RECORD=1 yarn workspace @metanorma/prosemirror-minimap exec playwright \
  test --config=e2e/parity/playwright.config.ts

# side-by-side page (control bar + mockup iframe + package placeholder)
node pkg/prosemirror-minimap/harness/serve.mjs &   # → http://localhost:3334/parity.html

# regenerate the coverage report after editing coverage.json
node pkg/prosemirror-minimap/e2e/parity/lib/gen-coverage-report.mjs
```

Spec files are `*.parity.ts` — the package's own e2e config matches only
`*.spec.ts`, so the two suites never pick up each other's tests. Both share
the same webServer (:3334) — run them serially, or split ports before
running concurrently.

## Layout

| Path | What |
|---|---|
| `playwright.config.ts` | chromium-only parity project; fixed 1600×900 viewport; reduced-motion emulation. |
| `scenarios/*.json` | Engine-agnostic fixture scripts (8; see "Scenario vocabulary"). |
| `fixtures/mn-doc.json` | The Phase-4 bridge document: synthetic-schema, structurally matched to the mockup (see "Fixture bridge"). |
| `fixtures/substitution.json` | The census substitution map + anchor→section-path map (generated, verified). |
| `fixtures.parity.ts` | Generates/validates the fixture bridge from the frozen mockup DOM. |
| `lib/types.ts` | The shared contract: steps, `Frame`, `Census`, `MasterFile`, and the `MinimapAdapter` interface a Phase-4 package adapter implements. |
| `lib/mockupAdapter.ts` | The one adapter that exists today: drives the mockup through the step vocabulary and captures frames — DOM probes only, never closures. |
| `lib/invariantAsserts.ts` | Standing asserts over frames+census (INV coverage; see `coverage.json`), incl. the build-coherence guard. |
| `lib/deviations.ts` + `deviations.json` + `DEVIATIONS.md` | Deviation-aware differ (numeric + structural actions) and its (empty) register. |
| `lib/canonicalEnv.ts` | Canonical-environment fingerprint + mismatch gate. |
| `masters.parity.ts` | Record/verify per scenario; logs a sha256 per master — identical hashes across consecutive runs are the byte-stability proof. |
| `wear.parity.ts` | Clock-controlled wear spec: INV-21/22 standing asserts + the `wear-dwell` master (opacities). |
| `invariants.parity.ts` | Interactive standing tests: INV-1 drag round-trip, INV-2 census stability, INV-17 keyboard walk, INV-12 resize stability, INV-14/18 tick ownership + click reveal, INV-20 strip travel. |
| `coverage.json` / `coverage.md` | Machine-readable INV mapping + generated report (`coverage.parity.ts` validates consistency). |
| `masters/*.json` | Recorded masters (format 2, environment-fingerprinted) — committed to the working tree. |
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
{ "type": "theme", "to": "contrast" }                // real theme button (geometry dimension!)
{ "type": "search", "query": "telemetry" }           // ⌘F code path; populates the search lane
{ "type": "search-clear" }                           // Escape; empties the lane
{ "type": "key", "key": "ArrowDown" }                // landmark walking on the focus host
{ "type": "viewport", "height": 899 }                // viewport resize (suite-only; the
                                                     //  parity page ignores it)
```

Scenarios: `default-sweep` (canonical: sweep + anchors + dwell + drags),
`zoom-mid`, `lane-toggles`, `themes` (light→dark→contrast→light with forced
rebuilds), `fit-all` (the pane-floor zoom clamp, swept), `search-lane`
(populate/clear through the real search path), `keyboard-walk` (INV-17 as
replayable frames), `wear-dwell` (clock spec, opacities).

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

## Fixture bridge (the Phase-4 document contract)

The masters encode the mockup's OWN document — terms, requirement blocks,
admonition flavors included — which the harness schema cannot represent
(D11/Q14). Byte-exact cross-adapter master diffs are therefore impossible
on a different document, by construction. The bridge makes both gate
options executable without new design work leaking into Phase 4:

- **`fixtures/mn-doc.json`** — a synthetic-schema document generated from
  the frozen mockup's DOM: the exact clause tree (49 sections incl. the
  7-deep chain; anchors preserved as section paths), representable blocks
  standing in (image↔floats/equations, quote↔admonitions,
  code_block↔source blocks, paragraphs↔prose), unrepresentable classes
  omitted. `fixtures.parity.ts` regenerates and byte-verifies it, and
  validates the mapping arithmetic (fixture counts ≡ map-derived counts).
- **`fixtures/substitution.json`** — the census substitution map: class →
  fixture node or `expectMissing` (term/req → D11; dl-defs/raw-block → Q14;
  margin/insert chrome), the anchor→path map that lets the SAME scenario
  fixtures drive the package side, heading-level clamp 7→6, both sides'
  counts.
- **Structural deviation actions** — `expectMissing` / `expectExtra` /
  `arrayCount` in the differ (see `DEVIATIONS.md`) express "no counterpart"
  and "count differs by N" leaf-by-leaf.

The gate still picks the canonical comparison mode for the four
`golden-master` INVs (2/9/13/17): (a) package masters recorded against
`mn-doc.json`, compared through the substitution map + structural
deviations, or (b) the document-agnostic standing asserts alone (they
already run on any adapter). Deciding mid-Phase-4 instead would invalidate
recorded masters — that is why the artifacts exist now.

## Canonical environment

Masters are byte-stable only in the environment that recorded them
(layout is font- and engine-dependent; the mockup's Georgia-first document
stack falls back per-OS, and the contrast theme changes border metrics).
Every master (format 2) carries a fingerprint — Chromium version,
os.platform/arch, viewport, reduced-motion, and a `document.fonts.check`
fingerprint of the document font stack — and **verify mode refuses to diff
when the live environment differs**, naming the fields. Environment drift
can therefore never be absorbed as widened tolerances (the register
explicitly refuses it); re-recording in a new environment is a gate
decision. Normalized-ratio frames were considered and rejected: they would
create a second truth source beside the px masters.

## Determinism traps and their mitigations

| Trap (mockup source) | Mitigation |
|---|---|
| localStorage `mnmock-*` prefs | `addInitScript` clears all keys, then seeds the default profile (`about-seen=1` kills the first-visit overlay; `mmzoom=''` = default 1:8). Fresh context per test. |
| auto-jump to `cl-5` at load+350ms (mockup:3088) | non-clock loads wait past it; every scenario's first step is an explicit `reset`. Under the faked clock, the adapter advances past the jump's deadline and verifies scrollTop control. |
| `#canvas` smooth scrolling (mockup:171) | explicit `page.emulateMedia({reducedMotion:'reduce'})` before load — the `reducedMotion` context option did not reach this Chromium build (see open items). |
| read-wear interval, 250ms opacity mutations (mockup:2306-2314) | **both**: geometry masters exclude wear opacity (wear lane captured structurally) **and** `wear.parity.ts` owns opacity determinism under `page.clock` frozen during load, advanced only in exact 250ms multiples (verified tick-exact). |
| theme switches / search marks reflow the document WITHOUT a rebuild | frames between such a transition and the next rebuild (or `search-clear`) are build-stale BY DESIGN; the standing asserts' build-coherence guard suspends only the mapping formulas (INV-1/4/8/11/16) for those frames — label-policy asserts still apply, and the masters capture the stale values byte-exactly. |
| the viewport-thumb overlay covers the strip and lanes (z-index 5) | pointer targets under it start THUMB drags, not strip/tick interactions (measured). INV-18/20 target ticks/strip positions clear of the thumb; ticks are top-aligned into the pane before clicking. |
| pointer-driven geometry re-pans between events | every pointer step re-reads the strip/tick rect immediately before dispatching (stale rects were a real failure mode: clicks landing off-target or on the wrong element). |
| fractional CSS values | deterministic float math, rounded at capture (3 decimals; 4 for wear opacities). |
| layout/font environment | the canonical-environment fingerprint + verify-time gate (above). |

**Byte-stability proof**: run verify twice; every master logs
`sha256=<hash> byteStable=<bool>`; two consecutive runs logging identical
hashes (and `byteStable=true`) constitute the proof, for all eight masters
in the canonical environment.

## Deviations & coverage

- `deviations.json` — EMPTY register by design (no package adapter exists
  to deviate yet). Schema + structural-action examples: `DEVIATIONS.md`.
  Entries are `appliesTo: "package"` only; the mockup is never excused
  from its own baseline.
- `coverage.json` → `coverage.md` (generated) — INV-1..22 → standing
  asserts / deferred / pending-gate, with scenario + frame-field
  references. All 22 carry standing asserts; 4 of them are the port-side
  `golden-master` tags (INV-2, 9, 13, 17); INV-17 and INV-20 carry
  pending-gate markers (Q8, D6) for their port-side semantics.

## Open items for the decision gate

1. **Fixture-bridge comparison mode** — gate picks (a) mapped master diff
   via `fixtures/substitution.json` + structural deviations, or (b)
   document-agnostic standing asserts (see "Fixture bridge"). The single
   highest-value decision before Phase 4 starts.
2. **Canonical environment ratification** — the recorded fingerprint
   (Chromium build, OS/arch, font availability) becomes official; a CI
   image pin is the natural implementation. Re-recording anywhere else is
   a gate action.
3. **Chromium `scrollIntoView({block:'center'})` bias** — deterministic
   ~52px offset vs the mathematical center (measured; 0 drift; source
   unidentified). Masters pin landings byte-exactly; INV-17/18/20 asserts
   use a documented ±60px band.
4. **`reducedMotion` context option no-op** in this Playwright/Chromium
   combination (worked around with the explicit `emulateMedia` call).
5. **Frozen clock vs scroll animations** — under `page.clock.pauseAt`, an
   in-flight scroll animation reverts manual `scrollTop` assignments until
   settled past; the adapter sequences around it, and Phase-4 clock
   scenarios must respect the same ordering.
6. **Anonymous float titles collide** — floats without `numberMap` numbers
   all title as `block · depth ? · float`, so element identity by title is
   ambiguous for them (INV-5 asserts are scoped accordingly; INV-14/18 use
   geometric ownership instead, which is exact).
7. **Thumb-over-strip pointer shadowing** — the viewport overlay covers
   the strip and lanes; clicks under it drag the thumb. Mock-up behavior,
   captured faithfully; the port's overlay/hit-test design (Q5/Q9) should
   decide whether lanes remain clickable under the thumb.
8. **`zoom` step dy quantization** — mouse clientY is integer, so achieved
   canvas heights quantize slightly; the mockup `Math.round`s the target
   and masters pin the outcome.

## Tooling-only choices made (for gate ratification)

- Spec files named `*.parity.ts` (the pre-existing config cannot be edited
  from this phase's scope).
- The baseline served under a stable virtual route from the committed
  package-docs copy so adapters/fixtures/masters never embed a disk path.
- One census per scenario, captured after the first (reset) step:
  default-build population; post-zoom rebuild states covered per-frame.
- Lane tick geometry per frame for diag/com/search only; wear geometry
  census-only (master size).
- The wear master is clock-based (structure-only fallback exists if the
  gate prefers dropping it).
- Build-stale frames (theme/search transitions without rebuild) are
  captured, not discarded; only mapping-formula asserts are suspended for
  them via the coherence guard.
- `pending-gate` as a distinct coverage status (INV-17→Q8, INV-20→D6):
  mock-up side asserted now, port-side semantics explicitly gate-owned.
- The fixture bridge is GENERATED from the frozen mockup (not hand-built)
  and byte-verified on every run, so it can never drift from the baseline.
- The side-by-side page pins `#canvas` `scroll-behavior:auto` after load
  (pages cannot emulate reduced-motion cross-frame) — dev-page only, never
  on the suite's capture path; its `viewport` step is suite-only.
