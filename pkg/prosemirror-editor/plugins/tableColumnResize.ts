/**
 * `tableColumnResizePlugin` — column resizing + colgroup rendering for the
 * Metanorma table model (tables.md §8.6 — column sizing).
 *
 * Architecture (no table node view, no prosemirror-tables):
 *
 * - **Two widget decorations per table.** Widget #1 (`mn-col-resize-colgroup`)
 *   renders `<colgroup><col style="width:X%">…` — one `<col>` per grid
 *   column, always every column (fixed-layout completeness) — positioned
 *   after the `table_name` caption (HTML content-model order
 *   `caption, colgroup`). It exists only while `colwidths ≠ null`; without
 *   it `table-layout` stays auto (the two-mode model). Widget #2
 *   (`mn-col-resize-handles`) renders one absolutely-positioned hit area per
 *   interior column edge, present for EVERY table — first-drag
 *   materialization needs a grabbable edge in autowidth mode too. Both
 *   widgets live inside the `<table>` element (CSS
 *   `table { position: relative }` anchors them), so they scroll and
 *   re-layout with content; there is no editor-root overlay and no
 *   scroll/updateState geometry synchronization.
 * - **Geometry from the laid-out DOM, never from attr percentages** —
 *   min-width clamps and content make real widths diverge from stored ones.
 *   A spanning cell HIDES interior grid edges: per-grid-column widths and
 *   edge positions are measured on rows that DECLARE the edge (body rows
 *   when a header cell spans); a spanning cell's own width is only ever the
 *   sum of its covered slots. Handle positions are (re)derived in a
 *   post-layout pass (after each transaction, after initial mount via
 *   double-rAF, and on `ResizeObserver` firings — window resize, font zoom,
 *   panel collapse).
 * - **Drag semantics**: neighbor-trades-1:1 — dragging the edge between
 *   grid columns k-1 and k moves that boundary; both columns clamp to
 *   `MIN_COLUMN_WIDTH_PX` (as a share of the measured table width); at
 *   either clamp the drag stalls. There is no outer-edge table resize
 *   (page-width model — the table is not resizable).
 * - **One transaction per gesture.** pointermove only mutates the preview
 *   colgroup's `<col>` styles (DOM-only, coalesced to one write per frame
 *   via requestAnimationFrame); pointerup recomputes final widths from
 *   pointer geometry against the gesture-start measurement and dispatches
 *   exactly one `setColumnWidths` transaction (undo = one step). First-drag
 *   on an autowidth table measures the current columns → seeds → commits,
 *   all in that single transaction (mode flip and resize are one undo
 *   step). Esc during a drag cancels with no transaction.
 * - **Drag hygiene**: `preventDefault()` on handle pointerdown (suppresses
 *   caret/selection); `setPointerCapture` on the handle element with
 *   window-level pointerup/pointercancel fallback listeners; a 3px drag
 *   threshold (click-past is not a drag); `stopEvent` on the widgets so
 *   ProseMirror's selection machinery never sees handle events.
 * - **Clipboard fidelity**: the plugin's `clipboardSerializer` prop
 *   overrides the clipboard path only — its `table` entry emits a
 *   `data-colwidths` attribute (JSON array of percentage strings) when
 *   widths are fixed, so intra-editor copy/paste round-trips exactly.
 *   Paste needs no counterpart: the schema's `parseDOM.getAttrs` reads
 *   `data-colwidths` back with priority over colgroup parsing. Known,
 *   accepted limitation: a PARTIAL copy (selection opening inside the
 *   table) drops widths — per-cell storage is the only remedy and is
 *   rejected by the table-level storage model. Intra-editor drag-and-drop
 *   preserves attrs natively (the in-memory slice bypasses HTML).
 *
 * The plugin is inert when the view is not editable.
 */

import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import { DOMSerializer } from "prosemirror-model";
import type { Node as PMNode } from "prosemirror-model";

import { metanormaSchema, tableGridColumnCount } from "@metanorma/prosemirror-schema";
import { setColumnWidths, MIN_COLUMN_WIDTH_PX } from "@metanorma/editor-commands";

