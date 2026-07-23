/**
 * Shared attribute helpers (§6).
 *
 * Every node and mark declares a catch-all `data` attribute (default `{}`)
 * that captures the open index-signature keys from `types.ts` for lossless
 * round-tripping. Typed attributes default to `null` (mirroring the `?`
 * optionality in the source interfaces), except for the numeric defaults
 * documented in §6.3.
 *
 * `data` is serialized to JSON but never rendered to the DOM.
 */

import type { AttributeSpec } from "prosemirror-model";

/** A `data: { default: {} }` attribute spec — the universal catch-all. */
export const DATA_ATTR = { data: { default: {} } } as const;

/**
 * Attribute specs for the {@link SectionAttrs} shape —
 * `id`, `number`, `title` (all default `null`) plus the `data` catch-all.
 */
export function sectionAttrs(): Record<string, AttributeSpec> {
  return {
    id: { default: null },
    number: { default: null },
    title: { default: null },
    ...DATA_ATTR,
  };
}

/**
 * Attribute specs for the {@link BaseAttrs} shape —
 * `id`, `number` (both default `null`) plus the `data` catch-all.
 */
export function baseAttrs(): Record<string, AttributeSpec> {
  return {
    id: { default: null },
    number: { default: null },
    ...DATA_ATTR,
  };
}
