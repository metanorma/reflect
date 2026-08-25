/**
 * The `Renderer` interface, the inline renderer, and the recording test
 * double (§8.1–§8.3).
 *
 * All painting goes through one interface so the inline renderer and the
 * test double are interchangeable. Interface methods speak only
 * serializable data — typed arrays, strings, plain numbers — never a live
 * ProseMirror `Node` or DOM reference. The window is **pushed, not
 * pulled**: the controller hands the renderer rows, class/depth/height
 * arrays, and text; the renderer never requests.
 *
 * Chunk addressing (§8.1): `setBlocks` payloads are addressed by absolute
 * row index (`firstRow` + relative arrays); the renderer stores the merged
 * absolute arrays, so a chunk landing at any offset overwrites exactly its
 * own slice. The sliding-window origin (`setWindowOrigin`, §6.2) is
 * applied on the paint path as a single translate.
 */

import type {
  BlocksPayload,
  LayerDeclaration,
  MinimapTheme,
  TextsPayload,
} from './types.js';
import { defaultTheme } from './types.js';
import type { RowSpan } from './layers.js';


/**
 * One renderer (§8.1). `InlineRenderer` (main thread) and
 * `RecordingRenderer` (test double) both implement it.
 */
export interface Renderer {
  init(size: { width: number; height: number; dpr: number }): void;
  resize(size: { width: number; height: number; dpr: number }): void;
  setConfig(theme: MinimapTheme, layers: LayerDeclaration[]): void;
  /** Structural arrays, chunked (`chunkRows` rows, default 2,000). */
  setBlocks(chunk: BlocksPayload): void;
  /** Editor-px → minimap-px scale (§6.2). */
  setScale(scale: number): void;
  /**
   * Sliding-window origin in minimap px (§6.2): the virtual surface's
   * offset of the container's top. The paint path subtracts it.
   */
  setWindowOrigin(originY: number): void;
  setWindow(firstRow: number, rowCount: number, texts: TextsPayload): void;
  setLayer(layerId: string, spans: RowSpan[]): void;
  render(): void;
  destroy(): void;
}

/** Tier/behaviour state the controller pushes alongside config (§6.5). */
interface RendererTierOptions {
  aggregateMin?: number;
  aggregateMax?: number;
  medianPx?: number;
  /** `marks-only` rung: content paint off, layers continue (§6.5). */
  marksOnly?: boolean;
}

/** Tier-aware renderer: `setTier` drives fidelity (§6.5). */
export interface TieredRenderer extends Renderer {
  setTier(tier: 1 | 2 | 3, opts?: RendererTierOptions): void;
  /** Structural offsets + the row text cache (pushed with the model). */
  setGeometry(offsets: Float64Array, texts: (string | null)[]): void;
  /** The `hidden` rung (§6.5): render nothing, keep the mount alive. */
  setHidden(hidden: boolean): void;
  /**
   * Drop the stored mirror (§8.1): a full push starts from a clean
   * mirror so stale rows from an interrupted prior model cannot survive
   * beside the new chunks.
   */
  clearModel(): void;
}

/** Model arrays the paint planner consumes (absolute-indexed). */
interface PaintModel {
  classIds: (string | undefined)[];
  depths: Int16Array;
  textLengths: Float64Array;
  textBlocks: Uint8Array;
  heightPx: Float64Array;
  offsets: Float64Array;
  /** Text cache; entries may be null (filled per window, §6.3). */
  texts: (string | null)[];
}

/** One planned paint's inputs. */
interface PaintOptions {
  scale: number;
  /** Sliding-window origin in minimap px (§6.2) — subtracted on paint. */
  originY: number;
  windowFirst: number;
  windowLast: number;
  theme: MinimapTheme;
  aggregate: boolean;
  aggregateMin: number;
  aggregateMax: number;
  medianPx: number;
  isMarked: (row: number) => boolean;
  spans: ReadonlyMap<string, readonly RowSpan[]>;
  /** Layer declarations for z-order (§8.4): id → z. */
  layerZ: ReadonlyMap<string, number>;
  canvasHeight: number;
  dpr: number;
}

/** One row rectangle in minimap coordinates (container-relative). */
interface PlannedRow {
  /** Minimap px from the container's top (origin-subtracted, §6.2). */
  y: number;
  /** Minimap px height (>= `rowHeight` floor, §6.2). */
  h: number;
  classId: string;
  depth: number;
  textLength: number;
  /**
   * The run's textblock bit (`BlockRow.textBlock`, §4.2) — the
   * zero-length discriminator on the paint side (§5.4/§6.5).
   */
  textBlock: boolean;
  text: string | null;
  /** Source row index (hover/commit lookups, §9.2). */
  row: number;
}

/** Marker-lane rect: a run merged at the merge floor (§8.4). */
interface PlannedMarker {
  y: number;
  h: number;
  color: string;
  lane: number;
}

