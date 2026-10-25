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

## 2. Module inventory

Each entry: responsibility, key symbols it will grow into, and the
behavior.spec.md rows it implements. Modules currently exist as ported
internals (provenance headers point at the mock commit); their exported
names are the contract under construction.

| # | Module | Responsibility | Key symbols (planned) | Spec rows |
|---|---|---|---|---|
| 1 | **PanelLayout component** (`panelLayout.tsx`) | The front door: renders `DockviewReact` with every behavior wired; owns the options surface (panel registry, default layout, storage adapter, `unwrapMode`, `keyboardNavigation` passthrough, `onReady({ api })`, `dockviewOptions` passthrough). No toolbar/statusbar slots — consumers compose their own chrome around it. | `PanelLayout`, `PanelLayoutProps`, `PanelRegistry` | HP1, F1, G2, HP7 |
| 2 | **Persistence & corrupted-storage fallback** (`persistence.ts`) | Save/load layout + heights over an injected `LayoutStorage` adapter (default: localStorage with namespaced keys — medium and key names are consumer configuration); silent fallback to the default layout on corrupt/absent state; restore-to-default clears both keys. | `LayoutStorage`, `createPersistence`, `HeightsMap` | HP8, A4–A9, C2, C4, HP9 |
| 3 | **Pin-pass wiring** (`pinHeights.ts`) | The per-tabset pinned-heights model: members/chrome measurement, pin + reconcile, the maintenance pass with sample-guard, stable-heights collection. Grows a wiring hook that runs the pass on layout change, gated during live window drags. | `pinAllWindows`, `collectStableHeights`, `usePinnedHeights` (planned) | HP4, HP6, B4–B6, A5, A8 |
| 4 | **Drag/unwrap claim + veto engine** (`unwrap.ts`) | Grid-surface drop claims (panel or whole tabset → new float window, source-rect sizing, height carry), the veto set (no left/right splits, no group-into-grid docks, float-excluded panels), zone-overlay suppression state, dead-zone pointerup fallback. | `handleWillDrop`, veto predicates, `unwrapAtPointer`, `useDropRules` (planned) | HP2, HP3, HP4, HP7, F3, F5 |
| 5 | **Window drag containment** (`windowDrag.ts`) | Top/left/right containment with a free bottom edge (top-cap semantics that prevent the bottom-anchor flip), `{top}`-only normalization on release, drag-session gate for the pin pass, stale zone-overlay sweep. | `clampDragBox`, `normalizeTops`, `WindowDragGate` | HP5, F4 |
| 6 | **Gesture takeover** (`dragTakeover.ts`) | Capture-phase sash + window-bottom/corner pointer routing: sash resizes the tabset above, bottom edge resizes the last tabset, corners also set width (min 120px); commits heights on pointerup (takeover drags fire no layout-change event). | `wireTabsetEdges` | HP6 |
| 7 | **Titlebar chrome** (`titlebar.ts`) | Ridged drag-grip decoration (idempotent, safety-netted for windows created later) + move-only enforcement. The enforcement reach-in (`_titleBar.dragSource`) is quarantined, feature-detected, and degrades gracefully (shift-drag redock) if the engine surface shifts. | `decorateTitlebars`, `watchTitlebars` | F2, A4 (grip timing) |
| 8 | **Per-panel error boundary** (planned) | Wraps consumer panel components so a render throw renders an inline "panel failed" state instead of unmounting the layout (dockview-react ships no boundary). | `PanelErrorBoundary` | C3 |
| 9 | **Focus/keyboard layer** (planned) | `:focus-visible` styles for library-owned controls (tabs, sashes), surfacing `keyboardNavigation`, close/unwrap focus restoration. | CSS + option wiring | G1–G3, G5–G8 |
| 10 | **Theming/CSS layer** (`panel-layout.css` + `tokens.ts`) | Library chrome styles extracted verbatim from the mock (design tokens, dockview theme overrides, grip, suppression, sash cursors) with a drift check against the mock; typed token views for programmatic consumers. | `tokens:extract [--check]`, `CONSTANTS`, `TOKENS`, `DV_TOKENS` | §4 of behavior.spec.md, J4/J5 |

## 3. Explicitly not in this package

- **The 11 demo panels** (outline, bibliography, validation, review,
  pinned, identity, attributes, structure, derived, overlays, document) —
  demo consumer registrations, forever. The library's only panel-related
  contract is the container: render into a fixed-height, internally
  scrolling box (D1/D2).
- **App chrome** — toolbars, statusbars, boot/CDN overlays, viewport
  strategy: [`demo.spec.md`](./demo.spec.md).
- **Panel semantics** — data, filters, empty lists: panel territory.

## 4. Mock and goldens as acceptance references

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

## 5. Design decisions

Resolutions, with their evidence anchors; each reverses only with a spec
change. The assembled `<PanelLayout>` prop surface reads:
`registry: PanelRegistry`, `defaultLayout: SerializedDockview`,
`persistence?: PersistenceOptions` (omit → no persistence),
`autoWrap?: boolean` (HP2/HP7, default true), `dockviewOptions?:
Partial<DockviewOptions>` (passthrough; the library owns `dndStrategy`,
`floatingGroupBounds`, `floatingGroupDragHandle`), `onReady` (required),
`onDidFallback?`. No toolbar/statusbar slots (§3).

