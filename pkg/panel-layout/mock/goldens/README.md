# Goldens — happy-path baselines

Authoritative baselines captured from the live mock
([`../editor-dockview7-floats.html`](../editor-dockview7-floats.html)) by
scripted real-input Playwright sessions (no DOM mutation). Companion to the
static state frames in [`../states/`](../states/): those are hand-reachable
degenerate states; these are the happy-path flows HP1–HP10 from
[`behavior.spec.md`](../../../../docs/panel-layout-proposal/behavior.spec.md)
§2.

## Commands

- Regenerate everything: `node pkg/panel-layout/mock/goldens/capture-goldens.mjs`
- Diff against checked-in baselines:
  `node pkg/panel-layout/mock/goldens/capture-goldens.mjs --check-only`

Needs network at page load (esm.sh/unpkg CDN); Playwright is auto-probed
(`/root/mn-capture-deps`, `MN_CAPTURE_PLAYWRIGHT`, npx caches, or repo-local).

## Generator vs enforcer

This directory's script is the **generator**: it produces artifacts (and owns
the standalone PNG decoder for its quick `--check-only` tripwire). The
**enforcer** is the parity suite at
[`../../tests/parity/`](../../tests/parity/) (`yarn workspace
@metanorma/panel-layout parity`): a Playwright-test characterization suite
that drives the SAME flows (shared drivers in `tests/parity/flows.mjs`) and
asserts the mock against these checked-in goldens — semantic-first
(`state-hp*.json` `_normalized` diffs, ±1px) plus a pixel layer with shared
snapshot names. Until the library twin exists the two overlap by design;
the parity suite is the one that survives and gains the second target
(`twin` project placeholder in its config), at which point the same run
asserts mock and twin against the same baselines.

## Artifacts

- `hp*.png` — key screens at 1440×900 @1x: default layout, mid-drag
  (ghost + zone suppression), post-unwrap, merged tab, bottom-parked window,
  resized tabset, auto-wrap OFF (grid zones back mid-drag + doc sibling-tab
  merge), reset, empty editor. **Reviewed baselines** — look at them
  in code review; pixel diffs are advisory.
- `state-hp*.json` — serialized state after each flow: `layout`
  (`window.__api.toJSON()`), `storage` (both localStorage keys parsed),
  `floats` (rect + member ids + member heights per window), `_normalized`
  (runtime-minted group ids mapped to `g1,g2…` by first-seen order), `_meta`.
  **Machine diff targets** — strict in `--check-only`.
- `trace-*.json` — `chrome` (titlebar/grip/sash/handle/tab-strip geometry),
  `tokens` (computed `--dv-*` + mock custom properties, verbatim values),
  `transitions` (sash idle/hover, drop-zone, titlebar cursor states),
  `geometry-hp2` (source rect, ghost box, new window), `zones` (mid-drag zone
  inventory + suppression). Chrome/tokens/transitions are strict;
  zones/geometry-hp2 advisory.

## Determinism

- **Stable across runs**: all state `_normalized`/`_meta` (±1px), all
  traces, all PNGs (0.000% pixel diff over consecutive runs) — mouse
  coordinates are fixed constants at the top of the script.
- **Run-varying, normalized**: dockview's runtime-minted group ids (numeric
  strings) → `g1,g2…`; raw ids are preserved verbatim in `layout`/`storage`/
  `floats`.
- `heightsMap` is module-scoped in the mock and unreachable from the page;
  it is captured via its persisted localStorage copy plus live member rects.

When the mock changes legitimately, re-run the capture to refresh captured
reality; anything beyond pure regeneration (new screens, changed flows) is a
spec question first — the flows live in
[`behavior.spec.md`](../../../../docs/panel-layout-proposal/behavior.spec.md)
§2.
