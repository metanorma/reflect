/**
 * `newlineInCode` — insert a literal newline inside a code block (spec §2.4.2).
 *
 * Adapted from `prosemirror-commands`' stock `newlineInCode`. In the Metanorma
 * schema the only `code: true` textblock is `sourcecode` (content `text*`);
 * pressing Enter inside it must insert a `\n` into the text content — never
 * split the block, insert a `soft_break` node, or exit.
 *
 * Spec invariants preserved: the block stays a single `text*` node; the
 * `sourcecode` records `\n`, never a node.
 */

import { newlineInCode as pmNewlineInCode } from "prosemirror-commands";
import type { Command } from "prosemirror-state";

/**
 * Insert a `\n` at the cursor inside the current `sourcecode` block.
 *
 * - Collapsed selection: insert `\n` into the text at the cursor.
 * - Ranged selection: replace the range with `\n`.
 * - Not inside a code block: returns `false` (falls through the chain).
 *
 * The upstream command already handles ranged selections (it uses
 * `tr.replaceSelectionWith` semantics), so we re-export it as-is under the
 * Metanorma naming convention.
 */
export const newlineInCode: Command = pmNewlineInCode;
