/**
 * Unit tests for the caption feature: `exitName` (Enter in
 * `figure_name`/`table_name`), the §4.4.9b empty-caption Backspace guard,
 * two-stage figure authoring (`insertFigure` / `insertImageIntoFigure`), and
 * the caption-aware `bodyBlockContext` predicates.
 *
 * Patterned on sections.test.mjs: builds EditorState from JSON docs against
 * `metanormaSchema`, invokes commands headlessly with a state-apply dispatch.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection, NodeSelection } from "prosemirror-state";
import { metanormaSchema } from "@metanorma/prosemirror-schema";
import {
  exitName,
  exitContainerBlock,
  createParagraphNear,
  emptyTextblockBackspace,
  insertTable,
  insertFigure,
  canInsertFigure,
  insertImageIntoFigure,
  canInsertImageIntoFigure,
  canInsertTable,
} from "./compiled/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an EditorState whose doc is a clause with the given children. */
function stateWith(children) {
  return EditorState.create({
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
                ...children,
              ],
            },
          ],
        },
      ],
    }),
  });
}

/** A 1x1 table with a caption. */
function tableNode(captionText) {
  return {
    type: "table",
    attrs: { id: "t1", number: null, data: {} },
    content: [
      { type: "table_name", attrs: { data: {} }, content: captionText ? [{ type: "text", text: captionText }] : [] },
      {
        type: "table_body",
        content: [
          {
            type: "table_row",
            content: [
              {
                type: "table_cell",
                attrs: { colspan: 1, rowspan: 1, data: {} },
                content: [{ type: "paragraph", attrs: { data: {} }, content: [{ type: "text", text: "cell" }] }],
              },
            ],
          },
        ],
      },
    ],
  };
}

/** A figure with a caption, optionally its image, and optional extra children. */
function figureNode(captionText, withImage, extraChildren = []) {
  const content = [
    { type: "figure_name", attrs: { data: {} }, content: captionText ? [{ type: "text", text: captionText }] : [] },
  ];
  if (withImage) {
    content.push({ type: "image", attrs: { src: "x.png", alt: null, data: {} } });
  }
  content.push(...extraChildren);
  return { type: "figure", attrs: { id: "f1", number: null, data: {} }, content };
}

/** Names of a figure's direct children (assertion helper). */
function figureChildNames(figNode) {
  const names = [];
  figNode.forEach((c) => names.push(c.type.name));
  return names;
}

/**
 * Apply a command with a dispatch that applies the transaction back into a
 * mutable state; returns { fired, state }. Standing validity gate: any
 * dispatched transaction must leave a schema-valid document (`nodeFromJSON`
 * is content-lenient; `check()` is not — sequence assertions alone cannot
 * see invalid documents).
 */
function run(command, state) {
  let s = state;
  let fired = false;
  const ok = command(s, (tr) => {
    s = s.apply(tr);
    fired = true;
  });
  if (fired) {
    assert.doesNotThrow(() => s.doc.check(), "command produced an invalid document");
  }
  return { ok, fired, state: s };
}

/** Put the TextSelection at a text offset inside a named textblock child. */
function selectIn(state, blockIndex, offset) {
  // Walk the clause's direct children to find the block's start, then descend
  // into its inline content by `offset`.
  const clause = state.doc.content.content[1].content.content[0];
  let pos = 0;
  for (let i = 0; i < blockIndex; i++) pos += clause.child(i).nodeSize;
  const block = clause.child(blockIndex);
  // Absolute: doc(0) bibdata(1) sections(1) clause(1) => clause content start.
  let abs = 4 + pos + 1; // doc open + bibdata + sections + clause opens... computed below
  // Compute precisely instead: find the block by node reference.
  abs = 0; // resolved below via descendent traversal
  let found = -1;
  state.doc.descendants((node, p) => {
    if (found !== -1) return false;
    if (node === block) { found = p; return false; }
    return true;
  });
  assert.notStrictEqual(found, -1, "block not found");
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, found + 1 + offset)),
  );
}

