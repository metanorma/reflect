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
                attrs: { href: 'https://x', target: null, data: { zzz: 1 } },
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