/** Plugin key — exported for tests and consumer state queries. */
export const tableColumnResizeKey = new PluginKey("tableColumnResize");

/** Drag threshold in px: pointer travel below this does not start a resize. */
const DRAG_THRESHOLD_PX = 3;

/** CSS classes (mirrored in document.css). */
const COLGROUP_CLASS = "mn-col-resize-colgroup";
const HANDLES_CLASS = "mn-col-resize-handles";
const HANDLE_CLASS = "mn-col-resize-handle";

/** Refresh meta — dispatched by the ResizeObserver to rebuild decorations. */
const REFRESH_META = "mn-col-resize-refresh";

// ---------------------------------------------------------------------------
// Grid geometry — from the laid-out DOM (spanning-aware)
// ---------------------------------------------------------------------------

/** Measured per-grid-column widths (px) + the table's box origin/width. */
interface TableGeometry {
  /** Per-grid-column widths in px (from the declaring rows). */
  readonly widths: number[];
  /** Viewport x of each grid edge (index 0 = left edge … n = right). */
  readonly edgeXs: number[];
  readonly tableLeftPx: number;
  readonly tableWidthPx: number;
}

/**
 * Measure per-grid-column widths from the rows that DECLARE every edge.
 *
 * Grid width is the max Σ colspan over all rows of all row groups. Widths
 * come from the first row group whose every row fully declares the grid
 * without spanning cells (typically `table_body`); when none qualifies (a
 * spanning header + a body narrower than the grid), the first group's rows
 * are projected: a spanning cell's width divides equally over its covered
 * slots — never used as an edge position, only as a width estimate for
 * first-drag seeding.
 */
function measureTable(tableEl: HTMLElement): TableGeometry | null {
  const groups = Array.from(tableEl.children).filter(
    (c): c is HTMLElement =>
      c instanceof HTMLElement
      && (c.tagName === "THEAD" || c.tagName === "TBODY" || c.tagName === "TFOOT"),
  );

  const rowSum = (row: Element): { sum: number; spans: boolean } => {
    let sum = 0;
    let spans = false;
    for (const cell of Array.from(row.children)) {
      const cs = Number((cell as HTMLElement).getAttribute?.("colspan") ?? "1");
      const v = Number.isFinite(cs) && cs > 0 ? cs : 1;
      if (v > 1) spans = true;
      sum += v;
    }
    return { sum, spans };
  };

  let grid = 0;
  for (const g of groups) {
    for (const row of Array.from(g.children)) {
      grid = Math.max(grid, rowSum(row).sum);
    }
  }
  if (grid <= 0) return null;

  // Preferred measuring group: fully declaring, no spans.
  let measuring: HTMLElement | null = null;
  for (const g of groups) {
    const complete = Array.from(g.children).every(
      (row) => row.tagName === "TR" && (() => {
        const { sum, spans } = rowSum(row);
        return sum === grid && !spans;
      })(),
    );
    if (complete && g.children.length > 0) {
      measuring = g;
      break;
    }
  }
  if (measuring === null) measuring = groups[0] ?? null;
  if (measuring === null) return null;

  const widths = new Array<number>(grid).fill(0);
  let measuredRows = 0;
  for (const row of Array.from(measuring.children)) {
    if (row.tagName !== "TR") continue;
    let slot = 0;
    let fits = true;
    for (const cell of Array.from(row.children)) {
      const rect = (cell as HTMLElement).getBoundingClientRect();
      const cs = Number((cell as HTMLElement).getAttribute("colspan") ?? "1");
      const span = Number.isFinite(cs) && cs > 0 ? cs : 1;
      const per = rect.width / span;
      for (let k = 0; k < span && slot + k < grid; k++) {
        widths[slot + k] = Math.max(widths[slot + k] ?? 0, per);
      }
      slot += span;
      if (slot > grid) fits = false;
    }
    if (fits && slot === grid) measuredRows++;
  }
  if (measuredRows === 0) return null;

  const tableRect = tableEl.getBoundingClientRect();
  const edgeXs: number[] = [tableRect.left];
  for (let i = 0; i < grid; i++) {
    edgeXs.push((edgeXs[i] ?? tableRect.left) + (widths[i] ?? 0));
  }
  return {
    widths,
    edgeXs,
    tableLeftPx: tableRect.left,
    tableWidthPx: widths.reduce((a, b) => a + b, 0),
  };
}

