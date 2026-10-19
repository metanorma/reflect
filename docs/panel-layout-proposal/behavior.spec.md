# Panel layout — behavior specification (state matrix)

## 1. Purpose and scope

This document specifies the **behavior states of the panel layout GUI** —
window chrome, tabsets, tabs, sashes, drop zones, drag/drop semantics,
persistence, focus, and viewport behavior — as realized in the live mock
[`mockups/editor-dockview7-floats.html`](../../mockups/editor-dockview7-floats.html)
(dockview v7.0.4, floating "tabset group" mini-windows). The older
[`mockups/editor-flexlayout-floats.html`](../../mockups/editor-flexlayout-floats.html)
is the visual-language reference and is cited where both mocks share an
artifact.

All `:NNN` line references point into
`mockups/editor-dockview7-floats.html`.

**Scope.** Panel **chrome and layout behavior** is the reference contract.
Panel **content is out of scope**: the panel bodies in the mock are
illustrative static HTML (the `PANELS` map, :359), left to future panel
implementers. Where the matrix touches panel interiors it specifies only the
container contract (scroll/whitespace inside a pinned-height tabset) and
chrome text (tab titles), never panel semantics or data states.

Interaction contract established elsewhere and assumed here: panels merge as
tabs (center drop) or stack vertically (top/bottom drop) inside mini windows;
left/right splits are vetoed; dropping a panel/tabset on empty space unwraps
it into a new mini window (auto-wrap, toggleable); the Document panel never
enters mini windows; window drag is contained top/left/right but free below
the bottom edge; no edge snapping; Reset restores the preset; layout and
per-tabset heights persist to localStorage.

## 2. State matrix

