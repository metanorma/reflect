/**
 * Headless tests for @metanorma/editor-commands — section commands
 * (docs/EditorCommands.spec.md §5). One domain per *.test.mjs file; this one
 * pairs with dl.test.mjs (definition lists). Shared helpers: test-helpers.mjs.
 *
 * Run: yarn workspace @metanorma/editor-commands test
 *
 * Uses Node's built-in `node:test` + `node:assert` — no test framework dep.
 * Pure JS (.mjs) so it runs directly under Node without a TypeScript loader
 * (and without the prosemirror-view 1.42.0/1.42.1 nominal-type split that a
 * TS build would resurface). Imports from ./compiled/ — the `pretest` script
 * compiles first, so tests never run against stale output.
 *
 * Scope: the pure COMMAND layer — sibling insertSection semantics (§5.2),
 * the strict-XOR accommodation (§5.5: atomic wrap, all-empty-run
 * replacement), nesting commands (§5.7: wrapInClause, demoteClause,
 * promoteClause), and insertSectionAbove / exitSectionTitle. Browser flows
 * (toolbar wiring, caret placement) live in pkg/editor-gui/e2e.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { metanormaSchema } from "@metanorma/prosemirror-schema";
import {
  insertSection,
  wrapInClause,
  demoteClause,
  promoteClause,
  insertSectionAbove,
  exitSectionTitle,
} from "./compiled/index.js";
import { kids, ids, run } from "./test-helpers.mjs";

// --- fixtures ---------------------------------------------------------------

/** doc > [bibdata, sections(…)] — the minimal valid body document. */
const mkDoc = (sectionsChildren) => metanormaSchema.nodeFromJSON({
  type: 'doc',
  content: [
    { type: 'bibdata', attrs: { item: null, data: {} } },
    { type: 'sections', content: sectionsChildren },
  ],
});

/** First position of the first paragraph whose text matches `needle`. */
const paraPos = (doc, needle) => {
  let p = -1;
  doc.descendants((n, pos) => {
    if (n.type.name === 'paragraph' && p === -1 && n.textContent.includes(needle)) p = pos;
    return true;
  });
  return p;
};

/** First position of the section_title whose text equals `needle`. */
const titlePos = (doc, needle) => {
  let p = -1;
  doc.descendants((n, pos) => {
    if (n.type.name === 'section_title' && p === -1 && n.textContent === needle) p = pos;
    return true;
  });
  return p;
};

// --- insertSection: sibling semantics (§5.2) -------------------------------

describe('insertSection (body cohort → sibling)', () => {
  it('inserts a sibling clause after a title-only-empty-para clause (the original bug report)', () => {
    // clause("hhh") holding a single EMPTY paragraph — Section > Clause must
    // create exactly one sibling, not wrap the placeholder into a subclause.
    const doc = mkDoc([{
      type: 'clause', attrs: { id: '_outer' },
      content: [
        { type: 'section_title', content: [{ type: 'text', text: 'hhh' }] },
        { type: 'paragraph' },
      ],
    }]);
    const { ok, state } = run(
      EditorState.create({ doc, selection: TextSelection.create(doc, paraPos(doc, '') + 1) }),
      insertSection, 'clause',
    );
    assert.equal(ok, true, state.doc.toString());
    assert.doesNotThrow(() => state.doc.check());

    const top = kids(state.doc.child(1));
    assert.equal(top.length, 2, state.doc.toString());
    assert.ok(top.every(c => c.type.name === 'clause'), state.doc.toString());
    // Original clause unchanged: [title, para], id intact, exactly once.
    assert.deepEqual(kids(top[0]).map(c => c.type.name), ['section_title', 'paragraph']);
    assert.equal(ids(state.doc.child(1)).filter(i => i === '_outer').length, 1);
    // New clause: [title, para] with a generated id.
    assert.notEqual(top[1].attrs.id, '_outer');
    assert.deepEqual(kids(top[1]).map(c => c.type.name), ['section_title', 'paragraph']);
    // No duplicate-id phantom split.
    const idList = ids(state.doc.child(1));
    assert.equal(new Set(idList).size, idList.length);
  });

  it('inserts a sibling for non-empty bodies too (no wrap of existing text)', () => {
    const doc = mkDoc([{
      type: 'clause', attrs: { id: '_outer' },
      content: [
        { type: 'section_title', content: [{ type: 'text', text: 'Intro' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'body text' }] },
      ],
    }]);
    const { state } = run(
      EditorState.create({ doc, selection: TextSelection.create(doc, paraPos(doc, 'body') + 2) }),
      insertSection, 'terms',
    );
    assert.doesNotThrow(() => state.doc.check());
    const top = kids(state.doc.child(1));
    assert.equal(top.length, 2);
    assert.equal(top[1].type.name, 'terms');
    assert.ok(JSON.stringify(state.doc.toJSON()).includes('body text'));
    assert.equal(kids(top[0]).filter(c => c.type.name === 'clause').length, 0,
      'no wrap clause created');
  });
});