/** One planned inline tint (§8.4, lane 0). */
interface PlannedInline {
  span: RowSpan;
  /** The layer's z — inline tints sort with markers by z (§8.4). */
  z: number;
}

/**
 * Pure paint planning (§6.3, §8.4): everything a renderer backend needs to
 * paint one frame, derived from the model arrays. Kept pure so the headless
 * suite can assert draw behavior without a canvas implementation
 * (§15.1.6–8).
 */
export function planPaint(
  model: PaintModel,
  opts: PaintOptions,
): {
  rows: PlannedRow[];
  markers: PlannedMarker[];
  inline: PlannedInline[];
} {
  const rows: PlannedRow[] = [];
  const markers: PlannedMarker[] = [];
  const inline: PlannedInline[] = [];
  const floor = opts.theme.rowHeight;
  const mergeFloor = 6 / Math.max(1, opts.dpr); // 6 device px (§8.4)

  if (opts.aggregate) {
    planAggregatedRows(rows, model, opts, floor);
  } else {
    planPlainRows(rows, model, opts, floor);
  }

  // --- Spans: clipped to the window, z-ordered, merge-floored. ------------
  // Layers paint in ascending z (§8.4): collect (z, kind) pairs, sort once.
  const zOf = (layerId: string): number =>
    opts.layerZ?.get(layerId) ?? 0;
  const perLayer = [...opts.spans.entries()]
    .sort((a, b) => zOf(a[0]) - zOf(b[0]));
  for (const [layerId, layerSpans] of perLayer) {
    const z = zOf(layerId);
    for (const span of layerSpans) {
      // Clip to the visible window (§6.3): paint is O(visible spans).
      if (span.last < opts.windowFirst - 1
        || span.first > opts.windowLast + 1) {
        continue;
      }
      if (span.lane > 0) {
        markers.push({
          y: (model.offsets[span.first] ?? 0) * opts.scale - opts.originY,
          h: Math.max(
            mergeFloor, rowSpanHeight(span, model) * opts.scale,
          ),
          color: span.color,
          lane: span.lane,
        });
      } else {
        inline.push({ span, z });
      }
    }
  }
  mergeMarkers(markers, mergeFloor, opts.canvasHeight);
  return { rows, markers, inline };
}

function planPlainRows(
  rows: PlannedRow[],
  model: PaintModel,
  opts: PaintOptions,
  floor: number,
): void {
  const last = Math.min(opts.windowLast, model.classIds.length - 1);
  for (let i = Math.max(0, opts.windowFirst); i <= last; i++) {
    const cid = model.classIds[i];
    if (cid === undefined) {
      continue;
    }
    rows.push({
      y: (model.offsets[i] ?? 0) * opts.scale - opts.originY,
      h: Math.max(floor, (model.heightPx[i] ?? 0) * opts.scale),
      classId: cid,
      depth: model.depths[i] ?? 0,
      textLength: model.textLengths[i] ?? 0,
      textBlock: (model.textBlocks[i] ?? 0) === 1,
      text: model.texts[i] ?? null,
      row: i,
    });
  }
}

function planAggregatedRows(
  rows: PlannedRow[],
  model: PaintModel,
  opts: PaintOptions,
  floor: number,
): void {
  // Tier 3 (§6.5): runs of >= aggregateMin same-class/depth rows merge.
  let i = Math.max(0, opts.windowFirst);
  const last = Math.min(opts.windowLast, model.classIds.length - 1);
  while (i <= last) {
    const cid = model.classIds[i];
    if (cid === undefined) {
      break;
    }
    let j = i + 1;
    if (!opts.isMarked(i)) {
      while (j <= last) {
        if (model.classIds[j] !== cid || model.depths[j] !== model.depths[i]) {
          break;
        }
        if (opts.isMarked(j)) {
          break;
        }
        j++;
      }
    }
    const runLen = j - i;
    if (runLen >= opts.aggregateMin) {
      let h = 0;
      for (let k = i; k < j; k++) {
        h += model.heightPx[k] ?? 0;
      }
      const capped = Math.min(h, opts.aggregateMax * opts.medianPx);
      rows.push({
        y: (model.offsets[i] ?? 0) * opts.scale - opts.originY,
        h: Math.max(floor, capped * opts.scale),
        classId: cid,
        depth: model.depths[i] ?? 0,
        // MEAN density (§6.5), not 0: the width formula is calibrated
        // per row, so the mean reads as the run's average fullness —
        // dense runs wide, sparse runs narrow, all-empty textblock runs
        // fall into the minimal-bar branch. The mean (not the sum) is
        // taken over the run's FULL extent, which extends past
        // `windowLast` (see below), so the bar's width is a property of
        // the run — it cannot pulse as the window slides over members.
        // `textBlock` is the FIRST member's bit, like `classId`/`depth`
        // (run identity); it is only consulted when the mean is 0.
        textLength: meanRunTextLength(model, opts, i, j),
        textBlock: (model.textBlocks[i] ?? 0) === 1,
        text: null,
        row: i,
      });
    } else {
      for (let k = i; k < j; k++) {
        rows.push({
          y: (model.offsets[k] ?? 0) * opts.scale - opts.originY,
          h: Math.max(floor, (model.heightPx[k] ?? 0) * opts.scale),
          classId: model.classIds[k] ?? 'text',
          depth: model.depths[k] ?? 0,
          textLength: model.textLengths[k] ?? 0,
          textBlock: (model.textBlocks[k] ?? 0) === 1,
          text: model.texts[k] ?? null,
          row: k,
        });
      }
    }
    i = j;
  }
}

