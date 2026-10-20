# Demo project (panel-layout mock) — behavior specification

## 1. Purpose and scope

This document specifies the behavior states of the **demo consumer** of
[`@metanorma/panel-layout`](../../pkg/panel-layout/index.ts) as realized in
the single-file live mock
[`editor-dockview7-floats.html`](../../pkg/panel-layout/mock/editor-dockview7-floats.html):
its CDN bootstrap, its demo preset geometry at narrow viewports, and the app
chrome (toolbar/statusbar) it contributes around the library's layout
surface. Layout behavior itself — windows, tabsets, tabs, sashes, zones,
drag/drop, persistence, focus — is the library's contract and lives in
[`behavior.spec.md`](./behavior.spec.md); nothing here overrides it.

Row IDs below reuse the numbering those rows carried in `behavior.spec.md`
before they moved here, so cross-references (frames, goldens, commit
history) stay resolvable.

## 2. Demo-only state matrix

| State | Trigger / data condition | What renders | Notes |
|---|---|---|---|
| **A. Loading (mock bootstrap)** | | | |
| A1 Boot pending | Page open, modules unresolved | `#boot` full-viewport #22262c overlay, centered gray text "Loading React + dockview v7 from CDN (esm.sh/unpkg)…" (:47, :345) | Same artifact in both mocks; no spinner; removed only after render (:1564) |
| A2 Slow CDN | Import latency | Same overlay, indefinite; `#root` empty behind | No timeout/retry |
| A3 CDN failure | Any `await import` throws | Overlay text → `Failed to load from CDN: <msg>` + instructions (:1566–1568) | **Frame: `cdn-failure.html`** — dark overlay + real copy, no other chrome |
| **C. Error (bootstrap)** | | | |
| C1 CDN failure | = A3 | = A3 | Duplicate of A3 kept for numbering continuity |
| **I. Narrow viewport (demo preset + app chrome)** | | | |
| I1 <~1400px | Narrow browser | Inspector (left:1050,w:320) hangs off-right; stock clamp disabled by 0-minimums (:1543) | min: clamp saved `left` on load |
| I2 <~800px | Phone-class | Floats overlap on tiny pasteboard; toolbar flex no-wrap (:57) → buttons clip (measured onset below ~718px); statusbar `.live` wraps tall | **Frame: `narrow-viewport.html`** — captured 720×900 degraded reality, plus the PROPOSED FUTURE ≤720px single-window/tabbed collapsed variant (icon toolbar, hint hidden) pending designer sign-off |
| **G. Keyboard & focus (app chrome)** | | | |
| G4 Toolbar buttons | Tab key | Native UA focus rings on demo toolbar buttons, not suppressed | Library owns no toolbar; focus styles for library-owned controls (tabs/grips/sashes) are behavior.spec.md G3 |
| **F. App chrome defects** | | | |
| F1n Auto-wrap toggle a11y | Inspect toggle markup | Toggle state conveyed only by class + label suffix ("…: ON"/"…: OFF") | Gap: lacks `aria-pressed`; source of behavior.spec.md F1/HP7 |

All `:NNN` line references point into
`pkg/panel-layout/mock/editor-dockview7-floats.html`.

## 3. Frames

Two of the captured state frames belong to this spec (build outputs —
regenerate all frames plus PNG siblings with
`yarn workspace @metanorma/panel-layout capture:states`):
[`cdn-failure.html`](../../pkg/panel-layout/mock/states/cdn-failure.html)
(A3) and
[`narrow-viewport.html`](../../pkg/panel-layout/mock/states/narrow-viewport.html)
(I2). The I2 collapsed variant is PROPOSED content pending designer
sign-off (delimited in the frame by PROPOSED / END PROPOSED comments and
`data-proposed` attributes); it is not implemented in the mock.

## 4. Demo-only values

- **Bootstrap**: pinned CDN dep URLs in the mock's `<script type="importmap">` (react/react-dom/dockview from esm.sh + dockview.css from unpkg; verbatim in the mock). These are the demo's dependency strategy, not a library contract.
- **App chrome**: toolbar (Bold · Italic | Quote · Note | Xref · Eref | spacer | Auto-wrap panels toggle | Reset) and statusbar (status dot + text | grow | `.live` hint | word count/saved line) are demo/consumer chrome around the library surface.
