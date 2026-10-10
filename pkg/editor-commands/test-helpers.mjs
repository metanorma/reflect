/**
 * Shared helpers for the @metanorma/editor-commands headless test files
 * (test-sections.mjs, test-dl.mjs). Not a test file — excluded from the
 * test-*.mjs glob by its name.
 */
import { EditorState, TextSelection } from "prosemirror-state";

/** Children of a PM node as an array (Fragment has no Symbol.iterator). */
export const kids = (n) => Array.from({ length: n.childCount }, (_, i) => n.child(i));

/** All `id` attrs in a subtree, in document order. */
export const ids = (n, acc = []) => {
  for (const c of kids(n)) { if (c.attrs?.id != null) acc.push(c.attrs.id); ids(c, acc); }
  return acc;
};

/**
 * Position just inside the first textblock matching `marker`: the sentinel
 * `'(empty)'` selects the first EMPTY textblock; any other string selects the
 * first textblock whose serialized form contains it. Throws when not found —
 * a fixture bug, not a test outcome. (No hand position arithmetic.)
 */
export const posIn = (doc, marker) => {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (!node.isTextblock) return true;
    const isTarget = marker === '(empty)'
      ? node.content.size === 0
      : JSON.stringify(node.toJSON()).includes(marker);
    if (isTarget) { found = pos + 1; return false; }
    return true;
  });
  if (found < 0) throw new Error(`posIn: marker not found: ${marker}`);
  return found;
};

/**
 * Run a command against `state`, applying its transaction.
 * Returns `{ ok, state }` — `ok` is the command's return value, `state` the
 * post-transaction state (the ORIGINAL state object when the command did not
 * dispatch).
 */
export const run = (state, cmd, ...args) => {
  let next = state;
  const ok = cmd(state, ...args, (tr) => { next = state.apply(tr); });
  return { ok, state: next };
};

/** An EditorState with a collapsed TextSelection at `pos` in `doc`. */
export const at = (doc, pos) => EditorState.create({
  doc,
  selection: TextSelection.create(doc, pos),
});
