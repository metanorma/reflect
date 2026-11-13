/**
 * Round-trip tests for the open-attribute JSON model (§12, §14).
 *
 * Locks down the `MetanormaSchema` load-side partition (unknown attribute
 * keys are captured into the catch-all `data`, §12.1) and the §12 output
 * contract (`toJSON` emits typed attrs at the top level, extras under
 * `data`, never flattened), including the stock error contracts that
 * `loadDocFromJson` in the GUI relies on.
 *
 * Runs against the compiled JS output (`./compiled/index.js`) under plain
 * `node --test` via Yarn PnP — same pattern as `pkg/editor-commands`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  metanormaSchema,
  MetanormaSchema,
  isEditorOnlyAttr,
  stripEditorOnlyAttrs,
} from './compiled/index.js';

/** nodeFromJSON → toJSON, stringified for exact-shape assertions. */
const roundTrip = (json) =>
  JSON.stringify(metanormaSchema.nodeFromJSON(structuredClone(json)).toJSON());

/** Direct markFromJSON → toJSON, stringified. */
const markRoundTrip = (json) =>
  JSON.stringify(metanormaSchema.markFromJSON(structuredClone(json)).toJSON());

describe('§12.1 unknown-attr capture into data', () => {
  it('captures an unknown top-level node attr into data', () => {
    assert.equal(
      roundTrip({
        type: 'paragraph',
        attrs: { 'untyped-key': 'keep-me' },
        content: [{ type: 'text', text: 'hi' }],
      }),
      JSON.stringify({
        type: 'paragraph',
        attrs: { data: { 'untyped-key': 'keep-me' } },
        content: [{ type: 'text', text: 'hi' }],
      }),
    );
  });

  it('banks a legacy sourcecode `text` attr string into data (§6.1: the attr is deliberately absent)', () => {
    assert.equal(
      roundTrip({
        type: 'sourcecode',
        attrs: { language: 'python', text: 'legacy code' },
        content: [{ type: 'text', text: 'print(1)' }],
      }),
      JSON.stringify({
        type: 'sourcecode',
        attrs: { language: 'python', data: { text: 'legacy code' } },
        content: [{ type: 'text', text: 'print(1)' }],
      }),
    );
  });

  it('banks a legacy sourcecode `text: null` key into data (null values bank too)', () => {
    assert.equal(
      roundTrip({
        type: 'sourcecode',
        attrs: { language: null, text: null },
        content: [],
      }),
      JSON.stringify({
        type: 'sourcecode',
        attrs: { language: null, data: { text: null } },
      }),
    );
  });

  it('captures unknown attrs on deeply nested nodes (emergent recursion)', () => {
    assert.equal(
      roundTrip({
        type: 'doc',
        content: [
          {
            type: 'bibdata',
            attrs: { item: null, data: {} },
          },
          {
            type: 'sections',
            attrs: { id: null, number: null, data: {} },
            content: [
              {
                type: 'clause',
                attrs: { id: 'c1', number: null, data: {} },
                content: [
                  {
                    type: 'section_title',
                    attrs: { data: {} },
                    content: [{ type: 'text', text: 'C' }],
                  },
                  {
                    type: 'paragraph',
                    attrs: { 'nested-extra': 42 },
                    content: [{ type: 'text', text: 'body' }],
                  },
                ],
              },
            ],
          },
        ],
      }),
      JSON.stringify({
        // doc declares DATA_ATTR, so defaults emit attrs.data — expected
        // shape includes it.
        type: 'doc',
        attrs: { data: {} },
        content: [
          { type: 'bibdata', attrs: { item: null, data: {} } },
          {
            type: 'sections',
            attrs: { id: null, number: null, data: {} },
            content: [
              {
                type: 'clause',
                attrs: { id: 'c1', number: null, data: {} },
                content: [
                  {
                    type: 'section_title',
                    attrs: { data: {} },
                    content: [{ type: 'text', text: 'C' }],
                  },
                  {
                    type: 'paragraph',
                    attrs: { data: { 'nested-extra': 42 } },
                    content: [{ type: 'text', text: 'body' }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
  });

  it('captures an unknown attr on a mark inside a text node (nested marks)', () => {
    assert.equal(
      roundTrip({
        type: 'paragraph',
        attrs: {},
        content: [
          {
            type: 'text',
            text: 'hi',
            marks: [
              { type: 'link', attrs: { href: 'https://x', zzz: 1 } },
            ],
          },
        ],
      }),
      JSON.stringify({
        type: 'paragraph',
        attrs: { data: {} },
        content: [
          {
            type: 'text',
            // toJSON emits marks before text — order matters for the
            // stringified comparison.
            marks: [
              {
                type: 'link',
                attrs: { href: 'https://x', data: { zzz: 1 } },
              },
            ],
            text: 'hi',
          },
        ],
      }),
    );
  });

  it('banks a legacy link `target` attr into data (§6.2: href is the single URL attr)', () => {
    assert.equal(
      roundTrip({
        type: 'paragraph',
        attrs: {},
        content: [
          {
            type: 'text',
            text: 'hi',
            marks: [
              { type: 'link', attrs: { href: 'https://x', target: '_blank' } },
            ],
          },
        ],
      }),
      JSON.stringify({
        type: 'paragraph',
        attrs: { data: {} },
        content: [
          {
            type: 'text',
            marks: [
              {
                type: 'link',
                attrs: { href: 'https://x', data: { target: '_blank' } },
              },
            ],
            text: 'hi',
          },
        ],
      }),
    );
  });

  it('captures unknown attrs via a direct top-level markFromJSON call', () => {
    assert.equal(
      markRoundTrip({ type: 'emphasis', attrs: { weight: 'bold' } }),
      JSON.stringify({ type: 'emphasis', attrs: { data: { weight: 'bold' } } }),
    );
  });
});

describe('§12 merge and passthrough rules', () => {
  it('lets explicit data win collisions with unknown keys', () => {
    assert.equal(
      roundTrip({
        type: 'paragraph',
        attrs: { zz: 1, data: { zz: 2, keep: 3 } },
      }),
      JSON.stringify({
        type: 'paragraph',
        attrs: { data: { zz: 2, keep: 3 } },
      }),
    );
  });

  it('keeps pre-nested data keys unchanged when no unknowns exist', () => {
    assert.equal(
      roundTrip({
        type: 'paragraph',
        attrs: { data: { already: 'nested' } },
      }),
      JSON.stringify({
        type: 'paragraph',
        attrs: { data: { already: 'nested' } },
      }),
    );
  });

  it('keeps typed attrs top-level and never flattens data (§12 note)', () => {
    // NOTE: Node.toJSON() omits an empty content array — expected has no
    // `content` key for the empty clause.
    assert.equal(
      roundTrip({
        type: 'clause',
        attrs: { id: 'k1', number: '7', extra: true, data: { more: 1 } },
        content: [],
      }),
      JSON.stringify({
        type: 'clause',
        attrs: {
          id: 'k1',
          number: '7',
          data: { extra: true, more: 1 },
        },
      }),
    );
  });

  it('is byte-identical for explicit data:{} fixtures (editor-commands shape)', () => {
    // The exact attr shape every editor-commands fixture writes.
    assert.equal(
      roundTrip({
        type: 'paragraph',
        attrs: { data: {} },
        content: [{ type: 'text', text: 'p' }],
      }),
      JSON.stringify({
        type: 'paragraph',
        attrs: { data: {} },
        content: [{ type: 'text', text: 'p' }],
      }),
    );
  });

  it('applies defaults when attrs are absent', () => {
    assert.equal(
      roundTrip({ type: 'paragraph' }),
      JSON.stringify({ type: 'paragraph', attrs: { data: {} } }),
    );
  });
});

describe('stock error contracts preserved', () => {
  it('throws the stock RangeError (not TypeError) for null json', () => {
    assert.throws(
      () => metanormaSchema.nodeFromJSON(null),
      (e) => e instanceof RangeError && e.message === 'Invalid input for Node.fromJSON',
    );
  });

  it('throws the stock RangeError for a null entry inside content', () => {
    // Reachable corrupt input: Fragment.fromJSON maps each content entry
    // through schema.nodeFromJSON — the wrapper must not turn this into a
    // TypeError before the base arrow gets its chance.
    assert.throws(
      () => metanormaSchema.nodeFromJSON({ type: 'doc', content: [null] }),
      (e) => e instanceof RangeError && e.message === 'Invalid input for Node.fromJSON',
    );
  });

  it('throws the stock RangeError for null markFromJSON input', () => {
    assert.throws(
      () => metanormaSchema.markFromJSON(null),
      (e) => e instanceof RangeError && e.message === 'Invalid input for Mark.fromJSON',
    );
  });

  it('throws the stock RangeError for a null entry inside marks', () => {
    assert.throws(
      () =>
        metanormaSchema.nodeFromJSON({
          type: 'paragraph',
          attrs: {},
          content: [{ type: 'text', text: 'hi', marks: [null] }],
        }),
      (e) => e instanceof RangeError && e.message === 'Invalid input for Mark.fromJSON',
    );
  });

  it('throws the stock RangeError for unknown node and mark types', () => {
    assert.throws(
      () => metanormaSchema.nodeFromJSON({ type: 'nope' }),
      (e) => e instanceof RangeError && /nope/.test(e.message),
    );
    assert.throws(
      () => metanormaSchema.markFromJSON({ type: 'nope' }),
      (e) => e instanceof RangeError && /nope/.test(e.message),
    );
  });
});

describe('non-object data policy', () => {
  it('round-trips a non-object data verbatim when no unknown keys exist', () => {
    // Stock-identical: computeAttrs passes attr values through unvalidated,
    // so untouched passthrough must not start rejecting this input.
    assert.equal(
      roundTrip({ type: 'paragraph', attrs: { data: 'ab' } }),
      JSON.stringify({ type: 'paragraph', attrs: { data: 'ab' } }),
    );
  });

  it('throws RangeError naming the type for unknown keys + string data', () => {
    assert.throws(
      () => metanormaSchema.nodeFromJSON({ type: 'paragraph', attrs: { zz: 1, data: 'ab' } }),
      (e) =>
        e instanceof RangeError &&
        e.message.includes("'paragraph'") &&
        /non-object 'data'/i.test(e.message),
    );
  });

  it('throws RangeError for unknown keys + array data', () => {
    assert.throws(
      () => metanormaSchema.nodeFromJSON({ type: 'paragraph', attrs: { zz: 1, data: [1] } }),
      (e) => e instanceof RangeError && /non-object 'data'/i.test(e.message),
    );
  });

  it('merges null data as empty so unknowns survive', () => {
    assert.equal(
      roundTrip({ type: 'paragraph', attrs: { zz: 1, data: null } }),
      JSON.stringify({ type: 'paragraph', attrs: { data: { zz: 1 } } }),
    );
  });
});

describe('§14.12 x- editor-only attr helpers', () => {
  it('isEditorOnlyAttr: prefix match only (a)-(b)', () => {
    // true: starts with x-
    assert.equal(isEditorOnlyAttr('x-natural-width'), true);
    assert.equal(isEditorOnlyAttr('x-'), true); // bare prefix is editor-only
    // false: no x- prefix
    for (const name of ['src', 'data', 'x', 'xref', 'xmin']) {
      assert.equal(isEditorOnlyAttr(name), false, name);
    }
  });

  it('stripEditorOnlyAttrs: removes only top-level x- keys, keeps data verbatim (b)', () => {
    const input = {
      src: 'a.png',
      'x-stale': 1,
      data: { 'x-inside': 1, keep: 2 },
    };
    const snapshot = structuredClone(input);
    const out = stripEditorOnlyAttrs(input);
    // fresh object, input untouched
    assert.notEqual(out, input);
    assert.deepEqual(input, snapshot);
    // top-level x- removed; everything else kept
    assert.deepEqual(out, { src: 'a.png', data: { 'x-inside': 1, keep: 2 } });
    assert.ok(!('x-stale' in out));
    // data-interior x- keys preserved — the helper is top-level-only
    assert.deepEqual(out.data, { 'x-inside': 1, keep: 2 });
  });
});

describe('§14.12 x- load-side behavior', () => {
  it('drops undeclared top-level x- keys, still captures non-x- unknowns (c)', () => {
    assert.equal(
      roundTrip({
        type: 'paragraph',
        attrs: { 'x-stale': 1, 'untyped-key': 2 },
        content: [{ type: 'text', text: 'hi' }],
      }),
      JSON.stringify({
        type: 'paragraph',
        attrs: { data: { 'untyped-key': 2 } },
        content: [{ type: 'text', text: 'hi' }],
      }),
    );
  });

  it('keeps a DECLARED x- attr top-level through round-trip (d)', () => {
    // A custom MetanormaSchema whose paragraph declares an x- attr — the
    // happy path every future x- adoption follows (§6 rule 5).
    const schema = new MetanormaSchema({
      nodes: {
        doc: { content: 'p+' },
        p: {
          content: 'text*',
          // Declaration order matters for toJSON key order — the repo
          // convention spreads DATA_ATTR last (typed attrs first).
          attrs: { 'x-foobar': { default: null }, data: { default: {} } },
        },
        text: {},
      },
    });
    const node = schema.nodeFromJSON({
      type: 'p',
      attrs: { 'x-foobar': 42 },
      content: [{ type: 'text', text: 'hi' }],
    });
    assert.equal(node.attrs['x-foobar'], 42); // typed, top-level
    // Stringified comparison — the suite's pattern; computeAttrs builds
    // null-prototype attrs, which strict deepEqual would reject on prototype.
    assert.equal(
      JSON.stringify(node.toJSON()),
      JSON.stringify({
        type: 'p',
        attrs: { 'x-foobar': 42, data: {} },
        content: [{ type: 'text', text: 'hi' }],
      }),
    );
  });

  it('keeps a data-interior x- key verbatim (e)', () => {
    assert.equal(
      roundTrip({
        type: 'paragraph',
        attrs: { data: { 'x-inside': 1 } },
        content: [{ type: 'text', text: 'hi' }],
      }),
      JSON.stringify({
        type: 'paragraph',
        attrs: { data: { 'x-inside': 1 } },
        content: [{ type: 'text', text: 'hi' }],
      }),
    );
  });

  it('passes through x-only unknowns + non-object data (f, §12 item 4 softening)', () => {
    // The x- key is dropped by design, so the refuse-to-silently-drop
    // RangeError no longer applies — stock passthrough, verbatim re-emit.
    assert.equal(
      roundTrip({ type: 'paragraph', attrs: { 'x-stale': 1, data: 'str' } }),
      JSON.stringify({ type: 'paragraph', attrs: { data: 'str' } }),
    );
  });

  it('still throws for non-x- unknowns + non-object data, alone or mixed with x- (f)', () => {
    assert.throws(
      () => metanormaSchema.nodeFromJSON({ type: 'paragraph', attrs: { 'zz': 2, data: 'str' } }),
      (e) => e instanceof RangeError && /non-object 'data'/i.test(e.message),
    );
    assert.throws(
      () => metanormaSchema.nodeFromJSON({
        type: 'paragraph',
        attrs: { 'x-stale': 1, 'zz': 2, data: 'str' },
      }),
      (e) => e instanceof RangeError && /non-object 'data'/i.test(e.message),
    );
  });
});

// --- §8.6/§17.8 image sizing: typed-attr round-trips + toDOM specs ---------

describe('image sizing attrs round-trip (§8.6, §17.8)', () => {
  it('round-trips the full sizing axis incl. declared x-natural pair', () => {
    assert.equal(
      roundTrip({
        type: 'image',
        attrs: {
          src: 'data:image/png;base64,AAA',
          alt: 'cat',
          mimetype: 'image/png',
          width: 150,
          height: '50%',
          'x-natural-width': 3000,
          'x-natural-height': 2000,
        },
      }),
      JSON.stringify({
        type: 'image',
        attrs: {
          src: 'data:image/png;base64,AAA',
          alt: 'cat',
          mimetype: 'image/png',
          width: 150,
          height: '50%',
          'x-natural-width': 3000,
          'x-natural-height': 2000,
          data: {},
        },
      }),
    );
  });

  it('round-trips the figure role attr', () => {
    assert.equal(
      roundTrip({ type: 'figure', attrs: { id: 'f1', width: 'text-width' } }),
      JSON.stringify({ type: 'figure', attrs: { id: 'f1', number: null, width: 'text-width', data: {} } }),
    );
  });
});

describe('image/figure toDOM specs (§8.6 — headless DOMOutputSpec inspection)', () => {
  const imageToDOM = (attrs) =>
    metanormaSchema.nodes['image'].spec.toDOM(
      metanormaSchema.nodes['image'].create(attrs),
    );
  const figureToDOM = (attrs) =>
    metanormaSchema.nodes['figure'].spec.toDOM(
      metanormaSchema.nodes['figure'].create(attrs),
    );

  it('emits the full sizing attribute set — and never an x-* key', () => {
    const spec = imageToDOM({
      src: 'x.png',
      alt: 'cat',
      mimetype: 'image/png',
      width: 150,
      height: '50%',
      'x-natural-width': 3000,
      'x-natural-height': 2000,
    });
    // ['img', attrs] — leaf, no content slot.
    assert.equal(spec[0], 'img');
    assert.equal(spec.length, 2);
    assert.deepEqual(spec[1], {
      src: 'x.png',
      'data-src': 'x.png',
      alt: 'cat',
      'data-mimetype': 'image/png',
      'data-width': '150',
      'data-height': '50%',
    });
    for (const key of Object.keys(spec[1])) {
      assert.ok(!key.startsWith('x-'), `toDOM emitted editor-only key ${key}`);
    }
  });

  it('omits data-* when unset and serializes numbers formatter-canonically', () => {
    assert.deepEqual(
      imageToDOM({ src: 'x.png' })[1],
      { src: 'x.png', 'data-src': 'x.png' },
    );
    // Formatter-canonical number serialization — plain decimal at any
    // magnitude (never '1e+21').
    assert.equal(imageToDOM({ src: 'x.png', width: 1e21 })[1]['data-width'],
      '1000000000000000000000');
    assert.equal(imageToDOM({ src: 'x.png', width: 4.3 })[1]['data-width'], '4.3');
  });

  it('figure role rides the class (alongside the base) and data-width', () => {
    const spec = figureToDOM({ id: 'f1', width: 'text-width' });
    assert.equal(spec[0], 'figure');
    assert.equal(spec[1]['class'], 'mn-figure mn-figure--text-width');
    assert.equal(spec[1]['data-width'], 'text-width');
    assert.equal(spec[1]['data-id'], 'f1');

    const full = figureToDOM({ width: 'full-page-width' });
    assert.equal(full[1]['class'], 'mn-figure mn-figure--full-page-width');
    assert.equal(full[1]['data-width'], 'full-page-width');
  });

  it('role-less figure keeps the bare base class and no data-width', () => {
    const spec = figureToDOM({ id: 'f1' });
    assert.equal(spec[1]['class'], 'mn-figure');
    assert.ok(!('data-width' in spec[1]));
  });
});

describe('figure body slot — typed XOR expression (§8.6, §17.6)', () => {
  const N = metanormaSchema.nodes;
  /** A figure via createChecked (throws on invalid content). */
  const fig = (content) => N.figure.createChecked({ id: 'f1' }, content);
  const name = () => N.figure_name.create();
  const p = () => N.paragraph.create();
  const img = () => N.image.create({ src: 'x.png', mimetype: 'image/png' });

  // -- Acceptance: empty slot, and each single branch, with/without caption.

  it('accepts the empty body — caption-only (seeded/recovery state) and bare', () => {
    fig([name()]);
    fig([]);
  });

  it('accepts the image branch, with and without caption', () => {
    fig([name(), img()]);
    fig([img()]);
  });

  it('accepts a paragraph run (single and multiple), with and without caption', () => {
    fig([name(), p()]);
    fig([name(), p(), p()]);
    fig([p(), p()]);
  });

  it('accepts a subfigure run, with and without caption', () => {
    fig([name(), fig([name()])]);
    fig([fig([img()]), fig([])]);
  });

  // -- Rejection: mixed branches, repetition of the atom, foreign blocks.
  // createChecked throws RangeError('Invalid content for node figure').

  it('rejects image + paragraph in either order (the old exitName residue)', () => {
    assert.throws(() => fig([name(), img(), p()]), /Invalid content/);
    assert.throws(() => fig([name(), p(), img()]), /Invalid content/);
  });

  it('rejects two images (one atom per figure)', () => {
    assert.throws(() => fig([name(), img(), img()]), /Invalid content/);
  });

  it('rejects paragraphs + subfigures mixed', () => {
    assert.throws(() => fig([name(), p(), fig([])]), /Invalid content/);
  });

  it('rejects generic blocks in the body (table, note — Standoc-trailing kinds not yet modeled)', () => {
    const table = N.table.createChecked(null, [
      N.table_body.create(null, [N.table_row.create(null, [N.table_cell.create(null, [p()])])]),
    ]);
    assert.throws(() => fig([name(), table]), /Invalid content/);
    assert.throws(() => fig([name(), N.note.create(null, [p()])]), /Invalid content/);
  });

  // -- Leniency contract: nodeFromJSON does NOT validate figure content;
  //    doc.check() does. This asymmetry is why load-side repairs and the
  //    editor-commands doc.check() assertions exist (see figureSlot tests).

  it('nodeFromJSON accepts a schema-invalid figure silently; check() rejects it', () => {
    const bad = metanormaSchema.nodeFromJSON({
      type: 'figure',
      attrs: { id: 'f1', number: null, width: null, data: {} },
      content: [
        { type: 'figure_name', attrs: { data: {} }, content: [] },
        { type: 'image', attrs: { src: 'x.png' } },
        { type: 'paragraph', attrs: { data: {} }, content: [] },
      ],
    });
    assert.ok(bad != null); // no throw — fromJSON is content-lenient
    assert.throws(() => bad.check(), /Invalid content/);
  });
});

