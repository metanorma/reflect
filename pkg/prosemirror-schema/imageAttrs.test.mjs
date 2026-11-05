/**
 * Unit tests for imageAttrs.ts (§17.8, §6.1; §14).
 *
 * Covers every import-normalization row (image and figure variants), every
 * mimetype source including the marker path, serialization conformance for
 * formatImageSize (exponential-prone magnitudes included), the conformance
 * gate including the literal 'auto', and each guard rejection.
 *
 * Runs against the compiled JS output (`./compiled/imageAttrs.js`) under
 * plain `node --test` via Yarn PnP — same pattern as roundtrip.test.mjs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeImageSize,
  isForeignSizeValue,
  normalizeFigureWidth,
  UNKNOWN_MIMETYPE,
  inferMimetype,
  formatImageSize,
  isImageSizeConformant,
  assertValidImageAttrs,
} from './compiled/imageAttrs.js';

// --- normalizeImageSize (§17.8 import table) ------------------------------

describe('normalizeImageSize', () => {
  const rows = [
    // [input, expected]
    [null, null],
    [undefined, null],
    ['', null],
    ['auto', null],
    [' auto ', null],        // whitespace-tolerant
    ['AUTO', null],          // case-insensitive → auto ≡ absent
    ['150', 150],
    ['150px', 150],
    [' 150 px ', 150],       // inner/outer whitespace stripped
    ['4.3', 4.3],
    [150, 150],
    [4.3, 4.3],
    ['50%', '50%'],
    [' 50 % ', '50%'],
    ['50.50%', '50.5%'],     // canonical number in the percent string
    // non-positive → auto-equivalent (canonical domain is positive sizes)
    [0, null],
    [-5, null],
    ['0', null],
    ['0%', null],
    // foreign → null (banking is the caller's job, via isForeignSizeValue)
    ['10cm', null],
    ['abc', null],
    ['text-width', null],
    ['.5', null],            // grammar requires leading digits
    ['1e3', null],           // exponent strings are not ImageSize
    [NaN, null],
    [Infinity, null],
    [{}, null],
  ];
  for (const [input, expected] of rows) {
    it(`${JSON.stringify(String(input))} → ${JSON.stringify(expected)}`, () => {
      assert.equal(normalizeImageSize(input), expected);
    });
  }
});

// --- isForeignSizeValue (§17.8 banking test) -------------------------------

describe('isForeignSizeValue', () => {
  it('is foreign for non-canonical non-auto strings', () => {
    assert.equal(isForeignSizeValue('10cm'), true);
    assert.equal(isForeignSizeValue('abc'), true);
    assert.equal(isForeignSizeValue('text-width'), true);
    assert.equal(isForeignSizeValue('0'), true); // positive-only domain
  });
  it('is not foreign for auto/absent/canonical values', () => {
    assert.equal(isForeignSizeValue('auto'), false);
    assert.equal(isForeignSizeValue(' AUTO '), false);
    assert.equal(isForeignSizeValue(''), false);
    assert.equal(isForeignSizeValue(null), false);
    assert.equal(isForeignSizeValue(undefined), false);
    assert.equal(isForeignSizeValue('150'), false);
    assert.equal(isForeignSizeValue('150px'), false);
    assert.equal(isForeignSizeValue('50%'), false);
    assert.equal(isForeignSizeValue(150), false);
  });
});

// --- normalizeFigureWidth (role keywords) -----------------------------------

describe('normalizeFigureWidth', () => {
  it('maps the two keywords, whitespace-tolerant', () => {
    assert.equal(normalizeFigureWidth('text-width'), 'text-width');
    assert.equal(normalizeFigureWidth('full-page-width'), 'full-page-width');
    assert.equal(normalizeFigureWidth(' text-width '), 'text-width');
  });
  it('null for anything else — numeric and foreign values are not roles', () => {
    assert.equal(normalizeFigureWidth('60%'), null);
    assert.equal(normalizeFigureWidth('150'), null);
    assert.equal(normalizeFigureWidth('auto'), null);
    assert.equal(normalizeFigureWidth(''), null);
    assert.equal(normalizeFigureWidth(null), null);
    assert.equal(normalizeFigureWidth(150), null);
  });
});

// --- inferMimetype (total; §17.4 both populations) --------------------------

describe('inferMimetype', () => {
  it('prefers the Blob type when provided', () => {
    assert.equal(inferMimetype('https://x/y', 'image/webp'), 'image/webp');
    assert.equal(inferMimetype('data:image/png;base64,AAA', 'image/webp'), 'image/webp');
  });
  it('reads the data:-URL MIME prefix', () => {
    assert.equal(inferMimetype('data:image/png;base64,AAA'), 'image/png');
    assert.equal(inferMimetype('data:image/svg+xml;base64,AAA'), 'image/svg+xml');
    assert.equal(inferMimetype('data:image/gif,AAA'), 'image/gif');
  });
  it('skips the image/* wildcard placeholder — not a real MIME', () => {
    // No extension to fall back on in a data: URI → the marker.
    assert.equal(inferMimetype('data:image/*;base64,AAA'), UNKNOWN_MIMETYPE);
  });
  it('falls to the extension map — the URL-insert population', () => {
    assert.equal(inferMimetype('https://example.org/cat.png'), 'image/png');
    assert.equal(inferMimetype('https://example.org/cat.PNG'), 'image/png');
    assert.equal(inferMimetype('https://example.org/cat.jpg?size=large#frag'), 'image/jpeg');
    assert.equal(inferMimetype('https://example.org/a.b.jpeg'), 'image/jpeg');
    assert.equal(inferMimetype('https://example.org/dia.svg'), 'image/svg+xml');
    assert.equal(inferMimetype('https://example.org/scan.tiff'), 'image/tiff');
  });
  it('marker for unrecognized extensions and empty input', () => {
    assert.equal(inferMimetype('https://example.org/cat.bmp'), UNKNOWN_MIMETYPE);
    assert.equal(inferMimetype('https://example.org/noext'), UNKNOWN_MIMETYPE);
    assert.equal(inferMimetype(''), UNKNOWN_MIMETYPE);
    assert.equal(inferMimetype('https://example.org/x', ''), UNKNOWN_MIMETYPE);
  });
  it('is total — never returns null', () => {
    for (const source of ['', 'x', 'https://a/b.png', 'data:image/*;base64,A']) {
      const out = inferMimetype(source);
      assert.equal(typeof out, 'string');
      assert.notEqual(out, '');
    }
  });
  it('the marker is a real MIME constant (required-attr shape always holds)', () => {
    assert.equal(UNKNOWN_MIMETYPE, 'application/octet-stream');
  });
});

// --- formatImageSize (ImageSize-conformant serialization) -------------------

describe('formatImageSize', () => {
  const IMAGE_SIZE = /^\d+(\.\d+)?$/; // the grammar's numeric branch

  const rows = [
    [150, '150'],
    [1, '1'],
    [4.3, '4.3'],
    [0.5, '0.5'],
    // long fraction tail (0.1 + 0.2): plain, never exponential
    [0.1 + 0.2, '0.30000000000000004'],
    // exponential-prone magnitudes — plain decimal, never 'e+'
    [1e21, '1000000000000000000000'],
    [1.5e21, '1500000000000000000000'],
    [1e-7, '0.0000001'],
    [2.5e-8, '0.000000025'],
  ];
  for (const [input, expected] of rows) {
    it(`${String(input)} → ${expected}`, () => {
      assert.equal(formatImageSize(input), expected);
    });
  }
  it('output is always ImageSize-conformant', () => {
    for (const v of [150, 4.3, 0.1 + 0.2, 1e21, 1.5e21, 1e-7, 12345.6789]) {
      assert.match(formatImageSize(v), IMAGE_SIZE, `v=${String(v)}`);
    }
  });
  it('throws RangeError for non-positive / non-finite / non-number', () => {
    for (const bad of [0, -1, NaN, Infinity, -Infinity, '150', null]) {
      assert.throws(() => formatImageSize(bad), RangeError);
    }
  });
});

// --- isImageSizeConformant (grammar-faithful gate) --------------------------

describe('isImageSizeConformant', () => {
  it('true for decimal, percent, and the literal auto (grammar-faithful)', () => {
    assert.equal(isImageSizeConformant('150'), true);
    assert.equal(isImageSizeConformant('4.3'), true);
    assert.equal(isImageSizeConformant('50%'), true);
    assert.equal(isImageSizeConformant('auto'), true);
    assert.equal(isImageSizeConformant(' 50% '), true);
    assert.equal(isImageSizeConformant('0'), true); // grammar admits it
    assert.equal(isImageSizeConformant(150), true);
  });
  it('false for everything else', () => {
    assert.equal(isImageSizeConformant('abc'), false);
    assert.equal(isImageSizeConformant('10cm'), false);
    assert.equal(isImageSizeConformant('1e3'), false);
    assert.equal(isImageSizeConformant(''), false);
    assert.equal(isImageSizeConformant(null), false);
    assert.equal(isImageSizeConformant(undefined), false);
    assert.equal(isImageSizeConformant(0), false); // typed domain is positive
    assert.equal(isImageSizeConformant(-5), false);
    assert.equal(isImageSizeConformant({}), false);
  });
});

// --- assertValidImageAttrs (single-node shape validation) -------------------

describe('assertValidImageAttrs', () => {
  const ok = (attrs) => () => assertValidImageAttrs(attrs);

  it('accepts §14.10 partial calls — absent optionals are treated as null', () => {
    assert.doesNotThrow(ok({ src: 'x.png' }));
    assert.doesNotThrow(ok({ src: 'x.png', mimetype: null, width: null, height: null }));
  });
  it('accepts the full canonical shape', () => {
    assert.doesNotThrow(ok({
      src: 'x.png', mimetype: 'image/png', width: 150, height: '50%',
    }));
  });
  it('rejects empty/missing src', () => {
    assert.throws(ok({ src: '' }), /src/);
    assert.throws(ok({}), /src/);
    assert.throws(ok({ src: 42 }), /src/);
  });
  it('rejects a non-string, non-null mimetype', () => {
    assert.throws(ok({ src: 'x.png', mimetype: 42 }), /mimetype/);
    // null is legal — legacy/imported documents
    assert.doesNotThrow(ok({ src: 'x.png', mimetype: null }));
  });
  it('rejects bad width/height — number, percent-string, or null only', () => {
    assert.throws(ok({ src: 'x.png', width: 0 }), /width/);
    assert.throws(ok({ src: 'x.png', width: -5 }), /width/);
    assert.throws(ok({ src: 'x.png', width: NaN }), /width/);
    assert.throws(ok({ src: 'x.png', width: '150' }), /width/); // decimal strings are not canonical
    assert.throws(ok({ src: 'x.png', width: '150px' }), /width/);
    assert.throws(ok({ src: 'x.png', height: '0%' }), /height/);
    assert.throws(ok({ src: 'x.png', height: 'auto' }), /height/); // auto IS null, never the string
    assert.throws(ok({ src: 'x.png', height: {} }), /height/);
    // canonical forms pass
    assert.doesNotThrow(ok({ src: 'x.png', width: 150, height: '50%' }));
    assert.doesNotThrow(ok({ src: 'x.png', width: null, height: null }));
  });
});
