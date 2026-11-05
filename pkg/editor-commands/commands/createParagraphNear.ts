/**
 * `createParagraphNear` — create an empty paragraph adjacent to a node-selected
 * atom (spec §2.4.7; matrix §2.10 rows A1a/A1b).
 *
 * Stock `prosemirror-commands`' `createParagraphNear` first, so `formula`
 * (and any block atom in a `block+` container) keeps today's behaviour
 * exactly: an adjacent empty paragraph on the selection's side.
 *
 * Figure-scoped fallback: under the typed body slot
 * (`figure_name? (image | paragraph+ | figure+)?`) a paragraph is admissible
 * NOWHERE beside an `image` — the stock legality check fails, and Enter on a
 * node-selected image would silently do nothing. When stock refuses AND the
 * selected block atom sits inside a figure, create the paragraph AFTER the
 * enclosing figure, at the nearest paragraph-admitting position
 * (`paragraphExitAfter`: after the outermost enclosing figure when this one
 * is a subfigure inside a `figure+` run). `image` is the only such atom
 * today — it is ungrouped and reachable solely inside `figure`.
 *
 * Section references (e.g. §2.4.7) in this file refer to
 * `docs/EditorCommands.spec.md`.
 */

import type { Command } from 'prosemirror-state';
import { NodeSelection, TextSelection } from 'prosemirror-state';

import { createParagraphNear as stockCreateParagraphNear } from 'prosemirror-commands';

import { NODE_NAME, nodeType } from '../schema.js';
import { paragraphExitAfter } from '../util.js';

export const createParagraphNear: Command = (state, dispatch) => {
  // 1. Stock first: adjacent paragraph wherever the parent admits one
  //    (formula in a clause/note/cell — unchanged behaviour).
  if (stockCreateParagraphNear(state, dispatch)) return true;

  // 2. Figure-scoped fallback: node-selected BLOCK atom inside a figure.
  const sel = state.selection;
  if (!(sel instanceof NodeSelection)) return false;
  const node = sel.node;
  if (!node.isAtom || node.isInline) return false;

  let figureDepth = -1;
  for (let d = sel.$from.depth; d >= 1; d--) {
    if (sel.$from.node(d).type.name === NODE_NAME.figure) { figureDepth = d; break; }
  }
  if (figureDepth === -1) return false;

  const paraType = nodeType(state.schema, NODE_NAME.paragraph);
  if (paraType === null) return false;
  const exitPos = paragraphExitAfter(sel.$from, figureDepth, paraType);
  if (exitPos === null) return false;

  if (dispatch === undefined) return true;

  const tr = state.tr.insert(exitPos, paraType.create());
  tr.setSelection(TextSelection.near(tr.doc.resolve(exitPos + 1), 1));
  tr.scrollIntoView();
  dispatch(tr);
  return true;
};
