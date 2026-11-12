/**
 * Headless tests for @metanorma/file-format (FileFormat.spec.md §10).
 *
 * Run: yarn workspace @metanorma/file-format test
 * (compiles this package and @metanorma/prosemirror-schema first).
 *
 * Uses Node's built-in `node:test` + `node:assert/strict` — no test
 * framework dep. Pure JS (.mjs) so it runs directly under Node without a
 * TypeScript loader; imports from ./compiled/. The bare
 * `@metanorma/prosemirror-schema` specifier resolves through the
 * test-register/test-loader hook pair to the sibling's compiled output
 * (the real-schema round trip, §10.8).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  detectDocumentFile,
  encodeEnvelope,
  decodeEnvelope,
  CURRENT_ENVELOPE_VERSION,
  CURRENT_TREE_VERSION,
  checkRegistryContiguous,
  NotADocument,
  MalformedEnvelope,
  FutureEnvelope,
  FutureTree,
  RegistryGapError,
} from "./compiled/index.js";
import { metanormaSchema } from "@metanorma/prosemirror-schema";

const here = path.dirname(fileURLToPath(import.meta.url));
const minimalLegacy = JSON.parse(
  readFileSync(path.join(here, "fixtures/legacy/minimal.mn.json"), "utf8"),
);
const minimalEnvelope = JSON.parse(
  readFileSync(path.join(here, "fixtures/envelope-v1/minimal.mn.json"), "utf8"),
);
const isoLegacy = JSON.parse(
  readFileSync(path.join(here, "fixtures/legacy/iso-5843-6.mn.json"), "utf8"),
);

/** Build an envelope object for negative-path tests (§3). */
function mkEnvelope({
  envelope = 1,
  tree = 1,
  doc = minimalLegacy,
  meta,
  ...foreign
} = {}) {
  return {
    format: { envelope, tree },
    ...(meta !== undefined ? { meta } : {}),
    doc: structuredClone(doc),
    ...foreign,
  };
}

// --- §10.2: detection truth table ------------------------------------------

test("detection: a bare {type:\"doc\"} tree is legacy", () => {
  assert.equal(detectDocumentFile(minimalLegacy), "legacy");
});

test("detection: `format` present is an envelope — precedence over type:\"doc\"", () => {
  assert.equal(detectDocumentFile({ ...mkEnvelope(), type: "doc" }), "envelope");
});

test("detection: a well-formed envelope is an envelope", () => {
  assert.equal(detectDocumentFile(mkEnvelope()), "envelope");
});

for (const [label, value] of /** @type {[string, unknown][]} */ ([
  ["a number", 42],
  ["an array", []],
  ["null", null],
  ["a string", "doc"],
  ["an object with neither shape", { foo: 1 }],
])) {
  test(`detection: ${label} throws NotADocument`, () => {
    assert.throws(
      () => detectDocumentFile(value),
      (err) => err instanceof NotADocument && err.name === "NotADocument",
    );
  });
}

// --- §10.3: envelope validation — every malformed row, never legacy fallback -

const malformedRows = /** @type {[string, unknown][]} */ ([
  ["format is a number", { format: 3, doc: minimalLegacy }],
  ["format is null", { format: null, doc: minimalLegacy }],
  ["format is an array", { format: [], doc: minimalLegacy }],
  ["format.envelope missing", { format: { tree: 1 }, doc: minimalLegacy }],
  ["format.tree missing", { format: { envelope: 1 }, doc: minimalLegacy }],
  ["format.envelope non-integer (fractional)", mkEnvelope({ envelope: 1.5 })],
  ["format.envelope non-integer (string)", mkEnvelope({ envelope: "1" })],
  ["format.tree non-integer", mkEnvelope({ tree: 1.5 })],
  ["format.envelope < 1", mkEnvelope({ envelope: 0 })],
  ["format.tree < 1", mkEnvelope({ tree: -2 })],
  ["doc member missing", { format: { envelope: 1, tree: 1 } }],
  ["doc member not an object", mkEnvelope({ doc: 7 })],
]);

for (const [label, value] of malformedRows) {
  test(`malformed envelope: ${label} ⇒ MalformedEnvelope, never legacy fallback`, async () => {
    await assert.rejects(
      decodeEnvelope(value),
      (err) => err instanceof MalformedEnvelope && err.name === "MalformedEnvelope",
    );
  });
}

// --- §10.4: stamp round trip -------------------------------------------------

test("encodeEnvelope stamps current versions, meta.generator, and a deep-equal doc", () => {
  assert.equal(CURRENT_ENVELOPE_VERSION, 1);
  assert.equal(CURRENT_TREE_VERSION, 1);
  const tree = structuredClone(minimalLegacy);
  const frozen = JSON.stringify(tree);
  const out = encodeEnvelope(tree, { generator: "Reflect 0.1.0" });
  assert.deepEqual(out.format, { envelope: 1, tree: 1 });
  assert.deepEqual(out.meta, { generator: "Reflect 0.1.0" });
  assert.deepEqual(out.doc, minimalLegacy);
  assert.equal(JSON.stringify(tree), frozen, "the input tree object is not mutated");
  assert.notEqual(out.doc, tree, "the output tree is a copy, not an alias");
});

