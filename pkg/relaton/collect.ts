/**
 * Document-walking helper — `collectBibliographyItems` (README.spec.md §4).
 *
 * Gathers all `BibliographicItem` values from a ProseMirror document JSON
 * (or a live PM node) without depending on `prosemirror-model`. This keeps
 * `@metanorma/relaton` zero-PM-dependency: the function accepts `unknown` and
 * narrows structurally, so the caller can pass `view.state.doc.toJSON()` or a
 * parsed `.mn.json` object without importing the PM model package here.
 */

import type { BibliographicItem } from './types.js';

/**
 * The minimal structural shape of a ProseMirror node JSON object that this
 * module reads. Defined locally to avoid importing `prosemirror-model`.
 */
interface PmNodeJson {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNodeJson[];
}

/**
 * Narrow an `unknown` value to the {@link PmNodeJson} shape.
 *
 * Returns `false` for anything that is not a plain object with a string `type`.
 * Array inputs (which `doc.toJSON()` top-level is NOT — the doc is always a
 * single node) are rejected.
 */
function isPmNodeJson(value: unknown): value is PmNodeJson {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj["type"] === "string";
}

/**
 * Extract a `BibliographicItem` from a node's `item` attr, if present and valid.
 *
 * The `bibdata` and `bibitem` nodes store the item as a single JSON attr named
 * `item`. Returns `null` when the attr is missing or not a plain object.
 */
function extractItem(node: PmNodeJson): BibliographicItem | null {
  const item = node.attrs?.["item"];
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return null;
  }
  // Structural spot-check: a BibliographicItem must have array-typed
  // title/docid/contributor/date fields (the helpers rely on .find / [0]).
  const candidate = item as Record<string, unknown>;
  if (
    !Array.isArray(candidate["title"]) ||
    !Array.isArray(candidate["docid"]) ||
    !Array.isArray(candidate["contributor"]) ||
    !Array.isArray(candidate["date"])
  ) {
    return null;
  }
  return item as BibliographicItem;
}

/**
 * Walk a ProseMirror document (JSON or live node) and collect all
 * `BibliographicItem` values from `bibdata` and `bibitem` nodes
 * (README.spec.md §4).
 *
 * The `bibdata` node (document-level metadata, the first child of `doc`) is
 * collected first, followed by every `bibitem` node in document order.
 *
 * @param doc - The document root, as JSON (`doc.toJSON()`) or a compatible
 *   node-like object. Passed as `unknown` so this package does not need
 *   `prosemirror-model` as a dependency. Non-node-shaped input yields `[]`.
 * @returns A flat array of every `BibliographicItem` found. The document's own
 *   `bibdata` (if present) is first, then bibliography entries in document
 *   order. May contain duplicates if the same citation key appears in multiple
 *   entries — deduplication is the caller's responsibility.
 */
export function collectBibliographyItems(doc: unknown): BibliographicItem[] {
  if (!isPmNodeJson(doc)) return [];
  const items: BibliographicItem[] = [];
  walk(doc, items);
  return items;
}

/**
 * Recursive depth-first walk. Visits `bibdata` and `bibitem` nodes and pushes
 * their `item` attr into `out`.
 */
function walk(node: PmNodeJson, out: BibliographicItem[]): void {
  if (node.type === "bibdata" || node.type === "bibitem") {
    const item = extractItem(node);
    if (item !== null) {
      out.push(item);
    }
  }
  const children = node.content;
  if (children !== undefined) {
    for (const child of children) {
      walk(child, out);
    }
  }
}
