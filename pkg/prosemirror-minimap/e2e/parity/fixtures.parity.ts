/**
 * Fixture bridge — the Phase-4 document contract (the gate's biggest open
 * item, made concrete).
 *
 * The recorded masters encode the baseline mock-up's OWN document
 * (115 labels / 210 blocks — terms, requirement blocks, admonition
 * flavors, dl and raw blocks included). The package harness schema
 * (harness/schema.ts) cannot represent term/req (D11), dl-defs or
 * raw-block (Q14), so byte-exact cross-adapter master diffs are impossible
 * in principle on a different document. This spec GENERATES the bridge:
 *
 *   fixtures/mn-doc.json        a synthetic-schema document structurally
 *                               matched to the baseline: the exact clause
 *                               tree (anchors, depths, titles), with the
 *                               representable block mix standing in
 *                               (image↔floats, quote↔admonitions,
 *                               code_block↔source blocks) and the
 *                               unrepresentable classes omitted.
 *   fixtures/substitution.json  the census substitution map: mock-up class
 *                               → fixture node (or expectMissing, cited to
 *                               its parity.md decision), the anchor→
 *                               section-path map that lets the SAME
 *                               scenario fixtures drive the package side
 *                               (`jump cl-6-1-1-1-1-1-1` resolves by path),
 *                               heading-level clamp, and both side's
 *                               counts.
 *
 * Generation is deterministic from the frozen mock-up DOM. Record mode
 * (PW_PARITY_RECORD=1) regenerates both files; verify mode byte-compares
 * regeneration AND validates the mapping arithmetic (fixture counts equal
 * the mapping-derived expectations; every expectMissing class actually
 * occurs; every jump anchor used by any scenario resolves).
 *
 * The GATE still decides which comparison mode is canonical for INV-2/9/13/
 * 17 port-side: (a) package masters recorded against mn-doc.json compared
 * through this map plus the structural deviation actions, or (b) the
 * document-agnostic standing asserts alone (they already run on any
 * adapter). The artifacts here make both executable without new decisions
 * leaking into Phase 4.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { FIXTURES_DIR, RECORD, SCENARIOS_DIR } from './lib/env.js';
import { canonicalFile } from './lib/canonical.js';
import { mockupAdapter } from './lib/mockupAdapter.js';
import type { Scenario } from './lib/types.js';

/** Extract the mock-up's clause tree + block census from its DOM, using the
 *  mock-up's own structural selectors (the segsOf walk). */
const EXTRACT_BODY = `(() => {
  const OMIT = '.term, .req, .dl-defs, .raw-block, .mn-note, .insert-pt';
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] || 0) + 1; };
  const snippet = (el) => (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120);
  function classify(el) {
    if (el.classList.contains('clause')) return 'clause';
    if (el.classList.contains('term')) return 'term';
    if (el.classList.contains('req')) return 'req';
    if (el.classList.contains('admonition')) return 'admonition';
    if (el.classList.contains('dl-defs')) return 'dl-defs';
    if (el.classList.contains('src-block')) return 'src-block';
    if (el.classList.contains('raw-block')) return 'raw-block';
    if (el.classList.contains('equation')) return 'equation';
    if (el.classList.contains('fig') || el.classList.contains('tbl-fig')) return 'float';
    if (el.classList.contains('mn-note')) return 'mn-note';
    if (el.classList.contains('insert-pt')) return 'insert-pt';
    if (el.tagName === 'H4') return 'floating-title';
    if (el.tagName === 'P' || el.tagName === 'UL' || el.tagName === 'OL') return 'prose';
    return 'other';
  }
  function walkClause(sec) {
    const depth = Math.min(7, Math.max(1, +sec.dataset.depth || 1));
    const numEl = sec.querySelector(':scope > .clause-head .clnum');
    const titleEl = sec.querySelector(':scope > .clause-head .cltitle');
    const node = {
      anchor: sec.dataset.anchor,
      depth,
      num: numEl ? numEl.textContent.trim() : '',
      title: titleEl ? titleEl.textContent.trim() : '',
      children: [],
    };
    Array.from(sec.querySelectorAll(':scope > .clause-body > *')).forEach((ch) => {
      const kind = classify(ch);
      if (kind === 'clause') { node.children.push(walkClause(ch)); return; }
      bump(kind);
      if (ch.matches(OMIT)) { node.children.push({ kind, omitted: true }); return; }
      node.children.push({ kind, text: snippet(ch) });
    });
    bump('clause');
    return node;
  }
  const roots = Array.from(document.querySelectorAll('#doc > section.clause')).map(walkClause);
  return { roots, counts };
})()`;

