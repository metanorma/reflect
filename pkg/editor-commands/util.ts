/**
 * Shared command utilities (spec §1.9.2).
 *
 * Re-exports the `chainCommands` combinator from `prosemirror-commands` so
 * consumers can compose command sequences (spec §1.9.2): "try A, else B, else
 * C". The Enter keymap (§2.8) uses it to assemble the dispatch chain from the
 * individual Enter commands.
 *
 * `generateId()` is the shared id-generation helper used by all node-insertion
 * commands (tables, figures, sections, footnotes) so they are immediately
 * referenceable by `xref`/`eref`.
 *
 * Section references (e.g. §1.9.2) below refer to
 * `docs/EditorCommands.spec.md`.
 */

export { chainCommands } from 'prosemirror-commands';

/**
 * Generate a fresh, unique id string via `crypto.randomUUID()`.
 *
 * Used by all node-insertion commands (tables, figures, sections, footnotes)
 * so the created node is immediately referenceable by `xref`/`eref`. Ids are
 * immutable once generated — they are not renumbered on serialize.
 *
 * Falls back to a timestamp+random string when `crypto.randomUUID` is not
 * available (older runtimes / non-secure contexts).
 */
export function generateId(): string {
  const c: typeof globalThis.crypto | undefined =
    typeof globalThis !== 'undefined' && typeof globalThis.crypto === 'object'
      ? globalThis.crypto
      : undefined;
  if (c !== undefined && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  return [
    'id',
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 10),
  ].join('-');
}