// --- wrapInClause: the nesting action (§5.7) -------------------------------

describe('wrapInClause', () => {
  it('content-bearing run: accommodation wrap IS the nesting (atomic, no phantom)', () => {
    const doc = mkDoc([{
      type: 'clause', attrs: { id: '_outer' },
      content: [
        { type: 'section_title', content: [{ type: 'text', text: 'Intro' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'para one' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'para two' }] },
      ],
    }]);
    const { ok, state } = run(
      EditorState.create({ doc, selection: TextSelection.create(doc, paraPos(doc, 'para one') + 1) }),
      wrapInClause,
    );
    assert.equal(ok, true, state.doc.toString());
    assert.doesNotThrow(() => state.doc.check());

    // No phantom sibling: still exactly one top-level clause.
    assert.equal(state.doc.child(1).childCount, 1, state.doc.toString());
    const outer = kids(state.doc.child(1))[0];
    // [title, wrapClause] — the whole run moved into the wrap clause.
    assert.ok(outer.childCount >= 2 && kids(outer)[1].type.name === 'clause',
      state.doc.toString());
    const json = JSON.stringify(state.doc.toJSON());
    assert.ok(json.includes('para one') && json.includes('para two'));
    const idList = ids(state.doc.child(1));
    assert.equal(new Set(idList).size, idList.length, 'no duplicate-id split');
  });

  it('all-empty run: replaced by the new clause (no phantom headingless subclause)', () => {
    const doc = mkDoc([{
      type: 'clause', attrs: { id: '_outer' },
      content: [
        { type: 'section_title', content: [{ type: 'text', text: 'Outer' }] },
        { type: 'paragraph' },
      ],
    }]);
    const { ok, state } = run(
      EditorState.create({ doc, selection: TextSelection.create(doc, paraPos(doc, '') + 1) }),
      wrapInClause,
    );
    assert.equal(ok, true, state.doc.toString());
    assert.doesNotThrow(() => state.doc.check());
    const outer = kids(state.doc.child(1))[0];
    assert.equal(outer.childCount, 2, `empty para replaced: ${state.doc.child(1)}`);
    const idList = ids(state.doc.child(1));
    assert.equal(new Set(idList).size, idList.length);
  });
});

// --- demoteClause / promoteClause (§5.7) ------------------------------------