function rowSpanHeight(span: RowSpan, model: PaintModel): number {
  const start = model.offsets[span.first] ?? 0;
  const endOff = model.offsets[span.last + 1];
  if (endOff !== undefined) {
    return endOff - start;
  }
  return model.heightPx[span.last] ?? 0;
}

/**
 * Mean text length of an aggregating run (§6.5), over the run's FULL
 * extent — not just the windowed `[i, j)` slice. The run match in
 * `planAggregatedRows` is bounded by the paint window; the aggregate
 * stands for the whole run, so a window edge must not change its width.
 * Continues the same class/depth/unmarked predicate past `windowLast`
 * (array reads only — nothing past the edge is painted), stopping at an
 * `undefined` mirror slot (unbuilt model) or the array's end.
 */
function meanRunTextLength(
  model: PaintModel,
  opts: PaintOptions,
  i: number,
  j: number,
): number {
  let sum = 0;
  for (let k = i; k < j; k++) {
    sum += model.textLengths[k] ?? 0;
  }
  let count = j - i;
  let k = j;
  while (
    k < model.classIds.length
    && model.classIds[k] !== undefined
    && model.classIds[k] === model.classIds[i]
    && (model.depths[k] ?? 0) === (model.depths[i] ?? 0)
    && !opts.isMarked(k)
  ) {
    sum += model.textLengths[k] ?? 0;
    count++;
    k++;
  }
  return count > 0 ? sum / count : 0;
}

/** Merge same-tone marker rects whose gap is under the merge floor (§8.4). */
function mergeMarkers(
  markers: PlannedMarker[],
  mergeFloor: number,
  canvasHeight: number,
): void {
  if (markers.length === 0) {
    return;
  }
  const byLane = new Map<number, PlannedMarker[]>();
  for (const m of markers) {
    let list = byLane.get(m.lane);
    if (list === undefined) {
      list = [];
      byLane.set(m.lane, list);
    }
    list.push(m);
  }
  markers.length = 0;
  // The per-lane cap (§8.4): canvasHeight / 6 rects worst case.
  const maxRects = Math.max(1, Math.ceil(canvasHeight / 6));
  for (const list of byLane.values()) {
    list.sort((a, b) => a.y - b.y);
    const merged: PlannedMarker[] = [];
    let cur: PlannedMarker | undefined;
    for (const m of list) {
      if (
        cur !== undefined
        && m.color === cur.color
        && m.y - (cur.y + cur.h) < mergeFloor
      ) {
        cur.h = Math.max(cur.h, m.y + m.h - cur.y);
      } else {
        cur = m;
        merged.push(cur);
      }
    }
    let count = 0;
    for (const m of merged) {
      markers.push(m);
      count++;
      if (count >= maxRects) {
        break;
      }
    }
  }
}


// ---------------------------------------------------------------------------
// Shared backend state — the absolute-index model mirror (§8.1)
// ---------------------------------------------------------------------------

/** Return a `Float64Array` of `len` carrying `src`'s prefix. */
function ensureLen(
  src: Float64Array<ArrayBuffer>, len: number,
): Float64Array<ArrayBuffer> {
  if (src.length >= len) {
    return src;
  }
  const out = new Float64Array(len);
  out.set(src);
  return out;
}

/** Return an `Int16Array` of `len` carrying `src`'s prefix. */
function ensureLen16(
  src: Int16Array<ArrayBuffer>, len: number,
): Int16Array<ArrayBuffer> {
  if (src.length >= len) {
    return src;
  }
  const out = new Int16Array(len);
  out.set(src);
  return out;
}

/** Return a `Uint8Array` of `len` carrying `src`'s prefix. */
function ensureLen8(
  src: Uint8Array<ArrayBuffer>, len: number,
): Uint8Array<ArrayBuffer> {
  if (src.length >= len) {
    return src;
  }
  const out = new Uint8Array(len);
  out.set(src);
  return out;
}