// ---------------------------------------------------------------------------
// Width math
// ---------------------------------------------------------------------------

/** Sum `arr[i]` for i in [from, to). */
function sumRange(arr: readonly number[], from: number, to: number): number {
  let s = 0;
  for (let i = from; i < to; i++) s += arr[i] ?? 0;
  return s;
}

/**
 * Final px widths for dragging edge `k` (the boundary between grid columns
 * k-1 and k) to pointer x. Neighbor-trades-1:1 with a min-width stall on
 * both sides; the table's total width never changes.
 */
function computeWidths(
  geo: TableGeometry,
  edgeGridIndex: number,
  pointerX: number,
): number[] {
  const widths = [...geo.widths];
  const k = edgeGridIndex; // 1-based: boundary after column k-1
  const leftIdx = k - 1;
  const rightIdx = k;
  if (leftIdx < 0 || rightIdx >= widths.length) return widths;

  const before = sumRange(widths, 0, leftIdx); // px left of the traded pair
  const after = sumRange(widths, rightIdx + 1, widths.length); // px right of it
  const pairTotal = (widths[leftIdx] ?? 0) + (widths[rightIdx] ?? 0);

  let boundaryInPair = pointerX - geo.tableLeftPx - before; // px from pair start
  boundaryInPair = Math.max(MIN_COLUMN_WIDTH_PX, boundaryInPair);
  boundaryInPair = Math.min(pairTotal - MIN_COLUMN_WIDTH_PX, boundaryInPair);

  widths[leftIdx] = boundaryInPair;
  widths[rightIdx] = pairTotal - boundaryInPair;
  void after;
  return widths;
}

/** Convert px widths to percentage numbers normalized to 100. */
function pxToPct(widths: readonly number[]): number[] {
  const total = widths.reduce((a, b) => a + b, 0);
  if (total <= 0) return widths.map(() => 100 / Math.max(1, widths.length));
  return widths.map((w) => (w / total) * 100);
}

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

/** Build the colgroup widget DOM (`<colgroup><col style>…`). */
function buildColgroup(widths: readonly string[] | null, grid: number): HTMLElement {
  const el = document.createElement("colgroup");
  el.className = COLGROUP_CLASS;
  const n = Math.max(grid, widths?.length ?? 0);
  const fallback = 100 / Math.max(1, n);
  for (let i = 0; i < n; i++) {
    const col = document.createElement("col");
    col.style.width = widths?.[i] ?? `${fallback}%`;
    el.appendChild(col);
  }
  return el;
}

/** Build the handles widget DOM — one hit area per INTERIOR grid edge. */
function buildHandles(grid: number): HTMLElement {
  const el = document.createElement("div");
  el.className = HANDLES_CLASS;
  // Interior edges only (edges 1..grid-1); the outer edges are not
  // draggable — the table is page-width and not resizable.
  for (let k = 1; k < grid; k++) {
    const h = document.createElement("div");
    h.className = HANDLE_CLASS;
    h.dataset["gridIndex"] = String(k);
    el.appendChild(h);
  }
  return el;
}

/**
 * Position every handles widget from the laid-out DOM. Runs post-layout
 * (after transactions, initial mount, and geometry changes).
 */
function positionHandles(root: HTMLElement): void {
  const tables = Array.from(root.querySelectorAll("table")) as HTMLElement[];
  for (const tableEl of tables) {
    const geo = measureTable(tableEl);
    // NOTE: descendant query, not `:scope >` — the renderer wraps widget
    // decorations in a `<span>` (made layout-transparent by CSS
    // `display: contents`), so the handles root is never a direct child of
    // the table element.
    const handlesEl = tableEl.querySelector(`.${HANDLES_CLASS}`);
    if (geo === null || handlesEl === null) continue;
    let h: Element | null = handlesEl.firstElementChild;
    for (let k = 1; k < geo.edgeXs.length - 1 && h !== null; k++) {
      if (h instanceof HTMLElement) {
        const rel = (geo.edgeXs[k] ?? 0) - geo.tableLeftPx;
        h.style.left = `calc(${rel}px - 3px)`;
      }
      h = h.nextElementSibling;
    }
  }
}

