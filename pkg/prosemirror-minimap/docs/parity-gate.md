# Minimap parity — Phase-3 decision gate dossier

This document is the Phase-3 artifact of the mockup-parity effort: the
consolidated, deduplicated agenda for the human decision gate that sits
between the Phase-2 oracle ([`../e2e/parity/`](../e2e/parity/README.md))
and the Phase-4 implementation slices. It **proposes only**. Nothing here
ratifies, decides, or amends: every decision input (D1–D12), open question
(Q1–Q15), Phase-2 audit item, and residual finding is presented with options
and an evidence-cited recommendation, and the decision belongs to the gate.
The Phase-1 traceability artifact is [`parity.md`](parity.md); the governing
package contract is
[`ProseMirrorMinimap.spec.md`](../../../docs/ProseMirrorMinimap.spec.md)
(cited below as "the spec" with bare § references).

This dossier is obsolete as an operative instrument the moment gate close
distills every decided item into [`parity.md`](parity.md), the spec, and
[`../e2e/parity/deviations.json`](../e2e/parity/deviations.json) — after
which it is marked closed per the §0 protocol and remains in-tree only as
the provenance record of what was decided, rejected, and by whom.

Companion artifacts:

- [`parity.md`](parity.md) — Part A traceability (117 rows), Part B invariants
  (INV-1..22 live, VAC-1..8 vacuous), Part C open questions Q1–Q15, D-input
  preamble.
- [`../e2e/parity/README.md`](../e2e/parity/README.md) — oracle layout,
  scenario vocabulary, determinism traps, open items, tooling choices.
- [`../e2e/parity/DEVIATIONS.md`](../e2e/parity/DEVIATIONS.md) —
  deviation-register contract (actions `skip` / `tolerance` / `round` /
  `expectMissing` / `expectExtra` / `arrayCount`; first-match-wins;
  `appliesTo: "package"` only).
- [`../e2e/parity/coverage.md`](../e2e/parity/coverage.md) (generated
  from `coverage.json`) — INV-by-INV oracle coverage, deferred remainders,
  pending-gate markers.

## 0. Process state and how decisions are marked

| Phase | State | Artifact |
|---|---|---|
| 1 — traceability + invariants | done | [`parity.md`](parity.md) |
| 2 — golden-master oracle | done, committed | [`../e2e/parity/`](../e2e/parity/README.md) (8 masters, 87 frames) |
| 3 — decision gate | **this dossier** | this file |
| 4 — implementation slices | blocked on the gate | gated per-slice by the oracle |
| 5 — lock-in | later | — |

**Marking protocol.** Every decision item carries a G-id and ends with a
decision line of the form:

```text
pending → decided(<option id or amendment>)
```

