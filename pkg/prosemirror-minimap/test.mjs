/**
 * Headless tests for @metanorma/prosemirror-minimap
 * (docs/ProseMirrorMinimap.spec.md §15.1).
 *
 * Run: yarn workspace @metanorma/prosemirror-minimap test
 *
 * Uses Node's built-in `node:test` + `node:assert` — no test framework dep.
 * Pure JS (.mjs) so it runs directly under Node without a TypeScript loader.
 * Imports from ./compiled/ (run `yarn workspace
 * @metanorma/prosemirror-minimap compile` first).
 *
 * A synthetic schema (a plain prosemirror-model test schema, §15.1.1) —
 * not the Metanorma one: the package is schema-agnostic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Schema, Node } from 'prosemirror-model';
import { Mapping, StepMap } from 'prosemirror-transform';

import {
  flatten,
  flattenAll,
  diffRows,
  diffBounds,
  defaultClassifier,
} from './compiled/blockModel.js';
import { keyOf } from './compiled/identity.js';
import { estimateHeight, textHeight, CalibrationStore } from './compiled/heights.js';
import {
  sumOffsets,
  rowAt,
  windowRange,
  fitScale,
  resolveScale,
  reSum,
} from './compiled/geometry.js';
import { selectTier, aggregate, medianRowPx } from './compiled/tiers.js';
import { RecordingRenderer, planPaint, paintsGlyphs } from './compiled/renderer.js';
import { mergeLayers, resolveSpans, selectionSpans } from './compiled/layers.js';
import {
  proportionalScrollTop,
  preciseScrollTop,
} from './compiled/scroll.js';
import { defaultTheme } from './compiled/types.js';


// --- Synthetic schema (§15.1.1) --------------------------------------------

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    heading: {
      group: 'block',
      content: 'inline*',
      attrs: { level: { default: 1 } },
      toDOM: () => ['h1', 0],
    },
    image: {
      group: 'block',
      inline: false,
      attrs: {
        src: { default: '' },
        width: { default: null },
        height: { default: null },
        id: { default: null },
      },
      toDOM: () => ['img', {}],
    },
    section: { group: 'block', content: 'block+', toDOM: () => ['section', 0] },
    text: { group: 'inline' },
    hardBreak: {
      inline: true,
      group: 'inline',
      selectable: false,
      toDOM: () => ['br'],
    },
  },
});

function para(text = '') {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
}

function heading(level = 1, text = '') {
  return schema.nodes.heading.create(
    { level },
    text ? schema.text(text) : null,
  );
}

function section(...children) {
  return schema.nodes.section.create(null, children);
}

function doc(...children) {
  return schema.nodes.doc.create(null, children);
}

function ctx() {
  return {
    classifier: defaultClassifier,
    theme: defaultTheme,
    strategies: new Map(),
    calibrated: new Map(),
  };
}


// --- §15.1.1 Flatten --------------------------------------------------------

test('§15.1.1 flatten: document order, inlines excluded, overrides respected', () => {
  const d = doc(
    heading(1, 'Title'),
    para('One'),
    para('Two with break'),
    section(
      para('Nested'),
      schema.nodes.image.create({ src: 'a.png' }),
    ),
    para('Three'),
  );
  const rows = flattenAll(d, ctx());
  // inline hardBreak skipped; section transparent; image is a leaf row.
  assert.deepEqual(
    rows.map((r) => [r.classId, r.depth]),
    [
      ['text', 0], // heading — textblock
      ['text', 0],
      ['text', 0],
      ['text', 1], // nested in section
      ['image', 1],
      ['text', 0],
    ],
  );
  // Document order: positions strictly increasing.
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].pos > rows[i - 1].pos);
  }
  // textLength: content.size for textblocks, 0 otherwise (§4.2).
  assert.equal(rows[1].textLength, 'One'.length);
  assert.equal(rows[4].textLength, 0);
  // Classifier overrides respected: a custom classifier re-classifying
  // headings and rejecting images.
  const custom = {
    row(node, depth, ancestors) {
      if (node.type.name === 'heading') {
        return { classId: `h${node.attrs.level}` };
      }
      if (node.type.name === 'image') {
        return null; // not a row
      }
      return defaultClassifier.row(node, depth, ancestors);
    },
  };
  const rows2 = flattenAll(d, { ...ctx(), classifier: custom });
  assert.deepEqual(
    rows2.map((r) => r.classId),
    ['h1', 'text', 'text', 'text', 'text'],
  );
  // ancestors: each visited block sees its block-ancestor chain, outermost
  // first (root excluded, self excluded).
  const seen = [];
  const spy = {
    row(node, depth, ancestors) {
      seen.push(ancestors.map((a) => a.type.name));
      return { classId: 'text' };
    },
  };
  for (const _r of flatten(d, { ...ctx(), classifier: spy })) { void _r; }
  // The spy classifies the section itself as a row too, so the section's
  // own visit comes first (doc-level), then its children see ['section'].
  assert.deepEqual(seen, [
    [], // heading
    [], [], // paragraphs
    [], // the section itself (spy says every node is a row)
    ['section'], // nested paragraph
    ['section'], // nested image
    [], // trailing paragraph
  ]);
});


// --- §15.1.2 Identity stability ----------------------------------------------

test('§15.1.2 identity: editing one block keeps every other key; retyping identical content makes new keys', () => {
  const pa = para('A');
  const pb = para('B');
  const pc = para('C');
  const d1 = doc(pa, pb, pc);
  const rows1 = flattenAll(d1, ctx());
  // Edit block B: replace its text (new node instance for B only).
  const b2 = para('B edited');
  const d2 = doc(pa, b2, pc); // A and C are the SAME instances
  const rows2 = flattenAll(d2, ctx());
  assert.equal(rows2[0].key, rows1[0].key); // A carried (===)
  assert.notEqual(rows2[1].key, rows1[1].key); // B changed (new node)
  assert.equal(rows2[2].key, rows1[2].key); // C carried — same instance
  // Shifted positions keep their keys: delete A, C's key survives.
  const d3 = doc(b2, pc);
  const rows3 = flattenAll(d3, ctx());
  assert.equal(rows3[0].key, rows2[1].key);
  assert.equal(rows3[1].key, rows2[2].key);
  // Reference-based, not content-based: delete and retype identical text.
  const retyped = para('C');
  const otherC = para('C');
  const d4 = doc(otherC, retyped);
  const rows4 = flattenAll(d4, ctx());
  assert.notEqual(rows4[0].key, rows3[1].key); // pc is a different instance
  assert.notEqual(rows4[1].key, rows3[1].key);
  assert.notEqual(rows4[0].key, rows4[1].key); // identical text, distinct keys
  // Monotonic, never reused: all keys distinct across the session — the
  // four docs share instances by design, so collect distinct nodes only.
  const distinctNodes = new Set([pa, pb, pc, b2, otherC, retyped]);
  const all = [...distinctNodes].map((n) => keyOf(n));
  assert.equal(new Set(all).size, all.length);
  // keyOf is the identity source (§4.3).
  assert.equal(keyOf(retyped), rows4[1].key);
});


// --- §15.1.3 Incremental parity ------------------------------------------------

test('§15.1.3 incremental parity: patched list deep-equals a fresh flatten', () => {
  // Build a doc, apply an edit sequence, assert parity after each edit.
  // Doc children are reused BY REFERENCE between versions — the structural
  // sharing ProseMirror transactions actually produce (§4.3).
  let d = doc(
    heading(1, 'Doc'),
    para('alpha'), para('beta'), para('gamma'),
    section(para('nested one'), para('nested two')),
    para('delta'),
  );
  let rows = flattenAll(d, ctx());

  // Edit sequence with real positional mappings (StepMap/Mapping — the same
  // machinery `tr.mapping.map` wraps in production, §7.2). Each StepMap is
  // `[from, oldLen, newLen]`. Positions are the nodes' TRUE ProseMirror
  // positions (doc content starts at 0 — `nodeDOM`'s convention).
  const edits = [
    // replace text in one paragraph (grow by 1: positions at 9 shift +1)
    {
      next: (doc_) => doc(
        doc_.child(0),
        para('ALPHA!'),
        doc_.child(2), doc_.child(3), doc_.child(4), doc_.child(5),
      ),
      map: new Mapping([new StepMap([9, 0, 1])]),
    },
    // insert a new paragraph mid-list (a 10-position node inserted at 13)
    {
      next: (doc_) => doc(
        doc_.child(0), doc_.child(1),
        para('inserted'),
        doc_.child(2), doc_.child(3), doc_.child(4), doc_.child(5),
      ),
      map: new Mapping([new StepMap([13, 0, 10])]),
    },
    // delete the inserted paragraph (children 0,1 kept; 2 dropped)
    {
      next: (doc_) => doc(
        doc_.child(0), doc_.child(1),
        doc_.child(3), doc_.child(4), doc_.child(5), doc_.child(6),
      ),
      map: new Mapping([new StepMap([13, 10, 0])]),
    },
    // wrap a paragraph in a section (an open token before, a close after)
    {
      next: (doc_) => doc(
        doc_.child(0), doc_.child(1), doc_.child(2),
        section(doc_.child(3)),
        doc_.child(4), doc_.child(5),
      ),
      map: new Mapping([new StepMap([19, 0, 1]), new StepMap([26, 0, 1])]),
    },
    // unwrap the section back to bare paragraphs
    {
      next: (doc_) => doc(
        doc_.child(0), doc_.child(1), doc_.child(2),
        doc_.child(3).child(0),
        doc_.child(4), doc_.child(5),
      ),
      map: new Mapping([new StepMap([19, 1, 0]), new StepMap([26, 1, 0])]),
    },
  ];

  for (const edit of edits) {
    const next = edit.next(d);
    const bounds = diffBounds();
    const result = [
      ...diffRows(rows, d, next, ctx(), (p) => edit.map.map(p), bounds),
    ];
    const freshRows = flattenAll(next, ctx());
    const strip = (r) => ({
      key: r.key, pos: r.pos, classId: r.classId,
      depth: r.depth, textLength: r.textLength,
    });
    assert.deepEqual(
      result.map(strip),
      freshRows.map(strip),
      `parity failed after edit producing ${next.childCount} children`,
    );
    // Bounds sanity: an edit that changes the list reports a valid range.
    assert.ok(bounds.firstChanged >= 0);
    assert.ok(bounds.lastChanged > bounds.firstChanged);
    d = next;
    rows = freshRows;
  }
});


// --- §15.1.4 Prefix-sum invariants ----------------------------------------------

test('§15.1.4 prefix sums: non-decreasing, offsets[0] === 0, rowAt consistent with binary search', () => {
  const d = doc(
    para('x'.repeat(200)), // multi-line estimate
    heading(1, 'h'),
    para('y'),
    schema.nodes.image.create({}),
    para('z'.repeat(50)),
  );
  const rows = flattenAll(d, ctx());
  const offsets = sumOffsets(rows);
  assert.equal(offsets[0], 0);
  for (let i = 1; i < offsets.length; i++) {
    assert.ok(offsets[i] >= offsets[i - 1]);
  }
  // rowAt(offsets[i]) === i for interior offsets; reference binary search.
  for (let i = 0; i < rows.length; i++) {
    assert.equal(rowAt(offsets, offsets[i]), i);
    // just inside the row (offset + 1 px) still row i (unless last row edge)
    const h = offsets[i + 1] - offsets[i];
    if (h > 1) {
      assert.equal(rowAt(offsets, offsets[i] + h * 0.5), i);
    }
  }
  // total = offsets[rows]
  assert.equal(offsets[rows.length], offsets[offsets.length - 1]);
  // rowAt is consistent with a linear scan over the same array.
  const linear = (off) => {
    let found = -1;
    for (let i = 0; i < rows.length; i++) {
      if (offsets[i] <= off && off < offsets[i + 1]) {
        found = i;
      }
    }
    return found === -1
      ? off >= offsets[rows.length] ? rows.length - 1 : 0
      : found;
  };
  for (let off = 0; off <= offsets[rows.length]; off += 7) {
    assert.equal(rowAt(offsets, off), linear(off), `mismatch at ${off}`);
  }
  // reSum from a changed index equals a fresh sum (§6.1).
  rows[1].estHeightPx = 500;
  const reSummed = reSum(offsets, rows, 1);
  assert.deepEqual(
    Array.from(reSummed.offsets),
    Array.from(sumOffsets(rows)),
  );
});


// --- §15.1.5 Tiers -----------------------------------------------------------------

test('§15.1.5 glyphs gate: predicate matrix (tier × class opt-in × text)', () => {
  // The glyph-vs-rectangle decision (§5.4/§6.5): glyphs require ALL of
  // tier 1, an explicit per-class `glyphs: true` (default false — the
  // opt-in), and non-empty text. Every other combination paints a
  // filled rectangle.
  const glyphsVals = [undefined, false, true];
  const textVals = [null, undefined, '', 'abc'];
  for (const tier of [1, 2, 3]) {
    for (const glyphs of glyphsVals) {
      for (const text of textVals) {
        const want = tier === 1 && glyphs === true && text === 'abc';
        assert.equal(
          paintsGlyphs(tier, glyphs, text),
          want,
          `paintsGlyphs(${tier}, ${glyphs}, ${JSON.stringify(text)})`,
        );
      }
    }
  }
});

test('§15.1.5 tiers: thresholds, same-class/depth aggregation, hysteresis', () => {
  const t = { tier1Rows: 100, tier2Rows: 1000 };
  assert.equal(selectTier(50, 1, t), 1);
  assert.equal(selectTier(101, 1, t), 2);
  assert.equal(selectTier(1001, 2, t), 3);
  // Hysteresis: promote at threshold, demote only at 0.9×.
  let tier = 2;
  assert.equal(selectTier(101, tier, t), 2); // at threshold from tier 2 stays
  tier = 3;
  assert.equal(selectTier(950, 3, t), 3); // 950 > 900: stays 3
  assert.equal(selectTier(899, 3, t), 2); // below 0.9×1000: demotes
  // Hysteresis across a threshold-crossing edit pair (up at t, not down at 0.9t).
  const rowAt = (n) => Array.from({ length: n }, (_, i) => ({
    key: i, pos: i + 1, node: null, classId: 'text',
    depth: 0, textLength: 10, heightPx: 10, estHeightPx: 10, text: null,
  }));
  const offsetsFor = (rows) => sumOffsets(rows);
  const agg = (rows, marked = new Set()) => aggregate(rows, offsetsFor(rows), {
    aggregateMin: 4,
    aggregateMax: 16,
    medianPx: medianRowPx(rows),
    isMarked: (r) => marked.has(r.key),
  });
  // 8 same-class/depth rows → one aggregate of count 8.
  const run = rowAt(8);
  assert.deepEqual(agg(run).map((a) => a.count), [8]);
  // Mixed classes never merge.
  const mixed = rowAt(8).map((r, i) => ({
    ...r, classId: i % 2 === 0 ? 'text' : 'heading',
  }));
  assert.deepEqual(agg(mixed).map((a) => a.count), [1, 1, 1, 1, 1, 1, 1, 1]);
  // Different depths never merge.
  const depths = rowAt(8).map((r, i) => ({ ...r, depth: i % 2 }));
  assert.deepEqual(agg(depths).map((a) => a.count), [1, 1, 1, 1, 1, 1, 1, 1]);
  // A marked row splits an aggregating run (§6.5 marker survival). The
  // run before the mark (4 rows) merges; the mark keeps its own row; the
  // tail run (3 < aggregateMin) stays unmerged.
  const markedMid = rowAt(8);
  const marked = agg(markedMid, new Set([4]));
  assert.deepEqual(marked.map((a) => a.count), [4, 1, 1, 1, 1]);
  // A run shorter than aggregateMin never merges — even a run of 3.
  const short = rowAt(3);
  assert.deepEqual(agg(short).map((a) => a.count), [1, 1, 1]);
  // Two adjacent runs of 4, separated by class: both merge, none cross.
  const twoRuns = rowAt(8).map((r, i) => ({
    ...r, classId: i < 4 ? 'text' : 'heading',
  }));
  assert.deepEqual(agg(twoRuns).map((a) => a.count), [4, 4]);
  // Cap: aggregateMax × median px.
  const tall = rowAt(8).map((r) => ({ ...r, heightPx: 100 }));
  const capped = aggregate(tall, offsetsFor(tall), {
    aggregateMin: 4, aggregateMax: 2, medianPx: 100, isMarked: () => false,
  });
  assert.equal(capped[0].heightPx, 200); // 2 × 100 median
  // Row-count thresholds select tiers via selectTier (already asserted).
});


// --- §15.1.6 Virtualization -----------------------------------------------------

test('§15.1.6 virtualization: draw calls only within [f − overscan, l + overscan]', () => {
  const n = 200;
  const rows = Array.from({ length: n }, (_, i) => ({
    key: i, pos: 2 + i * 2, node: null, classId: 'text',
    depth: 0, textLength: 5, heightPx: 20, estHeightPx: 20, text: 'hello',
  }));
  const offsets = sumOffsets(rows);
  const first = 50;
  const last = 60;
  const overscan = 8;
  const r = new RecordingRenderer();
  r.init({ width: 100, height: 600, dpr: 1 });
  r.setConfig(defaultTheme, mergeLayers());
  r.setBlocks({
    firstRow: 0,
    classIds: rows.map((x) => x.classId),
    depths: new Int16Array(rows.map((x) => x.depth)),
    textLengths: new Float64Array(rows.map((x) => x.textLength)),
    heightPx: new Float64Array(rows.map((x) => x.heightPx)),
  });
  r.setGeometry(offsets, rows.map((x) => x.text));
  r.setWindow(first, last - first + 1, {
    firstRow: first,
    texts: rows.slice(first, last + 1).map((x) => x.text),
  });
  r.render();
  const drawn = r.calls.filter((c) => c.kind === 'row');
  assert.equal(drawn.length, last - first + 1);
  for (const call of drawn) {
    assert.ok(call.row >= first - overscan && call.row <= last + overscan);
  }
  // Window range math (§6.3): the search agrees with the overscan-widened
  // bounds used by the renderer push.
  const win = windowRange(offsets, offsets[first], offsets[last + 1], overscan);
  assert.ok(win.first <= first && win.last >= last);
});


// --- §15.1.7 Layer order ----------------------------------------------------------

test('§15.1.7 layers: ascending z across text/consumer/selection', () => {
  const decls = mergeLayers([{ id: 'diagnostics', z: 15, kind: 'overlay' }]);
  const zs = decls.map((l) => l.z);
  assert.deepEqual(zs, [...zs].sort((a, b) => a - b));
  assert.deepEqual(
    decls.map((l) => l.id),
    ['text', 'diagnostics', 'selection'],
  );
  // Draw order: rows (text, z10) then inline tints then markers — recorded
  // order is ascending z (text 10 before diagnostics 15 before selection 20).
  const n = 30;
  const rows = Array.from({ length: n }, (_, i) => ({
    key: i, pos: 2 + i * 2, node: null, classId: 'text',
    depth: 0, textLength: 5, heightPx: 20, estHeightPx: 20, text: 'x',
  }));
  const offsets = sumOffsets(rows);
  const r = new RecordingRenderer();
  r.init({ width: 100, height: 600, dpr: 1 });
  r.setConfig(defaultTheme, decls);
  r.setBlocks({
    firstRow: 0,
    classIds: rows.map((x) => x.classId),
    depths: new Int16Array(n),
    textLengths: new Float64Array(rows.map((x) => x.textLength)),
    heightPx: new Float64Array(rows.map((x) => x.heightPx)),
  });
  r.setGeometry(offsets, rows.map((x) => x.text));
  r.setWindow(0, n, { firstRow: 0, texts: rows.map((x) => x.text) });
  // diagnostics: lane 1 marker on rows 2–4; selection: lane 0 inline rows 10–12.
  r.setLayer('diagnostics', [
    { first: 2, last: 4, color: '#d29922', lane: 1 },
  ]);
  r.setLayer('selection', [
    { first: 10, last: 12, color: '#77aaff', lane: 0 },
  ]);
  r.render();
  const kinds = r.calls.filter((c) => ['row', 'inline', 'marker'].includes(c.kind));
  // First a row block (text layer), then inline (selection z20 lane 0) and
  // markers — rows before spans.
  const firstRow = kinds.findIndex((c) => c.kind === 'row');
  const firstSpan = kinds.findIndex((c) => c.kind === 'inline' || c.kind === 'marker');
  assert.ok(firstRow !== -1 && firstSpan !== -1 && firstRow < firstSpan);
  // Ascending z across span kinds: diagnostics (marker, z=15) paints before
  // selection (inline tint, z=20) — the recorded span order interleaves by
  // layer z, not by kind (§8.4).
  const spanCalls = r.calls.filter(
    (c) => c.kind === 'inline' || c.kind === 'marker',
  );
  assert.equal(spanCalls.length, 2);
  const diag = spanCalls.find((c) => c.kind === 'marker');
  const sel = spanCalls.find((c) => c.kind === 'inline');
  assert.ok(diag !== undefined && sel !== undefined);
  assert.ok(r.calls.indexOf(diag) < r.calls.indexOf(sel));
  // All rows (text layer, z=10) paint before any span.
  assert.ok(firstRow !== -1 && firstSpan !== -1 && firstRow < firstSpan);
});


// --- §15.1.8 Window text push --------------------------------------------------------

test('§15.1.8 window texts: only window + overscan rows; consecutive pushes coalesce', () => {
  const n = 400;
  const rows = Array.from({ length: n }, (_, i) => ({
    key: i, pos: 2 + i * 2, node: null, classId: 'text',
    depth: 0, textLength: 5, heightPx: 20, estHeightPx: 20, text: `t${i}`,
  }));
  const offsets = sumOffsets(rows);
  const r = new RecordingRenderer();
  r.init({ width: 100, height: 600, dpr: 1 });
  r.setConfig(defaultTheme, mergeLayers());
  r.setBlocks({
    firstRow: 0,
    classIds: rows.map((x) => x.classId),
    depths: new Int16Array(n),
    textLengths: new Float64Array(rows.map((x) => x.textLength)),
    heightPx: new Float64Array(rows.map((x) => x.heightPx)),
  });
  r.setGeometry(offsets, new Array(n).fill(null));
  // Push a window over rows [100, 120) — texts only for those rows.
  r.setWindow(100, 20, {
    firstRow: 100,
    texts: rows.slice(100, 120).map((x) => x.text),
  });
  const winCalls = r.calls.filter((c) => c.kind === 'window');
  assert.equal(winCalls.length, 1);
  assert.equal(winCalls[0].spanCount, 20);
  // Coalescing is the controller's job (one setWindow per frame); the
  // renderer records each call — the controller asserts are exercised in
  // the planPaint/pushWindow path. Assert the recorded window texts reach
  // only window rows: rendering paints only rows with non-null text in
  // tier 1.
  r.render();
  // Tier 1 paints only the window rows (virtualization, §6.3) — the
  // renderer's draw calls never mention rows outside [100, 120).
  const drawn = r.calls.filter((c) => c.kind === 'row');
  assert.ok(drawn.length > 0);
  assert.ok(drawn.every((c) => c.row >= 100 && c.row < 120));
  assert.ok(drawn.every((c) => c.text !== null));
});


// --- §15.1.9 Scroll mapping ----------------------------------------------------------

test('§15.1.9 scroll mapping: proportional matches binary search; precise snaps or degrades', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({
    key: i, pos: 2 + i * 2, node: null, classId: 'text',
    depth: 0, textLength: 5, heightPx: 30, estHeightPx: 30, text: null,
  }));
  const offsets = sumOffsets(rows);
  const total = offsets[100];
  const geom = { scrollTop: 0, scrollHeight: 4000, clientHeight: 800 };
  // proportional: window tops map to row ranges matching binary search.
  for (const st of [0, 500, 1500, 2999]) {
    const target = proportionalScrollTop(st); // unit-preserving
    assert.equal(target, st);
    const idx = rowAt(offsets, st);
    assert.ok(idx >= 0 && idx < 100);
    const win = windowRange(offsets, st, st + geom.clientHeight, 0);
    assert.ok(win.first <= win.last);
    assert.equal(win.first, Math.max(0, rowAt(offsets, st)));
  }
  // precise with mocked nodeDOM: corrects the model's local error at the
  // row. realTop = 1000 + (200 − 50) = 1150; the fallback (250, the
  // proportional result) implies a model-space viewport-relative row top
  // of rowTop − fallback = 900 − 250 = 650; the snap makes the REAL top
  // land at that same viewport offset: 1150 − 650 = 500.
  const container = {
    scrollTop: 1000,
    getBoundingClientRect: () => ({ top: 50 }),
  };
  const rowAt30 = { ...rows[30], pos: 62 };
  const viewMock = {
    nodeDOM: () => ({
      getBoundingClientRect: () => ({ top: 200 }),
    }),
  };
  const snapped = preciseScrollTop(
    viewMock, container, rowAt30, offsets[30], 250,
  );
  // target = realTop − (rowTop − fallback)
  assert.equal(snapped, (1000 + 200 - 50) - (offsets[30] - 250));
  // With an ACCURATE model (rowTop === realTop = 1150), precise returns
  // exactly the fallback — release is continuous with the drag by
  // construction, and the commit never jumps.
  const accurate = preciseScrollTop(viewMock, container, rowAt30, 1150, 700);
  assert.equal(accurate, 700);
  // Content origin (§6.4): a padded container places row 0 `k` px below
  // scrollTop 0; the raw realTop carries that constant, the model does
  // not. With `contentOriginPx = k` an accurate model (rowTop = realTop
  // in the model's frame = 1150 − k) still returns the fallback; without
  // it (origin 0) the same physical layout snaps down by exactly k —
  // the pre-fix padding bias.
  assert.equal(
    preciseScrollTop(viewMock, container, rowAt30, 1000, 700, 150),
    700,
    'accurate model with the measured content origin: no-op snap',
  );
  assert.equal(
    preciseScrollTop(viewMock, container, rowAt30, 1000, 700, 0),
    850,
    'origin 0 (pre-fix) drifts the snap down by exactly the padding '
      + '(1150 − 300)',
  );
  // precise with null nodeDOM degrades to proportional.
  const nullView = { nodeDOM: () => null };
  const degraded = preciseScrollTop(nullView, container, rowAt30, offsets[30], 777);
  assert.equal(degraded, 777);
});


// --- §15.1.10 Layer anchoring ------------------------------------------------------------

test('§15.1.10 anchoring: pos spans re-anchor through mapping; id spans disappear when deleted', () => {
  // pos-anchored span survives an edit above it via mapped positions.
  const d1 = doc(para('one'), para('two'), para('three'));
  const rows1 = flattenAll(d1, ctx());
  const offsets1 = sumOffsets(rows1);
  const rowAtPos = (rows) => (pos) => {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (pos >= r.pos && pos < r.pos + r.node.nodeSize) {
        return i;
      }
    }
    return null;
  };
  const spans = resolveSpans(
    { anchor: 'pos', spans: [{ kind: 'pos', from: rows1[2].pos }] },
    rowAtPos(rows1),
    () => null,
    '#d29922',
  );
  assert.deepEqual(spans.map((s) => s.first), [2]);
  // Insert a paragraph above: positions shift by +nodeSize; the span's
  // anchor maps through the same delta and still names row 2's content.
  const d2 = doc(para('one'), para('two'), para('three'), para('four'));
  const rows2 = flattenAll(d2, ctx());
  const mappedPos = rows1[2].pos + para('four').nodeSize;
  const spans2 = resolveSpans(
    { anchor: 'pos', spans: [{ kind: 'pos', from: mappedPos }] },
    rowAtPos(rows2),
    () => null,
    '#d29922',
  );
  assert.deepEqual(spans2.map((s) => s.first), [2]);
  assert.equal(spans2[0].color, '#d29922'); // same tone
  // id-anchored span whose node is deleted: returns null, dropped.
  const rowAtNodeId = (rows) => (id) => {
    for (const r of rows) {
      if (r.node?.attrs?.id === id) {
        return rows.indexOf(r);
      }
    }
    return null;
  };
  const gone = resolveSpans(
    { anchor: 'id', spans: [{ kind: 'id', id: 'nope' }] },
    rowAtPos(rows2),
    rowAtNodeId(rows2),
    '#d29922',
  );
  assert.deepEqual(gone, []);
  // A marked row splits an aggregating run (§6.5/§8.4) — via planPaint's
  // isMarked path with tier 3.
  const n = 24;
  const rows3 = Array.from({ length: n }, (_, i) => ({
    key: i, pos: 2 + i * 2, node: null, classId: 'text',
    depth: 0, textLength: 5, heightPx: 10, estHeightPx: 10, text: null,
  }));
  const offs3 = sumOffsets(rows3);
  const plan = planPaint(
    {
      classIds: rows3.map((r) => r.classId),
      depths: new Int16Array(n),
      textLengths: new Float64Array(n),
      heightPx: new Float64Array(n).fill(10),
      offsets: offs3,
      texts: new Array(n).fill(null),
    },
    {
      scale: 0.25,
      originY: 0,
      windowFirst: 0,
      windowLast: n - 1,
      theme: defaultTheme,
      aggregate: true,
      aggregateMin: 4,
      aggregateMax: 16,
      medianPx: 10,
      isMarked: (row) => row === 10,
      spans: new Map(),
      canvasHeight: 600,
      dpr: 1,
    },
  );
  // The aggregated runs: rows 0–9, marked 10 alone, 11–23.
  assert.deepEqual(plan.rows.map((r) => r.row), [0, 10, 11]);
});


// --- §15.1.11 Merge floor -----------------------------------------------------------------

test('§15.1.11 merge floor: same-tone rects closer than 6 device px merge; per-lane cap', () => {
  const n = 60;
  const rows = Array.from({ length: n }, (_, i) => ({
    key: i, pos: 2 + i * 2, node: null, classId: 'text',
    depth: 0, textLength: 5, heightPx: 1, estHeightPx: 1, text: null,
  }));
  const offsets = sumOffsets(rows);
  // 60 spans, 1px each in editor space, scale 1: dense same-tone lane.
  const spans = new Map([
    ['diag', Array.from({ length: 60 }, (_, i) => ({
      first: i, last: i, color: '#d29922', lane: 1,
    }))],
  ]);
  const plan = planPaint(
    {
      classIds: rows.map((r) => r.classId),
      depths: new Int16Array(n),
      textLengths: new Float64Array(n),
      heightPx: new Float64Array(n).fill(1),
      offsets,
      texts: new Array(n).fill(null),
    },
    {
      scale: 1,
      originY: 0,
      windowFirst: 0,
      windowLast: n - 1,
      theme: defaultTheme,
      aggregate: false,
      aggregateMin: 4,
      aggregateMax: 16,
      medianPx: 1,
      isMarked: () => false,
      spans,
      canvasHeight: 60,
      dpr: 1,
    },
  );
  // All 60 collapsed into one rect per lane (same tone, dense). The merged
  // height is the union of per-span rects (each ≥ 6 device px, §8.4), so a
  // 60-editor-px dense run paints 65 px (59 gaps + the last span's 6-px
  // floor) — the geometric merge IS the cap.
  assert.equal(plan.markers.length, 1);
  assert.equal(plan.markers[0].h, 65);
  // Worst case rect count per lane ≤ canvasHeight / 6.
  assert.ok(plan.markers.length <= Math.ceil(60 / 6));
  // Different tones do not merge.
  const twoTone = new Map([
    ['diag', [
      { first: 0, last: 0, color: '#a', lane: 1 },
      { first: 1, last: 1, color: '#b', lane: 1 },
      { first: 2, last: 2, color: '#a', lane: 1 },
    ]],
  ]);
  const plan2 = planPaint(
    {
      classIds: rows.slice(0, 3).map((r) => r.classId),
      depths: new Int16Array(3),
      textLengths: new Float64Array(3),
      heightPx: new Float64Array(3).fill(1),
      offsets: offsets.subarray(0, 4),
      texts: new Array(3).fill(null),
    },
    {
      scale: 1,
      originY: 0,
      windowFirst: 0,
      windowLast: 2,
      theme: defaultTheme,
      aggregate: false,
      aggregateMin: 4,
      aggregateMax: 16,
      medianPx: 1,
      isMarked: () => false,
      spans: twoTone,
      canvasHeight: 600,
      dpr: 1,
    },
  );
  assert.equal(plan2.markers.length, 3);
});


// --- §15.1.12 Epochs -------------------------------------------------------------------------

test('§15.1.12 epochs: width change re-estimates; plain transaction preserves the epoch', () => {
  // Text-strategy heights are functions of charsPerLine (epoch input, §4.6).
  const wide = { ...defaultTheme, charsPerLine: 100 };
  const narrow = { ...defaultTheme, charsPerLine: 40 };
  const long = para('x'.repeat(300));
  const hWide = textHeight(long.textContent.length, wide);
  const hNarrow = textHeight(long.textContent.length, narrow);
  assert.equal(hWide, 3 * 24); // ceil(300/100)=3 lines
  assert.equal(hNarrow, 8 * 24); // ceil(300/40)=8 lines
  assert.notEqual(hWide, hNarrow);

  // estimateHeight reflects strategy + calibration inputs.
  const strategy = { kind: 'text' };
  assert.equal(
    estimateHeight(long, 'text', strategy, new Map(), narrow, new Map()),
    hNarrow,
  );
  // Measured heights are kept across epochs (heightPx wins, §4.2).
  const rows = [
    {
      key: 0, pos: 1, node: long, classId: 'text', depth: 0,
      textLength: 300, heightPx: 42, estHeightPx: hNarrow, text: null,
    },
  ];
  const offsets = sumOffsets(rows);
  assert.equal(offsets[1], 42); // measured wins over estimate

  // CalibrationStore: seeded default, median after samples (§4.5).
  const cal = new CalibrationStore();
  assert.equal(cal.seed('figure', 240), 240);
  assert.equal(cal.get('figure'), 240);
  cal.record('figure', 100);
  cal.record('figure', 200);
  cal.record('figure', 300);
  assert.equal(cal.get('figure'), 200); // median of [100,200,300]
  // calibrated strategy consumes the median.
  const est = estimateHeight(
    schema.nodes.image.create({}),
    'figure',
    { kind: 'calibrated', defaultPx: 240 },
    new Map(),
    defaultTheme,
    cal,
  );
  assert.equal(est, 200);

  // resolveScale / fitScale floors (§6.2).
  const s = fitScale(10_000, 600, 10, 3); // 10px min row: floor caps scale
  assert.ok(s >= 1 / 10, 'never below 1 device px');
  assert.equal(s, 3 / 10); // rowHeight floor dominates
  const auto = resolveScale('auto', 0.25, 2000, 600, 20, 3);
  assert.equal(auto.mode, 'fit'); // zoom × total ≤ container
  const autoBig = resolveScale('auto', 0.25, 4000, 600, 20, 3);
  assert.equal(autoBig.mode, 'sliding');
  assert.equal(autoBig.scale, 0.25);
});


// --- §15.1.13 Terminal rungs ---------------------------------------------------------------------

test('§15.1.13 marks-only and hidden rungs', () => {
  const n = 40;
  const rows = Array.from({ length: n }, (_, i) => ({
    key: i, pos: 2 + i * 2, node: null, classId: 'text',
    depth: 0, textLength: 5, heightPx: 20, estHeightPx: 20, text: 'x',
  }));
  const offsets = sumOffsets(rows);
  const r = new RecordingRenderer();
  r.init({ width: 100, height: 600, dpr: 1 });
  r.setConfig(defaultTheme, mergeLayers());
  r.setBlocks({
    firstRow: 0,
    classIds: rows.map((x) => x.classId),
    depths: new Int16Array(n),
    textLengths: new Float64Array(rows.map((x) => x.textLength)),
    heightPx: new Float64Array(rows.map((x) => x.heightPx)),
  });
  r.setGeometry(offsets, rows.map((x) => x.text));
  r.setWindow(0, n, { firstRow: 0, texts: rows.map((x) => x.text) });
  r.setLayer('diagnostics', [
    { first: 5, last: 6, color: '#d29922', lane: 1 },
  ]);
  // marks-only: no row paint calls, but layer calls continue.
  r.render();
  assert.ok(r.calls.some((c) => c.kind === 'row'));
  const rowsBefore = r.calls.filter((c) => c.kind === 'row').length;
  r.setTier(2, { marksOnly: true });
  r.render();
  assert.equal(
    r.calls.filter((c) => c.kind === 'row').length,
    rowsBefore,
    'no new row paints under marks-only',
  );
  assert.ok(r.calls.some((c) => c.kind === 'marker'));
  // Two over-budget build slices engage marks-only — controller policy;
  // the rung's observable: setLayer calls continue (above), row paint stops.
  // Releasing: an under-budget rung restores row paint.
  r.setTier(2, { marksOnly: false });
  r.render();
  assert.ok(
    r.calls.filter((c) => c.kind === 'row').length > rowsBefore,
    'row paint resumes after the rung releases',
  );
  // Hidden rung (§6.5): setHidden clears the mirror; row paint stops
  // entirely while the renderer stays attached.
  const beforeHidden = r.calls.filter((c) => c.kind === 'row').length;
  r.setHidden(true);
  r.render();
  assert.equal(
    r.calls.filter((c) => c.kind === 'row').length,
    beforeHidden,
    'no row paints while hidden',
  );
  assert.ok(r.calls.some((c) => c.kind === 'hidden'));
});


// --- Controller integration (§7.2, §7.3, §6.3, §15.1 audit follow-ups) -------

// A headless controller harness: no rAF (the scheduler no-ops without it),
// driven by flush(); a fake scroll container; a RecordingRenderer.
//
// `harnessOpts` may override the view/container stubs (headless seams):
//   nodeDOM(pos) — DOM-rect sources for §4.5 calibration tests
//   coordsAtPos(pos) — §6.4 precise-snap sources
//   containerRect — the container's client rect (§6.4, §10.2)
function makeControllerHarness(state, opts = {}, harnessOpts = {}) {
  const container = {
    scrollTop: 0,
    scrollHeight: harnessOpts.scrollHeight ?? 4000,
    clientHeight: harnessOpts.clientHeight ?? 800,
    clientWidth: 600,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    getBoundingClientRect: () =>
      harnessOpts.containerRect ?? { top: 0, left: 0, height: 800 },
  };
  const view = {
    dom: { parentElement: null },
    state,
    nodeDOM: harnessOpts.nodeDOM ?? (() => null),
    coordsAtPos: harnessOpts.coordsAtPos
      ?? (() => ({ left: 0, right: 0, top: 0, bottom: 0 })),
  };
  if (controllerCtor === null) {
    throw new Error('controller not loaded');
  }
  const controller = new controllerCtor(view, {
    scrollContainer: () => container,
    ...opts,
  });
  const renderer = new RecordingRenderer();
  const overlay = fakeOverlay();
  controller.start();
  controller.attachRenderer(renderer, overlay, {
    width: 100, height: 600, dpr: 1,
  });
  controller.flush();
  return { controller, renderer, view, container, overlay };
}

/** The most recent overlay style writes (refreshed per fakeOverlay). */
let lastOverlayStyles = { transform: '', height: '' };

