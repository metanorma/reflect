/**
 * Height estimation strategies and the calibration store (§4.4, §4.5).
 *
 * Heights are editor-space pixels — estimates of the block's rendered height
 * in the editor's own coordinate system. Estimation is per visual class.
 * Measured correction is advisory (§4.5): the DOM is sampled inside already
 * scheduled repaint frames, never as a synchronous dependency of paint.
 */

import type { Node } from 'prosemirror-model';

import type {
  HeightStrategy,
  MinimapTheme,
} from './types.js';


/**
 * The class-level strategy map: the last strategy a classifier assigned to
 * the class (§4.4 — estimation is per visual class). A `RowSpec.height`
 * override wins for that node; otherwise the class-level entry applies.
 */
export type ClassStrategies = ReadonlyMap<string, HeightStrategy>;

/**
 * Estimate a node's editor-space height in px (§4.4). Every strategy
 * produces a positive px value — the floor guards degenerate strategy
 * inputs (a `fixed` px of 0, an `estimate` returning 0, a zero
 * `lineHeight` theme).
 */
export function estimateHeight(
  node: Node,
  classId: string,
  override: HeightStrategy | undefined,
  classStrategies: ClassStrategies,
  theme: MinimapTheme,
  calibrated: ReadonlyMap<string, number>,
): number {
  const strategy = override ?? classStrategies.get(classId);
  if (strategy === undefined) {
    return fallbackHeight(node, theme);
  }
  const px = strategyPx(strategy, node, classId, calibrated, theme);
  return px > 0 ? px : fallbackHeight(node, theme);
}

/** The strategy's raw px (before the positive floor). */
function strategyPx(
  strategy: HeightStrategy,
  node: Node,
  classId: string,
  calibrated: ReadonlyMap<string, number>,
  theme: MinimapTheme,
): number {
  switch (strategy.kind) {
    case 'text':
      return textHeight(node.textContent.length, theme);
    case 'fixed':
      return strategy.px;
    case 'estimate':
      return strategy.px(node);
    case 'calibrated': {
      // The running median once samples exist; the class default until then.
      const sample = calibrated.get(classId);
      return sample ?? strategy.defaultPx;
    }
  }
}

/** The `text` strategy: `lines × lineHeight + spacing` (§4.4). */
export function textHeight(textLength: number, theme: MinimapTheme): number {
  const lines = Math.max(
    1,
    Math.ceil(textLength / Math.max(1, theme.charsPerLine)),
  );
  return Math.max(1, lines * theme.lineHeight + theme.spacing);
}

/**
 * Fallback when no strategy is registered for a class: the text formula for
 * textblocks, one editor line otherwise.
 */
function fallbackHeight(node: Node, theme: MinimapTheme): number {
  return node.isTextblock
    ? textHeight(node.textContent.length, theme)
    : theme.lineHeight + theme.spacing;
}

/**
 * Running-median calibration store (§4.5). Implements
 * `ReadonlyMap<string, number>` so it can be passed to estimation directly.
 *
 * Per visual class: the running median of DOM samples, seeded with the
 * class default. Windowed (last 32 samples) so the median tracks layout
 * changes; the resolved value is what `calibrated` classes estimate with
 * and what seeding new rows of the class uses.
 */
export class CalibrationStore implements ReadonlyMap<string, number> {
  private readonly samples = new Map<string, number[]>();
  private readonly medians = new Map<string, number>();

  /**
   * Seed a class with its default (its `calibrated.defaultPx`). Idempotent —
   * the first seed wins. Returns the class's resolved height.
   */
  seed(classId: string, defaultPx: number): number {
    if (!this.medians.has(classId)) {
      this.samples.set(classId, []);
      this.medians.set(classId, defaultPx);
    }
    return this.medians.get(classId) ?? defaultPx;
  }

  /** Record one DOM sample (px) for a class. */
  record(classId: string, px: number): void {
    let list = this.samples.get(classId);
    if (list === undefined) {
      list = [];
      this.samples.set(classId, list);
    }
    list.push(px);
    if (list.length > 32) {
      list.splice(0, list.length - 32);
    }
    const sorted = [...list].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const median = sorted.length % 2 === 1
      ? (sorted[mid] ?? 0)
      : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
    this.medians.set(classId, median);
  }

  /** The class's resolved height (median of samples, or the seeded default). */
  get(classId: string): number | undefined {
    return this.medians.get(classId);
  }

  /** Drop every sample but keep the seeded medians (epoch change, §4.6). */
  resetSamples(): void {
    for (const [classId, median] of this.medians) {
      this.samples.set(classId, [median]);
    }
  }

  // --- ReadonlyMap surface (delegated to the medians map). ----------------

  has(key: string): boolean {
    return this.medians.has(key);
  }

  get size(): number {
    return this.medians.size;
  }

  forEach(
    cb: (value: number, key: string, map: Map<string, number>) => void,
    thisArg?: unknown,
  ): void {
    this.medians.forEach(cb, thisArg);
  }

  entries(): MapIterator<[string, number]> {
    return this.medians.entries();
  }

  keys(): MapIterator<string> {
    return this.medians.keys();
  }

  values(): MapIterator<number> {
    return this.medians.values();
  }

  [Symbol.iterator](): MapIterator<[string, number]> {
    return this.medians[Symbol.iterator]();
  }
}
