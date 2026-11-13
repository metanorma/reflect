/**
 * Headless tests for @metanorma/editor-commands — the Backspace structural
 * command's section rows (docs/EditorCommands.spec.md §4.4.8/§4.4.9/§4.7.3,
 * matrix §4.10 BST/BS4/BP3/BS3). One domain per *.test.mjs file; shared
 * helpers: test-helpers.mjs.
 *
 * Run: yarn workspace @metanorma/editor-commands test
 *
 * Uses Node's built-in `node:test` + `node:assert` — no test framework dep.
 * Pure JS (.mjs) so it runs directly under Node without a TypeScript loader.
 * Imports from ./compiled/ — the `test` script compiles first, so tests
 * never run against stale output.
 *
 * Scope: the §4.4.9 two-case guard (meaningful body / effectively empty),
 * the §4.4.8 body-empty walk rule, and the single-step typed re-seeds
 * (clause in sections, content_section in preface, references in
 * bibliography). S3 (valid text selection) asserted on every row; S4
 * (editable paragraph after re-seed) on every re-seed row.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { metanormaSchema } from "@metanorma/prosemirror-schema";
import { emptyTextblockBackspace } from "./compiled/index.js";
import { ids, run, at, posIn } from "./test-helpers.mjs";

// --- fixtures ---------------------------------------------------------------

/** A section node `title` + paragraph; either text optional. */
const section = (type, sid, titleText, bodyText) => ({
  type,
  attrs: { id: sid },
  content: [
    {
      type: "section_title",
      content: titleText ? [{ type: "text", text: titleText }] : [],
    },
    {
      type: "paragraph",
      content: bodyText ? [{ type: "text", text: bodyText }] : [],
    },
  ],
});

/** doc > [bibdata, …children]. */
const doc = (...children) =>
  metanormaSchema.nodeFromJSON({
    type: "doc",
    content: [
      { type: "bibdata", attrs: { item: null } },
      ...children,
    ],
  });

const sections = (...clauses) => ({ type: "sections", content: clauses });

/** Position of the FIRST empty textblock (an empty title or paragraph). */
const emptyAt = (d) => posIn(d, "(empty)");

/** S3: the resulting selection is a collapsed caret inside a textblock. */
const assertCaret = (state) => {
  assert.ok(state.selection.empty, "S3: selection is collapsed");
  assert.ok(
    state.selection.$from.parent.isTextblock,
    "S3: caret sits inside a textblock",
  );
};

/** S4: the document still contains at least one editable paragraph. */
const assertEditableParagraph = (state) => {
  let found = false;
  state.doc.descendants((n) => {
    if (n.type.name === "paragraph") found = true;
  });
  assert.ok(found, "S4: an editable paragraph survives");
};

// --- §4.4.9 rows ------------------------------------------------------------

describe("§4.4.9 section_title guard (BST rows)", () => {
  it("BST1: empty title over a meaningful body → title only deleted", () => {
    const d = doc(sections(section("clause", "c1", "", "body text")));
    // title is empty, paragraph is not → first empty textblock is the title
    const res = run(at(d, emptyAt(d)), emptyTextblockBackspace);
    assert.equal(res.ok, true);
    const clause = res.state.doc.toJSON().content[1].content[0];
    assert.equal(clause.content.length, 1, "only the paragraph remains");
    assert.equal(clause.content[0].type, "paragraph");
    assert.equal(
      clause.content[0].content.map((c) => c.text).join(""),
      "body text",
    );
    assert.equal(res.state.selection.$from.parent.type.name, "paragraph");
    assert.equal(res.state.selection.$from.parentOffset, 0);
    assertCaret(res.state);
  });

  it("BST2: effectively empty section with previous sibling → whole section deleted", () => {
    const d = doc(sections(
      section("clause", "c2", "Prev", "prev body"),
      section("clause", "c1", ""),
    ));
    const res = run(at(d, emptyAt(d)), emptyTextblockBackspace);
    assert.equal(res.ok, true);
    const secs = res.state.doc.toJSON().content[1];
    assert.equal(secs.content.length, 1);
    assert.equal(secs.content[0].attrs.id, "c2");
    const $f = res.state.selection.$from;
    assert.equal($f.parent.type.name, "paragraph");
    assert.equal($f.parentOffset, $f.parent.content.size, "cursor at END of predecessor paragraph");
    assertCaret(res.state);
  });

  it("BST2a: effectively empty first section with following sibling → cursor at next sibling's title", () => {
    const d = doc(sections(
      section("clause", "c1", ""),
      section("clause", "c2", "Next", "next body"),
    ));
    const res = run(at(d, emptyAt(d)), emptyTextblockBackspace);
    assert.equal(res.ok, true);
    const secs = res.state.doc.toJSON().content[1];
    assert.equal(secs.content.length, 1);
    assert.equal(secs.content[0].attrs.id, "c2");
    const $f = res.state.selection.$from;
    assert.equal($f.parent.type.name, "section_title");
    assert.equal($f.parentOffset, 0);
    assertCaret(res.state);
  });

  it("BST2b: effectively empty only child of sections → one fresh titled clause, cursor in title", () => {
    const d = doc(sections(section("clause", "c1", "")));
    // Query form: applicable, dispatches nothing.
    assert.equal(emptyTextblockBackspace(at(d, emptyAt(d))), true);
    const res = run(at(d, emptyAt(d)), emptyTextblockBackspace);
    assert.equal(res.ok, true);
    const secs = res.state.doc.toJSON().content[1];
    assert.equal(secs.content.length, 1, "exactly one section — no remnant");
    const clause = secs.content[0];
    assert.equal(clause.type, "clause");
    assert.notEqual(clause.attrs.id, "c1");
    assert.ok(clause.attrs.id, "fresh generated id");
    assert.equal(clause.content.length, 2);
    assert.equal(clause.content[0].type, "section_title");
    assert.equal(clause.content[1].type, "paragraph");
    assert.equal(res.state.selection.$from.parent.type.name, "section_title");
    assert.equal(res.state.selection.$from.parentOffset, 0);
    assertCaret(res.state);
    assertEditableParagraph(res.state);
  });

  it("BST2c: effectively empty content_section only child of preface → fresh typed re-seed", () => {
    const d = doc({
      type: "preface",
      content: [section("content_section", "cs1", "")],
    });
    const res = run(at(d, emptyAt(d)), emptyTextblockBackspace);
    assert.equal(res.ok, true);
    const preface = res.state.doc.toJSON().content[1];
    assert.equal(preface.content.length, 1, "exactly one section — no remnant");
    const cs = preface.content[0];
    assert.equal(cs.type, "content_section", "typed seed for preface");
    assert.notEqual(cs.attrs.id, "cs1");
    assert.ok(cs.attrs.id, "fresh generated id");
    assert.equal(cs.content[0].type, "section_title");
    assert.equal(cs.content[1].type, "paragraph");
    assert.equal(res.state.selection.$from.parent.type.name, "section_title");
    assertCaret(res.state);
    assertEditableParagraph(res.state);
  });

  it("BST3: non-empty title at start → declines (false), nothing dispatched", () => {
    const d = doc(sections(section("clause", "c1", "Typed", "body")));
    const state = at(d, posIn(d, "Typed"));
    const res = run(state, emptyTextblockBackspace);
    assert.equal(res.ok, false);
    assert.equal(res.state, state, "no transaction applied");
  });

  it("BST4: ranged selection within a title → declines (false)", () => {
    const d = doc(sections(section("clause", "c1", "Typed", "body")));
    const start = posIn(d, "Typed");
    const state = EditorState.create({
      doc: d,
      selection: TextSelection.create(d, start, start + 2),
    });
    const res = run(state, emptyTextblockBackspace);
    assert.equal(res.ok, false);
    assert.equal(res.state, state);
  });
});