// ---------------------------------------------------------------------------
// Clipboard serializer (copy side only)
// ---------------------------------------------------------------------------

/**
 * The schema serializer with a `table` entry that additionally emits
 * `data-colwidths` (JSON percentage strings) when widths are fixed. Overrides
 * the clipboard path only (`view.someProp("clipboardSerializer")`); the
 * schema `toDOM` is untouched.
 */
function buildClipboardSerializer(): DOMSerializer {
  const base = DOMSerializer.fromSchema(metanormaSchema);
  return new DOMSerializer(
    {
      ...base.nodes,
      table: (node: PMNode) => {
        const widths = node.attrs["colwidths"] as readonly string[] | null;
        const spec: Record<string, string> = {};
        if (widths != null) {
          spec["data-colwidths"] = JSON.stringify(widths);
        }
        return ["table", spec, 0];
      },
    },
    base.marks,
  );
}

// ---------------------------------------------------------------------------
// Decorations
// ---------------------------------------------------------------------------

/** All table nodes with their doc positions. */
function tablesIn(doc: PMNode): { pos: number; node: PMNode }[] {
  const out: { pos: number; node: PMNode }[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "table") {
      out.push({ pos, node });
      return false;
    }
    return true;
  });
  return out;
}

/** Position just after the (optional) caption — the colgroup slot. */
function colgroupSlotPos(table: PMNode, tablePos: number): number {
  const first = table.firstChild;
  if (first !== null && first.type.name === "table_name") {
    return tablePos + 1 + first.nodeSize;
  }
  return tablePos + 1;
}

/** Build the decoration set for `doc` (colgroup + handles per table). */
function buildDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  for (const { pos, node } of tablesIn(doc)) {
    const widths = node.attrs["colwidths"] as readonly string[] | null;
    const grid = tableGridColumnCount(node);
    if (widths != null && grid > 0) {
      decos.push(
        Decoration.widget(
          colgroupSlotPos(node, pos),
          () => buildColgroup(widths, grid),
          {
            side: -1,
            key: `mn-colgroup-${pos}`,
            stopEvent: () => true,
            ignoreSelection: true,
          },
        ),
      );
    }
    if (grid > 1) {
      decos.push(
        Decoration.widget(pos + 1, () => buildHandles(grid), {
          side: 10,
          key: `mn-handles-${pos}`,
          stopEvent: (event: Event) => {
            const t = event.target;
            return t instanceof HTMLElement && t.closest(`.${HANDLES_CLASS}`) != null;
          },
        }),
      );
    }
  }
  return DecorationSet.create(doc, decos);
}

// ---------------------------------------------------------------------------
// Drag gesture
// ---------------------------------------------------------------------------

/** In-flight resize gesture (one at a time, module-scoped). */
interface DragState {
  /** Edge index k: the boundary between grid columns k-1 and k. */
  readonly edgeGridIndex: number;
  /** Geometry measured at gesture start (the commit's baseline). */
  readonly geometry: TableGeometry;
  /** Table doc position (for the commit transaction). */
  readonly tablePos: number;
  /** Whether the 3px threshold has been crossed. */
  engaged: boolean;
  /** Latest pointer x (client px) — consumed by the rAF preview. */
  latestX: number;
  /** rAF handle for the preview coalescing. */
  raf: number | null;
  /** The colgroup widget element for preview mutation (null on autowidth). */
  readonly colgroupEl: HTMLElement | null;
  /** keydown listener (Esc → cancel). */
  readonly onKeyDown: (e: KeyboardEvent) => void;
  /** window pointerup/pointercancel fallback listener. */
  readonly onWindowUp: () => void;
}

/** Active drag state. */
let drag: DragState | null = null;

