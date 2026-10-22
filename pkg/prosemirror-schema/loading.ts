/**
 * Open-attribute JSON loading (§12.1).
 *
 * ProseMirror's stock `Schema` silently DROPS any attribute key not declared
 * on the node/mark type: `computeAttrs` iterates the declared attrs only, so
 * an unknown top-level key in the input JSON never reaches the node. The
 * open-attribute model (§6 rule 2, §12.1) instead requires unknown keys to be
 * captured into the catch-all `data` attribute so nothing is silently
 * dropped — with one exception: `x-` editor-only keys (§6 rule 5) are
 * dropped at load, never captured, so editor-private values cannot leak into
 * `data` (the interchange passthrough) when a build no longer declares the
 * attr. Output is untouched: `Node.toJSON()` / `Mark.toJSON()` already
 * emit typed attrs at the top level and everything else under `data` (§12).
 *
 * `MetanormaSchema` closes the load-side gap by wrapping the schema
 * instance's `nodeFromJSON` / `markFromJSON`. The wrappers are deliberately
 * SHALLOW: each call partitions a single node's or mark's `attrs` record and
 * delegates. No recursion is written here — it is emergent, because the base
 * `Node.fromJSON` maps `json.marks` through `schema.markFromJSON` and
 * `Fragment.fromJSON` maps child JSON through `schema.nodeFromJSON` **at call
 * time**, so reassigning the instance properties routes nested content and
 * nested marks through the wrappers automatically.
 *
 * Upstream shape this depends on (prosemirror-model): the `Schema`
 * constructor installs `nodeFromJSON` / `markFromJSON` as **own instance
 * properties** (arrows closing over the instance); `Schema.prototype` has
 * neither. A prototype-method override would therefore never run — it is
 * shadowed by the own properties — and a `super.nodeFromJSON(...)` call from
 * a subclass method would throw (`Schema.prototype.nodeFromJSON` is
 * `undefined`). The only viable override point is capturing the base arrows
 * after `super(spec)` and reassigning the own properties, which is what the
 * constructor below does. The properties are non-`readonly` in the upstream
 * `.d.ts`, so this typechecks; the recursion guarantee above is exactly why
 * the reassignment also fixes nested nodes and marks.
 */

import { Schema } from 'prosemirror-model';
import type { AttributeSpec, Mark, Node } from 'prosemirror-model';

import { isEditorOnlyAttr } from './attrs.js';


/** The name of the catch-all attribute (§6 rule 2). */
const DATA_KEY = 'data';

/**
 * Partition ONE attrs record for a type that declares the `data` catch-all:
 * declared keys are kept as-is; unknown keys are captured into `data`, except
 * `x-` editor-only keys (§6 rule 5), which are dropped (see below).
 *
 * Policy — touch nothing unless there is something to capture:
 * - Non-object / absent / array `attrs` is returned **untouched** (stock
 *   defaults and error paths own it).
 * - `x-` unknown keys (§6 rule 5) are **filtered out first** — they are never
 *   captured, and they do not count as unknowns for the checks below. With
 *   only `x-` unknowns present, the record takes the untouched-passthrough
 *   branch, so `{x-…, data: 'str'}` passes through stock-style — the
 *   refuse-to-silently-drop rationale does not apply to keys the load side
 *   drops by design (§12 item 4).
 * - No unknown keys → the **original** record is returned, so behavior is
 *   byte-identical to stock — including a non-object `data` value, which
 *   stock passes through unvalidated (`computeAttrs` does not type-check
 *   attr values) and `toJSON` re-emits verbatim.
 * - Unknown keys + explicit `data` absent / `null` / plain object → merged
 *   `data` = `{...unknowns, ...explicitData}`. Collisions: the explicit
 *   `data` wins. Fresh objects are always built — `DATA_ATTR`'s default
 *   `{}` is a single shared reference (see `attrs.ts`), so mutation here
 *   would leak across nodes.
 * - Non-`x-` unknown keys + explicit `data` that is a string / number /
 *   boolean / array → `RangeError` naming the type. Spreading such a value
 *   produces indexed-property garbage, and silently dropping these keys
 *   (what stock does) is precisely what §12.1 forbids. The input was
 *   already malformed — valid `toJSON` output always carries an object
 *   `data` — and staying in the `RangeError` family keeps the GUI's
 *   invalid-document classification (`loadDocFromJson`) working.
 *
 * An `x-` key **inside** an explicit `data` object is never touched —
 * data-interior contents are untouched Metanorma payload (§6 rule 5, §17.7).
 *
 * Returns the original reference when nothing changes, so callers can skip
 * rebuilding the enclosing JSON object.
 */
