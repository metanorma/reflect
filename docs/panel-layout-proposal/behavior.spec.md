# Panel layout — behavior specification (state matrix)

## 1. Purpose and scope

This document specifies the **behavior states of the panel layout GUI** —
window chrome, tabsets, tabs, sashes, drop zones, drag/drop semantics,
persistence, focus, and viewport behavior — as realized in the live mock
[`editor-dockview7-floats.html`](../../pkg/panel-layout/mock/editor-dockview7-floats.html)
(dockview v7.0.4, floating "tabset group" mini-windows), the reference
artifact of the [`@metanorma/panel-layout`](../../pkg/panel-layout/index.ts)
package. The older
[`mockups/editor-flexlayout-floats.html`](../../mockups/editor-flexlayout-floats.html)
is the visual-language reference and is cited where both mocks share an
artifact.

All `:NNN` line references point into
`editor-dockview7-floats.html`.

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

## 2. Happy-path flows (primary flows)

Each flow is numbered steps followed by its **observable outcome** — what is
in the DOM, in storage, and in the layout serialization. Flows are
acceptance criteria and future test names. HP rows describe structure and
behavior only; panel content is opaque input the implementation must accept
(§1).

**HP1 — Open editor → preset layout renders.**
1. Load the page with both storage keys absent.
2. Modules resolve; `#boot` is removed; `fromJSON(presetLayout())` runs
   (:1325), then the pin pass (:1349).
*Outcome:* main grid hosts the `doc` group alone; three floating windows
(Navigation 252×450, Pinned 300×168, Inspector 320×602) each render
titlebar + grip + stacked tabsets at preset heights (§4); both storage keys
written immediately (`saveLayout`, :1326). Serialization: one `floatingGroups[]`
entry per window, all position forms `{left,top,width,height}`.

**HP2 — Drag panel tab out of a tabset → new floating window (auto-wrap).**
1. Pointer-drag a panel tab (e.g. from Navigation) over the doc grid
   surface — pasteboard or page, any zone.
2. `.mn-unwrap-hover` suppresses doc-grid zone overlays; float-window
   overlays remain (:148–155).
3. Release on the grid surface.
*Outcome:* `handleWillDrop` claims the drop (:1233–1314): a new float
window appears centered on the pointer, sized to the **source tabset's
rect** (width + content height + 26px chrome), the new group pinned to the
source height, `heightsMap[newGroupId]` set; the source window shrinks by
the removed member (or disposes if it was the only one). Storage: layout
key gains the new `floatingGroups[]` entry; heights key gains the id.
Serialization: new window uses `{top}` form.

**HP3 — Drop panel on float-window center → merges as sibling tab.**
1. Drag a panel tab over another float window's content center.
2. Center zone inks (stock 70ms).
3. Release.
*Outcome:* panel appended to the target tabset's `views[]` (stock path —
not claimed, not vetoed); window height grows by the target group's pinned
height via reconcile (window := Σ members + chrome); no heights entry
changes for existing groups. Serialization: target `views[]` includes the
panel id; source window loses it.

**HP4 — Drag whole tabset (void container) → stack into another window.**
1. Drag a tabset's empty tab-strip space (void container).
2. Hover another float window's top or bottom edge zone.
3. Release.
*Outcome:* the group moves as a unit into the target window's nested grid
(vertically stacked), **keeping its height** (pinned min==max travels with
it); the target window grows by (height + 4px sash); the source window
shrinks or disposes. Serialization: group id appears in the target's
`floatingGroups[].grid` leaves with its `size`; heights entry unchanged
(height follows the group, not the slot).

**HP5 — Move window via titlebar.**
1. Pointer-drag the (text-free) titlebar grip.
2. Drag: `windowDragLive` gates the pin pass off (:1335); transform move
   with top/left containment, bottom free (:1140–1146).
3. Release anywhere, including below the layout area's bottom edge.
*Outcome:* window rests at the pointer, top-clamped so the titlebar stays
reachable; a window parked half-below the bottom edge remains grabbable.
`normalizeTops` re-anchors any bottom-anchored form to `{top}` (:1149–1158)
before serialization. Storage: position updated, `{top}` form only.

**HP6 — Resize a tabset via sash / window bottom edge.**
1. Drag a sash inside a float window (resizes the tabset **above** it), or
   the window's bottom edge / bottom corners (resize the **last** tabset).
2. Per pointermove: target group re-pinned to `max(MIN_TS_H, h)`, window
   height follows (:933–993).