/** Detach all gesture listeners and clear rAF. Shared by cancel/finish. */
function teardownDrag(d: DragState): void {
  if (d.raf !== null) cancelAnimationFrame(d.raf);
  window.removeEventListener("keydown", d.onKeyDown, true);
  window.removeEventListener("pointerup", d.onWindowUp, true);
  window.removeEventListener("pointercancel", d.onWindowUp, true);
}

/** Cancel the in-flight drag (Esc): no transaction, no state change. */
function cancelDrag(): void {
  const d = drag;
  if (d === null) return;
  drag = null;
  teardownDrag(d);
  // Restoring preview styles is unnecessary: the widget is rebuilt from the
  // unchanged attr on the next decoration pass; a forced refresh follows.
}

/** Preview the drag: mutate only the preview colgroup's `<col>` styles. */
function previewDrag(d: DragState): void {
  if (d.colgroupEl === null) return;
  const widthsPx = computeWidths(d.geometry, d.edgeGridIndex, d.latestX);
  const pcts = pxToPct(widthsPx);
  d.colgroupEl.querySelectorAll("col").forEach((col, i) => {
    const p = pcts[i];
    if (p !== undefined) col.style.width = `${p.toFixed(2)}%`;
  });
}

/** Commit the drag: exactly one transaction via the pure command. */
function finishDrag(view: EditorView): void {
  const d = drag;
  if (d === null) return;
  drag = null;
  teardownDrag(d);
  if (!d.engaged) return; // click-past: threshold never crossed → no commit

  const widthsPx = computeWidths(d.geometry, d.edgeGridIndex, d.latestX);
  const pcts = pxToPct(widthsPx);
  setColumnWidths(
    view.state,
    (tr: Transaction) => view.dispatch(tr),
    d.tablePos,
    pcts,
  );
  view.focus();
}

