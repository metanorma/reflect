/**
 * Headless tests for @metanorma/editor-commands — definition-list commands
 * (docs/EditorCommands.spec.md §4.4.4 dl pair-atomic Backspace, §5.1-family
 * insert promotion, Enter exit semantics; see also
 * docs/AdvancedMetanormaToolbar/definition-lists.md). One domain per
 * *.test.mjs file; this one pairs with sections.test.mjs. Shared helpers:
 * test-helpers.mjs.
 *
 * Run: yarn workspace @metanorma/editor-commands test
 *
 * Same conventions as sections.test.mjs: node:test + node:assert/strict,
 * pure .mjs, imports from ./compiled/ (pretest compiles), bare
 * @metanorma/prosemirror-schema resolved by test-loader.mjs.
 *
 * Notable here: the chain CONTRACT tests (T11–T13) — emptyTextblockBackspace
 * must CLAIM plain dl-boundary Backspaces with exactly one EMPTY transaction
 * (doc unchanged), and DECLINE inside a dd's second block so the keymap chain
 * falls through to joinBackward.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { metanormaSchema } from "@metanorma/prosemirror-schema";
import {
  insertDefinitionList,
  enterDefinitionList,
  emptyTextblockBackspace,
} from "./compiled/index.js";
import { run, posIn, at } from "./test-helpers.mjs";

// --- fixtures ---------------------------------------------------------------

const P = metanormaSchema.nodes.paragraph;
const DT = metanormaSchema.nodes.dt;
const DD = metanormaSchema.nodes.dd;
const DL = metanormaSchema.nodes.dl;
const CL = metanormaSchema.nodes.clause;
const ST = metanormaSchema.nodes.section_title;

const text = (s) => metanormaSchema.text(s);

/** The Enter command — a (schema) => Command factory, built once. */
const enterDl = enterDefinitionList(metanormaSchema);

/** clause > [section_title 'T', ...bodyChildren] in the doc skeleton. */
const clauseDoc = (bodyChildren) =>
  metanormaSchema.nodes.doc.create(null, [
    metanormaSchema.nodes.bibdata.create(),
    metanormaSchema.nodes.sections.create(null, [
      CL.create({ id: 'c1' }, [ST.create(null, text('T')), ...bodyChildren]),
    ]),
  ]);

// --- insertDefinitionList: text promotion (§5.1 family) ---------------------

describe('insertDefinitionList', () => {
  it('promotes the whole paragraph text into the dt', () => {
    const doc = clauseDoc([P.create(null, text('keep me'))]);
    const state = at(doc, posIn(doc, 'keep me') + 3);
    assert.equal(insertDefinitionList(state), true, 'applicable');
    const { state: after } = run(state, insertDefinitionList);
    const json = JSON.stringify(after.doc.toJSON());
    assert.ok(json.includes('keep me'), json);
    assert.ok(json.includes('"dl"'), json);
    assert.doesNotThrow(() => after.doc.check());
  });

  it('refuses a multi-block selection', () => {
    const doc = clauseDoc([
      P.create(null, text('one')),
      P.create(null, text('two')),
    ]);
    const $a = doc.resolve(posIn(doc, 'one') + 1);
    const $b = doc.resolve(posIn(doc, 'two') + 2);
    const state = EditorState.create({
      doc,
      selection: new TextSelection($a, $b),
    });
    assert.equal(insertDefinitionList(state), false);
  });
});

// --- emptyTextblockBackspace: dl pair-atomic rules (§4.4.4) -----------------