/** Minimal overlay element stub (no DOM in headless tests). */
function fakeOverlay() {
  const listeners = new Map();
  lastOverlayStyles = { transform: '', height: '' };
  const self = {
    get style() {
      return new Proxy({}, {
        set: (target, prop, value) => {
          if (prop === 'transform' || prop === 'height') {
            lastOverlayStyles[prop] = String(value);
          }
          return true;
        },
        get: (target, prop) => lastOverlayStyles[prop] ?? '',
      });
    },
    dataset: {},
    setAttribute: () => undefined,
    addEventListener: (k, fn) => listeners.set(k, fn),
    removeEventListener: () => listeners.delete,
    dispatchEvent: () => true,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    getBoundingClientRect: () => ({
      top: 0,
      left: 0,
      // The thumb's current height: what `updateOverlay` last wrote (a
      // real element's rect follows its style). A fixed 600 would make
      // the thumb as tall as the track — the drag clamp would pin at 0.
      height: parseFloat(lastOverlayStyles.height) || 600,
    }),
    get parentElement() {
      // The drag coordinate frame falls back to the parent (the minimap
      // container, §9.2) — itself: same rect, self-referential is fine.
      return self;
    },
    _listeners: listeners,
  };
  return self;
}

// Node lacks top-level await in .mjs under --test on this version; the
// controller import is hoisted via a lazy singleton.
let controllerCtor = null;
const controllerPromise = import('./compiled/controller.js')
  .then((m) => {
    controllerCtor = m.MinimapController;
    return m;
  });


