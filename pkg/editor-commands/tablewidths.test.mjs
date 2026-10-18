/**
 * Unit tests for the table column-width commands: `setColumnWidths` (the
 * internal write primitive), `autoTableWidths`, `distributeColumnsEvenly`,
 * plus the schema-side grid counting (`tableGridColumnCount`) and the
 * parse/repair helpers (`parseColWidths`, `repairColWidths`,
 * `normalizeWidths`, `equalWidths`) they rest on.
 *
 * Patterned on captions.test.mjs: builds EditorState from JSON docs against
 * `metanormaSchema`, invokes commands headlessly with a state-apply dispatch.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EditorState, TextSelection } from "prosemirror-state";
import { metanormaSchema } from "@metanorma/prosemirror-schema";
import {
  setColumnWidths,
  autoTableWidths,
  distributeColumnsEvenly,
  MIN_COLUMN_SHARE_PCT,
  pctToNumber,
} from "./compiled/index.js";
import {
  tableGridColumnCount,
  parseColWidths,
  repairColWidths,
  normalizeWidths,
  equalWidths,
} from "@metanorma/prosemirror-schema";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A table JSON node with the given colwidths and body/head cell patterns. */
function tableJSON({ colwidths = null, head = null, bodyRows }) {
  const content = [];
  if (head !== null) {
    content.push({ type: "table_head", content: [head] });
  }
  content.push({
    type: "table_body",
    content: bodyRows.map((cells) => ({
      type: "table_row",
      content: cells.map((colspan) => ({
        type: "table_cell",
        attrs: { colspan, rowspan: 1, data: {} },
        content: [{ type: "paragraph", attrs: { data: {} } }],
      })),
    })),
  });
  return {
    type: "table",
    attrs: { id: "t1", number: null, colwidths, data: {} },
    content,
  };
}

/** Build a state whose doc is a clause containing the given table JSON. */
function stateWithTable(tableJson) {
  const doc = metanormaSchema.nodeFromJSON({
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
              { type: "paragraph", attrs: { data: {} }, content: [{ type: "text", text: "intro" }] },
              tableJson,
            ],
          },
        ],
      },
    ],
  });
  return doc;
}

/** Doc position of the table with id `t1`. */
function tablePos(doc) {
  let pos = -1;
  doc.descendants((n, p) => {
    if (pos === -1 && n.type.name === "table" && n.attrs.id === "t1") pos = p;
    return true;
  });
  return pos;
}

/** Position inside the first cell of the table. */
function firstCellPos(doc) {
  let pos = -1;
  doc.descendants((n, p) => {
    if (pos === -1 && n.type.name === "table_cell") pos = p + 2;
    return true;
  });
  return pos;
}

/** The table node (post-transaction) by id. */
function tableOf(doc) {
  let node = null;
  doc.descendants((n) => {
    if (node === null && n.type.name === "table" && n.attrs.id === "t1") node = n;
    return true;
  });
  return node;
}

/** Count of dispatch calls + the transactions, for single-transaction asserts. */
function countingDispatch() {
  const trs = [];
  return { trs, dispatch: (tr) => trs.push(tr) };
}

// ---------------------------------------------------------------------------
// gridColumnCount
// ---------------------------------------------------------------------------

