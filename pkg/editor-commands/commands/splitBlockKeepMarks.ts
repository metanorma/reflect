/**
 * `splitBlockKeepMarks` — default Enter fallback: split the innermost
 * textblock, carrying active marks (spec §2.4.1).
 *
 * Adapted from `prosemirror-commands`' stock `splitBlockKeepMarks` by
 * delegation, with one deliberate behavioural divergence documented in spec
 * §2.4.1:
 *
 * - **Cursor at start of a non-empty textblock:** upstream inserts the empty
 *   paragraph before the original content (structure is already what the spec
 *   wants) but leaves the cursor with the original content. The word-processor
 *   convention — and spec §2.4.1's "start (non-empty)" row — places the cursor
 *   in the new (upper) empty paragraph; the wrapper moves it there and carries
 *   the active marks. The start-zone cursor rule is uniform across §2.4.1 and
 *   §2.4.5: the guard is not type-hardcoded, so the first paragraph of a
 *   container block (`note`, `example`, …) gets the same insert-before split.
 *
 * Middle/end/empty/ranged cases are stock behaviour, unchanged: upstream
 * deletes a ranged selection first, splits, preserves marks via
 * `storedMarks`, and sets a valid `TextSelection` (spec §1.7.4).
 *
 * Section references (e.g. §2.4.1) in this file refer to
 * `docs/EditorCommands.spec.md`.
 */

import {
  splitBlockKeepMarks as pmSplitBlockKeepMarks,
} from 'prosemirror-commands';
import { TextSelection } from 'prosemirror-state';
import type { Command, EditorState } from 'prosemirror-state';


/**
 * True when the ORIGINAL selection starts at offset 0 of a textblock with
 * content surviving the selection — a collapsed caret at the start of a
 * non-empty textblock (spec §2.4.1 "start (non-empty)" zone), or a ranged
 * selection from the block start that leaves content after it (the ranged
 * row composes to the same start-zone rule once the range is deleted). This
 * is the one zone where upstream's cursor placement diverges from the spec.
 */
function startsBlockWithContentSurviving(state: EditorState): boolean {
  const { selection } = state;
  const { $from, $to } = selection;
  return $from.parent.isTextblock
    && $from.parent === $to.parent
    && $from.parentOffset === 0
    && $to.pos < $to.end();
}


/**
 * Split the innermost textblock at the cursor (spec §2.4.1).
 *
 * Delegates to upstream `splitBlockKeepMarks` for the whole split and wraps
 * only the dispatch. In the start-of-non-empty zone it adjusts the resulting
 * transaction: the caret moves into the new leading empty paragraph and the
 * active marks are carried there explicitly.
 *
 * Two facts about the INSTALLED prosemirror-commands 1.7.1 this relies on
 * (verified against its dist, per CONTRIBUTING "Integration surfaces"):
 *
 * - `splitBlockAs`'s `atStart` case adjusts only the upper block's TYPE via
 *   `setNodeMarkup` — never the selection — so stock leaves the cursor with
 *   the original content.
 * - `splitBlockKeepMarks` skips `ensureMarks` when `$to.parentOffset` is 0
 *   (`state.storedMarks || parentOffset && marks()`), so at a block start it
 *   carries no marks by itself; and the empty upper paragraph has no position
 *   marks, hence the explicit `setStoredMarks` here (spec §1.7.4).
 *
 * The adjustment is made only when the transaction actually produced the
 * empty leading textblock (defensive against ranged selections that empty the
 * block before the split — §2.4.1's ranged row then follows the empty-block
 * rules, and stock's placement already conforms).
 */
export const splitBlockKeepMarks: Command = (state, dispatch) => {
  const adjust = startsBlockWithContentSurviving(state);
  if (!adjust) {
    return pmSplitBlockKeepMarks(state, dispatch);
  }

  const { $from } = state.selection;
  // Inside the paragraph that upstream inserts before the original textblock:
  // its open token lands at `$from.before()`; +1 is its interior start.
  const upperStart = $from.before($from.depth) + 1;

  return pmSplitBlockKeepMarks(state, dispatch && ((tr) => {
    // Adjust only when upstream actually produced the insert-before split:
    // an empty textblock at `upperStart` FOLLOWED by a non-empty sibling (the
    // original content). A ranged selection that deleted the whole block
    // instead follows §2.4.1's empty-block rules (stock's trailing-paragraph
    // placement already conforms) — the following sibling there is the new
    // empty paragraph, so the check declines.
    const $upper = tr.doc.resolve(upperStart);
    const following = tr.doc.resolve(upperStart + 1).nodeAfter;
    if (
      $upper.parentOffset === 0
      && $upper.parent.content.size === 0
      && following !== null
      && following.content.size > 0
    ) {
      tr.setSelection(TextSelection.near($upper, 1));
      tr.setStoredMarks(state.storedMarks ?? $from.marks());
    }
    dispatch(tr);
  }));
};