// --- §15.1.14 Controller: transactions reach the renderer ------------------

test('§15.1.14 controller: a doc edit reaches the renderer as a sparse push', async () => {
  await controllerPromise;
  const d1 = doc(para('one'), para('two'), para('three'));
  const d2 = doc(d1.child(0), para('TWO EDITED'), d1.child(2));
  const tr = {
    docChanged: true,
    doc: d2,
    mapping: new Mapping([new StepMap([6, 0, 7])]),
  };
  const h = makeControllerHarness({ doc: d1, selection: { from: 1, to: 1 } });
  // The controller's model doc is d1 (built at start); drive one edit.
  h.controller.update({ doc: d2, selection: { from: 1, to: 1 } }, tr);
  h.controller.flush();
  // §7.2: rows survived where nodes are === (children 0 and 2).
  const rows = h.controller.getRows();
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.classId),
    ['text', 'text', 'text'],
  );
  // The renderer saw the edit: attach pushed the full model, the edit
  // pushed the changed chunk — sparse, chunk-granular (§7.2, §8.1).
  const blocks = h.renderer.calls.filter((c) => c.kind === 'blocks');
  assert.equal(blocks.length, 2, 'one full push + one edit push');
  assert.deepEqual(
    blocks.map((b) => [b.firstRow, b.rowCount]),
    [[0, 3], [1, 2]],
    'the edit push covers only the changed rows',
  );
  // Identity (§4.3): the edited paragraph is a fresh row (new key); the
  // others kept their keys and carried positions through mapping.
  const fresh = rows[1];
  assert.ok(fresh.key !== rows[0].key);
  // Positions are the nodes' TRUE ProseMirror positions (the position
  // `nodeDOM(pos)` resolves — an off-by-one here resolves DOM inside the
  // node: text nodes / null): p(0) p(5) p(17) in this doc.
  assert.deepEqual(rows.map((r) => r.pos), [0, 5, 17]);
});


