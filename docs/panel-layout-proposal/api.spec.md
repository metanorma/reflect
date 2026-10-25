# Panel layout — API specification (module inventory)

## 1. Purpose and scope

This document specifies the **lib-scope components** of
[`@metanorma/panel-layout`](../../pkg/panel-layout/index.ts) — the modules
that will become its public API. The behavioral contract they implement is
[`behavior.spec.md`](./behavior.spec.md); the architecture is a **layered
hybrid**:

- **Engine as peer dependency** — `dockview`/`dockview-react` (MIT surface
  only; the enterprise package's competitive-toolkit clause is out of
  bounds). Consumers may already use dockview directly; the engine stays
  visible, swappable, and unshadowed.
- **Behavior layer is the product** — per-tabset pinned heights, auto-wrap
  undocking, drop vetoes, containment, persistence. Exported as functions
  and hooks over any `DockviewApi` instance (dockview-native consumers wire
  them into their own `<DockviewReact>`).
- **Thin optional component on top** — one `<PanelLayout>` front door for
  consumers who don't want to assemble the layers; it always exposes the
  engine (`onReady({ api })`, option passthrough), never hides it.

Panel **content is opaque input**: the library hosts consumer components in
a fixed-height box (behavior.spec.md D1/D2) and defines no panels of its
own. What the library never owns: the 11 demo panels (registrations of the
demo consumer, forever — §3) and app chrome (toolbars, statusbars —
[`demo.spec.md`](./demo.spec.md)).

**Version pins.** Peers pin `dockview*` at the mock's exact `7.0.4` (parity
with the reference implementation and its captured goldens); React peers
match the workspace's `^19.2.7` instance (the mock's CDN build is 19.2.8 —
same minor family; the goldens' environment is documented in their
provenance). Widening to `^7 || ^8` happens only after a deliberate parity
run, as a separate change.

**Runtime-import rule.** Library runtime imports come only from
`dockview-react` and `react`/`react-dom`; `dockview` and `dockview-core`
are type-only imports (they erase at emit). The reference mock's importmap
carries `dockview` (unbundled esm.sh build) *and* `dockview-react`
(`?bundle` build that inlines `dockview` + `dockview-core`): a runtime
import of `dockview` resolves to the unbundled copy and instantiates a
second `dockview-core` beside the one inlined in the react bundle —
duplicated drag/event systems. The rule is enforced mechanically by
`yarn workspace @metanorma/panel-layout imports:check`
(`scripts/check-imports.mjs`), which runs as part of every `build`.

## 2. Public surface

### 2.1 `<PanelLayout>` component

The front door renders `DockviewReact` with every behavior wired. Its
complete prop surface:

```ts
export interface PanelLayoutProps {
  /** Panel registry; key = dockview `contentComponent` name (§2.5). */
  readonly registry: PanelRegistry;
  /** Default layout used when storage is empty or corrupt (A6/A7). */
  readonly defaultLayout: SerializedDockview;
  /** Omit → no persistence. */
  readonly persistence?: PersistenceOptions;
  /** Auto-wrap undock on empty-space drops; default true (HP2/HP7). */
  readonly autoWrap?: boolean;
  /**
   * Engine option passthrough. The library owns `dndStrategy`,
   * `floatingGroupBounds`, `floatingGroupDragHandle` — consumer values
   * for those three are ignored.
   */
  readonly dockviewOptions?: Partial<DockviewOptions>;
  readonly onReady: (event: PanelLayoutReadyEvent) => void;
  readonly onDidFallback?: (event: PanelLayoutFallbackEvent) => void;
}
```

No toolbar/statusbar slots (§3) — consumers compose their own chrome
around the component.

### 2.2 Event surface

The component carries exactly two callbacks. `onReady({ api })` (required)
hands over the `PanelLayoutApi`. `onDidFallback` is the low-frequency
channel the corrupted-storage states point at:

