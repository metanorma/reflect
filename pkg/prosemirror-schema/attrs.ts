/**
 * Shared attribute helpers (§6).
 *
 * Every node and mark declares a catch-all `data` attribute (default `{}`)
 * that captures the open index-signature keys of the JSON attribute model
 * (`MetanormaDocument` / `MetanormaMark` in
 * `pkg/prosemirror-editor/types.ts`) for lossless round-tripping. Typed
 * attributes default to `null` (mirroring the `?` optionality in the source
 * interfaces), except for the numeric defaults documented in §6.3.
 *
 * `data` is serialized to JSON but never rendered to the DOM.
 */

import type { AttributeSpec } from 'prosemirror-model';


/** A `data: { default: {} }` attribute spec — the universal catch-all. */
export const DATA_ATTR = { data: { default: {} } } as const;

/**
 * Attribute specs for the section-node shape —
 * `id`, `number` (both default `null`) plus the `data` catch-all. Same shape
 * as {@link baseAttrs}; kept as a semantic alias for the ten section node
 * types. The section heading is a `section_title` child node (§8.2), not an
 * attribute.
 */
export function sectionAttrs(): Record<string, AttributeSpec> {
  return {
    id: { default: null },
    number: { default: null },
    ...DATA_ATTR,
  };
}

/**
 * Attribute specs for the base-node shape —
 * `id`, `number` (both default `null`) plus the `data` catch-all.
 */
export function baseAttrs(): Record<string, AttributeSpec> {
  return {
    id: { default: null },
    number: { default: null },
    ...DATA_ATTR,
  };
}