| State | Trigger / data condition | What renders | Notes |
|---|---|---|---|
| **A. Loading** | | | |
| A1 Boot pending | Page open, modules unresolved | `#boot` full-viewport #22262c overlay, centered gray text "Loading React + dockview v7 from CDN (esm.sh/unpkg)…" (:47, :345) | Same artifact in both mocks; no spinner; removed only after render (:1564) |
| A2 Slow CDN | Import latency | Same overlay, indefinite; `#root` empty behind | No timeout/retry |
| A3 CDN failure | Any `await import` throws | Overlay text → `Failed to load from CDN: <msg>` + instructions (:1566–1568) | **Frame: `mockups/states/cdn-failure.html`** — dark overlay + real copy, no other chrome |
| A4 First hydration | No layout in storage | Preset; members 1–2 frames oversubscribed ([257,117,100] vs pins [244,132,74], :904) then pin pass settles | Grips may appear ≤500ms late (interval net, :1496) |
| A5 Reload, persisted layout | Valid storage keys | Saved window rects + saved per-tabset heights (`loadHeights` → pin pass) | `normalizeTops` keeps serialization `{top}`-only (:1133) |
| A6 Corrupted layout JSON | Parse throws / `j.grid` falsy | Silent fallback to preset (:665–672) | min: statusbar flash "layout restored to preset" |
| A7 Corrupted heights JSON | Heights key unparseable | `heightsMap={}` → preset heights (:920–922) | Same as A6 |
| A8 Stale group ids in heights | Windows closed since save | Ignored; map rebuilt from live members (:898) | Cosmetic only |
| A9 fromJSON throws mid-restore | Structurally bad saved JSON | **not implemented** — dockview logs 'failed to deserialize layout. Reverting changes', clears, rethrows → React unmounts → blank page | min: try/catch → `fromJSON(presetLayout())` |
| **B. Empty** | | | |
| B1 All panels closed incl. doc | Every tab ✕'d | Floats dispose as they empty; grid shows stock watermark = bare `div.dv-watermark`, zero text; toolbar/statusbar remain | **Frame: `mockups/states/empty-editor.html`** — existing chrome + pasteboard + faint "Reset restores the preset" hint (hint itself not implemented) |
| B2 Last float window closes | Last tab of a window | Window vanishes; layout auto-saves | No animation |
| B3 Tabset just before disposal | Second-to-last tab closed | Normal tabset at pinned height; last close removes row + its sash | No intermediate state exists |
| B4 Tabset at MIN_TS_H | Drag to 36px floor (:758) | 24px titlebar + 30px tab strip + ~6px content sliver | Sash hover accent is the only expand cue |
| B5 Window at MIN_WIN_H | Drag to 150px (:759) | Members clamp at 36px each; overflow absorbed | Corner drag clamps width ≥120px (:974) |
| B6 Degenerate sash | Oversubscribed pins | 4px sashes; members overflow past window bottom | Only via corrupted persisted heights |
| **C. Error** | | | |
| C1 CDN failure | = A3 | = A3 | — |
| C2 localStorage throws | Quota/private mode | All 4 calls swallowed → persistence silently off; session runs preset + memory | Statusbar "layout saved" claim is then false; min: swap that text |
| C3 Panel component throws in render | Component exception | **not implemented** — no error boundary in dockview-react v7.0.4; tree unmounts → blank page | min: per-panel boundary rendering "Panel failed: <id>" |
| C4 toJSON fails | Bad structure | Swallowed → stale layout kept | Invisible |
| **D. Content vs container** (container behavior only) | | | |
| D1 Content taller than tabset | Any panel above its pinned height | Internal scrollbar in `.panelwrap` (`overflow:auto`, :158) — stock, both mocks | The contract panel content must expect: render into a fixed-height box |
| D2 Content shorter than tabset | Any panel below its pinned height | White whitespace below (`.panelwrap` bg fills) | Panels own their empty space; no stretch/fill affordance |
| (Panel-data states — empty lists, long strings, filtering results — out of scope for this spec) | | | |
| **E. Long/short/missing chrome text** | | | |
| E1 Long tab titles | Long panel name | Stock dv-tab strip; overflow container unstyled in this theme/mock → tabs compress | min: ellipsis on `.dv-tab`; no tab tooltips |
| E2 Missing title | Panel without `title` | Tab shows panel id | — |
| E3 Grip/tooltips at narrow width | Min-width window | Text-free 44px grip — unaffected; toggle `title` unaffected | — |
| **F. Disabled/read-only** | | | |
| F1 Auto-wrap OFF | Toolbar toggle | No hint change; `.mn-unwrap-hover` no longer applied → doc-grid zone overlays reappear; panel center-drop on grid merges as doc sibling tab (unclaimed stock path); edge drops still vetoed | Toggle lacks `aria-pressed`; OFF leaks the merge-into-doc layout |
| F2 Titlebar move-only | Always (T6, :720) | `grab`/`grabbing` cursors, grip darkens on hover; no redock from titlebar | Grip is decorative (`aria-hidden`, pointer-events:none) |
| F3 Doc tab dragged | Drag toward a float | Ghost follows, all float targets vetoed (`docIntoFloat`), snaps back | Affordance mismatch; min: default cursor on doc tab |
| F4 Window drag live | Titlebar pointerdown | Pin pass gated off (:1335); transform move; top/left contained, bottom free (:1140) | Drawer park below bottom edge |
| F5 Panel/group drag over grid | Drag over doc surface | `.mn-unwrap-hover` hides grid zone overlays, re-shows float ones (:148–155) | — |
| **G. Keyboard & focus** | | | |
| G1 Tab-strip roving tabindex | Focus tab, arrows | Inherited, always on: arrows/Home/End move, Enter/Space activate, Delete/Backspace close+refocus | WAI-ARIA tabs, dockview `tabs.ts` |
| G2 ctrl+] / ctrl+[ / F6 | Anytime | **not active** — needs `keyboardNavigation: true`, not passed (:1533–1552) | min: add the prop |
| G3 Focus ring on tabs | Keyboard focus | None — no `:focus-visible` in mock or dockview.css; `.dv-groupview:focus{outline:none}` | min: `.dv-tab:focus-visible` accent outline |
| G4 Toolbar buttons | Tab key | Native UA rings, not suppressed | — |
| G5 Focus after mouse-close | Click tab ✕ | MRU successor activates; DOM focus drops to body | Only keyboard-close path refocuses |
| G6 Focus after unwrap | Drop on empty space | New window activates; focus not moved | — |
| G7 Keyboard drag/undock | Any | **not implemented** — grip hidden, titlebar unfocusable, keyboard docking off (same option as G2) | — |
| G8 Escape during drag | Esc mid-drag | **not implemented** — only `pointercancel` wired, and it commits | min: Esc → cancel + restore box |
| **H. RTL** | | | |
| H1 `dir=rtl` | Hypothetical | **not supported.** Tab strip order, `clampDragBox` physical left/top (:1140), float overlay positioning, gradient directions (:203, :310) all LTR | Bidirectional build: logical properties, direction-aware clamp, mirrored gradients, dockview RTL verification |
| **I. Narrow viewport** | | | |
| I1 <~1400px | Narrow browser | Inspector (left:1050,w:320) hangs off-right; stock clamp disabled by 0-minimums (:1543) | min: clamp saved `left` on load |
| I2 <~800px | Phone-class | Floats overlap on tiny pasteboard; toolbar flex no-wrap (:57) → buttons clip; statusbar `.live` wraps tall | **Frame (FUTURE): `mockups/states/narrow-viewport.html`** — ≤720px single-window/tabbed collapsed variant, icon toolbar, hint hidden |
| I3 Touch | Touch device | Pointer DnD works; 24px titlebar under-tuned | Out of scope |
| **J. Motion** | | | |
| J1 Drag ghost | Any tab drag | Stock pointer-DnD ghost, unthemed | — |
| J2 Window move | Titlebar drag | Transform + will-change, per-frame clamp, no easing | Correct for direct manipulation |
| J3 Sash/bottom resize | Takeover drag | Per-frame pin + `position()`, no animation | — |
| J4 Zone overlays | Drag over targets | Stock 70ms selection / 300ms anchor transitions; suppression is instant `display:none !important` | — |
| J5 Sash hover accent | Hover sash | 0.1s fade after 0.5s delay (theme vars) | Stock |
| J6 Maximize | — | Unused; no affordance | N/A |
| J7 Reduced motion | `prefers-reduced-motion` | **not implemented** — no media query anywhere | min: kill J4/J5 transitions under the query |

**Frames recommended** (3, static only, not yet created):
`mockups/states/cdn-failure.html`, `mockups/states/empty-editor.html`,
`mockups/states/narrow-viewport.html` (labeled FUTURE).

## 3. Default / initial values

- **Storage**: `mn-dockview7-floats-v1`, `mn-dockview7-heights-v1`; empty first load; written on layout change + takeover drags; wiped by Reset.
- **Toolbar**: Bold · Italic | Quote · Note | Xref · Eref | spacer | Auto-wrap panels: **ON** | Reset.
- **Statusbar**: amber dot + status text | grow | `.live` hint | word count/saved line.
- **Grid**: HORIZONTAL 1200×800; `group-doc` / panel `doc`; `activeGroup:'group-doc'`; doc never floats.
- **Floats**: Navigation `{18,12} 252×450` — tabsets 244/132/74. Pinned `{292,12} 300×168` — 142. Inspector `{1050,12} 320×602` — 200/180/116/100. (Per-tabset active panels and titles per `TITLES`/preset, :595–659.)
- **Constants**: MIN_TS_H 36, MIN_WIN_H 150, min width 120, sash 4px, titlebar 24px, undock chrome 26, WRAP 260×200 (fallback), dndEdges 160/26.
- **Dockview options**: themeLight, `floatingGroupDragHandle:'titlebar'`, `dndStrategy:'pointer'`, `floatingGroupBounds` 0/0 (containment via `clampDragBox`: top/left only), `DockviewDefaultTab`. `keyboardNavigation` unset (off).

## 4. Keyboard & focus behavior

**Present**: roving tabindex per tab strip (arrows, Home/End, Enter/Space, Delete/Backspace close+refocus); native focus + UA rings on toolbar buttons (panel-internal native inputs remain focusable but are panel territory).

**Missing**: `keyboardNavigation` off → no ctrl+]/[, F6/shift+F6, ctrl+shift+\, ctrl+M docking; no `:focus-visible` styles (group focus outline actively removed); grip `aria-hidden` + unfocusable titlebar → no keyboard move/undock/stack-drag; no Esc-cancel on drags; mouse-close and unwrap both leave DOM focus on body; auto-wrap toggle lacks `aria-pressed`.

## 5. Transitions

- boot → layout: overlay removed after render; 1–2 frame height settle on floats.
- corrupted-storage → preset: silent, immediate.
- fromJSON-throw → blank: dockview revert + React unmount; no auto-recovery edge (A9 gap).
- drag → merge (center on float): stock; window grows by pinned height.
- drag → unwrap (empty space): zones suppressed instantly → `addFloatingGroup` at clamped point, source height inherited + pinned, persisted; source window shrinks/disposes.
- group-drag → dead zone (toolbar/outside): pointerup fallback unwraps identically.
- last-tab close → window dispose; grid-empty → bare watermark (B1).
- sash/bottom drag → pinned height: no animation; persist on pointerup (no layout-change event).
- window drag → bottom park: bottom-free clamp; `normalizeTops` re-anchors on release.
- Reset: wipe → clear → preset → re-pin; sole edge back from B1/corruption.
- auto-wrap toggle: OFF reopens grid zone overlays + doc-merge path; ON reclaims.