/** The renderer-side model state shared by both backends. */
abstract class RendererBackend implements TieredRenderer {
  protected width = 0;
  protected height = 0;
  protected dpr = 1;
  protected theme: MinimapTheme = defaultTheme;
  protected layers: LayerDeclaration[] = [];
  protected blocks: BlocksPayload | null = null;
  protected scale = 1;
  protected windowOrigin = 0;
  protected window: { firstRow: number; rowCount: number } | null = null;
  protected spans = new Map<string, RowSpan[]>();
  protected offsets: Float64Array = new Float64Array(1);
  protected texts: (string | null)[] = [];
  protected tier: 1 | 2 | 3 = 1;
  protected aggregateMin = 4;
  protected aggregateMax = 16;
  protected medianPx = 0;
  protected marksOnly = false;
  protected hiddenRung = false;
  // Absolute-indexed model mirror (§8.1): one entry per row.
  protected classIds: (string | undefined)[] = [];
  protected depths = new Int16Array(0);
  protected textLengths = new Float64Array(0);
  protected textBlocks = new Uint8Array(0);
  protected heightPx = new Float64Array(0);
  protected modelRows = 0;

  init(size: { width: number; height: number; dpr: number }): void {
    this.resize(size);
  }

  resize({ width, height, dpr }: {
    width: number; height: number; dpr: number;
  }): void {
    // Floor device pixels (§8.5): a change that does not move the floored
    // device-pixel size is a no-op — sub-pixel flutter never reallocs.
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
    const moved = w !== this.width || h !== this.height || dpr !== this.dpr;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    if (moved) {
      this.onSizeChanged();
    }
  }

  /** Subclass hook for backing-store reallocs. */
  protected onSizeChanged(): void {}

  setConfig(theme: MinimapTheme, layers: LayerDeclaration[]): void {
    this.theme = theme;
    this.layers = [...layers];
  }

  setBlocks(chunk: BlocksPayload): void {
    // Absolute-index chunk store (§8.1): grow to fit, splice the slice.
    const end = chunk.firstRow + chunk.classIds.length;
    if (end > this.classIds.length) {
      this.classIds.length = end;
      this.depths = ensureLen16(this.depths, end);
      this.textLengths = ensureLen(this.textLengths, end);
      this.textBlocks = ensureLen8(this.textBlocks, end);
      this.heightPx = ensureLen(this.heightPx, end);
    }
    for (let i = 0; i < chunk.classIds.length; i++) {
      const at = chunk.firstRow + i;
      this.classIds[at] = chunk.classIds[i];
      this.depths[at] = chunk.depths[i] ?? 0;
      this.textLengths[at] = chunk.textLengths[i] ?? 0;
      this.textBlocks[at] = chunk.textBlocks[i] ?? 0;
      this.heightPx[at] = chunk.heightPx[i] ?? 0;
    }
    this.modelRows = Math.max(this.modelRows, end);
  }

  setScale(scale: number): void {
    this.scale = scale;
  }

  setWindowOrigin(originY: number): void {
    this.windowOrigin = originY;
  }

  setTier(tier: 1 | 2 | 3, opts?: RendererTierOptions): void {
    this.tier = tier;
    if (opts?.aggregateMin !== undefined) {
      this.aggregateMin = opts.aggregateMin;
    }
    if (opts?.aggregateMax !== undefined) {
      this.aggregateMax = opts.aggregateMax;
    }
    if (opts?.medianPx !== undefined) {
      this.medianPx = opts.medianPx;
    }
    if (opts?.marksOnly !== undefined) {
      this.marksOnly = opts.marksOnly;
    }
  }

  setHidden(hidden: boolean): void {
    this.hiddenRung = hidden;
    if (hidden) {
      this.clearModel();
    }
  }

  /** Drop the stored mirror entirely (§8.1: a full push starts clean). */
  clearModel(): void {
    this.classIds = [];
    this.depths = new Int16Array(0);
    this.textLengths = new Float64Array(0);
    this.textBlocks = new Uint8Array(0);
    this.heightPx = new Float64Array(0);
    this.offsets = new Float64Array(1);
    this.texts = [];
    this.modelRows = 0;
    this.window = null;
  }

  setGeometry(offsets: Float64Array, texts: (string | null)[]): void {
    this.offsets = offsets;
    this.texts = texts;
  }

    setWindow(firstRow: number, rowCount: number, texts: TextsPayload): void {
      this.window = { firstRow, rowCount };
      // Grow to fit: a window push covering rows the mirror does not yet
      // hold (mid-build, post-edit) must land, not drop (§8.1 push).
      if (texts.firstRow + texts.texts.length > this.texts.length) {
        this.texts.length = texts.firstRow + texts.texts.length;
      }
      for (let i = 0; i < texts.texts.length; i++) {
        const idx = texts.firstRow + i;
        if (idx >= 0) {
          this.texts[idx] = texts.texts[i] ?? null;
        }
      }
    }

  setLayer(layerId: string, spans: RowSpan[]): void {
    this.spans.set(layerId, spans);
  }

  /** Whether any layer span covers `row` (marker survival, §6.5/§8.4). */
  protected isMarked(row: number): boolean {
    for (const spans of this.spans.values()) {
      for (const s of spans) {
        if (row >= s.first && row <= s.last) {
          return true;
        }
      }
    }
    return false;
  }