The gate marks each item in two places: the item's own decision line, and the
Status column of the [decision index](#5-decision-index) in §5 (they must
agree). An amendment is recorded by naming the option **plus** the delta
("G-02 option A, amended: gap 4px"). Items the gate leaves unmarked at close
remain **undecided**: Phase 4 must not start any slice that names that item as
a dependency (each item lists its dependents), and no undecided item may be
treated as tacit ratification of its recommendation. Re-recording any master,
changing oracle bands, or writing to `deviations.json` are gate actions under
this process; Phase 4 executes them only as directed here. Amendments to
this dossier itself follow the [§8 freeze rule](#8-document-lifecycle-and-freeze-rule):
before gate close it is a draft narrated by git history; after, content
changes are orchestrator-gated, self-declaring amendments only.

## 1. Artifact inventory

| Artifact | Path | Role at the gate |
|---|---|---|
| Parity baseline (frozen) | `docs/metanorma-editor-mockup.html` (this package's `docs/`, i.e. `pkg/prosemirror-minimap/docs/`) | Sole tracked copy; served at the virtual route `/mockups/metanorma-editor-mockup.html` |
| Traceability + invariants | [`parity.md`](parity.md) | Part A/B/C inputs to this agenda |
| Oracle suite | `e2e/parity/` | Masters, scenarios, adapter contract, differ, standing asserts |
| Masters | `e2e/parity/masters/*.json` | 8 scenarios, 87 frames, format 2, environment-fingerprinted |
| Scenario fixtures | `e2e/parity/scenarios/*.json` | Engine-agnostic step vocabulary |
| Fixture bridge | `e2e/parity/fixtures/mn-doc.json`, `fixtures/substitution.json` | Phase-4 cross-adapter document + substitution map |
| Deviation register | `e2e/parity/deviations.json` (empty) + [`DEVIATIONS.md`](../e2e/parity/DEVIATIONS.md) | Contract; prefill proposed in §6, written only on gate direction |
| Coverage | `e2e/parity/coverage.json` → [`coverage.md`](../e2e/parity/coverage.md) | INV→assert mapping, deferred remainders, pending-gate markers |
| Package contract | [`ProseMirrorMinimap.spec.md`](../../../docs/ProseMirrorMinimap.spec.md) | What the engine is today; every engine-side option below names its § |
| Consumer wiring | `pkg/editor-gui` (`MinimapPane.tsx`, `App.tsx` classifier) | Chrome seam, theme instance, producers |

## 2. Gate-brief vs committed-artifact audit

The Phase-3 brief's summaries were checked against the committed artifacts.
Discrepancies, ordered by severity — the committed artifacts win wherever they
conflict:

1. **Baseline provenance premise is void.** The brief describes a frozen copy
   at `pkg/prosemirror-minimap/docs/metanorma-editor-mockup.html` whose
   "original lives at `mockups/metanorma-editor-mockup.html`". No such file
   exists in the working tree or anywhere in Git history
   (`git log --all --follow` is empty for that path); the `mockups/`
   directory is gitignored (`.gitignore` line 34) and parity.md itself records
   the docs/ file as the "sole copy — relocated here from the repository
   root's `mockups/`, which no longer holds it". Byte-identity between two
   copies therefore cannot be proven because there is exactly one copy; its
   sha256 is pinned in §7. The only minimap file in `mockups/` is
   `semantic-minimap-mockup.html` — a different, much smaller artifact that
   parity.md explicitly demotes to "supporting reading only".
2. **Master and scenario counts are stale.** The brief says 4 masters / 47
   frames / scenarios {default-sweep, zoom-mid, lane-toggles, wear-dwell}.
   The committed oracle has **8 masters / 87 frames** — it adds `fit-all`,
   `keyboard-walk`, `search-lane`, `themes` (README "Scenario vocabulary";
   verified by direct read of `masters/*.json`).
3. **Standing-assert coverage is understated, and the deferral is port-side,
   not mockup-side.** The brief says 18/22 live invariants carry standing
   asserts and that INV-12/14/18/20 "have no mockup-side master". The
   committed coverage says **all 22 carry standing asserts** (README
   "Deviations & coverage"; `coverage.json` statuses) — INV-12/14/18/20
   included, as interactive tests in `invariants.parity.ts`. What is true:
   those four carry `portVerification: "deferred-unit"` — the **port side**
   is deferred to the package's own headless suite. Audit item (b) is
   re-framed accordingly in G-22.
4. **The deviation action set is understated.** The brief lists
   skip/tolerance/round; the committed contract also defines `expectMissing`,
   `expectExtra`, and `arrayCount` ([`DEVIATIONS.md`](../e2e/parity/DEVIATIONS.md)).
5. **The harness path is package-relative.** The brief's `harness/serve.mjs`
   is `pkg/prosemirror-minimap/harness/serve.mjs`.
6. **Two of the brief's provenance options are unexecutable as stated.**
   "Re-point the route to the original" — there is no original (finding 1).
   "A marker in the original's directory (mockups/README)" — that directory is
   gitignored, so the marker would be untracked and ineffective for anyone
   else. G-21 restates the options executably.
7. **The brief's residue list omits gate items the committed artifacts
   declare.** README "Open items for the decision gate" additionally lists
   the fixture-bridge comparison mode (item 1 there, called "the single
   highest-value decision before Phase 4 starts"), the `reducedMotion`
   workaround (item 4), and thumb-over-strip pointer shadowing (item 7); the
   README also lists eleven tooling-only choices "for gate ratification".
   These enter the agenda as G-29, part of G-30, part of G-05, and G-30.
8. **New finding from this audit (not in the brief): the default-sweep jump
   frames are pinned.** In the committed `masters/default-sweep.json`, all six
   `jump` frames (i=12..17) record `scrollTop = 130379` — the maxScroll state
   left by the preceding `scroll-fraction f=1.0` step — with the active block
   still "Bibliography": the jumps captured **no movement**, although the
   same `revealEl` → `scrollIntoView({block:'center'})` code path demonstrably
   moves the document in the `keyboard-walk` master (45657 → 60779 → 61208…)
   and the `search-lane` master, and the INV-17/18 interactive asserts measure
   real landings. The six frames are byte-stable but carry no jump-landing
   evidence, and a correctly-implementing port would diverge from them by
   ~130k px. Gate item G-31.
9. Trivial: parity.md states the baseline is 3092 lines; the file ends with a
   newline and counts 3091 by `wc -l`.

## 3. Consolidated agenda

Sources merged where they name the same decision; every source id appears
exactly once.

| Source | Merged into | Source | Merged into |
|---|---|---|---|
| Q1 + D1 | G-01 | D6 | G-10 |
| Q2 + D5 | G-02 | Q9 | G-11 |
| Q3 + D10 + D11 | G-03 | D7 | G-12 |
| Q4 | G-04 | D8 | G-13 |
| Q5 + D2 | G-05 | D12 + Q13 | G-14 |
| D3 | G-06 | Q8 | G-15 |
| D4 + Q7 | G-07 | Q10 | G-16 |
| Q6 | G-08 | Q11 | G-17 |
| D9 | G-09 | Q12 | G-18 |
| | | Q14 | G-19 |
| | | Q15 | G-20 |
| Audit (a) | G-21 | Residue: env pin | G-27 |
| Audit (b) | G-22 | Residue: zoom dy | G-28 |
| Audit (c) | G-23 | README open item 1 | G-29 |
| Audit (d) → scrollIntoView bias | G-24 | README tooling list + open item 4 | G-30 |
| Audit (d) → frozen-clock ordering | G-25 | New finding (audit §2.8) | G-31 |
| Audit (d) → anonymous floats | G-26 | | |

Counts: **33 items** — 20 from parity.md Part C + the D-register (15 Q + 12 D,
with six items carrying both a Q and a D), 3 audit items (a)–(c), 5 residue
items (audit (d), split per residue so each is independently decidable), 3
items added from the committed artifacts or this audit (G-29, G-30, G-31),
and 2 from gate review (G-32 oracle hardening, G-33 assembled theme
surface).

**D-register (reconstructed from parity.md row citations; the preamble
records the D-inputs as unratified, and no ratification record exists).**

| D | Statement (as cited by parity.md rows) | Cited rows |
|---|---|---|
| D1 | Groups derive from `RowSpec.landmark {anchor: 'self'\|'parent'}`; a self-anchored landmark is a singleton group; a parent's body rows form discontiguous pieces; tier-3 splits at group boundaries | A.3 segment model, A.3 `byEl` row, Q1 |
| D2 | A `labels.ts` core module (DOM layer, `overlay.ts` precedent); all label constants overridable; mockup values are the defaults | A.1 labels row, A.2 constants, A.4 |
| D3 | Label text is an opaque consumer string; consumer v1 uses title/name text; a demo-grade positional scheme mirroring `renumberAll()` is explicitly not flavor-correct; proper numbering is a future shared service | A.4 label text row |
| D4 | Declarative theme `fill`/`edge` two-tone rows + `slabEdgeWidth` 2 | A.3 palette/two-tone rows, A.9 |
| D5 | Lane order diag=1, notes=2, search=3, wear=4; lane geometry becomes a theme knob `lanes: {width, gap}` (consumer 10/5); engine is 3px/1px hard-coded today | A.1 lanes row, A.2 lane-width row, A.5 |
| D6 | Click → `revealRow` centers precisely (`scroll.ts` `preciseScrollTop`); strip is proportional travel; lane clicks reveal their own element and never travel | A.3/A.5/A.6/A.7 rows; INV-18/20 |
| D7 | Opt-in built-in active-context layer: innermost open group at viewport center; dashed co-pieces for its other pieces | A.3 active/co-piece rows |
| D8 | Wear emission quantized to 4–6 tone buckets with threshold retirement, RLE emission, push-on-bucket-flip; the dwell math is untouched | A.5 wear rows, A.8; INV-21/22 |
| D9 | Consumer constants `zoomPxPerEditorPx` = 0.12 (mockup `MM_RATIO`) and `indentUnit` = 4 | A.2 MM_RATIO and gutter rows |
| D10 | A floating title is not a landmark (mockup gives `h4.floating-title` no segment) | A.3, Part C contradiction audit |
| D11 | `term`/`req` are N-A until the schema gains nodes | A.3 SEM_SEL row, A.4, A.9 |
| D12 | Search and diagnostics producers are stubbed pending the app features | A.5, A.7 |

## 4. Decision items

Each item: sources, what a decision binds, background with evidence, options
(each naming bound rows / INVs / masters / DEV entries / Phase-4 scope), and a
recommendation. Options are independently decidable; no option bundles two
decisions.

---

### G-01 — Group-identity derivation for non-landmark rows

Sources: Q1 + D1. Affects parity.md A.3 segment-model and `byEl` rows, A.5
tick-placement row; INV-5, INV-14; the active-context layer (G-12); package
`blockModel.ts`/classifier surface (spec §4.1, §5.1).

**Background.** The mockup's element identity is DOM-node identity: segments
merge into pieces keyed by `byEl` (mockup:2005–2014), and the active highlight
and labels key off that element map, with `mmBlockFor`'s ancestor walk
(mockup:1846–1857) resolving "finest containing labelled element". The port's
rows are flat (`BlockRow`, spec §4.2); D1 derives groups from
`RowSpec.landmark`. The residual ambiguity: which group owns a non-landmark
prose row that is itself the innermost row at the viewport center (INV-5's
highlight path), and what owns rows before the first landmark. On the mockup
document the first elements are clauses (`cl-fore`, `cl-intro` in
`fixtures/substitution.json`'s anchorMap), so a document preface is not
exercised by the oracle — the rule must still be stated for other documents.

**Ownership discriminator (census-pinned).** Content past a clause's last
child is the parent's own segment (mockup:1932–1934), and the census pins
ten parent-owned trailing pieces: `default-sweep` tops **4935, 4936, 4937,
5065, 5066, 5326, 5450, 5451, 5452, 5454**, each titled by its parent
clause (top 5326 "8.1.2 Datagram mode · depth 3" sits immediately after its
child "8.1.2.1 Checksums" content; the 5450–5454 run is the
grandparent-trailing cascade at the end of the deep 8.x branch). Any
document-order ownership rule mis-owns these rows: nearest-preceding
assigns them to the deep child's group, and "close at the next landmark of
level ≤ the open level" still mis-owns the trailing-after-last-child rows
(5326, 5450–5454), because no later landmark arrives to close the group.
Only subtree extent — pop on walk-exit of the anchor container —
reproduces the census titles' ownership. parity.md's riskiest-ports list
pins the corresponding unit test (trailing-prose piece assignment).

**Options.**

- **A — Ratify D1: subtree-extent group ownership.** A landmark opens a
  group anchored at a subtree: at the landmark row itself for self-anchored
  landmarks (singleton group), at the parent container for parent-anchored
  (title-like) landmarks. A row belongs to the innermost open anchored
  group **whose anchor subtree contains it in the pre-order walk**; a group
  closes when the walk exits its anchor container. Rows before the first
  landmark join the implicit root group — not the first landmark's group
  (the oracle does not exercise this on current documents; `cl-fore` is
  the first landmark). Binds: A.3/A.5 rows above unchanged; INV-5's
  port-side group-containment test, extended with the census-pinned
  trailing-prose discriminator; INV-14's `rowAtPos` innermost semantics;
  parity.md's pinned unit test (trailing-prose piece assignment); Phase-4
  scope = group model in `blockModel.ts` (no new seam). Cost: rule text
  only — the mechanism is D1's.
- **B — Amend: body rows stay groupless; the active layer highlights the
  innermost *landmark-anchored* row only.** Binds: same rows; INV-5 port-side
  loses the co-piece observable for body rows (mockup shows co-pieces for
  multi-piece *elements* only, so this is closer to the letter of mockup:2028
  than it looks, but diverges when the center sits in a long body region);
  cost: D7's "innermost open group" wording changes.
- **C — Reject D1** and derive groups from DOM containment. Not implementable
  in the engine's document-model architecture (spec §1.3, §4; VAC-7); listed
  for completeness.

**Recommendation: A.** It is the only option that preserves
INV-5's piece-derived highlight semantics (parity.md B.1) and INV-14's
finest-element placement without DOM measurement — for the pinned
trailing-piece rows as much as for mid-subtree rows. Evidence:
mockup:1846–1857 (ancestor walk), mockup:2005–2014 (`byEl`), mockup:1932–1934
(trailing-prose ownership), the census rows cited above.

**Decision (fill):** `pending → decided(____)`

---

### G-02 — Lane geometry knobs and lane order

Sources: Q2 + D5. Affects parity.md A.1 four-`.lane` row, A.2 lane-width row,
A.5 lane rows; INV-15; ink-probe verifications; spec §5.4 (theme), §8.4
(`LayerSpans.lane`, merge floor 6 device px).

**Background.** Engine: 3px lane width, 1px gap, unbounded count, lanes at
the canvas right edge (parity.md A.1/A.2). Mockup: 10px lanes, 5px gaps,
exactly 4 lanes as sibling DOM columns (mockup:451, 485, 1883–1891). Q2's
open parts: knob shape (theme vs options), whether the strip/lane/label
partition is themed (that is Q5, G-05), and whether lane count is capped by
pane width.

**Options.**

- **A — Ratify D5 as a theme knob.** `MinimapTheme.lanes: {width, gap}` with
  consumer values 10/5 and fixed consumer lane order diag=1, notes=2, search=3,
  wear=4; no width cap (lane count stays consumer-declared, engine-unbounded).
  Binds: A.1/A.2/A.5 deviate rows become implemented; INV-15 unaffected (6px
  merge floor is device-px, orthogonal); Phase-4 scope = theme type +
  `renderer.ts` lane planning; masters unaffected (lane geometry leaves are
  tick tops/heights, not lane x-geometry; the census carries no lane width).
- **B — Options-level knob** (`MinimapOptions.lanes`) instead of theme.
  Binds: same rows; cost: contradicts spec §5.4's "theme is the single source
  of every canvas-painted value" and forces a spec §5.4/§7.1 edit.
- **C — Cap lane count by pane width** (mockup-faithful fixed-4 look).
  Binds: engine lane planning; breaks any consumer declaring >4 lanes; no
  parity.md row requires it (mockup's 4 is its document's producer set).

**Recommendation: A.** Painted geometry belongs to the theme per spec §5.4;
the consumer gets mockup-exact 10/5 + order; unbounded count keeps the engine
schema-agnostic. Q2's "blocker" status resolves to A + G-05 for the
partition.

**Decision (fill):** `pending → decided(____)`

---

### G-03 — Landmark scope for v1 (which rows get labels)

Sources: Q3 + D10 + D11. Affects parity.md A.4 first row, A.3 SEM_SEL and
`mmTypeOf` rows; INV-2/9/19; every master's `census.labels` and
`frames.*.labels`; DEV-2/DEV-3 in §6; fixture bridge counts.

**Background.** The mockup labels EVERY element (115 census labels = 49
clauses + 26 terms + 15 reqs + 7 floats + 2 equations + 13 admonitions + 1
dl-defs + 1 src-block + 1 raw-block), with anti-collision and band policy as
the only filters (mockup:2034–2042). The fixture document cannot represent
terms/reqs (D11) and surfaces neither dl nor raw blocks (Q14); measured counts
are in `fixtures/substitution.json` (`counts`). D10 is corroborated by the
mockup itself (floating titles get no segment, mockup:1905 vs 1049).

**Options.**

- **A — Ratify D10 + D11; v1 landmark set = clauses at all depths,
  floats/equations, notes/admonitions, sourcecode.** Excluded: term/req
  (schema, D11), dl-defs and raw-block (ride G-19), floating-title (D10).
  Binds: A.4 rows as port/deviate per class; census delta vs mockup = 43
  labels (26 term + 15 req + 1 dl + 1 raw) → DEV-2/DEV-3 prefills; INV-2/9/19
  compare through the substitution map (G-29); Phase-4 scope = consumer
  classifier landmark flags + labels module (G-05).
- **B — Narrower v1 set (clauses only).** Binds: same rows with a larger
  delta (census delta 61); loses float/note landmarks the mockup shows near
  the viewport (INV-2 band-detail behavior diverges more); smaller Phase-4
  classifier surface.
- **C — Wait for schema term/req nodes before fixing the set.** Blocks A.4
  rows and the fixture bridge; Phase 4 cannot start label work.

**Recommendation: A.** It is the mockup-faithful set modulo documented schema
gaps, keeps the DEV deltas exactly countable (43 = substitution
`expectMissing` classes), and INV-9's measured drop rates (5.8/19/33%)
transfer only under a mockup-comparable population.

**Decision (fill):** `pending → decided(____)`

---

### G-04 — The `<Minimap>` / `MinimapPane>` chrome seam

Sources: Q4. Affects parity.md A.1 header, footer/legend, persistence, toast
rows; A.7 dbl-click reset row; spec §11, §12; `pkg/editor-gui/MinimapPane.tsx`.

**Background.** Header (`STRUCTURE` + hint, mockup:733–736), legend footer
(mockup:749–751, 2114–2133), lane titles/tooltips, `mmzoom` persistence
(mockup:1824), and the dbl-click reset toast (mockup:2090) are chrome; the
package ships none (spec §12: no positioning rules; §11: placement fully
external).

**Options.**

- **A — All chrome consumer-side; package exposes data, not markup.** Label
  texts via the labels module (G-05), lane metadata via `LayerDeclaration`
  (spec §8.4); legend and header live in `MinimapPane.tsx`; no new package
  CSS hooks. Binds: A.1 rows stay port/deviate as written (verification
  `screenshot`/`none`); Phase-4 scope = consumer-only.
- **B — Add package structural hooks for legend/lane toggles**
  (`mn-minimap-legend` etc. in `minimap.css`). Binds: spec §12 grows a
  structural-class list; parity.md A.1 legend row flips toward port; cost:
  package takes on chrome policy it currently disclaims; every hook is public
  API surface.
- **C — Legend into the package** (component-level). Contradicts spec §12 and
  §1.2's agnosticism table outright.

**Recommendation: A.** The spec's ownership line (§1.2, §12) is unambiguous,
the mockup's legend geometry dependency is void in the port (A.1 footer row:
"N-A … legend owns no geometry"), and A keeps Phase-4 consumer-side. Revisit
hooks only if a second consumer needs the same legend.

**Decision (fill):** `pending → decided(____)`

---

### G-05 — Labels module and the in-canvas horizontal partition

Sources: Q5 + D2; README open item 7 (thumb-over-strip pointer shadowing).
Affects parity.md A.1 `#mmBody`/`#mmLabels`/`#mmStrip` rows, A.4 label-DOM
row; INV-2/3/9/17/19; spec §8.4, §9.1; ink-probe and golden-master
verification.

**Background.** Mockup: labels column + 52px strip + 4 lanes as flex siblings
(mockup:737, 743–744). Port: one canvas with a consumer-set width to be
partitioned into label gutter, content region, lane strip (Q5), plus a DOM
labels layer (D2). Shadowing: the mockup's viewport overlay spans strip AND
lanes at z-index 5 (mockup:488–492) — pointer positions under the thumb start
thumb drags (README determinism table; INV-18/20 asserts target positions
clear of the thumb). The port must decide whether lanes stay clickable under
the thumb.

**Options.**

- **A — Ratify D2; labels as a DOM sibling column over the pane's left
  region; lanes owned by the canvas right edge; content strip = the
  remainder; the overlay spans content + lanes (mockup-faithful shadowing).**
  Binds: A.1/A.4 rows implemented as D2; 52px strip width becomes consumer
  pane-width policy (A.2 strip row); INV-18/20's "clear of the thumb"
  discipline carries to the port's hit-testing; Phase-4 scope = `labels.ts` +
  overlay geometry + canvas partition (largest single slice after G-11).
- **B — Same, but the overlay covers only the content strip** (lanes always
  clickable). Binds: INV-18/20 port-side semantics diverge from the mockup's
  observable behavior (ticks under the thumb become clickable); masters'
  click-target choices stay valid but the port is *more* permissive — a
  documented enhancement, needs a parity.md row note, not a DEV entry.
- **C — Labels in-canvas** (painted text). Binds: kills the DOM-layer
  precedent (overlay.ts), makes INV-2's population stability a paint concern;
  rejected by D2's cited precedent.

**Recommendation: A, with the shadowing behavior recorded as the port
contract.** The mockup's shadowing is measured, deterministic behavior the
oracle already encodes; matching it keeps INV-18/20 asserts portable.
B remains a legal amendment if the gate prefers the a11y-friendlier
always-clickable lanes — it must then be recorded as an intentional
divergence with its parity.md row updated at Phase 4.

**Decision (fill):** `pending → decided(____)`

---

### G-06 — Label text source

Sources: D3. Affects parity.md A.4 label-text row, A.8 renumber row; INV-2
(label identity in masters uses text); fixture bridge labels; spec §5
(classifier text), G-03.

**Background.** Mockup `mmLabelOf` composes clause `num + title`, term
`num + tword`, req label, note `_label`, float num (mockup:1837–1845). The
mockup's own `renumberAll()` is positional (counters + annex letters) —
demo-grade, not flavor-correct (parity.md Part C audit).

**Options.**

- **A — Ratify D3:** opaque consumer strings; v1 = title/name text; the
  positional scheme only as an explicitly demo-grade fallback; real numbering
  is a future shared service. Binds: A.4 row as deviate (as written); master
  label-text leaves compare only through the fixture bridge with
  consumer-supplied texts; Phase-4 scope = consumer label provider function.
- **B — Port `mmLabelOf` verbatim** into the consumer. Binds: parity with
  mockup texts where classes exist; couples the consumer to mockup DOM
  conventions (`.clnum`, `.tword`) that have no schema counterpart; no gain
  over A since texts are consumer-side either way.

**Recommendation: A.** Labels are consumer policy (spec §5.1's classifier
owns class and text surface); the mockup's own numbering is admittedly
demo-grade, so porting it buys no correctness.

**Decision (fill):** `pending → decided(____)`

---

### G-07 — Strip row paint: two-tone colors and width regime

Sources: D4 + Q7. Affects parity.md A.3 slab-paint, two-tone, gutter rows;
INV-10/15 unaffected; census `blocks[].left` leaves; spec §5.4, §6.5
(`rowWidthFraction`), §15.1.17; screenshot/ink-probe verification.

**Background.** Mockup rows are full-width solid two-tone rects with a shared
right edge 2px (mockup:2021–2022); the engine's tier-2/3 width is
text-length-encoded (spec §6.5, §15.1.17 — no theme knob involved; the
discriminator is the shape-derived `textBlock` bit). Q7 calls this "the
largest visual divergence between baseline and engine today".

**Options.**

- **A — Ratify D4 + add a class-level `width: 'solid' | 'proportional'`
  theme entry; mockup classes set `solid`.** Binds: A.3 rows implemented;
  census `left`/width leaves then match structurally (no DEV entries needed
  for width); Phase-4 scope = theme type + renderer tier-2/3 width branch +
  spec §5.4/§6.5/§15.1.17 amendments (tier-3 mean-width rule keeps
  `proportional` semantics for solid=false classes).
- **B — Keep proportional bars; register the divergence.** Binds: every
  census `blocks[].left` and screenshot comparison diverges; requires DEV
  `skip` on census width leaves and accepts permanent visual non-parity —
  exactly the "tolerance as rot" failure G-23 exists to prevent.
- **C — Solid everywhere (drop proportional).** Breaks the engine's
  density-reading use case (spec §6.5 mean-width rationale) for other
  consumers; spec regression.

**Recommendation: A.** The knob is small, removes the largest divergence at
its root, and leaves the engine default untouched for non-parity consumers.

**Decision (fill):** `pending → decided(____)`

---

### G-08 — Row-height floor and thumb-height floor values

Sources: Q6. Affects parity.md A.2 MIN/paint/thumb-floor rows, A.6 thumb
floor row; INV-16 (assert band 12%); spec §5.4 (`rowHeight` default 3), §6.2
(fit clamp), §9.1 (thumb clamp [2, pane]); masters `frames.*.thumb.height`
(measured: floor-8 frames in `fit-all` at `zoom px=200`).

**Background.** Mockup: segment floor 1.5px, paint floor 2px, thumb floor 8px
(mockup:1979, 2024, 2221). Engine: paint floor 3px default, thumb floor 2px.
Measured in masters: `fit-all` frames sit exactly at thumb=8 (the mockup
floor), and the uniform-scale model at default zoom predicts 101.8 vs mockup
101.76 mid-scroll (0.0%) but 94.905 at the bottom (−6.7%) — the B′
compression documented in coverage INV-16 (band 12%).

**Options.**

- **A — Consumer sets `rowHeight: 2`; add a themeable thumb floor
  (`minThumbHeightPx`, default 2, consumer 8).** Binds: A.2 rows resolved;
  INV-16's port-side model becomes exact (`clientHeight × scale`), and the
  12% band survives only as the mockup-side assert; fit-mode scale clamp
  tightens with rowHeight 2 (spec §6.2) — noted, harmless for the fixture
  document; Phase-4 scope = one theme field + §5.4/§9.1 spec touch + unit
  tests; DEV-1 (thumb tolerance 7.5px) still needed for cross-adapter frames.
- **B — Keep engine defaults; register tolerance only.** Binds: DEV entries
  on thumb height (|8−2| = 6px at floor) *and* on census block heights (paint
  floor 3 vs 2 shifts every small row) — tolerance load grows with no design
  win; INV-16 port-side stays banded rather than exact.
- **C — Full mockup numeric parity (floors 1.5/2/8 in the engine).**
  Sub-case of A with engine defaults changed; rejected: 1.5px segment floor
  is meaningless under exact Float64 offsets (VAC-6).

**Recommendation: A.** It makes the port's thumb model exact (the point of
INV-16's port form) at the cost of one theme field; B is the
tolerance-as-rot pattern G-23 forbids.

**Decision (fill):** `pending → decided(____)`

---

### G-09 — Zoom and indent constants

Sources: D9. Affects parity.md A.2 MM_RATIO and gutter rows; A.6 zoom-clamp
row; INV-13; spec §5.4 (`indentUnit` default 2), §6.2 (`zoomPxPerEditorPx`
default 0.25), §7.1 (option).

**Background.** Mockup `MM_RATIO` 0.12 = default and cap (mockup:1820–1823);
gutter `1 + (lvl−1)×4` (mockup:2021–2022). The port's semantics differ (fixed
editor-px→minimap-px scale vs doc-height ratio) but coincide numerically at
the mockup document (parity.md A.2 row). Measured: default canvasH 15736 over
docHeight 131130 ≈ 0.12 exactly (masters `geom`).

**Options.**

- **A — Ratify D9:** consumer config `zoomPxPerEditorPx: 0.12`,
  `indentUnit: 4`. Binds: A.2 rows as port; INV-13's default-zoom frames
  transfer 1:1; Phase-4 scope = consumer options only (both knobs exist,
  spec §7.1).
- **B — Reject:** keep engine defaults (0.25/2). Binds: every geometry master
  compares at a different zoom — cross-adapter diffs become meaningless;
  not viable for parity.

**Recommendation: A.** Both values are existing options; the numeric
coincidence makes the mockup masters directly reusable.

**Decision (fill):** `pending → decided(____)`

---

### G-10 — Reveal semantics (click / label / lane tick)

Sources: D6. Affects parity.md A.3 reveal row, A.4 label-click row, A.5
tick-click row, A.7 strip-travel row; INV-18, INV-20 (pendingGate marker
`D6` in coverage.json); spec §6.4 (`precise`), §10.

**Background.** Mockup: block/label/tick clicks call `revealEl` →
`scrollIntoView({block:'center'})` + flash (mockup:2026, 2483–2487); strip
pointer travel is continuous and centering (mockup:2316–2327). Port: D6 maps
all three to `revealRow` precise-center; the flash is consumer chrome.

**Options.**

- **A — Ratify D6 as written.** Binds: the rows above resolve to port;
  INV-20's pendingGate marker clears (port-side semantics fixed);
  INV-18/20's ±60px mockup-side bands stay (they absorb the pinned ~52px
  `scrollIntoView` bias, G-24); port-side landings use `precise` (spec §6.4),
  so cross-adapter landing deltas ≈ the bias itself → DEV-4 family in §6;
  Phase-4 scope = hit-test plumbing (G-05) over existing `scroll.ts`.
- **B — Port `scrollIntoView` itself for parity of the bias.** The bias is a
  Chromium behavior, not a spec'd mockup feature; depending on it couples the
  port to an engine quirk (source unidentified, README open item 3). Rejected.

**Recommendation: A**, and record in coverage.json at Phase 4 that
INV-20's `pendingGate: D6` marker resolves to this decision.

**Decision (fill):** `pending → decided(____)`

---

### G-11 — Runtime zoom seam (grip)

Sources: Q9. Affects parity.md A.6 grip, zoom-clamp, rebuild-threshold,
fraction-preservation, dbl-click rows; INV-13 (golden-master); spec §6.2
(display modes), §7.1 (options/reconfigure), §9 (overlay); masters `zoom-mid`
and `fit-all` (zoom steps recorded through the real grip).

**Background.** Engine zoom is configure-time only (`zoomPxPerEditorPx` +
`reconfigure`, spec §7.1); the mockup mutates canvas height mid-session with
fraction preservation, an 8px/2% threshold, `[fit-all, default]` clamping,
dbl-click reset, and `mmzoom` persistence (mockup:2331–2362, 2085–2091,
1824). Masters prove the mockup path: `zoom-mid` hits 9000/6000/3000/12000
exactly and restores 15736 on reset; INV-13 holds fraction ±0.002 across
every zoom step.

**Options.**

- **A — Adopt the Q9 leaning:** `controller.setZoom(px)` preserving scroll
  fraction (INV-13), an opt-in overlay grip hook, fit-all floor mapping to
  `display: 'fit'`, runtime fit↔sliding switch; consumer owns clamps,
  persistence (`mmzoom`), reset toast. Binds: five A.6 rows flip to port;
  INV-13 gains port-side golden-master coverage through `zoom-mid`/`fit-all`
  via the fixture bridge (G-29); Phase-4 scope = controller mutation API +
  overlay grip + mode switch + spec §6.2/§7.1/§9 amendments — the largest
  engine slice in Phase 4.
- **B — Consumer-only seam** (reconfigure on grip events, no controller API).
  Binds: fraction preservation becomes consumer math (INV-13 port-side
  unprovable at the oracle level); rebuild threshold and mode switch have no
  home; zoom masters stay mockup-only.
- **C — Defer the grip entirely.** Drops a primary affordance; the two zoom
  masters lose port-side meaning.

**Recommendation: A.** INV-13 is one of the four golden-master invariants;
without a controller seam its port-side verification is impossible, and the
mockup's zoom UX is a headline feature of the baseline.

**Decision (fill):** `pending → decided(____)`

---

### G-12 — Active-context layer

Sources: D7. Affects parity.md A.3 active/co-piece rows, A.9 accent row;
INV-5 (standing assert: ≤1 active piece, co-pieces share the active
element's title); spec §8.4 (layers).

**Background.** Mockup: `.blk.active` solid 1.5px accent outline + dashed
co-pieces at opacity .45 (mockup:481–484); no z-index so children paint above
(mockup:479–480 — vacuous in a single canvas, A.3 row). D7: an opt-in
built-in layer highlighting the innermost open group at the viewport center
(ownership per G-01).

**Options.**

- **A — Ratify D7** (opt-in layer, tones from theme, z above content). Binds:
  A.3 rows to port; INV-5's port-side group test rides G-01; Phase-4 scope =
  one built-in layer declaration + paint; masters unaffected (active identity
  is asserted, not diffed, beyond `activeBlock` leaves which transfer via the
  bridge).
- **B — Consumer-side layer via the public layer API** instead of built-in.
  Works (spec §8.4 consumer layers), but every consumer re-derives viewport
  center → group; D7 exists precisely to ship it once.

**Recommendation: A.**

**Decision (fill):** `pending → decided(____)`

---

### G-13 — Read-wear emission model

Sources: D8. Affects parity.md A.5 wear rows, A.8 wear-interval row; INV-21
(boundedness), INV-22 (cadence formula); the `wear-dwell` master (5 frames,
opacity leaves); DEVIATIONS §6 prefill DEV-8; spec §8.4 (layer contract).

**Background.** Mockup: per-segment ticks, continuous opacity
`min(.8, heat×.55)` on a 250ms ticker (mockup:2299–2314); masters record
deterministic opacities under the frozen clock (e.g. 0.0767, 0.0107, 0.0001
…). D8 replaces per-segment divs with 4–6 quantized tone buckets, threshold
retirement, RLE emission, push-on-bucket-flip; the dwell math (overlap
fraction, center bonus, decay) is untouched (INV-22 formula is
producer-side).

**Options.**

- **A — Ratify D8** with the boundary recorded: bucket quantization changes
  painted opacities by at most one bucket width (≤ 0.8/4 = 0.2). Binds:
  A.5/A.8 rows as deviate (as written); `wear-dwell` master's
  `frames.*.opacities.*.op` leaves diverge within ±0.2 → DEV-8; INV-21/22
  standing asserts unchanged (they bound heat/opacity and cadence, not tone
  quantization); Phase-4 scope = consumer wear producer + tone buckets.
- **B — Continuous opacity port.** Matches the master byte-for-byte in
  principle, but re-implements per-tick style mutation the engine's layer
  contract replaces; 210 divs × 20fps is the mockup's own scaling liability.

**Recommendation: A.** The register absorbs the bounded difference (≤0.2)
and the engine keeps its O(spans) layer discipline.

**Decision (fill):** `pending → decided(____)`

---

### G-14 — Lane producers for v1: stub set and first real producer

Sources: D12 + Q13. Affects parity.md A.5 diagnostics/notes/search rows, A.7
search rows; INV-14/18 (diag tick asserts); masters `search-lane`; spec §8.4
(future layers table), §16 (out of scope: data sources).

**Background.** D12 stubs search and diagnostics pending app features; the
notes lane (mockup `.mn-note`, schema `review` nodes) has a real counterpart
and no stub decision (Q13). The `search-lane` master drives the real ⌘F path
(ticks populate, first hit reveals, Escape clears).

**Options.**

- **A — Ratify D12 + adopt the Q13 leaning:** notes lane is the first real
  consumer producer (reference implementation for D8 discipline); search and
  diagnostics are stubs; the parity page pushes synthetic spans for
  lane-geometry parity. Binds: A.5/A.7 rows as deviate as written; INV-14/18
  mockup-side asserts unchanged; `search-lane` master stays mockup-only until
  the app search exists (adapter marks the scenario unsupported — small
  vocabulary addition, G-30-adjacent); Phase-4 scope = consumer `review`
  producer.
- **B — Implement diagnostics first** (validation pipeline exists?). No —
  parity.md A.5 records diagnostics as stubbed pending the app's validation
  feature; no producer exists to build on.
- **C — All four lanes stubbed for v1.** Drops the Q13 reference producer and
  leaves D8's discipline unexercised.

**Recommendation: A.**

**Decision (fill):** `pending → decided(____)`

---

### G-15 — Keyboard contract conflict

Sources: Q8. Affects parity.md A.4 keyboard rows, A.7 keyboard row; INV-17
(pendingGate `Q8`); the `keyboard-walk` master; spec §9.3 (scrollbar role
keyboard contract).

**Background.** Mockup: ArrowUp/Down walk SHOWN landmarks on `#minimapWrap`
(mockup:2384–2392). Engine: the overlay implements the ARIA `scrollbar`
contract — arrows scroll by one `lineHeight` (spec §9.3). Both cannot bind
the same keys on the same element. The `keyboard-walk` master records the
walk as replayable frames (movement verified: 45657 → 60779 → …).

**Options.**

- **A — Keep the scrollbar contract on the overlay; landmark walking becomes
  a consumer keybinding over the labels module.** Binds: A.4/A.7 keyboard
  rows as deviate (as written); INV-17's port-side parity is consumer-owned —
  the `keyboard-walk` master stays mockup-verified, and the package adapter
  marks the scenario unsupported (same mechanism as G-14's `search-lane`);
  INV-17's pendingGate marker resolves to "consumer-side"; Phase-4 scope =
  consumer keymap only.
- **B — Landmark walking on the overlay** (replace the scrollbar arrows).
  Breaks the a11y role contract (spec §9.3) and the package's keyboard
  section; would require spec + unit rework; the a11y-faithful choice is the
  documented leaning.
- **C — Both** (walking on the labels focus host, scrollbar on the overlay).
  Two focus hosts (parity.md A.4 second keyboard row) — viable consumer
  composition later; v1 keeps A and leaves C open as a consumer enhancement.

**Recommendation: A.** Role-faithful (the leaning's rationale), and the
master retains its mockup-side value either way.

**Decision (fill):** `pending → decided(____)`

---

### G-16 — Painted hover state

Sources: Q10. Affects parity.md A.3 hover row; spec §10.2 (hover pathway),
§8.4 (layers); screenshot verification.

**Background.** `.blk:hover` brightness (mockup:478) needs a renderer
repaint keyed off the hover row the package already emits (`minimapblockhover`,
spec §10.2); the seam exists, the paint does not.

**Options.**

- **A — Opt-in hover layer tone** (Q10 leaning). Binds: A.3 hover row to
  port; Phase-4 scope = small layer + repaint on hover event; no INV or
  master impact (hover is not captured).
- **B — Consumer CSS hover** over a DOM mirror. Not possible over canvas
  paint; the row stays deviate.

**Recommendation: A**, scheduled late in Phase 4 (cosmetic, no oracle
coverage either way).

**Decision (fill):** `pending → decided(____)`

---

### G-17 — Lane visibility API

Sources: Q11. Affects parity.md A.1 legend-toggles row, A.5 `.off` row;
INV-15 unaffected; masters `lane-toggles` (frames capture `off` + tick
counts); spec §8.4 (`LayerDeclaration`), §7.2 (controller surface).

**Background.** Legend toggles set `.lane.off` (mockup:2127–2130); the
engine has no per-lane on/off surface — `setLayer` pushes spans and says
nothing about visibility (Q11). The `lane-toggles` master records off-state
tick counts (e.g. search 0 by default, toggles leave counts unchanged —
geometry-invariance evidence).

**Options.**

- **A — `LayerDeclaration.visible?: boolean` + controller
  `setLayerVisible(id, on)`** (Q11 leaning names both; pick one seam —
  declaration flag for static config, controller method for legend
  interactivity; both are small and complementary). Binds: A.1/A.5 rows to
  port; `lane-toggles` master gains port-side meaning through the legend
  (consumer) driving `setLayerVisible`; Phase-4 scope = declaration field +
  controller method + renderer skip.
- **B — Consumer-side filtering** (producer pushes empty span set on toggle).
  Binds: nothing engine-side; loses tick data on toggle (re-push needed to
  restore) and makes `off ≠ empty` unexpressible — the mockup's `.off` keeps
  DOM ticks at opacity .15.

**Recommendation: A.**

**Decision (fill):** `pending → decided(____)`

---

### G-18 — Visibility-mode semantics (annotation-mode switches)

Sources: Q12. Affects parity.md A.8 visibility-mode row; spec §4.6 (epochs),
§7.4 (refresh points).

**Background.** The mockup rebuilds on annotation-mode switches because
layout changes (mockup:2972–2986). In the port, a mode that changes heights
without changing content width is not an epoch (spec §4.6) — estimates drift
until stride sampling re-converges.

**Options.**

- **A — Consumer-triggered epoch** (Q12 leaning): a controller seam
  (`forceEpoch()`) the consumer calls on mode switches that reflow layout.
  Binds: A.8 row to port; Phase-4 scope = one controller method + spec §7.1
  note; unit-testable (epoch re-estimation, spec §15.1.12/16).
- **B — Accept drift until sampling re-converges.** Binds: the row stays
  deviate; visible estimate drift after mode switches becomes accepted
  behavior (the mockup's instant correctness is not mirrored).

**Recommendation: A.**

**Decision (fill):** `pending → decided(____)`

---

### G-19 — `.raw-block` and `.dl-defs` rows

Sources: Q14. Affects parity.md A.3 SEM_SEL row; `fixtures/substitution.json`
(`dl-defs`/`raw-block` → `expectMissing`); DEV-2/DEV-3 deltas; spec §16
(schema capability); G-03.

**Background.** `SEM_SEL` includes raw blocks and definition lists
(mockup:1905); the schema has `dl` content but no raw HTML block node surfaced
by the classifier (parity.md Q14). Substitution counts: 1 dl-defs, 1
raw-block. parity.md records "no leaning" — this item is decided on cost and
reversibility alone.

**Options.**

- **A — v1: neither is a row.** The fixture and its `expectMissing` mappings
  stand; DEV-2/DEV-3 deltas stay 43; revisit when the schema surfaces either
  node (a schema change re-opens G-03 cheaply).
- **B — dl becomes a row now** (classifier over existing `dl` content).
  Requires regenerating the fixture bridge (harness synthetic schema needs a
  dl node; `fixtures.parity.ts` re-record) and moves DEV-2/DEV-3 deltas to 42;
  buys one labelled element.
- **C — Both become rows.** raw-block has no node at all — not executable
  for v1.

**Recommendation: A.** The census impact is exactly one element per class;
the fixture regeneration cost is real but avoidable, and the schema decision
(when raw HTML passthrough lands) will want its own pass.

**Decision (fill):** `pending → decided(____)`

---

### G-20 — Governance placement of the parity suite

Sources: Q15. Affects `docs/CONVENTIONS.md` §1.1 current-placements
paragraph; `scripts/check-specs.mjs` placements guard (no failure either way
— the guard covers top-level `docs/*.spec.md` only).

**Background.** `pkg/prosemirror-minimap/docs/` is scanned by the corpus
walker (this dossier and parity.md are governed, link-checked), but
CONVENTIONS §1.1's placements paragraph names only `pkg/panel-layout/docs/`.
Q15 records the one-line edit as outside Phase-1 scope.

**Options.**

- **A — Add the suite to the placements paragraph** (Phase-4 docs commit:
  "in-package suite — `pkg/panel-layout/docs/`, `pkg/prosemirror-minimap/docs/`").
  Findability matches reality; no tooling change.
- **B — Leave as is.** The paragraph drifts from the walker's actual scope.

**Recommendation: A.**

**Decision (fill):** `pending → decided(____)`

---

### G-21 — Baseline custody and provenance

Sources: audit (a); §2 findings 1, 6. Affects the served
baseline route (`pkg/prosemirror-minimap/harness/serve.mjs` pins
`/mockups/metanorma-editor-mockup.html` to the docs/ copy); parity.md
baseline paragraph; §7 below.

**Background.** The committed reality: the docs/ copy is the **sole** copy,
tracked (added in commit `71f9d7e1`, 2026-11-09; working tree byte-identical
to the committed blob — verified, §7), git is the drift prevention, and the
route never touches the gitignored `mockups/` directory for this file. The
residual risks: (i) the virtual `/mockups/` URL suggests a `mockups/` origin
and invites someone to "restore" a second, divergent copy there; (ii) nothing
in the suite pins the served bytes to a checksum, so a silent edit of the
docs/ file would re-record masters against a mutated baseline before anyone
noticed.

**Options.**

- **A — Ratify the freeze and close the two gaps:** record the sha256 in this
  dossier (§7, done) and add a Phase-4 suite-side assert that the served
  baseline's sha256 equals the pinned value before any record/verify run; a
  route-comment note in `serve.mjs` pointing at this dossier's appendix.
  Binds: no parity.md row changes (its "sole copy" note is already accurate);
  Phase-4 scope = one assert in the parity suite.
- **B — Re-point the route to a restored original** under `mockups/` with a
  checksum pin. Requires un-ignoring `mockups/` (repo policy conflict) and
  re-creating a file that no longer exists; rejected as custody regression.
- **C — Relocate the frozen copy out of `docs/`** (e.g. under `e2e/parity/`).
  The `docs/` placement is convention-governed only for `.md` (check-specs
  scans `pkg/<pkg>/docs/**/*.md`); moving the HTML would churn parity.md's
  baseline paragraph, serve.mjs, README, and the fixture generator for zero
  governance gain.

**Recommendation: A.** Single-copy custody is the committed reality (§2
finding 1); the actionable work is the checksum pin, which makes it
tamper-evident.

**Decision (fill):** `pending → decided(____)`

---

### G-22 — Port-side coverage for the deferred-unit invariants

Sources: audit (b); §2 finding 3. Affects INV-12, INV-14,
INV-18, INV-20 (`coverage.json` `portVerification: "deferred-unit"`);
`coverage.md` regenerations; the dev parity page (`harness/parity/`);
scenario vocabulary (`viewport` step exists and is suite-only today).

**Background.** All four carry **mockup-side** standing asserts
(`invariants.parity.ts`): INV-12 rebuild-stability under ±1px/+40px viewport
changes; INV-14 tick-to-owner placement; INV-18 tick-click reveal ±60px;
INV-20 strip travel ±60px. The deferral is that the **port** side is verified
only by the package's headless suite (`test.mjs`) — no parity-master or
parity-page exercise exists for them. INV-18/20 are primary affordances
(lane-click reveal; strip travel). Mechanism notes: `page.setViewportSize`
is available for viewport steps; the package harness pane is fixed-size
today (spec §15.3 — 96×600 pane, no pane-resize mount option), so a viewport
step does not move the package's minimap pane without harness work; real
pointer events are usable on the dev parity page without touching the
byte-stable masters.

**Options.**

- **A — Ratify the deferral as is.** Binds: `coverage.json` unchanged;
  Phase-4 unit tests carry all four; the parity page checks nothing for
  them; zero new cost, and the two affordances get no cross-implementation
  exercise.
- **B — Split: dev-parity-page real-mouse checks for INV-18/20 when the
  package adapter exists; INV-12/14 stay deferred-unit** with coverage
  remainders recorded (INV-12's port form is the §8.5 floored-device-px
  no-op, a unit property per VAC-5; INV-14's observable half — tick geometry
  — rides the masters' lane-tick leaves anyway, and its innermost-row
  semantics is unit-side). Binds: Phase-4 scope = parity-page (dev-only,
  never the suite's capture path) real-mouse driving; masters untouched;
  `coverage.json` gains "dev-parity-page" entries for INV-18/20.
- **C — Full vocabulary extension into the suite** (viewport/pane-resize step
  + real-mouse retries for all four). Binds: harness mount gains pane-resize
  (spec §15.3 change); the byte-stability risk of adding gestures to
  recorded scenarios forces re-records (a gate action per README); highest
  cost, and INV-12/14 gain little that unit + masters don't already prove.

**Recommendation: B.** It buys cross-implementation exercise exactly where
users put their fingers (lane clicks, strip travel) at dev-page cost, keeps
the masters byte-stable, and leaves the two genuinely unit-shaped properties
where coverage.json already records them.

**Decision (fill):** `pending → decided(____)`

---

### G-23 — Tolerance philosophy for the Phase-4 diff

Sources: audit (c); overlaps Q6 (G-08) and Q7 (G-07) on the *design* side —
this item fixes the *oracle* side. Affects every future `deviations.json`
entry; [`DEVIATIONS.md`](../e2e/parity/DEVIATIONS.md); INV-16 (12% band),
INV-17/18/20 (±60px); masters' geometry leaves.

**Background.** The mockup's placement is a piecewise B′ map over
DOM-measured segments; the port's is one uniform scale over editor space
(spec §6.2). The divergence is systematic and bounded, and it is the *point*
of the port (VAC-1..8 exist because the piecewise path is unportable).
Measured envelope (this audit, from the masters): thumb share compression
0.0–6.7% at recorded zooms (bottom-of-document worst case; mid-scroll ≈ 0%);
B′ block-position deviation ±4–5px at default zoom (coverage INV-4 note);
pan/thumb divergence up to ~56 map-px at fit-all (VAC-3). Without an adopted
principle, each Phase-4 tolerance reads as rot.

**Options.**

- **A — Adopt the principle + the naming rule + the band table.**
  *Principle:* the Phase-4 diff is **structure-equal, geometry-tolerant by
  design** — membership, ordering, and counts are compared strictly; only
  named geometric leaf families carry bands, each band derived from a
  measured invariant-level bound, never from a failing diff. *Rule:* every
  `tolerance` / `round` / `arrayCount` entry's `reason` must name the INV it
  relaxes and the parity.md row that motivates it; `skip` is reserved for
  leaves with no port counterpart and must name the substitution class or
  gate item. The register stays `appliesTo: "package"` only (mockup
  byte-strictness untouched), and environment drift remains un-registerable
  (DEVIATIONS.md "What is not a deviation"). *Band table (the complete
  initial set, each naming its invariant):*
  - `frames.*.thumb.height` — ≤12% relative (INV-16); register expression
    7.5px absolute over recorded zooms (max measured 6.9px).
  - Reveal-landing leaves (`scrollTop` after `jump`/`key`/lane-click/strip
    steps) — ±60px (INV-17/18/20; includes the pinned ~52px bias, G-24);
    companion `thumb.top`/`panY` ±7px (60 × scale 0.12).
  - Map-position leaves (`census.blocks.*.top`, `frames.*.labels.*.top`) —
    ±6px at default zoom (INV-4 note ±4–5px); fit-all scenario ±60px (VAC-3
    ~56px).
  - Wear opacities — ±0.2 (INV-21 with G-13's bucket width).
  Binds: §6 prefill validates against this table; Phase-4's first mapped diff
  may tighten but not loosen a band without a gate action.
- **B — Strict equality, no bands.** Forces either porting B′ (rejected by
  VAC-1..8 and the spec's model) or re-recording masters from the port
  (destroys the oracle's independence); not viable.
- **C — Decide bands ad hoc during Phase 4.** Each band then arrives as a
  diff-quieting edit with no invariant named — the rot pattern A exists to
  prevent.

**Recommendation: A.** The bands above are all measured or invariant-derived,
none is a fudge factor, and the naming rule makes the register self-auditing.

**Decision (fill):** `pending → decided(____)`

---

### G-24 — The ~52px `scrollIntoView` center bias

Sources: audit (d); README open item 3. Affects INV-17/18/20 (±60px bands);
masters' landing leaves; DEV-4 family (§6).

**Background.** Chromium's `scrollIntoView({block:'center'})` lands a
deterministic ~52px off the mathematical center on the mockup page (measured,
0 drift, source unidentified). The masters pin landings byte-exactly; the
interactive asserts use the documented ±60px band. The port's `precise`
mapping (G-10) lands mathematically, so cross-adapter landing deltas ≈ the
bias itself.

**Options.**

- **A — Accept as pinned:** masters keep byte-exact landings; the ±60px band
  (G-23) covers cross-adapter comparisons; register the DEV-4 family. The
  bias's *source* stays an open engineering question (not a gate item — it is
  deterministic and pinned either way).
- **B — Chase the source** (suspects: sticky-chrome compensation in
  Chromium's scroll-into-view algorithm). Informational only; even if
  identified, the mockup's landings are frozen in masters — nothing changes.

**Recommendation: A** (B optional as documentation-only curiosity).

**Decision (fill):** `pending → decided(____)`

---

### G-25 — Frozen-clock scroll-ordering constraint

Sources: audit (d); README open item 5; `wear.parity.ts` / adapter clock mode.

**Background.** Under `page.clock.pauseAt`, an in-flight scroll animation
reverts manual `scrollTop` assignments until settled past; the adapter
sequences around it, and Phase-4 clock scenarios must respect the same
ordering.

**Options.**

- **A — Accept as a Phase-4 authoring constraint** (documented here and in
  the README; the package adapter's clock mode repeats the adapter's
  sequencing). No register entry (an authoring rule, not a divergence).
- **B — Re-engineer the wear spec to avoid the frozen clock.** Loses the
  tick-exact INV-22 determinism; rejected.

**Recommendation: A.**

**Decision (fill):** `pending → decided(____)`

---

### G-26 — Anonymous-float census ambiguity

Sources: audit (d); README open item 6. Affects INV-5 (title-identity
scoping), INV-14/18 (geometric ownership); census identity semantics.

**Background.** Floats without `numberMap` numbers all title as
`block · depth ? · float`, so element identity by title is ambiguous for
them; INV-5's asserts are scoped accordingly, and INV-14/18 use geometric
ownership (exact). Port-side, the fixture bridge's anchors
(`substitution.json` anchorMap) give unambiguous identity.

**Options.**

- **A — Accept the scoping; port-side census identity uses fixture anchors.**
  No register entry; a Phase-4 authoring note in the adapter.
- **B — Disambiguate the mockup census** (number the anonymous floats in
  capture, re-record all masters). A gate re-record action for cosmetic
  census hygiene; the ambiguity is already routed around exactly.

**Recommendation: A.**

**Decision (fill):** `pending → decided(____)`

---

### G-27 — Environment-pinned masters

Sources: audit (d); README open item 2. Affects all 8 masters'
`env` fingerprints; the verify-time gate (`canonicalEnv.ts`); CI.

**Background.** Masters are byte-stable only in the recording environment;
every master carries a fingerprint and verify refuses to diff across
environments. Recorded canonical environment (read from the masters):
Chromium 151.0.7922.34, linux/arm64, viewport 1600×900, reduced-motion
emulation, all five probed document fonts available (Georgia, Iowan Old
Style, Times New Roman, Menlo, Segoe UI).

**Options.**

- **A — Ratify the fingerprint as canonical; propose a CI image pin** (a
  Phase-4 infra slice pinning Chromium build + OS/arch + fonts) so verify runs
  where the masters live. Re-recording elsewhere stays a gate action.
- **B — Re-record in CI's default environment and ratify that.** Throws away
  the committed byte-stability proof; the fingerprint fields (fonts!) make
  most CI runners non-canonical anyway.

**Recommendation: A.** The font fingerprint is the load-bearing part
(layout, therefore every px); pin the image, not the hope.

**Decision (fill):** `pending → decided(____)`

---

### G-28 — Integer-dy zoom quantization

Sources: audit (d); README open item 8. Affects `zoom` steps in `zoom-mid` /
`fit-all` masters.

**Background.** Mouse `clientY` is integer, so achieved canvas heights
quantize slightly; the mockup `Math.round`s the target and masters pin the
outcome. Measured: the recorded zoom steps hit their targets exactly
(9000/6000/3000/12000; reset → 15736).

**Options.**

- **A — Accept as pinned** (masters carry the outcomes; the port adapter
  will drive `setZoom` directly with exact px, which is *more* exact — any
  residual quantization is covered by G-23's map-position bands). No entry.
- **B — Force fractional zoom targets in new scenarios.** No parity value.

**Recommendation: A.**

**Decision (fill):** `pending → decided(____)`

---

### G-29 — Fixture-bridge comparison mode for the golden-master invariants

Sources: README open item 1 ("the single highest-value decision before Phase
4 starts"); §2 finding 7.
Affects INV-2, INV-9, INV-13, INV-17 (`portVerification:
"golden-master"`); `fixtures/substitution.json`; the differ's structural
actions; §6 prefill.

**Background.** The masters encode the mockup's own document; the harness
schema cannot represent terms/reqs/etc. (D11/Q14), so byte-exact
cross-adapter diffs are impossible on a different document by construction.
The bridge (`mn-doc.json` + substitution map + structural deviation actions)
makes two modes executable: (a) package masters recorded against the fixture,
compared through the map + structural deviations; (b) document-agnostic
standing asserts alone (they already run on any adapter). Deciding
mid-Phase-4 would invalidate recorded masters — hence now.

**Options.**

- **A — Mode (a) for INV-2/9/13; mode (b) for INV-17.** The three
  label/zoom invariants get true cross-adapter master diffs through the
  substitution map (delta 43 census labels, G-03); INV-17's port side is
  consumer-owned under G-15, so its master (`keyboard-walk`) stays
  mockup-verified and the standing asserts carry the port. Binds: Phase-4
  scope = package adapter + mapped diff wiring (the differ already supports
  every needed action); DEV-2/3 and the G-23 bands apply.
- **B — Mode (a) for all four.** Requires the consumer keymap (G-15 option
  A) to be exercised through the package harness — but the walking host is
  consumer chrome, not the package; the package adapter cannot drive it
  honestly.
- **C — Mode (b) for all four.** The recorded masters' cross-adapter value is
  abandoned; INV-13's fraction-preservation and INV-2's spine stability lose
  their diff-level port proofs (standing asserts on the port adapter are
  weaker — they assert the port against itself, not against the mockup's
  numbers).

**Recommendation: A.** It is the README's own analysis: the bridge exists so
(a) is executable without new design; INV-17 is the one invariant whose port
behavior the gate is sending to the consumer anyway.

**Decision (fill):** `pending → decided(____)`

---

### G-30 — Ratification of Phase-2 tooling-only choices

Sources: README "Tooling-only choices made (for gate ratification)" (eleven
choices) + open item 4 (`reducedMotion` context-option no-op worked around
with the explicit `emulateMedia` call). Affects the parity suite's shape; no
parity.md rows; no masters.

**Background.** The eleven choices: `*.parity.ts` spec naming; the baseline
served from the committed docs/ copy under a stable virtual route; one
census per scenario after the reset step; per-frame lane-tick geometry for
diag/com/search only (wear census-only); the clock-based wear master (with a
structure-only fallback if preferred); build-stale frames captured, not
discarded (coherence guard suspends only mapping-formula asserts);
`pending-gate` as a distinct coverage status; the generated, byte-verified
fixture bridge; the parity page's `scroll-behavior` pin (dev-page only); the
suite-only `viewport` step; plus the `reducedMotion` workaround.

**Options.**

- **A — Ratify the set as listed**, exceptions markable individually in the
  decision line (e.g. "A, except: drop the clock-based wear master — use the
  structure-only fallback"). Binds: Phase 4 keeps the suite's shape; any
  exception names its Phase-4 rework.
- **B — Reject the set.** Each rejection names a Phase-2 rework with no
  parity-value gain; none of the eleven contradicts a parity.md row or a
  spec §.

**Recommendation: A.** The set is internally consistent, oracle-preserving,
and documented in place; the wear-master fallback is the only choice with a
real alternative and the clock-based master has proven tick-exact (INV-22).

**Decision (fill):** `pending → decided(____)`

---

### G-31 — Pinned jump frames in the default-sweep master

Sources: this audit (§2 finding 8). Affects
`masters/default-sweep.json` frames 12–17; INV-4/9 standing asserts on those
frames; the DEV prefill (§6); G-23/G-24 landing bands.

**Background.** All six `jump` frames in the committed `default-sweep`
master record the state left by `scroll-fraction f=1.0` (scrollTop 130379 =
maxScroll, active "Bibliography") — the jumps captured no movement, while
the same reveal path moves measurably in `keyboard-walk` (45657 → 60779 → …)
and `search-lane`, and the INV-17/18 interactive asserts measure real
landings (±60px bands with the ~52px bias). The frames are byte-stable (the
oracle passes), but they carry no jump-landing evidence, and a port that
implements D6 correctly would land near each anchor and diverge from the
pinned frames by ~10⁵ px — a divergence no legitimate band covers.

**Options.**

- **A — Diagnose and re-record `default-sweep` as the first Phase-4 oracle
  action** (re-record is a gate action; this decision grants it). Working
  hypotheses to test in that order: the jump's `scrollIntoView` is a no-op
  or reverts when dispatched from the maxScroll state under the 3-rAF settle;
  a step-order effect (jumps never follow f=1.0 elsewhere). The re-record
  keeps the scenario JSON unchanged unless diagnosis demands a settle fix in
  the adapter (an adapter change, gate-noted here). Binds: masters re-record
  (default-sweep only); no INV changes; §6 prefill needs no skip entries.
- **B — Accept the pinned frames; register six skip entries** for
  `frames.12..17` leaves with reason "oracle capture defect (G-31)". Binds:
  the register carries skips on frames that *should* have been evidence;
  INV-17/18 interactive asserts remain the only landing proofs; cost: none
  now, permanent oracle debt.
- **C — Re-author the scenario** (move jumps away from f=1.0, e.g. interleave
  after f=0.5). Changes the scenario JSON + master; equivalent to A with a
  different fix locus; only if diagnosis (A) shows the bottom-state is the
  trigger.

**Recommendation: A.** The oracle exists to be evidence; six frames that
look like captures of a no-op are exactly the kind of thing the gate should
spend one Phase-4 slice on, and the re-record is cheap and gated. This
dossier records the finding; the mechanism is unconfirmed and stated as such.

**Decision (fill):** `pending → decided(____)`

---

### G-32 — Oracle hardening: master-sanity asserts and determinism manifest

Sources: gate-review finding 2; G-31's lesson. Affects
`e2e/parity/` suite (`masters.parity.ts`, scenario JSON vocabulary), a new
manifest artifact; G-31's re-record; every future recording.

**Background.** Phase 2's determinism proof (two verify runs with identical
per-master sha256) exists only in conversation, not in-tree. G-31 is the
empirical proof that hash equality certifies determinism, **not correctness**:
six byte-stable dead frames pass green indefinitely. Two hardenings close the
gap from both sides.

**Options.**

- **A — Both.** (i) A **master-sanity assert class** in the suite, evaluated
  at record time *and* verify time: every scenario step not marked `noop:
  true` (with a stated reason, a scenario-vocabulary addition) must change at
  least one declared observable dimension (scrollTop, thumb geometry, panY,
  shown-label set, active element, lane ticks, opacities) relative to the
  previous frame — a stable-but-degenerate recording fails loudly, at
  record time, before it becomes a master. (ii) A **committed sha256
  manifest** of the masters (e.g. `e2e/parity/masters/MANIFEST.json`),
  asserted by verify mode: every verify-green run under the G-27
  fingerprint is then itself an in-tree determinism proof, with no doubled
  CI run. Binds: suite + one new artifact; G-31's re-record executes under
  the asserts; no INV or master-content changes.
- **B — Sanity asserts only** (no manifest). Leaves determinism proven only
  by CI-green under G-27, with no in-tree record of the proof.
- **C — Manifest only** (no sanity asserts). Leaves the G-31 defect class
  undetected at record time — the re-record itself could re-enter a
  degenerate capture silently.

**Recommendation: A.** G-31 demonstrates the two halves need each other:
the manifest proves replay stability, the sanity asserts prove the
recording is evidence. (A twice-run `parity:verify` was considered and
rejected: it doubles CI cost for what the manifest asserts on every run.)

**Decision (fill):** `pending → decided(____)`

---

### G-33 — Assembled theme surface (consistency across G-02/G-07/G-08/G-09)

Sources: gate-review finding 3; consolidates G-02
(lane geometry), G-07 (width regime + two-tone), G-08 (`rowHeight`/thumb
floor), G-09 (`indentUnit`). Affects spec §5.4 (the `MinimapTheme` type),
renderer tier-2/3 paint branches; no master changes.

**Background.** Those items ratify fragments of **one API** — `MinimapTheme`
— and the human never sees the assembled shape. Specifically, G-07 Option A
adds a class-level `width: 'solid' | 'proportional'` knob but leaves the
slab **gap rule homeless** (the design-review plan bound
gap-0-within-group / hairline-at-boundary to a composite paint knob), so a
separately-ratified G-07 + a later gap knob risks overlapping,
state-expressible-incoherently options (e.g. "solid width" + proportional
gaps). This item decides the assembly; the non-chosen assembly is recorded
consider-and-rejected.

**Options.**

- **A — Composite assembly.** Per-class `paint: 'bar' | 'slab'` owning the
  gestalt: `bar` = proportional length-encoded width + `barGapPx`; `slab`
  = solid fill-width + group-gap rules (0 within a group, hairline at
  boundaries) + `fill`/`edge` two-tone + `slabEdgeWidth`. G-07's `width`
  knob is then recorded considered-and-rejected (subsumed by `paint`);
  D4's two-tone fields are unchanged.
- **B — Separable knobs.** Class-level `width: 'solid' | 'proportional'`
  (G-07 Option A verbatim) + an explicit class-level gap rule (or gap
  implicitly bound to `width`) + the two-tone pair. The composite `paint`
  knob is recorded considered-and-rejected.
- **C — Defer assembly review to Phase-4 spec drafting.** Rejected
  direction (listed for completeness): defeats the purpose — the
  incoherence risk is exactly at ratification time.

**Recommendation: A.** Slab-ness is one visual gestalt; the composite
cannot express contradictory states, and either assembly matches the
census width leaves structurally, so this is an API-coherence decision, not
a parity one. **Ordering: decide G-33 with or before G-07** — if G-33
selects A, G-07's Option A stands with its knob subsumed; if B, G-07
Option A stands as written and the gap rule's home must be named there.

**Decision (fill):** `pending → decided(____)`

---

## 5. Decision index

One row per item; mark Status `pending → decided(<choice>)`.
Unmarked at gate close = undecided; the dependents named in the item do not
start in Phase 4.

| G-id | Title | Sources | Recommendation | Status |
|---|---|---|---|---|
| G-01 | Group-identity derivation | Q1, D1 | Ratify D1, subtree-extent rule (A) | pending |
| G-02 | Lane geometry knobs | Q2, D5 | Theme knob `lanes:{width,gap}` 10/5, order fixed, no cap (A) | pending |
| G-03 | Landmark scope for v1 | Q3, D10, D11 | Ratify D10+D11; set = clauses+floats+notes+src (A) | pending |
| G-04 | Chrome seam | Q4 | All chrome consumer-side; no package hooks (A) | pending |
| G-05 | Labels module + partition | Q5, D2, README#7 | DOM label column; canvas lanes; overlay shadows (A) | pending |
| G-06 | Label text source | D3 | Ratify D3: opaque consumer strings (A) | pending |
| G-07 | Row paint: two-tone + width | D4, Q7 | Ratify D4 + `width:'solid'` knob (A) | pending |
| G-08 | Row/thumb floor values | Q6 | `rowHeight:2` + themeable thumb floor 8 (A) | pending |
| G-09 | Zoom/indent constants | D9 | Ratify 0.12 / 4 (A) | pending |
| G-10 | Reveal semantics | D6 | Ratify precise-center reveal (A) | pending |
| G-11 | Runtime zoom seam | Q9 | `setZoom` + grip hook + fit floor (A) | pending |
| G-12 | Active-context layer | D7 | Ratify opt-in built-in layer (A) | pending |
| G-13 | Wear emission model | D8 | Ratify quantized buckets; ±0.2 band (A) | pending |
| G-14 | Lane producers v1 | D12, Q13 | Ratify stubs; notes first producer (A) | pending |
| G-15 | Keyboard contract | Q8 | Scrollbar contract stays; walking consumer-side (A) | pending |
| G-16 | Painted hover | Q10 | Opt-in hover layer tone (A) | pending |
| G-17 | Lane visibility API | Q11 | `visible` flag + controller toggle (A) | pending |
| G-18 | Visibility-mode epochs | Q12 | Consumer-triggered `forceEpoch()` (A) | pending |
| G-19 | raw-block / dl-defs rows | Q14 | v1: neither is a row (A) | pending |
| G-20 | Placements paragraph | Q15 | Add suite to CONVENTIONS §1.1 (A) | pending |
| G-21 | Baseline custody | audit (a) | Ratify sole-copy freeze + sha256 pin assert (A) | pending |
| G-22 | Deferred-invariant port coverage | audit (b) | Dev-page real-mouse for INV-18/20; 12/14 unit (B) | pending |
| G-23 | Tolerance philosophy | audit (c) | Adopt principle + naming rule + band table (A) | pending |
| G-24 | 52px scrollIntoView bias | audit (d) | Accept as pinned; DEV-4 family (A) | pending |
| G-25 | Frozen-clock ordering | audit (d) | Phase-4 authoring constraint (A) | pending |
| G-26 | Anonymous-float ambiguity | audit (d) | Accept scoping; fixture anchors port-side (A) | pending |
| G-27 | Environment pin | audit (d), README#2 | Ratify fingerprint + CI image pin (A) | pending |
| G-28 | Zoom dy quantization | audit (d), README#8 | Accept as pinned (A) | pending |
| G-29 | Fixture-bridge mode | README#1 | Mode (a) for INV-2/9/13; (b) for INV-17 (A) | pending |
| G-30 | Tooling choices ratification | README list, README#4 | Ratify set, exceptions markable (A) | pending |
| G-31 | Pinned jump frames | this audit | Diagnose + re-record default-sweep first (A) | pending |
| G-32 | Oracle hardening | gate review | Sanity asserts + sha256 manifest (A) | pending |
| G-33 | Assembled theme surface | gate review | Composite `paint` assembly (A); decide with/before G-07 | pending |

**Items without a recommendation:** none — every item above carries one. Three
recommendations carry named contingencies: G-31's mechanism is unconfirmed
(the observable facts are pinned in §2.8; the diagnosis is Phase-4 work);
G-29's mode (a) for INV-2 assumes G-15 lands on option A (consumer-side
walking); if G-15 selects otherwise, G-29 should be re-marked to option B for
INV-17 at the same gate sitting. G-33 must be decided **with or before G-07**
(the assembly subsumes G-07's knob under G-33 option A — see G-33's ordering
note).

## 6. Proposed `deviations.json` prefill

Keyed to the recommendations above; **not written** — the live register is
written only on gate direction. Entries marked *provisional* are calibrated
at Phase-4's first mapped diff inside the band the gate adopts (G-23); the
band, not the provisional number, is the decision. Every `reason` names its
invariant and source per the G-23 rule.

```json
{
  "$format": 1,
  "deviations": [
    {
      "id": "DEV-1",
      "appliesTo": "package",
      "reason": "INV-16 via G-23/G-08 (parity.md A.2/A.6 floor rows): mock-up B′ piecewise share compresses the thumb 0.0-6.9px below the uniform-scale model at recorded zooms (measured: model 101.8 vs 94.905 at default-H bottom; 77.6 vs 72.327 at zoom 12000); assert band 12% relative, register expression absolute.",
      "path": "frames.*.thumb.height",
      "action": { "type": "tolerance", "value": 7.5 }
    },
    {
      "id": "DEV-2",
      "appliesTo": "package",
      "reason": "G-03 (D11 + Q14 via G-19, parity.md A.3/A.4): 43 of 115 mock-up census labels have no package counterpart on the fixture document (26 term + 15 req + 1 dl-defs + 1 raw-block; fixtures/substitution.json expectMissing classes).",
      "path": "census.labels",
      "action": { "type": "arrayCount", "delta": 43 }
    },
    {
      "id": "DEV-3",
      "appliesTo": "package",
      "reason": "G-03/G-19 (same classes as DEV-2): unrepresentable elements own no strip pieces; piece count of the missing elements equals 43 (provisional — verified at first mapped diff; terms/reqs are single-piece, dl/raw single-piece per census).",
      "path": "census.blocks",
      "action": { "type": "arrayCount", "delta": 43 }
    },
    {
      "id": "DEV-4",
      "appliesTo": "package",
      "reason": "INV-17 via G-24/G-23 (README open item 3): mock-up landings pin Chromium's deterministic ~52px scrollIntoView center bias; the port reveals via precise center (D6/G-10). Template entry — Phase 4 enumerates one triple (scrollTop 60, thumb.top 7, panY 7) per reveal-driven step echo (jump anchors cl-1/cl-5/cl-6-1-1-1-1-1-1/cl-9/cl-c/cl-bib; keyboard-walk key steps) — G-31 re-records the default-sweep jump frames first.",
      "scenario": "keyboard-walk",
      "step": "key ArrowDown",
      "path": "frames.*.scrollTop",
      "action": { "type": "tolerance", "value": 60 }
    },
    {
      "id": "DEV-5",
      "appliesTo": "package",
      "reason": "INV-17 via G-24 (companion of DEV-4): thumb top shifts by bias × scale ≈ 52 × 0.12 ≈ 6.3px on reveal-driven frames.",
      "scenario": "keyboard-walk",
      "step": "key ArrowDown",
      "path": "frames.*.thumb.top",
      "action": { "type": "tolerance", "value": 7 }
    },
    {
      "id": "DEV-6",
      "appliesTo": "package",
      "reason": "INV-17 via G-24 (companion of DEV-4): pan translate shifts by the same bias × scale on reveal-driven frames.",
      "scenario": "keyboard-walk",
      "step": "key ArrowDown",
      "path": "frames.*.panY",
      "action": { "type": "tolerance", "value": 7 }
    },
    {
      "id": "DEV-7",
      "appliesTo": "package",
      "reason": "INV-21 via G-13/G-23 (D8, parity.md A.5 wear rows): quantized tone buckets vs continuous mock-up opacity; bucket width ≤ 0.2 over [0, 0.8] with 4 buckets.",
      "scenario": "wear-dwell",
      "path": "frames.*.opacities.*.op",
      "action": { "type": "tolerance", "value": 0.2 }
    },
    {
      "id": "DEV-8",
      "appliesTo": "package",
      "reason": "INV-4 note via G-23 (VAC-1/VAC-6 rationale): B′ piecewise vs uniform-scale block positions deviate ±4-5px at default zoom (measured, coverage.json INV-4).",
      "path": "census.blocks.*.top",
      "action": { "type": "tolerance", "value": 6 }
    },
    {
      "id": "DEV-9",
      "appliesTo": "package",
      "reason": "INV-2/INV-4 via G-23: label canvas positions deviate with the same B′ envelope as blocks at default zoom (provisional count/membership interplay rides DEV-2's map through the substitution bridge).",
      "path": "frames.*.labels.*.top",
      "action": { "type": "tolerance", "value": 6 }
    },
    {
      "id": "DEV-10",
      "appliesTo": "package",
      "reason": "VAC-3 via G-23: at fit-all the piecewise-vs-uniform divergence reaches ~56 map-px; fit-all geometry leaves widen to the VAC-3-derived band (provisional 60 until the first mapped diff measures it).",
      "scenario": "fit-all",
      "path": "frames.*.thumb.top",
      "action": { "type": "tolerance", "value": 60 }
    }
  ]
}
```

Conditional alternative (only if G-31 selects option B — accept the pinned
frames): six explicit `skip` entries for `default-sweep` frames 12–17
(`frames.12.scrollTop` … `frames.17.panY`, reason "oracle capture defect,
G-31 option B"), replacing DEV-4's default-sweep enumeration.

## 7. Provenance appendix

**Baseline (sole copy, tracked).**
`pkg/prosemirror-minimap/docs/metanorma-editor-mockup.html` — 171,981 bytes,
3,091 lines (ends with newline), sha256
`e8cc516d6c9ff5e423c5828cd0d4c4884121ab91dbf5e2b35394138129d2810e`.
Added in commit `71f9d7e1` ("chore(minimap): commit mock-up", 2026-11-09);
the working-tree file is byte-identical to the committed blob (verified by
hashing `git show 71f9d7e1:<path>`). Served at
`/mockups/metanorma-editor-mockup.html` by
`pkg/prosemirror-minimap/harness/serve.mjs`, pinned to this copy.

**The brief's "original".** `mockups/metanorma-editor-mockup.html` — does not
exist (working tree and all of Git history); `mockups/` is gitignored.
No second hash exists to compare; identity is single-copy custody (G-21).
Nearest neighbor: `mockups/semantic-minimap-mockup.html` (27,058 bytes,
sha256 `7a84170cde8e29109215b2d7fb30f1fd806a9ce5463633f735b2205f3cacbf1f`)
— a different artifact, "supporting reading only" per parity.md.

**Masters inventory** (8 scenarios, 87 frames, format 2): `default-sweep` 22,
`fit-all` 12, `keyboard-walk` 8, `lane-toggles` 8, `search-lane` 7,
`themes` 13, `wear-dwell` 5 (clock spec, opacities, no census), `zoom-mid`
12. Canonical environment fingerprint (read from the masters): Chromium
151.0.7922.34, linux/arm64, viewport 1600×900, reducedMotion reduce, fonts
`{georgia, iowanOldStyle, timesNewRoman, menlo, segoeUI}` all true.

**Key measurements cited in this dossier** (all read from the committed
masters/coverage during this audit): default geometry `scrollHeight` 131227,
`clientHeight` 848, `docTop0` 38, `docHeight` 131130, `canvasH` 15736,
`paneH` 763; census 115 labels / 210 blocks (heights 2–1166.39) / lane ticks
diag 3, com 3, search 0, wear 210; thumb model 101.8 vs measured 101.763
(mid) / 94.905 (bottom) / 97.306 (reset); fit-all thumb floor 8 exactly at
`zoom px=200`; zoom targets hit exactly (9000/6000/3000/12000, reset 15736);
keyboard-walk landings 45657 → 60779 → 61208 → 61332 → 61208 → 58686;
default-sweep jump frames 12–17 pinned at 130379 (G-31); INV-9 drop rates
5.8/19/33% (parity.md); fixture/mock-up element counts in
`fixtures/substitution.json` (`counts`).

## 8. Document lifecycle and freeze rule

**Number taxonomy.** Numbers in this dossier follow four rules:

- **Keep** exact numbers that define decisions — measurements, bands,
  deltas, census evidence. They are decision inputs; they are never
  recomputed, rounded, or "refreshed".
- **Compute** numbers that describe the dossier to itself — item counts,
  line counts — at every amendment. Cached self-numbers go stale (§2
  finding 9's 3092-vs-3091 is the canonical example).
- **Stamp** numbers that describe the world — commit ids, dates,
  environment facts — once, as recorded at the time; they are historical
  facts, not live values.
- **Hash-pin** the artifacts this dossier depends on (below), so silent
  drift in any dependency is detectable.

**Dependency hashes** (sha256, as of this writing; legitimately changed
dependencies — e.g. G-31's re-record — are re-stamped in the same commit as
the change they track, per the freeze rule below):

| Artifact | sha256 |
|---|---|
| `docs/parity.md` | `2e47a55dd175be36be950871edb7d079aaf8b30ca3719a906e69dec4961d0acd` |
| `e2e/parity/coverage.json` | `c3fd404cc117be635bd5658d66ad317908d2cd00404e5931eff8f025cc27cdf2` |
| `e2e/parity/deviations.json` | `10ce6c517955f3ca87a21ab7e05a906f0c03472a5d8c2f468538f42498f5b089` |
| `e2e/parity/DEVIATIONS.md` | `424c1ecfcf90c03c7b72d562d0c6006cc0f8855f023073f049c37d6ae2292300` |
| `e2e/parity/masters/default-sweep.json` | `c3439d5cb880b3d4c5919987303fdaca6deaabf00f23789e24bd0355e5b84e54` |
| `e2e/parity/masters/fit-all.json` | `58f31a67d6221222635669b80c04c2f8b8a921a04197ecfdbbbc94a84cacee34` |
| `e2e/parity/masters/keyboard-walk.json` | `9a8101765c201a15c888893f2eb47bd48bac8d22264aff113cf2e9d356934a24` |
| `e2e/parity/masters/lane-toggles.json` | `753b40fabc74285b85b980da8221fbf4076b0590b581655c3fc5ee8af305e65b` |
| `e2e/parity/masters/search-lane.json` | `67d94a11b7cea87832fad3425ec9f7c2a0f0ccf5cf50aaba151d883ea50e4588` |
| `e2e/parity/masters/themes.json` | `5446a1dbea804060b4111e922ccd3947eff0735fe58e375cb4079023c449998b` |
| `e2e/parity/masters/wear-dwell.json` | `8164b4c564ecec678f8b3bb576d9d3eba5ebd109d5ec58cf78c16d57e0715a40` |
| `e2e/parity/masters/zoom-mid.json` | `690e5aabe52b0d520279db046e08576c0e1605cba33fe0b3d725f352d10d0434` |

(The baseline mock-up's hash is already pinned in §7.)

**Freeze rule.** Gate close is marked by the `parity-gate-close` git tag;
that tag is the reference point for every freeze check. Before the tag
exists, this dossier is a draft: git history narrates its edits, and no
in-document change record is kept. After the tag exists, content changes
happen only as orchestrator-gated amendments — each self-declaring at its
edit site with a dated parenthetical, never as silent edits — and
dependency-hash re-stamps ride the same commit as the dependency change
they track (a re-stamp without its diff, or a diff without its re-stamp,
is the drift signal). The Phase-1/Phase-2 artifacts (`parity.md`, masters,
coverage, the oracle suite) are frozen likewise: corrections to their
content are carried in this dossier, not edited into them — the G-01
subtree-extent restatement of parity.md's Q1 leaning is the precedent.