```ts
export type PanelLayoutFallbackReason =
  | 'layout-corrupt'        // A6
  | 'heights-corrupt'       // A7
  | 'layout-restore-threw'  // A9
  | 'storage-unavailable';  // C2 (reported once, on first write failure)

export interface PanelLayoutFallbackEvent {
  readonly reason: PanelLayoutFallbackReason;
  readonly message?: string;
}
```

Every change/stream event lives on the api object as an `onDid*`/`onWill*`
subscription returning `DockviewIDisposable` — dockview's names, verbatim,
no parallel vocabulary. The facade is an intersection type (not
`interface extends DockviewApi` — the class has private members, which
would make the interface unimplementable outside the engine):

```ts
export type PanelLayoutApi = DockviewApi & {
  /** Library-composed settled signal (§2.3). */
  readonly onDidLayoutSettled: DockviewEvent<PanelLayoutSettledEvent>;
};
```

Engine emitters are re-exposed, never re-wrapped. dockview-react's
optional `onDidDrop`/`onWillDrop` props are deliberately not mirrored: the
veto engine owns `onWillDrop`, and emitters are multicast, so consumers
subscribe via `api.onWillDrop` without displacing library wiring.

### 2.3 Settled and continuous change signals

Two signals, both public; the built-in persistence subscribes to the
settled one only; the library performs no debouncing of its own.

- **Continuous** — `onDidLayoutChange`, the verbatim engine passthrough,
  for live UI that tracks in-flight drags. Consumers debounce on their
  side.
- **Settled** — `onDidLayoutSettled`, composed from three nets, one emit
  per net:

```ts
export interface PanelLayoutSettledEvent {
  /**
   * 'layout'  — the serialized layout changed (structure/positions;
   *             heights may have changed too).
   * 'heights' — only pinned heights changed (takeover drags fire no
   *             layout-change event).
   */
  readonly source: 'layout' | 'heights';
  /** 'user' = direct manipulation; 'api' = programmatic. */
  readonly origin: 'user' | 'api';
}
```

The three nets: dockview's `onDidMutateLayout` bracket (one transaction
per compound mutation; `fromJSON` is a single `'load'` transaction, so
HP1's immediate first save is covered); the drag-takeover pointerup commit
(HP6); and window-drag release.

### 2.4 Engine type re-exports

Types-only, curated, exactly ten names from `'dockview'`:

```ts
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
```

No value re-exports (`DockviewDefaultTab` and friends stay importable from
`dockview-react`), and no library-defined aliases over dockview types.
Type-only re-exports erase at emit, so nothing binds to a second engine
copy. The serialized panel field is `contentComponent` — the registry key
(§2.5).

### 2.5 Panel registry

```ts
export interface PanelRegistration {
  /** Consumer panel; rendered inside the fixed-height D1/D2 box. */
  readonly component: FC<IDockviewPanelProps>;
  /** Default tab title (precedence below). */
  readonly title?: string;
  /** false → this panel never enters a float window (F3). Default true. */
  readonly floatable?: boolean;
  /**
   * Content-height floor for tabsets hosting this panel; effective floor
   * is max(MIN_TS_H, max over current members) — it only ever raises the
   * global floor. Default MIN_TS_H.
   */
  readonly minHeight?: number;
}

/** Key = dockview `contentComponent` name (the serialized field). */
export type PanelRegistry = Record<string, PanelRegistration>;

/** Derived at wiring time (F3) — not a prop; cannot drift from the registry. */
export function floatExcludedPanels(
  registry: PanelRegistry,
): ReadonlySet<string>;
```