/** Find the first position whose parent textblock has the given type name. */
function posInFirst(state, typeName) {
  let found = -1;
  state.doc.descendants((node, p) => {
    if (found !== -1) return false;
    if (node.type.name === typeName) { found = p + 1; return false; }
    return true;
  });
  assert.notStrictEqual(found, -1, `no ${typeName} found`);
  return found;
}

// ---------------------------------------------------------------------------
// exitName — Enter in table_name
// ---------------------------------------------------------------------------

describe("exitName: table_name", () => {
  it("moves the cursor into the first cell's paragraph (no split)", () => {
    let state = stateWith([tableNode("Cap")]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "table_name"))),
    );
    const { fired, state: after } = run(exitName, state);
    assert.equal(fired, true);
    assert.equal(after.selection.$from.parent.type.name, "paragraph");
    assert.equal(after.selection.$from.parentOffset, 0);
    // Cursor inside the table (first cell), verified by ancestor names.
    const ancestors = [];
    for (let d = after.selection.$from.depth; d >= 1; d--) {
      ancestors.push(after.selection.$from.node(d).type.name);
    }
    assert.ok(ancestors.includes("table_cell"), "cursor inside a cell");
    // Table structure unchanged: still one caption.
    let captionCount = 0;
    after.doc.descendants((n) => { if (n.type.name === "table_name") captionCount++; return true; });
    assert.equal(captionCount, 1);
  });

  it("is not applicable outside a caption", () => {
    let state = stateWith([{ type: "paragraph", attrs: { data: {} }, content: [{ type: "text", text: "p" }] }]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "paragraph"))),
    );
    const { ok, fired } = run(exitName, state);
    assert.equal(ok, false);
    assert.equal(fired, false);
  });
});

// ---------------------------------------------------------------------------
// exitName — Enter in figure_name
// ---------------------------------------------------------------------------

describe("exitName: figure_name", () => {
  it("with a following paragraph: cursor moves to that paragraph's start", () => {
    let state = stateWith([
      figureNode("Cap", false),
      { type: "paragraph", attrs: { data: {} }, content: [{ type: "text", text: "after" }] },
    ]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "figure_name"))),
    );
    const { fired, state: after } = run(exitName, state);
    assert.equal(fired, true);
    assert.equal(after.selection.$from.parent.type.name, "paragraph");
    // The landing rule looks at siblings INSIDE the figure: none can hold a
    // cursor, so an empty paragraph is inserted inside the figure after the
    // caption (the trailing clause paragraph is NOT jumped to).
    const fig = after.doc.content.content[1].content.content[0].child(1);
    assert.equal(fig.type.name, "figure");
    const names = [];
    fig.forEach((c) => names.push(c.type.name));
    assert.deepEqual(names, ["figure_name", "paragraph"]);
    assert.equal(after.doc.textContent.includes("after"), true);
  });

  it("with only the image following: EXITS the figure — paragraph lands after it", () => {
    let state = stateWith([figureNode("Cap", true)]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "figure_name"))),
    );
    const { fired, state: after } = run(exitName, state);
    assert.equal(fired, true);
    const clause = after.doc.content.content[1].content.content[0];
    // Clause: [section_title, figure, paragraph] — a paragraph INSIDE the
    // figure would violate the body-slot XOR; the exit lands outside.
    assert.deepEqual(clauseChildNames(clause), ["section_title", "figure", "paragraph"]);
    const fig = clause.child(1);
    assert.deepEqual(figureChildNames(fig), ["figure_name", "image"]);
    assert.equal(after.selection.$from.parent.type.name, "paragraph");
    for (let d = after.selection.$from.depth; d >= 1; d--) {
      assert.notEqual(
        after.selection.$from.node(d).type.name,
        "figure",
        "cursor must be outside the figure",
      );
    }
  });

  it("as last child of an empty figure: inserts a paragraph after the caption", () => {
    let state = stateWith([figureNode("Cap", false)]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "figure_name"))),
    );
    const { fired, state: after } = run(exitName, state);
    assert.equal(fired, true);
    const fig = after.doc.content.content[1].content.content[0].child(1);
    const names = [];
    fig.forEach((c) => names.push(c.type.name));
    assert.deepEqual(names, ["figure_name", "paragraph"]);
    assert.equal(after.selection.$from.parent.type.name, "paragraph");
  });
});

