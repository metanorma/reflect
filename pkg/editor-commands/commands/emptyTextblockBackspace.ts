/**
 * `emptyTextblockBackspace` — Backspace at the start of an empty textblock
 * (spec §4).
 *
 * Custom command. The Metanorma schema nests paragraphs inside `clause` nodes
 * (`clause = (clause | block)*`), so stock `joinBackward` finds no joinable
 * sibling at the paragraph's depth and does nothing — the editor appears
 * unresponsive. This command walks the container stack upward, deleting the
 * empty textblock and any parent that would be emptied by the deletion, until
 * it reaches a node that the spec refuses to remove.
 *
 * Behaviour (spec §4.4 tables):
 *
 * - collapsed cursor at the **start** of an **empty** textblock → walk the
 *   container stack deleting the textblock and any emptied parent; land the
 *   cursor at the end of the predecessor's last descendant textblock.
 * - inside a `dl` (`dt`/`dd`) → **refuse** (no-op): preserves `(dt dd)+`
 *   (spec §4.4.4, dual to definition-lists.md §6.2).
 * - inside the **last** block of a `table_cell` → **refuse** (no-op): a cell
 *   must retain at least one block (spec §4.4.6).
 * - when the walk reaches a non-deletable container (`sections`, `preface`,
 *   `bibliography`, `doc`) that would be emptied → **re-seed** it with a minimal
 *   valid `clause > paragraph` so the document always has an editable position
 *   (spec §4.4.8 doc-start anchor).
 * - any other position (non-empty textblock, cursor not at start, ranged or
 *   node selection) → return `false` so the chain's stock deletion steps run.
 *
 * Single transaction (spec §1.7.1); `scrollIntoView` set (§1.7.3).
 */

import type { Command } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import type { ResolvedPos } from "prosemirror-model";

import { NODE_NAME, nodeType, isEmptyTextblock } from "../schema.js";
import { generateId } from "../util.js";

/**
 * Non-deletable structural containers (spec §4.4.8): the fixed top-level
 * skeleton of a Metanorma document. The walk stops at these without deleting
 * them; if one would be emptied, it is re-seeded instead.
 */
const NON_DELETABLE_NAMES: ReadonlySet<string> = new Set([
  NODE_NAME.doc,
  NODE_NAME.sections,
  NODE_NAME.preface,
  NODE_NAME.bibliography,
]);

/**
 * Refuse nodes (spec §4.7.3 step 2): if the walk reaches one of these and it
 * would be emptied by the deletion, the command refuses entirely (`false`). The
 * up-front `dl` guard (§4.4.4) prevents reaching `dl`/`dt`/`dd` in practice;
 * `table_cell` can be reached when the textblock is nested inside other
 * containers within a cell.
 */
const REFUSE_NAMES: ReadonlySet<string> = new Set([
  NODE_NAME.dl,
  NODE_NAME.dt,
  NODE_NAME.dd,
  NODE_NAME.table_cell,
]);

/** Outcome of the container-stack walk (spec §4.7.3). */
type WalkResult =
  | { readonly kind: "refuse" }
  | { readonly kind: "ok"; readonly cutDepth: number; readonly reseed: boolean };

/**
 * Walk the container stack from the textblock upward (spec §4.7.3), determining
 * the outermost node to delete (`cutDepth`), whether to refuse, and whether to
 * re-seed a non-deletable container.
 *
 * The walk advances `cutDepth` to each ancestor whose **only** child is the
 * node being deleted (i.e. the ancestor would be emptied). It stops at the
 * first ancestor that: is a refuse-node that would be emptied (→ refuse), is a
 * non-deletable container (→ re-seed if it would be emptied), or has other
 * children that survive (→ normal stop).
 */
function walkContainerStack($from: ResolvedPos): WalkResult {
  let cutDepth = $from.depth;
  for (let d = $from.depth - 1; d >= 1; d--) {
    const node = $from.node(d);
    const name = node.type.name;

    if (REFUSE_NAMES.has(name)) {
      if (node.childCount === 1) {
        return { kind: "refuse" };
      }
      return { kind: "ok", cutDepth, reseed: false };
    }

    if (NON_DELETABLE_NAMES.has(name)) {
      if (node.childCount === 1) {
        return { kind: "ok", cutDepth, reseed: true };
      }
      return { kind: "ok", cutDepth, reseed: false };
    }

    if (node.childCount === 1) {
      cutDepth = d;
      continue;
    }

    return { kind: "ok", cutDepth, reseed: false };
  }

  return { kind: "ok", cutDepth, reseed: false };
}

/**
 * Delete an empty textblock at the cursor and unwind the container stack
 * (spec §4).
 *
 * Not a factory: the command resolves node types through `state.schema`, so it
 * works against any schema that names its nodes as in {@link NODE_NAME}.
 */
export const emptyTextblockBackspace: Command = (state, dispatch) => {
  const { selection } = state;
  const { $from } = selection;

  // §4.7.2 applicability — collapsed TextSelection at start of empty textblock.
  if (!selection.empty) return false;
  if (!$from.parent.isTextblock) return false;
  if ($from.parentOffset !== 0) return false;
  if (!isEmptyTextblock($from.parent)) return false;

  // §4.4.4 — refuse inside a `dl` structure (`dl`/`dt`/`dd` ancestor).
  for (let d = $from.depth; d >= 1; d--) {
    const name = $from.node(d).type.name;
    if (name === NODE_NAME.dl || name === NODE_NAME.dt || name === NODE_NAME.dd) {
      return false;
    }
  }

  // §4.7.3 — walk the container stack.
  const result = walkContainerStack($from);
  if (result.kind === "refuse") return false;

  if (dispatch === undefined) return true;

  const tr = state.tr;
  const { cutDepth, reseed } = result;
  const delStart = $from.before(cutDepth);
  const delEnd = $from.after(cutDepth);

  // Delete the outermost node in the emptied chain.
  tr.delete(delStart, delEnd);

  if (reseed) {
    // §4.4.8 doc-start anchor: re-seed the emptied non-deletable container
    // with a minimal `clause > paragraph` so the document has an editable
    // position.
    const clauseType = nodeType(state.schema, NODE_NAME.clause);
    const paraType = nodeType(state.schema, NODE_NAME.paragraph);
    if (clauseType !== null && paraType !== null) {
      const para = paraType.create();
      const clause = clauseType.create({ id: generateId(), title: null }, para);
      tr.insert(delStart, clause);
      tr.setSelection(TextSelection.near(tr.doc.resolve(delStart + 2)));
    }
  } else {
    // §4.7.3 step 3 — land the cursor.
    // `$from.index(cutDepth - 1)` is the deleted node's index within its
    // parent. If it had a previous sibling, search backward (−1) to land at
    // the end of the sibling's last descendant textblock; otherwise search
    // forward (+1) to land at the start of the next sibling (now the first
    // child).
    const deletedNodeIndex = $from.index(cutDepth - 1);
    const dir = deletedNodeIndex > 0 ? -1 : 1;
    tr.setSelection(TextSelection.near(tr.doc.resolve(delStart), dir));
  }

  tr.scrollIntoView();
  dispatch(tr);
  return true;
};
