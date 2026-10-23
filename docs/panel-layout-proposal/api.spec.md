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

## 5. Open design decisions

To resolve before the component layer is coded; decisions recorded here
once made.

1. **Event surface naming** — engine-style `onDid*`/`onWill*` subscriptions
   with disposables on the api object vs React-callback props on the
   component (dockview uses both; the split is the pattern to follow).
2. **Settled vs continuous change events** — persistence should subscribe
   to a settled signal (pointer-release/structural, per the takeover
   commit hook and react-resizable-panels precedent), but the library must
   also expose a continuous signal for live UI; decide which is default.
3. **Public type re-export list** — `DockviewApi`, `SerializedDockview`,
   panel-props and event types re-exported from this package (one import
   site; engine major bumps in one place). Exact list to be fixed with the
   first exports; blanket `export *` is ruled out.
4. **Heights-map ownership** — whether `HeightsMap` persistence rides the
   same adapter as the layout blob or a second injected namespace.
5. **`PanelRegistry` shape** — string-keyed components (dockview's record)
   vs richer registration metadata (title, floatable, minHeight) and how
   per-panel options interact with serialized params.
