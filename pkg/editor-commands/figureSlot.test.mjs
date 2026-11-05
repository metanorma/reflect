/**
 * Unit tests for the figure body-slot replace semantics (images-figures.md
 * §2.1, §6.4; schema.spec.md §8.6) at the RAW-TRANSFORM level.
 *
 * These document ProseMirror's replace-fitting behaviour under the typed XOR
 * figure expression (`figure_name? (image | paragraph+ | figure+)?`) — the
 * empirical facts that dictate `insertImageIntoFigure`'s whole-body
 * `replaceRangeWith` shape:
 *
 * 1. Replacing a range that already covers everything that must go (the
 *    whole body / the full paragraph run) is a trivial fit → clean
 *    `[figure_name, image]`, paragraphs deleted as part of the step.
 * 2. Caret-relative operations (replacing just the caret's block, or
 *    `replaceSelectionWith` from a caret) do NOT delete the displaced
 *    siblings — the fitter preserves them by re-homing them into NEW SIBLING
 *    FIGURES ("fission"). Every fission result is schema-valid; the failure
 *    is structural (three figures where there was one), which is exactly why
 *    `doc.check()` alone cannot guard the command shape.
 * 3. Enforcement boundaries (prosemirror-transform 1.12, verified): every
 *    transaction path — `tr.step` with a raw `ReplaceStep`, hence all
 *    Transform helpers — VALIDATES the post-step document and throws
 *    `TransformError` on an XOR violation; `replaceRangeWith`/`insert`
 *    avoid the throw by fitting (repairing or refusing). The genuinely
 *    lenient surface is `nodeFromJSON` (schema round-trip suite locks that
 *    in): a stored invalid figure loads without error and only
 *    `doc.check()` detects it. Commands never touch raw steps, so they
 *    never see the throw.
 *
 * Patterned on captions.test.mjs: builds EditorState from JSON docs against
 * `metanormaSchema`, applies raw transactions headlessly.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { Fragment, Slice } from "prosemirror-model";
import { ReplaceStep } from "prosemirror-transform";
import { metanormaSchema } from "@metanorma/prosemirror-schema";
import { insertImageIntoFigure } from "./compiled/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IMAGE = { src: "x.png", mimetype: "image/png" };

/** A doc whose clause holds exactly one figure with the given children. */
function docWith(figureChildren) {
  return metanormaSchema.nodeFromJSON({
    type: "doc",
    content: [
      { type: "bibdata", attrs: { item: null, data: {} } },
      {
        type: "sections",
        content: [
          {
            type: "clause",
            attrs: { id: "c1", number: null, data: {} },
            content: [
              { type: "section_title", attrs: { data: {} }, content: [{ type: "text", text: "C" }] },
              { type: "figure", attrs: { id: "f1", number: null, width: null, data: {} }, content: figureChildren },
              { type: "paragraph", attrs: { data: {} }, content: [{ type: "text", text: "after" }] },
            ],
          },
        ],
      },
    ],
  });
}

const name = (t) => ({ type: "figure_name", attrs: { data: {} }, content: t ? [{ type: "text", text: t }] : [] });
const p = (t) => ({ type: "paragraph", attrs: { data: {} }, content: t ? [{ type: "text", text: t }] : [] });

/** The first figure node and its position in the doc. */
function firstFigure(doc) {
  let fig = null;
  let pos = -1;
  doc.descendants((n, q) => {
    if (fig !== null) return false;
    if (n.type.name === "figure") { fig = n; pos = q; return false; }
    return true;
  });
  return { fig, pos };
}

/** The figure's body range: [bodyFrom, bodyTo) — everything after figure_name. */
function bodyRange(doc) {
  const { fig, pos } = firstFigure(doc);
  const caption = fig.firstChild !== null && fig.firstChild.type.name === "figure_name";
  const captionSize = caption ? fig.firstChild.nodeSize : 0;
  return [pos + 1 + captionSize, pos + fig.nodeSize - 1];
}

/** The exact node range of the figure's nth child (0-based, caption included). */
function childRange(doc, index) {
  const { fig, pos } = firstFigure(doc);
  let at = pos + 1;
  for (let i = 0; i < index; i++) at += fig.child(i).nodeSize;
  return [at, at + fig.child(index).nodeSize];
}

/** Count figures in the doc. */
function figureCount(doc) {
  let n = 0;
  doc.descendants((node) => {
    if (node.type.name === "figure") n += 1;
    return true;
  });
  return n;
}

/** Child type names of the first figure. */
function childNames(doc) {
  const { fig } = firstFigure(doc);
  const names = [];
  fig.forEach((c) => names.push(c.type.name));
  return names;
}

function stateOn(doc, pos) {
  return EditorState.create({
    schema: metanormaSchema,
    doc,
    selection: TextSelection.create(doc, pos),
  });
}

// ---------------------------------------------------------------------------
// 1. Whole-body replacement — the clean shape
// ---------------------------------------------------------------------------