/** Begin a gesture from a pointerdown on a handle (delegated listener). */
function beginDrag(
  view: EditorView,
  handle: HTMLElement,
  ev: PointerEvent,
  tablePos: number,
): void {
  const tableEl = handle.closest("table");
  if (tableEl === null || !(tableEl instanceof HTMLElement)) return;
  const geometry = measureTable(tableEl);
  if (geometry === null) return;

  const gridIndex = Number(handle.dataset["gridIndex"] ?? "0");
  if (!Number.isFinite(gridIndex) || gridIndex < 1) return;

  // Descendant query — the colgroup widget lives inside the renderer's
  // layout-transparent wrapper span, never a direct table child.
  const colgroupEl = tableEl.querySelector(`.${COLGROUP_CLASS}`);
  const d: DragState = {
    edgeGridIndex: gridIndex,
    geometry,
    tablePos,
    engaged: false,
    latestX: ev.clientX,
    raf: null,
    colgroupEl: colgroupEl instanceof HTMLElement ? colgroupEl : null,
    onKeyDown: (e: KeyboardEvent): void => {
      if (e.key === "Escape") cancelDrag();
    },
    onWindowUp: (): void => finishDrag(view),
  };
  drag = d;

  // Hygiene 2: pointer capture on the handle; window-level fallback covers
  // capture loss (the fallback is ALSO the primary path when capture is
  // unsupported — harmless double-fire is idempotent: finishDrag no-ops
  // once `drag` is null).
  try {
    handle.setPointerCapture(ev.pointerId);
    const onMove = (e: PointerEvent): void => {
      if (drag !== d) return;
      d.latestX = e.clientX;
      if (!d.engaged && Math.abs(e.clientX - ev.clientX) < DRAG_THRESHOLD_PX) {
        return; // threshold not crossed — click-past
      }
      d.engaged = true;
      if (d.raf === null) {
        d.raf = requestAnimationFrame(() => {
          d.raf = null;
          if (drag === d) previewDrag(d);
        });
      }
    };
    const onUp = (): void => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      finishDrag(view);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  } catch {
    // No pointer capture — the window-level fallback listeners alone drive
    // the gesture (pointermove preview is skipped; commit still runs).
  }
  window.addEventListener("keydown", d.onKeyDown, true);
  window.addEventListener("pointerup", d.onWindowUp, true);
  window.addEventListener("pointercancel", d.onWindowUp, true);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * The table column-resize plugin. See the module doc for the architecture.
 */
export function tableColumnResizePlugin(): Plugin {
  const clipboardSerializer = buildClipboardSerializer();

  return new Plugin({
    key: tableColumnResizeKey,
    props: {
      clipboardSerializer,
      // The render path for the plugin's decoration state: both stock
      // prosemirror-view and react-prosemirror's renderer gather decorations
      // ONLY through this prop — a DecorationSet held in plugin state alone
      // never draws (the prosemirror-tables pattern: prop reads key state).
      // (Return-typed loosely to satisfy both stock prosemirror-view and
      // react-prosemirror's renderer prop shapes.)
      decorations: ((state: EditorState): unknown =>
        tableColumnResizeKey.getState(state) ?? DecorationSet.empty) as never,
    },
    state: {
      // Build from the initial doc — the app may boot (or load a document)
      // with fixed-width tables already present; starting empty would leave
      // their colgroups unrendered until the first transaction.
      init: (_config, state): DecorationSet => buildDecorations(state.doc),
      apply: (tr: Transaction, _old: DecorationSet): DecorationSet => {
        if (!tr.docChanged && tr.getMeta(tableColumnResizeKey) !== REFRESH_META) {
          return _old;
        }
        return buildDecorations(tr.doc);
      },
    },
    view: (viewUntyped: unknown) => {
      const view = viewUntyped as EditorView;
      // One delegated pointerdown listener for every handle in the editor.
      const onPointerDown = (ev: Event): void => {
        if (!(ev instanceof PointerEvent)) return;
        const target = ev.target instanceof HTMLElement ? ev.target : null;
        if (target === null || !target.classList.contains(HANDLE_CLASS)) return;
        if (!view.editable) return;
        // Hygiene 1: suppress caret/selection on the editor's mouse pipeline.
        ev.preventDefault();
        ev.stopPropagation();

        // Map the handle's table element back to a doc position.
        const tableEl = target.closest("table");
        if (tableEl === null) return;
        let tablePos: number;
        try {
          tablePos = view.posAtDOM(tableEl as Node, 0) - 1;
        } catch {
          return;
        }
        beginDrag(view, target, ev, tablePos);
      };
      view.dom.addEventListener("pointerdown", onPointerDown);

      // Post-layout positioning: after every transaction, after initial
      // mount (double-rAF waits for first layout), and after geometry
      // changes (ResizeObserver → refresh meta transaction → update()).
      const observers = new Map<HTMLElement, ResizeObserver>();
      const ensureObservers = (): void => {
        if (typeof ResizeObserver === "undefined") return;
        const tables = Array.from(view.dom.querySelectorAll("table")) as HTMLElement[];
        const live = new Set(tables);
        for (const [el] of observers) {
          if (!live.has(el)) observers.delete(el);
        }
        for (const el of tables) {
          if (observers.has(el)) continue;
          const ro = new ResizeObserver(() => {
            if (view.state && !drag) {
              view.dispatch(
                view.state.tr.setMeta(tableColumnResizeKey, REFRESH_META),
              );
            }
          });
          ro.observe(el);
          observers.set(el, ro);
        }
      };

      const raf1 = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          positionHandles(view.dom);
          ensureObservers();
        });
      });

      return {
        update: (): void => {
          // Position immediately (PM updates fire synchronously after the
          // transaction) AND once more after the next frame — the React
          // renderer commits widget DOM asynchronously relative to PM update
          // hooks, so a rebuilt widget (e.g. the mode flip re-running the
          // factory) lands in the DOM only after this frame.
          positionHandles(view.dom);
          requestAnimationFrame(() => {
            positionHandles(view.dom);
            ensureObservers();
          });
        },
        destroy: (): void => {
          cancelAnimationFrame(raf1);
          view.dom.removeEventListener("pointerdown", onPointerDown);
          for (const [, ro] of observers) ro.disconnect();
          observers.clear();
          cancelDrag();
        },
      };
    },
  });
}

// Re-export for consumers/tests that build standalone decoration sets.
export { buildDecorations as tableColumnResizeDecorations };