3. Release.
*Outcome:* only the target tabset's height changed; siblings byte-stable
(pin model). Storage: heights key updated on pointerup (`saveHeights`,
:985); layout key updated on the next structural change (takeover drags
fire no `onDidLayoutChange`). Corner drags may also change width (min
120px), shared by all members.

**HP7 — Toggle auto-wrap OFF → drags fall back to vetoes.**
1. Click "Auto-wrap panels: ON" (button loses `.on`; `autoWrapEnabled=false`).
2. Drag a panel tab to the doc grid surface and release.
*Outcome:* no unwrap; grid zone overlays now show (suppression gated on the
toggle, :1470–1474); center-drop merges the panel as a doc sibling tab
(stock path unclaimed — see F1); edge drops still vetoed. See §3 F1.

**HP8 — Reload → persisted layout restores.**
1. Arrange windows/tabsets (HP2–HP6), then reload.
*Outcome:* storage keys parse; `fromJSON(saved)` + `loadHeights()` restore
window rects and per-tabset heights; transient 1–2 frame oversubscription
settles via the pin pass (A4/A5). Serialization: round-trips `{top}` forms.

**HP9 — Reset → preset restored.**
1. Click Reset.
*Outcome:* both storage keys removed, `heightsMap={}` cleared,
`api.clear()` → `fromJSON(presetLayout())` → re-pin (:1505–1513); DOM
returns to the HP1 state (window identity, group ids, heights all reset).
Recovery path from B1 (empty editor) and from any corrupted persisted
state (A6/A7).

**HP10 — Close every panel → empty editor.**
1. Close each tab via its ✕ (stock `DockviewDefaultTab`).
*Outcome:* emptying a float window disposes it (last member leaves →
`floatingGroup.dispose()`); closing the doc tab too leaves the bare
watermark surface (B1) with toolbar/statusbar intact; layout key reflects
the emptied state. HP9 restores.

## 3. State matrix

| State | Trigger / data condition | What renders | Notes |
|---|---|---|---|
| **A. Loading** | | | |
| A4 First hydration | No layout in storage | Preset; members 1–2 frames oversubscribed ([257,117,100] vs pins [244,132,74], :904) then pin pass settles | Grips may appear ≤500ms late (interval net, :1496) |
| A5 Reload, persisted layout | Valid storage keys | Saved window rects + saved per-tabset heights (`loadHeights` → pin pass) | `normalizeTops` keeps serialization `{top}`-only (:1133) |
| A6 Corrupted layout JSON | Parse throws / `j.grid` falsy | Silent fallback to preset (:665–672) | min: statusbar flash "layout restored to preset" |
| A7 Corrupted heights JSON | Heights key unparseable | `heightsMap={}` → preset heights (:920–922) | Same as A6 |
| A8 Stale group ids in heights | Windows closed since save | Ignored; map rebuilt from live members (:898) | Cosmetic only |
| A9 fromJSON throws mid-restore | Structurally bad saved JSON | **not implemented** — dockview logs 'failed to deserialize layout. Reverting changes', clears, rethrows → React unmounts → blank page | min: try/catch → `fromJSON(presetLayout())` |
| **B. Empty** | | | |
| B1 All panels closed incl. doc | Every tab ✕'d | Floats dispose as they empty; grid shows stock watermark = bare `div.dv-watermark`, zero text; toolbar/statusbar remain | **Frame: `states/empty-editor.html`** — existing chrome + pasteboard + faint "Reset restores the preset" hint (hint itself not implemented) |
| B2 Last float window closes | Last tab of a window | Window vanishes; layout auto-saves | No animation |
| B3 Tabset just before disposal | Second-to-last tab closed | Normal tabset at pinned height; last close removes row + its sash | No intermediate state exists |
| B4 Tabset at MIN_TS_H | Drag to 36px floor (:758) | 24px titlebar + 30px tab strip + ~6px content sliver | Sash hover accent is the only expand cue |
| B5 Window at MIN_WIN_H | Drag to 150px (:759) | Members clamp at 36px each; overflow absorbed | Corner drag clamps width ≥120px (:974) |
| B6 Degenerate sash | Oversubscribed pins | 4px sashes; members overflow past window bottom | Only via corrupted persisted heights |
| **C. Error** | | | |
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
| I3 Touch | Touch device | Pointer DnD works; 24px titlebar under-tuned | Out of scope |
| **J. Motion** | | | |
| J1 Drag ghost | Any tab drag | Stock pointer-DnD ghost, unthemed | — |
| J2 Window move | Titlebar drag | Transform + will-change, per-frame clamp, no easing | Correct for direct manipulation |
| J3 Sash/bottom resize | Takeover drag | Per-frame pin + `position()`, no animation | — |
| J4 Zone overlays | Drag over targets | Stock 70ms selection / 300ms anchor transitions; suppression is instant `display:none !important` | — |
| J5 Sash hover accent | Hover sash | 0.1s fade after 0.5s delay (theme vars) | Stock |
| J6 Maximize | — | Unused; no affordance | N/A |
| J7 Reduced motion | `prefers-reduced-motion` | **not implemented** — no media query anywhere | min: kill J4/J5 transitions under the query |