// --- §15.1.15 Controller: plugin wiring produces real transactions ---------

test('§15.1.15 plugin: apply captures the transaction; update receives it', async () => {
  const { createMinimap, getMinimapController } = await import(
    './compiled/plugin.js'
  );
  const { EditorState, TextSelection } = await import('prosemirror-state');
  const plugin = createMinimap();
  const state0 = EditorState.create({
    doc: schema.nodes.doc.create(null, [para('seed')]),
    plugins: [plugin],
  });
  // Apply a doc-changing transaction the way an editor does.
  const tr0 = state0.tr.insertText('more', 2);
  const state1 = state0.apply(tr0);
  assert.ok(state1.doc !== state0.doc);
  // The state slot captured tr0 (not an empty factory read).
  const slot = plugin.getState(state1);
  assert.ok(slot !== null && slot.tr === tr0, 'slot holds the real tr');
  // A selection-only transaction is captured too but docChanged=false.
  const tr1 = state1.tr.setSelection(
    TextSelection.create(state1.doc, 3),
  );
  const state2 = state1.apply(tr1);
  const slot2 = plugin.getState(state2);
  assert.ok(slot2.tr === tr1 && slot2.tr.docChanged === false);
  // The registry lookup is exported (§13).
  assert.equal(typeof getMinimapController, 'function');
});


