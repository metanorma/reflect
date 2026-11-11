# Minimap mockup parity — traceability and invariants

This document is the Phase-1 artifact of the mockup-parity effort: a complete
traceability map from the semantic minimap in the frozen design mockup to the
`@metanorma/prosemirror-minimap` package and its editor-gui consumer, plus the
testable invariants the mockup's logic and bug-fix history imply, plus the open
questions Phase 1 could not resolve. It records findings; it makes no design
decisions. Every ambiguity is flagged for the Phase-3 decision gate (Part C).

- **Baseline of truth**: `metanorma-editor-mockup.html` in this directory
  (`pkg/prosemirror-minimap/docs/`; 3092 lines, frozen; sole copy — relocated
  here from the repository root's `mockups/`, which no longer holds it; served
  to the parity suite at the stable virtual route
  `/mockups/metanorma-editor-mockup.html`). Line references below use
  `mockup:NNN` and are exact line numbers of that file; the frozen-target
  allowance of
  [CONVENTIONS.md](../../../docs/CONVENTIONS.md) §3.1 applies.
- **Implementation under comparison**: the package specified by
  [ProseMirrorMinimap.spec.md](../../../docs/ProseMirrorMinimap.spec.md)
  (`pkg/prosemirror-minimap/`), the consumer wiring in `pkg/editor-gui`
  (`MinimapPane.tsx`, `App.tsx`'s `metanormaClassifier`), and the schema of
  [schema.spec.md](../../../docs/schema.spec.md)
  (`pkg/prosemirror-schema/`). References to package code name modules and
  symbols, not line numbers (CONVENTIONS.md §3.1).
- The earlier standalone iteration `mockups/semantic-minimap-mockup.html` is
  supporting reading only and is not the baseline.

### Status vocabulary (Part A)

| Status | Meaning |
|---|---|
| `port` | A faithful port is possible (module/seam exists, or is planned; a plan resting on a review decision cites that decision's D-number — see "Decision inputs" below). |
| `deviate` | A port is planned but knowingly different; rationale recorded in the row. |
| `N-A` | No counterpart meaning in the port's architecture, or blocked by a schema/application capability gap. |

### Verification vocabulary (Parts A and B)

| Method | Meaning |
|---|---|
| `unit` | Headless `pkg/prosemirror-minimap/test.mjs` (`RecordingRenderer`, controller `flush()`). |
| `golden-master` | Phase-2 recorded mockup masters: scroll-sequence → thumb geometry, pan transform, shown-label sets, active element. |
| `ink-probe` | Package browser e2e canvas probes (`e2e/fixtures.ts`: `paintedRows`, `inkBands`, `thumbGeom`, `scrollGeom`). |
| `screenshot` | Side-by-side mockup-vs-port matrix for visual residue. |
| `none` | Cosmetic or not mechanically verifiable; rationale in the row. |

**Decision inputs D1–D12.** The twelve design decisions that arrived with the
Phase-1 brief (presented there as settled in review) are cited as D1–D12 in
the brief's order. Under the agreed process they are **not settled here**:
design decisions are made at the Phase-3 decision gate, which is human. This
document treats them as recorded inputs — the direction each affected row
leans on — and neither re-litigates nor ratifies them. Wherever a row or
question depends on one, the D-number marks that dependency for the gate;
contradictions between the mockup and a D-numbered input are flagged in
Part C. No ratification record for any D-input exists in this repository at
the time of writing; confirming, amending, or rejecting each is the gate's
job.

---

## Part A — Traceability map

### A.1 Markup and layout

| Item (mockup) | Counterpart (port) | Status | Verification |
|---|---|---|---|
| `#minimapWrap` aside, `aria-label="Semantic minimap"` (mockup:732) | Consumer chrome around the package component: `pkg/editor-gui/MinimapPane.tsx` wrapper; package ships no placement ([spec](../../../docs/ProseMirrorMinimap.spec.md) §12) | port | screenshot |
| `.mm-head` header: `STRUCTURE` + hint `click · drag · grip resizes` (mockup:733–736, CSS 448–450) | None in package; consumer header (ownership = open question Q4) | port | screenshot |
| `#mmBody` flex row, `gap:5px`, `overflow:hidden` (mockup:737, CSS 451) | Package container `.mn-minimap` (`position:relative; overflow:hidden`); horizontal partition becomes in-canvas lane geometry (D5), not DOM gaps | deviate | ink-probe |
| `#mmCanvas` panning canvas, `will-change:transform` (mockup:742, CSS 454) | Sliding virtual surface + `setWindowOrigin` (`controller.ts` `windowOrigin`, `renderer.ts`); paint window translates instead of a DOM element | port | golden-master |
| `#mmLabels` label column, right-aligned (mockup:743, CSS 455–466) | Planned `labels.ts` core module (D2; `overlay.ts` DOM precedent); unimplemented | port | golden-master |
| `#mmStrip` 52px strip (mockup:744, CSS 468–471) | The canvas content region inside the consumer-set pane width; 52px is consumer layout, the strip/label/lane partition is canvas-space (Q5) | port | ink-probe |
| Four `.lane` divs `diag`/`com`/`search`/`wear` created once and reused (mockup:1883–1891, CSS 485) | Renderer marker lanes (`renderer.ts` `planPaint` lane merge; `layers.ts` `LayerSpans.lane`); D5: order diag=1, notes=2, search=3, wear=4, geometry becomes a theme knob (engine is 3px wide, 1px gap, unbounded count) | deviate | ink-probe |
| `#mmVpBox` viewport indicator living outside the canvas, screen-fixed in the pane (mockup:747, 2076–2094, CSS 488–492) | `overlay.ts` `.mn-minimap-viewport` DOM overlay ([spec](../../../docs/ProseMirrorMinimap.spec.md) §9.1); `hidden` toggle at 2079 maps to renderer attach/detach | port | unit |
| `.mm-vp` left/right placement derived from `mmStrip.offsetLeft` (mockup:2230–2231) | Consumer CSS over `.mn-minimap-viewport` (package: `left:0; right:0`) | port | none |
| `.mm-vp .rsz` grip element + `::after` 26×3px bar affordance (mockup:496–503, 2081–2093) | None (unimplemented): needs an overlay-attached grip + a runtime zoom seam (Q9) | port | golden-master |
| `.mm-foot` + `.legend` footer, wrapped-height budget feeds the strip (mockup:749–751, 1892, CSS 504–508) | Consumer chrome; the wrapped-height dependency is void (canvas pane is externally sized) — legend owns no geometry in the port | N-A | screenshot |
| Legend entries: 5 type chips (non-interactive) + 4 lane toggles with `.off` strike-through (mockup:2114–2133) | Consumer legend; lane on/off needs a package lane-visibility seam that does not exist (Q11) | deviate | unit |
| Block tooltip `title` = label · depth · type (mockup:2025); lane tick `title` (mockup:2110) | `minimapblockhover` DOM event + `onBlockHover` ([spec](../../../docs/ProseMirrorMinimap.spec.md) §10.2); rendering a tooltip is consumer-side | port | unit |

### A.2 Constants

| Item (mockup) | Counterpart (port) | Status | Verification |
|---|---|---|---|
| `MM_CAP = 18` landmark label cap (mockup:1816) | `labels.ts` option, mockup value default (D2: all constants overridable) | port | unit |
| `MM_SPINE_MIN = 8` guaranteed level-1 spine (mockup:1817) | `labels.ts` option | port | unit |
| `MM_BAND_MIN = 3` reserved in-band budget (mockup:1818) | `labels.ts` option | port | unit |
| `MM_NEAR = 90` map-px detail band around the viewport extent (mockup:1819) | `labels.ts` option; under the port's uniform scale, "map px" is minimap-surface px — the constant transfers 1:1 | port | unit |
| `MM_RATIO = 0.12` default and cap for the canvas-height ratio (mockup:1820–1823) | `zoomPxPerEditorPx` = 0.12 (D9); semantics differ (fixed editor-px→minimap-px scale vs doc-height ratio) but coincide numerically because the port's model total is editor-space doc height | port | unit |
| Pane floor 60px in `paneH = max(60, …)` (mockup:1944) | Consumer container minimum height (CSS); no package constant | port | none |
| Strip width 52px (mockup:469) | Consumer pane width; in-canvas partition with labels/lanes (Q5) | port | ink-probe |
| Lane width 10px, lane gap 5px (mockup:451, 485) | D5 theme knob `lanes: {width, gap}` (consumer 10/5); engine is 3px/1px hard-coded — unimplemented | deviate | ink-probe |
| `MIN = 1.5` segment height floor (mockup:1979) | Theme `rowHeight` paint floor (default 3; [spec](../../../docs/ProseMirrorMinimap.spec.md) §5.4/§6.2); value mismatch is open (Q6) | deviate | unit |
| Paint height `max(2, m1−m0−1)` 1px inter-block gap (mockup:2024) | Renderer `barGapPx` regime (§6.5): 15% of a one-line slot, floor 1px, cap slot−1 | deviate | ink-probe |
| Nesting gutter `1 + (lvl−1)×4` px from left, shared right edge `2px` (mockup:2021–2022) | `indentUnit` = 4 (D9) with `indent: true` classes; the port's tier-2 row width is text-length-encoded, not a full-width slab — divergence flagged (Q7) | deviate | ink-probe |
| Level clamp `min(7, depth)`; strip indents per level (mockup:1909–1910) | `BlockRow.depth` + theme indent; depth is block-tree depth (mockup: clause depth) — consumer classifier controls parity | port | unit |
| Label font sizes 9.5/9/8.5/8px, `lv1` weight 600, faintness by level (mockup:456–466) | `labels.ts` style defaults (D2) | port | screenshot |
| Tick height clamp `max(5, min(14, spanHeight−1))` (mockup:2109) | Lane marker min height 6 device px + same-tone merge floor (§8.4); the per-tick upper clamp has no engine counterpart | deviate | ink-probe |
| Label gaps: 11px to any spine label, 7px to adjacent detail (mockup:2268–2274) | `labels.ts` defaults | port | unit |
| Wear tick min height 3px, lane color `var(--may)` (mockup:2050–2053) | Wear layer tones; D8 quantized tone buckets replace continuous opacity | deviate | ink-probe |
| Persistence key `mmzoom` (localStorage, `mnmock-` prefix) (mockup:1824, 2086, 2359) | Consumer persistence of its zoom choice; the package holds the value per controller lifetime only | port | none |

### A.3 Segment model and strip rendering

| Item (mockup) | Counterpart (port) | Status | Verification |
|---|---|---|---|
| Disjoint segment model: a clause owns header+intro up to its first child; subclauses and semantic blocks are their own segments; Σsegments tiles the document (mockup:1899–1935) | Block rows from `blockModel.ts` `flatten` + landmark-driven groups (D1): self-anchored landmark = singleton group; a parent's body rows form discontiguous pieces; tier-3 splits at group boundaries. Rows, not DOM-measured segments | deviate | unit |
| `SEM_SEL` semantic block selector: terms, requirement blocks, table/figure/equation floats, admonitions, definition lists, source blocks, raw blocks (mockup:1905) | Consumer classifier (`App.tsx` `metanormaClassifier`): `sourcecode`, `table`, `figure`, `formula`, `note`/`admonition`/`example`, `dl` content. `.term`/`.req` have no schema nodes (D11); `.raw-block` has none either (Q14) | N-A | unit |
| `mmTypeOf` element→type mapping incl. `front` from `data-cltype` (mockup:1829–1836) | Consumer classifier classIds (cohort-colored headings via `ancestors`, [spec](../../../docs/ProseMirrorMinimap.spec.md) §5.3); `term`/`req` classes N-A (D11) | port | unit |
| Collapsed clause = one segment at `max(4, height)` (mockup:1911–1913) | None: folding/collapsing is out of scope ([spec](../../../docs/ProseMirrorMinimap.spec.md) §16) | N-A | none |
| Clause depth-1 roots walked via `segsOf` recursion (mockup:1936) | `flatten` pre-order walk; cohort containers transparent, `section_title` is the row | port | unit |
| B′ proportional placement: `m0 = H×d0/total`, share floored at MIN and clamped to room, no gap objects (mockup:1954–1995) | Uniform scale over prefix-sum editor-space offsets (`geometry.ts` `sumOffsets`, `resolveScale`): `minimapY = editorY × scale` exactly — strictly stronger (see VAC-6) | deviate | unit |
| Leading/trailing doc padding folded into first/last segment so the map spans [0,H] (mockup:1980–1984) | Fit-mode surface spans `max(model total, real scrollHeight)` (`geometry.ts` `fitScale`): paddings own no rows but the track maps exactly onto `[0, maxScroll]` | deviate | unit |
| `byEl` piece merging: one entry per element, contiguous-run merge at ±0.5px, element spans first→last piece (mockup:2005–2014) | Landmark group model (D1): group identity from `RowSpec.landmark {anchor}`; pieces = runs of the group's rows; contiguous-run merge is the same notion at merge-floor granularity | deviate | unit |
| Whitespace-gutter strip paint: one solid rect per contiguous run, parent stops at first child, background gutter left, shared right edge (mockup:1998–2030) | Renderer tier-2/3 slab paint with declarative `fill`/`edge` + `slabEdgeWidth` 2px (D4); single canvas, paint order replaces sibling DOM order | deviate | ink-probe |
| Piece-local `blk._seg` bounds stored on the DOM node (mockup:2028) | Group piece rows held by the group model in `blockModel.ts`/renderer payload | port | unit |
| `.blk:hover` brightness(.92) (mockup:478) | No painted hover state; the seam is `minimapblockhover` (§10.2). A hover repaint is a renderer feature gap (Q10) | deviate | screenshot |
| `.blk.active` solid 1.5px accent outline (mockup:481) | Opt-in built-in active-context layer (D7): innermost open group at viewport center | port | ink-probe |
| `.blk.co-piece` dashed 1px outline at opacity .45 (mockup:484) | Same layer: dashed co-pieces for the group's other pieces (D7's clause-group case) | port | ink-probe |
| No z-index on active so children paint above parents (mockup:479–480) | Vacuous: single-canvas paint order; the layer draws after content by z | N-A | unit |
| Semantic palette per theme: light triple, dark, contrast overrides for clause/front/term/req/float/note (mockup:510–521) | `MinimapTheme.classes` with `fill`/`edge` (D4); three palettes = consumer re-reads tokens per theme change ([spec](../../../docs/ProseMirrorMinimap.spec.md) §5.4); `term`/`req` entries N-A (D11) | port | screenshot |
| Two-tone `--blk-bg`/`--blk-edge` custom properties with inset edge shadow (mockup:474–477) | Declarative theme `fill`/`edge` + `slabEdgeWidth` 2 (D4) | port | ink-probe |
| `revealEl` on block click: scrollIntoView center + flash (mockup:2026, 2483–2487) | D6: click → `revealRow` centers precisely (`scroll.ts` `preciseScrollTop`); the flash animation is consumer chrome | port | unit |
| Strip `title` tooltip per block (mockup:2025) | Consumer tooltip over `onBlockHover` payload | port | none |

### A.4 Labels (landmark text)

| Item (mockup) | Counterpart (port) | Status | Verification |
|---|---|---|---|
| Label EVERY element: clauses at all depths + semantic blocks; anti-collision and band policy are the only filters (mockup:2034–2042) | `labels.ts` labels landmark rows; D1/D2 are the mechanism the review proposed (pending the gate). Scope of what is a landmark is open (Q3): mockup labels floats, notes, dl, source blocks; `term`/`req` N-A (D11) | deviate | golden-master |
| Label text `mmLabelOf`: clause `num + title`; term `num + tword`; req `label`; note `_label`; float `num` (mockup:1837–1845) | Opaque consumer string (D3): consumer v1 uses title/name text; optional demo-grade positional scheme mirroring `renumberAll()` (which is positional counters + annex letters, explicitly not flavor-correct); proper numbering is a future shared service | deviate | unit |
| Label DOM: absolutely positioned, right-aligned, ellipsis, `display:none` until `.show` (mockup:456–460, 2036–2042) | `labels.ts` DOM layer (`overlay.ts` precedent, D2) | port | golden-master |
| Stable spine: viewport-independent even sample of level-1 labels, computed once per build (mockup:2063–2074) | `labels.ts` spine pass over landmark groups; membership fixed per model build | port | unit |
| Spine size `max(MM_SPINE_MIN, min(MM_CAP−MM_BAND_MIN, lvl1.length))` (mockup:2068) | `labels.ts` sizing with the D2-overridable constants | port | unit |
| In-band detail: all non-spine elements overlapping `[vp0−90, vp1+90]`, document order (mockup:2250, 2258–2260) | `labels.ts` band pass | port | unit |
| Gap rules: 11px to any spine label either side (rigid); 7px to adjacent detail (clustered); detail may not crowd the next spine below (mockup:2266–2275) | `labels.ts` anti-collision | port | unit |
| Active-label reservation: active label never omitted; nearest shown label within 11px displaced instead; bounded churn (mockup:2280–2296) | `labels.ts` reservation; measured mockup drop rates (5.8% default, 19% mid, 33% fit-all) recorded in INV-9 | port | golden-master |
| `.lbl.active` width-neutral emphasis via text-shadow (mockup:467, 2183) | `labels.ts` style | port | screenshot |
| Label click → `revealEl` (mockup:2041) | D6 click→`revealRow` center | port | unit |
| Keyboard walking: ArrowUp/Down moves among SHOWN labels from the active one (mockup:2384–2392) | Engine overlay keyboard is the `scrollbar` contract (§9.3: arrows scroll by lineHeight). Landmark walking conflicts with that contract — flagged (Q8) | deviate | golden-master |
| `#minimapWrap` `tabindex=0` focus host for walking (mockup:2385) | Overlay `tabindex=0` (§9.1); a second focus host is consumer chrome | deviate | ink-probe |
| Level styling classes `lv1..lv7` (mockup:2037, 456–466) | `labels.ts` per-level style ramp | port | screenshot |

### A.5 Lanes and markers

| Item (mockup) | Counterpart (port) | Status | Verification |
|---|---|---|---|
| Lane creation once per pane with titles `diagnostics / editor notes / search hits / read-wear lane` (mockup:1883–1891) | Lane index on `LayerSpans.lane` + D5 order diag=1, notes=2, search=3, wear=4 | port | unit |
| Diagnostics ticks from `problems[]`, error `--shall` / warning `--should`, click reveals (mockup:2057–2060) | Consumer producer `setLayer('diag', …)` — stubbed pending the app's validation feature (D12); span shape via `layers.ts` `resolveSpans` | deviate | unit |
| Editor-notes ticks from `.mn-note` elements (mockup:2061) | Consumer producer over `review` nodes (schema has `review`); not stubbed by D12 — implementation order open (Q13) | port | unit |
| Search lane ticks from live `mark.mm-hit` nodes (mockup:2457) | Consumer producer `setLayer('search', …)` — stubbed pending app search (D12) | deviate | unit |
| `clearSearch` removes ticks (mockup:2424) | `setLayer('search', [])` | port | unit |
| Wear ticks: one per segment, opacity from heat (mockup:2046–2054) | Wear layer with D8 producer discipline: 4–6 quantized tone buckets, threshold retirement, RLE emission, push-on-bucket-flip — replaces per-segment divs | deviate | unit |
| `updateMinimapRead` opacity `min(.8, heat×.55)` (mockup:2299–2304) | Tone strings per bucket (D8); continuous opacity curve not reproduced | deviate | ink-probe |
| Tick placement via `mmBlockFor`: finest labelled containing element, ancestor walk (mockup:1846–1857, 2103–2104) | Controller `rowAtPos` binary search over rows (§7.2); producers anchor in pos/id space and never walk DOM | port | unit |
| Fallback placement `mmDocToMap(docY(el))` when no containing block (mockup:2104) | `rowAtPos` null path: span degrades by disappearing, never by misplacing (§7.2) | deviate | unit |
| Tick click → reveal; `stopPropagation` (never travels) (mockup:2111) | D6: lane extent is x-partitioned; span hit-test (y→row→span) → `minimapspanclick` / `onSpanClick`; lane clicks never travel | port | unit |
| Legend lane toggles add `.off` (opacity .15, pointer-events none) (mockup:2127–2130, 486) | No engine lane-visibility seam (Q11) | deviate | ink-probe |
| Lane strip styling: `surface-2` background, 3px radius (mockup:485) | Canvas background region; consumer theme | port | screenshot |

### A.6 Viewport thumb and pan

| Item (mockup) | Counterpart (port) | Status | Verification |
|---|---|---|---|
| Shared linear mapping, both directions (mockup:2135–2144) | Scrollbar-fraction thumb placement + drag inverse (§9.1/§9.2; `overlay.ts`, `controller.ts` `thumbTravel`) | port | unit |
| `updateViewport`: `m0/m1 = mmDocToMap(s0 / s0+clientHeight)`, then `mmPan` (mockup:2145–2150) | Thumb = content-aligned share of the surface, `clientHeight × scale` (§9.1) | port | unit |
| Thumb height floor `max(8, m1−m0)` (mockup:2221) | `thumbHeight` clamp [2, pane] (§9.1); the mockup's 8px floor is a consumer-visible difference (Q6) | deviate | unit |
| Thumb top `frac × track` where `track = paneH − vh` (mockup:2222–2228) | Thumb top `frac × travel`, `travel = min(surface, pane) − thumb` (§9.1); identical when surface ≥ pane | port | unit |
| Content-anchored pan: `pan = clamp(m0 − thumbTop)` (fix #1; mockup:2208–2232) | Proportional window origin `frac × (surface − pane)` (§6.2); under the uniform-scale model the two agree identically (controller comment: `frac×travel === scrollTop×scale − origin`) — INV-8 | port | unit |
| Canvas translate `translateY(-round(pan))` (mockup:2226) | `setWindowOrigin` + canvas paint window (§8.1) | port | golden-master |
| Drag inverse `mmThumbToScroll`: `top/track × scrollable + docTop0` (mockup:2233–2241) | `onDragMove`: `scrollTop = (thumbTop/travel) × maxScroll` over real geometry (§9.2) — round-trip identity INV-1 | port | unit |
| Grab offset preserved; thumb clamped to track (mockup:2364–2381) | `DragState.grabOffset` + track clamp (`overlay.ts`) | port | unit |
| Grip resize: geometric thumb-height inversion `target = thumbH × total / viewH` (mockup:2335–2348) | None (unimplemented): needs a controller zoom mutation with the same inversion (Q9) | port | unit |
| Zoom clamp `[paneH, round(total × MM_RATIO)]` (mockup:2349–2351) | D9 caps default at 0.12; the fit-all floor is `display:'fit'`; runtime switch seam open (Q9) | port | unit |
| Rebuild threshold `max(8, H×0.02)` (mockup:2352) | Consumer/controller debounce detail of Q9 | port | unit |
| Scroll-fraction preservation across zoom rebuild via `mmScrollableDoc` (mockup:2353–2356) | Zoom change as scale change: thumb/origin recompute from the same fraction; preservation is INV-13 | port | unit |
| Grip double-click reset: `mmZoom=NaN`, persist `''`, toast (mockup:2085–2091) | Consumer action over the Q9 seam | port | none |

### A.7 Gestures, keyboard, search

| Item (mockup) | Counterpart (port) | Status | Verification |
|---|---|---|---|
| Strip pointerdown/move/up = continuous travel: `scrollTop = mmMapToDoc(y) − clientHeight/2 + docTop0` (mockup:2316–2327) | D6: content region is travel (proportional) + click → `revealRow` center (precise); strip-rect clamping identical | port | unit |
| `setPointerCapture` on strip drag (mockup:2325) | `overlay.ts` pointer capture on the overlay; capture on the content region is part of the Q9/Q5 pointer-surface work | port | ink-probe |
| Thumb drag consumes events on `mmBody`, target-checked (mockup:2331–2364) | Overlay pointerdown `stopPropagation`; wheel consumption (§9.2) | port | unit |
| Keyboard landmark walking (mockup:2384–2392) | Conflicts with the `scrollbar` keyboard contract (§9.3) — Q8 | deviate | golden-master |
| ⌘F/Ctrl+F searchbar (fixed-position, count chip) (mockup:2406–2413, 2468–2473) | Consumer feature — stubbed (D12) | deviate | none |
| `runSearch`: TreeWalker text scan, `mark.mm-hit` wraps, count (mockup:2427–2460) | Consumer search plugin emitting pos-anchored spans to `setLayer('search')` | deviate | unit |
| `gotoHit` Enter/Shift-Enter cycling, `scrollIntoView` center (mockup:2461–2467) | Consumer over `revealRow`/precise mapping | deviate | none |
| Escape clears search + lane (mockup:2476) | Consumer; `setLayer('search', [])` | port | unit |
| Input-empty auto-clear (mockup:2478) | Consumer | port | none |

### A.8 State, rebuild, wear

| Item (mockup) | Counterpart (port) | Status | Verification |
|---|---|---|---|
| `mmS` monolithic state: blocks/lanes/vp/els/spineSel/active/total/H (mockup:1815) | `MinimapController` fields + renderer mirror; no global mutable state | deviate | unit |
| `buildMinimap` full teardown + rebuild of every DOM node (mockup:1882–2099) | Sliced incremental build + paired diff (§7.3/§7.2): never rebuilds on edit; a deliberate architectural difference | deviate | unit |
| `docY` per-element `getBoundingClientRect` measurement (mockup:1826–1828) | Editor-space height model + stride sampling (§4.4/§4.5); DOM measured only advisorially | deviate | unit |
| `docTop0` cached `#doc` offset; invalidated on rebuild and on sticky-chrome toggle (mockup:1996, 2997–2998) | `measureContentOrigin` for precise snaps + cached scroll geometry refreshed at §7.4 points (content RO, docChanged, visibility) | port | unit |
| `mmDocFrameScroll` doc-frame conversion, used everywhere (fix #3; mockup:2189–2197) | Same-frame discipline: `scrollTop` read from the resolved scroll container and `contentOrigin`-rebased where model space enters (§6.4) | port | unit |
| Exact scrollable denominator `scrollHeight − clientHeight − docTop0` (frame-mixing fix; mockup:2198–2207) | `maxScroll = scrollHeight − clientHeight` of the scroll container (the doc-frame constant lives in `contentOrigin`, not the denominator) — INV-7 | port | unit |
| `mmDocToMap` / `mmMapToDoc` piecewise block lookup with fraction clamps (mockup:1858–1880) | `rowAt` binary search + uniform scale (§6.1); the clamps are vacuous (VAC-1/2) | N-A | unit |
| Rebuild on renumber (`renumberAll` → `buildMinimap`, mockup:1372) | N-A as rebuild: numbering is label text; label text refreshes per model build/doc change without touching geometry. Correctness depends on Q3/D3 | deviate | unit |
| Rebuild on problems re-render (mockup:1724) | `setLayer('diag', …)` — a layer push, no rebuild | deviate | unit |
| Measure (text width) change → rAF rebuild (mockup:1245–1250) | Geometry epoch: content-width change re-estimates (§4.6, `controller.ts` `onEditorResize`/`reevaluateEpoch`) | port | unit |
| Visibility-mode switch rebuild (layout changes; mockup:2972–2986) | Epoch semantics: a consumer display mode that reflows layout changes editor-space heights — covered by epochs + content RO only if widths change; a pure restyle with same widths is a theme change, not an epoch (Q12) | deviate | unit |
| Pane ResizeObserver on `#minimapWrap` with `mmLastH` >2px guard against rebuild loops (mockup:2096, 2393–2402) | Coalesced single `resize` per frame, floored-device-px no-op (§8.5); no rebuild-from-resize exists (VAC-5) | deviate | unit |
| Window resize → rAF rebuild (mockup:2403) | DPR watch + container RO (§8.5) | port | unit |
| Wear interval 250ms; overlap fraction ×0.05, center ×0.09, decay ×0.996, heat cap 1.6 (mockup:2306–2314) | Consumer wear producer; D8 quantization changes emission, not the dwell math | port | unit |
| Wear updates only opacity, no geometry (mockup:2299–2304) | Layer tone repaint only (`setLayer`), consistent | port | unit |
| Read-% via IntersectionObserver (mockup:1790–1801) | Status-bar concern, outside the minimap (the observer also feeds nothing minimap-side) | N-A | none |

### A.9 Theming

| Item (mockup) | Counterpart (port) | Status | Verification |
|---|---|---|---|
| Light palette: clause/front/term/req/float/note bg+edge pairs (mockup:510–515) | `MinimapTheme.classes` `fill`/`edge` (D4); consumer supplies hex values read from its token layer (§5.4) | port | screenshot |
| Dark palette overrides for 5 types (mockup:516–520) | Consumer theme instance per app theme; re-read on theme-change events (a metrics change is an epoch, §5.4) | port | screenshot |
| Contrast palette: all blocks `#fff` bg / `#000` edge (mockup:521) | Consumer theme instance | port | screenshot |
| Accent color for thumb border/fill, active outline, legend (mockup:489, 481, 501) | DOM overlay tokens `--mn-minimap-viewport-*` (§12); active outline color = layer tone from the active-context layer (D7) | port | ink-probe |
| `color-mix` 8% accent thumb fill (mockup:489) | Overlay token value, consumer-set | port | screenshot |
| Theme cycle button persistence (mockup:2993–2994, 1243) | Consumer app theming | port | none |

Row counts: Part A totals 117 rows (A.1 markup 13, A.2 constants 17, A.3 model
and strip 18, A.4 labels 13, A.5 lanes 12, A.6 thumb and pan 13, A.7 gestures,
keyboard, search 9, A.8 state, rebuild, wear 16, A.9 theming 6) — `port` 74,
`deviate` 37, `N-A` 6; verification: `unit` 66, `ink-probe` 18, `screenshot`
13, `golden-master` 9, `none` 11.

---

## Part B — Invariant list

### B.1 Live invariants

Each entry: assertion, mockup source, port verification. `unit` proofs pin the
port's own mechanism; `golden-master` entries compare recorded mockup masters
against the port under equivalent scenarios.

| # | Invariant (assertion) | Mockup source | Verification |
|---|---|---|---|
| INV-1 | Thumb drag ↔ scroll round-trip identity: `mmThumbToScroll(top)` reproduces exactly the scroll whose `mmPan` places the thumb at `top`; a full top→bottom drag sweeps the document start→end | mockup:2135–2141, 2233–2241 | unit |
| INV-2 | Spine viewport-independence: spine membership is computed once per model build from an even sample; scrolling never changes which spine labels exist | mockup:2063–2074 | golden-master |
| INV-3 | Label gap rules: a shown label sits ≥11px from any spine label on either side; adjacent details may cluster at 7px; a detail within 11px below the next spine label is dropped | mockup:2266–2275 | unit |
| INV-4 | Gap-flicker fix: the active lookup is the first segment ENDING after the viewport center (the `d0` test dropped); the trailing fallback covers past-end. Port form: `rowAt(center)` is total-defined — any editor-space offset resolves to a row, `total` maps to the last | mockup:2155–2163 | unit |
| INV-5 | Piece-local, segment-derived active highlight: the current piece is the piece whose run CONTAINS the authoritative segment; no doc↔map coordinate conversion is performed on the highlight path | mockup:2171–2182 | unit |
| INV-6 | Doc-frame offset (fix #3): all fraction/lookup inputs are measured from `#doc`'s top, converted once (`scrollTop − docTop0`). Port form: model-space math is rebased by `contentOrigin`; `scrollTop` is read only from the resolved scroll container | mockup:2189–2197 | unit |
| INV-7 | Exact scrollable-range denominator (frame-mixing fix): every fraction uses the exact range of the scrolling frame, not `docHeight − clientH`. Port form: `maxScroll = scrollHeight − clientHeight` of the scroll container; the doc-origin constant never enters the denominator | mockup:2198–2207 | unit |
| INV-8 | Content-anchored pan (fix #1): the map directly behind the thumb IS the reading position — pan = viewport's true surface position − thumbTop; the clamp guards only degenerate subsampling. Port form: `frac × travel ≡ scrollTop × scale − windowOrigin` identically under the uniform scale, asserted numerically across a scroll sweep | mockup:2208–2232 | unit |
| INV-9 | Active-label reservation: the active element's label is always shown; on collision the single nearest shown label within 11px is displaced; at most one label swaps per frame. Mockup-measured drop rates without reservation: 5.8% (default zoom), 19% (mid), 33% (fit-all) | mockup:2280–2296 | golden-master |
| INV-10 | Proportional tiling: segments tile the document (with leading/trailing padding folded into the first/last segment, Σsegments spans `[0, total]`); each block start is linear in its document coordinate. Port form: `offsets[0]=0`, `offsets` contiguous, `total = Σ effective heights`, `minimapY = editorY × scale` exactly | mockup:1954–1995, 1980–1984 | unit |
| INV-11 | Extent truth at the ends: the map spans the full scrollable track even when the model under-predicts (`fitScale` uses `max(total, scrollHeight)`), so thumb-at-bottom ≡ `maxScroll` and the padding fold's end-drift cannot occur | mockup:1980–1984 | unit |
| INV-12 | ResizeObserver no-op guard: a pane-height change within the guard band triggers no rebuild; only real layout changes do. Port form: a resize that does not move the floored device-pixel size is a no-op on the renderer | mockup:2096, 2393–2402 | unit |
| INV-13 | Zoom-preserving rebuild: a grip resize (or double-click reset) rebuilds at a new canvas height while restoring the same scroll fraction, so the reading position does not jump | mockup:2346–2359, 2085–2091 | golden-master |
| INV-14 | Finest-containing-element tick placement: a diagnostic inside 8.1.1 marks 8.1.1's rect, not the whole of 8. Port form: `rowAtPos` returns the innermost row containing the anchor position | mockup:1846–1857, 2103–2104 | unit |
| INV-15 | Marker height floor: lane ticks never paint below a floor (mockup 5px; port 6 device px), and same-tone ticks within the floor merge into one rect; worst-case rects per lane ≤ `canvasHeight / floor` | mockup:2109 | unit |
| INV-16 | Thumb height = the viewport's true share of the map surface (`m1 − m0`, floored); in the port, `clientHeight × scale` clamped to `[2, pane]` | mockup:2221, 2228–2229 | unit |
| INV-17 | Keyboard walking operates only on SHOWN labels, starting from the active one, and clamps at both ends of the shown list | mockup:2384–2392 | golden-master |
| INV-18 | Lane clicks never travel; a lane tick click reveals its own element. Content-region clicks center the target (D6) | mockup:2111, 2323 | unit |
| INV-19 | Spine sizing: `spineN = max(8, min(18 − 3, lvl1Count))`; an even sample over ordered level-1 labels with the last index clamped | mockup:2067–2074 | unit |
| INV-20 | Strip travel clamps the pointer to the strip extent, then centers: `scrollTop = mapToDoc(y) − clientHeight/2` in the doc frame (D6's precise-center rule) | mockup:2320–2324 | unit |
| INV-21 | Wear boundedness: heat ∈ [0, 1.6] for all segments at all times; painted opacity ∈ [0, .8]; decay alone drives heat → 0 monotonically | mockup:2311, 2302 | unit |
| INV-22 | Wear cadence: heat updates on a fixed 250ms tick from the doc-frame viewport overlap fraction (`+0.05 × overlapFraction`) plus a center bonus (`+0.09` when the viewport center is inside), decayed ×0.996 — the producer-side reference formula (D8 quantizes emission, not this math) | mockup:2306–2314 | unit |

### B.2 Vacuous by construction

These mockup invariants exist only because the mockup derives geometry from
DOM-measured piecewise segments with rounding and real inter-block gaps. Under
the port's uniform-scale editor-space model they are structurally impossible,
not merely unnecessary. They are listed so that no phase "ports" them; each
carries the stronger linear property that replaces it.

| # | Vacuous invariant (mockup) | Why it cannot occur in the port | Replacement proof |
|---|---|---|---|
| VAC-1 | Trailing-extrapolation clamp in `mmDocToMap`: positions past a block's `d1` extrapolated beyond `m1`; positions in leading gaps back-extrapolated below `m0`; clamping the in-block fraction to [0,1] keeps the map monotonic and bounded (mockup:1858–1871) | `minimapY = editorY × scale` is a single affine map; there is no per-block interpolation to overshoot | unit: linearity + monotonicity of the scale map over `[0, total]` |
| VAC-2 | Fraction clamps in `mmMapToDoc`: a y inside a canvas gap must snap to the next block's `d0`, not back-extrapolate into the earlier block's range (mockup:1872–1880) | Prefix-sum offsets are contiguous — no canvas space exists between rows | unit: `rowAt(offsets[i]) === i` for all i (spec §15.1.4) |
| VAC-3 | The pan/thumb drift class: piecewise content-anchored pan vs linear thumb diverging up to ~56px at fit-all (mockup:2208–2217 rationale) | With one affine map there is nothing for the thumb to disagree with; the identity of INV-8 holds at every zoom including fit | unit: INV-8 identity asserted across zooms |
| VAC-4 | Gap residence in the active lookup: the viewport center spends real time in inter-block gaps where no segment contains it (mockup:2155–2162) | Editor-space rows are contiguous; the center is always inside some row's extent (or past the end, the total-defined fallback) | unit: `rowAt` total-definedness (INV-4) |
| VAC-5 | Rebuild-loop guard: `mmLastH` >2px threshold stopping ripples of the mockup's own rebuild from re-triggering it (mockup:2393–2401) | The port never rebuilds from pane resize; resize is a coalesced renderer call with a floored-device-px no-op (§8.5) | unit: INV-12 no-op proof |
| VAC-6 | Rounding and room-clamp in B′ placement: `m0` rounded per block, share clamped to the room before the next block (mockup:1985–1994) | Offsets are exact `Float64` prefix sums; the only quantization is the device-pixel floor at paint | unit: `sumOffsets`/`reSum` invariants (spec §15.1.4) |
| VAC-7 | Per-element `docY` rect reads as the model's source of truth (mockup:1826–1828) | Heights are estimates corrected by advisory stride sampling (§4.4/§4.5); no synchronous DOM dependency exists on the paint path | unit: model builds and paints with the DOM absent |
| VAC-8 | Co-piece gap defeat: in gaps, `mmDocToMap` back-extrapolation left every piece as co-piece (the failure the piece-local rule routes around; mockup:2171–2176) | No gaps (VAC-2); the group-piece containment test of INV-5 operates on row indices | unit: INV-5 |

Count: 22 live invariants, 8 vacuous.

---

## Part C — Open questions (input to the Phase-3 decision gate)

Q1–Q4 are the audit blockers; Q5–Q15 are additional findings. "Leaning" cites
the review decision a D-number records (pending the gate), or the evidence
direction — never a Phase-1 choice.

1. **Group-identity derivation (blocker).** The mockup's "element" is a DOM
   node whose segments merge into pieces keyed by `byEl` (mockup:2005–2014);
   the active highlight and labels key off that element map. The port's rows
   are flat per-block (`BlockRow`), and D1 derives groups from
   `RowSpec.landmark {anchor: 'self' | 'parent'}`. Residual ambiguity: how a
   non-landmark prose row inherits group identity for the active-context layer
   when it is the innermost row at the viewport center (D7 says "innermost
   open group" — the group of a body row is its nearest parent-anchored
   landmark, which the mockup expresses via `mmBlockFor`'s ancestor walk,
   mockup:1846–1857). Leaning: parent-anchored landmark ownership of the rows
   between it and the next landmark; needs an explicit rule for rows before
   the first landmark (document preface).
2. **Lane geometry knobs (blocker).** The engine paints lanes 3px wide with a
   1px gap at the canvas right edge, unbounded count (`renderer.ts` lane
   planning); the mockup has 10px lanes, 5px gaps, exactly 4 lanes as sibling
   DOM columns (mockup:451, 485, 1883–1891). D5 proposes a theme knob
   (`lanes: {width, gap}`) with consumer 10/5 and order
   diag=1, notes=2, search=3, wear=4. Open: the knob's exact shape (theme vs
   options), whether the strip/lane/label partition is also themed (Q5), and
   whether lane count is capped by pane width as in the mockup's fixed 4.
3. **Landmark scope (blocker).** The mockup labels EVERY element — clauses at
   all depths plus terms, requirement blocks, figures/tables/equations,
   notes/admonitions, definition lists, source and raw blocks
   (mockup:2034–2042) — with anti-collision and the band policy as the only
   filters. The schema has no term-entry or requirement/obligation node
   (D11: N-A until schema gains nodes), and floats/notes exist as rows but
   whether they are landmarks (labelled) or only colored rows is undecided.
   Leaning (D1 wording): any row may be a landmark via `RowSpec.landmark`;
   the consumer decides per class. Open: the consumer's landmark set for v1.
4. **The `<Minimap>` / `<MinimapPane>` seam (blocker).** Header (`STRUCTURE`
   + hint, mockup:733–736), legend footer (mockup:749–751, 2114–2133), lane
   titles/tooltips, `mmzoom` persistence (mockup:1824), and the dbl-click
   reset toast (mockup:2090) are chrome around the map. The package ships
   none of it (§12: no positioning rules; theme is the single painted
   source). Leaning: all chrome consumer-side (`MinimapPane.tsx`), with the
   package exposing the data the chrome needs (label texts via the labels
   module, lane metadata via layer declarations). Open: whether the legend
   and lane toggles become package CSS hooks (`mn-minimap-*` structural
   classes) so consumers do not re-derive lane order/colors.
5. **In-canvas horizontal partition.** Mockup: labels column + 52px strip +
   4 lanes as flex siblings. Port: one canvas whose consumer-set width must
   be partitioned into label gutter, content region, and lane strip. No
   agreed rule exists for the split, or for how the labels DOM layer overlays
   the same pane (D2 gives the module, not the layout). Leaning: labels as a
   DOM sibling column (overlay.ts precedent) over the pane's left/label
   region; lanes owned by the canvas.
6. **Row-height floor and thumb floor values.** Mockup MIN 1.5px / paint
   2px / thumb floor 8px (mockup:1979, 2024, 2221); engine `rowHeight`
   default 3px, thumb floor 2px (§5.4/§9.1). D9 touches zoom and indent only.
   Leaning: consumer overrides `rowHeight` to match mockup paint density;
   needs a decision because it also moves the fit-mode scale clamp (§6.2).
7. **Solid slabs vs length-encoded bars.** Mockup strip rows are full-width
   solid two-tone rects (shared right edge, mockup:2021–2022); the engine's
    tier-2/3 width is text-length-encoded (`rowWidthFraction`, §6.5), and D4
    covers two-tone colors but not row width. This is the largest visual
   divergence between baseline and engine today. Leaning: a class-level
   `width: 'solid' | 'proportional'` theme knob, mockup classes solid;
   undecided.
8. **Keyboard contract conflict.** The mockup walks SHOWN LANDMARKS with
   ArrowUp/Down on `#minimapWrap` (mockup:2384–2392); the engine overlay
   implements the ARIA `scrollbar` contract where arrows scroll by one
   `lineHeight` (§9.3). Both cannot bind the same keys on the same element.
   Leaning: keep the scrollbar contract on the overlay (a11y-role-faithful);
   landmark walking becomes a consumer keybinding over the labels module.
9. **Runtime zoom seam (grip).** The engine's zoom is an option applied at
   configure time (`zoomPxPerEditorPx`, `reconfigure`); the mockup mutates
   canvas height mid-session with scroll-fraction preservation, an 8px/2%
   threshold, `[fit-all, default]` clamping, dbl-click reset, and
   `mmzoom` persistence (mockup:2331–2362, 2085–2091, 1824). No controller
   mutation API, no grip surface on the overlay, and no fit↔sliding mode
   switch at runtime exist. Leaning: `controller.setZoom(px)` preserving
   fraction (INV-13) + an overlay grip hook; the fit-all floor maps to
   `display:'fit'`.
10. **Painted hover state.** `.blk:hover` brightness (mockup:478) needs a
    renderer repaint keyed off the hover row the package already emits
    (§10.2). Minor, but it is painted appearance and therefore belongs to the
    theme/layer system, not to CSS. Leaning: an opt-in hover layer tone.
11. **Lane visibility API.** Legend toggles set `.lane.off` (mockup:2127–2130);
    the engine has no per-lane or per-layer on/off surface (`setLayer` pushes
    spans; declaring nothing about visibility). Needed for legend parity.
    Leaning: `LayerDeclaration.visible` or a controller toggle.
12. **Visibility-mode semantics.** The mockup rebuilds on annotation-mode
    switches because layout changes (mockup:2972–2986). In the port, a mode
    that changes heights without changing content width is not an epoch
    (§4.6) — the consumer must force an epoch or accept estimate drift until
    stride sampling re-converges. Leaning: consumer-triggered epoch.
13. **Notes lane implementation order.** D12 proposes stubbing search and
    diagnostics; the
    notes lane (mockup `.mn-note`, schema `review` nodes) is not covered by a
    stub decision and has a real schema counterpart. Leaning: implement notes
    as the first consumer producer (reference for D8 discipline).
14. **`.raw-block` and `.dl-defs` rows.** `SEM_SEL` includes raw blocks and
    definition lists (mockup:1905); the schema has `dl` content but no raw
    HTML block node surfaced by the classifier. Whether they are rows, and of
     which class, is a consumer classifier decision without a leaning.
15. **Governance placement note.** `pkg/prosemirror-minimap/docs/` is scanned
    by `scripts/check-specs.mjs` (the corpus walker covers every
    `pkg/<pkg>/docs/**/*.md`), so this document is governed and link-checked.
    The CONVENTIONS.md §1.1 "Current placements" paragraph names in-package
    suites and lists only `pkg/panel-layout/docs/`; adding this suite to that
    paragraph is a one-line CONVENTIONS.md edit outside this document's scope
    (the placements guard itself only covers top-level `docs/*.spec.md`, so
    nothing fails either way).

**Review-decision contradiction audit.** No contradiction was found between
the mockup and the decision inputs D1–D12 (all pending the gate). Two
corroborations worth recording: the mockup gives
floating titles no segment at all (an `h4.floating-title` is prose inside the
parent's intro segment, mockup:1905 vs mockup:1049), which supports D10 (not a
landmark) while noting the port additionally colors them as headings — a
superset, not a conflict; and the mockup's wear ticks are per-segment with
continuous opacity, which the review's D8 proposes replacing with quantized
buckets (recorded as `deviate` in A.5, not a contradiction). The mockup's
`renumberAll()` is positional (counters + annex letters, mockup:1275+),
consistent with D3's "demo-grade, not flavor-correct" characterization.