describe('demoteClause', () => {
  it('content-bearing target: wraps sibling blocks atomically, moves the clause in', () => {
    const doc = mkDoc([
      { type: 'clause', attrs: { id: '_first' }, content: [
        { type: 'section_title', content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'first body' }] },
      ] },
      { type: 'clause', attrs: { id: '_second' }, content: [
        { type: 'section_title', content: [{ type: 'text', text: 'Second' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'second body' }] },
      ] },
    ]);
    const { ok, state } = run(
      EditorState.create({ doc, selection: TextSelection.create(doc, paraPos(doc, 'second') + 2) }),
      demoteClause,
    );
    assert.equal(ok, true, state.doc.toString());
    assert.doesNotThrow(() => state.doc.check());

    const top = kids(state.doc.child(1));
    assert.equal(top.length, 1, 'demoted into first');
    const first = top[0];
    assert.equal(first.childCount, 3, `[title, wrapClause, moved]: ${first}`);
    assert.equal(kids(first)[1].type.name, 'clause');
    assert.equal(kids(first)[2].type.name, 'clause');
    assert.equal(kids(kids(first)[1])[0].type.name, 'section_title',
      'wrap clause leads with a section_title');
    const json = JSON.stringify(state.doc.toJSON());
    assert.ok(json.includes('first body') && json.includes('second body'));
    const idList = ids(state.doc.child(1));
    assert.equal(new Set(idList).size, idList.length);
  });

  it('all-empty target body: empty placeholders REPLACED, no phantom clause', () => {
    // The reported Demote bug: "fff" holds only the empty placeholder
    // paragraph; demoting "sadf" into it must not create a phantom.
    const doc = mkDoc([
      { type: 'clause', attrs: { id: '_empty' }, content: [
        { type: 'section_title', content: [{ type: 'text', text: 'fff' }] },
        { type: 'paragraph' },
      ] },
      { type: 'clause', attrs: { id: '_sadf' }, content: [
        { type: 'section_title', content: [{ type: 'text', text: 'sadf' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'testtest' }] },
      ] },
    ]);
    const { ok, state } = run(
      EditorState.create({ doc, selection: TextSelection.create(doc, paraPos(doc, 'testtest') + 2) }),
      demoteClause,
    );
    assert.equal(ok, true, state.doc.toString());
    assert.doesNotThrow(() => state.doc.check());

    const first = kids(state.doc.child(1))[0];
    assert.equal(first.childCount, 2, `title + sadf only: ${first}`);
    assert.equal(kids(first).filter(c => c.type.name === 'clause').length, 1,
      'no phantom subclause');
    assert.ok(JSON.stringify(state.doc.toJSON()).includes('testtest'));
    const idList = ids(state.doc.child(1));
    assert.equal(new Set(idList).size, idList.length);
  });

  it('refuses an only-child clause (no preceding sibling)', () => {
    const doc = mkDoc([{
      type: 'clause', attrs: { id: '_only' },
      content: [
        { type: 'section_title', content: [{ type: 'text', text: 'Only' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'text' }] },
      ],
    }]);
    const state = EditorState.create({
      doc, selection: TextSelection.create(doc, paraPos(doc, 'text') + 1),
    });
    assert.equal(demoteClause(state), false);
  });
});

describe('promoteClause', () => {
  it('round-trips demote: back to two top-level clauses', () => {
    const doc = mkDoc([
      { type: 'clause', attrs: { id: '_first' }, content: [
        { type: 'section_title', content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'first body' }] },
      ] },
      { type: 'clause', attrs: { id: '_second' }, content: [
        { type: 'section_title', content: [{ type: 'text', text: 'Second' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'second body' }] },
      ] },
    ]);
    let state = EditorState.create({
      doc, selection: TextSelection.create(doc, paraPos(doc, 'second') + 2),
    });
    ({ state } = run(state, demoteClause));
    const { ok } = run(state, promoteClause, (tr) => { state = state.apply(tr); });
    assert.equal(ok, true, state.doc.toString());
    assert.doesNotThrow(() => state.doc.check());
    assert.equal(state.doc.child(1).childCount, 2, state.doc.toString());
  });
});

// --- insertSectionAbove / exitSectionTitle ----------------------------------

