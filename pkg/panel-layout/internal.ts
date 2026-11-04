/**
 * Dev-only internal surface for `@metanorma/panel-layout`.
 *
 * Re-exports the behavior modules (api.spec.md §2) plus the convergence
 * composition surface under one entry point for build and test
 * consumption. NOT part of the package's exports map and shipped to no
 * consumer. Its runtime consumer is the REWIRED reference mock: the mock
 * imports `dist/mock/panel-layout.js` (this file's build output) instead of
 * carrying inline behavior glue — the parity suite proves the built
 * artifact reproduces the mock's captured goldens (api.spec.md §5.1,
 * D17/D30).
 *
 * Every symbol is named explicitly (no `export *`) so an accidental export
 * added to a module cannot silently leak onto this surface; a symbol that
 * belongs on both surfaces is re-exported from one place. Engine types are
 * not re-exported here (api.spec.md §2.4) — the type-only import chain
 * through the modules below erases at emit.
 *
 * Value and type symbols are re-exported in separate clauses: the root
 * tsconfig's `verbatimModuleSyntax` requires the `type` keyword on
 * type-only re-exports, and named value re-exports alone do not carry the
 * modules' types into `compiled/internal.d.ts` (tsc is the declaration
 * artifact — esbuild emits none).
 */

// The PanelLayout component (api.spec.md §3 module 1) — the convergence
// composition. The mock consumes the component + the registry seam through
// this surface (the built artifact); the public entry re-exports the
// §2.1/§2.2 budget. `registryMinHeights` stays internal-only (the §2.5
// floor derivation the component and the synthetic layer share).
export {
  PanelLayout,
  floatExcludedPanels,
} from './index.js';
export { registryMinHeights } from './panelLayout.js';
export type {
  PanelLayoutApi,
  PanelLayoutFallbackEvent,
  PanelLayoutFallbackReason,
  PanelLayoutProps,
  PanelLayoutReadyEvent,
  PanelLayoutSettledEvent,
  PanelRegistration,
  PanelRegistry,
} from './index.js';

// Theming/CSS layer (api.spec.md §3 module 10). Budgeted public symbols
// are sourced from the public entry — one re-export site per symbol; the
// engine-option views, the consumer-configurable storage keys and the
// extraction provenance stay internal-only (D29 records the surface
// split; the public entry's block comment carries the rationale).
export { CONSTANTS, DV_TOKENS, TOKENS } from './index.js';
export type { LayoutConstants } from './index.js';
export {
  DND_EDGES,
  FLOATING_GROUP_BOUNDS,
  PROVENANCE,
  STORAGE_KEYS,
} from './tokens.js';
export type {
  DndEdges,
  FloatingGroupBounds,
  Provenance,
  StorageKeys,
} from './tokens.js';

// Persistence (api.spec.md §3 module 2) + pin-pass wiring (module 3) +
// window-drag containment (module 5).
// Budgeted public symbols are sourced from the public entry — one
// re-export site per symbol (this file's header rule); instance/option
// interfaces that stay internal-only (`Persistence`,
// `PinnedHeightsOptions`/`PinnedHeightsHandle`) are sourced from their
// modules directly.
export { createPersistence } from './index.js';
export type {
  HeightsMap,
  LayoutStorage,
  PersistenceOptions,
  PersistedState,
  StorageFormat,
} from './index.js';
export type { Persistence } from './persistence.js';
export {
  collectStableHeights,
  pinAllWindows,
  usePinnedHeights,
} from './index.js';
export type {
  PinnedHeightsHandle,
  PinnedHeightsOptions,
  PinnedHeightsSettledEvent,
} from './pinHeights.js';

// Pin-model internals beyond the public budget (measurement/reconcile).
export {
  applyWindowHeights,
  chromeOf,
  collectPresetHeights,
  effectiveFloor,
  floatingGroups,
  membersOf,
  pinGroup,
  reconcileWindow,
} from './pinHeights.js';
export type {
  FloatingGroupLike,
  GroupFloor,
  MinHeights,
  PassScheduler,
  PinPassOptions,
} from './pinHeights.js';

