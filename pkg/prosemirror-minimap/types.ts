/**
 * All public types for `@metanorma/prosemirror-minimap`.
 *
 * Implements `docs/ProseMirrorMinimap.spec.md` §5 (classifier, theme), §4.2
 * (BlockRow), §6.2 (DisplayMode), §8.1 (Renderer payloads, LayerDeclaration),
 * §7.1 (MinimapOptions), §10.2 (hover payload).
 *
 * This module is type-only plus the `defaultTheme` constant — it must stay
 * importable from the React-free `./core` entry.
 */

import type { Node } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';


// ---------------------------------------------------------------------------
// The editor-view seam (§7.1)
// ---------------------------------------------------------------------------

/** Rect coordinates as `coordsAtPos` returns them. */
export interface Coords {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Minimal structural editor-view type.
 *
 * Not `EditorView`: this repo's PnP graph resolves `prosemirror-view`
 * 1.42.0 (pinned direct dep) and 1.42.1 (`prosemirror-state`'s peer range)
 * as separate instances, so `EditorView` types are nominally incompatible
 * across package boundaries. The controller needs `dom`, `state`,
 * `nodeDOM`, and `coordsAtPos` — all present on both.
 */
export interface MinimapView {
  readonly dom: HTMLElement;
  readonly state: EditorState;
  nodeDOM(pos: number): HTMLElement | ChildNode | null;
  coordsAtPos(pos: number, side?: number): Coords;
}

/**
 * The transaction seam (§7.2): the structural slice of a ProseMirror
 * `Transaction` the controller consumes. Structural so the plugin's
 * state slot (which captures the real transaction) crosses the same
 * dual-instance boundary as `MinimapView`.
 */
export interface MinimapTr {
  readonly docChanged: boolean;
  readonly doc: Node;
  readonly mapping: { map(pos: number, assoc?: number): number };
}


// ---------------------------------------------------------------------------
// Classifier (§5.1)
// ---------------------------------------------------------------------------

/**
 * Height strategy for a visual class or a single row (§4.4).
 */
export type HeightStrategy =
  | { kind: 'text' }
  | { kind: 'fixed'; px: number }
  | { kind: 'estimate'; px: (node: Node) => number }
  | { kind: 'calibrated'; defaultPx: number };

/**
 * Classifier decision for one node: `null` → the node is not a row.
 */
export interface RowSpec {
  /** Key into `theme.classes` and the height strategies. */
  classId: string;
  /** Overrides the class-level strategy for this node. */
  height?: HeightStrategy;
}

/**
 * Consumer policy: which nodes become rows, with which visual class.
 *
 * `row()` receives the live node, its block depth, and its block-ancestor
 * chain (outermost first, root and self excluded) — the seam a structured
 * schema plugs into (§5.1, §5.3).
 */
export interface MinimapClassifier {
  /** Visual class for a node as a row; null → not a row. */
  row(node: Node, depth: number, ancestors: readonly Node[]): RowSpec | null;
  /** Whether to visit children of a node that is itself a row. */
  recurse?(node: Node): boolean;
}


// ---------------------------------------------------------------------------
// Theme (§5.4)
// ---------------------------------------------------------------------------

/** Appearance of one visual class. */
export interface ThemeClass {
  color: string;
  /** Whether rows of this class indent by `depth × indentUnit`. */
  indent?: boolean;
  /**
   * Whether tier-1 rows of this class paint per-character glyphs from the
   * pre-rasterized atlas (§5.4, §6.5). Default **false** — every class
   * paints a filled rectangle (width by text length, color by class);
   * `true` opts the class into glyph blitting.
   *
   * **Experimental.** The glyph path carries known defects (spec §5.4's
   * known limitations): the atlas cell is a fixed 4×10 px with a 3 px
   * advance, so full-width CJK glyphs clip and overlap; per-character
   * blitting performs no bidi reordering, so RTL runs paint in logical
   * order. Enable per class (e.g. short, LTR, Latin-only content such as
   * section titles) only where those defects do not apply.
   *
   * The knob only downgrades fidelity within tier 1 — a tier-2/3 row
   * paints a rectangle regardless (§6.5).
   */
  glyphs?: boolean;
}

/**
 * Every canvas-painted value: the single source of appearance (§5.4).
 */
export interface MinimapTheme {
  /** Minimum row footprint in minimap px; also the tier/sampling floor. */
  rowHeight: number;
  /** Text-strategy calibration (§4.4). */
  charsPerLine: number;
  /** Editor line height in px — the text strategy's unit. */
  lineHeight: number;
  /** Per-block vertical spacing in px, added by the text strategy. */
  spacing: number;
  /** Minimap px per depth step. */
  indentUnit: number;
  /** Tier-1 glyph font (optional). */
  font?: string;
  classes: Record<string, ThemeClass>;
  selection: { color: string; alpha: number };
  background: string;
}

/** Neutral theme (§5.4). */
export const defaultTheme: MinimapTheme = {
  rowHeight: 3,
  charsPerLine: 80,
  lineHeight: 24,
  spacing: 0,
  indentUnit: 2,
  classes: {
    text: { color: '#8888a0' },
    heading: { color: '#c8c8dc', indent: true },
    figure: { color: '#b08ad0' },
    table: { color: '#80a8c8' },
    code: { color: '#70b070' },
  },
  selection: { color: '#77aaff', alpha: 0.3 },
  background: '#f4f4f6',
};


// ---------------------------------------------------------------------------
// Display (§6.2)
// ---------------------------------------------------------------------------

export type DisplayMode = 'fit' | 'sliding' | 'auto';


// ---------------------------------------------------------------------------
// BlockRow (§4.2)
// ---------------------------------------------------------------------------

/**
 * One flattened block row. `node` is main-thread-only and is never sent to
 * the renderer (§8.1).
 */
export interface BlockRow {
  /** Stable identity (§4.3): monotonic, never reused. */
  key: number;
  /** Document position of the node (moves as positions shift). */
  pos: number;
  /** The document node. */
  node: Node;
  /** Visual class assigned by the classifier. */
  classId: string;
  /** Block-tree depth (drives indentation). */
  depth: number;
  /** `node.content.size` for textblocks; 0 otherwise. */
  textLength: number;
  /** Measured editor-space height in px; null while unsampled (§4.5). */
  heightPx: number | null;
  /** Estimated editor-space height in px (§4.4). */
  estHeightPx: number;
  /**
   * The row-level height strategy the classifier assigned (§4.4, §5.1) —
   * null when the row used its class-level strategy. Retained so epoch
   * re-estimation (§4.6) reproduces the row's own estimate, not just the
   * class's last-assigned strategy.
   */
  strategy: HeightStrategy | null;
  /**
   * The geometry epoch this row's `heightPx` was measured in (§4.6): a
   * measured row is skipped only within its own epoch, so an epoch change
   * re-arms it for lazy re-sampling (§4.5). Internal bookkeeping — 0 means
   * "never sampled".
   */
  sampledAtEpoch: number;
  /** Cached plain text, populated lazily for visible rows. */
  text: string | null;
}


// ---------------------------------------------------------------------------
// Renderer payloads (§8.1)
// ---------------------------------------------------------------------------

/** Structural arrays for a contiguous chunk of rows (§8.1). */
export interface BlocksPayload {
  /** Index of the first row in this chunk. */
  firstRow: number;
  classIds: string[];
  depths: Int16Array;
  textLengths: Float64Array;
  /** Effective editor-space heights. */
  heightPx: Float64Array;
}

/** Text strings for window rows plus overscan (§8.1). */
export interface TextsPayload {
  firstRow: number;
  texts: (string | null)[];
}


// ---------------------------------------------------------------------------
// Layers (§8.4)
// ---------------------------------------------------------------------------

/** A layer span, anchored in anchor space — never a row index (§8.4). */
export type LayerSpan =
  | { kind: 'pos'; from: number; to?: number }
  | { kind: 'id'; id: string };

/** Spans for one layer, as supplied by the producer. */
export interface LayerSpans {
  anchor: 'pos' | 'id';
  spans: LayerSpan[];
  /** Tone per span (a color string), optional. */
  tone?: (anchor: LayerSpan) => string;
  /** 0 = inline tint (default); 1+ = nth marker lane at the right edge. */
  lane?: number;
}

/** Layer declaration: id, draw order (ascending z), and kind. */
export interface LayerDeclaration {
  id: string;
  z: number;
  kind: 'background' | 'content' | 'overlay';
}


// ---------------------------------------------------------------------------
// Options (§7.1)
// ---------------------------------------------------------------------------

/** Hover payload (§10.2). */
export interface BlockHoverInfo {
  row: number;
  key: number;
  pos: number;
  classId: string;
  depth: number;
  clientY: number;
}

/** Geometry-epoch inputs: the layout facts estimates are a function of. */
export interface EpochInputs {
  /** Editor content width in px (the text-strategy's line width). */
  contentWidth: number;
  /** The theme whose metrics participate in estimation. */
  theme: MinimapTheme;
}

/**
 * All options are optional; `theme` merges over `defaultTheme` (§7.1).
 */
export interface MinimapOptions {
  classifier?: MinimapClassifier;
  theme?: Partial<MinimapTheme>;
  display?: DisplayMode;
  layers?: LayerDeclaration[];
  /** Static scroll-container resolution, skipping the walk (§7.1). */
  scrollContainer?: (view: MinimapView) => HTMLElement;
  overscanRows?: number;
  sampleBudget?: number;
  sliceBudgetMs?: number;
  tier1Rows?: number;
  tier2Rows?: number;
  aggregateMin?: number;
  aggregateMax?: number;
  /** Row count above which the minimap hides (no default — opt-in). */
  hideRows?: number;
  maxScrollDrift?: number;
  zoomPxPerEditorPx?: number;
  /** Force the marks-only rung (§6.5) — e.g. image-dominated documents. */
  marksOnly?: boolean;
  onBlockHover?: (info: BlockHoverInfo) => void;
}
