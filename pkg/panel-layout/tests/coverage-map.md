# Coverage map — behavior.spec rows → test layers

Living audit artifact. Status as of **pre-implementation-loop baseline**
(harness landed, modules 1/8/9 and the synthetic layer not yet built).
The post-convergence audit checkpoint updates this file; the walk is then a
table check, not an investigation.

Vocabulary: **Node** = `tests/*.test.mjs` · **parity** = characterized by
`tests/parity/mock.spec.ts` + goldens (direct flow) · **parity-indirect** =
exercised by a parity flow but not asserted on its own terms ·
**synthetic-planned** = lands with the convergence task's synthetic project ·
**module-N-planned** = covered when that inventory module is built ·
**demo-frame** = demo-owned row, verified by the state frames
(`capture:states --check-only`), not this suite · **documented-gap** =
knowingly uncovered (spec'd "min:" candidate or hypothetical) · **N/A**.

## §2 Happy-path flows

| Row | Coverage |
|---|---|
| HP1 preset renders | parity ✔ (test 1, `state-hp1`) + Node §4 pins |
| HP2 unwrap | parity ✔ (tests 1, `state-hp2`, `trace-geometry-hp2`, `trace-zones`) |
| HP3 merge | parity ✔ (test 1, `state-hp3`) + Node veto tables (merge stays) |
| HP4 group stack | parity ✔ (test 2, `state-hp4`) + Node `groupGridDropVeto`/`panelEdgeDropVeto` tables |
| HP5 window drag / park | parity ✔ (test 2, `state-hp5`) + Node `clampDragBox` table |
| HP6 resize | parity ✔ (test 2, `state-hp6`) + Node `pinGroup` guards |
| HP7 auto-wrap OFF | parity ✔ (test 4, `state-hp7`) + Node veto tables (OFF branch values) |
| HP8 reload round-trip | parity ✔ (test 3, `state-hp8`) + Node persistence round-trip |
| HP9 reset | parity ✔ (test 5, `state-hp9`) + Node `clear()` |
| HP10 empty | parity ✔ (test 5, `state-hp10`) |

## §3 State matrix (library rows)

| Row | Coverage |
|---|---|
| A4 first hydration settle | parity-indirect (HP1); grip timing via A4 row → synthetic-planned |
| A5 reload restore | parity ✔ (HP8) + Node load round-trip |
| A6 corrupt layout | Node ✔ (`A6:` 2 tests); page-level fallback render → synthetic-planned |
| A7 corrupt heights | Node ✔ (`A7:` 3 tests, incl. array-payload rejection); page-level → synthetic-planned |
| A8 stale group ids | synthetic-planned (rebuild is DOM-coupled); parity-indirect via HP8 |
| A9 fromJSON throws | module-1-planned (`layout-restore-threw` fallback); documented-gap until then |
| B1 empty editor | parity ✔ (HP10) + state frame `empty-editor.html` |
| B2 last window closes | parity-indirect (HP10) |
| B3 tabset before disposal | parity-indirect (HP4/HP10 sequences) |
| B4 tabset floor 36 | Node ✔ (`pinGroup` clamp) + parity-indirect (HP6) |
| B5 window floor 150 | parity-indirect (HP6 corner clamps); synthetic-planned |
| B6 degenerate sash | synthetic-planned (corrupt-heights seeding) |
| C2 storage throws | Node ✔ (throwing storage, all ops); page session survival → synthetic-planned |
| C3 panel render throw | module-8-planned → `synthetic-error-boundary` |
| C4 toJSON fails | Node ✔ (stale-kept assertion) |
| D1/D2 container contract | parity-indirect (panels render at pinned heights); synthetic-planned for overflow assertion |
| E1 long titles | documented-gap (spec "min: ellipsis") |
| E2 missing title | module-1-planned (precedence rider); parity-indirect today |
| E3 narrow-width chrome | documented-gap (cosmetic) |
| F1 auto-wrap OFF | parity ✔ (HP7) |
| F2 titlebar move-only | parity ✔ (`trace-transitions` cursor states) |
| F3 float-excluded drag | Node ✔ (`floatExclusionVeto` 4 tests); affordance → synthetic-planned |
| F4 drag-live gating | Node ✔ (`clampDragBox`) + parity ✔ (HP5); gate wiring parity-indirect |
| F5 zone suppression | parity ✔ (HP2 mid-drag, `trace-zones`) |
| G1 roving tabindex | documented-gap (stock dockview; module-9 surface) |
| G2 keyboardNavigation | module-9-planned (spec: off today — test asserts ON once surfaced) |
| G3 focus rings | module-9-planned |
| G5 close refocus | module-9-planned |
| G6 unwrap focus | module-9-planned |
| G7 keyboard undock | module-9-planned (or documented out-of-scope) |
| G8 Esc cancel | module-9-planned |
| H1 RTL | documented-gap (spec: not supported, hypothetical) |
| I3 touch | N/A (spec: out of scope) |
| J1 drag ghost | parity-indirect (HP2 mid-drag screen) |
| J2 window move | parity-indirect (HP5) |
| J3 sash resize | parity ✔ (HP6) |
| J4 zone transitions | parity ✔ (`trace-transitions`/`trace-zones` timings) |
| J5 sash hover accent | parity ✔ (`trace-transitions` 0.1s/0.5s) |
| J6 maximize | N/A (unused) |
| J7 reduced motion | module-9-planned / documented-gap |

## Demo-owned rows (demo.spec.md — verified by frames, not this suite)

A1/A2 boot pending/slow (mock inline) · A3/C1 CDN failure (`cdn-failure.html`)
· I1/I2 narrow viewport (`narrow-viewport.html`) · G4 toolbar focus (demo
chrome) · F1n toggle a11y (demo chrome; feeds F1/HP7 above).

## §4 Defaults

Node ✔ — `tokens.test.mjs` pins every spec-cited value; byte-exact drift
owned by `tokens:check`.

## Audit procedure (at convergence)

1. Re-walk each row against the landed layers (Node, synthetic, parity);
   update statuses; delete the "planned" vocabulary entries that landed.
2. Remaining `documented-gap` rows are either scheduled (issue) or accepted
   (note here) — no silent gaps.
3. Check test names still start with row IDs (mechanical:
   `grep -E "it\(|test\(" tests/*.test.mjs tests/parity/*.spec.ts`).
