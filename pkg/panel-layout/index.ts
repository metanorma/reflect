/**
 * Public API for `@metanorma/panel-layout`.
 *
 * Implements `docs/behavior.spec.md` — the
 * panel-based editor layout: a main-grid document area plus floating
 * "tabset group" mini-windows (dockview v7), with per-tabset pinned
 * heights, auto-wrap undocking, and layout persistence. The library-scope
 * module inventory that this package exports is specified in
 * `docs/api.spec.md`.
 *
 * Status: every inventory module is promoted — persistence (§3 module 2),
 * pin-pass wiring (§3 module 3), the drag/unwrap claim + veto engine
 * (§3 module 4), window-drag containment (§3 module 5), gesture takeover
 * (§3 module 6), titlebar chrome (§3 module 7), the per-panel error
 * boundary (§3 module 8), the focus/keyboard layer (§3 module 9), the
 * theming/CSS layer (§3 module 10) and the `<PanelLayout>` front door
 * (§3 module 1), which composes all of them (api.spec.md §2.1).
 *
 * - `panel-layout.css` + `focus.css` — the hand-owned stylesheets
 *   (chrome and G3 rings respectively). Consumers link both after
 *   dockview.css; the mock links the served copies (see its `<head>`).
 *
 * The mock and its capture tooling under `mock/` are build inputs and
 * acceptance references (state frames, goldens), not shipped code; the 11
 * demo panels are demo registrations and will never be exported.
 */

/**
 * The PanelLayout component (api.spec.md §3 module 1, §2.1): the front
 * door — renders `DockviewReact` with every behavior module wired, and
 * always exposes the engine (`onReady({ api })`, option passthrough; the
 * library owns `dndStrategy`/`floatingGroupBounds`/
 * `floatingGroupDragHandle`/`transformFloatingGroupDrag`). Registry,
 * default layout, persistence,
 * auto-wrap and the two §2.2 callbacks are its complete prop surface.
 * behavior.spec.md rows HP1, F1, G2, HP7 (module-1 rows; every other row
 * flows through the composed modules).
 */
export {
  DEFAULT_ENVELOPE_KEY,
  PanelLayout,
  floatExcludedPanels,
} from './panelLayout.js';
export type {
  PanelLayoutApi,
  PanelLayoutFallbackEvent,
  PanelLayoutFallbackReason,
  PanelLayoutProps,
  PanelLayoutReadyEvent,
  PanelLayoutSettledEvent,
  PanelRegistration,
  PanelRegistry,
} from './panelLayout.js';

/**
 * Engine type re-exports (api.spec.md §2.4): types-only, curated, exactly
 * ten names from `'dockview'`. No value re-exports (`DockviewDefaultTab`
 * and friends stay importable from `dockview-react`) and no
 * library-defined aliases over dockview types. Type-only re-exports erase
 * at emit, so nothing binds to a second engine copy.
 */
export type {
  DockviewApi,
  DockviewEvent,
  DockviewIDisposable,
  DockviewOptions,
  DockviewReadyEvent,
  DockviewWillDropEvent,
  DockviewWillShowOverlayLocationEvent,
  IDockviewPanelHeaderProps,
  IDockviewPanelProps,
  SerializedDockview,
} from 'dockview';

/**
 * Persistence & corrupted-storage fallback (api.spec.md §3 module 2,
 * §2.6): save/load layout + heights over one injected `LayoutStorage`
 * adapter, envelope/two-key formats, per-half independent decode, silent
 * fallback to the default layout, once-per-session storage-failure
 * signal. behavior.spec.md rows HP8, A4–A9, C2, C4, HP9.
 */
export { createPersistence } from './persistence.js';
export type {
  HeightsMap,
  LayoutStorage,
  PersistenceOptions,
  PersistedState,
  StorageFormat,
} from './persistence.js';

/**
 * Pin-pass wiring (api.spec.md §3 module 3): the per-tabset pinned-heights
 * model — measurement, pin + reconcile, the maintenance pass with
 * sample-guard, stable-heights collection — and the wiring hook that runs
 * the pass on layout change (rAF-debounced, gated during live window
 * drags) and persists via a `Persistence` instance on §2.3 settled
 * signals. behavior.spec.md rows HP4, HP6, B4–B6, A5, A8.
 */