// Gesture takeover (api.spec.md §3 module 6). The budgeted public symbol
// is sourced from the public entry — one re-export site per symbol; the
// pure target-selection/frame helpers stay internal-only (module 1 and the
// Node tests consume them via this surface).
export { wireTabsetEdges } from './index.js';
export type { TabsetEdgesOptions } from './index.js';
export {
  pickResizeTarget,
  resizeFrame,
} from './dragTakeover.js';
export type {
  ResizeFrame,
  ResizeFrameInput,
  ResizeFrameStart,
} from './dragTakeover.js';

// Window-drag containment (api.spec.md §3 module 5). Budgeted public
// symbols are sourced from the public entry — one re-export site per
// symbol; the gate factory and its wiring options stay internal-only
// (module 1 composes them; the public surface carries the `WindowDragGate`
// interface only).
export {
  clampDragBox,
  normalizeTops,
} from './index.js';
export type {
  DragBox,
  DragContainerBox,
  WindowDragGate,
} from './index.js';
export {
  createWindowDragGate,
  retireDragState,
  sweepZoneOverlays,
} from './windowDrag.js';
export type {
  RetirePointerEvent,
  WindowDragEventTarget,
  WindowDragGateOptions,
} from './windowDrag.js';

// Drag/unwrap claim + veto engine (api.spec.md §3 module 4). Budgeted
// public symbols are sourced from the public entry — one re-export site
// per symbol; the hit-test predicates, the overlay-claim probe, the
// group-drag fallback and its latch stay internal-only (module 1's wiring
// and the Node tests consume them via this surface).
export {
  floatExclusionVeto,
  groupGridDropVeto,
  handleWillDrop,
  panelEdgeDropVeto,
  unwrapAtPointer,
  useDropRules,
} from './index.js';
export type {
  DropEventLike,
  DropRules,
  DropRulesOptions,
  UnwrapConfig,
} from './index.js';
export {
  claimGridSurfaceDrop,
  maybeUnwrapGroupAtPointer,
  overlayClaimActive,
  overGridSurface,
  overPasteboard,
} from './unwrap.js';
export type {
  DragDataLike,
  GroupDragLive,
} from './unwrap.js';

// Titlebar chrome (api.spec.md §3 module 7). The budgeted public symbols
// are sourced from the public entry — one re-export site per symbol; the
// quarantined move-only reach-in stays internal-only (the component's
// `watchTitlebars` composes it internally; it is deliberately NOT on the
// public API — D22).
export {
  decorateTitlebars,
  watchTitlebars,
} from './index.js';
export type { WatchTitlebarsOptions } from './index.js';
export { suppressTitlebarGroupDrag } from './titlebar.js';

// Per-panel error boundary (api.spec.md §3 module 8). The budgeted public
// symbol is sourced from the public entry — one re-export site per symbol;
// the §2.5 registry-application seam (wrapPanelComponent) stays
// internal-only (module 1 consumes it via this surface; it is deliberately
// NOT on the public API).
export { PanelErrorBoundary } from './index.js';
export type { PanelErrorBoundaryProps } from './index.js';
export { wrapPanelComponent } from './panelErrorBoundary.js';

// Focus/keyboard layer (api.spec.md §3 module 9). CSS + option wiring:
// the G3 ring styles ship as the sibling hand-authored `focus.css`
// (outside the tokens pipeline), and the two TS seams below stay
// internal-only — the §2.1 option split is consumed by module 1 when it
// composes the engine props, and the G5 close-refocus wiring is called
// from `onReady`. Nothing here joins the public API (the public surface's
// focus contribution is the dockviewOptions passthrough type, already on
// index).
export {
  LIBRARY_DOCKVIEW_OPTIONS,
  OWNED_DOCKVIEW_OPTION_KEYS,
  splitDockviewOptions,
  wireFocusRestoration,
} from './focus.js';
export type {
  FocusRestoration,
  FocusRestorationOptions,
} from './focus.js';