function partitionAttrs(
  typeName: string,
  declared: Readonly<Record<string, AttributeSpec>>,
  attrs: unknown,
): unknown {
  if (
    attrs === null || attrs === undefined ||
    typeof attrs !== 'object' || Array.isArray(attrs)
  ) {
    return attrs;
  }

  const src = attrs as Readonly<Record<string, unknown>>;

  // Filter-first (§12 item 1): `x-` editor-only keys are dropped before the
  // unknown set is built — they are neither captured into `data` nor counted
  // as unknowns by the malformed-corner check below (§12 item 4).
  let hasUnknown = false;
  const unknowns: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    if (
      key !== DATA_KEY &&
      !(key in declared) &&
      !isEditorOnlyAttr(key)
    ) {
      unknowns[key] = src[key];
      hasUnknown = true;
    }
  }
  if (!hasUnknown) return attrs;

  const explicit = src[DATA_KEY];
  if (
    explicit !== null && explicit !== undefined &&
    (typeof explicit !== 'object' || Array.isArray(explicit))
  ) {
    const kind = Array.isArray(explicit) ? 'array' : typeof explicit;
    throw new RangeError(
      `MetanormaSchema: '${typeName}' carries undeclared attribute keys ` +
      `together with a non-object 'data' (${kind}); refusing to merge or ` +
      `silently drop the keys.`,
    );
  }

  const kept: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    if (key !== DATA_KEY && key in declared) kept[key] = src[key];
  }
  const extras = (explicit ?? {}) as Readonly<Record<string, unknown>>;
  return { ...kept, [DATA_KEY]: { ...unknowns, ...extras } };
}

/**
 * A `Schema` whose `nodeFromJSON` / `markFromJSON` partition unknown
 * attribute keys into the `data` catch-all (§12.1), leaving every other
 * behavior — content model, marks, DOM serialization, error contracts —
 * stock.
 *
 * Each wrapper, in order:
 * 1. Routes non-object `json` straight to the base arrow. This guard is
 *    mandatory BEFORE any `json.type` lookup: property access on
 *    `null`/`undefined` throws `TypeError` where the base throws its
 *    documented `RangeError`. Reachable via corrupt nested input —
 *    `{type:'doc', content:[null]}` maps each entry through
 *    `schema.nodeFromJSON`.
 * 2. Delegates unchanged when the type is unknown (stock `RangeError`) or
 *    when the type does not declare the `data` catch-all — the built-in
 *    `text`, or custom specs composed from the exported raw spec maps
 *    (§11) that omit `DATA_ATTR`.
 * 3. Otherwise rewrites only `json.attrs` via {@link partitionAttrs} and
 *    delegates to the captured base arrow.
 *
 * Constructing a plain `Schema` from the same spec maps (e.g. in tests, or
 * the minimap harness's synthetic schemas) yields stock behavior — the
 * partitioning lives on this class, not on the spec maps.
 */
export class MetanormaSchema extends Schema {
  constructor(spec: ConstructorParameters<typeof Schema>[0]) {
    super(spec);

    // Capture the base own-property arrows, then reassign the own
    // properties — see the module docstring for why prototype methods
    // cannot work here.
    const baseNodeFromJSON = this.nodeFromJSON;
    const baseMarkFromJSON = this.markFromJSON;

    this.nodeFromJSON = (json: unknown): Node => {
      if (!json || typeof json !== 'object') return baseNodeFromJSON(json);
      const record = json as Readonly<Record<string, unknown>>;
      // Public spec lookup (`NodeType.attrs` is @internal upstream): the raw
      // NodeSpec carries the declared attr names, which is all the partition
      // needs. `this.spec.nodes[name]` is undefined for an unknown type.
      const spec = this.spec.nodes.get(record.type as string);
      if (!spec || !spec.attrs || !(DATA_KEY in spec.attrs)) {
        return baseNodeFromJSON(json);
      }
      const attrs = partitionAttrs(record.type as string, spec.attrs, record.attrs);
      return attrs === record.attrs
        ? baseNodeFromJSON(json)
        : baseNodeFromJSON({ ...record, attrs });
    };

    this.markFromJSON = (json: unknown): Mark => {
      if (!json || typeof json !== 'object') return baseMarkFromJSON(json);
      const record = json as Readonly<Record<string, unknown>>;
      const spec = this.spec.marks.get(record.type as string);
      if (!spec || !spec.attrs || !(DATA_KEY in spec.attrs)) {
        return baseMarkFromJSON(json);
      }
      const attrs = partitionAttrs(record.type as string, spec.attrs, record.attrs);
      return attrs === record.attrs
        ? baseMarkFromJSON(json)
        : baseMarkFromJSON({ ...record, attrs });
    };
  }
}