describe('emptyTextblockBackspace (dl pair-atomic)', () => {
  it('empty dt deletes the whole pair (following pairs exist)', () => {
    const dl = DL.create(null, [
      DT.create(null, text('first term')),
      DD.create(null, P.create(null, text('first desc'))),
      DT.create(null),
      DD.create(null, P.create(null, text('second desc'))),
    ]);
    const doc = clauseDoc([dl]);
    const { state: after } = run(at(doc, posIn(doc, '(empty)')), emptyTextblockBackspace);
    const json = JSON.stringify(after.doc.toJSON());
    assert.ok(!json.includes('second desc'), json);
    assert.ok(json.includes('first desc'), json);
    assert.doesNotThrow(() => after.doc.check());
    assert.equal(after.selection.$from.parent.type.name, 'paragraph');
  });

  it('empty-only block in dd deletes pair + partner', () => {
    const dl = DL.create(null, [
      DT.create(null, text('t1')),
      DD.create(null, P.create(null, text('d1'))),
      DT.create(null, text('t2')),
      DD.create(null, P.create()),
    ]);
    const doc = clauseDoc([dl]);
    const { state: after } = run(at(doc, posIn(doc, '(empty)')), emptyTextblockBackspace);
    const json = JSON.stringify(after.doc.toJSON());
    assert.ok(!json.includes('t2'), json);
    assert.ok(json.includes('d1'), json);
    assert.doesNotThrow(() => after.doc.check());
  });

  it('last pair deleted → dl replaced by a paragraph', () => {
    const dl = DL.create(null, [
      DT.create(null, text('only term')),
      DD.create(null, P.create()),
    ]);
    const doc = clauseDoc([dl]);
    const { state: after } = run(at(doc, posIn(doc, '(empty)')), emptyTextblockBackspace);
    const json = JSON.stringify(after.doc.toJSON());
    assert.ok(!json.includes('"dl"'), json);
    assert.ok(!json.includes('only term'), json);
    assert.ok(json.includes('"paragraph"'), json);
    assert.doesNotThrow(() => after.doc.check());
    assert.equal(after.selection.$from.parent.type.name, 'paragraph');
  });

  it('empty paragraph in a multi-block dd deletes only itself', () => {
    const dl = DL.create(null, [
      DT.create(null, text('t1')),
      DD.create(null, [
        P.create(null, text('real desc')),
        P.create(),
      ]),
    ]);
    const doc = clauseDoc([dl]);
    const { state: after } = run(at(doc, posIn(doc, '(empty)')), emptyTextblockBackspace);
    const json = JSON.stringify(after.doc.toJSON());
    assert.ok(json.includes('"dl"'), json);
    assert.ok(json.includes('real desc'), json);
    assert.equal((json.match(/"paragraph"/g) ?? []).length, 1, json);
    assert.doesNotThrow(() => after.doc.check());
  });

  it('nested dl inside dd: Backspace on the inner empty para unwinds it', () => {
    const inner = DL.create(null, [
      DT.create(null, text('inner term')),
      DD.create(null, P.create()),
    ]);
    const outer = DL.create(null, [
      DT.create(null, text('outer term')),
      DD.create(null, [P.create(null, text('lead')), inner]),
    ]);
    const doc = clauseDoc([outer]);
    const { state: after } = run(at(doc, posIn(doc, '(empty)')), emptyTextblockBackspace);
    const json = JSON.stringify(after.doc.toJSON());
    assert.equal((json.match(/"dl"/g) ?? []).length, 1, json);
    assert.ok(json.includes('outer term') && json.includes('lead'), json);
    assert.doesNotThrow(() => after.doc.check());
  });

  it('empty dt of the FIRST pair (following pairs exist)', () => {
    const dl = DL.create(null, [
      DT.create(null),
      DD.create(null, P.create(null, text('d1'))),
      DT.create(null, text('t2')),
      DD.create(null, P.create(null, text('d2'))),
    ]);
    const doc = clauseDoc([dl]);
    const { state: after } = run(at(doc, posIn(doc, '(empty)')), emptyTextblockBackspace);
    const json = JSON.stringify(after.doc.toJSON());
    assert.ok(!json.includes('d1'), json);
    assert.ok(json.includes('t2') && json.includes('d2'), json);
    assert.doesNotThrow(() => after.doc.check());
  });
});