test("encodeEnvelope writer key order: format, meta, doc, then foreign members", () => {
  const out = encodeEnvelope(minimalLegacy, {
    generator: "Reflect 0.1.0",
    foreign: { "x-foreign": { note: "keep" } },
  });
  assert.equal(Object.keys(out).join(","), "format,meta,doc,x-foreign");
});

// --- §10.5: decode identity ---------------------------------------------------

test("decode: an envelope at current versions yields the doc member unchanged", async () => {
  const decoded = await decodeEnvelope(minimalEnvelope);
  assert.deepEqual(decoded.tree, minimalEnvelope.doc);
  assert.deepEqual(decoded.meta, { generator: "Reflect 0.1.0" });
  assert.deepEqual(decoded.foreign, {});
});

test("decode: a legacy file yields its tree as-is at the current tree version", async () => {
  const decoded = await decodeEnvelope(minimalLegacy);
  assert.deepEqual(decoded.tree, minimalLegacy);
  assert.equal(decoded.meta, null);
  assert.deepEqual(decoded.foreign, {});
});

// --- §10.6: future versions refused, both versions named ----------------------

test("future envelope version refused with both versions named", async () => {
  const future = CURRENT_ENVELOPE_VERSION + 1;
  await assert.rejects(
    decodeEnvelope(mkEnvelope({ envelope: future })),
    (err) =>
      err instanceof FutureEnvelope &&
      err.message.includes(`format.envelope ${future}`) &&
      err.message.includes(`reader's ${CURRENT_ENVELOPE_VERSION}`),
  );
});

test("future tree version refused with both versions named", async () => {
  const future = CURRENT_TREE_VERSION + 1;
  await assert.rejects(
    decodeEnvelope(mkEnvelope({ tree: future })),
    (err) =>
      err instanceof FutureTree &&
      err.message.includes(`format.tree ${future}`) &&
      err.message.includes(`reader's ${CURRENT_TREE_VERSION}`),
  );
});

// --- §10.7: foreign members and meta survive the round trip -------------------

test("a foreign top-level member survives load→save verbatim", async () => {
  const decoded = await decodeEnvelope(mkEnvelope({ "x-foreign": { note: "keep" } }));
  assert.deepEqual(decoded.foreign, { "x-foreign": { note: "keep" } });
  const reSaved = encodeEnvelope(decoded.tree, {
    generator: "Reflect 0.2.0",
    meta: decoded.meta ?? undefined,
    foreign: decoded.foreign,
  });
  assert.deepEqual(reSaved["x-foreign"], { note: "keep" });
});

test("meta survives re-save; a fresh generator merges in rather than replacing", async () => {
  const decoded = await decodeEnvelope(
    mkEnvelope({ meta: { generator: "Reflect 0.0.1", note: "hi" } }),
  );
  assert.deepEqual(decoded.meta, { generator: "Reflect 0.0.1", note: "hi" });
  const reSaved = encodeEnvelope(decoded.tree, {
    generator: "Reflect 0.2.0",
    meta: decoded.meta ?? undefined,
  });
  assert.deepEqual(reSaved.meta, { generator: "Reflect 0.2.0", note: "hi" });
});

// --- §10.8: real-schema round trip — both goldens, full §5 chain --------------

test("the enveloped golden decodes and loads through metanormaSchema.nodeFromJSON", async () => {
  const { tree } = await decodeEnvelope(minimalEnvelope);
  const node = metanormaSchema.nodeFromJSON(tree);
  assert.equal(node.type.name, "doc");
});

test("the legacy ISO golden decodes and loads through metanormaSchema.nodeFromJSON", async () => {
  const { tree } = await decodeEnvelope(isoLegacy);
  const node = metanormaSchema.nodeFromJSON(tree);
  assert.equal(node.type.name, "doc");
});

// --- §10.9: registry contiguity — direct check and the decode wiring ----------

test("contiguity (direct): a missing transition is named in the error", () => {
  assert.throws(
    () => checkRegistryContiguous([{ fromVersion: 2 }], 3, "tree"),
    (err) =>
      err instanceof RegistryGapError && /transition 1 → 2/.test(err.message),
  );
});

test("contiguity (direct): a step beyond the current version is registry drift", () => {
  assert.throws(
    () => checkRegistryContiguous([{ fromVersion: 1 }], 1, "tree"),
    (err) => err instanceof RegistryGapError,
  );
});

test("contiguity (wiring): decode self-checks the registries in use and fails the load", async () => {
  // A step claiming transition 1 → 2 while CURRENT_TREE_VERSION is 1 is a
  // drifted registry; the self-check inside decodeEnvelope must surface it.
  const drifted = [{ fromVersion: 1, strategies: {} }];
  await assert.rejects(
    decodeEnvelope(minimalEnvelope, { treeMigrations: drifted }),
    (err) => err instanceof RegistryGapError,
  );
});

test("the baseline registries are empty and decode over them is identity", async () => {
  const decoded = await decodeEnvelope(minimalEnvelope, {});
  assert.deepEqual(decoded.tree, minimalEnvelope.doc);
});
