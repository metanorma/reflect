/**
 * Public API for `@metanorma/panel-layout`.
 *
 * Implements `docs/panel-layout-proposal/behavior.spec.md` — the
 * panel-based editor layout: a Document main-grid panel plus floating
 * "tabset group" mini-windows (dockview v7), with per-tabset pinned
 * heights, auto-wrap undocking, and layout persistence.
 *
 * Status: pre-implementation. This package currently ships the proposal's
 * machine artifacts as its contract inputs:
 *
 * - `mock/editor-dockview7-floats.html` — the single-file live mock that is
 *   the reference implementation of the interaction contract (§1 of the
 *   spec; also the extraction source for design tokens).
 * - `mock/design-tokens.json` — machine-extracted constants, preset
 *   layout, panel titles, CSS custom properties, and dockview options;
 *   consumed by any implementation instead of re-declaring them.
 * - `mock/states/`, `mock/goldens/` — captured static state frames and
 *   happy-path baselines (PNG + serialized state + traces) that serve as
 *   acceptance references for the implementation.
 *
 * TypeScript source lands here as implementation work begins; the mock and
 * its capture tooling are build inputs, not shipped code.
 */
export {};
