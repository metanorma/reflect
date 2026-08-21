/**
 * Built-in layers: `text` and `selection`, plus span types and the
 * controller-side anchor resolution (§8.4).
 *
 * Layer data flows as `setLayer(id, spans)`, but spans are declared in
 * **anchor space** — document positions or node ids — never row indices.
 * The controller resolves anchors to rows (`rowAtPos` / `rowAtNodeId`)
 * and re-anchors through `tr.mapping` on every transaction; the producer
 * only emits anchors in its own natural space.
 */

import type { LayerDeclaration, LayerSpans } from './types.js';


/** The built-in layer declarations (§8.4), in draw order. */
export const builtinLayers: readonly LayerDeclaration[] = [
  { id: 'text', z: 10, kind: 'content' },
  { id: 'selection', z: 20, kind: 'overlay' },
];

/** Fallback color for a consumer layer with no `tone` — matches markers. */
export const DEFAULT_MARKER_COLOR = '#d29922';

/**
 * Merged layer declarations (§8.4): the built-ins plus consumer layers,
 * sorted ascending by `z`. A consumer layer with a built-in's id replaces
 * it (same id = same layer).
 */
export function mergeLayers(
  consumer: readonly LayerDeclaration[] | undefined,
): LayerDeclaration[] {
  const map = new Map<string, LayerDeclaration>();
  for (const l of builtinLayers) {
    map.set(l.id, l);
  }
  for (const l of consumer ?? []) {
    map.set(l.id, l);
  }
  return [...map.values()].sort((a, b) => a.z - b.z);
}

/** Selection spans for `state.selection`, anchored to positions (§8.4). */
export function selectionSpans(from: number, to: number): LayerSpans {
  return {
    anchor: 'pos',
    spans: [{ kind: 'pos', from, to }],
  };
}

/**
 * A layer span resolved to row indices (the controller's half of the
 * contract, §8.4): whole rows, `[first, last]` inclusive.
 */
export interface RowSpan {
  first: number;
  last: number;
  /** Resolved tone (color) for painting; the default when `tone` is absent. */
  color: string;
  /** Marker lane: 0 = inline tint; 1+ = right-edge lane n. */
  lane: number;
}

/**
 * Resolve `LayerSpans` against rows (§8.4): map each anchor to the row
 * range it covers. Positions between rows (or unresolvable ids) contribute
 * nothing — a stale span degrades by disappearing, never by misplacing
 * (§7.2).
 */
export function resolveSpans(
  spans: LayerSpans,
  rowAtPos: (pos: number) => number | null,
  rowAtNodeId: (id: string) => number | null,
  defaultColor: string,
): RowSpan[] {
  const out: RowSpan[] = [];
  for (const span of spans.spans) {
    let first: number | null = null;
    let last: number | null = null;
    if (span.kind === 'pos') {
      const to = span.to ?? span.from;
      if (to < span.from) {
        continue;
      }
      first = rowAtPos(span.from);
      // A position at the very end of a row's text still belongs to it;
      // `rowAtPos` clamps to the row whose range [pos, pos+size) holds it.
      if (first === null && span.from > 0) {
        first = rowAtPos(span.from - 1);
      }
      last = rowAtPos(to);
      if (last === null && to > 0) {
        last = rowAtPos(to - 1);
      }
    } else {
      first = rowAtNodeId(span.id);
      last = first;
    }
    if (first === null || last === null) {
      continue;
    }
    if (last < first) {
      [first, last] = [last, first];
    }
    const tone = spans.tone?.(span) ?? defaultColor;
    out.push({
      first,
      last,
      color: tone,
      lane: spans.lane ?? 0,
    });
  }
  return out;
}