interface ExtractedChild {
  kind: string;
  text?: string;
  omitted?: boolean;
}
interface ExtractedClause {
  anchor: string;
  depth: number;
  num: string;
  title: string;
  children: Array<ExtractedClause | ExtractedChild>;
}
interface Extracted {
  roots: ExtractedClause[];
  counts: Record<string, number>;
}

const isClause = (c: ExtractedClause | ExtractedChild): c is ExtractedClause =>
  'anchor' in c;

/** The class correspondence, cited to parity.md rows. Static — the counts
 *  beside it are generated. */
const MAPPING: Array<Record<string, unknown>> = [
  { mockupClass: 'clause', fixtureNode: 'section', note: 'exact clause tree; heading level = min(depth, 6)' },
  { mockupClass: 'float', fixtureNode: 'image', note: 'figure/fig/tbl-fig stand-in (A.3 SEM_SEL)' },
  { mockupClass: 'equation', fixtureNode: 'image', note: 'float stand-in (A.3)' },
  { mockupClass: 'admonition', fixtureNode: 'quote', note: 'note/example/warning stand-in (A.3)' },
  { mockupClass: 'src-block', fixtureNode: 'code_block', note: 'sourcecode stand-in (A.3)' },
  { mockupClass: 'prose', fixtureNode: 'paragraph', note: 'p/ul/ol bodies' },
  { mockupClass: 'floating-title', fixtureNode: 'paragraph', note: 'unnumbered h4 (D10: not a landmark)' },
  { mockupClass: 'other', fixtureNode: 'paragraph', note: 'fallback bucket — keep the census honest' },
  { mockupClass: 'term', fixtureNode: null, expectMissing: true, reason: 'D11: no schema node' },
  { mockupClass: 'req', fixtureNode: null, expectMissing: true, reason: 'D11: no schema node' },
  { mockupClass: 'dl-defs', fixtureNode: null, expectMissing: true, reason: 'Q14: no surfaced dl node' },
  { mockupClass: 'raw-block', fixtureNode: null, expectMissing: true, reason: 'Q14: no raw HTML node' },
  { mockupClass: 'mn-note', fixtureNode: null, expectMissing: true, reason: 'margin chrome (A.5 notes lane producer side)' },
  { mockupClass: 'insert-pt', fixtureNode: null, expectMissing: true, reason: 'slash-menu chrome, not document content' },
];
const EXPECT_MISSING = MAPPING.filter((m) => m.expectMissing).map((m) => m.mockupClass as string);

function buildFixture(ex: Extracted) {
  const counts = { section: 0, heading: 0, paragraph: 0, image: 0, quote: 0, code_block: 0 };
  const anchorMap: Record<string, number[]> = {};
  const sectionNode = (cl: ExtractedClause, secPath: number[]) => {
    anchorMap[cl.anchor] = secPath;
    counts.section++;
    counts.heading++;
    const content: Record<string, unknown>[] = [
      {
        type: 'heading',
        attrs: { level: Math.min(6, cl.depth) },
        content: [{ type: 'text', text: `${cl.num ? cl.num + ' ' : ''}${cl.title}` }],
      },
    ];
    let secIdx = 0;
    for (const ch of cl.children) {
      if (isClause(ch)) {
        content.push(sectionNode(ch, [...secPath, secIdx]));
        secIdx++;
      } else if (ch.omitted) {
        // expectMissing class — no fixture node
      } else if (ch.kind === 'float' || ch.kind === 'equation') {
        content.push({ type: 'image' });
        counts.image++;
      } else if (ch.kind === 'admonition') {
        content.push({
          type: 'quote',
          content: [{ type: 'paragraph', content: ch.text ? [{ type: 'text', text: ch.text }] : [] }],
        });
        counts.quote++;
        counts.paragraph++;
      } else if (ch.kind === 'src-block') {
        content.push({ type: 'code_block', content: [{ type: 'text', text: ch.text ?? '' }] });
        counts.code_block++;
      } else if (ch.kind === 'prose' || ch.kind === 'floating-title' || ch.kind === 'other') {
        content.push({ type: 'paragraph', content: ch.text ? [{ type: 'text', text: ch.text }] : [] });
        counts.paragraph++;
      }
    }
    return { type: 'section', content };
  };
  const doc = { type: 'doc', content: ex.roots.map((r, i) => sectionNode(r, [i])) };
  return { doc, anchorMap, counts };
}