describe("figure slot: whole-body replaceRangeWith (the command's shape)", () => {
  const imageNode = () => metanormaSchema.nodes.image.create(IMAGE);

  it("empty body: fill — [figure_name] → [figure_name, image]", () => {
    const doc = docWith([name("Cap")]);
    const [from, to] = bodyRange(doc);
    const tr = EditorState.create({ schema: metanormaSchema, doc }).tr;
    tr.replaceRangeWith(from, to, imageNode());
    assert.deepEqual(childNames(tr.doc), ["figure_name", "image"]);
    assert.doesNotThrow(() => tr.doc.check());
  });

  it("sole paragraph: replace — [figure_name, p] → [figure_name, image]", () => {
    const doc = docWith([name("Cap"), p("only")]);
    const [from, to] = bodyRange(doc);
    const tr = EditorState.create({ schema: metanormaSchema, doc }).tr;
    tr.replaceRangeWith(from, to, imageNode());
    assert.deepEqual(childNames(tr.doc), ["figure_name", "image"]);
    assert.equal(tr.doc.textContent.includes("only"), false);
    assert.doesNotThrow(() => tr.doc.check());
  });

  it("paragraph run: whole run replaced in ONE step", () => {
    const doc = docWith([name("Cap"), p("p1"), p("p2")]);
    const [from, to] = bodyRange(doc);
    const tr = EditorState.create({ schema: metanormaSchema, doc }).tr;
    tr.replaceRangeWith(from, to, imageNode());
    assert.deepEqual(childNames(tr.doc), ["figure_name", "image"]);
    assert.equal(tr.doc.textContent.includes("p1"), false);
    assert.equal(tr.doc.textContent.includes("p2"), false);
    assert.doesNotThrow(() => tr.doc.check());
  });

  it("insertImageIntoFigure itself never fissions (paragraph run, one figure in/out)", () => {
    const doc = docWith([name("Cap"), p("p1"), p("p2")]);
    const { pos } = firstFigure(doc);
    const state = stateOn(doc, pos + 1); // caret in caption
    let applied = null;
    const ok = insertImageIntoFigure(state, (tr) => {
      applied = state.apply(tr);
    }, { src: "x.png", alt: null, mimetype: "image/png" });
    assert.equal(ok, true);
    assert.equal(figureCount(applied.doc), 1, "no sibling figures created");
    assert.deepEqual(childNames(applied.doc), ["figure_name", "image"]);
  });
});

// ---------------------------------------------------------------------------
// 2. Caret-relative operations fission — why the command must not use them
// ---------------------------------------------------------------------------

describe("figure slot: caret-relative ops fission (documented, not used)", () => {
  const imageNode = () => metanormaSchema.nodes.image.create(IMAGE);

  it("replacing ONLY the caret's block re-homes the sibling into a new figure", () => {
    const doc = docWith([name("Cap"), p("p1"), p("p2")]);
    const [from, to] = childRange(doc, 1); // p1's exact node range
    const tr = EditorState.create({ schema: metanormaSchema, doc }).tr;
    tr.replaceRangeWith(from, to, imageNode());
    // Fission: p2 survives — re-homed into a NEW sibling figure. Valid doc,
    // wrong structure (two figures where there was one).
    assert.equal(figureCount(tr.doc), 2, "displaced paragraph re-homed into a new figure");
    assert.doesNotThrow(() => tr.doc.check(), "fission output is schema-valid — the failure is structural");
    assert.equal(tr.doc.textContent.includes("p2"), true, "content preserved, not deleted");
  });

  it("replaceSelectionWith from a caret in the body splits the figure", () => {
    const doc = docWith([name("Cap"), p("p1"), p("p2")]);
    const { pos } = firstFigure(doc);
    const state = stateOn(doc, pos + 1 + 5 + 1); // caret inside p1's text
    const tr = state.tr.replaceSelectionWith(imageNode());
    assert.ok(figureCount(tr.doc) >= 2, "figure fission, not in-place fill");
    assert.doesNotThrow(() => tr.doc.check());
    assert.equal(tr.doc.textContent.includes("p1"), true);
    assert.equal(tr.doc.textContent.includes("p2"), true);
  });
});

// ---------------------------------------------------------------------------
// 3. Steps are not schema-validated — tr.insert builds invalid docs silently
// ---------------------------------------------------------------------------

describe("figure slot: enforcement boundaries", () => {
  it("a raw ReplaceStep beside a paragraph THROWS (step-level validation)", () => {
    const doc = docWith([name("Cap"), p("x")]);
    const [from] = bodyRange(doc);
    const tr = EditorState.create({ schema: metanormaSchema, doc }).tr;
    const image = metanormaSchema.nodes.image.create(IMAGE);
    assert.throws(
      () => tr.step(new ReplaceStep(from, from, new Slice(Fragment.from(image), 0, 0))),
      /Invalid content for node figure/,
    );
    assert.equal(tr.docChanged, false, "nothing applied");
  });

  it("nodeFromJSON accepts the same invalid shape silently; check() rejects it", () => {
    // The lenient surface is JSON load — paired here with the step-level
    // throw above (the schema round-trip suite holds the full contract).
    const bad = metanormaSchema.nodeFromJSON({
      type: "figure",
      attrs: { id: "f9", number: null, width: null, data: {} },
      content: [
        { type: "figure_name", attrs: { data: {} }, content: [] },
        { type: "image", attrs: { src: "x.png" } },
        { type: "paragraph", attrs: { data: {} }, content: [] },
      ],
    });
    assert.ok(bad != null); // no throw
    assert.throws(() => bad.check(), /Invalid content/);
  });
});
