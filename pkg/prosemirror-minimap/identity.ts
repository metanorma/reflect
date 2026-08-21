/**
 * Stable block identity (§4.3).
 *
 * ProseMirror's immutable documents use structural sharing: applying a
 * transaction leaves every untouched subtree's `Node` instance referentially
 * identical (`===`) in the new document. Row identity is therefore a
 * monotonic counter stored in a module-level `WeakMap<Node, number>` —
 * schema-agnostic, no `id` attrs, no position arithmetic.
 */

import type { Node } from 'prosemirror-model';


let nextKey = 0;

const keys = new WeakMap<Node, number>();

/**
 * Return the stable key for `node`, assigning one on first sight.
 * Monotonic; never reused within a session.
 */
export function keyOf(node: Node): number {
  let key = keys.get(node);
  if (key === undefined) {
    key = nextKey;
    nextKey += 1;
    keys.set(node, key);
  }
  return key;
}