  protected paintOptions(): PaintOptions | null {
    if (this.blocks === null && this.modelRows === 0) {
      return null;
    }
    const layerZ = new Map<string, number>();
    for (const l of this.layers) {
      layerZ.set(l.id, l.z);
    }
    return {
      scale: this.scale,
      originY: this.windowOrigin,
      windowFirst: this.window?.firstRow ?? 0,
      windowLast: this.window === null
        ? -1
        : this.window.firstRow + this.window.rowCount - 1,
      theme: this.theme,
      aggregate: this.tier === 3,
      aggregateMin: this.aggregateMin,
      aggregateMax: this.aggregateMax,
      medianPx: this.medianPx,
      isMarked: (row) => this.isMarked(row),
      spans: this.spans,
      layerZ,
      canvasHeight: this.height / Math.max(1, this.dpr),
      dpr: this.dpr,
    };
  }

  protected model(): PaintModel | null {
    if (this.modelRows === 0) {
      return null;
    }
    return {
      classIds: this.classIds,
      depths: this.depths,
      textLengths: this.textLengths,
      textBlocks: this.textBlocks,
      heightPx: this.heightPx,
      offsets: this.offsets,
      texts: this.texts,
    };
  }

  abstract render(): void;
  abstract destroy(): void;
}


// ---------------------------------------------------------------------------
// InlineRenderer — the one production renderer (§8.2, §8.3)
// ---------------------------------------------------------------------------

/**
 * Main-thread canvas renderer (§8.2). Paints inside the rAF batch coalesced
 * by the controller (§10.1); per-frame cost is window-bounded (§6.3).
 *
 * Tier 1 rasterizes the theme font's glyph set into a pre-baked atlas
 * (lazily, on first tier-1 paint, cached per (font, scale)) and blits —
 * keeping `fillText` shaping off the paint path (§6.5 "why an atlas").
 */
export class InlineRenderer extends RendererBackend {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private atlas: GlyphAtlas | null = null;
  /**
   * The scale bucket the current atlas was baked at (§6.5): glyph cells
   * scale with the effective paint scale, quantized to buckets so the
   * atlas does not re-bake on every fit-scale drift (sampling nudges the
   * scale by fractions of a px). `null` = no atlas yet.
   */
  private atlasScale: number | null = null;
  /** Last paint duration (ms) — renderer cost telemetry (§15.2). */
  lastPaintMs = 0;