// ---------------------------------------------------------------------------
// emptyTextblockBackspace — caption guard (§4.4.9b)
// ---------------------------------------------------------------------------

describe("emptyTextblockBackspace: captions", () => {
  it("figure with image: deletes only the caption, image intact", () => {
    let state = stateWith([figureNode("", true)]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "figure_name"))),
    );
    const { fired, state: after } = run(emptyTextblockBackspace, state);
    assert.equal(fired, true);
    const fig = after.doc.content.content[1].content.content[0].child(1);
    const names = [];
    fig.forEach((c) => names.push(c.type.name));
    assert.deepEqual(names, ["image"]);
  });

  it("caption-only figure: deletes the whole figure", () => {
    let state = stateWith([
      figureNode("", false),
      { type: "paragraph", attrs: { data: {} }, content: [{ type: "text", text: "tail" }] },
    ]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "figure_name"))),
    );
    const { fired, state: after } = run(emptyTextblockBackspace, state);
    assert.equal(fired, true);
    let sawFigure = false;
    after.doc.descendants((n) => { if (n.type.name === "figure") sawFigure = true; return true; });
    assert.equal(sawFigure, false);
    assert.equal(after.doc.textContent.includes("tail"), true);
  });

  it("table caption: deletes only the caption, table intact", () => {
    let state = stateWith([tableNode("")]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "table_name"))),
    );
    const { fired, state: after } = run(emptyTextblockBackspace, state);
    assert.equal(fired, true);
    let sawTable = false, sawCaption = false;
    after.doc.descendants((n) => {
      if (n.type.name === "table") sawTable = true;
      if (n.type.name === "table_name") sawCaption = true;
      return true;
    });
    assert.equal(sawTable, true, "table survives");
    assert.equal(sawCaption, false, "caption deleted");
    assert.equal(after.doc.textContent.includes("cell"), true, "cell content survives");
  });
});

// ---------------------------------------------------------------------------
// Insertion seeding
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Two-stage figure authoring — insertFigure
// ---------------------------------------------------------------------------