**Frames** (2 state frames of this spec captured from the live mock; build
outputs — regenerate plus PNG siblings with
`yarn workspace @metanorma/panel-layout capture:states`):
[`empty-editor.html`](../../pkg/panel-layout/mock/states/empty-editor.html) (B1).
The "Reset restores the preset" hint inside it is PROPOSED content pending
designer sign-off (delimited by PROPOSED / END PROPOSED comments and
`data-proposed` attributes); it is not implemented in the mock. Happy-path
baselines (screens, serialized state, traces) live in
[`pkg/panel-layout/mock/goldens/`](../../pkg/panel-layout/mock/goldens/README.md)
— regenerate with `yarn workspace @metanorma/panel-layout capture:goldens`.

Boot/CDN-loading states and the narrow-viewport states (former rows A1–A3,
C1, I1–I2) belong to the demo consumer, not this library — they are
specified in [`demo.spec.md`](./demo.spec.md); their frames
(`cdn-failure.html`, `narrow-viewport.html`) remain in
[`pkg/panel-layout/mock/states/`](../../pkg/panel-layout/mock/states/) and
are referenced from that spec.

## 4. Default / initial values

The canonical values live in
[`design-tokens.json`](../../pkg/panel-layout/mock/design-tokens.json) —
machine-extracted verbatim from the mock by
[`extract-design-tokens.mjs`](../../pkg/panel-layout/mock/extract-design-tokens.mjs)
(regenerate: `yarn workspace @metanorma/panel-layout tokens:extract`;
provenance recorded in its `_provenance` key). What follows is the same
information as prose, for reading; the JSON is the shared source that both
the mock (as origin) and any implementation (as consumer) agree on.

- **Storage** (`storageKeys`): `mn-dockview7-floats-v1`, `mn-dockview7-heights-v1`; empty first load; written on layout change + takeover drags; wiped by Reset.
- **Toolbar**: Bold · Italic | Quote · Note | Xref · Eref | spacer | Auto-wrap panels: **ON** | Reset.
- **Statusbar**: amber dot + status text | grow | `.live` hint | word count/saved line.
- **Grid** (`presetLayout.grid`): HORIZONTAL 1200×800; `group-doc` / panel `doc`; `activeGroup:'group-doc'`; doc never floats.
- **Floats** (`presetLayout.floatingGroups`): Navigation `{18,12} 252×450` — tabsets 244/132/74. Pinned `{292,12} 300×168` — 142. Inspector `{1050,12} 320×602` — 200/180/116/100. Panel tab titles per `panelTitles` (11 entries).
- **Constants** (`constants`): MIN_TS_H 36, MIN_WIN_H 150, windowMinWidth 120, sashSize 4, titlebar 24px (`dvTokens['--dv-floating-titlebar-height']`), undockChrome 26, WRAP 260×200 (fallback).
- **Design tokens** (`tokens`, `dvTokens`): mock `:root` custom properties (18) and the dockview theme overrides (20), including the tab strip height 30px, `--dv-border-radius` 8px, float shadow/border, and the sash transition vars (`0.1s`/`0.5s`, §3 J5).
- **Dockview options** (`dndEdges`, `floatingGroupBounds`, plus verbatim in the mock): themeLight, `floatingGroupDragHandle:'titlebar'`, `dndStrategy:'pointer'`, `floatingGroupBounds` 0/0 (containment via `clampDragBox`: top/left only), dndEdges 160/26, `DockviewDefaultTab`. `keyboardNavigation` unset (off).

## 5. Keyboard & focus behavior

**Present**: roving tabindex per tab strip (arrows, Home/End, Enter/Space, Delete/Backspace close+refocus); native focus + UA rings on toolbar buttons (panel-internal native inputs remain focusable but are panel territory).

**Missing**: `keyboardNavigation` off → no ctrl+]/[, F6/shift+F6, ctrl+shift+\, ctrl+M docking; no `:focus-visible` styles (group focus outline actively removed); grip `aria-hidden` + unfocusable titlebar → no keyboard move/undock/stack-drag; no Esc-cancel on drags; mouse-close and unwrap both leave DOM focus on body; auto-wrap toggle lacks `aria-pressed`.

## 6. Transitions

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