  /** Bind a canvas element; `init` sizes the backing store. */
  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  protected override onSizeChanged(): void {
    if (this.canvas !== null) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.atlas = null; // re-bake at the new scale
      this.atlasScale = null;
    }
  }

  override setConfig(theme: MinimapTheme, layers: LayerDeclaration[]): void {
    super.setConfig(theme, layers);
    this.atlas = null;
    this.atlasScale = null;
  }

  override render(): void {
    const model = this.model();
    const opts = this.paintOptions();
    if (this.ctx === null || model === null || opts === null) {
      return;
    }
    if (this.hiddenRung) {
      return; // hidden rung (§6.5): render nothing, keep the mount
    }
    const t0 = performance.now();
    const ctx = this.ctx;
    const w = this.width / this.dpr;
    const h = this.height / this.dpr;
    const plan = planPaint(model, opts);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!this.marksOnly) {
      ctx.fillStyle = this.theme.background;
      ctx.fillRect(0, 0, w, h);
      // The `text` layer: rows paint unless marks-only (§6.5).
      for (const r of plan.rows) {
        this.paintRow(ctx, r, w);
      }
    }
    // Layer paint in ascending z (§8.4): inline tints and markers sort by
    // their layer's z; both draw after the content layer they overlay.
    const decorated: Array<
      { z: number; paint: () => void }
    > = [];
    for (const tint of plan.inline) {
      decorated.push({
        z: tint.z,
        paint: () => this.paintInlineTint(ctx, tint.span, model, w),
      });
    }
    for (const m of plan.markers) {
      decorated.push({
        z: markerZ(m, opts),
        paint: () => this.paintMarker(ctx, m, w),
      });
    }
    decorated.sort((a, b) => a.z - b.z);
    for (const d of decorated) {
      d.paint();
    }
    this.lastPaintMs = performance.now() - t0;
  }

  private paintRow(
    ctx: CanvasRenderingContext2D, r: PlannedRow, w: number,
  ): void {
    const cls = this.theme.classes[r.classId] ?? this.theme.classes['text'];
    if (cls === undefined) {
      return;
    }
    const indent = (cls.indent === true ? r.depth : 0) * this.theme.indentUnit;
    const x = Math.min(indent, Math.max(0, w - 4));
    const usable = Math.max(1, w - x - 1);
    const widthFrac = rowWidthFraction(r, this.theme);
    if (paintsGlyphs(this.tier, cls.glyphs, r.text)) {
      this.paintGlyphs(ctx, r, x, usable, cls.color);
      return;
    }
    ctx.fillStyle = cls.color;
    // A rectangle paints a BAR of its slot minus a proportional gap: at
    // slot-scale ≈ 1 (sliding mode) the gap is ~1px — adjacent lines that
    // read as continuous text; at large fit scales the gap grows with the
    // slot so consecutive rows stay visually separated (the glyph path's
    // small-cell-in-a-big-slot look) instead of merging into one solid
    // block. Tall single rows (figures, tables) keep their block shape —
    // the gap is proportional, not a height cap.
    const gap = Math.max(1, Math.floor(r.h * ROW_GAP_FRACTION));
    const barH = Math.max(1, r.h - gap);
    ctx.fillRect(x, r.y, Math.max(1, usable * widthFrac), barH);
  }

  private paintGlyphs(
    ctx: CanvasRenderingContext2D,
    r: PlannedRow,
    x: number,
    w: number,
    color: string,
  ): void {
    // The atlas is baked per SCALE BUCKET (§6.5): glyph cells track their
    // row slots (stride × scale), so the zoom (§6.2) sizes glyphs like it
    // sizes bars. `k` is the cell multiplier relative to the base 4×10
    // cell's zoom — 1.0 at zoom 0.25, 0.2 at the 0.05 zoom. Bucketing to
    // 20% steps keeps the atlas from re-baking on fit-scale drift.
    const k = clamp01(this.scale / GLYPH_BASE_SCALE);
    const bucket = Math.max(0.2, Math.round(k * 5) / 5);
    if (this.atlas === null || this.atlasScale !== bucket) {
      this.atlas = new GlyphAtlas(
        this.theme.font ?? '9px monospace',
        this.dpr,
        bucket,
      );
      this.atlasScale = bucket;
    }
    // Iterate by CODE POINT, not UTF-16 unit: an astral-plane character
    // is one cell (and one well-formed `${ch}:${color}` atlas key), not
    // two lone-surrogate tofu blits.
    const chars = Array.from(r.text ?? '');
    // Glyphs FILL the available width (the row's indent-relative span):
    // the row paints its characters left to right and truncates only
    // what genuinely overflows. The proportional `widthFrac` budget is
    // the BAR path's line-length encoding (§6.5) — reusing it here
    // trimmed exactly the rows glyphs are for (a 15-char heading paints
    // ≈ its bar's 31% width, not its own 15 glyphs), so the fill rule is
    // the intuitive one: what you see is the text, up to the pane.
    const glyphW = 3 * bucket;
    const count = Math.min(chars.length, Math.floor(w / glyphW));
    // 1:1 device-px blits: `render` paints under the dpr transform, where a
    // scaled drawImage resamples the baked cell by fractions of a device px
    // (any fractional dpr, and ceil(4·dpr)/dpr is never integer either).
    // Neutralize the transform for the row and land each glyph at integer
    // device px. devY rounds ONCE per row — every glyph in the row shares
    // it, so the row paints as one band that never straddles by 1 device px.
    const devY = Math.round(r.y * this.dpr);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < count; i++) {
      const devX = Math.round((x + i * glyphW) * this.dpr);
      this.atlas.blit(ctx, chars[i] ?? '', devX, devY, color);
    }
    ctx.restore();
  }

  /**
   * Inline tint (§8.4): multiplies with the row's class color at the
   * span's tone alpha — the tinted rows keep their class hue underneath.
   */
  private paintInlineTint(
    ctx: CanvasRenderingContext2D,
    span: RowSpan,
    model: PaintModel,
    w: number,
  ): void {
    const y0 = (model.offsets[span.first] ?? 0) * this.scale
      - this.windowOrigin;
    const h = rowSpanHeight(span, model) * this.scale;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = this.theme.selection.alpha;
    ctx.fillStyle = span.color;
    ctx.fillRect(0, y0, w, Math.max(1, h));
    ctx.restore();
  }

  private paintMarker(
    ctx: CanvasRenderingContext2D, m: PlannedMarker, w: number,
  ): void {
    const laneW = 3;
    const x = w - m.lane * (laneW + 1) - laneW;
    ctx.fillStyle = m.color;
    ctx.fillRect(x, m.y, laneW, Math.max(1, m.h));
  }

  override destroy(): void {
    this.canvas = null;
    this.ctx = null;
    this.spans.clear();
    this.atlas = null;
    this.clearModel();
  }
}

/**
 * Fraction of a row's slot height left as a gap between painted bars
 * (§6.5 rectangle rendering): `1 − ROW_GAP_FRACTION` of the slot paints.
 */
const ROW_GAP_FRACTION = 0.15;

/**
 * The zoom the base 4×10 glyph cell was tuned for (§6.5): the cell scales
 * linearly with `scale / GLYPH_BASE_SCALE`, so glyphs track their row
 * slots as `zoomPxPerEditorPx` (§6.2) varies.
 */
const GLYPH_BASE_SCALE = 0.25;