describe("tableGridColumnCount", () => {
  it("counts a plain rectangular body", () => {
    const doc = stateWithTable(tableJSON({ bodyRows: [[1, 1, 1], [1, 1, 1]] }));
    assert.equal(tableGridColumnCount(tableOf(doc)), 3);
  });

  it("takes the max Σ colspan across head AND body rows", () => {
    // Head declares a single spanning cell (colspan 2); body declares 2.
    const doc = stateWithTable(tableJSON({
      head: { type: "table_row", content: [{ type: "table_cell", attrs: { colspan: 2, rowspan: 1, data: {} }, content: [{ type: "paragraph", attrs: { data: {} } }] }] },
      bodyRows: [[1, 1]],
    }));
    assert.equal(tableGridColumnCount(tableOf(doc)), 2);
  });

  it("handles a body row wider than the head", () => {
    const doc = stateWithTable(tableJSON({
      head: { type: "table_row", content: [{ type: "table_cell", attrs: { colspan: 3, rowspan: 1, data: {} }, content: [{ type: "paragraph", attrs: { data: {} } }] }] },
      bodyRows: [[2, 1], [1, 1, 1, 1]],
    }));
    assert.equal(tableGridColumnCount(tableOf(doc)), 4);
  });

  it("multiple spanning cells in one row sum", () => {
    const doc = stateWithTable(tableJSON({ bodyRows: [[2, 2, 1]] }));
    assert.equal(tableGridColumnCount(tableOf(doc)), 5);
  });
});

// ---------------------------------------------------------------------------
// normalizeWidths / equalWidths invariants
// ---------------------------------------------------------------------------

describe("normalizeWidths invariants", () => {
  const sumOf = (ws) => ws.reduce((a, s) => a + parseFloat(s), 0);

  it("sums to exactly 100 with 2 decimals (last absorbs)", () => {
    const out = normalizeWidths([16.67, 16.67, 16.67, 16.67, 16.67, 16.67], 6);
    assert.equal(sumOf(out), 100);
    out.forEach((s) => assert.match(s, /^\d+\.\d{2}%$/));
  });

  it("preserves ratios when renormalizing", () => {
    const out = normalizeWidths([30, 50], 2);
    assert.equal(out[0], "37.50%");
    assert.equal(out[1], "62.50%");
  });

  it("forces entry count to cols (drop extras)", () => {
    const out = normalizeWidths([10, 20, 30, 40, 50, 60], 5);
    assert.equal(out.length, 5);
    assert.equal(sumOf(out), 100);
  });

  it("equalWidths(n) sums to exactly 100", () => {
    assert.equal(sumOf(equalWidths(3)), 100);
    assert.equal(sumOf(equalWidths(6)), 100);
    assert.equal(sumOf(equalWidths(7)), 100);
  });
});

// ---------------------------------------------------------------------------
// parseColWidths / repairColWidths (plain-data ingest cases)
// ---------------------------------------------------------------------------

describe("parseColWidths ingest", () => {
  /** Test double for a <table> element (ColLike shape). */
  const mkTable = (dataAttr, cols) => ({
    getAttribute: (n) => (n === "data-colwidths" ? dataAttr : null),
    querySelectorAll: () =>
      cols.map((w) =>
        typeof w === "object"
          ? w
          : { getAttribute: (n) => (n === "width" ? w : null), style: {} },
      ),
  });

  it("reads data-colwidths JSON with priority", () => {
    const out = parseColWidths(mkTable('["33.33%","33.33%","33.34%"]', ["10%", "10%", "10%"]), 3);
    assert.deepEqual(out, ["33.33%", "33.33%", "33.34%"]);
  });

  it("reads legacy <col width> attribute form (6 × 16.67 stays verbatim in tolerance)", () => {
    const out = parseColWidths(mkTable(null, ["16.67%", "16.67%", "16.67%", "16.67%", "16.67%", "16.67%"]), 6);
    assert.deepEqual(out, ["16.67%", "16.67%", "16.67%", "16.67%", "16.67%", "16.67%"]);
  });

  it("reads <col style=\"width:…\"> form", () => {
    const out = parseColWidths(
      { getAttribute: () => null, querySelectorAll: () => [{ style: { width: "25%" } }, { style: { width: "75%" } }] },
      2,
    );
    assert.deepEqual(out, ["25.00%", "75.00%"]);
  });

  it("ignores px widths and returns null", () => {
    const out = parseColWidths(
      { getAttribute: () => null, querySelectorAll: () => [{ style: { width: "120px" } }] },
      2,
    );
    assert.equal(out, null);
  });

  it("malformed JSON falls through to the colgroup source", () => {
    const out = parseColWidths(mkTable("{broken", ["50%", "50%"]), 2);
    assert.deepEqual(out, ["50.00%", "50.00%"]);
  });

  it("repairs short lists by padding the unclaimed space equally", () => {
    assert.deepEqual(repairColWidths([40], 4), ["40.00%", "20.00%", "20.00%", "20.00%"]);
  });

  it("repairs long lists by dropping extras", () => {
    assert.deepEqual(
      repairColWidths([16.67, 16.67, 16.67, 16.67, 16.67, 16.67], 5),
      ["20.00%", "20.00%", "20.00%", "20.00%", "20.00%"],
    );
  });

  it("renormalizes lists outside the ±0.5 tolerance", () => {
    assert.deepEqual(repairColWidths([30, 50], 2), ["37.50%", "62.50%"]);
  });

  it("returns null for unrecoverable input", () => {
    assert.equal(repairColWidths([], 3), null);
    assert.equal(repairColWidths([-1, 0], 3), null);
    assert.equal(parseColWidths(mkTable(null, []), 3), null);
  });

  it("pctToNumber parses both % and bare forms", () => {
    assert.equal(pctToNumber("16.67%"), 16.67);
    assert.equal(pctToNumber(" 16.67 "), 16.67);
    assert.equal(pctToNumber("0%"), null);
    assert.equal(pctToNumber("abc"), null);
  });
});