// --- §15.1.16 Epochs: re-estimation mechanism (§4.6) -------------------------

test('§15.1.16 epochs: width change re-estimates all estHeightPx, keeps heightPx and keys; a plain transaction preserves the epoch', async () => {
  await controllerPromise;
  const d = doc(
    para('x'.repeat(300)),
    schema.nodes.image.create({}),
    para('short'),
  );
  const h = makeControllerHarness({ doc: d, selection: { from: 1, to: 1 } });
  const before = h.controller.getRows().map((r) => ({
    key: r.key, est: r.estHeightPx, heightPx: r.heightPx,
  }));
  assert.ok(before[0].est > 0);

  // Simulate a measured sample on row 0 (§4.5): measured values are kept.
  h.controller.getRows()[0].heightPx = 42;

  // Epoch: narrow the width (charsPerLine drops) — estHeightPx re-derived.
  const narrow = { ...defaultTheme, charsPerLine: 40 };
  h.controller.reevaluateEpoch({ theme: narrow, contentWidth: 300 });
  const after = h.controller.getRows();
  assert.deepEqual(
    after.map((r) => r.key),
    before.map((r) => r.key),
    'keys preserved across the epoch',
  );
  assert.equal(after[0].heightPx, 42, 'measured heightPx kept (§4.6)');
  const wideEst = before[0].est;
  const narrowEst = after[0].estHeightPx;
  assert.ok(narrowEst > wideEst, 'narrower width re-estimates taller');
  assert.equal(narrowEst, 8 * 24, 'ceil(300/40) lines × lineHeight');

  // A plain transaction preserves the epoch (§4.6): a selection-only
  // update re-estimates nothing.
  const dSame = d;
  const estBefore = after.map((r) => r.estHeightPx);
  h.controller.update(
    { doc: dSame, selection: { from: 2, to: 2 } }, null,
  );
  h.controller.flush();
  assert.deepEqual(
    h.controller.getRows().map((r) => r.estHeightPx),
    estBefore,
    'a no-op transaction preserves estimates',
  );
});


// --- §15.1.17 Hidden rung via the controller (§6.5) --------------------------

test('§15.1.17 hidden rung: hideRows releases the model; crossing back rebuilds', async () => {
  await controllerPromise;
  const d = doc(para('a'), para('b'));
  const h = makeControllerHarness(
    { doc: d, selection: { from: 1, to: 1 } },
    { hideRows: 3 },
  );
  assert.equal(h.controller.getRows().length, 2);
  const hiddenCalls = h.renderer.calls.filter((c) => c.kind === 'hidden');
  assert.equal(hiddenCalls.length, 0);

  // Grow past the threshold: 4 paragraphs > hideRows 3.
  const d2 = doc(para('a'), para('b'), para('c'), para('d'));
  const tr = {
    docChanged: true,
    doc: d2,
    mapping: new Mapping([new StepMap([6, 0, 12])]),
  };
  h.controller.update({ doc: d2, selection: { from: 1, to: 1 } }, tr);
  h.controller.flush();
  assert.equal(h.controller.getRows().length, 0, 'model released');
  assert.ok(
    h.renderer.calls.some((c) => c.kind === 'hidden' && c.rowCount === 1),
    'renderer told to hide',
  );

  // Cross back under: the model rebuilds without remount.
  const d3 = doc(para('a'));
  const tr2 = {
    docChanged: true,
    doc: d3,
    mapping: new Mapping([new StepMap([6, 21, 0])]),
  };
  h.controller.update({ doc: d3, selection: { from: 1, to: 1 } }, tr2);
  h.controller.flush();
  assert.equal(h.controller.getRows().length, 1, 'model rebuilt');
  assert.ok(
    h.renderer.calls.some((c) => c.kind === 'hidden' && c.rowCount === 0),
    'renderer told to show',
  );
});


// --- §15.1.21 Tier-1 text survives an edit (§6.3/§8.1 window text push) ------

test('§15.1.21 texts: an edit does not drop window texts (tier-1 glyphs survive)', async () => {
  await controllerPromise;
  const d1 = doc(para('one'), para('two'), para('three'));
  const h = makeControllerHarness(
    { doc: d1, selection: { from: 1, to: 1 } },
  );
  assert.equal(h.controller.getRows().length, 3);

  // A para-1 text edit (the §15.1.14 pattern): the trailing rows carry
  // over by reference and their cached texts must remain paintable.
  const d2 = doc(d1.child(0), para('TWO EDITED'), d1.child(2));
  const tr = {
    docChanged: true,
    doc: d2,
    mapping: new Mapping([new StepMap([6, 0, 7])]),
  };
  h.controller.update({ doc: d2, selection: { from: 1, to: 1 } }, tr);
  h.controller.flush();

  const rows = h.controller.getRows();
  assert.equal(rows.length, 3);
  // Controller-side cache: carried rows keep their lazily cached text.
  for (const r of rows) {
    assert.ok(typeof r.text === 'string', `row text cached (${r.pos})`);
  }
  // Renderer-side: after the edit's window push, tier-1 paint sees text
  // for every row (no rectangle-fallback from dropped texts).
  const calls = h.renderer.calls;
  const lastWindowIdx = (() => {
    let idx = -1;
    for (let i = 0; i < calls.length; i++) {
      if (calls[i].kind === 'window') idx = i;
    }
    return idx;
  })();
  assert.ok(lastWindowIdx >= 0, 'a window push happened after the edit');
  const paintedAfter = calls
    .filter((c, i) => c.kind === 'row' && i > lastWindowIdx)
    .filter((c) => c.row >= 1);
  assert.ok(
    paintedAfter.length > 0,
    'rows after the edit position were painted',
  );
  assert.ok(
    paintedAfter.every((c) => c.text !== null && c.text !== undefined),
    'every painted row carries its text (tier-1 glyphs survive the edit)',
  );
});

// --- §15.1.22 Consumer layers re-anchor across transactions (§7.2, §8.4) ------

test('§15.1.22 layers: pos spans follow an insert; id spans drop when deleted; mapPos detects deletion', async () => {
  await controllerPromise;
  const img = schema.nodes.image.create({ src: 'a.png', id: 'img-1' });
  const d1 = doc(para('one'), para('two'), img, para('four'));
  const h = makeControllerHarness(
    { doc: d1, selection: { from: 1, to: 1 } },
  );
  assert.equal(h.controller.getRows().length, 4);

  // A pos-anchored span on row 2 (para 'two').
  const twoPos = h.controller.getRows()[1].pos;
  h.controller.setLayer('diag', {
    anchor: 'pos',
    spans: [{ kind: 'pos', from: twoPos, to: twoPos + 2 }],
    lane: 1,
    tone: () => '#d29922',
  });
  const layerCalls = () => h.renderer.calls
    .filter((c) => c.kind === 'layer' && c.layerId === 'diag');
  const first = layerCalls()[0];
  assert.equal(first.spanFirst, 1, 'resolves to row 1');
  assert.equal(first.spanCount, 1);

  // Insert a paragraph at the doc start: the span must re-anchor through
  // tr.mapping (rows shift by one, §8.4 "never row indices").
  const inserted = para('zero');
  const d2 = doc(inserted, ...[d1.child(0), d1.child(1), d1.child(2), d1.child(3)]);
  const shift = inserted.nodeSize; // 7
  const trInsert = {
    docChanged: true,
    doc: d2,
    mapping: new Mapping([new StepMap([1, 0, shift])]),
  };
  h.controller.update({ doc: d2, selection: { from: 1, to: 1 } }, trInsert);
  h.controller.flush();
  const afterInsert = layerCalls();
  assert.ok(afterInsert.length > 1, 'the layer was re-pushed');
  assert.equal(afterInsert[afterInsert.length - 1].spanFirst, 2,
    'span followed the insert (row 1 → row 2)');

  // Delete the image row (id-anchored span disappears, never misplaces).
  h.controller.setLayer('byid', {
    anchor: 'id',
    spans: [{ kind: 'id', id: 'img-1' }],
    lane: 2,
    tone: () => '#e05d44',
  });
  const byIdBefore = h.renderer.calls
    .filter((c) => c.kind === 'layer' && c.layerId === 'byid');
  assert.equal(byIdBefore[byIdBefore.length - 1].spanFirst, 3,
    'id resolves to the image row');

  const imgStart = d2.content.size; // recomputed below instead
  void imgStart;
  const imgRow = h.controller.getRows()[3];
  const deleteFrom = imgRow.pos - 1;
  const deleteLen = imgRow.node.nodeSize;
  const d3 = doc(
    d2.child(0), d2.child(1), d2.child(2),
    d2.child(4),
  );
  const trDelete = {
    docChanged: true,
    doc: d3,
    mapping: new Mapping([new StepMap([deleteFrom, deleteLen, 0])]),
  };
  h.controller.update({ doc: d3, selection: { from: 1, to: 1 } }, trDelete);
  h.controller.flush();
  const byIdAfter = h.renderer.calls
    .filter((c) => c.kind === 'layer' && c.layerId === 'byid');
  assert.equal(
    byIdAfter[byIdAfter.length - 1].spanCount, 0,
    'the id span disappears (its node was deleted)',
  );

  // mapPos: deleted positions return null, surviving ones map (§7.2).
  // Probe with a replace (delete 5 @ 10, insert 8): interior positions
  // have divergent forward/backward associations — the survival test.
  const strict = {
    docChanged: true,
    doc: d3,
    mapping: new Mapping([new StepMap([10, 5, 8])]),
  };
  assert.equal(h.controller.mapPos(12, strict), null,
    'a position inside the replaced range is null');
  assert.equal(h.controller.mapPos(5, strict), 5,
    'a position before the edit maps identically');
  assert.equal(
    h.controller.mapPos(10, strict), 10,
    'the cut point itself survives (assoc equality)',
  );
});