/**
 * The glyph-vs-rectangle gate (§5.4, §6.5) — one place, headlessly
 * testable. A row paints tier-1 atlas glyphs only when ALL hold: the
 * renderer is at tier 1, the class opted in with `glyphs: true` (default
 * false — opt-in, experimental, §5.4's known limitations), and the row
 * carries non-empty text. Everything else paints a filled rectangle.
 *
 * `glyphs === true` (not `!== false`) — the opt-in default: an unset or
 * explicitly-false value both paint rectangles.
 */
export function paintsGlyphs(
  tier: number,
  glyphs: boolean | undefined,
  text: string | null | undefined,
): boolean {
  return tier === 1 && glyphs === true && text !== null
    && text !== undefined && text !== '';
}

/**
 * Row-bar width fraction. Three regimes (§6.5):
 *
 * - Non-empty text signal → proportional to text length (clamped), for
 *   every row. A tier-3 aggregate carries the MEAN text length of its
 *   run's members, so the same formula reads as density.
 * - Empty text signal, TEXTBLOCK → the minimal text bar (§5.4): an empty
 *   textblock is a one-line placeholder, proportionally SHORTER than a
 *   one-word row. Derived from the row's `textBlock` bit (§4.2) —
 *   shape data retained by the walk, not consumer configuration.
 * - Empty text signal, non-textblock → the flat zero-length block: atoms
 *   and structure (figures, tables) whose zero length is permanent, not
 *   a state — the block is the landmark.
 */
export function rowWidthFraction(
  r: PlannedRow,
  theme: MinimapTheme,
): number {
  if (r.textLength > 0) {
    return clamp01(
      0.15 + 0.85 * (r.textLength / Math.max(1, theme.charsPerLine)),
    );
  }
  return r.textBlock ? EMPTY_TEXT_FRACTION : 0.35;
}

/**
 * The minimal-bar width (§5.4): fraction of the usable width an empty
 * textblock paints — below a one-word row (`0.15` of the length
 * formula's base), with margin so the ordering reads at a glance.
 */
const EMPTY_TEXT_FRACTION = 0.08;

function clamp01(v: number): number {
  return v < 0
    ? 0
    : v > 1
      ? 1
      : v;
}

/**
 * Glyph atlas (§6.5): the theme font's glyph set pre-rasterized once per
 * (font, scale, color) so tier-1 per-row cost returns to rect territory.
 *
 * The cell scales with `k` — the effective paint scale relative to the
 * baseline zoom (`GLYPH_BASE_SCALE`) the 4×10 cell was tuned for: a glyph
 * row's cell tracks its row SLOT (stride × scale), so
 * `zoomPxPerEditorPx` (§6.2) sizes glyphs like it sizes bars. The font is
 * rasterized under a `dpr × k` transform (the font string itself stays
 * the consumer's), cells land at integer device px, and blits stay 1:1.
 */
class GlyphAtlas {
  private readonly glyphs = new Map<string, HTMLCanvasElement>();

  constructor(
    private readonly font: string,
    private readonly dpr: number,
    private readonly k: number,
  ) {}

  /**
   * Blit one baked glyph 1:1 — `x`/`y` are DEVICE pixels, and the caller
   * paints under a neutralized transform (`setTransform(1,0,0,1,0,0)`);
   * the cell is baked at integer device px, so the blit is never
   * resampled at any DPR.
   */
  blit(
    ctx: CanvasRenderingContext2D,
    ch: string, x: number, y: number, color: string,
  ): void {
    const key = `${ch}:${color}`;
    let glyph = this.glyphs.get(key);
    if (glyph === undefined) {
      glyph = document.createElement('canvas');
      const gw = 4 * this.k;
      const gh = 10 * this.k;
      glyph.width = Math.max(1, Math.ceil(gw * this.dpr));
      glyph.height = Math.max(1, Math.ceil(gh * this.dpr));
      const gctx = glyph.getContext('2d');
      if (gctx !== null) {
        // Rasterize the theme font AT the scaled cell size: the transform
        // scales the rasterization, so `9px monospace` becomes a 9k-px
        // face without rewriting the consumer's font string.
        gctx.setTransform(
          this.dpr * this.k, 0, 0, this.dpr * this.k, 0, 0,
        );
        gctx.font = this.font;
        gctx.fillStyle = color;
        gctx.textBaseline = 'top';
        gctx.fillText(ch, 0, 0);
      }
      this.glyphs.set(key, glyph);
    }
    ctx.drawImage(glyph, x, y);
  }
}


// ---------------------------------------------------------------------------
// RecordingRenderer — the headless test double (§8.3, §15.1)
// ---------------------------------------------------------------------------

/** One recorded draw call (§15.1 assertions). */
export interface DrawCall {
  kind:
    | 'row'
    | 'marker'
    | 'inline'
    | 'layer'
    | 'config'
    | 'window'
    | 'blocks'
    | 'scale'
    | 'origin'
    | 'tier'
    | 'hidden'
    | 'geometry'
    | 'resize'
    | 'render';
  order: number;
  layerId?: string;
  row?: number;
  y?: number;
  h?: number;
  classId?: string;
  depth?: number;
  text?: string | null;
  color?: string;
  lane?: number;
  firstRow?: number;
  rowCount?: number;
  spanCount?: number;
  /** First span's resolved first row (the `layer` call's anchor target). */
  spanFirst?: number | undefined;
  /** First span's resolved last row (inclusive). */
  spanLast?: number | undefined;
  width?: number;
  height?: number;
  dpr?: number;
}