describe('insertSectionAbove', () => {
  it('top-level: sibling BEFORE, original untouched, caret stays in original title', () => {
    const doc = mkDoc([{
      type: 'clause', attrs: { id: '_foo' },
      content: [
        { type: 'section_title', content: [{ type: 'text', text: 'Foo' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Bar' }] },
      ],
    }]);
    const { ok, state } = run(
      EditorState.create({ doc, selection: TextSelection.create(doc, titlePos(doc, 'Foo') + 1) }),
      insertSectionAbove,
    );
    assert.equal(ok, true, state.doc.toString());
    assert.doesNotThrow(() => state.doc.check());
    const top = kids(state.doc.child(1));
    assert.equal(top.length, 2);
    assert.notEqual(top[0].attrs.id, '_foo');
    assert.equal(top[1].attrs.id, '_foo');
    assert.deepEqual(kids(top[0]).map(c => c.type.name), ['section_title', 'paragraph']);
    assert.equal(kids(top[0])[0].textContent, '');
    assert.equal(top[1].child(0).textContent, 'Foo');
    assert.equal(top[1].child(1).textContent, 'Bar');
    const $from = state.selection.$from;
    assert.ok($from.parent.type.name === 'section_title'
      && $from.parent.textContent === 'Foo' && $from.parentOffset === 0);
    assert.equal(new Set(ids(state.doc)).size, ids(state.doc).length);
  });

  it('nested subclause run: sibling lands INSIDE the parent, not at sections top level', () => {
    const doc = mkDoc([{
      type: 'clause', attrs: { id: '_parent' },
      content: [
        { type: 'section_title', content: [{ type: 'text', text: 'Parent' }] },
        { type: 'clause', attrs: { id: '_child' }, content: [
          { type: 'section_title', content: [{ type: 'text', text: 'Child' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'child body' }] },
        ] },
      ],
    }]);
    const { ok, state } = run(
      EditorState.create({ doc, selection: TextSelection.create(doc, titlePos(doc, 'Child') + 1) }),
      insertSectionAbove,
    );
    assert.equal(ok, true, state.doc.toString());
    assert.doesNotThrow(() => state.doc.check());
    assert.equal(state.doc.child(1).childCount, 1, 'sections still holds 1 top-level section');
    const parent = kids(state.doc.child(1))[0];
    assert.equal(parent.childCount, 3);
    assert.equal(parent.child(2).attrs.id, '_child');
    assert.ok(parent.child(1).attrs.id !== '_child' && parent.child(1).attrs.id !== '_parent');
  });

  it('guards: empty title / mid-title caret / ranged selection → query false', () => {
    const mk = (titleText) => mkDoc([{
      type: 'clause', attrs: { id: '_x' },
      content: [
        { type: 'section_title', content: titleText ? [{ type: 'text', text: titleText }] : [] },
        { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
      ],
    }]);

    // Empty title → false; the chained exitSectionTitle then fires.
    {
      const doc = mk(null);
      let state = EditorState.create({
        doc, selection: TextSelection.create(doc, titlePos(doc, '') + 1),
      });
      assert.equal(insertSectionAbove(state), false, 'empty title → query false');
      let fired = false;
      const exited = exitSectionTitle(state, (tr) => { state = state.apply(tr); fired = true; });
      assert.ok(exited === true && fired, 'chain fall-through dispatches');
      assert.equal(state.selection.$from.parent.type.name, 'paragraph');
      assert.equal(state.doc.child(1).childCount, 1, 'no sibling created');
    }
    // Mid-title caret (offset 1) → false.
    {
      const doc = mk('Foo');
      assert.equal(insertSectionAbove(EditorState.create({
        doc, selection: TextSelection.create(doc, titlePos(doc, 'Foo') + 2),
      })), false, 'mid-title → query false');
    }
    // Ranged selection starting at offset 0 → false.
    {
      const doc = mk('Foo');
      const tp = titlePos(doc, 'Foo');
      assert.equal(insertSectionAbove(EditorState.create({
        doc, selection: TextSelection.create(doc, tp + 1, tp + 3),
      })), false, 'ranged selection → query false');
    }
  });

  it('references in bibliography: sibling references stays in the run', () => {
    const doc = metanormaSchema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'bibdata', attrs: { item: null, data: {} } },
        { type: 'sections', content: [{
          type: 'clause', attrs: { id: '_c1' },
          content: [
            { type: 'section_title', content: [{ type: 'text', text: 'C1' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'body' }] },
          ],
        }] },
        { type: 'bibliography', attrs: { id: '_bib' }, content: [
          { type: 'references', attrs: { id: '_r1' }, content: [
            { type: 'section_title', content: [{ type: 'text', text: 'Normative' }] },
            { type: 'bibitem', attrs: { id: '_b1', item: null, data: {} } },
          ] },
        ] },
      ],
    });
    const { ok, state } = run(
      EditorState.create({ doc, selection: TextSelection.create(doc, titlePos(doc, 'Normative') + 1) }),
      insertSectionAbove,
    );
    assert.equal(ok, true, state.doc.toString());
    assert.doesNotThrow(() => state.doc.check());
    const bib = state.doc.child(2);
    assert.equal(bib.type.name, 'bibliography', 'no promotion to doc level');
    assert.equal(bib.childCount, 2);
    assert.notEqual(bib.child(0).attrs.id, '_r1');
    assert.equal(bib.child(1).attrs.id, '_r1');
  });
});
