/**
 * Shared attribute helpers (§6).
 *
 * Every node and mark declares a catch-all `data` attribute (default `{}`)
 * that captures the open index-signature keys of the JSON attribute model
 * (`MetanormaDocument` / `MetanormaMark` in
 * `pkg/prosemirror-editor/types.ts`) for lossless round-tripping. Typed
 * attributes default to `null` (mirroring the `?` optionality in the source
 * interfaces), except for the numeric defaults documented in §6 rule 3.
 *
 * `data` is serialized to JSON but never rendered to the DOM.
 */

import type { AttributeSpec } from 'prosemirror-model';


/**
 * A `data: { default: {} }` attribute spec — the universal catch-all.
 *
 * HAZARD: ProseMirror attr defaults are shared values, not per-node — every
 * node taking the default receives the SAME `{}` reference. Nothing may
 * mutate `node.attrs.data` in place. Loading-side code (`loading.ts`)
 * therefore always builds fresh `data` objects.
 */
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

/**
 * The `x-` name prefix marking an attribute as editor-only (§6 rule 5).
 *
 * Editor-only attributes are editor-private state — caches, hints, UI
 * metadata — never interchange data. They are declared as typed attributes,
 * persist in `.mn.json`, and are never named in `toDOM`/`parseDOM`, so they
 * never reach any DOM channel (including the clipboard, which serializes
 * through the DOM layer). The load side drops an undeclared `x-` key
 * (`loading.ts`, §12 item 1), and the converter ignores `x-` keys in every
 * position (§17.7).
 */
export const EDITOR_ONLY_ATTR_PREFIX = 'x-' as const;

/**
 * Whether `name` is an editor-only attribute name (§6 rule 5): true iff it
 * starts with `x-` (so `x-` itself is editor-only; `x`, `xref`, `xmin` are
 * not).
 */
export function isEditorOnlyAttr(name: string): boolean {
  return name.startsWith(EDITOR_ONLY_ATTR_PREFIX);
}

/**
 * A fresh shallow copy of `attrs` with every top-level `x-` key removed
 * (§6 rule 5, §17.7). The input is never mutated.
 *
 * **Top-level only.** This does NOT recurse into `data`: data-interior
 * contents are untouched Metanorma payload at this layer. A converter
 * scrubbing `data` contents applies this helper to them as an explicit
 * per-channel step (§17.7).
 */
export function stripEditorOnlyAttrs(
  attrs: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (!isEditorOnlyAttr(key)) out[key] = value;
  }
  return out;
}