test('fixture bridge: generate + validate mn-doc.json and substitution.json', async ({ page }) => {
  const adapter = mockupAdapter();
  await adapter.load(page);
  const ex = (await page.evaluate(EXTRACT_BODY)) as Extracted;
  const { doc, anchorMap, counts } = buildFixture(ex);

  const substitution = {
    $format: 1,
    generatedFrom:
      'the committed baseline mock-up (pkg/prosemirror-minimap/docs/metanorma-editor-mockup.html) — deterministic DOM extraction, regenerated by fixtures.parity.ts (PW_PARITY_RECORD=1)',
    purpose:
      'Phase-4 bridge: scenario anchors and census comparisons cross this map. The gate decides the canonical comparison mode (mapped master diff vs document-agnostic standing asserts); both are executable against these artifacts.',
    headingLevelClamp: { from: 7, to: 6, reason: 'synthetic schema heading levels are HTML h1..h6' },
    mapping: MAPPING,
    expectMissing: EXPECT_MISSING,
    anchorMap,
    counts: { mockup: ex.counts, fixture: counts },
  };

  // ── Mapping arithmetic: the generated counts must equal the map ──────
  const m = ex.counts;
  expect(counts.section, 'one fixture section per clause').toBe(m.clause);
  expect(counts.heading, 'one fixture heading per clause').toBe(m.clause);
  expect(counts.image, 'images stand in for floats + equations').toBe((m.float ?? 0) + (m.equation ?? 0));
  expect(counts.quote, 'quotes stand in for admonitions').toBe(m.admonition ?? 0);
  expect(counts.code_block, 'code_blocks stand in for source blocks').toBe(m['src-block'] ?? 0);
  expect(
    counts.paragraph,
    'paragraphs = prose + floating titles + other + quote inner paragraphs',
  ).toBe((m.prose ?? 0) + (m['floating-title'] ?? 0) + (m.other ?? 0) + (m.admonition ?? 0));
  for (const cls of EXPECT_MISSING) {
    expect((m as Record<string, number>)[cls] ?? 0, `expectMissing class ${cls} actually occurs`).toBeGreaterThan(0);
  }

  // ── Every jump anchor in every scenario resolves through the map ─────
  const scenarios = fs
    .readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(SCENARIOS_DIR, f), 'utf8')) as Scenario);
  for (const s of scenarios) {
    for (const step of s.steps) {
      if (step.type === 'jump') {
        expect(
          anchorMap[step.anchor],
          `scenario "${s.name}" jumps to "${step.anchor}" — the anchor map must resolve it for the package side`,
        ).toBeDefined();
      }
    }
  }

  const docFile = path.join(FIXTURES_DIR, 'mn-doc.json');
  const mapFile = path.join(FIXTURES_DIR, 'substitution.json');
  if (RECORD) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    fs.writeFileSync(docFile, canonicalFile(doc));
    fs.writeFileSync(mapFile, canonicalFile(substitution));
    console.log(
      `parity-fixtures RECORDED sections=${counts.section} paragraphs=${counts.paragraph} images=${counts.image} quotes=${counts.quote} codeBlocks=${counts.code_block} anchors=${Object.keys(anchorMap).length}`,
    );
    return;
  }
  for (const [file, value] of [
    [docFile, doc],
    [mapFile, substitution],
  ] as const) {
    if (!fs.existsSync(file)) {
      throw new Error(`no recorded fixture ${file} — run with PW_PARITY_RECORD=1 first`);
    }
    const recorded = fs.readFileSync(file, 'utf8');
    expect(
      recorded,
      `${path.basename(file)} matches regeneration from the frozen mock-up`,
    ).toBe(canonicalFile(value));
  }
  console.log(`parity-fixtures VERIFIED sections=${counts.section} anchors=${Object.keys(anchorMap).length}`);
});
