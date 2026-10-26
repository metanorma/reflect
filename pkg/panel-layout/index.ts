/**
 * Public API for `@metanorma/panel-layout`.
 *
 * Implements `docs/behavior.spec.md` — the
 * panel-based editor layout: a main-grid document area plus floating
 * "tabset group" mini-windows (dockview v7), with per-tabset pinned
 * heights, auto-wrap undocking, and layout persistence. The library-scope
 * module inventory that this package will export is specified in
 * `docs/api.spec.md`.
 *
 * Status: scaffolding. The behavior modules are ported internals
 * (see api.spec.md §2 for the module map; each carries a provenance header
 * pointing at the mock commit it was extracted from):
 *
 * - `tokens.ts` — typed views over the generated design tokens.
 * - `persistence.ts` — layout/heights save-load over an injected
 *   `LayoutStorage` adapter, corrupted-storage fallback (A6/A7).
 * - `pinHeights.ts` — the per-tabset pinned-heights model (T7).
 * - `dragTakeover.ts` — sash/bottom-edge gesture takeover (HP6).
 * - `windowDrag.ts` — window-drag containment + {top} normalization (HP5).
 * - `unwrap.ts` — auto-wrap claim + drop-veto engine (HP2–HP4, HP7, F3, F5).
 * - `titlebar.ts` — float titlebar grip chrome + move-only enforcement (T6).
 * - `panel-layout.css` — library chrome styles (regenerate + drift-check:
 *   `yarn workspace @metanorma/panel-layout tokens:extract [--check]`).
 *
 * The mock and its capture tooling under `mock/` are build inputs and
 * acceptance references (state frames, goldens), not shipped code; the 11
 * demo panels are demo registrations and will never be exported.
 */

export {};