1. **Event surface naming** — decided: dockview's own split. Component
   props carry exactly two callbacks — `onReady({ api })` (required) and
   `onDidFallback` (the low-frequency channel A6/A7/A9/C2 point at, with
   `reason: 'layout-corrupt' | 'heights-corrupt' | 'layout-restore-threw'
   | 'storage-unavailable'`); every change/stream event lives on
   `PanelLayoutApi = DockviewApi & { onDidLayoutSettled }` (intersection,
   not `interface extends` — `DockviewApi` has private members) as
   `onDid*`/`onWill*` subscriptions returning `DockviewIDisposable`
   (dockview names, verbatim — no parallel vocabulary). Engine emitters
   are re-exposed, not re-wrapped; dockview-react's optional
   `onDidDrop`/`onWillDrop` props are deliberately not mirrored (the veto
   engine owns `onWillDrop`; emitters are multicast, so consumers layer
   on via the api without displacing library wiring). Evidence: dockview
   `IDockviewReactProps` (onReady required) vs `DockviewApi` emitters;
   dockview events doc marks `onDidLayoutChange` an aggregation needing
   debounce — too hot for props; VS Code/Monaco
   subscription-returns-disposable as the canonical emitter shape.
2. **Settled vs continuous** — decided: expose both; persistence defaults
   to settled; no library-side debounce. Continuous = `onDidLayoutChange`
   passthrough (live UI). Settled = `onDidLayoutSettled` carrying
   `{ source: 'layout' | 'heights', origin: 'user' | 'api' }`, composed
   from three nets: dockview's `onDidMutateLayout` bracket (single
   transaction per compound operation; `fromJSON` is one `'load'`
   transaction, so HP1's immediate first save is covered), the
   drag-takeover pointerup commit (HP6 — takeover drags fire no
   layout-change event), and window-drag release. Evidence:
   react-resizable-panels v4 `onLayoutChanged` ("not called until the
   pointer has been released… recommended when saving layouts", with
   `debounceSaveMs` deprecated in its favor) and its
   `meta: { isUserInteraction }` pattern; Radix `onValueCommit` / React
   Aria `onChangeEnd` as the committed-variant precedent.
3. **Public type re-export list** — decided: types-only, curated, exactly
   ten names from `'dockview'`:
   `DockviewApi`, `DockviewEvent`, `DockviewIDisposable`,
   `DockviewOptions`, `DockviewReadyEvent`, `DockviewWillDropEvent`,
   `DockviewWillShowOverlayLocationEvent`, `IDockviewPanelHeaderProps`,
   `IDockviewPanelProps`, `SerializedDockview`. No value re-exports
   (`DockviewDefaultTab` etc. stay from `dockview-react`), no own aliases
   over dockview types. Type-only re-exports erase at emit, so nothing
   binds to a second engine copy — the duplicate-instance failure class
   that drove FullCalendar v6 to un-re-export its core. The serialized
   panel field is `contentComponent` (the registry key — decision 5).
   Evidence: semver-ts curated-surface guidance (cross-package `export *`
   antipattern; every curated re-export is own SemVer surface).
4. **Heights-map ownership** — decided: one envelope
   `{ version: 1, layout, heights }` under one adapter key (the new
   default), with the two halves decoded independently so A6/A7
   independent-corruption semantics survive (valid layout + corrupt
   heights → keep layout, default heights; and vice versa); version
   mismatch → whole-envelope fallback. The legacy two-key format remains
   a first-class `format` option that the demo and parity suite pin for
   byte-exact goldens. One `LayoutStorage` adapter, never two (`clear()`
   stays atomic for HP9). Validation is hand-rolled guards behind a
   single decode seam (dockview's `SerializedDockview` carries no version
   or migration story — versioning is ours); a schema decoder can replace
   the seam's internals later without API change. Evidence:
   react-resizable-panels single namespaced key + legacy read path;
   Golden Layout single saved-state key.
5. **`PanelRegistry` shape** — decided:
   `Record<string, PanelRegistration>` keyed by `contentComponent` name,
   with `PanelRegistration = { component, title?, floatable?,
   minHeight? }`. Precedence by kind: serialized/default-layout entries
   win for `title` (fallback chain layout → registry → panel id, per E2 —
   the last rung is dockview-native `title ?? id`); the registry wins for
   `floatable`/`minHeight` (behavioral policy — never read from
   serialization, so user storage cannot flip a veto or breach a floor;
   the pin pass re-derives constraints on every load, A5). The F3
   float-exclusion set is derived from the registry
   (`floatExcludedPanels(registry)`), not a separate prop — it cannot
   drift from the registry. `minHeight` only ever raises the global
   `MIN_TS_H` floor (B4/B5 stay global). Consumer panel data keeps
   dockview-native `params` untouched. Evidence: react-resizable-panels
   declarative min/max on `<Panel>` (never persisted); dockview addPanel
   title/constraints behavior — with the policy-vs-data split from F3.