describe("insertFigure", () => {
  it("query/dispatch parity from a plain paragraph", () => {
    let state = stateWith([{ type: "paragraph", attrs: { data: {} } }]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "paragraph"))),
    );
    assert.equal(canInsertFigure(state), true);
    assert.equal(insertFigure(state), true, "query form matches predicate");
  });

  it("empty-textblock replace: no paragraph residue, cursor in the caption", () => {
    let state = stateWith([{ type: "paragraph", attrs: { data: {} } }]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "paragraph"))),
    );
    const { ok, state: after } = run(insertFigure, state);
    assert.equal(ok, true);
    // Clause children: [section_title, figure] — the empty paragraph is
    // REPLACED by the figure (no empty-paragraph residue).
    const clause = after.doc.content.content[1].content.content[0];
    assert.deepEqual(clauseChildNames(clause), ["section_title", "figure"]);
    const fig = clause.child(1);
    assert.equal(fig.type.name, "figure");
    assert.deepEqual(figureChildNames(fig), ["figure_name"]);
    assert.notEqual(fig.attrs.id, null, "figure id generated");
    // Cursor inside the seeded caption.
    assert.equal(after.selection.$from.parent.type.name, "figure_name");
    assert.equal(after.selection.$from.node(after.selection.$from.depth - 1).type.name, "figure");
  });

  it("non-empty split: halves around the figure, cursor in the caption", () => {
    let state = stateWith([
      { type: "paragraph", attrs: { data: {} }, content: [{ type: "text", text: "helloworld" }] },
    ]);
    // Cursor after "hello" (offset 5) — replaceSelectionWith splits the block.
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "paragraph") + 5)),
    );
    assert.equal(canInsertFigure(state), true);
    const { ok, state: after } = run(insertFigure, state);
    assert.equal(ok, true);
    const clause = after.doc.content.content[1].content.content[0];
    assert.deepEqual(
      clauseChildNames(clause),
      ["section_title", "paragraph", "figure", "paragraph"],
    );
    assert.equal(clause.child(1).textContent, "hello");
    assert.equal(clause.child(3).textContent, "world");
    assert.deepEqual(figureChildNames(clause.child(2)), ["figure_name"]);
    // Cursor inside the seeded caption — not in either text half.
    assert.equal(after.selection.$from.parent.type.name, "figure_name");
  });

  it("is false with the cursor inside a caption", () => {
    let state = stateWith([figureNode("", true)]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "figure_name"))),
    );
    assert.equal(canInsertFigure(state), false);
    assert.equal(insertFigure(state), false);
    const { ok, fired } = run(insertFigure, state);
    assert.equal(ok, false);
    assert.equal(fired, false, "nothing dispatched");
  });

  it("nesting refusal: false inside a figure's paragraph", () => {
    const paraInFigure = { type: "paragraph", attrs: { data: {} }, content: [{ type: "text", text: "in fig" }] };
    let state = stateWith([figureNode("Cap", false, [paraInFigure])]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "paragraph"))),
    );
    // Cursor IS inside the figure (ancestor check), so insertion is refused.
    assert.equal(canInsertFigure(state), false);
    assert.equal(insertFigure(state), false);
    const { ok, fired } = run(insertFigure, state);
    assert.equal(ok, false);
    assert.equal(fired, false, "nothing dispatched");
  });

  it("insertTable seeds table_name and lands the cursor in it", () => {
    let state = stateWith([{ type: "paragraph", attrs: { data: {} } }]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "paragraph"))),
    );
    const { ok, state: after } = run((s, d) => insertTable(s, d, 2, 2), state);
    assert.equal(ok, true);
    assert.equal(after.selection.$from.parent.type.name, "table_name");
    const tbl = after.selection.$from.node(after.selection.$from.depth - 1);
    assert.equal(tbl.type.name, "table");
  });
});

/** Direct-child type names of the clause (assertion helper). */
function clauseChildNames(clause) {
  const names = [];
  clause.forEach((c) => names.push(c.type.name));
  return names;
}

// ---------------------------------------------------------------------------
// Two-stage figure authoring — insertImageIntoFigure
// ---------------------------------------------------------------------------

