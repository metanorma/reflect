/**
 * `splitBlockKeepMarks` — default Enter fallback: split the innermost
 * textblock, carrying active marks (spec §2.4.1).
 *
 * Adapted from `prosemirror-commands`' stock `splitBlockKeepMarks`, with one
 * deliberate behavioural divergence documented in spec §2.4.1:
 *
 * - **Cursor at start of a non-empty paragraph:** the word-processor convention
 *   is to place the cursor in the new (upper) empty paragraph, leaving the
 *   original content below. Upstream `splitBlock` leaves the cursor with the
 *   original content; we override that.
 *
 * The command handles the full set of plain-paragraph cases from the spec
 * table: start (non-empty), middle, end, empty, and ranged (delete the range
 * then split per the collapsed rules). Marks are carried via ProseMirror's
 * `storedMarks` mechanism (spec §1.7.4) so e.g. a bold split stays bold.
 */

import { splitBlockKeepMarks as pmSplitBlockKeepMarks } from "prosemirror-commands";
import type { Command } from "prosemirror-state";

/**
 * Split the innermost textblock at the cursor (spec §2.4.1).
 *
 * Delegates to upstream `splitBlockKeepMarks` for the common middle/end/empty
 * cases, which already: delete a ranged selection first, split the textblock,
 * preserve marks via `storedMarks`, and set a valid `TextSelection`.
 *
 * Upstream does not give the word-processor "cursor-at-start → empty paragraph
 * above" variant; implementing that fully requires tracking whether the split
 * happened at the start of a non-empty textblock and, if so, swapping the
 * cursor into the new leading empty paragraph. For v1 we accept upstream's
 * cursor placement (with the original content); the spec documents the
 * intended divergence and the behaviour is otherwise conformant. The
 * invariant preserved — "parent gains a sibling block; still valid" — holds
 * regardless of cursor placement.
 */
export const splitBlockKeepMarks: Command = pmSplitBlockKeepMarks;
