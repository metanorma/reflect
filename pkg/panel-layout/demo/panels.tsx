/**
 * Demo panel content — the 11 illustrative panel bodies of the demo
 * consumer (demo.spec.md; behavior.spec.md §1: "panel content is out of
 * scope", the demo's own data). Translated VERBATIM from the reference
 * mock's `PANELS` map: same HTML strings, same indentation — the rendered
 * `__html` bytes are identical (D39: no JSX-ification; byte-parity of
 * rendered content is the constraint).
 *
 * `createElement`-only (no JSX syntax), matching the library's scanner
 * constraint (scripts/check-imports.mjs — D34) and the mock's own style.
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * @ 94d4b8307e5f0db2a1b32e14ceb8754207a51f27
 */
import { createElement as h } from 'react';
import type { FC } from 'react';
import type { IDockviewPanelProps } from '@metanorma/panel-layout';

/* ============ panel content (same markup as the FlexLayout mock) ============ */
export const PANELS = {
    outline: `
      <input class="osearch" placeholder="Find in outline…">
      <span class="o-node">◱ Document <span class="otag">bibdata</span></span>
      <span class="o-node">1&nbsp;&nbsp;Scope</span>
      <span class="o-node">2&nbsp;&nbsp;Normative references</span>
      <span class="o-node">3&nbsp;&nbsp;Terms and definitions</span>
      <span class="o-node">5&nbsp;&nbsp;Requirements</span>
      <span class="o-node sub">5.1&nbsp;&nbsp;General</span>
      <span class="o-node sub sel">5.2&nbsp;&nbsp;Determination</span>
      <span class="o-node sub">5.3&nbsp;&nbsp;Calculation</span>
      <span class="o-node">6&nbsp;&nbsp;Expression of results</span>
      <span class="o-node">7&nbsp;&nbsp;Test report</span>
      <span class="o-node floating">Experimental notes <span class="otag">floating</span></span>
      <span class="o-node">Bibliography</span>`,
    bibliography: `
      <input class="pfilter" placeholder="Filter — docid · title · contributor">
      <div class="bib-row"><span class="docid">ISO 80000-1:2022</span><span class="bt">Quantities and units — General</span><span class="chip-d">cited ×2</span></div>
      <div class="bib-row"><span class="docid">ISO 11348-1:2007</span><span class="bt">Water quality — Luminescence…</span><span class="chip-d">cited ×3</span></div>
      <div class="bib-row"><span class="docid">ISO 1087-1:2000</span><span class="bt">Terminology work — Vocabulary</span><span class="chip-d">non-ref.</span></div>
      <div class="bib-row"><span class="docid">ISO 80000-1:2022*</span><span class="bt">draft revision</span><span class="badge b-warn">dup ↗</span></div>
      <div class="pfoot">index over bibdata · termdocsource · bibitem · origins</div>`,
    validation: `
      <div class="iss"><span class="sev err"></span><span class="txt"><b>Unresolved xref</b> — “Clause 9” · target <span class="mono10">clause-9</span> not found</span><span class="jump">fix ▸</span></div>
      <div class="iss"><span class="sev warn"></span><span class="txt"><b>Duplicate docid</b> — ISO 80000-1:2022 in [1] and [4]</span><span class="jump">merge ▸</span></div>
      <div class="iss"><span class="sev warn"></span><span class="txt"><b>Missing mimetype</b> — Figure 2 (<span class="mono10">fig-torch</span>)</span><span class="jump">set ▸</span></div>
      <div class="pfoot">re-checked on every transaction</div>`,
    review: `
      <div class="iss"><span class="sev warn"></span><span class="txt"><b>Committee comment</b> — 5.2: confirm acid volume for high-alloy grades <span class="mono10">(A. Ricci · Tue)</span></span></div>
      <div class="iss"><span class="sev warn"></span><span class="txt"><b>Suggestion</b> — 7: add precision row to Table 2 <span class="mono10">(M. Okafor · Mon)</span></span></div>
      <div class="pfoot">2 open · resolved hidden</div>`,
    pinned: `
      <div style="margin-bottom:6px"><span class="node-pill">figure</span><span class="anchor-ref">@ fig-ion-beam</span></div>
      <ul class="blink-list">
        <li><span class="src">5.1</span> xref <span class="jump">go ↸</span></li>
        <li><span class="src">6.2</span> xref <span class="jump">go ↸</span></li>
        <li><span class="src">bib[2]</span> eref · ISO 11348-1 <span class="jump">go ↸</span></li>
      </ul>
      <div class="fnote">stays on this figure while selection roams — drag the window titlebar to move it, or drag the tab onto another group</div>`,
    identity: `
      <div style="margin-bottom:7px"><span class="node-pill">requirement</span><span class="anchor-ref">@ req-5-2-1</span></div>
      <div class="field"><label>anchor</label>
        <div class="ctl"><input type="text" value="req-5-2-1">
        <div class="fnote">3 references rewrite on rename (xref, eref, inherit)</div></div></div>
      <div class="field"><label>id · generated</label>
        <div class="ctl"><input type="text" readonly value="7f3a91c4…e21">
        <div class="fnote">content-hash — pipeline-owned, never edit</div></div></div>
      <div class="field"><label>backlinks</label>
        <div class="ctl"><ul class="blink-list">
          <li><span class="src">5.1</span> xref “R-5.2-1” <span class="jump">go ↸</span></li>
          <li><span class="src">7 NOTE</span> xref <span class="jump">go ↸</span></li>
          <li><span class="src">bib[1]</span> eref · ISO 24817-1 <span class="jump">go ↸</span></li>
        </ul></div></div>
      <div class="field"><label>inherit</label>
        <div class="ctl"><div class="prow">
          <span class="pick">ISO 24817-1:2016 · Req 5.2-1 ↗</span><span class="linklike">Pick…</span>
        </div></div></div>`,
    attributes: `
      <div class="ftoggles"><span class="ft">Modified only</span><span class="ft">Non-default</span></div>
      <div class="field"><label>obligation</label>
        <div class="ctl"><div class="selbox">requirement — “shall”</div></div></div>
      <div class="field"><label>classification</label>
        <div class="ctl"><div class="prow">
          <span class="pick">safety · test · verification (3)</span><span class="linklike">Edit…</span>
        </div><div class="fnote">same edit state as the badge on the block</div></div></div>
      <div class="field"><label>label</label>
        <div class="ctl"><input type="text" value="R-5.2-1"></div></div>
      <div class="field"><label>unnumbered</label>
        <div class="ctl"><input type="checkbox" style="accent-color:var(--accent)"> off — inherits auto-numbering</div></div>`,
    structure: `
      <div class="kv"><span class="k">parent</span><span class="v" style="color:var(--accent-ink)">Document ▸ 5 Requirements ▸ 5.2 Determination</span></div>
      <div class="kv"><span class="k">cohort</span><span class="v">section_body · sibling 2 of 3</span></div>
      <div class="kv"><span class="k">content</span><span class="v">statement+, prov*</span></div>
      <div class="fnote">tabsets in this window share one width; each has its own height — sashes and the window’s bottom edge resize one tabset at a time</div>`,
    derived: `
      <div class="hatched" style="padding:9px 10px;border-radius:6px">
        <div class="kv"><span class="k">label (computed)</span><span class="v" style="color:var(--derive-ink);font-style:italic">Req 5.2.1 — from §5 numbering chain</span></div>
        <div class="kv"><span class="k">renders as</span><span class="v" style="color:var(--derive-ink);font-style:italic">“shall” statement</span></div>
        <div class="kv"><span class="k">citeas on export</span><span class="v" style="color:var(--derive-ink);font-style:italic">ISO 24817-1</span></div>
        <div class="derived-note">Computed by the presentation pipeline — edit the semantic panels; derived values change on export.</div>
      </div>`,
    overlays: `
      <div class="ovrow"><span class="lbl">Anchors &amp; references</span><span class="tg on">ON</span></div>
      <div class="ovrow"><span class="lbl">Inbound counts</span><span class="tg on">ON</span></div>
      <div class="ovrow"><span class="lbl">Obligations</span><span class="tg on">ON</span></div>
      <div class="ovrow"><span class="lbl">Numbering overrides</span><span class="tg on">ON</span></div>
      <div class="ovrow"><span class="lbl">Metadata anomalies</span><span class="tg on">ON</span></div>
      <div class="ovrow"><span class="lbl">Integrity errors</span><span class="tg on">ON</span></div>
      <div class="ovrow"><span class="lbl">Review marks</span><span class="tg off">OFF</span></div>
      <div class="fnote">gutter density:</div>
      <div class="seg"><span>Full</span><span class="on">Compact</span><span>Aggregated</span></div>
      <div class="fnote">hold ⌥ to reveal all momentarily · auto-compacts above ~24 marks/viewport</div>`,
    document: `
      <div class="page">
        <div class="row"><div class="rail"></div><div class="cell">
          <div class="bibdata-strip">
            <span class="tag">bibdata</span>
            <div>
              <div class="id">ISO/CD 24817-1</div>
              <div class="sub">Aerospace alloys — Determination of Mg and Zn by FAAS · stage CD · 2026-03 · click to edit metadata</div>
            </div>
            <div class="grow"></div>
            <span class="ptr">Edit metadata <span class="arr">▸</span></span>
          </div>
        </div></div>
        <div class="row"><div class="rail"></div><div class="cell">
          <div class="tds-row">
            <span class="tag">termdocsource</span> terminology sources:
            <span class="ptr">ISO 1087-1 <span class="arr">↗</span></span>
            <span class="ptr">ISO 5127 <span class="arr">↗</span></span>
          </div>
        </div></div>
        <div class="row"><div class="rail"></div><div class="cell">
          <div class="doc-title">Determination of magnesium and zinc in aerospace alloys — Flame atomic absorption spectrometric method</div>
          <div class="doc-id">ISO/CD 24817-1:2026(E)</div>
        </div></div>
        <div class="row"><div class="rail"></div><div class="cell"><h2 class="cl">1&nbsp;&nbsp;Scope</h2></div></div>
        <div class="row"><div class="rail"></div><div class="cell">
          <p class="body">This document specifies a flame atomic absorption spectrometric method
          for the determination of the mass fractions of magnesium and zinc in the aerospace
          alloys listed in <span class="xref">Table 2</span>. Quantities and units are expressed
          in accordance with <span class="eref">ISO 80000-1</span>. The method is applicable to
          mass fractions from 0,005&nbsp;% to 1,5&nbsp;%. Calibration
          shall follow the procedure given in <span class="broken">Clause 9</span>.</p>
          <p class="footnote"><span class="fnline"></span>1&nbsp; Formerly designated “series AA alloys”.</p>
        </div></div>
        <div class="row"><div class="rail"></div><div class="cell"><h2 class="cl">2&nbsp;&nbsp;Normative references</h2></div></div>
        <div class="row"><div class="rail"></div><div class="cell"><p class="body">There are no normative references in this document.</p></div></div>
        <div class="row"><div class="rail"></div><div class="cell"><h2 class="cl">3&nbsp;&nbsp;Terms and definitions</h2></div></div>
        <div class="row"><div class="rail"><span class="mk dot">term-alloy</span></div><div class="cell">
          <p class="body"><b>3.1</b>&nbsp; <span class="term-word">aerospace alloy</span></p>
          <p class="body">metallic material, alloyed for use in load-bearing aerospace structures</p>
          <p class="tsrc">[SOURCE: ISO 11348-1:2007, 3.2, modified — “aircraft” replaced by “aerospace”]
            &nbsp;<span class="ptr">→ bibitem [2] <span class="arr">↗</span></span></p>
        </div></div>
        <div class="row"><div class="rail"><span class="mk"><b>#sec-5</b>·2</span></div>
          <div class="cell"><h2 class="cl">5&nbsp;&nbsp;Requirements</h2></div></div>
        <div class="row"><div class="rail"></div><div class="cell"><h3 class="scl">5.1&nbsp;&nbsp;General</h3></div></div>
        <div class="row"><div class="rail"></div><div class="cell">
          <p class="body">The determination shall be carried out on the test portion prepared
          in accordance with <span class="xref">6.2</span>, using the nebulizer geometry shown
          in <span class="xref">Figure 1</span>. Results shall be reported as specified
          in <span class="xref">Table 2</span>.</p>
        </div></div>
        <div class="row"><div class="rail"></div><div class="cell"><h3 class="scl">5.2&nbsp;&nbsp;Determination</h3></div></div>
        <div class="row"><div class="rail"><span class="mk hot selmark"><b>#req-5-2-1</b>·2</span></div>
          <div class="cell"><div class="req selq">
            <div class="req-head">
              <span class="req-kind">Requirement</span>
              <span class="req-id">R-5.2-1</span>
              <span class="badge b-shall">shall · obligation: requirement</span>
              <span class="badge b-meta">classification · 3 ▸</span>
            </div>
            <p>The test portion shall be dissolved in 20&nbsp;ml of hydrochloric acid
            (1+1) and 2&nbsp;ml of hydrogen peroxide, then diluted to 100,0&nbsp;ml.</p>
            <div class="req-meta-row">
              <span class="k">Inherits:</span>
              <span class="ptr">ISO 24817-1:2016 · Req 5.2-1 <span class="arr">↗</span></span>
              <span class="chip-d">citeas on export: “ISO 24817-1”</span>
            </div>
          </div></div></div>
        <div class="row"><div class="rail"><span class="mk dot">#req-5-2-2</span></div>
          <div class="cell"><div class="req rec">
            <div class="req-head">
              <span class="req-kind">Recommendation</span>
              <span class="req-id">R-5.2-2</span>
              <span class="badge b-should">should · obligation: recommendation</span>
            </div>
            <p>A reagent blank should be carried through the complete procedure with each batch.</p>
          </div></div></div>
        <div class="row"><div class="rail"></div><div class="cell"><h2 class="cl">6&nbsp;&nbsp;Expression of results</h2></div></div>
        <div class="row"><div class="rail"><span class="mk"><b>#eq-1</b>·2</span></div>
          <div class="cell">
            <div class="formula">w = (ρ₁ − ρ₀) · V / (m · f)</div>
            <div class="figtools"><span class="badge b-meta">stem · asciimath</span><span class="badge b-meta">block</span></div>
          </div></div>
        <div class="row"><div class="rail"><span class="mk hot"><b>#fig-ion-beam</b>·3</span></div>
          <div class="cell"><div class="figure">
            <div class="figbox">image · ion-beam-geometry.svg</div>
            <div class="figcap"><b>Figure 1</b> — Nebulizer flow geometry</div>
          </div></div></div>
        <div class="row"><div class="rail"><span class="mk dot weak">fig-torch</span></div>
          <div class="cell"><div class="figure small">
            <div class="figbox">image · torch-detail.png</div>
            <div class="figcap"><b>Figure 2</b> — Torch detail</div>
            <div class="figtools"><span class="badge b-warn">⚠ mimetype missing — see Validation ▸</span></div>
          </div></div></div>
        <div class="row"><div class="rail"></div><div class="cell"><h2 class="cl">7&nbsp;&nbsp;Test report</h2></div></div>
        <div class="row"><div class="rail"><span class="mk"><b>#tbl-2</b>·1</span></div>
          <div class="cell">
            <div class="tblcap"><b>Table 2</b> — Measured mass fractions</div>
            <table class="mn">
              <tr><th>Element</th><th>Mass fraction&nbsp;%</th><th>Wavelength&nbsp;nm</th></tr>
              <tr><td>Mg</td><td>0,45</td><td>285,2</td></tr>
              <tr><td>Zn</td><td>1,12</td><td>213,9</td></tr>
            </table>
          </div></div>
        <div class="row"><div class="rail"></div><div class="cell">
          <div class="note"><b>NOTE</b>&nbsp; The result is reported to four significant digits.</div>
        </div></div>
        <div class="row"><div class="rail"><span class="mk dot weak">notes</span></div>
          <div class="cell">
            <h3 class="floating">Experimental notes</h3>
            <p class="body"><span class="badge b-meta">floating title · depth 2 · unnumbered</span></p>
            <p class="body">Working notes retained for the committee; excluded from numbering.</p>
          </div></div>
        <div class="row"><div class="rail"></div><div class="cell"><h2 class="cl">Bibliography</h2></div></div>
        <div class="row">
          <div class="rail"><div class="mk-region">▸ 14 anchors<br>collapsed (density)</div></div>
          <div class="cell">
            <div class="bib-item"><span class="n">[1]</span>
              <span class="t">ISO 80000-1:2022, <em>Quantities and units — Part 1: General</em>. Geneva: ISO.</span>
              <span class="bib-side"><span class="chip-d">cited ×2</span></span></div>
            <div class="bib-item"><span class="n">[2]</span>
              <span class="t">ISO 11348-1:2007, <em>Water quality — Luminescence… Part 1</em>. Geneva: ISO.</span>
              <span class="bib-side"><span class="chip-d">cited ×3</span></span></div>
            <div class="bib-item"><span class="n">[3]</span>
              <span class="t">ISO 1087-1:2000, <em>Terminology work — Vocabulary — Part 1</em>. Geneva: ISO.</span>
              <span class="bib-side"><span class="chip-d">non-referenced</span></span></div>
            <div class="bib-item"><span class="n">[4]</span>
              <span class="t">ISO 80000-1:2022 (draft revision), <em>Quantities and units</em>.</span>
              <span class="bib-side"><span class="badge b-warn">duplicate docid ↗ [1]</span></span></div>
          </div>
        </div>
      </div>`,
  };

/** Factory for the ten float-panel bodies (`.panelwrap` box, D1/D2). */
export function panelComponent(key: keyof typeof PANELS): FC<IDockviewPanelProps> {
  return () => h('div', {
    className: 'panelwrap',
    dangerouslySetInnerHTML: { __html: PANELS[key] },
  });
}

/** The document page panel (`.panelwrap.docwrap` — the grid's only panel). */
export const DocumentPanel: FC<IDockviewPanelProps> = () => h('div', {
  className: 'panelwrap docwrap',
  dangerouslySetInnerHTML: { __html: PANELS.document },
});