describe("insertImageIntoFigure", () => {
  it("happy path: adds the image after the caption with src/alt", () => {
    let state = stateWith([figureNode("", false)]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "figure_name"))),
    );
    assert.equal(canInsertImageIntoFigure(state), true);
    const { ok, state: after } = run(
      (s, d) => insertImageIntoFigure(s, d, { src: "a.png", alt: "alt text", mimetype: "image/png" }),
      state,
    );
    assert.equal(ok, true);
    const fig = after.doc.content.content[1].content.content[0].child(1);
    assert.deepEqual(figureChildNames(fig), ["figure_name", "image"]);
    const img = fig.child(1);
    assert.equal(img.attrs.src, "a.png");
    assert.equal(img.attrs.alt, "alt text");
    // Selection unchanged (still in the caption).
    assert.equal(after.selection.$from.parent.type.name, "figure_name");
  });

  it("query/dispatch parity inside an image-less figure", () => {
    let state = stateWith([figureNode("Cap", false)]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "figure_name"))),
    );
    assert.equal(insertImageIntoFigure(state), true, "query form matches predicate");
  });

  it("text-branch figure: the image REPLACES the paragraph run (silent, undoable)", () => {
    // [figure_name, paragraph("residue")] — the text branch.
    const para = { type: "paragraph", attrs: { data: {} }, content: [{ type: "text", text: "residue" }] };
    let state = stateWith([figureNode("Cap", false, [para])]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "figure_name"))),
    );
    assert.equal(canInsertImageIntoFigure(state), true);
    const { ok, state: after } = run(
      (s, d) => insertImageIntoFigure(s, d, { src: "b.png", alt: null, mimetype: "image/png" }),
      state,
    );
    assert.equal(ok, true);
    const fig = after.doc.content.content[1].content.content[0].child(1);
    // Whole-slot replacement: the paragraph run is gone, the image IS the
    // body (images-figures.md §6.4).
    assert.deepEqual(figureChildNames(fig), ["figure_name", "image"]);
    assert.equal(after.doc.textContent.includes("residue"), false);
    assert.equal(after.selection.$from.parent.type.name, "figure_name");
  });

  it("caption-less figure (parsed doc): the image replaces the paragraph body", () => {
    const para = { type: "paragraph", attrs: { data: {} }, content: [{ type: "text", text: "body" }] };
    const figNoCaption = {
      type: "figure",
      attrs: { id: "f2", number: null, data: {} },
      content: [para],
    };
    let state = stateWith([figNoCaption]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "paragraph"))),
    );
    assert.equal(canInsertImageIntoFigure(state), true);
    const { ok, state: after } = run(
      (s, d) => insertImageIntoFigure(s, d, { src: "c.png", alt: null, mimetype: "image/png" }),
      state,
    );
    assert.equal(ok, true);
    const fig = after.doc.content.content[1].content.content[0].child(1);
    assert.deepEqual(figureChildNames(fig), ["image"]);
    // No caption: the caret lands just after the figure.
    assert.equal(after.selection.$from.node(after.selection.$from.depth - 1).type.name, "clause");
  });

  it("false on empty src (assertValidImageAttrs guard)", () => {
    let state = stateWith([figureNode("", false)]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "figure_name"))),
    );
    const { ok, fired } = run(
      (s, d) => insertImageIntoFigure(s, d, { src: "", alt: null }),
      state,
    );
    assert.equal(ok, false);
    assert.equal(fired, false, "nothing dispatched");
  });

  it("false outside any figure", () => {
    let state = stateWith([
      { type: "paragraph", attrs: { data: {} }, content: [{ type: "text", text: "plain" }] },
    ]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "paragraph"))),
    );
    assert.equal(canInsertImageIntoFigure(state), false);
    const { ok, fired } = run(
      (s, d) => insertImageIntoFigure(s, d, { src: "a.png", alt: null, mimetype: "image/png" }),
      state,
    );
    assert.equal(ok, false);
    assert.equal(fired, false, "nothing dispatched");
  });

  it("false when the figure already has an image (one image per figure)", () => {
    let state = stateWith([figureNode("", true)]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "figure_name"))),
    );
    assert.equal(canInsertImageIntoFigure(state), false);
    const { ok, fired } = run(
      (s, d) => insertImageIntoFigure(s, d, { src: "b.png", alt: null, mimetype: "image/png" }),
      state,
    );
    assert.equal(ok, false);
    assert.equal(fired, false, "nothing dispatched");
  });

  it("recovery: delete the image atom, figure regains image-less state, refill", () => {
    let state = stateWith([figureNode("", true)]);
    // Node-select the image atom (find its position, NodeSelection on it).
    let imgPos = -1;
    state.doc.descendants((n, p) => {
      if (imgPos !== -1) return false;
      if (n.type.name === "image") { imgPos = p; return false; }
      return true;
    });
    assert.notEqual(imgPos, -1);
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, imgPos)));
    const { state: afterDelete } = run((s, d) => d(s.tr.deleteSelection()), state);
    const fig = afterDelete.doc.content.content[1].content.content[0].child(1);
    assert.deepEqual(figureChildNames(fig), ["figure_name"], "figure back to caption-only");
    // With the caret inside the emptied figure, the button re-enables.
    let restored = afterDelete.apply(
      afterDelete.tr.setSelection(
        TextSelection.create(afterDelete.doc, posInFirst(afterDelete, "figure_name")),
      ),
    );
    assert.equal(canInsertImageIntoFigure(restored), true);
    const { ok, state: afterRefill } = run(
      (s, d) => insertImageIntoFigure(s, d, { src: "new.png", alt: null, mimetype: "image/png" }),
      restored,
    );
    assert.equal(ok, true);
    const fig2 = afterRefill.doc.content.content[1].content.content[0].child(1);
    assert.deepEqual(figureChildNames(fig2), ["figure_name", "image"]);
    assert.equal(fig2.child(1).attrs.src, "new.png");
  });
});

