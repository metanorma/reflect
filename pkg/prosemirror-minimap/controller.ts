/**
 * `MinimapController` — the view plugin owning the block model, geometry,
 * tiers, calibration, epochs, and scheduling (§7).
 *
 * The controller is not stored in editor state: derived caches of this size
 * belong to the view, keyed by document reference
 * (`model.doc === view.state.doc` is the fast-path skip, §7.1).
 */

import type { Node } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';

import {
  countRows,
  defaultClassifier,
  diffRows,
  diffBounds,
  flatten,
  type DiffBounds,
  type WalkContext,
} from './blockModel.js';
import { CalibrationStore, estimateHeight } from './heights.js';
import {
  clamp,
  resolveScale,
  reSum,
  rowAt,
  sumOffsets,
  windowRange,
} from './geometry.js';
import type {
  EpochInputs,
  MinimapTr,
  MinimapView,
} from './types.js';
import {
  DEFAULT_MARKER_COLOR,
  mergeLayers,
  resolveSpans,
  selectionSpans,
} from './layers.js';
import type { TieredRenderer } from './renderer.js';
import { selectTier, medianRowPx, type Tier } from './tiers.js';
import {
  preciseScrollTop,
  readGeometry,
  type ScrollGeometry,
} from './scroll.js';
import { updateOverlay, setOverlayAria, attachOverlay } from './overlay.js';
import { defaultTheme } from './types.js';
import type {
  BlockHoverInfo,
  BlocksPayload,
  BlockRow,
  HeightStrategy,
  LayerSpan,
  LayerSpans,
  MinimapClassifier,
  MinimapOptions,
  MinimapTheme,
} from './types.js';


/**
 * Model state: the row list plus its derived arrays (§4.2, §6.1), the
 * sliced-build driver (§7.3), and the renderer push discipline (§8.1).
 */
export class MinimapController {
  // --- Inputs ------------------------------------------------------------
  private readonly view: MinimapView;
  private readonly opts: Required<
    Pick<MinimapOptions, 'overscanRows' | 'sampleBudget' | 'sliceBudgetMs'
      | 'tier1Rows' | 'tier2Rows' | 'aggregateMin' | 'aggregateMax'
      | 'maxScrollDrift' | 'zoomPxPerEditorPx'>
  >;
  private hideRows: number | null;
  private forcedMarksOnly: boolean;
  private display: NonNullable<MinimapOptions['display']>;
  private theme: MinimapTheme;
  private classifier: MinimapClassifier;
  private layerDecls: ReturnType<typeof mergeLayers>;
  private onBlockHover: ((info: BlockHoverInfo) => void) | undefined;
  /** Option keys the plugin's own options set (component options defer). */
  private readonly pluginOwned: Set<string>;
  private readonly scrollContainerResolver: MinimapOptions['scrollContainer'];

  // --- Model -------------------------------------------------------------
  private rows: BlockRow[] = [];
  private offsets: Float64Array = new Float64Array(1);
  private total = 0;
  private texts: (string | null)[] = [];
  private modelDoc: Node | null = null;
  /** Hidden rung (§6.5): the minimap renders nothing, model released. */
  private hidden = false;
  /** Sliced build in progress (§7.3): budgeted per frame. */
  private build: BuildSlice | null = null;
  /** Doc-changing transaction deferred while a sliced build owns the walk. */
  private pendingDiffTr: MinimapTr | null = null;

  // --- Geometry / display ------------------------------------------------
  private container: HTMLElement | null = null;
  private geom: ScrollGeometry
    = { scrollTop: 0, scrollHeight: 0, clientHeight: 0 };
  private containerWidth = 0;
  private containerHeight = 0;
  private scale = 0.25;
  private mode: 'fit' | 'sliding' = 'sliding';
  private tier: Tier = 1;
  private marksOnly = false;
  private epochContentWidth = 0;

  // --- Renderer / overlay ------------------------------------------------
  private renderer: TieredRenderer | null = null;
  private overlayEl: HTMLElement | null = null;
  private detachOverlay: (() => void) | null = null;
  private detachScroll: (() => void) | null = null;
  private ro: ResizeObserver | null = null;
  private detachVisibility: (() => void) | null = null;
  private detachDpr: (() => void) | null = null;
  private destroyed = false;

  // --- Scheduling (§7.3, §10.1) -------------------------------------------
  private raf: number | null = null;
  private pending = new Set<PendingWork>();
  /** Latest container size awaiting the frame batch (§8.5 coalescing). */
  private pendingSize: { width: number; height: number; dpr: number }
    | null = null;
  private missedDeadlines = 0;
  private sampleCursor = 0;
  private calibration = new CalibrationStore();
  /** Last row-level height strategy per class (§4.4). */
  private classStrategies = new Map<string, HeightStrategy>();
  /** Cached median row px — recomputed only on tier change (§6.5). */
  private medianRowPxCache = -1;
  private tierNeedsPush = true;
  /** Debounced precise snap after arrow-repeat (§9.3). */
  private snapTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Consumer layers in anchor space (§7.2 step 5): retained so every
   * transaction can re-map and re-resolve them.
   */
  private layerAnchors = new Map<string, LayerSpans>();

