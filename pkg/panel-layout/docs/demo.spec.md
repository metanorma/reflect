# Demo project (panel-layout) — behavior specification

## 1. Purpose and scope

This document specifies the behavior states of the **demo consumer** of
[`@metanorma/panel-layout`](../index.ts) — the panel registrations,
preset, storage configuration, panel content, and app chrome
(toolbar/statusbar) shipped as the package's
[`./demo`](../demo/index.ts) subpath (consumer configuration per
api.spec.md §4; it consumes the public API only). The demo is realized
by mounting `DemoApp`: the reference mock
([`editor-dockview7-floats.html`](../mock/editor-dockview7-floats.html))
is its thin mount (CDN bootstrap + app-chrome CSS + one `DemoApp`
render), and the twin target consumes the same configuration.

Scope here: the demo's CDN bootstrap, its preset geometry at narrow
viewports, and the app chrome it contributes around the library's layout
surface. Layout behavior itself — windows, tabsets, tabs, sashes, zones,
drag/drop, persistence, focus — is the library's contract and lives in
[`behavior.spec.md`](./behavior.spec.md); the module inventory
implementing it is [`api.spec.md`](./api.spec.md); nothing here overrides
either.

Row IDs below reuse the numbering those rows carried in `behavior.spec.md`
before they moved here, so cross-references (frames, goldens, commit
history) stay resolvable.

## 2. Demo-only state matrix

| State | Trigger / data condition | What renders | Notes |
|---|---|---|---|
| **A. Loading (mock bootstrap)** | | | |
| A1 Boot pending | Page open, modules unresolved | `#boot` full-viewport #22262c overlay, centered gray text "Loading React + dockview v7 from CDN (esm.sh/unpkg)…" | No spinner; removed only after render |
| A2 Slow CDN | Import latency | Same overlay, indefinite; `#root` empty behind | No timeout/retry |
| A3 CDN failure | Any `await import` throws | Overlay text → `Failed to load from CDN: <msg>` + instructions | **Frame: `cdn-failure.html`** — dark overlay + real copy, no other chrome |
| **C. Error (bootstrap)** | | | |
| C1 CDN failure | = A3 | = A3 | Duplicate of A3 kept for numbering continuity |
| **I. Narrow viewport (demo preset + app chrome)** | | | |
| I1 <~1400px | Narrow browser | Inspector (left:1050,w:320) hangs off-right; stock clamp disabled by 0-minimums | min: clamp saved `left` on load |
| I2 <~800px | Phone-class | Floats overlap on tiny pasteboard; toolbar flex no-wrap → buttons clip (measured onset below ~718px); statusbar `.live` wraps tall | **Frame: `narrow-viewport.html`** — captured 720×900 degraded reality, plus the PROPOSED FUTURE ≤720px single-window/tabbed collapsed variant (icon toolbar, hint hidden) pending designer sign-off |
| **G. Keyboard & focus (app chrome)** | | | |
| G4 Toolbar buttons | Tab key | Native UA focus rings on demo toolbar buttons, not suppressed | Library owns no toolbar; focus styles for library-owned controls (tabs/grips/sashes) are behavior.spec.md G3 |
| **F. App chrome states** | | | |
| F1n Auto-wrap toggle a11y | Inspect toggle markup | Toggle state conveyed by class + label suffix ("…: ON"/"…: OFF") **and** `aria-pressed` | Naming continuity with behavior.spec.md F1/HP7 |
| C2n Statusbar storage-failure state | Library emits `onDidFallback` with reason `storage-unavailable` (behavior.spec.md C2) | `.live` tail swaps `layout saved` → `layout NOT saved — storage unavailable` (latched); default output byte-identical otherwise | Demo-owned surfacing of the library's once-per-instance write-failure signal |

## 3. Frames

Two of the captured state frames belong to this spec (build outputs —
regenerate all frames plus PNG siblings with
`yarn workspace @metanorma/panel-layout capture:states`):
[`cdn-failure.html`](../mock/states/cdn-failure.html)
(A3) and
[`narrow-viewport.html`](../mock/states/narrow-viewport.html)
(I2). The I2 collapsed variant is PROPOSED content pending designer
sign-off (delimited in the frame by PROPOSED / END PROPOSED comments and
`data-proposed` attributes); it is not implemented in the demo.

Frame regeneration note: the capture tool serves the mock with `mock/` as
its root, where the demo stylesheet is unreachable — regenerating frames
from the thinned mock needs the server-root fix recorded in
`dist/README.rst`. The checked-in frames remain valid as captured
artifacts.

## 4. Demo-only values

- **Bootstrap**: pinned CDN dep URLs in the mock's `<script
  type="importmap">` (react/react-dom/dockview from esm.sh + dockview.css
  from unpkg; verbatim in the mock). The importmap also routes
  `@metanorma/panel-layout` to the locally built mock-facing bundle —
  still the demo's dependency strategy, not a library contract.
- **App chrome**: toolbar (Bold · Italic | Quote · Note | Xref · Eref |
  spacer | Auto-wrap panels toggle | Reset) and statusbar (status dot +
  text | grow | `.live` hint | word count/saved line) are demo/consumer
  chrome around the library surface; both live in
  [`demo/chrome.tsx`](../demo/chrome.tsx), styled by
  [`demo/app-chrome.css`](../demo/app-chrome.css) — linked by the
  reference mock (its inline `<style>` is comment-only).
- **Registrations and preset**: the 11-panel registry (incl. the `doc`
  float-exclusion policy entry), `presetLayout()`, and the two-key
  storage configuration (legacy `mn-dockview7-*` keys) live in
  [`demo/`](../demo/index.ts) — the demo's single source for all three,
  pinned by `tests/demo.test.mjs`.