// ---------------------------------------------------------------------------
// Predicates: captions are not body content
// ---------------------------------------------------------------------------

describe("caption-aware predicates", () => {
  it("canInsertTable is false with the cursor in a table_name", () => {
    let state = stateWith([tableNode("")]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "table_name"))),
    );
    assert.equal(canInsertTable(state), false);
  });

  it("canInsertFigure is false with the cursor in a figure_name", () => {
    let state = stateWith([figureNode("", true)]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "figure_name"))),
    );
    assert.equal(canInsertFigure(state), false);
  });

  it("strong mark applies inside both caption types", () => {
    const strong = metanormaSchema.marks["strong"];
    const figCap = metanormaSchema.nodeFromJSON({
      type: "figure_name",
      attrs: { data: {} },
      content: [{ type: "text", text: "cap", marks: [{ type: "strong" }] }],
    });
    assert.equal(figCap.content.firstChild.marks[0].type, strong);
    const tblCap = metanormaSchema.nodeFromJSON({
      type: "table_name",
      attrs: { data: {} },
      content: [{ type: "text", text: "cap", marks: [{ type: "strong" }] }],
    });
    assert.equal(tblCap.content.firstChild.marks[0].type, strong);
  });
});

// ---------------------------------------------------------------------------
// Nested figures (imported subfigures) — exit targets and slot refusal
// ---------------------------------------------------------------------------

/** A clause holding a parent figure whose body is a subfigure `figure+` run. */
function subfigureDoc(subfigureContent) {
  return [
    {
      type: "figure",
      attrs: { id: "outer", number: null, width: null, data: {} },
      content: [
        { type: "figure_name", attrs: { data: {} }, content: [{ type: "text", text: "Outer" }] },
        {
          type: "figure",
          attrs: { id: "sub", number: null, width: null, data: {} },
          content: subfigureContent,
        },
      ],
    },
  ];
}