  constructor(view: MinimapView, opts: MinimapOptions = {}) {
    this.view = view;
    this.opts = {
      overscanRows: opts.overscanRows ?? 8,
      sampleBudget: opts.sampleBudget ?? 4,
      sliceBudgetMs: opts.sliceBudgetMs ?? 5,
      tier1Rows: opts.tier1Rows ?? 5_000,
      tier2Rows: opts.tier2Rows ?? 50_000,
      aggregateMin: opts.aggregateMin ?? 4,
      aggregateMax: opts.aggregateMax ?? 16,
      maxScrollDrift: opts.maxScrollDrift ?? 0.05,
      zoomPxPerEditorPx: opts.zoomPxPerEditorPx ?? 0.25,
    };
    this.pluginOwned = new Set(Object.keys(opts));
    this.hideRows = opts.hideRows ?? null;
    this.forcedMarksOnly = opts.marksOnly ?? false;
    this.display = opts.display ?? 'auto';
    this.theme = { ...defaultTheme, ...opts.theme };
    this.classifier = opts.classifier ?? defaultClassifier;
    this.layerDecls = mergeLayers(opts.layers);
    this.onBlockHover = opts.onBlockHover;
    this.scrollContainerResolver = opts.scrollContainer;
    if (this.forcedMarksOnly) {
      this.marksOnly = true;
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Resolve the scroll container and subscribe (§7.1, §10.1). */
  start(): void {
    this.container = this.resolveScrollContainer();
    this.geom = readGeometry(this.container);
    this.subscribeScroll();
    this.subscribeRefreshPoints();
    this.epochContentWidth = this.container.clientWidth;
    this.startBuild(this.view.state.doc);
  }

  /**
   * Reconfigure from component-side options (§11): the plugin's own options
   * win — a key the plugin already set is not overridden.
   */
  reconfigure(options: MinimapOptions): void {
    const apply = (key: string, fn: () => void): void => {
      if (!this.pluginOwned.has(key)) {
        fn();
      }
    };
    if (options.theme !== undefined) {
      apply('theme', () => {
        this.theme = { ...defaultTheme, ...options.theme };
        this.renderer?.setConfig(this.theme, this.layerDecls);
        this.reevaluateEpoch();
      });
    }
    if (options.display !== undefined) {
      apply('display', () => {
        this.display = options.display as NonNullable<
          MinimapOptions['display']
        >;
        this.schedule(PendingWork.Window);
      });
    }
    if (options.layers !== undefined) {
      apply('layers', () => {
        this.layerDecls = mergeLayers(options.layers);
        this.renderer?.setConfig(this.theme, this.layerDecls);
        this.schedule(PendingWork.Window);
      });
    }
    if (options.classifier !== undefined) {
      apply('classifier', () => {
        this.classifier = options.classifier as MinimapClassifier;
        this.startBuild(this.view.state.doc);
      });
    }
    if (options.onBlockHover !== undefined) {
      apply('onBlockHover', () => {
        this.onBlockHover = options.onBlockHover;
      });
    }
    if (options.hideRows !== undefined) {
      apply('hideRows', () => {
        this.hideRows = options.hideRows as number;
        this.updateHidden(this.view.state);
      });
    }
    if (options.marksOnly !== undefined) {
      apply('marksOnly', () => {
        this.forcedMarksOnly = options.marksOnly as boolean;
        if (this.forcedMarksOnly) {
          this.engageMarksOnly();
        } else {
          this.releaseMarksOnly();
        }
      });
    }
    // Tuning numbers (§7.1): each writes its `opts` slot; the window/tier
    // recompute follows. `zoomPxPerEditorPx` also changes the sliding-mode
    // scale — the thumb's height and travel move with it (§9.1) — and the
    // tier thresholds re-select on the next `updateTier`.
    const num = (
      key: 'zoomPxPerEditorPx' | 'overscanRows' | 'sampleBudget'
      | 'sliceBudgetMs' | 'maxScrollDrift',
    ): void => {
      if (options[key] !== undefined) {
        apply(key, () => {
          (this.opts[key] as number) = options[key] as number;
          this.schedule(PendingWork.Window);
        });
      }
    };
    num('zoomPxPerEditorPx');
    num('overscanRows');
    num('sampleBudget');
    num('sliceBudgetMs');
    num('maxScrollDrift');
    const tier = (
      key: 'tier1Rows' | 'tier2Rows' | 'aggregateMin' | 'aggregateMax',
    ): void => {
      if (options[key] !== undefined) {
        apply(key, () => {
          (this.opts[key] as number) = options[key] as number;
          this.updateTier();
          this.schedule(PendingWork.Window);
        });
      }
    };
    tier('tier1Rows');
    tier('tier2Rows');
    tier('aggregateMin');
    tier('aggregateMax');
    // `scrollContainer` is deliberately NOT reconfigurable: it is resolved
    // once at `start()` (§7.1) — the scroll subscription, cached geometry,
    // and overlay wiring all bind to the resolved element.
  }

  /** Container resize (§8.5): one coalesced `resize`, floored device px. */
  onContainerResize(width: number, height: number): void {
    // RO callbacks never resize synchronously (§8.5): record the latest
    // size and let the frame batch apply exactly one resize.
    const dpr = typeof window !== 'undefined'
      ? window.devicePixelRatio || 1
      : 1;
    this.pendingSize = { width, height, dpr };
    this.schedule(PendingWork.Resize);
  }

  /** Editor-content resize: epoch check + geometry refresh (§4.6, §7.4). */
  onEditorResize(width: number): void {
    if (Math.abs(width - this.epochContentWidth) > 0.5) {
      this.epochContentWidth = width;
      this.reevaluateEpoch();
    }
    this.refreshGeometry();
  }

  /**
   * A geometry-epoch change (§4.6): every row's `estHeightPx` invalidated
   * (measured `heightPx` kept, per-row strategies reproduced), estimation
   * re-run, offsets re-summed. The epoch sequence advances so measured
   * rows become eligible for lazy re-sampling (§4.5) while keeping their
   * measurements until a fresh sample replaces them.
   */
  reevaluateEpoch(inputs?: EpochInputs): void {
    this.epochSeq += 1;
    if (inputs?.theme !== undefined) {
      Object.assign(this.theme, inputs.theme);
    }
    for (const row of this.rows) {
      row.estHeightPx = estimateHeight(
        row.node, row.classId, row.strategy ?? undefined,
        this.classStrategies, this.theme, this.calibration,
      );
    }
    this.calibration.resetSamples();
    const summed = sumOffsets(this.rows);
    this.offsets = summed;
    this.total = summed[this.rows.length] ?? 0;
    this.renderer?.setGeometry(this.offsets, this.texts);
    this.updateTier();
    this.schedule(PendingWork.Window);
  }

  /** Full geometry refresh (§7.4 refresh points call this). */
  refreshGeometry(): void {
    if (this.container !== null) {
      this.geom = readGeometry(this.container);
      this.checkScrollDrift();
    }
    this.schedule(PendingWork.Window);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.snapTimer !== null) {
      clearTimeout(this.snapTimer);
    }
    this.detachScroll?.();
    this.detachOverlay?.();
    this.detachVisibility?.();
    this.detachDpr?.();
    this.ro?.disconnect();
    this.renderer?.destroy();
    this.renderer = null;
    this.overlayEl = null;
    this.releaseModel();
  }

  private releaseModel(): void {
    this.rows = [];
    this.offsets = new Float64Array(1);
    this.texts = [];
    this.modelDoc = null;
    this.total = 0;
    this.build = null;
    this.pendingDiffTr = null;
  }

  /**
   * Resolve the scroll container (§7.1): consumer-supplied, else the
   * nearest scrolling ancestor-or-self of `view.dom`, else `view.dom`.
   */
  private resolveScrollContainer(): HTMLElement {
    if (this.scrollContainerResolver !== undefined) {
      return this.scrollContainerResolver(this.view);
    }
    let el: HTMLElement | null = this.view.dom;
    while (el !== null) {
      const oy = getComputedStyle(el).overflowY;
      if (oy !== 'visible' && oy !== undefined) {
        return el;
      }
      el = el.parentElement;
    }
    return this.view.dom;
  }

  private subscribeScroll(): void {
    const c = this.container;
    if (c === null) {
      return;
    }
    const onScroll = () => {
      // Per event: only scrollTop (§10.1); geometry refreshes at §7.4 points.
      this.geom = { ...this.geom, scrollTop: c.scrollTop };
      this.schedule(PendingWork.Window);
    };
    c.addEventListener('scroll', onScroll, { passive: true });
    this.detachScroll = () => {
      c.removeEventListener('scroll', onScroll);
    };
  }

  // -----------------------------------------------------------------------
  // §7.4 refresh points: scroll-container + content RO, fonts.ready,
  // visibilitychange; DPR watch (§8.5).
  // -----------------------------------------------------------------------

  private subscribeRefreshPoints(): void {
    const c = this.container;
    if (c === null) {
      return;
    }
    if (typeof ResizeObserver !== 'undefined') {
      // Scroll-container + content resize → epoch check + geometry refresh
      // (§7.4; the RO also fires when the resolved element changes size).
      const ro = new ResizeObserver(() => {
        this.onEditorResize(c.clientWidth);
      });
      ro.observe(c);
      ro.observe(this.view.dom);
      this.ro = ro;
    }

    if (typeof document !== 'undefined') {
      // A theme font whose metrics differ is an epoch change (§4.6).
      const fonts = (document as Document & { fonts?: FontFaceSetLike })
        .fonts;
      if (fonts?.ready !== undefined) {
        void fonts.ready.then(() => this.reevaluateEpoch());
      }
      const onVisibility = () => {
        if (document.visibilityState === 'visible') {
          this.refreshGeometry();
        }
      };
      document.addEventListener('visibilitychange', onVisibility);
      this.detachVisibility = () => {
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }

    // DPR changes (§8.5): belt-and-suspenders — a re-armed resolution
    // matchMedia listener plus a devicePixelRatio comparison on window
    // resize (WebKit does not re-evaluate `resolution` on page zoom).
    if (typeof window !== 'undefined' && window.matchMedia !== undefined) {
      let mq = window.matchMedia(
        `(resolution: ${window.devicePixelRatio}dppx)`,
      );
      const onChange = () => {
        // Through the same coalesced path as container resize (§8.5):
        // never resize synchronously from a media listener.
        this.pendingSize = {
          width: this.containerWidth,
          height: this.containerHeight,
          dpr: window.devicePixelRatio || 1,
        };
        this.schedule(PendingWork.Resize);
        const prev = mq;
        mq = window.matchMedia(
          `(resolution: ${window.devicePixelRatio}dppx)`,
        );
        prev.removeEventListener('change', onChange);
        mq.addEventListener('change', onChange);
      };
      mq.addEventListener('change', onChange);
      this.detachDpr = () => {
        mq.removeEventListener('change', onChange);
      };
    }
  }

  // -----------------------------------------------------------------------
  // Renderer / overlay attachment (the React component calls these)
  // -----------------------------------------------------------------------

  attachRenderer(
    renderer: TieredRenderer,
    overlay: HTMLElement,
    size: { width: number; height: number; dpr: number },
  ): void {
    this.renderer = renderer;
    this.overlayEl = overlay;
    renderer.init(size);
    renderer.setConfig(this.theme, this.layerDecls);
    this.containerWidth = size.width;
    this.containerHeight = size.height;
    this.updateTier();
    this.pushFullModel();
    this.pushWindow();
    this.wireOverlay();
    this.schedule(PendingWork.Selection);
  }

  /** Renderer detach (unmount): drop the reference, keep the model. */
  detachRenderer(): void {
    this.detachOverlay?.();
    this.detachOverlay = null;
    this.renderer = null;
    this.overlayEl = null;
  }

  private wireOverlay(): void {
    if (this.overlayEl === null) {
      return;
    }
    const lineHeight = this.theme.lineHeight;
    this.detachOverlay = attachOverlay(
      this.overlayEl,
      {
        // Scrollbar-fraction drag (§9.2): the thumb's TOP position over
        // its TRAVEL maps linearly to the scroll — `scrollTop =
        // (thumbTop / travel) × maxScroll`, `travel = visible surface
        // span − thumb` (§9.1). Origin-free by construction: no
        // sliding-origin basis to freeze, no scroll-induced feedback, and
        // the release re-applies the last move's own value (continuity,
        // no snap). The inverse of the thumb's own placement.
        onDragMove: (thumbTopY) => this.applyScrollTop(
          (thumbTopY / this.thumbTravel()) * this.maxScroll(),
        ),
        onCommit: (thumbTopY) => this.applyScrollTop(
          (thumbTopY / this.thumbTravel()) * this.maxScroll(),
        ),
        onKeyboardScroll: (dy, page, home, end) => {
          if (home) {
            this.applyScrollTop(0);
          } else if (end) {
            // The REAL document end: `maxScroll` of the trusted container,
            // not `this.total` (model space).
            this.applyScrollTop(
              Math.max(0, this.geom.scrollHeight - this.geom.clientHeight),
            );
          } else if (page) {
            this.applyScrollTop(this.geom.scrollTop + dy * this.geom.clientHeight);
          } else {
            this.applyScrollTop(this.geom.scrollTop + dy);
            this.scheduleArrowSnap();
          }
        },
        onHover: (minimapY, clientY) => this.emitHover(minimapY, clientY),
        onHoverEnd: () => {
          this.lastHoverRow = -1;
        },
      },
      (y) => this.minimapYToEditorOffset(y),
      lineHeight,
      this.container,
    );
  }

  /** The scroll container's real maximum scrollTop. */
  private maxScroll(): number {
    return Math.max(
      0, this.geom.scrollHeight - this.geom.clientHeight,
    );
  }

  /** Arrow-repeat settles with one precise snap on the first quiet frame. */
  private scheduleArrowSnap(): void {
    if (this.snapTimer !== null) {
      clearTimeout(this.snapTimer);
    }
    this.snapTimer = setTimeout(() => {
      this.snapTimer = null;
      // The live scrollTop is real space; the snap path expects a
      // model-space input, so convert through the trusted ratio first
      // (scrollTop/maxScroll × total — the inverse of §6.4's drag map).
      const maxScroll
        = Math.max(0, this.geom.scrollHeight - this.geom.clientHeight);
      const frac = maxScroll > 0
        ? this.geom.scrollTop / maxScroll
        : 0;
      this.scrollToEditorOffset(frac * this.total, true);
    }, 250);
  }

  private lastHoverRow = -1;

  private emitHover(minimapY: number, clientY: number): void {
    const rowIdx = this.rowAtMinimapY(minimapY);
    if (rowIdx === this.lastHoverRow) {
      return; // one event per row, not per pixel
    }
    this.lastHoverRow = rowIdx;
    const row = this.rows[rowIdx];
    if (row === undefined) {
      return;
    }
    const info: BlockHoverInfo = {
      row: rowIdx,
      key: row.key,
      pos: row.pos,
      classId: row.classId,
      depth: row.depth,
      clientY,
    };
    this.onBlockHover?.(info);
    // The magnify hook's DOM event (§10.2): composed, bubbling. Guarded —
    // a headless environment without DOM constructors skips the event.
    if (typeof CustomEvent === 'function' && this.overlayEl !== null) {
      this.overlayEl.dispatchEvent(
        new CustomEvent('minimapblockhover', {
          bubbles: true,
          composed: true,
          detail: info,
        }),
      );
    }
  }

  /**
   * The sliding window's origin on the virtual surface (§6.2), in minimap
   * px: where the pane's top sits on the surface of height
   * `scale × total`. The pane shows `containerHeight` px of the surface:
   *
   * - Surface ≤ pane (a zoomed-out document): the whole surface is
   *   visible at the pane's top — origin 0; the pane's remainder below
   *   the surface stays empty.
   * - Surface > pane: the window slides PROPORTIONALLY with the scroll
   *   fraction — `origin = frac × (surface − pane)`. Proportional (not
   *   content-centered) keeps the thumb monotonic across the whole
   *   scroll range: with a content-centered window the thumb pins at the
   *   pane's middle for the entire central region of the document (a
   *   drag dead zone), while the proportional window composes with the
   *   thumb's placement into the pure scrollbar fraction (§9.1).
   */
  private windowOrigin(): number {
    if (this.mode !== 'sliding') {
      return 0;
    }
    const surface = this.scale * this.total;
    if (surface <= this.containerHeight) {
      return 0;
    }
    const frac = this.maxScroll() > 0
      ? clamp(this.geom.scrollTop / this.maxScroll(), 0, 1)
      : 0;
    return frac * (surface - this.containerHeight);
  }

  /**
   * The thumb's height in minimap px (§9.1): the editor viewport's share
   * of the SURFACE — `clientHeight × scale`, floored at 2px and capped at
   * the pane. Content-aligned by construction: the thumb covers exactly
   * the surface px the editor's viewport shows. (In fit mode, where
   * `scale = pane / extent`, this equals the scrollbar proportion
   * `clientHeight / extent × pane` — the two derivations coincide; in
   * sliding mode the pane shows a window of the surface, and the pane's
   * own extent must NOT enter the thumb's size.)
   */
  private thumbHeight(): number {
    return clamp(
      this.geom.clientHeight * this.scale, 2, this.containerHeight,
    );
  }

  /**
   * The thumb's travel in minimap px (§9.1/§9.2): the span its TOP moves
   * across — the visible surface span minus the thumb. When the surface
   * exceeds the pane that is `pane − thumb`; when the surface fits inside
   * the pane it is `surface − thumb` (the thumb never enters the empty
   * region below the surface). In both cases the thumb's position is
   * `frac × travel` and the drag is the exact inverse
   * `scrollTop = thumbTop / travel × maxScroll`.
   */
  private thumbTravel(): number {
    const surface = this.scale * this.total;
    const span = Math.min(surface, this.containerHeight);
    return Math.max(1, span - this.thumbHeight());
  }

  /**
   * Editor offset under a minimap-surface y (window-origin aware, §6.2) —
   * the HOVER path's row resolution. Drag/commit mapping is
   * scrollbar-fraction (§9.2) and does not use this.
   */
  minimapYToEditorOffset(y: number): number {
    return (this.windowOrigin() + y) / this.scale;
  }

  /** Row index under a minimap-surface y, or -1. */
  rowAtMinimapY(y: number): number {
    return rowAt(this.offsets, this.minimapYToEditorOffset(y));
  }

  // -----------------------------------------------------------------------
  // Transactions (§7.2)
  // -----------------------------------------------------------------------

  update(state: EditorState, tr: MinimapTr | null): void {
    if (this.destroyed) {
      return;
    }
    if (tr !== null && tr.docChanged) {
      // A doc-changing transaction is itself a §7.4 refresh point: the
      // content's extent changed, so the cached scroll geometry is stale.
      // Coalesced into the frame batch (`PendingWork.Geometry`) — one
      // readGeometry per frame, never a synchronous layout read here.
      this.schedule(PendingWork.Geometry);
    }
    if (this.hidden) {
      // Lean while hidden (§6.5): track the doc's row count without a
      // model, so crossing back under the threshold restores the minimap.
      if (tr !== null && tr.docChanged) {
        this.modelDoc = tr.doc;
        this.hiddenRowCount = countRows(
          tr.doc, this.classifier,
        );
      }
      this.updateHidden(this.view.state);
      return;
    }
    if (tr !== null && tr.docChanged && tr.doc !== this.modelDoc) {
      if (this.build !== null) {
        // A sliced build owns the walk: defer the diff — the build finishes
        // its target doc, then this diff carries every `===` subtree over
        // (§4.3), so no built work is lost.
        this.pendingDiffTr = tr;
        return;
      }
      this.applyTransaction(tr);
    } else if (state.doc !== this.modelDoc) {
      // State replaced without a usable transaction (editor state swap).
      this.startBuild(state.doc);
    }
    // Selection-only updates refresh the selection layer (§8.4).
    this.schedule(PendingWork.Selection);
    this.schedule(PendingWork.Window);
  }

  private applyTransaction(tr: MinimapTr): void {
    const oldRows = this.rows;
    const oldDoc = this.modelDoc ?? tr.doc;
    const bounds = diffBounds();
    const rows: BlockRow[] = [];
    for (const row of diffRows(
      oldRows, oldDoc, tr.doc,
      this.walkContext(), (p) => tr.mapping.map(p), bounds,
    )) {
      rows.push(row);
    }
    this.rows = rows;
    this.modelDoc = tr.doc;
    this.applyBounds(bounds, tr);
  }

  private applyPendingDiff(): void {
    const tr = this.pendingDiffTr;
    if (tr === null || this.build !== null) {
      return;
    }
    this.pendingDiffTr = null;
    if (tr.doc !== this.modelDoc) {
      this.applyTransaction(tr);
    }
  }

  private applyBounds(bounds: DiffBounds, tr?: MinimapTr): void {
    if (bounds.firstChanged >= 0) {
      // Invalidate the text cache from the first changed row: grown rows
      // are fresh (`text: null`), carried rows past the change keep their
      // cached text. Truncating the ARRAY (the old behaviour) also
      // destroyed the carried texts, and the renderer then refused to
      // store the re-pushed window texts (§6.3/§8.1).
      const prevLen = this.texts.length;
      this.texts.length = this.rows.length;
      for (
        let i = bounds.firstChanged;
        i < Math.min(prevLen, this.rows.length);
        i++) {
        this.texts[i] = null;
      }
      const summed = reSum(this.offsets, this.rows, bounds.firstChanged);
      this.offsets = summed.offsets;
      this.total = summed.total;
      this.pushSparseBlocks(bounds);
    }
    // Layer producers map through the same diff (§7.2 step 5): anchors
    // re-map through `tr.mapping` and re-resolve against the new rows.
    this.repushLayers(tr);
    this.updateTier();
    this.updateHidden(this.view.state);
    this.schedule(PendingWork.Window);
    this.schedule(PendingWork.Selection);
  }

  private walkContext(): WalkContext {
    return {
      classifier: this.classifier,
      theme: this.theme,
      strategies: this.classStrategies,
      calibrated: this.calibration,
    };
  }

  // -----------------------------------------------------------------------
  // Sliced model (re)build (§7.3)
  // -----------------------------------------------------------------------

  private startBuild(doc: Node): void {
    if (this.hidden) {
      this.modelDoc = doc;
      return;
    }
    this.build = {
      gen: flatten(doc, this.walkContext()),
      emitted: 0,
    };
    this.pendingDiffTr = null;
    this.modelDoc = doc;
    this.rows = [];
    this.texts = [];
    // Reset derived geometry too: the sliced build's visible-region-first
    // loop seeds its accumulator from `this.total` — a stale value would
    // make the first slice stop almost immediately (the window is already
    // "covered" by the previous model's total).
    this.offsets = new Float64Array(1);
    this.total = 0;
    this.schedule(PendingWork.Build);
  }

  private runBuildSlice(): void {
    const b = this.build;
    if (b === null) {
      return;
    }
    const t0 = performance.now();
    const sliceStart = b.emitted;
    // First slice runs to the visible window's end (visible-region-first,
    // §7.3/§15.2); later slices are row-budgeted.
    const firstSlice = b.emitted === 0;
    const windowBottom
      = this.geom.scrollTop + this.geom.clientHeight;
    const rows = this.rows.slice(0, b.emitted); // carry the built prefix
    let n = 0;
    for (; n < BUILD_ROWS_PER_TICK || firstSlice; n++) {
      const next = b.gen.next();
      if (next.done) {
        this.finishBuild(rows);
        return;
      }
      const row = next.value;
      rows.push(row);
      if (firstSlice && this.rowAccumHeight(rows) >= windowBottom) {
        break;
      }
    }
    this.rows = rows;
    b.emitted = rows.length;
    // Progressive publish (§7.3): paint whatever rows the renderer holds;
    // the not-yet-built region stays background. The push covers THIS
    // slice's rows [sliceStart, rows.length) — `b.emitted` has already
    // advanced past them.
    const summed = sumOffsets(this.rows);
    this.offsets = summed;
    this.total = summed[this.rows.length] ?? 0;
    this.texts.length = this.rows.length;
    this.renderer?.setGeometry(this.offsets, this.texts);
    this.pushSparseBlocks({
      firstChanged: sliceStart,
      lastChanged: rows.length,
      structural: false,
    });
    this.updateTier();
    // Paint in the same frame as the publish: the visible window is
    // available after the first slice, so first paint does not wait for
    // the full build (§15.2 first-paint budget).
    if (this.renderer !== null && !this.hidden) {
      this.pushWindow();
      this.renderer.render();
    }
    this.noteSliceTiming(performance.now() - t0);
  }

  /** Effective-height total of `rows` (the first-slice coverage check). */
  private rowAccumHeight(rows: readonly BlockRow[]): number {
    let acc = 0;
    for (const row of rows) {
      acc += row.heightPx ?? row.estHeightPx;
    }
    return acc;
  }

  private finishBuild(rows: BlockRow[]): void {
    this.rows = rows;
    this.build = null;
    const summed = sumOffsets(this.rows);
    this.offsets = summed;
    this.total = summed[this.rows.length] ?? 0;
    this.texts = new Array<string | null>(this.rows.length).fill(null);
    this.renderer?.setGeometry(this.offsets, this.texts);
    // A tier change re-publishes the full payload (§6.5); so does build
    // completion — the renderer's mirror may hold a mix of stale (from an
    // interrupted prior model) and partial chunks otherwise.
    this.pushFullModel();
    this.updateTier();
    this.renderer?.render();
    // Layers re-resolve against the fresh rows (no mapping — a rebuild,
    // §7.2 step 5's without-tr path).
    this.repushLayers();
    this.updateHidden(this.view.state);
    this.schedule(PendingWork.Window);
    this.schedule(PendingWork.Selection);
  }

  /**
   * §7.3 deadline misses escalate: two consecutive over-budget slices
   * engage marks-only; a full under-budget slice releases it (§6.5).
   */
  private noteSliceTiming(spent: number): void {
    if (spent > this.opts.sliceBudgetMs) {
      this.missedDeadlines++;
      if (this.missedDeadlines >= 2) {
        this.engageMarksOnly();
      }
    } else {
      this.missedDeadlines = 0;
      if (this.marksOnly && !this.forcedMarksOnly) {
        this.releaseMarksOnly();
      }
    }
    this.schedule(PendingWork.Build);
  }

  /** The `hidden` rung (§6.5): over `hideRows` → release the model. */
  private updateHidden(state: EditorState): void {
    void state;
    if (this.hideRows === null) {
      return;
    }
    const count = this.hidden
      ? this.hiddenRowCount
      : this.rows.length;
    const over = count > this.hideRows;
    if (over && !this.hidden) {
      this.hidden = true;
      this.hiddenRowCount = this.rows.length;
      this.renderer?.setHidden(true);
      this.releaseModel();
    } else if (!over && this.hidden) {
      this.hidden = false;
      this.hiddenRowCount = 0;
      this.renderer?.setHidden(false);
      this.startBuild(this.modelDoc ?? this.view.state.doc);
    }
  }

  /** Row count while the model is released (the `hidden` rung, §6.5). */
  private hiddenRowCount = 0;

  private updateTier(): void {
    const next = selectTier(
      this.rows.length,
      this.tier,
      { tier1Rows: this.opts.tier1Rows, tier2Rows: this.opts.tier2Rows },
    );
    if (next !== this.tier || this.tierNeedsPush) {
      this.tier = next;
      this.tierNeedsPush = false;
      this.medianRowPxCache = medianRowPx(this.rows);
      this.renderer?.setTier(next, {
        aggregateMin: this.opts.aggregateMin,
        aggregateMax: this.opts.aggregateMax,
        medianPx: this.medianRowPxCache,
        marksOnly: this.marksOnly,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Renderer pushes (§8.1)
  // -----------------------------------------------------------------------

  /** Full structural push — build completion, tier change, epoch (§8.1). */
  private pushFullModel(): void {
    const r = this.renderer;
    if (r === null) {
      return;
    }
    r.clearModel();
    for (const chunk of this.modelChunks(0, this.rows.length)) {
      r.setBlocks(chunk);
    }
    r.setGeometry(this.offsets, this.texts);
  }

  /** Sparse push over the changed range (§7.2 step 4), chunk-granular. */
  private pushSparseBlocks(bounds: DiffBounds): void {
    const r = this.renderer;
    if (r === null) {
      return;
    }
    const last = bounds.structural
      ? this.rows.length
      : bounds.lastChanged;
    for (const chunk of this.modelChunks(bounds.firstChanged, last)) {
      r.setBlocks(chunk);
    }
    r.setGeometry(this.offsets, this.texts);
  }

  /** Split `[firstRow, lastRow)` into `chunkRows` chunks (§8.1). */
  private *modelChunks(
    firstRow: number,
    lastRow: number,
  ): Generator<BlocksPayload, void, void> {
    const from = Math.max(0, Math.min(firstRow, this.rows.length));
    const to = Math.max(from, Math.min(lastRow, this.rows.length));
    for (let s = from; s < to; s += CHUNK_ROWS) {
      yield this.blocksPayload(s, Math.min(CHUNK_ROWS, to - s));
    }
  }

  private blocksPayload(firstRow: number, rowCount: number): BlocksPayload {
    const classIds: string[] = [];
    const depths = new Int16Array(rowCount);
    const textLengths = new Float64Array(rowCount);
    const textBlocks = new Uint8Array(rowCount);
    const heightPx = new Float64Array(rowCount);
    const end = firstRow + rowCount;
    for (let i = firstRow; i < end; i++) {
      const row = this.rows[i];
      if (row === undefined) {
        continue;
      }
      classIds.push(row.classId);
      depths[i - firstRow] = row.depth;
      textLengths[i - firstRow] = row.textLength;
      textBlocks[i - firstRow] = row.textBlock ? 1 : 0;
      heightPx[i - firstRow] = row.heightPx ?? row.estHeightPx;
    }
    return {
      firstRow, classIds, depths, textLengths, textBlocks, heightPx,
    };
  }

  // -----------------------------------------------------------------------
  // Window / scale / drift (§6.2, §6.3)
  // -----------------------------------------------------------------------

  /** Compute scale/mode, push to renderer + overlay (§6.2, §9.1). */
  private pushWindow(): void {
    const r = this.renderer;
    if (r === null || this.hidden) {
      return;
    }
    const resolved = resolveScale(
      this.display, this.opts.zoomPxPerEditorPx,
      this.total, this.containerHeight,
      this.minRowEditorPx(), this.theme.rowHeight,
      // The REAL scrollable extent (§6.2): the fit surface spans the
      // container's actual scroll range, not just the model's predicted
      // height — the thumb then maps exactly onto [0, maxScroll] however
      // much the model under-predicts (paddings own no rows). When the
      // container does not scroll (`scrollHeight ≤ clientHeight`) the
      // extent stays below the model's total and fit is unaffected.
      this.geom.scrollHeight,
    );
    this.scale = resolved.scale;
    this.mode = resolved.mode;
    r.setScale(this.scale);
    // The sliding window origin (§6.2): the paint path translates by it.
    // The thumb no longer consumes it (its placement is the scrollbar
    // fraction over the visible span, §9.1) — but the two agree by
    // construction: `frac × travel === scrollTop × scale − origin`.
    const originY = this.windowOrigin();
    r.setWindowOrigin(originY);

    // The paint window in EDITOR px: the pane shows `containerHeight /
    // scale` editor px of the surface, not `clientHeight` — at zoom 0.25
    // that is 4× the viewport. Feeding `scrollTop + clientHeight` (the
    // pre-fix range) painted only a quarter's worth of rows.
    const win = this.mode === 'fit'
      ? { first: 0, last: this.rows.length - 1 }
      : windowRange(
        this.offsets,
        originY / this.scale,
        originY / this.scale + this.containerHeight / this.scale,
        this.opts.overscanRows,
      );
    if (win.last < 0) {
      return;
    }
    // Texts for window rows + overscan only (§6.3, §8.1).
    const texts: (string | null)[] = [];
    for (let i = win.first; i <= win.last; i++) {
      const row = this.rows[i];
      if (row === undefined) {
        texts.push(null);
        continue;
      }
      if (row.text === null) {
        row.text = row.node.textContent;
      }
      texts.push(row.text);
    }
    r.setWindow(win.first, win.last - win.first + 1, {
      firstRow: win.first,
      texts,
    });
    if (this.overlayEl !== null) {
      // Content-aligned thumb (§9.1): `h = clientHeight × scale` (the
      // viewport's share of the SURFACE — identical to the scrollbar
      // proportion in fit mode) placed at `y = frac × travel`, where
      // `travel` is the visible-surface span minus the thumb. With the
      // proportional window origin (§6.2) this equals
      // `scrollTop × scale − origin` exactly — the thumb covers precisely
      // the surface px the editor's viewport shows, in both modes.
      const maxScroll = this.maxScroll();
      const frac = maxScroll > 0
        ? clamp(this.geom.scrollTop / maxScroll, 0, 1)
        : 0;
      const y = frac * this.thumbTravel();
      updateOverlay(this.overlayEl, y, this.thumbHeight());
      setOverlayAria(
        this.overlayEl,
        this.geom.scrollTop,
        this.geom.scrollHeight,
        this.geom.clientHeight,
      );
    }
  }

  /** Smallest effective row height in editor px (fit-floor input, §6.2). */
  private minRowEditorPx(): number {
    let min = Infinity;
    for (const row of this.rows) {
      const h = row.heightPx ?? row.estHeightPx;
      if (h < min) {
        min = h;
      }
    }
    return Number.isFinite(min) ? min : 1;
  }

  /**
   * §6.3 calibration check: sustained drift beyond `maxScrollDrift` scales
   * unsampled estimates toward the observed scroll geometry and re-sums.
   */
  private checkScrollDrift(): void {
    if (this.container === null || this.total <= 0) {
      return;
    }
    // Never while a sliced build is open (§7.3): `total` then covers only
    // the built prefix, so the ratio against the full document's
    // scrollHeight is meaningless — scaling the prefix by it permanently
    // inflates the model (the partial-model ratchet).
    if (this.build !== null) {
      return;
    }
    const real = this.container.scrollHeight;
    if (real <= 0) {
      return;
    }
    const drift = Math.abs(this.total - real) / real;
    if (drift <= this.opts.maxScrollDrift) {
      return;
    }
    const ratio = real / this.total;
    for (const row of this.rows) {
      if (row.heightPx === null) {
        row.estHeightPx *= ratio;
      }
    }
    const summed = sumOffsets(this.rows);
    this.offsets = summed;
    this.total = summed[this.rows.length] ?? 0;
    this.pushFullModel();
    this.schedule(PendingWork.Window);
  }

  // -----------------------------------------------------------------------
  // Scheduling (§7.3, §10.1)
  // -----------------------------------------------------------------------

  private schedule(work: PendingWork): void {
    this.pending.add(work);
    if (this.raf !== null) {
      return;
    }
    if (typeof requestAnimationFrame === 'function') {
      this.raf = requestAnimationFrame(() => {
        this.raf = null;
        this.runFrame();
      });
    }
    // Headless (no rAF): the frame is driven by `flush()` — tests call it
    // between assertions.
  }

  /** Run one frame's scheduled work synchronously (headless driver). */
  flush(): void {
    this.runFrame();
  }

  /** One rAF batch: resize → build → pending diff → window → selection. */
  private runFrame(): void {
    if (this.destroyed) {
      return;
    }
    const work = this.pending;
    this.pending = new Set();
    if (work.has(PendingWork.Resize) && this.pendingSize !== null) {
      const size = this.pendingSize;
      this.pendingSize = null;
      this.containerWidth = size.width;
      this.containerHeight = size.height;
      this.renderer?.resize(size);
      this.pending.add(PendingWork.Window);
    }
    if (work.has(PendingWork.Geometry) && this.container !== null) {
      // §7.4 refresh point (doc-changing transaction, §7.2): re-read the
      // cached scroll geometry BEFORE the window push so the drag clamp,
      // overlay extent, and drift check all see the post-edit extent.
      // Runs its drift correction too (skipped while a build is open,
      // which `checkScrollDrift` itself guards).
      this.geom = readGeometry(this.container);
      this.pending.add(PendingWork.Window);
    }
    if (work.has(PendingWork.Build) || this.build !== null) {
      this.runBuildSlice();
      this.applyPendingDiff();
    }
    if (this.renderer !== null && !this.hidden) {
      if (this.pending.has(PendingWork.Window)
        || work.has(PendingWork.Window)) {
        this.pushWindow();
        this.renderer.render();
      }
      if (work.has(PendingWork.Selection)) {
        this.pushSelectionLayer();
      }
    }
      // Sampling happens only inside the already-scheduled repaint frame,
      // after the render request has been issued (§4.5).
      const sampled = this.sampleHeights();
      // Convergence driver (§4.5): a frame that sampled rows leaves the
      // model partially corrected — keep frames coming until sampling
      // makes no progress (all rows measured this epoch, or their DOM is
      // unavailable). Without this, sampling stalls the moment no other
      // work schedules frames and the model never converges on layout.
      if (sampled > 0) {
        this.schedule(PendingWork.Window);
      }
    }

  /** `marks-only` rung (§6.5): content paint off, layers continue. */
  private engageMarksOnly(): void {
    if (this.marksOnly) {
      return;
    }
    this.marksOnly = true;
    this.tierNeedsPush = true;
    this.updateTier();
  }

  /** Release the marks-only rung after an under-budget slice (§7.3). */
  private releaseMarksOnly(): void {
    if (!this.marksOnly) {
      return;
    }
    this.marksOnly = false;
    this.missedDeadlines = 0;
    this.tierNeedsPush = true;
    this.updateTier();
  }

  /** Geometry-epoch sequence: bumped per epoch change (§4.6). */
  private epochSeq = 0;

  /**
   * DOM calibration sampling (§4.5): at most `sampleBudget` per frame.
   * Returns the number of rows sampled (the convergence driver).
   */
  private sampleHeights(): number {
    if (this.container === null || this.rows.length === 0) {
      return 0;
    }
    const budget = this.opts.sampleBudget;
    let taken = 0;
    let minSampled = -1;
    // Round-robin from the sample cursor; measured-once per row.key
    // WITHIN an epoch — an epoch change re-arms every measured row for
    // lazy re-sampling (§4.6).
    for (let n = 0; n < this.rows.length && taken < budget; n++) {
      const i = (this.sampleCursor + n) % this.rows.length;
      const row = this.rows[i];
      if (
        row === undefined
        || (row.heightPx !== null && row.sampledAtEpoch === this.epochSeq)
      ) {
        continue;
      }
      const px = this.measureRowStride(i);
      if (px > 0) {
        row.heightPx = px;
        row.sampledAtEpoch = this.epochSeq;
        this.calibration.record(row.classId, px);
        taken++;
        if (minSampled < 0 || i < minSampled) {
          minSampled = i;
        }
      }
    }
    this.sampleCursor
      = (this.sampleCursor + 1) % Math.max(1, this.rows.length);
    if (minSampled >= 0) {
      // Measured strides shift offsets: re-sum from the first sampled row
      // and push (§4.5 — correction drives the model toward real layout).
      const summed = reSum(this.offsets, this.rows, minSampled);
      this.offsets = summed.offsets;
      this.total = summed.total;
      this.pushSparseBlocks({
        firstChanged: minSampled,
        lastChanged: this.rows.length,
        structural: false,
      });
      this.schedule(PendingWork.Window);
    }
    return taken;
  }

  /**
   * Measure row `i`'s layout stride in editor-space px: the distance its
   * rendered DOM advances the document — `nextRowDomTop − ownTop`. The
   * stride includes the inter-block margins that the row's own
   * `getBoundingClientRect` height excludes (margin collapse: a 24px-tall
   * paragraph occupies a 40px stride). Rows are the editor's layout units,
   * so strides sum to ≈`scrollHeight` — what the model needs; rect heights
   * alone sum ~35% short on margin-heavy documents and the drift corrector
   * would keep fighting the sampler (§4.5, §6.3).
   *
   * Returns 0 when the DOM is unavailable (row unrendered, or the final
   * row's rect is zero-sized) — the caller keeps the estimate (§4.5's
   * null path).
   */
  private measureRowStride(i: number): number {
    const row = this.rows[i];
    if (row === undefined) {
      return 0;
    }
    const dom = this.view.nodeDOM(row.pos);
    const el = dom as { getBoundingClientRect?: unknown } | null;
    if (el === null || typeof el.getBoundingClientRect !== 'function') {
      return 0;
    }
    const rect = (el as unknown as {
      getBoundingClientRect: () => { top: number; height: number };
    }).getBoundingClientRect();
    if (rect.height <= 0) {
      return 0;
    }
    // The next row's DOM defines the stride. Block rows render in
    // document order, and margin collapse means the distance to the next
    // row's top is the vertical space the current row truly occupies.
    const nextRow = this.rows[i + 1];
    if (nextRow !== undefined) {
      const nextDom = this.view.nodeDOM(nextRow.pos);
      const nextEl = nextDom as { getBoundingClientRect?: unknown } | null;
      if (nextEl !== null && typeof nextEl.getBoundingClientRect === 'function') {
        const nextTop = (nextEl as unknown as {
          getBoundingClientRect: () => { top: number };
        }).getBoundingClientRect().top;
        const stride = nextTop - rect.top;
        if (stride > 0 && Number.isFinite(stride)) {
          return stride;
        }
      }
    }
    // Last row (or the next row's DOM is gone): its own height. The
    // trailing padding below the final block is not a row stride; the
    // fit/scroll mapping absorbs it, not this row.
    return rect.height;
  }

  // -----------------------------------------------------------------------
  // Layers (§8.4)
  // -----------------------------------------------------------------------

  /** The built-in `selection` layer — the reference producer (§8.4). */
  private pushSelectionLayer(): void {
    const r = this.renderer;
    if (r === null) {
      return;
    }
    const sel = this.view.state.selection;
    const spans = resolveSpans(
      selectionSpans(sel.from, sel.to),
      (p) => this.rowAtPos(p),
      (id) => this.rowAtNodeId(id),
      this.theme.selection.color,
    );
    r.setLayer('selection', spans);
    if (!this.pending.has(PendingWork.Window)) {
      r.render();
    }
  }

  /**
   * Publish a consumer layer's spans (anchors resolved here, §8.4). The
   * anchor-space declaration is retained so later transactions re-anchor
   * it through `tr.mapping` (§7.2 step 5) — a stored row index would
   * silently misplace under every edit above it.
   */
  setLayer(layerId: string, spans: LayerSpans): void {
    this.layerAnchors.set(layerId, spans);
    this.pushLayer(layerId, spans);
    this.schedule(PendingWork.Window);
  }

  /** Resolve + push one layer's spans against the current rows. */
  private pushLayer(layerId: string, spans: LayerSpans): void {
    const resolved = resolveSpans(
      spans,
      (p) => this.rowAtPos(p),
      (id) => this.rowAtNodeId(id),
      DEFAULT_MARKER_COLOR,
    );
    this.renderer?.setLayer(layerId, resolved);
  }

  /**
   * Re-anchor every consumer layer (§7.2 step 5): with `tr`, `pos` spans
   * map through `tr.mapping` (`from` forward-associated, `to` backward —
   * a span survives a partial overwrite) and spans whose content was
   * deleted drop out; `id` spans pass through unchanged (they re-resolve
   * per row and drop naturally when the node is gone, §8.4). Without
   * `tr` (a rebuild) every layer re-resolves against the fresh rows.
   */
  private repushLayers(tr?: MinimapTr): void {
    if (this.layerAnchors.size === 0) {
      return;
    }
    for (const [layerId, spans] of this.layerAnchors) {
      if (tr === undefined) {
        this.pushLayer(layerId, spans);
        continue;
      }
      const mappedSpans: LayerSpans = {
        ...spans,
        spans: spans.spans.flatMap(
          (span: LayerSpan): readonly LayerSpan[] => {
            if (span.kind !== 'pos') {
              return [span];
            }
            const from = tr.mapping.map(span.from, 1);
            const to = tr.mapping.map(span.to ?? span.from, -1);
            if (to < from) {
              return []; // the span's content was deleted
            }
            return [{ ...span, from, to }];
          },
        ),
      };
      this.layerAnchors.set(layerId, mappedSpans);
      this.pushLayer(layerId, mappedSpans);
    }
  }

  // -----------------------------------------------------------------------
  // Mapping surface (§7.2)
  // -----------------------------------------------------------------------

  /** Row containing a document position, by binary search (§7.2). */
  rowAtPos(pos: number): number | null {
    let lo = 0;
    let hi = this.rows.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const row = this.rows[mid];
      if (row === undefined) {
        return null;
      }
      const end = row.pos + row.node.nodeSize;
      if (pos < row.pos) {
        hi = mid - 1;
      } else if (pos >= end) {
        lo = mid + 1;
      } else {
        return mid;
      }
    }
    return null; // position falls between rows (§7.2)
  }

  /** `tr.mapping.map` plus a deleted check (§7.2). */
  mapPos(pos: number, tr: MinimapTr): number | null {
    // A deleted position maps differently at the two associations: the
    // forward association skips past the deletion, the backward one does
    // not. Equality is the survival test.
    if (tr.mapping.map(pos, 1) !== tr.mapping.map(pos, -1)) {
      return null;
    }
    const mapped = tr.mapping.map(pos);
    return mapped <= tr.doc.content.size ? mapped : null;
  }

  /** Resolve a node id to a live row via the row's node reference (§7.2). */
  rowAtNodeId(id: string): number | null {
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      if (row !== undefined && (row.node.attrs as { id?: string }).id === id) {
        return i;
      }
    }
    return null;
  }

  /** The row's node reference (§10.2 magnify hook). */
  rowNode(row: number): Node | null {
    return this.rows[row]?.node ?? null;
  }

  /** Rows in document order — introspection/testing (§13). */
  getRows(): readonly BlockRow[] {
    return this.rows;
  }

  // -----------------------------------------------------------------------
  // Scrolling (§6.4, §10.1)
  // -----------------------------------------------------------------------

  /** Apply an editor-space offset — proportional drag, precise commit. */
  private scrollToEditorOffset(editorY: number, precise: boolean): void {
    const c = this.container;
    if (c === null) {
      return;
    }
    // `proportional` stays the unit-preserving lookup (§6.4) — the exact
    // inverse of the overlay's render mapping (`T = scrollTop × scale`,
    // §9.1), so the thumb follows the pointer 1:1 during the drag. The
    // model↔container residual (inter-block padding no row owns) is
    // absorbed at the extremes by the clamp below, and locally by the
    // `precise` commit.
    let target = clamp(editorY, 0, this.total);
    if (precise) {
      const rowIdx = rowAt(this.offsets, target);
      const row = this.rows[rowIdx];
      if (row !== undefined) {
        target = preciseScrollTop(
          this.view, c, row,
          this.offsets[rowIdx] ?? 0,
          target,
          this.measureContentOrigin(),
        );
      }
    }
    const maxScroll
      = Math.max(0, this.geom.scrollHeight - this.geom.clientHeight);
    c.scrollTop = clamp(target, 0, maxScroll);
    this.geom = { ...this.geom, scrollTop: c.scrollTop };
    this.schedule(PendingWork.Window);
  }

  /**
   * The measured top of row 0 in content space (§6.4): the offset between
   * the container's content origin and the model's origin (row 0's top).
   * A padded scroll container (`.ProseMirror`'s `padding-top`) places row
   * 0 `k` px below scrollTop 0; the model's row 0 is at 0. `precise`
   * subtracts this constant so its two sides share one origin — without
   * it every snap drifts down by exactly the padding. Returns 0 when row
   * 0 has no measurable DOM (the model's zero origin is then assumed).
   */
  private measureContentOrigin(): number {
    const first = this.rows[0];
    if (first === undefined) {
      return 0;
    }
    const c = this.container;
    if (c === null) {
      return 0;
    }
    const dom = this.view.nodeDOM(first.pos);
    const el = dom as { getBoundingClientRect?: unknown } | null;
    if (el === null || typeof el.getBoundingClientRect !== 'function') {
      return 0;
    }
    const rect = (el as unknown as {
      getBoundingClientRect: () => { top: number };
    }).getBoundingClientRect();
    const clientTop = c.getBoundingClientRect().top;
    const origin = c.scrollTop + (rect.top - clientTop);
    return Number.isFinite(origin) && origin >= 0 ? origin : 0;
  }

  /**
   * Apply a REAL-space scrollTop (keyboard relative scrolls — arrows and
   * paging compose deltas against the live `scrollTop`; mapping them
   * through the model would distort the step size). Clamped to the
   * container's range; schedules the window update.
   */
  private applyScrollTop(top: number): void {
    const c = this.container;
    if (c === null) {
      return;
    }
    const maxScroll
      = Math.max(0, this.geom.scrollHeight - this.geom.clientHeight);
    c.scrollTop = clamp(top, 0, maxScroll);
    this.geom = { ...this.geom, scrollTop: c.scrollTop };
    this.schedule(PendingWork.Window);
  }
}

/** Scheduled work kinds (§7.3, §8.5, §10.1): one batch collapses them. */
const enum PendingWork {
  Window,
  Selection,
  Build,
  Resize,
  /**
   * Coalesced scroll-geometry refresh (§7.4): doc-changing transactions
   * grow or shrink `scrollHeight` without any of the classic refresh
   * points firing (the container's box size is unchanged while its
   * content grows inside a fixed-height scroller; no resize, no font
   * load, no visibility change). Without the refresh, the drag clamp
   * `maxScroll = scrollHeight − clientHeight` keeps the PRE-EDIT extent
   * — dragging cannot reach content typed or pasted after mount. The
   * refresh runs in the frame batch (one `readGeometry` per frame,
   * never synchronously in the transaction path, §10.1).
   */
  Geometry,
}

/** Structural push chunk size (§8.1). */
const CHUNK_ROWS = 2_000;

/** Rows flattened per build tick, before the budget check (§7.3). */
const BUILD_ROWS_PER_TICK = 2_000;

/** A sliced build in progress (§7.3). */
interface BuildSlice {
  gen: Generator<BlockRow, void, void>;
  emitted: number;
}

/** `document.fonts` (typed structurally; the DOM lib may lag). */
interface FontFaceSetLike {
  ready: Promise<unknown>;
}