// --- §4.4.8 body-empty walk + re-seeds (BS4, BP3, BS3) ----------------------

describe("§4.4.8 body-empty walk and typed re-seeds (BS4/BP3/BS3)", () => {
  it("BS4: sole empty paragraph of a titled clause with predecessor → whole clause deleted", () => {
    const d = doc(sections(
      section("clause", "c2", "Prev", "prev body"),
      section("clause", "c1", "T"), // title has text; paragraph empty
    ));
    const res = run(at(d, emptyAt(d)), emptyTextblockBackspace);
    assert.equal(res.ok, true);
    const secs = res.state.doc.toJSON().content[1];
    assert.equal(secs.content.length, 1);
    assert.equal(secs.content[0].attrs.id, "c2", "titled clause deleted whole");
    const $f = res.state.selection.$from;
    assert.equal($f.parentOffset, $f.parent.content.size);
    assertCaret(res.state);
  });

  it("BP3: §15-shaped doc start → §4.4.8 no-op re-seed (fresh titled clause, cursor in paragraph)", () => {
    const d = doc(sections(section("clause", "c1", "T")));
    const res = run(at(d, emptyAt(d)), emptyTextblockBackspace);
    assert.equal(res.ok, true);
    const secs = res.state.doc.toJSON().content[1];
    assert.equal(secs.content.length, 1, "sections holds exactly one clause");
    const clause = secs.content[0];
    assert.equal(clause.type, "clause");
    assert.notEqual(clause.attrs.id, "c1", "fresh clause id (DP3)");
    assert.deepEqual(
      clause.content.map((n) => n.type),
      ["section_title", "paragraph"],
    );
    const $f = res.state.selection.$from;
    assert.equal($f.parent.type.name, "paragraph");
    assert.equal($f.parentOffset, 0);
    assertCaret(res.state);
    assertEditableParagraph(res.state);
  });

  it("BS3: emptied bibliography → re-seeded with a fresh references section", () => {
    const d = doc(
      sections(section("clause", "c1", "Body", "body")),
      { type: "bibliography", content: [section("references", "r1", "Refs")] },
    );
    const res = run(at(d, emptyAt(d)), emptyTextblockBackspace);
    assert.equal(res.ok, true);
    const bib = res.state.doc.toJSON().content[2];
    assert.equal(bib.type, "bibliography");
    assert.equal(bib.content.length, 1, "exactly one references section");
    const refs = bib.content[0];
    assert.equal(refs.type, "references", "typed seed for bibliography");
    assert.notEqual(refs.attrs.id, "r1");
    assert.ok(refs.attrs.id);
    assert.deepEqual(
      refs.content.map((n) => n.type),
      ["section_title", "paragraph"],
    );
    const $f = res.state.selection.$from;
    assert.equal($f.parent.type.name, "paragraph");
    assert.equal($f.parentOffset, 0);
    assertCaret(res.state);
    assertEditableParagraph(res.state);
    assert.deepEqual(ids(res.state.doc).filter((x) => x === "c1"), ["c1"],
      "the body clause is untouched");
  });
});