describe("nested figures: exit targets walk past the figure+ run", () => {
  it("regression: plain note exit — trailing empty paragraph lifts out (first unit coverage)", () => {
    // The inLastBlockOfContainer position check was dead at HEAD (content
    // ends differ by the textblock's close token); this locks the fix in.
    const note = {
      type: "note",
      attrs: { data: {} },
      content: [
        { type: "paragraph", attrs: { data: {} }, content: [{ type: "text", text: "note body" }] },
        { type: "paragraph", attrs: { data: {} }, content: [] },
      ],
    };
    let state = stateWith([note]);
    let lastParaPos = -1;
    let paraCount = 0;
    state.doc.descendants((n, p) => {
      if (n.type.name === "paragraph") { paraCount += 1; }
      return true;
    });
    // Caret in the LAST paragraph (the second one).
    state.doc.descendants((n, p) => {
      if (n.type.name === "paragraph") {
        lastParaPos = p + 1;
      }
      return true;
    });
    assert.equal(paraCount, 2);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, lastParaPos)));
    const { fired, state: after } = run(exitContainerBlock, state);
    assert.equal(fired, true);
    const clause = after.doc.content.content[1].content.content[0];
    // Note survives with its content; an empty paragraph follows it.
    assert.deepEqual(clauseChildNames(clause), ["section_title", "note", "paragraph"]);
    assert.equal(clause.child(1).textContent, "note body");
    assert.equal(after.selection.$from.parent.type.name, "paragraph");
    for (let d = after.selection.$from.depth; d >= 1; d--) {
      assert.notEqual(after.selection.$from.node(d).type.name, "note", "cursor outside the note");
    }
  });

  it("exitName in an image-bearing subfigure caption: paragraph lands after the OUTER figure", () => {
    // sub = [figure_name("Sub"), image]; parent = [figure_name("Outer"), sub]
    let state = stateWith(subfigureDoc([
      { type: "figure_name", attrs: { data: {} }, content: [{ type: "text", text: "Sub" }] },
      { type: "image", attrs: { src: "x.png", alt: null, data: {} } },
    ]));
    // Caret in the SUBFIGURE's caption (the second figure_name in the doc).
    let captionPos = -1;
    let seen = 0;
    state.doc.descendants((n, p) => {
      if (n.type.name === "figure_name") {
        seen += 1;
        if (seen === 2) { captionPos = p + 1; return false; }
      }
      return true;
    });
    assert.notEqual(captionPos, -1);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, captionPos)));
    const { fired, state: after } = run(exitName, state);
    assert.equal(fired, true);
    const clause = after.doc.content.content[1].content.content[0];
    // The paragraph is a CLAUSE child (after the outer figure) — a paragraph
    // inside the parent's figure+ run would be schema-invalid.
    assert.deepEqual(clauseChildNames(clause), ["section_title", "figure", "paragraph"]);
    const outer = clause.child(1);
    assert.deepEqual(figureChildNames(outer), ["figure_name", "figure"]);
    assert.deepEqual(figureChildNames(outer.child(1)), ["figure_name", "image"]);
    assert.equal(after.selection.$from.parent.type.name, "paragraph");
  });

  it("exitContainerBlock in a subfigure's trailing paragraph: lifts to the clause", () => {
    // sub = [figure_name("Sub"), paragraph()] — caret in the empty paragraph.
    let state = stateWith(subfigureDoc([
      { type: "figure_name", attrs: { data: {} }, content: [{ type: "text", text: "Sub" }] },
      { type: "paragraph", attrs: { data: {} }, content: [] },
    ]));
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "paragraph"))),
    );
    const { fired, state: after } = run(exitContainerBlock, state);
    assert.equal(fired, true);
    const clause = after.doc.content.content[1].content.content[0];
    assert.deepEqual(clauseChildNames(clause), ["section_title", "figure", "paragraph"]);
    const outer = clause.child(1);
    // The subfigure survives, its trailing paragraph gone (empty slot again).
    assert.deepEqual(figureChildNames(outer), ["figure_name", "figure"]);
    assert.deepEqual(figureChildNames(outer.child(1)), ["figure_name"]);
    assert.equal(after.selection.$from.parent.type.name, "paragraph");
  });

  it("insertImageIntoFigure refuses on a figure+ body (subfigure destruction)", () => {
    let state = stateWith(subfigureDoc([
      { type: "figure_name", attrs: { data: {} }, content: [{ type: "text", text: "Sub" }] },
      { type: "image", attrs: { src: "x.png", alt: null, data: {} } },
    ]));
    // Caret in the OUTER figure's caption (first figure_name).
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "figure_name"))),
    );
    assert.equal(canInsertImageIntoFigure(state), false, "figure+ run is never replaced");
    const { ok, fired } = run(
      (s, d) => insertImageIntoFigure(s, d, { src: "n.png", alt: null, mimetype: "image/png" }),
      state,
    );
    assert.equal(ok, false);
    assert.equal(fired, false, "nothing dispatched");
  });
});

// ---------------------------------------------------------------------------
// createParagraphNear — Enter on a node-selected block atom (§2.10 A1a/A1b)
// ---------------------------------------------------------------------------