export {
  collectStableHeights,
  pinAllWindows,
  usePinnedHeights,
} from './pinHeights.js';

/**
 * Window-drag containment (api.spec.md §3 module 5): top/left/right
 * containment with a free bottom edge (the top-cap semantics that prevent
 * the engine's bottom-anchor flip), `{top}`-only normalization on release,
 * and the drag-session gate for the pin pass — whose retire sequence owns
 * the mock's exact order (unwrap fallback first, zone-overlay sweep, then
 * normalizeTops). behavior.spec.md rows HP5, F4.
 */
export {
  clampDragBox,
  normalizeTops,
} from './windowDrag.js';
export type {
  DragBox,
  DragContainerBox,
  WindowDragGate,
} from './windowDrag.js';

/**
 * Gesture takeover (api.spec.md §3 module 6): capture-phase sash +
 * window-bottom/corner pointer routing — a sash resizes the tabset above
 * it, the bottom edge / corners resize the last tabset (corners also set
 * width, min 120px), with per-move pins honoring the §2.5 registry floors
 * and the pointerup commit (§2.3 net 2) persisting heights through the
 * provided callback, since takeover drags fire no layout-change event.
 * behavior.spec.md row HP6.
 */
export { wireTabsetEdges } from './dragTakeover.js';
export type { TabsetEdgesOptions } from './dragTakeover.js';

/**
 * Drag/unwrap claim + veto engine (api.spec.md §3 module 4): grid-surface
 * drop claims (a panel or whole tabset dropped on the pasteboard or page
 * unwraps into a new floating window, sized to the source tabset's rect
 * with the height traveling with the group), the veto set (no left/right
 * splits, no group-into-grid docks, float-excluded panels never enter
 * floats), zone-overlay suppression state, and the dead-zone pointerup
 * fallback for group drags. `useDropRules` wires it into an api
 * (framework-agnostic wiring pattern); its `retireFirst` slots into the
 * window-drag gate's `onRetireFirst` seam. behavior.spec.md rows
 * HP2, HP3, HP4, HP7, F3, F5.
 */
export {
  floatExclusionVeto,
  groupGridDropVeto,
  handleWillDrop,
  panelEdgeDropVeto,
  unwrapAtPointer,
  useDropRules,
} from './unwrap.js';
export type {
  DropEventLike,
  DropRules,
  DropRulesOptions,
  UnwrapConfig,
} from './unwrap.js';

/**
 * Titlebar chrome (api.spec.md §3 module 7): the ridged drag-grip
 * decoration for float titlebars — idempotent, and safety-netted by
 * `watchTitlebars` so windows created later (auto-wrap unwrap, restore)
 * still get chrome (paint + MutationObserver + interval, A4 grip timing).
 * Move-only enforcement ships inside the watcher; its quarantined engine
 * reach-in (`_titleBar.dragSource`) is feature-detected and internal-only.
 * behavior.spec.md rows F2, A4 (grip timing).
 */
export {
  decorateTitlebars,
  watchTitlebars,
} from './titlebar.js';
export type { WatchTitlebarsOptions } from './titlebar.js';

/**
 * Per-panel error boundary (api.spec.md §3 module 8): wraps consumer
 * panel components so a render throw renders an inline "Panel failed:
 * <id>" state instead of unmounting the layout (dockview-react ships no
 * boundary). The registry-application seam (`wrapPanelComponent`) is
 * internal-only. behavior.spec.md row C3.
 */
export { PanelErrorBoundary } from './panelErrorBoundary.js';
export type { PanelErrorBoundaryProps } from './panelErrorBoundary.js';

/**
 * Theming/CSS layer (api.spec.md §3 module 10): typed views over the
 * hand-owned design tokens (`mock/design-tokens.json` — its
 * `_provenance` records the final extraction snapshot).
 * The budgeted surface is the token data itself; the engine-option views
 * (`DND_EDGES`, `FLOATING_GROUP_BOUNDS`), the consumer-configurable
 * storage key names (`STORAGE_KEYS`) and the extraction bookkeeping
 * (`PROVENANCE`) stay internal via `internal.ts`. behavior.spec.md §4;
 * the CSS half of this module is `panel-layout.css` (rows J4/J5).
 */
export { CONSTANTS, DV_TOKENS, TOKENS } from './tokens.js';
export type { LayoutConstants } from './tokens.js';
