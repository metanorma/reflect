/**
 * Dev-only internal surface for `@metanorma/panel-layout`.
 *
 * Re-exports the ported behavior modules (api.spec.md §2) under one entry
 * point for build and test consumption while the public API in `index.ts`
 * is under construction. NOT part of the package's exports map and shipped
 * to no consumer. Today it has no runtime consumer — the parity mock is
 * not rewired yet; its role now is to fix the build's entry point so peer
 * semantics can be proven: the mock-facing esbuild pass bundles THIS file
 * with every peer externalized (the future mock glue will import
 * `dist/mock/panel-layout.js`), while the twin-facing pass bundles
 * `index.ts` with the engine included.
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

export {
  CONSTANTS,
  DND_EDGES,
  DV_TOKENS,
  FLOATING_GROUP_BOUNDS,
  PROVENANCE,
  STORAGE_KEYS,
  TOKENS,
} from './tokens.js';
export type {
  DndEdges,
  FloatingGroupBounds,
  LayoutConstants,
  Provenance,
  StorageKeys,
} from './tokens.js';

export { createPersistence } from './persistence.js';
export type {
  HeightsMap,
  LayoutStorage,
  Persistence,
  PersistenceOptions,
} from './persistence.js';

export {
  applyWindowHeights,
  chromeOf,
  collectStableHeights,
  floatingGroups,
  membersOf,
  pinAllWindows,
  pinGroup,
  reconcileWindow,
} from './pinHeights.js';
export type { FloatingGroupLike, PinPassOptions } from './pinHeights.js';

export { wireTabsetEdges } from './dragTakeover.js';

export {
  clampDragBox,
  createWindowDragGate,
  normalizeTops,
  retireDragState,
} from './windowDrag.js';
export type { DragBox, DragContainerBox, WindowDragGate } from './windowDrag.js';

export {
  floatExclusionVeto,
  groupGridDropVeto,
  handleWillDrop,
  maybeUnwrapGroupAtPointer,
  overlayClaimActive,
  overGridSurface,
  overPasteboard,
  panelEdgeDropVeto,
  unwrapAtPointer,
} from './unwrap.js';
export type { DragDataLike, DropEventLike, UnwrapConfig } from './unwrap.js';

export {
  decorateTitlebars,
  suppressTitlebarGroupDrag,
  watchTitlebars,
} from './titlebar.js';