describe("createParagraphNear: block atoms (§2.4.7, §2.10)", () => {
  it("node-selected image inside a figure: paragraph lands AFTER the figure", () => {
    let state = stateWith([figureNode("Cap", true)]);
    let imgPos = -1;
    state.doc.descendants((n, p) => {
      if (imgPos !== -1) return false;
      if (n.type.name === "image") { imgPos = p; return false; }
      return true;
    });
    assert.notEqual(imgPos, -1);
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, imgPos)));
    const { fired, state: after } = run(createParagraphNear, state);
    assert.equal(fired, true);
    const clause = after.doc.content.content[1].content.content[0];
    assert.deepEqual(clauseChildNames(clause), ["section_title", "figure", "paragraph"]);
    assert.deepEqual(figureChildNames(clause.child(1)), ["figure_name", "image"]);
    assert.equal(after.selection.$from.parent.type.name, "paragraph");
  });

  it("node-selected formula in a clause: stock adjacent paragraph, unchanged", () => {
    // Regression guard for the formula branch of §2.10 row A1: the wrapper
    // must not regress atoms that live in block+ containers.
    const formula = {
      type: "formula",
      attrs: { id: null, number: null, type: "asciimath", asciimath: "x", mathml: null, data: {} },
    };
    let state = stateWith([
      { type: "paragraph", attrs: { data: {} }, content: [{ type: "text", text: "p" }] },
      formula,
    ]);
    let formulaPos = -1;
    state.doc.descendants((n, p) => {
      if (formulaPos !== -1) return false;
      if (n.type.name === "formula") { formulaPos = p; return false; }
      return true;
    });
    assert.notEqual(formulaPos, -1);
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, formulaPos)));
    const { fired, state: after } = run(createParagraphNear, state);
    assert.equal(fired, true);
    const clause = after.doc.content.content[1].content.content[0];
    // An empty paragraph now sits adjacent to the formula (side per stock).
    assert.deepEqual(
      clauseChildNames(clause),
      ["section_title", "paragraph", "formula", "paragraph"],
    );
    assert.equal(after.selection.$from.parent.type.name, "paragraph");
  });
});

// ---------------------------------------------------------------------------
// emptyTextblockBackspace — figure body states (§4.4, recovery)
// ---------------------------------------------------------------------------

describe("emptyTextblockBackspace: figure body", () => {
  it("empty body paragraph deleted → figure returns to the empty slot (recovery state)", () => {
    let state = stateWith([figureNode("Cap", false, [
      { type: "paragraph", attrs: { data: {} }, content: [] },
    ])]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "paragraph"))),
    );
    const { fired, state: after } = run(emptyTextblockBackspace, state);
    assert.equal(fired, true);
    const fig = after.doc.content.content[1].content.content[0].child(1);
    assert.deepEqual(figureChildNames(fig), ["figure_name"]);
    // Caret back in the caption; the slot is fillable again.
    assert.equal(after.selection.$from.parent.type.name, "figure_name");
    assert.equal(canInsertImageIntoFigure(after), true);
  });

  it("empty paragraph as a subfigure's sole child deletes the subfigure", () => {
    // sub = [paragraph()] (no caption); parent = [figure_name, sub].
    let state = stateWith(subfigureDoc([
      { type: "paragraph", attrs: { data: {} }, content: [] },
    ]));
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, posInFirst(state, "paragraph"))),
    );
    const { fired, state: after } = run(emptyTextblockBackspace, state);
    assert.equal(fired, true);
    const outer = after.doc.content.content[1].content.content[0].child(1);
    // The subfigure is gone; the parent figure survives with its caption.
    assert.deepEqual(figureChildNames(outer), ["figure_name"]);
    let subCount = 0;
    after.doc.descendants((n) => {
      if (n.type.name === "figure" && n.attrs.id === "sub") subCount += 1;
      return true;
    });
    assert.equal(subCount, 0);
  });
});