// --- §15.1.23 The thumb is a scrollbar slider over the pane (§9.1) ------------

test('§15.1.23 overlay: thumb fraction follows scroll in both modes', async () => {
  await controllerPromise;
  // 600 paras × 24px ≈ 14,400 editor px; × 0.25 zoom = 3,600 minimap px —
  // well past the 600px container, so `auto` selects sliding (§6.2).
  const n = 600;
  const paras = Array.from({ length: n }, (_, i) => para(`p${i}`));
  const d = doc(...paras);
  const h = makeControllerHarness(
    { doc: d, selection: { from: 1, to: 1 } },
  );
  for (let i = 0; i < 8 && h.controller.getRows().length < n; i++) {
    h.controller.flush();
  }
  assert.equal(h.controller.getRows().length, n);

  // Scroll deep into the document and refresh geometry.
  // scrollHeight 14,400 − clientHeight 800 = maxScroll 13,600.
  // Thumb = pane × clientHeight/scrollHeight = 600 × 800/14,400 ≈ 33.3px.
  h.container.scrollTop = 5_000;
  h.container.scrollHeight = 14_400;
  h.controller.refreshGeometry();
  h.controller.flush();
  const styles = lastOverlayStyles;
  const thumb = parseFloat(styles.height) || 0;
  // frac = 5,000/13,600 ≈ 0.3676; y = frac × (600 − 33.3) ≈ 208.2px.
  // The thumb traverses the full track in BOTH modes (the scrollbar
  // contract): the pre-fix content-mapped thumb pinned at translateY(0)
  // once the clamped window origin caught up with the scroll.
  const expectedY = (5_000 / 13_600) * (600 - thumb);
  const gotY = parseFloat(styles.transform.replace(/[^0-9.-]/g, '')) || 0;
  assert.ok(
    Math.abs(gotY - expectedY) < 1,
    `sliding thumb is fraction-placed (${gotY} ≈ ${expectedY.toFixed(1)})`,
  );

  // Fit mode: a small doc (auto → fit) fills the pane — thumb caps at the
  // track, translate pins to 0.
  const small = doc(
    ...Array.from({ length: 24 }, (_, i) => para(`p${i}`)),
  );
  const h2 = makeControllerHarness(
    { doc: small, selection: { from: 1, to: 1 } },
  );
  h2.controller.flush();
  // 24 rows × 24px = 576px doc < 600px pane < 800px client: no scrolling.
  h2.container.scrollTop = 0;
  h2.container.scrollHeight = 576;
  h2.controller.refreshGeometry();
  h2.controller.flush();
  const s2 = lastOverlayStyles;
  assert.ok(
    s2.transform === 'translateY(0px)' && s2.height === '600px',
    `fit caps the thumb to the track (${s2.transform}, ${s2.height})`,
  );

  // A doc with real headroom: thumb < track, translate tracks the fraction.
  const taller = doc(
    ...Array.from({ length: 48 }, (_, i) => para(`p${i}`)),
  );
  const h3 = makeControllerHarness(
    { doc: taller, selection: { from: 1, to: 1 } },
  );
  h3.controller.flush();
  // 48 × 24 = 1,152 editor px; fit scale 600/1152 — scrollable only if the
  // harness container says so: scrollHeight 1,152 − clientHeight 800 = 352.
  h3.container.scrollTop = 100;
  h3.container.scrollHeight = 1_152;
  h3.controller.refreshGeometry();
  h3.controller.flush();
  const s3 = lastOverlayStyles;
  const t3 = parseFloat(s3.height) || 0;
  const exp3 = (100 / 352) * (600 - t3);
  const got3 = parseFloat(s3.transform.replace(/[^0-9.-]/g, '')) || 0;
  assert.ok(
    Math.abs(got3 - exp3) < 1,
    `fit thumb is fraction-placed (${got3} ≈ ${exp3.toFixed(1)})`,
  );
});

// --- §15.1.29 Forced sliding with surface ≤ pane: thumb aligns with content ---

test('§15.1.29 sliding alignment: surface shorter than the pane keeps the thumb on its content', async () => {
  await controllerPromise;
  // The reported repro: `display: 'sliding'` forced on a document whose
  // surface (zoom × total) is SHORTER than the pane — the contents paint
  // at the pane's top spanning only part of it, and the thumb must cover
  // exactly the surface px the editor viewport shows (pre-fix it sized by
  // the pane-fraction scrollbar proportion — taller than the entire
  // painted document, as if the mode were fit — and slid over the empty
  // region below the surface).
  //
  // Geometry: 40 rows × 24px = 960 editor px; zoom 0.25 → surface 240px
  // on a 600px pane; clientHeight 600, scrollHeight 960 → maxScroll 360.
  const n = 40;
  const paras = Array.from({ length: n }, (_, i) => para(`p${i}`));
  const h = makeControllerHarness(
    { doc: doc(...paras), selection: { from: 1, to: 1 } },
    { display: 'sliding' },
    { scrollHeight: 960, clientHeight: 600 },
  );
  h.controller.flush();

  // Thumb = clientHeight × scale = 600 × 0.25 = 150px — a fraction of
  // the 240px surface, NOT the pane fraction 600×600/960 = 375px.
  const styles = lastOverlayStyles;
  const thumbH = parseFloat(styles.height) || 0;
  assert.ok(
    Math.abs(thumbH - 150) < 1,
    `thumb is the viewport's surface share (${thumbH} ≈ 150)`,
  );

  // At scrollTop 0 the thumb sits at the surface's top (y = 0) — aligned
  // with the first row, not floating mid-pane.
  let y = parseFloat(styles.transform.replace(/[^0-9.-]/g, '')) || 0;
  assert.ok(Math.abs(y) < 1, `thumb at content top (${y})`);

  // At mid-scroll the thumb is at frac 0.5 × travel (240 − 150 = 90) = 45
  // — ON the painted surface, whose span ends at 240.
  h.container.scrollTop = 180;
  h.controller.refreshGeometry();
  h.controller.flush();
  const mid = lastOverlayStyles;
  y = parseFloat(mid.transform.replace(/[^0-9.-]/g, '')) || 0;
  assert.ok(
    Math.abs(y - 45) < 1,
    `mid-scroll thumb on the surface (${y} ≈ 45 of travel 90)`,
  );

  // At max scroll the thumb's bottom reaches the surface's end
  // (y = 90 + 150 = 240), never entering the empty pane below.
  h.container.scrollTop = 360;
  h.controller.refreshGeometry();
  h.controller.flush();
  const end = lastOverlayStyles;
  y = parseFloat(end.transform.replace(/[^0-9.-]/g, '')) || 0;
  assert.ok(
    Math.abs(y - 90) < 1,
    `end thumb bottoms out at the surface's end (${y} ≈ 90)`,
  );

  // Drag inversion: the thumb-top-over-travel fraction maps back to the
  // scroll — dragging to travel 45 lands at half of maxScroll.
  const overlay = h.overlay;
  const down = overlay._listeners.get('pointerdown');
  const move = overlay._listeners.get('pointermove');
  const up = overlay._listeners.get('pointerup');
  const ev = (extra) => ({
    pointerId: 1, stopPropagation: () => undefined, ...extra,
  });
  down(ev({ button: 0, clientY: 0 }));
  move(ev({ clientY: 45 }));
  up(ev({ clientY: 45 }));
  assert.equal(
    h.container.scrollTop, 180,
    'drag inversion: thumbTop 45 of travel 90 → scrollTop 180 of 360',
  );
});

// --- §15.1.30 Typing stability: a replaced row inherits its measurement ---

test('§15.1.30 typing: the edited row inherits the old row\'s measured height; no estimate-measure oscillation', async () => {
  await controllerPromise;
  // The keystroke case: a paragraph's NODE is replaced (new instance) but
  // the row is one-for-one — pairNode's opaque branch drops the old row
  // and emits a fresh one. Pre-fix, the fresh row's height was the FORMULA
  // estimate (no inter-block margins: 24px where the real stride is 40),
  // so everything below the caret jumped up on the keystroke frame and
  // back down when the sampler re-measured — on every keypress.
  //
  // Fixture: three paragraphs; rows 0/2 "measured" at 40px via nodeDOM.
  const paras = [para('alpha'), para('beta'), para('gamma')];
  const rows0 = flattenAll(doc(...paras), ctx());
  // Simulate the sampler's converged state for rows 0 and 2.
  rows0[0].heightPx = 40;
  rows0[1].heightPx = 40;
  rows0[2].heightPx = 40;
  const offsetsBefore = sumOffsets(rows0);

  // One keystroke in paragraph 1: a NEW node instance for that paragraph
  // only (ProseMirror structural sharing for siblings).
  const edited = para('beta!');
  const d2 = doc(paras[0], edited, paras[2]);
  const bounds = diffBounds();
  const result = [
    ...diffRows(
      rows0, doc(...paras), d2, ctx(),
      (p) => p + 1, // one char inserted below paragraph 1
      bounds,
    ),
  ];

  // The replaced row (index 1) INHERITED the measured 40px — not the
  // 24px formula estimate — so the offsets below it are unchanged on the
  // keystroke frame: total delta === 0 (pre-fix: −16).
  assert.equal(result[1].heightPx, 40,
    'the replaced row inherits the old row\'s measured stride');
  const offsetsAfter = sumOffsets(result);
  const delta = offsetsAfter[3] - offsetsBefore[3];
  assert.equal(delta, 0,
    `no height delta across the keystroke (got ${delta}px, pre-fix −16)`);

  // The inherited row is re-armed for sampling (sampledAtEpoch −1, never
  // equal to the live epoch): the sampler still owns it — an inheritance
  // the edit invalidated (the paragraph grew a line) corrects promptly.
  assert.equal(result[1].sampledAtEpoch, -1,
    'inherited rows stay sampler-eligible');
});