// --- enterDefinitionList: Enter exit (§4.4.4 adjacent) ----------------------

describe('enterDefinitionList (Enter exit)', () => {
  it('only pair → dl replaced by paragraph, cursor in it', () => {
    const dl = DL.create(null, [
      DT.create(null, text('only term')),
      DD.create(null, P.create()),
    ]);
    const doc = clauseDoc([dl]);
    const { ok, state: after } = run(at(doc, posIn(doc, '(empty)')), enterDl);
    assert.equal(ok, true, 'applicable');
    const json = JSON.stringify(after.doc.toJSON());
    assert.ok(!json.includes('"dl"'), json);
    assert.ok(json.includes('"paragraph"'), json);
    assert.doesNotThrow(() => after.doc.check());
    assert.equal(after.selection.$from.parent.type.name, 'paragraph');
  });

  it('multi-pair dl: exit keeps earlier pairs, paragraph lands after the dl', () => {
    const dl = DL.create(null, [
      DT.create(null, text('t1')),
      DD.create(null, P.create(null, text('d1'))),
      DT.create(null, text('t2')),
      DD.create(null, P.create()),
    ]);
    const doc = clauseDoc([dl]);
    const { ok, state: after } = run(at(doc, posIn(doc, '(empty)')), enterDl);
    assert.equal(ok, true, 'applicable');
    const json = JSON.stringify(after.doc.toJSON());
    assert.ok(!json.includes('t2'), json);
    assert.ok(json.includes('d1'), json);
    assert.ok(json.includes('"paragraph"'), json);
    assert.doesNotThrow(() => after.doc.check());
    assert.equal(after.selection.$from.parent.type.name, 'paragraph');
  });
});

// --- emptyTextblockBackspace: claim-no-op chain contract (§4.4.4) -----------

describe('emptyTextblockBackspace (claim-no-op contract)', () => {
  it('at start of a NON-empty dt: claims with ONE empty tx, doc unchanged', () => {
    const dl = DL.create(null, [
      DT.create(null, text('term')),
      DD.create(null, P.create(null, text('desc'))),
    ]);
    const doc = clauseDoc([P.create(null, text('before')), dl]);
    const state = at(doc, posIn(doc, 'term'));
    assert.equal(emptyTextblockBackspace(state), true, 'claims');
    let dispatched = 0;
    const ok = emptyTextblockBackspace(state, () => { dispatched++; });
    assert.ok(ok === true && dispatched === 1, `one empty tx (got ${dispatched})`);
    const json = JSON.stringify(state.doc.toJSON());
    assert.ok(json.includes('"term"') && json.includes('"desc"')
      && json.includes('before'), json);
  });

  it("at start of a dd's first NON-empty block: claims with ONE empty tx, doc unchanged", () => {
    const dl = DL.create(null, [
      DT.create(null, text('term')),
      DD.create(null, P.create(null, text('desc'))),
    ]);
    const doc = clauseDoc([dl]);
    const state = at(doc, posIn(doc, 'desc'));
    assert.equal(emptyTextblockBackspace(state), true, 'claims');
    let dispatched = 0;
    const ok = emptyTextblockBackspace(state, () => { dispatched++; });
    assert.ok(ok === true && dispatched === 1, `one empty tx (got ${dispatched})`);
    const json = JSON.stringify(state.doc.toJSON());
    assert.ok(json.includes('"term"') && json.includes('desc'), json);
  });

  it("declines at a dd's SECOND block so joinBackward performs the intra-dd join", () => {
    const dl = DL.create(null, [
      DT.create(null, text('term')),
      DD.create(null, [
        P.create(null, text('one')),
        P.create(null, text('two')),
      ]),
    ]);
    const doc = clauseDoc([dl]);
    const state = at(doc, posIn(doc, 'two'));
    assert.equal(emptyTextblockBackspace(state), false, 'declines');
  });
});