// ---------------------------------------------------------------------------
// setColumnWidths
// ---------------------------------------------------------------------------

describe("setColumnWidths", () => {
  it("normalizes, clamps, and writes the attr in ONE transaction", () => {
    const doc = stateWithTable(tableJSON({ bodyRows: [[1, 1, 1]] }));
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, firstCellPos(doc)) });
    const { trs, dispatch } = countingDispatch();
    const ok = setColumnWidths(state, dispatch, tablePos(doc), [60, 20, 20]);
    assert.equal(ok, true);
    assert.equal(trs.length, 1, "exactly one transaction");
    const next = state.apply(trs[0]);
    const t = tableOf(next.doc);
    assert.deepEqual(t.attrs.colwidths, ["60.00%", "20.00%", "20.00%"]);
  });

  it("seeds widths on an autowidth table (first write materializes the mode)", () => {
    const doc = stateWithTable(tableJSON({ bodyRows: [[1, 1]] }));
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, firstCellPos(doc)) });
    const { trs, dispatch } = countingDispatch();
    assert.equal(setColumnWidths(state, dispatch, tablePos(doc), [50, 50]), true);
    assert.equal(trs.length, 1);
    assert.deepEqual(tableOf(state.apply(trs[0]).doc).attrs.colwidths, ["50.00%", "50.00%"]);
  });

  it("forces the grid count (6 entries vs a 3-column grid → 3 written)", () => {
    const doc = stateWithTable(tableJSON({ bodyRows: [[1, 1, 1]] }));
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, firstCellPos(doc)) });
    const { trs, dispatch } = countingDispatch();
    assert.equal(setColumnWidths(state, dispatch, tablePos(doc), [10, 10, 10, 10, 10, 10]), true);
    assert.deepEqual(tableOf(state.apply(trs[0]).doc).attrs.colwidths, [
      "33.33%", "33.33%", "33.34%",
    ]);
  });

  it("clamps shares to the structural minimum", () => {
    const doc = stateWithTable(tableJSON({ bodyRows: [[1, 1]] }));
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, firstCellPos(doc)) });
    const { trs, dispatch } = countingDispatch();
    assert.equal(setColumnWidths(state, dispatch, tablePos(doc), [99.9, 0.1]), true);
    const w = tableOf(state.apply(trs[0]).doc).attrs.colwidths;
    assert.ok(parseFloat(w[1]) >= MIN_COLUMN_SHARE_PCT, `second share ${w[1]} >= ${MIN_COLUMN_SHARE_PCT}`);
  });

  it("refuses a non-table position and unrecoverable input", () => {
    const doc = stateWithTable(tableJSON({ bodyRows: [[1]] }));
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, firstCellPos(doc)) });
    const { trs, dispatch } = countingDispatch();
    assert.equal(setColumnWidths(state, dispatch, 1, [50, 50]), false); // bibdata, not a table
    assert.equal(setColumnWidths(state, dispatch, tablePos(doc), []), false);
    assert.equal(trs.length, 0, "no transaction on refusal");
  });
});