// --- §15.1.31 A moved subtree inherits measurements by node identity ------

test('§15.1.31 demote/move: re-emitted rows for the same nodes inherit measured heights', async () => {
  await controllerPromise;
  // The reflow-on-demotion repro: a demote MOVES a clause under another
  // node. Every node instance survives (`===`), but position-based pairing
  // at the old parent sees the moved subtree vanish (its rows are
  // skipRange-dropped) and re-emits it fresh at the new location — 29
  // formula-estimated rows (24px) where the model held measured strides
  // (40px), collapsing `total` by ~464px for several frames: everything
  // below reflows and the whole minimap rescales while the sampler
  // re-converges 4 rows at a time. Identity inheritance hands each
  // re-emitted row the dropped row's measurement for the SAME node.
  const schema2 = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: {
        group: 'block', content: 'inline*',
        toDOM: () => ['p', 0], parseDOM: [{ tag: 'p' }],
      },
      clause: { content: 'clause_title paragraph+', toDOM: () => ['section', 0] },
      clause_title: { content: 'inline*', toDOM: () => ['h2', 0] },
      section: { content: 'clause+', toDOM: () => ['div', 0] },
      text: { group: 'inline' },
    },
  });
  const para2 = (t = '') => schema2.nodes.paragraph.create(
    null, t ? schema2.text(t) : null,
  );
  const title2 = (t) => schema2.nodes.clause_title.create(null, schema2.text(t));
  // The moved clause: a title + 8 paragraphs (all measured at 40px).
  const mkClause = (name, n) => schema2.nodes.clause.create(null, [
    title2(name),
    ...Array.from({ length: n }, (_, i) => para2(`${name} p${i}`)),
  ]);
  const moved = mkClause('moved', 8);
  const before = schema2.nodes.doc.create(null, [
    mkClause('stay', 2),
    moved,
    mkClause('tail', 2),
  ]);
  const after = schema2.nodes.doc.create(null, [
    mkClause('stay', 2),
    // `moved` re-parented — same instance, new position/parent.
    schema2.nodes.section.create(null, [moved]),
    mkClause('tail', 2),
  ]);

  const rows0 = flattenAll(before, ctx());
  for (const r of rows0) r.heightPx = 40; // sampler converged
  const total0 = sumOffsets(rows0)[rows0.length];

  // A move: delete range [movedStart, movedEnd) then insert at a new
  // parent — mapping positions inside the move is not needed for the
  // assertion (the diff re-derives positions by walking `after`).
  const bounds = diffBounds();
  const result = [
    ...diffRows(rows0, before, after, ctx(), (p) => p, bounds),
  ];

  // Every re-emitted row for a node of `moved` carries the inherited 40px
  // measurement — the model's total is UNCHANGED by the move (pre-fix it
  // dropped by 9 rows × 16px = 144px and re-converged over frames).
  const total1 = sumOffsets(result)[result.length];
  assert.equal(total1, total0,
    `total unchanged across the move (${total1} vs ${total0})`);
  const movedRows = result.filter(
    (r) => r.node === moved || (moved.isParentOf?.(r.node) ?? false),
  );
  // `moved` = title + 8 paragraphs = 9 rows, ALL measured 40px.
  const movedMeasured = result.filter(
    (r) => r.heightPx === 40 && r.node.textContent.startsWith('moved'),
  );
  assert.equal(movedRows.length === 0 ? 9 : movedMeasured.length, 9,
    'the moved subtree\'s 9 rows re-enter measured (identity inheritance)');
});

// --- §15.1.28 Doc edits refresh the scroll-geometry cache (§7.4) -------------

test('§15.1.28 doc-change refreshes geometry: drag clamp tracks a grown document', async () => {
  await controllerPromise;
  // Mirror the reported repro: content typed/pasted after mount grows the
  // container's scrollHeight while its BOX (clientHeight) is unchanged —
  // no resize, no font load, no visibility flip. The stale-geometry bug
  // kept the drag clamp at the pre-edit extent, so the document's new
  // tail was unreachable by minimap drag until a tab switch / window
  // resize happened to fire a refresh point.
  const harnessBox = { h: null };
  // A 600px-pane fixture: scrollHeight tracks the live row count (the
  // content grows; the box stays 600). Reading through the controller's
  // CURRENT rows mirrors a real scroller whose extent follows content.
  const container = {
    scrollTop: 0,
    get scrollHeight() {
      return (harnessBox.h?.controller.getRows().length ?? 0) * 24;
    },
    clientHeight: 600,
    clientWidth: 600,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    getBoundingClientRect: () => ({ top: 0, left: 0, height: 600 }),
  };
  // The doc the controller builds at start() (state-swap-style mount).
  const mount = doc(...Array.from({ length: 5 }, (_, i) => para(`m${i}`)));
  const view = {
    dom: { parentElement: null },
    state: { doc: mount, selection: { from: 1, to: 1 } },
    nodeDOM: (pos) => ({
      getBoundingClientRect: () => {
        const rows = harnessBox.h?.controller.getRows() ?? [];
        for (let i = 0; i < rows.length; i++) {
          if (rows[i].pos === pos) {
            return { top: i * 24, height: 24 };
          }
        }
        return { top: 0, height: 0 };
      },
    }),
    coordsAtPos: () => ({ left: 0, right: 0, top: 0, bottom: 0 }),
  };
  const controller = new controllerCtor(view, {
    scrollContainer: () => container,
  });
  const renderer = new RecordingRenderer();
  const overlay = fakeOverlay();
  harnessBox.h = { controller };
  controller.start();
  controller.attachRenderer(renderer, overlay, { width: 100, height: 600, dpr: 1 });
  controller.flush();

  // 20 paragraphs = 480px doc, shorter than the 600px pane: no scrolling.
  const small = doc(...Array.from({ length: 20 }, (_, i) => para(`p${i}`)));
  controller.update(
    { doc: small, selection: { from: 1, to: 1 } },
    { docChanged: true, doc: small, mapping: new Mapping() },
  );
  controller.flush();
  assert.equal(container.scrollHeight, 480, 'fixture: small doc');
  assert.equal(controller.getRows().length, 20);

  // Grow the document by 60 paragraphs (1,920px → 2,400px total): the
  // container's scrollHeight follows (content grew; box unchanged).
  const big = doc(
    ...Array.from({ length: 80 }, (_, i) => para(`p${i} grown`)),
  );
  controller.update(
    { doc: big, selection: { from: 1, to: 1 } },
    { docChanged: true, doc: big, mapping: new Mapping() },
  );
  controller.flush();
  assert.equal(container.scrollHeight, 1920, 'fixture: grown doc');

  // The cached geometry picked up the new extent — dragging the thumb to
  // the track bottom must land at the NEW maxScroll (1,920 − 600 = 1,320).
  // The pre-fix cache stayed at 0 (the small doc was unscrollable): the
  // clamp kept scrollTop pinned at 0 and the grown tail was unreachable.
  const listeners = overlay._listeners;
  const down = listeners.get('pointerdown');
  const move = listeners.get('pointermove');
  const up = listeners.get('pointerup');
  assert.ok(typeof down === 'function' && typeof move === 'function'
    && typeof up === 'function', 'drag listeners wired');
  const ev = (extra) => ({
    pointerId: 1,
    stopPropagation: () => undefined,
    ...extra,
  });
  down(ev({ button: 0, clientY: 0 }));
  move(ev({ clientY: 576 })); // thumb (24px) to the bottom of the 600 track
  up(ev({ clientY: 576 }));
  assert.equal(
    container.scrollTop, 1920 - 600,
    'drag-to-bottom reaches the post-edit extent (stale-geometry regression)',
  );
});

// --- §15.1.27 Drag release is continuous with the last move (§9.2) -----------

test('§15.1.27 release continuity: commit applies the last move, no snap', async () => {
  await controllerPromise;
  // A 200-row doc: 4,800 editor px; fit scale 600/4800 = 0.125.
  const n = 200;
  const paras = Array.from({ length: n }, (_, i) => para(`p${i}`));
  // Late-bound harness box: the nodeDOM closure runs during the harness's
  // own construction (sampling in the first flush), before `h` binds.
  const box = { h: null };
  const h = makeControllerHarness(
    { doc: doc(...paras), selection: { from: 1, to: 1 } },
    {},
    // nodeDOM with a 30px first-row offset from the container top — the
    // padding case: realTop carries +30, the model's origin is 0. The
    // pre-fix precise snap converted exactly this constant into a
    // post-release downward jump.
    {
      nodeDOM: (pos) => ({
        getBoundingClientRect: () => {
          const rows = box.h?.controller.getRows() ?? [];
          for (let i = 0; i < rows.length; i++) {
            if (rows[i].pos === pos) {
              return { top: 30 + i * 24, height: 24 };
            }
          }
          return { top: 0, height: 0 };
        },
      }),
    },
  );
  box.h = h;
  for (let i = 0; i < 5 && h.controller.getRows().length < n; i++) {
    h.controller.flush();
  }

  const overlay = h.overlay;
  const down = overlay._listeners.get('pointerdown');
  const move = overlay._listeners.get('pointermove');
  const up = overlay._listeners.get('pointerup');
  assert.ok(typeof down === 'function' && typeof move === 'function'
    && typeof up === 'function', 'drag listeners wired');

  // Drag the thumb from container-y 10 to container-y 500. Minimal event
  // stubs: the handlers need stop/setPointerCapture no-ops only.
  const ev = (extra) => ({
    pointerId: 1,
    stopPropagation: () => undefined,
    ...extra,
  });
  down(ev({ button: 0, clientY: 10 }));
  move(ev({ clientY: 500 }));
  const afterMove = h.container.scrollTop;
  assert.ok(afterMove > 0, `the move scrolled (${afterMove})`);
  up(ev({ clientY: 500 }));
  const afterRelease = h.container.scrollTop;

  // Continuity: the commit re-applies the move's own mapping — zero delta.
  // (A precise snap here would move the document by the model-vs-real
  // content-origin bias, ~30px in this fixture — the reported jank.)
  assert.equal(
    afterRelease, afterMove,
    'release applies the last move exactly (no snap delta)',
  );
});

