/**
 * `outdent.ts` — outdent command (outdent.md §3).
 *
 * A thin re-export of `prosemirror-commands`'s `lift`. Under the cohort-split
 * schema (§8.2), each container admits only its own cohort's section types,
 * so lifting a block out of a structural container where it would be invalid
 * is already prevented by ProseMirror's content validation — no command-level
 * guard is needed.
 *
 * Conforms to the Command contract (`EditorCommands.spec.md` §1.5): pure,
 * query/dispatch parity, non-throwing, and view-free.
 */

export { lift } from 'prosemirror-commands';
