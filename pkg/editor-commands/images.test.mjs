/**
 * Unit tests for image insertion sizing wiring (images-figures.md §6.4,
 * schema.spec.md §17.4/§17.8): the `mimetype` insertion precondition and
 * the pass-through of `mimetype` / `x-natural-*` onto the created `image`
 * node.
 *
 * Patterned on captions.test.mjs: builds EditorState from JSON docs against
 * `metanormaSchema`, invokes the command headlessly with a state-apply
 * dispatch.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { metanormaSchema } from "@metanorma/prosemirror-schema";
import { insertImageIntoFigure, canInsertImageIntoFigure } from "./compiled/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** An EditorState with one `figure > figure_name("Cap")`, caret in caption. */
function stateInCaption() {
  const state = EditorState.create({
    schema: metanormaSchema,
    doc: metanormaSchema.nodeFromJSON({
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
                {
                  type: "figure",
                  attrs: { id: "f1", number: null, width: null, data: {} },
                  content: [
                    {
                      type: "figure_name",
                      attrs: { data: {} },
                      content: [{ type: "text", text: "Cap" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
  });
  // Caret at the end of the caption text.
  let captionPos = -1;
  state.doc.descendants((n, p) => {
    if (captionPos !== -1) return false;
    if (n.type.name === "figure_name" && n.childCount > 0) {
      captionPos = p + 1 + n.firstChild.nodeSize - 1;
      return false;
    }
    return true;
  });
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, captionPos)),
  );
}

/** Run the command headlessly; returns { ok, state }. */
function run(state, attrs) {
  let applied = null;
  const ok = insertImageIntoFigure(state, (tr) => {
    applied = state.apply(tr);
  }, attrs);
  return { ok, state: applied };
}

/** Find the first `image` node (or null). */
function findImage(doc) {
  let image = null;
  doc.descendants((n) => {
    if (image !== null) return false;
    if (n.type.name === "image") {
      image = n;
      return false;
    }
    return true;
  });
  return image;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("insertImageIntoFigure — sizing wiring", () => {
  it("query form stays a pure positional predicate (no attrs needed)", () => {
    const state = stateInCaption();
    assert.equal(insertImageIntoFigure(state), true);
    assert.equal(canInsertImageIntoFigure(state), true);
  });

  it("passes mimetype and x-natural-* through to the created image node", () => {
    const { ok, state } = run(stateInCaption(), {
      src: "data:image/png;base64,AAA",
      alt: "cat",
      mimetype: "image/png",
      xNaturalWidth: 3000,
      xNaturalHeight: 2000,
    });
    assert.equal(ok, true);
    const image = findImage(state.doc);
    assert.notEqual(image, null);
    assert.equal(image.attrs.src, "data:image/png;base64,AAA");
    assert.equal(image.attrs.alt, "cat");
    assert.equal(image.attrs.mimetype, "image/png");
    assert.equal(image.attrs["x-natural-width"], 3000);
    assert.equal(image.attrs["x-natural-height"], 2000);
    // Authored size attrs are NOT set by insertion (sizing is apply-time).
    assert.equal(image.attrs.width, null);
    assert.equal(image.attrs.height, null);
  });

  it("stores the UNKNOWN_MIMETYPE marker verbatim (§17.4)", () => {
    const { ok, state } = run(stateInCaption(), {
      src: "https://example.org/cat.bmp",
      mimetype: "application/octet-stream",
    });
    assert.equal(ok, true);
    assert.equal(findImage(state.doc).attrs.mimetype, "application/octet-stream");
  });

  it("nulls x-natural-* when capture failed (decode failure / SVG)", () => {
    const { ok, state } = run(stateInCaption(), {
      src: "https://example.org/cat.svg",
      mimetype: "image/svg+xml",
      xNaturalWidth: null,
      xNaturalHeight: null,
    });
    assert.equal(ok, true);
    const attrs = findImage(state.doc).attrs;
    assert.equal(attrs["x-natural-width"], null);
    assert.equal(attrs["x-natural-height"], null);
  });

  it("rejects a missing / null / empty mimetype precondition — no dispatch", () => {
    for (const attrs of [
      { src: "x.png" },
      { src: "x.png", mimetype: null },
      { src: "x.png", mimetype: "" },
      { src: "x.png", mimetype: 42 },
    ]) {
      const before = stateInCaption();
      const { ok, state } = run(before, attrs);
      assert.equal(ok, false, `attrs=${JSON.stringify(attrs)}`);
      assert.equal(state, null, "no transaction may be dispatched");
      assert.equal(findImage(before.doc), null);
    }
  });

  it("still rejects an invalid src (shape guard, §6.1)", () => {
    const { ok, state } = run(stateInCaption(), { src: "", mimetype: "image/png" });
    assert.equal(ok, false);
    assert.equal(state, null);
  });
});