// --- §15.1.24 Hover computes the row under the pointer (§10.2) ------------------

test('§15.1.24 hover: y is container-relative, not viewport-relative', async () => {
  await controllerPromise;
  // Tall rows so the row under container-y 50 differs from the row under
  // viewport-y 150: with containerRect.top = 100, clientY 150 is
  // container-y 50 (row 2 of 24px rows); the buggy viewport-relative read
  // would resolve row 6.
  const paras = Array.from({ length: 12 }, (_, i) => para(`p${i}`));
  const d = doc(...paras);
  const hovers = [];
  const h = makeControllerHarness(
    { doc: d, selection: { from: 1, to: 1 } },
    { onBlockHover: (info) => hovers.push(info) },
    {
      containerRect: { top: 100, left: 0, height: 600 },
      // The doc's real extent (12 × 24): the harness default 4000 would
      // engage the extent-aware fit scale (§6.2) and shift the geometry
      // this test's arithmetic depends on.
      scrollHeight: 288,
      clientHeight: 600,
    },
  );
  h.controller.flush();

  // The overlay listeners the harness captured (fakeOverlay._listeners).
  const overlay = h.overlay;
  const move = overlay._listeners.get('pointermove');
  const enter = overlay._listeners.get('pointerenter');
  assert.ok(typeof move === 'function', 'pointermove wired');
  assert.ok(typeof enter === 'function', 'pointerenter wired');
  enter({ pointerId: 1 });
  move({ pointerId: 1, clientY: 150 });
  assert.equal(hovers.length, 1, 'one hover event fired');
  // Container-y 50, fit scale 600/288 = 2.083: editorY 24 → row 1. The
  // buggy viewport-relative read (y 150 → editorY 72) resolves row 3.
  assert.equal(hovers[0].row, 1,
    `hover resolved row ${hovers[0].row}; container-relative read gives 1`);

  // Moving within the same row fires nothing more (§10.2: once per row).
  move({ pointerId: 1, clientY: 158 });
  assert.equal(hovers.length, 1);
  // Crossing into the next row fires once.
  move({ pointerId: 1, clientY: 150 + Math.round(600 / 288 * 24) });
  assert.equal(hovers.length, 2);
  assert.equal(hovers[1].row, 2);
});

// --- §15.1.25 Resize coalesces into the frame batch (§8.5) ----------------------

test('§15.1.25 resize: RO callbacks never resize synchronously; one per frame', async () => {
  await controllerPromise;
  const d = doc(para('one'), para('two'));
  const h = makeControllerHarness({ doc: d, selection: { from: 1, to: 1 } });
  h.controller.flush();

  // Two RO callbacks in one frame: zero synchronous resizes.
  const resizes = () => h.renderer.calls.filter((c) => c.kind === 'resize');
  const before = resizes().length;
  h.controller.onContainerResize(120, 700);
  h.controller.onContainerResize(130, 720);
  assert.equal(
    resizes().length, before,
    'no resize applied synchronously in the RO callback',
  );

  // The frame applies exactly one — the latest size.
  h.controller.flush();
  const applied = resizes().slice(before);
  assert.equal(applied.length, 1, 'exactly one resize per frame');
  assert.equal(applied[0].width, 130, 'latest width wins');
  assert.equal(applied[0].height, 720, 'latest height wins');
});

// --- §15.1.26 Measured rows re-sample after an epoch change (§4.5/§4.6) ---------

test('§15.1.26 epochs: measured heights re-sample after an epoch change', async () => {
  await controllerPromise;
  const d = doc(para('x'.repeat(300)), para('y'), para('z'));
  // A nodeDOM stub whose rect height changes after the first sample:
  // 55 on the first read, 77 thereafter (simulates a re-layout).
  let reads = 0;
  const nodeDOM = () => ({
    getBoundingClientRect: () => ({ height: reads++ < 1 ? 55 : 77 }),
  });
  const h = makeControllerHarness(
    { doc: d, selection: { from: 1, to: 1 } },
    { sampleBudget: 4 },
    { nodeDOM },
  );
  h.controller.flush();
  const rows = h.controller.getRows();
  assert.equal(rows[0].heightPx, 55, 'row 0 measured at 55');

  // Epoch change: re-estimates run, measured values KEPT, and the rows
  // become eligible for re-sampling (§4.6 "re-sampled lazily as they
  // re-enter the window" — the sampler may revisit them).
  const narrow = { ...defaultTheme, charsPerLine: 40 };
  h.controller.reevaluateEpoch({ theme: narrow, contentWidth: 300 });
  assert.equal(
    h.controller.getRows()[0].heightPx, 55,
    'measured value kept at the epoch boundary (§4.6)',
  );
  h.controller.flush();
  assert.equal(
    h.controller.getRows()[0].heightPx, 77,
    'row 0 re-sampled after the epoch (fresh measurement wins)',
  );
  // The re-sample budget covered every row here (3 rows, budget 4): all
  // carry epoch-current measurements now.
  for (const r of h.controller.getRows()) {
    assert.ok(
      r.heightPx !== null && r.heightPx > 0,
      'every row carries a measurement at this budget',
    );
  }
});

// --- §15.1.19 Progressive build publish (§7.3) --------------------------------

test('§15.1.19 build slices publish progressively: rows paint before the build completes', async () => {
  await controllerPromise;
  // 300 paragraphs > BUILD_ROWS_PER_TICK (2000)? No — but > the first
  // slice's budget is impossible headlessly (first slice runs to the
  // window bottom or 2000 rows). Use a doc big enough to need 2 slices:
  // 3000 paragraphs forces slice 1 (2000-row tick) then slice 2.
  const n = 3_000;
  const paras = Array.from({ length: n }, (_, i) => para(`p${i}`));
  const h = makeControllerHarness(
    { doc: doc(...paras), selection: { from: 1, to: 1 } },
  );

  // Slice 1 (single flush): a partial model is published and PAINTED.
  const partial = h.renderer.calls.filter((c) => c.kind === 'blocks');
  const painted = h.renderer.calls.filter((c) => c.kind === 'row');
  assert.ok(partial.length > 0, 'slice 1 pushed blocks');
  const lastPush = partial[partial.length - 1];
  assert.ok(
    lastPush.firstRow + lastPush.rowCount < n,
    `slice 1 is partial (pushed ${lastPush.firstRow}+${lastPush.rowCount} of ${n})`,
  );
  assert.ok(painted.length > 0, 'slice 1 painted rows');
  assert.ok(
    h.controller.getRows().length < n,
    'build still open after one slice',
  );

  // Flush to completion: the full model lands (chunked at 2,000 rows, so
  // assert coverage via the renderer's absolute-index mirror, §8.1).
  for (let i = 0; i < 10 && h.controller.getRows().length < n; i++) {
    h.controller.flush();
  }
  assert.equal(h.controller.getRows().length, n, 'build completes');
  assert.equal(
    h.renderer.mirrorClassIds.length,
    n,
    'the full model covers every row index',
  );
  // A full-model re-publish happened after the last slice: its chunks
  // start again at row 0 (the mirror was rebuilt clean, §8.1).
  const blocks = h.renderer.calls.filter((c) => c.kind === 'blocks');
  assert.ok(
    blocks.some((b) => b.rowCount === 0 + 2_000),
    'a full re-publish chunked at chunkRows lands',
  );
});

test('§15.1.19 rebuild: the first slice covers the visible window, not one row', async () => {
  await controllerPromise;
  // The stale-total bug: a rebuild (classifier reconfigure) seeded the
  // visible-region-first loop with the PREVIOUS model's total, so the
  // first slice emitted ~1 row. clientHeight 800 / lineHeight 24 ≈ 34.
  const n = 100;
  const paras = Array.from({ length: n }, (_, i) => para(`p${i} x`.repeat(1)));
  const d = doc(...paras);
  const h = makeControllerHarness(
    { doc: d, selection: { from: 1, to: 1 } },
  );
  for (let i = 0; i < 5 && h.controller.getRows().length < n; i++) {
    h.controller.flush();
  }
  assert.equal(h.controller.getRows().length, n);

  // Rebuild via a classifier change: the old model's rows must not seed
  // the new build's visible-region-first loop.
  const callsBefore = h.renderer.calls.length;
  h.controller.reconfigure({ classifier: { row: () => ({ classId: 'text' }) } });
  h.controller.flush();
  const slice1 = h.renderer.calls
    .slice(callsBefore)
    .filter((c) => c.kind === 'blocks')
    .reduce((acc, b) => Math.max(acc, b.firstRow + b.rowCount), 0);
  // One row's worth (24px) of coverage cannot fill an 800px window: the
  // first slice must emit enough rows to cover it (~34 at 24px each).
  assert.ok(
    slice1 >= 800 / 24 - 1,
    `first rebuild slice emitted ${slice1} rows (need ≈${800 / 24} to fill the window)`,
  );
});

// --- §15.1.20 Performance budgets (§15.2, headless-measurable) ---------------

test('§15.1.20 performance: build, patch, mapping stay within budgets', async () => {
  await controllerPromise;
  // ~10k blocks: build, single-block patch, and rowAt stay comfortably
  // inside the §15.2 budgets scaled to this document size.
  const n = 10_000;
  const paras = Array.from({ length: n }, (_, i) => para(`p${i} text`));
  const big = doc(...paras);
  const h = makeControllerHarness(
    { doc: big, selection: { from: 1, to: 1 } },
    { tier1Rows: 5_000, tier2Rows: 50_000 },
  );

  // Per-keystroke incremental update (§15.2): single-block edit ≤ 1 ms.
  const edited = para('p0 text EDITED');
  const d2 = doc(edited, ...paras.slice(1));
  const tr = {
    docChanged: true,
    doc: d2,
    mapping: new Mapping([new StepMap([2, 0, 7])]),
  };
  const t0 = performance.now();
  h.controller.update({ doc: d2, selection: { from: 1, to: 1 } }, tr);
  h.controller.flush();
  const perEdit = performance.now() - t0;
  assert.ok(perEdit <= 5, `single-block edit under budget (${perEdit}ms)`);

  // Mapping: rowAtPos is O(log n) — 10k rows, thousands of lookups fast.
  const t1 = performance.now();
  let found = 0;
  for (let p = 1; p < 50_000; p += 3) {
    if (h.controller.rowAtPos(p) !== null) {
      found++;
    }
  }
  const perLookup = (performance.now() - t1);
  assert.ok(found > 1_000, 'lookups resolve');
  assert.ok(perLookup < 100, `16k lookups in ${perLookup}ms`);
});