/** Records draw calls; paints nothing (§8.3). */
export class RecordingRenderer extends RendererBackend {
  readonly calls: DrawCall[] = [];
  private order = 0;

  override setConfig(theme: MinimapTheme, layers: LayerDeclaration[]): void {
    super.setConfig(theme, layers);
    this.calls.push({ kind: 'config', order: this.next() });
  }

  override setBlocks(chunk: BlocksPayload): void {
    super.setBlocks(chunk);
    this.calls.push({
      kind: 'blocks',
      order: this.next(),
      firstRow: chunk.firstRow,
      rowCount: chunk.classIds.length,
    });
  }

  override setScale(scale: number): void {
    super.setScale(scale);
    this.calls.push({ kind: 'scale', order: this.next() });
  }

  override setWindowOrigin(originY: number): void {
    super.setWindowOrigin(originY);
    this.calls.push({ kind: 'origin', order: this.next(), y: originY });
  }

  override resize(size: { width: number; height: number; dpr: number }): void {
    super.resize(size);
    this.calls.push({
      kind: 'resize', order: this.next(),
      width: size.width, height: size.height, dpr: size.dpr,
    });
  }

  override setTier(tier: 1 | 2 | 3, opts?: RendererTierOptions): void {
    super.setTier(tier, opts);
    this.calls.push({ kind: 'tier', order: this.next() });
  }

  override setHidden(hidden: boolean): void {
    super.setHidden(hidden);
    this.calls.push({
      kind: 'hidden', order: this.next(),
      rowCount: hidden ? 1 : 0,
    });
  }

  override setGeometry(offsets: Float64Array, texts: (string | null)[]): void {
    super.setGeometry(offsets, texts);
    this.calls.push({ kind: 'geometry', order: this.next() });
  }

  override setWindow(
    firstRow: number,
    rowCount: number,
    texts: TextsPayload,
  ): void {
    super.setWindow(firstRow, rowCount, texts);
    this.calls.push({
      kind: 'window',
      order: this.next(),
      firstRow,
      rowCount,
      spanCount: texts.texts.length,
    });
  }

  override setLayer(layerId: string, spans: RowSpan[]): void {
    super.setLayer(layerId, spans);
    this.calls.push({
      kind: 'layer',
      order: this.next(),
      layerId,
      spanCount: spans.length,
      spanFirst: spans[0]?.first,
      spanLast: spans[0]?.last,
    });
  }

  override render(): void {
    this.calls.push({ kind: 'render', order: this.next() });
    const model = this.model();
    const opts = this.paintOptions();
    if (model === null || opts === null || this.hiddenRung) {
      return;
    }
    const plan = planPaint(model, opts);
    if (!this.marksOnly) {
      for (const r of plan.rows) {
        this.calls.push({
          kind: 'row',
          order: this.next(),
          row: r.row,
          y: r.y,
          h: r.h,
          classId: r.classId,
          depth: r.depth,
          text: r.text,
        });
      }
    }
    // Spans in ascending z (§15.1.7): inline tints and markers are
    // interleaved by their layer's z, both after the row block.
    const decorated: Array<{ z: number; call: DrawCall }> = [];
    for (const tint of plan.inline) {
      decorated.push({
        z: tint.z,
        call: {
          kind: 'inline', order: this.next(),
          row: tint.span.first,
          h: tint.span.last - tint.span.first + 1,
          color: tint.span.color,
        },
      });
    }
    for (const m of plan.markers) {
      decorated.push({
        z: markerZ(m, opts),
        call: {
          kind: 'marker', order: this.next(),
          y: m.y, h: m.h, color: m.color, lane: m.lane,
        },
      });
    }
    decorated.sort((a, b) => a.z - b.z || a.call.order - b.call.order);
    for (const d of decorated) {
      this.calls.push(d.call);
    }
  }

  override destroy(): void {
    this.spans.clear();
    this.clearModel();
  }

  /** Direct access to the absolute-index mirror (test assertions). */
  get mirrorClassIds(): readonly (string | undefined)[] {
    return this.classIds;
  }

  private next(): number {
    const n = this.order;
    this.order += 1;
    return n;
  }
}

/** The z of the layer a marker came from (by lane+color match). */
function markerZ(m: { lane: number; color: string }, opts: PaintOptions) {
  for (const [layerId, spans] of opts.spans) {
    for (const s of spans) {
      if (s.lane === m.lane && s.color === m.color) {
        return opts.layerZ?.get(layerId) ?? 0;
      }
    }
  }
  return 20; // default overlay z
}