// ---------------------------------------------------------------------------
// autoTableWidths / distributeColumnsEvenly
// ---------------------------------------------------------------------------

describe("autoTableWidths", () => {
  it("predicate: false on autowidth tables and outside tables", () => {
    const doc = stateWithTable(tableJSON({ bodyRows: [[1, 1]] }));
    const inTable = EditorState.create({ doc, selection: TextSelection.create(doc, firstCellPos(doc)) });
    assert.equal(autoTableWidths(inTable), false);
    const outside = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    assert.equal(autoTableWidths(outside), false);
  });

  it("predicate: true inside a fixed-widths table", () => {
    const doc = stateWithTable(tableJSON({ colwidths: ["40.00%", "60.00%"], bodyRows: [[1, 1]] }));
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, firstCellPos(doc)) });
    assert.equal(autoTableWidths(state), true);
  });

  it("dispatch: writes null in one transaction", () => {
    const doc = stateWithTable(tableJSON({ colwidths: ["40.00%", "60.00%"], bodyRows: [[1, 1]] }));
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, firstCellPos(doc)) });
    const { trs, dispatch } = countingDispatch();
    assert.equal(autoTableWidths(state, dispatch), true);
    assert.equal(trs.length, 1);
    assert.equal(tableOf(state.apply(trs[0]).doc).attrs.colwidths, null);
  });
});

describe("distributeColumnsEvenly", () => {
  it("predicate: true inside any table (both modes)", () => {
    const auto = stateWithTable(tableJSON({ bodyRows: [[1, 1]] }));
    const fixed = stateWithTable(tableJSON({ colwidths: ["90.00%", "10.00%"], bodyRows: [[1, 1]] }));
    assert.equal(
      distributeColumnsEvenly(EditorState.create({ doc: auto, selection: TextSelection.create(auto, firstCellPos(auto)) })),
      true,
    );
    assert.equal(
      distributeColumnsEvenly(EditorState.create({ doc: fixed, selection: TextSelection.create(fixed, firstCellPos(fixed)) })),
      true,
    );
  });

  it("predicate: false outside a table", () => {
    const doc = stateWithTable(tableJSON({ bodyRows: [[1]] }));
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    assert.equal(distributeColumnsEvenly(state), false);
  });

  it("dispatch: equal widths in one transaction; materializes autowidth", () => {
    const doc = stateWithTable(tableJSON({ bodyRows: [[1, 1, 1]] }));
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, firstCellPos(doc)) });
    const { trs, dispatch } = countingDispatch();
    assert.equal(distributeColumnsEvenly(state, dispatch), true);
    assert.equal(trs.length, 1);
    assert.deepEqual(tableOf(state.apply(trs[0]).doc).attrs.colwidths, [
      "33.33%", "33.33%", "33.34%",
    ]);
  });

  it("dispatch: spanning header uses the grid count, not the head row's cell count", () => {
    const doc = stateWithTable(tableJSON({
      head: { type: "table_row", content: [{ type: "table_cell", attrs: { colspan: 2, rowspan: 1, data: {} }, content: [{ type: "paragraph", attrs: { data: {} } }] }] },
      bodyRows: [[1, 1]],
    }));
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, firstCellPos(doc)) });
    const { trs, dispatch } = countingDispatch();
    assert.equal(distributeColumnsEvenly(state, dispatch), true);
    assert.deepEqual(tableOf(state.apply(trs[0]).doc).attrs.colwidths, ["50.00%", "50.00%"]);
  });
});