Value precedence is split by kind. **Data** (`title`) resolves
serialized/default-layout first: layout → registry → panel id (E2; the
last rung is dockview's native `title ?? id` fallback). **Behavioral
policy** (`floatable`, `minHeight`) is registry-authoritative and never
read from serialization, so user storage cannot flip a veto or breach a
floor; the pin pass re-derives constraints on every load (A5). Consumer
panel data keeps dockview-native `params` untouched. The global
`MIN_TS_H`/`MIN_WIN_H` floors (B4/B5) stay global; registry `minHeight`
only raises them.

### 2.6 Persistence format

One envelope under one adapter key:

```ts
export interface PersistedState {
  readonly version: 1;
  readonly layout: SerializedDockview;
  /** Keyed by dockview group id; stale ids dropped on rebuild (A8). */
  readonly heights: HeightsMap;
}

export type StorageFormat =
  | { readonly kind: 'envelope'; readonly key: string }
  | { readonly kind: 'two-key'; readonly keys: {
      readonly layout: string; readonly heights: string } };
```

The envelope is the default; the two-key format (the mock's storage shape)
is a first-class option that the demo and parity suite pin, keeping
goldens byte-exact against both keys. The two halves decode independently,
so A6/A7 corruption semantics hold per half (valid layout + corrupt
heights → keep layout, default heights; and vice versa); an envelope
version mismatch falls back on the whole envelope. One `LayoutStorage`
adapter, never two — `clear()` stays atomic (HP9). Validation is
hand-rolled guards behind a single decode seam (dockview's
`SerializedDockview` carries no version or migration story — versioning is
the library's); the seam's internals can be replaced by a schema decoder
without API change.

## 3. Module inventory

Each entry: responsibility, key symbols, and the behavior.spec.md rows it
implements. Ported modules carry provenance headers naming the mock commit
they were extracted from; planned modules are marked.

| # | Module | Responsibility | Key symbols | Spec rows |
|---|---|---|---|---|
| 1 | **PanelLayout component** (`panelLayout.tsx`) | The front door (§2.1): renders `DockviewReact` with every behavior wired. | `PanelLayout`, `PanelLayoutProps` | HP1, F1, G2, HP7 |
| 2 | **Persistence & corrupted-storage fallback** (`persistence.ts`) | Save/load layout + heights over an injected `LayoutStorage` adapter (§2.6); silent fallback to the default layout; restore-to-default clears storage atomically. | `LayoutStorage`, `createPersistence`, `PersistenceOptions`, `HeightsMap` | HP8, A4–A9, C2, C4, HP9 |
| 3 | **Pin-pass wiring** (`pinHeights.ts`) | The per-tabset pinned-heights model: members/chrome measurement, pin + reconcile, the maintenance pass with sample-guard, stable-heights collection; wiring runs the pass on layout change, gated during live window drags. | `pinAllWindows`, `collectStableHeights`, `usePinnedHeights` (planned) | HP4, HP6, B4–B6, A5, A8 |
| 4 | **Drag/unwrap claim + veto engine** (`unwrap.ts`) | Grid-surface drop claims (panel or whole tabset → new float window, source-rect sizing, height carry), the veto set (no left/right splits, no group-into-grid docks, float-excluded panels), zone-overlay suppression state, dead-zone pointerup fallback. | `handleWillDrop`, veto predicates, `unwrapAtPointer`, `useDropRules` (planned) | HP2, HP3, HP4, HP7, F3, F5 |
| 5 | **Window drag containment** (`windowDrag.ts`) | Top/left/right containment with a free bottom edge (top-cap semantics that prevent the bottom-anchor flip), `{top}`-only normalization on release, drag-session gate for the pin pass, stale zone-overlay sweep. | `clampDragBox`, `normalizeTops`, `WindowDragGate` | HP5, F4 |
| 6 | **Gesture takeover** (`dragTakeover.ts`) | Capture-phase sash + window-bottom/corner pointer routing: sash resizes the tabset above, bottom edge resizes the last tabset, corners also set width (min 120px); commits heights on pointerup. | `wireTabsetEdges` | HP6 |
| 7 | **Titlebar chrome** (`titlebar.ts`) | Ridged drag-grip decoration (idempotent, safety-netted for windows created later) + move-only enforcement. The enforcement reach-in (`_titleBar.dragSource`) is quarantined, feature-detected, and degrades gracefully (shift-drag redock) if the engine surface shifts. | `decorateTitlebars`, `watchTitlebars` | F2, A4 (grip timing) |
| 8 | **Per-panel error boundary** (planned) | Wraps consumer panel components so a render throw renders an inline "panel failed" state instead of unmounting the layout (dockview-react ships no boundary). | `PanelErrorBoundary` | C3 |
| 9 | **Focus/keyboard layer** (planned) | `:focus-visible` styles for library-owned controls (tabs, sashes), surfacing `keyboardNavigation`, close/unwrap focus restoration. | CSS + option wiring | G1–G3, G5–G8 |
| 10 | **Theming/CSS layer** (`panel-layout.css` + `tokens.ts`) | Library chrome styles extracted verbatim from the mock (design tokens, dockview theme overrides, grip, suppression, sash cursors) with a drift check against the mock; typed token views for programmatic consumers. | `tokens:extract [--check]`, `CONSTANTS`, `TOKENS`, `DV_TOKENS` | behavior.spec.md §4, J4/J5 |

## 4. Explicitly not in this package

- **The 11 demo panels** (outline, bibliography, validation, review,
  pinned, identity, attributes, structure, derived, overlays, document) —
  demo consumer registrations, forever. The library's only panel-related
  contract is the container: render into a fixed-height, internally
  scrolling box (D1/D2).
- **App chrome** — toolbars, statusbars, boot/CDN overlays, viewport
  strategy: [`demo.spec.md`](./demo.spec.md).
- **Panel semantics** — data, filters, empty lists: panel territory.

## 5. Mock and goldens as acceptance references

The single-file mock
([`mock/editor-dockview7-floats.html`](../../pkg/panel-layout/mock/editor-dockview7-floats.html))
remains the reference implementation until superseded; every ported module
carries a provenance header naming the mock commit it was extracted from.
The captured artifacts are the acceptance targets for the component layer:

- **State frames** ([`mock/states/`](../../pkg/panel-layout/mock/states/)) —
  degenerate states (empty editor, plus the demo-owned CDN/narrow-viewport
  frames).
- **Goldens** ([`mock/goldens/`](../../pkg/panel-layout/mock/goldens/README.md))
  — happy-path screens, serialized state after each flow, and interaction
  traces. They capture library+demo **combined**; parity means the
  component layer, fed the demo's registrations and preset, reproduces the
  goldens' serialized state (rects, member heights, storage) — the strict
  diff targets — within their documented tolerances.
- **Drift checks** — `yarn workspace @metanorma/panel-layout tokens:check`
  fails when the extracted tokens/CSS and the mock diverge.
- **Parity suite** — `yarn workspace @metanorma/panel-layout parity`
  (Playwright characterization run; browser one-time via `parity:install`)
  drives the HP flows against the configured targets with the shared
  drivers in `tests/parity/flows.mjs` and asserts the mock — later the
  twin, in the same run, against the same baselines — semantically against
  the goldens above, plus a tolerance-bounded pixel layer. This is the
  enforcement command for the parity target.

### 5.1 Build flavors

`yarn workspace @metanorma/panel-layout build` emits two bundles from one
script (`build-panel-layout.mjs`, a structural sibling of
`build-minimap-demo.mjs`):

- **Mock-facing** (`dist/mock/panel-layout.js`, entry `internal.ts`, all
  engine peers external) — proves peer semantics: the package works when
  the consumer supplies the engine. This is the artifact the reference
  mock's glue imports, served at `/dist/mock/panel-layout.js` on the
  parity server.
- **Twin-facing** (`dist/twin/panel-layout.js`, entry `index.ts`, engine
  bundled from the yarn-pinned `7.0.4` chain) — proves version truth: the
  package works with the versions the product gets. The shipped form stays
  source + peers; this bundle is a test artifact.

The mock-facing flavor asserts (via the esbuild metafile) that no
`dockview`/`dockview-core` import survives as an external of any kind;
the twin flavor asserts the resolved engine versions are exactly the
pins. Layout and deferred end-states are recorded in
[`pkg/panel-layout/dist/README.rst`](../../pkg/panel-layout/dist/README.rst).
