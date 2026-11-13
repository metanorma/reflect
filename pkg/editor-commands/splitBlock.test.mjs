/**
 * Headless tests for @metanorma/editor-commands — the plain-paragraph Enter
 * split (docs/EditorCommands.spec.md §2.4.1, matrix §2.10 P1–P4). One domain
 * per *.test.mjs file; shared helpers: test-helpers.mjs.
 *
 * Run: yarn workspace @metanorma/editor-commands test
 *
 * Uses Node's built-in `node:test` + `node:assert` — no test framework dep.
 * Pure JS (.mjs) so it runs directly under Node without a TypeScript loader.
 * Imports from ./compiled/ — the `test` script compiles first, so tests
 * never run against stale output.
 *
 * P2 pins the deliberate adaptation: at the start of a non-empty textblock
 * the caret lands in the NEW upper empty paragraph with active marks carried
 * (§1.7.4) — observable as typing continuing bold at the caret, never via
 * storedMarks introspection. P1/P3/P4 pin stock-delegated behaviour.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { metanormaSchema } from "@metanorma/prosemirror-schema";
import { splitBlockKeepMarks } from "./compiled/index.js";
import { run, at, posIn } from "./test-helpers.mjs";

// --- fixtures ---------------------------------------------------------------

/** `sections > clause > [title "T", strong paragraph "hello"]`. */
const strongDoc = () =>
  metanormaSchema.nodeFromJSON({
    type: "doc",
    content: [
      { type: "bibdata", attrs: { item: null } },
      { type: "sections", content: [
        { type: "clause", attrs: { id: "c1" }, content: [
          { type: "section_title", content: [{ type: "text", text: "T" }] },
          { type: "paragraph", content: [
            { type: "text", text: "hello", marks: [{ type: "strong" }] },
          ] },
        ] },
      ] },
    ],
  });

/** The clause's paragraph texts, in order. */
const paraTexts = (state) => {
  const out = [];
  state.doc.child(1).forEach((clause) => {
    clause.forEach((child) => {
      if (child.type.name === "paragraph") out.push(child.textContent);
    });
  });
  return out;
};

/**
 * Observable marks at the caret: insert a character there and report the
 * marks on the inserted text (the "typing continues bold" behaviour §2.4.1
 * requires — no storedMarks introspection).
 */
const typedMarkNames = (state) => {
  const $f = state.selection.$from;
  const after = state.apply(state.tr.insertText("x", $f.pos));
  const $x = after.selection.$from;
  const node = $x.parent.childAfter($x.parentOffset - 1).node;
  return node ? node.marks.map((m) => m.type.name) : [];
};

const caretText = (state) => state.selection.$from.parent.textContent;

// --- §2.4.1 rows ------------------------------------------------------------

describe("§2.4.1 plain-paragraph split (P rows)", () => {
  it("P1: mid-text split — tail in the second paragraph, caret at its start, bold continues", () => {
    const d = strongDoc();
    const res = run(at(d, posIn(d, "hello") + 2), splitBlockKeepMarks);
    assert.equal(res.ok, true);
    assert.deepEqual(paraTexts(res.state), ["he", "llo"]);
    assert.equal(caretText(res.state), "llo");
    assert.equal(res.state.selection.$from.parentOffset, 0);
    assert.deepEqual(typedMarkNames(res.state), ["strong"]);
  });

  it("P2: start of non-empty — empty paragraph BEFORE, caret in it, typing continues bold", () => {
    const d = strongDoc();
    const res = run(at(d, posIn(d, "hello")), splitBlockKeepMarks);
    assert.equal(res.ok, true);
    assert.deepEqual(paraTexts(res.state), ["", "hello"]);
    // The caret is in the UPPER empty paragraph (the adaptation), not with
    // the original content.
    assert.equal(caretText(res.state), "");
    assert.equal(res.state.selection.$from.parentOffset, 0);
    // Distinguish upper from the equally-empty possibility below "hello":
    // the clause's children order is [title, upper-¶, hello-¶]; the caret's
    // parent must be the paragraph BEFORE the "hello" one.
    let caretIndex = -1;
    res.state.doc.descendants((n) => {
      n.forEach((c, _o, i) => {
        if (c === res.state.selection.$from.parent) caretIndex = i;
      });
    });
    assert.equal(caretIndex, 1, "caret in the clause's SECOND child — the new upper paragraph");
    assert.deepEqual(typedMarkNames(res.state), ["strong"],
      "typing at the upper caret continues bold (§1.7.4)");
  });

  it("P3: end of paragraph — empty paragraph after, caret in it", () => {
    const d = strongDoc();
    const res = run(at(d, posIn(d, "hello") + 5), splitBlockKeepMarks);
    assert.equal(res.ok, true);
    assert.deepEqual(paraTexts(res.state), ["hello", ""]);
    assert.equal(caretText(res.state), "");
  });

  it("P4 (partial from start): range deleted, then the start-zone rule — caret in the upper paragraph", () => {
    const d = strongDoc();
    const start = posIn(d, "hello");
    const state = EditorState.create({
      doc: d,
      selection: TextSelection.create(d, start, start + 2),
    });
    const res = run(state, splitBlockKeepMarks);
    assert.equal(res.ok, true);
    assert.deepEqual(paraTexts(res.state), ["", "llo"]);
    assert.equal(caretText(res.state), "");
    assert.equal(res.state.selection.$from.parentOffset, 0);
    assert.deepEqual(typedMarkNames(res.state), ["strong"]);
  });

  it("P4 (full range): range deleted, then the empty-block rules — caret in the trailing paragraph", () => {
    const d = strongDoc();
    const start = posIn(d, "hello");
    const state = EditorState.create({
      doc: d,
      selection: TextSelection.create(d, start, start + 5),
    });
    const res = run(state, splitBlockKeepMarks);
    assert.equal(res.ok, true);
    assert.deepEqual(paraTexts(res.state), ["", ""]);
    assert.equal(caretText(res.state), "");
    assert.equal(res.state.selection.$from.parentOffset, 0);
  });

  it("query form: applicable in every zone without dispatching", () => {
    const d = strongDoc();
    const start = posIn(d, "hello");
    assert.equal(splitBlockKeepMarks(at(d, start)), true);
    assert.equal(splitBlockKeepMarks(at(d, start + 2)), true);
  });
});
